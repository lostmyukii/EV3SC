import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {
    createClassRosterAdminReply,
    createRosterStudentScopedId
} from '../src/teacher-tools-router.js';
import {
    RELEASE_ADMIN_OPERATIONS_FILE,
    RELEASE_ADMIN_SUMMARY_SCHEMA_ID,
    RELEASE_AUDIT_FILE,
    RELEASE_CLASS_SHOWCASE_SCHEMA_ID,
    RELEASE_HOSTED_ASSETS_SCHEMA_ID,
    RELEASE_HOSTED_PAGES_FILE,
    RELEASE_HOSTED_PROJECT_FILE,
    RELEASE_REPOSITORY_SCHEMA_ID,
    RELEASE_TEACHER_RUBRIC_REVIEW_SCHEMA_ID,
    RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
    RELEASE_TEACHER_REVIEWS_FILE,
    createAuditRetentionPlan,
    createHostedReleasePageReply,
    createReleaseAdminSummaryReply,
    createReleaseAuditBackupReply,
    createReleaseAuditExportReply,
    createReleaseAuditLifecycleReply,
    createReleaseAuditReply,
    createReleaseAuditRetentionPlanReply,
    createReleaseAuditSafetyGate,
    createReleaseAuditSchemaReply,
    createReleaseClassShowcaseHtml,
    createReleaseClassShowcaseReply,
    createReleaseTeacherReviewBatchReply,
    createReleaseTeacherReviewReply,
    createReleaseResearchDatasetReply,
    createReleaseResearchExportReply,
    createReleaseRepository,
    createAnonymousResearchRows,
    minimizeReleaseAuditRequest,
    readHostedReleaseAsset,
    readHostedReleaseProjectJson
} from '../src/release-audit-router.js';

const createReleaseAuditRequest = () => ({
    releaseConsent: true,
    releasePreview: {
        version: '1.1',
        status: 'ready',
        productLine: 'A chore helper for learner@example.com',
        userFeedback: 'Make the button larger.',
        iterationPlan: 'Add one more reminder.',
        metrics: {
            sprites: 2,
            starts: 1,
            blocks: 12,
            checkScore: 4,
            checkMaxScore: 5
        },
        logicFlows: [{
            targetLabel: 'Sprite',
            scriptIndex: 1,
            triggerLabel: 'Green flag',
            blockCount: 5,
            broadcastCount: 1
        }],
        aiSummary: {
            questions: 2,
            replies: 1,
            blocked: 1
        }
    },
    processSummary: {
        totalEntries: 8,
        modelQuestions: 2,
        modelReplies: 1,
        modelBlocks: 1,
        assetRequests: 1,
        assetReplies: 1,
        assetImports: 1,
        assetVisualEdits: 2,
        assetAdoptions: 1,
        teacherDrafts: 1,
        releaseExports: 1
    },
    assetSummary: {
        present: true,
        providerId: 'template-svg',
        assetType: 'character',
        generated: true,
        aiGeneratedLabel: true,
        humanReviewRequired: true,
        costumeEditorEditsRequired: 2,
        importedToCostumeEditor: true,
        visualEditCount: 2,
        adopted: true,
        modelWeightsDownloaded: false,
        promptStored: false,
        licenseStatus: 'internal-template',
        reviewState: 'pending-human-review'
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
});

test('blocks release audit requests with raw project or asset data', () => {
    const safetyGate = createReleaseAuditSafetyGate({
        releaseConsent: true,
        releasePreview: {
            status: 'ready'
        },
        projectJson: {
            targets: []
        },
        assetSummary: {
            dataUri: 'data:image/svg+xml;base64,abc'
        },
        processLog: [{
            type: 'model-question-sent'
        }]
    });

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:projectJson'));
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:assetSummary.dataUri'));
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:processLog'));
});

test('requires explicit release consent and a release preview', () => {
    const safetyGate = createReleaseAuditSafetyGate({});

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('missing-release-consent'));
    assert.ok(safetyGate.blockedReasons.includes('missing-release-preview'));
});

test('requires the release gate to pass before persisting audit', () => {
    const safetyGate = createReleaseAuditSafetyGate(Object.assign({}, createReleaseAuditRequest(), {
        releaseGate: {
            allowed: false,
            checklist: [{
                id: 'asset-adoption',
                ready: false,
                reason: 'asset-draft-not-adopted'
            }],
            reasons: ['asset-draft-not-adopted']
        }
    }));

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('release-gate-not-ready'));
    assert.ok(safetyGate.blockedReasons.includes('release-gate:asset-draft-not-adopted'));
});

