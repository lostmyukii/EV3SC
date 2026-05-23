import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

const DEFAULT_MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MOONSHOT_MODEL = 'moonshot-v1-8k';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_ASSET_WORKER_URL = 'http://127.0.0.1:8790';
const DEFAULT_PORT = 8787;
const DEFAULT_RELEASE_AUDIT_RETENTION_DAYS = 30;
const RELEASE_AUDIT_SCHEMA_ID = 'scratch-ai-release-audit-v1';
const TEACHER_AUTH_SCHEMA_ID = 'scratch-ai-teacher-auth-v1';
const TEACHER_LOCK_SCHEMA_ID = 'scratch-ai-teacher-lock-v1';
const ENV_FILE_CONFIGURED_KEY = '__SCRATCH_AI_ENV_FILE_CONFIGURED';
const ENV_FILE_LOADED_KEY = '__SCRATCH_AI_ENV_FILE_LOADED';

const parseBoolean = value => (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 'yes'
);

const normalizeBaseUrl = (value, fallback = DEFAULT_MOONSHOT_BASE_URL) => String(value || fallback).replace(/\/+$/, '');

const normalizeAssetWorkerUrl = value => String(value || DEFAULT_ASSET_WORKER_URL).replace(/\/+$/, '');

const normalizeReleaseAuditDir = value => String(value || '').trim();

const normalizeTeacherToolsDir = value => String(value || '').trim();

const normalizeTeacherAccountsJson = value => String(value || '').trim();

const trimTrailingSlash = value => String(value || '').replace(/\/+$/, '');

const normalizePublicBaseUrl = value => {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        return trimTrailingSlash(url.toString());
    } catch (error) {
        return '';
    }
};

const normalizeWebhookUrl = value => {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'https:') return '';
        return url.toString();
    } catch (error) {
        return '';
    }
};

const hashScopeValue = value => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
};

const readPublicUrlStatus = publicBaseUrl => {
    try {
        const url = new URL(String(publicBaseUrl || ''));
        const hostname = url.hostname || '';
        return {
            configured: true,
            domainConfigured: Boolean(hostname && hostname !== 'localhost' && isIP(hostname) === 0),
            hostHash: hashScopeValue(hostname),
            https: url.protocol === 'https:',
            scheme: url.protocol.replace(':', '') || 'unknown'
        };
    } catch (error) {
        return {
            configured: false,
            domainConfigured: false,
            hostHash: '',
            https: false,
            scheme: 'none'
        };
    }
};

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return fallback;
};

const parsePort = value => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return DEFAULT_PORT;
};

const createMiddlewareConfig = (env = {}) => {
    const provider = String(env.AI_PROVIDER || 'moonshot').trim().toLowerCase();
    const moonshotApiKey = String(env.MOONSHOT_API_KEY || '').trim();
    const deepseekApiKey = String(env.DEEPSEEK_API_KEY || '').trim();
    const isMoonshotEnabled = provider === 'moonshot' &&
        parseBoolean(env.AI_MODEL_ENABLED) &&
        moonshotApiKey.length > 0;
    const isDeepSeekEnabled = provider === 'deepseek' &&
        parseBoolean(env.AI_MODEL_ENABLED) &&
        deepseekApiKey.length > 0;

    return {
        provider,
        modelEnabled: isMoonshotEnabled || isDeepSeekEnabled,
        server: {
            port: parsePort(env.AI_MIDDLEWARE_PORT)
        },
        moonshot: {
            apiKey: moonshotApiKey,
            apiKeyConfigured: moonshotApiKey.length > 0,
            baseUrl: normalizeBaseUrl(env.MOONSHOT_BASE_URL),
            model: String(env.MOONSHOT_MODEL || DEFAULT_MOONSHOT_MODEL).trim() || DEFAULT_MOONSHOT_MODEL
        },
        deepseek: {
            apiKey: deepseekApiKey,
            apiKeyConfigured: deepseekApiKey.length > 0,
            baseUrl: normalizeBaseUrl(env.DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_BASE_URL),
            model: String(env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL).trim() || DEFAULT_DEEPSEEK_MODEL
        },
        assetWorker: {
            url: normalizeAssetWorkerUrl(env.ASSET_WORKER_URL)
        },
        monitoring: {
            publicBaseUrl: normalizePublicBaseUrl(env.SCRATCH_AI_PUBLIC_BASE_URL),
            expectHttps: parseBoolean(env.SCRATCH_AI_EXPECT_HTTPS),
            webhookUrl: normalizeWebhookUrl(env.SCRATCH_AI_MONITOR_WEBHOOK_URL || env.SCRATCH_AI_WEBHOOK_URL),
            webhookToken: String(
                env.SCRATCH_AI_MONITOR_WEBHOOK_TOKEN || env.SCRATCH_AI_WEBHOOK_TOKEN || ''
            ).trim(),
            structuredEventLogFile: String(env.SCRATCH_AI_STRUCTURED_EVENT_LOG_FILE || '').trim()
        },
        releaseAudit: {
            adminToken: String(env.RELEASE_AUDIT_ADMIN_TOKEN || '').trim(),
            backupDir: normalizeReleaseAuditDir(
                env.RELEASE_AUDIT_BACKUP_DIR || env.SCRATCH_AI_RELEASE_AUDIT_BACKUP_DIR
            ),
            dir: normalizeReleaseAuditDir(env.RELEASE_AUDIT_DIR || env.SCRATCH_AI_RELEASE_AUDIT_DIR),
            retentionDays: parsePositiveInteger(
                env.RELEASE_AUDIT_RETENTION_DAYS,
                DEFAULT_RELEASE_AUDIT_RETENTION_DAYS
            )
        },
        teacherTools: {
            adminToken: String(env.TEACHER_TOOLS_ADMIN_TOKEN || env.SCRATCH_AI_TEACHER_ADMIN_TOKEN || '').trim(),
            accountsJson: normalizeTeacherAccountsJson(
                env.TEACHER_ACCOUNTS_JSON || env.SCRATCH_AI_TEACHER_ACCOUNTS_JSON
            ),
            dir: normalizeTeacherToolsDir(env.TEACHER_TOOLS_DIR || env.SCRATCH_AI_TEACHER_TOOLS_DIR),
            sessionSigningKey: String(
                env.TEACHER_SESSION_SIGNING_KEY || env.SCRATCH_AI_TEACHER_SESSION_SIGNING_KEY || ''
            ).trim()
        },
        secrets: {
            envFileConfigured: parseBoolean(env[ENV_FILE_CONFIGURED_KEY]),
            envFileLoaded: parseBoolean(env[ENV_FILE_LOADED_KEY])
        }
    };
};

