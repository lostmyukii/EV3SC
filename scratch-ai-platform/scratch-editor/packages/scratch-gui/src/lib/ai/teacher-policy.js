/* eslint-disable arrow-parens */
const TEACHER_POLICY_SCHEMA_VERSION = 'scratch-ai-teacher-policy-summary-v1';
const TEXT_LIMIT = 240;
const LIST_LIMIT = 6;

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

const readArray = value => (Array.isArray(value) ? value : []);

const readText = (value, limit = TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    let text = value.trim().slice(0, limit);
    SENSITIVE_PATTERNS.forEach(({pattern, replacement}) => {
        text = text.replace(pattern, replacement);
    });
    return text;
};

const readPointId = value => readText(value, 80)
    .replace(/[^a-z0-9_.:-]+/gi, '-')
    .replace(/^-+|-+$/g, '');

const normalizeKnowledgePoint = point => ({
    id: readPointId(point && point.id),
    label: readText(point && point.label, 80)
});

const normalizeQuestionRule = item => ({
    knowledgePointId: readPointId(item && item.knowledgePointId),
    text: readText(item && item.text)
});

const normalizeRubricItem = item => ({
    knowledgePointId: readPointId(item && item.knowledgePointId),
    label: readText(item && item.label, 80),
    criteria: readText((item && (item.criteria || item.focus)), TEXT_LIMIT),
    levels: readArray(item && item.levels)
        .slice(0, 4)
        .map(level => readText(level, 120))
        .filter(Boolean)
});

const createEmptyTeacherPolicySummary = () => ({
    schemaVersion: TEACHER_POLICY_SCHEMA_VERSION,
    active: false,
    source: 'none',
    title: '',
    gradeBand: '',
    selectedKnowledgePoints: [],
    promptContract: [],
    questionRules: [],
    rubric: [],
    safeguards: {
        classRosterIncluded: false,
        rawProjectIncluded: false,
        studentIdentityIncluded: false,
        writesToSb3: false
    }
});

const createPolicyFromKnowledgeLock = (lock, source = 'knowledge-lock') => {
    const selectedKnowledgePoints = readArray(lock && lock.selectedKnowledgePoints)
        .slice(0, LIST_LIMIT)
        .map(normalizeKnowledgePoint)
        .filter(point => point.id && point.label);

    return Object.assign(createEmptyTeacherPolicySummary(), {
        active: selectedKnowledgePoints.length > 0,
        source,
        title: readText(lock && lock.title, 120),
        gradeBand: readText(lock && lock.gradeBand, 80),
        selectedKnowledgePoints,
        promptContract: readArray(lock && lock.promptContract)
            .slice(0, LIST_LIMIT)
            .map(item => readText(item)),
        questionRules: readArray(lock && lock.questionRules)
            .slice(0, LIST_LIMIT)
            .map(normalizeQuestionRule)
            .filter(item => item.knowledgePointId && item.text),
        rubric: readArray(lock && lock.rubricFocus)
            .slice(0, LIST_LIMIT)
            .map(normalizeRubricItem)
            .filter(item => item.label && item.criteria)
    });
};

const createPolicyFromLessonPrep = prep => {
    const selectedKnowledgePoints = readArray(prep && prep.lockedKnowledgePoints)
        .slice(0, LIST_LIMIT)
        .map(normalizeKnowledgePoint)
        .filter(point => point.id && point.label);

    return Object.assign(createEmptyTeacherPolicySummary(), {
        active: selectedKnowledgePoints.length > 0,
        source: 'lesson-prep',
        title: readText(prep && prep.title, 120),
        gradeBand: readText(prep && prep.gradeBand, 80),
        selectedKnowledgePoints,
        promptContract: readArray(prep && prep.aiWhitelist && prep.aiWhitelist.allowedHelp)
            .slice(0, LIST_LIMIT)
            .map(item => readText(item)),
        questionRules: readArray(prep && prep.explainGateQuestions)
            .slice(0, LIST_LIMIT)
            .map((text, index) => ({
                knowledgePointId: selectedKnowledgePoints[index % Math.max(selectedKnowledgePoints.length, 1)] ?
                    selectedKnowledgePoints[index % selectedKnowledgePoints.length].id :
                    '',
                text: readText(text)
            }))
            .filter(item => item.text),
        rubric: readArray(prep && prep.rubric)
            .slice(0, LIST_LIMIT)
            .map(normalizeRubricItem)
            .filter(item => item.label && item.criteria)
    });
};

const createTeacherPolicySummary = ({
    activeKnowledgeLockReply,
    knowledgeLockReply,
    lessonPrepReply,
    teacherPolicy
} = {}) => {
    if (teacherPolicy && teacherPolicy.schemaVersion === TEACHER_POLICY_SCHEMA_VERSION) {
        return Object.assign(createEmptyTeacherPolicySummary(), {
            active: teacherPolicy.active === true,
            source: readText(teacherPolicy.source, 80) || 'provided',
            title: readText(teacherPolicy.title, 120),
            gradeBand: readText(teacherPolicy.gradeBand, 80),
            selectedKnowledgePoints: readArray(teacherPolicy.selectedKnowledgePoints)
                .slice(0, LIST_LIMIT)
                .map(normalizeKnowledgePoint)
                .filter(point => point.id && point.label),
            promptContract: readArray(teacherPolicy.promptContract)
                .slice(0, LIST_LIMIT)
                .map(item => readText(item)),
            questionRules: readArray(teacherPolicy.questionRules)
                .slice(0, LIST_LIMIT)
                .map(normalizeQuestionRule)
                .filter(item => item.text),
            rubric: readArray(teacherPolicy.rubric)
                .slice(0, LIST_LIMIT)
                .map(normalizeRubricItem)
                .filter(item => item.label && item.criteria)
        });
    }

    if (knowledgeLockReply && !knowledgeLockReply.blocked && knowledgeLockReply.knowledgeLock) {
        return createPolicyFromKnowledgeLock(knowledgeLockReply.knowledgeLock);
    }

    if (
        activeKnowledgeLockReply &&
        !activeKnowledgeLockReply.blocked &&
        activeKnowledgeLockReply.active !== false &&
        activeKnowledgeLockReply.knowledgeLock
    ) {
        return createPolicyFromKnowledgeLock(activeKnowledgeLockReply.knowledgeLock, 'active-knowledge-lock');
    }

    if (lessonPrepReply && !lessonPrepReply.blocked && lessonPrepReply.lessonPrep) {
        return createPolicyFromLessonPrep(lessonPrepReply.lessonPrep);
    }

    return createEmptyTeacherPolicySummary();
};

export {
    TEACHER_POLICY_SCHEMA_VERSION,
    createEmptyTeacherPolicySummary,
    createTeacherPolicySummary
};
