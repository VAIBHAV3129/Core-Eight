export class ScreenRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.pixelSize = 1;
        this.color = '#6dffba';
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    clear() {
        this.ctx.fillStyle = '#010302';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw(display, width, height) {
        this.clear();
        this.ctx.fillStyle = this.color;
        for (let i = 0; i < display.length; i++) {
            if (display[i] === 1) {
                const x = i % width;
                const y = Math.floor(i / width);
                this.ctx.fillRect(x, y, 1, 1);
            }
        }
    }
}
