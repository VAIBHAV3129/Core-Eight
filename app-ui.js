import { APP_DATA, APP_STATE } from './app-config.js';
import { hex } from './module-chip8.js';

export const ui = {
  root: document.documentElement, body: document.body, loadNumber: document.querySelector(".load-number"),
  cursor: document.querySelector("#custom-cursor"), navButtons: document.querySelectorAll(".nav button"),
  panels: document.querySelectorAll(".panel"), brandButton: document.querySelector(".brand"),
  statusbar: document.querySelector("#statusbar"), featureCards: document.querySelector("#feature-cards"),
  gameGrid: document.querySelector("#game-grid"), settingsGrid: document.querySelector("#settings-grid"),
  speedSlider: document.querySelector("#speed-slider"), screen: document.querySelector("#screen-preview"),
  memoryGrid: document.querySelector("#memory-grid"), debugGrid: document.querySelector("#debug-grid"),
  keypadGrid: document.querySelector("#keypad-grid"), vmLog: document.querySelector("#vm-log"),
  asmEditor: document.querySelector("#asm-editor"), asmLines: document.querySelector("#asm-lines"),
  asmTerminal: document.querySelector("#asm-terminal"), timerPanels: { delay: document.querySelector("#dt-panel"), sound: document.querySelector("#st-panel") },
  buttons: {
    run: document.querySelector("#run-vm"), pause: document.querySelector("#pause-vm"), step: document.querySelector("#step-vm"),
    reset: document.querySelector("#reset-vm-main"), resetScratch: document.querySelector("#vm-reset"),
    assemble: document.querySelector("#assemble-code"), loadAssembled: document.querySelector("#load-assembled"),
    exportRom: document.querySelector("#export-rom"), importRom: document.querySelector("#import-rom"), addBp: document.querySelector("#add-bp")
  },
  bpInput: document.querySelector("#bp-input"), bpList: document.querySelector("#bp-list")
};

export function boot() {
  let progress = 0;
  const bootTimer = setInterval(() => {
    progress += 5;
    if (progress >= 100) { progress = 100; clearInterval(bootTimer); setTimeout(() => ui.body.classList.add("ready"), 250); }
    ui.root.style.setProperty("--load", `${progress}%`);
    ui.loadNumber.textContent = `${progress}%`;
  }, 100);
}

