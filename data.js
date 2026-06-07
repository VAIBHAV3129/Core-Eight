export const KEY_MAP = {
  "1": 0x1, "2": 0x2, "3": 0x3, "4": 0xC,
  q: 0x4, w: 0x5, e: 0x6, r: 0xD,
  a: 0x7, s: 0x8, d: 0x9, f: 0xE,
  z: 0xA, x: 0x0, c: 0xB, v: 0xF
};

export const KEYPAD_LABELS = ["1", "2", "3", "C", "4", "5", "6", "D", "7", "8", "9", "E", "A", "0", "B", "F"];

export const FONT_SET = [
  0xF0,0x90,0x90,0x90,0xF0, 0x20,0x60,0x20,0x20,0x70,
  0xF0,0x10,0xF0,0x80,0xF0, 0xF0,0x10,0xF0,0x10,0xF0,
  0x90,0x90,0xF0,0x10,0x10, 0xF0,0x80,0xF0,0x10,0xF0,
  0xF0,0x80,0xF0,0x90,0xF0, 0xF0,0x10,0x20,0x40,0x40,
  0xF0,0x90,0xF0,0x90,0xF0, 0xF0,0x90,0xF0,0x10,0xF0,
  0xF0,0x90,0xF0,0x90,0x90, 0xE0,0x90,0xE0,0x90,0xE0,
  0xF0,0x80,0x80,0x80,0xF0, 0xE0,0x90,0x90,0x90,0xE0,
  0xF0,0x80,0xF0,0x80,0xF0, 0xF0,0x80,0xF0,0x80,0x80
];

export const DEFAULT_ASM = `START:
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

export const FEATURE_DATA = [
  ["Assembler", "Simple assembly with labels and ROM export."],
  ["Debugger", "Edit registers, step opcodes, and set breakpoints."],
  ["Memory", "Live map of 4KB RAM with PC tracking."],
  ["Arcade", "Classic Chip-8 games in cabinet mode."]
];

export const GAME_DATA = [
  ["BRIX", "Paddle control and collision checks."],
  ["PONG", "Classic duel with screen refresh."],
  ["SPACE INVADERS", "Alien movement and projectiles."],
  ["MAZE RUNNER", "Grid navigation and memory tracing."],
  ["TETRIS", "Falling blocks for a small display."]
];

export const SETTINGS_DATA = [
  ["Theme", "Visual profile.", "theme", ["Amber Cathode", "Matrix Terminal", "Cyber-Whacker"]],
  ["Cursor", "Pointer style.", "cursor", ["Retro Hand", "Crosshair", "Pixel Pointer", "System Cursor"]],
  ["Mem Format", "Base for bytes.", "memoryFormat", ["Hexadecimal", "Decimal", "Binary"]],
  ["Reg Format", "Base for registers.", "registerFormat", ["Hexadecimal", "Decimal", "Binary"]]
];
```

### cpu.js
```javascript
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
