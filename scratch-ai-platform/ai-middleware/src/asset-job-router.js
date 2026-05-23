import {redactSensitiveText} from './model-request-safety-gate.js';

const ASSET_PROMPT_LIMIT = 240;
const ASSET_STYLE_LIMIT = 80;
const ASSET_TYPES = Object.freeze([
    'image',
    'character',
    'backdrop',
    'costume',
    'prop'
]);

const ASSET_TYPE_SET = new Set(ASSET_TYPES);

const FORBIDDEN_ASSET_FIELDS = Object.freeze([
    'rawProject',
    'projectJson',
    'fullProjectJson',
    'sb3',
    'assets',
    'assetData',
    'costumes',
    'sounds',
    'variables',
    'lists',
    'comments',
    'monitors',
    'blocks',
    'targetId',
    'scriptId',
    'blockIds',
    'aiLog',
    'processLog',
    'logs',
    'apiKey',
    'providerKey',
    'token',
    'password',
    'secret'
]);

const FORBIDDEN_ASSET_FIELD_SET = new Set(
    FORBIDDEN_ASSET_FIELDS.map(field => field.toLowerCase())
);

const createAssetWorkerUrl = (baseUrl, path) => `${String(baseUrl || '').replace(/\/+$/, '')}${path}`;

const readAssetType = value => {
    const normalizedType = String(value || 'image').trim().toLowerCase();
    return ASSET_TYPE_SET.has(normalizedType) ? normalizedType : '';
};

const readDimension = value => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 480;
    return Math.min(Math.max(parsed, 64), 1024);
};

const findForbiddenAssetPaths = (value, path = [], seen = new Set()) => {
    if (!value || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);

    const paths = [];
    Object.entries(value).forEach(([key, childValue]) => {
        const childPath = path.concat(key);
        if (FORBIDDEN_ASSET_FIELD_SET.has(key.toLowerCase())) {
            paths.push(childPath.join('.'));
            return;
        }
        paths.push(...findForbiddenAssetPaths(childValue, childPath, seen));
    });
    return paths;
};

const minimizeAssetJobRequest = request => {
    const type = readAssetType(request && request.type);
    const prompt = redactSensitiveText(
        (request && (request.prompt || request.description)) || '',
        ASSET_PROMPT_LIMIT
    );

    return {
        type: type || 'image',
        prompt,
        style: redactSensitiveText(request && request.style, ASSET_STYLE_LIMIT),
        size: {
            width: readDimension(request && request.size && request.size.width),
            height: readDimension(request && request.size && request.size.height)
        },
        classroom: {
            knowledgePoint: redactSensitiveText(
                request && request.classroom && request.classroom.knowledgePoint,
                ASSET_STYLE_LIMIT
            )
        }
    };
};

const createAssetJobSafetyGate = (request = {}) => {
    const blockedReasons = findForbiddenAssetPaths(request).map(path => `forbidden-context:${path}`);
    const requestedType = readAssetType(request.type);
    const minimizedRequest = minimizeAssetJobRequest(request);

    if (request.assetConsent !== true) {
        blockedReasons.push('missing-asset-consent');
    }

    if (!requestedType) {
        blockedReasons.push('invalid-asset-type');
    }

    if (!minimizedRequest.prompt) {
        blockedReasons.push('empty-prompt');
    }

    const minimizedJson = JSON.stringify(minimizedRequest);

    return {
        allowed: blockedReasons.length === 0,
        blockedReasons,
        minimizedRequest,
        redactionApplied: minimizedJson.indexOf('[redacted-') !== -1 ||
            minimizedJson.indexOf('Bearer [redacted-token]') !== -1
    };
};

const createAssetJobSafetySummary = safetyGate => ({
    allowed: safetyGate.allowed,
    blockedReasons: safetyGate.blockedReasons,
    redactionApplied: safetyGate.redactionApplied,
    minimized: true
});

const createProxyError = (message, statusCode = 502) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const createAssetImageJobReply = async ({
    config,
    fetchImpl = globalThis.fetch,
    request,
    requestId
}) => {
    const safetyGate = createAssetJobSafetyGate(request || {});

    if (!safetyGate.allowed) {
        return {
            proxied: false,
            blocked: true,
            safetyGate: createAssetJobSafetySummary(safetyGate),
            text: 'Asset job blocked by the safety gate. Please use a short prompt and avoid project data.'
        };
    }

    const response = await fetchImpl(createAssetWorkerUrl(
        config.assetWorker.url,
        '/api/v1/assets/image-jobs'
    ), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(requestId ? {'X-Scratch-AI-Request-Id': requestId} : {})
        },
        body: JSON.stringify(safetyGate.minimizedRequest)
    }).catch(error => {
        throw createProxyError(`Asset worker unavailable: ${error.message}`);
    });

    if (!response || !response.ok) {
        throw createProxyError(`Asset worker request failed with status ${response && response.status}`);
    }

    return {
        proxied: true,
        blocked: false,
        workerRoute: '/api/v1/assets/image-jobs',
        safetyGate: createAssetJobSafetySummary(safetyGate),
        worker: await response.json()
    };
};

const createAssetGenerationManifestReply = async ({
    config,
    fetchImpl = globalThis.fetch,
    requestId
}) => {
    const response = await fetchImpl(createAssetWorkerUrl(
        config.assetWorker.url,
        '/api/v1/assets/generation-manifest'
    ), {
        method: 'GET',
        headers: {
            ...(requestId ? {'X-Scratch-AI-Request-Id': requestId} : {})
        }
    }).catch(error => {
        throw createProxyError(`Asset worker unavailable: ${error.message}`);
    });

    if (!response || !response.ok) {
        throw createProxyError(`Asset worker manifest failed with status ${response && response.status}`);
    }

    return {
        proxied: true,
        workerRoute: '/api/v1/assets/generation-manifest',
        worker: await response.json()
    };
};

export {
    ASSET_TYPES,
    FORBIDDEN_ASSET_FIELDS,
    createAssetGenerationManifestReply,
    createAssetImageJobReply,
    createAssetJobSafetyGate,
    minimizeAssetJobRequest
};