const createPublicMonitoringConfig = config => {
    const monitoring = config && config.monitoring ? config.monitoring : {};
    const publicUrl = readPublicUrlStatus(monitoring.publicBaseUrl);
    return {
        statusRoute: '/statusz',
        publicBaseUrlConfigured: publicUrl.configured,
        publicBaseUrlScheme: publicUrl.scheme,
        publicHostHash: publicUrl.hostHash,
        domainConfigured: publicUrl.domainConfigured,
        expectHttps: Boolean(monitoring.expectHttps),
        httpsReady: publicUrl.https,
        httpsRequiredButMissing: Boolean(monitoring.expectHttps && !publicUrl.https),
        webhookConfigured: Boolean(monitoring.webhookUrl),
        webhookSigningConfigured: Boolean(monitoring.webhookUrl && monitoring.webhookToken),
        structuredLogs: {
            schemaVersion: 'scratch-ai-production-logs-v1',
            storage: 'jsonl',
            eventFile: 'events.jsonl',
            monitoringFile: 'monitoring.jsonl',
            readinessFile: 'readiness.jsonl',
            deadLetterFile: 'webhook-dead-letter.jsonl',
            eventLogConfigured: Boolean(monitoring.structuredEventLogFile),
            valuesRedacted: true
        },
        valuesRedacted: true
    };
};

