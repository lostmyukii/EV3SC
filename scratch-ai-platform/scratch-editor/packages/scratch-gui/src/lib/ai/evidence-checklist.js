import {getExplainGateState} from './explain-gate-state.js';

const EVIDENCE_CHECK_STATUSES = Object.freeze({
    PASS: 'pass',
    PARTIAL: 'partial',
    MISSING: 'missing'
});

const EVIDENCE_STATUS_SCORES = Object.freeze({
    [EVIDENCE_CHECK_STATUSES.PASS]: 1,
    [EVIDENCE_CHECK_STATUSES.PARTIAL]: 0.5,
    [EVIDENCE_CHECK_STATUSES.MISSING]: 0
});

const AI_LOGIC_PATH_TYPES = Object.freeze({
    EXPLAIN_GATE: 'explainGate',
    LOGIC_GRAPH: 'logicGraph',
    LOGIC_FLOW: 'logicFlow',
    BROADCAST_LINK: 'broadcastLink',
    REVIEW_BRIDGE: 'reviewBridge'
});

const LOGIC_GRAPH_PATH_KINDS = Object.freeze({
    EVENT_ENTRY: 'eventEntry',
    BROADCAST_CLOSURE: 'broadcastClosure'
});

const CHECKLIST_ITEM_IDS = Object.freeze({
    GOAL: 'gate.goal',
    LOGIC: 'gate.logic',
    EVIDENCE: 'gate.evidence',
    EVENT_ENTRY: 'logic.eventEntry',
    BROADCAST_CLOSURE: 'logic.broadcastClosure'
});

const EMPTY_LOGIC = Object.freeze({
    flows: [],
    broadcastLinks: []
});

const CHECKLIST_TEMPLATES = Object.freeze({
    [CHECKLIST_ITEM_IDS.GOAL]: {
        id: CHECKLIST_ITEM_IDS.GOAL,
        messageId: 'gui.aiLogicCoach.checkGoal',
        defaultMessage: 'What I want'
    },
    [CHECKLIST_ITEM_IDS.LOGIC]: {
        id: CHECKLIST_ITEM_IDS.LOGIC,
        messageId: 'gui.aiLogicCoach.checkLogic',
        defaultMessage: 'How it works'
    },
    [CHECKLIST_ITEM_IDS.EVIDENCE]: {
        id: CHECKLIST_ITEM_IDS.EVIDENCE,
        messageId: 'gui.aiLogicCoach.checkEvidence',
        defaultMessage: 'How I will check'
    },
    [CHECKLIST_ITEM_IDS.EVENT_ENTRY]: {
        id: CHECKLIST_ITEM_IDS.EVENT_ENTRY,
        messageId: 'gui.aiLogicCoach.checkEventEntry',
        defaultMessage: 'Start block'
    },
    [CHECKLIST_ITEM_IDS.BROADCAST_CLOSURE]: {
        id: CHECKLIST_ITEM_IDS.BROADCAST_CLOSURE,
        messageId: 'gui.aiLogicCoach.checkBroadcastClosure',
        defaultMessage: 'Message check'
    }
});

const GOAL_OUTCOME_MARKERS = Object.freeze([
    'make',
    'show',
    'help',
    'let',
    'give',
    'feedback',
    'score',
    'start',
    'remind',
    '实现',
    '制作',
    '显示',
    '帮助',
    '让',
    '提醒',
    '反馈',
    '得分',
    '开始'
]);

const LOGIC_INPUT_MARKERS = Object.freeze([
    'input',
    'click',
    'press',
    'when',
    'key',
    'answer',
    'green flag',
    'broadcast',
    '输入',
    '点击',
    '按下',
    '当',
    '答案',
    '绿旗',
    '广播',
    '选择'
]);

const LOGIC_RULE_MARKERS = Object.freeze([
    'if',
    'when',
    'repeat',
    'until',
    'then',
    'rule',
    'condition',
    'check',
    'start',
    'send',
    '如果',
    '当',
    '重复',
    '直到',
    '规则',
    '条件',
    '判断',
    '检查',
    '发送'
]);

const LOGIC_OUTPUT_MARKERS = Object.freeze([
    'output',
    'say',
    'show',
    'change',
    'move',
    'feedback',
    'result',
    'score',
    'start',
    '显示',
    '说',
    '改变',
    '移动',
    '反馈',
    '结果',
    '得分',
    '倒计时'
]);

const LOGIC_EDGE_MARKERS = Object.freeze([
    'wrong',
    'zero',
    'empty',
    'otherwise',
    'else',
    'limit',
    'boundary',
    'edge',
    '错误',
    '为0',
    '空',
    '否则',
    '边界',
    '没有',
    '超时'
]);

