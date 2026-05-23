const DEFAULT_TEXT_LIMIT = 1200;
const SUMMARY_TEXT_LIMIT = 240;
const LIST_LIMIT = 5;

const FORBIDDEN_CONTEXT_FIELDS = Object.freeze([
    'rawProject',
    'projectJson',
    'fullProjectJson',
    'sb3',
    'assets',
    'assetData',
    'costumes',
    'sounds',
    'variables',
    'lists',
    'comments',
    'monitors',
    'targetId',
    'scriptId',
    'blockIds',
    'aiLog',
    'processLog',
    'logs',
    'studentName',
    'studentNames',
    'studentId',
    'studentEmail',
    'studentPhone',
    'classRoster',
    'roster',
    'apiKey',
    'providerKey',
    'token',
    'password',
    'secret'
]);

const FORBIDDEN_CONTEXT_FIELD_SET = new Set(
    FORBIDDEN_CONTEXT_FIELDS.map(field => field.toLowerCase())
);

const SENSITIVE_PATTERNS = Object.freeze([
    {
        pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/g,
        replacement: '[redacted-api-key]'
    },
    {
        pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
        replacement: 'Bearer [redacted-token]'
    },
    {
        pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        replacement: '[redacted-email]'
    },
    {
        pattern: /(?:\+?\d[\d\s().-]{7,}\d)/g,
        replacement: '[redacted-phone]'
    }
]);