const createPublicConfig = config => ({
    provider: config.provider,
    modelEnabled: config.modelEnabled,
    moonshot: {
        apiKeyConfigured: config.moonshot.apiKeyConfigured,
        baseUrl: config.moonshot.baseUrl,
        model: config.moonshot.model
    },
    deepseek: {
        apiKeyConfigured: config.deepseek.apiKeyConfigured,
        baseUrl: config.deepseek.baseUrl,
        model: config.deepseek.model
    },
    assetWorker: {
        configured: Boolean(config.assetWorker && config.assetWorker.url),
        route: '/api/v1/assets/image-jobs',
        manifestRoute: '/api/v1/assets/generation-manifest'
    },
    nlBlocks: {
        route: '/api/v1/nl-blocks/script-draft',
        modelRequired: true,
        requiresExplainGateReview: true,
        requiresStudentReview: true,
        insertIntoWorkspaceByDefault: false
    },
    monitoring: createPublicMonitoringConfig(config),
    releaseAudit: {
        configured: Boolean(config.releaseAudit && config.releaseAudit.dir),
        persisted: Boolean(config.releaseAudit && config.releaseAudit.dir),
        route: '/api/v1/release/audit',
        schemaRoute: '/api/v1/release/audit-schema',
        lifecycleRoute: '/api/v1/release/audit-lifecycle',
        adminSummaryRoute: '/api/v1/release/admin-summary',
        exportRoute: '/api/v1/release/audit-export',
        backupRoute: '/api/v1/release/audit-backup',
        retentionPlanRoute: '/api/v1/release/audit-retention-plan',
        researchDatasetRoute: '/api/v1/release/research-dataset',
        researchExportRoute: '/api/v1/release/research-export',
        classShowcaseRoute: '/api/v1/release/class-showcase',
        classShowcasePageRoute: '/api/v1/release/class-showcase-page',
        hostedPageRoute: '/api/v1/release/hosted-page',
        hostedPagePublicRoute: '/api/v1/release/hosted-pages/:hostedReleaseId',
        playerAssetRoute: '/api/v1/release/player-assets/:hostedReleaseId/internalapi/asset/:asset/get/',
        playerProjectRoute: '/api/v1/release/player-projects/:hostedReleaseId',
        teacherReviewBatchRoute: '/api/v1/release/teacher-review-batch',
        teacherReviewRoute: '/api/v1/release/teacher-review',
        adminOperationAudit: {
            file: 'release-admin-operations.jsonl',
            schemaVersion: 'scratch-ai-admin-operation-v1'
        },
        repository: {
            schemaVersion: 'scratch-ai-release-repository-v1',
            storage: 'jsonl',
            pathRedacted: true
        },
        schemaVersion: RELEASE_AUDIT_SCHEMA_ID,
        storage: 'jsonl',
        retentionDays: config.releaseAudit && config.releaseAudit.retentionDays ?
            config.releaseAudit.retentionDays :
            DEFAULT_RELEASE_AUDIT_RETENTION_DAYS,
        adminActionsConfigured: Boolean(config.releaseAudit && config.releaseAudit.adminToken),
        valuesRedacted: true
    },
    teacherTools: {
        mode: config.teacherTools && config.teacherTools.dir ? 'class-session' : 'draft',
        persisted: Boolean(config.teacherTools && config.teacherTools.dir),
        routes: [
            '/api/v1/teacher/knowledge-points',
            '/api/v1/teacher/session',
            '/api/v1/teacher/accounts',
            '/api/v1/teacher/accounts/admin-action',
            '/api/v1/teacher/class-roster',
            '/api/v1/teacher/class-roster/admin-action',
            '/api/v1/teacher/roster-migration-plan',
            '/api/v1/teacher/knowledge-lock',
            '/api/v1/teacher/active-knowledge-lock',
            '/api/v1/teacher/lesson-prep'
        ],
        auth: {
            configured: Boolean(
                config.teacherTools &&
                (config.teacherTools.accountsJson || config.teacherTools.dir) &&
                config.teacherTools.sessionSigningKey
            ),
            schemaVersion: TEACHER_AUTH_SCHEMA_ID,
            sessionRoute: '/api/v1/teacher/session',
            valuesRedacted: true
        },
        accountAdmin: {
            actionRoute: '/api/v1/teacher/accounts/admin-action',
            accountsFile: 'teacher-accounts.json',
            listRoute: '/api/v1/teacher/accounts',
            operationAudit: {
                file: 'teacher-admin-operations.jsonl',
                schemaVersion: 'scratch-ai-teacher-admin-operation-v1'
            },
            schemaVersion: 'scratch-ai-teacher-account-admin-v1',
            valuesRedacted: true
        },
        classRoster: {
            actionRoute: '/api/v1/teacher/class-roster/admin-action',
            file: 'teacher-class-rosters.json',
            listRoute: '/api/v1/teacher/class-roster',
            migrationPlanRoute: '/api/v1/teacher/roster-migration-plan',
            rawStudentIdentifiersStored: false,
            schemaVersion: 'scratch-ai-class-roster-v1',
            studentScope: 'pseudonymous-per-class',
            valuesRedacted: true
        },
        schemaVersion: TEACHER_LOCK_SCHEMA_ID,
        storage: 'jsonl',
        adminActionsConfigured: Boolean(config.teacherTools && config.teacherTools.adminToken),
        valuesRedacted: true
    },
    secrets: {
        envFileConfigured: Boolean(config.secrets && config.secrets.envFileConfigured),
        envFileLoaded: Boolean(config.secrets && config.secrets.envFileLoaded),
        valuesRedacted: true
    }
});

export {
    DEFAULT_ASSET_WORKER_URL,
    DEFAULT_DEEPSEEK_BASE_URL,
    DEFAULT_DEEPSEEK_MODEL,
    DEFAULT_MOONSHOT_BASE_URL,
    DEFAULT_MOONSHOT_MODEL,
    DEFAULT_PORT,
    DEFAULT_RELEASE_AUDIT_RETENTION_DAYS,
    RELEASE_AUDIT_SCHEMA_ID,
    TEACHER_AUTH_SCHEMA_ID,
    TEACHER_LOCK_SCHEMA_ID,
    createMiddlewareConfig,
    createPublicConfig
};
