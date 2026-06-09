 import { FONT_SET } from './data.js';

  export class Chip8 {
    constructor() {
      this.mem = new Uint8Array(4096);
      this.v = new Uint8Array(16);
      this.display = new Uint8Array(64 * 32);
      this.keys = new Uint8Array(16);
      this.stack = [];
      this.bps = new Set();
      this.watchpoints = new Set();
      this.prevV = new Uint8Array(16);
      this.waitingForKey = null;
      this.quirks = { shiftUsesVy: false, incrementI: true };
      this.history = [];
      this.reset();
    }

    reset() {
      this.mem.fill(0);
      this.v.fill(0);
      this.display.fill(0);
      this.keys.fill(0);
      this.stack = [];
      this.i = 0;
      this.pc = 0x200;
      this.delayTimer = 0;
      this.soundTimer = 0;
      this.cycles = 0;
      this.lastOp = 0;
      this.waitingForKey = null;
      this.history = [];
      this.prevV.fill(0);
      this.mem.set(FONT_SET, 0x50);
    }

    load(bytes, start = 0x200) {
      this.mem.fill(0, start, start + bytes.length);
      this.mem.set(bytes, start);
      this.pc = start;
    }

    fetch() {
      return (this.mem[this.pc] << 8) | this.mem[this.pc + 1];
    }

    cycle() {
      if (this.waitingForKey !== null) return "waiting";
      if (this.bps.has(this.pc)) return "BREAKPOINT_HIT";

      const op = this.fetch();
      const desc = this.describe(op);
      const pcBefore = this.pc;

      this.lastOp = op;
      this.pc = (this.pc + 2) & 0xFFF;
      this.cycles += 1;
      this.exec(op);

      if (this.checkWatches()) return "WATCHPOINT_HIT";

      this.history.push({
        cycle: this.cycles,
        pc: pcBefore,
        op: op,
        desc: desc
      });

      if (this.history.length > 50) this.history.shift();

      return desc;
    }

    checkWatches() {
      for (let i = 0; i < 16; i++) {
        if (this.watchpoints.has(i) && this.v[i] !== this.prevV[i]) {
          this.prevV.set(this.v);
          return true;
        }
      }
      this.prevV.set(this.v);
      return false;
    }

    stepOver() {
      const op = this.fetch();
      if ((op & 0xF000) !== 0x2000) return this.cycle();

      let limit = 0;
      while (this.lastOp !== 0x00EE && limit < 4096) {
        if (this.cycle() === "BREAKPOINT_HIT") return "BP HIT during Step-Over";
        limit++;
      }
      return "Subroutine completed";
    }

    exec(op) {
      const x = (op & 0x0F00) >> 8;
      const y = (op & 0x00F0) >> 4;
      const n = op & 0x000F;
      const nn = op & 0x00FF;
      const nnn = op & 0x0FFF;

      if (op === 0x00E0) this.display.fill(0);
      else if (op === 0x00EE) this.pc = this.stack.pop() ?? 0x200;
      else if ((op & 0xF000) === 0x1000) this.pc = nnn;
      else if ((op & 0xF000) === 0x2000) { this.stack.push(this.pc); this.pc = nnn; }
      else if ((op & 0xF000) === 0x3000) { if (this.v[x] === nn) this.pc += 2; }
      else if ((op & 0xF000) === 0x4000) { if (this.v[x] !== nn) this.pc += 2; }
      else if ((op & 0xF00F) === 0x5000) { if (this.v[x] === this.v[y]) this.pc += 2; }
      else if ((op & 0xF000) === 0x6000) this.v[x] = nn;
      else if ((op & 0xF000) === 0x7000) this.v[x] = (this.v[x] + nn) & 0xFF;
      else if ((op & 0xF000) === 0x8000) this.alu(x, y, n);
      else if ((op & 0xF00F) === 0x9000) { if (this.v[x] !== this.v[y]) this.pc += 2; }
      else if ((op & 0xF000) === 0xA000) this.i = nnn;
      else if ((op & 0xF000) === 0xB000) this.pc = (nnn + this.v[0]) & 0xFFF;
      else if ((op & 0xF000) === 0xC000) this.v[x] = Math.floor(Math.random() * 256) & nn;
      else if ((op & 0xF000) === 0xD000) this.draw(x, y, n);
      else if ((op & 0xF0FF) === 0xE09E) { if (this.keys[this.v[x] & 0xF]) this.pc += 2; }
      else if ((op & 0xF0FF) === 0xE0A1) { if (!this.keys[this.v[x] & 0xF]) this.pc += 2; }
      else if ((op & 0xF0FF) === 0xF007) this.v[x] = this.delayTimer;
      else if ((op & 0xF0FF) === 0xF00A) this.waitingForKey = x;
      else if ((op & 0xF0FF) === 0xF015) this.delayTimer = this.v[x];
      else if ((op & 0xF0FF) === 0xF018) this.soundTimer = this.v[x];
      else if ((op & 0xF0FF) === 0xF01E) this.i = (this.i + this.v[x]) & 0xFFF;
      else if ((op & 0xF0FF) === 0xF029) this.i = 0x50 + (this.v[x] & 0xF) * 5;
      else if ((op & 0xF0FF) === 0xF033) {
        const val = this.v[x];
        this.mem[this.i] = Math.floor(val / 100);
        this.mem[this.i + 1] = Math.floor((val % 100) / 10);
        this.mem[this.i + 2] = val % 10;
      } else if ((op & 0xF0FF) === 0xF055) {
        for (let idx = 0; idx <= x; idx++) this.mem[this.i + idx] = this.v[idx];
        if (this.quirks.incrementI) this.i = (this.i + x + 1) & 0xFFF;
      } else if ((op & 0xF0FF) === 0xF065) {
        for (let idx = 0; idx <= x; idx++) this.v[idx] = this.mem[this.i + idx];
        if (this.quirks.incrementI) this.i = (this.i + x + 1) & 0xFFF;
      } else {
        throw new Error(`Op Error: 0x${op.toString(16).toUpperCase()}`);
      }
    }

    alu(x, y, mode) {
      if (mode === 0x0) this.v[x] = this.v[y];
      else if (mode === 0x1) this.v[x] |= this.v[y];
      else if (mode === 0x2) this.v[x] &= this.v[y];
      else if (mode === 0x3) this.v[x] ^= this.v[y];
      else if (mode === 0x4) {
        const sum = this.v[x] + this.v[y];
        this.v[0xF] = sum > 0xFF ? 1 : 0;
        this.v[x] = sum & 0xFF;
      } else if (mode === 0x5) {
        this.v[0xF] = this.v[x] >= this.v[y] ? 1 : 0;
        this.v[x] = (this.v[x] - this.v[y]) & 0xFF;
      } else if (mode === 0x6) {
        if (this.quirks.shiftUsesVy) this.v[x] = this.v[y];
        this.v[0xF] = this.v[x] & 1;
        this.v[x] >>= 1;
      } else if (mode === 0x7) {
        this.v[0xF] = this.v[y] >= this.v[x] ? 1 : 0;
        this.v[x] = (this.v[y] - this.v[x]) & 0xFF;
      } else if (mode === 0xE) {
        if (this.quirks.shiftUsesVy) this.v[x] = this.v[y];
        this.v[0xF] = (this.v[x] & 0x80) ? 1 : 0;
        this.v[x] = (this.v[x] << 1) & 0xFF;
      }
    }

    draw(xReg, yReg, height) {
      const startX = this.v[xReg] % 64;
      const startY = this.v[yReg] % 32;
      this.v[0xF] = 0;
      for (let row = 0; row < height; row++) {
        const byte = this.mem[this.i + row];
        for (let bit = 0; bit < 8; bit++) {
          if ((byte & (0x80 >> bit)) === 0) continue;
          const x = (startX + bit) % 64;
          const y = (startY + row) % 32;
          const idx = y * 64 + x;
          if (this.display[idx]) this.v[0xF] = 1;
          this.display[idx] ^= 1;
        }
      }
    }

    setKey(key, pressed) {
      this.keys[key] = pressed ? 1 : 0;
      if (pressed && this.waitingForKey !== null) {
        this.v[this.waitingForKey] = key;
        this.waitingForKey = null;
      }
    }

    tick() {
      if (this.delayTimer > 0) this.delayTimer -= 1;
      if (this.soundTimer > 0) this.soundTimer -= 1;
    }

    getOpcodeDetails(op) {
      const x = (op & 0x0F00) >> 8;
      const y = (op & 0x00F0) >> 4;
      const n = op & 0x000F;
      const nn = op & 0x00FF;
      const nnn = op & 0x0FFF;
      const binary = op.toString(2).padStart(16, '0');

      return {
        binary,
        masks: { x, y, n, nn, nnn },
        desc: this.describe(op)
      };
    }

    describe(op = this.lastOp) {
      const x = (op & 0x0F00) >> 8;
      const y = (op & 0x00F0) >> 4;
      const n = op & 0x000F;
      const nn = op & 0x00FF;
      const nnn = op & 0x0FFF;
      const top = op & 0xF000;

      if (op === 0x00E0) return "CLS";
      if (op === 0x00EE) return "RET";
      if (top === 0x1000) return `JP 0x${nnn.toString(16).toUpperCase()}`;
      if (top === 0x2000) return `CALL 0x${nnn.toString(16).toUpperCase()}`;
      if (top === 0x3000) return `SE V${x}, 0x${nn.toString(16).toUpperCase()}`;
      if (top === 0x4000) return `SNE V${x}, 0x${nn.toString(16).toUpperCase()}`;
      if ((op & 0xF00F) === 0x5000) return `SE V${x}, V${y}`;
      if (top === 0x6000) return `LD V${x}, 0x${nn.toString(16).toUpperCase()}`;
      if (top === 0x7000) return `ADD V${x}, 0x${nn.toString(16).toUpperCase()}`;
      if (top === 0x8000) return ["LD", "OR", "AND", "XOR", "ADD", "SUB", "SHR", "SUBN", "", "", "", "", "", "",
  "SHL"][n] + ` V${x}, V${y}`;
      if ((op & 0xF00F) === 0x9000) return `SNE V${x}, V${y}`;
      if (top === 0xA000) return `LD I, 0x${nnn.toString(16).toUpperCase()}`;
      if (top === 0xB000) return `JP V0, 0x${nnn.toString(16).toUpperCase()}`;
      if (top === 0xC000) return `RND V${x}, 0x${nn.toString(16).toUpperCase()}`;
      if (top === 0xD000) return `DRW V${x}, V${y}, ${n}`;
      if ((op & 0xF0FF) === 0xE09E) return `SKP V${x}`;
      if ((op & 0xF0FF) === 0xE0A1) return `SKNP V${x}`;
      if ((op & 0xF0FF) === 0xF007) return `LD V${x}, DT`;
      if ((op & 0xF0FF) === 0xF00A) return `LD V${x}, K`;
      if ((op & 0xF0FF) === 0xF015) return `LD DT, V${x}`;
      if ((op & 0xF0FF) === 0xF018) return `LD ST, V${x}`;
      if ((op & 0xF0FF) === 0xF01E) return `ADD I, V${x}`;
      if ((op & 0xF0FF) === 0xF029) return `LD F, V${x}`;
      if ((op & 0xF0FF) === 0xF033) return `LD B, V${x}`;
      if ((op & 0xF0FF) === 0xF055) return `LD [I], V${x}`;
      if ((op & 0xF0FF) === 0xF065) return `LD V${x}, [I]`;
      return `0x${op.toString(16).toUpperCase()}`;
    }
  }

  ui.js

  import { KEY_MAP, KEYPAD_LABELS, DEFAULT_ASM, FEATURE_DATA, GAME_DATA, SETTINGS_DATA } from './data.js';
  import { Chip8 } from './cpu.js';
  import { Assembler } from './assembler.js';

  const dom = {
    root: document.documentElement,
    body: document.body,
    loadNum: document.querySelector(".load-number"),
    cursor: document.querySelector("#custom-cursor"),
    navBtns: document.querySelectorAll(".nav button"),
    panels: document.querySelectorAll(".panel"),
    brand: document.querySelector(".brand"),
    status: document.querySelector("#statusbar"),
    featCards: document.querySelector("#feature-cards"),
    gameGrid: document.querySelector("#game-grid"),
    setGrid: document.querySelector("#settings-grid"),
    speed: document.querySelector("#speed-slider"),
    screen: document.querySelector("#screen-preview"),
    memGrid: document.querySelector("#memory-grid"),
    degGrid: document.querySelector("#debug-grid"),
    keyGrid: document.querySelector("#keypad-grid"),
    log: document.querySelector("#vm-log"),
    editor: document.querySelector("#asm-editor"),
    lines: document.querySelector("#asm-lines"),
    term: document.querySelector("#asm-terminal"),
    timers: { dt: document.querySelector("#dt-panel"), st: document.querySelector("#st-panel") },
    btns: {
      run: document.querySelector("#run-vm"),
      pause: document.querySelector("#pause-vm"),
      step: document.querySelector("#step-vm"),
      stepOver: document.querySelector("#step-over-vm"),
      reset: document.querySelector("#reset-vm-main"),
      asm: document.querySelector("#assemble-code"),
      load: document.querySelector("#load-assembled"),
      exp: document.querySelector("#export-rom"),
      imp: document.querySelector("#import-rom"),
      addBp: document.querySelector("#add-bp"),
      addWatch: document.querySelector("#add-watch"),
      mjmp: document.querySelector("#mem-jump-btn"),
      mhome: document.querySelector("#mem-home-btn"),
      mwrite: document.querySelector("#mem-write-btn"),
      clearLog: document.querySelector("#log-clear"),
      closeInspector: document.querySelector("#close-inspector")
    },
    bpIn: document.querySelector("#bp-input"),
    bpList: document.querySelector("#bp-list"),
    watchIn: document.querySelector("#watch-input"),
    watchList: document.querySelector("#watch-list"),
    mjmpIn: document.querySelector("#mem-jump-input"),
    mvalIn: document.querySelector("#mem-val-input"),
    stackView: document.querySelector("#stack-view"),
    inspector: document.querySelector("#op-inspector"),
    inspectorBody: document.querySelector("#inspector-body")
  };

  const chip = new Chip8();
  const asm = new Assembler();
  let progress = 0;
  let loop = null;
  let lastMsg = "System Idle";
  let romName = "Scratch ROM";
  let bin = null;

  const state = {
    memFmt: "Hexadecimal",
    regFmt: "Hexadecimal",
    memOff: 0x200,
    selAddr: null
  };

  function fmtHex(v, w = 2) { return v.toString(16).toUpperCase().padStart(w, "0"); }

  function valStr(v, fmt, w = 2) {
    if (fmt === "Decimal") return String(v);
    if (fmt === "Binary") return v.toString(2).padStart(8, "0");
    return `0x${fmtHex(v, w)}`;
  }

  function setupImmediate() {
    dom.body.onmousemove = (e) => {
      dom.cursor.style.left = e.clientX + "px";
      dom.cursor.style.top = e.clientY + "px";
    };
  }

  function boot() {
    const timer = setInterval(() => {
      progress += 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        setTimeout(() => {
          dom.body.classList.add("ready");
          init();
        }, 300);
      }
      dom.root.style.setProperty("--load", `${progress}%`);
      dom.loadNum.textContent = `${progress}%`;
    }, 100);
  }

  function init() {
    initScreen();
    initUI();
    renderArcade();
    renderSettings();
    loadScratch();
    sync();
  }

  function initScreen() {
    dom.screen.innerHTML = "";
    for (let i = 0; i < 64 * 32; i++) {
      const p = document.createElement("div");
      p.className = "screen-pixel";
      dom.screen.appendChild(p);
    }
  }

  function initUI() {
    dom.navBtns.forEach(b => b.onclick = () => switchPanel(b.dataset.panel));

    dom.btns.run.onclick = run;
    dom.btns.pause.onclick = pause;
    dom.btns.step.onclick = () => step(true);
    dom.btns.stepOver.onclick = stepOver;
    dom.btns.reset.onclick = reset;
    dom.btns.asm.onclick = asmEditor;
    dom.btns.load.onclick = loadAsm;
    dom.btns.exp.onclick = exportRom;
    dom.btns.imp.onclick = () => dom.btns.imp.click();
    dom.btns.imp.onchange = importRom;
    dom.btns.clearLog.onclick = () => { chip.history = []; printLog("Log cleared"); };
    dom.btns.closeInspector.onclick = () => dom.inspector.classList.remove("active");

    dom.btns.addBp.onclick = () => {
      const a = parseInt(dom.bpIn.value, 16);
      if (!isNaN(a)) { chip.bps.add(a); dom.bpIn.value = ""; sync(); }
    };

    dom.btns.addWatch.onclick = () => {
      const v = dom.watchIn.value.toUpperCase();
      if (v.startsWith("V") && v.length === 2) {
        chip.watchpoints.add(parseInt(v.slice(1), 16));
        dom.watchIn.value = "";
        sync();
      }
    };

    dom.btns.mjmp.onclick = () => {
      const a = parseInt(dom.mjmpIn.value, 16);
      if (!isNaN(a)) { state.memOff = a & 0xFFF; sync(); }
    };

    dom.btns.mhome.onclick = () => { state.memOff = 0x200; sync(); };

    dom.btns.mwrite.onclick = () => {
      const a = state.selAddr;
      const v = parseInt(dom.mvalIn.value, 16);
      if (a !== null && !isNaN(v)) { chip.mem[a] = v & 0xFF; sync(); }
    };

    dom.editor.oninput = () => {
      const lines = dom.editor.value.split("\n");
      dom.lines.innerHTML = lines.map((_, i) => i + 1).join("<br>");
    };

    window.onkeydown = (e) => {
      const key = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
      if (key !== undefined) chip.setKey(key, true);
    };
    window.onkeyup = (e) => {
      const key = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
      if (key !== undefined) chip.setKey(key, false);
    };

    dom.editor.oninput();
  }

  function switchPanel(id) {
    dom.navBtns.forEach(b => b.classList.remove("active"));
    dom.panels.forEach(p => p.classList.remove("active"));
    const btn = document.querySelector(`.nav button[data-panel="${id}"]`);
    if (btn) btn.classList.add("active");
    document.getElementById(id).classList.add("active");
  }

  function reset() {
    pause();
    chip.reset();
    loadScratch();
    romName = "Scratch ROM";
    lastMsg = "VM Reset";
    sync();
  }

  function loadScratch() {
    const res = asm.assemble(DEFAULT_ASM);
    chip.load(res.bytes);
    bin = res.bytes;
  }

  function loadAsm() {
    asmEditor();
    if (!bin) return;
    pause();
    chip.reset();
    chip.load(bin);
    romName = "Assembled ROM";
    lastMsg = "Code loaded";
    sync();
  }

  function exportRom() {
    if (!bin) {
      alert("Please assemble a program first.");
      return;
    }
    const blob = new Blob([bin], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "program.ch8";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importRom(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      bin = bytes;
      pause();
      chip.reset();
      chip.load(bytes);
      romName = file.name;
      lastMsg = `Imported ${file.name}`;
      sync();
    };
    reader.readAsArrayBuffer(file);
  }

  function step(v = true) {
    try {
      const dec = chip.cycle();
      if (dec === "BREAKPOINT_HIT") {
        pause();
        lastMsg = `BP Hit at 0x${fmtHex(chip.pc, 3)}`;
      } else if (dec === "WATCHPOINT_HIT") {
        pause();
        lastMsg = "Watchpoint triggered: Register changed";
      } else if (dec === "waiting") {
        lastMsg = "Waiting for key...";
      } else {
        lastMsg = `Exec 0x${fmtHex(chip.lastOp, 4)} ${dec}`;
      }
    } catch (e) {
      pause();
      lastMsg = e.message;
    }
    if (v) printLog();
    sync();
  }

  function stepOver() {
    try {
      const res = chip.stepOver();
      lastMsg = res === "Subroutine completed" ? "Stepped over call" : `Exec 0x${fmtHex(chip.lastOp, 4)} ${res}`;
    } catch (e) {
      pause();
      lastMsg = e.message;
    }
    printLog();
    sync();
  }

  function run() {
    if (loop) return;
    loop = setInterval(() => {
      const perFrame = Math.max(1, Math.floor(Number(dom.speed.value) / 60));
      for (let i = 0; i < perFrame; i++) {
        const res = step(false);
        if (res === "BREAKPOINT_HIT" || res === "WATCHPOINT_HIT") break;
      }
      chip.tick();
      printLog("Running");
      sync();
    }, 1000 / 60);
  }

  function pause() {
    if (loop) clearInterval(loop);
    loop = null;
  }

  function asmEditor() {
    const res = asm.assemble(dom.editor.value);
    bin = res.errors.length ? null : res.bytes;
    if (res.errors.length) {
      dom.term.textContent = `Error:\n${res.errors.join("\n")}`;
      return;
    }
    const bStr = Array.from(res.bytes).map(b => fmtHex(b, 2)).join(" ");
    dom.term.textContent = `OK: ${res.bytes.length} bytes\n\n${bStr}`;
  }

  function printLog(msg = lastMsg) {
    dom.log.innerHTML = "";
    dom.log.textContent = `${msg}\n${"-".repeat(30)}\n`;

    chip.history.forEach(entry => {
      const line = document.createElement("div");
      line.className = "log-entry";
      line.textContent = `[${entry.cycle}] 0x${fmtHex(entry.pc, 3)} | 0x${fmtHex(entry.op, 4)} ${entry.desc}`;
      line.onclick = () => showInspector(entry);
      dom.log.appendChild(line);
    });
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function showInspector(entry) {
    const details = chip.getOpcodeDetails(entry.op);
    const bits = details.binary.split("");

    let bitHtml = `<div class="bit-grid">`;
    bits.forEach(b => { bitHtml += `<div class="bit-cell ${b==='1'?'active':''}">${b}</div>`; });
    bitHtml += `</div>`;

    dom.inspectorBody.innerHTML = `
      <div class="detail-row"><span>Opcode</span><strong>0x${fmtHex(entry.op, 4)}</strong></div>
      <div class="detail-row"><span>Instruction</span><strong>${details.desc}</strong></div>
      <div class="detail-row"><span>PC</span><strong>0x${fmtHex(entry.pc, 3)}</strong></div>
      <div class="detail-row"><span>Cycle</span><strong>${entry.cycle}</strong></div>
      <div style="margin-top:16px;" class="section-label">Bit Breakdown</div>
      ${bitHtml}
      <div class="detail-row"><span>X (Nibble 2)</span><strong>${details.masks.x}</strong></div>
      <div class="detail-row"><span>Y (Nibble 3)</span><strong>${details.masks.y}</strong></div>
      <div class="detail-row"><span>N (Nibble 4)</span><strong>${details.masks.n}</strong></div>
      <div class="detail-row"><span>NN (Byte 2)</span><strong>0x${fmtHex(details.masks.nn, 2)}</strong></div>
      <div class="detail-row"><span>NNN (Address)</span><strong>0x${fmtHex(details.masks.nnn, 3)}</strong></div>
    `;
    dom.inspector.classList.add("active");
  }

  function renderArcade() {
    const template = document.querySelector("#card-template");
    dom.gameGrid.innerHTML = "";
    GAME_DATA.forEach(([title, desc]) => {
      const card = template.content.cloneNode(true);
      card.querySelector("strong").textContent = title;
      card.querySelector("span").textContent = desc;
      dom.gameGrid.appendChild(card);
    });
  }

  function renderSettings() {
    const template = document.querySelector("#setting-template");
    dom.setGrid.innerHTML = "";
    SETTINGS_DATA.forEach(([name, desc, key, options]) => {
      const row = template.content.cloneNode(true);
      const label = row.querySelector("span");
      const select = row.querySelector("select");

      label.innerHTML = `${name}<small>${desc}</small>`;
      select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
      select.onchange = (e) => applySetting(key, e.target.value);

      dom.setGrid.appendChild(row);
    });
  }

  function applySetting(key, value) {
    switch(key) {
      case 'theme':
        const themeMap = { "Amber Cathode": "amber", "Matrix Terminal": "matrix", "Cyber-Whacker": "cyber" };
        dom.body.dataset.theme = themeMap[value] || "amber";
        break;
      case 'cursor':
        const cursorMap = { "Retro Hand": "hand", "Crosshair": "crosshair", "Pixel Pointer": "pixel" };
        if (value === "System Cursor") {
          dom.body.classList.add("system-cursor");
        } else {
          dom.body.classList.remove("system-cursor");
          dom.cursor.className = `custom-cursor ${cursorMap[value] || 'hand'}`;
        }
        break;
      case 'memoryFormat':
        state.memFmt = value;
        sync();
        break;
      case 'registerFormat':
        state.regFmt = value;
        sync();
        break;
      case 'pixelated':
        dom.body.classList.toggle('pixelated', value === "On");
        break;
    }
  }

  function sync() {
    renderStatus();
    renderScreen();
    renderMem();
    renderDebug();
    renderKeys();
    renderBPs();
    renderWatches();
    renderStack();
    dom.timers.dt.textContent = chip.delayTimer;
    dom.timers.st.textContent = chip.soundTimer;
  }

  function renderStatus() {
    const rows = [
      ["State", loop ? "Running" : "Paused"],
      ["ROM", romName],
      ["Clock", `${dom.speed.value} Hz`],
      ["PC", `0x${fmtHex(chip.pc, 3)}`],
      ["Op", `0x${fmtHex(chip.lastOp, 4)}`]
    ];
    dom.status.innerHTML = rows.map(([l, v]) => `<div class="status-item"><span class="status-label">${l}</span><span
  class="status-value">${v}</span></div>`).join("");
  }

  function renderScreen() {
    const px = dom.screen.children;
    for (let i = 0; i < px.length; i++) px[i].classList.toggle("on", chip.display[i] === 1);
  }

  function renderMem() {
    const cells = dom.memGrid.children;
    if (cells.length === 0) {
      for (let i = 0; i < 256; i++) {
        const b = document.createElement("div");
        b.className = "byte";
        b.onclick = () => { state.selAddr = (state.memOff + i) & 0xFFF; sync(); };
        dom.memGrid.appendChild(b);
      }
    }
    const off = state.memOff;
    for (let i = 0; i < cells.length; i++) {
      const a = (off + i) & 0xFFF;
      cells[i].textContent = valStr(chip.mem[a], state.memFmt);
      cells[i].className = "byte";
      if (a === chip.pc) cells[i].classList.add("pc");
      if (a === chip.pc - 2 || a === chip.pc - 1) cells[i].classList.add("read");
      if (chip.bps.has(a)) cells[i].classList.add("breakpoint");
      if (a === state.selAddr) cells[i].classList.add("selected");
    }
  }

  function renderDebug() {
    const regs = [...chip.v, chip.i, chip.pc, chip.stack.length, chip.delayTimer, chip.soundTimer, chip.cycles];
    const lbls = [...Array.from({length:16}, (_, i) => `V${fmtHex(i,1)}`), "I", "PC", "SP", "DT", "ST", "CY"];

    if (dom.degGrid.children.length !== lbls.length) {
      dom.degGrid.innerHTML = lbls.map((l, i) => `
        <div class="register">
          <span>${l}</span>
          <input type="text" data-reg="${i}" value="${valStr(regs[i], state.regFmt)}">
        </div>
      `).join("");
      dom.degGrid.querySelectorAll("input").forEach(inp => {
        inp.onchange = (e) => updateReg(parseInt(e.target.dataset.reg), e.target.value);
      });
    } else {
      Array.from(dom.degGrid.querySelectorAll("input")).forEach((inp, i) => {
        inp.value = valStr(regs[i], state.regFmt);
      });
    }
  }

  function updateReg(idx, val) {
    let n = val.toLowerCase().startsWith("0x") ? parseInt(val.slice(2), 16) : parseInt(val, 10);
    if (isNaN(n)) return;
    if (idx < 16) chip.v[idx] = n & 0xFF;
    else if (idx === 16) chip.i = n & 0xFFF;
    else if (idx === 17) chip.pc = n & 0xFFF;
    else if (idx === 19) chip.delayTimer = n & 0xFF;
    else if (idx === 20) chip.soundTimer = n & 0xFF;
    sync();
  }

  function renderKeys() {
    if (dom.keyGrid.children.length === 0) {
      dom.keyGrid.innerHTML = KEYPAD_LABELS.map(l => `<button type="button">${l}</button>`).join("");
    }
    Array.from(dom.keyGrid.children).forEach((b, i) => b.classList.toggle("down", chip.keys[i] === 1));
  }

  function renderBPs() {
    dom.bpList.innerHTML = "";
    chip.bps.forEach(a => {
      const c = document.createElement("span");
      c.className = "bp-chip";
      c.textContent = `0x${fmtHex(a, 3)} ✕`;
      c.onclick = () => { chip.bps.delete(a); sync(); };
      dom.bpList.appendChild(c);
    });
  }

  function renderWatches() {
    dom.watchList.innerHTML = "";
    chip.watchpoints.forEach(idx => {
      const c = document.createElement("span");
      c.className = "bp-chip";
      c.textContent = `V${fmtHex(idx, 1)} ✕`;
      c.onclick = () => { chip.watchpoints.delete(idx); sync(); };
      dom.watchList.appendChild(c);
    });
  }

  function renderStack() {
    dom.stackView.innerHTML = chip.stack.map((a, i) => `<div class="stack-item">${fmtHex(a, 3)}</div>`).join("");
  }

  setupImmediate();
  boot();

