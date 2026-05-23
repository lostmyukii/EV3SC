import {createHash, randomUUID} from 'node:crypto';
import {appendFile, copyFile, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {RELEASE_AUDIT_SCHEMA_ID} from './config.js';
import {redactSensitiveText} from './model-request-safety-gate.js';
import {readClassRosterStudentScope} from './teacher-tools-router.js';

const RELEASE_AUDIT_FILE = 'release-audit.jsonl';
const RELEASE_ADMIN_OPERATIONS_FILE = 'release-admin-operations.jsonl';
const RELEASE_HOSTED_PAGES_FILE = 'release-hosted-pages.jsonl';
const RELEASE_HOSTED_PROJECT_FILE = 'project.json';
const RELEASE_TEACHER_REVIEWS_FILE = 'release-teacher-reviews.jsonl';
const RELEASE_AUDIT_EXPORT_LIMIT = 100;
const RELEASE_ADMIN_OPERATION_SCHEMA_ID = 'scratch-ai-admin-operation-v1';
const RELEASE_ADMIN_SUMMARY_SCHEMA_ID = 'scratch-ai-admin-summary-v1';
const RELEASE_CLASS_SHOWCASE_SCHEMA_ID = 'scratch-ai-class-showcase-v1';
const RELEASE_HOSTED_ASSETS_SCHEMA_ID = 'scratch-ai-hosted-assets-v1';
const RELEASE_HOSTED_PAGE_SCHEMA_ID = 'scratch-ai-hosted-page-v1';
const RELEASE_HOSTED_PROJECT_SCHEMA_ID = 'scratch-ai-hosted-project-snapshot-v1';
const RELEASE_REPOSITORY_SCHEMA_ID = 'scratch-ai-release-repository-v1';
const RELEASE_RESEARCH_DATASET_SCHEMA_ID = 'scratch-ai-research-dataset-v1';
const RELEASE_RESEARCH_EXPORT_LIMIT = 100;
const RELEASE_TEACHER_RUBRIC_REVIEW_SCHEMA_ID = 'scratch-ai-teacher-rubric-review-v1';
const RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID = 'scratch-ai-teacher-review-batch-v1';
const RELEASE_TEACHER_REVIEW_SCHEMA_ID = 'scratch-ai-teacher-review-v1';
const RELEASE_TEXT_LIMIT = 360;
const RELEASE_SUMMARY_TEXT_LIMIT = 120;
const RELEASE_CLASS_SHOWCASE_LIMIT = 50;
const RELEASE_HOSTED_ASSET_COUNT_LIMIT = 48;
const RELEASE_HOSTED_ASSET_SINGLE_BYTES_LIMIT = 768 * 1024;
const RELEASE_HOSTED_ASSET_TOTAL_BYTES_LIMIT = 2 * 1024 * 1024;
const RELEASE_HOSTED_PROJECT_JSON_LIMIT = 1024 * 1024;
const RELEASE_LOGIC_FLOW_LIMIT = 5;
const RELEASE_TEACHER_RUBRIC_SCORE_LIMIT = 6;
const RELEASE_TEACHER_REVIEW_BATCH_LIMIT = 12;
const RELEASE_TEACHER_RUBRIC_LEVEL_MAX = 3;
const RELEASE_DEFAULT_CLASS_SESSION_ID = 'default-class-session';
const RELEASE_DEFAULT_STUDENT_SCOPE_ID = 'anonymous-student';
const RELEASE_CLASS_SESSION_ID_LIMIT = 80;
const RELEASE_STUDENT_SCOPE_ID_LIMIT = 80;
const RELEASE_RESEARCH_FIELDS = Object.freeze([
    'rowId',
    'releaseStatus',
    'releaseVersion',
    'spriteCount',
    'startCount',
    'blockCount',
    'checkScore',
    'checkMaxScore',
    'logicFlowCount',
    'aiQuestions',
    'aiReplies',
    'aiBlocked',
    'processTotalEntries',
    'modelQuestions',
    'modelReplies',
    'modelBlocks',
    'assetRequests',
    'assetReplies',
    'assetBlocks',
    'assetImports',
    'assetVisualEdits',
    'assetAdoptions',
    'teacherDrafts',
    'releaseExports',
    'assetPresent',
    'assetGenerated',
    'assetAiGeneratedLabel',
    'assetHumanReviewRequired',
    'assetCostumeEditorEditsRequired',
    'assetImportedToCostumeEditor',
    'assetVisualEditCount',
    'assetAdopted',
    'assetProviderKind',
    'assetLicenseKind',
    'assetReviewKind',
    'releaseGateAllowed',
    'releaseGateBlockCount',
    'pureSb3Ok',
    'classScopeHash',
    'studentScopeHash',
    'scopeGranularity'
]);

const RELEASE_TEACHER_REVIEW_DECISIONS = new Set([
    'approved',
    'needs-revision'
]);

const RELEASE_HOSTED_ASSET_CONTENT_TYPES = Object.freeze({
    jpg: 'image/jpeg',
    mp3: 'audio/mpeg',
    png: 'image/png',
    svg: 'image/svg+xml; charset=utf-8',
    wav: 'audio/wav'
});

const RELEASE_AUDIT_SCHEMA = Object.freeze({
    id: RELEASE_AUDIT_SCHEMA_ID,
    storage: 'append-only-jsonl',
    requiredFields: [
        'auditId',
        'createdAt',
        'classSession',
        'studentScope',
        'releasePreview',
        'processSummary',
        'assetSummary',
        'releaseGate',
        'metaAiDraft'
    ],
    forbiddenFields: [
        'rawProject',
        'projectJson',
        'fullProjectJson',
        'sb3',
        'assets',
        'assetData',
        'dataUri',
        'costumes',
        'sounds',
        'variables',
        'lists',
        'comments',
        'monitors',
        'targets',
        'targetId',
        'targetName',
        'scriptId',
        'blockIds',
        'aiLog',
        'processLog',
        'logs',
        'html',
        'apiKey',
        'providerKey',
        'token',
        'password',
        'secret',
        'studentName',
        'studentId',
        'studentEmail',
        'studentPhone',
        'classId',
        'roster'
    ],
    retention: {
        default: 'server-local-jsonl-30-days',
        recommendation: 'Move to a scoped database with backup, retention, and deletion policy before classroom rollout.'
    },
    pureSb3Rule: 'The audit route stores a server-side companion record only; it does not mutate project.json or SB3 exports.'
});

const RELEASE_STATUS_SET = new Set(['drafting', 'ready']);

const RELEASE_REPOSITORY_RECORDS = Object.freeze({
    audit: {
        file: RELEASE_AUDIT_FILE,
        notConfiguredReason: 'release-audit-dir-not-configured',
        schemaVersion: RELEASE_AUDIT_SCHEMA_ID
    },
    adminOperations: {
        file: RELEASE_ADMIN_OPERATIONS_FILE,
        notConfiguredReason: 'release-audit-dir-not-configured',
        schemaVersion: RELEASE_ADMIN_OPERATION_SCHEMA_ID
    },
    hostedPages: {
        file: RELEASE_HOSTED_PAGES_FILE,
        notConfiguredReason: 'release-hosting-dir-not-configured',
        schemaVersion: RELEASE_HOSTED_PAGE_SCHEMA_ID
    },
    teacherReviews: {
        file: RELEASE_TEACHER_REVIEWS_FILE,
        notConfiguredReason: 'release-audit-dir-not-configured',
        schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID
    }
});

const FORBIDDEN_RELEASE_FIELD_SET = new Set(
    RELEASE_AUDIT_SCHEMA.forbiddenFields.map(field => field.toLowerCase())
);

const readArray = value => (Array.isArray(value) ? value : []);

const readNumber = value => (Number.isFinite(value) ? value : 0);

const readBoolean = value => value === true;

const sumNumbers = (values, field) => values.reduce((total, value) => total + readNumber(value && value[field]), 0);

const averageNumber = (values, field) => {
    if (!values.length) return 0;
    return Number((sumNumbers(values, field) / values.length).toFixed(2));
};

const readStatus = value => {
    const status = String(value || '').trim().toLowerCase();
    return RELEASE_STATUS_SET.has(status) ? status : 'drafting';
};

const readText = (value, limit = RELEASE_TEXT_LIMIT) => redactSensitiveText(value, limit);

const normalizeOptionalClassSessionId = value => readText(value, RELEASE_CLASS_SESSION_ID_LIMIT)
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const readClassSessionId = value => normalizeOptionalClassSessionId(value) || RELEASE_DEFAULT_CLASS_SESSION_ID;

const createClassSessionScope = value => ({
    id: readClassSessionId(value),
    scoped: true
});

const normalizeOptionalStudentScopeId = value => readText(value, RELEASE_STUDENT_SCOPE_ID_LIMIT)
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const readStudentScopeId = value => normalizeOptionalStudentScopeId(value) || RELEASE_DEFAULT_STUDENT_SCOPE_ID;

const createStudentScope = ({
    classSessionId,
    rosterConfigured = false,
    rosterVerified = false,
    studentScopeId
} = {}) => ({
    classSessionId: readClassSessionId(classSessionId),
    id: readStudentScopeId(studentScopeId),
    rosterConfigured: Boolean(rosterConfigured),
    rosterVerified: Boolean(rosterVerified),
    scoped: true
});

const readRequestStudentScopeId = request => readStudentScopeId(
    request && request.studentScope && request.studentScope.id ?
        request.studentScope.id :
        request && (request.studentScopeId || request.studentScopedId)
);

const readReleaseRecordStudentScopeId = record => readStudentScopeId(
    record && record.studentScope && record.studentScope.id ?
        record.studentScope.id :
        record && (record.studentScopeId || record.studentScopedId)
);

const hashScopeValue = value => createHash('sha256')
    .update(String(value || ''))
    .digest('base64url')
    .slice(0, 16);

const readResearchKind = (value, allowedKinds, fallback = 'unknown') => {
    const normalizedValue = String(value || '').trim().toLowerCase();
    if (!normalizedValue) return fallback;
    return allowedKinds.has(normalizedValue) ? normalizedValue : 'other';
};

const readProviderKind = value => readResearchKind(value, new Set([
    'template-svg',
    'mock',
    'moonshot',
    'local'
]), 'none');

const readLicenseKind = value => readResearchKind(value, new Set([
    'internal-template',
    'open-license',
    'needs-review',
    'unknown'
]));

const readReviewKind = value => readResearchKind(value, new Set([
    'pending-human-review',
    'human-reviewed',
    'blocked',
    'not-required',
    'unknown'
]));

const readResearchReleaseVersion = value => {
    const normalizedValue = String(value || '').trim();
    return /^\d+(?:\.\d+){0,2}$/.test(normalizedValue) ? normalizedValue : 'other';
};

const createAuditFilePath = auditDir => resolve(String(auditDir || '').trim(), RELEASE_AUDIT_FILE);

const createHostedPagesDirPath = auditDir => resolve(String(auditDir || '').trim(), 'hosted-pages');

const createReleaseRepository = auditDir => {
    const normalizedDir = String(auditDir || '').trim();
    const resolvedDir = normalizedDir ? resolve(normalizedDir) : '';
    const readRecordConfig = kind => {
        const recordConfig = RELEASE_REPOSITORY_RECORDS[kind];
        if (!recordConfig) {
            throw new Error(`Unknown release repository record kind: ${kind}`);
        }
        return recordConfig;
    };
    const createRecordFilePath = kind => resolve(resolvedDir, readRecordConfig(kind).file);

    const appendRecord = async (kind, record) => {
        const recordConfig = readRecordConfig(kind);
        if (!resolvedDir) {
            return {
                file: recordConfig.file,
                persisted: false,
                reason: recordConfig.notConfiguredReason,
                storage: RELEASE_AUDIT_SCHEMA.storage
            };
        }

        await mkdir(resolvedDir, {
            recursive: true,
            mode: 0o700
        });
        await appendFile(
            createRecordFilePath(kind),
            `${JSON.stringify(record)}\n`,
            {
                mode: 0o600
            }
        );

        return {
            file: recordConfig.file,
            persisted: true,
            storage: RELEASE_AUDIT_SCHEMA.storage
        };
    };

    const readRecords = async kind => {
        if (!resolvedDir) return [];

        try {
            const recordsText = await readFile(createRecordFilePath(kind), 'utf8');
            return recordsText.split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => JSON.parse(line));
        } catch (error) {
            if (error && error.code === 'ENOENT') return [];
            throw error;
        }
    };

    const readFileStats = async kind => {
        const recordConfig = readRecordConfig(kind);
        if (!resolvedDir) {
            return {
                bytes: 0,
                exists: false,
                file: recordConfig.file,
                records: 0,
                schemaVersion: recordConfig.schemaVersion
            };
        }

        try {
            const [fileStat, records] = await Promise.all([
                stat(createRecordFilePath(kind)),
                readRecords(kind)
            ]);
            return {
                bytes: fileStat.size,
                exists: true,
                file: recordConfig.file,
                records: records.length,
                schemaVersion: recordConfig.schemaVersion
            };
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                return {
                    bytes: 0,
                    exists: false,
                    file: recordConfig.file,
                    records: 0,
                    schemaVersion: recordConfig.schemaVersion
                };
            }
            throw error;
        }
    };

    const readHostedReleaseHtml = async hostedReleaseId => {
        const normalizedHostedReleaseId = normalizeHostedReleaseId(hostedReleaseId);
        if (!resolvedDir || !normalizedHostedReleaseId) {
            return null;
        }

        try {
            return await readFile(
                resolve(createHostedPagesDirPath(resolvedDir), normalizedHostedReleaseId, 'index.html'),
                'utf8'
            );
        } catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw error;
        }
    };

    const readHostedReleaseProjectJson = async hostedReleaseId => {
        const normalizedHostedReleaseId = normalizeHostedReleaseId(hostedReleaseId);
        if (!resolvedDir || !normalizedHostedReleaseId) {
            return null;
        }

        try {
            const projectJson = await readFile(
                resolve(createHostedPagesDirPath(resolvedDir), normalizedHostedReleaseId, RELEASE_HOSTED_PROJECT_FILE),
                'utf8'
            );
            return JSON.parse(projectJson);
        } catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw error;
        }
    };

    const readHostedReleaseAsset = async ({
        assetFilename,
        hostedReleaseId
    }) => {
        const normalizedHostedReleaseId = normalizeHostedReleaseId(hostedReleaseId);
        const normalizedAssetFilename = normalizeHostedAssetFilename(assetFilename);
        if (!resolvedDir || !normalizedHostedReleaseId || !normalizedAssetFilename) {
            return null;
        }

        try {
            const data = await readFile(
                resolve(createHostedPagesDirPath(resolvedDir), normalizedHostedReleaseId, 'assets', normalizedAssetFilename)
            );
            return {
                contentType: readHostedAssetContentType(normalizedAssetFilename),
                data,
                filename: normalizedAssetFilename
            };
        } catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw error;
        }
    };

    const writeHostedReleasePage = async ({
        assetFiles = [],
        projectJson,
        record
    }) => {
        const recordConfig = readRecordConfig('hostedPages');
        if (!resolvedDir) {
            return {
                file: recordConfig.file,
                persisted: false,
                reason: recordConfig.notConfiguredReason,
                storage: RELEASE_AUDIT_SCHEMA.storage
            };
        }

        const hostedPagesDir = createHostedPagesDirPath(resolvedDir);
        const hostedReleaseDir = resolve(hostedPagesDir, record.hostedReleaseId);
        await mkdir(hostedReleaseDir, {
            recursive: true,
            mode: 0o700
        });
        await writeFile(resolve(hostedReleaseDir, 'index.html'), createHostedReleaseHtml(record), {
            mode: 0o600
        });
        if (projectJson) {
            await writeFile(resolve(hostedReleaseDir, RELEASE_HOSTED_PROJECT_FILE), projectJson, {
                mode: 0o600
            });
        }
        if (assetFiles.length) {
            const hostedAssetsDir = resolve(hostedReleaseDir, 'assets');
            await mkdir(hostedAssetsDir, {
                recursive: true,
                mode: 0o700
            });
            await Promise.all(assetFiles.map(assetFile => writeFile(
                resolve(hostedAssetsDir, assetFile.filename),
                assetFile.data,
                {
                    mode: 0o600
                }
            )));
        }
        return appendRecord('hostedPages', record);
    };

    return {
        appendRecord,
        configured: Boolean(resolvedDir),
        pathRedacted: true,
        readFileStats,
        readHostedReleaseAsset,
        readHostedReleaseHtml,
        readHostedReleaseProjectJson,
        readRecords,
        records: RELEASE_REPOSITORY_RECORDS,
        schemaVersion: RELEASE_REPOSITORY_SCHEMA_ID,
        storage: RELEASE_AUDIT_SCHEMA.storage,
        writeHostedReleasePage
    };
};

