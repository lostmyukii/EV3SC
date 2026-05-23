import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {
    TEACHER_ACCOUNTS_FILE,
    TEACHER_ADMIN_OPERATIONS_FILE,
    TEACHER_CLASS_ROSTERS_FILE,
    createActiveKnowledgeLockReply,
    createClassRosterAdminReply,
    createClassRosterReadReply,
    createKnowledgeLockReply,
    createKnowledgeLockDraftReply,
    createKnowledgePointLibraryReply,
    createLessonPrepDraftReply,
    createRosterMigrationPlanReply,
    createRosterStudentScopedId,
    createTeacherAccountAdminReply,
    createTeacherAccountListAdminReply,
    createTeacherPasswordHash,
    createTeacherSessionReply,
    readClassRosterStudentScope,
    verifyTeacherSessionToken,
    recommendKnowledgePointIds
} from '../src/teacher-tools-router.js';

test('returns a complete knowledge point library without persistence', () => {
    const reply = createKnowledgePointLibraryReply();

    assert.equal(reply.persisted, false);
    assert.equal(reply.modelCalled, false);
    assert.ok(reply.knowledgePoints.length >= 8);
    assert.ok(reply.knowledgePoints.some(item => item.id === 'addition'));
});

test('creates a knowledge lock policy draft from selected points', () => {
    const reply = createKnowledgeLockDraftReply({
        request: {
            teacherConsent: true,
            gradeBand: 'upper-primary',
            lessonTitle: '相加小练习',
            selectedKnowledgePointIds: ['events', 'variables', 'addition']
        }
    });

    assert.equal(reply.blocked, false);
    assert.equal(reply.persisted, false);
    assert.equal(reply.modelCalled, false);
    assert.deepEqual(
        reply.knowledgeLock.selectedKnowledgePoints.map(item => item.id),
        ['events', 'variables', 'addition']
    );
    assert.ok(reply.knowledgeLock.promptContract.length > 0);
    assert.ok(reply.knowledgeLock.questionRules.some(item => item.knowledgePointId === 'addition'));
    assert.ok(reply.knowledgeLock.classroomPhrase.includes('相加'));
});

