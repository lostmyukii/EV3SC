import {appendFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {deflateSync, inflateSync} from 'node:zlib';

const DEFAULT_PORT = 8790;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_SIZE = 480;
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1';
const DEFAULT_OPENAI_IMAGE_SIZE = '1024x1024';
const DEFAULT_OPENAI_IMAGE_QUALITY = 'low';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_GEMINI_AUTH_MODE = 'x-goog-api-key';
const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_SILICONFLOW_IMAGE_MODEL = 'Tongyi-MAI/Z-Image-Turbo';
const DEFAULT_SILICONFLOW_IMAGE_SIZE = '512x512';
const DEFAULT_SILICONFLOW_OUTPUT_FORMAT = 'png';
const DEFAULT_SILICONFLOW_INFERENCE_STEPS = 4;
const DEFAULT_SILICONFLOW_GUIDANCE_SCALE = 4.5;
const DEFAULT_IMAGE_PROVIDER_TIMEOUT_MS = 90000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const PROVIDER_MODES = Object.freeze({
    GEMINI_IMAGE: 'gemini-image',
    MOCK: 'mock',
    OPENAI_IMAGE: 'openai-image',
    SILICONFLOW_IMAGE: 'siliconflow-image',
    TEMPLATE_SVG: 'template-svg'
});
const TRANSPARENT_PNG_ASSET_TYPES = Object.freeze([
    'character',
    'costume',
    'prop'
]);
const TRANSPARENT_PNG_ASSET_TYPE_SET = new Set(TRANSPARENT_PNG_ASSET_TYPES);
const TRANSPARENT_PNG_REPAIR_METHOD = 'server-corner-background-removal-v1';
const TRANSPARENT_PNG_REPAIRABLE_REASONS = new Set([
    'missing-alpha-channel',
    'missing-transparent-pixels',
    'missing-transparent-background-edge'
]);

const TEMPLATE_PALETTES = Object.freeze([
    {
        background: '#f8fbff',
        primary: '#4c97ff',
        secondary: '#ffbf00',
        accent: '#0fbd8c',
        ink: '#1f2937'
    },
    {
        background: '#fff8f0',
        primary: '#ff8c1a',
        secondary: '#5cb1d6',
        accent: '#ff6680',
        ink: '#25364a'
    },
    {
        background: '#f7fff9',
        primary: '#0fbd8c',
        secondary: '#9966ff',
        accent: '#ffbf00',
        ink: '#20312b'
    }
]);

const RESULT_AUDIT_SCHEMA = Object.freeze({
    id: 'scratch-ai-asset-result-audit-v1',
    requiredFields: [
        'providerId',
        'modelWeightsDownloaded',
        'generated',
        'aiGeneratedLabel',
        'humanReviewRequired',
        'costumeEditorEditsRequired',
        'licenseStatus',
        'promptStored'
    ],
    reviewStates: ['pending-human-review', 'approved-for-classroom', 'rejected'],
    classroomRule: 'Generated assets must be reviewed and edited before adoption.'
});

const PROVIDER_MANIFEST = Object.freeze([
    {
        id: PROVIDER_MODES.MOCK,
        name: 'Mock asset worker',
        source: 'local-placeholder',
        license: {
            status: 'not-applicable',
            spdx: 'NOASSERTION',
            note: 'No generated image is produced in mock mode.'
        },
        model: {
            weightsDownloaded: false,
            weightsSize: '0',
            minimumGpu: 'none',
            sha256: ''
        },
        runtime: {
            requiresApiKey: false,
            externalNetwork: false,
            serverOnly: true
        },
        output: {
            formats: [],
            aiGeneratedLabelRequired: true,
            humanReviewRequired: true,
            costumeEditorEditsRequired: 2
        }
    },
    {
        id: PROVIDER_MODES.GEMINI_IMAGE,
        name: 'Gemini image generation',
        source: 'server-side-gemini-api',
        license: {
            status: 'provider-terms-review-required',
            spdx: 'NOASSERTION',
            note: 'External Gemini image generation. Review provider terms and classroom policy before broad release.'
        },
        model: {
            weightsDownloaded: false,
            weightsSize: '0',
            minimumGpu: 'none',
            sha256: ''
        },
        runtime: {
            requiresApiKey: true,
            externalNetwork: true,
            serverOnly: true
        },
        output: {
            formats: ['png', 'jpg', 'webp'],
            aiGeneratedLabelRequired: true,
            humanReviewRequired: true,
            costumeEditorEditsRequired: 2,
            transparentPngRequiredFor: TRANSPARENT_PNG_ASSET_TYPES
        }
    },
    {
        id: PROVIDER_MODES.OPENAI_IMAGE,
        name: 'OpenAI image generation',
        source: 'server-side-image-api',
        license: {
            status: 'provider-terms-review-required',
            spdx: 'NOASSERTION',
            note: 'External image generation. Review provider terms and classroom policy before broad release.'
        },
        model: {
            weightsDownloaded: false,
            weightsSize: '0',
            minimumGpu: 'none',
            sha256: ''
        },
        runtime: {
            requiresApiKey: true,
            externalNetwork: true,
            serverOnly: true
        },
        output: {
            formats: ['png'],
            aiGeneratedLabelRequired: true,
            humanReviewRequired: true,
            costumeEditorEditsRequired: 2,
            transparentPngRequiredFor: TRANSPARENT_PNG_ASSET_TYPES
        }
    },
    {
        id: PROVIDER_MODES.SILICONFLOW_IMAGE,
        name: 'SiliconFlow image generation',
        source: 'server-side-siliconflow-api',
        license: {
            status: 'provider-terms-review-required',
            spdx: 'NOASSERTION',
            note: 'External SiliconFlow image generation. Review provider terms and classroom policy before broad release.'
        },
        model: {
            weightsDownloaded: false,
            weightsSize: '0',
            minimumGpu: 'none',
            sha256: ''
        },
        runtime: {
            requiresApiKey: true,
            externalNetwork: true,
            serverOnly: true
        },
        output: {
            formats: ['png', 'jpg', 'webp'],
            aiGeneratedLabelRequired: true,
            humanReviewRequired: true,
            costumeEditorEditsRequired: 2,
            transparentPngRequiredFor: TRANSPARENT_PNG_ASSET_TYPES
        }
    },
    {
        id: PROVIDER_MODES.TEMPLATE_SVG,
        name: 'Scratch classroom SVG template renderer',
        source: 'local-code-template',
        license: {
            status: 'internal-template',
            spdx: 'NOASSERTION',
            note: 'No third-party model weights are used. Review classroom/commercial policy before broad release.'
        },
        model: {
            weightsDownloaded: false,
            weightsSize: '0',
            minimumGpu: 'none',
            sha256: ''
        },
        runtime: {
            requiresApiKey: false,
            externalNetwork: false,
            serverOnly: true
        },
        output: {
            formats: ['svg'],
            aiGeneratedLabelRequired: true,
            humanReviewRequired: true,
            costumeEditorEditsRequired: 2
        }
    }
]);

const parsePort = value => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return DEFAULT_PORT;
};

const parseBoolean = value => (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 'yes'
);

const readRequestId = request => {
    const headerValue = String(request && request.headers && request.headers['x-scratch-ai-request-id'] || '').trim();
    if (/^[A-Za-z0-9._:-]{8,96}$/.test(headerValue)) return headerValue;
    return randomUUID();
};

const writeStructuredEvent = record => {
    const line = JSON.stringify(record);
    const logFile = String(process.env.SCRATCH_AI_STRUCTURED_EVENT_LOG_FILE || '').trim();
    if (!logFile) {
        if (parseBoolean(process.env.SCRATCH_AI_STRUCTURED_STDOUT_LOGS)) console.log(line);
        return;
    }
    try {
        appendFileSync(logFile, `${line}\n`, 'utf8');
    } catch (error) {
        console.log(line);
    }
};

const installStructuredRequestLog = ({
    providerMode,
    request,
    response
}) => {
    const startedAt = Date.now();
    request.scratchAiRequestId = readRequestId(request);
    response.setHeader('X-Scratch-AI-Request-Id', request.scratchAiRequestId);
    response.once('finish', () => {
        writeStructuredEvent({
            schemaVersion: 'scratch-ai-request-log-v1',
            service: 'scratch-ai-asset-worker',
            requestId: request.scratchAiRequestId,
            method: request.method,
            route: request.url || '/',
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
            providerMode,
            classScopeHash: '',
            studentScopeHash: '',
            valuesRedacted: true
        });
    });
};

const normalizeImageProvider = value => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'template' || normalized === PROVIDER_MODES.TEMPLATE_SVG) {
        return PROVIDER_MODES.TEMPLATE_SVG;
    }
    if (
        normalized === 'gemini' ||
        normalized === 'google-gemini' ||
        normalized === 'gemini-native' ||
        normalized === PROVIDER_MODES.GEMINI_IMAGE
    ) {
        return PROVIDER_MODES.GEMINI_IMAGE;
    }
    if (
        normalized === 'openai' ||
        normalized === 'gpt-image' ||
        normalized === PROVIDER_MODES.OPENAI_IMAGE
    ) {
        return PROVIDER_MODES.OPENAI_IMAGE;
    }
    if (
        normalized === 'siliconflow' ||
        normalized === 'silicon-flow' ||
        normalized === 'qwen-image' ||
        normalized === PROVIDER_MODES.SILICONFLOW_IMAGE
    ) {
        return PROVIDER_MODES.SILICONFLOW_IMAGE;
    }
    return PROVIDER_MODES.MOCK;
};

