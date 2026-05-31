# Dungeon 瓦片渲染参考手册 (Kenney Tiny Dungeon)

> **素材来源**: Kenney Tiny Dungeon Tileset (16×16px)  
> **命名标准**: 以 `tile命名对应表.md` 为准  
> **素材路径**: `assets/textures/tilesets/dungeon/kenney_tinyDungeon/Tiles/tile_XXXX.png`

---

## 一、瓦片体系总览

Kenney tileset 将墙体分为两层：

```
┌──── 顶部表面（top layer）────┐      ← 墙体的"顶面"，表现墙体上方的平面
│  center / edge / corner /     │
│  inner / outer / side /       │
│  to_pillar / to_front         │
├──── 立面（front layer）───────┤      ← 墙体的"正面"，表现面向玩家的垂直面
│  center / edge_l / edge_r /   │
│  1w / pillar / door* /        │
│  statue* / window / flag /    │
│  damaged                      │
└──────────────────────────────┘
```

**核心原则**: 墙体格子 `(gx, gy)` 通过检查四个相邻格子是否为墙，决定用哪个 tile。

---

## 二、坐标系与邻居判定

```
       上方 (gx, gy-1)
          ↓
 左侧 ──→ 墙体格子 ──→ 右侧
(gx-1,gy)  (gx,gy)   (gx+1,gy)
          ↑
       下方 (gx, gy+1)
```

判定时定义四个布尔值：
```
gTop = 上方不是墙（上方暴露/邻接地面）
gBtm = 下方不是墙（下方暴露/邻接地面）
gLft = 左侧不是墙（左侧暴露/邻接地面）
gRgt = 右侧不是墙（右侧暴露/邻接地面）
```

---

## 三、顶部表面 tile 位置映射

### 3.1 凸角（outer corner）—墙体向外凸出

| 邻居特征 | 暴露方向 | tile |
|----------|---------|------|
| 右侧+下方是墙 | 左上暴露 | `wall_stone_top_outer_tl` → tile_0004 |
| 左侧+下方是墙 | 右上暴露 | `wall_stone_top_outer_tr` → tile_0005 |

> 暂无右下、左下凸角对应 tile，可通过旋转 tile_0004/0005 实现。

### 3.2 凹角（inner corner）—地面切入墙体

| 邻居特征 | 暴露方向 | tile |
|----------|---------|------|
| 上方+左侧是墙 | 左上暴露（对角是地面） | `wall_stone_top_inner_tl` → tile_0027 |
| 上方+右侧是墙 | 右上暴露（对角是地面） | `wall_stone_top_inner_tr` → tile_0025 |
| 上方+左侧是墙（左侧非立面行） | 左下暴露（对角是地面或立面） | `wall_stone_top_inner_bl` → tile_0003 |
| 上方+右侧是墙（右侧非立面行） | 右下暴露（对角是地面或立面） | `wall_stone_top_inner_br` → tile_0001 |

### 3.3 顶部水平边缘

| 邻居特征 | tile |
|----------|------|
| 上方暴露（gTop） | `wall_stone_top_edge_h` → tile_0002 或 `wall_stone_top_edge_h_02` → tile_0026 |

> tile_0002 和 tile_0026 功能相同，可择一使用或随机变体。

### 3.4 顶部侧边

| 邻居特征 | tile |
|----------|------|
| 左侧暴露，下方也是墙 | `wall_stone_top_side_l` → tile_0015 |
| 右侧暴露，下方也是墙 | `wall_stone_top_side_r` → tile_0013 |

### 3.5 顶部侧边→立面的衔接

当墙体格子的**正下方是立面**时，需要使用专门的过渡 tile：

| 邻居特征 | tile |
|----------|------|
| 下方是立面左边缘（front_edge_l） | `wall_stone_top_side_to_front_l` → tile_0016 |
| 下方是立面右边缘（front_edge_r） | `wall_stone_top_side_to_front_r` → tile_0017 |
| 下方是立面中间格/单格 | `wall_stone_top_edge_h` → tile_0002 |

