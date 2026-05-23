/* eslint-env jest */
import {
    RELEASE_ADMIN_SUMMARY_PATH,
    RELEASE_AUDIT_PATH,
    RELEASE_AUDIT_LIFECYCLE_PATH,
    RELEASE_LOG_TYPES,
    RELEASE_RESEARCH_DATASET_PATH,
    createReleaseAuditPayload,
    createReleaseAuditLifecycleUrl,
    createReleaseAuditUrl,
    createReleaseAdminSummaryUrl,
    createReleaseGateSummary,
    createReleaseResearchDatasetUrl,
    requestReleaseAdminSummary,
    requestReleaseAudit,
    requestReleaseAuditLifecycle,
    requestReleaseResearchDataset
} from '../../../src/lib/ai/release-audit-client';

describe('release audit client', () => {
    test('builds the release audit middleware endpoint', () => {
        expect(createReleaseAuditUrl('/')).toBe(RELEASE_AUDIT_PATH);
        expect(createReleaseAuditUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${RELEASE_AUDIT_PATH}`
        );
        expect(createReleaseAuditLifecycleUrl('/')).toBe(RELEASE_AUDIT_LIFECYCLE_PATH);
        expect(createReleaseAuditLifecycleUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${RELEASE_AUDIT_LIFECYCLE_PATH}`
        );
        expect(createReleaseAdminSummaryUrl('/')).toBe(RELEASE_ADMIN_SUMMARY_PATH);
        expect(createReleaseAdminSummaryUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${RELEASE_ADMIN_SUMMARY_PATH}`
        );
        expect(createReleaseResearchDatasetUrl('/')).toBe(RELEASE_RESEARCH_DATASET_PATH);
        expect(createReleaseResearchDatasetUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${RELEASE_RESEARCH_DATASET_PATH}`
        );
    });

    test('creates a minimized release audit payload without raw project or asset data', () => {
        const payload = createReleaseAuditPayload({
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
                version: '1.1',
                status: 'ready',
                productLine: 'A chore helper',
                userFeedback: 'Bigger buttons',
                iterationPlan: 'Add sound',
                metrics: {
                    sprites: 2,
                    starts: 1,
                    blocks: 14,
                    checkScore: 4,
                    checkMaxScore: 5
                },
                logicFlows: [{
                    id: 'target-private:hat-private',
                    targetName: 'Private Sprite Name',
                    scriptIndex: 1,
                    triggerLabel: 'Green flag',
                    blockCount: 4,
                    broadcastCount: 1,
                    blockIds: ['private-block']
                }],
                aiSummary: {
                    questions: 1,
                    replies: 1,
                    blocked: 1
                }
            },
            processLog: [{
                type: RELEASE_LOG_TYPES.MODEL_QUESTION_SENT
            }, {
                type: RELEASE_LOG_TYPES.MODEL_REPLY_RECEIVED
            }, {
                type: RELEASE_LOG_TYPES.MODEL_REQUEST_BLOCKED
            }, {
                type: RELEASE_LOG_TYPES.ASSET_JOB_RECEIVED
            }, {
                type: RELEASE_LOG_TYPES.ASSET_IMPORTED_TO_COSTUME_EDITOR
            }, {
                type: RELEASE_LOG_TYPES.ASSET_VISUAL_EDIT_RECORDED
            }, {
                type: RELEASE_LOG_TYPES.ASSET_DRAFT_ADOPTED
            }],
            assetAdoptionState: {
                adopted: true,
                assetJobId: 'asset-job-1234',
                importTarget: 'AI draft character 1234',
                imported: true,
                reviewed: true,
                visualEditCount: 2
            },
            assetReply: {
                worker: {
                    job: {
                        id: 'asset-job-1234',
                        type: 'character',
                        result: {
                            asset: {
                                dataUri: 'data:image/svg+xml;base64,abc'
                            }
                        },
                        audit: {
                            providerId: 'template-svg',
                            assetType: 'character',
                            generated: true,
                            aiGeneratedLabel: true,
                            humanReviewRequired: true,
                            costumeEditorEditsRequired: 2,
                            modelWeightsDownloaded: false,
                            promptStored: false,
                            licenseStatus: 'internal-template',
                            reviewState: 'pending-human-review'
                        }
                    }
                }
            }
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.releaseConsent).toBe(true);
        expect(payload.releaseGate).toEqual(expect.objectContaining({
            allowed: true,
            schemaVersion: 'scratch-ai-release-gate-v1'
        }));
        expect(payload.releasePreview.logicFlows[0]).toEqual(expect.objectContaining({
            targetLabel: 'Sprite',
            scriptIndex: 1
        }));
        expect(payload.processSummary).toEqual(expect.objectContaining({
            modelBlocks: 1,
            modelQuestions: 1,
            modelReplies: 1,
            assetAdoptions: 1,
            assetImports: 1,
            assetVisualEdits: 1
        }));
        expect(payload.assetSummary).toEqual(expect.objectContaining({
            adopted: true,
            generated: true,
            importedToCostumeEditor: true,
            providerId: 'template-svg',
            promptStored: false,
            visualEditCount: 2
        }));
        expect(payloadJson.includes('Private Sprite Name')).toBe(false);
        expect(payloadJson.includes('targetName')).toBe(false);
        expect(payloadJson.includes('blockIds')).toBe(false);
        expect(payloadJson.includes('dataUri')).toBe(false);
        expect(payloadJson.includes('result')).toBe(false);
    });

    test('creates a minimized release gate summary', () => {
        const summary = createReleaseGateSummary({
            allowed: false,
            checklist: [{
                id: 'release-draft',
                label: 'Private label not needed',
                ready: false,
                reason: 'release-draft-not-ready'
            }],
            reasons: ['release-draft-not-ready']
        });

        expect(summary.allowed).toBe(false);
        expect(summary.reasons).toEqual(['release-draft-not-ready']);
        expect(summary.checklist[0]).toEqual({
            id: 'release-draft',
            ready: false,
            reason: 'release-draft-not-ready'
        });
        expect(JSON.stringify(summary).includes('Private label')).toBe(false);
    });

    test('posts JSON to the release audit middleware endpoint', async () => {
        let capturedUrl = '';
        let capturedOptions = null;
        const reply = await requestReleaseAudit({
            middlewareUrl: 'http://127.0.0.1:9999/',
            payload: {
                releaseConsent: true,
                releasePreview: {
                    version: '1.1'
                }
            },
            fetchImpl: (url, options) => {
                capturedUrl = url;
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({
                        persisted: true,
                        auditId: 'release-test'
                    })
                };
            }
        });

        expect(capturedUrl).toBe(`http://127.0.0.1:9999${RELEASE_AUDIT_PATH}`);
        expect(capturedOptions.method).toBe('POST');
        expect(capturedOptions.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(capturedOptions.body).releaseConsent).toBe(true);
        expect(reply.persisted).toBe(true);
    });

    test('reads release audit lifecycle status without sending a body', async () => {
        let capturedUrl = '';
        let capturedOptions = null;
        const reply = await requestReleaseAuditLifecycle({
            middlewareUrl: 'http://127.0.0.1:9999/',
            fetchImpl: (url, options) => {
                capturedUrl = url;
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({
                        auditFile: {
                            records: 2
                        },
                        retention: {
                            days: 30
                        }
                    })
                };
            }
        });

        expect(capturedUrl).toBe(`http://127.0.0.1:9999${RELEASE_AUDIT_LIFECYCLE_PATH}`);
        expect(capturedOptions.method).toBe('GET');
        expect(capturedOptions.body).toBeUndefined();
        expect(reply.auditFile.records).toBe(2);
    });

    test('reads release admin summary without sending a body', async () => {
        let capturedUrl = '';
        let capturedOptions = null;
        const reply = await requestReleaseAdminSummary({
            middlewareUrl: 'http://127.0.0.1:9999/',
            fetchImpl: (url, options) => {
                capturedUrl = url;
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({
                        schemaVersion: 'scratch-ai-admin-summary-v1',
                        totals: {
                            auditRecords: 2,
                            hostedPages: 1
                        }
                    })
                };
            }
        });

        expect(capturedUrl).toBe(`http://127.0.0.1:9999${RELEASE_ADMIN_SUMMARY_PATH}`);
        expect(capturedOptions.method).toBe('GET');
        expect(capturedOptions.body).toBeUndefined();
        expect(reply.totals.hostedPages).toBe(1);
    });

    test('reads release research dataset status without sending a body', async () => {
        let capturedUrl = '';
        let capturedOptions = null;
        const reply = await requestReleaseResearchDataset({
            middlewareUrl: 'http://127.0.0.1:9999/',
            fetchImpl: (url, options) => {
                capturedUrl = url;
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({
                        dataset: {
                            anonymousRows: 2
                        },
                        summary: {
                            readyRows: 1
                        }
                    })
                };
            }
        });

        expect(capturedUrl).toBe(`http://127.0.0.1:9999${RELEASE_RESEARCH_DATASET_PATH}`);
        expect(capturedOptions.method).toBe('GET');
        expect(capturedOptions.body).toBeUndefined();
        expect(reply.dataset.anonymousRows).toBe(2);
    });
});
