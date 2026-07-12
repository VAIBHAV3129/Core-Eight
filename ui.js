import { KEY_MAP, KEYPAD_LABELS, DEFAULT_ASM, FEATURE_DATA, GAME_DATA, SETTINGS_DATA, TEST_SUITE } from './data.js';
import { Chip8 } from './cpu.js';
import { Assembler, Disassembler } from './assembler.js';

const PIXEL_SIZE = 10;
const GRID_GAP = 1;

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
  ctx: null,
  memGrid: document.querySelector("#memory-grid"),
  degGrid: document.querySelector("#debug-grid"),
  keyGrid: document.querySelector("#keypad-grid"),
  log: document.querySelector("#vm-log"),
  editor: document.querySelector("#asm-editor"),
  lines: document.querySelector("#asm-lines"),
  term: document.querySelector("#asm-terminal"),
  symbolNav: document.querySelector("#symbol-nav"),
  binView: document.querySelector("#bin-view"),
  highlightLayer: document.querySelector("#highlight-layer"),
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
    disasm: document.querySelector("#disassemble-rom"),
    exp: document.querySelector("#export-rom"),
    imp: document.querySelector("#import-rom"),
    addBp: document.querySelector("#add-bp"),
    addWatch: document.querySelector("#add-watch"),
    mjmp: document.querySelector("#mem-jump-btn"),
    mhome: document.querySelector("#mem-home-btn"),
    mwrite: document.querySelector("#mem-write-btn"),
    clearLog: document.querySelector("#log-clear"),
    closeInspector: document.querySelector("#close-inspector"),
    fillMem: document.querySelector("#mem-fill-btn")
  },
  bpIn: document.querySelector("#bp-input"),
  bpCondIn: document.querySelector("#bp-cond-input"),
  bpList: document.querySelector("#bp-list"),
  watchIn: document.querySelector("#watch-input"),
  watchList: document.querySelector("#watch-list"),
  mjmpIn: document.querySelector("#mem-jump-input"),
  mvalIn: document.querySelector("#mem-val-input"),
  fillStart: document.querySelector("#mem-fill-start"),
  fillEnd: document.querySelector("#mem-fill-end"),
  fillVal: document.querySelector("#mem-fill-val"),
  stackView: document.querySelector("#stack-view"),
  inspector: document.querySelector("#op-inspector"),
  inspectorBody: document.querySelector("#inspector-body"),
  scrubber: document.querySelector("#cycle-scrubber"),
  cycleVal: document.querySelector("#cycle-val"),
  liveSync: document.querySelector("#live-sync-toggle"),
  heatmapToggle: document.querySelector("#heatmap-toggle")
};

const chip = new Chip8();
const asm = new Assembler();
const dis = new Disassembler();
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
  selAddr: null,
  liveSync: false,
  heatmap: false
};