const EVIDENCE_INPUT_MARKERS = Object.freeze([
    'input',
    'try',
    'click',
    'press',
    'answer',
    'green flag',
    'run',
    '输入',
    '尝试',
    '点击',
    '按下',
    '答案',
    '绿旗',
    '运行'
]);

const EVIDENCE_EXPECTED_MARKERS = Object.freeze([
    'expect',
    'should',
    'see',
    'observe',
    'result',
    'right',
    'wrong',
    '预期',
    '应该',
    '看到',
    '观察',
    '结果',
    '正确',
    '错误'
]);

const isTextComplete = value => typeof value === 'string' && value.trim().length > 0;

const normalizeText = value => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const hasAnyMarker = (value, markers) => {
    const normalizedValue = normalizeText(value);
    return markers.some(marker => normalizedValue.indexOf(marker.toLowerCase()) !== -1);
};

const countTrue = values => values.filter(Boolean).length;

const encodePathSegment = value => encodeURIComponent(String(value || 'unknown'));

const createPathId = (prefix, segments) => [prefix]
    .concat(segments || [])
    .map(encodePathSegment)
    .join(':');

const readLogic = projectSummary => (
    projectSummary && projectSummary.logic ? projectSummary.logic : EMPTY_LOGIC
);

const readFlows = projectSummary => {
    const logic = readLogic(projectSummary);
    return Array.isArray(logic.flows) ? logic.flows : [];
};

const readBroadcastLinks = projectSummary => {
    const logic = readLogic(projectSummary);
    return Array.isArray(logic.broadcastLinks) ? logic.broadcastLinks : [];
};

const formatFlowEntry = flow => {
    const trigger = flow && flow.trigger ? flow.trigger : {};
    if (trigger.label && trigger.detail) return `${trigger.label} (${trigger.detail})`;
    return trigger.label || 'this event';
};

const createExplainGatePath = field => ({
    type: AI_LOGIC_PATH_TYPES.EXPLAIN_GATE,
    field,
    pathId: createPathId('gate', [field])
});

const createLogicGraphPath = kind => ({
    type: AI_LOGIC_PATH_TYPES.LOGIC_GRAPH,
    kind,
    pathId: createPathId('logicGraph', [kind])
});

const createLogicFlowPath = flow => ({
    type: AI_LOGIC_PATH_TYPES.LOGIC_FLOW,
    flowId: flow && flow.id,
    targetName: flow && flow.targetName,
    entry: formatFlowEntry(flow),
    pathId: createPathId('logicFlow', [
        flow && flow.id ? flow.id : `${flow && flow.targetName}:${formatFlowEntry(flow)}`
    ])
});

const createBroadcastLinkPath = message => ({
    type: AI_LOGIC_PATH_TYPES.BROADCAST_LINK,
    message,
    pathId: createPathId('broadcast', [message])
});

const createReviewBridgePath = () => ({
    type: AI_LOGIC_PATH_TYPES.REVIEW_BRIDGE,
    pathId: createPathId('reviewBridge')
});

const isUnmatchedSend = link => (
    Array.isArray(link.sends) &&
    link.sends.length > 0 &&
    (!Array.isArray(link.receives) || link.receives.length === 0)
);

const isUnmatchedReceive = link => (
    Array.isArray(link.receives) &&
    link.receives.length > 0 &&
    (!Array.isArray(link.sends) || link.sends.length === 0)
);

const findFirstOpenBroadcastLink = broadcastLinks => broadcastLinks.find(link => (
    isUnmatchedSend(link) || isUnmatchedReceive(link)
));

const createChecklistItem = (itemId, status, path, values) => {
    const template = CHECKLIST_TEMPLATES[itemId];
    return {
        id: template.id,
        messageId: template.messageId,
        defaultMessage: template.defaultMessage,
        status,
        score: EVIDENCE_STATUS_SCORES[status],
        path,
        values: values || {}
    };
};

const createGoalItem = gateDraft => {
    const hasGoal = isTextComplete(gateDraft.goal);
    const hasObservableOutcome = hasAnyMarker(gateDraft.goal, GOAL_OUTCOME_MARKERS);
    const isSpecific = normalizeText(gateDraft.goal).length >= 12 && hasObservableOutcome;
    let status = EVIDENCE_CHECK_STATUSES.MISSING;

    if (isSpecific) {
        status = EVIDENCE_CHECK_STATUSES.PASS;
    } else if (hasGoal) {
        status = EVIDENCE_CHECK_STATUSES.PARTIAL;
    }

    return createChecklistItem(
        CHECKLIST_ITEM_IDS.GOAL,
        status,
        createExplainGatePath('goal')
    );
};

