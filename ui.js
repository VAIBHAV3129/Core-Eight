import { KEY_MAP, KEYPAD_LABELS, DEFAULT_ASM, FEATURE_DATA, GAME_DATA, SETTINGS_DATA, TEST_SUITE } from './data.js';
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
    testVm: document.querySelector("#test-vm"),
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
let lastTime = 0;
let cycleRemainder = 0;
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
  dom.brand.onclick = () => switchPanel(dom.brand.dataset.panel);

  dom.btns.run.onclick = run;
  dom.btns.pause.onclick = pause;
  dom.btns.step.onclick = () => step(true);
  dom.btns.stepOver.onclick = stepOver;
  dom.btns.reset.onclick = reset;
  dom.btns.testVm.onclick = runSystemTests;
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
    if (!isNaN(a)) { state.memOff = a & 0xFFFF; sync(); }
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

function runSystemTests() {
  pause();
  let passedCount = 0;
  const results = TEST_SUITE.map(test => {
    const res = chip.testRunner(test);
    if (res.passed) passedCount++;
    return `${test.name}: ${res.passed ? "PASS" : "FAIL " + res.failures.join(", ")}`;
  });
  
  printLog(`Verification Complete: ${passedCount}/${TEST_SUITE.length} Passed`);
  results.forEach(line => {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.textContent = line;
    dom.log.appendChild(entry);
  });
  sync();
}

function step(v = true) {
  try {
    const dec = chip.cycle();
    if (dec === "BREAKPOINT_HIT") {
      pause();
      lastMsg = `BP Hit at 0x${fmtHex(chip.pc, 4)}`;
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
  
  const tick = (time) => {
    if (!lastTime) lastTime = time;
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    const hz = Number(dom.speed.value);
    let cyclesToRun = hz * dt + cycleRemainder;
    const actualRun = Math.floor(cyclesToRun);
    cycleRemainder = cyclesToRun - actualRun;

    for (let i = 0; i < actualRun; i++) {
      const res = step(false);
      if (res === "BREAKPOINT_HIT" || res === "WATCHPOINT_HIT") {
        pause();
        break;
      }
    }

    chip.tick();
    printLog("Running");
    sync();
    loop = requestAnimationFrame(tick);
  };

  lastTime = 0;
  cycleRemainder = 0;
  loop = requestAnimationFrame(tick);
}

function pause() {
  if (loop) cancelAnimationFrame(loop);
  loop = null;
  lastTime = 0;
  cycleRemainder = 0;
}

function asmEditor() {
  const res = asm.assemble(dom.editor.value);
  bin = res.errors.length ? null : res.bytes;
  if (res.errors.length) {
    const errText = res.errors.map(e => `[${e.code}] Line ${e.line}, Col ${e.col}: ${e.message}`).join("\n");
    dom.term.textContent = `Error:\n${errText}`;
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
    line.textContent = `[${entry.cycle}] 0x${fmtHex(entry.pc, 4)} | 0x${fmtHex(entry.op, 4)} ${entry.desc}`;
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
    <div class="detail-row"><span>PC</span><strong>0x${fmtHex(entry.pc, 4)}</strong></div>
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
    case 'shiftQuirk':
    case 'incIQuirk':
    case 'drawWrapQuirk':
      chip.setQuirk(key, value);
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
    ["PC", `0x${fmtHex(chip.pc, 4)}`],
    ["Op", `0x${fmtHex(chip.lastOp, 4)}`]
  ];
  dom.status.innerHTML = rows.map(([l, v]) => `<div class="status-item"><span class="status-label">${l}</span><span
  class="status-value">${v}</span></div>`).join("");
}

function renderScreen() {
  const totalPx = chip.width * chip.height;
  if (dom.screen.children.length !== totalPx) {
    dom.screen.innerHTML = "";
    dom.screen.style.gridTemplateColumns = `repeat(${chip.width}, 1fr)`;
    dom.screen.style.gridTemplateRows = `repeat(${chip.height}, 1fr)`;
    for (let i = 0; i < totalPx; i++) {
      const p = document.createElement("div");
      p.className = "screen-pixel";
      dom.screen.appendChild(p);
    }
  }
  const px = dom.screen.children;
  for (let i = 0; i < px.length; i++) px[i].classList.toggle("on", chip.display[i] === 1);
}

function renderMem() {
  const cells = dom.memGrid.children;
  if (cells.length === 0) {
    for (let i = 0; i < 256; i++) {
      const b = document.createElement("div");
      b.className = "byte";
      b.onclick = () => { state.selAddr = (state.memOff + i) & 0xFFFF; sync(); };
      dom.memGrid.appendChild(b);
    }
  }
  const off = state.memOff;
  for (let i = 0; i < cells.length; i++) {
    const a = (off + i) & 0xFFFF;
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
  else if (idx === 16) chip.i = n & 0xFFFF;
  else if (idx === 17) chip.pc = n & 0xFFFF;
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
    c.textContent = `0x${fmtHex(a, 4)} ✕`;
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
  dom.stackView.innerHTML = chip.stack.map((a, i) => `<div class="stack-item">${fmtHex(a, 4)}</div>`).join("");
}

setupImmediate();
boot();
