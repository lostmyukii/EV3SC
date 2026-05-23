import {
    createHmac,
    pbkdf2Sync,
    randomBytes,
    randomUUID,
    timingSafeEqual
} from 'node:crypto';
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
    TEACHER_AUTH_SCHEMA_ID,
    TEACHER_LOCK_SCHEMA_ID
} from './config.js';
import {redactSensitiveText} from './model-request-safety-gate.js';

const TEXT_LIMIT = 360;
const TITLE_LIMIT = 80;
const LIST_LIMIT = 8;
const TEACHER_LOCK_FILE = 'teacher-knowledge-locks.jsonl';
const TEACHER_ACCOUNTS_FILE = 'teacher-accounts.json';
const TEACHER_ADMIN_OPERATIONS_FILE = 'teacher-admin-operations.jsonl';
const TEACHER_CLASS_ROSTERS_FILE = 'teacher-class-rosters.json';
const TEACHER_ACCOUNTS_SCHEMA_ID = 'scratch-ai-teacher-accounts-v1';
const TEACHER_ACCOUNT_ADMIN_SCHEMA_ID = 'scratch-ai-teacher-account-admin-v1';
const TEACHER_ADMIN_OPERATION_SCHEMA_ID = 'scratch-ai-teacher-admin-operation-v1';
const TEACHER_CLASS_ROSTER_SCHEMA_ID = 'scratch-ai-class-roster-v1';
const TEACHER_CLASS_ROSTER_ADMIN_SCHEMA_ID = 'scratch-ai-class-roster-admin-v1';
const TEACHER_ROSTER_MIGRATION_SCHEMA_ID = 'scratch-ai-roster-migration-plan-v1';
const DEFAULT_CLASS_SESSION_ID = 'default-class-session';
const DEFAULT_STUDENT_SCOPE_ID = 'anonymous-student';
const TEACHER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const TEACHER_PASSWORD_HASH_PREFIX = 'pbkdf2-sha256';
const TEACHER_PASSWORD_HASH_ITERATIONS = 120000;
const TEACHER_PASSWORD_HASH_KEYLEN = 32;
const TEACHER_PASSWORD_MIN_LENGTH = 8;
const TEACHER_ROSTER_STUDENT_LIMIT = 120;
const STUDENT_SCOPE_ID_LIMIT = 80;

const GRADE_BANDS = Object.freeze([
    'lower-primary',
    'upper-primary',
    'middle-school'
]);

const FORBIDDEN_TEACHER_FIELDS = Object.freeze([
    'studentName',
    'studentNames',
    'classRoster',
    'roster',
    'studentWork',
    'studentProject',
    'studentProjects',
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
    'blocks',
    'targetId',
    'scriptId',
    'blockIds',
    'aiLog',
    'processLog',
    'logs',
    'apiKey',
    'providerKey',
    'token',
    'password',
    'secret'
]);

const KNOWLEDGE_POINT_LIBRARY = Object.freeze([
    {
        id: 'events',
        label: '事件',
        blockFamilies: ['event_whenflagclicked', 'event_whenkeypressed', 'event_whenbroadcastreceived'],
        questionStems: ['这段程序从哪里开始?', '谁先发出动作?'],
        rubricFocus: '能说清楚程序的开始点。'
    },
    {
        id: 'sequence',
        label: '顺序',
        blockFamilies: ['control_wait', 'looks_say', 'motion_movesteps'],
        questionStems: ['第一步、第二步、第三步分别是什么?', '如果顺序换了会怎样?'],
        rubricFocus: '能按先后顺序解释脚本。'
    },
    {
        id: 'loops',
        label: '循环',
        blockFamilies: ['control_repeat', 'control_forever', 'control_repeat_until'],
        questionStems: ['哪一段动作需要重复?', '重复到什么时候停?'],
        rubricFocus: '能说明为什么要重复。'
    },
    {
        id: 'conditionals',
        label: '条件',
        blockFamilies: ['control_if', 'control_if_else', 'operator_equals'],
        questionStems: ['程序要判断什么?', '如果不满足条件会怎样?'],
        rubricFocus: '能说出判断条件和两种结果。'
    },
    {
        id: 'variables',
        label: '变量',
        blockFamilies: ['data_setvariableto', 'data_changevariableby', 'data_variable'],
        questionStems: ['这个数放在哪个变量里?', '变量什么时候改变?'],
        rubricFocus: '能说清楚变量保存了什么。'
    },
    {
        id: 'operators',
        label: '运算',
        blockFamilies: ['operator_add', 'operator_subtract', 'operator_equals'],
        questionStems: ['这一步要算什么?', '算出来的结果给谁用?'],
        rubricFocus: '能说明运算输入和结果。'
    },
    {
        id: 'addition',
        label: '相加',
        blockFamilies: ['operator_add', 'data_variable'],
        questionStems: ['第一个数和第二个数分别在哪里?', '相加之后结果显示在哪里?'],
        rubricFocus: '能解释两个数相加的输入、过程和结果。'
    },
    {
        id: 'broadcasts',
        label: '广播消息',
        blockFamilies: ['event_broadcast', 'event_whenbroadcastreceived'],
        questionStems: ['谁发消息?', '谁接住消息后继续做事?'],
        rubricFocus: '能说明消息的发送者和接收者。'
    },
    {
        id: 'sensing',
        label: '侦测',
        blockFamilies: ['sensing_touchingobject', 'sensing_answer', 'sensing_keypressed'],
        questionStems: ['程序要侦测什么?', '侦测到之后会发生什么?'],
        rubricFocus: '能说明侦测对象和触发结果。'
    },
    {
        id: 'debugging',
        label: '调试',
        blockFamilies: ['debugging-checklist'],
        questionStems: ['你准备先试哪一步?', '如果结果不对, 你先检查哪里?'],
        rubricFocus: '能提出一个可执行的测试办法。'
    }
]);

const KNOWLEDGE_POINT_BY_ID = new Map(KNOWLEDGE_POINT_LIBRARY.map(item => [item.id, item]));
const FORBIDDEN_TEACHER_FIELD_SET = new Set(FORBIDDEN_TEACHER_FIELDS.map(field => field.toLowerCase()));

