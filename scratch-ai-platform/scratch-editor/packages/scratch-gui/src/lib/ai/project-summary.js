const EVENT_HAT_LABELS = Object.freeze({
    event_whenflagclicked: 'Green flag',
    event_whenkeypressed: 'Key press',
    event_whenthisspriteclicked: 'Sprite clicked',
    event_whenstageclicked: 'Stage clicked',
    event_whenbackdropswitchesto: 'Backdrop switch',
    event_whengreaterthan: 'Sensor threshold',
    event_whenbroadcastreceived: 'Broadcast received',
    event_whentouchingobject: 'Touching object'
});

const EVENT_HAT_OPCODES = new Set(Object.keys(EVENT_HAT_LABELS));

const BROADCAST_SEND_OPCODES = new Set([
    'event_broadcast',
    'event_broadcastandwait'
]);

const emptyProjectSummary = Object.freeze({
    targets: {
        total: 0,
        sprites: 0,
        stage: 0,
        items: []
    },
    blocks: {
        total: 0,
        visible: 0,
        shadow: 0,
        scripts: 0
    },
    events: {
        hats: 0,
        eventHatCounts: []
    },
    broadcasts: {
        sends: 0,
        receives: 0,
        messages: []
    },
    logic: {
        flows: [],
        broadcastLinks: []
    }
});

const isOriginalTarget = target => (
    !Object.prototype.hasOwnProperty.call(target, 'isOriginal') || target.isOriginal
);

const readBlockMap = target => {
    if (!target || !target.blocks) return {};
    if (target.blocks._blocks) return target.blocks._blocks;
    return target.blocks;
};

const readScriptIds = (target, blockMap) => {
    if (target && target.blocks && typeof target.blocks.getScripts === 'function') {
        return target.blocks.getScripts();
    }
    return Object.keys(blockMap).filter(blockId => blockMap[blockId].topLevel);
};

const readFieldValue = field => {
    if (!field) return null;
    if (typeof field.value !== 'undefined') return field.value;
    if (Array.isArray(field) && field.length > 0) return field[0];
    return null;
};

const readTargetName = target => (target && target.getName ? target.getName() : target.name);

const readBroadcastName = (block, blockMap) => {
    const directField = block.fields && block.fields.BROADCAST_OPTION;
    const directName = readFieldValue(directField);
    if (directName) return directName;

    const broadcastInput = block.inputs && block.inputs.BROADCAST_INPUT;
    const shadowId = broadcastInput && (broadcastInput.shadow || broadcastInput.block);
    const shadowBlock = shadowId && blockMap[shadowId];
    const shadowField = shadowBlock && shadowBlock.fields && shadowBlock.fields.BROADCAST_OPTION;
    return readFieldValue(shadowField);
};

const addCount = (counts, key) => {
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
};

const addBroadcastSend = (records, name, blockId) => {
    if (!name) return;
    if (!records[name]) {
        records[name] = {
            name,
            count: 0,
            blockIds: []
        };
    }
    records[name].count++;
    if (blockId) records[name].blockIds.push(blockId);
};

const createBroadcastRecord = name => ({
    name,
    sends: 0,
    receives: 0
});

const readInputBlockIds = input => {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input.filter(item => typeof item === 'string');
    }
    if (typeof input !== 'object') return [];

    const inputIds = [];
    if (input.block) inputIds.push(input.block);
    if (input.shadow) inputIds.push(input.shadow);
    return inputIds;
};

const collectScriptBlocks = (scriptId, blockMap) => {
    const visitedBlockIds = new Set();
    const scriptBlocks = [];

    const visitStack = blockId => {
        let nextBlockId = blockId;
        while (nextBlockId && !visitedBlockIds.has(nextBlockId)) {
            const block = blockMap[nextBlockId];
            if (!block) return;

            visitedBlockIds.add(nextBlockId);
            scriptBlocks.push(block);

            Object.values(block.inputs || {}).forEach(input => {
                readInputBlockIds(input).forEach(visitStack);
            });

            nextBlockId = block.next;
        }
    };

    visitStack(scriptId);
    return scriptBlocks;
};

