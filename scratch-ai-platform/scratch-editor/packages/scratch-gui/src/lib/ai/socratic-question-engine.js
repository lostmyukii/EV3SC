import {
    EXPLAIN_GATE_STATES,
    getExplainGateState
} from './explain-gate-state.js';
import {
    LOGIC_GRAPH_PATH_KINDS,
    createBroadcastLinkPath,
    createExplainGatePath,
    createLogicFlowPath,
    createLogicGraphPath,
    createReviewBridgePath
} from './evidence-checklist.js';

const SOCRATIC_QUESTION_CATEGORIES = Object.freeze({
    EXPLAIN: 'explain',
    CHECK: 'check',
    EVIDENCE: 'evidence'
});

const DEFAULT_MAX_QUESTIONS = 4;
const TEACHER_QUESTION_LIMIT = 3;

const EMPTY_LOGIC = Object.freeze({
    flows: [],
    broadcastLinks: []
});

const QUESTION_TEMPLATES = Object.freeze({
    GOAL_MISSING: {
        ruleId: 'gate.goal.missing',
        category: SOCRATIC_QUESTION_CATEGORIES.EXPLAIN,
        messageId: 'gui.aiLogicCoach.questionGoalMissing',
        defaultMessage: 'When your project works, what should we see?'
    },
    LOGIC_MISSING: {
        ruleId: 'gate.logic.missing',
        category: SOCRATIC_QUESTION_CATEGORIES.EXPLAIN,
        messageId: 'gui.aiLogicCoach.questionLogicMissing',
        defaultMessage: 'What starts first? What does your program check? What happens next?'
    },
    EVIDENCE_MISSING: {
        ruleId: 'gate.evidence.missing',
        category: SOCRATIC_QUESTION_CATEGORIES.EVIDENCE,
        messageId: 'gui.aiLogicCoach.questionEvidenceMissing',
        defaultMessage: 'What will you try to make sure it works?'
    },
    NO_LOGIC_FLOWS: {
        ruleId: 'logic.flows.missing',
        category: SOCRATIC_QUESTION_CATEGORIES.CHECK,
        messageId: 'gui.aiLogicCoach.questionNoLogicFlows',
        defaultMessage: 'I do not see a starting block yet. Which block should start this part?'
    },
    FLOW_EXPLAIN: {
        ruleId: 'logic.flow.explain',
        category: SOCRATIC_QUESTION_CATEGORIES.EXPLAIN,
        messageId: 'gui.aiLogicCoach.questionFlowExplain',
        defaultMessage: 'Look at {target}: {entry}. What job does this script do?'
    },
    UNMATCHED_SEND: {
        ruleId: 'logic.broadcast.unmatchedSend',
        category: SOCRATIC_QUESTION_CATEGORIES.CHECK,
        messageId: 'gui.aiLogicCoach.questionUnmatchedBroadcastSend',
        defaultMessage: 'The message "{message}" is sent, but nothing catches it. Should a sprite catch it?'
    },
    UNMATCHED_RECEIVE: {
        ruleId: 'logic.broadcast.unmatchedReceive',
        category: SOCRATIC_QUESTION_CATEGORIES.CHECK,
        messageId: 'gui.aiLogicCoach.questionUnmatchedBroadcastReceive',
        defaultMessage: 'A script is waiting for "{message}", but nothing sends it. What should send it?'
    },
    TRACE_BROADCAST: {
        ruleId: 'logic.broadcast.trace',
        category: SOCRATIC_QUESTION_CATEGORIES.EVIDENCE,
        messageId: 'gui.aiLogicCoach.questionTraceBroadcast',
        defaultMessage: 'When "{message}" is sent, what should the sprite do or show?'
    },
    SCRIPT_OUTPUT: {
        ruleId: 'logic.flow.output',
        category: SOCRATIC_QUESTION_CATEGORIES.EVIDENCE,
        messageId: 'gui.aiLogicCoach.questionScriptOutput',
        defaultMessage: 'After {target} starts with {entry}, what should you see on the stage?'
    },
    EVIDENCE_DETAIL: {
        ruleId: 'gate.evidence.detail',
        category: SOCRATIC_QUESTION_CATEGORIES.EVIDENCE,
        messageId: 'gui.aiLogicCoach.questionEvidenceDetail',
        defaultMessage: 'Can you write one thing to try and what should happen?'
    },
    READY_CHECK: {
        ruleId: 'gate.ready.check',
        category: SOCRATIC_QUESTION_CATEGORIES.CHECK,
        messageId: 'gui.aiLogicCoach.questionReadyCheck',
        defaultMessage: 'Before you check it, which script best shows your idea?'
    },
    REVIEWED_TRANSFER: {
        ruleId: 'gate.reviewed.transfer',
        category: SOCRATIC_QUESTION_CATEGORIES.EVIDENCE,
        messageId: 'gui.aiLogicCoach.questionReviewedTransfer',
        defaultMessage: 'Pick one thing you said, then point to the script that proves it.'
    }
});

