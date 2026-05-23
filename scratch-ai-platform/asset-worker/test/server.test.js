import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {deflateSync} from 'node:zlib';

import {
    PROVIDER_MODES,
    createGeminiImageJob,
    createManifestReply,
    createOpenAIImageJob,
    createRequestHandler,
    createSiliconFlowImageJob,
    createTemplateImageJob,
    normalizeImageProvider
} from '../src/server.js';

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = buffer => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type, data = Buffer.alloc(0)) => {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
};

const createRgbaPngBase64 = ({
    background = [76, 151, 255],
    subject = null,
    transparentEdges = true
} = {}) => {
    const width = 3;
    const height = 3;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const rows = [];
    for (let y = 0; y < height; y++) {
        const row = [0]; // filter type 0
        for (let x = 0; x < width; x++) {
            const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
            const alpha = transparentEdges && isEdge ? 0 : 255;
            const color = subject && x === 1 && y === 1 ? subject : background;
            row.push(color[0], color[1], color[2], alpha);
        }
        rows.push(Buffer.from(row));
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        createPngChunk('IHDR', ihdr),
        createPngChunk('IDAT', deflateSync(Buffer.concat(rows))),
        createPngChunk('IEND')
    ]).toString('base64');
};

const TRANSPARENT_SPRITE_PNG_BASE64 = createRgbaPngBase64({
    transparentEdges: true
});
const OPAQUE_PNG_BASE64 = createRgbaPngBase64({
    transparentEdges: false
});
const WHITE_BACKGROUND_BLUE_SUBJECT_PNG_BASE64 = createRgbaPngBase64({
    background: [255, 255, 255],
    subject: [38, 115, 240],
    transparentEdges: false
});

test('normalizes the lightweight template provider flag', () => {
    assert.equal(normalizeImageProvider('template'), PROVIDER_MODES.TEMPLATE_SVG);
    assert.equal(normalizeImageProvider('template-svg'), PROVIDER_MODES.TEMPLATE_SVG);
    assert.equal(normalizeImageProvider('gemini'), PROVIDER_MODES.GEMINI_IMAGE);
    assert.equal(normalizeImageProvider('gemini-native'), PROVIDER_MODES.GEMINI_IMAGE);
    assert.equal(normalizeImageProvider('openai'), PROVIDER_MODES.OPENAI_IMAGE);
    assert.equal(normalizeImageProvider('gpt-image'), PROVIDER_MODES.OPENAI_IMAGE);
    assert.equal(normalizeImageProvider('siliconflow'), PROVIDER_MODES.SILICONFLOW_IMAGE);
    assert.equal(normalizeImageProvider('qwen-image'), PROVIDER_MODES.SILICONFLOW_IMAGE);
    assert.equal(normalizeImageProvider('unknown'), PROVIDER_MODES.MOCK);
});

test('creates a real SVG draft with audit and review metadata', () => {
    const job = createTemplateImageJob({
        type: 'character',
        prompt: 'friendly helper sprite',
        size: {
            width: 480,
            height: 480
        }
    });

    assert.equal(job.mode, PROVIDER_MODES.TEMPLATE_SVG);
    assert.equal(job.result.generated, true);
    assert.equal(job.result.asset.format, 'svg');
    assert.equal(job.result.asset.dataUri.startsWith('data:image/svg+xml;base64,'), true);
    assert.equal(job.review.required, true);
    assert.equal(job.audit.providerId, PROVIDER_MODES.TEMPLATE_SVG);
    assert.equal(job.audit.modelWeightsDownloaded, false);
    assert.equal(job.audit.promptStored, false);
});

test('exposes provider manifest and result audit schema', () => {
    const manifest = createManifestReply(PROVIDER_MODES.TEMPLATE_SVG);

    assert.equal(manifest.currentProvider, PROVIDER_MODES.TEMPLATE_SVG);
    assert.ok(manifest.providers.some(provider => provider.id === PROVIDER_MODES.TEMPLATE_SVG));
    assert.ok(manifest.providers.some(provider => provider.id === PROVIDER_MODES.GEMINI_IMAGE));
    assert.ok(manifest.providers.some(provider => provider.id === PROVIDER_MODES.OPENAI_IMAGE));
    assert.ok(manifest.providers.some(provider => provider.id === PROVIDER_MODES.SILICONFLOW_IMAGE));
    assert.ok(manifest.resultAuditSchema.requiredFields.includes('providerId'));
    assert.ok(manifest.resultAuditSchema.requiredFields.includes('humanReviewRequired'));
});