const truncateText = (value, maxLength = TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const readArray = value => (Array.isArray(value) ? value : []);

const normalizeGradeBand = value => (GRADE_BANDS.includes(value) ? value : 'upper-primary');

const normalizeClassSessionId = value => {
    const redactedValue = redactSensitiveText(value, TITLE_LIMIT);
    const normalizedValue = redactedValue.replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalizedValue || DEFAULT_CLASS_SESSION_ID;
};

const normalizeOptionalClassSessionId = value => {
    const normalizedValue = normalizeClassSessionId(value);
    return String(value || '').trim() ? normalizedValue : '';
};

const normalizeOptionalStudentScopeId = value => {
    const normalizedValue = String(value || '').trim()
        .replace(/[^A-Za-z0-9_.:-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, STUDENT_SCOPE_ID_LIMIT);
    return normalizedValue;
};

const normalizeStudentScopeId = value => normalizeOptionalStudentScopeId(value) || DEFAULT_STUDENT_SCOPE_ID;

const readRosterHashKey = config => String(
    config &&
    config.teacherTools &&
    (config.teacherTools.sessionSigningKey || config.teacherTools.adminToken) ||
    'scratch-ai-roster-preview-hash-key'
);

const normalizeRosterStudentKey = value => String(value || '').trim().toLowerCase().slice(0, 240);

const createRosterStudentScopedId = ({
    classSessionId,
    config,
    studentKey
}) => {
    const normalizedStudentKey = normalizeRosterStudentKey(studentKey);
    if (!normalizedStudentKey) return '';
    const digest = createHmac('sha256', readRosterHashKey(config))
        .update(`${normalizeClassSessionId(classSessionId)}\n${normalizedStudentKey}`)
        .digest('base64url')
        .slice(0, 24);
    return `student-${digest}`;
};

const normalizeTeacherId = value => {
    const normalizedValue = String(value || '').trim().toLowerCase()
        .replace(/[^a-z0-9_.:-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalizedValue.slice(0, TITLE_LIMIT);
};

const normalizeTeacherRole = value => (
    String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'teacher'
);

const normalizeClassSessionIds = value => readArray(value)
    .map(normalizeClassSessionId)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, LIST_LIMIT);

const normalizeTeacherAccountRecord = (account = {}) => ({
    active: account.active !== false,
    classSessionIds: normalizeClassSessionIds(account && account.classSessionIds),
    createdAt: truncateText(account && account.createdAt, TITLE_LIMIT),
    displayName: redactSensitiveText(account && account.displayName, TITLE_LIMIT),
    passwordHash: String(account && account.passwordHash || '').trim(),
    passwordUpdatedAt: truncateText(account && account.passwordUpdatedAt, TITLE_LIMIT),
    role: normalizeTeacherRole(account && account.role),
    teacherId: normalizeTeacherId(account && account.teacherId),
    updatedAt: truncateText(account && account.updatedAt, TITLE_LIMIT)
});

const normalizeTeacherAccountRecords = accounts => readArray(accounts)
    .map(normalizeTeacherAccountRecord)
    .filter(account => account.teacherId && account.passwordHash && account.classSessionIds.length)
    .filter((account, index, list) => list.findIndex(item => item.teacherId === account.teacherId) === index);

const encodeBase64Url = value => Buffer.from(value).toString('base64url');

const decodeBase64UrlJson = value => {
    try {
        return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
    } catch (error) {
        return null;
    }
};

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
};

const readTeacherAccountsFromEnv = config => {
    const accountsJson = config && config.teacherTools && config.teacherTools.accountsJson;
    if (!accountsJson) return [];

    let parsedAccounts = [];
    try {
        parsedAccounts = JSON.parse(accountsJson);
    } catch (error) {
        return [];
    }

    return normalizeTeacherAccountRecords(parsedAccounts).map(account => Object.assign({}, account, {
        source: 'env'
    }));
};

const createTeacherAccountsFilePath = teacherToolsDir => resolve(String(teacherToolsDir || '').trim(), TEACHER_ACCOUNTS_FILE);

const createTeacherAdminOperationsFilePath = teacherToolsDir => (
    resolve(String(teacherToolsDir || '').trim(), TEACHER_ADMIN_OPERATIONS_FILE)
);

const createTeacherClassRostersFilePath = teacherToolsDir => (
    resolve(String(teacherToolsDir || '').trim(), TEACHER_CLASS_ROSTERS_FILE)
);

const readTeacherAccountsFile = async teacherToolsDir => {
    const normalizedDir = String(teacherToolsDir || '').trim();
    if (!normalizedDir) return null;

    try {
        const accountsText = await readFile(createTeacherAccountsFilePath(normalizedDir), 'utf8');
        const parsed = JSON.parse(accountsText);
        return normalizeTeacherAccountRecords(parsed && parsed.accounts).map(account => Object.assign({}, account, {
            source: 'file'
        }));
    } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        throw error;
    }
};

const readTeacherAccounts = async config => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    const fileAccounts = await readTeacherAccountsFile(teacherToolsDir);
    return fileAccounts || readTeacherAccountsFromEnv(config);
};

const createPublicTeacherAccount = account => ({
    active: account.active !== false,
    classSessionIds: normalizeClassSessionIds(account && account.classSessionIds),
    createdAt: truncateText(account && account.createdAt, TITLE_LIMIT),
    displayName: redactSensitiveText(account && account.displayName, TITLE_LIMIT),
    passwordUpdatedAt: truncateText(account && account.passwordUpdatedAt, TITLE_LIMIT),
    role: normalizeTeacherRole(account && account.role),
    teacherId: normalizeTeacherId(account && account.teacherId),
    updatedAt: truncateText(account && account.updatedAt, TITLE_LIMIT)
});

const createTeacherAccountTotals = accounts => ({
    accounts: accounts.length,
    activeAccounts: accounts.filter(account => account.active !== false).length,
    admins: accounts.filter(account => account.active !== false && account.role === 'admin').length,
    classSessions: accounts.reduce((count, account) => count + account.classSessionIds.length, 0)
});

const createTeacherAccountListReply = ({
    accounts,
    authorization,
    persisted
}) => ({
    blocked: false,
    persisted,
    schemaVersion: TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    accounts: accounts.map(createPublicTeacherAccount),
    totals: createTeacherAccountTotals(accounts),
    authorization: {
        method: authorization && authorization.method ? authorization.method : '',
        teacherId: authorization && authorization.teacherId ? authorization.teacherId : '',
        valuesRedacted: true
    },
    files: {
        accounts: TEACHER_ACCOUNTS_FILE,
        adminOperations: TEACHER_ADMIN_OPERATIONS_FILE,
        pathsRedacted: true
    },
    safeguards: {
        classRosterIncluded: false,
        passwordHashReturned: false,
        passwordReturned: false,
        studentIdentityIncluded: false,
        valuesRedacted: true
    }
});

const createTeacherPasswordHash = ({
    password,
    salt = randomBytes(16)
} = {}) => {
    const passwordText = String(password || '');
    const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(String(salt), 'utf8');
    const digest = pbkdf2Sync(
        passwordText,
        saltBuffer,
        TEACHER_PASSWORD_HASH_ITERATIONS,
        TEACHER_PASSWORD_HASH_KEYLEN,
        'sha256'
    );
    return [
        TEACHER_PASSWORD_HASH_PREFIX,
        TEACHER_PASSWORD_HASH_ITERATIONS,
        saltBuffer.toString('base64url'),
        digest.toString('base64url')
    ].join(':');
};

const verifyTeacherPassword = ({
    password,
    passwordHash
}) => {
    const parts = String(passwordHash || '').split(':');
    if (parts.length !== 4 || parts[0] !== TEACHER_PASSWORD_HASH_PREFIX) return false;

    const iterations = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations < 10000) return false;

    let salt = null;
    let expectedDigest = null;
    try {
        salt = Buffer.from(parts[2], 'base64url');
        expectedDigest = Buffer.from(parts[3], 'base64url');
    } catch (error) {
        return false;
    }
    if (!salt.length || !expectedDigest.length) return false;

    const actualDigest = pbkdf2Sync(
        String(password || ''),
        salt,
        iterations,
        expectedDigest.length,
        'sha256'
    );
    return actualDigest.length === expectedDigest.length && timingSafeEqual(actualDigest, expectedDigest);
};

const signTeacherSessionPayload = ({
    config,
    payloadBase64
}) => createHmac('sha256', config.teacherTools.sessionSigningKey)
    .update(payloadBase64)
    .digest('base64url');

const createTeacherSessionToken = ({
    account,
    config,
    now = new Date()
}) => {
    const payload = {
        schemaVersion: TEACHER_AUTH_SCHEMA_ID,
        classSessionIds: account.classSessionIds,
        expiresAt: new Date(now.getTime() + TEACHER_SESSION_TTL_MS).toISOString(),
        issuedAt: now.toISOString(),
        role: account.role,
        teacherId: account.teacherId
    };
    const payloadBase64 = encodeBase64Url(JSON.stringify(payload));
    const signature = signTeacherSessionPayload({
        config,
        payloadBase64
    });
    return `${payloadBase64}.${signature}`;
};

const readTeacherSessionToken = requestHeaders => {
    const headerToken = requestHeaders && (
        requestHeaders['x-scratch-ai-teacher-session-token'] ||
        requestHeaders['X-Scratch-AI-Teacher-Session-Token']
    );
    if (headerToken) return String(headerToken).trim();

    const authorization = String(requestHeaders && (
        requestHeaders.authorization ||
        requestHeaders.Authorization
    ) || '').trim();
    return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
};