const isTextComplete = value => typeof value === 'string' && value.trim().length > 0;

const isEvidenceThin = value => {
    if (!isTextComplete(value)) return false;
    return value.trim().length < 16;
};

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

const createQuestion = (template, values, path) => ({
    id: template.ruleId,
    ruleId: template.ruleId,
    category: template.category,
    messageId: template.messageId,
    defaultMessage: template.defaultMessage,
    path,
    values: values || {}
});

const createTeacherPolicyQuestion = (rule, index, pointLabel) => ({
    id: `teacher.knowledge.${rule.knowledgePointId || 'locked'}-${index + 1}`,
    ruleId: `teacher.knowledge.${rule.knowledgePointId || 'locked'}-${index + 1}`,
    category: SOCRATIC_QUESTION_CATEGORIES.EXPLAIN,
    messageId: 'gui.aiLogicCoach.teacherLockedQuestion',
    defaultMessage: pointLabel ? `${pointLabel}: ${rule.text}` : rule.text,
    text: pointLabel ? `${pointLabel}: ${rule.text}` : rule.text,
    path: createExplainGatePath('logic'),
    values: {
        label: pointLabel || '',
        question: rule.text
    }
});

const addQuestion = (questions, template, values, path) => {
    if (questions.some(question => question.ruleId === template.ruleId)) return;
    questions.push(createQuestion(template, values, path));
};

const findUnmatchedBroadcastSend = broadcastLinks => broadcastLinks.find(link => (
    Array.isArray(link.sends) &&
    link.sends.length > 0 &&
    (!Array.isArray(link.receives) || link.receives.length === 0)
));

const findUnmatchedBroadcastReceive = broadcastLinks => broadcastLinks.find(link => (
    Array.isArray(link.receives) &&
    link.receives.length > 0 &&
    (!Array.isArray(link.sends) || link.sends.length === 0)
));

const findConnectedBroadcast = broadcastLinks => broadcastLinks.find(link => (
    Array.isArray(link.sends) &&
    link.sends.length > 0 &&
    Array.isArray(link.receives) &&
    link.receives.length > 0
));

const findFlowWithoutBroadcast = flows => flows.find(flow => (
    !Array.isArray(flow.broadcastSends) || flow.broadcastSends.length === 0
));

const createFlowValues = flow => ({
    entry: formatFlowEntry(flow),
    target: flow && flow.targetName ? flow.targetName : 'this target'
});

const createTeacherPolicyQuestions = teacherPolicy => {
    if (!teacherPolicy || teacherPolicy.active !== true) return [];
    const selectedKnowledgePoints = Array.isArray(teacherPolicy.selectedKnowledgePoints) ?
        teacherPolicy.selectedKnowledgePoints :
        [];
    const labelById = new Map(selectedKnowledgePoints.map(point => [point.id, point.label]));
    const questionRules = Array.isArray(teacherPolicy.questionRules) ? teacherPolicy.questionRules : [];

    return questionRules
        .filter(rule => rule && rule.text)
        .slice(0, TEACHER_QUESTION_LIMIT)
        .map((rule, index) => createTeacherPolicyQuestion(
            rule,
            index,
            labelById.get(rule.knowledgePointId)
        ));
};

