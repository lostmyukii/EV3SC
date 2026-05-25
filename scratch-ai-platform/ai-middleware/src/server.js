import {appendFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';

import {
    createMiddlewareConfig,
    DEFAULT_ALLOWED_ORIGINS,
    createPublicConfig
} from './config.js';
import {resolveMiddlewareEnv} from './env-loader.js';
import {
    createAssetGenerationManifestReply,
    createAssetImageJobReply
} from './asset-job-router.js';
import {createNlBlocksScriptDraftReply} from './nl-blocks-script-draft-router.js';
import {createSocraticModelReply} from './socratic-router.js';
import {
    createActiveKnowledgeLockReply,
    createClassRosterAdminReply,
    createClassRosterReadReply,
    createKnowledgeLockReply,
    createKnowledgePointLibraryReply,
    createLessonPrepDraftReply,
    createRosterMigrationPlanReply,
    createTeacherAccountAdminReply,
    createTeacherAccountListAdminReply,
    createTeacherSessionReply
} from './teacher-tools-router.js';
import {
    createReleaseAdminSummaryReply,
    createReleaseAuditBackupReply,
    createReleaseAuditExportReply,
    createReleaseAuditLifecycleReply,
    createReleaseAuditReply,
    createReleaseAuditRetentionPlanReply,
    createReleaseAuditSchemaReply,
    createReleaseClassShowcaseHtml,
    createReleaseClassShowcaseReply,
    createHostedReleasePageReply,
    createReleaseTeacherReviewBatchReply,
    createReleaseTeacherReviewReply,
    createReleaseResearchDatasetReply,
    createReleaseResearchExportReply,
    readHostedReleaseAsset,
    readHostedReleasePageHtml,
    readHostedReleaseProjectJson
} from './release-audit-router.js';

const MAX_BODY_BYTES = 128 * 1024;
const MAX_HOSTED_RELEASE_BODY_BYTES = 5 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(DEFAULT_ALLOWED_ORIGINS);
const DEFAULT_CORS_FALLBACK_ORIGIN = 'http://127.0.0.1:8602';
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, X-Scratch-AI-Audit-Admin-Token, X-Scratch-AI-Request-Id, X-Scratch-AI-Teacher-Admin-Token, X-Scratch-AI-Teacher-Session-Token';

const asAllowedOriginSet = origins => {
    if (origins instanceof Set) return origins;
    if (Array.isArray(origins)) return new Set(origins);
    return ALLOWED_ORIGINS;
};

const readAllowedOrigin = (request, origins = ALLOWED_ORIGINS) => {
    const origin = request && request.headers ? request.headers.origin : '';
    const allowedOrigins = asAllowedOriginSet(origins);
    return allowedOrigins.has(origin) ? origin : DEFAULT_CORS_FALLBACK_ORIGIN;
};

const parseBoolean = value => (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 'yes'
);

const hashScopeValue = value => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
};

const readRequestId = request => {
    const headerValue = String(request && request.headers && request.headers['x-scratch-ai-request-id'] || '').trim();
    if (/^[A-Za-z0-9._:-]{8,96}$/.test(headerValue)) return headerValue;
    return randomUUID();
};

const normalizeRoutePath = pathname => {
    if (pathname.indexOf('/api/v1/release/hosted-pages/') === 0) return '/api/v1/release/hosted-pages/:hostedReleaseId';
    if (pathname.indexOf('/api/v1/release/player-assets/') === 0) {
        return '/api/v1/release/player-assets/:hostedReleaseId/internalapi/asset/:asset/get/';
    }
    if (pathname.indexOf('/api/v1/release/player-projects/') === 0) {
        return '/api/v1/release/player-projects/:hostedReleaseId';
    }
    return pathname || '/';
};

const readScopeFromUrl = url => ({
    classScopeHash: hashScopeValue(url && (
        url.searchParams.get('classSessionId') ||
        url.searchParams.get('scratchAiClassSessionId') ||
        url.searchParams.get('classId')
    )),
    studentScopeHash: hashScopeValue(url && (
        url.searchParams.get('studentScopeId') ||
        url.searchParams.get('studentId')
    ))
});