const verifyTeacherSessionToken = ({
    config,
    requestHeaders
}) => {
    const token = readTeacherSessionToken(requestHeaders);
    if (!token || !config || !config.teacherTools || !config.teacherTools.sessionSigningKey) {
        return {
            valid: false,
            reason: 'teacher-session-token-required'
        };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
        return {
            valid: false,
            reason: 'teacher-session-token-invalid'
        };
    }

    const expectedSignature = signTeacherSessionPayload({
        config,
        payloadBase64: parts[0]
    });
    if (!safeEqual(parts[1], expectedSignature)) {
        return {
            valid: false,
            reason: 'teacher-session-token-invalid'
        };
    }

    const payload = decodeBase64UrlJson(parts[0]);
    const expiresAt = Date.parse(payload && payload.expiresAt);
    if (!payload || payload.schemaVersion !== TEACHER_AUTH_SCHEMA_ID || !Number.isFinite(expiresAt)) {
        return {
            valid: false,
            reason: 'teacher-session-token-invalid'
        };
    }
    if (expiresAt <= Date.now()) {
        return {
            valid: false,
            reason: 'teacher-session-token-expired'
        };
    }

    const teacherId = normalizeTeacherId(payload.teacherId);
    const classSessionIds = normalizeClassSessionIds(payload.classSessionIds);
    if (!teacherId || !classSessionIds.length) {
        return {
            valid: false,
            reason: 'teacher-session-token-invalid'
        };
    }

    return {
        valid: true,
        session: {
            classSessionIds,
            expiresAt: new Date(expiresAt).toISOString(),
            role: payload.role === 'admin' ? 'admin' : 'teacher',
            teacherId
        }
    };
};

const readDurationMinutes = value => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 40;
    return Math.min(Math.max(parsed, 20), 120);
};

const findForbiddenTeacherPaths = (value, path = [], seen = new Set()) => {
    if (!value || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);

    const paths = [];
    Object.entries(value).forEach(([key, childValue]) => {
        const childPath = path.concat(key);
        if (FORBIDDEN_TEACHER_FIELD_SET.has(key.toLowerCase())) {
            paths.push(childPath.join('.'));
            return;
        }
        paths.push(...findForbiddenTeacherPaths(childValue, childPath, seen));
    });
    return paths;
};

const normalizeKnowledgePointIds = value => readArray(value)
    .map(item => (typeof item === 'string' ? item : item && item.id))
    .map(item => truncateText(item, TITLE_LIMIT))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, LIST_LIMIT);

const createTeacherSafetyGate = (request = {}) => {
    const blockedReasons = findForbiddenTeacherPaths(request).map(path => `forbidden-context:${path}`);

    if (request.teacherConsent !== true) {
        blockedReasons.push('missing-teacher-consent');
    }

    const safetyJson = JSON.stringify(request || {});

    return {
        allowed: blockedReasons.length === 0,
        blockedReasons,
        redactionApplied: safetyJson.indexOf('[redacted-') !== -1 ||
            safetyJson.indexOf('Bearer [redacted-token]') !== -1,
        minimized: true
    };
};

const createTeacherSafetySummary = safetyGate => ({
    allowed: safetyGate.allowed,
    blockedReasons: safetyGate.blockedReasons,
    redactionApplied: safetyGate.redactionApplied,
    minimized: true
});

const hasTeacherAdminAccess = ({
    config,
    requestHeaders
}) => {
    const configuredToken = config && config.teacherTools && config.teacherTools.adminToken;
    if (!configuredToken) return false;
    const providedToken = requestHeaders && (
        requestHeaders['x-scratch-ai-teacher-admin-token'] ||
        requestHeaders['X-Scratch-AI-Teacher-Admin-Token']
    );
    return providedToken === configuredToken;
};

const readTeacherAdminAuthorization = async ({
    config,
    requestHeaders
}) => {
    if (hasTeacherAdminAccess({
        config,
        requestHeaders
    })) {
        return {
            allowed: true,
            method: 'admin-token',
            teacherId: ''
        };
    }

    const sessionResult = verifyTeacherSessionToken({
        config,
        requestHeaders
    });
    if (!sessionResult.valid) {
        return {
            allowed: false,
            method: 'teacher-session',
            reason: sessionResult.reason,
            teacherId: ''
        };
    }
    const account = (await readTeacherAccounts(config))
        .find(item => item.teacherId === sessionResult.session.teacherId);
    if (!account || account.active === false) {
        return {
            allowed: false,
            method: 'teacher-session',
            reason: 'teacher-account-inactive',
            teacherId: sessionResult.session.teacherId
        };
    }
    if (account.role !== 'admin') {
        return {
            allowed: false,
            method: 'teacher-session',
            reason: 'teacher-admin-role-required',
            teacherId: sessionResult.session.teacherId
        };
    }
    return {
        allowed: true,
        method: 'teacher-session',
        teacherId: sessionResult.session.teacherId
    };
};

const createTeacherAdminLockedReply = action => ({
    blocked: true,
    persisted: false,
    schemaVersion: TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    action,
    reason: 'teacher-admin-token-required',
    text: 'Teacher classroom settings are locked. Configure and send the server-side teacher admin token.'
});

const createTeacherClassAuthorizationLockedReply = ({
    action,
    reason = 'teacher-class-authorization-required'
}) => ({
    blocked: true,
    persisted: false,
    action,
    reason,
    text: 'Teacher classroom settings require a valid teacher session for this class.'
});

const createTeacherStorageMissingReply = action => ({
    blocked: true,
    persisted: false,
    schemaVersion: TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    action,
    reason: 'teacher-storage-not-configured',
    text: 'Teacher classroom settings are not persisted until TEACHER_TOOLS_DIR is configured.'
});

const createTeacherAdminAuthorizationLockedReply = ({
    action,
    reason = 'teacher-admin-authorization-required'
}) => ({
    blocked: true,
    persisted: false,
    schemaVersion: TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    action,
    reason,
    text: 'Teacher account administration requires a teacher admin token or an admin teacher session.',
    safeguards: {
        passwordHashReturned: false,
        passwordReturned: false,
        valuesRedacted: true
    }
});

const persistTeacherAdminOperation = async ({
    action,
    authorization,
    config,
    reason = '',
    targetTeacherId = '',
    result = 'blocked'
}) => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    if (!teacherToolsDir) return null;

    const record = {
        schemaVersion: TEACHER_ADMIN_OPERATION_SCHEMA_ID,
        operationId: `teacher-admin-${randomUUID()}`,
        createdAt: new Date().toISOString(),
        action: truncateText(action, TITLE_LIMIT),
        actor: {
            method: authorization && authorization.method ? authorization.method : '',
            teacherId: authorization && authorization.teacherId ? authorization.teacherId : ''
        },
        targetTeacherId: normalizeTeacherId(targetTeacherId),
        result,
        reason: truncateText(reason, TITLE_LIMIT),
        safeguards: {
            classRosterIncluded: false,
            passwordHashStoredInAudit: false,
            passwordStoredInAudit: false,
            valuesRedacted: true
        }
    };

    await mkdir(teacherToolsDir, {
        recursive: true
    });
    await appendFile(createTeacherAdminOperationsFilePath(teacherToolsDir), `${JSON.stringify(record)}\n`, 'utf8');
    return record;
};

const isTeacherAuthConfigured = config => Boolean(
    config &&
    config.teacherTools &&
    (config.teacherTools.accountsJson || config.teacherTools.dir) &&
    config.teacherTools.sessionSigningKey
);