test('minimizes release audit records and prepares a meta.ai draft without mutating SB3', () => {
    const record = minimizeReleaseAuditRequest(createReleaseAuditRequest());
    const recordJson = JSON.stringify(record);

    assert.equal(record.schemaVersion, 'scratch-ai-release-audit-v1');
    assert.equal(record.releasePreview.status, 'ready');
    assert.equal(record.releasePreview.productLine, 'A chore helper for [redacted-email]');
    assert.equal(record.releasePreview.logicFlows[0].targetLabel, 'Sprite');
    assert.equal(record.assetSummary.providerId, 'template-svg');
    assert.equal(record.assetSummary.adopted, true);
    assert.equal(record.assetSummary.importedToCostumeEditor, true);
    assert.equal(record.assetSummary.visualEditCount, 2);
    assert.equal(record.releaseGate.allowed, true);
    assert.equal(record.metaAiDraft.sessionSummary.socraticRounds, 2);
    assert.equal(record.metaAiDraft.sessionSummary.releaseGatePassed, true);
    assert.equal(record.pureSb3.metaAiWrittenToSb3, false);
    assert.equal(record.pureSb3.scratchProjectMutated, false);
    assert.equal(recordJson.includes('targetName'), false);
    assert.equal(recordJson.includes('dataUri'), false);
});