const generateSocraticQuestions = ({
    gateDraft = {},
    gateReviewed = false,
    gateState,
    projectSummary = {},
    teacherPolicy = null,
    maxQuestions = DEFAULT_MAX_QUESTIONS
} = {}) => {
    const resolvedGateState = gateState || getExplainGateState(gateDraft, gateReviewed);
    const hasGoal = isTextComplete(gateDraft.goal);
    const hasLogic = isTextComplete(gateDraft.logic);
    const hasEvidence = isTextComplete(gateDraft.evidence);
    const flows = readFlows(projectSummary);
    const broadcastLinks = readBroadcastLinks(projectSummary);
    const questions = createTeacherPolicyQuestions(teacherPolicy);

    if (!hasGoal) {
        addQuestion(
            questions,
            QUESTION_TEMPLATES.GOAL_MISSING,
            {},
            createExplainGatePath('goal')
        );
    }
    if (!hasLogic) {
        addQuestion(
            questions,
            QUESTION_TEMPLATES.LOGIC_MISSING,
            {},
            createExplainGatePath('logic')
        );
    }
    if (!hasEvidence) {
        addQuestion(
            questions,
            QUESTION_TEMPLATES.EVIDENCE_MISSING,
            {},
            createExplainGatePath('evidence')
        );
    }

    if (flows.length > 0) {
        const firstFlow = flows[0];
        const unmatchedSend = findUnmatchedBroadcastSend(broadcastLinks);
        const unmatchedReceive = findUnmatchedBroadcastReceive(broadcastLinks);
        const connectedBroadcast = findConnectedBroadcast(broadcastLinks);
        const flowWithoutBroadcast = findFlowWithoutBroadcast(flows);

        if (hasGoal && !hasLogic) {
            addQuestion(
                questions,
                QUESTION_TEMPLATES.FLOW_EXPLAIN,
                createFlowValues(firstFlow),
                createLogicFlowPath(firstFlow)
            );
        }
        if (unmatchedSend) {
            addQuestion(
                questions,
                QUESTION_TEMPLATES.UNMATCHED_SEND,
                {message: unmatchedSend.name},
                createBroadcastLinkPath(unmatchedSend.name)
            );
        }
        if (unmatchedReceive) {
            addQuestion(
                questions,
                QUESTION_TEMPLATES.UNMATCHED_RECEIVE,
                {message: unmatchedReceive.name},
                createBroadcastLinkPath(unmatchedReceive.name)
            );
        }
        if (
            resolvedGateState === EXPLAIN_GATE_STATES.READY &&
            !unmatchedSend &&
            !unmatchedReceive
        ) {
            addQuestion(
                questions,
                QUESTION_TEMPLATES.READY_CHECK,
                {},
                createReviewBridgePath()
            );
        }
        if (connectedBroadcast) {
            addQuestion(
                questions,
                QUESTION_TEMPLATES.TRACE_BROADCAST,
                {message: connectedBroadcast.name},
                createBroadcastLinkPath(connectedBroadcast.name)
            );
        }
        if (flowWithoutBroadcast) {
            addQuestion(
                questions,
                QUESTION_TEMPLATES.SCRIPT_OUTPUT,
                createFlowValues(flowWithoutBroadcast),
                createLogicFlowPath(flowWithoutBroadcast)
            );
        }
    } else {
        addQuestion(
            questions,
            QUESTION_TEMPLATES.NO_LOGIC_FLOWS,
            {},
            createLogicGraphPath(LOGIC_GRAPH_PATH_KINDS.EVENT_ENTRY)
        );
    }

    if (isEvidenceThin(gateDraft.evidence)) {
        addQuestion(
            questions,
            QUESTION_TEMPLATES.EVIDENCE_DETAIL,
            {},
            createExplainGatePath('evidence')
        );
    }
    if (resolvedGateState === EXPLAIN_GATE_STATES.REVIEWED) {
        addQuestion(
            questions,
            QUESTION_TEMPLATES.REVIEWED_TRANSFER,
            {},
            createReviewBridgePath()
        );
    }

    return questions.slice(0, maxQuestions);
};

export {
    DEFAULT_MAX_QUESTIONS,
    QUESTION_TEMPLATES,
    SOCRATIC_QUESTION_CATEGORIES,
    generateSocraticQuestions
};

export default generateSocraticQuestions;