const persistTeacherAccounts = async ({
    accounts,
    config
}) => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    const now = new Date().toISOString();
    const normalizedAccounts = normalizeTeacherAccountRecords(accounts);
    const document = {
        schemaVersion: TEACHER_ACCOUNTS_SCHEMA_ID,
        updatedAt: now,
        accounts: normalizedAccounts.map(account => ({
            active: account.active !== false,
            classSessionIds: account.classSessionIds,
            createdAt: account.createdAt || now,
            displayName: account.displayName,
            passwordHash: account.passwordHash,
            passwordUpdatedAt: account.passwordUpdatedAt || now,
            role: account.role,
            teacherId: account.teacherId,
            updatedAt: account.updatedAt || now
        }))
    };

    await mkdir(teacherToolsDir, {
        recursive: true
    });
    await writeFile(createTeacherAccountsFilePath(teacherToolsDir), `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
    });
    return document.accounts;
};

const normalizeRosterStudentRecord = ({
    classSessionId,
    config,
    student
}) => {
    const studentKey = student && (
        student.studentKey ||
        student.externalId ||
        student.studentId ||
        student.rosterKey
    );
    const providedStudentScopeId = normalizeOptionalStudentScopeId(student && (
        student.studentScopeId ||
        student.studentScopedId ||
        student.id
    ));
    const generatedStudentScopeId = createRosterStudentScopedId({
        classSessionId,
        config,
        studentKey
    });
    const studentScopeId = generatedStudentScopeId || providedStudentScopeId;
    if (!studentScopeId) return null;

    return {
        active: student && Object.prototype.hasOwnProperty.call(student, 'active') ?
            student.active !== false :
            true,
        displayAlias: redactSensitiveText(
            student && (student.displayAlias || student.alias || student.label),
            TITLE_LIMIT
        ),
        studentScopeId: normalizeStudentScopeId(studentScopeId)
    };
};

const normalizeRosterStudents = ({
    classSessionId,
    config,
    students
}) => readArray(students)
    .slice(0, TEACHER_ROSTER_STUDENT_LIMIT)
    .map(student => normalizeRosterStudentRecord({
        classSessionId,
        config,
        student
    }))
    .filter(Boolean)
    .filter((student, index, list) => (
        list.findIndex(item => item.studentScopeId === student.studentScopeId) === index
    ));

const normalizeRosterClassRecord = ({
    classRecord,
    config
}) => {
    const classSessionId = normalizeClassSessionId(classRecord && (
        classRecord.classSessionId ||
        classRecord.id
    ));
    const now = new Date().toISOString();
    const students = normalizeRosterStudents({
        classSessionId,
        config,
        students: classRecord && classRecord.students
    });

    return {
        active: classRecord && Object.prototype.hasOwnProperty.call(classRecord, 'active') ?
            classRecord.active !== false :
            true,
        classSessionId,
        createdAt: truncateText(classRecord && classRecord.createdAt, TITLE_LIMIT) || now,
        rosterVersion: truncateText(classRecord && classRecord.rosterVersion, TITLE_LIMIT) || 'v1',
        students,
        updatedAt: truncateText(classRecord && classRecord.updatedAt, TITLE_LIMIT) || now
    };
};

const normalizeClassRosterDocument = ({
    config,
    document
}) => {
    const classes = readArray(document && document.classes)
        .map(classRecord => normalizeRosterClassRecord({
            classRecord,
            config
        }))
        .filter(classRecord => classRecord.classSessionId)
        .filter((classRecord, index, list) => (
            list.findIndex(item => item.classSessionId === classRecord.classSessionId) === index
        ));
    return {
        schemaVersion: TEACHER_CLASS_ROSTER_SCHEMA_ID,
        updatedAt: truncateText(document && document.updatedAt, TITLE_LIMIT),
        classes
    };
};

const readClassRosterDocument = async config => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    if (!teacherToolsDir) {
        return {
            configured: false,
            document: normalizeClassRosterDocument({
                config,
                document: {}
            })
        };
    }

    try {
        const rosterText = await readFile(createTeacherClassRostersFilePath(teacherToolsDir), 'utf8');
        return {
            configured: true,
            document: normalizeClassRosterDocument({
                config,
                document: JSON.parse(rosterText)
            })
        };
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return {
                configured: false,
                document: normalizeClassRosterDocument({
                    config,
                    document: {}
                })
            };
        }
        throw error;
    }
};

const persistClassRosterDocument = async ({
    config,
    document
}) => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    const normalizedDocument = normalizeClassRosterDocument({
        config,
        document
    });
    const storedDocument = Object.assign({}, normalizedDocument, {
        updatedAt: new Date().toISOString()
    });

    await mkdir(teacherToolsDir, {
        recursive: true
    });
    await writeFile(createTeacherClassRostersFilePath(teacherToolsDir), `${JSON.stringify(storedDocument, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
    });
    return storedDocument;
};

const createPublicRosterStudent = student => ({
    active: student && student.active !== false,
    displayAlias: redactSensitiveText(student && student.displayAlias, TITLE_LIMIT),
    studentScopeId: normalizeStudentScopeId(student && student.studentScopeId)
});

const createPublicRosterClass = ({
    classRecord,
    includeStudents = false
}) => {
    const activeStudents = readArray(classRecord && classRecord.students)
        .filter(student => student && student.active !== false);

    return {
        active: classRecord && classRecord.active !== false,
        classSessionId: normalizeClassSessionId(classRecord && classRecord.classSessionId),
        rosterVersion: truncateText(classRecord && classRecord.rosterVersion, TITLE_LIMIT),
        studentCount: readArray(classRecord && classRecord.students).length,
        activeStudentCount: activeStudents.length,
        updatedAt: truncateText(classRecord && classRecord.updatedAt, TITLE_LIMIT),
        students: includeStudents ? readArray(classRecord && classRecord.students).map(createPublicRosterStudent) : undefined
    };
};

const createClassRosterListReply = ({
    authorization,
    classes,
    configured,
    filterApplied = false,
    includeStudents = false,
    persisted
}) => ({
    blocked: false,
    configured,
    persisted,
    schemaVersion: TEACHER_CLASS_ROSTER_SCHEMA_ID,
    classes: readArray(classes).map(classRecord => createPublicRosterClass({
        classRecord,
        includeStudents
    })),
    authorization: {
        classSessionScoped: true,
        method: authorization && authorization.method ? authorization.method : '',
        teacherId: authorization && authorization.teacherId ? authorization.teacherId : '',
        valuesRedacted: true
    },
    scope: {
        filterApplied,
        studentScoped: true
    },
    safeguards: {
        displayAliasesMayBePseudonyms: true,
        rawStudentIdentifiersIncluded: false,
        rawStudentIdentifiersStored: false,
        studentEmailsIncluded: false,
        studentNamesIncluded: false,
        valuesRedacted: true
    }
});

const createClassRosterBlockedReply = ({
    action,
    reason
}) => ({
    action,
    blocked: true,
    persisted: false,
    reason,
    schemaVersion: TEACHER_CLASS_ROSTER_ADMIN_SCHEMA_ID,
    text: 'Class roster action was stopped by the roster authorization or data minimization gate.',
    safeguards: {
        rawStudentIdentifiersIncluded: false,
        rawStudentIdentifiersStored: false,
        studentEmailsIncluded: false,
        studentNamesIncluded: false,
        valuesRedacted: true
    }
});

const findRosterClass = ({
    classSessionId,
    document
}) => {
    const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
    return readArray(document && document.classes).find(classRecord => (
        classRecord && classRecord.classSessionId === normalizedClassSessionId
    )) || null;
};

const readClassRosterStudentScope = async ({
    classSessionId,
    config,
    studentScopeId
}) => {
    const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
    const normalizedStudentScopeId = normalizeStudentScopeId(studentScopeId);
    const rosterResult = await readClassRosterDocument(config);
    const scope = {
        classSessionId: normalizedClassSessionId,
        id: normalizedStudentScopeId,
        rosterConfigured: rosterResult.configured,
        rosterVerified: false,
        scoped: true
    };

    if (normalizedStudentScopeId === DEFAULT_STUDENT_SCOPE_ID) {
        return {
            allowed: true,
            reason: 'anonymous-student-scope',
            studentScope: scope
        };
    }

    if (!rosterResult.configured) {
        return {
            allowed: true,
            reason: 'class-roster-not-configured',
            studentScope: scope
        };
    }

    const rosterClass = findRosterClass({
        classSessionId: normalizedClassSessionId,
        document: rosterResult.document
    });
    if (!rosterClass || rosterClass.active === false) {
        return {
            allowed: false,
            reason: 'class-roster-not-found',
            studentScope: scope
        };
    }

    const rosterStudent = readArray(rosterClass.students).find(student => (
        student &&
        student.active !== false &&
        normalizeStudentScopeId(student.studentScopeId) === normalizedStudentScopeId
    ));

    return {
        allowed: Boolean(rosterStudent),
        reason: rosterStudent ? '' : 'student-scope-not-in-class-roster',
        studentScope: Object.assign({}, scope, {
            rosterVerified: Boolean(rosterStudent)
        })
    };
};

