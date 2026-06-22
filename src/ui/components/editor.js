export class Editor {
    constructor(asm, app) {
        this.asm = asm;
        this.app = app;
        this.els = {
            area: document.getElementById('asm-editor'),
            lines: document.getElementById('asm-lines'),
            term: document.getElementById('asm-terminal'),
            btnAsm: document.getElementById('assemble-code'),
            btnLoad: document.getElementById('load-assembled'),
            btnExp: document.getElementById('export-rom'),
            btnImp: document.getElementById('import-rom')
        };
        this.binary = null;
        this.init();
    }

    init() {
        this.els.area.oninput = () => this.updateLineNumbers();
        this.els.btnAsm.onclick = () => this.assemble();
        this.els.btnLoad.onclick = () => this.app.loadAsm();
        this.els.btnExp.onclick = () => this.exportRom();
        this.els.btnImp.onchange = (e) => this.app.importRom(e);
        this.updateLineNumbers();
    }

    updateLineNumbers() {
        const lines = this.els.area.value.split("\n");
        this.els.lines.innerHTML = lines.map((_, i) => i + 1).join("<br>");
    }

    assemble() {
        const res = this.asm.assemble(this.els.area.value);
        this.binary = res.errors.length ? null : res.bytes;
        if (res.errors.length) {
            this.els.term.textContent = `Error:\n${res.errors.join("\n")}`;
            return;
        }
        const bStr = Array.from(res.bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(" ");
        this.els.term.textContent = `OK: ${res.bytes.length} bytes\n\n${bStr}`;
        return res.bytes;
    }

    exportRom() {
        if (!this.binary) return alert("Assemble code first");
        const blob = new Blob([this.binary], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "program.ch8";
        a.click();
        URL.revokeObjectURL(url);
    }
}