const truncateText = (value, maxLength = DEFAULT_TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const redactSensitiveText = (value, maxLength = DEFAULT_TEXT_LIMIT) => {
    let redactedValue = truncateText(value, maxLength);
    SENSITIVE_PATTERNS.forEach(({pattern, replacement}) => {
        redactedValue = redactedValue.replace(pattern, replacement);
    });
    return redactedValue;
};

const readNumber = value => (Number.isFinite(value) ? value : 0);

const readArray = value => (Array.isArray(value) ? value : []);

const encodePathSegment = value => encodeURIComponent(String(value || 'unknown'));

const createPathId = (prefix, segments) => [prefix]
    .concat(segments || [])
    .map(encodePathSegment)
    .join(':');

const formatFlowEntry = flow => {
    const trigger = flow && flow.trigger ? flow.trigger : {};
    if (trigger.label && trigger.detail) return `${trigger.label} (${trigger.detail})`;
    return trigger.label || 'this event';
};

const createLogicFlowPathId = flow => {
    if (flow && flow.pathId) return flow.pathId;
    return createPathId('logicFlow', [
        flow && flow.id ? flow.id : `${flow && (flow.targetName || flow.targetLabel)}:${formatFlowEntry(flow)}`
    ]);
};

const createBroadcastPathId = message => createPathId('broadcast', [message]);

const findForbiddenContextPaths = (value, path = [], seen = new Set()) => {
    if (!value || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);

    const paths = [];
    Object.entries(value).forEach(([key, childValue]) => {
        const childPath = path.concat(key);
        if (FORBIDDEN_CONTEXT_FIELD_SET.has(key.toLowerCase())) {
            paths.push(childPath.join('.'));
            return;
        }
        paths.push(...findForbiddenContextPaths(childValue, childPath, seen));
    });
    return paths;
};

const minimizeGateDraft = gateDraft => ({
    goal: redactSensitiveText(gateDraft && gateDraft.goal),
    logic: redactSensitiveText(gateDraft && gateDraft.logic),
    evidence: redactSensitiveText(gateDraft && gateDraft.evidence)
});

const minimizeEvidenceChecklist = evidenceChecklist => {
    const items = readArray(evidenceChecklist && evidenceChecklist.items).slice(0, LIST_LIMIT).map(item => ({
        id: redactSensitiveText(item && item.id, SUMMARY_TEXT_LIMIT),
        pathId: redactSensitiveText(item && (item.pathId || (item.path && item.path.pathId)), SUMMARY_TEXT_LIMIT),
        score: readNumber(item && item.score),
        status: redactSensitiveText(item && item.status, SUMMARY_TEXT_LIMIT)
    }));

    return {
        score: readNumber(evidenceChecklist && evidenceChecklist.score),
        maxScore: readNumber(evidenceChecklist && evidenceChecklist.maxScore),
        passedCount: readNumber(evidenceChecklist && evidenceChecklist.passedCount),
        partialCount: readNumber(evidenceChecklist && evidenceChecklist.partialCount),
        missingCount: readNumber(evidenceChecklist && evidenceChecklist.missingCount),
        items
    };
};

const minimizeTrigger = trigger => ({
    opcode: redactSensitiveText(trigger && trigger.opcode, SUMMARY_TEXT_LIMIT),
    label: redactSensitiveText(trigger && trigger.label, SUMMARY_TEXT_LIMIT),
    detail: redactSensitiveText(trigger && trigger.detail, SUMMARY_TEXT_LIMIT)
});

const minimizeLogicFlow = flow => ({
    id: redactSensitiveText(flow && flow.id, SUMMARY_TEXT_LIMIT),
    pathId: redactSensitiveText(createLogicFlowPathId(flow), SUMMARY_TEXT_LIMIT),
    targetName: redactSensitiveText(flow && (flow.targetName || flow.targetLabel), SUMMARY_TEXT_LIMIT),
    scriptIndex: readNumber(flow && flow.scriptIndex),
    trigger: minimizeTrigger(flow && flow.trigger),
    blockCount: readNumber(flow && flow.blockCount),
    broadcastSends: readArray(flow && flow.broadcastSends).slice(0, LIST_LIMIT).map(message => ({
        name: redactSensitiveText(message && message.name, SUMMARY_TEXT_LIMIT),
        count: readNumber(message && message.count)
    }))
});

const minimizeBroadcastLink = link => ({
    name: redactSensitiveText(link && link.name, SUMMARY_TEXT_LIMIT),
    pathId: redactSensitiveText(link && (link.pathId || createBroadcastPathId(link.name)), SUMMARY_TEXT_LIMIT),
    sendCount: readArray(link && link.sends).length,
    receiveCount: readArray(link && link.receives).length
});

const minimizeProjectSummary = projectSummary => {
    const logic = projectSummary && projectSummary.logic ? projectSummary.logic : {};
    return {
        targets: {
            total: readNumber(projectSummary && projectSummary.targets && projectSummary.targets.total),
            sprites: readNumber(projectSummary && projectSummary.targets && projectSummary.targets.sprites)
        },
        blocks: {
            visible: readNumber(projectSummary && projectSummary.blocks && projectSummary.blocks.visible),
            scripts: readNumber(projectSummary && projectSummary.blocks && projectSummary.blocks.scripts)
        },
        events: {
            hats: readNumber(projectSummary && projectSummary.events && projectSummary.events.hats)
        },
        broadcasts: {
            sends: readNumber(projectSummary && projectSummary.broadcasts && projectSummary.broadcasts.sends),
            receives: readNumber(projectSummary && projectSummary.broadcasts && projectSummary.broadcasts.receives),
            messageCount: readArray(projectSummary && projectSummary.broadcasts && projectSummary.broadcasts.messages).length
        },
        logic: {
            flows: readArray(logic.flows).slice(0, LIST_LIMIT).map(minimizeLogicFlow),
            broadcastLinks: readArray(logic.broadcastLinks).slice(0, LIST_LIMIT).map(minimizeBroadcastLink)
        }
    };
};

const minimizeKnowledgePoint = point => ({
    id: redactSensitiveText(point && point.id, SUMMARY_TEXT_LIMIT),
    label: redactSensitiveText(point && point.label, SUMMARY_TEXT_LIMIT)
});

const minimizeTeacherQuestionRule = rule => ({
    knowledgePointId: redactSensitiveText(rule && rule.knowledgePointId, SUMMARY_TEXT_LIMIT),
    text: redactSensitiveText(rule && rule.text, SUMMARY_TEXT_LIMIT)
});

const minimizeTeacherRubricItem = item => ({
    knowledgePointId: redactSensitiveText(item && item.knowledgePointId, SUMMARY_TEXT_LIMIT),
    label: redactSensitiveText(item && item.label, SUMMARY_TEXT_LIMIT),
    criteria: redactSensitiveText(item && (item.criteria || item.focus), SUMMARY_TEXT_LIMIT),
    levels: readArray(item && item.levels)
        .slice(0, 4)
        .map(level => redactSensitiveText(level, SUMMARY_TEXT_LIMIT))
        .filter(Boolean)
});

const minimizeTeacherPolicySummary = teacherPolicy => {
    const selectedKnowledgePoints = readArray(teacherPolicy && teacherPolicy.selectedKnowledgePoints)
        .slice(0, LIST_LIMIT)
        .map(minimizeKnowledgePoint)
        .filter(point => point.id && point.label);
    const questionRules = readArray(teacherPolicy && teacherPolicy.questionRules)
        .slice(0, LIST_LIMIT)
        .map(minimizeTeacherQuestionRule)
        .filter(rule => rule.text);
    const rubric = readArray(teacherPolicy && teacherPolicy.rubric)
        .slice(0, LIST_LIMIT)
        .map(minimizeTeacherRubricItem)
        .filter(item => item.label && item.criteria);

    return {
        schemaVersion: 'scratch-ai-teacher-policy-summary-v1',
        active: teacherPolicy && teacherPolicy.active === true && selectedKnowledgePoints.length > 0,
        source: redactSensitiveText(teacherPolicy && teacherPolicy.source, SUMMARY_TEXT_LIMIT),
        title: redactSensitiveText(teacherPolicy && teacherPolicy.title, SUMMARY_TEXT_LIMIT),
        gradeBand: redactSensitiveText(teacherPolicy && teacherPolicy.gradeBand, SUMMARY_TEXT_LIMIT),
        selectedKnowledgePoints,
        promptContract: readArray(teacherPolicy && teacherPolicy.promptContract)
            .slice(0, LIST_LIMIT)
            .map(item => redactSensitiveText(item, SUMMARY_TEXT_LIMIT))
            .filter(Boolean),
        questionRules,
        rubric,
        safeguards: {
            classRosterIncluded: false,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            writesToSb3: false
        }
    };
};

const minimizeModelRequestPayload = request => ({
    studentText: redactSensitiveText(request && request.studentText),
    gateDraft: minimizeGateDraft(request && request.gateDraft),
    evidenceChecklist: minimizeEvidenceChecklist(request && request.evidenceChecklist),
    projectSummary: minimizeProjectSummary(request && request.projectSummary),
    teacherPolicy: minimizeTeacherPolicySummary(request && request.teacherPolicy)
});

const createModelRequestSafetyGate = (request = {}) => {
    const blockedReasons = findForbiddenContextPaths(request).map(path => `forbidden-context:${path}`);

    if (request.modelConsent !== true) {
        blockedReasons.push('missing-model-consent');
    }

    const minimizedRequest = minimizeModelRequestPayload(request);
    const minimizedJson = JSON.stringify(minimizedRequest);

    return {
        allowed: blockedReasons.length === 0,
        blockedReasons,
        minimizedRequest,
        redactionApplied: minimizedJson.indexOf('[redacted-') !== -1 ||
            minimizedJson.indexOf('Bearer [redacted-token]') !== -1
    };
};

const createSafetyGatePublicSummary = safetyGate => ({
    allowed: safetyGate.allowed,
    blockedReasons: safetyGate.blockedReasons,
    redactionApplied: safetyGate.redactionApplied,
    minimized: true
});

export {
    FORBIDDEN_CONTEXT_FIELDS,
    createModelRequestSafetyGate,
    createSafetyGatePublicSummary,
    minimizeModelRequestPayload,
    minimizeTeacherPolicySummary,
    redactSensitiveText,
    truncateText
};
