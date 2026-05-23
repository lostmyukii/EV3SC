import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createMiddlewareConfig,
    createPublicConfig
} from '../src/config.js';

test('keeps model disabled by default without exposing secrets', () => {
    const config = createMiddlewareConfig({});
    const publicConfig = createPublicConfig(config);

    assert.equal(config.modelEnabled, false);
    assert.equal(config.moonshot.apiKeyConfigured, false);
    assert.equal(config.deepseek.apiKeyConfigured, false);
    assert.equal(config.assetWorker.url, 'http://127.0.0.1:8790');
    assert.equal(publicConfig.assetWorker.configured, true);
    assert.equal(publicConfig.assetWorker.route, '/api/v1/assets/image-jobs');
    assert.equal(publicConfig.assetWorker.manifestRoute, '/api/v1/assets/generation-manifest');
    assert.equal(publicConfig.monitoring.statusRoute, '/statusz');
    assert.equal(publicConfig.monitoring.publicBaseUrlConfigured, false);
    assert.equal(publicConfig.monitoring.webhookConfigured, false);
    assert.equal(publicConfig.monitoring.structuredLogs.schemaVersion, 'scratch-ai-production-logs-v1');
    assert.equal(publicConfig.monitoring.structuredLogs.eventLogConfigured, false);
    assert.equal(publicConfig.monitoring.valuesRedacted, true);
    assert.equal(publicConfig.releaseAudit.configured, false);
    assert.equal(publicConfig.releaseAudit.route, '/api/v1/release/audit');
    assert.equal(publicConfig.releaseAudit.lifecycleRoute, '/api/v1/release/audit-lifecycle');
    assert.equal(publicConfig.releaseAudit.adminSummaryRoute, '/api/v1/release/admin-summary');
    assert.equal(publicConfig.releaseAudit.researchDatasetRoute, '/api/v1/release/research-dataset');
    assert.equal(publicConfig.releaseAudit.researchExportRoute, '/api/v1/release/research-export');
    assert.equal(publicConfig.releaseAudit.teacherReviewBatchRoute, '/api/v1/release/teacher-review-batch');
    assert.equal(publicConfig.releaseAudit.adminOperationAudit.schemaVersion, 'scratch-ai-admin-operation-v1');
    assert.equal(publicConfig.releaseAudit.repository.schemaVersion, 'scratch-ai-release-repository-v1');
    assert.equal(publicConfig.releaseAudit.repository.pathRedacted, true);
    assert.equal(publicConfig.releaseAudit.schemaVersion, 'scratch-ai-release-audit-v1');
    assert.equal(publicConfig.releaseAudit.retentionDays, 30);
    assert.equal(publicConfig.releaseAudit.adminActionsConfigured, false);
    assert.equal(publicConfig.teacherTools.mode, 'draft');
    assert.equal(publicConfig.teacherTools.persisted, false);
    assert.equal(publicConfig.teacherTools.routes.includes('/api/v1/teacher/session'), true);
    assert.equal(publicConfig.teacherTools.routes.includes('/api/v1/teacher/active-knowledge-lock'), true);
    assert.equal(publicConfig.teacherTools.auth.configured, false);
    assert.equal(publicConfig.teacherTools.auth.schemaVersion, 'scratch-ai-teacher-auth-v1');
    assert.equal(publicConfig.teacherTools.classRoster.schemaVersion, 'scratch-ai-class-roster-v1');
    assert.equal(publicConfig.teacherTools.classRoster.rawStudentIdentifiersStored, false);
    assert.equal(publicConfig.teacherTools.adminActionsConfigured, false);
    assert.equal(publicConfig.teacherTools.valuesRedacted, true);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.moonshot, 'apiKey'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.deepseek, 'apiKey'), false);
});