const readTeacherAccountAction = request => String(request && request.action || '').trim().toLowerCase();

const normalizeTeacherAccountInput = request => ({
    active: request && Object.prototype.hasOwnProperty.call(request, 'active') ? request.active !== false : true,
    classSessionIds: normalizeClassSessionIds(request && request.classSessionIds),
    displayName: redactSensitiveText(request && request.displayName, TITLE_LIMIT),
    password: String(request && request.password || ''),
    role: normalizeTeacherRole(request && request.role),
    teacherId: normalizeTeacherId(request && request.teacherId)
});

const hasAtLeastOneActiveAdmin = accounts => accounts.some(account => account.active !== false && account.role === 'admin');

const createTeacherAccountAdminActionBlockedReply = ({
    action,
    reason,
    targetTeacherId
}) => ({
    blocked: true,
    persisted: false,
    schemaVersion: TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    action,
    reason,
    targetTeacherId: normalizeTeacherId(targetTeacherId),
    text: 'Teacher account admin action was stopped by the account governance gate.',
    safeguards: {
        classRosterIncluded: false,
        passwordHashReturned: false,
        passwordReturned: false,
        studentIdentityIncluded: false,
        valuesRedacted: true
    }
});

const applyTeacherAccountAdminAction = ({
    accounts,
    request
}) => {
    const action = readTeacherAccountAction(request);
    const input = normalizeTeacherAccountInput(request);
    const now = new Date().toISOString();
    const nextAccounts = accounts.map(account => Object.assign({}, account));
    const index = nextAccounts.findIndex(account => account.teacherId === input.teacherId);
    const existing = index >= 0 ? nextAccounts[index] : null;

    if (!['create', 'update', 'reset-password', 'deactivate', 'activate'].includes(action)) {
        return {
            blocked: true,
            reason: 'teacher-account-action-invalid',
            action,
            accounts: nextAccounts,
            targetTeacherId: input.teacherId
        };
    }
    if (!input.teacherId) {
        return {
            blocked: true,
            reason: 'teacher-account-id-required',
            action,
            accounts: nextAccounts,
            targetTeacherId: ''
        };
    }
    if (action === 'create' && existing) {
        return {
            blocked: true,
            reason: 'teacher-account-already-exists',
            action,
            accounts: nextAccounts,
            targetTeacherId: input.teacherId
        };
    }
    if (action !== 'create' && !existing) {
        return {
            blocked: true,
            reason: 'teacher-account-not-found',
            action,
            accounts: nextAccounts,
            targetTeacherId: input.teacherId
        };
    }
    if ((action === 'create' || action === 'reset-password') && input.password.length < TEACHER_PASSWORD_MIN_LENGTH) {
        return {
            blocked: true,
            reason: 'teacher-password-too-short',
            action,
            accounts: nextAccounts,
            targetTeacherId: input.teacherId
        };
    }
    if ((action === 'create' || action === 'update') && !input.classSessionIds.length) {
        return {
            blocked: true,
            reason: 'teacher-account-class-session-required',
            action,
            accounts: nextAccounts,
            targetTeacherId: input.teacherId
        };
    }

    if (action === 'create') {
        nextAccounts.push({
            active: true,
            classSessionIds: input.classSessionIds,
            createdAt: now,
            displayName: input.displayName || input.teacherId,
            passwordHash: createTeacherPasswordHash({
                password: input.password
            }),
            passwordUpdatedAt: now,
            role: input.role,
            teacherId: input.teacherId,
            updatedAt: now
        });
    } else if (action === 'update') {
        nextAccounts[index] = Object.assign({}, existing, {
            active: input.active,
            classSessionIds: input.classSessionIds,
            displayName: input.displayName || input.teacherId,
            role: input.role,
            updatedAt: now
        });
    } else if (action === 'reset-password') {
        nextAccounts[index] = Object.assign({}, existing, {
            passwordHash: createTeacherPasswordHash({
                password: input.password
            }),
            passwordUpdatedAt: now,
            updatedAt: now
        });
    } else if (action === 'deactivate') {
        nextAccounts[index] = Object.assign({}, existing, {
            active: false,
            updatedAt: now
        });
    } else if (action === 'activate') {
        nextAccounts[index] = Object.assign({}, existing, {
            active: true,
            updatedAt: now
        });
    }

    if (!hasAtLeastOneActiveAdmin(nextAccounts)) {
        return {
            blocked: true,
            reason: 'teacher-account-last-admin-required',
            action,
            accounts: accounts.map(account => Object.assign({}, account)),
            targetTeacherId: input.teacherId
        };
    }

    return {
        blocked: false,
        action,
        accounts: nextAccounts,
        targetTeacherId: input.teacherId
    };
};

const createTeacherAccountAdminReply = async ({
    config,
    request,
    requestHeaders
}) => {
    const action = readTeacherAccountAction(request);
    const authorization = await readTeacherAdminAuthorization({
        config,
        requestHeaders
    });
    const targetTeacherId = normalizeTeacherId(request && request.teacherId);

    if (!authorization.allowed) {
        await persistTeacherAdminOperation({
            action,
            authorization,
            config,
            reason: authorization.reason,
            result: 'blocked',
            targetTeacherId
        });
        return createTeacherAdminAuthorizationLockedReply({
            action,
            reason: authorization.reason
        });
    }
    if (!config || !config.teacherTools || !config.teacherTools.dir) {
        await persistTeacherAdminOperation({
            action,
            authorization,
            config,
            reason: 'teacher-storage-not-configured',
            result: 'blocked',
            targetTeacherId
        });
        return createTeacherStorageMissingReply(action || 'teacher-account-admin');
    }

    const accounts = await readTeacherAccounts(config);
    const result = applyTeacherAccountAdminAction({
        accounts,
        request
    });
    if (result.blocked) {
        await persistTeacherAdminOperation({
            action: result.action,
            authorization,
            config,
            reason: result.reason,
            result: 'blocked',
            targetTeacherId: result.targetTeacherId
        });
        return createTeacherAccountAdminActionBlockedReply({
            action: result.action,
            reason: result.reason,
            targetTeacherId: result.targetTeacherId
        });
    }

    const persistedAccounts = await persistTeacherAccounts({
        accounts: result.accounts,
        config
    });
    await persistTeacherAdminOperation({
        action: result.action,
        authorization,
        config,
        result: 'persisted',
        targetTeacherId: result.targetTeacherId
    });

    return Object.assign(createTeacherAccountListReply({
        accounts: persistedAccounts,
        authorization,
        persisted: true
    }), {
        action: result.action,
        targetTeacherId: result.targetTeacherId
    });
};

const createTeacherAccountListAdminReply = async ({
    config,
    requestHeaders
}) => {
    const authorization = await readTeacherAdminAuthorization({
        config,
        requestHeaders
    });
    if (!authorization.allowed) {
        await persistTeacherAdminOperation({
            action: 'list',
            authorization,
            config,
            reason: authorization.reason,
            result: 'blocked'
        });
        return createTeacherAdminAuthorizationLockedReply({
            action: 'list',
            reason: authorization.reason
        });
    }

    const accounts = await readTeacherAccounts(config);
    return createTeacherAccountListReply({
        accounts,
        authorization,
        persisted: Boolean(config && config.teacherTools && config.teacherTools.dir)
    });
};

