/* eslint-env jest */
import {
    RELEASE_HOSTED_ASSETS_SCHEMA_ID,
    RELEASE_HOSTED_PAGE_PATH,
    RELEASE_HOSTED_PROJECT_SCHEMA_ID,
    RELEASE_TEACHER_REVIEW_BATCH_PATH,
    RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
    RELEASE_TEACHER_REVIEW_PATH,
    createHostedAssetSnapshots,
    createHostedReleasePayload,
    createHostedProjectSnapshot,
    createQrPreviewSvg,
    createReleaseHostedPageUrl,
    createReleaseTeacherReviewBatchUrl,
    createReleaseTeacherReviewUrl,
    createTeacherReviewBatchPayload,
    createTeacherReviewPayload,
    requestHostedReleasePage,
    requestTeacherReviewBatch,
    requestTeacherReview
} from '../../../src/lib/ai/release-hosting-client';

const createReleasePreview = () => ({
    aiSummary: {
        blocked: 1,
        questions: 2,
        replies: 1
    },
    iterationPlan: 'Add a timer.',
    logicFlows: [{
        blockCount: 5,
        blockIds: ['private-block'],
        broadcastCount: 1,
        id: 'private-flow',
        scriptIndex: 1,
        targetName: 'Private Sprite Name',
        triggerLabel: 'Green flag'
    }],
    metrics: {
        blocks: 12,
        checkMaxScore: 5,
        checkScore: 4,
        sprites: 2,
        starts: 1
    },
    productLine: 'Chore helper',
    status: 'ready',
    userFeedback: 'Make the button larger.',
    version: '1.1'
});

const createReleaseGate = () => ({
    allowed: true,
    checklist: [{
        id: 'release-draft',
        label: 'Private label',
        ready: true,
        reason: ''
    }],
    reasons: [],
    schemaVersion: 'scratch-ai-release-gate-v1'
});