> 注意：这些 tile 只出现在**立面正上方一行**。不满足此条件的侧边格子使用普通的 `side_l` / `side_r`。

### 3.6 顶部→立面柱子衔接

| 邻居特征 | tile |
|----------|------|
| 上方是柱子（tile_0018），tile 成对使用 | `wall_stone_top_to_pillar` → tile_0006 |

### 3.7 顶部中心填充

| 邻居特征 | tile |
|----------|------|
| 四个方向都是墙 | `wall_stone_top_center_01` → tile_0000 |
| 变体 | `wall_stone_top_center_02` → tile_0012（泥土坑） |
| 变体 | `wall_stone_top_center_03` → tile_0024（碎石头） |

---

## 四、立面 tile 位置映射

立面出现在墙体最底层（下方是地面，上方是墙）。

### 4.1 立面中间格

| 使用场景 | tile |
|----------|------|
| 默认款 | `wall_stone_front_center` → tile_0040 |
| 脱落砖块 | `wall_stone_front_center_damaged` → tile_0014 |
| 窥视窗 | `wall_stone_front_center_window` → tile_0028 |
| 旗子 | `wall_stone_front_center_flag` → tile_0029 |

### 4.2 立面边缘

| 邻居特征 | tile |
|----------|------|
| 左侧暴露，下方暴露，上方是墙 | `wall_stone_front_edge_l` → tile_0057 |
| 右侧暴露，下方暴露，上方是墙 | `wall_stone_front_edge_r` → tile_0059 |

### 4.3 单格宽立面

当墙体纵向只有 1 格宽时，既需要充当中间段也需要收边：

| 邻居特征 | tile |
|----------|------|
| 上方+下方暴露或上方有墙、下方暴露（单格墙体） | `wall_stone_front_1w` → tile_0058 |

### 4.4 立面柱子

| tile |
|------|
| `wall_stone_front_pillar` → tile_0018（与 tile_0006 配对） |

### 4.5 立面装饰（雕像）

| tile |
|------|
| `wall_stone_front_statue_small_dry` → tile_0007 |
| `wall_stone_front_statue_small_wet` → tile_0008 |
| `wall_stone_front_statue_large_dry` → tile_0019 |
| `wall_stone_front_statue_large_wet` → tile_0020 |

### 4.6 门洞 / 门

| 状态 | 单格 | 双格左 | 双格右 |
|------|------|--------|--------|
| 无门板 | `doorway_open_1w` → tile_0009 | `doorway_open_2w_l` → tile_0010 | `doorway_open_2w_r` → tile_0011 |
| 门板全开 | `door_open_1w` → tile_0021 | `door_open_2w_l` → tile_0022 | `door_open_2w_r` → tile_0023 |
| 门板半开 | `door_half_1w` → tile_0033 | `door_half_2w_l` → tile_0034 | `door_half_2w_r` → tile_0035 |
| 门板全关 | `door_closed_1w` → tile_0045 | `door_closed_2w_l` → tile_0046 | `door_closed_2w_r` → tile_0047 |

---

## 五、地面 tile 映射

### 5.1 基本地面

| tile | 说明 |
|------|------|
| `floor_01` → tile_0048 | 默认地面 |
| `floor_02` → tile_0049 | 碎石地面 |
| `floor_variant_stone` → tile_0042 | 小石块地面 |

### 5.2 阴影地面（邻接墙体时使用）

**光源方向：左上角**。光线从左上射入，阴影投射到右下方向。