const createTeacherSessionReply = async ({
    config,
    request
}) => {
    const requestForSafety = Object.assign({}, request || {});
    delete requestForSafety.password;
    const safetyGate = createTeacherSafetyGate(requestForSafety);
    const teacherId = normalizeTeacherId(request && request.teacherId);
    const password = String(request && request.password || '');

    if (!isTeacherAuthConfigured(config)) {
        safetyGate.blockedReasons.push('teacher-auth-not-configured');
        safetyGate.allowed = false;
    }
    if (!teacherId || !password) {
        safetyGate.blockedReasons.push('teacher-credentials-required');
        safetyGate.allowed = false;
    }

    const account = (await readTeacherAccounts(config)).find(item => item.teacherId === teacherId);
    if (account && account.active === false) {
        safetyGate.blockedReasons.push('teacher-account-inactive');
        safetyGate.allowed = false;
    }
    if (!account || !verifyTeacherPassword({
        password,
        passwordHash: account.passwordHash
    })) {
        safetyGate.blockedReasons.push('teacher-credentials-invalid');
        safetyGate.allowed = false;
    }

    if (!safetyGate.allowed) {
        return {
            blocked: true,
            persisted: false,
            schemaVersion: TEACHER_AUTH_SCHEMA_ID,
            safetyGate: createTeacherSafetySummary(safetyGate),
            text: 'Teacher session was stopped by the teacher authorization gate.'
        };
    }

    const token = createTeacherSessionToken({
        account,
        config
    });
    const session = verifyTeacherSessionToken({
        config,
        requestHeaders: {
            'x-scratch-ai-teacher-session-token': token
        }
    }).session;

    return {
        blocked: false,
        persisted: false,
        schemaVersion: TEACHER_AUTH_SCHEMA_ID,
        teacherSessionToken: token,
        teacher: {
            classSessionIds: account.classSessionIds,
            displayName: account.displayName,
            role: account.role,
            teacherId: account.teacherId
        },
        session: {
            expiresAt: session.expiresAt,
            ttlSeconds: Math.round(TEACHER_SESSION_TTL_MS / 1000)
        },
        safetyGate: createTeacherSafetySummary(safetyGate),
        safeguards: {
            passwordStored: false,
            passwordReturned: false,
            passwordHashReturned: false,
            studentIdentityIncluded: false,
            valuesRedacted: true
        }
    };
};

const readTeacherClassAuthorization = async ({
    classSessionId,
    config,
    requestHeaders
}) => {
    if (hasTeacherAdminAccess({
        config,
        requestHeaders
    })) {
        return {
            allowed: true,
            method: 'admin-token',
            teacherId: ''
        };
    }

    const sessionResult = verifyTeacherSessionToken({
        config,
        requestHeaders
    });
    if (!sessionResult.valid) {
        return {
            allowed: false,
            method: 'teacher-session',
            reason: sessionResult.reason,
            teacherId: ''
        };
    }

    const account = (await readTeacherAccounts(config))
        .find(item => item.teacherId === sessionResult.session.teacherId);
    if (!account || account.active === false) {
        return {
            allowed: false,
            classSessionId: normalizeClassSessionId(classSessionId),
            method: 'teacher-session',
            reason: 'teacher-account-inactive',
            teacherId: sessionResult.session.teacherId
        };
    }

    const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
    const allowed = account.role === 'admin' ||
        account.classSessionIds.includes(normalizedClassSessionId);
    return {
        allowed,
        classSessionId: normalizedClassSessionId,
        method: 'teacher-session',
        reason: allowed ? '' : 'teacher-class-not-authorized',
        teacherId: sessionResult.session.teacherId
    };
};

const readRosterAdminAction = request => String(request && request.action || '').trim().toLowerCase();

const createClassRosterAdminReply = async ({
    config,
    request,
    requestHeaders
}) => {
    const action = readRosterAdminAction(request);
    const classSessionId = normalizeOptionalClassSessionId(request && request.classSessionId);
    const authorization = await readTeacherAdminAuthorization({
        config,
        requestHeaders
    });

    if (!authorization.allowed) {
        await persistTeacherAdminOperation({
            action: action || 'class-roster-admin',
            authorization,
            config,
            reason: authorization.reason,
            result: 'blocked'
        });
        return createClassRosterBlockedReply({
            action,
            reason: authorization.reason
        });
    }

    if (!config || !config.teacherTools || !config.teacherTools.dir) {
        await persistTeacherAdminOperation({
            action: action || 'class-roster-admin',
            authorization,
            config,
            reason: 'teacher-storage-not-configured',
            result: 'blocked'
        });
        return createTeacherStorageMissingReply(action || 'class-roster-admin');
    }

    if (!['upsert', 'archive-class'].includes(action)) {
        return createClassRosterBlockedReply({
            action,
            reason: 'class-roster-action-invalid'
        });
    }
    if (!classSessionId) {
        return createClassRosterBlockedReply({
            action,
            reason: 'class-session-id-required'
        });
    }

    const rosterResult = await readClassRosterDocument(config);
    const document = rosterResult.document;
    const nextClasses = readArray(document.classes).map(classRecord => Object.assign({}, classRecord, {
        students: readArray(classRecord.students).map(student => Object.assign({}, student))
    }));
    const classIndex = nextClasses.findIndex(classRecord => classRecord.classSessionId === classSessionId);
    const existingClass = classIndex >= 0 ? nextClasses[classIndex] : null;
    const now = new Date().toISOString();

    if (action === 'upsert') {
        const students = normalizeRosterStudents({
            classSessionId,
            config,
            students: request && request.students
        });
        const nextClass = {
            active: request && Object.prototype.hasOwnProperty.call(request, 'active') ?
                request.active !== false :
                true,
            classSessionId,
            createdAt: existingClass && existingClass.createdAt ? existingClass.createdAt : now,
            rosterVersion: truncateText(request && request.rosterVersion, TITLE_LIMIT) ||
                (existingClass && existingClass.rosterVersion) ||
                'v1',
            students,
            updatedAt: now
        };
        if (classIndex >= 0) {
            nextClasses[classIndex] = nextClass;
        } else {
            nextClasses.push(nextClass);
        }
    } else if (action === 'archive-class') {
        if (!existingClass) {
            return createClassRosterBlockedReply({
                action,
                reason: 'class-roster-not-found'
            });
        }
        nextClasses[classIndex] = Object.assign({}, existingClass, {
            active: false,
            updatedAt: now
        });
    }

    const persistedDocument = await persistClassRosterDocument({
        config,
        document: Object.assign({}, document, {
            classes: nextClasses
        })
    });
    await persistTeacherAdminOperation({
        action: `class-roster-${action}`,
        authorization,
        config,
        result: 'persisted'
    });

    return Object.assign(createClassRosterListReply({
        authorization,
        classes: [findRosterClass({
            classSessionId,
            document: persistedDocument
        })].filter(Boolean),
        configured: true,
        filterApplied: true,
        includeStudents: true,
        persisted: true
    }), {
        action,
        schemaVersion: TEACHER_CLASS_ROSTER_ADMIN_SCHEMA_ID
    });
};

const createClassRosterReadReply = async ({
    classSessionId,
    config,
    requestHeaders
}) => {
    const normalizedClassSessionId = normalizeOptionalClassSessionId(classSessionId);

    if (normalizedClassSessionId) {
        const authorization = await readTeacherClassAuthorization({
            classSessionId: normalizedClassSessionId,
            config,
            requestHeaders
        });
        if (!authorization.allowed) {
            return createClassRosterBlockedReply({
                action: 'class-roster-read',
                reason: authorization.reason
            });
        }

        const rosterResult = await readClassRosterDocument(config);
        const rosterClass = findRosterClass({
            classSessionId: normalizedClassSessionId,
            document: rosterResult.document
        });
        return createClassRosterListReply({
            authorization,
            classes: rosterClass ? [rosterClass] : [],
            configured: rosterResult.configured,
            filterApplied: true,
            includeStudents: true,
            persisted: Boolean(config && config.teacherTools && config.teacherTools.dir)
        });
    }

    const authorization = await readTeacherAdminAuthorization({
        config,
        requestHeaders
    });
    if (!authorization.allowed) {
        return createClassRosterBlockedReply({
            action: 'class-roster-read',
            reason: authorization.reason
        });
    }

    const rosterResult = await readClassRosterDocument(config);
    return createClassRosterListReply({
        authorization,
        classes: rosterResult.document.classes,
        configured: rosterResult.configured,
        filterApplied: false,
        includeStudents: false,
        persisted: Boolean(config && config.teacherTools && config.teacherTools.dir)
    });
};