const lastRenderState = {
  pc: -1,
  op: -1,
  cycles: -1,
  dt: -1,
  st: -1,
  v: new Uint8Array(16),
  i: -1,
  displayChecksum: 0,
  memOff: -1,
  keys: new Uint8Array(16),
  stackLen: -1
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
  dom.ctx = dom.screen.getContext("2d");
  dom.screen.width = chip.width * (PIXEL_SIZE + GRID_GAP);
  dom.screen.height = chip.height * (PIXEL_SIZE + GRID_GAP);
  dom.ctx.imageSmoothingEnabled = false;
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
  dom.btns.disasm.onclick = disassembleRom;
  dom.btns.exp.onclick = exportRom;
  dom.btns.imp.onclick = () => dom.btns.imp.click();
  dom.btns.imp.onchange = importRom;
  dom.btns.clearLog.onclick = () => { chip.history = []; printLog("Log cleared"); };
  dom.btns.closeInspector.onclick = () => dom.inspector.classList.remove("active");

  dom.liveSync.onchange = (e) => { state.liveSync = e.target.checked; };
  dom.heatmapToggle.onchange = (e) => { state.heatmap = e.target.checked; sync(); };

  dom.btns.addBp.onclick = () => {
    const a = parseInt(dom.bpIn.value, 16);
    const cond = dom.bpCondIn.value.trim() || null;
    if (!isNaN(a)) {
      chip.bps.set(a, cond);
      dom.bpIn.value = "";
      dom.bpCondIn.value = "";
      sync();
    }
  };

  dom.btns.addWatch.onclick = () => {
    const v = dom.watchIn.value.toUpperCase();
    if (v.startsWith("V") && v.length === 2) {
      chip.watchpoints.add(parseInt(v.slice(1), 16));
      dom.watchIn.value = "";
      sync();
    } else if (v.startsWith("0X")) {
      const addr = parseInt(v.slice(2), 16);
      if (!isNaN(addr)) {
        chip.memWatchpoints.add(addr & 0xFFFF);
        dom.watchIn.value = "";
        sync();
      }
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
    if (a !== null && !isNaN(v)) { chip.writeMem(a, v); sync(); }
  };

  dom.btns.fillMem.onclick = () => {
    const start = parseInt(dom.fillStart.value, 16);
    const end = parseInt(dom.fillEnd.value, 16);
    const val = parseInt(dom.fillVal.value, 16);
    if (!isNaN(start) && !isNaN(end) && !isNaN(val)) {
      const s = Math.min(start, end) & 0xFFFF;
      const e = Math.max(start, end) & 0xFFFF;
      for (let i = s; i <= e; i++) chip.writeMem(i, val);
      sync();
    }
  };

  dom.editor.oninput = () => {
    const lines = dom.editor.value.split("\n");
    dom.lines.innerHTML = lines.map((_, i) => `<span class="line-number">${i + 1}</span>`).join("");
    updateHighlighting();
    asmEditor();
  };

  dom.editor.onscroll = () => {
    dom.lines.scrollTop = dom.editor.scrollTop;
    dom.binView.scrollTop = dom.editor.scrollTop;
    dom.highlightLayer.scrollTop = dom.editor.scrollTop;
    dom.highlightLayer.scrollLeft = dom.editor.scrollLeft;
  };

  dom.scrubber.oninput = (e) => {
    const idx = parseInt(e.target.value);
    if (chip.rewind(idx)) {
      dom.cycleVal.textContent = idx;
      sync();
    }
  };

  window.onkeydown = (e) => {
    const activePanel = document.querySelector(".panel.active").id;
    if (activePanel === "memory" && state.selAddr !== null) {
      const hexChars = "0123456789ABCDEF";
      const char = e.key.toUpperCase();
      if (hexChars.includes(char)) {
        const val = parseInt(char, 16);
        chip.writeMem(state.selAddr, val);
        sync();
        return;
      }
    }
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

function disassembleRom() {
  if (!bin) {
    dom.term.textContent = "Error: No binary loaded to disassemble.";
    return;
  }
  const source = dis.disassemble(bin);
  dom.editor.value = source;
  dom.editor.oninput();
  dom.term.textContent = "ROM disassembled successfully.";
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
  chip.history = [];
  
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
  
  chip.reset();
  loadScratch();
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
      lastMsg = "Watchpoint triggered: Value changed";
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
  sync();
}

function jumpToLine(line) {
  const text = dom.editor.value;
  const lines = text.split("\n");
  let pos = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    pos += lines[i].length + 1;
  }
  dom.editor.focus();
  dom.editor.setSelectionRange(pos, pos);
  
  const lineHeight = 24.8;
  dom.editor.scrollTop = (line - 1) * lineHeight;
}

function renderSymbols(symbolLines, labels, constants) {
  dom.symbolNav.innerHTML = "";
  
  const allSymbols = [
    ...Object.entries(labels).map(([name, addr]) => ({ name, line: symbolLines[name], type: 'label' })),
    ...Object.entries(constants).map(([name, val]) => ({ name, line: symbolLines[name], type: 'constant' }))
  ].sort((a, b) => a.name.localeCompare(b.name));

  allSymbols.forEach(sym => {
    const item = document.createElement("span");
    item.className = `symbol-item ${sym.type}`;
    item.textContent = sym.name;
    item.onclick = () => jumpToLine(sym.line);
    dom.symbolNav.appendChild(item);
  });
}

function renderBinaryView(lineMap) {
  dom.binView.innerHTML = "";
  const textLines = dom.editor.value.split("\n");
  
  textLines.forEach((_, i) => {
    const lineNum = i + 1;
    const bytes = lineMap[lineNum];
    const div = document.createElement("div");
    div.className = "bin-line";
    div.textContent = bytes ? bytes.map(b => fmtHex(b)).join(" ") : "";
    dom.binView.appendChild(div);
  });
}

function updateHighlighting() {
  let code = dom.editor.value;
  
  code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rules = [
    { regex: /;.*$/gm, cls: "hl-comment" },
    { regex: /\b[A-Z_][A-Z0-9_]*\s*:/gi, cls: "hl-label" },
    { regex: /\b(CLS|RET|HLTK|HLTP|HLTR|HIRES|LORES|WAITK|WAITR|WAITK_V0|JP|CALL|SE|SNE|LD|ADD|OR|AND|XOR|SUB|SUBN|SHR|SHL|RND|DRW|SKP|SKNP|DB|EQU)\b/gi, cls: "hl-mnemonic" },
    { regex: /\bV[0-9A-F]\b/gi, cls: "hl-reg" },
    { regex: /(0x[0-9A-F]+|%[01]+|\b\d+\b)/gi, cls: "hl-val" }
  ];

  const tokens = [];
  rules.forEach(({ regex, cls }, idx) => {
    let match;
    while ((match = regex.exec(code)) !== null) {
      tokens.push({ start: match.index, end: match.index + match[0].length, cls, priority: idx });
    }
  });

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  let result = "";
  let lastIdx = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.start < lastIdx) continue;
    
    result += code.slice(lastIdx, token.start);
    result += `<span class="${token.cls}">${code.slice(token.start, token.end)}</span>`;
    lastIdx = token.end;
  }
  result += code.slice(lastIdx);
  
  dom.highlightLayer.innerHTML = result + "\n";
}

