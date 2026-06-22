export const OpCodes = {
    0x00E0: (cpu) => { cpu.renderer.clear(); },
    0x00EE: (cpu) => { cpu.pc = cpu.stack.pop() ?? 0x200; },
    0x00C0: (cpu) => { cpu.halted = true; },
    0x00C2: (cpu) => { cpu.halted = true; cpu.waitingForKey = 'PRESS'; },
    0x00C4: (cpu) => { cpu.halted = true; cpu.waitingForKey = 'RELEASE'; },
    0x00C6: (cpu) => { cpu.width = 128; cpu.height = 64; cpu.renderer.clear(); },
    0x00C8: (cpu) => { 
        if (cpu.width === 128) {
            const temp = new Uint8Array(64 * 32);
            for (let row = 0; row < 32; row++) {
                for (let col = 0; col < 64; col++) {
                    const p1 = cpu.display[(row * 2) * 128 + (col * 2)];
                    const p2 = cpu.display[(row * 2) * 128 + (col * 2 + 1)];
                    const p3 = cpu.display[(row * 2 + 1) * 128 + (col * 2)];
                    const p4 = cpu.display[(row * 2 + 1) * 128 + (col * 2 + 1)];
                    temp[row * 64 + col] = p1 | p2 | p3 | p4;
                }
            }
            cpu.display.fill(0);
            cpu.display.set(temp);
        }
        cpu.width = 64; cpu.height = 32; 
    },
    0x00CD: (cpu) => { cpu.halted = true; cpu.waitingForKey = 'ANY_PRESS'; },
    0x00CF: (cpu) => { cpu.halted = true; cpu.waitingForKey = 'ANY_RELEASE'; },
    0x00F0: (cpu) => { cpu.halted = true; cpu.waitingForKey = 'V0_BLOCK'; },
    0x00F4: (cpu) => { cpu.halted = true; cpu.waitingForKey = { type: 'SPECIFIC_RELEASE', key: cpu.v[0] }; },
    0x00F6: (cpu) => { cpu.halted = true; cpu.waitingForKey = 'ANY_RELEASE_SCHIP'; },
    0x00FD: (cpu) => { cpu.width = 10; cpu.height = 60; cpu.renderer.clear(); },
    0x00FE: (cpu) => { cpu.width = 64; cpu.height = 32; cpu.renderer.clear(); },
};
