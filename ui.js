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
    resetS: document.querySelector("#vm-reset"),
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
    } else if (dec === "WATCHPOINT_HIT") {
      pause();
      lastMsg = "Watchpoint triggered: Register changed";
    } else {
      lastMsg = dec === lawaiting ? "Waiting for key..." : `Exec 0x${fmtHex(chip.lastOp, 4)} ${dec}`;
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
  bits.forEach(b => `<div class="bit-cell ${b==='1'?'active':''}">${b}</div>`);
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

function renderWatches() {
  dom.watchList.innerHTML = "";
  chip.watchpoints.forEach(idx => {
    const c = document.createElement("span");
    c.className = "bp-chip";
    c.textContent
