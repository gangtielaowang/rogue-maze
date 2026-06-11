/**
 * 摄像机模块
 *
 * 死区跟随摄像机算法：
 * - 玩家在视口中央死区范围内移动时，摄像机不动
 * - 玩家超出死区时，摄像机跟随移动（平滑插值）
 *
 * 纯逻辑模块，不依赖任何 Canvas/DOM API。
 * 输出摄像机位置，供渲染层使用。
 */
export class Camera {
    /**
     * @param {Object} options
     * @param {number} options.viewCols  - 视口宽（格数）
     * @param {number} options.viewRows  - 视口高（格数）
     * @param {number} options.totalCols - 地图总列数
     * @param {number} options.totalRows - 地图总行数
     * @param {number} options.cellWidth - 每格像素宽
     * @param {number} options.cellHeight- 每格像素高
     */
    constructor({ viewCols, viewRows, totalCols, totalRows, cellWidth, cellHeight } = {}) {
        this.viewCols = viewCols;
        this.viewRows = viewRows;
        this.totalCols = totalCols;
        this.totalRows = totalRows;
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;

        /** 平滑摄像机位置（连续值，用于插值） */
        this.camStartX = 0;
        this.camStartY = 0;

        /** 实际渲染使用的摄像机位置（整数化后） */
        this.renderCamX = 0;
        this.renderCamY = 0;
    }

    /**
     * 更新摄像机位置
     * @param {number} playerPixelX - 玩家像素 X
     * @param {number} playerPixelY - 玩家像素 Y
     * @param {number} [dt]         - 帧间隔秒数，不传则瞬移
     */
    update(playerPixelX, playerPixelY, dt) {
        const deadMinX = Math.floor(this.viewCols / 2) - 1;
        const deadMaxX = Math.floor(this.viewCols / 2) + 1;
        const deadMinY = Math.floor(this.viewRows / 2) - 1;
        const deadMaxY = Math.floor(this.viewRows / 2) + 1;

        const px = playerPixelX / this.cellWidth;
        const py = playerPixelY / this.cellHeight;

        const screenX = px - this.camStartX;
        const screenY = py - this.camStartY;

        let targetX = this.camStartX;
        let targetY = this.camStartY;

        if (screenX < deadMinX) targetX = px - deadMinX;
        else if (screenX > deadMaxX) targetX = px - deadMaxX;

        if (screenY < deadMinY) targetY = py - deadMinY;
        else if (screenY > deadMaxY) targetY = py - deadMaxY;

        targetX = Math.max(0, Math.min(targetX, this.totalCols - this.viewCols));
        targetY = Math.max(0, Math.min(targetY, this.totalRows - this.viewRows));

        if (!dt || dt <= 0) {
            this.camStartX = targetX;
            this.camStartY = targetY;
        } else {
            const camSpeed = 12;
            this.camStartX += (targetX - this.camStartX) * Math.min(camSpeed * dt, 1);
            this.camStartY += (targetY - this.camStartY) * Math.min(camSpeed * dt, 1);
        }

        // 同步渲染位置
        this.renderCamX = this.camStartX;
        this.renderCamY = this.camStartY;
    }

    /**
     * 获取渲染视口参数
     * @returns {{ camIntX: number, camIntY: number, camFracX: number, camFracY: number,
     *             extraCols: number, extraRows: number }}
     */
    getViewport() {
        const camFracX = this.renderCamX - Math.floor(this.renderCamX);
        const camFracY = this.renderCamY - Math.floor(this.renderCamY);
        const camIntX = Math.floor(this.renderCamX);
        const camIntY = Math.floor(this.renderCamY);
        const extraCols = camFracX > 0.001 ? 1 : 0;
        const extraRows = camFracY > 0.001 ? 1 : 0;

        return { camIntX, camIntY, camFracX, camFracY, extraCols, extraRows };
    }

    /**
     * 设置网格尺寸（迷宫重新生成时调用）
     */
    setGridSize(totalCols, totalRows) {
        this.totalCols = totalCols;
        this.totalRows = totalRows;
    }

    /**
     * 重置摄像机到指定位置
     */
    reset(playerPixelX, playerPixelY) {
        const cx = (playerPixelX / this.cellWidth) - this.viewCols / 2;
        const cy = (playerPixelY / this.cellHeight) - this.viewRows / 2;
        this.camStartX = Math.max(0, Math.min(cx, this.totalCols - this.viewCols));
        this.camStartY = Math.max(0, Math.min(cy, this.totalRows - this.viewRows));
        this.renderCamX = this.camStartX;
        this.renderCamY = this.camStartY;
    }
}