**阴影规则**：
- 地面上方是墙 → 墙面遮挡光源 → 产生上方阴影
- 地面左侧是墙 → 墙面遮挡光源 → 产生左侧阴影（墙在左，地面在墙的右下）
- ⚠️ 地面右侧是墙 → **不产生阴影**（光线从左上射入，在到达墙体前已照到地面）
- 地面上方+左侧同时是墙 → 内角双阴影（`tile_0052`）
- 上方无墙、左侧无墙，但左上对角是墙 → 外角单角阴影（`tile_0053`，衔接两段独立阴影的转角）

| 邻居特征 | tile | 旋转 | 说明 |
|----------|------|------|------|
| 上方是墙 | `floor_shadow_n` → tile_0050 | 0° | 上方有阴影 |
| 上方是墙 + 变体 | `floor_shadow_n_stone` → tile_0051 | 0° | 上方阴影+碎石 |
| 左侧是墙 | `floor_shadow_n` → tile_0050 | 逆时针90° | 左侧有阴影 |
| 左侧是墙（且该墙是凸角 tile_0005） | `floor_shadow_outer` → tile_0053 | 逆时针90° | 凸角左侧阴影，保留高度感 |
| 上方+左侧是墙（凹角双阴影） | `floor_shadow_inner` → tile_0052 | 逆时针90° | 上方+左侧双阴影 |
| 左上对角是墙，上/左无墙（外角单阴影） | `floor_shadow_outer` → tile_0053 | 0° | 左上角阴影，衔接两段独立阴影斑块 |

**阴影判定优先级**（地面格子按以下顺序检查）：
1. 正上方+正左侧是墙 → `tile_0052`（逆时针旋转 90°，上方+左侧双阴影）
2. 左上对角是墙，且正上方、正左侧都不是墙 → `tile_0053`（无旋转，外角单阴影）
3. 正上方是墙 → `tile_0050` 或 `tile_0051`（无旋转，上方阴影）
4. 正左侧是墙：
   - 若该墙上方是地面且其左侧也是墙（即该墙是凸角 `tile_0005`） → `tile_0053` 逆时针旋转 90°（凸角阴影）
   - 否则 → `tile_0050` 逆时针旋转 90°（左侧阴影）
5. 默认 → 普通地面

> **设计依据**：光源在左上角，地面右侧出现墙体时，光线已先照到地面再到达墙体，因此不产生阴影。狭窄通道（左右都是墙）优先使用左侧阴影（优先级 4 的 `wallLeft`）。
> 旋转方向：逆时针 90° = -90°（`-Math.PI/2`），顺时针 90° = 90°（`Math.PI/2`）。
> 在代码中通过 canvas `ctx.rotate()` 实现，90° 旋转时交换 w/h 参数以适配非正方形格子。

### 5.3 特殊地面

| tile | 说明 |
|------|------|
| `floor_pillar` → tile_0030 | 柱子基底地面（与 tile_0018 配对） |
| `floor_pool_open_dry` → tile_0031 | 敞开水池（无水） |
| `floor_pool_open_wet` → tile_0032 | 敞开水池（流水） |
| `floor_pool_rail_dry` → tile_0043 | 栏杆水池（无水） |
| `floor_pool_rail_wet` → tile_0044 | 栏杆水池（流水） |
| `floor_trap_spike` → tile_0041 | 尖刺陷阱 |

---

## 六、台阶（stair）

| tile | 说明 |
|------|------|
| `stair_stone_l` → tile_0036 | 台阶左侧边 |
| `stair_stone_center` → tile_0037 | 台阶中间段 |
| `stair_stone_r` → tile_0038 | 台阶右侧边 |
| `stair_stone_single` → tile_0039 | 单格台阶（可连续拼接） |

---

## 七、矿车（cart）

| tile | 说明 |
|------|------|
| `cart_mine_h` → tile_0054 | 横向移动 |
| `cart_mine_v` → tile_0055 | 纵向移动 |
| `cart_mine_diag` → tile_0056 | 45° 斜向移动 |

---

## 八、墙体 tile 判定规则（核心逻辑）

### 8.1 判定优先级（修订版）