export function showPanel(panelId) {
  ui.navButtons.forEach((item) => item.classList.remove("active"));
  ui.panels.forEach((panel) => panel.classList.remove("active"));
  const button = document.querySelector(`.nav button[data-panel="${panelId}"]`);
  if (button) button.classList.add("active");
  document.getElementById(panelId).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function updateLineNumbers() {
  const count = ui.asmEditor.value.split("\n").length;
  ui.asmLines.innerHTML = Array.from({ length: count }, (_, i) => i + 1).join("<br>");
}

export function valueText(value, format, width = 2) {
  if (format === "Decimal") return String(value);
  if (format === "Binary") return value.toString(2).padStart(8, "0");
  return `0x${hex(value, width)}`;
}

export function printVm(chip8, label) {
  ui.vmLog.textContent = `${label}\n\nPC: 0x${hex(chip8.pc, 3)}\nI: 0x${hex(chip8.i, 3)}\nOpcode: 0x${hex(chip8.lastOpcode, 4)}\nDecoded: ${chip8.describe()}\nCycles: ${chip8.cycles}\nDT: ${chip8.delayTimer}\nST: ${chip8.soundTimer}\nStack depth: ${chip8.stack.length}\n\n` + Array.from(chip8.v).map((value, index) => `V${hex(index, 1)}: ${value}`).join("\n");
}

export function sync(chip8, currentProgramName, lastLine) {
  renderStatus(chip8, currentProgramName);
  renderScreen(chip8);
  renderMemory(chip8);
  renderDebug(chip8);
  renderKeypad(chip8);
  renderBreakpoints(chip8);
  ui.timerPanels.delay.textContent = chip8.delayTimer;
  ui.timerPanels.sound.textContent = chip8.soundTimer;
}

function renderStatus(chip8, currentProgramName) {
  const runLoop = document.querySelector('.nav button[data-panel="dashboard"]').classList.contains('active') && chip8.cycles > 0; // Simplified check
  const rows = [["Machine State", runLoop ? "Running" : "Paused"], ["Loaded ROM", currentProgramName], ["CPU Clock", `${ui.speedSlider.value} Hz`], ["PC", `0x${hex(chip8.pc, 3)}`], ["Opcode", `0x${hex(chip8.lastOpcode, 4)}`], ["Cycles", chip8.cycles], ["Delay Timer", chip8.delayTimer], ["Sound Timer", chip8.soundTimer]];
  ui.statusbar.innerHTML = rows.map(([label, value]) => `<div class="status-item"><span class="status-label">${label}</span><span class="status-value">${value}</span></div>`).join("");
}

function renderScreen(chip8) {
  const pixels = ui.screen.children;
  for (let i = 0; i < pixels.length; i += 1) pixels[i].classList.toggle("on", chip8.display[i] === 1);
}

function renderMemory(chip8) {
  const cells = ui.memoryGrid.children;
  for (let i = 0; i < cells.length; i += 1) {
    const address = 0x200 + i;
    const cell = cells[i];
    cell.textContent = valueText(chip8.memory[address], APP_STATE.memoryFormat);
    cell.className = "byte";
    if (address === chip8.pc) cell.classList.add("pc");
    if (address === chip8.pc - 2 || address === chip8.pc - 1) cell.classList.add("read");
    if (chip8.breakpoints.has(address)) cell.classList.add("breakpoint");
  }
}

export function renderDebug(chip8, handleRegChange) {
  const rows = [];
  for (let i = 0; i < 16; i += 1) rows.push({id: `V${i}`, val: chip8.v[i]});
  rows.push({id: "I", val: chip8.i}, {id: "PC", val: chip8.pc}, {id: "SP", val: chip8.stack.length}, {id: "DT", val: chip8.delayTimer}, {id: "ST", val: chip8.soundTimer}, {id: "CY", val: chip8.cycles});

  ui.debugGrid.innerHTML = rows.map(row => {
    const isReg = row.id.startsWith("V");
    const formatted = valueText(row.val, isReg ? APP_STATE.registerFormat : "Hexadecimal", row.id === "PC" || row.id === "I" ? 3 : 2);
    return `<div class="register"><span>${row.id}</span><input type="text" value="${formatted}" data-reg="${row.id}"></div>`;
  }).join("");

  ui.debugGrid.querySelectorAll("input").forEach(input => {
    input.onchange = (e) => handleRegChange(e.target.dataset.reg, e.target.value);
  });
}

function renderKeypad(chip8) {
  Array.from(ui.keypadGrid.children).forEach((button, index) => {
    button.classList.toggle("down", chip8.keys[index] === 1);
  });
}

function renderBreakpoints(chip8) {
  ui.bpList.innerHTML = "";
  chip8.breakpoints.forEach(addr => {
    const chip = document.createElement("span");
    chip.className = "bp-chip";
    chip.textContent = `0x${hex(addr, 3)} ✕`;
    chip.onclick = () => { chip8.breakpoints.delete(addr); sync(chip8, "...", "..."); };
    ui.bpList.appendChild(chip);
  });
}

export function buildCards(target, rows, withArt = false, onGameClick) {
  const template = document.querySelector("#card-template");
  target.innerHTML = "";
  rows.forEach(([title, text]) => {
    const node = template.content.cloneNode(true);
    node.querySelector("strong").textContent = title;
    node.querySelector("span").textContent = text;
    if (!withArt) node.querySelector(".game-art").remove();
    if (withArt) {
      node.querySelector(".card").onclick = () => onGameClick(title);
    }
    target.appendChild(node);
  });
}

export function buildSettings() {
  const template = document.querySelector("#setting-template");
  ui.settingsGrid.innerHTML = "";
  APP_DATA.settings.forEach(([label, help, key, options]) => {
    const node = template.content.cloneNode(true);
    const span = node.querySelector("span");
    const select = node.querySelector("select");
    span.innerHTML = `${label} <small>${help}</small>`;
    select.dataset.setting = key;
    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option; item.textContent = option;
      select.appendChild(item);
    });
    ui.settingsGrid.appendChild(node);
  });
  const pixel = document.createElement("label");
  pixel.className = "setting-row";
  pixel.innerHTML = `<span>Pixelated Effect <small>Large block grid.</small></span><input id="pixel-toggle" type="checkbox" checked>`;
  ui.settingsGrid.appendChild(pixel);
  const font = document.createElement("label");
  font.className = "setting-row";
  font.innerHTML = `<span>Editor Font <small>Text size.</small></span><input id="editor-size" type="range" min="13" max="20" value="15">`;
  ui.settingsGrid.appendChild(font);

  ui.settingsGrid.addEventListener("change", (event) => {
    const key = event.target.dataset.setting;
    if (!key) return;
    if (key === "theme") {
      const map = { "Amber Cathode": "amber", "Matrix Terminal": "matrix", "Cyber-Whacker": "cyber" };
      ui.body.dataset.theme = map[event.target.value];
    } else if (key === "cursor") {
      const map = { "Retro Hand": "hand", "Crosshair": "crosshair", "Pixel Pointer": "pixel", "System Cursor": "system" };
      ui.cursor.className = `custom-cursor ${map[event.target.value]}`;
      ui.body.classList.toggle("system-cursor", event.target.value === "System Cursor");
    } else if (key === "memoryFormat") APP_STATE.memoryFormat = event.target.value;
    else if (key === "registerFormat") APP_STATE.registerFormat = event.target.value;
  });
  ui.settingsGrid.querySelector("#pixel-toggle").addEventListener("change", (event) => ui.body.classList.toggle("pixelated", event.target.checked));
  ui.settingsGrid.querySelector("#editor-size").addEventListener("input", (event) => ui.root.style.setProperty("--editor-size", `${event.target.value}px`));
}

export function buildStaticGrids() {
  for (let i = 0; i < 64 * 32; i += 1) ui.screen.appendChild(document.createElement("i")).className = "screen-pixel";
  for (let i = 0; i < 96; i += 1) ui.memoryGrid.appendChild(document.createElement("span")).className = "byte";
}
