export class VMControls {
    constructor(cpu, app) {
        this.cpu = cpu;
        this.app = app;
        this.els = {
            run: document.getElementById('run-vm'),
            pause: document.getElementById('pause-vm'),
            step: document.getElementById('step-vm'),
            stepOver: document.getElementById('step-over-vm'),
            reset: document.getElementById('reset-vm-main'),
            test: document.getElementById('test-vm'),
            speed: document.getElementById('speed-slider'),
            dt: document.getElementById('dt-panel'),
            st: document.getElementById('st-panel'),
            logClear: document.getElementById('log-clear')
        };
        this.init();
    }

    init() {
        this.els.run.onclick = () => this.app.run();
        this.els.pause.onclick = () => this.app.pause();
        this.els.step.onclick = () => this.app.step(true);
        this.els.stepOver.onclick = () => this.app.stepOver();
        this.els.reset.onclick = () => this.app.reset();
        this.els.test.onclick = () => this.app.runSystemTests();
        this.els.logClear.onclick = () => { this.cpu.history = []; this.app.sync(); };
    }

    updateTimers() {
        this.els.dt.textContent = this.cpu.delayTimer;
        this.els.st.textContent = this.cpu.soundTimer;
    }

    getSpeed() {
        return Number(this.els.speed.value);
    }
}