const readDimension = value => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SIZE;
    return Math.min(Math.max(parsed, 64), 1024);
};

const readOpenAIImageSize = value => {
    const normalized = String(value || DEFAULT_OPENAI_IMAGE_SIZE).trim().toLowerCase();
    if (normalized === 'auto') return 'auto';
    if (/^(1024x1024|1024x1536|1536x1024)$/.test(normalized)) return normalized;
    return DEFAULT_OPENAI_IMAGE_SIZE;
};

const readOpenAIImageQuality = value => {
    const normalized = String(value || DEFAULT_OPENAI_IMAGE_QUALITY).trim().toLowerCase();
    if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized;
    return DEFAULT_OPENAI_IMAGE_QUALITY;
};

const readOpenAIConfig = (env = {}) => ({
    apiKey: String(env.SCRATCH_AI_OPENAI_API_KEY || env.OPENAI_API_KEY || '').trim(),
    baseUrl: String(env.SCRATCH_AI_OPENAI_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL)
        .trim()
        .replace(/\/+$/, ''),
    model: String(env.SCRATCH_AI_OPENAI_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_IMAGE_MODEL)
        .trim() || DEFAULT_OPENAI_IMAGE_MODEL,
    quality: readOpenAIImageQuality(env.SCRATCH_AI_OPENAI_IMAGE_QUALITY || env.OPENAI_IMAGE_QUALITY),
    size: readOpenAIImageSize(env.SCRATCH_AI_OPENAI_IMAGE_SIZE || env.OPENAI_IMAGE_SIZE),
    timeoutMs: readProviderTimeoutMs(
        env.SCRATCH_AI_OPENAI_TIMEOUT_MS ||
        env.OPENAI_TIMEOUT_MS ||
        env.SCRATCH_AI_IMAGE_PROVIDER_TIMEOUT_MS
    )
});

const readGeminiAuthMode = value => {
    const normalized = String(value || DEFAULT_GEMINI_AUTH_MODE).trim().toLowerCase();
    if (['bearer', 'both', 'query', 'x-goog-api-key'].includes(normalized)) return normalized;
    return DEFAULT_GEMINI_AUTH_MODE;
};

const readGeminiConfig = (env = {}) => ({
    apiKey: String(
        env.SCRATCH_AI_GEMINI_API_KEY ||
        env.GEMINI_API_KEY ||
        env.GOOGLE_API_KEY ||
        env.SCRATCH_AI_OPENAI_API_KEY ||
        env.OPENAI_API_KEY ||
        ''
    ).trim(),
    authMode: readGeminiAuthMode(env.SCRATCH_AI_GEMINI_AUTH_MODE || env.GEMINI_AUTH_MODE),
    baseUrl: String(env.SCRATCH_AI_GEMINI_BASE_URL || env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL)
        .trim()
        .replace(/\/+$/, ''),
    model: String(env.SCRATCH_AI_GEMINI_IMAGE_MODEL || env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL)
        .trim() || DEFAULT_GEMINI_IMAGE_MODEL,
    timeoutMs: readProviderTimeoutMs(
        env.SCRATCH_AI_GEMINI_TIMEOUT_MS ||
        env.GEMINI_TIMEOUT_MS ||
        env.SCRATCH_AI_IMAGE_PROVIDER_TIMEOUT_MS
    )
});

const readSiliconFlowImageSize = value => {
    const normalized = String(value || DEFAULT_SILICONFLOW_IMAGE_SIZE).trim().toLowerCase();
    if (/^[1-9]\d{1,3}x[1-9]\d{1,3}$/.test(normalized)) return normalized;
    return DEFAULT_SILICONFLOW_IMAGE_SIZE;
};

const readSiliconFlowOutputFormat = value => {
    const normalized = String(value || DEFAULT_SILICONFLOW_OUTPUT_FORMAT).trim().toLowerCase();
    if (['jpeg', 'jpg', 'png', 'webp'].includes(normalized)) return normalized === 'jpg' ? 'jpeg' : normalized;
    return DEFAULT_SILICONFLOW_OUTPUT_FORMAT;
};

const readSiliconFlowInteger = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const readSiliconFlowNumber = (value, fallback, min, max) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const readProviderTimeoutMs = value => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_IMAGE_PROVIDER_TIMEOUT_MS;
    return Math.min(Math.max(parsed, 1000), 180000);
};

const createProviderFetchOptions = (options, timeoutMs) => {
    if (
        timeoutMs > 0 &&
        typeof AbortSignal !== 'undefined' &&
        typeof AbortSignal.timeout === 'function'
    ) {
        return {
            ...options,
            signal: AbortSignal.timeout(timeoutMs)
        };
    }
    return options;
};

const readSiliconFlowConfig = (env = {}) => ({
    apiKey: String(env.SCRATCH_AI_SILICONFLOW_API_KEY || env.SILICONFLOW_API_KEY || '').trim(),
    baseUrl: String(env.SCRATCH_AI_SILICONFLOW_BASE_URL || env.SILICONFLOW_BASE_URL || DEFAULT_SILICONFLOW_BASE_URL)
        .trim()
        .replace(/\/+$/, ''),
    guidanceScale: readSiliconFlowNumber(
        env.SCRATCH_AI_SILICONFLOW_GUIDANCE_SCALE || env.SILICONFLOW_GUIDANCE_SCALE,
        DEFAULT_SILICONFLOW_GUIDANCE_SCALE,
        0,
        20
    ),
    imageSize: readSiliconFlowImageSize(env.SCRATCH_AI_SILICONFLOW_IMAGE_SIZE || env.SILICONFLOW_IMAGE_SIZE),
    inferenceSteps: readSiliconFlowInteger(
        env.SCRATCH_AI_SILICONFLOW_INFERENCE_STEPS || env.SILICONFLOW_INFERENCE_STEPS,
        DEFAULT_SILICONFLOW_INFERENCE_STEPS,
        1,
        50
    ),
    model: String(
        env.SCRATCH_AI_SILICONFLOW_IMAGE_MODEL ||
        env.SILICONFLOW_IMAGE_MODEL ||
        DEFAULT_SILICONFLOW_IMAGE_MODEL
    ).trim() || DEFAULT_SILICONFLOW_IMAGE_MODEL,
    outputFormat: readSiliconFlowOutputFormat(
        env.SCRATCH_AI_SILICONFLOW_OUTPUT_FORMAT || env.SILICONFLOW_OUTPUT_FORMAT
    ),
    timeoutMs: readProviderTimeoutMs(
        env.SCRATCH_AI_SILICONFLOW_TIMEOUT_MS ||
        env.SILICONFLOW_TIMEOUT_MS ||
        env.SCRATCH_AI_IMAGE_PROVIDER_TIMEOUT_MS
    )
});

const sendJson = (response, statusCode, payload) => {
    response.writeHead(statusCode, {
        'Access-Control-Allow-Headers': 'Content-Type, X-Scratch-AI-Request-Id',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Origin': 'http://127.0.0.1:8603',
        'Content-Type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify(payload));
};

const readJsonBody = request => new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
        body += chunk;
        if (body.length > MAX_BODY_BYTES) {
            reject(new Error('Request body is too large'));
            request.destroy();
        }
    });
    request.on('end', () => {
        try {
            resolve(body ? JSON.parse(body) : {});
        } catch (error) {
            reject(new Error('Invalid JSON body'));
        }
    });
    request.on('error', reject);
});

const sanitizePrompt = prompt => String(prompt || '').trim().slice(0, 240);

const escapeXml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const hashText = value => Array.from(String(value || '')).reduce(
    (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) >>> 0,
    2166136261
);

const readPalette = prompt => TEMPLATE_PALETTES[hashText(prompt) % TEMPLATE_PALETTES.length];

const normalizeAssetType = type => String(type || 'image').trim().toLowerCase();

const requiresTransparentPng = type => TRANSPARENT_PNG_ASSET_TYPE_SET.has(normalizeAssetType(type));

const createTransparentBackgroundPolicy = ({
    repair = null,
    type,
    validation = null
} = {}) => {
    const required = requiresTransparentPng(type);
    const repairAttempted = Boolean(repair && repair.attempted);
    const repairSucceeded = Boolean(repair && repair.succeeded);
    return {
        required,
        format: required ? 'png' : '',
        serverValidated: Boolean(validation && validation.checked),
        passed: validation ? validation.passed === true : !required,
        reason: validation && validation.reason ? validation.reason : '',
        repaired: repairSucceeded,
        repairAttempted,
        repairSucceeded,
        repairMethod: repair && repair.method ? repair.method : '',
        originalReason: repair && repair.originalReason ? repair.originalReason : ''
    };
};

const createManifestReply = providerMode => ({
    service: 'scratch-ai-asset-worker',
    currentProvider: providerMode,
    providers: PROVIDER_MANIFEST,
    resultAuditSchema: RESULT_AUDIT_SCHEMA
});

const createAuditRecord = ({
    generated,
    model = '',
    providerMode,
    transparentBackground = null,
    type
}) => {
    const provider = PROVIDER_MANIFEST.find(item => item.id === providerMode);

    return {
        schemaVersion: RESULT_AUDIT_SCHEMA.id,
        providerId: providerMode,
        assetType: type,
        generated,
        aiGeneratedLabel: true,
        humanReviewRequired: true,
        costumeEditorEditsRequired: 2,
        externalNetwork: provider && provider.runtime ? provider.runtime.externalNetwork === true : false,
        modelWeightsDownloaded: false,
        providerModel: model,
        promptStored: false,
        transparentBackground,
        licenseStatus: provider ? provider.license.status : 'unknown',
        reviewState: 'pending-human-review'
    };
};