describe('release hosting client', () => {
    test('builds hosted page and teacher review endpoints', () => {
        expect(createReleaseHostedPageUrl('/')).toBe(RELEASE_HOSTED_PAGE_PATH);
        expect(createReleaseTeacherReviewUrl('/')).toBe(RELEASE_TEACHER_REVIEW_PATH);
        expect(createReleaseTeacherReviewBatchUrl('/')).toBe(RELEASE_TEACHER_REVIEW_BATCH_PATH);
        expect(createReleaseHostedPageUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${RELEASE_HOSTED_PAGE_PATH}`
        );
    });

    test('creates minimized hosted release payload without raw anchors', () => {
        const payload = createHostedReleasePayload({
            classSessionId: ' Class A / Spring ',
            publicBaseUrl: 'http://127.0.0.1:8604/',
            releaseGate: createReleaseGate(),
            releasePreview: createReleasePreview()
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.releaseConsent).toBe(true);
        expect(payload.classSessionId).toBe('Class-A-Spring');
        expect(payload.publicBaseUrl).toBe('http://127.0.0.1:8604/');
        expect(payload.releaseGate.allowed).toBe(true);
        expect(payload.releasePreview.logicFlows[0].targetLabel).toBe('Sprite');
        expect(payload.projectSnapshot.available).toBe(false);
        expect(payloadJson.includes('Private Sprite Name')).toBe(false);
        expect(payloadJson.includes('blockIds')).toBe(false);
        expect(payloadJson.includes('Private label')).toBe(false);
    });

    test('creates hosted project snapshots for the read-only player only', () => {
        const assetBytes = new Uint8Array([60, 115, 118, 103, 62]);
        const snapshot = createHostedProjectSnapshot({
            assets: [{
                assetId: 'a'.repeat(32),
                assetType: {
                    name: 'ImageVector'
                },
                data: assetBytes,
                dataFormat: 'svg'
            }],
            projectJson: {
                targets: [{
                    blocks: {
                        privateBlock: {
                            opcode: 'event_whenflagclicked'
                        }
                    },
                    isStage: true,
                    name: 'Student Stage'
                }]
            }
        });
        const payload = createHostedReleasePayload({
            projectSnapshot: {
                projectJson: snapshot.projectJson
            },
            releaseGate: createReleaseGate(),
            releasePreview: createReleasePreview()
        });

        expect(snapshot.schemaVersion).toBe(RELEASE_HOSTED_PROJECT_SCHEMA_ID);
        expect(snapshot.assetsSchemaVersion).toBe(RELEASE_HOSTED_ASSETS_SCHEMA_ID);
        expect(snapshot.available).toBe(true);
        expect(snapshot.assets).toEqual([expect.objectContaining({
            assetId: 'a'.repeat(32),
            byteLength: assetBytes.length,
            dataBase64: 'PHN2Zz4=',
            dataFormat: 'svg',
            md5ext: `${'a'.repeat(32)}.svg`
        })]);
        expect(snapshot.projectJson).toContain('"targets"');
        expect(snapshot.safeguards.rawAssetDataIncludedInAudit).toBe(false);
        expect(snapshot.safeguards.rawProjectIncludedInAudit).toBe(false);
        expect(snapshot.safeguards.rawProjectIncludedInModel).toBe(false);
        expect(snapshot.safeguards.readOnlyPlayer).toBe(true);
        expect(payload.projectSnapshot.available).toBe(true);
        expect(payload.projectSnapshot.projectJson).toContain('privateBlock');
        expect(payload.releasePreview.logicFlows[0].targetLabel).toBe('Sprite');
    });

    test('keeps VM asset binaries when creating hosted release payload', () => {
        const assetId = 'c'.repeat(32);
        const assetBytes = new Uint8Array([60, 115, 118, 103, 47, 62]);
        const payload = createHostedReleasePayload({
            projectSnapshot: {
                assets: [{
                    assetId,
                    assetType: {
                        name: 'ImageVector'
                    },
                    data: assetBytes,
                    dataFormat: 'svg'
                }],
                projectJson: {
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
                }
            },
            releaseGate: createReleaseGate(),
            releasePreview: createReleasePreview()
        });

        expect(payload.projectSnapshot.available).toBe(true);
        expect(payload.projectSnapshot.assets).toEqual([expect.objectContaining({
            assetId,
            byteLength: assetBytes.length,
            dataBase64: 'PHN2Zy8+',
            dataFormat: 'svg',
            md5ext: `${assetId}.svg`
        })]);
        expect(payload.projectSnapshot.safeguards.selfHostedAssetsIncluded).toBe(true);
    });

    test('extracts bounded hosted assets from VM assets', () => {
        const snapshots = createHostedAssetSnapshots({
            vm: {
                assets: [{
                    assetId: 'b'.repeat(32),
                    assetType: {
                        name: 'Sound'
                    },
                    data: new Uint8Array([1, 2, 3]),
                    dataFormat: 'wav'
                }, {
                    assetId: 'not-safe',
                    data: new Uint8Array([4]),
                    dataFormat: 'png'
                }]
            }
        });

        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toEqual(expect.objectContaining({
            assetId: 'b'.repeat(32),
            assetType: 'Sound',
            byteLength: 3,
            dataBase64: 'AQID',
            dataFormat: 'wav',
            md5ext: `${'b'.repeat(32)}.wav`
        }));
    });

    test('creates a teacher review payload with bounded notes', () => {
        const payload = createTeacherReviewPayload({
            classSessionId: ' Class A / Spring ',
            decision: 'approved',
            hostedRelease: {
                hostedReleaseId: 'hosted-123'
            },
            notes: `${'a'.repeat(160)} tail`,
            releaseGate: createReleaseGate(),
            releasePreview: createReleasePreview(),
            rubricReview: {
                source: 'lesson-prep',
                title: 'Variables lesson',
                items: [{
                    criteria: 'Use a variable to keep score.',
                    evidence: 'Score changes for learner@example.com',
                    knowledgePointId: 'variables',
                    label: 'Variables',
                    level: '3',
                    levels: ['Missing', 'Starting', 'Mostly', 'Strong']
                }]
            }
        });

        expect(payload.decision).toBe('approved');
        expect(payload.classSessionId).toBe('Class-A-Spring');
        expect(payload.hostedReleaseId).toBe('hosted-123');
        expect(payload.notes).toHaveLength(120);
        expect(payload.notes.includes('tail')).toBe(false);
        expect(payload.rubricReview.scores).toEqual([expect.objectContaining({
            criteria: 'Use a variable to keep score.',
            evidence: 'Score changes for [redacted-email]',
            knowledgePointId: 'variables',
            label: 'Variables',
            level: 3,
            levelLabel: 'Strong'
        })]);
        expect(payload.rubricReview.summary).toEqual(expect.objectContaining({
            possibleCount: 1,
            scoreTotal: 3,
            scoredCount: 1,
            status: 'complete'
        }));
    });

    test('creates a teacher review batch payload without notes or identities', () => {
        const payload = createTeacherReviewBatchPayload({
            classSessionId: ' Class A / Spring ',
            decision: 'needs-revision',
            items: [{
                hostedReleaseId: ' hosted-abc ',
                notes: 'Private note for learner@example.com',
                studentName: 'Private Student'
            }, {
                hostedReleaseId: ''
            }]
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.schemaVersion).toBe(RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID);
        expect(payload.classSessionId).toBe('Class-A-Spring');
        expect(payload.releaseConsent).toBe(true);
        expect(payload.items).toEqual([{
            decision: 'needs-revision',
            hostedReleaseId: 'hosted-abc',
            notes: ''
        }]);
        expect(payload.safeguards.rawProjectIncluded).toBe(false);
        expect(payload.safeguards.studentIdentityIncluded).toBe(false);
        expect(payload.safeguards.teacherNotesIncluded).toBe(false);
        expect(payloadJson.includes('learner@example.com')).toBe(false);
        expect(payloadJson.includes('Private Student')).toBe(false);
        expect(payloadJson.includes('Private note')).toBe(false);
    });

    test('creates a local SVG QR preview without scripts or external images', () => {
        const svg = createQrPreviewSvg({
            url: 'http://127.0.0.1:8604/api/v1/release/hosted-pages/hosted-123'
        });
        const sameSvg = createQrPreviewSvg({
            url: 'http://127.0.0.1:8604/api/v1/release/hosted-pages/hosted-123'
        });
        const otherSvg = createQrPreviewSvg({
            url: 'http://127.0.0.1:8604/api/v1/release/hosted-pages/hosted-456'
        });

        expect(svg).toContain('<svg');
        expect(svg).toContain('<title>Release QR code</title>');
        expect(svg).toContain('data-qr-version=');
        expect(svg).toContain('data-qr-mask=');
        expect(svg).toBe(sameSvg);
        expect(svg).not.toBe(otherSvg);
        expect(svg).not.toContain('<script');
        expect(svg).not.toContain('<image');
        expect(svg).not.toContain('http://127.0.0.1');
        expect(svg).not.toContain('hosted-123');
    });

    test('posts hosted page and teacher review JSON', async () => {
        const captured = [];
        const fetchImpl = (url, options) => {
            captured.push({
                url,
                options
            });
            return {
                ok: true,
                json: () => ({
                    persisted: true
                })
            };
        };

        await requestHostedReleasePage({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: {
                releaseConsent: true
            }
        });
        await requestTeacherReview({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: {
                decision: 'approved'
            }
        });
        await requestTeacherReviewBatch({
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999',
            payload: {
                schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
                items: [{
                    decision: 'approved',
                    hostedReleaseId: 'hosted-abc'
                }]
            }
        });

        expect(captured[0].url).toBe(`http://127.0.0.1:9999${RELEASE_HOSTED_PAGE_PATH}`);
        expect(captured[1].url).toBe(`http://127.0.0.1:9999${RELEASE_TEACHER_REVIEW_PATH}`);
        expect(captured[2].url).toBe(`http://127.0.0.1:9999${RELEASE_TEACHER_REVIEW_BATCH_PATH}`);
        expect(captured[0].options.method).toBe('POST');
        expect(JSON.parse(captured[1].options.body).decision).toBe('approved');
        expect(JSON.parse(captured[2].options.body).schemaVersion).toBe(RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID);
    });
});
