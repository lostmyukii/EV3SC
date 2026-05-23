/* eslint-disable arrow-parens */
import {normalizeMiddlewareUrl} from './socratic-chat-client.js';

const TEACHER_KNOWLEDGE_POINTS_PATH = '/api/v1/teacher/knowledge-points';
const TEACHER_KNOWLEDGE_LOCK_PATH = '/api/v1/teacher/knowledge-lock';
const TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH = '/api/v1/teacher/active-knowledge-lock';
const TEACHER_LESSON_PREP_PATH = '/api/v1/teacher/lesson-prep';
const TEACHER_SESSION_PATH = '/api/v1/teacher/session';
const TEACHER_ACCOUNTS_PATH = '/api/v1/teacher/accounts';
const TEACHER_ACCOUNT_ADMIN_ACTION_PATH = '/api/v1/teacher/accounts/admin-action';
const TEACHER_ACCOUNT_ADMIN_SCHEMA_ID = 'scratch-ai-teacher-account-admin-v1';
const TEACHER_TEXT_LIMIT = 360;
const TEACHER_TITLE_LIMIT = 80;
const TEACHER_PASSWORD_LIMIT = 160;

const GRADE_BANDS = Object.freeze({
    LOWER_PRIMARY: 'lower-primary',
    UPPER_PRIMARY: 'upper-primary',
    MIDDLE_SCHOOL: 'middle-school'
});

const TEACHER_KNOWLEDGE_POINTS = Object.freeze([
    {id: 'events', label: '事件'},
    {id: 'sequence', label: '顺序'},
    {id: 'loops', label: '循环'},
    {id: 'conditionals', label: '条件'},
    {id: 'variables', label: '变量'},
    {id: 'operators', label: '运算'},
    {id: 'addition', label: '相加'},
    {id: 'broadcasts', label: '广播消息'},
    {id: 'sensing', label: '侦测'},
    {id: 'debugging', label: '调试'}
]);

const KNOWLEDGE_POINT_ID_SET = new Set(TEACHER_KNOWLEDGE_POINTS.map(item => item.id));

const truncateText = (value, maxLength = TEACHER_TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const normalizeTeacherId = value => truncateText(value, TEACHER_TITLE_LIMIT).toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeClassSessionId = value => truncateText(value, TEACHER_TITLE_LIMIT)
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeTeacherRole = value => (value === 'admin' ? 'admin' : 'teacher');

const normalizeGradeBand = value => (
    Object.keys(GRADE_BANDS).some(key => GRADE_BANDS[key] === value) ? value : GRADE_BANDS.UPPER_PRIMARY
);

const normalizeKnowledgePointIds = value => (Array.isArray(value) ? value : [])
    .filter(item => typeof item === 'string' && KNOWLEDGE_POINT_ID_SET.has(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 8);

const normalizeClassSessionIds = value => (Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/))
    .map(normalizeClassSessionId)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 8);

const readDurationMinutes = value => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 40;
    return Math.min(Math.max(parsed, 20), 120);
};

const createTeacherToolsUrl = (middlewareUrl, path) => `${normalizeMiddlewareUrl(middlewareUrl)}${path}`;

const createActiveKnowledgeLockPath = ({
    classSessionId
} = {}) => {
    const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
    if (!normalizedClassSessionId) return TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH;
    return `${TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH}?classSessionId=${encodeURIComponent(normalizedClassSessionId)}`;
};

const createKnowledgeLockPayload = ({
    classSessionId,
    gradeBand,
    lessonTitle,
    persist = false,
    selectedKnowledgePointIds,
    teacherConsent = false
} = {}) => {
    const payload = {
        teacherConsent: teacherConsent === true,
        gradeBand: normalizeGradeBand(gradeBand),
        lessonTitle: truncateText(lessonTitle, TEACHER_TITLE_LIMIT),
        selectedKnowledgePointIds: normalizeKnowledgePointIds(selectedKnowledgePointIds)
    };
    const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
    if (persist === true) payload.persist = true;
    if (normalizedClassSessionId) payload.classSessionId = normalizedClassSessionId;
    return payload;
};

