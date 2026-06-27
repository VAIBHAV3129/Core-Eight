import { FONT_SET } from './data.js';

export class Chip8 {
  constructor() {
    this.mem = new Uint8Array(65536);
    this.v = new Uint8Array(16);
    this.width = 64;
    this.height = 32;
    this.display = new Uint8Array(128 * 64);
    this.keys = new Uint8Array(16);
    this.stack = [];
    this.bps = new Set();
    this.watchpoints = new Set();
    this.prevV = new Uint8Array(16);
    this.waitingForKey = null;
    this.halted = false;
    this.quirks = { shiftUsesVy: false, incrementI: true, drawWraps: true };
    this.history = [];
    this.stateHistory = [];
    this.reset();
  }

  reset() {
    this.mem.fill(0);
    this.v.fill(0);
    this.width = 64;
    this.height = 32;
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
    this.halted = false;
    this.history = [];
    this.stateHistory = [];
    this.prevV.fill(0);
    this.mem.set(FONT_SET, 0x50);
  }

  setQuirk(key, value) {
    if (key === 'shiftQuirk') this.quirks.shiftUsesVy = (value === "On");
    if (key === 'incIQuirk') this.quirks.incrementI = (value === "On");
    if (key === 'drawWrapQuirk') this.quirks.drawWraps = (value === "On");
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
    if (this.halted) return "HALTED";
    if (this.waitingForKey !== null) return "waiting";
    if (this.bps.has(this.pc)) return "BREAKPOINT_HIT";

    this.snapshot();

    const op = this.fetch();
    const desc = this.describe(op);
    const pcBefore = this.pc;

    this.lastOp = op;
    this.pc = (this.pc + 2) & 0xFFFF;
    this.cycles += 1;
    this.exec(op);

    if (this.checkWatches()) return "WATCHPOINT_HIT";

    this.history.push({
      cycle: this.cycles,
      pc: pcBefore,
      op: op,
      desc: desc
    });

    if (this.history.length > 1000) this.history.shift();
    if (this.stateHistory.length > 1000) this.stateHistory.shift();

    return desc;
  }

  snapshot() {
    this.stateHistory.push({
      v: new Uint8Array(this.v),
      i: this.i,
      pc: this.pc,
      stack: [...this.stack],
      delayTimer: this.delayTimer,
      soundTimer: this.soundTimer,
      cycles: this.cycles
    });
  }

