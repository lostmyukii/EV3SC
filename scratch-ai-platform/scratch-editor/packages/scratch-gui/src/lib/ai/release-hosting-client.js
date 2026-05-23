/* eslint-disable arrow-parens */
import {normalizeMiddlewareUrl} from './socratic-chat-client.js';
import {normalizeClassSessionId} from './teacher-tools-client.js';
import {
    createReleaseAuditPreview,
    createReleaseGateSummary
} from './release-audit-client.js';
import {createTeacherRubricReviewPayload} from './teacher-rubric-review.js';
import {createQrCodeSvg} from './qr-code.js';

const RELEASE_HOSTED_PAGE_PATH = '/api/v1/release/hosted-page';
const RELEASE_HOSTED_ASSETS_SCHEMA_ID = 'scratch-ai-hosted-assets-v1';
const RELEASE_HOSTED_PROJECT_SCHEMA_ID = 'scratch-ai-hosted-project-snapshot-v1';
const RELEASE_TEACHER_REVIEW_BATCH_PATH = '/api/v1/release/teacher-review-batch';
const RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID = 'scratch-ai-teacher-review-batch-v1';
const RELEASE_TEACHER_REVIEW_PATH = '/api/v1/release/teacher-review';
const RELEASE_TEACHER_REVIEW_BATCH_LIMIT = 12;
const HOSTED_ASSET_COUNT_LIMIT = 48;
const HOSTED_ASSET_SINGLE_BYTES_LIMIT = 768 * 1024;
const HOSTED_ASSET_TOTAL_BYTES_LIMIT = 2 * 1024 * 1024;
const HOSTED_PROJECT_JSON_LIMIT = 1024 * 1024;

const readText = value => (typeof value === 'string' ? value.trim() : '');

const createReleaseHostedPageUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_HOSTED_PAGE_PATH}`
);

const createReleaseTeacherReviewUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_TEACHER_REVIEW_PATH}`
);

const createReleaseTeacherReviewBatchUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_TEACHER_REVIEW_BATCH_PATH}`
);

const serializeProjectJson = projectJson => {
    if (!projectJson) return '';
    if (typeof projectJson === 'string') return projectJson.trim();
    try {
        return JSON.stringify(projectJson);
    } catch (error) {
        return '';
    }
};

const normalizeHostedAssetFormat = value => {
    const normalized = readText(value).toLowerCase();
    return ['jpg', 'mp3', 'png', 'svg', 'wav'].indexOf(normalized) >= 0 ? normalized : '';
};

const normalizeHostedAssetId = value => {
    const normalized = readText(value).toLowerCase();
    return /^[a-f0-9]{8,64}$/.test(normalized) ? normalized : '';
};

const readAssetBytes = data => {
    if (!data) return null;
    if (data instanceof Uint8Array) return data;
    if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) return new Uint8Array(data);
    if (
        typeof ArrayBuffer !== 'undefined' &&
        data.buffer instanceof ArrayBuffer &&
        Number.isFinite(data.byteOffset) &&
        Number.isFinite(data.byteLength)
    ) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
};

const bytesToBase64 = bytes => {
    if (!bytes || !bytes.length) return '';
    if (typeof btoa === 'function') {
        const chunkSize = 0x8000;
        let binary = '';
        for (let index = 0; index < bytes.length; index += chunkSize) {
            const chunk = bytes.subarray(index, index + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }
    const bufferConstructor = globalThis && globalThis.Buffer;
    if (bufferConstructor) {
        return bufferConstructor.from(bytes).toString('base64');
    }
    return '';
};

const createHostedAssetSnapshots = snapshot => {
    const {
        assets,
        vm
    } = snapshot || {};
    const sourceAssets = Array.isArray(assets) ? assets : (vm && Array.isArray(vm.assets) ? vm.assets : []);
    const snapshots = [];
    const seen = new Set();
    let totalBytes = 0;

    sourceAssets.slice(0, HOSTED_ASSET_COUNT_LIMIT).forEach(asset => {
        const assetId = normalizeHostedAssetId(asset && asset.assetId);
        const dataFormat = normalizeHostedAssetFormat(asset && asset.dataFormat);
        const bytes = readAssetBytes(asset && asset.data);
        if (!assetId || !dataFormat || !bytes || !bytes.length) return;
        const md5ext = `${assetId}.${dataFormat}`;
        if (seen.has(md5ext)) return;
        if (bytes.length > HOSTED_ASSET_SINGLE_BYTES_LIMIT) return;
        if (totalBytes + bytes.length > HOSTED_ASSET_TOTAL_BYTES_LIMIT) return;
        const dataBase64 = bytesToBase64(bytes);
        if (!dataBase64) return;
        seen.add(md5ext);
        totalBytes += bytes.length;
        snapshots.push({
            assetId,
            assetType: asset && asset.assetType && asset.assetType.name ?
                readText(asset.assetType.name).slice(0, 40) :
                '',
            byteLength: bytes.length,
            dataBase64,
            dataFormat,
            md5ext
        });
    });

    return snapshots;
};

const createHostedProjectSnapshot = (snapshot = {}) => {
    const projectJson = snapshot && snapshot.projectJson ? snapshot.projectJson : null;
    const serializedProjectJson = serializeProjectJson(projectJson);
    const assets = createHostedAssetSnapshots(snapshot);
    if (!serializedProjectJson) {
        return {
            schemaVersion: RELEASE_HOSTED_PROJECT_SCHEMA_ID,
            assets: [],
            available: false,
            projectJson: '',
            reason: 'project-snapshot-not-available',
            safeguards: {
                rawProjectIncludedInAudit: false,
                rawProjectIncludedInModel: false,
                readOnlyPlayer: true,
                scratchProjectMutated: false,
                selfHostedAssetsIncluded: false
            }
        };
    }

    if (serializedProjectJson.length > HOSTED_PROJECT_JSON_LIMIT) {
        return {
            schemaVersion: RELEASE_HOSTED_PROJECT_SCHEMA_ID,
            assets: [],
            available: false,
            projectJson: '',
            reason: 'project-snapshot-too-large',
            safeguards: {
                rawProjectIncludedInAudit: false,
                rawProjectIncludedInModel: false,
                readOnlyPlayer: true,
                scratchProjectMutated: false,
                selfHostedAssetsIncluded: false
            }
        };
    }

    return {
        schemaVersion: RELEASE_HOSTED_PROJECT_SCHEMA_ID,
        assets,
        assetsSchemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
        available: true,
        projectJson: serializedProjectJson,
        reason: '',
        safeguards: {
            rawAssetDataIncludedInAudit: false,
            rawAssetDataIncludedInModel: false,
            rawProjectIncludedInAudit: false,
            rawProjectIncludedInModel: false,
            readOnlyPlayer: true,
            scratchProjectMutated: false,
            selfHostedAssetsIncluded: assets.length > 0
        }
    };
};

const createHostedReleasePayload = ({
    classSessionId = '',
    publicBaseUrl = '',
    projectSnapshot = null,
    releaseGate,
    releasePreview
} = {}) => ({
    classSessionId: normalizeClassSessionId(classSessionId),
    publicBaseUrl: readText(publicBaseUrl),
    projectSnapshot: createHostedProjectSnapshot(projectSnapshot),
    releaseConsent: true,
    releaseGate: createReleaseGateSummary(releaseGate),
    releasePreview: createReleaseAuditPreview(releasePreview)
});

const createTeacherReviewPayload = ({
    classSessionId = '',
    decision = 'approved',
    hostedRelease,
    notes = '',
    rubricReview,
    releaseGate,
    releasePreview
} = {}) => ({
    classSessionId: normalizeClassSessionId(classSessionId),
    decision: decision === 'approved' ? 'approved' : 'needs-revision',
    hostedReleaseId: readText(hostedRelease && hostedRelease.hostedReleaseId),
    notes: readText(notes).slice(0, 120),
    releaseConsent: true,
    releaseGate: createReleaseGateSummary(releaseGate),
    releasePreview: createReleaseAuditPreview(releasePreview),
    rubricReview: createTeacherRubricReviewPayload(rubricReview)
});

const createTeacherReviewBatchPayload = ({
    classSessionId = '',
    decision = 'approved',
    items
} = {}) => ({
    classSessionId: normalizeClassSessionId(classSessionId),
    items: (Array.isArray(items) ? items : [])
        .slice(0, RELEASE_TEACHER_REVIEW_BATCH_LIMIT)
        .map(item => ({
            decision: decision === 'approved' ? 'approved' : 'needs-revision',
            hostedReleaseId: readText(item && item.hostedReleaseId),
            notes: ''
        }))
        .filter(item => item.hostedReleaseId),
    releaseConsent: true,
    schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
    safeguards: {
        classRosterIncluded: false,
        rawProjectIncluded: false,
        studentIdentityIncluded: false,
        teacherNotesIncluded: false
    }
});

const requestHostedReleasePage = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI hosted release requests.');
    }

    const response = await fetchImpl(createReleaseHostedPageUrl(middlewareUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI hosted release request failed.');
    }

    return response.json();
};

const requestTeacherReview = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI teacher review requests.');
    }

    const response = await fetchImpl(createReleaseTeacherReviewUrl(middlewareUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI teacher review request failed.');
    }

    return response.json();
};

const requestTeacherReviewBatch = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI teacher review batch requests.');
    }

    const response = await fetchImpl(createReleaseTeacherReviewBatchUrl(middlewareUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI teacher review batch request failed.');
    }

    return response.json();
};

const createQrPreviewSvg = ({
    cellSize = 6,
    url
} = {}) => {
    const safeUrl = readText(url).slice(0, 240);
    return createQrCodeSvg({
        cellSize,
        title: 'Release QR code',
        url: safeUrl
    });
};

export {
    RELEASE_HOSTED_PAGE_PATH,
    RELEASE_HOSTED_ASSETS_SCHEMA_ID,
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
};
