import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {createTeacherPasswordHash} from '../src/teacher-tools-router.js';
import {
    ALLOWED_ORIGINS,
    createRequestHandler,
    readAllowedOrigin
} from '../src/server.js';

test('allows Scratch GUI local dev origins for middleware CORS', () => {
    assert.equal(ALLOWED_ORIGINS.has('http://127.0.0.1:8601'), true);
    assert.equal(ALLOWED_ORIGINS.has('http://127.0.0.1:8602'), true);
    assert.equal(ALLOWED_ORIGINS.has('http://127.0.0.1:8603'), true);
    assert.equal(ALLOWED_ORIGINS.has('http://127.0.0.1:8605'), true);
    assert.equal(ALLOWED_ORIGINS.has('http://localhost:8605'), true);
    assert.equal(readAllowedOrigin({
        headers: {
            origin: 'http://127.0.0.1:8601'
        }
    }), 'http://127.0.0.1:8601');
    assert.equal(readAllowedOrigin({
        headers: {
            origin: 'http://127.0.0.1:8605'
        }
    }), 'http://127.0.0.1:8605');
});

test('falls back to the Phase 8 verified local origin for unknown origins', () => {
    assert.equal(readAllowedOrigin({
        headers: {
            origin: 'https://example.com'
        }
    }), 'http://127.0.0.1:8602');
});