const createRosterMigrationPlanReply = ({
    config
}) => ({
    blocked: false,
    schemaVersion: TEACHER_ROSTER_MIGRATION_SCHEMA_ID,
    currentStorage: {
        kind: 'server-local-json',
        rostersFile: TEACHER_CLASS_ROSTERS_FILE,
        teacherAccountsFile: TEACHER_ACCOUNTS_FILE,
        releaseAuditStorage: 'server-local-jsonl',
        pathsRedacted: true
    },
    targetStorage: {
        kind: 'database-row-level-security',
        tables: [
            'class_sessions',
            'class_roster_members',
            'teacher_class_authorizations',
            'release_records',
            'teacher_review_records',
            'student_report_records',
            'export_jobs'
        ],
        objectStorageAcl: 'classSessionId + studentScopeId prefix policy'
    },
    migrationSteps: [
        'Create class_sessions from teacher account classSessionIds and roster classes.',
        'Import class_roster_members with only studentScopeId, classSessionId, active state, and pseudonym alias.',
        'Backfill release, teacher review, and report records with default-class-session and anonymous-student when missing.',
        'Enable database row-level policies for teacher_class_authorizations before enabling write traffic.',
        'Run anonymized export checks, then rotate preview JSON/JSONL files into encrypted backup.'
    ],
    readiness: {
        classRosterConfigured: Boolean(config && config.teacherTools && config.teacherTools.dir),
        teacherSessionRequired: true,
        rosterRawIdentifiersStored: false,
        destructiveMigrationEnabled: false,
        valuesRedacted: true
    }
});

const createTeacherLockFilePath = teacherToolsDir => resolve(String(teacherToolsDir || '').trim(), TEACHER_LOCK_FILE);

const readTeacherLockRecords = async teacherToolsDir => {
    const normalizedDir = String(teacherToolsDir || '').trim();
    if (!normalizedDir) return [];

    try {
        const recordsText = await readFile(createTeacherLockFilePath(normalizedDir), 'utf8');
        return recordsText.split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => JSON.parse(line));
    } catch (error) {
        if (error && error.code === 'ENOENT') return [];
        throw error;
    }
};

const persistTeacherKnowledgeLock = async ({
    authorization,
    config,
    knowledgeLock,
    request
}) => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    const classSessionId = normalizeClassSessionId(request && request.classSessionId);
    const record = {
        schemaVersion: TEACHER_LOCK_SCHEMA_ID,
        lockId: randomUUID(),
        createdAt: new Date().toISOString(),
        active: true,
        classSessionId,
        authorization: {
            method: authorization && authorization.method ? authorization.method : 'admin-token',
            teacherId: authorization && authorization.teacherId ? authorization.teacherId : ''
        },
        lessonTitle: knowledgeLock.title,
        gradeBand: knowledgeLock.gradeBand,
        selectedKnowledgePointIds: knowledgeLock.selectedKnowledgePoints.map(item => item.id),
        knowledgeLock: Object.assign({}, knowledgeLock, {
            persisted: true,
            persistence: {
                persisted: true,
                storage: 'server-local-jsonl',
                writesToSb3: false
            }
        }),
        modelCalled: false
    };

    await mkdir(teacherToolsDir, {
        recursive: true
    });
    await appendFile(createTeacherLockFilePath(teacherToolsDir), `${JSON.stringify(record)}\n`, 'utf8');
    return record;
};

const readKnownKnowledgePoints = ids => ids
    .filter(id => KNOWLEDGE_POINT_BY_ID.has(id))
    .map(id => KNOWLEDGE_POINT_BY_ID.get(id));

const readUnknownKnowledgePointIds = ids => ids.filter(id => !KNOWLEDGE_POINT_BY_ID.has(id));

const createKnowledgeLockPolicy = ({
    gradeBand,
    lessonTitle,
    selectedKnowledgePoints
}) => {
    const selectedLabels = selectedKnowledgePoints.map(item => item.label);
    const title = redactSensitiveText(lessonTitle, TITLE_LIMIT) || 'Scratch 课堂';

    return {
        title,
        gradeBand,
        selectedKnowledgePoints,
        aiWhitelist: selectedKnowledgePoints.map(item => ({
            id: item.id,
            label: item.label,
            blockFamilies: item.blockFamilies
        })),
        promptContract: [
            '只围绕锁定知识点追问、提示和评价。',
            '先问学生想法, 再给小提示。',
            '不直接给完整可复制脚本。',
            '超出范围的想法只作为延伸提醒。'
        ],
        questionRules: selectedKnowledgePoints.flatMap(item => item.questionStems.map(stem => ({
            knowledgePointId: item.id,
            text: stem
        }))),
        rubricFocus: selectedKnowledgePoints.map(item => ({
            knowledgePointId: item.id,
            label: item.label,
            focus: item.rubricFocus,
            levels: [
                '还说不清楚。',
                '能说出一点, 但需要例子。',
                '能用自己的话说清楚。',
                '能结合脚本和测试一起说明。'
            ]
        })),
        classroomPhrase: selectedLabels.length ?
            `今天先练 ${selectedLabels.join('、')}, 其他想法可以放到挑战任务。` :
            '今天先选 1 到 4 个知识点, AI 才能帮你守住课堂目标。',
        persisted: false,
        modelCalled: false
    };
};

const createKnowledgeLockDraftReply = ({
    request
}) => {
    const safetyGate = createTeacherSafetyGate(request || {});
    const selectedIds = normalizeKnowledgePointIds(request && request.selectedKnowledgePointIds);
    const unknownIds = readUnknownKnowledgePointIds(selectedIds);

    if (!selectedIds.length) {
        safetyGate.blockedReasons.push('empty-knowledge-lock');
        safetyGate.allowed = false;
    }
    unknownIds.forEach(id => {
        safetyGate.blockedReasons.push(`unknown-knowledge-point:${id}`);
    });
    if (unknownIds.length) safetyGate.allowed = false;

    if (!safetyGate.allowed) {
        return {
            mode: 'teacher-draft',
            persisted: false,
            modelCalled: false,
            blocked: true,
            safetyGate: createTeacherSafetySummary(safetyGate),
            text: 'Knowledge lock draft was stopped by the teacher safety gate.'
        };
    }

    return {
        mode: 'teacher-draft',
        persisted: false,
        modelCalled: false,
        blocked: false,
        safetyGate: createTeacherSafetySummary(safetyGate),
        knowledgeLock: createKnowledgeLockPolicy({
            gradeBand: normalizeGradeBand(request && request.gradeBand),
            lessonTitle: request && request.lessonTitle,
            selectedKnowledgePoints: readKnownKnowledgePoints(selectedIds)
        })
    };
};

const shouldPersistKnowledgeLock = request => (
    request && (request.persist === true || request.persistKnowledgeLock === true)
);

const createKnowledgeLockReply = async ({
    config,
    request,
    requestHeaders
}) => {
    const draftReply = createKnowledgeLockDraftReply({
        request
    });

    if (draftReply.blocked || !shouldPersistKnowledgeLock(request)) return draftReply;

    if (!config || !config.teacherTools || !config.teacherTools.dir) {
        return createTeacherStorageMissingReply('teacher-knowledge-lock-persist');
    }

    const classSessionId = normalizeClassSessionId(request && request.classSessionId);
    const authorization = await readTeacherClassAuthorization({
        classSessionId,
        config,
        requestHeaders
    });
    if (!authorization.allowed) {
        if (isTeacherAuthConfigured(config)) {
            return createTeacherClassAuthorizationLockedReply({
                action: 'teacher-knowledge-lock-persist',
                reason: authorization.reason
            });
        }
        return createTeacherAdminLockedReply('teacher-knowledge-lock-persist');
    }

    const record = await persistTeacherKnowledgeLock({
        authorization,
        config,
        knowledgeLock: draftReply.knowledgeLock,
        request
    });

    return {
        mode: 'teacher-class-session',
        persisted: true,
        storage: 'jsonl',
        modelCalled: false,
        blocked: false,
        safetyGate: draftReply.safetyGate,
        lockId: record.lockId,
        classSession: {
            id: record.classSessionId,
            active: true
        },
        authorization: {
            classSessionId: record.classSessionId,
            method: authorization.method,
            teacherId: authorization.teacherId,
            valuesRedacted: true
        },
        knowledgeLock: record.knowledgeLock,
        persistence: {
            persisted: true,
            storage: 'server-local-jsonl',
            schemaVersion: TEACHER_LOCK_SCHEMA_ID,
            writesToSb3: false
        }
    };
};