  rewind(cycleIndex) {
    if (cycleIndex < 0 || cycleIndex >= this.stateHistory.length) return false;
    
    const state = this.stateHistory[cycleIndex];
    this.v.set(state.v);
    this.i = state.i;
    this.pc = state.pc;
    this.stack = [...state.stack];
    this.delayTimer = state.delayTimer;
    this.soundTimer = state.soundTimer;
    this.cycles = state.cycles;
    
    return true;
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
    while (this.lastOp !== 0x00EE && limit < 65536) {
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
    else if (op === 0x00C0) { this.halted = true; }
    else if (op === 0x00C2) { this.halted = true; this.waitingForKey = 'PRESS'; }
    else if (op === 0x00C4) { this.halted = true; this.waitingForKey = 'RELEASE'; }
    else if (op === 0x00C6) { this.width = 128; this.height = 64; this.display.fill(0); }
    else if (op === 0x00C8 || op === 0x00F2) {
      if (this.width === 128) {
        const temp = new Uint8Array(64 * 32);
        for (let row = 0; row < 32; row++) {
          for (let col = 0; col < 64; col++) {
            const p1 = this.display[(row * 2) * 128 + (col * 2)];
            const p2 = this.display[(row * 2) * 128 + (col * 2 + 1)];
            const p3 = this.display[(row * 2 + 1) * 128 + (col * 2)];
            const p4 = this.display[(row * 2 + 1) * 128 + (col * 2 + 1)];
            temp[row * 64 + col] = p1 | p2 | p3 | p4;
          }
        }
        this.display.fill(0);
        this.display.set(temp);
      }
      this.width = 64;
      this.height = 32;
    }
    else if (op === 0x00CD) { this.halted = true; this.waitingForKey = 'ANY_PRESS'; }
    else if (op === 0x00CF) { this.halted = true; this.waitingForKey = 'ANY_RELEASE'; }
    else if (op === 0x00F0) { this.halted = true; this.waitingForKey = 'V0_BLOCK'; }
    else if (op === 0x00F4) { this.halted = true; this.waitingForKey = { type: 'SPECIFIC_RELEASE', key: this.v[0] }; }
    else if (op === 0x00F6) { this.halted = true; this.waitingForKey = 'ANY_RELEASE_SCHIP'; }
    else if (op === 0x00FD) { this.width = 10; this.height = 60; this.display.fill(0); }
    else if (op === 0x00FE) { this.width = 64; this.height = 32; this.display.fill(0); }
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
    else if ((op & 0xF000) === 0xB000) this.pc = (nnn + this.v[0]) & 0xFFFF;
    else if ((op & 0xF000) === 0xC000) this.v[x] = Math.floor(Math.random() * 256) & nn;
    else if ((op & 0xF000) === 0xD000) this.draw(x, y, n);
    else if ((op & 0xF0FF) === 0xE09E) { if (this.keys[this.v[x] & 0xF]) this.pc += 2; }
    else if ((op & 0xF0FF) === 0xE0A1) { if (!this.keys[this.v[x] & 0xF]) this.pc += 2; }
    else if ((op & 0xF0FF) === 0xF007) this.v[x] = this.delayTimer;
    else if ((op & 0xF0FF) === 0xF00A) this.waitingForKey = x;
    else if ((op & 0xF0FF) === 0xF015) this.delayTimer = this.v[x];
    else if ((op & 0xF0FF) === 0xF018) this.soundTimer = this.v[x];
    else if ((op & 0xF0FF) === 0xF01E) this.i = (this.i + this.v[x]) & 0xFFFF;
    else if ((op & 0xF0FF) === 0xF029) this.i = 0x50 + (this.v[x] & 0xF) * 5;
    else if ((op & 0xF0FF) === 0xF033) {
      const val = this.v[x];
      this.mem[this.i & 0xFFFF] = Math.floor(val / 100);
      this.mem[(this.i + 1) & 0xFFFF] = Math.floor((val % 100) / 10);
      this.mem[(this.i + 2) & 0xFFFF] = val % 10;
    } else if ((op & 0xF0FF) === 0xF055) {
      for (let idx = 0; idx <= x; idx++) this.mem[(this.i + idx) & 0xFFFF] = this.v[idx];
      if (this.quirks.incrementI) this.i = (this.i + x + 1) & 0xFFFF;
    } else if ((op & 0xF0FF) === 0xF065) {
      for (let idx = 0; idx <= x; idx++) this.v[idx] = this.mem[(this.i + idx) & 0xFFFF];
      if (this.quirks.incrementI) this.i = (this.i + x + 1) & 0xFFFF;
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
    const startX = this.v[xReg] % this.width;
    const startY = this.v[yReg] % this.height;
    this.v[0xF] = 0;
    for (let row = 0; row < height; row++) {
      const byte = this.mem[(this.i + row) & 0xFFFF];
      for (let bit = 0; bit < 8; bit++) {
        if ((byte & (0x80 >> bit)) === 0) continue;
        
        const x = this.quirks.drawWraps ? (startX + bit) % this.width : startX + bit;
        const y = this.quirks.drawWraps ? (startY + row) % this.height : startY + row;
        
        if (x >= this.width || y >= this.height) continue;

        const idx = y * this.width + x;
        if (this.display[idx]) this.v[0xF] = 1;
        this.display[idx] ^= 1;
      }
    }
  }

  setKey(key, pressed) {
    this.keys[key] = pressed ? 1 : 0;

    if (this.halted) {
      const wait = this.waitingForKey;
      if (wait === 'PRESS' && pressed) {
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait === 'RELEASE' && !pressed) {
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait === 'ANY_PRESS' && pressed) {
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait === 'ANY_RELEASE' && !this.keys.some(k => k === 1)) {
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait === 'V0_BLOCK' && pressed) {
        this.v[0] = key;
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait === 'ANY_RELEASE_SCHIP' && !this.keys.some(k => k === 1)) {
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait && typeof wait === 'object' && wait.type === 'SPECIFIC_RELEASE' && !pressed && key === wait.key) {
        this.halted = false;
        this.waitingForKey = null;
      } else if (wait === null && pressed) {
        this.halted = false;
      }
    }

    if (this.waitingForKey !== null && typeof this.waitingForKey !== 'object' && 
        !['PRESS', 'RELEASE', 'ANY_PRESS', 'ANY_RELEASE', 'ANY_RELEASE_SCHIP'].includes(this.waitingForKey)) {
      if (pressed) {
        this.v[this.waitingForKey] = key;
        this.waitingForKey = null;
      }
    }
  }

  tick() {
    if (this.delayTimer > 0) this.delayTimer -= 1;
    if (this.soundTimer > 0) this.soundTimer -= 1;
  }

  testRunner(testCase) {
    this.reset();
    this.load(testCase.bin);
    
    try {
      for (let i = 0; i < testCase.cycles; i++) {
        this.cycle();
      }
    } catch (e) {
      return { passed: false, failures: [`Execution Crash: ${e.message}`] };
    }
    
    const results = { passed: true, failures: [] };
    for (const [key, expected] of Object.entries(testCase.expected)) {
      let actual;
      if (key.startsWith('V')) actual = this.v[parseInt(key.slice(1), 16)];
      else if (key === 'PC') actual = this.pc;
      else if (key === 'I') actual = this.i;
      else if (key === 'width') actual = this.width;
      else if (key === 'height') actual = this.height;
      else if (key === 'halted') actual = this.halted;
      
      if (actual !== expected) {
        results.passed = false;
        results.failures.push(`${key}: Exp ${expected}, Got ${actual}`);
      }
    }
    return results;
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
    if (op === 0x00C0) return "HLT_K";
    if (op === 0x00C2) return "HLT_P";
    if (op === 0x00C4) return "HLT_R";
    if (op === 0x00C6) return "HIRES (128x64)";
    if (op === 0x00C8) return "LORES (64x32)";
    if (op === 0x00CD) return "WAITK";
    if (op === 0x00CF) return "WAITR";
    if (op === 0x00F0) return "WAITK_V0";
    if (op === 0x00F2) return "LORES (64x32)";
    if (op === 0x00F4) return "WAITR_V0";
    if (op === 0x00F6) return "WAITR_ANY";
    if (op === 0x00FD) return "RESOL (10x60)";
    if (op === 0x00FE) return "RESOL (64x32)";
    if (top === 0x1000) return `JP 0x${nnn.toString(16).toUpperCase().padStart(4, '0')}`;
    if (top === 0x2000) return `CALL 0x${nnn.toString(16).toUpperCase().padStart(4, '0')}`;
    if (top === 0x3000) return `SE V${x}, 0x${nn.toString(16).toUpperCase()}`;
    if (top === 0x4000) return `SNE V${x}, 0x${nn.toString(16).toUpperCase()}`;
    if ((op & 0xF00F) === 0x5000) return `SE V${x}, V${y}`;
    if (top === 0x6000) return `LD V${x}, 0x${nn.toString(16).toUpperCase()}`;
    if (top === 0x7000) return `ADD V${x}, 0x${nn.toString(16).toUpperCase()}`;
    if (top === 0x8000) return ["LD", "OR", "AND", "XOR", "ADD", "SUB", "SHR", "SUBN", "", "", "", "", "", "", "SHL"][n] + ` V${x}, V${y}`;
    if ((op & 0xF00F) === 0x9000) return `SNE V${x}, V${y}`;
    if (top === 0xA000) return `LD I, 0x${nnn.toString(16).toUpperCase().padStart(4, '0')}`;
    if (top === 0xB000) return `JP V0, 0x${nnn.toString(16).toUpperCase().padStart(4, '0')}`;
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