test('reports HTTPS and webhook readiness without exposing URLs or tokens', () => {
    const config = createMiddlewareConfig({
        SCRATCH_AI_PUBLIC_BASE_URL: 'https://scratch-ai.example/',
        SCRATCH_AI_EXPECT_HTTPS: 'true',
        SCRATCH_AI_MONITOR_WEBHOOK_URL: 'https://hooks.example/scratch-ai',
        SCRATCH_AI_MONITOR_WEBHOOK_TOKEN: 'webhook-secret',
        SCRATCH_AI_STRUCTURED_EVENT_LOG_FILE: '/srv/scratch-ai/logs/events.jsonl'
    });
    const publicConfig = createPublicConfig(config);

    assert.equal(config.monitoring.publicBaseUrl, 'https://scratch-ai.example');
    assert.equal(config.monitoring.webhookToken, 'webhook-secret');
    assert.equal(publicConfig.monitoring.publicBaseUrlConfigured, true);
    assert.equal(publicConfig.monitoring.publicBaseUrlScheme, 'https');
    assert.equal(publicConfig.monitoring.domainConfigured, true);
    assert.equal(publicConfig.monitoring.expectHttps, true);
    assert.equal(publicConfig.monitoring.httpsReady, true);
    assert.equal(publicConfig.monitoring.webhookConfigured, true);
    assert.equal(publicConfig.monitoring.webhookSigningConfigured, true);
    assert.equal(publicConfig.monitoring.structuredLogs.eventLogConfigured, true);
    assert.equal(JSON.stringify(publicConfig).includes('hooks.example'), false);
    assert.equal(JSON.stringify(publicConfig).includes('webhook-secret'), false);
});

test('treats missing or non-HTTPS monitor webhook URLs as optional and disabled', () => {
    for (const webhookUrl of ['', 'http://hooks.example/scratch-ai', 'not-a-url']) {
        const config = createMiddlewareConfig({
            SCRATCH_AI_MONITOR_WEBHOOK_URL: webhookUrl,
            SCRATCH_AI_MONITOR_WEBHOOK_TOKEN: 'webhook-secret'
        });
        const publicConfig = createPublicConfig(config);

        assert.equal(config.monitoring.webhookUrl, '');
        assert.equal(publicConfig.monitoring.webhookConfigured, false);
        assert.equal(publicConfig.monitoring.webhookSigningConfigured, false);
        assert.equal(JSON.stringify(publicConfig).includes('hooks.example'), false);
        assert.equal(JSON.stringify(publicConfig).includes('webhook-secret'), false);
    }
});

test('enables Moonshot only when flag and environment key are both present', () => {
    const config = createMiddlewareConfig({
        AI_MODEL_ENABLED: 'true',
        MOONSHOT_API_KEY: 'test-key',
        __SCRATCH_AI_ENV_FILE_CONFIGURED: 'true',
        __SCRATCH_AI_ENV_FILE_LOADED: 'true'
    });

    assert.equal(config.modelEnabled, true);
    assert.equal(config.moonshot.apiKey, 'test-key');
    const publicConfig = createPublicConfig(config);
    assert.equal(publicConfig.moonshot.apiKeyConfigured, true);
    assert.equal(publicConfig.secrets.envFileConfigured, true);
    assert.equal(publicConfig.secrets.envFileLoaded, true);
    assert.equal(publicConfig.secrets.valuesRedacted, true);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig, 'MOONSHOT_API_KEY'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.moonshot, 'apiKey'), false);
});

test('enables DeepSeek with server-side key and redacted public config', () => {
    const config = createMiddlewareConfig({
        AI_PROVIDER: 'deepseek',
        AI_MODEL_ENABLED: 'true',
        DEEPSEEK_API_KEY: 'test-deepseek-key'
    });

    assert.equal(config.provider, 'deepseek');
    assert.equal(config.modelEnabled, true);
    assert.equal(config.deepseek.apiKey, 'test-deepseek-key');
    assert.equal(config.deepseek.baseUrl, 'https://api.deepseek.com');
    assert.equal(config.deepseek.model, 'deepseek-chat');

    const publicConfig = createPublicConfig(config);
    assert.equal(publicConfig.deepseek.apiKeyConfigured, true);
    assert.equal(publicConfig.deepseek.baseUrl, 'https://api.deepseek.com');
    assert.equal(publicConfig.deepseek.model, 'deepseek-chat');
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.deepseek, 'apiKey'), false);
    assert.equal(JSON.stringify(publicConfig).includes('test-deepseek-key'), false);
});