const createReviewPolicy = ({
    transparentPngRequired,
    type
} = {}) => {
    const shouldRequireTransparentPng = typeof transparentPngRequired === 'boolean' ?
        transparentPngRequired :
        requiresTransparentPng(type);

    return {
        required: true,
        status: 'pending-human-review',
        checks: [
            'Classroom safety review',
            'AI generated label visible',
            ...(shouldRequireTransparentPng ? ['Sprite-like assets must be transparent PNGs before import'] : []),
            'Edit at least 2 visual elements before adoption',
            'Confirm asset matches the lesson goal'
        ],
        adoption: {
            allowedBeforeReview: false,
            requiredStudentEdits: 2,
            targetEditor: 'costume-editor'
        }
    };
};

const parsePngChunks = buffer => {
    if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length + 12) {
        return null;
    }
    if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        return null;
    }

    const chunks = [];
    let offset = PNG_SIGNATURE.length;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const nextOffset = dataEnd + 4;
        if (length < 0 || dataEnd > buffer.length || nextOffset > buffer.length) return null;
        chunks.push({
            data: buffer.subarray(dataStart, dataEnd),
            type
        });
        offset = nextOffset;
        if (type === 'IEND') break;
    }
    return chunks;
};

const PNG_CRC_TABLE = (() => {
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
        crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
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

const readPngMetadata = base64 => {
    let buffer;
    try {
        buffer = Buffer.from(String(base64 || ''), 'base64');
    } catch (error) {
        return {
            validPng: false,
            reason: 'invalid-base64'
        };
    }

    const chunks = parsePngChunks(buffer);
    if (!chunks) {
        return {
            validPng: false,
            reason: 'invalid-png'
        };
    }

    const ihdr = chunks.find(chunk => chunk.type === 'IHDR');
    if (!ihdr || ihdr.data.length < 13) {
        return {
            validPng: false,
            reason: 'missing-ihdr'
        };
    }

    return {
        bitDepth: ihdr.data[8],
        buffer,
        chunks,
        colorType: ihdr.data[9],
        height: ihdr.data.readUInt32BE(4),
        validPng: true,
        width: ihdr.data.readUInt32BE(0)
    };
};

const unfilterPngScanlines = ({
    channels,
    height,
    inflated,
    width
}) => {
    const scanlineLength = width * channels;
    const expectedLength = (scanlineLength + 1) * height;
    if (inflated.length < expectedLength) {
        return {
            reason: 'truncated-idat'
        };
    }

    let previous = Buffer.alloc(scanlineLength);
    const rows = [];
    for (let y = 0; y < height; y++) {
        const rowStart = y * (scanlineLength + 1);
        const filterType = inflated[rowStart];
        const encoded = inflated.subarray(rowStart + 1, rowStart + 1 + scanlineLength);
        const row = Buffer.alloc(scanlineLength);

        for (let x = 0; x < scanlineLength; x++) {
            const raw = encoded[x];
            const left = x >= channels ? row[x - channels] : 0;
            const up = previous[x] || 0;
            const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
            let value;
            if (filterType === 0) {
                value = raw;
            } else if (filterType === 1) {
                value = raw + left;
            } else if (filterType === 2) {
                value = raw + up;
            } else if (filterType === 3) {
                value = raw + Math.floor((left + up) / 2);
            } else if (filterType === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left);
                const pb = Math.abs(p - up);
                const pc = Math.abs(p - upLeft);
                const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
                value = raw + predictor;
            } else {
                return {
                    reason: 'unsupported-filter'
                };
            }
            row[x] = value & 0xff;
        }

        rows.push(row);
        previous = row;
    }

    return {
        rows
    };
};

const decodePngToRgba = base64 => {
    const metadata = readPngMetadata(base64);
    if (!metadata.validPng) return metadata;

    const {
        bitDepth,
        chunks,
        colorType,
        height,
        width
    } = metadata;
    if (bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) {
        return {
            bitDepth,
            colorType,
            height,
            reason: 'unsupported-png-color',
            validPng: false,
            width
        };
    }

    const idatData = Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data));
    if (!idatData.length) {
        return {
            bitDepth,
            colorType,
            height,
            reason: 'missing-idat',
            validPng: false,
            width
        };
    }

    let inflated;
    try {
        inflated = inflateSync(idatData);
    } catch (error) {
        return {
            bitDepth,
            colorType,
            height,
            reason: 'invalid-idat',
            validPng: false,
            width
        };
    }

    const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
    const unfiltered = unfilterPngScanlines({
        channels,
        height,
        inflated,
        width
    });
    if (!unfiltered.rows) {
        return {
            bitDepth,
            colorType,
            height,
            reason: unfiltered.reason,
            validPng: false,
            width
        };
    }

    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        const row = unfiltered.rows[y];
        for (let x = 0; x < width; x++) {
            const sourceIndex = x * channels;
            const targetIndex = ((y * width) + x) * 4;
            if (colorType === 0) {
                const gray = row[sourceIndex];
                rgba[targetIndex] = gray;
                rgba[targetIndex + 1] = gray;
                rgba[targetIndex + 2] = gray;
                rgba[targetIndex + 3] = 255;
            } else if (colorType === 2) {
                rgba[targetIndex] = row[sourceIndex];
                rgba[targetIndex + 1] = row[sourceIndex + 1];
                rgba[targetIndex + 2] = row[sourceIndex + 2];
                rgba[targetIndex + 3] = 255;
            } else if (colorType === 4) {
                const gray = row[sourceIndex];
                rgba[targetIndex] = gray;
                rgba[targetIndex + 1] = gray;
                rgba[targetIndex + 2] = gray;
                rgba[targetIndex + 3] = row[sourceIndex + 1];
            } else {
                rgba[targetIndex] = row[sourceIndex];
                rgba[targetIndex + 1] = row[sourceIndex + 1];
                rgba[targetIndex + 2] = row[sourceIndex + 2];
                rgba[targetIndex + 3] = row[sourceIndex + 3];
            }
        }
    }

    return {
        bitDepth,
        colorType,
        height,
        rgba,
        validPng: true,
        width
    };
};

const encodeRgbaPngBase64 = ({
    height,
    rgba,
    width
}) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const rows = [];
    const rowLength = width * 4;
    for (let y = 0; y < height; y++) {
        rows.push(Buffer.concat([
            Buffer.from([0]),
            rgba.subarray(y * rowLength, (y + 1) * rowLength)
        ]));
    }

    return Buffer.concat([
        PNG_SIGNATURE,
        createPngChunk('IHDR', ihdr),
        createPngChunk('IDAT', deflateSync(Buffer.concat(rows))),
        createPngChunk('IEND')
    ]).toString('base64');
};

const colorDistanceSq = (rgba, index, color) => {
    const red = rgba[index] - color.red;
    const green = rgba[index + 1] - color.green;
    const blue = rgba[index + 2] - color.blue;
    return (red * red) + (green * green) + (blue * blue);
};

const averageColors = colors => {
    const total = colors.reduce((sum, color) => ({
        red: sum.red + color.red,
        green: sum.green + color.green,
        blue: sum.blue + color.blue
    }), {
        red: 0,
        green: 0,
        blue: 0
    });
    return {
        blue: Math.round(total.blue / colors.length),
        green: Math.round(total.green / colors.length),
        red: Math.round(total.red / colors.length)
    };
};

const readPixelColor = (rgba, width, x, y) => {
    const index = ((y * width) + x) * 4;
    return {
        blue: rgba[index + 2],
        green: rgba[index + 1],
        red: rgba[index]
    };
};

const estimateEdgeBackgroundColor = ({
    height,
    rgba,
    width
}) => {
    if (!width || !height) {
        return {
            reason: 'empty-image'
        };
    }

    const corners = [
        readPixelColor(rgba, width, 0, 0),
        readPixelColor(rgba, width, width - 1, 0),
        readPixelColor(rgba, width, 0, height - 1),
        readPixelColor(rgba, width, width - 1, height - 1)
    ];
    const background = averageColors(corners);
    const maxCornerDistanceSq = corners.reduce((maxDistance, corner) => Math.max(
        maxDistance,
        ((corner.red - background.red) ** 2) +
        ((corner.green - background.green) ** 2) +
        ((corner.blue - background.blue) ** 2)
    ), 0);
    if (maxCornerDistanceSq > (96 * 96)) {
        return {
            reason: 'inconsistent-corner-background'
        };
    }

    return {
        background
    };
};

const isEdgePixel = ({
    height,
    width,
    x,
    y
}) => x === 0 || y === 0 || x === width - 1 || y === height - 1;