test('persists approved release audit records to an isolated jsonl file', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-audit-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_DIR: auditDir
    });

    try {
        const reply = await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const auditText = await readFile(join(auditDir, RELEASE_AUDIT_FILE), 'utf8');
        const persistedRecord = JSON.parse(auditText.trim());

        assert.equal(reply.persisted, true);
        assert.equal(reply.blocked, false);
        assert.equal(reply.storage.file, RELEASE_AUDIT_FILE);
        assert.equal(persistedRecord.auditId, reply.auditId);
        assert.equal(persistedRecord.assetSummary.promptStored, false);
        assert.equal(persistedRecord.releaseGate.allowed, true);
        assert.equal(persistedRecord.pureSb3.scratchProjectMutated, false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('hosts release pages from minimized release previews only', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-hosted-release-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_DIR: auditDir
    });

    try {
        const reply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                publicBaseUrl: 'http://127.0.0.1:8604'
            })
        });
        const recordsText = await readFile(join(auditDir, RELEASE_HOSTED_PAGES_FILE), 'utf8');
        const record = JSON.parse(recordsText.trim());
        const html = await readFile(join(auditDir, 'hosted-pages', reply.hostedReleaseId, 'index.html'), 'utf8');

        assert.equal(reply.blocked, false);
        assert.equal(reply.persisted, true);
        assert.match(reply.hostedReleaseId, /^hosted-/);
        assert.equal(reply.publicUrl, `http://127.0.0.1:8604${reply.hostedPath}`);
        assert.equal(record.releaseGate.allowed, true);
        assert.equal(record.safeguards.rawProjectIncluded, false);
        assert.equal(html.includes('A chore helper for [redacted-email]'), true);
        assert.equal(html.includes('learner@example.com'), false);
        assert.equal(html.includes('targetName'), false);
        assert.equal(html.includes('blockIds'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('hosts read-only project snapshots outside hosted page jsonl records', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-hosted-player-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_DIR: auditDir
    });
    const projectJson = {
        meta: {
            semver: '3.0.0'
        },
        targets: [{
            blocks: {
                privateBlockId: {
                    next: null,
                    opcode: 'event_whenflagclicked',
                    parent: null
                }
            },
            isStage: true,
            name: 'Student Stage'
        }]
    };

    try {
        const reply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                projectSnapshot: {
                    projectJson
                }
            })
        });
        const recordsText = await readFile(join(auditDir, RELEASE_HOSTED_PAGES_FILE), 'utf8');
        const record = JSON.parse(recordsText.trim());
        const projectText = await readFile(
            join(auditDir, 'hosted-pages', reply.hostedReleaseId, RELEASE_HOSTED_PROJECT_FILE),
            'utf8'
        );
        const html = await readFile(join(auditDir, 'hosted-pages', reply.hostedReleaseId, 'index.html'), 'utf8');
        const routedProject = await readHostedReleaseProjectJson({
            config,
            hostedReleaseId: reply.hostedReleaseId
        });

        assert.equal(reply.blocked, false);
        assert.equal(reply.player.projectAvailable, true);
        assert.equal(reply.player.readOnly, true);
        assert.equal(reply.player.projectPath, `/api/v1/release/player-projects/${reply.hostedReleaseId}`);
        assert.equal(record.player.projectAvailable, true);
        assert.equal(record.player.rawProjectIncludedInAudit, false);
        assert.equal(record.safeguards.hostedProjectSnapshotIncluded, true);
        assert.equal(record.safeguards.rawProjectIncludedInAudit, false);
        assert.equal(recordsText.includes('privateBlockId'), false);
        assert.equal(recordsText.includes('Student Stage'), false);
        assert.equal(recordsText.includes('"targets"'), false);
        assert.equal(projectText.includes('privateBlockId'), true);
        assert.equal(projectText.includes('"targets"'), true);
        assert.equal(html.includes('player.html?read_only=1'), true);
        assert.equal(html.includes('%2Fapi%2Fv1%2Frelease%2Fplayer-projects'), true);
        assert.equal(routedProject.targets[0].blocks.privateBlockId.opcode, 'event_whenflagclicked');
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('self-hosts referenced project asset binaries outside hosted page jsonl records', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-hosted-assets-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_DIR: auditDir
    });
    const assetId = '1234567890abcdef1234567890abcdef';
    const assetBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const projectJson = {
        meta: {
            semver: '3.0.0'
        },
        targets: [{
            blocks: {},
            costumes: [{
                assetId,
                dataFormat: 'svg',
                md5ext: `${assetId}.svg`,
                name: 'Backdrop'
            }],
            isStage: true,
            name: 'Stage',
            sounds: []
        }]
    };

    try {
        const reply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                projectSnapshot: {
                    assets: [{
                        assetId,
                        assetType: 'ImageVector',
                        byteLength: assetBytes.length,
                        dataBase64: assetBytes.toString('base64'),
                        dataFormat: 'svg',
                        md5ext: `${assetId}.svg`
                    }],
                    projectJson
                }
            })
        });
        const recordsText = await readFile(join(auditDir, RELEASE_HOSTED_PAGES_FILE), 'utf8');
        const record = JSON.parse(recordsText.trim());
        const assetText = await readFile(
            join(auditDir, 'hosted-pages', reply.hostedReleaseId, 'assets', `${assetId}.svg`),
            'utf8'
        );
        const routedAsset = await readHostedReleaseAsset({
            assetFilename: `${assetId}.svg`,
            config,
            hostedReleaseId: reply.hostedReleaseId
        });

        assert.equal(reply.blocked, false);
        assert.equal(reply.player.assets.schemaVersion, RELEASE_HOSTED_ASSETS_SCHEMA_ID);
        assert.equal(reply.player.assets.selfHosted, true);
        assert.equal(reply.player.assets.assetCount, 1);
        assert.equal(reply.player.assets.assetBytes, assetBytes.length);
        assert.equal(reply.player.assets.assetHost, `/api/v1/release/player-assets/${reply.hostedReleaseId}`);
        assert.equal(reply.player.playerPath.includes('asset_host='), true);
        assert.equal(record.player.assets.selfHosted, true);
        assert.equal(record.safeguards.assetsIncluded, true);
        assert.equal(record.safeguards.selfHostedAssetsIncluded, true);
        assert.equal(record.safeguards.rawAssetDataIncludedInAudit, false);
        assert.equal(recordsText.includes(assetBytes.toString('base64')), false);
        assert.equal(recordsText.includes('<svg'), false);
        assert.equal(assetText.includes('<svg'), true);
        assert.equal(routedAsset.contentType, 'image/svg+xml; charset=utf-8');
        assert.equal(routedAsset.data.toString('utf8'), assetBytes.toString('utf8'));
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('locks teacher review until admin token and then persists a minimized review', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-teacher-review-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir
    });
    const hostedReply = await createHostedReleasePageReply({
        config,
        request: createReleaseAuditRequest()
    });
    const reviewRequest = Object.assign({}, createReleaseAuditRequest(), {
        decision: 'approved',
        hostedReleaseId: hostedReply.hostedReleaseId,
        notes: 'Looks ready for learner@example.com',
        rubricReview: {
            schemaVersion: RELEASE_TEACHER_RUBRIC_REVIEW_SCHEMA_ID,
            source: 'lesson-prep',
            title: 'Variables lesson',
            scores: [{
                criteria: 'Use a variable to keep score.',
                evidence: 'Score changes for learner@example.com',
                knowledgePointId: 'variables',
                label: 'Variables',
                level: 3,
                levelLabel: 'Strong'
            }]
        }
    });

    try {
        const lockedReply = await createReleaseTeacherReviewReply({
            config,
            request: reviewRequest,
            requestHeaders: {}
        });
        const approvedReply = await createReleaseTeacherReviewReply({
            config,
            request: reviewRequest,
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });
        const reviewsText = await readFile(join(auditDir, RELEASE_TEACHER_REVIEWS_FILE), 'utf8');
        const reviewRecord = JSON.parse(reviewsText.trim());

        assert.equal(lockedReply.blocked, true);
        assert.equal(lockedReply.adminOperation.persisted, true);
        assert.equal(approvedReply.blocked, false);
        assert.equal(approvedReply.persisted, true);
        assert.equal(approvedReply.decision, 'approved');
        assert.equal(approvedReply.rubricReview.summary.status, 'complete');
        assert.equal(reviewRecord.hostedReleaseId, hostedReply.hostedReleaseId);
        assert.equal(reviewRecord.classSession.id, 'default-class-session');
        assert.equal(reviewRecord.notesSummary, 'Looks ready for [redacted-email]');
        assert.equal(reviewRecord.rubricReview.schemaVersion, RELEASE_TEACHER_RUBRIC_REVIEW_SCHEMA_ID);
        assert.equal(reviewRecord.rubricReview.summary.scoreTotal, 3);
        assert.equal(reviewRecord.rubricReview.summary.scoredCount, 1);
        assert.equal(reviewRecord.rubricReview.scores[0].evidenceSummary, 'Score changes for [redacted-email]');
        assert.equal(JSON.stringify(reviewRecord).includes('learner@example.com'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('locks batch teacher reviews until admin token and then persists minimized decisions', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-teacher-review-batch-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir
    });
    const firstHostedReply = await createHostedReleasePageReply({
        config,
        request: createReleaseAuditRequest()
    });
    const secondHostedReply = await createHostedReleasePageReply({
        config,
        request: Object.assign({}, createReleaseAuditRequest(), {
            releasePreview: Object.assign({}, createReleaseAuditRequest().releasePreview, {
                productLine: 'Second release for learner@example.com'
            })
        })
    });
    const batchRequest = {
        items: [{
            decision: 'approved',
            hostedReleaseId: firstHostedReply.hostedReleaseId,
            notes: 'Batch ready for learner@example.com'
        }, {
            decision: 'needs-revision',
            hostedReleaseId: secondHostedReply.hostedReleaseId,
            notes: 'Needs revision for learner@example.com'
        }]
    };

    try {
        const lockedReply = await createReleaseTeacherReviewBatchReply({
            config,
            request: batchRequest,
            requestHeaders: {}
        });
        const approvedReply = await createReleaseTeacherReviewBatchReply({
            config,
            request: batchRequest,
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });
        const reviewsText = await readFile(join(auditDir, RELEASE_TEACHER_REVIEWS_FILE), 'utf8');
        const reviewRecords = reviewsText.trim().split('\n').map(line => JSON.parse(line));
        const adminOperationsText = await readFile(join(auditDir, RELEASE_ADMIN_OPERATIONS_FILE), 'utf8');

        assert.equal(lockedReply.blocked, true);
        assert.equal(lockedReply.schemaVersion, RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID);
        assert.equal(lockedReply.adminOperation.persisted, true);
        assert.equal(approvedReply.blocked, false);
        assert.equal(approvedReply.persisted, true);
        assert.equal(approvedReply.decisions.approved, 1);
        assert.equal(approvedReply.decisions.needsRevision, 1);
        assert.equal(approvedReply.items.length, 2);
        assert.equal(reviewRecords.length, 2);
        assert.equal(reviewRecords[0].hostedReleaseId, firstHostedReply.hostedReleaseId);
        assert.equal(reviewRecords[0].classSession.id, 'default-class-session');
        assert.equal(reviewRecords[0].decision, 'approved');
        assert.equal(reviewRecords[1].decision, 'needs-revision');
        assert.equal(reviewRecords[0].batchId, approvedReply.batchId);
        assert.equal(JSON.stringify(reviewRecords).includes('learner@example.com'), false);
        assert.equal(JSON.stringify(approvedReply).includes('learner@example.com'), false);
        assert.equal(adminOperationsText.includes('teacher-review-batch'), true);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('scopes hosted releases, teacher reviews, and class showcase by class session', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-class-scope-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir
    });

    try {
        const classAHostedReply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A / Spring'
            })
        });
        const classBHostedReply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class B',
                releasePreview: Object.assign({}, createReleaseAuditRequest().releasePreview, {
                    productLine: 'Class B release'
                })
            })
        });
        const approvedReply = await createReleaseTeacherReviewReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A / Spring',
                decision: 'approved',
                hostedReleaseId: classAHostedReply.hostedReleaseId,
                notes: 'Ready for learner@example.com'
            }),
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });
        const mismatchedReply = await createReleaseTeacherReviewReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A / Spring',
                decision: 'approved',
                hostedReleaseId: classBHostedReply.hostedReleaseId,
                notes: 'Wrong class'
            }),
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });
        const classAReply = await createReleaseClassShowcaseReply({
            classSessionId: 'Class A / Spring',
            config
        });
        const classBReply = await createReleaseClassShowcaseReply({
            classSessionId: 'Class B',
            config
        });
        const allReply = await createReleaseClassShowcaseReply({
            config
        });
        const reviewsText = await readFile(join(auditDir, RELEASE_TEACHER_REVIEWS_FILE), 'utf8');
        const reviewRecords = reviewsText.trim().split('\n').map(line => JSON.parse(line));
        const classAJson = JSON.stringify(classAReply);

        assert.equal(classAHostedReply.classSession.id, 'Class-A-Spring');
        assert.equal(approvedReply.blocked, false);
        assert.equal(mismatchedReply.blocked, true);
        assert.equal(mismatchedReply.reason, 'class-session-mismatch');
        assert.equal(reviewRecords.length, 1);
        assert.equal(reviewRecords[0].classSession.id, 'Class-A-Spring');
        assert.equal(classAReply.scope.classSessionId, 'Class-A-Spring');
        assert.equal(classAReply.scope.filterApplied, true);
        assert.equal(classAReply.releases.length, 1);
        assert.equal(classAReply.releases[0].hostedReleaseId, classAHostedReply.hostedReleaseId);
        assert.equal(classAReply.totals.approved, 1);
        assert.equal(classBReply.releases.length, 1);
        assert.equal(classBReply.releases[0].hostedReleaseId, classBHostedReply.hostedReleaseId);
        assert.equal(classBReply.totals.pending, 1);
        assert.equal(allReply.releases.length, 2);
        assert.equal(classAReply.safeguards.classRosterIncluded, false);
        assert.equal(classAReply.safeguards.classSessionScoped, true);
        assert.equal(classAJson.includes('learner@example.com'), false);
        assert.equal(classAJson.includes('Wrong class'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('validates hosted releases and teacher reviews against class roster student scope', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-student-scope-audit-'));
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-student-scope-teacher-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir,
        TEACHER_SESSION_SIGNING_KEY: 'student-scope-signing-key',
        TEACHER_TOOLS_ADMIN_TOKEN: 'teacher-admin-token',
        TEACHER_TOOLS_DIR: teacherDir
    });
    const studentScopeId = createRosterStudentScopedId({
        classSessionId: 'Class A',
        config,
        studentKey: 'learner@example.com'
    });

    try {
        const rosterReply = await createClassRosterAdminReply({
            config,
            request: {
                action: 'upsert',
                classSessionId: 'Class A',
                students: [{
                    displayAlias: 'S01 learner@example.com',
                    studentKey: 'learner@example.com'
                }]
            },
            requestHeaders: {
                'x-scratch-ai-teacher-admin-token': 'teacher-admin-token'
            }
        });
        const hostedReply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A',
                studentScopeId
            })
        });
        const blockedHostedReply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A',
                studentScopeId: 'student-not-in-roster'
            })
        });
        const approvedReply = await createReleaseTeacherReviewReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A',
                decision: 'approved',
                hostedReleaseId: hostedReply.hostedReleaseId,
                notes: 'Ready for learner@example.com',
                studentScopeId
            }),
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });
        const mismatchedReply = await createReleaseTeacherReviewReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                classSessionId: 'Class A',
                decision: 'approved',
                hostedReleaseId: hostedReply.hostedReleaseId,
                studentScopeId: 'student-not-in-roster'
            }),
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });
        const classShowcaseReply = await createReleaseClassShowcaseReply({
            classSessionId: 'Class A',
            config,
            studentScopeId
        });
        const otherStudentShowcaseReply = await createReleaseClassShowcaseReply({
            classSessionId: 'Class A',
            config,
            studentScopeId: 'student-other'
        });
        const reviewsText = await readFile(join(auditDir, RELEASE_TEACHER_REVIEWS_FILE), 'utf8');
        const reviewRecord = JSON.parse(reviewsText.trim());
        const hostedText = await readFile(join(auditDir, RELEASE_HOSTED_PAGES_FILE), 'utf8');

        assert.equal(rosterReply.classes[0].students[0].studentScopeId, studentScopeId);
        assert.equal(hostedReply.blocked, false);
        assert.equal(hostedReply.studentScope.id, studentScopeId);
        assert.equal(hostedReply.studentScope.rosterVerified, true);
        assert.equal(blockedHostedReply.blocked, true);
        assert.equal(blockedHostedReply.reason, 'student-scope-not-in-class-roster');
        assert.equal(approvedReply.blocked, false);
        assert.equal(approvedReply.studentScope.id, studentScopeId);
        assert.equal(mismatchedReply.blocked, true);
        assert.equal(mismatchedReply.reason, 'student-scope-mismatch');
        assert.equal(reviewRecord.studentScope.id, studentScopeId);
        assert.equal(reviewRecord.studentScope.rosterVerified, true);
        assert.equal(classShowcaseReply.scope.studentScopeId, studentScopeId);
        assert.equal(classShowcaseReply.totals.scopedStudentHostedPages, 1);
        assert.equal(otherStudentShowcaseReply.releases.length, 0);
        assert.equal(hostedText.includes('learner@example.com'), false);
        assert.equal(JSON.stringify(classShowcaseReply).includes('learner@example.com'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('reports audit schema and configuration without exposing the storage path', () => {
    const reply = createReleaseAuditSchemaReply(createMiddlewareConfig({
        RELEASE_AUDIT_DIR: '/tmp/scratch-ai-audit'
    }));
    const replyJson = JSON.stringify(reply);

    assert.equal(reply.configured, true);
    assert.equal(reply.schema.id, 'scratch-ai-release-audit-v1');
    assert.ok(reply.schema.forbiddenFields.includes('projectJson'));
    assert.equal(replyJson.includes('/tmp/scratch-ai-audit'), false);
});

test('reports lifecycle status without exposing audit directory paths', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-life-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_BACKUP_DIR: join(auditDir, 'backups'),
        RELEASE_AUDIT_DIR: auditDir,
        RELEASE_AUDIT_RETENTION_DAYS: '7'
    });

    try {
        await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const reply = await createReleaseAuditLifecycleReply({
            config
        });
        const replyJson = JSON.stringify(reply);

        assert.equal(reply.configured, true);
        assert.equal(reply.auditFile.records, 1);
        assert.equal(reply.adminOperations.file, RELEASE_ADMIN_OPERATIONS_FILE);
        assert.equal(reply.retention.days, 7);
        assert.equal(reply.governance.adminActionsConfigured, true);
        assert.equal(replyJson.includes(auditDir), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('uses a release repository abstraction over local jsonl records', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-repository-'));
    const repository = createReleaseRepository(auditDir);
    const record = minimizeReleaseAuditRequest(createReleaseAuditRequest());

    try {
        const persistence = await repository.appendRecord('audit', record);
        const records = await repository.readRecords('audit');
        const stats = await repository.readFileStats('audit');
        const emptyHostedStats = await repository.readFileStats('hostedPages');

        assert.equal(repository.schemaVersion, RELEASE_REPOSITORY_SCHEMA_ID);
        assert.equal(repository.configured, true);
        assert.equal(persistence.persisted, true);
        assert.equal(records.length, 1);
        assert.equal(records[0].auditId, record.auditId);
        assert.equal(stats.file, RELEASE_AUDIT_FILE);
        assert.equal(stats.records, 1);
        assert.equal(emptyHostedStats.file, RELEASE_HOSTED_PAGES_FILE);
        assert.equal(emptyHostedStats.exists, false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('reports a read-only admin summary without exposing paths or identities', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-admin-summary-'));
    const teacherDir = await mkdtemp(join(tmpdir(), 'scratch-ai-admin-summary-teacher-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir,
        TEACHER_TOOLS_DIR: teacherDir
    });

    try {
        await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const hostedReply = await createHostedReleasePageReply({
            config,
            request: createReleaseAuditRequest()
        });
        await createReleaseTeacherReviewReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                decision: 'approved',
                hostedReleaseId: hostedReply.hostedReleaseId,
                notes: 'Ready for learner@example.com'
            }),
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });

        const reply = await createReleaseAdminSummaryReply({
            config
        });
        const replyJson = JSON.stringify(reply);

        assert.equal(reply.schemaVersion, RELEASE_ADMIN_SUMMARY_SCHEMA_ID);
        assert.equal(reply.configured, true);
        assert.equal(reply.repository.schemaVersion, RELEASE_REPOSITORY_SCHEMA_ID);
        assert.equal(reply.totals.auditRecords, 1);
        assert.equal(reply.totals.hostedPages, 1);
        assert.equal(reply.totals.teacherReviews, 1);
        assert.equal(reply.totals.adminOperations, 1);
        assert.equal(reply.authorization.classSessionScoped, true);
        assert.equal(reply.deletion.actualDeletionSupported, false);
        assert.equal(reply.governance.readOnlyAdminSummary, true);
        assert.equal(reply.governance.studentIdentityIncluded, false);
        assert.equal(replyJson.includes(auditDir), false);
        assert.equal(replyJson.includes(teacherDir), false);
        assert.equal(replyJson.includes('learner@example.com'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
        await rm(teacherDir, {
            force: true,
            recursive: true
        });
    }
});

test('creates an anonymous class showcase from hosted release ids and teacher review status', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-class-showcase-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir
    });

    try {
        const approvedHostedReply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                publicBaseUrl: 'http://127.0.0.1:8604'
            })
        });
        const pendingHostedReply = await createHostedReleasePageReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                releasePreview: Object.assign({}, createReleaseAuditRequest().releasePreview, {
                    productLine: 'Second class release'
                })
            })
        });
        await createReleaseTeacherReviewReply({
            config,
            request: Object.assign({}, createReleaseAuditRequest(), {
                decision: 'approved',
                hostedReleaseId: approvedHostedReply.hostedReleaseId,
                notes: 'Ready for learner@example.com'
            }),
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });

        const reply = await createReleaseClassShowcaseReply({
            config
        });
        const html = await createReleaseClassShowcaseHtml({
            config
        });
        const replyJson = JSON.stringify(reply);

        assert.equal(reply.schemaVersion, RELEASE_CLASS_SHOWCASE_SCHEMA_ID);
        assert.equal(reply.configured, true);
        assert.equal(reply.releases.length, 2);
        assert.equal(reply.totals.approved, 1);
        assert.equal(reply.totals.pending, 1);
        assert.equal(reply.routes.teacherReviewBatch, '/api/v1/release/teacher-review-batch');
        assert.equal(reply.safeguards.classRosterIncluded, false);
        assert.equal(reply.safeguards.studentIdentityIncluded, false);
        assert.equal(reply.safeguards.teacherNotesIncluded, false);
        assert.equal(reply.releases.some(release => release.hostedReleaseId === approvedHostedReply.hostedReleaseId), true);
        assert.equal(reply.releases.some(release => release.hostedReleaseId === pendingHostedReply.hostedReleaseId), true);
        assert.equal(
            reply.releases.find(release => release.hostedReleaseId === approvedHostedReply.hostedReleaseId)
                .teacherReview.status,
            'approved'
        );
        assert.equal(replyJson.includes('learner@example.com'), false);
        assert.equal(replyJson.includes('Ready for learner'), false);
        assert.equal(replyJson.includes(auditDir), false);
        assert.equal(html.includes('Scratch AI class showcase'), true);
        assert.equal(html.includes(approvedHostedReply.hostedReleaseId), true);
        assert.equal(html.includes('classRosterIncluded=false'), true);
        assert.equal(html.includes('learner@example.com'), false);
        assert.equal(html.includes('Ready for learner'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('locks audit export and backup until the admin token is provided', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-locked-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_BACKUP_DIR: join(auditDir, 'backups'),
        RELEASE_AUDIT_DIR: auditDir
    });

    try {
        await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const exportReply = await createReleaseAuditExportReply({
            config,
            requestHeaders: {}
        });
        const backupReply = await createReleaseAuditBackupReply({
            config,
            requestHeaders: {}
        });

        assert.equal(exportReply.blocked, true);
        assert.equal(exportReply.reason, 'release-audit-admin-token-required');
        assert.equal(exportReply.adminOperation.persisted, true);
        assert.equal(backupReply.blocked, true);
        assert.equal(backupReply.adminOperation.persisted, true);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('exports minimized audit records and creates backups with an admin token', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-admin-'));
    const backupDir = join(auditDir, 'backups');
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_BACKUP_DIR: backupDir,
        RELEASE_AUDIT_DIR: auditDir
    });
    const requestHeaders = {
        'x-scratch-ai-audit-admin-token': 'admin-test-token'
    };

    try {
        await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const exportReply = await createReleaseAuditExportReply({
            config,
            requestHeaders
        });
        const backupReply = await createReleaseAuditBackupReply({
            config,
            requestHeaders
        });

        assert.equal(exportReply.blocked, false);
        assert.equal(exportReply.exported, true);
        assert.equal(exportReply.totalRecords, 1);
        assert.equal(exportReply.records[0].releasePreview.productLine, 'A chore helper for [redacted-email]');
        assert.equal(exportReply.adminOperation.persisted, true);
        assert.equal(backupReply.backupCreated, true);
        assert.equal(backupReply.adminOperation.persisted, true);
        assert.match(backupReply.backupFile, /^release-audit-/);
        const operationsText = await readFile(join(auditDir, RELEASE_ADMIN_OPERATIONS_FILE), 'utf8');
        assert.equal(operationsText.trim().split(/\r?\n/).length, 2);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('creates anonymous research rows without audit ids, timestamps, or free text fields', () => {
    const record = minimizeReleaseAuditRequest(createReleaseAuditRequest());
    const freeTextVersionRecord = Object.assign({}, record, {
        releasePreview: Object.assign({}, record.releasePreview, {
            version: 'student@example.com custom release'
        })
    });
    const rows = createAnonymousResearchRows([record, freeTextVersionRecord]);
    const rowsJson = JSON.stringify(rows);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].rowId, 'research-row-0001');
    assert.equal(rows[0].releaseStatus, 'ready');
    assert.equal(rows[0].releaseVersion, '1.1');
    assert.equal(rows[1].releaseVersion, 'other');
    assert.equal(rows[0].spriteCount, 2);
    assert.equal(rows[0].assetImportedToCostumeEditor, true);
    assert.equal(rows[0].assetVisualEditCount, 2);
    assert.equal(rows[0].assetAdopted, true);
    assert.equal(rows[0].assetProviderKind, 'template-svg');
    assert.equal(rows[0].assetLicenseKind, 'internal-template');
    assert.equal(rows[0].releaseGateAllowed, true);
    assert.equal(rows[0].releaseGateBlockCount, 0);
    assert.equal(rows[0].pureSb3Ok, true);
    assert.equal(typeof rows[0].classScopeHash, 'string');
    assert.equal(typeof rows[0].studentScopeHash, 'string');
    assert.equal(rows[0].scopeGranularity, 'class');
    assert.equal(rowsJson.includes(record.auditId), false);
    assert.equal(rowsJson.includes(record.createdAt), false);
    assert.equal(rowsJson.includes('A chore helper'), false);
    assert.equal(rowsJson.includes('Make the button larger'), false);
    assert.equal(rowsJson.includes('student@example.com'), false);
});