const readEventFieldDetail = block => {
    const fields = block.fields || {};
    const key = readFieldValue(fields.KEY_OPTION);
    const backdrop = readFieldValue(fields.BACKDROP);
    const greaterThan = readFieldValue(fields.WHENGREATERTHANMENU);
    const touchingObject = readFieldValue(fields.TOUCHINGOBJECTMENU);

    return key || backdrop || greaterThan || touchingObject || null;
};

const createTriggerInfo = (block, blockMap) => {
    const messageName = block.opcode === 'event_whenbroadcastreceived' ?
        readBroadcastName(block, blockMap) : null;
    const fieldDetail = messageName || readEventFieldDetail(block);
    const label = EVENT_HAT_LABELS[block.opcode] || block.opcode;

    return {
        opcode: block.opcode,
        label: label,
        detail: fieldDetail,
        messageName: messageName
    };
};

const createScriptReference = flow => ({
    id: flow.id,
    targetId: flow.targetId,
    targetName: flow.targetName,
    scriptId: flow.scriptId,
    scriptIndex: flow.scriptIndex,
    blockCount: flow.blockCount,
    blockIds: flow.blockIds,
    triggerLabel: flow.trigger.label,
    triggerDetail: flow.trigger.detail,
    triggerOpcode: flow.trigger.opcode
});

const createLogicFlow = (target, targetName, scriptId, scriptIndex, blockMap) => {
    const startBlock = blockMap[scriptId];
    if (!startBlock || !EVENT_HAT_OPCODES.has(startBlock.opcode)) return null;

    const visibleScriptBlocks = collectScriptBlocks(scriptId, blockMap).filter(block => !block.shadow);
    const broadcastSendRecords = {};
    visibleScriptBlocks.forEach(block => {
        if (!BROADCAST_SEND_OPCODES.has(block.opcode)) return;
        addBroadcastSend(broadcastSendRecords, readBroadcastName(block, blockMap), block.id);
    });

    return {
        id: `${target.id}:${scriptId}`,
        targetId: target.id,
        targetName: targetName,
        isStage: !!target.isStage,
        scriptId: scriptId,
        scriptIndex: scriptIndex,
        trigger: createTriggerInfo(startBlock, blockMap),
        blockCount: visibleScriptBlocks.length,
        blockIds: visibleScriptBlocks.map(block => block.id),
        broadcastSends: Object.values(broadcastSendRecords)
            .sort((left, right) => left.name.localeCompare(right.name))
    };
};

const createBroadcastLinks = logicFlows => {
    const broadcastLinks = {};

    logicFlows.forEach(flow => {
        if (flow.trigger.messageName) {
            if (!broadcastLinks[flow.trigger.messageName]) {
                broadcastLinks[flow.trigger.messageName] = {
                    name: flow.trigger.messageName,
                    sends: [],
                    receives: []
                };
            }
            broadcastLinks[flow.trigger.messageName].receives.push(createScriptReference(flow));
        }

        flow.broadcastSends.forEach(message => {
            if (!broadcastLinks[message.name]) {
                broadcastLinks[message.name] = {
                    name: message.name,
                    sends: [],
                    receives: []
                };
            }
            broadcastLinks[message.name].sends.push(Object.assign(createScriptReference(flow), {
                count: message.count,
                blockIds: message.blockIds
            }));
        });
    });

    return Object.values(broadcastLinks)
        .sort((left, right) => left.name.localeCompare(right.name));
};