const normalizeHostedReleaseId = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[a-z0-9-]{8,80}$/.test(normalized) ? normalized : '';
};

const normalizeHostedAssetFormat = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(RELEASE_HOSTED_ASSET_CONTENT_TYPES, normalized) ? normalized : '';
};

const normalizeHostedAssetId = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[a-f0-9]{8,64}$/.test(normalized) ? normalized : '';
};

const normalizeHostedAssetFilename = value => {
    const normalized = String(value || '').trim().toLowerCase();
    const match = normalized.match(/^([a-f0-9]{8,64})\.([a-z0-9]{2,8})$/);
    if (!match) return '';
    const assetId = normalizeHostedAssetId(match[1]);
    const dataFormat = normalizeHostedAssetFormat(match[2]);
    return assetId && dataFormat ? `${assetId}.${dataFormat}` : '';
};

const readHostedAssetContentType = assetFilename => {
    const dataFormat = normalizeHostedAssetFormat(String(assetFilename || '').split('.').pop());
    return RELEASE_HOSTED_ASSET_CONTENT_TYPES[dataFormat] || 'application/octet-stream';
};

const normalizePublicBaseUrl = value => String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .slice(0, RELEASE_SUMMARY_TEXT_LIMIT);

const createHostedReleasePath = hostedReleaseId => `/api/v1/release/hosted-pages/${hostedReleaseId}`;

const createHostedProjectPath = hostedReleaseId => `/api/v1/release/player-projects/${hostedReleaseId}`;

const createHostedAssetHostPath = hostedReleaseId => `/api/v1/release/player-assets/${hostedReleaseId}`;

const createClassShowcasePath = () => '/api/v1/release/class-showcase-page';

const createHostedPlayerPath = ({
    assetHost = '',
    hostedReleaseId
}) => {
    const assetHostQuery = assetHost ? `&asset_host=${encodeURIComponent(assetHost)}` : '';
    return `/player.html?read_only=1&project_host=${encodeURIComponent('/api/v1/release/player-projects')}` +
        `${assetHostQuery}#${encodeURIComponent(hostedReleaseId)}`;
};

