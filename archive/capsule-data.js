window.CAPSULE_EFFECT = {
    MODIFY_MEMORY: 'modifyMemory',
    MODIFY_ECHO_CAPACITY: 'modifyEchoCapacity',
    MODIFY_CHEST_COST: 'modifyChestCost',
    MODIFY_TREASURE_VISIBILITY: 'modifyTreasureVisibility',
    MODIFY_ECHO: 'modifyEcho',
    REVEAL_SCREEN: 'revealScreen',
    MODIFY_MOVEMENT: 'modifyMovement',
    MODIFY_CHEST_POSITION: 'modifyChestPosition'
};

window.CAPSULE_CATEGORY = {
    PERSISTENT: 'persistent',
    CONSUMABLE: 'consumable'
};

window.CAPSULE_DB = {
    capsule_extended_memory: {
        id: 'capsule_extended_memory',
        name: '远见之忆',
        icon: '🧠',
        description: '你的记忆更加清晰，小地图上能多看到一屏的细节',
        category: 'persistent',
        rarity: 2,
        effects: [{
            effectType: 'modifyMemory',
            target: 'self',
            value: 1,
            duration: 'persistent'
        }],
        stackable: false,
        usableIn: ['preGame', 'maze']
    },

    capsule_echo_capacity: {
        id: 'capsule_echo_capacity',
        name: '巨型回音',
        icon: '🔦',
        description: '你可以携带更多的回音，上限提升',
        category: 'persistent',
        rarity: 2,
        effects: [{
            effectType: 'modifyEchoCapacity',
            target: 'self',
            value: 30,
            duration: 'persistent'
        }],
        stackable: false,
        usableIn: ['preGame', 'maze']
    },

    capsule_brute_force: {
        id: 'capsule_brute_force',
        name: '蛮力手套',
        icon: '💪',
        description: '你的力气很大，开启条件宝箱时不再需要消耗其他胶囊',
        category: 'persistent',
        rarity: 3,
        effects: [{
            effectType: 'modifyChestCost',
            target: 'self',
            value: -999,
            duration: 'persistent'
        }],
        stackable: false,
        usableIn: ['preGame', 'maze']
    },

    capsule_treasure_sense: {
        id: 'capsule_treasure_sense',
        name: '探宝直觉',
        icon: '👁️',
        description: '你对宝箱的位置有天然的直觉，小地图上更远也能看到宝箱标记',
        category: 'persistent',
        rarity: 2,
        effects: [{
            effectType: 'modifyTreasureVisibility',
            target: 'self',
            value: 1,
            duration: 'persistent'
        }],
        stackable: false,
        usableIn: ['preGame', 'maze']
    },

    capsule_light_up: {
        id: 'capsule_light_up',
        name: '地图照亮',
        icon: '💡',
        description: '在小地图上驱散指定一屏的迷雾，显示完整地形',
        category: 'consumable',
        rarity: 1,
        effects: [{
            effectType: 'revealScreen',
            target: 'specifiedScreen',
            value: 1,
            duration: 'instant'
        }],
        stackable: true,
        maxStack: 3,
        usableIn: ['maze'],
        requirements: { screenType: null, hasExplored: false }
    },

    capsule_void_step: {
        id: 'capsule_void_step',
        name: '虚空步',
        icon: '🌀',
        description: '无视墙壁，直接跃过最多3格距离到达目标位置',
        category: 'consumable',
        rarity: 2,
        effects: [{
            effectType: 'modifyMovement',
            target: 'route',
            value: 3,
            duration: 'instant'
        }],
        stackable: true,
        maxStack: 2,
        usableIn: ['maze'],
        requirements: { screenType: null, hasExplored: true }
    },

    capsule_magnetic_glove: {
        id: 'capsule_magnetic_glove',
        name: '磁力手套',
        icon: '🧲',
        description: '将本屏内任意一个宝箱隔空吸取到你面前',
        category: 'consumable',
        rarity: 2,
        effects: [{
            effectType: 'modifyChestPosition',
            target: 'currentScreen',
            value: 1,
            duration: 'instant'
        }],
        stackable: true,
        maxStack: 2,
        usableIn: ['maze'],
        requirements: { screenType: null, hasExplored: null }
    },

    capsule_echo_small: {
        id: 'capsule_echo_small',
        name: '回音补给(小型)',
        icon: '🕯️',
        description: '补充15点回音',
        category: 'consumable',
        rarity: 1,
        effects: [{
            effectType: 'modifyEcho',
            target: 'self',
            value: 15,
            duration: 'instant'
        }],
        stackable: true,
        maxStack: 5,
        usableIn: ['maze'],
        requirements: null
    }
};

window.CAPSULE_RARITY_WEIGHTS = { 1: 50, 2: 30, 3: 15, 4: 4, 5: 1 };

window.CapsuleHelper = {
    getById(id) {
        return window.CAPSULE_DB[id] || null;
    },

    getByRarity(rarity) {
        return Object.values(window.CAPSULE_DB).filter(c => c.rarity === rarity);
    },

    getRandomDrop(rng) {
        const totalWeight = Object.values(window.CAPSULE_RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
        let roll = rng ? rng.next() * totalWeight : Math.random() * totalWeight;
        let selectedRarity = 1;
        for (const [rarity, weight] of Object.entries(window.CAPSULE_RARITY_WEIGHTS)) {
            roll -= weight;
            if (roll <= 0) {
                selectedRarity = parseInt(rarity);
                break;
            }
        }
        const candidates = this.getByRarity(selectedRarity);
        if (candidates.length === 0) {
            return this.getRandomDrop(rng);
        }
        const idx = rng ? rng.nextInt(0, candidates.length - 1) : Math.floor(Math.random() * candidates.length);
        return candidates[idx];
    },

    applyPersistentEffects(game, capsules) {
        for (const cap of capsules) {
            const def = this.getById(cap.id);
            if (!def || def.category !== 'persistent') continue;
            for (const effect of def.effects) {
                this.applyEffect(game, effect);
            }
        }
    },

    applyEffect(game, effect) {
        switch (effect.effectType) {
            case 'modifyMemory':
                game.memoryLevel = (game.memoryLevel || 0) + effect.value;
                break;
            case 'modifyEchoCapacity':
                game.echoCapacity = (game.echoCapacity || 100) + effect.value;
                game.echoCount = Math.min(game.echoCount, game.echoCapacity);
                break;
            case 'modifyChestCost':
                game.chestCostFree = true;
                break;
            case 'modifyTreasureVisibility':
                game.treasureVisibility = (game.treasureVisibility || 0) + effect.value;
                break;
            case 'modifyEcho':
                game.echoCount = Math.min(game.echoCount + effect.value, game.echoCapacity || 100);
                break;
            default:
                break;
        }
    },

    getCapsuleDisplayName(id) {
        const def = this.getById(id);
        return def ? def.name : id;
    },

    getCapsuleIcon(id) {
        const def = this.getById(id);
        return def ? def.icon : '❓';
    }
};