const removeSimpleEdgeBackground = ({
    base64,
    originalReason
}) => {
    const decoded = decodePngToRgba(base64);
    if (!decoded.validPng) {
        return {
            attempted: true,
            originalReason,
            reason: decoded.reason || 'invalid-png'
        };
    }

    const {
        height,
        rgba,
        width
    } = decoded;
    const estimate = estimateEdgeBackgroundColor({
        height,
        rgba,
        width
    });
    if (!estimate.background) {
        return {
            attempted: true,
            originalReason,
            reason: estimate.reason || 'background-not-detected'
        };
    }

    const totalPixels = width * height;
    const mask = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let head = 0;
    let tail = 0;
    const backgroundThresholdSq = 52 * 52;

    const trySeed = (x, y) => {
        const pixelIndex = (y * width) + x;
        if (mask[pixelIndex]) return;
        const rgbaIndex = pixelIndex * 4;
        if (rgba[rgbaIndex + 3] < 16 || colorDistanceSq(rgba, rgbaIndex, estimate.background) <= backgroundThresholdSq) {
            mask[pixelIndex] = 1;
            queue[tail++] = pixelIndex;
        }
    };

    for (let x = 0; x < width; x++) {
        trySeed(x, 0);
        trySeed(x, height - 1);
    }
    for (let y = 1; y < height - 1; y++) {
        trySeed(0, y);
        trySeed(width - 1, y);
    }

    while (head < tail) {
        const pixelIndex = queue[head++];
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        const neighbors = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1]
        ];
        for (const [nextX, nextY] of neighbors) {
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
            const nextIndex = (nextY * width) + nextX;
            if (mask[nextIndex]) continue;
            const rgbaIndex = nextIndex * 4;
            if (colorDistanceSq(rgba, rgbaIndex, estimate.background) <= backgroundThresholdSq) {
                mask[nextIndex] = 1;
                queue[tail++] = nextIndex;
            }
        }
    }

    if (tail < Math.max(1, Math.ceil(totalPixels * 0.02))) {
        return {
            attempted: true,
            originalReason,
            reason: 'background-not-detected'
        };
    }
    if (tail > Math.floor(totalPixels * 0.985)) {
        return {
            attempted: true,
            originalReason,
            reason: 'background-removal-would-empty-image'
        };
    }

    const repairedRgba = Buffer.from(rgba);
    let opaquePixels = 0;
    for (let index = 0; index < totalPixels; index++) {
        const rgbaIndex = index * 4;
        if (mask[index]) {
            repairedRgba[rgbaIndex + 3] = 0;
        } else {
            opaquePixels++;
        }
    }

    const featherThresholdSq = 88 * 88;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelIndex = (y * width) + x;
            if (mask[pixelIndex]) continue;
            const rgbaIndex = pixelIndex * 4;
            if (colorDistanceSq(rgba, rgbaIndex, estimate.background) > featherThresholdSq) continue;
            const touchesBackground = (
                (x > 0 && mask[pixelIndex - 1]) ||
                (x < width - 1 && mask[pixelIndex + 1]) ||
                (y > 0 && mask[pixelIndex - width]) ||
                (y < height - 1 && mask[pixelIndex + width])
            );
            if (touchesBackground && !isEdgePixel({
                height,
                width,
                x,
                y
            })) {
                repairedRgba[rgbaIndex + 3] = Math.min(repairedRgba[rgbaIndex + 3], 160);
            }
        }
    }

    const minimumOpaquePixels = totalPixels <= 16 ? 1 : Math.max(4, Math.ceil(totalPixels * 0.01));
    if (opaquePixels < minimumOpaquePixels) {
        return {
            attempted: true,
            originalReason,
            reason: 'background-removal-would-empty-image'
        };
    }

    return {
        attempted: true,
        base64: encodeRgbaPngBase64({
            height,
            rgba: repairedRgba,
            width
        }),
        method: TRANSPARENT_PNG_REPAIR_METHOD,
        originalReason,
        reason: 'repaired',
        succeeded: true
    };
};

const inspectPngTransparency = base64 => {
    let buffer;
    try {
        buffer = Buffer.from(String(base64 || ''), 'base64');
    } catch (error) {
        return {
            validPng: false,
            reason: 'invalid-base64'
        };
    }

    const chunks = parsePngChunks(buffer);
    if (!chunks) {
        return {
            validPng: false,
            reason: 'invalid-png'
        };
    }

    const ihdr = chunks.find(chunk => chunk.type === 'IHDR');
    if (!ihdr || ihdr.data.length < 13) {
        return {
            validPng: false,
            reason: 'missing-ihdr'
        };
    }

    const width = ihdr.data.readUInt32BE(0);
    const height = ihdr.data.readUInt32BE(4);
    const bitDepth = ihdr.data[8];
    const colorType = ihdr.data[9];
    const transparencyChunk = chunks.find(chunk => chunk.type === 'tRNS');
    const hasAlphaChannel = colorType === 4 || colorType === 6 || Boolean(transparencyChunk);

    if (!hasAlphaChannel) {
        return {
            bitDepth,
            colorType,
            edgeTransparentPixels: 0,
            edgePixels: Math.max(0, (width * 2) + ((height - 2) * 2)),
            height,
            hasAlphaChannel: false,
            transparentPixels: 0,
            validPng: true,
            width
        };
    }

    // Provider-generated Scratch assets should be 8-bit RGBA/GA PNGs. Palette
    // tRNS proves transparency exists, but not whether the background edge is clear.
    if (bitDepth !== 8 || (colorType !== 4 && colorType !== 6)) {
        return {
            bitDepth,
            colorType,
            edgeTransparentPixels: transparencyChunk ? 1 : 0,
            edgePixels: Math.max(1, (width * 2) + ((height - 2) * 2)),
            height,
            hasAlphaChannel,
            transparentPixels: transparencyChunk ? 1 : 0,
            validPng: true,
            width
        };
    }

    const idatData = Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data));
    if (!idatData.length) {
        return {
            bitDepth,
            colorType,
            height,
            hasAlphaChannel,
            reason: 'missing-idat',
            validPng: false,
            width
        };
    }

    const channels = colorType === 6 ? 4 : 2;
    const bytesPerPixel = channels;
    const scanlineLength = width * channels;
    let inflated;
    try {
        inflated = inflateSync(idatData);
    } catch (error) {
        return {
            bitDepth,
            colorType,
            height,
            hasAlphaChannel,
            reason: 'invalid-idat',
            validPng: false,
            width
        };
    }

    const expectedLength = (scanlineLength + 1) * height;
    if (inflated.length < expectedLength) {
        return {
            bitDepth,
            colorType,
            height,
            hasAlphaChannel,
            reason: 'truncated-idat',
            validPng: false,
            width
        };
    }

    let previous = Buffer.alloc(scanlineLength);
    let transparentPixels = 0;
    let edgeTransparentPixels = 0;
    const edgePixels = width === 0 || height === 0 ? 0 :
        width === 1 && height === 1 ? 1 :
            (width * 2) + (Math.max(0, height - 2) * 2);

    for (let y = 0; y < height; y++) {
        const rowStart = y * (scanlineLength + 1);
        const filterType = inflated[rowStart];
        const encoded = inflated.subarray(rowStart + 1, rowStart + 1 + scanlineLength);
        const row = Buffer.alloc(scanlineLength);

        for (let x = 0; x < scanlineLength; x++) {
            const raw = encoded[x];
            const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
            const up = previous[x] || 0;
            const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
            let value;
            if (filterType === 0) {
                value = raw;
            } else if (filterType === 1) {
                value = raw + left;
            } else if (filterType === 2) {
                value = raw + up;
            } else if (filterType === 3) {
                value = raw + Math.floor((left + up) / 2);
            } else if (filterType === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left);
                const pb = Math.abs(p - up);
                const pc = Math.abs(p - upLeft);
                const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
                value = raw + predictor;
            } else {
                return {
                    bitDepth,
                    colorType,
                    height,
                    hasAlphaChannel,
                    reason: 'unsupported-filter',
                    validPng: false,
                    width
                };
            }
            row[x] = value & 0xff;
        }

        for (let pixelX = 0; pixelX < width; pixelX++) {
            const alphaIndex = (pixelX * channels) + channels - 1;
            const alpha = row[alphaIndex];
            const isTransparent = alpha < 250;
            if (isTransparent) {
                transparentPixels++;
                if (y === 0 || y === height - 1 || pixelX === 0 || pixelX === width - 1) {
                    edgeTransparentPixels++;
                }
            }
        }

        previous = row;
    }

    return {
        bitDepth,
        colorType,
        edgeTransparentPixels,
        edgePixels,
        height,
        hasAlphaChannel,
        transparentPixels,
        validPng: true,
        width
    };
};

const validateTransparentPngAsset = ({
    base64,
    mimeType,
    type
}) => {
    if (!requiresTransparentPng(type)) {
        return {
            checked: false,
            passed: true,
            reason: 'not-required'
        };
    }

    const normalizedMimeType = String(mimeType || '').split(';')[0].trim().toLowerCase();
    if (normalizedMimeType !== 'image/png') {
        return {
            checked: true,
            passed: false,
            reason: 'not-png'
        };
    }

    const inspection = inspectPngTransparency(base64);
    if (!inspection.validPng) {
        return {
            checked: true,
            inspection,
            passed: false,
            reason: inspection.reason || 'invalid-png'
        };
    }
    if (!inspection.hasAlphaChannel) {
        return {
            checked: true,
            inspection,
            passed: false,
            reason: 'missing-alpha-channel'
        };
    }
    if (!inspection.transparentPixels) {
        return {
            checked: true,
            inspection,
            passed: false,
            reason: 'missing-transparent-pixels'
        };
    }

    const minimumEdgeTransparentPixels = inspection.edgePixels <= 4 ?
        1 :
        Math.ceil(inspection.edgePixels * 0.1);
    if (inspection.edgeTransparentPixels < minimumEdgeTransparentPixels) {
        return {
            checked: true,
            inspection,
            passed: false,
            reason: 'missing-transparent-background-edge'
        };
    }

    return {
        checked: true,
        inspection,
        passed: true,
        reason: 'transparent-png'
    };
};