test('creates a Gemini image draft from inline data without exposing the server key', async () => {
    let capturedUrl = '';
    let capturedRequest = {};
    const fakeFetch = async (url, options) => {
        capturedUrl = url;
        capturedRequest = options;
        return {
            ok: true,
            status: 200,
            async json () {
                return {
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {text: 'Here is a draft.'},
                                    {
                                        inlineData: {
                                            mimeType: 'image/png',
                                            data: TRANSPARENT_SPRITE_PNG_BASE64
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                };
            }
        };
    };

    const job = await createGeminiImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'gemini',
            SCRATCH_AI_GEMINI_API_KEY: 'server-only-gemini-key',
            SCRATCH_AI_GEMINI_BASE_URL: 'https://gemini.example/v1beta',
            SCRATCH_AI_GEMINI_IMAGE_MODEL: 'gemini-image-test'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'character',
            prompt: 'a blue robot helper',
            size: {
                width: 480,
                height: 480
            }
        }
    });

    const requestBody = JSON.parse(capturedRequest.body);

    assert.equal(capturedUrl, 'https://gemini.example/v1beta/models/gemini-image-test:generateContent');
    assert.equal(capturedRequest.headers['x-goog-api-key'], 'server-only-gemini-key');
    assert.equal(requestBody.generationConfig.responseModalities.includes('IMAGE'), true);
    assert.equal(job.mode, PROVIDER_MODES.GEMINI_IMAGE);
    assert.equal(job.status, 'completed');
    assert.equal(job.result.generated, true);
    assert.equal(job.result.asset.mimeType, 'image/png');
    assert.equal(job.result.asset.transparentBackground.required, true);
    assert.equal(job.result.asset.transparentBackground.serverValidated, true);
    assert.equal(job.result.asset.transparentBackground.passed, true);
    assert.equal(job.audit.providerId, PROVIDER_MODES.GEMINI_IMAGE);
    assert.equal(job.audit.providerModel, 'gemini-image-test');
    assert.equal(JSON.stringify(job).includes('server-only-gemini-key'), false);
    assert.equal(JSON.stringify(job).includes('a blue robot helper'), false);
});

test('creates an OpenAI image draft without exposing the server key', async () => {
    let capturedUrl = '';
    let capturedRequest = {};
    const fakeFetch = async (url, options) => {
        capturedUrl = url;
        capturedRequest = options;
        return {
            ok: true,
            status: 200,
            async json () {
                return {
                    data: [
                        {
                            b64_json: TRANSPARENT_SPRITE_PNG_BASE64
                        }
                    ]
                };
            }
        };
    };

    const job = await createOpenAIImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'openai',
            SCRATCH_AI_OPENAI_API_KEY: 'server-only-key',
            SCRATCH_AI_OPENAI_IMAGE_MODEL: 'gpt-image-test'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'character',
            prompt: 'a blue robot helper',
            size: {
                width: 480,
                height: 480
            }
        }
    });

    assert.equal(capturedUrl, 'https://api.openai.com/v1/images/generations');
    assert.equal(capturedRequest.headers.Authorization, 'Bearer server-only-key');
    assert.equal(JSON.parse(capturedRequest.body).model, 'gpt-image-test');
    assert.equal(job.mode, PROVIDER_MODES.OPENAI_IMAGE);
    assert.equal(job.status, 'completed');
    assert.equal(job.result.generated, true);
    assert.equal(job.result.asset.mimeType, 'image/png');
    assert.equal(job.result.asset.transparentBackground.required, true);
    assert.equal(job.result.asset.transparentBackground.serverValidated, true);
    assert.equal(job.result.asset.transparentBackground.passed, true);
    assert.equal(job.result.asset.transparentBackground.repaired, false);
    assert.equal(job.audit.providerId, PROVIDER_MODES.OPENAI_IMAGE);
    assert.equal(job.audit.providerModel, 'gpt-image-test');
    assert.equal(JSON.stringify(job).includes('server-only-key'), false);
    assert.equal(JSON.stringify(job).includes('a blue robot helper'), false);
});

