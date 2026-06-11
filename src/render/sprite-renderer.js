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

        this.characterWidth = 21;
        this.characterWidthLR = 28;
        this.characterHeight = 42;
        this.characterPivotY = 38;
        this.playerScale = 1.2;
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

        this.animations = {
            up: [],
            down: [],
            left: [],
            right: [],
            standby: [],
        };

        for (let i = 1; i <= 6; i++) {
            const img = createImage();
            img.src = basePath + `walk-up_00${i}.png`;
            this.animations.up.push(img);
        }
        for (let i = 1; i <= 6; i++) {
            const img = createImage();
            img.src = basePath + `walk-down_00${i}.png`;
            this.animations.down.push(img);
        }
        for (let i = 1; i <= 6; i++) {
            const img = createImage();
            img.src = basePath + `walk-left_00${i}.png`;
            this.animations.left.push(img);
        }
        this.animations.right = this.animations.left;

        for (let i = 1; i <= 3; i++) {
            const img = createImage();
            img.src = basePath + `standby_00${i}.png`;
            this.animations.standby.push(img);
        }

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
     * @param {boolean} dashActive - 是否冲刺
     */
    updateAnimation(dt, dashActive) {
        if (!this.animations) return;

        if (dashActive) {
            this.frameIndex = 5;
        } else if (this.isMoving) {
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
        let charWidth;
        const isLR = this.isMoving && (this.direction === 'left' || this.direction === 'right');

        let frames;
        if (this.isMoving) {
            frames = this.animations[this.direction] || this.animations.down;
            charWidth = isLR ? this.characterWidthLR * scale : this.characterWidth * scale;
        } else {
            frames = this.animations.standby;
            charWidth = this.characterWidth * scale;
        }

        const charHeight = this.characterHeight * scale;
        const pivotOffset = this.characterPivotY * scale;
        const drawX = screenX - charWidth / 2;
        const drawY = screenY - pivotOffset;

        this.ctx.shadowColor = COLORS.playerGlow;
        this.ctx.shadowBlur = 20;

        const frame = frames[Math.floor(this.frameIndex) % frames.length];

        if (frame && frame.complete) {
            if (this.direction === 'right') {
                this.ctx.save();
                this.ctx.translate(drawX + charWidth / 2, drawY + charHeight / 2);
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(frame, -charWidth / 2, -charHeight / 2, charWidth, charHeight);
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
