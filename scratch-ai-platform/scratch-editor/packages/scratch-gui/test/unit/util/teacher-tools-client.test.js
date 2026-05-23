import {
    GRADE_BANDS,
    TEACHER_ACCOUNTS_PATH,
    TEACHER_ACCOUNT_ADMIN_ACTION_PATH,
    TEACHER_ACCOUNT_ADMIN_SCHEMA_ID,
    TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH,
    TEACHER_KNOWLEDGE_LOCK_PATH,
    TEACHER_LESSON_PREP_PATH,
    TEACHER_SESSION_PATH,
    createActiveKnowledgeLockPath,
    createKnowledgeLockPayload,
    createLessonPrepPayload,
    createTeacherAccountAdminPayload,
    createTeacherSessionPayload,
    createTeacherToolsUrl,
    requestActiveKnowledgeLock,
    requestKnowledgeLockDraft,
    requestLessonPrepDraft,
    requestTeacherAccountAdminAction,
    requestTeacherAccounts,
    requestTeacherSession
} from '../../../src/lib/ai/teacher-tools-client';

describe('teacher tools client', () => {
    test('builds teacher middleware URLs', () => {
        expect(createTeacherToolsUrl('http://127.0.0.1:8787/', TEACHER_KNOWLEDGE_LOCK_PATH)).toBe(
            'http://127.0.0.1:8787/api/v1/teacher/knowledge-lock'
        );
        expect(createActiveKnowledgeLockPath({
            classSessionId: ' Class A / Spring '
        })).toBe(`${TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH}?classSessionId=Class-A-Spring`);
    });

    test('creates knowledge lock payload without class or project data', () => {
        const payload = createKnowledgeLockPayload({
            classSessionId: ' Class A / Spring ',
            teacherConsent: true,
            gradeBand: GRADE_BANDS.UPPER_PRIMARY,
            lessonTitle: '相加小练习',
            persist: true,
            selectedKnowledgePointIds: ['events', 'variables', 'unknown', 'addition'],
            classRoster: ['do-not-send'],
            projectJson: {
                targets: []
            }
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.teacherConsent).toBe(true);
        expect(payload.classSessionId).toBe('Class-A-Spring');
        expect(payload.persist).toBe(true);
        expect(payload.selectedKnowledgePointIds).toEqual(['events', 'variables', 'addition']);
        expect(payloadJson.includes('classRoster')).toBe(false);
        expect(payloadJson.includes('projectJson')).toBe(false);
        expect(payloadJson.includes('targets')).toBe(false);
    });

    test('creates teacher session payload with sanitized teacher id only', () => {
        const payload = createTeacherSessionPayload({
            teacherConsent: true,
            teacherId: ' Teacher A ',
            password: 'secret password'
        });

        expect(payload.teacherConsent).toBe(true);
        expect(payload.teacherId).toBe('teacher-a');
        expect(payload.password).toBe('secret password');
    });

    test('creates teacher account admin payload without password hashes or roster data', () => {
        const payload = createTeacherAccountAdminPayload({
            action: 'CREATE',
            active: true,
            classRoster: ['do-not-send'],
            classSessionIds: ' Class A / Spring, class-b ',
            displayName: 'Teacher Alpha',
            password: ' rotated password ',
            passwordHash: 'do-not-send',
            role: 'admin',
            teacherId: ' Teacher Alpha '
        });
        const payloadJson = JSON.stringify(payload);

        expect(TEACHER_ACCOUNT_ADMIN_SCHEMA_ID).toBe('scratch-ai-teacher-account-admin-v1');
        expect(payload.action).toBe('create');
        expect(payload.teacherId).toBe('teacher-alpha');
        expect(payload.role).toBe('admin');
        expect(payload.classSessionIds).toEqual(['Class-A-Spring', 'class-b']);
        expect(payload.password).toBe('rotated password');
        expect(payloadJson.includes('passwordHash')).toBe(false);
        expect(payloadJson.includes('classRoster')).toBe(false);
    });

    test('creates lesson prep payload with clamped duration and locked points', () => {
        const payload = createLessonPrepPayload({
            teacherConsent: true,
            gradeBand: 'unknown',
            durationMinutes: 999,
            lessonGoal: '做一个输入两个数并相加的小游戏',
            lockedKnowledgePointIds: ['events', 'addition']
        });

        expect(payload.gradeBand).toBe(GRADE_BANDS.UPPER_PRIMARY);
        expect(payload.durationMinutes).toBe(120);
        expect(payload.lockedKnowledgePointIds).toEqual(['events', 'addition']);
    });

    test('requests active lock and posts teacher session, knowledge lock and lesson prep JSON', async () => {
        const calls = [];
        const fetchImpl = (url, options) => {
            calls.push({
                url,
                body: options.body ? JSON.parse(options.body) : null,
                headers: options.headers,
                method: options.method
            });
            return {
                ok: true,
                json: () => ({
                    persisted: false,
                    modelCalled: false
                })
            };
        };

        await requestActiveKnowledgeLock({
            classSessionId: 'class a',
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999'
        });
        await requestTeacherSession({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: {
                teacherConsent: true,
                teacherId: 'teacher-a',
                password: 'secret'
            }
        });
        await requestTeacherAccounts({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            teacherSessionToken: 'session-token'
        });
        await requestTeacherAccountAdminAction({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: createTeacherAccountAdminPayload({
                action: 'deactivate',
                teacherId: 'teacher-a'
            }),
            teacherSessionToken: 'session-token'
        });
        await requestKnowledgeLockDraft({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: {
                teacherConsent: true,
                selectedKnowledgePointIds: ['events']
            },
            teacherSessionToken: 'session-token'
        });
        await requestLessonPrepDraft({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: {
                teacherConsent: true,
                lessonGoal: '加法'
            }
        });

        expect(calls[0].url).toBe(
            `http://127.0.0.1:9999${TEACHER_ACTIVE_KNOWLEDGE_LOCK_PATH}?classSessionId=class-a`
        );
        expect(calls[0].method).toBe('GET');
        expect(calls[1].url).toBe(`http://127.0.0.1:9999${TEACHER_SESSION_PATH}`);
        expect(calls[1].method).toBe('POST');
        expect(calls[1].body.password).toBe('secret');
        expect(calls[2].url).toBe(`http://127.0.0.1:9999${TEACHER_ACCOUNTS_PATH}`);
        expect(calls[2].headers['X-Scratch-AI-Teacher-Session-Token']).toBe('session-token');
        expect(calls[3].url).toBe(`http://127.0.0.1:9999${TEACHER_ACCOUNT_ADMIN_ACTION_PATH}`);
        expect(calls[3].body.action).toBe('deactivate');
        expect(calls[4].url).toBe(`http://127.0.0.1:9999${TEACHER_KNOWLEDGE_LOCK_PATH}`);
        expect(calls[4].headers['X-Scratch-AI-Teacher-Session-Token']).toBe('session-token');
        expect(calls[5].url).toBe(`http://127.0.0.1:9999${TEACHER_LESSON_PREP_PATH}`);
        expect(calls[5].body.lessonGoal).toBe('加法');
    });
});