const prepareTransparentPngAsset = ({
    imageData,
    type
}) => {
    const initialValidation = validateTransparentPngAsset({
        base64: imageData.base64,
        mimeType: imageData.mimeType,
        type
    });

    if (initialValidation.passed || !requiresTransparentPng(type)) {
        return {
            imageData,
            transparentBackground: createTransparentBackgroundPolicy({
                type,
                validation: initialValidation
            }),
            transparentValidation: initialValidation
        };
    }

    let repair = null;
    let nextImageData = imageData;
    let nextValidation = initialValidation;
    if (
        String(imageData.mimeType || '').split(';')[0].trim().toLowerCase() === 'image/png' &&
        TRANSPARENT_PNG_REPAIRABLE_REASONS.has(initialValidation.reason)
    ) {
        repair = removeSimpleEdgeBackground({
            base64: imageData.base64,
            originalReason: initialValidation.reason
        });
        if (repair.succeeded && repair.base64) {
            nextImageData = {
                ...imageData,
                base64: repair.base64,
                mimeType: 'image/png'
            };
            nextValidation = validateTransparentPngAsset({
                base64: nextImageData.base64,
                mimeType: nextImageData.mimeType,
                type
            });
            repair = {
                ...repair,
                succeeded: nextValidation.passed === true
            };
        }
    }

    return {
        imageData: nextImageData,
        transparentBackground: createTransparentBackgroundPolicy({
            repair,
            type,
            validation: nextValidation
        }),
        transparentValidation: nextValidation
    };
};

const createBackdropSvg = ({
    height,
    palette,
    prompt,
    width
}) => {
    const safePrompt = escapeXml(prompt || 'Scratch scene');
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
        `<rect width="${width}" height="${height}" fill="${palette.background}"/>`,
        `<circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.2)}" r="${Math.round(width * 0.11)}" fill="${palette.secondary}" opacity="0.9"/>`,
        `<path d="M0 ${height * 0.62} C ${width * 0.2} ${height * 0.45}, ${width * 0.35} ${height * 0.72}, ${width * 0.55} ${height * 0.56} S ${width * 0.82} ${height * 0.42}, ${width} ${height * 0.58} L ${width} ${height} L 0 ${height} Z" fill="${palette.primary}" opacity="0.82"/>`,
        `<path d="M0 ${height * 0.76} C ${width * 0.24} ${height * 0.64}, ${width * 0.4} ${height * 0.86}, ${width * 0.64} ${height * 0.72} S ${width * 0.86} ${height * 0.62}, ${width} ${height * 0.74} L ${width} ${height} L 0 ${height} Z" fill="${palette.accent}" opacity="0.82"/>`,
        `<rect x="${width * 0.08}" y="${height * 0.12}" width="${width * 0.46}" height="${height * 0.12}" rx="12" fill="#ffffff" opacity="0.72"/>`,
        `<text x="${width * 0.11}" y="${height * 0.19}" fill="${palette.ink}" font-family="Arial, sans-serif" font-size="20" font-weight="700">${safePrompt.slice(0, 28)}</text>`,
        `<text x="${width - 76}" y="${height - 22}" fill="${palette.ink}" font-family="Arial, sans-serif" font-size="14" opacity="0.72">AI draft</text>`,
        '</svg>'
    ].join('');
};

const createCharacterSvg = ({
    height,
    palette,
    prompt,
    width
}) => {
    const safePrompt = escapeXml(prompt || 'Scratch sprite');
    const centerX = width / 2;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
        `<rect width="${width}" height="${height}" fill="${palette.background}"/>`,
        `<ellipse cx="${centerX}" cy="${height * 0.84}" rx="${width * 0.25}" ry="${height * 0.05}" fill="#000000" opacity="0.12"/>`,
        `<path d="M${centerX - 82} ${height * 0.58} Q${centerX} ${height * 0.42} ${centerX + 82} ${height * 0.58} L${centerX + 62} ${height * 0.78} Q${centerX} ${height * 0.86} ${centerX - 62} ${height * 0.78} Z" fill="${palette.primary}"/>`,
        `<circle cx="${centerX}" cy="${height * 0.36}" r="${width * 0.17}" fill="${palette.secondary}"/>`,
        `<circle cx="${centerX - 32}" cy="${height * 0.34}" r="10" fill="${palette.ink}"/>`,
        `<circle cx="${centerX + 32}" cy="${height * 0.34}" r="10" fill="${palette.ink}"/>`,
        `<path d="M${centerX - 34} ${height * 0.41} Q${centerX} ${height * 0.46} ${centerX + 34} ${height * 0.41}" fill="none" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round"/>`,
        `<path d="M${centerX - 110} ${height * 0.6} Q${centerX - 150} ${height * 0.5} ${centerX - 124} ${height * 0.42}" fill="none" stroke="${palette.accent}" stroke-width="20" stroke-linecap="round"/>`,
        `<path d="M${centerX + 110} ${height * 0.6} Q${centerX + 150} ${height * 0.5} ${centerX + 124} ${height * 0.42}" fill="none" stroke="${palette.accent}" stroke-width="20" stroke-linecap="round"/>`,
        `<rect x="${width * 0.16}" y="${height * 0.08}" width="${width * 0.68}" height="${height * 0.1}" rx="12" fill="#ffffff" opacity="0.72"/>`,
        `<text x="${width * 0.2}" y="${height * 0.145}" fill="${palette.ink}" font-family="Arial, sans-serif" font-size="19" font-weight="700">${safePrompt.slice(0, 30)}</text>`,
        `<text x="${width - 76}" y="${height - 22}" fill="${palette.ink}" font-family="Arial, sans-serif" font-size="14" opacity="0.72">AI draft</text>`,
        '</svg>'
    ].join('');
};

const createTemplateSvg = ({
    height,
    prompt,
    type,
    width
}) => {
    const palette = readPalette(`${type}:${prompt}`);
    if (type === 'backdrop') {
        return createBackdropSvg({
            height,
            palette,
            prompt,
            width
        });
    }
    return createCharacterSvg({
        height,
        palette,
        prompt,
        width
    });
};

const createMockImageJob = requestBody => {
    const prompt = sanitizePrompt(requestBody.prompt || requestBody.description);
    const type = requestBody.type || 'image';

    return {
        id: `mock-${randomUUID()}`,
        mode: PROVIDER_MODES.MOCK,
        status: 'completed',
        type,
        promptLength: prompt.length,
        createdAt: new Date().toISOString(),
        result: {
            generated: false,
            message: 'Mock asset worker only. No model weights were downloaded and no image was generated.',
            placeholder: {
                width: DEFAULT_SIZE,
                height: DEFAULT_SIZE,
                format: 'png'
            }
        },
        review: createReviewPolicy({
            transparentPngRequired: false,
            type
        }),
        audit: createAuditRecord({
            generated: false,
            providerMode: PROVIDER_MODES.MOCK,
            type
        }),
        safety: {
            checked: true,
            blocked: false,
            note: 'Mock mode keeps the job local and does not call a model provider.'
        }
    };
};

const createTemplateImageJob = requestBody => {
    const prompt = sanitizePrompt(requestBody.prompt || requestBody.description);
    const type = requestBody.type || 'image';
    const width = readDimension(requestBody.size && requestBody.size.width);
    const height = readDimension(requestBody.size && requestBody.size.height);
    const svg = createTemplateSvg({
        height,
        prompt,
        type,
        width
    });
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

    return {
        id: `asset-${randomUUID()}`,
        mode: PROVIDER_MODES.TEMPLATE_SVG,
        status: 'completed',
        type,
        promptLength: prompt.length,
        createdAt: new Date().toISOString(),
        result: {
            generated: true,
            message: 'Template SVG asset generated by the isolated worker. Review and edit before classroom use.',
            asset: {
                dataUri,
                width,
                height,
                format: 'svg',
                mimeType: 'image/svg+xml',
                aiGenerated: true,
                generatedBy: PROVIDER_MODES.TEMPLATE_SVG,
                mustEditInCostumeEditor: true,
                requiredStudentEdits: 2
            },
            placeholder: {
                width,
                height,
                format: 'svg'
            }
        },
        review: createReviewPolicy({
            transparentPngRequired: false,
            type
        }),
        audit: createAuditRecord({
            generated: true,
            providerMode: PROVIDER_MODES.TEMPLATE_SVG,
            type
        }),
        safety: {
            checked: true,
            blocked: false,
            note: 'Template mode uses local SVG rendering only. No external network or model weights were used.'
        }
    };
};

const createOpenAIAssetPrompt = ({
    prompt,
    type
}) => {
    const subject = sanitizePrompt(prompt || 'friendly Scratch character');
    if (type === 'backdrop') {
        return [
            'Create a child-friendly Scratch 3.0 stage backdrop as a clean PNG.',
            'Use a simple readable composition, bright classroom-safe colors, no logos, no text, no watermarks.',
            'Make it useful for a beginner coding project.',
            `Scene idea: ${subject}`
        ].join(' ');
    }
    return [
        'Create a child-friendly Scratch 3.0 sprite character as a clean transparent PNG.',
        'Use a centered full-body 2D cartoon style, clear silhouette, simple shapes, no logos, no text, no watermarks.',
        'The background must be fully transparent alpha, especially around all edges; do not use white, solid color, scenery, shadow-only, or checkerboard backgrounds.',
        `Character idea: ${subject}`
    ].join(' ');
};