**核心原则：**
- 下方暴露（gBtm）→ **无条件立面**（墙体最底层必须面向玩家）
- 立面正上方的格子 → 其 tile 由**下方立面的类型**决定
- 上方暴露（gTop）→ 顶部表面 tile

```
优先级 1: gBtm（下方暴露）→ 立面层 front_* 
优先级 2: 当前格正下方是立面 → 根据下方立面类型决定顶部表面 tile
优先级 3: gTop && gLft/gRgt → 凸角 outer_tl / outer_tr
优先级 4: 凹角（对角暴露）→ inner_tl / inner_tr / inner_bl / inner_br
优先级 5: gTop（上方暴露）→ 顶部水平边缘 edge_h
优先级 6: gLft（左侧暴露）→ 顶部侧边 side_l
优先级 7: gRgt（右侧暴露）→ 顶部侧边 side_r
优先级 8: 默认（四面都是墙）→ 顶部中心 center
```

### 8.2 详细判定逻辑

#### 优先级 1：下方暴露（gBtm）→ 立面

**规则**：只要 `!isWall(gx, gy + 1)`，该格**无条件使用立面 tile**。

立面 tile 的选择（按左右邻居暴露判定）：

```
gLft = !isWall(gx - 1, gy)  // 左侧是否暴露（是地面）
gRgt = !isWall(gx + 1, gy)  // 右侧是否暴露（是地面）

gLft && gRgt  → single    (tile_0058)  // 两侧都暴露，孤立立面
gLft && !gRgt → edge_l    (tile_0057)  // 仅左侧暴露 → 左边缘
!gLft && gRgt → edge_r    (tile_0059)  // 仅右侧暴露 → 右边缘
!gLft && !gRgt→ center    (tile_0040)  // 两侧都是墙 → 中间格
```

> **关键**: 立面边缘判定只依赖左右邻居是否是地面，不再依赖前排列连续计算。左是墙/右是地面 → tile_0059（右边缘暴露）；右是墙/左是地面 → tile_0057（左边缘暴露）。

#### 优先级 2：正下方是立面 → 匹配立面类型

**规则**：`this.isFrontRowCell(gx, gy + 1)`（下方格子是立面行，即下方是墙且再下方是地面）

```
belowType = getFrontFaceType(gx, gy + 1)

belowType === 'edge_l' → side_to_front_l (tile_0016)  // 对立面左边缘
belowType === 'edge_r' → side_to_front_r (tile_0017)  // 对立面右边缘
belowType === 'center' → edge_h (tile_0002)           // 对立面中间格
belowType === 'single' → edge_h (tile_0002)           // 对单格立面
```

> **关键约束**（问题2）：立面左边缘格上方衔接 `tile_0016`（side_to_front_l），立面右边缘上方衔接 `tile_0017`（side_to_front_r），中间格和单格上方衔接 `tile_0002`（edge_h）。

#### 优先级 3：凸角（gTop 且侧向暴露）

**规则**（问题5）：

```
gTop && gLft → outer_tl (tile_0004)   // 左侧+上方是地面
gTop && gRgt → outer_tr (tile_0005)   // 右侧+上方是地面
```

#### 优先级 4：凹角（对角是地面，但相邻是墙）

```
!gTop && !gLft && !isWall(gx-1, gy-1) → inner_tl (tile_0027)
!gTop && !gRgt && !isWall(gx+1, gy-1) → inner_tr (tile_0025)
!gTop && !gLft && !isFrontRow(gx-1, gy) && (!isWall(gx-1, gy+1) || !isWall(gx-1, gy+2)) → inner_bl (tile_0003)
!gTop && !gRgt && !isFrontRow(gx+1, gy) && (!isWall(gx+1, gy+1) || !isWall(gx+1, gy+2)) → inner_br (tile_0001)
```

#### 优先级 5：上方暴露（gTop）