const readScopeFromBody = body => {
    const classValue = body && (
        body.classSessionId ||
        body.classId ||
        body.activeClassSessionId ||
        body.classScopeId ||
        body.release && body.release.classSessionId ||
        body.knowledgeLock && body.knowledgeLock.classSessionId
    );
    const studentValue = body && (
        body.studentScopeId ||
        body.studentId ||
        body.studentKey ||
        body.student && (body.student.studentScopeId || body.student.studentId || body.student.studentKey) ||
        body.report && (body.report.studentScopeId || body.report.studentId || body.report.studentKey)
    );
    return {
        classScopeHash: hashScopeValue(classValue),
        studentScopeHash: hashScopeValue(studentValue)
    };
};

const mergeRequestLogScope = (request, scope = {}) => {
    request.scratchAiLogScope = {
        classScopeHash: scope.classScopeHash || request.scratchAiLogScope && request.scratchAiLogScope.classScopeHash || '',
        studentScopeHash: scope.studentScopeHash || request.scratchAiLogScope && request.scratchAiLogScope.studentScopeHash || ''
    };
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
    request,
    response,
    url
}) => {
    const startedAt = Date.now();
    request.scratchAiRequestId = readRequestId(request);
    request.scratchAiRoutePath = normalizeRoutePath(url.pathname);
    mergeRequestLogScope(request, readScopeFromUrl(url));
    response.setHeader('X-Scratch-AI-Request-Id', request.scratchAiRequestId);
    response.once('finish', () => {
        writeStructuredEvent({
            schemaVersion: 'scratch-ai-request-log-v1',
            service: 'scratch-ai-middleware',
            requestId: request.scratchAiRequestId,
            method: request.method,
            route: request.scratchAiRoutePath,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
            classScopeHash: request.scratchAiLogScope.classScopeHash,
            studentScopeHash: request.scratchAiLogScope.studentScopeHash,
            valuesRedacted: true
        });
    });
};

const createRuntimeStatusReply = config => ({
    service: 'scratch-ai-middleware',
    ready: true,
    monitoring: {
        statusRoute: '/statusz',
        uptimeSeconds: Math.round(process.uptime()),
        publicBaseUrlConfigured: Boolean(config && config.monitoring && config.monitoring.publicBaseUrl),
        expectHttps: Boolean(config && config.monitoring && config.monitoring.expectHttps),
        webhookConfigured: Boolean(config && config.monitoring && config.monitoring.webhookUrl),
        structuredEventLogConfigured: Boolean(
            config && config.monitoring && config.monitoring.structuredEventLogFile
        ),
        valuesRedacted: true
    },
    memory: {
        rssBytes: process.memoryUsage().rss
    },
    routes: {
        health: '/healthz',
        releaseAdminSummary: '/api/v1/release/admin-summary',
        nlBlocksScriptDraft: '/api/v1/nl-blocks/script-draft',
        teacherAccounts: '/api/v1/teacher/accounts',
        teacherAccountAdminAction: '/api/v1/teacher/accounts/admin-action',
        teacherClassRoster: '/api/v1/teacher/class-roster',
        teacherClassRosterAdminAction: '/api/v1/teacher/class-roster/admin-action',
        teacherSession: '/api/v1/teacher/session'
    },
    configuration: {
        modelEnabled: Boolean(config && config.modelEnabled),
        releaseAuditConfigured: Boolean(config && config.releaseAudit && config.releaseAudit.dir),
        teacherAuthConfigured: Boolean(
            config &&
            config.teacherTools &&
            (config.teacherTools.accountsJson || config.teacherTools.dir) &&
            config.teacherTools.sessionSigningKey
        ),
        valuesRedacted: true
    }
});

const sendJson = (request, response, statusCode, payload) => {
    const allowedOrigins = request && request.scratchAiAllowedOrigins;
    response.writeHead(statusCode, {
        'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Origin': readAllowedOrigin(request, allowedOrigins),
        'Content-Type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify(payload));
};

const sendHtml = (request, response, statusCode, html) => {
    const allowedOrigins = request && request.scratchAiAllowedOrigins;
    response.writeHead(statusCode, {
        'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Origin': readAllowedOrigin(request, allowedOrigins),
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8'
    });
    if (request.method === 'HEAD') {
        response.end();
        return;
    }
    response.end(html);
};

const sendBinary = (request, response, statusCode, payload) => {
    const allowedOrigins = request && request.scratchAiAllowedOrigins;
    response.writeHead(statusCode, {
        'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Origin': readAllowedOrigin(request, allowedOrigins),
        'Cache-Control': 'no-store',
        'Content-Length': payload && payload.data ? payload.data.length : 0,
        'Content-Type': payload && payload.contentType ? payload.contentType : 'application/octet-stream'
    });
    if (request.method === 'HEAD') {
        response.end();
        return;
    }
    response.end(payload && payload.data ? payload.data : '');
};

const readJsonBody = (request, maxBodyBytes = MAX_BODY_BYTES) => new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
        body += chunk;
        if (body.length > maxBodyBytes) {
            reject(new Error('Request body is too large'));
            request.destroy();
        }
    });
    request.on('end', () => {
        try {
            const parsedBody = body ? JSON.parse(body) : {};
            mergeRequestLogScope(request, readScopeFromBody(parsedBody));
            resolve(parsedBody);
        } catch (error) {
            reject(new Error('Invalid JSON body'));
        }
    });
    request.on('error', reject);
});