const createOpenAIConfigurationJob = ({
    model,
    prompt,
    type
}) => ({
    id: `asset-${randomUUID()}`,
    mode: PROVIDER_MODES.OPENAI_IMAGE,
    status: 'configuration-required',
    type,
    promptLength: prompt.length,
    createdAt: new Date().toISOString(),
    result: {
        generated: false,
        message: 'OpenAI image generation is selected, but the server-side API key is not configured.',
        placeholder: {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            format: 'png'
        }
    },
    review: createReviewPolicy({
            type
        }),
    audit: createAuditRecord({
        generated: false,
        model,
        providerMode: PROVIDER_MODES.OPENAI_IMAGE,
        type
    }),
    safety: {
        checked: true,
        blocked: true,
        note: 'No image provider key is exposed to the browser. Configure SCRATCH_AI_OPENAI_API_KEY or OPENAI_API_KEY on the server.'
    }
});

const createOpenAIProviderFailureJob = ({
    model,
    prompt,
    statusCode,
    type
}) => ({
    id: `asset-${randomUUID()}`,
    mode: PROVIDER_MODES.OPENAI_IMAGE,
    status: 'failed',
    type,
    promptLength: prompt.length,
    createdAt: new Date().toISOString(),
    result: {
        generated: false,
        message: statusCode ?
            `OpenAI image generation failed with status ${statusCode}.` :
            'OpenAI image generation failed before returning an image.',
        placeholder: {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            format: 'png'
        }
    },
    review: createReviewPolicy({
            type
        }),
    audit: createAuditRecord({
        generated: false,
        model,
        providerMode: PROVIDER_MODES.OPENAI_IMAGE,
        type
    }),
    safety: {
        checked: true,
        blocked: true,
        note: 'The provider failure was redacted before returning to the browser.'
    }
});

const createGeminiAssetPrompt = ({
    prompt,
    type
}) => {
    const subject = sanitizePrompt(prompt || 'friendly Scratch character');
    if (type === 'backdrop') {
        return [
            'Generate a child-friendly Scratch 3.0 stage backdrop as a clean raster image.',
            'Use a simple readable composition, bright classroom-safe colors, no logos, no text, no watermarks.',
            'Make it useful for a beginner coding project.',
            `Scene idea: ${subject}`
        ].join(' ');
    }
    return [
        'Generate a child-friendly Scratch 3.0 sprite character as a clean transparent PNG raster image.',
        'Use a centered full-body 2D cartoon style, clear silhouette, simple shapes, no logos, no text, no watermarks.',
        'The background must be fully transparent alpha, especially around all edges; do not use white, solid color, scenery, shadow-only, or checkerboard backgrounds.',
        `Character idea: ${subject}`
    ].join(' ');
};

const createGeminiConfigurationJob = ({
    model,
    prompt,
    type
}) => ({
    id: `asset-${randomUUID()}`,
    mode: PROVIDER_MODES.GEMINI_IMAGE,
    status: 'configuration-required',
    type,
    promptLength: prompt.length,
    createdAt: new Date().toISOString(),
    result: {
        generated: false,
        message: 'Gemini image generation is selected, but the server-side API key is not configured.',
        placeholder: {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            format: 'png'
        }
    },
    review: createReviewPolicy({
            type
        }),
    audit: createAuditRecord({
        generated: false,
        model,
        providerMode: PROVIDER_MODES.GEMINI_IMAGE,
        type
    }),
    safety: {
        checked: true,
        blocked: true,
        note: 'No image provider key is exposed to the browser. Configure SCRATCH_AI_GEMINI_API_KEY or GEMINI_API_KEY on the server.'
    }
});

const createGeminiProviderFailureJob = ({
    model,
    prompt,
    statusCode,
    type
}) => ({
    id: `asset-${randomUUID()}`,
    mode: PROVIDER_MODES.GEMINI_IMAGE,
    status: 'failed',
    type,
    promptLength: prompt.length,
    createdAt: new Date().toISOString(),
    result: {
        generated: false,
        message: statusCode ?
            `Gemini image generation failed with status ${statusCode}.` :
            'Gemini image generation failed before returning an image.',
        placeholder: {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            format: 'png'
        }
    },
    review: createReviewPolicy({
            type
        }),
    audit: createAuditRecord({
        generated: false,
        model,
        providerMode: PROVIDER_MODES.GEMINI_IMAGE,
        type
    }),
    safety: {
        checked: true,
        blocked: true,
        note: 'The provider failure was redacted before returning to the browser.'
    }
});

const createSiliconFlowAssetPrompt = ({
    prompt,
    type
}) => {
    const subject = sanitizePrompt(prompt || 'friendly Scratch character');
    if (type === 'backdrop') {
        return [
            'Create a child-friendly Scratch 3.0 stage backdrop.',
            'Use a clean 2D illustration style, simple readable composition, bright classroom-safe colors.',
            'No logos, no text, no watermarks.',
            `Scene idea: ${subject}`
        ].join(' ');
    }
    return [
        'Create a child-friendly Scratch 3.0 sprite character as a transparent PNG.',
        'Use a centered full-body 2D cartoon style, clear silhouette, simple shapes.',
        'The background must be fully transparent alpha, especially around all edges; do not use white, solid color, scenery, shadow-only, or checkerboard backgrounds.',
        'No logos, no text, no watermarks.',
        `Character idea: ${subject}`
    ].join(' ');
};

const createSiliconFlowConfigurationJob = ({
    model,
    prompt,
    type
}) => ({
    id: `asset-${randomUUID()}`,
    mode: PROVIDER_MODES.SILICONFLOW_IMAGE,
    status: 'configuration-required',
    type,
    promptLength: prompt.length,
    createdAt: new Date().toISOString(),
    result: {
        generated: false,
        message: 'SiliconFlow image generation is selected, but the server-side API key is not configured.',
        placeholder: {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            format: 'png'
        }
    },
    review: createReviewPolicy({
            type
        }),
    audit: createAuditRecord({
        generated: false,
        model,
        providerMode: PROVIDER_MODES.SILICONFLOW_IMAGE,
        type
    }),
    safety: {
        checked: true,
        blocked: true,
        note: 'No image provider key is exposed to the browser. Configure SCRATCH_AI_SILICONFLOW_API_KEY or SILICONFLOW_API_KEY on the server.'
    }
});

const createSiliconFlowProviderFailureJob = ({
    model,
    prompt,
    statusCode,
    type
}) => ({
    id: `asset-${randomUUID()}`,
    mode: PROVIDER_MODES.SILICONFLOW_IMAGE,
    status: 'failed',
    type,
    promptLength: prompt.length,
    createdAt: new Date().toISOString(),
    result: {
        generated: false,
        message: statusCode ?
            `SiliconFlow image generation failed with status ${statusCode}.` :
            'SiliconFlow image generation failed before returning an image.',
        placeholder: {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            format: 'png'
        }
    },
    review: createReviewPolicy({
            type
        }),
    audit: createAuditRecord({
        generated: false,
        model,
        providerMode: PROVIDER_MODES.SILICONFLOW_IMAGE,
        type
    }),
    safety: {
        checked: true,
        blocked: true,
        note: 'The provider failure was redacted before returning to the browser.'
    }
});

const createTransparentPngValidationFailureJob = ({
    model,
    prompt,
    providerMode,
    transparentBackground,
    type
}) => {
    const repairAttempted = Boolean(transparentBackground && transparentBackground.repairAttempted);
    return {
        id: `asset-${randomUUID()}`,
        mode: providerMode,
        status: 'failed',
        type,
        promptLength: prompt.length,
        createdAt: new Date().toISOString(),
        result: {
            generated: false,
            message: repairAttempted ?
                'The model returned an opaque image. Server background removal did not pass; try a simpler single-character prompt.' :
                'Generated sprite asset was rejected because it was not a transparent PNG. Try again with a transparent-background sprite prompt.',
            placeholder: {
                width: DEFAULT_SIZE,
                height: DEFAULT_SIZE,
                format: 'png'
            },
            transparentBackground
        },
        review: createReviewPolicy({
            type
        }),
        audit: createAuditRecord({
            generated: false,
            model,
            providerMode,
            transparentBackground,
            type
        }),
        safety: {
            checked: true,
            blocked: true,
            note: repairAttempted ?
                'The generated asset failed server-side transparent PNG repair before it could be imported.' :
                'The generated asset failed server-side transparent PNG validation before it could be imported.'
        }
    };
};

const readImageFromOpenAIResponse = async ({
    fetchImpl,
    image
}) => {
    const b64Json = image && typeof image.b64_json === 'string' ? image.b64_json.trim() : '';
    if (b64Json) {
        return {
            base64: b64Json,
            mimeType: 'image/png'
        };
    }

    const imageUrl = image && typeof image.url === 'string' ? image.url.trim() : '';
    if (!imageUrl) return null;

    const response = await fetchImpl(imageUrl);
    if (!response || !response.ok) return null;

    const mimeType = String(response.headers && response.headers.get('content-type') || 'image/png')
        .split(';')[0]
        .trim() || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
        base64: buffer.toString('base64'),
        mimeType
    };
};

