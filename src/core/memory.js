export class Memory {
    constructor(size = 65536) {
        this.data = new Uint8Array(size);
    }

    read(addr) {
        return this.data[addr & 0xFFFF];
    }

    write(addr, val) {
        this.data[addr & 0xFFFF] = val & 0xFF;
    }

    set(bytes, start = 0) {
        this.data.set(bytes, start & 0xFFFF);
    }

    fill(val, start = 0, end = this.data.length) {
        this.data.fill(val, start, end);
    }
}
