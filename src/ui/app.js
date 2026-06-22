import { KEY_MAP, DEFAULT_ASM, FEATURE_DATA, GAME_DATA, SETTINGS_DATA, TEST_SUITE } from '../data.js';
import { Chip8 } from '../core/cpu.js';
import { Assembler } from '../assembler/assembler.js';
import { ScreenRenderer } from './renderer.js';
import { VMControls } from './components/controls.js';
import { Debugger } from './components/debugger.js';
import { MemoryView } from './components/memoryView.js';
import { Editor } from './components/editor.js';

class CoreEightApp {
    constructor() {
        this.renderer = new ScreenRenderer('screen-canvas');
        this.cpu = new Chip8(this.renderer);
        this.asm = new Assembler();
        
        this.state = {
            memFmt: "Hexadecimal",
            regFmt: "Hexadecimal",
            activePanel: 'dashboard'
        };

        this.loop = null;
        this.lastTime = 0;
        this.cycleRemainder = 0;

        this.controls = new VMControls(this.cpu, this);
        this.debugger = new Debugger(this.cpu, this);
        this.memView = new MemoryView(this.cpu, this);
        this.editor = new Editor(this.asm, this);

        this.init();
    }

    init() {
        this.boot();
        this.setupUI();
        this.renderStatic();
        this.loadScratch();
        this.sync();
    }

    boot() {
        const loadBar = document.querySelector('.load-bar');
        const loadNum = document.querySelector('.load-number');
        let progress = 0;
        const timer = setInterval(() => {
            progress += 5;
            if (progress >= 100) {
                clearInterval(timer);
                document.body.classList.add('ready');
            }
            loadBar.style.width = `${progress}%`;
            loadNum.textContent = `${progress}%`;
        }, 100);
    }

    setupUI() {
        document.querySelectorAll('.nav button').forEach(btn => {
            btn.onclick = () => this.switchPanel(btn.dataset.panel);
        });
        document.querySelector('.brand').onclick = () => this.switchPanel('dashboard');
        
        window.onkeydown = (e) => {
            const key = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
            if (key !== undefined) this.cpu.setKey(key, true);
            this.sync();
        };
        window.onkeyup = (e) => {
            const key = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
            if (key !== undefined) this.cpu.setKey(key, false);
            this.sync();
        };
    }

    switchPanel(id) {
        this.state.activePanel = id;
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        const btn = document.querySelector(`.nav button[data-panel="${id}"]`);
        if (btn) btn.classList.add('active');
    }

    renderStatic() {
        const featGrid = document.getElementById('feature-cards');
        const cardTmpl = document.getElementById('card-template');
        featGrid.innerHTML = "";
        FEATURE_DATA.forEach(([t, d]) => {
            const c = cardTmpl.content.cloneNode(true);
            c.querySelector('strong').textContent = t;
            c.querySelector('span').textContent = d;
            featGrid.appendChild(c);
        });

        const gameGrid = document.getElementById('game-grid');
        GAME_DATA.forEach(([t, d]) => {
            const c = cardTmpl.content.cloneNode(true);
            c.querySelector('strong').textContent = t;
            c.querySelector('span').textContent = d;
            gameGrid.appendChild(c);
        });

        const setGrid = document.getElementById('settings-grid');
        const setTmpl = document.getElementById('setting-template');
        SETTINGS_DATA.forEach(([n, d, k, opts]) => {
            const r = setTmpl.content.cloneNode(true);
            r.querySelector('span').innerHTML = `${n}<small>${d}</small>`;
            const sel = r.querySelector('select');
            sel.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join("");
            sel.onchange = (e) => this.applySetting(k, e.target.value);
            setGrid.appendChild(r);
        });
    }

    applySetting(key, val) {
        if (key === 'theme') {
            const m = { "Amber Cathode": "amber", "Matrix Terminal": "matrix", "Cyber-Whacker": "cyber" };
            document.body.dataset.theme = m[val];
        } else if (key === 'memoryFormat') this.state.memFmt = val;
        else if (key === 'registerFormat') this.state.regFmt = val;
        else if (key === 'pixelated') document.body.classList.toggle('pixelated', val === "On");
        else this.cpu.setQuirk(key, val);
        this.sync();
    }

