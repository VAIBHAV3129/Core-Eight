```text
   ______                      ______ _       __    __ 
  / ____/____   _____ ___     / ____/(_)____ / /_  / /_
 / /    / __ \ / ___/ _ \   / __/  / // __ `// __ \/ __/
/ /___ / /_/ // /  /  __/  / /___ / // /_/ // / / / /_  
\____/ \____//_/   \___/  /_____//_/ \__, //_/ /_/\__/  
                                    /____/
```

<div align="center" style="margin: 20px 0px;">
  
  <a href="https://github.com/VAIBHAV3129/Core-Eight/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/VAIBHAV3129/Core-Eight?color=blue" alt="License" />
  </a>
  <a href="https://hackatime.hackclub.com/api/v1/badge/U0AQDRVBKLY/VAIBHAV3129/Core-Eight">
    <img src="https://hackatime.hackclub.com/api/v1/badge/U0AQDRVBKLY/VAIBHAV3129/Core-Eight" alt="Hackatime Badge" />
  </a>
</div>





--------------------------------------
<div align="center" style="margin: 30px 0px;">
  <a href="https://vaibhav3129.github.io/Core-Eight/" target="_blank" style="text-decoration: none;">
    <img src="https://img.shields.io/badge/Open%20Web%20IDE%20%26%20Emulator-0078d4?style=for-the-badge&logo=rocket" alt="Open Core-Eight" height="45" />
  </a>
</div>


# CHIP-8 Web IDE & Emulator
Welcome to the CHIP-8 Web IDE and Emulator. This project gives you a complete development environment right in your web browser. You can write custom assembly, debug it in real-time, and run it through a cycle-accurate emulator without needing to install any external build tools or set up a backend server.

Because the app runs fully client-side, it is hosted entirely on GitHub Pages for a zero-installand a super fast setup setup.

---

## Table of Contents
* [Intro](#intro)
* [Core Features](#core-features)
* [Getting Started](#getting-started)
* [Usage Guide](#usage-guide)
* [Architecture Overview](#architecture-overview)
* [Author](#author)
* [License](#license)
* [Disclaimer](#disclaimer)

-----------------------------------------------------------

## Intro
I had always been facinated by the early computing systems and all that it can do, while it might seen insignificant in the modern world where the technolgy and the software have grown so much that the modern systems are incredibly efficient and some over a 100x more powerful compared to the ones from the past,( and CoreEight which is a 8 bit system) and thus was the inspiration to make this project, it was an exhilarating journey filled with ups and downs but that was what made it all the more satisfying and enjoyable, it also helped me learn a lot of new things, Writing the emulator core was only half the fun,... the real challenge was building a working ecosystem around it. Crafting a custom assembler, tracking machine state history became a playground for me to explore how IDEs work. In short It’s a love letter to low-level engineering, built entirely with vanilla web technologies.lol!!

What the Demo video here!!
https://vimeo.com/1209277331?share=copy&fl=sv&fe=ci


## Core Features

Here is a quick look at what this tool can do:

* **Emulator Core:** A highly accurate CHIP-8 emulator that lets you configure specific hardware quirks, like shift logic, I-register incrementing, and sprite draw wrapping.
* **Custom Assembler:** Write your own CHIP-8 assembly code. The assembler supports labels, constants, inline macros, and math expressions, and it will give you clear syntax error reports if something goes wrong.
* **Disassembler:** If you have an existing binary ROM, you can load it in and reverse-engineer it back into readable assembly code with automatically generated labels.
* **Advanced Debugger:** Dig into your code while it runs. The debugger includes a memory hex editor, a way to monitor your registers and stack, conditional breakpoints, memory watchpoints, and a unique execution scrubber that actually lets you rewind the virtual machine state.
* **Retro UI:** It has multiple visual themes and a variety of custom options
---

## Getting Started

### Live Deployment
You don't need to build or install anything to use the environment. You can access the live IDE immediately at:
👉 **(https://vaibhav3129.github.io/Core-Eight/)**

### Local Development
Because everything is completely built with standard HTML, CSS, and vanilla JavaScript (ES6 Modules), you don't have to worry about complex build steps like Webpack or Node dependencies to run it locally.

1. Clone the repository to your local machine:
2. 
   ```bash
   git clone [https://github.com/VAIBHAV3129/Core-Eight.git](https://github.com/VAIBHAV3129/Core-Eight.git)
   cd Core-Eight

To avoid cross-origin (CORS) issues with ES6 modules, serve the files using a basic local development server.
Bash

### Using Python
python -m http.server 8000

### Or if you prefer Node.js:
npx serve .
Once your server is running, open http://localhost:8000 in your web browser.



## Usage Guide
Writing and Assembling Code
Use the built-in editor to start writing your CHIP-8 assembly. The editor will automatically highlight mnemonics, registers, and memory addresses to help you read your code. When you are ready, click Assemble to turn your code into a binary formatting ig. Any errors will pop up right in the terminal output.

## Debugging and Execution
- Step Control: You can walk through your code one instruction at a time using the Step and Step-Over functions.
- Breakpoints: Pause your program exactly when you need to by setting breakpoints on specific memory addresses, or set them to trigger only when a register hits a certain value.
- Watchpoints: Keep an eye on specific registers or memory addresses. The emulator will automatically pause if their values change.
- Time Travel: Made a mistake? Use the cycle scrubber slider at the bottom of the screen to rewind the execution and see exactly what happened in previous states.


## Memory and Register Inspection
You can click on any byte in the Memory Grid to select it, and then type to overwrite its value while the program is running. You can also modify registers directly from the Debug Grid by typing in new hexadecimal values.



## Architecture Overview
If you want to poke around the source code, the system is broken down into a few  parts:
- cpu.js: This is like the heart of the emulator. It contains the main class that handles memory, decodes opcodes, performs math operations, tracks the state history for rewinding, and maps your keyboard inputs.
- assembler.js: This file takes care of translating between text and binary. It houses both the Assembler and Disassembler classes.
- data.js: A simple storage file for configuration data, font sets, keypad layouts, and UI themes.
- ui.js / Main Script: This handles all the front-end logic, including the DOM, canvas rendering, applying themes, and listening for your clicks in the debugger.


## Author
Created and maintained by L K Vaibhav.


## License
This project is open-source and available under the MIT License.


## Disclaimer
This software is developed strictly for educational, development, and historical emulation purposes. Core-Eight does not include, host, or distribute any copyrighted commercial game ROMs or proprietary software binaries. Users are completely responsible for ensuring they have the legal right and necessary permissions to use any external ROM files they upload into this environment.




<img width="596" height="121" alt="Screen Shot 2026-07-12 at 22 16 39 PM" src="https://github.com/user-attachments/assets/0d4f48c1-e990-4c56-9dd4-3f0b0e7b8ebb" />
