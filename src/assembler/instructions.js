export const InstructionMap = {
    "CLS": (asm) => 0x00E0,
    "RET": (asm) => 0x00EE,
    "HLTK": (asm) => 0x00C0,
    "HLTP": (asm) => 0x00C2,
    "HLTR": (asm) => 0x00C4,
    "HIRES": (asm) => 0x00C6,
    "LORES": (asm) => 0x00C8,
    "WAITK": (asm) => 0x00CD,
    "WAITR": (asm) => 0x00CF,
    "WAITK_V0": (asm) => 0x00F0,
    "JP": (asm, parts, line) => {
        if (parts[1]?.toUpperCase() === "V0") return 0xB000 | asm.addr(parts[2], line);
        return 0x1000 | asm.addr(parts[1], line);
    },
    "CALL": (asm, parts, line) => 0x2000 | asm.addr(parts[1], line),
    "SE": (asm, parts, line) => asm.encodeSkip(parts, line, true),
    "SNE": (asm, parts, line) => asm.encodeSkip(parts, line, false),
    "LD": (asm, parts, line) => asm.encodeLd(parts, line),
    "ADD": (asm, parts, line) => asm.encodeAdd(parts, line),
    "OR": (asm, parts, line) => 0x8001 | (asm.reg(parts[1], line) << 8) | (asm.reg(parts[2], line) << 4),
    "AND": (asm, parts, line) => 0x8002 | (asm.reg(parts[1], line) << 8) | (asm.reg(parts[2], line) << 4),
    "XOR": (asm, parts, line) => 0x8003 | (asm.reg(parts[1], line) << 8) | (asm.reg(parts[2], line) << 4),
    "SUB": (asm, parts, line) => 0x8005 | (asm.reg(parts[1], line) << 8) | (asm.reg(parts[2], line) << 4),
    "SUBN": (asm, parts, line) => 0x8007 | (asm.reg(parts[1], line) << 8) | (asm.reg(parts[2], line) << 4),
    "SHR": (asm, parts, line) => {
        const x = asm.reg(parts[1], line);
        const y = asm.isReg(parts[2]) ? asm.reg(parts[2], line) : x;
        return 0x8006 | (x << 8) | (y << 4);
    },
    "SHL": (asm, parts, line) => {
        const x = asm.reg(parts[1], line);
        const y = asm.isReg(parts[2]) ? asm.reg(parts[2], line) : x;
        return 0x800E | (x << 8) | (y << 4);
    },
    "RND": (asm, parts, line) => 0xC000 | (asm.reg(parts[1], line) << 8) | asm.byte(parts[2], line),
    "DRW": (asm, parts, line) => 0xD000 | (asm.reg(parts[1], line) << 8) | (asm.reg(parts[2], line) << 4) | (asm.num(parts[3], line) & 0xF),
    "SKP": (asm, parts, line) => 0xE09E | (asm.reg(parts[1], line) << 8),
    "SKNP": (asm, parts, line) => 0xE0A1 | (asm.reg(parts[1], line) << 8),
};