test('allows configured ScratchAI preview origins for middleware CORS', async () => {
    const config = createMiddlewareConfig({
        SCRATCH_AI_ALLOWED_ORIGINS: 'http://127.0.0.1:8631,http://localhost:8631'
    });
    const server = createServer(createRequestHandler(config));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/assets/image-jobs`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://127.0.0.1:8631'
            }
        });

        assert.equal(response.status, 204);
        assert.equal(
            response.headers.get('access-control-allow-origin'),
            'http://127.0.0.1:8631'
        );
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('routes asset image jobs through middleware proxy', async () => {
    let capturedProxyRequest = null;
    const config = createMiddlewareConfig({
        ASSET_WORKER_URL: 'http://127.0.0.1:8790'
    });
    const server = createServer(createRequestHandler(config, async (url, options) => {
        capturedProxyRequest = {
            url,
            body: JSON.parse(options.body),
            headers: options.headers
        };
        return {
            ok: true,
            status: 200,
            json: async () => ({
                service: 'scratch-ai-asset-worker',
                job: {
                    id: 'mock-job',
                    mode: 'mock',
                    status: 'completed'
                }
            })
        };
    }));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/assets/image-jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'http://127.0.0.1:8603'
            },
            body: JSON.stringify({
                assetConsent: true,
                type: 'character',
                prompt: 'A friendly guide sprite'
            })
        });
        const responseJson = await response.json();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8603');
        assert.equal(response.headers.get('x-scratch-ai-request-id').length > 0, true);
        assert.equal(responseJson.proxied, true);
        assert.equal(responseJson.worker.job.id, 'mock-job');
        assert.equal(capturedProxyRequest.url, 'http://127.0.0.1:8790/api/v1/assets/image-jobs');
        assert.equal(capturedProxyRequest.body.prompt, 'A friendly guide sprite');
        assert.equal(capturedProxyRequest.headers['X-Scratch-AI-Request-Id'].length > 0, true);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('serves teacher knowledge lock and lesson prep draft routes', async () => {
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-teacher-server-'));
    const teacherPasswordHash = createTeacherPasswordHash({
        password: 'server-teacher-password',
        salt: 'server-teacher-salt'
    });
    const config = createMiddlewareConfig({
        TEACHER_ACCOUNTS_JSON: JSON.stringify([{
            classSessionIds: ['server-demo'],
            passwordHash: teacherPasswordHash,
            role: 'admin',
            teacherId: 'server-teacher'
        }]),
        TEACHER_TOOLS_ADMIN_TOKEN: 'teacher-admin-token',
        TEACHER_SESSION_SIGNING_KEY: 'server-teacher-session-signing-key',
        TEACHER_TOOLS_DIR: teacherDir
    });
    const server = createServer(createRequestHandler(config));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const libraryResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/knowledge-points`);
        const libraryJson = await libraryResponse.json();
        assert.equal(libraryResponse.status, 200);
        assert.ok(libraryJson.knowledgePoints.some(item => item.id === 'events'));

        const statusResponse = await fetch(`http://127.0.0.1:${port}/statusz`);
        const statusJson = await statusResponse.json();
        assert.equal(statusResponse.status, 200);
        assert.equal(statusJson.ready, true);
        assert.equal(statusJson.configuration.teacherAuthConfigured, true);
        assert.equal(statusJson.monitoring.valuesRedacted, true);
        assert.equal(JSON.stringify(statusJson).includes('server-teacher-session-signing-key'), false);

        const lockResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/knowledge-lock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teacherConsent: true,
                selectedKnowledgePointIds: ['events', 'addition']
            })
        });
        const lockJson = await lockResponse.json();
        assert.equal(lockResponse.status, 200);
        assert.equal(lockJson.persisted, false);
        assert.equal(lockJson.knowledgeLock.selectedKnowledgePoints.length, 2);

        const lockedPersistResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/knowledge-lock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teacherConsent: true,
                persist: true,
                classSessionId: 'server-demo',
                selectedKnowledgePointIds: ['events', 'addition']
            })
        });
        const lockedPersistJson = await lockedPersistResponse.json();
        assert.equal(lockedPersistJson.blocked, true);
        assert.equal(lockedPersistJson.reason, 'teacher-session-token-required');

        const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: 'server-teacher-password',
                teacherConsent: true,
                teacherId: 'server-teacher'
            })
        });
        const sessionJson = await sessionResponse.json();
        assert.equal(sessionResponse.status, 200);
        assert.equal(sessionJson.blocked, false);
        assert.equal(sessionJson.teacher.role, 'admin');
        assert.equal(sessionJson.teacher.classSessionIds[0], 'server-demo');

        const accountsResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/accounts`, {
            headers: {
                'X-Scratch-AI-Teacher-Session-Token': sessionJson.teacherSessionToken
            }
        });
        const accountsJson = await accountsResponse.json();
        assert.equal(accountsResponse.status, 200);
        assert.equal(accountsJson.schemaVersion, 'scratch-ai-teacher-account-admin-v1');
        assert.equal(accountsJson.accounts.length, 1);
        assert.equal(accountsJson.accounts[0].passwordHash, undefined);

        const createAccountResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/accounts/admin-action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Scratch-AI-Teacher-Session-Token': sessionJson.teacherSessionToken
            },
            body: JSON.stringify({
                action: 'create',
                classSessionIds: ['server-demo-2'],
                displayName: 'Server Teacher Two',
                password: 'server-new-password',
                role: 'teacher',
                teacherId: 'server-teacher-two'
            })
        });
        const createAccountJson = await createAccountResponse.json();
        const accountAdminText = await readFile(join(teacherDir, 'teacher-admin-operations.jsonl'), 'utf8');
        assert.equal(createAccountResponse.status, 200);
        assert.equal(createAccountJson.blocked, false);
        assert.equal(createAccountJson.accounts.length, 2);
        assert.equal(accountAdminText.includes('server-new-password'), false);
        assert.equal(accountAdminText.includes('server-teacher-two'), true);

        const rosterResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/class-roster/admin-action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Scratch-AI-Teacher-Session-Token': sessionJson.teacherSessionToken
            },
            body: JSON.stringify({
                action: 'upsert',
                classSessionId: 'server-demo',
                students: [{
                    displayAlias: 'S01 learner@example.com',
                    studentKey: 'learner@example.com'
                }]
            })
        });
        const rosterJson = await rosterResponse.json();
        assert.equal(rosterResponse.status, 200);
        assert.equal(rosterJson.blocked, false);
        assert.equal(rosterJson.classes[0].activeStudentCount, 1);
        assert.equal(JSON.stringify(rosterJson).includes('learner@example.com'), false);

        const rosterReadResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/teacher/class-roster?classSessionId=server-demo`,
            {
                headers: {
                    'X-Scratch-AI-Teacher-Session-Token': sessionJson.teacherSessionToken
                }
            }
        );
        const rosterReadJson = await rosterReadResponse.json();
        assert.equal(rosterReadResponse.status, 200);
        assert.equal(rosterReadJson.classes[0].students.length, 1);

        const migrationPlanResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/roster-migration-plan`);
        const migrationPlanJson = await migrationPlanResponse.json();
        assert.equal(migrationPlanResponse.status, 200);
        assert.equal(migrationPlanJson.targetStorage.kind, 'database-row-level-security');

        const teacherSessionPersistResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/knowledge-lock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Scratch-AI-Teacher-Session-Token': sessionJson.teacherSessionToken
            },
            body: JSON.stringify({
                teacherConsent: true,
                persist: true,
                classSessionId: 'server-demo',
                selectedKnowledgePointIds: ['events', 'addition']
            })
        });
        const teacherSessionPersistJson = await teacherSessionPersistResponse.json();
        assert.equal(teacherSessionPersistJson.blocked, false);
        assert.equal(teacherSessionPersistJson.authorization.method, 'teacher-session');

        const persistResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/knowledge-lock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Scratch-AI-Teacher-Admin-Token': 'teacher-admin-token'
            },
            body: JSON.stringify({
                teacherConsent: true,
                persist: true,
                classSessionId: 'server-demo',
                selectedKnowledgePointIds: ['events', 'addition']
            })
        });
        const persistJson = await persistResponse.json();
        assert.equal(persistJson.blocked, false);
        assert.equal(persistJson.persisted, true);
        assert.equal(persistJson.authorization.method, 'admin-token');
        assert.equal(persistJson.classSession.id, 'server-demo');

        const activeResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/teacher/active-knowledge-lock?classSessionId=server-demo`
        );
        const activeJson = await activeResponse.json();
        assert.equal(activeResponse.status, 200);
        assert.equal(activeJson.active, true);
        assert.equal(activeJson.knowledgeLock.selectedKnowledgePoints.length, 2);

        const prepResponse = await fetch(`http://127.0.0.1:${port}/api/v1/teacher/lesson-prep`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teacherConsent: true,
                lessonGoal: '做一个相加小游戏',
                lockedKnowledgePointIds: ['events', 'addition']
            })
        });
        const prepJson = await prepResponse.json();
        assert.equal(prepResponse.status, 200);
        assert.equal(prepJson.persisted, false);
        assert.equal(prepJson.lessonPrep.modelCalled, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('routes release audits through minimized server-side persistence', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-server-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'server-admin-token',
        RELEASE_AUDIT_BACKUP_DIR: `${auditDir}/backups`,
        RELEASE_AUDIT_DIR: auditDir,
        RELEASE_AUDIT_RETENTION_DAYS: '10'
    });
    const server = createServer(createRequestHandler(config));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const schemaResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/audit-schema`);
        const schemaJson = await schemaResponse.json();
        assert.equal(schemaResponse.status, 200);
        assert.equal(schemaJson.configured, true);
        assert.equal(schemaJson.schema.id, 'scratch-ai-release-audit-v1');

        const auditResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/audit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'http://127.0.0.1:8602'
            },
            body: JSON.stringify({
                classSessionId: 'server-demo',
                releaseConsent: true,
                releasePreview: {
                    version: '1.1',
                    status: 'ready',
                    productLine: 'A helper game',
                    userFeedback: 'Buttons need to be bigger.',
                    iterationPlan: 'Make labels clearer.',
                    metrics: {
                        sprites: 2,
                        starts: 1,
                        blocks: 10,
                        checkScore: 4,
                        checkMaxScore: 5
                    },
                    logicFlows: [{
                        targetLabel: 'Sprite',
                        scriptIndex: 1,
                        triggerLabel: 'Green flag',
                        blockCount: 4,
                        broadcastCount: 0
                    }],
                    aiSummary: {
                        questions: 1,
                        replies: 1,
                        blocked: 0
                    }
                },
                processSummary: {
                    totalEntries: 3,
                    modelQuestions: 1,
                    modelReplies: 1
                },
                releaseGate: {
                    allowed: true,
                    checklist: [{
                        id: 'release-draft',
                        ready: true,
                        reason: ''
                    }],
                    reasons: [],
                    schemaVersion: 'scratch-ai-release-gate-v1'
                }
            })
        });
        const auditJson = await auditResponse.json();
        const auditText = await readFile(join(auditDir, 'release-audit.jsonl'), 'utf8');

        assert.equal(auditResponse.status, 200);
        assert.equal(auditResponse.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8602');
        assert.equal(auditJson.persisted, true);
        assert.equal(auditJson.pureSb3.metaAiWrittenToSb3, false);
        assert.equal(auditText.includes('A helper game'), true);
        assert.equal(auditText.includes('projectJson'), false);

        const lifecycleResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/audit-lifecycle`);
        const lifecycleJson = await lifecycleResponse.json();
        assert.equal(lifecycleResponse.status, 200);
        assert.equal(lifecycleJson.auditFile.records, 1);
        assert.equal(lifecycleJson.retention.days, 10);

        const adminSummaryResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/admin-summary`);
        const adminSummaryJson = await adminSummaryResponse.json();
        assert.equal(adminSummaryResponse.status, 200);
        assert.equal(adminSummaryJson.schemaVersion, 'scratch-ai-admin-summary-v1');
        assert.equal(adminSummaryJson.totals.auditRecords, 1);
        assert.equal(adminSummaryJson.repository.pathRedacted, true);
        assert.equal(adminSummaryJson.deletion.actualDeletionSupported, false);

        const researchDatasetResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/research-dataset`);
        const researchDatasetJson = await researchDatasetResponse.json();
        assert.equal(researchDatasetResponse.status, 200);
        assert.equal(researchDatasetJson.dataset.anonymousRows, 1);
        assert.equal(researchDatasetJson.summary.readyRows, 1);
        assert.equal(researchDatasetJson.safeguards.freeTextIncluded, false);

        const lockedResearchExportResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/release/research-export?format=csv`
        );
        const lockedResearchExportJson = await lockedResearchExportResponse.json();
        assert.equal(lockedResearchExportJson.blocked, true);
        assert.equal(lockedResearchExportJson.action, 'research-export');
        assert.equal(lockedResearchExportJson.adminOperation.persisted, true);

        const researchExportResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/release/research-export?format=csv`,
            {
                headers: {
                    'X-Scratch-AI-Audit-Admin-Token': 'server-admin-token'
                }
            }
        );
        const researchExportJson = await researchExportResponse.json();
        assert.equal(researchExportJson.exported, true);
        assert.equal(researchExportJson.format, 'csv');
        assert.equal(researchExportJson.adminOperation.persisted, true);
        assert.equal(researchExportJson.csv.includes('A helper game'), false);

        const hostedAssetId = 'abcdefabcdefabcdefabcdefabcdefab';
        const hostedAssetBytes = Buffer.from('<svg></svg>');
        const hostedResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/hosted-page`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                classSessionId: 'server-demo',
                releaseConsent: true,
                releaseGate: {
                    allowed: true,
                    checklist: [{
                        id: 'release-draft',
                        ready: true,
                        reason: ''
                    }],
                    reasons: [],
                    schemaVersion: 'scratch-ai-release-gate-v1'
                },
                releasePreview: {
                    status: 'ready',
                    productLine: 'A helper game'
                },
                projectSnapshot: {
                    assets: [{
                        assetId: hostedAssetId,
                        byteLength: hostedAssetBytes.length,
                        dataBase64: hostedAssetBytes.toString('base64'),
                        dataFormat: 'svg',
                        md5ext: `${hostedAssetId}.svg`
                    }],
                    projectJson: {
                        targets: [{
                            blocks: {
                                startBlock: {
                                    opcode: 'event_whenflagclicked'
                                }
                            },
                            costumes: [{
                                assetId: hostedAssetId,
                                dataFormat: 'svg',
                                md5ext: `${hostedAssetId}.svg`,
                                name: 'Backdrop'
                            }],
                            isStage: true,
                            name: 'Stage',
                            sounds: []
                        }]
                    }
                }
            })
        });
        const hostedJson = await hostedResponse.json();
        assert.equal(hostedJson.blocked, false);
        assert.equal(hostedJson.player.projectAvailable, true);

        const hostedHtmlResponse = await fetch(`http://127.0.0.1:${port}${hostedJson.hostedPath}`);
        const hostedHtml = await hostedHtmlResponse.text();
        assert.equal(hostedHtmlResponse.status, 200);
        assert.equal(hostedHtml.includes('player.html?read_only=1'), true);

        const playerProjectResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/release/player-projects/${hostedJson.hostedReleaseId}`
        );
        const playerProjectJson = await playerProjectResponse.json();
        assert.equal(playerProjectResponse.status, 200);
        assert.equal(playerProjectJson.targets[0].blocks.startBlock.opcode, 'event_whenflagclicked');

        const playerAssetResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/release/player-assets/${hostedJson.hostedReleaseId}` +
            `/internalapi/asset/${hostedAssetId}.svg/get/`
        );
        const playerAssetText = await playerAssetResponse.text();
        assert.equal(playerAssetResponse.status, 200);
        assert.equal(playerAssetResponse.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
        assert.equal(playerAssetText, hostedAssetBytes.toString('utf8'));

        const reviewResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/teacher-review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Scratch-AI-Audit-Admin-Token': 'server-admin-token'
            },
            body: JSON.stringify({
                classSessionId: 'server-demo',
                decision: 'approved',
                hostedReleaseId: hostedJson.hostedReleaseId,
                notes: 'Ready for learner@example.com',
                releaseConsent: true,
                releaseGate: {
                    allowed: true,
                    checklist: [{
                        id: 'release-draft',
                        ready: true,
                        reason: ''
                    }],
                    reasons: [],
                    schemaVersion: 'scratch-ai-release-gate-v1'
                },
                releasePreview: {
                    status: 'ready',
                    productLine: 'A helper game'
                }
            })
        });
        const reviewJson = await reviewResponse.json();
        assert.equal(reviewJson.blocked, false);
        assert.equal(reviewJson.decision, 'approved');

        const showcaseResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/release/class-showcase?classSessionId=server-demo`
        );
        const showcaseJson = await showcaseResponse.json();
        assert.equal(showcaseResponse.status, 200);
        assert.equal(showcaseJson.schemaVersion, 'scratch-ai-class-showcase-v1');
        assert.equal(showcaseJson.scope.classSessionId, 'server-demo');
        assert.equal(showcaseJson.totals.hostedPages, 1);
        assert.equal(showcaseJson.totals.scopedHostedPages, 1);
        assert.equal(showcaseJson.totals.approved, 1);
        assert.equal(showcaseJson.safeguards.classRosterIncluded, false);
        assert.equal(JSON.stringify(showcaseJson).includes('learner@example.com'), false);

        const showcaseHtmlResponse = await fetch(
            `http://127.0.0.1:${port}/api/v1/release/class-showcase-page?classSessionId=server-demo`
        );
        const showcaseHtml = await showcaseHtmlResponse.text();
        assert.equal(showcaseHtmlResponse.status, 200);
        assert.equal(showcaseHtml.includes('Scratch AI class showcase'), true);
        assert.equal(showcaseHtml.includes(hostedJson.hostedReleaseId), true);
        assert.equal(showcaseHtml.includes('classRosterIncluded=false'), true);
        assert.equal(showcaseHtml.includes('learner@example.com'), false);

        const lockedExportResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/audit-export`);
        const lockedExportJson = await lockedExportResponse.json();
        assert.equal(lockedExportJson.blocked, true);
        assert.equal(lockedExportJson.adminOperation.persisted, true);

        const retentionResponse = await fetch(`http://127.0.0.1:${port}/api/v1/release/audit-retention-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const retentionJson = await retentionResponse.json();
        assert.equal(retentionJson.blocked, false);
        assert.equal(retentionJson.adminOperation.persisted, true);
        assert.equal(retentionJson.actualDeletionSupported, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});
