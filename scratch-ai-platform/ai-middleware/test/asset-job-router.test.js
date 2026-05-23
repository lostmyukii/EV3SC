import assert from 'node:assert/strict';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {
    createAssetGenerationManifestReply,
    createAssetImageJobReply,
    createAssetJobSafetyGate,
    minimizeAssetJobRequest
} from '../src/asset-job-router.js';

test('minimizes and redacts asset job prompts before proxying', () => {
    const minimized = minimizeAssetJobRequest({
        type: 'character',
        prompt: 'Make a helper character for learner@example.com with sk-testSecretValue12345',
        style: 'cartoon',
        size: {
            width: 4096,
            height: 12
        },
        classroom: {
            knowledgePoint: 'variables'
        }
    });

    assert.equal(minimized.type, 'character');
    assert.equal(minimized.size.width, 1024);
    assert.equal(minimized.size.height, 64);
    assert.match(minimized.prompt, /\[redacted-email\]/);
    assert.match(minimized.prompt, /\[redacted-api-key\]/);
});

test('blocks asset jobs without consent, prompt, or valid type', () => {
    const safetyGate = createAssetJobSafetyGate({
        type: 'full-script',
        prompt: '',
        rawProject: {
            targets: []
        }
    });

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('missing-asset-consent'));
    assert.ok(safetyGate.blockedReasons.includes('invalid-asset-type'));
    assert.ok(safetyGate.blockedReasons.includes('empty-prompt'));
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:rawProject'));
});

test('proxies only minimized asset job payload to the worker', async () => {
    let capturedRequest = null;
    const reply = await createAssetImageJobReply({
        config: createMiddlewareConfig({
            ASSET_WORKER_URL: 'http://127.0.0.1:8790/'
        }),
        fetchImpl: async (url, options) => {
            capturedRequest = {
                url,
                body: JSON.parse(options.body)
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
        },
        request: {
            assetConsent: true,
            type: 'backdrop',
            prompt: 'A classroom scene',
            style: 'paper cut'
        }
    });

    assert.equal(reply.proxied, true);
    assert.equal(reply.blocked, false);
    assert.equal(reply.safetyGate.allowed, true);
    assert.equal(capturedRequest.url, 'http://127.0.0.1:8790/api/v1/assets/image-jobs');
    assert.equal(capturedRequest.body.type, 'backdrop');
    assert.equal(capturedRequest.body.prompt, 'A classroom scene');
    assert.equal(Object.prototype.hasOwnProperty.call(capturedRequest.body, 'assetConsent'), false);
});

test('does not call the worker when the asset safety gate blocks', async () => {
    let fetchCalled = false;
    const reply = await createAssetImageJobReply({
        config: createMiddlewareConfig({}),
        fetchImpl: async () => {
            fetchCalled = true;
        },
        request: {
            assetConsent: true,
            type: 'image',
            prompt: 'Make a sprite',
            projectJson: {
                targets: []
            }
        }
    });

    assert.equal(fetchCalled, false);
    assert.equal(reply.proxied, false);
    assert.equal(reply.blocked, true);
    assert.ok(reply.safetyGate.blockedReasons.includes('forbidden-context:projectJson'));
});

test('proxies the asset generation manifest without exposing worker URL', async () => {
    let capturedRequest = null;
    const reply = await createAssetGenerationManifestReply({
        config: createMiddlewareConfig({
            ASSET_WORKER_URL: 'http://127.0.0.1:8790/'
        }),
        fetchImpl: async (url, options) => {
            capturedRequest = {
                url,
                method: options.method
            };
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    service: 'scratch-ai-asset-worker',
                    currentProvider: 'template-svg',
                    resultAuditSchema: {
                        id: 'scratch-ai-asset-result-audit-v1'
                    }
                })
            };
        }
    });

    assert.equal(reply.proxied, true);
    assert.equal(reply.workerRoute, '/api/v1/assets/generation-manifest');
    assert.equal(reply.worker.currentProvider, 'template-svg');
    assert.equal(capturedRequest.url, 'http://127.0.0.1:8790/api/v1/assets/generation-manifest');
    assert.equal(capturedRequest.method, 'GET');
});