const createLogicItem = gateDraft => {
    const hasLogic = isTextComplete(gateDraft.logic);
    const signalCount = countTrue([
        hasAnyMarker(gateDraft.logic, LOGIC_INPUT_MARKERS),
        hasAnyMarker(gateDraft.logic, LOGIC_RULE_MARKERS),
        hasAnyMarker(gateDraft.logic, LOGIC_OUTPUT_MARKERS),
        hasAnyMarker(gateDraft.logic, LOGIC_EDGE_MARKERS)
    ]);
    let status = EVIDENCE_CHECK_STATUSES.MISSING;

    if (hasLogic && signalCount >= 3) {
        status = EVIDENCE_CHECK_STATUSES.PASS;
    } else if (hasLogic) {
        status = EVIDENCE_CHECK_STATUSES.PARTIAL;
    }

    return createChecklistItem(
        CHECKLIST_ITEM_IDS.LOGIC,
        status,
        createExplainGatePath('logic')
    );
};

const createEvidenceItem = gateDraft => {
    const hasEvidence = isTextComplete(gateDraft.evidence);
    const hasInput = hasAnyMarker(gateDraft.evidence, EVIDENCE_INPUT_MARKERS);
    const hasExpectedResult = hasAnyMarker(gateDraft.evidence, EVIDENCE_EXPECTED_MARKERS);
    let status = EVIDENCE_CHECK_STATUSES.MISSING;

    if (hasEvidence && gateDraft.evidence.trim().length >= 16 && hasInput && hasExpectedResult) {
        status = EVIDENCE_CHECK_STATUSES.PASS;
    } else if (hasEvidence) {
        status = EVIDENCE_CHECK_STATUSES.PARTIAL;
    }

    return createChecklistItem(
        CHECKLIST_ITEM_IDS.EVIDENCE,
        status,
        createExplainGatePath('evidence')
    );
};

const createEventEntryItem = flows => createChecklistItem(
    CHECKLIST_ITEM_IDS.EVENT_ENTRY,
    flows.length > 0 ? EVIDENCE_CHECK_STATUSES.PASS : EVIDENCE_CHECK_STATUSES.MISSING,
    flows.length > 0 ?
        createLogicFlowPath(flows[0]) :
        createLogicGraphPath(LOGIC_GRAPH_PATH_KINDS.EVENT_ENTRY)
);

const createBroadcastClosureItem = broadcastLinks => {
    const firstOpenLink = findFirstOpenBroadcastLink(broadcastLinks);
    return createChecklistItem(
        CHECKLIST_ITEM_IDS.BROADCAST_CLOSURE,
        firstOpenLink ? EVIDENCE_CHECK_STATUSES.MISSING : EVIDENCE_CHECK_STATUSES.PASS,
        firstOpenLink ?
            createBroadcastLinkPath(firstOpenLink.name) :
            createLogicGraphPath(LOGIC_GRAPH_PATH_KINDS.BROADCAST_CLOSURE),
        firstOpenLink ? {message: firstOpenLink.name} : {}
    );
};

const scoreEvidenceChecklist = ({
    gateDraft = {},
    gateReviewed = false,
    gateState,
    projectSummary = {}
} = {}) => {
    const resolvedGateState = gateState || getExplainGateState(gateDraft, gateReviewed);
    const flows = readFlows(projectSummary);
    const broadcastLinks = readBroadcastLinks(projectSummary);
    const items = [
        createGoalItem(gateDraft),
        createLogicItem(gateDraft),
        createEvidenceItem(gateDraft),
        createEventEntryItem(flows),
        createBroadcastClosureItem(broadcastLinks)
    ];
    const score = items.reduce((total, item) => total + item.score, 0);

    return {
        gateState: resolvedGateState,
        items,
        score,
        maxScore: items.length,
        passedCount: items.filter(item => item.status === EVIDENCE_CHECK_STATUSES.PASS).length,
        partialCount: items.filter(item => item.status === EVIDENCE_CHECK_STATUSES.PARTIAL).length,
        missingCount: items.filter(item => item.status === EVIDENCE_CHECK_STATUSES.MISSING).length
    };
};

export {
    AI_LOGIC_PATH_TYPES,
    CHECKLIST_ITEM_IDS,
    EVIDENCE_CHECK_STATUSES,
    EVIDENCE_STATUS_SCORES,
    LOGIC_GRAPH_PATH_KINDS,
    createPathId,
    createBroadcastLinkPath,
    createExplainGatePath,
    createLogicFlowPath,
    createLogicGraphPath,
    createReviewBridgePath,
    scoreEvidenceChecklist
};

export default scoreEvidenceChecklist;