const createLessonPrepPayload = ({
    durationMinutes,
    gradeBand,
    lessonGoal,
    lockedKnowledgePointIds,
    teacherConsent = false
} = {}) => ({
    teacherConsent: teacherConsent === true,
    gradeBand: normalizeGradeBand(gradeBand),
    durationMinutes: readDurationMinutes(durationMinutes),
    lessonGoal: truncateText(lessonGoal),
    lockedKnowledgePointIds: normalizeKnowledgePointIds(lockedKnowledgePointIds)
});

const createTeacherSessionPayload = ({
    password,
    teacherConsent = false,
    teacherId
} = {}) => ({
    teacherConsent: teacherConsent === true,
    teacherId: normalizeTeacherId(teacherId),
    password: typeof password === 'string' ? password : ''
});

const createTeacherAccountAdminPayload = ({
    action,
    active,
    classSessionIds,
    displayName,
    password,
    role,
    teacherId
} = {}) => {
    const payload = {
        action: typeof action === 'string' ? action.trim().toLowerCase() : '',
        teacherId: normalizeTeacherId(teacherId)
    };
    const normalizedClassSessionIds = normalizeClassSessionIds(classSessionIds);
    if (typeof displayName === 'string') payload.displayName = truncateText(displayName, TEACHER_TITLE_LIMIT);
    if (typeof password === 'string') payload.password = password.trim().slice(0, TEACHER_PASSWORD_LIMIT);
    if (typeof role === 'string') payload.role = normalizeTeacherRole(role);
    if (typeof active !== 'undefined') payload.active = active !== false;
    if (normalizedClassSessionIds.length) payload.classSessionIds = normalizedClassSessionIds;
    return payload;
};

const requestTeacherJson = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    path,
    payload,
    teacherSessionToken
}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI teacher requests.');
    }

    const headers = payload ? {
        'Content-Type': 'application/json'
    } : {};
    if (teacherSessionToken) {
        headers['X-Scratch-AI-Teacher-Session-Token'] = String(teacherSessionToken).trim();
    }

    const requestOptions = {
        method: payload ? 'POST' : 'GET',
        headers
    };
    if (payload) requestOptions.body = JSON.stringify(payload);

    const response = await fetchImpl(createTeacherToolsUrl(middlewareUrl, path), requestOptions);

    if (!response || !response.ok) {
        throw new Error('Scratch AI teacher request failed.');
    }

    return response.json();
};

const requestKnowledgePointLibrary = options => requestTeacherJson(Object.assign({}, options, {
    path: TEACHER_KNOWLEDGE_POINTS_PATH
}));

const requestKnowledgeLockDraft = options => requestTeacherJson(Object.assign({}, options, {
    path: TEACHER_KNOWLEDGE_LOCK_PATH
}));

const requestLessonPrepDraft = options => requestTeacherJson(Object.assign({}, options, {
    path: TEACHER_LESSON_PREP_PATH
}));

const requestTeacherSession = options => requestTeacherJson(Object.assign({}, options, {
    path: TEACHER_SESSION_PATH
}));

const requestTeacherAccounts = options => requestTeacherJson(Object.assign({}, options, {
    path: TEACHER_ACCOUNTS_PATH
}));

const requestTeacherAccountAdminAction = options => requestTeacherJson(Object.assign({}, options, {
    path: TEACHER_ACCOUNT_ADMIN_ACTION_PATH
}));

const requestActiveKnowledgeLock = ({
    classSessionId,
    ...options
} = {}) => requestTeacherJson(Object.assign({}, options, {
    path: createActiveKnowledgeLockPath({
        classSessionId
    })
}));

export {
    GRADE_BANDS,
    TEACHER_ACCOUNTS_PATH,
    TEACHER_ACCOUNT_ADMIN_ACTION_PATH,
    TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH,
    TEACHER_KNOWLEDGE_LOCK_PATH,
    TEACHER_KNOWLEDGE_POINTS,
    TEACHER_KNOWLEDGE_POINTS_PATH,
    TEACHER_LESSON_PREP_PATH,
    TEACHER_SESSION_PATH,
    createActiveKnowledgeLockPath,
    createKnowledgeLockPayload,
    createLessonPrepPayload,
    createTeacherAccountAdminPayload,
    createTeacherSessionPayload,
    createTeacherToolsUrl,
    normalizeClassSessionId,
    requestActiveKnowledgeLock,
    requestKnowledgeLockDraft,
    requestKnowledgePointLibrary,
    requestLessonPrepDraft,
    requestTeacherAccountAdminAction,
    requestTeacherAccounts,
    requestTeacherSession
};