test('reports public research dataset status and locks research export by default', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-research-public-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir
    });

    try {
        await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const datasetReply = await createReleaseResearchDatasetReply({
            config
        });
        const lockedExportReply = await createReleaseResearchExportReply({
            config,
            requestHeaders: {}
        });
        const datasetJson = JSON.stringify(datasetReply);

        assert.equal(datasetReply.configured, true);
        assert.equal(datasetReply.dataset.anonymousRows, 1);
        assert.equal(datasetReply.dataset.formats.includes('csv'), true);
        assert.equal(datasetReply.summary.readyRows, 1);
        assert.equal(datasetReply.safeguards.freeTextIncluded, false);
        assert.equal(datasetJson.includes(auditDir), false);
        assert.equal(lockedExportReply.blocked, true);
        assert.equal(lockedExportReply.action, 'research-export');
        assert.equal(lockedExportReply.adminOperation.persisted, true);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('exports anonymous research rows as json and csv with an admin token', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-research-export-'));
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir
    });
    const requestHeaders = {
        'x-scratch-ai-audit-admin-token': 'admin-test-token'
    };

    try {
        await createReleaseAuditReply({
            config,
            request: createReleaseAuditRequest()
        });
        const jsonReply = await createReleaseResearchExportReply({
            config,
            requestHeaders
        });
        const csvReply = await createReleaseResearchExportReply({
            config,
            format: 'csv',
            requestHeaders
        });
        const exportJson = JSON.stringify(jsonReply);

        assert.equal(jsonReply.blocked, false);
        assert.equal(jsonReply.exported, true);
        assert.equal(jsonReply.rows.length, 1);
        assert.equal(jsonReply.adminOperation.persisted, true);
        assert.equal(jsonReply.rows[0].rowId, 'research-row-0001');
        assert.equal(Object.prototype.hasOwnProperty.call(jsonReply.rows[0], 'auditId'), false);
        assert.equal(exportJson.includes('A chore helper'), false);
        assert.equal(exportJson.includes('userFeedback'), false);
        assert.equal(csvReply.format, 'csv');
        assert.equal(csvReply.adminOperation.persisted, true);
        assert.ok(csvReply.csv.startsWith('rowId,releaseStatus,releaseVersion'));
        assert.equal(csvReply.csv.includes('A chore helper'), false);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});