test('repairs sprite-like provider PNGs with simple white backgrounds', async () => {
    const fakeFetch = async () => ({
        ok: true,
        status: 200,
        async json () {
            return {
                data: [
                    {
                        b64_json: WHITE_BACKGROUND_BLUE_SUBJECT_PNG_BASE64
                    }
                ]
            };
        }
    });

    const job = await createOpenAIImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'openai',
            SCRATCH_AI_OPENAI_API_KEY: 'server-only-key',
            SCRATCH_AI_OPENAI_IMAGE_MODEL: 'gpt-image-test'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'character',
            prompt: 'a blue robot helper'
        }
    });

    assert.equal(job.mode, PROVIDER_MODES.OPENAI_IMAGE);
    assert.equal(job.status, 'completed');
    assert.equal(job.result.generated, true);
    assert.equal(job.result.asset.transparentBackground.required, true);
    assert.equal(job.result.asset.transparentBackground.serverValidated, true);
    assert.equal(job.result.asset.transparentBackground.passed, true);
    assert.equal(job.result.asset.transparentBackground.repaired, true);
    assert.equal(job.result.asset.transparentBackground.repairMethod, 'server-corner-background-removal-v1');
    assert.equal(job.result.asset.transparentBackground.originalReason, 'missing-transparent-pixels');
    assert.equal(job.audit.transparentBackground.repaired, true);
    assert.equal(JSON.stringify(job).includes('server-only-key'), false);
    assert.equal(JSON.stringify(job).includes('a blue robot helper'), false);
});

test('rejects sprite-like provider PNGs when background removal would empty the image', async () => {
    const fakeFetch = async () => ({
        ok: true,
        status: 200,
        async json () {
            return {
                data: [
                    {
                        b64_json: OPAQUE_PNG_BASE64
                    }
                ]
            };
        }
    });

    const job = await createOpenAIImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'openai',
            SCRATCH_AI_OPENAI_API_KEY: 'server-only-key',
            SCRATCH_AI_OPENAI_IMAGE_MODEL: 'gpt-image-test'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'character',
            prompt: 'a blue robot helper'
        }
    });

    assert.equal(job.mode, PROVIDER_MODES.OPENAI_IMAGE);
    assert.equal(job.status, 'failed');
    assert.equal(job.result.generated, false);
    assert.equal(job.result.transparentBackground.required, true);
    assert.equal(job.result.transparentBackground.serverValidated, true);
    assert.equal(job.result.transparentBackground.passed, false);
    assert.equal(job.result.transparentBackground.repairAttempted, true);
    assert.equal(job.result.transparentBackground.repairSucceeded, false);
    assert.equal(job.result.transparentBackground.originalReason, 'missing-transparent-pixels');
    assert.equal(job.result.message.includes('Server background removal did not pass'), true);
    assert.equal(job.audit.transparentBackground.passed, false);
    assert.equal(JSON.stringify(job).includes('server-only-key'), false);
    assert.equal(JSON.stringify(job).includes('a blue robot helper'), false);
});

test('does not require transparent PNG validation for stage backdrops', async () => {
    const fakeFetch = async () => ({
        ok: true,
        status: 200,
        async json () {
            return {
                data: [
                    {
                        b64_json: OPAQUE_PNG_BASE64
                    }
                ]
            };
        }
    });

    const job = await createOpenAIImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'openai',
            SCRATCH_AI_OPENAI_API_KEY: 'server-only-key'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'backdrop',
            prompt: 'math classroom'
        }
    });

    assert.equal(job.status, 'completed');
    assert.equal(job.result.generated, true);
    assert.equal(job.result.asset.transparentBackground.required, false);
    assert.equal(job.result.asset.transparentBackground.serverValidated, false);
    assert.equal(job.result.asset.transparentBackground.passed, true);
});

