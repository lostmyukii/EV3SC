const BLOCK_DRAFT_STATUS = Object.freeze({
    EMPTY: 'empty',
    READY: 'ready'
});

const BLOCK_DRAFT_CONCEPTS = Object.freeze({
    BROADCAST: 'broadcast',
    CONDITION: 'condition',
    EVENT: 'event',
    INPUT: 'input',
    LOOP: 'loop',
    OUTPUT: 'output',
    SEQUENCE: 'sequence',
    VARIABLE: 'variable'
});

const CONCEPT_ORDER = Object.freeze([
    BLOCK_DRAFT_CONCEPTS.EVENT,
    BLOCK_DRAFT_CONCEPTS.SEQUENCE,
    BLOCK_DRAFT_CONCEPTS.INPUT,
    BLOCK_DRAFT_CONCEPTS.CONDITION,
    BLOCK_DRAFT_CONCEPTS.LOOP,
    BLOCK_DRAFT_CONCEPTS.VARIABLE,
    BLOCK_DRAFT_CONCEPTS.BROADCAST,
    BLOCK_DRAFT_CONCEPTS.OUTPUT
]);

const INPUT_MARKERS = Object.freeze([
    'answer',
    'ask',
    'input',
    'key',
    'press',
    'type',
    '输入',
    '答案',
    '按键',
    '按下',
    '提问'
]);

const CONDITION_MARKERS = Object.freeze([
    'if',
    'check',
    'right',
    'wrong',
    'correct',
    'else',
    '判断',
    '如果',
    '答对',
    '答错',
    '正确',
    '错误',
    '否则'
]);

const LOOP_MARKERS = Object.freeze([
    'repeat',
    'forever',
    'until',
    'loop',
    'countdown',
    '重复',
    '循环',
    '直到',
    '一直',
    '倒计时'
]);

const VARIABLE_MARKERS = Object.freeze([
    'score',
    'variable',
    'points',
    'number',
    'add',
    '分数',
    '变量',
    '得分',
    '数字',
    '加',
    '相加'
]);

const BROADCAST_MARKERS = Object.freeze([
    'broadcast',
    'message',
    'send',
    'receive',
    '广播',
    '消息',
    '发送',
    '接收',
    '接住'
]);

const OUTPUT_MARKERS = Object.freeze([
    'say',
    'show',
    'move',
    'change',
    'sound',
    'backdrop',
    '显示',
    '说',
    '移动',
    '改变',
    '声音',
    '背景'
]);

const readText = value => (typeof value === 'string' ? value.trim() : '');

const normalizeText = value => readText(value).toLowerCase();

const hasAnyMarker = (text, markers) => {
    const normalizedText = normalizeText(text);
    return markers.some(marker => normalizedText.indexOf(marker.toLowerCase()) !== -1);
};

const readGateDraft = gateDraft => ({
    evidence: readText(gateDraft && gateDraft.evidence),
    goal: readText(gateDraft && gateDraft.goal),
    logic: readText(gateDraft && gateDraft.logic)
});

const hasAnyDraftText = draft => Boolean(draft.goal || draft.logic || draft.evidence);

const readTargets = projectSummary => {
    const targets = projectSummary && projectSummary.targets;
    return targets && Array.isArray(targets.items) ? targets.items : [];
};

const readTargetName = projectSummary => {
    const targets = readTargets(projectSummary);
    const sprite = targets.find(target => target && !target.isStage);
    const target = sprite || targets[0];
    return target && target.name ? target.name : 'Sprite';
};

const readBroadcastNames = projectSummary => {
    const broadcasts = projectSummary && projectSummary.broadcasts;
    const messages = broadcasts && Array.isArray(broadcasts.messages) ? broadcasts.messages : [];
    return messages
        .map(message => message && message.name)
        .filter(name => typeof name === 'string' && name.trim())
        .slice(0, 3);
};

const chooseStartIdea = text => {
    if (hasAnyMarker(text, ['click', 'clicked', '点击'])) return 'click or green flag';
    if (hasAnyMarker(text, ['key', 'press', 'space', '按键', '按下', '空格'])) return 'key press or green flag';
    return 'green flag or another start event';
};

const addConcept = (conceptIds, conceptId) => {
    if (!conceptIds.includes(conceptId)) {
        conceptIds.push(conceptId);
    }
};

const createConceptIds = ({
    draft,
    projectSummary
}) => {
    const text = `${draft.goal} ${draft.logic} ${draft.evidence}`;
    const conceptIds = [];
    const broadcastNames = readBroadcastNames(projectSummary);

    addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.EVENT);
    addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.SEQUENCE);

    if (hasAnyMarker(text, INPUT_MARKERS)) addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.INPUT);
    if (hasAnyMarker(text, CONDITION_MARKERS)) addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.CONDITION);
    if (hasAnyMarker(text, LOOP_MARKERS)) addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.LOOP);
    if (hasAnyMarker(text, VARIABLE_MARKERS)) addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.VARIABLE);
    if (hasAnyMarker(text, BROADCAST_MARKERS) || broadcastNames.length) {
        addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.BROADCAST);
    }
    if (hasAnyMarker(text, OUTPUT_MARKERS) || draft.goal) addConcept(conceptIds, BLOCK_DRAFT_CONCEPTS.OUTPUT);

    return CONCEPT_ORDER.filter(conceptId => conceptIds.includes(conceptId));
};

