export class Assembler {
  constructor(origin = 0x200) {
    this.origin = origin;
    this.symbols = {
      labels: {},
      constants: {}
    };
    this.rawConstants = {};
    this.errors = [];
    this.lines = [];
  }

  assemble(source) {
    this.symbols.labels = {};
    this.symbols.constants = {};
    this.rawConstants = {};
    this.errors = [];
    this.lines = this.clean(source);
    this.firstPass();
    const bytes = this.secondPass();
    return {
      bytes: Uint8Array.from(bytes),
      labels: this.symbols.labels,
      constants: this.symbols.constants,
      errors: this.errors
    };
  }

  clean(source) {
    return source.split("\n").map((raw, index) => {
      const text = raw.split(";")[0].trim();
      return { raw, text, line: index + 1 };
    }).filter((line) => line.text.length > 0);
  }

  firstPass() {
    let pc = this.origin;
    this.lines.forEach((line) => {
      const text = line.text;
      if (text.toUpperCase().includes(" EQU ")) {
        const parts = text.split(/\s+EQU\s+/i);
        const name = parts[0].trim().toUpperCase();
        const valStr = parts[1].trim();
        this.rawConstants[name] = valStr;
        this.resolveSymbol(name);
        return;
      }

      const body = this.takeLabel(line, pc);
      if (!body) return;

      if (body.toUpperCase().startsWith("DB ")) {
        pc += this.parseDb(body, line).length;
      } else {
        pc += 2;
      }
    });
  }

  resolveSymbol(name, visited = new Set()) {
    if (visited.has(name)) {
      this.errors.push(`Circular reference detected in constant: ${name}`);
      return 0;
    }

    if (this.symbols.constants[name] !== undefined) return this.symbols.constants[name];
    if (this.symbols.labels[name] !== undefined) return this.symbols.labels[name];

    const raw = this.rawConstants[name];
    if (raw === undefined) return undefined;

    visited.add(name);
    const value = this.evaluateRaw(raw, visited);
    this.symbols.constants[name] = value;
    return value;
  }

  evaluateRaw(raw, visited) {
    const k = raw.toUpperCase();
    if (this.symbols.labels[k] !== undefined) return this.symbols.labels[k];
    if (this.symbols.constants[k] !== undefined) return this.symbols.constants[k];
    if (this.rawConstants[k] !== undefined) return this.resolveSymbol(k, visited);
    
    if (/^0X[0-9A-F]+/i.test(raw)) return parseInt(raw, 16);
    if (/^\$[0-9A-F]+/i.test(raw)) return parseInt(raw.slice(1), 16);
    if (/^%[01]+$/i.test(raw)) return parseInt(raw.slice(1), 2);
    if (/^[0-9]+$/.test(raw)) return parseInt(raw, 10);

    return 0;
  }

  secondPass() {
    const out = [];
    let pc = this.origin;
    this.lines.forEach((line) => {
      const text = line.text;
      if (text.toUpperCase().includes(" EQU ")) return;

      const body = this.takeLabel(line, pc);
      if (!body) return;

      if (body.toUpperCase().startsWith("DB ")) {
        const bytes = this.parseDb(body, line);
        bytes.forEach((byte) => out.push(byte));
        pc += bytes.length;
        return;
      }

      const word = this.encode(body, line);
      if (word !== null) {
        out.push((word >> 8) & 0xFF, word & 0xFF);
        pc += 2;
      }
    });
    return out;
  }

