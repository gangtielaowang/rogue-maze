战利品系统。核心原则是：**框架现在就搭好，MVP只填充必要的内容，后续扩展只需加数据**。

---

# 战利品系统设计文档

## 一、设计原则

1. **胶囊化**：所有战利品对外统一叫“胶囊”，不区分装备/道具/技能，玩家只感知“我有一个胶囊，什么时候用”
2. **数据驱动**：每种胶囊的能力通过配置数据定义，不硬编码逻辑
3. **框架预留**：系统结构支持未来扩展新类型、新效果，但MVP只实现当前必要的

---

## 二、胶囊的底层抽象

无论什么胶囊，从系统角度看，都由三个要素组成：

- **触发时机**：什么时候生效
- **效果目标**：对谁生效
- **效果内容**：产生什么效果

基于这个抽象，胶囊在系统层面分两类，区别仅在于触发时机不同：

| 类型 | 触发时机 | 携带成本 | 使用后 |
|------|---------|---------|--------|
| 持久型 | 带入迷宫后自动持续生效 | 占用1个携带位直到游戏结束 | 不消失（但也可以有使用次数上限） |
| 消耗型 | 玩家主动选择使用 | 带入时占1个携带位，使用后释放 | 立即消失 |

后续如果扩展“被动触发型”（比如“火把耗尽时自动恢复10点”），只需增加触发时机枚举值即可，不影响现有框架。

---

## 三、效果体系设计

### 3.1 效果类型枚举

所有胶囊的效果归入以下类型，MVP实现子集，后续可扩展：

| 效果类型 | 说明 | MVP是否实现 |
|----------|------|------------|
| 修改火把 | 增加/减少火把值，或修改消耗倍率 | ✅ 是 |
| 修改视野/记忆 | 扩展或收缩小地图信息显示范围 | ✅ 是 |
| 修改移动 | 跨过墙壁、传送、跳跃格子 | ✅ 是 |
| 修改宝箱 | 降低/免除开箱消耗，揭示宝箱位置 | ✅ 是 |
| 揭示地图 | 驱散指定范围的迷雾 | ✅ 是 |
| 修改携带位 | 增加本局可携带胶囊的上限 | ❌ 后续 |
| 修改怪物 | 驱散、定身、吸引怪物 | ❌ 后续（等怪物系统实现后） |
| 修改多人 | 扩展共享视野、召唤队友 | ❌ 后续（等多人系统实现后） |

### 3.2 效果数据结构

每个效果是一个对象，包含以下字段：

```
{
  effectType: string,    // 效果类型，如 "modifyTorch"
  target: string,        // 效果目标，如 "self" / "currentScreen" / "specifiedScreen"
  value: number,         // 数值参数
  duration: string,      // 持续方式："instant"（一次性） / "persistent"（持久）
  condition: object|null // 触发条件，持久型为null，消耗型通常也为null（主动触发）
}
```

**关于目标（target）的说明**：

| 目标值 | 含义 |
|--------|------|
| "self" | 对玩家自身生效 |
| "currentScreen" | 对玩家当前所在屏生效 |
| "specifiedScreen" | 对玩家指定的一屏生效（需要额外UI选择） |
| "adjacentScreen" | 对相邻屏生效 |
| "allExplored" | 对所有已探索屏生效 |
| "route" | 对玩家指定的一条路径生效（用于移动类） |

---

## 四、胶囊数据结构

每个胶囊的完整配置：

```
{
  id: string,              // 唯一标识，如 "capsule_extended_memory_1"
  name: string,            // 显示名称，如 "远见之忆"
  description: string,     // 描述文本
  category: "persistent" | "consumable",  // 持久型/消耗型
  rarity: number,          // 稀有度（1-5），影响生成概率和视觉效果
  icon: string,            // 图标资源ID
  effects: [effectObj, ...],  // 效果列表，支持一个胶囊包含多个效果
  stackable: boolean,      // 同类效果是否可叠加（MVP默认false）
  maxStack: number,        // 最大叠加数（stackable为true时有效）
  usableIn: string[],      // 可使用场景：["maze"]（迷宫中）, ["preGame"]（开局前）, ["both"]
  requirements: {          // 使用前提条件（可选）
    screenType: string|null,  // 需要玩家在特定区域类型才能使用，如 "hidden"
    hasExplored: boolean|null // 需要该屏已被探索过
  }
}
```

---

## 五、MVP胶囊清单

### 5.1 持久型胶囊（4种）

#### P1 - 远见之忆
```
{
  id: "capsule_extended_memory",
  name: "远见之忆",
  description: "你的记忆更加清晰，小地图上能多看到一屏的细节",
  category: "persistent",
  rarity: 2,
  effects: [
    {
      effectType: "modifyMemory",
      target: "self",
      value: 1,           // 记忆层级+1屏
      duration: "persistent"
    }
  ],
  stackable: false,
  usableIn: ["preGame", "maze"]  // 开局带入或在迷宫中获得后立即生效
}
```
**效果说明**：记忆分层规则中，所有层级的距离阈值+1。即当前和-1屏完整，-2和-3屏显示部分信息，-4屏及更远仅地形。

