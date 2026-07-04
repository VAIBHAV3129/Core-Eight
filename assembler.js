export class Assembler {
  static ERR_CODES = {
    INVALID_LABEL: 'E001',
    UNKNOWN_OP: 'E002',
    INVALID_REG: 'E003',
    OUT_OF_RANGE: 'E004',
    MISSING_VAL: 'E005',
    INVALID_FMT: 'E006',
    CIRCULAR_REF: 'E007',
    MACRO_NOT_FOUND: 'E008',
    MACRO_UNCLOSED: 'E009',
    EXPR_ERROR: 'E010'
  };

  constructor(origin = 0x200) {
    this.origin = origin;
    this.symbols = {
      labels: {},
      constants: {}
    };
    this.symbolLines = {};
    this.rawConstants = {};
    this.macros = {};
    this.errors = [];
    this.lines = [];
  }

  assemble(source) {
    this.symbols.labels = {};
    this.symbols.constants = {};
    this.symbolLines = {};
    this.rawConstants = {};
    this.macros = {};
    this.errors = [];
    this.lines = this.clean(source);
    this.preprocess();
    this.firstPass();
    const result = this.secondPass();
    
    return {
      bytes: Uint8Array.from(result.flatBytes),
      lineMap: result.lineMap,
      labels: this.symbols.labels,
      constants: this.symbols.constants,
      symbolLines: this.symbolLines,
      errors: this.errors,
      symbolMap: this.generateSymbolMap()
    };
  }

  generateSymbolMap() {
    const addressMap = {};
    for (const [name, addr] of Object.entries(this.symbols.labels)) {
      addressMap[addr] = name;
    }
    return {
      labels: { ...this.symbols.labels },
      constants: { ...this.symbols.constants },
      addressMap
    };
  }

  addError(line, col, message, code) {
    this.errors.push({ line, col, message, code });
  }

  clean(source) {
    return source.split("\n").map((raw, index) => {
      const text = raw.split(";")[0].trim();
      return { raw, text, line: index + 1 };
    }).filter((line) => line.text.length > 0);
  }

  preprocess() {
    const expanded = [];
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const text = line.text;
      const upper = text.toUpperCase();

      if (upper.startsWith("MACRO ")) {
        const parts = text.split(/\s+/);
        const name = parts[1].toUpperCase();
        const args = parts.slice(2).map(a => a.replace(/,$/, "").toUpperCase());
        const body = [];
        let j = i + 1;

        while (j < this.lines.length && !this.lines[j].text.toUpperCase().startsWith("ENDMACRO")) {
          body.push(this.lines[j].text);
          j++;
        }

        if (j === this.lines.length) {
          this.addError(line.line, 1, `Macro ${name} not closed`, Assembler.ERR_CODES.MACRO_UNCLOSED);
        }

        this.macros[name] = { args, body };
        i = j;
        continue;
      }

      const firstWord = upper.split(/\s+/)[0];
      if (this.macros[firstWord]) {
        const macro = this.macros[firstWord];
        const callArgs = text.slice(firstWord.length).trim().split(/\s+|,/).filter(Boolean);
        
        macro.body.forEach(bodyLine => {
          let expandedLine = bodyLine;
          macro.args.forEach((arg, idx) => {
            const val = callArgs[idx] || "0";
            expandedLine = expandedLine.replace(new RegExp(`\\b${arg}\\b`, 'g'), val);
          });
          expanded.push({ raw: expandedLine, text: expandedLine, line: line.line });
        });
        continue;
      }

      expanded.push(line);
    }
    this.lines = expanded;
  }

  firstPass() {
    let pc = this.origin;
    this.lines.forEach((line) => {
      const text = line.text;
      if (text.toUpperCase().includes(" EQU ")) {
        const parts = text.split(/\s+EQU\s+/i);
        const name = parts[0].trim().toUpperCase();
        const valStr = parts[1].trim();
        const col = text.indexOf(valStr) + 1;
        this.rawConstants[name] = valStr;
        this.symbolLines[name] = line.line;
        this.resolveSymbol(name, line, col);
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

  resolveSymbol(name, line = null, col = 0, visited = new Set()) {
    if (visited.has(name)) {
      this.addError(line?.line || 0, col, `Circular reference: ${name}`, Assembler.ERR_CODES.CIRCULAR_REF);
      return 0;
    }

    if (this.symbols.constants[name] !== undefined) return this.symbols.constants[name];
    if (this.symbols.labels[name] !== undefined) return this.symbols.labels[name];

    const raw = this.rawConstants[name];
    if (raw === undefined) return undefined;

    visited.add(name);
    const value = this.evaluateRaw(raw, visited, line, col);
    this.symbols.constants[name] = value;
    return value;
  }

  evaluateRaw(raw, visited, line, col) {
    return this.evaluateExpression(raw, line, col, visited);
  }

  secondPass() {
    const flatBytes = [];
    const lineMap = {};
    let pc = this.origin;

    this.lines.forEach((line) => {
      const text = line.text;
      if (text.toUpperCase().includes(" EQU ")) return;

      const body = this.takeLabel(line, pc);
      if (!body) return;

      if (body.toUpperCase().startsWith("DB ")) {
        const bytes = this.parseDb(body, line);
        lineMap[line.line] = bytes;
        bytes.forEach((byte) => flatBytes.push(byte));
        pc += bytes.length;
        return;
      }

      const word = this.encode(body, line);
      if (word !== null) {
        const bytes = [(word >> 8) & 0xFF, word & 0xFF];
        lineMap[line.line] = bytes;
        flatBytes.push(...bytes);
        pc += 2;
      }
    });
    return { flatBytes, lineMap };
  }

  takeLabel(line, pc) {
    const colon = line.text.indexOf(":");
    if (colon === -1) return line.text;
    const label = line.text.slice(0, colon).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(label)) {
      this.addError(line.line, 1, `Invalid label: "${label}"`, Assembler.ERR_CODES.INVALID_LABEL);
      return "";
    }
    const upperLabel = label.toUpperCase();
    this.symbols.labels[upperLabel] = pc;
    this.symbolLines[upperLabel] = line.line;
    return line.text.slice(colon + 1).trim();
  }

  evaluateExpression(expr, line, col, visited = new Set()) {
    const terms = expr.match(/[+-]?\s*[^+-]+/g);
    if (!terms) return 0;

    let total = 0;
    terms.forEach(term => {
      const trimmed = term.trim();
      const isNegative = trimmed.startsWith('-');
      const valStr = isNegative ? trimmed.slice(1).trim() : trimmed;
      
      const value = this.num(valStr, line, visited);
      total += isNegative ? -value : value;
    });

    return total;
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

    this.addError(line.line, 1, `Unknown instruction "${op}"`, Assembler.ERR_CODES.UNKNOWN_OP);
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

    this.addError(line.line, 1, `Invalid LD parameters`, Assembler.ERR_CODES.INVALID_REG);
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
    const result = [];
    const parts = text.slice(3).split(",");

    parts.forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        const str = trimmed.slice(1, -1);
        for (let i = 0; i < str.length; i++) result.push(str.charCodeAt(i) & 0xFF);
      } else if (trimmed.includes('*')) {
        const [valStr, countStr] = trimmed.split('*').map(s => s.trim());
        const val = this.byte(valStr, line);
        const count = this.num(countStr, line);
        for (let i = 0; i < count; i++) result.push(val);
      } else {
        result.push(this.byte(trimmed, line));
      }
    });

    return result;
  }

  isReg(val) {
    return /^V[0-9A-F]$/i.test(val || "");
  }

  reg(val, line) {
    if (!this.isReg(val)) {
      const col = line.text.indexOf(val) + 1;
      this.addError(line.line, col, `Invalid register "${val}"`, Assembler.ERR_CODES.INVALID_REG);
      return 0;
    }
    return parseInt(val.slice(1), 16);
  }

  byte(val, line) {
    const n = this.num(val, line);
    if (n < 0 || n > 0xFF) {
      const col = line.text.indexOf(val) + 1;
      this.addError(line.line, col, `Value ${val} out of 8-bit range`, Assembler.ERR_CODES.OUT_OF_RANGE);
    }
    return n & 0xFF;
  }

  addr(val, line) {
    const n = this.num(val, line);
    if (n < 0 || n > 0xFFF) {
      const col = line.text.indexOf(val) + 1;
      this.addError(line.line, col, `Address ${val} out of 12-bit range`, Assembler.ERR_CODES.OUT_OF_RANGE);
    }
    return n & 0xFFF;
  }

  num(val, line, visited = new Set()) {
    if (!val) {
      this.addError(line.line, 1, `Missing value`, Assembler.ERR_CODES.MISSING_VAL);
      return 0;
    }

    if (val.includes('+') || val.includes('-')) {
      return this.evaluateExpression(val, line, 1, visited);
    }

    const k = val.toUpperCase();
    if (this.symbols.labels[k] !== undefined) return this.symbols.labels[k];
    if (this.symbols.constants[k] !== undefined) return this.symbols.constants[k];
    if (this.rawConstants[k] !== undefined) return this.resolveSymbol(k, line, 1, visited);
    if (/^0X[0-9A-F]+/i.test(val)) return parseInt(val, 16);
    if (/^\$[0-9A-F]+/i.test(val)) return parseInt(val.slice(1), 16);
    if (/^%[01]+$/i.test(val)) return parseInt(val.slice(1), 2);
    if (/^[0-9]+$/.test(val)) return parseInt(val, 10);
    
    const col = line.text.indexOf(val) + 1;
    this.addError(line.line, col, `Unknown numeric format "${val}"`, Assembler.ERR_CODES.INVALID_FMT);
    return 0;
  }
}

