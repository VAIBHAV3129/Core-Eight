import { KEYPAD_LABELS } from '../../data.js';

export class Debugger {
    constructor(cpu, app) {
        this.cpu = cpu;
        this.app = app;
        this.els = {
            grid: document.getElementById('debug-grid'),
            stack: document.getElementById('stack-view'),
            watchIn: document.getElementById('watch-input'),
            watchBtn: document.getElementById('add-watch'),
            watchList: document.getElementById('watch-list'),
            bpIn: document.getElementById('bp-input'),
            bpBtn: document.getElementById('add-bp'),
            bpList: document.getElementById('bp-list'),
            keyGrid: document.getElementById('keypad-grid')
        };
        this.init();
    }

    init() {
        this.els.watchBtn.onclick = () => {
            const v = this.els.watchIn.value.toUpperCase();
            if (v.startsWith("V") && v.length === 2) {
                this.cpu.watchpoints.add(parseInt(v.slice(1), 16));
                this.els.watchIn.value = "";
                this.app.sync();
            }
        };
        this.els.bpBtn.onclick = () => {
            const a = parseInt(this.els.bpIn.value, 16);
            if (!isNaN(a)) {
                this.cpu.bps.add(a);
                this.els.bpIn.value = "";
                this.app.sync();
            }
        };
        this.renderKeypad();
    }

    renderKeypad() {
        this.els.keyGrid.innerHTML = KEYPAD_LABELS.map(l => `<button type="button">${l}</button>`).join("");
    }

    sync(regFmt) {
        this.renderRegisters(regFmt);
        this.renderStack();
        this.renderWatches();
        this.renderBPs();
        this.updateKeypad();
    }

    renderRegisters(fmt) {
        const regs = [...this.cpu.v, this.cpu.i, this.cpu.pc, this.cpu.stack.length, this.cpu.delayTimer, this.cpu.soundTimer, this.cpu.cycles];
        const lbls = [...Array.from({length:16}, (_, i) => `V${i.toString(16).toUpperCase()}`), "I", "PC", "SP", "DT", "ST", "CY"];
        
        this.els.grid.innerHTML = lbls.map((l, i) => `
            <div class="register">
                <span>${l}</span>
                <input type="text" data-reg="${i}" value="${this.app.valStr(regs[i], fmt)}">
            </div>
        `).join("");

        this.els.grid.querySelectorAll("input").forEach(inp => {
            inp.onchange = (e) => this.updateReg(parseInt(e.target.dataset.reg), e.target.value);
        });
    }

    updateReg(idx, val) {
        let n = val.toLowerCase().startsWith("0x") ? parseInt(val.slice(2), 16) : parseInt(val, 10);
        if (isNaN(n)) return;
        if (idx < 16) this.cpu.v[idx] = n & 0xFF;
        else if (idx === 16) this.cpu.i = n & 0xFFFF;
        else if (idx === 17) this.cpu.pc = n & 0xFFFF;
        else if (idx === 19) this.cpu.delayTimer = n & 0xFF;
        else if (idx === 20) this.cpu.soundTimer = n & 0xFF;
        this.app.sync();
    }

    renderStack() {
        this.els.stack.innerHTML = this.cpu.stack.map(a => `<div class="stack-item">${a.toString(16).toUpperCase().padStart(4, '0')}</div>`).join("");
    }

    renderWatches() {
        this.els.watchList.innerHTML = "";
        this.cpu.watchpoints.forEach(idx => {
            const c = document.createElement("span");
            c.className = "bp-chip";
            c.textContent = `V${idx.toString(16).toUpperCase()} ✕`;
            c.onclick = () => { this.cpu.watchpoints.delete(idx); this.app.sync(); };
            this.els.watchList.appendChild(c);
        });
    }

    renderBPs() {
        this.els.bpList.innerHTML = "";
        this.cpu.bps.forEach(a => {
            const c = document.createElement("span");
            c.className = "bp-chip";
            c.textContent = `0x${a.toString(16).toUpperCase().padStart(4, '0')} ✕`;
            c.onclick = () => { this.cpu.bps.delete(a); this.app.sync(); };
            this.els.bpList.appendChild(c);
        });
    }

    updateKeypad() {
        Array.from(this.els.keyGrid.children).forEach((b, i) => b.classList.toggle("down", this.cpu.keys[i] === 1));
    }
}