**规则**（问题5）：

```
gTop → edge_h (tile_0002 或 tile_0026，加权选择)
```

> 此时不受优先级 2 影响（下方不是立面，否则会被优先级 2 提前拦截）。这是墙体顶部最上沿的一行。

#### 优先级 6-7：侧向暴露（包括邻格是立面）

**规则**：左侧或右侧暴露（邻接地面的方向），或邻格是立面行（正下方是地面），即该侧墙体已结束。

```
gLft || isFrontRow(gx-1, gy) → side_l (tile_0015)
gRgt || isFrontRow(gx+1, gy) → side_r (tile_0013)
```

> **`isFrontRow` 的含义**：检查邻格是否是「墙体且正下方是地面」，即该格是立面行（前排列）。当邻格是立面时，意味着该侧墙体在顶部表面层已结束，当前格应作为侧边缘暴露出来。

#### 优先级 8：默认中心

```
→ center (tile_0000 / tile_0012 / tile_0024，加权选择)
```

### 8.3 决策流程图（修订版）

```
                    ┌─────────────────┐
                    │ 墙体格子 (gx,gy) │
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │ gBtm? ──Yes──→ 立面判定     │  优先级 1
              │ (下方是地面)   front_*       │
              └──────────────┬──────────────┘
                             │ No
              ┌──────────────▼──────────────┐
              │ 正下方是立面?                │  优先级 2
              │ Yes → 匹配下方立面类型       │
              │   edge_l下 → side_to_front_l│
              │   edge_r下 → side_to_front_r│
              │   center下 → edge_h         │
              └──────────────┬──────────────┘
                             │ No
              ┌──────────────▼──────────────┐
              │ gTop && gLft? → outer_tl    │
              │ gTop && gRgt? → outer_tr    │  优先级 3: 凸角
              └──────────────┬──────────────┘
                             │ No
              ┌──────────────▼──────────────┐
              │ 对角暴露检查 → inner_*      │  优先级 4: 凹角
              └──────────────┬──────────────┘
                             │ No
              ┌──────────────▼──────────────┐
              │ gTop? → edge_h              │  优先级 5: 上边缘
              └──────────────┬──────────────┘
                             │ No
              ┌──────────────▼──────────────┐
              │ gLft? → side_l              │  优先级 6-7: 侧边
              │ gRgt? → side_r              │
              └──────────────┬──────────────┘
                             │ No
              ┌──────────────▼──────────────┐
              │ 全墙 → center               │  优先级 8: 中心
              └─────────────────────────────┘
```

### 8.4 典型墙体剖面（3格高墙体）

```
Row y+0: [地面] [地面] [地面] [地面]
Row y+1: edge_h  edge_h  edge_h  edge_h    ← gTop=true, 优先级5
Row y+2: edge_h  edge_h  edge_h  edge_h    ← 下方是立面center, 优先级2
Row y+3: front_  front_  front_  front_    ← gBtm=true, 优先级1
         center  center  center  center
Row y+4: shadow  shadow  shadow  shadow    ← 地面+上阴影 tile_0050
         _n      _n      _n      _n
```

> 墙体 y 方向至少 3 格，三行墙体从上到下：顶部边缘 → 立面衔接 → 立面。

---

## 九、代码加载清单

