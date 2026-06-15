/**
 * 虚拟摇杆
 *
 * 支持两种模式：
 *   1. DOM 模式（Web 浏览器）— 创建 DOM 元素，自动挂载触摸/鼠标事件
 *   2. Canvas 模式（微信小游戏）— 在 Canvas 上绘制，触摸输入由外部传入
 *
 * 使用方式（DOM 模式，默认）：
 *   const joystick = new VirtualJoystick({ size: 100 });
 *   joystick.mount(container, centered);
 *
 * 使用方式（Canvas 模式）：
 *   const joystick = new VirtualJoystick({ size: 100 });
 *   joystick.mountToCanvas({ ctx, x, y, size: 100 });
 *   // 每帧调用 joystick.render(ctx) 绘制
 *   // 触摸时调用 joystick.handleInput(clientX, clientY)
 *   // 触摸结束时调用 joystick.handleRelease()
 */

const KNOB_RADIUS = 24;           // 旋钮半径(px)
const BASE_RADIUS_DEFAULT = 52;   // 旋钮可移动的最大半径（直径120px时）

export class VirtualJoystick {
    /**
     * @param {Object} [options]
     * @param {number} [options.size=120] - 摇杆总直径
     * @param {number} [options.margin=20] - 边距
     */
    constructor(options = {}) {
        this.size = options.size || 120;
        this.margin = options.margin || 20;
        this.baseRadius = this.size / 2 - 8;

        /** @type {{ dx: number, dy: number, active: boolean }} */
        this.state = { dx: 0, dy: 0, active: false };

        this._touchId = null;
        this._centerX = 0;
        this._centerY = 0;
        this._knobX = 0;
        this._knobY = 0;
        this._boundRect = null;

        // DOM 模式
        this._mode = 'dom';
        this._el = null;
        this._knobEl = null;
        this._container = null;

        // Canvas 模式
        this._canvasCtx = null;
        this._canvasX = 0;
        this._canvasY = 0;
        /** @type {{ x: number, y: number }|null} */
        this._activePointer = null;

        // 绑定事件处理函数（保持引用以便移除）
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    /**
     * DOM 模式：挂载摇杆到容器
     * @param {HTMLElement} container
     * @param {boolean} [centered=false]
     */
    mount(container, centered = false) {
        if (this._el) return;
        this._mode = 'dom';
        this._container = container;

        const el = document.createElement('div');
        el.style.cssText = centered ? `
            position: relative;
            width: ${this.size}px;
            height: ${this.size}px;
            border-radius: 50%;
            background: rgba(200, 200, 220, 0.15);
            border: 2px solid rgba(200, 200, 220, 0.25);
            touch-action: none;
            user-select: none;
            z-index: 100;
            pointer-events: auto;
            box-sizing: border-box;
        ` : `
            position: absolute;
            bottom: ${this.margin}px;
            left: ${this.margin}px;
            width: ${this.size}px;
            height: ${this.size}px;
            border-radius: 50%;
            background: rgba(200, 200, 220, 0.15);
            border: 2px solid rgba(200, 200, 220, 0.25);
            touch-action: none;
            user-select: none;
            z-index: 100;
            pointer-events: auto;
            box-sizing: border-box;
        `;

        const knob = document.createElement('div');
        knob.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: ${KNOB_RADIUS * 2}px;
            height: ${KNOB_RADIUS * 2}px;
            border-radius: 50%;
            background: rgba(200, 200, 220, 0.5);
            transform: translate(-50%, -50%);
            pointer-events: none;
            box-sizing: border-box;
        `;

        el.appendChild(knob);
        container.appendChild(el);

        this._el = el;
        this._knobEl = knob;
        this._centerX = this.size / 2;
        this._centerY = this.size / 2;
        this._knobX = this._centerX;
        this._knobY = this._centerY;

        el.addEventListener('touchstart', this._onTouchStart, { passive: false });
        document.addEventListener('touchmove', this._onTouchMove, { passive: false });
        document.addEventListener('touchend', this._onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

        el.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    /**
     * Canvas 模式：绑定到 Canvas 区域
     * @param {Object} config
     * @param {CanvasRenderingContext2D} config.ctx - Canvas 2D上下文
     * @param {number} config.x - 摇杆在 Canvas 上的左上角 x
     * @param {number} config.y - 摇杆在 Canvas 上的左上角 y
     * @param {number} [config.size] - 摇杆大小（默认 this.size）
     */
    mountToCanvas({ ctx, x, y, size }) {
        this._mode = 'canvas';
        this._canvasCtx = ctx;
        this._canvasX = x;
        this._canvasY = y;
        if (size) this.size = size;
        this.baseRadius = this.size / 2 - 8;
        this._centerX = x + this.size / 2;
        this._centerY = y + this.size / 2;
        this._knobX = this._centerX;
        this._knobY = this._centerY;
    }

    /**
     * 在 Canvas 上绘制摇杆（仅 Canvas 模式使用）
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        if (this._mode !== 'canvas') return;
        const cx = this._centerX;
        const cy = this._centerY;
        const r = this.size / 2;

        // 底盘
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 200, 220, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 200, 220, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 旋钮
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(this._knobX, this._knobY, KNOB_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 200, 220, 0.5)';
        ctx.fill();
        ctx.restore();
    }

    /**
     * Canvas 模式：处理触摸/鼠标输入
     * @param {number} clientX - 触摸/鼠标的 X 坐标
     * @param {number} clientY - 触摸/鼠标的 Y 坐标
     */
    handleInput(clientX, clientY) {
        if (this._mode !== 'canvas') {
            // DOM 模式回退到旧处理
            return;
        }
        const dx = clientX - this._centerX;
        const dy = clientY - this._centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let nx, ny;
        if (dist > this.baseRadius) {
            const scale = this.baseRadius / dist;
            nx = dx * scale;
            ny = dy * scale;
        } else {
            nx = dx;
            ny = dy;
        }

        this._knobX = this._centerX + nx;
        this._knobY = this._centerY + ny;

        const active = dist > 5;
        const len = Math.sqrt(nx * nx + ny * ny);
        if (active && len > 0.001) {
            this.state = { dx: nx / len, dy: ny / len, active: true };
        } else {
            this.state = { dx: 0, dy: 0, active: false };
        }
        this._activePointer = { x: clientX, y: clientY };
    }

    /**
     * Canvas 模式：释放/抬起
     */
    handleRelease() {
        if (this._mode !== 'canvas') return;
        this.reset();
        this._activePointer = null;
    }

    /**
     * 卸载摇杆
     */
    destroy() {
        if (this._mode === 'dom' && this._el) {
            this._el.removeEventListener('touchstart', this._onTouchStart);
            document.removeEventListener('touchmove', this._onTouchMove);
            document.removeEventListener('touchend', this._onTouchEnd);
            document.removeEventListener('touchcancel', this._onTouchEnd);
            this._el.removeEventListener('mousedown', this._onMouseDown);
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup', this._onMouseUp);
            this._el.parentElement?.removeChild(this._el);
        }
        this._el = null;
        this._knobEl = null;
        this._canvasCtx = null;
        this._container = null;
        this._activePointer = null;
        this.reset();
    }

    /**
     * 获取当前摇杆方向
     * @returns {{ dx: number, dy: number, active: boolean }}
     */
    getDirection() {
        return this.state;
    }

    /**
     * 重置摇杆到中心
     */
    reset() {
        this.state = { dx: 0, dy: 0, active: false };
        this._touchId = null;
        this._knobX = this._centerX;
        this._knobY = this._centerY;
        if (this._mode === 'dom') this._updateKnobDOM();
    }

    // ─────── DOM 触摸事件 ───────

    _onTouchStart(e) {
        if (this._touchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        this._touchId = touch.identifier;
        this._boundRect = this._el.getBoundingClientRect();
        this._processDOMTouch(touch.clientX, touch.clientY);
        e.preventDefault();
    }

    _onTouchMove(e) {
        if (this._touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this._processDOMTouch(touch.clientX, touch.clientY);
                e.preventDefault();
                break;
            }
        }
    }

    _onTouchEnd(e) {
        if (this._touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this.reset();
                this._boundRect = null;
                e.preventDefault();
                break;
            }
        }
    }

    // ─────── DOM 鼠标事件 ───────

    _onMouseDown(e) {
        this._boundRect = this._el.getBoundingClientRect();
        this._processDOMTouch(e.clientX, e.clientY);
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this.state.active) return;
        this._processDOMTouch(e.clientX, e.clientY);
        e.preventDefault();
    }

    _onMouseUp(e) {
        if (!this.state.active) return;
        this.reset();
        this._boundRect = null;
        e.preventDefault();
    }

    // ─────── DOM 模式核心 ───────

    _processDOMTouch(clientX, clientY) {
        if (!this._boundRect) return;
        const dx = clientX - this._boundRect.left - this._centerX;
        const dy = clientY - this._boundRect.top - this._centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let nx, ny;
        if (dist > this.baseRadius) {
            const scale = this.baseRadius / dist;
            nx = dx * scale;
            ny = dy * scale;
        } else {
            nx = dx;
            ny = dy;
        }

        this._knobX = this._centerX + nx;
        this._knobY = this._centerY + ny;

        const active = dist > 5;
        const len = Math.sqrt(nx * nx + ny * ny);
        if (active && len > 0.001) {
            this.state = { dx: nx / len, dy: ny / len, active: true };
        } else {
            this.state = { dx: 0, dy: 0, active: false };
        }

        this._updateKnobDOM();
    }

    _updateKnobDOM() {
        if (!this._knobEl) return;
        this._knobEl.style.transform = `translate(${this._knobX - this._centerX - KNOB_RADIUS}px, ${this._knobY - this._centerY - KNOB_RADIUS}px)`;
    }
}
