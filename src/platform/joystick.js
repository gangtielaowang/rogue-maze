/**
 * 虚拟摇杆
 *
 * 触屏/鼠标拖拽式摇杆，支持手机和桌面双重操作。
 * 半透明设计，悬浮于游戏容器底部左侧。
 */

const JOYSTICK_SIZE = 120;        // 摇杆总直径(px)
const KNOB_RADIUS = 24;           // 旋钮半径(px)
const BASE_RADIUS = JOYSTICK_SIZE / 2 - 8; // 旋钮可移动的最大半径

export class VirtualJoystick {
    /**
     * @param {Object} [options]
     * @param {number} [options.size=120] - 摇杆总直径
     * @param {string} [options.position='bottom-left'] - 位置
     * @param {number} [options.margin=20] - 边距
     */
    constructor(options = {}) {
        this.size = options.size || JOYSTICK_SIZE;
        this.margin = options.margin || 20;

        /** @type {{ dx: number, dy: number, active: boolean }} */
        this.state = { dx: 0, dy: 0, active: false };

        this._touchId = null;        // 当前跟踪的 touch id
        this._centerX = 0;
        this._centerY = 0;
        this._knobX = 0;
        this._knobY = 0;
        this._boundRect = null;

        // DOM 元素
        this._el = null;
        this._knobEl = null;

        // 绑定事件处理函数（保持引用以便移除）
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    /**
     * 挂载摇杆到容器
     * @param {HTMLElement} container
     */
    mount(container) {
        if (this._el) return;

        // 创建摇杆元素
        const el = document.createElement('div');
        el.style.cssText = `
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

        // 触摸事件
        el.addEventListener('touchstart', this._onTouchStart, { passive: false });
        document.addEventListener('touchmove', this._onTouchMove, { passive: false });
        document.addEventListener('touchend', this._onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

        // 鼠标事件（桌面调试）
        el.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    /**
     * 卸载摇杆
     */
    destroy() {
        if (!this._el) return;
        this._el.removeEventListener('touchstart', this._onTouchStart);
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
        document.removeEventListener('touchcancel', this._onTouchEnd);
        this._el.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this._el.parentElement?.removeChild(this._el);
        this._el = null;
        this._knobEl = null;
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
        this._updateKnob();
    }

    // ─────── 触摸事件 ───────

    _onTouchStart(e) {
        if (this._touchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        this._touchId = touch.identifier;
        this._boundRect = this._el.getBoundingClientRect();
        this._processTouch(touch.clientX, touch.clientY);
        e.preventDefault();
    }

    _onTouchMove(e) {
        if (this._touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === this._touchId) {
                this._processTouch(touch.clientX, touch.clientY);
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

    // ─────── 鼠标事件（桌面） ───────

    _onMouseDown(e) {
        this._boundRect = this._el.getBoundingClientRect();
        this._processTouch(e.clientX, e.clientY);
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this.state.active) return;
        this._processTouch(e.clientX, e.clientY);
        e.preventDefault();
    }

    _onMouseUp(e) {
        if (!this.state.active) return;
        this.reset();
        this._boundRect = null;
        e.preventDefault();
    }

    // ─────── 核心 ───────

    _processTouch(clientX, clientY) {
        if (!this._boundRect) return;
        const dx = clientX - this._boundRect.left - this._centerX;
        const dy = clientY - this._boundRect.top - this._centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let nx, ny;
        if (dist > BASE_RADIUS) {
            const scale = BASE_RADIUS / dist;
            nx = dx * scale;
            ny = dy * scale;
        } else {
            nx = dx;
            ny = dy;
        }

        this._knobX = this._centerX + nx;
        this._knobY = this._centerY + ny;

        const active = dist > 5; // 死区 5px
        this.state = {
            dx: active ? nx / BASE_RADIUS : 0,
            dy: active ? ny / BASE_RADIUS : 0,
            active,
        };

        this._updateKnob();
    }

    _updateKnob() {
        if (!this._knobEl) return;
        this._knobEl.style.transform = `translate(${this._knobX - this._centerX - KNOB_RADIUS}px, ${this._knobY - this._centerY - KNOB_RADIUS}px)`;
    }
}
