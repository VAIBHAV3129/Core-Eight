
import { KEY_MAP, KEYPAD_LABELS } from './app-config.js';
import { ui } from './app-ui.js';

export function bindEvents(chip8, assembler, appLogic) {
  window.addEventListener("pointermove", (event) => {
    ui.cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 3}px)`;
  });

  window.addEventListener("keydown", (event) => {
    const key = KEY_MAP[event.key.toLowerCase()];
    if (key !== undefined) { chip8.setKey(key, true); appLogic.sync(); }
  });

  window.addEventListener("keyup", (event) => {
    const key = KEY_MAP[event.key.toLowerCase()];
    if (key !== undefined) { chip8.setKey(key, false); appLogic.sync(); }
  });

  ui.navButtons.forEach((button) => button.addEventListener("click", () => appLogic.showPanel(button.dataset.panel)));
  ui.brandButton.addEventListener("click", () => appLogic.showPanel("dashboard"));
  ui.speedSlider.addEventListener("input", () => appLogic.sync());
  ui.buttons.reset.addEventListener("click", () => appLogic.resetVm());
  ui.buttons.resetScratch.addEventListener("click", () => appLogic.resetVm());
  ui.buttons.step.addEventListener("click", () => appLogic.stepVm(true));
  ui.buttons.run.addEventListener("click", () => appLogic.runVm());
  ui.buttons.pause.addEventListener("click", () => appLogic.pauseVm());
  ui.buttons.assemble.addEventListener("click", () => appLogic.assembleEditor());
  ui.buttons.loadAssembled.addEventListener("click", () => appLogic.loadAssembledProgram());
  ui.asmEditor.addEventListener("input", () => { 
    appLogic.updateLineNumbers(); 
    localStorage.setItem("core8_code", ui.asmEditor.value); 
  });

  ui.buttons.addBp.addEventListener("click", () => {
    const addr = parseInt(ui.bpInput.value, 16);
    if (!isNaN(addr)) { chip8.breakpoints.add(addr); ui.bpInput.value = ""; appLogic.sync(); }
  });

  ui.buttons.importRom.addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bytes = new Uint8Array(evt.target.result);
      appLogic.pauseVm(); chip8.reset(); chip8.loadProgram(bytes);
      appLogic.currentProgramName = file.name;
      appLogic.lastLine = `Imported ROM: ${file.name}`;
      appLogic.printVm(); appLogic.sync();
    };
    reader.readAsArrayBuffer(file);
  });

  ui.buttons.exportRom.addEventListener("click", () => {
    const programBytes = chip8.memory.slice(0x200);
    const blob = new Blob([programBytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "program.ch8"; a.click();
    URL.revokeObjectURL(url);
  });

  // Keypad Logic
  KEYPAD_LABELS.forEach((label, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = label;
    button.addEventListener("pointerdown", () => { chip8.setKey(index, true); appLogic.sync(); });
    button.addEventListener("pointerup", () => { chip8.setKey(index, false); appLogic.sync(); });
    button.addEventListener("pointerleave", () => { chip8.setKey(index, false); appLogic.sync(); });
    ui.keypadGrid.appendChild(button);
  });
}