    loadScratch() {
        const bytes = this.asm.assemble(DEFAULT_ASM);
        this.cpu.load(bytes);
    }

    loadAsm() {
        const bytes = this.editor.assemble();
        if (bytes) {
            this.pause();
            this.cpu.reset();
            this.cpu.load(bytes);
            this.sync();
        }
    }

    importRom(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            this.pause();
            this.cpu.reset();
            this.cpu.load(bytes);
            this.sync();
        };
        reader.readAsArrayBuffer(file);
    }

    run() {
        if (this.loop) return;
        const tick = (time) => {
            if (!this.lastTime) this.lastTime = time;
            const dt = (time - this.lastTime) / 1000;
            this.lastTime = time;
            const hz = this.controls.getSpeed();
            let cycles = hz * dt + this.cycleRemainder;
            const runCount = Math.floor(cycles);
            this.cycleRemainder = cycles - runCount;

            for (let i = 0; i < runCount; i++) {
                const res = this.step(false);
                if (res === "BREAKPOINT_HIT" || res === "WATCHPOINT_HIT") {
                    this.pause();
                    break;
                }
            }
            this.cpu.tick();
            this.sync();
            this.loop = requestAnimationFrame(tick);
        };
        this.lastTime = 0;
        this.cycleRemainder = 0;
        this.loop = requestAnimationFrame(tick);
    }

    pause() {
        if (this.loop) cancelAnimationFrame(this.loop);
        this.loop = null;
    }

    step(log = true) {
        try {
            const res = this.cpu.cycle();
            if (log) this.printLog(res);
            return res;
        } catch (e) {
            this.pause();
            this.printLog(e.message);
            return "ERROR";
        }
    }

    stepOver() {
        const res = this.cpu.stepOver();
        this.printLog(res);
        this.sync();
    }

    reset() {
        this.pause();
        this.cpu.reset();
        this.loadScratch();
        this.sync();
    }

    runSystemTests() {
        this.pause();
        let passed = 0;
        const results = TEST_SUITE.map(t => {
            const res = this.cpu.testRunner(t);
            if (res.passed) passed++;
            return `${t.name}: ${res.passed ? "PASS" : "FAIL " + res.failures.join(", ")}`;
        });
        this.printLog(`Tests: ${passed}/${TEST_SUITE.length} Passed`);
        results.forEach(l => {
            const d = document.createElement("div");
            d.className = "log-entry";
            d.textContent = l;
            document.getElementById('vm-log').appendChild(d);
        });
        this.sync();
    }

    printLog(msg) {
        const log = document.getElementById('vm-log');
        log.innerHTML = "";
        this.cpu.history.forEach(e => {
            const d = document.createElement("div");
            d.className = "log-entry";
            d.textContent = `[${e.cycle}] 0x${e.pc.toString(16).toUpperCase()} | 0x${e.op.toString(16).toUpperCase()} ${e.desc}`;
            log.appendChild(d);
        });
        log.scrollTop = log.scrollHeight;
    }

    valStr(v, fmt, w = 2) {
        if (fmt === "Decimal") return String(v);
        if (fmt === "Binary") return v.toString(2).padStart(8, "0");
        return `0x${v.toString(16).toUpperCase().padStart(w, '0')}`;
    }

    sync() {
        const status = document.getElementById('statusbar');
        status.innerHTML = [
            ["State", this.loop ? "Running" : "Paused"],
            ["PC", `0x${this.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`],
            ["Op", `0x${this.cpu.lastOp.toString(16).toUpperCase().padStart(4, '0')}`],
            ["Clock", `${this.controls.getSpeed()} Hz`]
        ].map(([l, v]) => `<div class="status-item"><span class="status-label">${l}</span><span class="status-value">${v}</span></div>`).join("");

        this.renderer.draw(this.cpu.display, this.cpu.width, this.cpu.height);
        this.controls.updateTimers();
        this.debugger.sync(this.state.regFmt);
        this.memView.sync(this.state.memFmt);
    }
}

new CoreEightApp();