---

#### P2 - 巨型火把
```
{
  id: "capsule_torch_capacity",
  name: "巨型火把",
  description: "你可以携带更多的火把，上限提升",
  category: "persistent",
  rarity: 2,
  effects: [
    {
      effectType: "modifyTorchCapacity",
      target: "self",
      value: 30,          // 火把上限+30（具体数值待平衡调整）
      duration: "persistent"
    }
  ],
  stackable: false,
  usableIn: ["preGame", "maze"]
}
```
**效果说明**：增加火把最大持有量。MVP中火把就是玩家的命，多30点上限意味着可以从容探索更多区域。

---

#### P3 - 蛮力手套
```
{
  id: "capsule_brute_force",
  name: "蛮力手套",
  description: "你的力气很大，开启条件宝箱时不再需要消耗其他胶囊",
  category: "persistent",
  rarity: 3,
  effects: [
    {
      effectType: "modifyChestCost",
      target: "self",
      value: -999,        // 特殊值，表示免除消耗（实际逻辑判断 value <= -999 时全免）
      duration: "persistent"
    }
  ],
  stackable: false,
  usableIn: ["preGame", "maze"]
}
```
**效果说明**：持有此胶囊时，所有条件宝箱的开启消耗降为0。这是很有价值的胶囊，稀有度设为3，让玩家在获得时会兴奋。

---

#### P4 - 探宝直觉
```
{
  id: "capsule_treasure_sense",
  name: "探宝直觉",
  description: "你对宝箱的位置有天然的直觉，小地图上-2屏也能看到宝箱标记",
  category: "persistent",
  rarity: 2,
  effects: [
    {
      effectType: "modifyTreasureVisibility",
      target: "self",
      value: 1,           // 宝箱可见距离+1屏层级
      duration: "persistent"
    }
  ],
  stackable: false,
  usableIn: ["preGame", "maze"]
}
```
**效果说明**：原本-2屏不显示宝箱，持有此胶囊后-2屏也会显示宝箱位置。这改变了玩家的探索策略——可以在更远处发现目标并规划路线。

---

### 5.2 消耗型胶囊（4种）

#### C1 - 地图照亮
```
{
  id: "capsule_light_up",
  name: "地图照亮",
  description: "在小地图上驱散指定一屏的迷雾，显示完整地形",
  category: "consumable",
  rarity: 1,
  effects: [
    {
      effectType: "revealScreen",
      target: "specifiedScreen",
      value: 1,           // 影响1屏
      duration: "instant"
    }
  ],
  stackable: true,
  maxStack: 3,
  usableIn: ["maze"],
  requirements: {
    screenType: null,
    hasExplored: false    // 只能照亮未探索过的屏
  }
}
```
**效果说明**：玩家在小地图上选择一屏，该屏迷雾被驱散，显示地形（仅墙壁和通道，不显示宝箱）。如果搭配“探宝直觉”，则也会显示宝箱。

---

#### C2 - 虚空步
```
{
  id: "capsule_void_step",
  name: "虚空步",
  description: "无视墙壁，直接跃过最多3格距离到达目标位置",
  category: "consumable",
  rarity: 2,
  effects: [
    {
      effectType: "modifyMovement",
      target: "route",
      value: 3,           // 最多3格
      duration: "instant"
    }
  ],
  stackable: true,
  maxStack: 2,
  usableIn: ["maze"],
  requirements: {
    screenType: null,
    hasExplored: true     // 目标位置所在屏必须已探索过
  }
}
```
**效果说明**：玩家选择当前屏或相邻屏内的一个位置（距离≤3格，直线距离或曼哈顿距离均可），直接传送过去，不消耗火把。如果路径上有墙壁，直接穿透。这个胶囊的主要用途：
- 进入隐藏区（被特殊墙壁包围的E型区域）
- 跨越瓶颈区中的长障碍
- 抄近道节省火把

---

#### C3 - 磁力手套
```
{
  id: "capsule_magnetic_glove",
  name: "磁力手套",
  description: "将本屏内任意一个宝箱隔空吸取到你面前",
  category: "consumable",
  rarity: 2,
  effects: [
    {
      effectType: "modifyChestPosition",
      target: "currentScreen",
      value: 1,           // 影响1个宝箱
      duration: "instant"
    }
  ],
  stackable: true,
  maxStack: 2,
  usableIn: ["maze"],
  requirements: {
    screenType: null,
    hasExplored: null
  }
}
```
**效果说明**：使用后，玩家从本屏所有宝箱中选择一个，将其移动到玩家当前所在格子。这可以节省绕路去开宝箱的火把。配合探宝直觉可以先知道哪里有宝箱，再决定是否用磁力手套拉过来。

---