const escapeHtml = value => String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createHostedReleaseHtml = record => {
    const preview = record && record.releasePreview ? record.releasePreview : {};
    const metrics = preview.metrics || {};
    const aiSummary = preview.aiSummary || {};
    const logicFlows = readArray(preview.logicFlows);
    const player = record && record.player ? record.player : {};
    const logicHtml = logicFlows.length ? `
      <ol>
${logicFlows.map(flow => `        <li>${escapeHtml(flow.targetLabel)} script ${escapeHtml(flow.scriptIndex)}: ${escapeHtml(flow.triggerLabel)}, ${escapeHtml(flow.blockCount)} blocks.</li>`).join('\n')}
      </ol>` : '      <p class="empty">No started script was captured yet.</p>';
    const playerHtml = player.projectAvailable ? `
    <section>
      <h2>Project player</h2>
      <div class="player-frame">
        <iframe
          title="Read-only Scratch project player"
          src="${escapeHtml(player.playerPath)}"
          loading="lazy"
          allow="autoplay"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
      <p class="empty">Read-only project snapshot. Audit records store player metadata only.</p>
    </section>` : `
    <section>
      <h2>Project player</h2>
      <p class="empty">Project player snapshot was not attached.</p>
    </section>`;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(preview.productLine || 'Scratch AI release')}</title>
  <style>
    body{margin:0;background:#f7f9fc;color:#172033;font-family:Arial,"Helvetica Neue",sans-serif;line-height:1.45}
    main{width:min(860px,calc(100% - 32px));margin:0 auto;padding:32px 0}
    header,section{margin-bottom:14px;padding:18px;border:1px solid #d8e0ec;border-radius:8px;background:#fff}
    h1{margin:8px 0 0;font-size:26px;line-height:1.2}
    h2{margin:0 0 8px;font-size:17px}
    iframe{display:block;width:100%;height:100%;border:0;background:#fff}
    .status{display:inline-block;padding:4px 10px;border-radius:999px;background:#e8f6ef;color:#0b7d53;font-size:13px;font-weight:700}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .metric{padding:12px;border-radius:8px;background:#f7f9fc;text-align:center}
    .metric strong{display:block;color:#0b72d9;font-size:21px}
    .label,.metric span,.empty{color:#5d6f91;font-size:13px;font-weight:700}
    .player-frame{aspect-ratio:4/3;overflow:hidden;border:1px solid #d8e0ec;border-radius:8px;background:#fff}
    .text,li{overflow-wrap:anywhere;white-space:pre-wrap}
  </style>
</head>
<body>
  <main>
    <header>
      <span class="status">${escapeHtml(preview.status === 'ready' ? 'Ready to show' : 'Draft')}</span>
      <h1>${escapeHtml(preview.productLine || 'Scratch AI release')}</h1>
      <p class="label">Version ${escapeHtml(preview.version || '1.1')}</p>
    </header>
    <section><div class="label">What I made</div><p class="text">${escapeHtml(preview.productLine)}</p></section>
    <section><div class="label">What users said</div><p class="text">${escapeHtml(preview.userFeedback)}</p></section>
    <section><div class="label">Next step</div><p class="text">${escapeHtml(preview.iterationPlan)}</p></section>
    <section>
      <h2>Project snapshot</h2>
      <div class="grid">
        <div class="metric"><strong>${escapeHtml(metrics.sprites || 0)}</strong><span>sprites</span></div>
        <div class="metric"><strong>${escapeHtml(metrics.starts || 0)}</strong><span>starts</span></div>
        <div class="metric"><strong>${escapeHtml(metrics.blocks || 0)}</strong><span>blocks</span></div>
        <div class="metric"><strong>${escapeHtml(`${metrics.checkScore || 0}/${metrics.checkMaxScore || 0}`)}</strong><span>check</span></div>
      </div>
    </section>
    <section>
      <h2>Program paths</h2>
${logicHtml}
    </section>
${playerHtml}
    <section>
      <h2>AI help</h2>
      <p class="text">${escapeHtml(aiSummary.questions || 0)} questions / ${escapeHtml(aiSummary.replies || 0)} hints / ${escapeHtml(aiSummary.blocked || 0)} safety stops</p>
    </section>
    <section>
      <h2>Safeguards</h2>
      <p class="text">Hosted summary only. rawProjectIncluded=false; studentIdentityIncluded=false; studentScoped=true; scratchProjectMutated=false</p>
    </section>
  </main>
</body>
</html>`;
};

const createLatestTeacherReviewMap = teacherReviews => {
    const reviewsByHostedReleaseId = new Map();
    readArray(teacherReviews).forEach(review => {
        const hostedReleaseId = normalizeHostedReleaseId(review && review.hostedReleaseId);
        if (!hostedReleaseId) return;
        const existingReview = reviewsByHostedReleaseId.get(hostedReleaseId);
        const reviewTime = Date.parse(review && review.createdAt);
        const existingTime = Date.parse(existingReview && existingReview.createdAt);
        if (!existingReview || (Number.isFinite(reviewTime) && reviewTime >= existingTime)) {
            reviewsByHostedReleaseId.set(hostedReleaseId, review);
        }
    });
    return reviewsByHostedReleaseId;
};

const createShowcaseReviewSummary = review => {
    if (!review) {
        return {
            decision: 'pending',
            reviewedAt: '',
            status: 'pending'
        };
    }

    const decision = readTeacherReviewDecision(review.decision);
    return {
        decision,
        reviewedAt: readText(review.createdAt, RELEASE_SUMMARY_TEXT_LIMIT),
        status: decision === 'approved' ? 'approved' : 'needs-revision'
    };
};

const readReleaseRecordClassSessionId = record => readClassSessionId(
    record && record.classSession && record.classSession.id ?
        record.classSession.id :
        record && record.classSessionId
);

const readReleaseRecordStudentScope = record => createStudentScope({
    classSessionId: readReleaseRecordClassSessionId(record),
    rosterConfigured: record && record.studentScope && record.studentScope.rosterConfigured,
    rosterVerified: record && record.studentScope && record.studentScope.rosterVerified,
    studentScopeId: readReleaseRecordStudentScopeId(record)
});

const createClassShowcaseRelease = ({
    hostedRelease,
    review
}) => {
    const hostedReleaseId = normalizeHostedReleaseId(hostedRelease && hostedRelease.hostedReleaseId);
    const preview = hostedRelease && hostedRelease.releasePreview ? hostedRelease.releasePreview : {};
    const metrics = preview.metrics || {};
    const player = hostedRelease && hostedRelease.player ? hostedRelease.player : {};
    const publicInfo = hostedRelease && hostedRelease.public ? hostedRelease.public : {};

    return {
        hostedReleaseId,
        createdAt: readText(hostedRelease && hostedRelease.createdAt, RELEASE_SUMMARY_TEXT_LIMIT),
        classSession: createClassSessionScope(readReleaseRecordClassSessionId(hostedRelease)),
        studentScope: readReleaseRecordStudentScope(hostedRelease),
        hostedPath: readText(publicInfo.hostedPath || createHostedReleasePath(hostedReleaseId), RELEASE_SUMMARY_TEXT_LIMIT),
        publicUrl: readText(publicInfo.publicUrl || publicInfo.hostedPath || createHostedReleasePath(hostedReleaseId)),
        release: {
            status: readStatus(preview.status),
            title: readText(preview.productLine, RELEASE_SUMMARY_TEXT_LIMIT) || 'Scratch AI release',
            version: readText(preview.version, RELEASE_SUMMARY_TEXT_LIMIT) || '1.1'
        },
        metrics: minimizeMetrics(metrics),
        player: {
            assetCount: player.assets && readNumber(player.assets.assetCount),
            assetSelfHosted: player.assets && player.assets.selfHosted === true,
            projectAvailable: readBoolean(player.projectAvailable),
            readOnly: player.readOnly !== false
        },
        teacherReview: createShowcaseReviewSummary(review),
        safeguards: {
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            rawProjectIncludedInAudit: false,
            rawProjectIncludedInModel: false,
            studentIdentityIncluded: false,
            studentScoped: true,
            teacherNotesIncluded: false
        }
    };
};

const sortShowcaseReleases = releases => releases.slice().sort((left, right) => {
    const rightTime = Date.parse(right && right.createdAt);
    const leftTime = Date.parse(left && left.createdAt);
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
});

const createReleaseClassShowcaseReply = async ({
    classSessionId,
    studentScopeId,
    config
}) => {
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    const [
        hostedPages,
        teacherReviews,
        hostedPagesStats,
        teacherReviewsStats
    ] = await Promise.all([
        repository.readRecords('hostedPages'),
        repository.readRecords('teacherReviews'),
        repository.readFileStats('hostedPages'),
        repository.readFileStats('teacherReviews')
    ]);
    const requestedClassSessionId = normalizeOptionalClassSessionId(classSessionId);
    const requestedStudentScopeId = normalizeOptionalStudentScopeId(studentScopeId);
    const scopedHostedPages = requestedClassSessionId ?
        hostedPages.filter(hostedRelease => readReleaseRecordClassSessionId(hostedRelease) === requestedClassSessionId) :
        hostedPages;
    const studentScopedHostedPages = requestedStudentScopeId ?
        scopedHostedPages.filter(hostedRelease => readReleaseRecordStudentScopeId(hostedRelease) === requestedStudentScopeId) :
        scopedHostedPages;
    const scopedTeacherReviewsByClass = requestedClassSessionId ?
        teacherReviews.filter(review => readReleaseRecordClassSessionId(review) === requestedClassSessionId) :
        teacherReviews;
    const scopedTeacherReviews = requestedStudentScopeId ?
        scopedTeacherReviewsByClass.filter(review => readReleaseRecordStudentScopeId(review) === requestedStudentScopeId) :
        scopedTeacherReviewsByClass;
    const teacherReviewMap = createLatestTeacherReviewMap(scopedTeacherReviews);
    const releases = sortShowcaseReleases(studentScopedHostedPages)
        .slice(0, RELEASE_CLASS_SHOWCASE_LIMIT)
        .map(hostedRelease => createClassShowcaseRelease({
            hostedRelease,
            review: teacherReviewMap.get(normalizeHostedReleaseId(hostedRelease && hostedRelease.hostedReleaseId))
        }));

    return {
        schemaVersion: RELEASE_CLASS_SHOWCASE_SCHEMA_ID,
        configured: repository.configured,
        generatedAt: new Date().toISOString(),
        releases,
        scope: {
            classSessionId: requestedClassSessionId,
            classSessionScoped: true,
            filterApplied: Boolean(requestedClassSessionId || requestedStudentScopeId),
            studentScopeId: requestedStudentScopeId,
            studentScoped: true
        },
        repository: {
            schemaVersion: repository.schemaVersion,
            storage: 'jsonl',
            pathRedacted: true
        },
        routes: {
            html: createClassShowcasePath(),
            hostedPage: '/api/v1/release/hosted-pages/:hostedReleaseId',
            playerAsset: '/api/v1/release/player-assets/:hostedReleaseId/internalapi/asset/:asset/get/',
            playerProject: '/api/v1/release/player-projects/:hostedReleaseId',
            teacherReviewBatch: '/api/v1/release/teacher-review-batch',
            teacherReview: '/api/v1/release/teacher-review'
        },
        totals: {
            approved: releases.filter(release => release.teacherReview.status === 'approved').length,
            hostedPages: hostedPagesStats.records,
            needsRevision: releases.filter(release => release.teacherReview.status === 'needs-revision').length,
            pending: releases.filter(release => release.teacherReview.status === 'pending').length,
            scopedHostedPages: scopedHostedPages.length,
            scopedStudentHostedPages: studentScopedHostedPages.length,
            showcased: releases.length,
            teacherReviews: teacherReviewsStats.records
        },
        safeguards: {
            adminTokenIncluded: false,
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            rawProjectIncludedInAudit: false,
            rawProjectIncludedInModel: false,
            studentIdentityIncluded: false,
            studentScoped: true,
            teacherNotesIncluded: false
        }
    };
};

const createClassShowcaseReleaseHtml = release => `
      <article class="release-card">
        <div class="release-topline">
          <span class="review ${escapeHtml(release.teacherReview.status)}">${escapeHtml(release.teacherReview.status)}</span>
          <span class="release-id">${escapeHtml(release.hostedReleaseId)}</span>
        </div>
        <h2>${escapeHtml(release.release.title)}</h2>
        <p class="meta">Version ${escapeHtml(release.release.version)} · ${escapeHtml(release.release.status)}</p>
        <div class="grid">
          <div class="metric"><strong>${escapeHtml(release.metrics.sprites)}</strong><span>sprites</span></div>
          <div class="metric"><strong>${escapeHtml(release.metrics.starts)}</strong><span>starts</span></div>
          <div class="metric"><strong>${escapeHtml(release.metrics.blocks)}</strong><span>blocks</span></div>
          <div class="metric"><strong>${escapeHtml(`${release.metrics.checkScore}/${release.metrics.checkMaxScore}`)}</strong><span>check</span></div>
        </div>
        <a class="open-link" href="${escapeHtml(release.publicUrl || release.hostedPath)}">Open read-only release</a>
      </article>`;

const createReleaseClassShowcaseHtml = async ({
    classSessionId,
    studentScopeId,
    config
}) => {
    const showcase = await createReleaseClassShowcaseReply({
        classSessionId,
        studentScopeId,
        config
    });
    const releaseHtml = showcase.releases.length ?
        showcase.releases.map(createClassShowcaseReleaseHtml).join('\n') :
        '      <p class="empty">No hosted releases are ready for the class showcase yet.</p>';

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scratch AI class showcase</title>
  <style>
    body{margin:0;background:#f7f9fc;color:#172033;font-family:Arial,"Helvetica Neue",sans-serif;line-height:1.45}
    main{width:min(980px,calc(100% - 32px));margin:0 auto;padding:32px 0}
    header{margin-bottom:16px}
    h1{margin:0;font-size:28px;line-height:1.15}
    h2{margin:10px 0 4px;font-size:19px}
    .summary{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
    .pill,.review{display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:700}
    .pill{background:#eaf1fb;color:#31506f}
    .review{background:#eef2f7;color:#42526e}
    .review.approved{background:#e8f6ef;color:#0b7d53}
    .review.needs-revision{background:#fff2d8;color:#8a5a00}
    .review.pending{background:#eef2f7;color:#42526e}
    .release-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
    .release-card{padding:18px;border:1px solid #d8e0ec;border-radius:8px;background:#fff}
    .release-topline{display:flex;gap:8px;align-items:center;justify-content:space-between}
    .release-id,.meta,.empty,.safeguards{color:#5d6f91;font-size:13px;font-weight:700;overflow-wrap:anywhere}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}
    .metric{padding:10px;border-radius:8px;background:#f7f9fc;text-align:center}
    .metric strong{display:block;color:#0b72d9;font-size:19px}
    .metric span{color:#5d6f91;font-size:12px;font-weight:700}
    .open-link{display:inline-block;color:#0b72d9;font-weight:700;text-decoration:none}
    .open-link:focus,.open-link:hover{text-decoration:underline}
    .safeguards{margin-top:18px}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Scratch AI class showcase</h1>
      <div class="summary">
        <span class="pill">${escapeHtml(showcase.totals.showcased)} hosted releases</span>
        <span class="pill">${escapeHtml(showcase.totals.approved)} approved</span>
        <span class="pill">${escapeHtml(showcase.totals.needsRevision)} needs revision</span>
        <span class="pill">${escapeHtml(showcase.totals.pending)} pending</span>
      </div>
    </header>
    <section class="release-list">
${releaseHtml}
    </section>
    <p class="safeguards">classRosterIncluded=false; studentIdentityIncluded=false; studentScoped=true; rawProjectIncluded=false; teacherNotesIncluded=false</p>
  </main>
</body>
</html>`;
};

const hasAuditAdminAccess = ({
    config,
    requestHeaders
}) => {
    const configuredToken = config && config.releaseAudit && config.releaseAudit.adminToken;
    if (!configuredToken) return false;
    const providedToken = requestHeaders && (
        requestHeaders['x-scratch-ai-audit-admin-token'] ||
        requestHeaders['X-Scratch-AI-Audit-Admin-Token']
    );
    return providedToken === configuredToken;
};

const createAdminLockedReply = action => ({
    blocked: true,
    persisted: false,
    action,
    reason: 'release-audit-admin-token-required',
    text: 'Release audit management is locked. Configure and send the server-side admin token.'
});

const readAuditRecords = async auditDir => {
    const repository = createReleaseRepository(auditDir);
    return repository.readRecords('audit');
};

const readAuditFileStats = async auditDir => {
    const repository = createReleaseRepository(auditDir);
    return repository.readFileStats('audit');
};

const readAdminOperationFileStats = async auditDir => {
    const repository = createReleaseRepository(auditDir);
    return repository.readFileStats('adminOperations');
};

const readCreatedAtMs = record => {
    const value = Date.parse(record && record.createdAt);
    return Number.isFinite(value) ? value : 0;
};

const createAuditRetentionPlan = ({
    now = new Date(),
    records,
    retentionDays
}) => {
    const safeRetentionDays = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 30;
    const cutoffMs = now.getTime() - (safeRetentionDays * 24 * 60 * 60 * 1000);
    const staleRecords = records.filter(record => readCreatedAtMs(record) > 0 && readCreatedAtMs(record) < cutoffMs);

    return {
        dryRun: true,
        retentionDays: safeRetentionDays,
        totalRecords: records.length,
        wouldDeleteCount: staleRecords.length,
        keepCount: records.length - staleRecords.length,
        cutoff: new Date(cutoffMs).toISOString(),
        actualDeletionSupported: false,
        requiresAdminTokenForApply: true
    };
};

const createAnonymousResearchRows = records => readArray(records).map((record, index) => {
    const releasePreview = record && record.releasePreview ? record.releasePreview : {};
    const metrics = releasePreview && releasePreview.metrics ? releasePreview.metrics : {};
    const aiSummary = releasePreview && releasePreview.aiSummary ? releasePreview.aiSummary : {};
    const processSummary = record && record.processSummary ? record.processSummary : {};
    const assetSummary = record && record.assetSummary ? record.assetSummary : {};
    const releaseGate = record && record.releaseGate ? record.releaseGate : {};
    const pureSb3 = record && record.pureSb3 ? record.pureSb3 : {};
    const classSessionId = readReleaseRecordClassSessionId(record);
    const studentScopeId = readReleaseRecordStudentScopeId(record);

    return {
        rowId: `research-row-${String(index + 1).padStart(4, '0')}`,
        releaseStatus: readStatus(releasePreview.status),
        releaseVersion: readResearchReleaseVersion(releasePreview.version),
        spriteCount: readNumber(metrics.sprites),
        startCount: readNumber(metrics.starts),
        blockCount: readNumber(metrics.blocks),
        checkScore: readNumber(metrics.checkScore),
        checkMaxScore: readNumber(metrics.checkMaxScore),
        logicFlowCount: readArray(releasePreview.logicFlows).length,
        aiQuestions: readNumber(aiSummary.questions),
        aiReplies: readNumber(aiSummary.replies),
        aiBlocked: readNumber(aiSummary.blocked),
        processTotalEntries: readNumber(processSummary.totalEntries),
        modelQuestions: readNumber(processSummary.modelQuestions),
        modelReplies: readNumber(processSummary.modelReplies),
        modelBlocks: readNumber(processSummary.modelBlocks),
        assetRequests: readNumber(processSummary.assetRequests),
        assetReplies: readNumber(processSummary.assetReplies),
        assetBlocks: readNumber(processSummary.assetBlocks),
        assetImports: readNumber(processSummary.assetImports),
        assetVisualEdits: readNumber(processSummary.assetVisualEdits),
        assetAdoptions: readNumber(processSummary.assetAdoptions),
        teacherDrafts: readNumber(processSummary.teacherDrafts),
        releaseExports: readNumber(processSummary.releaseExports),
        assetPresent: readBoolean(assetSummary.present),
        assetGenerated: readBoolean(assetSummary.generated),
        assetAiGeneratedLabel: readBoolean(assetSummary.aiGeneratedLabel),
        assetHumanReviewRequired: readBoolean(assetSummary.humanReviewRequired),
        assetCostumeEditorEditsRequired: readNumber(assetSummary.costumeEditorEditsRequired),
        assetImportedToCostumeEditor: readBoolean(assetSummary.importedToCostumeEditor),
        assetVisualEditCount: readNumber(assetSummary.visualEditCount),
        assetAdopted: readBoolean(assetSummary.adopted),
        assetProviderKind: readProviderKind(assetSummary.providerId),
        assetLicenseKind: readLicenseKind(assetSummary.licenseStatus),
        assetReviewKind: readReviewKind(assetSummary.reviewState),
        releaseGateAllowed: readBoolean(releaseGate.allowed),
        releaseGateBlockCount: readArray(releaseGate.reasons).length,
        pureSb3Ok: pureSb3.scratchProjectMutated === false &&
            pureSb3.metaAiWrittenToSb3 === false &&
            pureSb3.aiLogWrittenToSb3 === false,
        classScopeHash: hashScopeValue(classSessionId),
        studentScopeHash: hashScopeValue(`${classSessionId}:${studentScopeId}`),
        scopeGranularity: studentScopeId === RELEASE_DEFAULT_STUDENT_SCOPE_ID ? 'class' : 'student'
    };
});

const createResearchDatasetSummary = rows => ({
    totalRows: rows.length,
    readyRows: rows.filter(row => row.releaseStatus === 'ready').length,
    draftingRows: rows.filter(row => row.releaseStatus === 'drafting').length,
    assetDraftRows: rows.filter(row => row.assetPresent).length,
    humanReviewRequiredRows: rows.filter(row => row.assetHumanReviewRequired).length,
    pureSb3OkRows: rows.filter(row => row.pureSb3Ok).length,
    averageCheckScore: averageNumber(rows, 'checkScore'),
    averageCheckMaxScore: averageNumber(rows, 'checkMaxScore'),
    totalModelQuestions: sumNumbers(rows, 'modelQuestions'),
    totalModelReplies: sumNumbers(rows, 'modelReplies'),
    totalModelBlocks: sumNumbers(rows, 'modelBlocks'),
    totalAssetRequests: sumNumbers(rows, 'assetRequests'),
    totalAssetBlocks: sumNumbers(rows, 'assetBlocks'),
    totalAssetImports: sumNumbers(rows, 'assetImports'),
    totalAssetAdoptions: sumNumbers(rows, 'assetAdoptions'),
    totalTeacherDrafts: sumNumbers(rows, 'teacherDrafts'),
    totalReleaseExports: sumNumbers(rows, 'releaseExports')
});

const createResearchDatasetCsv = rows => {
    const escapeCsvValue = value => {
        if (value === null || value === undefined) return '';
        const text = String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    return [
        RELEASE_RESEARCH_FIELDS.join(','),
        ...rows.map(row => RELEASE_RESEARCH_FIELDS.map(field => escapeCsvValue(row[field])).join(','))
    ].join('\n');
};

const findForbiddenReleasePaths = (value, path = [], seen = new Set()) => {
    if (!value || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);

    const paths = [];
    Object.entries(value).forEach(([key, childValue]) => {
        const childPath = path.concat(key);
        if (FORBIDDEN_RELEASE_FIELD_SET.has(key.toLowerCase())) {
            paths.push(childPath.join('.'));
            return;
        }
        paths.push(...findForbiddenReleasePaths(childValue, childPath, seen));
    });
    return paths;
};

const minimizeMetrics = metrics => ({
    sprites: readNumber(metrics && metrics.sprites),
    starts: readNumber(metrics && metrics.starts),
    blocks: readNumber(metrics && metrics.blocks),
    checkScore: readNumber(metrics && metrics.checkScore),
    checkMaxScore: readNumber(metrics && metrics.checkMaxScore)
});

const minimizeAISummary = aiSummary => ({
    questions: readNumber(aiSummary && aiSummary.questions),
    replies: readNumber(aiSummary && aiSummary.replies),
    blocked: readNumber(aiSummary && aiSummary.blocked)
});

const minimizeReleaseLogicFlow = (flow, index) => ({
    pathId: `logicFlow:script-${readNumber(flow && flow.scriptIndex) || index + 1}`,
    targetLabel: String(flow && flow.targetLabel).trim() === 'Stage' ? 'Stage' : 'Sprite',
    scriptIndex: readNumber(flow && flow.scriptIndex) || index + 1,
    triggerLabel: readText(flow && flow.triggerLabel, RELEASE_SUMMARY_TEXT_LIMIT),
    blockCount: readNumber(flow && flow.blockCount),
    broadcastCount: readNumber(flow && flow.broadcastCount)
});

const minimizeReleasePreview = releasePreview => ({
    version: readText(releasePreview && releasePreview.version, RELEASE_SUMMARY_TEXT_LIMIT) || '1.1',
    status: readStatus(releasePreview && releasePreview.status),
    productLine: readText(releasePreview && releasePreview.productLine),
    userFeedback: readText(releasePreview && releasePreview.userFeedback),
    iterationPlan: readText(releasePreview && releasePreview.iterationPlan),
    metrics: minimizeMetrics(releasePreview && releasePreview.metrics),
    logicFlows: readArray(releasePreview && releasePreview.logicFlows)
        .slice(0, RELEASE_LOGIC_FLOW_LIMIT)
        .map(minimizeReleaseLogicFlow),
    aiSummary: minimizeAISummary(releasePreview && releasePreview.aiSummary)
});

const minimizeProcessSummary = processSummary => ({
    totalEntries: readNumber(processSummary && processSummary.totalEntries),
    modelQuestions: readNumber(processSummary && processSummary.modelQuestions),
    modelReplies: readNumber(processSummary && processSummary.modelReplies),
    modelBlocks: readNumber(processSummary && processSummary.modelBlocks),
    assetRequests: readNumber(processSummary && processSummary.assetRequests),
    assetReplies: readNumber(processSummary && processSummary.assetReplies),
    assetBlocks: readNumber(processSummary && processSummary.assetBlocks),
    assetImports: readNumber(processSummary && processSummary.assetImports),
    assetVisualEdits: readNumber(processSummary && processSummary.assetVisualEdits),
    assetAdoptions: readNumber(processSummary && processSummary.assetAdoptions),
    teacherDrafts: readNumber(processSummary && processSummary.teacherDrafts),
    releaseExports: readNumber(processSummary && processSummary.releaseExports)
});

const minimizeAssetSummary = assetSummary => ({
    present: readBoolean(assetSummary && assetSummary.present),
    providerId: readText(assetSummary && assetSummary.providerId, RELEASE_SUMMARY_TEXT_LIMIT),
    assetType: readText(assetSummary && assetSummary.assetType, RELEASE_SUMMARY_TEXT_LIMIT),
    generated: readBoolean(assetSummary && assetSummary.generated),
    aiGeneratedLabel: readBoolean(assetSummary && assetSummary.aiGeneratedLabel),
    humanReviewRequired: readBoolean(assetSummary && assetSummary.humanReviewRequired),
    costumeEditorEditsRequired: readNumber(assetSummary && assetSummary.costumeEditorEditsRequired),
    importedToCostumeEditor: readBoolean(assetSummary && assetSummary.importedToCostumeEditor),
    visualEditCount: readNumber(assetSummary && assetSummary.visualEditCount),
    adopted: readBoolean(assetSummary && assetSummary.adopted),
    modelWeightsDownloaded: readBoolean(assetSummary && assetSummary.modelWeightsDownloaded),
    promptStored: readBoolean(assetSummary && assetSummary.promptStored),
    licenseStatus: readText(assetSummary && assetSummary.licenseStatus, RELEASE_SUMMARY_TEXT_LIMIT),
    reviewState: readText(assetSummary && assetSummary.reviewState, RELEASE_SUMMARY_TEXT_LIMIT)
});

const minimizeReleaseGateChecklistItem = item => ({
    id: readText(item && item.id, RELEASE_SUMMARY_TEXT_LIMIT),
    ready: readBoolean(item && item.ready),
    reason: readText(item && item.reason, RELEASE_SUMMARY_TEXT_LIMIT)
});

const minimizeReleaseGate = releaseGate => ({
    allowed: readBoolean(releaseGate && releaseGate.allowed),
    checklist: readArray(releaseGate && releaseGate.checklist)
        .slice(0, 8)
        .map(minimizeReleaseGateChecklistItem),
    reasons: readArray(releaseGate && releaseGate.reasons)
        .slice(0, 8)
        .map(reason => readText(reason, RELEASE_SUMMARY_TEXT_LIMIT))
        .filter(Boolean),
    schemaVersion: readText(releaseGate && releaseGate.schemaVersion, RELEASE_SUMMARY_TEXT_LIMIT) ||
        'scratch-ai-release-gate-v1'
});

const serializeHostedProjectJson = projectJson => {
    if (!projectJson) return '';
    if (typeof projectJson === 'string') return projectJson.trim();
    try {
        return JSON.stringify(projectJson);
    } catch (error) {
        return '';
    }
};

const createHostedAssetReference = asset => {
    const md5ext = normalizeHostedAssetFilename(asset && (asset.md5ext || asset.md5));
    if (md5ext) return md5ext;
    const assetId = normalizeHostedAssetId(asset && asset.assetId);
    const dataFormat = normalizeHostedAssetFormat(asset && asset.dataFormat);
    return assetId && dataFormat ? `${assetId}.${dataFormat}` : '';
};

const collectHostedProjectAssetReferences = parsedProject => {
    const references = new Set();
    readArray(parsedProject && parsedProject.targets).forEach(target => {
        readArray(target && target.costumes).forEach(costume => {
            const reference = createHostedAssetReference(costume);
            if (reference) references.add(reference);
            const textLayerReference = normalizeHostedAssetFilename(costume && costume.textLayerMD5);
            if (textLayerReference) references.add(textLayerReference);
        });
        readArray(target && target.sounds).forEach(sound => {
            const reference = createHostedAssetReference(sound);
            if (reference) references.add(reference);
        });
    });
    return references;
};

const decodeHostedAssetBase64 = value => {
    const dataBase64 = String(value || '').replace(/\s+/g, '');
    if (!dataBase64 || dataBase64.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
        return null;
    }
    const data = Buffer.from(dataBase64, 'base64');
    if (!data.length) return null;
    const expected = dataBase64.replace(/=+$/g, '');
    const actual = data.toString('base64').replace(/=+$/g, '');
    return actual === expected ? data : null;
};

const minimizeHostedProjectAssets = ({
    assets,
    referencedAssets
}) => {
    const blockedReasons = [];
    const assetFiles = [];
    const seen = new Set();
    let skippedUnreferenced = 0;
    let totalBytes = 0;

    readArray(assets)
        .slice(0, RELEASE_HOSTED_ASSET_COUNT_LIMIT + 1)
        .forEach((asset, index) => {
            if (index >= RELEASE_HOSTED_ASSET_COUNT_LIMIT) {
                blockedReasons.push('hosted-assets-too-many');
                return;
            }

            const filename = createHostedAssetReference(asset);
            if (!filename) {
                blockedReasons.push('hosted-asset-invalid-name');
                return;
            }

            if (referencedAssets.size && !referencedAssets.has(filename)) {
                skippedUnreferenced++;
                return;
            }

            if (seen.has(filename)) return;

            const data = decodeHostedAssetBase64(asset && asset.dataBase64);
            if (!data) {
                blockedReasons.push('hosted-asset-invalid-data');
                return;
            }

            const declaredByteLength = readNumber(asset && asset.byteLength);
            if (declaredByteLength && declaredByteLength !== data.length) {
                blockedReasons.push('hosted-asset-byte-length-mismatch');
                return;
            }

            if (data.length > RELEASE_HOSTED_ASSET_SINGLE_BYTES_LIMIT) {
                blockedReasons.push('hosted-asset-too-large');
                return;
            }

            if (totalBytes + data.length > RELEASE_HOSTED_ASSET_TOTAL_BYTES_LIMIT) {
                blockedReasons.push('hosted-assets-total-too-large');
                return;
            }

            seen.add(filename);
            totalBytes += data.length;
            assetFiles.push({
                contentType: readHostedAssetContentType(filename),
                data,
                filename
            });
        });

    const missingReferencedAssets = Array.from(referencedAssets)
        .filter(filename => !seen.has(filename))
        .slice(0, RELEASE_HOSTED_ASSET_COUNT_LIMIT);
    const complete = referencedAssets.size > 0 && missingReferencedAssets.length === 0;

    return {
        assetFiles,
        blockedReasons,
        metadata: {
            assetBytes: totalBytes,
            assetCount: assetFiles.length,
            complete,
            missingAssetCount: missingReferencedAssets.length,
            referencedAssetCount: referencedAssets.size,
            schemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
            selfHosted: complete,
            skippedUnreferenced
        }
    };
};

const minimizeHostedProjectSnapshot = projectSnapshot => {
    if (!projectSnapshot || typeof projectSnapshot !== 'object') {
        return {
            assetFiles: [],
            assets: {
                assetBytes: 0,
                assetCount: 0,
                complete: false,
                missingAssetCount: 0,
                referencedAssetCount: 0,
                schemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
                selfHosted: false,
                skippedUnreferenced: 0
            },
            available: false,
            blockedReasons: [],
            projectJson: '',
            projectJsonBytes: 0,
            reason: 'project-snapshot-not-provided'
        };
    }

    const projectJson = serializeHostedProjectJson(projectSnapshot.projectJson);
    if (!projectJson) {
        return {
            assetFiles: [],
            assets: {
                assetBytes: 0,
                assetCount: 0,
                complete: false,
                missingAssetCount: 0,
                referencedAssetCount: 0,
                schemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
                selfHosted: false,
                skippedUnreferenced: 0
            },
            available: false,
            blockedReasons: ['project-snapshot-invalid'],
            projectJson: '',
            projectJsonBytes: 0,
            reason: 'project-snapshot-invalid'
        };
    }

    const projectJsonBytes = Buffer.byteLength(projectJson, 'utf8');
    if (projectJsonBytes > RELEASE_HOSTED_PROJECT_JSON_LIMIT) {
        return {
            assetFiles: [],
            assets: {
                assetBytes: 0,
                assetCount: 0,
                complete: false,
                missingAssetCount: 0,
                referencedAssetCount: 0,
                schemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
                selfHosted: false,
                skippedUnreferenced: 0
            },
            available: false,
            blockedReasons: ['project-snapshot-too-large'],
            projectJson: '',
            projectJsonBytes,
            reason: 'project-snapshot-too-large'
        };
    }

    let parsedProject = null;
    try {
        parsedProject = JSON.parse(projectJson);
    } catch (error) {
        return {
            assetFiles: [],
            assets: {
                assetBytes: 0,
                assetCount: 0,
                complete: false,
                missingAssetCount: 0,
                referencedAssetCount: 0,
                schemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
                selfHosted: false,
                skippedUnreferenced: 0
            },
            available: false,
            blockedReasons: ['project-snapshot-invalid-json'],
            projectJson: '',
            projectJsonBytes,
            reason: 'project-snapshot-invalid-json'
        };
    }

    if (!parsedProject || !Array.isArray(parsedProject.targets)) {
        return {
            assetFiles: [],
            assets: {
                assetBytes: 0,
                assetCount: 0,
                complete: false,
                missingAssetCount: 0,
                referencedAssetCount: 0,
                schemaVersion: RELEASE_HOSTED_ASSETS_SCHEMA_ID,
                selfHosted: false,
                skippedUnreferenced: 0
            },
            available: false,
            blockedReasons: ['project-snapshot-missing-targets'],
            projectJson: '',
            projectJsonBytes,
            reason: 'project-snapshot-missing-targets'
        };
    }

    const assetSnapshot = minimizeHostedProjectAssets({
        assets: projectSnapshot.assets,
        referencedAssets: collectHostedProjectAssetReferences(parsedProject)
    });

    return {
        assetFiles: assetSnapshot.assetFiles,
        assets: assetSnapshot.metadata,
        available: true,
        blockedReasons: assetSnapshot.blockedReasons,
        projectJson: JSON.stringify(parsedProject),
        projectJsonBytes,
        reason: ''
    };
};

const createMetaAiDraft = ({
    assetSummary,
    auditId,
    processSummary,
    releaseGate,
    releasePreview
}) => ({
    schemaVersion: '1.0',
    enabledModules: [
        'socraticCoach',
        'explanationGate',
        'logicView',
        'releaseAudit'
    ].concat(assetSummary.present ? ['assetDraft'] : []),
    sessionSummary: {
        socraticRounds: processSummary.modelQuestions,
        explanationGatePasses: releasePreview.metrics.checkScore,
        directGenerationBlocked: processSummary.modelBlocks + processSummary.assetBlocks,
        studentReflectionCount: releasePreview.status === 'ready' ? 3 : 0,
        releaseGatePassed: releaseGate.allowed === true,
        releaseStatus: releasePreview.status,
        assetDrafts: assetSummary.present ? 1 : 0
    },
    projectPlanId: auditId,
    logPointer: ''
});

const minimizeReleaseAuditRequest = request => {
    const releasePreview = minimizeReleasePreview(request && request.releasePreview);
    const processSummary = minimizeProcessSummary(request && request.processSummary);
    const assetSummary = minimizeAssetSummary(request && request.assetSummary);
    const releaseGate = minimizeReleaseGate(request && request.releaseGate);
    const auditId = `release-${randomUUID()}`;
    const classSession = createClassSessionScope(request && request.classSessionId);
    const studentScope = createStudentScope({
        classSessionId: classSession.id,
        studentScopeId: readRequestStudentScopeId(request)
    });

    return {
        schemaVersion: RELEASE_AUDIT_SCHEMA_ID,
        auditId,
        createdAt: new Date().toISOString(),
        source: 'scratch-ai-preview',
        classSession,
        studentScope,
        releasePreview,
        processSummary,
        assetSummary,
        releaseGate,
        metaAiDraft: createMetaAiDraft({
            assetSummary,
            auditId,
            processSummary,
            releaseGate,
            releasePreview
        }),
        pureSb3: {
            scratchProjectMutated: false,
            metaAiWrittenToSb3: false,
            aiLogWrittenToSb3: false
        }
    };
};

const createReleaseAuditSafetyGate = (request = {}) => {
    const blockedReasons = findForbiddenReleasePaths(request).map(path => `forbidden-context:${path}`);

    if (request.releaseConsent !== true) {
        blockedReasons.push('missing-release-consent');
    }

    if (!request.releasePreview || typeof request.releasePreview !== 'object') {
        blockedReasons.push('missing-release-preview');
    }

    const minimizedRequest = minimizeReleaseAuditRequest(request);

    if (minimizedRequest.releaseGate.allowed !== true) {
        blockedReasons.push('release-gate-not-ready');
        minimizedRequest.releaseGate.reasons.forEach(reason => {
            blockedReasons.push(`release-gate:${reason}`);
        });
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

const createReleaseAuditSafetySummary = safetyGate => ({
    allowed: safetyGate.allowed,
    blockedReasons: safetyGate.blockedReasons,
    redactionApplied: safetyGate.redactionApplied,
    minimized: true
});

const persistReleaseAuditRecord = async ({
    auditDir,
    record
}) => {
    const repository = createReleaseRepository(auditDir);
    return repository.appendRecord('audit', record);
};

const createAdminOperationRecord = ({
    action,
    allowed,
    result
}) => ({
    schemaVersion: RELEASE_ADMIN_OPERATION_SCHEMA_ID,
    operationId: `admin-operation-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    action: readText(action, RELEASE_SUMMARY_TEXT_LIMIT),
    allowed: readBoolean(allowed),
    blocked: !readBoolean(allowed),
    result: Object.assign({
        pathRedacted: true
    }, result || {})
});

const persistReleaseAdminOperation = async ({
    action,
    allowed,
    auditDir,
    result
}) => {
    const record = createAdminOperationRecord({
        action,
        allowed,
        result
    });
    const repository = createReleaseRepository(auditDir);
    const persistence = await repository.appendRecord('adminOperations', record);
    return Object.assign({}, persistence, {
        record
    });
};

const createAdminOperationSummary = persistence => ({
    file: persistence && persistence.file ? persistence.file : RELEASE_ADMIN_OPERATIONS_FILE,
    operationId: persistence && persistence.record ? persistence.record.operationId : '',
    persisted: Boolean(persistence && persistence.persisted),
    reason: persistence && persistence.reason ? persistence.reason : '',
    schemaVersion: RELEASE_ADMIN_OPERATION_SCHEMA_ID
});

const createReleaseAuditReply = async ({
    config,
    request
}) => {
    const safetyGate = createReleaseAuditSafetyGate(request || {});

    if (!safetyGate.allowed) {
        return {
            blocked: true,
            persisted: false,
            schemaVersion: RELEASE_AUDIT_SCHEMA_ID,
            safetyGate: createReleaseAuditSafetySummary(safetyGate),
            text: 'Release audit blocked. Send only the minimized release preview and summary counts.'
        };
    }

    const persistence = await persistReleaseAuditRecord({
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        record: safetyGate.minimizedRequest
    });

    return {
        blocked: false,
        persisted: persistence.persisted,
        auditId: safetyGate.minimizedRequest.auditId,
        schemaVersion: RELEASE_AUDIT_SCHEMA_ID,
        release: {
            status: safetyGate.minimizedRequest.releasePreview.status,
            version: safetyGate.minimizedRequest.releasePreview.version
        },
        metaAiDraft: safetyGate.minimizedRequest.metaAiDraft,
        pureSb3: safetyGate.minimizedRequest.pureSb3,
        storage: {
            file: persistence.file || '',
            kind: persistence.storage || RELEASE_AUDIT_SCHEMA.storage,
            reason: persistence.reason || ''
        },
        safetyGate: createReleaseAuditSafetySummary(safetyGate)
    };
};

const createHostedReleaseSafetyGate = (request = {}) => {
    const requestWithoutProjectSnapshot = Object.assign({}, request);
    delete requestWithoutProjectSnapshot.projectSnapshot;
    const auditSafetyGate = createReleaseAuditSafetyGate(Object.assign({
        assetSummary: {},
        processSummary: {}
    }, requestWithoutProjectSnapshot));
    const blockedReasons = auditSafetyGate.blockedReasons.slice();
    const projectSnapshot = minimizeHostedProjectSnapshot(request && request.projectSnapshot);
    projectSnapshot.blockedReasons.forEach(reason => {
        blockedReasons.push(reason);
    });

    if (!request.releasePreview || typeof request.releasePreview !== 'object') {
        blockedReasons.push('missing-release-preview');
    }

    if (!request.releaseGate || request.releaseGate.allowed !== true) {
        blockedReasons.push('release-gate-not-ready');
    }

    return {
        allowed: blockedReasons.length === 0,
        blockedReasons,
        minimizedRequest: auditSafetyGate.minimizedRequest,
        projectSnapshot,
        redactionApplied: auditSafetyGate.redactionApplied
    };
};

const persistHostedReleasePage = async ({
    assetFiles,
    auditDir,
    record
}) => {
    const repository = createReleaseRepository(auditDir);
    return repository.writeHostedReleasePage({
        assetFiles,
        projectJson: record && record.player && record.player.projectAvailable ?
            record.player.projectJson :
            '',
        record: record && record.player ? Object.assign({}, record, {
            player: Object.assign({}, record.player, {
                projectJson: undefined
            })
        }) : record
    });
};

const createHostedReleaseRecord = ({
    classSessionId,
    publicBaseUrl,
    studentScope,
    safetyGate
}) => {
    const hostedReleaseId = `hosted-${randomUUID()}`;
    const hostedPath = createHostedReleasePath(hostedReleaseId);
    const normalizedPublicBaseUrl = normalizePublicBaseUrl(publicBaseUrl);
    const publicUrl = normalizedPublicBaseUrl ? `${normalizedPublicBaseUrl}${hostedPath}` : hostedPath;
    const projectAvailable = safetyGate.projectSnapshot.available;
    const projectPath = createHostedProjectPath(hostedReleaseId);
    const selfHostedAssets = safetyGate.projectSnapshot.assets &&
        safetyGate.projectSnapshot.assets.selfHosted === true;
    const assetHost = selfHostedAssets ? createHostedAssetHostPath(hostedReleaseId) : '';
    const playerPath = projectAvailable ? createHostedPlayerPath({
        assetHost,
        hostedReleaseId
    }) : '';

    return {
        schemaVersion: RELEASE_HOSTED_PAGE_SCHEMA_ID,
        hostedReleaseId,
        createdAt: new Date().toISOString(),
        classSession: createClassSessionScope(classSessionId),
        studentScope: createStudentScope(Object.assign({}, studentScope || {}, {
            classSessionId,
            studentScopeId: studentScope && studentScope.id
        })),
        releasePreview: safetyGate.minimizedRequest.releasePreview,
        releaseGate: safetyGate.minimizedRequest.releaseGate,
        player: {
            schemaVersion: RELEASE_HOSTED_PROJECT_SCHEMA_ID,
            projectAvailable,
            projectJson: projectAvailable ? safetyGate.projectSnapshot.projectJson : '',
            projectJsonBytes: safetyGate.projectSnapshot.projectJsonBytes,
            projectPath: projectAvailable ? projectPath : '',
            playerPath,
            readOnly: true,
            assets: Object.assign({}, safetyGate.projectSnapshot.assets, {
                assetHost,
                route: selfHostedAssets ? `${assetHost}/internalapi/asset/:asset/get/` : ''
            }),
            rawProjectIncludedInAudit: false,
            rawProjectIncludedInModel: false
        },
        public: {
            hostedPath,
            publicUrl,
            pathRedacted: false
        },
        teacherReview: {
            required: true,
            route: '/api/v1/release/teacher-review',
            status: 'pending',
            tokenRequired: true
        },
        safeguards: {
            aiLogWrittenToSb3: false,
            assetsIncluded: selfHostedAssets,
            classRosterIncluded: false,
            classSessionScoped: true,
            studentScoped: true,
            hostedProjectSnapshotIncluded: projectAvailable,
            rawProjectIncluded: false,
            rawAssetDataIncludedInAudit: false,
            rawAssetDataIncludedInModel: false,
            rawProjectIncludedInAudit: false,
            rawProjectIncludedInModel: false,
            readOnlyPlayer: true,
            scratchProjectMutated: false,
            selfHostedAssetsIncluded: selfHostedAssets,
            studentIdentityIncluded: false
        }
    };
};

const createHostedReleasePageReply = async ({
    config,
    request
}) => {
    const safetyGate = createHostedReleaseSafetyGate(request || {});

    if (!safetyGate.allowed) {
        return {
            blocked: true,
            persisted: false,
            schemaVersion: RELEASE_HOSTED_PAGE_SCHEMA_ID,
            safetyGate: createReleaseAuditSafetySummary(safetyGate),
            text: 'Hosted release blocked. Pass the release gate and send only the minimized release preview.'
        };
    }

    const classSessionId = readClassSessionId(request && request.classSessionId);
    const studentScopeResult = await readClassRosterStudentScope({
        classSessionId,
        config,
        studentScopeId: readRequestStudentScopeId(request)
    });
    if (!studentScopeResult.allowed) {
        return {
            blocked: true,
            persisted: false,
            reason: studentScopeResult.reason,
            schemaVersion: RELEASE_HOSTED_PAGE_SCHEMA_ID,
            studentScope: studentScopeResult.studentScope,
            safetyGate: createReleaseAuditSafetySummary(safetyGate),
            safeguards: {
                classRosterIncluded: false,
                classSessionScoped: true,
                rawProjectIncluded: false,
                studentIdentityIncluded: false,
                studentScoped: true
            },
            text: 'Hosted release blocked because the student scope is not authorized for the class roster.'
        };
    }

    const record = createHostedReleaseRecord({
        classSessionId,
        publicBaseUrl: request && request.publicBaseUrl,
        studentScope: studentScopeResult.studentScope,
        safetyGate
    });
    const persistence = await persistHostedReleasePage({
        assetFiles: safetyGate.projectSnapshot.assetFiles,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        record
    });

    return {
        blocked: false,
        hostedReleaseId: record.hostedReleaseId,
        hostedPath: record.public.hostedPath,
        persisted: persistence.persisted,
        publicUrl: record.public.publicUrl,
        schemaVersion: RELEASE_HOSTED_PAGE_SCHEMA_ID,
        storage: {
            file: persistence.file || '',
            kind: persistence.storage || RELEASE_AUDIT_SCHEMA.storage,
            reason: persistence.reason || ''
        },
        player: Object.assign({}, record.player, {
            projectJson: undefined
        }),
        classSession: record.classSession,
        studentScope: record.studentScope,
        teacherReview: record.teacherReview,
        safeguards: record.safeguards,
        safetyGate: createReleaseAuditSafetySummary(safetyGate)
    };
};

const readHostedReleasePageHtml = async ({
    config,
    hostedReleaseId
}) => {
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    return repository.readHostedReleaseHtml(hostedReleaseId);
};

const readHostedReleaseProjectJson = async ({
    config,
    hostedReleaseId
}) => {
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    return repository.readHostedReleaseProjectJson(hostedReleaseId);
};

const readHostedReleaseAsset = async ({
    assetFilename,
    config,
    hostedReleaseId
}) => {
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    return repository.readHostedReleaseAsset({
        assetFilename,
        hostedReleaseId
    });
};

const readTeacherReviewDecision = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return RELEASE_TEACHER_REVIEW_DECISIONS.has(normalized) ? normalized : 'needs-revision';
};

const readTeacherRubricLevel = value => {
    if (value === null || typeof value === 'undefined' || value === '') return null;
    const level = Number(value);
    if (!Number.isFinite(level)) return null;
    const roundedLevel = Math.round(level);
    return roundedLevel >= 0 && roundedLevel <= RELEASE_TEACHER_RUBRIC_LEVEL_MAX ? roundedLevel : null;
};

const normalizeTeacherRubricPointId = value => readText(value, RELEASE_SUMMARY_TEXT_LIMIT)
    .replace(/[^a-z0-9_.:-]+/gi, '-')
    .replace(/^-+|-+$/g, '');

const minimizeTeacherRubricScore = score => {
    const level = readTeacherRubricLevel(score && score.level);
    return {
        knowledgePointId: normalizeTeacherRubricPointId(score && score.knowledgePointId),
        label: readText(score && score.label, RELEASE_SUMMARY_TEXT_LIMIT),
        criteria: readText(score && score.criteria, RELEASE_SUMMARY_TEXT_LIMIT),
        level,
        levelLabel: readText(score && score.levelLabel, RELEASE_SUMMARY_TEXT_LIMIT),
        evidenceSummary: readText(score && (score.evidenceSummary || score.evidence), RELEASE_SUMMARY_TEXT_LIMIT)
    };
};

const createTeacherRubricReviewSummary = scores => {
    const validScores = readArray(scores)
        .map(score => readTeacherRubricLevel(score && score.level))
        .filter(level => level !== null);
    const possibleCount = readArray(scores).length;
    const scoredCount = validScores.length;
    const scoreTotal = validScores.reduce((total, level) => total + level, 0);

    return {
        maxScore: possibleCount * RELEASE_TEACHER_RUBRIC_LEVEL_MAX,
        possibleCount,
        scoreTotal,
        scoredCount,
        status: !possibleCount || !scoredCount ? 'empty' : (
            scoredCount === possibleCount ? 'complete' : 'partial'
        )
    };
};

const minimizeTeacherRubricReview = rubricReview => {
    const scores = readArray(rubricReview && (rubricReview.scores || rubricReview.items))
        .slice(0, RELEASE_TEACHER_RUBRIC_SCORE_LIMIT)
        .map(minimizeTeacherRubricScore)
        .filter(score => score.label && score.criteria);

    return {
        schemaVersion: RELEASE_TEACHER_RUBRIC_REVIEW_SCHEMA_ID,
        source: readText(rubricReview && rubricReview.source, RELEASE_SUMMARY_TEXT_LIMIT) || 'none',
        title: readText(rubricReview && rubricReview.title, RELEASE_SUMMARY_TEXT_LIMIT),
        scores,
        summary: createTeacherRubricReviewSummary(scores),
        safeguards: {
            classRosterIncluded: false,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            writesToSb3: false
        }
    };
};

const createTeacherReviewRecord = ({
    request
}) => {
    const rubricReview = minimizeTeacherRubricReview(request && request.rubricReview);

    return {
        schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID,
        reviewId: `teacher-review-${randomUUID()}`,
        createdAt: new Date().toISOString(),
        hostedReleaseId: normalizeHostedReleaseId(request && request.hostedReleaseId),
        classSession: createClassSessionScope(request && request.classSessionId),
        studentScope: createStudentScope({
            classSessionId: request && request.classSessionId,
            rosterConfigured: request && request.studentScope && request.studentScope.rosterConfigured,
            rosterVerified: request && request.studentScope && request.studentScope.rosterVerified,
            studentScopeId: readRequestStudentScopeId(request)
        }),
        decision: readTeacherReviewDecision(request && request.decision),
        notesSummary: readText(request && request.notes, RELEASE_SUMMARY_TEXT_LIMIT),
        releaseGate: minimizeReleaseGate(request && request.releaseGate),
        releasePreview: minimizeReleasePreview(request && request.releasePreview),
        rubricReview,
        safeguards: {
            adminTokenStored: false,
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            studentScoped: true
        }
    };
};

const persistTeacherReviewRecord = async ({
    auditDir,
    record
}) => {
    const repository = createReleaseRepository(auditDir);
    return repository.appendRecord('teacherReviews', record);
};

const readHostedReleaseForReview = async ({
    config,
    hostedReleaseId
}) => {
    const normalizedHostedReleaseId = normalizeHostedReleaseId(hostedReleaseId);
    if (!normalizedHostedReleaseId) return null;
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    const hostedPages = await repository.readRecords('hostedPages');
    return readArray(hostedPages).find(hostedRelease => (
        normalizeHostedReleaseId(hostedRelease && hostedRelease.hostedReleaseId) === normalizedHostedReleaseId
    )) || null;
};

const createClassSessionMismatchReply = async ({
    action,
    auditDir,
    hostedReleaseId,
    requestClassSessionId
}) => {
    const operation = await persistReleaseAdminOperation({
        action,
        allowed: false,
        auditDir,
        result: {
            hostedReleaseId: normalizeHostedReleaseId(hostedReleaseId),
            reason: 'class-session-mismatch',
            requestClassSessionId: normalizeOptionalClassSessionId(requestClassSessionId)
        }
    });
    return {
        adminOperation: createAdminOperationSummary(operation),
        blocked: true,
        persisted: false,
        reason: 'class-session-mismatch',
        safeguards: {
            adminTokenStored: false,
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            teacherNotesIncluded: false
        }
    };
};

const createStudentScopeMismatchReply = async ({
    action,
    auditDir,
    hostedReleaseId,
    reason,
    requestStudentScopeId
}) => {
    const operation = await persistReleaseAdminOperation({
        action,
        allowed: false,
        auditDir,
        result: {
            hostedReleaseId: normalizeHostedReleaseId(hostedReleaseId),
            reason,
            requestStudentScopeId: normalizeOptionalStudentScopeId(requestStudentScopeId)
        }
    });
    return {
        adminOperation: createAdminOperationSummary(operation),
        blocked: true,
        persisted: false,
        reason,
        safeguards: {
            adminTokenStored: false,
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            studentScoped: true,
            teacherNotesIncluded: false
        }
    };
};

const createReleaseTeacherReviewReply = async ({
    config,
    request,
    requestHeaders
}) => {
    if (!hasAuditAdminAccess({
        config,
        requestHeaders
    })) {
        const lockedReply = createAdminLockedReply('teacher-review');
        const operation = await persistReleaseAdminOperation({
            action: 'teacher-review',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                hostedReleaseId: normalizeHostedReleaseId(request && request.hostedReleaseId),
                reason: lockedReply.reason
            }
        });
        return Object.assign({}, lockedReply, {
            adminOperation: createAdminOperationSummary(operation),
            schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID
        });
    }

    const safetyGate = createHostedReleaseSafetyGate(request || {});
    if (!safetyGate.allowed) {
        const operation = await persistReleaseAdminOperation({
            action: 'teacher-review',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                reason: 'release-gate-not-ready'
            }
        });
        return {
            adminOperation: createAdminOperationSummary(operation),
            blocked: true,
            persisted: false,
            schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID,
            safetyGate: createReleaseAuditSafetySummary(safetyGate)
        };
    }

    const hostedRelease = await readHostedReleaseForReview({
        config,
        hostedReleaseId: request && request.hostedReleaseId
    });
    const requestClassSessionId = normalizeOptionalClassSessionId(request && request.classSessionId);
    const hostedClassSessionId = hostedRelease ? readReleaseRecordClassSessionId(hostedRelease) : '';
    if (hostedClassSessionId && requestClassSessionId && requestClassSessionId !== hostedClassSessionId) {
        return Object.assign(await createClassSessionMismatchReply({
            action: 'teacher-review',
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            hostedReleaseId: request && request.hostedReleaseId,
            requestClassSessionId
        }), {
            schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID
        });
    }

    const hostedStudentScopeId = hostedRelease ? readReleaseRecordStudentScopeId(hostedRelease) : '';
    const requestStudentScopeId = normalizeOptionalStudentScopeId(
        request && request.studentScope && request.studentScope.id ?
            request.studentScope.id :
            request && (request.studentScopeId || request.studentScopedId)
    );
    if (
        hostedStudentScopeId &&
        hostedStudentScopeId !== RELEASE_DEFAULT_STUDENT_SCOPE_ID &&
        requestStudentScopeId &&
        requestStudentScopeId !== hostedStudentScopeId
    ) {
        return Object.assign(await createStudentScopeMismatchReply({
            action: 'teacher-review',
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            hostedReleaseId: request && request.hostedReleaseId,
            reason: 'student-scope-mismatch',
            requestStudentScopeId
        }), {
            schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID
        });
    }
    const finalClassSessionId = requestClassSessionId || hostedClassSessionId || request && request.classSessionId;
    const finalStudentScopeId = requestStudentScopeId || hostedStudentScopeId || readRequestStudentScopeId(request);
    const studentScopeResult = await readClassRosterStudentScope({
        classSessionId: finalClassSessionId,
        config,
        studentScopeId: finalStudentScopeId
    });
    if (!studentScopeResult.allowed) {
        return Object.assign(await createStudentScopeMismatchReply({
            action: 'teacher-review',
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            hostedReleaseId: request && request.hostedReleaseId,
            reason: studentScopeResult.reason,
            requestStudentScopeId: finalStudentScopeId
        }), {
            schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID,
            studentScope: studentScopeResult.studentScope
        });
    }

    const record = createTeacherReviewRecord({
        request: Object.assign({}, request, {
            classSessionId: finalClassSessionId,
            studentScope: studentScopeResult.studentScope,
            studentScopeId: studentScopeResult.studentScope.id
        })
    });
    const persistence = await persistTeacherReviewRecord({
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        record
    });
    const operation = await persistReleaseAdminOperation({
        action: 'teacher-review',
        allowed: true,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        result: {
            decision: record.decision,
            hostedReleaseId: record.hostedReleaseId,
            reviewPersisted: persistence.persisted,
            studentScoped: true
        }
    });

    return {
        adminOperation: createAdminOperationSummary(operation),
        blocked: false,
        decision: record.decision,
        persisted: persistence.persisted,
        reviewId: record.reviewId,
        studentScope: record.studentScope,
        rubricReview: {
            schemaVersion: record.rubricReview.schemaVersion,
            summary: record.rubricReview.summary
        },
        schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID,
        storage: {
            file: persistence.file || '',
            kind: persistence.storage || RELEASE_AUDIT_SCHEMA.storage,
            reason: persistence.reason || ''
        },
        safeguards: record.safeguards
    };
};

const createTeacherReviewBatchItems = request => readArray(request && request.items)
    .slice(0, RELEASE_TEACHER_REVIEW_BATCH_LIMIT)
    .map(item => ({
        classSessionId: normalizeOptionalClassSessionId(item && item.classSessionId),
        decision: readTeacherReviewDecision(item && item.decision),
        hostedReleaseId: normalizeHostedReleaseId(item && item.hostedReleaseId),
        notes: readText(item && item.notes, RELEASE_SUMMARY_TEXT_LIMIT),
        rubricReview: item && item.rubricReview,
        studentScopeId: normalizeOptionalStudentScopeId(
            item && item.studentScope && item.studentScope.id ?
                item.studentScope.id :
                item && (item.studentScopeId || item.studentScopedId)
        )
    }))
    .filter(item => item.hostedReleaseId);

const createHostedReleaseMap = hostedPages => {
    const hostedReleaseMap = new Map();
    readArray(hostedPages).forEach(hostedRelease => {
        const hostedReleaseId = normalizeHostedReleaseId(hostedRelease && hostedRelease.hostedReleaseId);
        if (hostedReleaseId) hostedReleaseMap.set(hostedReleaseId, hostedRelease);
    });
    return hostedReleaseMap;
};

const createReleaseTeacherReviewBatchReply = async ({
    config,
    request,
    requestHeaders
}) => {
    const items = createTeacherReviewBatchItems(request);
    const requestClassSessionId = normalizeOptionalClassSessionId(request && request.classSessionId);

    if (!hasAuditAdminAccess({
        config,
        requestHeaders
    })) {
        const lockedReply = createAdminLockedReply('teacher-review-batch');
        const operation = await persistReleaseAdminOperation({
            action: 'teacher-review-batch',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                itemCount: items.length,
                reason: lockedReply.reason
            }
        });
        return Object.assign({}, lockedReply, {
            adminOperation: createAdminOperationSummary(operation),
            schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID
        });
    }

    if (!items.length) {
        const operation = await persistReleaseAdminOperation({
            action: 'teacher-review-batch',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                reason: 'teacher-review-batch-empty'
            }
        });
        return {
            adminOperation: createAdminOperationSummary(operation),
            blocked: true,
            persisted: false,
            reason: 'teacher-review-batch-empty',
            schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID
        };
    }

    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    const hostedReleaseMap = createHostedReleaseMap(await repository.readRecords('hostedPages'));
    const invalidItems = items
        .filter(item => !hostedReleaseMap.has(item.hostedReleaseId))
        .map(item => ({
            hostedReleaseId: item.hostedReleaseId,
            reason: 'hosted-release-not-found'
        }));

    if (invalidItems.length) {
        const operation = await persistReleaseAdminOperation({
            action: 'teacher-review-batch',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                invalidCount: invalidItems.length,
                itemCount: items.length,
                reason: 'hosted-release-not-found'
            }
        });
        return {
            adminOperation: createAdminOperationSummary(operation),
            blocked: true,
            failedItems: invalidItems,
            persisted: false,
            reason: 'hosted-release-not-found',
            schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
            safeguards: {
                adminTokenStored: false,
                rawProjectIncluded: false,
                studentIdentityIncluded: false,
                teacherNotesIncluded: false
            }
        };
    }

    const classMismatchedItems = items
        .filter(item => {
            const hostedRelease = hostedReleaseMap.get(item.hostedReleaseId);
            const hostedClassSessionId = readReleaseRecordClassSessionId(hostedRelease);
            const itemClassSessionId = item.classSessionId || requestClassSessionId;
            return Boolean(itemClassSessionId && hostedClassSessionId && itemClassSessionId !== hostedClassSessionId);
        })
        .map(item => ({
            hostedReleaseId: item.hostedReleaseId,
            reason: 'class-session-mismatch'
        }));

    if (classMismatchedItems.length) {
        return Object.assign(await createClassSessionMismatchReply({
            action: 'teacher-review-batch',
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            hostedReleaseId: classMismatchedItems[0].hostedReleaseId,
            requestClassSessionId
        }), {
            failedItems: classMismatchedItems,
            schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID
        });
    }

    const studentMismatchedItems = items
        .filter(item => {
            const hostedRelease = hostedReleaseMap.get(item.hostedReleaseId);
            const hostedStudentScopeId = readReleaseRecordStudentScopeId(hostedRelease);
            return Boolean(
                item.studentScopeId &&
                hostedStudentScopeId &&
                hostedStudentScopeId !== RELEASE_DEFAULT_STUDENT_SCOPE_ID &&
                item.studentScopeId !== hostedStudentScopeId
            );
        })
        .map(item => ({
            hostedReleaseId: item.hostedReleaseId,
            reason: 'student-scope-mismatch'
        }));

    if (studentMismatchedItems.length) {
        return Object.assign(await createStudentScopeMismatchReply({
            action: 'teacher-review-batch',
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            hostedReleaseId: studentMismatchedItems[0].hostedReleaseId,
            reason: 'student-scope-mismatch',
            requestStudentScopeId: ''
        }), {
            failedItems: studentMismatchedItems,
            schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID
        });
    }

    const studentScopeResults = [];
    for (const item of items) {
        const hostedRelease = hostedReleaseMap.get(item.hostedReleaseId);
        const hostedClassSessionId = readReleaseRecordClassSessionId(hostedRelease);
        const classSessionIdForItem = item.classSessionId || requestClassSessionId || hostedClassSessionId;
        const studentScopeIdForItem = item.studentScopeId || readReleaseRecordStudentScopeId(hostedRelease);
        const studentScopeResult = await readClassRosterStudentScope({
            classSessionId: classSessionIdForItem,
            config,
            studentScopeId: studentScopeIdForItem
        });
        studentScopeResults.push(studentScopeResult);
    }

    const rosterBlockedItems = studentScopeResults
        .map((studentScopeResult, index) => ({
            hostedReleaseId: items[index].hostedReleaseId,
            reason: studentScopeResult.reason
        }))
        .filter((item, index) => studentScopeResults[index] && !studentScopeResults[index].allowed);

    if (rosterBlockedItems.length) {
        return Object.assign(await createStudentScopeMismatchReply({
            action: 'teacher-review-batch',
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            hostedReleaseId: rosterBlockedItems[0].hostedReleaseId,
            reason: rosterBlockedItems[0].reason,
            requestStudentScopeId: ''
        }), {
            failedItems: rosterBlockedItems,
            schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID
        });
    }

    const batchId = `teacher-review-batch-${randomUUID()}`;
    const records = items.map((item, index) => {
        const hostedRelease = hostedReleaseMap.get(item.hostedReleaseId);
        const hostedClassSessionId = readReleaseRecordClassSessionId(hostedRelease);
        const studentScope = studentScopeResults[index].studentScope;
        return Object.assign(createTeacherReviewRecord({
            request: {
                classSessionId: item.classSessionId || requestClassSessionId || hostedClassSessionId,
                decision: item.decision,
                hostedReleaseId: item.hostedReleaseId,
                notes: item.notes,
                releaseGate: hostedRelease && hostedRelease.releaseGate,
                releasePreview: hostedRelease && hostedRelease.releasePreview,
                rubricReview: item.rubricReview,
                studentScope,
                studentScopeId: studentScope.id
            }
        }), {
            batchId
        });
    });
    const persistences = [];
    for (const record of records) {
        persistences.push(await persistTeacherReviewRecord({
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            record
        }));
    }

    const persistedCount = persistences.filter(persistence => persistence.persisted).length;
    const approvedCount = records.filter(record => record.decision === 'approved').length;
    const needsRevisionCount = records.filter(record => record.decision === 'needs-revision').length;
    const operation = await persistReleaseAdminOperation({
        action: 'teacher-review-batch',
        allowed: true,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        result: {
            approved: approvedCount,
            batchId,
            itemCount: records.length,
            needsRevision: needsRevisionCount,
            persistedCount
        }
    });

    return {
        adminOperation: createAdminOperationSummary(operation),
        batchId,
        blocked: false,
        decisions: {
            approved: approvedCount,
            needsRevision: needsRevisionCount
        },
        items: records.map((record, index) => ({
            decision: record.decision,
            hostedReleaseId: record.hostedReleaseId,
            classSessionId: record.classSession.id,
            persisted: Boolean(persistences[index] && persistences[index].persisted),
            reviewId: record.reviewId,
            studentScopeId: record.studentScope.id
        })),
        persisted: persistedCount === records.length,
        persistedCount,
        requestedCount: items.length,
        schemaVersion: RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
        safeguards: {
            adminTokenStored: false,
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            studentScoped: true,
            teacherNotesIncluded: false
        }
    };
};

const createReleaseAuditSchemaReply = config => ({
    schema: RELEASE_AUDIT_SCHEMA,
    configured: Boolean(config && config.releaseAudit && config.releaseAudit.dir),
    route: '/api/v1/release/audit'
});

const createReleaseAuditLifecycleReply = async ({
    config
}) => {
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    const [auditStats, adminOperationStats] = await Promise.all([
        repository.readFileStats('audit'),
        repository.readFileStats('adminOperations')
    ]);

    return {
        schemaVersion: RELEASE_AUDIT_SCHEMA_ID,
        configured: repository.configured,
        repository: {
            schemaVersion: repository.schemaVersion,
            storage: repository.storage,
            pathRedacted: true
        },
        storage: {
            kind: RELEASE_AUDIT_SCHEMA.storage,
            file: RELEASE_AUDIT_FILE,
            pathRedacted: true
        },
        auditFile: auditStats,
        adminOperations: {
            schemaVersion: RELEASE_ADMIN_OPERATION_SCHEMA_ID,
            file: RELEASE_ADMIN_OPERATIONS_FILE,
            auditFile: adminOperationStats,
            pathRedacted: true
        },
        retention: {
            days: config && config.releaseAudit && config.releaseAudit.retentionDays ?
                config.releaseAudit.retentionDays :
                30,
            planRoute: '/api/v1/release/audit-retention-plan',
            actualDeletionSupported: false
        },
        governance: {
            exportRoute: '/api/v1/release/audit-export',
            backupRoute: '/api/v1/release/audit-backup',
            adminSummaryRoute: '/api/v1/release/admin-summary',
            researchDatasetRoute: '/api/v1/release/research-dataset',
            researchExportRoute: '/api/v1/release/research-export',
            rosterMigrationPlanRoute: '/api/v1/teacher/roster-migration-plan',
            exportRequiresAdminToken: true,
            backupRequiresAdminToken: true,
            deletionRequiresAdminToken: true,
            researchExportRequiresAdminToken: true,
            adminActionsConfigured: Boolean(config && config.releaseAudit && config.releaseAudit.adminToken)
        }
    };
};

const createReleaseAdminSummaryReply = async ({
    config
}) => {
    const repository = createReleaseRepository(config && config.releaseAudit && config.releaseAudit.dir);
    const [
        auditStats,
        adminOperationStats,
        hostedPagesStats,
        teacherReviewsStats
    ] = await Promise.all([
        repository.readFileStats('audit'),
        repository.readFileStats('adminOperations'),
        repository.readFileStats('hostedPages'),
        repository.readFileStats('teacherReviews')
    ]);

    return {
        schemaVersion: RELEASE_ADMIN_SUMMARY_SCHEMA_ID,
        configured: repository.configured,
        repository: {
            schemaVersion: repository.schemaVersion,
            storage: 'jsonl',
            pathRedacted: true,
            replaceableBackend: true,
            records: {
                audit: {
                    file: RELEASE_AUDIT_FILE,
                    schemaVersion: RELEASE_AUDIT_SCHEMA_ID
                },
                adminOperations: {
                    file: RELEASE_ADMIN_OPERATIONS_FILE,
                    schemaVersion: RELEASE_ADMIN_OPERATION_SCHEMA_ID
                },
                hostedPages: {
                    file: RELEASE_HOSTED_PAGES_FILE,
                    schemaVersion: RELEASE_HOSTED_PAGE_SCHEMA_ID
                },
                teacherReviews: {
                    file: RELEASE_TEACHER_REVIEWS_FILE,
                    schemaVersion: RELEASE_TEACHER_REVIEW_SCHEMA_ID
                }
            }
        },
        files: {
            audit: auditStats,
            adminOperations: adminOperationStats,
            hostedPages: hostedPagesStats,
            teacherReviews: teacherReviewsStats
        },
        totals: {
            auditRecords: auditStats.records,
            adminOperations: adminOperationStats.records,
            hostedPages: hostedPagesStats.records,
            teacherReviews: teacherReviewsStats.records
        },
        authorization: {
            classSessionScoped: Boolean(config && config.teacherTools && config.teacherTools.dir),
            serverTokenRequiredForAdminWrites: true,
            studentIdentityIncluded: false,
            classRosterIncluded: false
        },
        databaseIsolation: {
            classRosterRoute: '/api/v1/teacher/class-roster',
            migrationPlanRoute: '/api/v1/teacher/roster-migration-plan',
            recordScope: 'classSessionId + studentScopeId',
            researchExportScope: 'hashed-class-and-student-scope',
            target: 'database-row-level-security'
        },
        deletion: {
            mode: 'dry-run-only',
            retentionPlanRoute: '/api/v1/release/audit-retention-plan',
            actualDeletionSupported: false,
            requiresAdminTokenForApply: true
        },
        governance: {
            adminActionsConfigured: Boolean(config && config.releaseAudit && config.releaseAudit.adminToken),
            readOnlyAdminSummary: true,
            exactServerPathIncluded: false,
            valuesRedacted: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            classRosterIncluded: false,
            scratchProjectMutated: false
        },
        routes: {
            auditLifecycle: '/api/v1/release/audit-lifecycle',
            auditRetentionPlan: '/api/v1/release/audit-retention-plan',
            hostedPage: '/api/v1/release/hosted-page',
            playerAsset: '/api/v1/release/player-assets/:hostedReleaseId/internalapi/asset/:asset/get/',
            teacherReview: '/api/v1/release/teacher-review'
        }
    };
};

const createReleaseResearchDatasetReply = async ({
    config
}) => {
    const records = await readAuditRecords(config && config.releaseAudit && config.releaseAudit.dir);
    const rows = createAnonymousResearchRows(records);

    return {
        schemaVersion: RELEASE_RESEARCH_DATASET_SCHEMA_ID,
        configured: Boolean(config && config.releaseAudit && config.releaseAudit.dir),
        source: {
            kind: RELEASE_AUDIT_SCHEMA.storage,
            auditSchemaVersion: RELEASE_AUDIT_SCHEMA_ID,
            pathRedacted: true
        },
        dataset: {
            anonymousRows: rows.length,
            fields: RELEASE_RESEARCH_FIELDS,
            formats: ['json', 'csv'],
            exportRoute: '/api/v1/release/research-export',
            exportLimit: RELEASE_RESEARCH_EXPORT_LIMIT
        },
        summary: createResearchDatasetSummary(rows),
        safeguards: {
            auditIdsIncluded: false,
            classScopeRawIdsIncluded: false,
            createdAtIncluded: false,
            freeTextIncluded: false,
            rawProjectIncluded: false,
            studentScopeRawIdsIncluded: false,
            studentIdentityIncluded: false,
            exactServerPathIncluded: false
        },
        governance: {
            exportRequiresAdminToken: true,
            adminActionsConfigured: Boolean(config && config.releaseAudit && config.releaseAudit.adminToken)
        }
    };
};

const createReleaseResearchExportReply = async ({
    config,
    format = 'json',
    requestHeaders
}) => {
    if (!hasAuditAdminAccess({
        config,
        requestHeaders
    })) {
        const lockedReply = createAdminLockedReply('research-export');
        const operation = await persistReleaseAdminOperation({
            action: 'research-export',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                reason: lockedReply.reason
            }
        });
        return Object.assign({}, lockedReply, {
            adminOperation: createAdminOperationSummary(operation)
        });
    }

    const normalizedFormat = String(format || 'json').trim().toLowerCase() === 'csv' ? 'csv' : 'json';
    const records = await readAuditRecords(config && config.releaseAudit && config.releaseAudit.dir);
    const rows = createAnonymousResearchRows(records).slice(-RELEASE_RESEARCH_EXPORT_LIMIT);
    const reply = {
        blocked: false,
        exported: true,
        schemaVersion: RELEASE_RESEARCH_DATASET_SCHEMA_ID,
        format: normalizedFormat,
        limit: RELEASE_RESEARCH_EXPORT_LIMIT,
        totalRows: records.length,
        exportedRows: rows.length,
        fields: RELEASE_RESEARCH_FIELDS,
        safeguards: {
            auditIdsIncluded: false,
            classScopeRawIdsIncluded: false,
            createdAtIncluded: false,
            freeTextIncluded: false,
            rawProjectIncluded: false,
            studentScopeRawIdsIncluded: false,
            studentIdentityIncluded: false
        }
    };

    if (normalizedFormat === 'csv') {
        const operation = await persistReleaseAdminOperation({
            action: 'research-export',
            allowed: true,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                exportedRows: rows.length,
                format: normalizedFormat
            }
        });
        return Object.assign({}, reply, {
            adminOperation: createAdminOperationSummary(operation),
            csv: createResearchDatasetCsv(rows)
        });
    }

    const operation = await persistReleaseAdminOperation({
        action: 'research-export',
        allowed: true,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        result: {
            exportedRows: rows.length,
            format: normalizedFormat
        }
    });
    return Object.assign({}, reply, {
        adminOperation: createAdminOperationSummary(operation),
        rows
    });
};

const createReleaseAuditExportReply = async ({
    config,
    requestHeaders
}) => {
    if (!hasAuditAdminAccess({
        config,
        requestHeaders
    })) {
        const lockedReply = createAdminLockedReply('export');
        const operation = await persistReleaseAdminOperation({
            action: 'export',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                reason: lockedReply.reason
            }
        });
        return Object.assign({}, lockedReply, {
            adminOperation: createAdminOperationSummary(operation)
        });
    }

    const records = await readAuditRecords(config && config.releaseAudit && config.releaseAudit.dir);
    const exportedRecords = records.slice(-RELEASE_AUDIT_EXPORT_LIMIT);
    const operation = await persistReleaseAdminOperation({
        action: 'export',
        allowed: true,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        result: {
            exportedRecords: exportedRecords.length,
            format: 'json'
        }
    });
    return {
        adminOperation: createAdminOperationSummary(operation),
        blocked: false,
        schemaVersion: RELEASE_AUDIT_SCHEMA_ID,
        exported: true,
        format: 'json',
        limit: RELEASE_AUDIT_EXPORT_LIMIT,
        totalRecords: records.length,
        records: exportedRecords,
        exportPolicy: {
            classAndStudentScopeIncluded: true,
            classRosterIncluded: false,
            rawStudentIdentifiersIncluded: false,
            researchExportUsesScopeHashes: true,
            valuesRedacted: true
        }
    };
};

const createReleaseAuditBackupReply = async ({
    config,
    requestHeaders
}) => {
    if (!hasAuditAdminAccess({
        config,
        requestHeaders
    })) {
        const lockedReply = createAdminLockedReply('backup');
        const operation = await persistReleaseAdminOperation({
            action: 'backup',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                reason: lockedReply.reason
            }
        });
        return Object.assign({}, lockedReply, {
            adminOperation: createAdminOperationSummary(operation)
        });
    }

    const auditDir = config && config.releaseAudit && config.releaseAudit.dir;
    const backupDir = config && config.releaseAudit && config.releaseAudit.backupDir;
    if (!backupDir) {
        const operation = await persistReleaseAdminOperation({
            action: 'backup',
            allowed: true,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                backupCreated: false,
                reason: 'release-audit-backup-dir-not-configured'
            }
        });
        return {
            adminOperation: createAdminOperationSummary(operation),
            blocked: false,
            backupCreated: false,
            reason: 'release-audit-backup-dir-not-configured'
        };
    }

    const auditStats = await readAuditFileStats(auditDir);
    if (!auditStats.exists) {
        const operation = await persistReleaseAdminOperation({
            action: 'backup',
            allowed: true,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                backupCreated: false,
                reason: 'release-audit-file-not-found'
            }
        });
        return {
            adminOperation: createAdminOperationSummary(operation),
            blocked: false,
            backupCreated: false,
            reason: 'release-audit-file-not-found'
        };
    }

    await mkdir(resolve(backupDir), {
        recursive: true,
        mode: 0o700
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `release-audit-${timestamp}.jsonl`;
    await copyFile(createAuditFilePath(auditDir), resolve(backupDir, backupFile));
    const operation = await persistReleaseAdminOperation({
        action: 'backup',
        allowed: true,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        result: {
            backupCreated: true,
            bytes: auditStats.bytes,
            records: auditStats.records
        }
    });

    return {
        adminOperation: createAdminOperationSummary(operation),
        blocked: false,
        backupCreated: true,
        backupFile,
        records: auditStats.records,
        bytes: auditStats.bytes,
        pathRedacted: true
    };
};

const createReleaseAuditRetentionPlanReply = async ({
    config,
    now,
    request = {},
    requestHeaders
}) => {
    const records = await readAuditRecords(config && config.releaseAudit && config.releaseAudit.dir);
    const plan = createAuditRetentionPlan({
        now,
        records,
        retentionDays: config && config.releaseAudit && config.releaseAudit.retentionDays
    });

    if (request.apply === true) {
        if (!hasAuditAdminAccess({
            config,
            requestHeaders
        })) {
            const lockedReply = createAdminLockedReply('retention-apply');
            const operation = await persistReleaseAdminOperation({
                action: 'retention-apply',
                allowed: false,
                auditDir: config && config.releaseAudit && config.releaseAudit.dir,
                result: {
                    reason: lockedReply.reason,
                    wouldDeleteCount: plan.wouldDeleteCount
                }
            });
            return Object.assign({}, lockedReply, {
                adminOperation: createAdminOperationSummary(operation)
            });
        }

        const operation = await persistReleaseAdminOperation({
            action: 'retention-apply',
            allowed: false,
            auditDir: config && config.releaseAudit && config.releaseAudit.dir,
            result: {
                reason: 'actual-deletion-disabled-in-preview',
                wouldDeleteCount: plan.wouldDeleteCount
            }
        });
        return Object.assign({}, plan, {
            adminOperation: createAdminOperationSummary(operation),
            blocked: true,
            applied: false,
            reason: 'actual-deletion-disabled-in-preview'
        });
    }

    const operation = await persistReleaseAdminOperation({
        action: 'retention-plan-dry-run',
        allowed: true,
        auditDir: config && config.releaseAudit && config.releaseAudit.dir,
        result: {
            wouldDeleteCount: plan.wouldDeleteCount
        }
    });
    return Object.assign({}, plan, {
        adminOperation: createAdminOperationSummary(operation),
        blocked: false,
        applied: false
    });
};

export {
    RELEASE_ADMIN_OPERATION_SCHEMA_ID,
    RELEASE_ADMIN_OPERATIONS_FILE,
    RELEASE_ADMIN_SUMMARY_SCHEMA_ID,
    RELEASE_AUDIT_FILE,
    RELEASE_AUDIT_SCHEMA,
    RELEASE_CLASS_SHOWCASE_SCHEMA_ID,
    RELEASE_HOSTED_ASSETS_SCHEMA_ID,
    RELEASE_HOSTED_PAGE_SCHEMA_ID,
    RELEASE_HOSTED_PAGES_FILE,
    RELEASE_HOSTED_PROJECT_FILE,
    RELEASE_HOSTED_PROJECT_SCHEMA_ID,
    RELEASE_REPOSITORY_RECORDS,
    RELEASE_REPOSITORY_SCHEMA_ID,
    RELEASE_RESEARCH_DATASET_SCHEMA_ID,
    RELEASE_RESEARCH_FIELDS,
    RELEASE_TEACHER_RUBRIC_REVIEW_SCHEMA_ID,
    RELEASE_TEACHER_REVIEW_BATCH_SCHEMA_ID,
    RELEASE_TEACHER_REVIEW_SCHEMA_ID,
    RELEASE_TEACHER_REVIEWS_FILE,
    createAnonymousResearchRows,
    createAdminOperationRecord,
    createAuditRetentionPlan,
    createHostedReleasePageReply,
    createHostedReleaseSafetyGate,
    createReleaseClassShowcaseHtml,
    createReleaseClassShowcaseReply,
    createReleaseAdminSummaryReply,
    createReleaseAuditReply,
    createReleaseAuditBackupReply,
    createReleaseAuditExportReply,
    createReleaseAuditLifecycleReply,
    createReleaseAuditRetentionPlanReply,
    createReleaseAuditSafetyGate,
    createReleaseAuditSchemaReply,
    createReleaseTeacherReviewReply,
    createReleaseTeacherReviewBatchReply,
    createReleaseResearchDatasetReply,
    createReleaseResearchExportReply,
    createReleaseRepository,
    createResearchDatasetSummary,
    findForbiddenReleasePaths,
    minimizeReleaseAuditRequest,
    persistReleaseAdminOperation,
    readAuditFileStats,
    readAdminOperationFileStats,
    readAuditRecords,
    readHostedReleaseAsset,
    readHostedReleasePageHtml,
    readHostedReleaseProjectJson,
    persistReleaseAuditRecord
};