test('allows overriding asset worker loopback URL without exposing it publicly', () => {
    const config = createMiddlewareConfig({
        ASSET_WORKER_URL: 'http://127.0.0.1:9999/',
        RELEASE_AUDIT_ADMIN_TOKEN: 'test-token',
        RELEASE_AUDIT_BACKUP_DIR: '/tmp/scratch-ai-backups',
        RELEASE_AUDIT_DIR: '/tmp/scratch-ai-audit',
        RELEASE_AUDIT_RETENTION_DAYS: '14'
    });
    const publicConfig = createPublicConfig(config);

    assert.equal(config.assetWorker.url, 'http://127.0.0.1:9999');
    assert.equal(config.releaseAudit.adminToken, 'test-token');
    assert.equal(config.releaseAudit.backupDir, '/tmp/scratch-ai-backups');
    assert.equal(config.releaseAudit.dir, '/tmp/scratch-ai-audit');
    assert.equal(config.releaseAudit.retentionDays, 14);
    assert.equal(publicConfig.releaseAudit.configured, true);
    assert.equal(publicConfig.releaseAudit.retentionDays, 14);
    assert.equal(publicConfig.releaseAudit.adminActionsConfigured, true);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.releaseAudit, 'dir'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.releaseAudit, 'adminToken'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.assetWorker, 'url'), false);
});

test('configures teacher class session storage without exposing paths or tokens', () => {
    const config = createMiddlewareConfig({
        TEACHER_ACCOUNTS_JSON: '[{"teacherId":"teacher-a","passwordHash":"hash","classSessionIds":["class-a"]}]',
        TEACHER_SESSION_SIGNING_KEY: 'teacher-session-signing-key',
        TEACHER_TOOLS_ADMIN_TOKEN: 'teacher-token',
        TEACHER_TOOLS_DIR: '/tmp/scratch-ai-teacher-tools'
    });
    const publicConfig = createPublicConfig(config);

    assert.equal(config.teacherTools.adminToken, 'teacher-token');
    assert.equal(config.teacherTools.accountsJson.includes('teacher-a'), true);
    assert.equal(config.teacherTools.dir, '/tmp/scratch-ai-teacher-tools');
    assert.equal(config.teacherTools.sessionSigningKey, 'teacher-session-signing-key');
    assert.equal(publicConfig.teacherTools.mode, 'class-session');
    assert.equal(publicConfig.teacherTools.persisted, true);
    assert.equal(publicConfig.teacherTools.auth.configured, true);
    assert.equal(publicConfig.teacherTools.auth.sessionRoute, '/api/v1/teacher/session');
    assert.equal(publicConfig.teacherTools.adminActionsConfigured, true);
    assert.equal(publicConfig.teacherTools.classRoster.actionRoute, '/api/v1/teacher/class-roster/admin-action');
    assert.equal(publicConfig.teacherTools.classRoster.migrationPlanRoute, '/api/v1/teacher/roster-migration-plan');
    assert.equal(publicConfig.teacherTools.classRoster.studentScope, 'pseudonymous-per-class');
    assert.equal(publicConfig.teacherTools.schemaVersion, 'scratch-ai-teacher-lock-v1');
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.teacherTools, 'dir'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.teacherTools, 'adminToken'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.teacherTools, 'accountsJson'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicConfig.teacherTools, 'sessionSigningKey'), false);
});
