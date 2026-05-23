/* eslint-env jest */
import {
    ASSET_IMAGE_JOB_PATH,
    ASSET_PROMPT_LIMIT,
    ASSET_TYPES,
    createAssetImageJobPayload,
    createAssetImageJobUrl,
    requestAssetImageJob
} from '../../../src/lib/ai/asset-job-client';

describe('asset job client', () => {
    test('builds the asset job middleware endpoint', () => {
        expect(createAssetImageJobUrl('/')).toBe(ASSET_IMAGE_JOB_PATH);
        expect(createAssetImageJobUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${ASSET_IMAGE_JOB_PATH}`
        );
    });

    test('creates a small asset payload without project context', () => {
        const payload = createAssetImageJobPayload({
            assetConsent: true,
            type: ASSET_TYPES.BACKDROP,
            prompt: `${'a'.repeat(ASSET_PROMPT_LIMIT)} extra`,
            style: 'paper cut',
            projectSummary: {
                targets: []
            },
            rawProject: {
                targets: []
            }
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.assetConsent).toBe(true);
        expect(payload.type).toBe(ASSET_TYPES.BACKDROP);
        expect(payload.prompt.length).toBe(ASSET_PROMPT_LIMIT);
        expect(payload.size).toEqual({
            width: 480,
            height: 480
        });
        expect(payloadJson.includes('projectSummary')).toBe(false);
        expect(payloadJson.includes('rawProject')).toBe(false);
        expect(payloadJson.includes('targets')).toBe(false);
    });

    test('posts JSON to the asset middleware endpoint', async () => {
        let capturedUrl = '';
        let capturedOptions = null;
        const reply = await requestAssetImageJob({
            middlewareUrl: 'http://127.0.0.1:9999/',
            payload: {
                assetConsent: true,
                type: ASSET_TYPES.CHARACTER,
                prompt: 'A helpful sprite'
            },
            fetchImpl: (url, options) => {
                capturedUrl = url;
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({
                        proxied: true,
                        worker: {
                            job: {
                                mode: 'mock'
                            }
                        }
                    })
                };
            }
        });

        expect(capturedUrl).toBe(`http://127.0.0.1:9999${ASSET_IMAGE_JOB_PATH}`);
        expect(capturedOptions.method).toBe('POST');
        expect(capturedOptions.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(capturedOptions.body).prompt).toBe('A helpful sprite');
        expect(reply.proxied).toBe(true);
    });

    test('passes request lifecycle options to asset middleware fetch', async () => {
        const controller = new AbortController();
        let capturedOptions = null;
        await requestAssetImageJob({
            middlewareUrl: '/',
            signal: controller.signal,
            timeoutMs: 0,
            payload: {
                assetConsent: true,
                type: ASSET_TYPES.CHARACTER,
                prompt: 'A helpful sprite'
            },
            fetchImpl: (_url, options) => {
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({proxied: true})
                };
            }
        });

        expect(capturedOptions.signal).toBeDefined();
    });
});
