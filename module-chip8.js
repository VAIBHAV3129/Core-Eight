
export function hex(value, width) { 
  return value.toString(16).toUpperCase().padStart(width, "0"); 
}

export class Chip8 {
  constructor() {
    this.memory = new Uint8Array(4096);
    this.v = new Uint8Array(16);
    this.display = new Uint8Array(64 * 32);
    this.keys = new Uint8Array(16);
    this.stack = [];
    this.breakpoints = new Set();
    this.waitingForKey = null;
    this.quirks = { shiftUsesVy: false, incrementI: true };
    this.reset();
  }

  reset() {
    this.memory.fill(0); this.v.fill(0); this.display.fill(0); this.keys.fill(0);
    this.stack = []; this.i = 0; this.pc = 0x200; this.delayTimer = 0; this.soundTimer = 0;
    this.cycles = 0; this.lastOpcode = 0; this.waitingForKey = null;
    this.loadFont();
  }

  loadFont() {
    const font = [0xF0,0x90,0x90,0x90,0xF0, 0x20,0x60,0x20,0x20,0x70, 0xF0,0x10,0xF0,0x80,0xF0, 0xF0,0x10,0xF0,0x10,0xF0, 0x90,0x90,0xF0,0x10,0x10, 0xF0,0x80,0xF0,0x10,0xF0, 0xF0,0x80,0xF0,0x90,0xF0, 0xF0,0x10,0x20,0x40,0x40, 0xF0,0x90,0xF0,0x90,0xF0, 0xF0,0x90,0xF0,0x10,0xF0, 0xF0,0x90,0xF0,0x90,0x90, 0xE0,0x90,0xE0,0x90,0xE0, 0xF0,0x80,0x80,0x80,0xF0, 0xE0,0x90,0x90,0x90,0xE0, 0xF0,0x80,0xF0,0x80,0xF0, 0xF0,0x80,0xF0,0x80,0x80];
    this.memory.set(font, 0x50);
  }

  loadProgram(bytes, start = 0x200) {
    this.memory.fill(0, start, start + bytes.length);
    this.memory.set(bytes, start);
    this.pc = start;
  }

  fetch() { return (this.memory[this.pc] << 8) | this.memory[this.pc + 1]; }

  cycle() {
    if (this.waitingForKey !== null) return "waiting";
    if (this.breakpoints.has(this.pc)) return "BREAKPOINT_HIT";
    const opcode = this.fetch();
    this.lastOpcode = opcode;
    this.pc = (this.pc + 2) & 0xFFF;
    this.cycles += 1;
    this.execute(opcode);
    return this.describe(opcode);
  }

