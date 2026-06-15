/**
 * 背包/道具模块
 *
 * 职责：
 * - 回响（Echo）能量系统
 * - 追忆（胶囊）物品管理
 * - 宝箱逻辑
 * - 条件宝箱追踪
 *
 * 纯逻辑，不依赖任何 Web API。
 */

import { CELL } from '../maze/types.js';

/** 最大背包容量 */
export const BACKPACK_CAPACITY = 10;

/** 默认回响容量 */
export const DEFAULT_ECHO_CAPACITY = 900;

/** 默认开局回响 */
export const DEFAULT_ECHO_COUNT = 720;

/** 基础视野范围（被迷雾模块使用） */
export const BASE_VISION_RANGE = 3;

/** 追踪物品种类定义 */
const DROP_TABLE = [
    { id: 'capsule_echo_small',    name: '回响碎片',   icon: '💧', category: 'consumable', weight: 40 },
    { id: 'capsule_echo_medium',   name: '回响结晶',   icon: '🔮', category: 'consumable', weight: 20 },
    { id: 'capsule_light_up',      name: '照明术',     icon: '💡', category: 'persistent', weight: 10 },
    { id: 'capsule_extended_memory', name: '延忆',     icon: '🧠', category: 'persistent', weight: 10 },
    { id: 'capsule_echo_burst',    name: '回响爆发',   icon: '⚡', category: 'consumable', weight: 8 },
    { id: 'capsule_echo_shield',   name: '回响护盾',   icon: '🛡️', category: 'consumable', weight: 8 },
    { id: 'capsule_stealth',       name: '隐身护盾',   icon: '🌫️', category: 'consumable', weight: 6 },
    { id: 'capsule_stone',         name: '小石头',     icon: '🪨', category: 'consumable', weight: 12 },
    { id: 'capsule_meat',          name: '肉',         icon: '🥩', category: 'consumable', weight: 8 },
    { id: 'capsule_treasure_vision', name: '觅宝视野', icon: '👁️', category: 'persistent', weight: 4 },
];

export class Inventory {
    constructor() {
        /** 回响能量 */
        this.echoCount = DEFAULT_ECHO_COUNT;
        /** 回响容量上限 */
        this.echoCapacity = DEFAULT_ECHO_CAPACITY;

        /** 视野增益等级 */
        this.memoryLevel = 0;
        /** 宝箱探测范围 */
        this.treasureVisibility = 0;
        /** 免费开箱 */
        this.chestCostFree = false;

        /** 当前运行的追忆列表 */
        this.capsules = [];
        /** 开局选中的追忆 */
        this.runCapsules = [];

        /** 条件宝箱（key = "row,col"） */
        this.chestConditional = {};
    }

    /** 开局初始化 */
    initRun(selectedCapsules = []) {
        this.echoCount = DEFAULT_ECHO_COUNT;
        this.echoCapacity = DEFAULT_ECHO_CAPACITY;
        this.memoryLevel = 0;
        this.treasureVisibility = 0;
        this.chestCostFree = false;
        this.runCapsules = [...selectedCapsules];
        this.capsules = [...selectedCapsules];
    }

    /**
     * 扫描网格，标记条件宝箱（30% 概率为假宝箱）
     * @param {number[][]} grid
     */
    markConditionalChests(grid) {
        for (let gy = 0; gy < grid.length; gy++) {
            for (let gx = 0; gx < grid[0].length; gx++) {
                if (grid[gy][gx] === CELL.CHEST) {
                    if (Math.random() < 0.3) {
                        this.chestConditional[`${gy},${gx}`] = true;
                    }
                }
            }
        }
    }

    /**
     * 检查某格子是否为条件宝箱
     */
    isConditionalChest(gy, gx) {
        return !!this.chestConditional[`${gy},${gx}`];
    }

    /**
     * 移除宝箱（开箱后清除网格 + 条件标记）
     * @param {number[][]} grid - 网格（会被修改）
     * @param {number} py
     * @param {number} px
     */
    clearChest(grid, py, px) {
        grid[py][px] = CELL.FLOOR;
        const key = `${py},${px}`;
        delete this.chestConditional[key];
    }

    /**
     * 能否开箱
     */
    canOpenChest(gy, gx) {
        if (this.chestCostFree) return true;
        // 此处可扩展消耗回响开箱逻辑
        return true;
    }

    /**
     * 是否还有空背包位
     */
    hasSpace() {
        return this.capsules.length < BACKPACK_CAPACITY;
    }

    /**
     * 向背包添加一个追忆
     * @returns {boolean} 是否成功
     */
    addCapsule(capsuleId) {
        if (this.capsules.length >= BACKPACK_CAPACITY) return false;
        this.capsules.push({ id: capsuleId });
        return true;
    }

    /**
     * 替换背包中指定位置的追忆
     */
    replaceCapsule(index, capsuleId) {
        if (index < 0 || index >= this.capsules.length) return false;
        this.capsules[index] = { id: capsuleId };
        return true;
    }

    /**
     * 消耗回响
     * @returns {boolean} 是否足够
     */
    spendEcho(amount) {
        if (this.echoCount < amount) return false;
        this.echoCount -= amount;
        return true;
    }

    /**
     * 增加回响（不超过上限）
     */
    addEcho(amount) {
        this.echoCount = Math.min(this.echoCount + amount, this.echoCapacity);
    }

    /**
     * 回响是否耗尽
     */
    isEchoEmpty() {
        return this.echoCount <= 0;
    }

    /**
     * 随机掉落一个追忆
     * @param {number} [luckModifier] - 幸运系数，越大越容易出好东西
     * @returns {{ id: string, name: string, icon: string, category: string }|null}
     */
    getRandomDrop(luckModifier = 0) {
        if (DROP_TABLE.length === 0) return null;

        // 带权随机
        const adjusted = DROP_TABLE.map(d => ({
            ...d,
            weight: d.weight + (d.category === 'consumable' ? luckModifier : luckModifier * 0.5),
        }));

        const totalWeight = adjusted.reduce((sum, d) => sum + Math.max(1, d.weight), 0);
        let roll = Math.random() * totalWeight;

        for (const drop of adjusted) {
            roll -= Math.max(1, drop.weight);
            if (roll <= 0) {
                return { id: drop.id, name: drop.name, icon: drop.icon, category: drop.category };
            }
        }

        return null;
    }
}
