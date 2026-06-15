/**
 * 平台抽象层
 *
 * 封装浏览器/微信小游戏等平台的差异，让上层代码不直接调用平台 API。
 *
 * 当前使用 Web 实现（浏览器），微信版本只需替换此文件的内部实现。
 *
 * 使用方式：
 *   import { platform } from './wechat-platform.js';
 *   const img = platform.createImage();
 *   const canvas = platform.createCanvas();
 *
 * 已抽象的接口：
 *   - Canvas 创建
 *   - Image 创建与加载
 *   - requestAnimationFrame
 *   - 设备像素比
 *   - 图片加载等待
 *   - 存储
 *   - Canvas 2D 上下文
 *   - 创建 DOM 元素
 */

// ═══════════════════════════════════════════════
//  Canvas
// ═══════════════════════════════════════════════

/**
 * 创建一个 Canvas 元素
 * @param {number} [width]
 * @param {number} [height]
 * @returns {HTMLCanvasElement}
 */
function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    if (width !== undefined) canvas.width = width;
    if (height !== undefined) canvas.height = height;
    return canvas;
}

/**
 * 获取 Canvas 2D 上下文
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
function getContext2D(canvas) {
    return canvas.getContext('2d');
}

// ═══════════════════════════════════════════════
//  Image
// ═══════════════════════════════════════════════

/**
 * 创建一个 Image 对象
 * @returns {HTMLImageElement}
 */
function createImage() {
    return new Image();
}

/**
 * 加载单张图片
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = createImage();
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn(`[Platform] 图片加载失败: ${url}`);
            resolve(img); // 不 reject，继续运行
        };
        img.src = url;
    });
}

/**
 * 等待所有 Image 对象加载完成
 * @param {(HTMLImageElement|HTMLImageElement[])[]} images - 嵌套数组的图片列表
 * @returns {Promise<void>}
 */
function waitImages(images) {
    const all = images.flat(Infinity).filter((v) => v instanceof Image);
    return Promise.all(all.map((img) =>
        new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
                resolve();
            } else {
                img.onload = resolve;
                img.onerror = resolve;
            }
        })
    )).then(() => {});
}

// ═══════════════════════════════════════════════
//  Animation Frame
// ═══════════════════════════════════════════════

/**
 * @param {(timestamp: number) => void} callback
 * @returns {number} request ID
 */
function requestAnimationFrame(callback) {
    return window.requestAnimationFrame(callback);
}

/**
 * @param {number} id
 */
function cancelAnimationFrame(id) {
    window.cancelAnimationFrame(id);
}

// ═══════════════════════════════════════════════
//  设备信息
// ═══════════════════════════════════════════════

/**
 * @returns {number}
 */
function getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
}

// ═══════════════════════════════════════════════
//  DOM（仅在 Web 平台可用，微信小游戏不支持）
// ═══════════════════════════════════════════════

/**
 * 创建 DOM 元素（仅 Web 平台可用）
 * @param {string} tag
 * @param {Object} [attrs]
 * @returns {HTMLElement|null}
 */
function createElement(tag, attrs = {}) {
    if (typeof document === 'undefined') return null;
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object') {
            Object.assign(el.style, v);
        } else if (k === 'className') {
            el.className = v;
        } else {
            el.setAttribute(k, String(v));
        }
    }
    return el;
}

/**
 * 查询 DOM 元素（仅 Web 平台可用）
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
function querySelector(selector) {
    if (typeof document === 'undefined') return null;
    return document.querySelector(selector);
}

/**
 * 获取元素（仅 Web 平台可用）
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function getElementById(id) {
    if (typeof document === 'undefined') return null;
    return document.getElementById(id);
}

// ═══════════════════════════════════════════════
//  事件（仅 Web 平台可用）
// ═══════════════════════════════════════════════

/**
 * 添加事件监听（仅 Web 平台可用）
 */
function addEventListener(target, type, listener, options) {
    if (typeof target?.addEventListener !== 'function') return;
    target.addEventListener(type, listener, options);
}

/**
 * 移除事件监听（仅 Web 平台可用）
 */
function removeEventListener(target, type, listener, options) {
    if (typeof target?.removeEventListener !== 'function') return;
    target.removeEventListener(type, listener, options);
}

// ═══════════════════════════════════════════════
//  导出平台对象
// ═══════════════════════════════════════════════

export const platform = {
    createCanvas,
    getContext2D,
    createImage,
    loadImage,
    waitImages,
    requestAnimationFrame,
    cancelAnimationFrame,
    getDevicePixelRatio,
    createElement,
    querySelector,
    getElementById,
    addEventListener,
    removeEventListener,
};
