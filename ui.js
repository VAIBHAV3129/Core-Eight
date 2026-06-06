import { KEY_MAP, KEYPAD_LABELS, DEFAULT_ASM, FEATURE_DATA, GAME_DATA, SETTINGS_DATA } from './data.js';
import { Chip8 } from './cpu.js';
import { Assembler } from './assembler the.js'; // Fixed reference
import { Assembler as AsmClass } from './assembler.js';

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
    resetS: document.querySelector("#vm-reset"),
    asm: document.querySelector("#assemble-code"),
    load: document.querySelector("#load-assembled"),
    exp: document.querySelector("#export-rom"),
    imp: document.querySelector("#import-rom"),
    addBp: document.querySelector("#add-bp"),
    mjmp: document.querySelector("#mem-jump-btn"),
    mhome: document.querySelector("#mem-home-btn"),
    mwrite: document.querySelector("#mem-write-btn"),
    clearLog: document.querySelector("#log-clear")
  },
  bpIn: document.querySelector("#bp-input"),
  bpList: document.querySelector("#bp-list"),
  mjmpIn: document.querySelector("#mem-jump-input"),
  mvalIn: document.querySelector("#mem-val-input")
};

const chip = new Chip8();
const asm = new AsmClass();
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

function boot() {
  const timer = setInterval(() => {
    progress += 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(timer);
      setTimeout(() => dom.body.classList.add("ready"), 0.3);
    }
    dom.root.style.setProperty("--load", `${progress}%`);
    dom.loadNum.textContent = `${progress}%`;
  }, 100);
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
  if (!bin) asmEditor();
  if (!bin) return;
  pause();
  chip.reset();
  chip.load(bin);
  romName = "Assembled ROM";
  lastMsg = "Code loaded";
  sync();
}