  takeLabel(line, pc) {
    const colon = line.text.indexOf(":");
    if (colon === -1) return line.text;
    const label = line.text.slice(0, colon).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(label)) {
      this.errors.push(`Line ${line.line}: Invalid label name "${label}"`);
      return "";
    }
    this.symbols.labels[label.toUpperCase()] = pc;
    return line.text.slice(colon + 1).trim();
  }

  encode(text, line) {
    const parts = text.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const op = parts[0]?.toUpperCase();

    if (op === "CLS") return 0x00E0;
    if (op === "RET") return 0x00EE;
    if (op === "HLTK") return 0x00C0;
    if (op === "HLTP") return 0x00C2;
    if (op === "HLTR") return 0x00C4;
    if (op === "HIRES") return 0x00C6;
    if (op === "LORES") return 0x00C8;
    if (op === "WAITK") return 0x00CD;
    if (op === "WAITR") return 0x00CF;
    if (op === "WAITK_V0") return 0x00F0;

    if (op === "JP") {
      if (parts[1]?.toUpperCase() === "V0") return 0xB000 | this.addr(parts[2], line);
      return 0x1000 | this.addr(parts[1], line);
    }

    if (op === "CALL") return 0x2000 | this.addr(parts[1], line);
    if (op === "SE") return this.encodeSkip(parts, line, true);
    if (op === "SNE") return this.encodeSkip(parts, line, false);
    if (op === "LD") return this.encodeLd(parts, line);
    if (op === "ADD") return this.encodeAdd(parts, line);
    if (op === "OR") return 0x8001 | (this.reg(parts[1], line) << 8) | (this.reg(parts[2], line) << 4);
    if (op === "AND") return 0x8002 | (this.reg(parts[1], line) << 8) | (this.reg(parts[2], line) << 4);
    if (op === "XOR") return 0x8003 | (this.reg(parts[1], line) << 8) | (this.reg(parts[2], line) << 4);
    if (op === "SUB") return 0x8005 | (this.reg(parts[1], line) << 8) | (this.reg(parts[2], line) << 4);
    if (op === "SUBN") return 0x8007 | (this.reg(parts[1], line) << 8) | (this.reg(parts[2], line) << 4);
    
    if (op === "SHR") {
      const x = this.reg(parts[1], line);
      const y = this.isReg(parts[2]) ? this.reg(parts[2], line) : x;
      return 0x8006 | (x << 8) | (y << 4);
    }

    if (op === "SHL") {
      const x = this.reg(parts[1], line);
      const y = this.isReg(parts[2]) ? this.reg(parts[2], line) : x;
      return 0x800E | (x << 8) | (y << 4);
    }

    if (op === "RND") return 0xC000 | (this.reg(parts[1], line) << 8) | this.byte(parts[2], line);
    if (op === "DRW") {
      return 0xD000 | (this.reg(parts[1], line) << 8) | (this.reg(parts[2], line) << 4) | (this.num(parts[3], line) & 0xF);
    }

    if (op === "SKP") return 0xE09E | (this.reg(parts[1], line) << 8);
    if (op === "SKNP") return 0xE0A1 | (this.reg(parts[1], line) << 8);

    this.errors.push(`Line ${line.line}: Unknown instruction "${op}"`);
    return null;
  }

  encodeSkip(parts, line, equal) {
    const x = this.reg(parts[1], line);
    if (this.isReg(parts[2])) {
      const y = this.reg(parts[2], line);
      return (equal ? 0x5000 : 0x9000) | (x << 8) | (y << 4);
    }
    return (equal ? 0x3000 : 0x4000) | (x << 8) | this.byte(parts[2], line);
  }

  encodeLd(parts, line) {
    const a = parts[1]?.toUpperCase();
    const b = parts[2]?.toUpperCase();

    if (this.isReg(a) && this.isReg(b)) return 0x8000 | (this.reg(a, line) << 8) | (this.reg(b, line) << 4);
    if (this.isReg(a) && b === "DT") return 0xF007 | (this.reg(a, line) << 8);
    if (this.isReg(a) && b === "K") return 0xF00A | (this.reg(a, line) << 8);
    if (this.isReg(a) && b === "[I]") return 0xF065 | (this.reg(a, line) << 8);
    if (this.isReg(a)) return 0x6000 | (this.reg(a, line) << 8) | this.byte(parts[2], line);
    if (a === "I") return 0xA000 | this.addr(parts[2], line);
    if (a === "DT") return 0xF015 | (this.reg(parts[2], line) << 8);
    if (a === "ST") return 0xF018 | (this.reg(parts[2], line) << 8);
    if (a === "F") return 0xF029 | (this.reg(parts[2], line) << 8);
    if (a === "B") return 0xF033 | (this.reg(parts[2], line) << 8);
    if (a === "[I]") return 0xF055 | (this.reg(parts[2], line) << 8);

    this.errors.push(`Line ${line.line}: Invalid LD parameters`);
    return null;
  }

  encodeAdd(parts, line) {
    const a = parts[1]?.toUpperCase();
    if (a === "I") return 0xF01E | (this.reg(parts[2], line) << 8);
    const x = this.reg(parts[1], line);
    if (this.isReg(parts[2])) return 0x8004 | (x << 8) | (this.reg(parts[2], line) << 4);
    return 0x7000 | (x << 8) | this.byte(parts[2], line);
  }

  parseDb(text, line) {
    return text.slice(3).split(",").map((part) => this.byte(part.trim(), line));
  }

  isReg(val) {
    return /^V[0-9A-F]$/i.test(val || "");
  }

  reg(val, line) {
    if (!this.isReg(val)) {
      this.errors.push(`Line ${line.line}: Invalid register "${val}". Expected V0-VF`);
      return 0;
    }
    return parseInt(val.slice(1), 16);
  }

  byte(val, line) {
    const n = this.num(val, line);
    if (n < 0 || n > 0xFF) this.errors.push(`Line ${line.line}: Value ${val} out of 8-bit range (0-255)`);
    return n & 0xFF;
  }

  addr(val, line) {
    const n = this.num(val, line);
    if (n < 0 || n > 0xFFF) this.errors.push(`Line ${line.line}: Address ${val} out of 12-bit range (0-4095)`);
    return n & 0xFFF;
  }

  num(val, line) {
    if (!val) {
      this.errors.push(`Line ${line.line}: Missing value`);
      return 0;
    }
    const k = val.toUpperCase();
    if (this.symbols.labels[k] !== undefined) return this.symbols.labels[k];
    if (this.symbols.constants[k] !== undefined) return this.symbols.constants[k];
    if (this.rawConstants[k] !== undefined) return this.resolveSymbol(k);
    if (/^0X[0-9A-F]+/i.test(val)) return parseInt(val, 16);
    if (/^\$[0-9A-F]+/i.test(val)) return parseInt(val.slice(1), 16);
    if (/^%[01]+$/i.test(val)) return parseInt(val.slice(1), 2);
    if (/^[0-9]+$/.test(val)) return parseInt(val, 10);
    this.errors.push(`Line ${line.line}: Unknown numeric format "${val}"`);
    return 0;
  }
}
