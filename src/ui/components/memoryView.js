export class MemoryView {
    constructor(cpu, app) {
        this.cpu = cpu;
        this.app = app;
        this.els = {
            grid: document.getElementById('memory-grid'),
            jumpIn: document.getElementById('mem-jump-input'),
            jumpBtn: document.getElementById('mem-jump-btn'),
            homeBtn: document.getElementById('mem-home-btn'),
            valIn: document.getElementById('mem-val-input'),
            writeBtn: document.getElementById('mem-write-btn')
        };
        this.offset = 0x200;
        this.selected = null;
        this.init();
    }

    init() {
        this.els.jumpBtn.onclick = () => {
            const a = parseInt(this.els.jumpIn.value, 16);
            if (!isNaN(a)) { this.offset = a & 0xFFFF; this.app.sync(); }
        };
        this.els.homeBtn.onclick = () => { this.offset = 0x200; this.app.sync(); };
        this.els.writeBtn.onclick = () => {
            const v = parseInt(this.els.valIn.value, 16);
            if (this.selected !== null && !isNaN(v)) {
                this.cpu.mem.write(this.selected, v);
                this.app.sync();
            }
        };
        this.createGrid();
    }

    createGrid() {
        this.els.grid.innerHTML = "";
        for (let i = 0; i < 256; i++) {
            const b = document.createElement("div");
            b.className = "byte";
            b.onclick = () => { this.selected = (this.offset + i) & 0xFFFF; this.app.sync(); };
            this.els.grid.appendChild(b);
        }
    }

    sync(fmt) {
        const cells = this.els.grid.children;
        for (let i = 0; i < cells.length; i++) {
            const a = (this.offset + i) & 0xFFFF;
            cells[i].textContent = this.app.valStr(this.cpu.mem.read(a), fmt);
            cells[i].className = "byte";
            if (a === this.cpu.pc) cells[i].classList.add("pc");
            if (a === this.cpu.pc - 2 || a === this.cpu.pc - 1) cells[i].classList.add("read");
            if (this.cpu.bps.has(a)) cells[i].classList.add("breakpoint");
            if (a === this.selected) cells[i].classList.add("selected");
        }
    }
}