test('creates retention dry-run plans and refuses destructive apply in preview', async () => {
    const auditDir = await mkdtemp(join(tmpdir(), 'scratch-ai-release-retention-'));
    const oldRecord = Object.assign({}, minimizeReleaseAuditRequest(createReleaseAuditRequest()), {
        createdAt: '2026-01-01T00:00:00.000Z'
    });
    const freshRecord = Object.assign({}, minimizeReleaseAuditRequest(createReleaseAuditRequest()), {
        createdAt: '2026-05-01T00:00:00.000Z'
    });
    const config = createMiddlewareConfig({
        RELEASE_AUDIT_ADMIN_TOKEN: 'admin-test-token',
        RELEASE_AUDIT_DIR: auditDir,
        RELEASE_AUDIT_RETENTION_DAYS: '30'
    });

    try {
        await writeFile(
            join(auditDir, RELEASE_AUDIT_FILE),
            `${JSON.stringify(oldRecord)}\n${JSON.stringify(freshRecord)}\n`
        );

        const plan = createAuditRetentionPlan({
            now: new Date('2026-05-01T00:00:00.000Z'),
            records: [oldRecord, freshRecord],
            retentionDays: 30
        });
        const routePlan = await createReleaseAuditRetentionPlanReply({
            config,
            now: new Date('2026-05-01T00:00:00.000Z'),
            request: {}
        });
        const applyReply = await createReleaseAuditRetentionPlanReply({
            config,
            now: new Date('2026-05-01T00:00:00.000Z'),
            request: {
                apply: true
            },
            requestHeaders: {
                'x-scratch-ai-audit-admin-token': 'admin-test-token'
            }
        });

        assert.equal(plan.wouldDeleteCount, 1);
        assert.equal(routePlan.blocked, false);
        assert.equal(routePlan.applied, false);
        assert.equal(routePlan.wouldDeleteCount, 1);
        assert.equal(routePlan.adminOperation.persisted, true);
        assert.equal(applyReply.blocked, true);
        assert.equal(applyReply.reason, 'actual-deletion-disabled-in-preview');
        assert.equal(applyReply.adminOperation.persisted, true);
    } finally {
        await rm(auditDir, {
            force: true,
            recursive: true
        });
    }
});