function step(v = true) {
  try {
    const dec = chip.cycle();
    if (dec === "BREAKPOINT_HIT") {
      pause();
      lastMsg = `BP Hit at 0x${fmtHex(chip.pc, 3)}`;
    } else {
      lastMsg = dec === "waiting" ? "Waiting for key..." : `Exec 0x${fmtHex(chip.lastOp, 4)} ${dec}`;
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
      if (step(false) === "BREAKPOINT_HIT") break;
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
  const historyLines = chip.history.map(entry => 
    `[${entry.cycle}] 0x${fmtHex(entry.pc, 3)} | 0x${fmtHex(entry.op, 4)} ${entry.desc}`
  ).join("\n");

  dom.log.textContent = `${msg}\n${"-".repeat(30)}\n${historyLines || "No cycles executed."}`;
  dom.log.scrollTop = dom.log.scrollHeight;
}

function sync() {
  renderStatus();
  renderScreen();
  renderMem();
  renderDebug();
  renderKeys();
  renderBPs();
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
  dom.status.innerHTML = rows.map(([l, v]) => `<div class="status-item"><span class="status-label">${l}</span><span class="status-value">${v}</span></div>`).join("");
}

function renderScreen() {
  const px = dom.screen.children;
  for (let i = 0; i < px.length; i++) px[i].classList.toggle("on", chip.display[i] === 1);
}

function renderMem() {
  const cells = dom.memGrid.children;
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

function initGrids() {
  for (let i = 0; i < 64 * 32; i++) dom.screen.appendChild(document.createElement("i")).className = "screen-pixel";
  for (let i = 0; i < 256; i++) {
    const s = document.createElement("span");
    s.className = "byte";
    s.onclick = () => {
      const a = (state.memOff + Array.from(dom.memGrid.children).indexOf(s)) & 0xFFF;
      state.selAddr = a;
      dom.mvalIn.value = valStr(chip.mem[a], "Hexadecimal");
      sync();
    };
    dom.memGrid.appendChild(s);
  }
  KEYPAD_LABELS.forEach((l, i) => {
    const b = document.createElement("button");
    b.textContent = l;
    b.onpointerdown = () => { chip.setKey(i, true); sync(); };
    b.onpointerup = () => { chip.setKey(i, false); sync(); };
    dom.keyGrid.appendChild(b);
  });
}

function buildCards(target, rows, art = false) {
  const temp = document.querySelector("#card-template");
  target.innerHTML = "";
  rows.forEach(([t, x]) => {
    const n = temp.content.cloneNode(true);
    n.querySelector("strong").textContent = t;
    n.querySelector("span").textContent = x;
    if (!art) n.querySelector(".game-art").remove();
    target.appendChild(n);
  });
}

function initSettings() {
  const temp = document.querySelector("#setting-template");
  SETTINGS_DATA.forEach(([l, h, k, opts]) => {
    const n = temp.content.cloneNode(true);
    n.querySelector("span").innerHTML = `${l} <small>${h}</small>`;
    const sel = n.querySelector("select");
    sel.dataset.setting = k;
    opts.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o; opt.textContent = o;
      sel.appendChild(opt);
    });
    dom.setGrid.appendChild(n);
  });
  
  const pix = document.createElement("label");
  pix.className = "setting-row";
  pix.innerHTML = `<span>Pixel Effect <small>Hard edges.</small></span><input id="pixel-toggle" type="checkbox" checked>`;
  dom.setGrid.appendChild(pix);

  const font = document.createElement("label");
  font.className = "setting-row";
  font.innerHTML = `<span>Editor Size <small>Text size.</small></span><input id="editor-size" type="range" min="13" max="20" value="15">`;
  dom.setGrid.appendChild(font);

  dom.setGrid.onchange = (e) => {
    const k = e.target.dataset.setting;
    if (!k) return;
    if (k === "theme") {
      const map = { "Amber Cathode": "amber", "Matrix Terminal": "matrix", "Cyber-Whacker": "cyber" };
      dom.body.dataset.theme = map[e.target.value];
    } else if (k === "cursor") {
      const map = { "Retro Hand": "hand", "Crosshair": "crosshair", "Pixel Pointer": "pixel", "System Cursor": "system" };
      dom.cursor.className = `custom-cursor ${map[e.target.value]}`;
      dom.body.classList.toggle("system-cursor", e.target.value === "System Cursor");
    } else if (k === "memoryFormat") state.memFmt = e.target.value;
    else if (k === "registerFormat") state.regFmt = e.target.value;
    sync();
  };
  
  dom.setGrid.querySelector("#pixel-toggle").onchange = (e) => dom.body.classList.toggle("pixelated", e.target.checked);
  dom.setGrid.querySelector("#editor-size").oninput = (e) => dom.root.style.setProperty("--editor-size", `${e.target.value}px`);
}

function bind() {
  window.onpointermove = (e) => dom.cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
  window.onkeydown = (e) => {
    const k = KEY_MAP[e.key.toLowerCase()];
    if (k !== undefined) { chip.setKey(k, true); sync(); }
  };
  window.onkeyup = (e) => {
    const k = KEY_MAP[e.key.toLowerCase()];
    if (k !== undefined) { chip.setKey(k, false); sync(); }
  };

  dom.navBtns.forEach(b => b.onclick = () => switchPanel(b.dataset.panel));
  dom.brand.onclick = () => switchPanel("dashboard");
  dom.speed.oninput = sync;
  dom.btns.reset.onclick = reset;
  domC.btns.resetS.onclick = reset;
  dom.btns.step.onclick = () => step(true);
  dom.btns.stepOver.onclick = stepOver;
  dom.btns.run.onclick = run;
  dom.btns.pause.onclick = pause;
  dom.btns.asm.onclick = asmEditor;
  dom.btns.load.onclick = loadAsm;
  dom.editor.oninput = () => {
    dom.lines.innerHTML = Array.from({ length: dom.editor.value.split("\n").length }, (_, i) => i + 1).join("<br>");
  };

  dom.btns.addBp.onclick = () => {
    const a = parseInt(dom.bpIn.value, 16);
    if (!isNaN(a)) { chip.bps.add(a); dom.bpIn.value = ""; sync(); }
  };

  dom.btns.mjmp.onclick = () => {
    const a = parseInt(dom.mjmpIn.value, 16);
    if (!isNaN(a)) { state.memOff = a & 0xFFF; sync(); }
  };

  dom.btns.mhome.onclick = () => { state.memOff = 0x200; sync(); };

  dom.btns.mwrite.onclick = () => {
    if (state.selAddr === null) return;
    let val = dom.mvalIn.value.toLowerCase().startsWith("0x") ? parseInt(dom.mvalIn.value.slice(2), 16) : parseInt(dom.mvalIn.value, 10);
    if (!isNaN(val)) {
      chip.mem[state.selAddr] = val & 0xFF;
      sync();
    }
  };

  dom.btns.imp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const b = new Uint8Array(ev.target.result);
      pause(); chip.reset(); chip.load(b);
      romName = f.name; lastMsg = `Imported ${f.name}`;
      printLog(); sync();
    };
    r.readAsArrayBuffer(f);
  };

  dom.btns.exp.onclick = () => {
    const b = chip.mem.slice(0x200);
    const blob = new Blob([b], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "program.ch8"; a.click();
  };

  dom.degGrid.onchange = (e) => {
    if (e.target.tagName === "INPUT") {
      updateReg(parseInt(e.target.dataset.reg), e.target.value);
    }
  };

  dom.btns.clearLog.onclick = () => {
    chip.history = [];
    sync();
  };
}

dom.editor.value = DEFAULT_ASM;
dom.lines.innerHTML = Array.from({ length: DEFAULT_ASM.split("\n").length }, (_, i) => i + 1).join("<br>");
buildCards(dom.featCards, FEATURE_DATA);
buildCards(dom.gameGrid, GAME_DATA, true);
initSettings();
initGrids();
bind();
reset();
asmEditor();
boot();