  execute(opcode) {
    const x = (opcode & 0x0F00) >> 8; const y = (opcode & 0x00F0) >> 4; const n = opcode & 0x000F;
    const nn = opcode & 0x00FF; const nnn = opcode & 0x0FFF;
    if (opcode === 0x00E0) this.display.fill(0);
    else if (opcode === 0x00EE) this.pc = this.stack.pop() ?? 0x200;
    else if ((opcode & 0xF000) === 0x1000) this.pc = nnn;
    else if ((opcode & 0xF000) === 0x2000) { this.stack.push(this.pc); this.pc = nnn; }
    else if ((opcode & 0xF000) === 0x3000) { if (this.v[x] === nn) this.pc += 2; }
    else if ((opcode & 0xF000) === 0x4000) { if (this.v[x] !== nn) this.pc += 2; }
    else if ((opcode & 0xF00F) === 0x5000) { if (this.v[x] === this.v[y]) this.pc += 2; }
    else if ((opcode & 0xF000) === 0x6000) this.v[x] = nn;
    else if ((opcode & 0xF000) === 0x7000) this.v[x] = (this.v[x] + nn) & 0xFF;
    else if ((opcode & 0xF000) === 0x8000) this.alu(x, y, n);
    else if ((opcode & 0xF00F) === 0x9000) { if (this.v[x] !== this.v[y]) this.pc += 2; }
    else if ((opcode & 0xF000) === 0xA000) this.i = nnn;
    else if ((opcode & 0xF000) === 0xB000) this.pc = (nnn + this.v[0]) & 0xFFF;
    else if ((opcode & 0xF000) === 0xC000) this.v[x] = Math.floor(Math.random() * 256) & nn;
    else if ((opcode & 0xF000) === 0xD000) this.draw(x, y, n);
    else if ((opcode & 0xF0FF) === 0xE09E) { if (this.keys[this.v[x] & 0xF]) this.pc += 2; }
    else if ((opcode & 0xF0FF) === 0xE0A1) { if (!this.keys[this.v[x] & 0xF]) this.pc += 2; }
    else if ((opcode & 0xF0FF) === 0xF007) this.v[x] = this.delayTimer;
    else if ((opcode & 0xF0FF) === 0xF00A) this.waitingForKey = x;
    else if ((opcode & 0xF0FF) === 0xF015) this.delayTimer = this.v[x];
    else if ((opcode & 0xF0FF) === 0xF018) this.soundTimer = this.v[x];
    else if ((opcode & 0xF0FF) === 0xF01E) this.i = (this.i + this.v[x]) & 0xFFF;
    else if ((opcode & 0xF0FF) === 0xF029) this.i = 0x50 + (this.v[x] & 0xF) * 5;
    else if ((opcode & 0xF0FF) === 0xF033) {
      const value = this.v[x];
      this.memory[this.i] = Math.floor(value / 100);
      this.memory[this.i + 1] = Math.floor((value % 100) / 10);
      this.memory[this.i + 2] = value % 10;
    } else if ((opcode & 0xF0FF) === 0xF055) {
      for (let idx = 0; idx <= x; idx += 1) this.memory[this.i + idx] = this.v[idx];
      if (this.quirks.incrementI) this.i = (this.i + x + 1) & 0xFFF;
    } else if ((opcode & 0xF0FF) === 0xF065) {
      for (let idx = 0; idx <= x; idx += 1) this.v[idx] = this.memory[this.i + idx];
      if (this.quirks.incrementI) this.i = (this.i + x + 1) & 0xFFF;
    }
  }

  alu(x, y, mode) {
    if (mode === 0x0) this.v[x] = this.v[y];
    else if (mode === 0x1) this.v[x] |= this.v[y];
    else if (mode === 0x2) this.v[x] &= this.v[y];
    else if (mode === 0x3) this.v[x] ^= this.v[y];
    else if (mode === 0x4) { const sum = this.v[x] + this.v[y]; this.v[0xF] = sum > 0xFF ? 1 : 0; this.v[x] = sum & 0xFF; }
    else if (mode === 0x5) { this.v[0xF] = this.v[x] >= this.v[y] ? 1 : 0; this.v[x] = (this.v[x] - this.v[y]) & 0xFF; }
    else if (mode === 0x6) { if (this.quirks.shiftUsesVy) this.v[x] = this.v[y]; this.v[0xF] = this.v[x] & 1; this.v[x] >>= 1; }
    else if (mode === 0x7) { this.v[0xF] = this.v[y] >= this.v[x] ? 1 : 0; this.v[x] = (this.v[y] - this.v[x]) & 0xFF; }
    else if (mode === 0xE) { if (this.quirks.shiftUsesVy) this.v[x] = this.v[y]; this.v[0xF] = (this.v[x] & 0x80) ? 1 : 0; this.v[x] = (this.v[x] << 1) & 0xFF; }
  }