const createRequestHandler = (config, fetchImpl = globalThis.fetch) => async (request, response) => {
    request.scratchAiAllowedOrigins = asAllowedOriginSet(
        config && config.server && config.server.allowedOrigins
    );
    const requestUrl = new URL(request.url, 'http://scratch-ai-middleware.local');
    const pathname = requestUrl.pathname;
    installStructuredRequestLog({
        request,
        response,
        url: requestUrl
    });

    if (request.method === 'OPTIONS') {
        sendJson(request, response, 204, {});
        return;
    }

    if (request.method === 'GET' && pathname === '/healthz') {
        sendJson(request, response, 200, createPublicConfig(config));
        return;
    }

    if (request.method === 'GET' && pathname === '/statusz') {
        sendJson(request, response, 200, createRuntimeStatusReply(config));
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/socratic-chat') {
        try {
            const body = await readJsonBody(request);
            const reply = await createSocraticModelReply({
                config,
                fetchImpl,
                request: body
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/nl-blocks/script-draft') {
        try {
            const body = await readJsonBody(request);
            const reply = await createNlBlocksScriptDraftReply({
                config,
                fetchImpl,
                request: body
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                code: error.code || 'SCRATCH_AI_NL_BLOCKS_REQUEST_FAILED',
                details: error.details || null,
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/assets/image-jobs') {
        try {
            const body = await readJsonBody(request);
            const reply = await createAssetImageJobReply({
                config,
                fetchImpl,
                request: body,
                requestId: request.scratchAiRequestId
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/assets/generation-manifest') {
        try {
            const reply = await createAssetGenerationManifestReply({
                config,
                fetchImpl,
                requestId: request.scratchAiRequestId
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/audit-schema') {
        sendJson(request, response, 200, createReleaseAuditSchemaReply(config));
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/audit-lifecycle') {
        try {
            const reply = await createReleaseAuditLifecycleReply({
                config
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/admin-summary') {
        try {
            const reply = await createReleaseAdminSummaryReply({
                config
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/class-showcase') {
        try {
            const reply = await createReleaseClassShowcaseReply({
                classSessionId: requestUrl.searchParams.get('classSessionId'),
                studentScopeId: requestUrl.searchParams.get('studentScopeId'),
                config
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        pathname === '/api/v1/release/class-showcase-page'
    ) {
        try {
            const html = await createReleaseClassShowcaseHtml({
                classSessionId: requestUrl.searchParams.get('classSessionId'),
                studentScopeId: requestUrl.searchParams.get('studentScopeId'),
                config
            });
            sendHtml(request, response, 200, html);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/audit-export') {
        try {
            const reply = await createReleaseAuditExportReply({
                config,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/release/audit-backup') {
        try {
            const reply = await createReleaseAuditBackupReply({
                config,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/release/audit-retention-plan') {
        try {
            const body = await readJsonBody(request);
            const reply = await createReleaseAuditRetentionPlanReply({
                config,
                request: body,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/research-dataset') {
        try {
            const reply = await createReleaseResearchDatasetReply({
                config
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/release/research-export') {
        try {
            const reply = await createReleaseResearchExportReply({
                config,
                format: requestUrl.searchParams.get('format'),
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/release/hosted-page') {
        try {
            const body = await readJsonBody(request, MAX_HOSTED_RELEASE_BODY_BYTES);
            const reply = await createHostedReleasePageReply({
                config,
                request: body
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (
        request.method === 'GET' &&
        pathname.indexOf('/api/v1/release/player-projects/') === 0
    ) {
        try {
            const hostedReleaseId = pathname.split('/').filter(Boolean).pop();
            const projectJson = await readHostedReleaseProjectJson({
                config,
                hostedReleaseId
            });
            if (!projectJson) {
                sendJson(request, response, 404, {
                    error: 'Hosted release project not found'
                });
                return;
            }
            sendJson(request, response, 200, projectJson);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        pathname.indexOf('/api/v1/release/player-assets/') === 0
    ) {
        try {
            const match = pathname.match(/^\/api\/v1\/release\/player-assets\/([^/]+)\/internalapi\/asset\/([^/]+)\/get\/?$/);
            const asset = match ? await readHostedReleaseAsset({
                assetFilename: match[2],
                config,
                hostedReleaseId: match[1]
            }) : null;
            if (!asset) {
                sendJson(request, response, 404, {
                    error: 'Hosted release asset not found'
                });
                return;
            }
            sendBinary(request, response, 200, asset);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        pathname.indexOf('/api/v1/release/hosted-pages/') === 0
    ) {
        try {
            const hostedReleaseId = pathname.split('/').filter(Boolean).pop();
            const html = await readHostedReleasePageHtml({
                config,
                hostedReleaseId
            });
            if (!html) {
                sendJson(request, response, 404, {
                    error: 'Hosted release not found'
                });
                return;
            }
            sendHtml(request, response, 200, html);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/release/teacher-review') {
        try {
            const body = await readJsonBody(request);
            const reply = await createReleaseTeacherReviewReply({
                config,
                request: body,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/release/teacher-review-batch') {
        try {
            const body = await readJsonBody(request);
            const reply = await createReleaseTeacherReviewBatchReply({
                config,
                request: body,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/release/audit') {
        try {
            const body = await readJsonBody(request);
            const reply = await createReleaseAuditReply({
                config,
                request: body
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, error.statusCode || 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/teacher/knowledge-points') {
        sendJson(request, response, 200, createKnowledgePointLibraryReply());
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/teacher/session') {
        try {
            const body = await readJsonBody(request);
            const reply = await createTeacherSessionReply({
                config,
                request: body
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/teacher/accounts') {
        try {
            const reply = await createTeacherAccountListAdminReply({
                config,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/teacher/accounts/admin-action') {
        try {
            const body = await readJsonBody(request);
            const reply = await createTeacherAccountAdminReply({
                config,
                request: body,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/teacher/class-roster') {
        try {
            const reply = await createClassRosterReadReply({
                classSessionId: requestUrl.searchParams.get('classSessionId'),
                config,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/teacher/class-roster/admin-action') {
        try {
            const body = await readJsonBody(request);
            const reply = await createClassRosterAdminReply({
                config,
                request: body,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/teacher/roster-migration-plan') {
        sendJson(request, response, 200, createRosterMigrationPlanReply({
            config
        }));
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/teacher/knowledge-lock') {
        try {
            const body = await readJsonBody(request);
            const reply = await createKnowledgeLockReply({
                config,
                request: body,
                requestHeaders: request.headers
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'GET' && pathname === '/api/v1/teacher/active-knowledge-lock') {
        try {
            const reply = await createActiveKnowledgeLockReply({
                classSessionId: requestUrl.searchParams.get('classSessionId'),
                config
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    if (request.method === 'POST' && pathname === '/api/v1/teacher/lesson-prep') {
        try {
            const body = await readJsonBody(request);
            const reply = createLessonPrepDraftReply({
                request: body
            });
            sendJson(request, response, 200, reply);
        } catch (error) {
            sendJson(request, response, 400, {
                error: error.message
            });
        }
        return;
    }

    sendJson(request, response, 404, {
        error: 'Not found'
    });
};

const startServer = (config = createMiddlewareConfig(resolveMiddlewareEnv(process.env))) => {
    const server = createServer(createRequestHandler(config));
    server.listen(config.server.port, '127.0.0.1', () => {
        const publicConfig = createPublicConfig(config);
        console.log(`Scratch AI middleware listening on http://127.0.0.1:${config.server.port}`);
        console.log(`Provider: ${publicConfig.provider}; model enabled: ${publicConfig.modelEnabled}`);
    });
    return server;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    startServer();
}

export {
    ALLOWED_ORIGINS,
    createRequestHandler,
    createRuntimeStatusReply,
    MAX_HOSTED_RELEASE_BODY_BYTES,
    readAllowedOrigin,
    startServer
};