const summarizeScratchProject = vm => {
    const runtimeTargets = vm && vm.runtime && Array.isArray(vm.runtime.targets) ?
        vm.runtime.targets : [];
    const targets = runtimeTargets.filter(isOriginalTarget);

    const targetItems = [];
    const logicFlows = [];
    const eventHatCounts = {};
    const broadcastRecords = {};

    let visibleBlocks = 0;
    let shadowBlocks = 0;
    let scriptCount = 0;
    let eventHatCount = 0;
    let broadcastSendCount = 0;
    let broadcastReceiveCount = 0;

    targets.forEach(target => {
        const blockMap = readBlockMap(target);
        const blocks = Object.values(blockMap).filter(Boolean);
        const scriptIds = readScriptIds(target, blockMap);
        const visibleTargetBlocks = blocks.filter(block => !block.shadow);
        const targetEventHats = visibleTargetBlocks.filter(block => EVENT_HAT_OPCODES.has(block.opcode));
        const targetName = readTargetName(target);

        visibleBlocks += visibleTargetBlocks.length;
        shadowBlocks += blocks.length - visibleTargetBlocks.length;
        scriptCount += scriptIds.length;
        eventHatCount += targetEventHats.length;

        targetEventHats.forEach(block => {
            addCount(eventHatCounts, block.opcode);
        });

        visibleTargetBlocks.forEach(block => {
            if (BROADCAST_SEND_OPCODES.has(block.opcode)) {
                broadcastSendCount++;
                const messageName = readBroadcastName(block, blockMap);
                if (messageName) {
                    if (!broadcastRecords[messageName]) {
                        broadcastRecords[messageName] = createBroadcastRecord(messageName);
                    }
                    broadcastRecords[messageName].sends++;
                }
            } else if (block.opcode === 'event_whenbroadcastreceived') {
                broadcastReceiveCount++;
                const messageName = readBroadcastName(block, blockMap);
                if (messageName) {
                    if (!broadcastRecords[messageName]) {
                        broadcastRecords[messageName] = createBroadcastRecord(messageName);
                    }
                    broadcastRecords[messageName].receives++;
                }
            }
        });

        scriptIds.forEach((scriptId, index) => {
            const logicFlow = createLogicFlow(target, targetName, scriptId, index + 1, blockMap);
            if (logicFlow) logicFlows.push(logicFlow);
        });

        targetItems.push({
            id: target.id,
            name: targetName,
            isStage: !!target.isStage,
            blocks: visibleTargetBlocks.length,
            scripts: scriptIds.length,
            eventHats: targetEventHats.length
        });
    });

    const stageTarget = targets.find(target => target.isStage);
    const stageVariables = stageTarget && stageTarget.variables ? Object.values(stageTarget.variables) : [];
    stageVariables
        .filter(variable => variable.type === 'broadcast_msg')
        .forEach(variable => {
            if (!broadcastRecords[variable.name]) {
                broadcastRecords[variable.name] = createBroadcastRecord(variable.name);
            }
        });

    return {
        targets: {
            total: targets.length,
            sprites: targets.filter(target => !target.isStage).length,
            stage: targets.filter(target => target.isStage).length,
            items: targetItems
        },
        blocks: {
            total: visibleBlocks + shadowBlocks,
            visible: visibleBlocks,
            shadow: shadowBlocks,
            scripts: scriptCount
        },
        events: {
            hats: eventHatCount,
            eventHatCounts: Object.keys(eventHatCounts)
                .sort()
                .map(opcode => ({
                    opcode,
                    label: EVENT_HAT_LABELS[opcode] || opcode,
                    count: eventHatCounts[opcode]
                }))
        },
        broadcasts: {
            sends: broadcastSendCount,
            receives: broadcastReceiveCount,
            messages: Object.values(broadcastRecords)
                .sort((left, right) => left.name.localeCompare(right.name))
        },
        logic: {
            flows: logicFlows,
            broadcastLinks: createBroadcastLinks(logicFlows)
        }
    };
};

export {
    emptyProjectSummary,
    summarizeScratchProject
};

export default summarizeScratchProject;