  draw(xReg, yReg, height) {
    const startX = this.v[xReg] % 64; const startY = this.v[yReg] % 32; this.v[0xF] = 0;
    for (let row = 0; row < height; row += 1) {
      const spriteByte = this.memory[this.i + row];
      for (let bit = 0; bit < 8; bit += 1) {
        if ((spriteByte & (0x80 >> bit)) === 0) continue;
        const x = (startX + bit) % 64; const y = (startY + row) % 32;
        const index = y * 64 + x;
        if (this.display[index]) this.v[0xF] = 1;
        this.display[index] ^= 1;
      }
    }
  }

  setKey(key, pressed) {
    this.keys[key] = pressed ? 1 : 0;
    if (pressed && this.waitingForKey !== null) { this.v[this.waitingForKey] = key; this.waitingForKey = null; }
  }

  tickTimers() { if (this.delayTimer > 0) this.delayTimer -= 1; if (this.soundTimer > 0) this.soundTimer -= 1; }

  describe(opcode = this.lastOpcode) {
    const x = (opcode & 0x0F00) >> 8; const y = (opcode & 0x00F0) >> 4; const n = opcode & 0x000F;
    const nn = opcode & 0x00FF; const nnn = opcode & 0x0FFF; const top = opcode & 0xF000;
    if (opcode === 0x00E0) return "CLS"; if (opcode === 0x00EE) return "RET";
    if (top === 0x1000) return `JP 0x${hex(nnn, 3)}`; if (top === 0x2000) return `CALL 0x${hex(nnn, 3)}`;
    if (top === 0x3000) return `SE V${hex(x, 1)}, 0x${hex(nn, 2)}`; if (top === 0x4000) return `SNE V${hex(x, 1)}, 0x${hex(nn, 2)}`;
    if ((opcode & 0xF00F) === 0x5000) return `SE V${hex(x, 1)}, V${hex(y, 1)}`; if (top === 0x6000) return `LD V${hex(x, 1)}, 0x${hex(nn, 2)}`;
    if (top === 0x7000) return `ADD V${hex(x, 1)}, 0x${hex(nn, 2)}`; if (top === 0x8000) return ["LD", "OR", "AND", "X la a a a xor", "ADD", "SUB", "SHR", "SUBN", "", "", "", "", "", "", "SHL"][n] + ` V${hex(x, 1)}, V${hex(y, 1)}`;
    if ((opcode & 0xF00F) === 0x9000) return `SNE V${hex(x, 1)}, V${hex(y, 1)}`; if (top === 0xA000) return `LD I, 0x${hex(nnn, 3)}`;
    if (top === 0xB000) return `JP V0, 0x${hex(nnn, 3)}`; if (top === 0xC000) return `RND V${hex(x, 1)}, 0x${hex(nn, 2)}`;
    if (top === 0xD000) return `DRW V${hex(x, 1)}, V${hex(y, 1)}, ${n}`; if ((opcode & 0xF0FF) === 0xE09E) return `SKP V${hex(x, 1)}`;
    if ((opcode & 0xF0FF) === 0xE0A1) return `SKNP V${hex(x, 1)}`; if ((opcode & 0xF0FF) === 0xF007) return `LD V${hex(x, 1)}, DT`;
    if ((opcode & 0xF0FF) === 0xF00A) return `LD V${hex(x, 1)}, K`; if ((opcode & 0xF0FF) === 0xF015) return `LD DT, V${hex(x, 1)}`;
    if ((opcode & 0xF0FF) === 0xF018) return `LD ST, V${hex(x, 1)}`; if ((opcode & 0xF0FF) === 0xF01E) return `ADD I, V${hex(x, 1)}`;
    if ((opcode & 0xF0FF) === 0xF029) return `LD F, V${hex(x, 1)}`; if ((opcode & 0xF0FF) === 0xF033) return `LD B, V${hex(x, 1)}`;
    if ((opcode & 0xF0FF) === 0xF055) return `LD [I], V${hex(x, 1)}`; if ((opcode & 0xF0FF) === 0xF065) return `LD V${hex(x, 1)}, [I]`;
    return `0x${hex(opcode, 4)}`;
  }
}