const createActiveKnowledgeLockReply = async ({
    classSessionId,
    config
} = {}) => {
    const teacherToolsDir = config && config.teacherTools && config.teacherTools.dir;
    const records = await readTeacherLockRecords(teacherToolsDir);
    const normalizedClassSessionId = classSessionId ? normalizeClassSessionId(classSessionId) : '';
    const matchingRecords = normalizedClassSessionId ?
        records.filter(record => record && record.classSessionId === normalizedClassSessionId) :
        records;
    const activeRecord = matchingRecords.slice().reverse().find(record => record && record.active !== false);

    return {
        mode: 'teacher-class-session',
        persisted: Boolean(teacherToolsDir),
        active: Boolean(activeRecord),
        storage: teacherToolsDir ? 'jsonl' : 'none',
        schemaVersion: TEACHER_LOCK_SCHEMA_ID,
        valuesRedacted: true,
        classSession: activeRecord ? {
            id: activeRecord.classSessionId,
            active: true
        } : null,
        lockId: activeRecord ? activeRecord.lockId : '',
        knowledgeLock: activeRecord ? activeRecord.knowledgeLock : null,
        modelCalled: false
    };
};

const scoreGoalKeyword = (goal, keywords) => keywords.some(keyword => goal.indexOf(keyword) !== -1);

const recommendKnowledgePointIds = goal => {
    const normalizedGoal = truncateText(goal).toLowerCase();
    const ids = ['events'];

    if (scoreGoalKeyword(normalizedGoal, ['变量', '分数', '计分', '倒计时', '数'])) ids.push('variables');
    if (scoreGoalKeyword(normalizedGoal, ['相加', '加法', '加起来', '总数'])) ids.push('addition');
    if (scoreGoalKeyword(normalizedGoal, ['算', '运算', '+', '加'])) ids.push('operators');
    if (scoreGoalKeyword(normalizedGoal, ['如果', '判断', '答对', '答错', '条件'])) ids.push('conditionals');
    if (scoreGoalKeyword(normalizedGoal, ['重复', '一直', '循环', '每次'])) ids.push('loops');
    if (scoreGoalKeyword(normalizedGoal, ['广播', '消息', '切换角色'])) ids.push('broadcasts');
    if (scoreGoalKeyword(normalizedGoal, ['问答', '输入', '碰到', '按键'])) ids.push('sensing');

    ids.push('sequence', 'debugging');
    return ids.filter((id, index, list) => list.indexOf(id) === index).slice(0, 5);
};

const createLessonPrepDraft = ({
    durationMinutes,
    gradeBand,
    lessonGoal,
    lockedKnowledgePointIds
}) => {
    const title = redactSensitiveText(lessonGoal, TITLE_LIMIT) || 'Scratch 小任务';
    const recommendedIds = recommendKnowledgePointIds(lessonGoal);
    const finalLockedIds = normalizeKnowledgePointIds(lockedKnowledgePointIds).length ?
        normalizeKnowledgePointIds(lockedKnowledgePointIds) :
        recommendedIds.slice(0, 4);
    const recommendedKnowledgePoints = readKnownKnowledgePoints(recommendedIds);
    const lockedKnowledgePoints = readKnownKnowledgePoints(finalLockedIds);

    return {
        title,
        gradeBand,
        durationMinutes,
        recommendedKnowledgePoints,
        lockedKnowledgePoints,
        taskCard: {
            studentGoal: `做一个小作品: ${title}`,
            steps: [
                '先说清楚作品成功时舞台上会看到什么。',
                '找出让程序开始的积木。',
                '只搭本节课需要的关键脚本。',
                '试一次, 写下你看到的结果。'
            ],
            deliverable: '一个能运行、能解释、能测试的 Scratch 小作品。'
        },
        explainGateQuestions: [
            '你的作品成功时, 舞台上应该看到什么?',
            '先发生什么? 程序要判断或保存什么?',
            '你会试哪一步, 来证明它真的成功了?'
        ],
        aiWhitelist: {
            allowedKnowledgePointIds: lockedKnowledgePoints.map(item => item.id),
            allowedHelp: [
                '追问目标、步骤和测试方法。',
                '提示锁定知识点相关的积木类别。',
                '帮学生把想法拆成 3 到 5 个小步骤。',
                '给 Rubric 草稿和课堂检查问题。'
            ],
            disallowedHelp: [
                '直接生成完整可复制脚本。',
                '引入未锁定知识点作为主要答案。',
                '读取或保存真实学生名单。',
                '上传学生作品全文。'
            ]
        },
        rubric: lockedKnowledgePoints.map(item => ({
            knowledgePointId: item.id,
            label: item.label,
            criteria: item.rubricFocus,
            levels: [
                '还没有做到。',
                '做到一部分。',
                '能独立完成并说清楚。',
                '能解释给同学听, 并能改进。'
            ]
        })),
        teacherReviewChecklist: [
            '任务是否只需要本节课知识点就能完成?',
            '学生是否必须先解释, 再请求 AI 提示?',
            'Rubric 是否能看出目标、逻辑和测试?',
            '是否没有包含真实班级或学生数据?'
        ],
        persistence: {
            persisted: false,
            storage: 'none',
            note: 'Draft is returned to the browser only. No class record is written.'
        },
        modelCalled: false
    };
};

const createLessonPrepDraftReply = ({
    request
}) => {
    const safetyGate = createTeacherSafetyGate(request || {});
    const lessonGoal = redactSensitiveText(request && request.lessonGoal, TEXT_LIMIT);

    if (!lessonGoal) {
        safetyGate.blockedReasons.push('empty-lesson-goal');
        safetyGate.allowed = false;
    }

    if (!safetyGate.allowed) {
        return {
            mode: 'teacher-draft',
            persisted: false,
            modelCalled: false,
            blocked: true,
            safetyGate: createTeacherSafetySummary(safetyGate),
            text: 'Lesson prep draft was stopped by the teacher safety gate.'
        };
    }

    return {
        mode: 'teacher-draft',
        persisted: false,
        modelCalled: false,
        blocked: false,
        safetyGate: createTeacherSafetySummary(safetyGate),
        lessonPrep: createLessonPrepDraft({
            durationMinutes: readDurationMinutes(request && request.durationMinutes),
            gradeBand: normalizeGradeBand(request && request.gradeBand),
            lessonGoal,
            lockedKnowledgePointIds: request && request.lockedKnowledgePointIds
        })
    };
};

const createKnowledgePointLibraryReply = () => ({
    mode: 'teacher-draft',
    persisted: false,
    modelCalled: false,
    knowledgePoints: KNOWLEDGE_POINT_LIBRARY
});

export {
    FORBIDDEN_TEACHER_FIELDS,
    GRADE_BANDS,
    KNOWLEDGE_POINT_LIBRARY,
    TEACHER_ACCOUNTS_FILE,
    TEACHER_ACCOUNTS_SCHEMA_ID,
    TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    TEACHER_ADMIN_OPERATIONS_FILE,
    TEACHER_ADMIN_OPERATION_SCHEMA_ID,
    TEACHER_CLASS_ROSTERS_FILE,
    TEACHER_CLASS_ROSTER_ADMIN_SCHEMA_ID,
    TEACHER_CLASS_ROSTER_SCHEMA_ID,
    TEACHER_ROSTER_MIGRATION_SCHEMA_ID,
    createActiveKnowledgeLockReply,
    createClassRosterAdminReply,
    createClassRosterReadReply,
    createTeacherAccountAdminReply,
    createTeacherAccountListAdminReply,
    createKnowledgeLockReply,
    createKnowledgeLockDraftReply,
    createKnowledgePointLibraryReply,
    createLessonPrepDraftReply,
    createRosterMigrationPlanReply,
    createRosterStudentScopedId,
    createTeacherPasswordHash,
    createTeacherSessionReply,
    createTeacherSafetyGate,
    readClassRosterStudentScope,
    verifyTeacherSessionToken,
    recommendKnowledgePointIds
};