const readOpenAIFormat = mimeType => {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized === 'image/jpeg') return 'jpg';
    if (normalized === 'image/webp') return 'webp';
    return 'png';
};

const createGeminiGenerateContentUrl = config => {
    const modelPath = config.model.startsWith('models/') ? config.model : `models/${config.model}`;
    return `${config.baseUrl}/${modelPath}:generateContent`;
};

const createGeminiHeaders = config => {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (config.authMode === 'bearer' || config.authMode === 'both') {
        headers.Authorization = `Bearer ${config.apiKey}`;
    }
    if (config.authMode === 'x-goog-api-key' || config.authMode === 'both') {
        headers['x-goog-api-key'] = config.apiKey;
    }
    return headers;
};

const createGeminiRequestPayload = ({
    prompt,
    type
}) => ({
    contents: [
        {
            role: 'user',
            parts: [
                {
                    text: createGeminiAssetPrompt({
                        prompt,
                        type
                    })
                }
            ]
        }
    ],
    generationConfig: {
        responseModalities: ['TEXT', 'IMAGE']
    }
});

const readImageFromGeminiResponse = providerJson => {
    const candidates = providerJson && Array.isArray(providerJson.candidates) ? providerJson.candidates : [];
    for (const candidate of candidates) {
        const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ?
            candidate.content.parts : [];
        for (const part of parts) {
            const inlineData = part && (part.inlineData || part.inline_data);
            const base64 = inlineData && typeof inlineData.data === 'string' ? inlineData.data.trim() : '';
            if (base64) {
                return {
                    base64,
                    mimeType: String(inlineData.mimeType || inlineData.mime_type || 'image/png')
                        .split(';')[0]
                        .trim() || 'image/png'
                };
            }
        }
    }
    return null;
};

const readSiliconFlowMimeType = ({
    mimeType,
    outputFormat
}) => {
    const normalized = String(mimeType || '').split(';')[0].trim().toLowerCase();
    if (normalized.startsWith('image/')) return normalized;
    const format = readSiliconFlowOutputFormat(outputFormat);
    if (format === 'jpeg') return 'image/jpeg';
    if (format === 'webp') return 'image/webp';
    return 'image/png';
};