test('creates a SiliconFlow image draft from image URL without exposing the server key', async () => {
    const capturedUrls = [];
    const capturedRequests = [];
    const fakeFetch = async (url, options = {}) => {
        capturedUrls.push(url);
        capturedRequests.push(options);
        if (String(url).endsWith('/images/generations')) {
            return {
                ok: true,
                status: 200,
                async json () {
                    return {
                        images: [
                            {
                                url: 'https://assets.example/qwen-image.png'
                            }
                        ]
                    };
                }
            };
        }
        return {
            ok: true,
            status: 200,
            headers: {
                get: () => 'application/octet-stream'
            },
            async arrayBuffer () {
                return Buffer.from(TRANSPARENT_SPRITE_PNG_BASE64, 'base64');
            }
        };
    };

    const job = await createSiliconFlowImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'siliconflow',
            SCRATCH_AI_SILICONFLOW_API_KEY: 'server-only-sf-key',
            SCRATCH_AI_SILICONFLOW_BASE_URL: 'https://api.siliconflow.test/v1',
            SCRATCH_AI_SILICONFLOW_IMAGE_MODEL: 'Qwen/Qwen-Image'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'character',
            prompt: 'a blue robot helper',
            size: {
                width: 480,
                height: 480
            }
        }
    });

    const requestBody = JSON.parse(capturedRequests[0].body);

    assert.equal(capturedUrls[0], 'https://api.siliconflow.test/v1/images/generations');
    assert.equal(capturedRequests[0].headers.Authorization, 'Bearer server-only-sf-key');
    assert.equal(capturedUrls[1], 'https://assets.example/qwen-image.png');
    assert.equal(requestBody.model, 'Qwen/Qwen-Image');
    assert.equal(requestBody.image_size, '512x512');
    assert.equal(requestBody.batch_size, 1);
    assert.equal(job.mode, PROVIDER_MODES.SILICONFLOW_IMAGE);
    assert.equal(job.status, 'completed');
    assert.equal(job.result.generated, true);
    assert.equal(job.result.asset.mimeType, 'image/png');
    assert.equal(job.result.asset.dataUri.startsWith('data:image/png;base64,'), true);
    assert.equal(job.result.asset.transparentBackground.required, true);
    assert.equal(job.result.asset.transparentBackground.serverValidated, true);
    assert.equal(job.result.asset.transparentBackground.passed, true);
    assert.equal(job.audit.providerId, PROVIDER_MODES.SILICONFLOW_IMAGE);
    assert.equal(job.audit.providerModel, 'Qwen/Qwen-Image');
    assert.equal(JSON.stringify(job).includes('server-only-sf-key'), false);
    assert.equal(JSON.stringify(job).includes('a blue robot helper'), false);
});

test('uses fast SiliconFlow defaults for classroom image drafts', async () => {
    let capturedRequest = {};
    const fakeFetch = async (url, options = {}) => {
        capturedRequest = options;
        return {
            ok: true,
            status: 200,
            async json () {
                return {
                    images: [
                        {
                            b64_json: TRANSPARENT_SPRITE_PNG_BASE64
                        }
                    ]
                };
            }
        };
    };

    const job = await createSiliconFlowImageJob({
        env: {
            SCRATCH_AI_IMAGE_PROVIDER: 'siliconflow',
            SCRATCH_AI_SILICONFLOW_API_KEY: 'server-only-sf-key'
        },
        fetchImpl: fakeFetch,
        requestBody: {
            type: 'character',
            prompt: 'a blue robot helper'
        }
    });
    const requestBody = JSON.parse(capturedRequest.body);

    assert.equal(requestBody.model, 'Tongyi-MAI/Z-Image-Turbo');
    assert.equal(requestBody.num_inference_steps, 4);
    assert.equal(requestBody.guidance_scale, 4.5);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        assert.equal(capturedRequest.signal instanceof AbortSignal, true);
    }
    assert.equal(job.status, 'completed');
    assert.equal(job.audit.providerModel, 'Tongyi-MAI/Z-Image-Turbo');
});