#### C4 - 火把补给（小型）
```
{
  id: "capsule_torch_small",
  name: "火把补给（小型）",
  description: "补充15点火把",
  category: "consumable",
  rarity: 1,
  effects: [
    {
      effectType: "modifyTorch",
      target: "self",
      value: 15,          // 恢复15点火把
      duration: "instant"
    }
  ],
  stackable: true,
  maxStack: 5,
  usableIn: ["maze"],
  requirements: null
}
```
**效果说明**：最基础的恢复道具。放在消耗型里是因为它需要主动使用，而不是持续生效。稀有度最低，出现频率高，作为宝箱的常见产出。

---

## 六、携带与使用流程

### 6.1 开局携带流程

1. 玩家进入“选择胶囊”界面，展示仓库中所有可用胶囊
2. 玩家选择最多3个放入本局背包
3. 被选中的胶囊移入本局背包，仓库中暂时移除
4. 进入迷宫

### 6.2 迷宫中获得胶囊

- 开启宝箱时，可能获得胶囊（直接加入本局背包）
- 获得时若背包已满（携带位上限=3，但消耗型使用后释放空间），需选择是否替换

### 6.3 持久型胶囊生效

- 带入或在迷宫中获得后，持续生效直到游戏结束
- 占用携带位，不能主动“关闭”
- 死亡时，若选择保留此胶囊，则带回仓库；若不保留，则消失

### 6.4 消耗型胶囊使用

1. 玩家在迷宫中打开背包
2. 选择消耗型胶囊
3. 如果需要选择目标（如“指定一屏”），弹出选择界面
4. 确认使用，效果生效，胶囊从背包移除
5. 释放的携带位可以用于存放新获得的胶囊

### 6.5 死亡处理

- 带入N件，死亡后选择保留N-1件
- 无论持久型还是消耗型，都计入N
- 未使用的消耗型胶囊也可以被选择保留
- 已使用的消耗型胶囊已经消失，不参与保留选择

---

## 七、仓库系统

### 7.1 仓库数据

```
playerWarehouse: {
  capsules: [
    {
      capsuleId: "capsule_extended_memory",
      count: 2
    },
    {
      capsuleId: "capsule_torch_small",
      count: 5
    }
    // ...
  ]
}
```

### 7.2 仓库操作

| 操作 | 触发时机 | 说明 |
|------|---------|------|
| 增加 | 通关后带回、看广告奖励、后续可能的购买 | count+1 |
| 减少 | 开局选择带入 | count-1（移入本局背包） |
| 死亡扣减 | 死亡后未选择保留的胶囊 | 从仓库和本局背包中消失 |
| 通关入库 | 通关后，本局背包中所有胶囊 | 全部移入仓库 |

---

## 八、扩展预留

以下设计在框架中已预留，MVP不实现，但数据结构支持后续无缝加入：

### 8.1 新效果类型示例

| 效果类型 | 示例胶囊 | 说明 |
|----------|---------|------|
| modifyCarrySlot | 扩容背包 | 本局可携带胶囊数量+1（上限从3变4） |
| modifyMonster | 驱散护符 | 使用后本屏怪物暂时消失 |
| summonMonster | 诱饵胶囊 | 在指定位置制造一个吸引怪物的诱饵 |
| modifyTeamVision | 共享视野增强 | 多人模式下，队友能看到你更多的探索记录 |
| resurrect | 不死护符 | 火把耗尽时自动触发，恢复部分火把（仅一次） |

### 8.2 新触发时机

| 触发时机 | 说明 |
|----------|------|
| "onTorchDepleted" | 火把耗尽时自动触发 |
| "onEnterScreen" | 进入新屏时自动触发 |
| "onOpenChest" | 开箱时自动触发 |
| "onDeath" | 死亡时自动触发 |

只需在效果数据中增加 `triggerTiming` 字段即可支持。

### 8.3 胶囊组合效果

当前一个胶囊可以有多个效果，已支持简单组合。后续如果需要胶囊之间的协同效果（如“持有A+B时额外触发C”），可以在系统中增加 `synergy` 配置，不影响现有数据。

---

## 九、MVP实现清单

| 模块 | 内容 | 优先级 |
|------|------|--------|
| 胶囊配置表 | 8种胶囊的完整数据 | P0 |
| 仓库系统 | 增删查改、死亡扣减 | P0 |
| 开局选择 | 从仓库选最多3件带入 | P0 |
| 持久型生效 | 进入迷宫后自动应用效果 | P0 |
| 消耗型使用 | 背包UI + 使用逻辑 | P0 |
| 宝箱产出 | 随机掉落胶囊（按稀有度加权） | P0 |
| 死亡保留 | 选择N-1件保留 | P0 |
| 通关入库 | 本局背包全部移入仓库 | P0 |
| 扩展预留 | 枚举值、字段、接口留好 | P1 |

---

以上是战利品系统的完整设计。8种胶囊覆盖了火把、记忆、宝箱、移动、地图揭示这些核心系统，每种都有明确的使用场景和策略意义。后续加新胶囊只需要往配置表里加数据，系统框架不需要改动。