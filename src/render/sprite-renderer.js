/**
 * 角色精灵渲染模块
 *
 * 处理玩家角色的帧动画加载和绘制。
 * 支持 up/down/left/right 行走动画和待机动帧。
 *
 * 依赖 Canvas 2D API 和 HTMLImageElement（图片对象由外部加载传入）。
 */
import { COLORS } from './tile-renderer.js';

export class SpriteRenderer {
    constructor(ctx) {
        this.ctx = ctx;

        /** @type {Object<string, HTMLImageElement[]>} */
        this.animations = null;
        this.frameIndex = 0;
        this.animationTimer = 0;
        this.animationSpeed = 8;
        this.direction = 'down';
        this.isMoving = false;

        // 各方向实际图片尺寸：run-left=28×42, run-down/up=21×42, walk全方向=21×42
        this.characterHeight = 42;
        this.characterPivotY = 38;
        this.playerScale = 1.2;

        /** 各动画集下每方向+待机的像素宽度（standby 全为 21×42） */
        this._widths = {
            run:  { up: 21, down: 21, left: 28, right: 28, standby: 21 },
            walk: { up: 21, down: 21, left: 21, right: 21, standby: 21 },
        };
    }

    /**
     * 加载玩家动画帧
     * @param {Object} options
     * @param {string} options.basePath - 动画帧图片路径前缀
     * @param {function(string): HTMLImageElement} [options.createImage] - 创建图片对象的工厂函数，默认为 new Image()
     */
    loadAnimations({ basePath, createImage } = {}) {
        basePath = basePath || 'assets/spirits/character-elu_frames/';
        createImage = createImage || (() => new Image());

        // 行走动画帧（walk-*）
        this.animWalk = { up: [], down: [], left: [], right: [] };
        for (const dir of ['up', 'down', 'left']) {
            for (let i = 1; i <= 6; i++) {
                const img = createImage();
                img.src = basePath + `walk-${dir}_00${i}.png`;
                this.animWalk[dir].push(img);
            }
        }
        this.animWalk.right = this.animWalk.left;

        // 奔跑动画帧（run-*）
        this.animRun = { up: [], down: [], left: [], right: [] };
        for (const dir of ['up', 'down', 'left']) {
            for (let i = 1; i <= 6; i++) {
                const img = createImage();
                img.src = basePath + `run-${dir}_00${i}.png`;
                this.animRun[dir].push(img);
            }
        }
        this.animRun.right = this.animRun.left;

        // 待机帧（共享）
        this._standbyFrames = [];
        for (let i = 1; i <= 3; i++) {
            const img = createImage();
            img.src = basePath + `standby_00${i}.png`;
            this._standbyFrames.push(img);
        }

        // 默认使用奔跑动画（run）
        this.animations = { ...this.animRun, standby: this._standbyFrames };
        this.quietMode = false; // false=run动画, true=walk动画

        this.frameIndex = 0;
        this.animationTimer = 0;
        this.direction = 'down';
        this.isMoving = false;
    }

    /**
     * 设置动画帧（外部预加载后传入）
     * @param {Object<string, HTMLImageElement[]>} animations
     */
    setAnimations(animations) {
        this.animations = animations;
        this.frameIndex = 0;
        this.animationTimer = 0;
        this.direction = 'down';
        this.isMoving = false;
    }

    /**
     * 更新帧动画
     * @param {number} dt - 帧间隔秒数
     * @param {boolean} dashActive - 闪现中（冻结于 run 第 1 帧）
     */
    updateAnimation(dt, dashActive) {
        if (!this.animations) return;

        if (dashActive) {
            // 闪现时强制使用 run 动画第 6 帧，忽略 quietMode
            this.animations = { ...this.animRun, standby: this._standbyFrames };
            this.frameIndex = 5;
            return;
        }

        // quietMode=false → run动画, quietMode=true → walk动画
        if (this.quietMode) {
            this.animations = { ...this.animWalk, standby: this._standbyFrames };
        } else {
            this.animations = { ...this.animRun, standby: this._standbyFrames };
        }

        if (this.isMoving) {
            this.animationTimer += dt * 1000;
            const frameTime = 1000 / this.animationSpeed;
            this.frameIndex = (this.animationTimer / frameTime) % 6;
        } else {
            this.animationTimer += dt * 1000;
            const frameTime = 1500 / 3;
            this.frameIndex = Math.floor((this.animationTimer / frameTime) % 3);
        }
    }

    /**
     * 绘制玩家角色
     * @param {number} screenX - 玩家在屏幕上的像素 X（含网格偏移和摄像机偏移）
     * @param {number} screenY - 玩家在屏幕上的像素 Y
     * @param {number} cellSize - 每格像素大小
     */
    draw(screenX, screenY, cellSize) {
        if (!this.animations) {
            this._drawFallback(screenX, screenY, cellSize);
            return;
        }

        const scale = (cellSize / 40) * this.playerScale;
        // 按当前动画集选取宽度（移动用方向宽度，待机用 standby 宽度 21）
        const widthSet = this.quietMode ? this._widths.walk : this._widths.run;
        const baseWidth = this.isMoving ? (widthSet[this.direction] || 21) : widthSet.standby;

        let frames;
        if (this.isMoving) {
            frames = this.animations[this.direction] || this.animations.down;
        } else {
            frames = this.animations.standby;
        }
        const charWidth = Math.round(baseWidth * scale);

        const charHeight = Math.round(this.characterHeight * scale);
        const pivotOffset = Math.round(this.characterPivotY * scale);
        const drawX = Math.round(screenX - charWidth / 2);
        const drawY = Math.round(screenY - pivotOffset);

        this.ctx.shadowColor = COLORS.playerGlow;
        this.ctx.shadowBlur = 20;

        const frame = frames[Math.floor(this.frameIndex) % frames.length];

        if (frame && frame.complete) {
            if (this.direction === 'right') {
                this.ctx.save();
                this.ctx.translate(drawX + charWidth / 2, drawY + charHeight / 2);
                this.ctx.scale(-1, 1);
                const hcw = Math.round(charWidth / 2);
                const hch = Math.round(charHeight / 2);
                this.ctx.drawImage(frame, -hcw, -hch, charWidth, charHeight);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(frame, drawX, drawY, charWidth, charHeight);
            }
        } else {
            this._drawFallback(screenX, screenY, cellSize);
        }

        this.ctx.shadowBlur = 0;
    }

    /** 回退绘制：橙色圆形 */
    _drawFallback(x, y, cellSize) {
        this.ctx.fillStyle = COLORS.player;
        this.ctx.beginPath();
        this.ctx.arc(x, y, Math.min(cellSize, cellSize) * 0.3 * this.playerScale, 0, Math.PI * 2);
        this.ctx.fill();
    }
}
