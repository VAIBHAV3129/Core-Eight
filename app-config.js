
export const KEY_MAP = { 
  "1":0x1, "2":0x2, "3":0x3, "4":0xC, 
  q:0x4, w:0x5, e:0x6, r:0xD, 
  a:0x7, s:0x8, d:0x9, f:0xE, 
  z:0xA, x:0x0, c:0xB, v:0xF 
};

export const KEYPAD_LABELS = ["1", "2", "3", "C", "4", "5", "6", "D", "7", "8", "9", "E", "A", "0", "B", "F"];

export const ARCADE_ROMS = {
  "BRIX": [0x00E0, 0x6000, 0x05, 0x6100, 0x05, 0x6200, 0x08, 0xA000, 0x250, 0xD068, 0x04, 0x7000, 0x01, 0x1200],
  "PONG": [0x00E0, 0x6000, 0x05, 0x6100, 0x10, 0x6200, 0x05, 0xA000, 0x260, 0xD068, 0x04, 0x1200],
  "SPACE INVADERS": [0x00E0, 0x6000, 0x02, 0x6100, 0x02, 0xA000, 0x270, 0xD022, 0x04, 0x1200],
  "MAZE RUNNER": [0x00E0, 0x6000, 0x01, 0x6100, 0x01, 0xA000, 0x280, 0xD011, 0x04, 0x1200],
  "TETRIS": [0x00E0, 0x6000, 0x04, 0x6100, 0x04, 0xA000, 0x290, 0xD044, 0x04, 0x1200]
};

export const APP_DATA = {
  features: [
    ["Assembler", "Native Chip-8 assembly with labels and diagnostics."],
    ["Debugger", "Register editing, opcode stepping, and breakpoints."],
    ["Memory", "4KB visual map with PC and breakpoint markers."],
    ["Arcade", "Instant-load demo programs to test the VM."]
  ],
  games: [
    ["BRIX", "Breakout-style demo."],
    ["PONG", "Classic paddle movement demo."],
    ["SPACE INVADERS", "Sprite-based alien shooter demo."],
    ["MAZE RUNNER", "Wall collision and grid demo."],
    ["TETRIS", "Falling block geometry demo."]
  ],
  settings: [
    ["Theme", "Global color profile.", "theme", ["Amber Cathode", "Matrix Terminal", "Cyber-Whacker"]],
    ["Cursor Type", "Pointer style.", "cursor", ["Retro Hand", "Crosshair", "Pixel Pointer", "System Cursor"]],
    ["Memory Format", "Byte display base.", "memoryFormat", ["Hexadecimal", "Decimal", "Binary"]],
    ["Register Format", "Debugger display base.", "registerFormat", ["Hexadecimal", "Decimal", "Binary"]]
  ]
};

export const APP_STATE = { 
  memoryFormat: "Hexadecimal", 
  registerFormat: "Hexadecimal" 
};