const createConceptRecords = conceptIds => conceptIds.map(conceptId => ({
    id: conceptId,
    messageId: `gui.aiLogicCoach.blockDraftConcept.${conceptId}`
}));

const createStep = (conceptId, values) => ({
    concept: conceptId,
    id: `draft.${conceptId}`,
    messageId: `gui.aiLogicCoach.blockDraftStep.${conceptId}`,
    values: values || {}
});

const createSteps = ({
    conceptIds,
    draft,
    projectSummary,
    targetName
}) => {
    const text = `${draft.goal} ${draft.logic} ${draft.evidence}`;
    const broadcastNames = readBroadcastNames(projectSummary);
    const firstMessage = broadcastNames[0] || 'new message';

    return conceptIds.map(conceptId => {
        if (conceptId === BLOCK_DRAFT_CONCEPTS.EVENT) {
            return createStep(conceptId, {
                start: chooseStartIdea(text),
                target: targetName
            });
        }
        if (conceptId === BLOCK_DRAFT_CONCEPTS.SEQUENCE) {
            return createStep(conceptId, {
                target: targetName
            });
        }
        if (conceptId === BLOCK_DRAFT_CONCEPTS.INPUT) {
            return createStep(conceptId, {
                input: 'answer, key, or click'
            });
        }
        if (conceptId === BLOCK_DRAFT_CONCEPTS.CONDITION) {
            return createStep(conceptId, {
                condition: 'the rule you described'
            });
        }
        if (conceptId === BLOCK_DRAFT_CONCEPTS.LOOP) {
            return createStep(conceptId, {
                loop: 'repeat or wait-until'
            });
        }
        if (conceptId === BLOCK_DRAFT_CONCEPTS.VARIABLE) {
            return createStep(conceptId, {
                variable: 'score, answer, or number'
            });
        }
        if (conceptId === BLOCK_DRAFT_CONCEPTS.BROADCAST) {
            return createStep(conceptId, {
                message: firstMessage
            });
        }
        return createStep(BLOCK_DRAFT_CONCEPTS.OUTPUT, {
            output: 'say, show, move, or change'
        });
    });
};

const createJsonPlan = ({
    concepts,
    draft,
    steps,
    targetName
}) => ({
    previewOnly: true,
    insertIntoWorkspace: false,
    completeScript: false,
    source: 'explainGate',
    target: targetName,
    sourceFields: {
        evidence: Boolean(draft.evidence),
        goal: Boolean(draft.goal),
        logic: Boolean(draft.logic)
    },
    concepts: concepts.map(concept => concept.id),
    draftBlocks: steps.map(step => ({
        kind: step.concept,
        purpose: step.id,
        previewOnly: true
    })),
    requiresStudentReview: true
});

const escapeAttribute = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const createBlocklyOutline = ({
    steps,
    targetName
}) => {
    const openingTag = [
        '<block-draft previewOnly="true"',
        'insertIntoWorkspace="false"',
        'completeScript="false"',
        `target="${escapeAttribute(targetName)}">`
    ].join(' ');

    return [
        openingTag,
        ...steps.map(step => (
            `  <concept kind="${escapeAttribute(step.concept)}" purpose="${escapeAttribute(step.id)}" />`
        )),
        '</block-draft>'
    ].join('\n');
};

const createNlBlocksDraft = ({
    gateDraft = {},
    projectSummary = {}
} = {}) => {
    const draft = readGateDraft(gateDraft);

    if (!hasAnyDraftText(draft)) {
        return {
            blocklyOutline: '',
            concepts: [],
            jsonPlan: '',
            status: BLOCK_DRAFT_STATUS.EMPTY,
            steps: [],
            values: {
                concepts: 0,
                steps: 0,
                target: readTargetName(projectSummary)
            }
        };
    }

    const targetName = readTargetName(projectSummary);
    const conceptIds = createConceptIds({
        draft,
        projectSummary
    });
    const concepts = createConceptRecords(conceptIds);
    const steps = createSteps({
        conceptIds,
        draft,
        projectSummary,
        targetName
    });
    const jsonPlan = createJsonPlan({
        concepts,
        draft,
        steps,
        targetName
    });

    return {
        blocklyOutline: createBlocklyOutline({
            steps,
            targetName
        }),
        concepts,
        jsonPlan: JSON.stringify(jsonPlan, null, 2),
        status: BLOCK_DRAFT_STATUS.READY,
        steps,
        values: {
            concepts: concepts.length,
            steps: steps.length,
            target: targetName
        }
    };
};

export {
    BLOCK_DRAFT_CONCEPTS,
    BLOCK_DRAFT_STATUS,
    createNlBlocksDraft
};

export default createNlBlocksDraft;