function asmEditor() {
  const res = asm.assemble(dom.editor.value);
  bin = res.errors.length ? null : res.bytes;
  
  const lineNodes = dom.lines.querySelectorAll(".line-number");
  lineNodes.forEach(n => n.classList.remove("error"));

  if (res.errors.length) {
    const errText = res.errors.map(e => `[${e.code}] Line ${e.line}, Col ${e.col}: ${e.message}`).join("\n");
    dom.term.textContent = `Error:\n${errText}`;
    res.errors.forEach(err => {
      if (lineNodes[err.line - 1]) lineNodes[err.line - 1].classList.add("error");
    });
    return;
  }
  
  if (state.liveSync && bin) {
    chip.mem.set(bin, 0x200);
    sync();
  }

  const bStr = Array.from(res.bytes).map(b => fmtHex(b, 2)).join(" ");
  dom.term.textContent = `Live: ${res.bytes.length} bytes\n\n${bStr}`;
  renderSymbols(res.symbolLines, res.labels, res.constants);
  renderBinaryView(res.lineMap);
}

function printLog(msg = lastMsg) {
  dom.log.innerHTML = "";
  dom.log.textContent = `${msg}\n${"-".repeat(30)}\n`;

  chip.history.forEach((entry, idx) => {
    const line = document.createElement("div");
    line.className = "log-entry";
    line.textContent = `[${entry.cycle}] 0x${fmtHex(entry.pc, 4)} | 0x${fmtHex(entry.op, 4)} ${entry.desc}`;
    line.onclick = () => {
      showInspector(entry);
      if (chip.rewind(idx)) {
        dom.cycleVal.textContent = idx;
        sync();
      }
    };
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
  const isRunning = loop !== null;
  
  if (lastRenderState.pc !== chip.pc || lastRenderState.op !== chip.lastOp || lastRenderState.cycles !== chip.cycles || !isRunning) {
    renderStatus();
    lastRenderState.pc = chip.pc;
    lastRenderState.op = chip.lastOp;
    lastRenderState.cycles = chip.cycles;
  }

  const displayChecksum = chip.display.reduce((a, b) => a + b, 0);
  if (lastRenderState.displayChecksum !== displayChecksum) {
    renderScreen();
    lastRenderState.displayChecksum = displayChecksum;
  }

  if (lastRenderState.pc !== chip.pc || lastRenderState.memOff !== state.memOff || !isRunning) {
    renderMem();
    lastRenderState.pc = chip.pc;
    lastRenderState.memOff = state.memOff;
  }

  let regDirty = false;
  for (let i = 0; i < 16; i++) {
    if (lastRenderState.v[i] !== chip.v[i]) {
      regDirty = true;
      break;
    }
  }
  if (regDirty || lastRenderState.i !== chip.i || lastRenderState.pc !== chip.pc || !isRunning) {
    renderDebug();
    lastRenderState.v.set(chip.v);
    lastRenderState.i = chip.i;
    lastRenderState.pc = chip.pc;
  }

  let keyDirty = false;
  for (let i = 0; i < 16; i++) {
    if (lastRenderState.keys[i] !== chip.keys[i]) {
      keyDirty = true;
      break;
    }
  }
  if (keyDirty || !isRunning) {
    renderKeys();
    lastRenderState.keys.set(chip.keys);
  }

  if (lastRenderState.dt !== chip.delayTimer || lastRenderState.st !== chip.soundTimer) {
    dom.timers.dt.textContent = chip.delayTimer;
    dom.timers.st.textContent = chip.soundTimer;
    lastRenderState.dt = chip.delayTimer;
    lastRenderState.st = chip.soundTimer;
  }

  if (lastRenderState.stackLen !== chip.stack.length || !isRunning) {
    renderStack();
    lastRenderState.stackLen = chip.stack.length;
  }

  renderBPs();
  renderWatches();

  dom.scrubber.max = Math.max(0, chip.stateHistory.length - 1);
  if (!isRunning) {
    dom.scrubber.value = chip.stateHistory.length - 1;
    dom.cycleVal.textContent = dom.scrubber.value;
  }
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
  if (!dom.ctx) return;
  
  if (dom.screen.width !== chip.width * (PIXEL_SIZE + GRID_GAP) || dom.screen.height !== chip.height * (PIXEL_SIZE + GRID_GAP)) {
    dom.screen.width = chip.width * (PIXEL_SIZE + GRID_GAP);
    dom.screen.height = chip.height * (PIXEL_SIZE + GRID_GAP);
  }

  dom.ctx.clearRect(0, 0, dom.screen.width, dom.screen.height);
  dom.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--green').trim();

  for (let i = 0; i < chip.display.length; i++) {
    if (chip.display[i] === 1) {
      const x = (i % chip.width) * (PIXEL_SIZE + GRID_GAP);
      const y = Math.floor(i / chip.width) * (PIXEL_SIZE + GRID_GAP);
      dom.ctx.fillRect(x, y, PIXEL_SIZE, PIXEL_SIZE);
    }
  }
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
    
    if (state.heatmap) {
      const count = chip.accessMap[a];
      const alpha = Math.min(count / 100, 0.8);
      cells[i].style.backgroundColor = `rgba(255, 42, 22, ${alpha})`;
    } else {
      cells[i].style.backgroundColor = "";
    }

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
  chip.bps.forEach((cond, a) => {
    const c = document.createElement("span");
    c.className = "bp-chip";
    c.textContent = `${fmtHex(a, 4)} ${cond ? `(${cond})` : ""} ✕`;
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

  chip.memWatchpoints.forEach(addr => {
    const c = document.createElement("span");
    c.className = "bp-chip";
    c.textContent = `0x${fmtHex(addr, 3)} ✕`;
    c.onclick = () => { chip.memWatchpoints.delete(addr); sync(); };
    dom.watchList.appendChild(c);
  });
}

function renderStack() {
  dom.stackView.innerHTML = chip.stack.map((a, i) => `<div class="stack-item">${fmtHex(a, 4)}</div>`).join("");
}

setupImmediate();
boot();
