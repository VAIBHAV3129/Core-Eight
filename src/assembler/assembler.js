import { InstructionMap } from './instructions.js';

export class Assembler {
    constructor(origin = 0x200) {
        this.origin = origin;
    }

    assemble(source) {
        this.labels = {};
        this.errors = [];
        this.lines = this.clean(source);
        this.firstPass();
        const bytes = this.secondPass();
        return { bytes: Uint8Array.from(bytes), labels: this.labels, errors: this.errors };
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
            const body = this.takeLabel(line, pc);
            if (!body) return;
            if (body.toUpperCase().startsWith("DB ")) pc += this.parseDb(body, line).length;
            else pc += 2;
        });
    }

    secondPass() {
        const out = [];
        let pc = this.origin;
        this.lines.forEach((line) => {
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
        this.labels[label.toUpperCase()] = pc;
        return line.text.slice(colon + 1).trim();
    }

    encode(text, line) {
        const parts = text.replace(/,/g, " ").split(/\s+/).filter(Boolean);
        const op = parts[0]?.toUpperCase();
        if (InstructionMap[op]) return InstructionMap[op](this, parts, line);
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

    isReg(val) { return /^V[0-9A-F]$/i.test(val || ""); }
    reg(val, line) {
        if (!this.isReg(val)) { this.errors.push(`Line ${line.line}: Invalid register "${val}". Expected V0-VF`); return 0; }
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
        if (!val) { this.errors.push(`Line ${line.line}: Missing value`); return 0; }
        const k = val.toUpperCase();
        if (this.labels[k] !== undefined) return this.labels[k];
        if (/^0X[0-9A-F]+$/i.test(val)) return parseInt(val, 16);
        if (/^\$[0-9A-F]+$/i.test(val)) return parseInt(val.slice(1), 16);
        if (/^[0-9]+$/.test(val)) return parseInt(val, 10);
        this.errors.push(`Line ${line.line}: Unknown numeric format "${val}"`);
        return 0;
    }
}