```javascript
const KENNEY = 'assets/textures/tilesets/dungeon/kenney_tinyDungeon/Tiles';
const ld = (n) => { const img = new Image(); img.src = `${KENNEY}/tile_${String(n).padStart(4, '0')}.png`; return img; };

const TILES = {
    // ── 顶部表面 ──
    wall_top: {
        center:        [ld(0),  ld(12), ld(24)],           // top_center_01/02/03
        inner_tl:       ld(27),  // 凹角左上
        inner_tr:       ld(25),  // 凹角右上
        inner_bl:       ld(3),   // 凹角左下
        inner_br:       ld(1),   // 凹角右下
        outer_tl:       ld(4),   // 凸角左上
        outer_tr:       ld(5),   // 凸角右上
        edge_h:        [ld(2),  ld(26)],                    // 顶部水平边缘
        side_l:         ld(15),  // 左侧边
        side_r:         ld(13),  // 右侧边
        side_to_front_l: ld(16), // 左侧→立面衔接
        side_to_front_r: ld(17), // 右侧→立面衔接
        to_pillar:      ld(6),   // →柱子衔接
    },
    // ── 立面 ──
    wall_front: {
        center:         ld(40),  // 默认
        center_damaged: ld(14),  // 脱落砖块
        center_window:  ld(28),  // 窥视窗
        center_flag:    ld(29),  // 旗子
        edge_l:         ld(57),  // 左边缘
        edge_r:         ld(59),  // 右边缘
        single:         ld(58),  // 单格立面
        pillar:         ld(18),  // 柱子
        statue_small_dry:  ld(7),
        statue_small_wet:  ld(8),
        statue_large_dry:  ld(19),
        statue_large_wet:  ld(20),
    },
    // ── 门 ──
    door: {
        doorway_open_1w:  ld(9),   doorway_open_2w_l: ld(10), doorway_open_2w_r: ld(11),
        door_open_1w:     ld(21),  door_open_2w_l:    ld(22), door_open_2w_r:    ld(23),
        door_half_1w:     ld(33),  door_half_2w_l:    ld(34), door_half_2w_r:    ld(35),
        door_closed_1w:   ld(45),  door_closed_2w_l:  ld(46), door_closed_2w_r:  ld(47),
    },
    // ── 地面 ──
    floor: {
        plain:          [ld(48), ld(49), ld(42)],          // floor_01/02 + variant_stone
        shadow_n:        ld(50),  // 上方阴影
        shadow_n_stone:  ld(51),  // 上方阴影+碎石
        shadow_inner:    ld(52),  // 凹角阴影
        shadow_outer:    ld(53),  // 凸角阴影
        pillar:          ld(30),  // 柱子基底
        pool_open_dry:   ld(31),  pool_open_wet: ld(32),
        pool_rail_dry:   ld(43),  pool_rail_wet: ld(44),
        trap_spike:      ld(41),
    },
    // ── 台阶 ──
    stair: {
        l:      ld(36),
        center: ld(37),
        r:      ld(38),
        single: ld(39),
    },
    // ── 矿车 ──
    cart: {
        h:    ld(54),
        v:    ld(55),
        diag: ld(56),
    },
};
```

---

## 十、渲染流程

```
1. 遍历全图每个格子
2. 若是地面 → drawFloor() → 根据相邻墙体类型选 floor tile（阴影/普通/特殊）
3. 若是墙体 → drawWall()  → selectWallTile() 按第八章优先级判定
4. 若是台阶 → drawStair() → 根据左右邻居拼接台阶
5. 叠加矿车、装饰等特殊 tile
```

---

## 十一、与旧版 tile-reference 的差异

| 维度 | 旧版（自裁 tile） | 新版（Kenney） |
|------|------------------|---------------|
| 尺寸 | 78×78px | 16×16px |
| 顶部凸角数量 | 4（tl/tr/bl/br） | 2（tl/tr，bl/br 由旋转实现） |
| 内圈边缘 | 独立 inner_edge_* 系列 | 不使用内圈边缘，凹角由 inner_corner 覆盖 |
| 立面层 | 仅 front_edge + corner_l/r | 完整立面系统（柱子/雕像/门/窗/旗/破损） |
| 地面 | 纯平铺变体 | 平铺变体 + 阴影地面 + 水池 + 陷阱 |
| 门 | 无 | 完整（无门板/全开/半开/全关 × 单格/双格） |
| 台阶 | 无 | 4 种台阶 tile |
| 矿车 | 无 | 3 方向矿车 |