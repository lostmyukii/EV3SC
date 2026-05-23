/* eslint-disable arrow-parens */
const TEACHER_RUBRIC_REVIEW_SCHEMA_VERSION = 'scratch-ai-teacher-rubric-review-v1';
const RUBRIC_ITEM_LIMIT = 6;
const RUBRIC_TEXT_LIMIT = 240;
const RUBRIC_SUMMARY_TEXT_LIMIT = 120;
const RUBRIC_LEVEL_MIN = 0;
const RUBRIC_LEVEL_MAX = 3;

const DEFAULT_LEVEL_LABELS = Object.freeze([
    'Not shown',
    'Starting',
    'Mostly',
    'Strong'
]);

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

const readText = (value, limit = RUBRIC_TEXT_LIMIT) => {
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

const readRubricLevel = value => {
    if (value === '' || value === null || typeof value === 'undefined') return '';
    const level = Number(value);
    if (!Number.isFinite(level)) return '';
    const roundedLevel = Math.round(level);
    if (roundedLevel < RUBRIC_LEVEL_MIN || roundedLevel > RUBRIC_LEVEL_MAX) return '';
    return String(roundedLevel);
};

const createRubricItemId = (item, index) => readPointId(item && item.knowledgePointId) ||
    `rubric-${index + 1}`;

const createRubricLevelLabels = levels => {
    const providedLevels = readArray(levels)
        .slice(0, RUBRIC_LEVEL_MAX + 1)
        .map(level => readText(level, RUBRIC_SUMMARY_TEXT_LIMIT));

    return DEFAULT_LEVEL_LABELS.map((fallback, index) => providedLevels[index] || fallback);
};

const normalizeRubricItem = (item, index) => ({
    criteria: readText((item && (item.criteria || item.focus)), RUBRIC_TEXT_LIMIT),
    evidence: readText(item && (item.evidence || item.evidenceSummary), RUBRIC_SUMMARY_TEXT_LIMIT),
    id: readText(item && item.id, 80) || createRubricItemId(item, index),
    knowledgePointId: readPointId(item && item.knowledgePointId),
    label: readText(item && item.label, 80),
    level: readRubricLevel(item && item.level),
    levels: createRubricLevelLabels(item && item.levels)
});

const createTeacherRubricReviewState = ({
    teacherPolicy
} = {}) => ({
    schemaVersion: TEACHER_RUBRIC_REVIEW_SCHEMA_VERSION,
    source: readText(teacherPolicy && teacherPolicy.source, 80) || 'none',
    title: readText(teacherPolicy && teacherPolicy.title, RUBRIC_SUMMARY_TEXT_LIMIT),
    items: readArray(teacherPolicy && teacherPolicy.rubric)
        .slice(0, RUBRIC_ITEM_LIMIT)
        .map(normalizeRubricItem)
        .filter(item => item.label && item.criteria),
    safeguards: {
        classRosterIncluded: false,
        rawProjectIncluded: false,
        studentIdentityIncluded: false,
        writesToSb3: false
    }
});

const getTeacherRubricLevelOptions = item => createRubricLevelLabels(item && item.levels)
    .map((label, level) => ({
        label,
        level: String(level)
    }));

const updateTeacherRubricReviewLevel = (review, itemId, level) => {
    const normalizedLevel = readRubricLevel(level);
    return Object.assign({}, review, {
        items: readArray(review && review.items).map(item => (
            item && item.id === itemId ?
                Object.assign({}, item, {
                    level: normalizedLevel
                }) :
                item
        ))
    });
};

const updateTeacherRubricReviewEvidence = (review, itemId, evidence) => Object.assign({}, review, {
    items: readArray(review && review.items).map(item => (
        item && item.id === itemId ?
            Object.assign({}, item, {
                evidence: readText(evidence, RUBRIC_SUMMARY_TEXT_LIMIT)
            }) :
            item
    ))
});

const isTeacherRubricReviewComplete = review => {
    const items = readArray(review && review.items);
    if (!items.length) return true;
    return items.every(item => readRubricLevel(item && item.level) !== '');
};

const createTeacherRubricReviewSummary = scores => {
    const validScores = readArray(scores)
        .map(score => Number(score && score.level))
        .filter(level => Number.isFinite(level));
    const possibleCount = readArray(scores).length;
    const scoredCount = validScores.length;
    const scoreTotal = validScores.reduce((total, level) => total + level, 0);
    const maxScore = possibleCount * RUBRIC_LEVEL_MAX;

    return {
        maxScore,
        possibleCount,
        scoreTotal,
        scoredCount,
        status: !possibleCount || !scoredCount ? 'empty' : (
            scoredCount === possibleCount ? 'complete' : 'partial'
        )
    };
};

const createTeacherRubricReviewPayload = (review = {}) => {
    const scores = readArray(review && (review.items || review.scores))
        .slice(0, RUBRIC_ITEM_LIMIT)
        .map((item, index) => {
            const normalizedItem = normalizeRubricItem(item, index);
            const level = readRubricLevel(normalizedItem.level);
            const numericLevel = level === '' ? null : Number(level);
            const levelLabels = createRubricLevelLabels(normalizedItem.levels);

            return {
                criteria: normalizedItem.criteria,
                evidence: readText(normalizedItem.evidence, RUBRIC_SUMMARY_TEXT_LIMIT),
                knowledgePointId: normalizedItem.knowledgePointId,
                label: normalizedItem.label,
                level: numericLevel,
                levelLabel: numericLevel === null ? '' : levelLabels[numericLevel]
            };
        })
        .filter(item => item.label && item.criteria);

    return {
        schemaVersion: TEACHER_RUBRIC_REVIEW_SCHEMA_VERSION,
        source: readText(review && review.source, 80) || 'none',
        title: readText(review && review.title, RUBRIC_SUMMARY_TEXT_LIMIT),
        scores,
        summary: createTeacherRubricReviewSummary(scores),
        safeguards: {
            classRosterIncluded: false,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            writesToSb3: false
        }
    };
};

export {
    TEACHER_RUBRIC_REVIEW_SCHEMA_VERSION,
    createTeacherRubricReviewPayload,
    createTeacherRubricReviewState,
    getTeacherRubricLevelOptions,
    isTeacherRubricReviewComplete,
    updateTeacherRubricReviewEvidence,
    updateTeacherRubricReviewLevel
};