export class Disassembler {
  constructor() {
    this.fmtHex = (v, w = 2) => v.toString(16).toUpperCase().padStart(w, "0");
  }

  disassemble(bytes, start = 0x200) {
    const output = [];
    for (let pc = start; pc < bytes.length; pc += 2) {
      if (pc + 1 >= bytes.length) break;
      const op = (bytes[pc] << 8) | bytes[pc + 1];
      const decoded = this.decode(op);
      output.push(`${this.fmtHex(pc, 4)}: 0x${this.fmtHex(op, 4)} ${decoded}`);
    }
    return output.join("\n");
  }

  decode(op) {
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
    if (op === 0x00C6) return "HIRES";
    if (op === 0x00C8) return "LORES";
    if (op === 0x00CD) return "WAITK";
    if (op === 0x00CF) return "WAITR";
    if (op === 0x00F0) return "WAITK_V0";
    if (op === 0x00F2) return "LORES";
    if (op === 0x00F4) return "WAITR_V0";
    if (op === 0x00F6) return "WAITR_ANY";
    if (op === 0x00FD) return "RESOL_10x60";
    if (op === 0x00FE) return "RESOL_64x32";
    if (top === 0x1000) return `JP 0x${this.fmtHex(nnn, 3)}`;
    if (top === 0x2000) return `CALL 0x${this.fmtHex(nnn, 3)}`;
    if (top === 0x3000) return `SE V${x}, 0x${this.fmtHex(nn, 2)}`;
    if (top === 0x4000) return `SNE V${x}, 0x${this.fmtHex(nn, 2)}`;
    if ((op & 0xF00F) === 0x5000) return `SE V${x}, V${y}`;
    if (top === 0x6000) return `LD V${x}, 0x${this.fmtHex(nn, 2)}`;
    if (top === 0x7000) return `ADD V${x}, 0x${this.fmtHex(nn, 2)}`;
    if (top === 0x8000) {
      const aluOps = ["LD", "OR", "AND", "XOR", "ADD", "SUB", "SHR", "SUBN", "", "", "", "", "", "", "SHL"];
      return `${aluOps[n]} V${x}, V${y}`;
    }
    if ((op & 0xF00F) === 0x9000) return `SNE V${x}, V${y}`;
    if (top === 0xA000) return `LD I, 0x${this.fmtHex(nnn, 3)}`;
    if (top === 0xB000) return `JP V0, 0x${this.fmtHex(nnn, 3)}`;
    if (top === 0xC000) return `RND V${x}, 0x${this.fmtHex(nn, 2)}`;
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
    return `UNKNOWN_OP 0x${this.fmtHex(op, 4)}`;
  }
}