test('persists a minimized knowledge lock only with the teacher admin token', async () => {
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-teacher-lock-'));
    const config = createMiddlewareConfig({
        TEACHER_TOOLS_ADMIN_TOKEN: 'teacher-admin-token',
        TEACHER_TOOLS_DIR: teacherDir
    });
    const request = {
        teacherConsent: true,
        persist: true,
        classSessionId: 'phase-q15-demo',
        gradeBand: 'upper-primary',
        lessonTitle: '相加小练习',
        selectedKnowledgePointIds: ['events', 'addition']
    };

    try {
        const lockedReply = await createKnowledgeLockReply({
            config,
            request,
            requestHeaders: {}
        });
        assert.equal(lockedReply.blocked, true);
        assert.equal(lockedReply.reason, 'teacher-admin-token-required');

        const persistedReply = await createKnowledgeLockReply({
            config,
            request,
            requestHeaders: {
                'x-scratch-ai-teacher-admin-token': 'teacher-admin-token'
            }
        });
        const persistedText = await readFile(join(teacherDir, 'teacher-knowledge-locks.jsonl'), 'utf8');
        const activeReply = await createActiveKnowledgeLockReply({
            classSessionId: 'phase-q15-demo',
            config
        });

        assert.equal(persistedReply.blocked, false);
        assert.equal(persistedReply.persisted, true);
        assert.equal(persistedReply.knowledgeLock.persisted, true);
        assert.equal(persistedReply.persistence.writesToSb3, false);
        assert.equal(activeReply.active, true);
        assert.equal(activeReply.knowledgeLock.selectedKnowledgePoints.length, 2);
        assert.equal(persistedText.includes('teacher-admin-token'), false);
        assert.equal(persistedText.includes('classRoster'), false);
        assert.equal(persistedText.includes('projectJson'), false);
    } finally {
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('creates teacher sessions and authorizes only assigned class writes', async () => {
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-teacher-auth-'));
    const passwordHash = createTeacherPasswordHash({
        password: 'correct horse battery',
        salt: 'teacher-auth-test-salt'
    });
    const config = createMiddlewareConfig({
        TEACHER_ACCOUNTS_JSON: JSON.stringify([{
            classSessionIds: ['class-a'],
            displayName: 'Teacher Alpha',
            passwordHash,
            teacherId: 'teacher-a'
        }]),
        TEACHER_SESSION_SIGNING_KEY: 'teacher-session-test-signing-key',
        TEACHER_TOOLS_DIR: teacherDir
    });

    try {
        const lockedSession = await createTeacherSessionReply({
            config,
            request: {
                password: 'wrong',
                teacherConsent: true,
                teacherId: 'teacher-a'
            }
        });
        assert.equal(lockedSession.blocked, true);
        assert.ok(lockedSession.safetyGate.blockedReasons.includes('teacher-credentials-invalid'));

        const sessionReply = await createTeacherSessionReply({
            config,
            request: {
                password: 'correct horse battery',
                teacherConsent: true,
                teacherId: 'teacher-a'
            }
        });
        assert.equal(sessionReply.blocked, false);
        assert.equal(sessionReply.teacher.teacherId, 'teacher-a');
        assert.equal(sessionReply.teacher.classSessionIds[0], 'class-a');
        assert.equal(sessionReply.safeguards.passwordHashReturned, false);
        assert.equal(JSON.stringify(sessionReply).includes(passwordHash), false);

        const verifiedSession = verifyTeacherSessionToken({
            config,
            requestHeaders: {
                'x-scratch-ai-teacher-session-token': sessionReply.teacherSessionToken
            }
        });
        assert.equal(verifiedSession.valid, true);
        assert.equal(verifiedSession.session.teacherId, 'teacher-a');

        const unauthorizedReply = await createKnowledgeLockReply({
            config,
            request: {
                classSessionId: 'class-b',
                gradeBand: 'upper-primary',
                lessonTitle: '未授权课堂',
                persist: true,
                selectedKnowledgePointIds: ['events'],
                teacherConsent: true
            },
            requestHeaders: {
                'x-scratch-ai-teacher-session-token': sessionReply.teacherSessionToken
            }
        });
        assert.equal(unauthorizedReply.blocked, true);
        assert.equal(unauthorizedReply.reason, 'teacher-class-not-authorized');

        const persistedReply = await createKnowledgeLockReply({
            config,
            request: {
                classSessionId: 'class-a',
                gradeBand: 'upper-primary',
                lessonTitle: '授权课堂',
                persist: true,
                selectedKnowledgePointIds: ['events', 'addition'],
                teacherConsent: true
            },
            requestHeaders: {
                'x-scratch-ai-teacher-session-token': sessionReply.teacherSessionToken
            }
        });
        const persistedText = await readFile(join(teacherDir, 'teacher-knowledge-locks.jsonl'), 'utf8');

        assert.equal(persistedReply.blocked, false);
        assert.equal(persistedReply.persisted, true);
        assert.equal(persistedReply.authorization.method, 'teacher-session');
        assert.equal(persistedReply.authorization.teacherId, 'teacher-a');
        assert.equal(persistedText.includes('correct horse battery'), false);
        assert.equal(persistedText.includes(passwordHash), false);
    } finally {
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('admin manages teacher accounts with redacted operation audit', async () => {
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-teacher-admin-'));
    const adminPasswordHash = createTeacherPasswordHash({
        password: 'admin password',
        salt: 'teacher-admin-seed'
    });
    const config = createMiddlewareConfig({
        TEACHER_ACCOUNTS_JSON: JSON.stringify([{
            classSessionIds: ['class-admin'],
            displayName: 'Teacher Admin',
            passwordHash: adminPasswordHash,
            role: 'admin',
            teacherId: 'admin-teacher'
        }]),
        TEACHER_SESSION_SIGNING_KEY: 'teacher-account-admin-signing-key',
        TEACHER_TOOLS_DIR: teacherDir
    });

    try {
        const adminSession = await createTeacherSessionReply({
            config,
            request: {
                password: 'admin password',
                teacherConsent: true,
                teacherId: 'admin-teacher'
            }
        });
        const requestHeaders = {
            'x-scratch-ai-teacher-session-token': adminSession.teacherSessionToken
        };
        const lockedList = await createTeacherAccountListAdminReply({
            config,
            requestHeaders: {}
        });
        assert.equal(lockedList.blocked, true);
        assert.equal(lockedList.reason, 'teacher-session-token-required');

        const initialList = await createTeacherAccountListAdminReply({
            config,
            requestHeaders
        });
        assert.equal(initialList.blocked, false);
        assert.equal(initialList.accounts.length, 1);
        assert.equal(initialList.accounts[0].passwordHash, undefined);

        const createdReply = await createTeacherAccountAdminReply({
            config,
            request: {
                action: 'create',
                classSessionIds: ['class-a', 'Class B / Spring'],
                displayName: 'Teacher Alpha',
                password: 'new teacher password',
                role: 'teacher',
                teacherId: 'teacher-alpha'
            },
            requestHeaders
        });
        assert.equal(createdReply.blocked, false);
        assert.equal(createdReply.persisted, true);
        assert.ok(createdReply.accounts.some(account => (
            account.teacherId === 'teacher-alpha' &&
            account.classSessionIds.includes('Class-B-Spring')
        )));

        const updatedReply = await createTeacherAccountAdminReply({
            config,
            request: {
                action: 'update',
                active: true,
                classSessionIds: ['class-c'],
                displayName: 'Teacher Alpha 2',
                role: 'teacher',
                teacherId: 'teacher-alpha'
            },
            requestHeaders
        });
        assert.equal(updatedReply.accounts.find(account => account.teacherId === 'teacher-alpha').classSessionIds[0], 'class-c');

        const resetReply = await createTeacherAccountAdminReply({
            config,
            request: {
                action: 'reset-password',
                password: 'rotated teacher password',
                teacherId: 'teacher-alpha'
            },
            requestHeaders
        });
        assert.equal(resetReply.blocked, false);

        const deactivatedReply = await createTeacherAccountAdminReply({
            config,
            request: {
                action: 'deactivate',
                teacherId: 'teacher-alpha'
            },
            requestHeaders
        });
        const accountsText = await readFile(join(teacherDir, TEACHER_ACCOUNTS_FILE), 'utf8');
        const operationsText = await readFile(join(teacherDir, TEACHER_ADMIN_OPERATIONS_FILE), 'utf8');

        assert.equal(deactivatedReply.accounts.find(account => account.teacherId === 'teacher-alpha').active, false);
        assert.equal(accountsText.includes('rotated teacher password'), false);
        assert.equal(accountsText.includes('pbkdf2-sha256'), true);
        assert.equal(operationsText.includes('new teacher password'), false);
        assert.equal(operationsText.includes('rotated teacher password'), false);
        assert.equal(operationsText.includes('pbkdf2-sha256'), false);
        assert.equal(operationsText.includes('teacher-alpha'), true);

        const blockedLogin = await createTeacherSessionReply({
            config,
            request: {
                password: 'rotated teacher password',
                teacherConsent: true,
                teacherId: 'teacher-alpha'
            }
        });
        assert.equal(blockedLogin.blocked, true);
        assert.ok(blockedLogin.safetyGate.blockedReasons.includes('teacher-account-inactive'));
    } finally {
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('admin imports class roster with pseudonymous student scope and teachers read only assigned classes', async () => {
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-class-roster-'));
    const adminPasswordHash = createTeacherPasswordHash({
        password: 'admin password',
        salt: 'class-roster-admin'
    });
    const teacherPasswordHash = createTeacherPasswordHash({
        password: 'teacher password',
        salt: 'class-roster-teacher'
    });
    const config = createMiddlewareConfig({
        TEACHER_ACCOUNTS_JSON: JSON.stringify([{
            classSessionIds: ['class-a'],
            passwordHash: adminPasswordHash,
            role: 'admin',
            teacherId: 'admin-teacher'
        }, {
            classSessionIds: ['class-a'],
            passwordHash: teacherPasswordHash,
            role: 'teacher',
            teacherId: 'teacher-a'
        }]),
        TEACHER_SESSION_SIGNING_KEY: 'class-roster-signing-key',
        TEACHER_TOOLS_DIR: teacherDir
    });
    const expectedStudentScopeId = createRosterStudentScopedId({
        classSessionId: 'class-a',
        config,
        studentKey: 'learner@example.com'
    });

    try {
        const adminSession = await createTeacherSessionReply({
            config,
            request: {
                password: 'admin password',
                teacherConsent: true,
                teacherId: 'admin-teacher'
            }
        });
        const upsertReply = await createClassRosterAdminReply({
            config,
            request: {
                action: 'upsert',
                classSessionId: 'class-a',
                rosterVersion: '2026-spring',
                students: [{
                    displayAlias: 'S01 learner@example.com',
                    studentKey: 'learner@example.com'
                }, {
                    displayAlias: 'S02',
                    studentKey: 'student-two'
                }]
            },
            requestHeaders: {
                'x-scratch-ai-teacher-session-token': adminSession.teacherSessionToken
            }
        });
        const rosterText = await readFile(join(teacherDir, TEACHER_CLASS_ROSTERS_FILE), 'utf8');
        const operationsText = await readFile(join(teacherDir, TEACHER_ADMIN_OPERATIONS_FILE), 'utf8');

        assert.equal(upsertReply.blocked, false);
        assert.equal(upsertReply.persisted, true);
        assert.equal(upsertReply.classes[0].studentCount, 2);
        assert.equal(upsertReply.classes[0].students[0].studentScopeId, expectedStudentScopeId);
        assert.equal(JSON.stringify(upsertReply).includes('learner@example.com'), false);
        assert.equal(rosterText.includes('learner@example.com'), false);
        assert.equal(rosterText.includes(expectedStudentScopeId), true);
        assert.equal(operationsText.includes('learner@example.com'), false);
        assert.equal(operationsText.includes('class-roster-upsert'), true);

        const teacherSession = await createTeacherSessionReply({
            config,
            request: {
                password: 'teacher password',
                teacherConsent: true,
                teacherId: 'teacher-a'
            }
        });
        const classReadReply = await createClassRosterReadReply({
            classSessionId: 'class-a',
            config,
            requestHeaders: {
                'x-scratch-ai-teacher-session-token': teacherSession.teacherSessionToken
            }
        });
        const blockedReadReply = await createClassRosterReadReply({
            classSessionId: 'class-b',
            config,
            requestHeaders: {
                'x-scratch-ai-teacher-session-token': teacherSession.teacherSessionToken
            }
        });
        const scopeReply = await readClassRosterStudentScope({
            classSessionId: 'class-a',
            config,
            studentScopeId: expectedStudentScopeId
        });
        const missingScopeReply = await readClassRosterStudentScope({
            classSessionId: 'class-a',
            config,
            studentScopeId: 'student-missing'
        });
        const migrationPlan = createRosterMigrationPlanReply({
            config
        });

        assert.equal(classReadReply.blocked, false);
        assert.equal(classReadReply.classes[0].students.length, 2);
        assert.equal(blockedReadReply.blocked, true);
        assert.equal(blockedReadReply.reason, 'teacher-class-not-authorized');
        assert.equal(scopeReply.allowed, true);
        assert.equal(scopeReply.studentScope.rosterVerified, true);
        assert.equal(missingScopeReply.allowed, false);
        assert.equal(missingScopeReply.reason, 'student-scope-not-in-class-roster');
        assert.equal(migrationPlan.schemaVersion, 'scratch-ai-roster-migration-plan-v1');
        assert.equal(migrationPlan.targetStorage.kind, 'database-row-level-security');
        assert.equal(migrationPlan.readiness.rosterRawIdentifiersStored, false);
    } finally {
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('blocks teacher tools when raw student or project data is included', () => {
    const reply = createKnowledgeLockDraftReply({
        request: {
            teacherConsent: true,
            selectedKnowledgePointIds: ['events'],
            classRoster: ['student-a']
        }
    });

    assert.equal(reply.blocked, true);
    assert.ok(reply.safetyGate.blockedReasons.includes('forbidden-context:classRoster'));
});

test('recommends useful points for addition lessons', () => {
    const ids = recommendKnowledgePointIds('做一个输入两个数并相加的小游戏');

    assert.ok(ids.includes('events'));
    assert.ok(ids.includes('variables'));
    assert.ok(ids.includes('addition'));
    assert.ok(ids.includes('operators'));
});

test('creates a full lesson prep draft without calling a model', () => {
    const reply = createLessonPrepDraftReply({
        request: {
            teacherConsent: true,
            lessonGoal: '做一个输入两个数并相加的小游戏',
            gradeBand: 'upper-primary',
            durationMinutes: 45,
            lockedKnowledgePointIds: ['events', 'variables', 'addition']
        }
    });

    assert.equal(reply.blocked, false);
    assert.equal(reply.persisted, false);
    assert.equal(reply.modelCalled, false);
    assert.equal(reply.lessonPrep.durationMinutes, 45);
    assert.equal(reply.lessonPrep.persistence.persisted, false);
    assert.ok(reply.lessonPrep.taskCard.steps.length >= 4);
    assert.ok(reply.lessonPrep.explainGateQuestions.length >= 3);
    assert.ok(reply.lessonPrep.aiWhitelist.disallowedHelp.includes('直接生成完整可复制脚本。'));
    assert.deepEqual(
        reply.lessonPrep.lockedKnowledgePoints.map(item => item.id),
        ['events', 'variables', 'addition']
    );
});

test('blocks lesson prep without teacher consent or lesson goal', () => {
    const reply = createLessonPrepDraftReply({
        request: {
            teacherConsent: false,
            lessonGoal: ''
        }
    });

    assert.equal(reply.blocked, true);
    assert.ok(reply.safetyGate.blockedReasons.includes('missing-teacher-consent'));
    assert.ok(reply.safetyGate.blockedReasons.includes('empty-lesson-goal'));
});
