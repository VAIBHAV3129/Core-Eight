import { KEY_MAP, APP_DATA, ARCADE_ROMS } from './app-config.js';
import { Chip8 } from './module-chip8.js';
import { Assembler } from './module-assembler.js';
import * as uiLib from './app-ui.js';
import { bindEvents } from './app-events.js';

const chip8 = new Chip8();
const assembler = new Assembler();
let runLoop = null;
let lastLine = "Resetting VM...";
let currentProgramName = "Scratch ROM";
let assembledBytes = null;

const sampleAssembly = `START:
  CLS
  LD V0, 0x08
  LD V1, 0x06
  LD V2, 10
  LD I, SPRITE_CORE
  DRW V0, V1, 5
  ADD V0, 1
  SE V0, 0x10
  JP SKIP_RESET
  LD V0, 0x08
SKIP_RESET:
  LD DT, V2
  LD ST, V2
  DRW V0, V1, 5
  JP SKIP_RESET
SPRITE_CORE:
  DB 0xF0, 0x90, 0xF0, 0x90, 0x90`;

const appLogic = {
  sync() {
    uiLib.sync(chip8, currentProgramName, lastLine);
  },
  showPanel(id) { uiLib.showPanel(id); },
  updateLineNumbers() { uiLib.updateLineNumbers(); },
  printVm(label = lastLine) { uiLib.printVm(chip8, label); },
  
  resetVm() {
    this.pauseVm();
    chip8.reset();
    this.loadScratchProgram();
    currentProgramName = "Scratch ROM";
    lastLine = "Resetting VM...";
    this.sync();
  },
  
  loadScratchProgram() {
    const result = assembler.assemble(sampleAssembly);
    chip8.loadProgram(result.bytes);
    assembledBytes = result.bytes;
  },

  loadAssembledProgram() {
    if (!assembledBytes || assembledBytes.length === 0) this.assembleEditor();
    if (!assembledBytes || assembledBytes.length === 0) return;
    this.pauseVm();
    chip8.reset();
    chip8.loadProgram(assembledBytes);
    currentProgramName = "Assembler Output";
    lastLine = "Loaded assembled program";
    this.printVm();
    this.sync();
  },

  stepVm(verbose = true) {
    try {
      const decoded = chip8.cycle();
      if (decoded === "BREAKPOINT_HIT") {
        this.pauseVm();
        lastLine = `BREAKPOINT HIT at 0x${chip8.pc.toString(16).toUpperCase()}`;
      } else {
        lastLine = decoded === "waiting" ? "Waiting for key..." : `Executed 0x${chip8.lastOpcode.toString(16).toUpperCase()} ${decoded}`;
      }
    } catch (error) {
      this.pauseVm();
      lastLine = error.message;
    }
    if (verbose) this.printVm();
    this.sync();
  },

  runVm() {
    if (runLoop) return;
    runLoop = setInterval(() => {
      const cyclesPerFrame = Math.max(1, Math.floor(Number(uiLib.ui.speedSlider.value) / 60));
      for (let i = 0; i < cyclesPerFrame; i += 1) {
        if (this.stepVm(false) === "BREAKPOINT_HIT") break;
      }
      chip8.tickTimers();
      this.printVm("Running");
      this.sync();
    }, 1000 / 60);
  },

  pauseVm() {
    if (runLoop) clearInterval(runLoop);
    runLoop = null;
  },

  assembleEditor() {
    const result = assembler.assemble(uiLib.ui.asmEditor.value);
    assembledBytes = result.errors.length ? null : result.bytes;
    const bytes = Array.from(result.bytes).map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(" ");
    const labels = Object.entries(result.labels).map(([name, addr]) => `${name}: 0x${addr.toString(16).toUpperCase()}`).join("\n");
    if (result.errors.length) {
      uiLib.ui.asmTerminal.textContent = `Assembling...\n\n${result.errors.join("\n")}`;
      return;
    }
    uiLib.ui.asmTerminal.textContent = `Assembling...\nOK: ${result.bytes.length} bytes\n\n${labels || "No labels"}\n\n${bytes}`;
  },

  handleRegChange(regId, value) {
    const val = parseInt(value.replace("0x", ""), 16) || 0;
    if (regId.startsWith("V")) chip8.v[parseInt(regId.slice(1))] = val & 0xFF;
    else if (regId === "I") chip8.i = val & 0xFFF;
    else if (regId === "PC") chip8.pc = val & 0xFFF;
    else if (regId === "DT") chip8.delayTimer = val & 0xFF;
    else if (regId === "ST") chip8.soundTimer = val & 0xFF;
    this.sync();
  }
};


const savedCode = localStorage.getItem("core8_code");
uiLib.ui.asmEditor.value = savedCode || sampleAssembly;
uiLib.updateLineNumbers();

uiLib.buildCards(uiLib.ui.featureCards, APP_DATA.features);
uiLib.buildCards(uiLib.ui.gameGrid, APP_DATA.games, true, (title) => {
  const rom = ARCADE_ROMS[title];
  if (rom) {
    appLogic.pauseVm(); chip8.reset();
    chip8.loadProgram(new Uint8Array(rom));
    currentProgramName = title;
    lastLine = `Loaded Arcade ROM: ${title}`;
    appLogic.sync();
  }
});

uiLib.buildSettings();
uiLib.buildStaticGrids();
bindEvents(chip8, assembler, appLogic);


const originalRenderDebug = uiLib.renderDebug;
uiLib.renderDebug = (c8) => originalRenderDebug(c8, appLogic.handleRegChange);

appLogic.resetVm();
appLogic.assembleEditor();
uiLib.boot();
