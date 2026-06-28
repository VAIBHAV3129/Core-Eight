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
  ["Reg Format", "Base for registers.", "registerFormat", ["Hexadecimal", "Decimal", "Binary"]],
  ["Pixelated Effect", "Toggle retro screen filter.", "pixelated", ["On", "Off"]],
  ["Shift Quirk", "SHR/SHL use Vy.", "shiftQuirk", ["Off", "On"]],
  ["IncI Quirk", "LD [I], Vx increments I.", "incIQuirk", ["Off", "On"]],
  ["Draw Wrap", "Pixels wrap around screen.", "drawWrapQuirk", ["On", "Off"]]
];

export const TEST_SUITE = [
  {
    name: "Addition V0+V1",
    bin: new Uint8Array([0x60, 0x0A, 0x61, 0x14, 0x80, 0x14]),
    cycles: 3,
    expected: { "V0": 30 }
  },
  {
    name: "ADD Overflow",
    bin: new Uint8Array([0x60, 0xFF, 0x61, 0x01, 0x80, 0x14]),
    cycles: 3,
    expected: { "V0": 0, "VF": 1 }
  },
  {
    name: "SUB Underflow",
    bin: new Uint8Array([0x60, 0x00, 0x61, 0x01, 0x80, 0x15]),
    cycles: 3,
    expected: { "V0": 255, "VF": 0 }
  },
  {
    name: "Jump to 0x300",
    bin: new Uint8Array([0x13, 0x00]),
    cycles: 1,
    expected: { "PC": 0x300 }
  },
  {
    name: "I-Register Load",
    bin: new Uint8Array([0xA4, 0x50]),
    cycles: 1,
    expected: { "I": 0x450 }
  },
  {
    name: "Draw Collision",
    bin: new Uint8Array([0x60, 0x00, 0x61, 0x00, 0xA0, 0x50, 0xD0, 0x01, 0xD0, 0x01]),
    cycles: 5,
    expected: { "VF": 1 }
  },
  {
    name: "SCHIP HIRES Switch",
    bin: new Uint8Array([0x00, 0xC6]),
    cycles: 1,
    expected: { "width": 128, "height": 64 }
  },
  {
    name: "SCHIP Wait-Key Halt",
    bin: new Uint8Array([0x00, 0xCD]),
    cycles: 1,
    expected: { "halted": true }
  }
];