test('reports OpenAI provider as disabled until a server key is configured', async () => {
    const server = createServer(createRequestHandler({
        SCRATCH_AI_IMAGE_PROVIDER: 'openai'
    }));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
        const healthJson = await healthResponse.json();
        assert.equal(healthJson.mode, PROVIDER_MODES.OPENAI_IMAGE);
        assert.equal(healthJson.imageModelEnabled, false);
        assert.equal(healthJson.imageGenerationEnabled, false);
        assert.equal(healthJson.provider.apiKeyConfigured, false);

        const jobResponse = await fetch(`http://127.0.0.1:${port}/api/v1/assets/image-jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'character',
                prompt: 'friendly helper'
            })
        });
        const jobJson = await jobResponse.json();
        assert.equal(jobJson.provider, PROVIDER_MODES.OPENAI_IMAGE);
        assert.equal(jobJson.job.status, 'configuration-required');
        assert.equal(jobJson.job.result.generated, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('reports Gemini provider health using server-only configuration', async () => {
    const server = createServer(createRequestHandler({
        SCRATCH_AI_IMAGE_PROVIDER: 'gemini',
        SCRATCH_AI_GEMINI_API_KEY: 'server-only-gemini-key',
        SCRATCH_AI_GEMINI_IMAGE_MODEL: 'gemini-image-test'
    }));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
        const healthJson = await healthResponse.json();
        assert.equal(healthJson.mode, PROVIDER_MODES.GEMINI_IMAGE);
        assert.equal(healthJson.imageModelEnabled, true);
        assert.equal(healthJson.imageGenerationEnabled, true);
        assert.equal(healthJson.provider.apiKeyConfigured, true);
        assert.equal(healthJson.provider.externalNetwork, true);
        assert.equal(healthJson.provider.model, 'gemini-image-test');
        assert.equal(JSON.stringify(healthJson).includes('server-only-gemini-key'), false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('reports SiliconFlow provider health using server-only configuration', async () => {
    const server = createServer(createRequestHandler({
        SCRATCH_AI_IMAGE_PROVIDER: 'siliconflow',
        SCRATCH_AI_SILICONFLOW_API_KEY: 'server-only-sf-key',
        SCRATCH_AI_SILICONFLOW_IMAGE_MODEL: 'Qwen/Qwen-Image'
    }));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
        const healthJson = await healthResponse.json();
        assert.equal(healthJson.mode, PROVIDER_MODES.SILICONFLOW_IMAGE);
        assert.equal(healthJson.imageModelEnabled, true);
        assert.equal(healthJson.imageGenerationEnabled, true);
        assert.equal(healthJson.provider.apiKeyConfigured, true);
        assert.equal(healthJson.provider.externalNetwork, true);
        assert.equal(healthJson.provider.model, 'Qwen/Qwen-Image');
        assert.equal(JSON.stringify(healthJson).includes('server-only-sf-key'), false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('serves template jobs from the HTTP worker without external services', async () => {
    const server = createServer(createRequestHandler({
        SCRATCH_AI_IMAGE_PROVIDER: 'template'
    }));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
        const healthJson = await healthResponse.json();
        assert.equal(healthJson.mode, PROVIDER_MODES.TEMPLATE_SVG);
        assert.equal(healthJson.imageGenerationEnabled, true);
        assert.equal(healthJson.modelWeightsDownloaded, false);
        assert.equal(healthResponse.headers.get('x-scratch-ai-request-id').length > 0, true);

        const jobResponse = await fetch(`http://127.0.0.1:${port}/api/v1/assets/image-jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'backdrop',
                prompt: 'math classroom'
            })
        });
        const jobJson = await jobResponse.json();

        assert.equal(jobJson.provider, PROVIDER_MODES.TEMPLATE_SVG);
        assert.equal(jobJson.job.result.generated, true);
        assert.equal(jobJson.job.result.asset.mimeType, 'image/svg+xml');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