const readImageFromSiliconFlowResponse = async ({
    fetchImpl,
    outputFormat,
    providerJson
}) => {
    const images = providerJson && Array.isArray(providerJson.images) ? providerJson.images :
        providerJson && Array.isArray(providerJson.data) ? providerJson.data : [];
    const image = images[0] || null;
    if (!image) return null;

    const b64Json = typeof image.b64_json === 'string' ? image.b64_json.trim() :
        typeof image.b64Json === 'string' ? image.b64Json.trim() :
            typeof image.base64 === 'string' ? image.base64.trim() : '';
    if (b64Json) {
        return {
            base64: b64Json,
            mimeType: readSiliconFlowMimeType({
                mimeType: image.mimeType || image.mime_type,
                outputFormat
            })
        };
    }

    const imageUrl = typeof image.url === 'string' ? image.url.trim() : '';
    if (!imageUrl || typeof fetchImpl !== 'function') return null;

    const response = await fetchImpl(imageUrl);
    if (!response || !response.ok) return null;

    const mimeType = readSiliconFlowMimeType({
        mimeType: response.headers && response.headers.get('content-type'),
        outputFormat
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
        base64: buffer.toString('base64'),
        mimeType
    };
};

const createOpenAIImageJob = async ({
    env = process.env,
    fetchImpl = globalThis.fetch,
    requestBody
}) => {
    const prompt = sanitizePrompt(requestBody.prompt || requestBody.description);
    const type = requestBody.type || 'image';
    const width = readDimension(requestBody.size && requestBody.size.width);
    const height = readDimension(requestBody.size && requestBody.size.height);
    const config = readOpenAIConfig(env);

    if (!config.apiKey) {
        return createOpenAIConfigurationJob({
            model: config.model,
            prompt,
            type
        });
    }

    if (typeof fetchImpl !== 'function') {
        return createOpenAIProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const requestPayload = {
        model: config.model,
        n: 1,
        prompt: createOpenAIAssetPrompt({
            prompt,
            type
        }),
        quality: config.quality,
        size: config.size
    };

    let providerResponse;
    try {
        providerResponse = await fetchImpl(
            `${config.baseUrl}/images/generations`,
            createProviderFetchOptions({
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestPayload)
            }, config.timeoutMs)
        );
    } catch (error) {
        return createOpenAIProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    if (!providerResponse || !providerResponse.ok) {
        return createOpenAIProviderFailureJob({
            model: config.model,
            prompt,
            statusCode: providerResponse && providerResponse.status,
            type
        });
    }

    let providerJson;
    try {
        providerJson = await providerResponse.json();
    } catch (error) {
        return createOpenAIProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const image = providerJson && Array.isArray(providerJson.data) ? providerJson.data[0] : null;
    const imageData = await readImageFromOpenAIResponse({
        fetchImpl,
        image
    });
    if (!imageData || !imageData.base64) {
        return createOpenAIProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const preparedImage = prepareTransparentPngAsset({
        imageData,
        type
    });
    if (!preparedImage.transparentValidation.passed) {
        return createTransparentPngValidationFailureJob({
            model: config.model,
            prompt,
            providerMode: PROVIDER_MODES.OPENAI_IMAGE,
            transparentBackground: preparedImage.transparentBackground,
            type
        });
    }

    const finalImageData = preparedImage.imageData;
    const transparentBackground = preparedImage.transparentBackground;
    const format = readOpenAIFormat(finalImageData.mimeType);
    return {
        id: `asset-${randomUUID()}`,
        mode: PROVIDER_MODES.OPENAI_IMAGE,
        status: 'completed',
        type,
        promptLength: prompt.length,
        createdAt: new Date().toISOString(),
        result: {
            generated: true,
            message: 'AI character draft generated by the isolated server worker. Review and edit before classroom use.',
            asset: {
                dataUri: `data:${finalImageData.mimeType};base64,${finalImageData.base64}`,
                width,
                height,
                format,
                mimeType: finalImageData.mimeType,
                aiGenerated: true,
                generatedBy: PROVIDER_MODES.OPENAI_IMAGE,
                mustEditInCostumeEditor: true,
                requiredStudentEdits: 2,
                transparentBackground
            },
            placeholder: {
                width,
                height,
                format
            }
        },
        review: createReviewPolicy({
            type
        }),
        audit: createAuditRecord({
            generated: true,
            model: config.model,
            providerMode: PROVIDER_MODES.OPENAI_IMAGE,
            transparentBackground,
            type
        }),
        safety: {
            checked: true,
            blocked: false,
            note: 'Only the minimized prompt was sent to the external image provider. The API key stayed on the server.'
        }
    };
};

const createGeminiImageJob = async ({
    env = process.env,
    fetchImpl = globalThis.fetch,
    requestBody
}) => {
    const prompt = sanitizePrompt(requestBody.prompt || requestBody.description);
    const type = requestBody.type || 'image';
    const width = readDimension(requestBody.size && requestBody.size.width);
    const height = readDimension(requestBody.size && requestBody.size.height);
    const config = readGeminiConfig(env);

    if (!config.apiKey) {
        return createGeminiConfigurationJob({
            model: config.model,
            prompt,
            type
        });
    }

    if (typeof fetchImpl !== 'function') {
        return createGeminiProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    let providerResponse;
    try {
        const url = createGeminiGenerateContentUrl(config);
        providerResponse = await fetchImpl(
            config.authMode === 'query' ? `${url}?key=${encodeURIComponent(config.apiKey)}` : url,
            createProviderFetchOptions({
                method: 'POST',
                headers: createGeminiHeaders(config),
                body: JSON.stringify(createGeminiRequestPayload({
                    prompt,
                    type
                }))
            }, config.timeoutMs)
        );
    } catch (error) {
        return createGeminiProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    if (!providerResponse || !providerResponse.ok) {
        return createGeminiProviderFailureJob({
            model: config.model,
            prompt,
            statusCode: providerResponse && providerResponse.status,
            type
        });
    }

    let providerJson;
    try {
        providerJson = await providerResponse.json();
    } catch (error) {
        return createGeminiProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const imageData = readImageFromGeminiResponse(providerJson);
    if (!imageData || !imageData.base64) {
        return createGeminiProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const preparedImage = prepareTransparentPngAsset({
        imageData,
        type
    });
    if (!preparedImage.transparentValidation.passed) {
        return createTransparentPngValidationFailureJob({
            model: config.model,
            prompt,
            providerMode: PROVIDER_MODES.GEMINI_IMAGE,
            transparentBackground: preparedImage.transparentBackground,
            type
        });
    }

    const finalImageData = preparedImage.imageData;
    const transparentBackground = preparedImage.transparentBackground;
    const format = readOpenAIFormat(finalImageData.mimeType);
    return {
        id: `asset-${randomUUID()}`,
        mode: PROVIDER_MODES.GEMINI_IMAGE,
        status: 'completed',
        type,
        promptLength: prompt.length,
        createdAt: new Date().toISOString(),
        result: {
            generated: true,
            message: 'AI character draft generated by the isolated Gemini worker. Review and edit before classroom use.',
            asset: {
                dataUri: `data:${finalImageData.mimeType};base64,${finalImageData.base64}`,
                width,
                height,
                format,
                mimeType: finalImageData.mimeType,
                aiGenerated: true,
                generatedBy: PROVIDER_MODES.GEMINI_IMAGE,
                mustEditInCostumeEditor: true,
                requiredStudentEdits: 2,
                transparentBackground
            },
            placeholder: {
                width,
                height,
                format
            }
        },
        review: createReviewPolicy({
            type
        }),
        audit: createAuditRecord({
            generated: true,
            model: config.model,
            providerMode: PROVIDER_MODES.GEMINI_IMAGE,
            transparentBackground,
            type
        }),
        safety: {
            checked: true,
            blocked: false,
            note: 'Only the minimized prompt was sent to the external Gemini provider. The API key stayed on the server.'
        }
    };
};

const createSiliconFlowImageJob = async ({
    env = process.env,
    fetchImpl = globalThis.fetch,
    requestBody
}) => {
    const prompt = sanitizePrompt(requestBody.prompt || requestBody.description);
    const type = requestBody.type || 'image';
    const width = readDimension(requestBody.size && requestBody.size.width);
    const height = readDimension(requestBody.size && requestBody.size.height);
    const config = readSiliconFlowConfig(env);

    if (!config.apiKey) {
        return createSiliconFlowConfigurationJob({
            model: config.model,
            prompt,
            type
        });
    }

    if (typeof fetchImpl !== 'function') {
        return createSiliconFlowProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const requestPayload = {
        batch_size: 1,
        guidance_scale: config.guidanceScale,
        image_size: config.imageSize,
        model: config.model,
        num_inference_steps: config.inferenceSteps,
        output_format: config.outputFormat,
        prompt: createSiliconFlowAssetPrompt({
            prompt,
            type
        })
    };

    let providerResponse;
    try {
        providerResponse = await fetchImpl(
            `${config.baseUrl}/images/generations`,
            createProviderFetchOptions({
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestPayload)
            }, config.timeoutMs)
        );
    } catch (error) {
        return createSiliconFlowProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    if (!providerResponse || !providerResponse.ok) {
        return createSiliconFlowProviderFailureJob({
            model: config.model,
            prompt,
            statusCode: providerResponse && providerResponse.status,
            type
        });
    }

    let providerJson;
    try {
        providerJson = await providerResponse.json();
    } catch (error) {
        return createSiliconFlowProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const imageData = await readImageFromSiliconFlowResponse({
        fetchImpl,
        outputFormat: config.outputFormat,
        providerJson
    });
    if (!imageData || !imageData.base64) {
        return createSiliconFlowProviderFailureJob({
            model: config.model,
            prompt,
            type
        });
    }

    const preparedImage = prepareTransparentPngAsset({
        imageData,
        type
    });
    if (!preparedImage.transparentValidation.passed) {
        return createTransparentPngValidationFailureJob({
            model: config.model,
            prompt,
            providerMode: PROVIDER_MODES.SILICONFLOW_IMAGE,
            transparentBackground: preparedImage.transparentBackground,
            type
        });
    }

    const finalImageData = preparedImage.imageData;
    const transparentBackground = preparedImage.transparentBackground;
    const format = readOpenAIFormat(finalImageData.mimeType);
    return {
        id: `asset-${randomUUID()}`,
        mode: PROVIDER_MODES.SILICONFLOW_IMAGE,
        status: 'completed',
        type,
        promptLength: prompt.length,
        createdAt: new Date().toISOString(),
        result: {
            generated: true,
            message: 'AI character draft generated by the isolated SiliconFlow worker. Review and edit before classroom use.',
            asset: {
                dataUri: `data:${finalImageData.mimeType};base64,${finalImageData.base64}`,
                width,
                height,
                format,
                mimeType: finalImageData.mimeType,
                aiGenerated: true,
                generatedBy: PROVIDER_MODES.SILICONFLOW_IMAGE,
                mustEditInCostumeEditor: true,
                requiredStudentEdits: 2,
                transparentBackground
            },
            placeholder: {
                width,
                height,
                format
            }
        },
        review: createReviewPolicy({
            type
        }),
        audit: createAuditRecord({
            generated: true,
            model: config.model,
            providerMode: PROVIDER_MODES.SILICONFLOW_IMAGE,
            transparentBackground,
            type
        }),
        safety: {
            checked: true,
            blocked: false,
            note: 'Only the minimized prompt was sent to the external SiliconFlow provider. The API key stayed on the server.'
        }
    };
};

const createImageJob = async ({
    env,
    fetchImpl,
    providerMode,
    requestBody
}) => {
    if (providerMode === PROVIDER_MODES.GEMINI_IMAGE) {
        return createGeminiImageJob({
            env,
            fetchImpl,
            requestBody
        });
    }
    if (providerMode === PROVIDER_MODES.SILICONFLOW_IMAGE) {
        return createSiliconFlowImageJob({
            env,
            fetchImpl,
            requestBody
        });
    }
    if (providerMode === PROVIDER_MODES.OPENAI_IMAGE) {
        return createOpenAIImageJob({
            env,
            fetchImpl,
            requestBody
        });
    }
    if (providerMode === PROVIDER_MODES.TEMPLATE_SVG) {
        return createTemplateImageJob(requestBody);
    }
    return createMockImageJob(requestBody);
};

const createRequestHandler = (env = process.env, {
    fetchImpl = globalThis.fetch
} = {}) => {
    const providerMode = normalizeImageProvider(env.SCRATCH_AI_IMAGE_PROVIDER);
    const openAIConfig = readOpenAIConfig(env);
    const geminiConfig = readGeminiConfig(env);
    const siliconFlowConfig = readSiliconFlowConfig(env);
    const imageModelEnabled = providerMode === PROVIDER_MODES.OPENAI_IMAGE ? Boolean(openAIConfig.apiKey) :
        providerMode === PROVIDER_MODES.GEMINI_IMAGE ? Boolean(geminiConfig.apiKey) :
            providerMode === PROVIDER_MODES.SILICONFLOW_IMAGE ? Boolean(siliconFlowConfig.apiKey) : false;
    const providerModel = providerMode === PROVIDER_MODES.OPENAI_IMAGE ? openAIConfig.model :
        providerMode === PROVIDER_MODES.GEMINI_IMAGE ? geminiConfig.model :
            providerMode === PROVIDER_MODES.SILICONFLOW_IMAGE ? siliconFlowConfig.model : '';
    const providerApiKeyConfigured = providerMode === PROVIDER_MODES.OPENAI_IMAGE ? Boolean(openAIConfig.apiKey) :
        providerMode === PROVIDER_MODES.GEMINI_IMAGE ? Boolean(geminiConfig.apiKey) :
            providerMode === PROVIDER_MODES.SILICONFLOW_IMAGE ? Boolean(siliconFlowConfig.apiKey) : false;
    const providerExternalNetwork = providerMode === PROVIDER_MODES.OPENAI_IMAGE ||
        providerMode === PROVIDER_MODES.GEMINI_IMAGE ||
        providerMode === PROVIDER_MODES.SILICONFLOW_IMAGE;

    return async (request, response) => {
        installStructuredRequestLog({
            providerMode,
            request,
            response
        });

        if (request.method === 'OPTIONS') {
            sendJson(response, 204, {});
            return;
        }

        if (request.method === 'GET' && request.url === '/healthz') {
            sendJson(response, 200, {
                service: 'scratch-ai-asset-worker',
                mode: providerMode,
                imageModelEnabled,
                imageGenerationEnabled: providerMode === PROVIDER_MODES.TEMPLATE_SVG ||
                    imageModelEnabled,
                modelWeightsDownloaded: false,
                provider: {
                    apiKeyConfigured: providerApiKeyConfigured,
                    externalNetwork: providerExternalNetwork,
                    model: providerModel
                },
                ready: true,
                manifestRoute: '/api/v1/assets/generation-manifest'
            });
            return;
        }

        if (request.method === 'GET' && request.url === '/api/v1/assets/generation-manifest') {
            sendJson(response, 200, createManifestReply(providerMode));
            return;
        }

        if (request.method === 'POST' && request.url === '/api/v1/assets/image-jobs') {
            try {
                const body = await readJsonBody(request);
                sendJson(response, 200, {
                    service: 'scratch-ai-asset-worker',
                    provider: providerMode,
                    job: await createImageJob({
                        env,
                        fetchImpl,
                        providerMode,
                        requestBody: body
                    })
                });
            } catch (error) {
                sendJson(response, 400, {
                    error: error.message
                });
            }
            return;
        }

        sendJson(response, 404, {
            error: 'Not found'
        });
    };
};

const startServer = (env = process.env) => {
    const port = parsePort(env.ASSET_WORKER_PORT);
    const providerMode = normalizeImageProvider(env.SCRATCH_AI_IMAGE_PROVIDER);
    const server = createServer(createRequestHandler(env));
    server.listen(port, '127.0.0.1', () => {
        console.log(`Scratch AI asset worker listening on http://127.0.0.1:${port}`);
        console.log(`Mode: ${providerMode}; model weights downloaded: false`);
    });
    return server;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    startServer();
}

export {
    PROVIDER_MANIFEST,
    PROVIDER_MODES,
    RESULT_AUDIT_SCHEMA,
    createGeminiImageJob,
    createManifestReply,
    createMockImageJob,
    createOpenAIImageJob,
    createRequestHandler,
    createSiliconFlowImageJob,
    createTemplateImageJob,
    normalizeImageProvider,
    parsePort,
    startServer
};
