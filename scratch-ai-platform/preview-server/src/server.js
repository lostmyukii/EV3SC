import {
    appendFileSync,
    createReadStream,
    mkdirSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import {createHash, createHmac, randomUUID, timingSafeEqual} from 'node:crypto';
import {createServer, request as httpRequest} from 'node:http';
import {isIP} from 'node:net';
import {extname, join, normalize, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_PORT = 18602;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_MIDDLEWARE_URL = 'http://127.0.0.1:8787';
const DEFAULT_ASSET_PROXY_BASE_URLS = [
    'http://cdn.assets.scratch.mit.edu/internalapi/asset/:asset/get/',
    'http://home.jxmartin.cn/build/static/internalapi/asset/:asset'
];
const DEFAULT_ASSET_PROXY_RESOLVE_HOST = 'cdn.assets.scratch.mit.edu';
const DEFAULT_ASSET_PROXY_RESOLVE_IPS = ['146.75.106.133', '151.101.66.133'];
const DEFAULT_ASSET_PROXY_TIMEOUT_MS = 12000;
const DEFAULT_ASSET_PROXY_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_PROJECT_PROXY_BASE_URLS = [
    'https://projects.scratch.mit.edu/:projectId'
];
const DEFAULT_PROJECT_PROXY_TIMEOUT_MS = 12000;
const DEFAULT_PROJECT_PROXY_MAX_BYTES = 50 * 1024 * 1024;
const PREVIEW_AUTH_REALM = 'Scratch AI preview';
const PREVIEW_LOGIN_PATH = '/preview-login';
const PREVIEW_LOGOUT_PATH = '/preview-logout';
const PREVIEW_SESSION_COOKIE = 'scratch_ai_preview_session';
const PREVIEW_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const PROXY_HEADER_ALLOWLIST = Object.freeze([
    'content-type',
    'x-scratch-ai-audit-admin-token',
    'x-scratch-ai-request-id',
    'x-scratch-ai-teacher-admin-token',
    'x-scratch-ai-teacher-session-token'
]);

const CONTENT_TYPES = Object.freeze({
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.hex': 'application/octet-stream',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.wav': 'audio/wav'
});

const SCRATCH_ASSET_FILENAME_RE = /^[a-f0-9]{32}\.(svg|png|jpg|jpeg|wav|mp3)$/i;
const SCRATCH_PROJECT_ID_RE = /^[0-9]{1,20}$/;

const parsePort = value => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
};

const trimTrailingSlash = value => String(value || '').replace(/\/+$/, '');

const parseBoolean = value => (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 'yes'
);

const normalizeHost = value => {
    const host = String(value || '').trim().toLowerCase();
    if (host.startsWith('[')) {
        const closingBracket = host.indexOf(']');
        return closingBracket === -1 ? host.slice(1) : host.slice(1, closingBracket);
    }
    return host.replace(/:\d+$/, '');
};

const readHostAllowlist = value => String(value || '')
    .split(',')
    .map(normalizeHost)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

const readCommaSeparatedList = value => String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

const parsePositiveInteger = ({
    defaultValue,
    maxValue = Number.MAX_SAFE_INTEGER,
    minValue = 1,
    value
}) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < minValue) return defaultValue;
    return Math.min(parsed, maxValue);
};

const normalizeScratchAssetFilename = value => {
    const filename = String(value || '').trim();
    return SCRATCH_ASSET_FILENAME_RE.test(filename) ? filename.toLowerCase() : '';
};

const readScratchAssetFilenameFromPath = pathname => {
    const match = String(pathname || '').match(/^\/internalapi\/asset\/([^/]+)\/get\/?$/);
    return match ? normalizeScratchAssetFilename(match[1]) : '';
};

const normalizeScratchProjectId = value => {
    const projectId = String(value || '').trim();
    return SCRATCH_PROJECT_ID_RE.test(projectId) ? projectId : '';
};

const readScratchProjectIdFromPath = pathname => {
    const match = String(pathname || '').match(/^\/internalapi\/project\/([^/]+)\/?$/);
    return match ? normalizeScratchProjectId(match[1]) : '';
};

const isScratchProjectProxyPath = pathname => String(pathname || '').indexOf('/internalapi/project/') === 0;

const readPreviewAuth = ({
    password,
    username
} = {}) => ({
    configured: Boolean(String(username || '').trim() && String(password || '').trim()),
    password: String(password || ''),
    username: String(username || '').trim()
});

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

const normalizeTlsTermination = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'node' ? 'node' : 'external';
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

const createReadinessStatus = ({
    expectHttps,
    hostAllowlist,
    publicBaseUrl,
    tlsTermination
} = {}) => {
    const publicUrl = readPublicUrlStatus(publicBaseUrl);
    const publicHostAllowed = !hostAllowlist || !hostAllowlist.length || hostAllowlist.some(host => (
        hashScopeValue(host) === publicUrl.hostHash
    ));

    return {
        schemaVersion: 'scratch-ai-preview-readiness-v1',
        publicBaseUrlConfigured: publicUrl.configured,
        publicBaseUrlScheme: publicUrl.scheme,
        publicHostHash: publicUrl.hostHash,
        domainConfigured: publicUrl.domainConfigured,
        hostAllowlistConfigured: Boolean(hostAllowlist && hostAllowlist.length),
        publicHostAllowed,
        expectHttps: Boolean(expectHttps),
        httpsReady: publicUrl.https,
        httpsRequiredButMissing: Boolean(expectHttps && !publicUrl.https),
        tlsTermination: normalizeTlsTermination(tlsTermination),
        valuesRedacted: true
    };
};

const readAssetProxyConfig = ({
    env = process.env,
    staticRoot
} = {}) => ({
    baseUrls: readCommaSeparatedList(env.SCRATCH_AI_ASSET_PROXY_BASE_URLS)
        .concat(DEFAULT_ASSET_PROXY_BASE_URLS)
        .filter((item, index, list) => list.indexOf(item) === index),
    cacheDir: resolve(env.SCRATCH_AI_ASSET_CACHE_DIR || join(staticRoot || 'static', '..', 'asset-cache')),
    maxBytes: parsePositiveInteger({
        defaultValue: DEFAULT_ASSET_PROXY_MAX_BYTES,
        maxValue: 50 * 1024 * 1024,
        minValue: 1024,
        value: env.SCRATCH_AI_ASSET_PROXY_MAX_BYTES
    }),
    resolveHost: normalizeHost(env.SCRATCH_AI_ASSET_PROXY_RESOLVE_HOST || DEFAULT_ASSET_PROXY_RESOLVE_HOST),
    resolveIps: readCommaSeparatedList(env.SCRATCH_AI_ASSET_PROXY_RESOLVE_IPS)
        .concat(DEFAULT_ASSET_PROXY_RESOLVE_IPS)
        .filter((item, index, list) => list.indexOf(item) === index),
    timeoutMs: parsePositiveInteger({
        defaultValue: DEFAULT_ASSET_PROXY_TIMEOUT_MS,
        maxValue: 60000,
        minValue: 1000,
        value: env.SCRATCH_AI_ASSET_PROXY_TIMEOUT_MS
    })
});

const readProjectProxyConfig = ({
    env = process.env,
    staticRoot
} = {}) => ({
    baseUrls: readCommaSeparatedList(env.SCRATCH_AI_PROJECT_PROXY_BASE_URLS)
        .concat(DEFAULT_PROJECT_PROXY_BASE_URLS)
        .filter((item, index, list) => list.indexOf(item) === index),
    cacheDir: resolve(env.SCRATCH_AI_PROJECT_CACHE_DIR || join(staticRoot || 'static', '..', 'project-cache')),
    maxBytes: parsePositiveInteger({
        defaultValue: DEFAULT_PROJECT_PROXY_MAX_BYTES,
        maxValue: 100 * 1024 * 1024,
        minValue: 1024,
        value: env.SCRATCH_AI_PROJECT_PROXY_MAX_BYTES
    }),
    timeoutMs: parsePositiveInteger({
        defaultValue: DEFAULT_PROJECT_PROXY_TIMEOUT_MS,
        maxValue: 60000,
        minValue: 1000,
        value: env.SCRATCH_AI_PROJECT_PROXY_TIMEOUT_MS
    })
});

const readPreviewConfig = (env = process.env) => {
    const staticRoot = resolve(env.SCRATCH_AI_STATIC_ROOT || 'static');
    return {
        assetProxy: readAssetProxyConfig({
            env,
            staticRoot
        }),
        auth: readPreviewAuth({
            password: env.SCRATCH_AI_PREVIEW_BASIC_AUTH_PASSWORD || env.SCRATCH_AI_PREVIEW_AUTH_PASSWORD,
            username: env.SCRATCH_AI_PREVIEW_BASIC_AUTH_USERNAME || env.SCRATCH_AI_PREVIEW_AUTH_USERNAME
        }),
        host: env.SCRATCH_AI_PREVIEW_HOST || DEFAULT_HOST,
        hostAllowlist: readHostAllowlist(env.SCRATCH_AI_PREVIEW_ALLOWED_HOSTS),
        expectHttps: parseBoolean(env.SCRATCH_AI_EXPECT_HTTPS),
        middlewareUrl: trimTrailingSlash(env.SCRATCH_AI_MIDDLEWARE_URL || DEFAULT_MIDDLEWARE_URL),
        port: parsePort(env.SCRATCH_AI_PREVIEW_PORT),
        projectProxy: readProjectProxyConfig({
            env,
            staticRoot
        }),
        publicBaseUrl: normalizePublicBaseUrl(env.SCRATCH_AI_PUBLIC_BASE_URL),
        tlsTermination: normalizeTlsTermination(env.SCRATCH_AI_TLS_TERMINATION),
        staticRoot
    };
};

const createSecurityHeaders = () => ({
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
});

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
};

const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeDecodeURIComponent = value => {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return '';
    }
};

const parseCookies = value => String(value || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
        const separator = item.indexOf('=');
        if (separator === -1) return cookies;
        const name = item.slice(0, separator).trim();
        if (!name) return cookies;
        cookies[name] = safeDecodeURIComponent(item.slice(separator + 1));
        return cookies;
    }, {});

const signPreviewSession = ({
    auth,
    payload
}) => createHmac('sha256', `${auth.username}:${auth.password}`)
    .update(payload)
    .digest('base64url');

const createPreviewSessionToken = ({
    auth,
    now = Date.now()
}) => {
    const payload = Buffer.from(JSON.stringify({
        iat: Math.floor(now / 1000),
        u: auth.username,
        v: 1
    })).toString('base64url');
    return `${payload}.${signPreviewSession({auth, payload})}`;
};

const hasValidPreviewSession = ({
    auth,
    now = Date.now(),
    request
}) => {
    const cookies = parseCookies(request && request.headers && request.headers.cookie);
    const token = cookies[PREVIEW_SESSION_COOKIE];
    if (!token) return false;

    const [payload, signature, extra] = String(token).split('.');
    if (!payload || !signature || extra) return false;
    if (!safeEqual(signature, signPreviewSession({auth, payload}))) return false;

    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        const issuedAt = Number(session.iat);
        const ageSeconds = Math.floor(now / 1000) - issuedAt;
        return session.v === 1 &&
            safeEqual(session.u, auth.username) &&
            Number.isFinite(issuedAt) &&
            ageSeconds >= 0 &&
            ageSeconds <= PREVIEW_SESSION_MAX_AGE_SECONDS;
    } catch (error) {
        return false;
    }
};

const readBasicAuthCredentials = request => {
    const header = String(request && request.headers && request.headers.authorization || '');
    if (!header.startsWith('Basic ')) return null;

    try {
        const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        if (separator === -1) return null;
        return {
            password: decoded.slice(separator + 1),
            username: decoded.slice(0, separator)
        };
    } catch (error) {
        return null;
    }
};

const hasPreviewAccess = ({
    auth,
    request
}) => {
    if (!auth || !auth.configured) return true;
    const credentials = readBasicAuthCredentials(request);
    if (Boolean(credentials) &&
        safeEqual(credentials.username, auth.username) &&
        safeEqual(credentials.password, auth.password)) {
        return true;
    }
    return hasValidPreviewSession({
        auth,
        request
    });
};

const hasAllowedHost = ({
    hostAllowlist,
    request
}) => {
    if (!hostAllowlist || !hostAllowlist.length) return true;
    return hostAllowlist.includes(normalizeHost(request && request.headers && request.headers.host));
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

const readUrlScope = url => ({
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
    request.scratchAiLogScope = readUrlScope(url);
    response.setHeader('X-Scratch-AI-Request-Id', request.scratchAiRequestId);
    response.once('finish', () => {
        writeStructuredEvent({
            schemaVersion: 'scratch-ai-request-log-v1',
            service: 'scratch-ai-preview-server',
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

const sendJson = (response, statusCode, payload) => {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        ...createSecurityHeaders()
    });
    response.end(JSON.stringify(payload));
};

const sendHtml = (response, statusCode, html, headers = {}) => {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        ...createSecurityHeaders(),
        ...headers
    });
    response.end(html);
};

const sendUnauthorized = response => {
    response.writeHead(401, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        ...createSecurityHeaders()
    });
    response.end(JSON.stringify({
        error: 'Scratch AI preview access requires authentication.'
    }));
};

const sendForbidden = response => {
    response.writeHead(403, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        ...createSecurityHeaders()
    });
    response.end(JSON.stringify({
        error: 'Scratch AI preview host is not allowed.'
    }));
};

const normalizeReturnTo = value => {
    const candidate = String(value || '/');
    if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
    if (candidate.includes('\r') || candidate.includes('\n')) return '/';
    if (candidate.startsWith(PREVIEW_LOGIN_PATH) || candidate.startsWith(PREVIEW_LOGOUT_PATH)) return '/';
    return candidate;
};

const isHtmlNavigation = ({
    request,
    url
}) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    if (isProxyPath(url.pathname) || url.pathname === '/preview-statusz') return false;
    if (readScratchAssetFilenameFromPath(url.pathname) || isScratchProjectProxyPath(url.pathname)) return false;
    const extension = extname(url.pathname);
    if (extension && extension !== '.html') return false;
    const accept = String(request.headers.accept || '');
    return !accept || accept.includes('text/html') || accept.includes('*/*');
};

const renderPreviewLoginPage = ({
    errorMessage = '',
    returnTo = '/'
} = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(PREVIEW_AUTH_REALM)}</title>
<style>
:root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* {
    box-sizing: border-box;
}
body {
    align-items: center;
    background: #f7f7f4;
    color: #202124;
    display: flex;
    justify-content: center;
    margin: 0;
    min-height: 100vh;
    padding: 24px;
}
main {
    background: #ffffff;
    border: 1px solid #dedbd2;
    border-radius: 8px;
    box-shadow: 0 18px 50px rgba(32, 33, 36, 0.12);
    max-width: 390px;
    padding: 28px;
    width: 100%;
}
.eyebrow {
    color: #6f665a;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
    margin: 0 0 8px;
    text-transform: uppercase;
}
h1 {
    font-size: 24px;
    line-height: 1.2;
    margin: 0 0 22px;
}
label {
    display: block;
    font-size: 13px;
    font-weight: 700;
    margin: 16px 0 6px;
}
input {
    border: 1px solid #c9c5bb;
    border-radius: 6px;
    font: inherit;
    height: 42px;
    padding: 8px 10px;
    width: 100%;
}
input:focus {
    border-color: #8b5d33;
    box-shadow: 0 0 0 3px rgba(139, 93, 51, 0.18);
    outline: none;
}
.error {
    background: #fff2f1;
    border: 1px solid #f0b2ac;
    border-radius: 6px;
    color: #8a1f17;
    font-size: 13px;
    margin: 0 0 16px;
    padding: 10px 12px;
}
button {
    background: #2f6f5e;
    border: 0;
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    height: 42px;
    margin-top: 22px;
    width: 100%;
}
button:focus {
    box-shadow: 0 0 0 3px rgba(47, 111, 94, 0.25);
    outline: none;
}
</style>
</head>
<body>
<main>
<p class="eyebrow">Scratch AI</p>
<h1>Preview access</h1>
${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ''}
<form method="post" action="${PREVIEW_LOGIN_PATH}">
<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
<label for="username">Username</label>
<input id="username" name="username" autocomplete="username" autofocus required>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button>
</form>
</main>
</body>
</html>`;

const readRequestBody = (request, maxBytes = 8192) => new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    request.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
            reject(new Error('Request body is too large'));
            request.destroy();
            return;
        }
        chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
    });
});

const createPreviewSessionCookie = token => [
    `${PREVIEW_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    `Max-Age=${PREVIEW_SESSION_MAX_AGE_SECONDS}`,
    'Path=/',
    'SameSite=Lax'
].join('; ');

const createExpiredPreviewSessionCookie = () => [
    `${PREVIEW_SESSION_COOKIE}=`,
    'HttpOnly',
    'Max-Age=0',
    'Path=/',
    'SameSite=Lax'
].join('; ');

const sendPreviewLoginPage = ({
    errorMessage,
    response,
    returnTo,
    statusCode = 200
}) => {
    sendHtml(response, statusCode, renderPreviewLoginPage({
        errorMessage,
        returnTo: normalizeReturnTo(returnTo)
    }));
};

const handlePreviewLogin = async ({
    auth,
    request,
    response,
    url
}) => {
    if (!auth || !auth.configured) {
        response.writeHead(303, {
            Location: '/',
            ...createSecurityHeaders()
        });
        response.end();
        return;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
        sendPreviewLoginPage({
            response,
            returnTo: url.searchParams.get('returnTo') || '/'
        });
        return;
    }

    if (request.method !== 'POST') {
        sendJson(response, 405, {error: 'Method not allowed'});
        return;
    }

    try {
        const body = await readRequestBody(request);
        const form = new URLSearchParams(body);
        const username = form.get('username') || '';
        const password = form.get('password') || '';
        const returnTo = normalizeReturnTo(form.get('returnTo') || '/');
        if (!safeEqual(username, auth.username) || !safeEqual(password, auth.password)) {
            sendPreviewLoginPage({
                errorMessage: 'Invalid username or password.',
                response,
                returnTo,
                statusCode: 401
            });
            return;
        }

        response.writeHead(303, {
            'Set-Cookie': createPreviewSessionCookie(createPreviewSessionToken({auth})),
            Location: returnTo,
            ...createSecurityHeaders()
        });
        response.end();
    } catch (error) {
        sendJson(response, 400, {error: error.message});
    }
};

const handlePreviewLogout = response => {
    response.writeHead(303, {
        'Set-Cookie': createExpiredPreviewSessionCookie(),
        Location: PREVIEW_LOGIN_PATH,
        ...createSecurityHeaders()
    });
    response.end();
};

const createPreviewStatus = ({
    assetProxy,
    auth,
    expectHttps,
    hostAllowlist,
    middlewareUrl,
    projectProxy,
    publicBaseUrl,
    tlsTermination,
    staticRoot
}) => ({
    service: 'scratch-ai-preview-server',
    ready: true,
    accessControl: {
        basicAuthConfigured: Boolean(auth && auth.configured),
        hostAllowlistConfigured: Boolean(hostAllowlist && hostAllowlist.length),
        valuesRedacted: true
    },
    monitoring: {
        statusRoute: '/preview-statusz',
        uptimeSeconds: Math.round(process.uptime())
    },
    readiness: createReadinessStatus({
        expectHttps,
        hostAllowlist,
        publicBaseUrl,
        tlsTermination
    }),
    proxy: {
        middlewareConfigured: Boolean(middlewareUrl),
        middlewareUrlRedacted: true
    },
    scratchAssets: {
        cacheConfigured: Boolean(assetProxy && assetProxy.cacheDir),
        cacheDirRedacted: true,
        proxyConfigured: Boolean(assetProxy && assetProxy.baseUrls && assetProxy.baseUrls.length),
        sourceCount: assetProxy && assetProxy.baseUrls ? assetProxy.baseUrls.length : 0,
        sourceValuesRedacted: true
    },
    scratchProjects: {
        cacheConfigured: Boolean(projectProxy && projectProxy.cacheDir),
        cacheDirRedacted: true,
        proxyConfigured: Boolean(projectProxy && projectProxy.baseUrls && projectProxy.baseUrls.length),
        sourceCount: projectProxy && projectProxy.baseUrls ? projectProxy.baseUrls.length : 0,
        sourceValuesRedacted: true
    },
    static: {
        configured: Boolean(staticRoot),
        rootRedacted: true
    }
});

const readProxyHeaders = request => {
    const headers = {};
    PROXY_HEADER_ALLOWLIST.forEach(headerName => {
        const value = request.headers[headerName];
        if (value) headers[headerName] = value;
    });
    if (request.scratchAiRequestId) headers['x-scratch-ai-request-id'] = request.scratchAiRequestId;
    if (!headers['content-type']) headers['content-type'] = 'application/json';
    return headers;
};

const isProxyPath = pathname => (
    pathname === '/healthz' ||
    pathname === '/statusz' ||
    pathname === '/api/v1/nl-blocks/script-draft' ||
    pathname === '/api/v1/socratic-chat' ||
    pathname.indexOf('/api/v1/assets/') === 0 ||
    pathname.indexOf('/api/v1/release/') === 0 ||
    pathname.indexOf('/api/v1/teacher/') === 0
);

const proxyRequest = async ({
    middlewareUrl,
    request,
    response,
    url
}) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('error', error => {
        sendJson(response, 502, {error: error.message});
    });
    request.on('end', async () => {
        try {
            const proxyResponse = await fetch(`${middlewareUrl}${url.pathname}${url.search}`, {
                body: chunks.length ? Buffer.concat(chunks) : null,
                headers: readProxyHeaders(request),
                method: request.method
            });
            const responseBody = Buffer.from(await proxyResponse.arrayBuffer());
            response.writeHead(proxyResponse.status, {
                'Cache-Control': 'no-store',
                'Content-Type': proxyResponse.headers.get('content-type') || 'application/json; charset=utf-8',
                ...createSecurityHeaders()
            });
            response.end(responseBody);
        } catch (error) {
            sendJson(response, 502, {
                error: 'Scratch AI preview proxy failed.',
                detail: error.message
            });
        }
    });
};

const createScratchAssetSourceUrl = ({
    assetFilename,
    baseUrl
}) => {
    const template = String(baseUrl || '');
    if (template.includes(':asset')) {
        return template.replace(/:asset/g, encodeURIComponent(assetFilename));
    }
    return `${trimTrailingSlash(template)}/${encodeURIComponent(assetFilename)}`;
};

const fetchHttpAssetFromSource = ({
    maxBytes,
    resolveHost,
    sourceUrl,
    timeoutMs
}) => new Promise((resolveFetch, rejectFetch) => {
    const parsedUrl = new URL(sourceUrl);
    const request = httpRequest({
        headers: {
            Host: resolveHost || parsedUrl.host
        },
        hostname: parsedUrl.hostname,
        method: 'GET',
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        port: parsedUrl.port || 80
    }, upstreamResponse => {
        if (upstreamResponse.statusCode < 200 || upstreamResponse.statusCode >= 300) {
            upstreamResponse.resume();
            rejectFetch(new Error(`asset upstream status ${upstreamResponse.statusCode}`));
            return;
        }

        const chunks = [];
        let totalBytes = 0;
        upstreamResponse.on('data', chunk => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                request.destroy(new Error('asset upstream response too large'));
                return;
            }
            chunks.push(chunk);
        });
        upstreamResponse.on('end', () => {
            resolveFetch({
                body: Buffer.concat(chunks),
                contentType: upstreamResponse.headers['content-type'] || '',
                sourceHost: resolveHost
            });
        });
    });

    request.setTimeout(timeoutMs, () => {
        request.destroy(new Error('asset upstream timeout'));
    });
    request.on('error', rejectFetch);
    request.end();
});

const fetchScratchAssetFromSource = async ({
    assetFilename,
    assetProxy,
    baseUrl,
    resolveIp
}) => {
    const sourceUrl = createScratchAssetSourceUrl({
        assetFilename,
        baseUrl
    });
    const parsedUrl = new URL(sourceUrl);
    const resolvedSourceUrl = resolveIp ?
        `http://${resolveIp}${parsedUrl.pathname}${parsedUrl.search}` :
        sourceUrl;
    const resolveHost = resolveIp ? parsedUrl.host : parsedUrl.hostname;

    if (parsedUrl.protocol === 'http:') {
        return fetchHttpAssetFromSource({
            maxBytes: assetProxy.maxBytes,
            resolveHost,
            sourceUrl: resolvedSourceUrl,
            timeoutMs: assetProxy.timeoutMs
        });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), assetProxy.timeoutMs);
    try {
        const upstreamResponse = await fetch(sourceUrl, {
            signal: abortController.signal
        });
        if (!upstreamResponse.ok) {
            throw new Error(`asset upstream status ${upstreamResponse.status}`);
        }
        const body = Buffer.from(await upstreamResponse.arrayBuffer());
        if (body.length > assetProxy.maxBytes) {
            throw new Error('asset upstream response too large');
        }
        return {
            body,
            contentType: upstreamResponse.headers.get('content-type') || '',
            sourceHost: parsedUrl.hostname
        };
    } finally {
        clearTimeout(timeout);
    }
};

const fetchScratchAsset = async ({
    assetFilename,
    assetProxy
}) => {
    const errors = [];
    for (const baseUrl of assetProxy.baseUrls) {
        let parsedUrl;
        try {
            parsedUrl = new URL(createScratchAssetSourceUrl({
                assetFilename,
                baseUrl
            }));
        } catch (error) {
            errors.push(error.message);
            continue;
        }
        const shouldResolveByIp = parsedUrl.protocol === 'http:' &&
            normalizeHost(parsedUrl.hostname) === assetProxy.resolveHost &&
            assetProxy.resolveIps.length;
        const resolveIps = shouldResolveByIp ? assetProxy.resolveIps : [''];
        for (const resolveIp of resolveIps) {
            try {
                return await fetchScratchAssetFromSource({
                    assetFilename,
                    assetProxy,
                    baseUrl,
                    resolveIp
                });
            } catch (error) {
                errors.push(error.message);
            }
        }
    }
    throw new Error(errors[errors.length - 1] || 'asset upstream unavailable');
};

const getScratchAssetCachePath = ({
    assetFilename,
    assetProxy
}) => resolve(assetProxy.cacheDir, assetFilename);

const writeScratchAssetCache = ({
    assetFilename,
    assetProxy,
    body
}) => {
    mkdirSync(assetProxy.cacheDir, {
        recursive: true
    });
    const cachePath = getScratchAssetCachePath({
        assetFilename,
        assetProxy
    });
    const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        writeFileSync(tmpPath, body);
        renameSync(tmpPath, cachePath);
    } catch (error) {
        try {
            unlinkSync(tmpPath);
        } catch (cleanupError) {
            // Ignore cleanup failures; the response can still be served from memory.
        }
    }
};

const sendScratchAssetBuffer = ({
    assetFilename,
    body,
    response
}) => {
    response.writeHead(200, {
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': body.length,
        'Content-Type': CONTENT_TYPES[extname(assetFilename)] || 'application/octet-stream',
        ...createSecurityHeaders()
    });
    response.end(body);
};

const serveCachedScratchAsset = ({
    assetFilename,
    assetProxy,
    request,
    response
}) => {
    const cachePath = getScratchAssetCachePath({
        assetFilename,
        assetProxy
    });
    try {
        const fileStat = statSync(cachePath);
        if (!fileStat.isFile()) return false;
        response.writeHead(200, {
            'Cache-Control': 'public, max-age=86400',
            'Content-Length': fileStat.size,
            'Content-Type': CONTENT_TYPES[extname(assetFilename)] || 'application/octet-stream',
            ...createSecurityHeaders()
        });
        if (request.method === 'HEAD') {
            response.end();
            return true;
        }
        createReadStream(cachePath).pipe(response);
        return true;
    } catch (error) {
        return false;
    }
};

const handleScratchAssetRequest = async ({
    assetProxy,
    request,
    response,
    url
}) => {
    const assetFilename = readScratchAssetFilenameFromPath(url.pathname);
    if (!assetFilename) {
        sendJson(response, 404, {error: 'Not found'});
        return;
    }

    if (serveCachedScratchAsset({
        assetFilename,
        assetProxy,
        request,
        response
    })) {
        return;
    }

    try {
        const fetchedAsset = await fetchScratchAsset({
            assetFilename,
            assetProxy
        });
        writeScratchAssetCache({
            assetFilename,
            assetProxy,
            body: fetchedAsset.body
        });
        if (request.method === 'HEAD') {
            response.writeHead(200, {
                'Cache-Control': 'public, max-age=86400',
                'Content-Length': fetchedAsset.body.length,
                'Content-Type': CONTENT_TYPES[extname(assetFilename)] || fetchedAsset.contentType || 'application/octet-stream',
                ...createSecurityHeaders()
            });
            response.end();
            return;
        }
        sendScratchAssetBuffer({
            assetFilename,
            body: fetchedAsset.body,
            response
        });
    } catch (error) {
        sendJson(response, 502, {
            error: 'Scratch asset proxy failed.',
            route: '/internalapi/asset/:asset/get/'
        });
    }
};

const createScratchProjectSourceUrl = ({
    baseUrl,
    projectId
}) => {
    const template = String(baseUrl || '');
    if (template.includes(':projectId')) {
        return template.replace(/:projectId/g, encodeURIComponent(projectId));
    }
    return `${trimTrailingSlash(template)}/${encodeURIComponent(projectId)}`;
};

const createUpstreamStatusError = ({
    message,
    statusCode
}) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const fetchScratchProjectFromSource = async ({
    baseUrl,
    projectId,
    projectProxy
}) => {
    const sourceUrl = createScratchProjectSourceUrl({
        baseUrl,
        projectId
    });
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), projectProxy.timeoutMs);
    try {
        const upstreamResponse = await fetch(sourceUrl, {
            signal: abortController.signal
        });
        if (!upstreamResponse.ok) {
            throw createUpstreamStatusError({
                message: `project upstream status ${upstreamResponse.status}`,
                statusCode: upstreamResponse.status
            });
        }
        const body = Buffer.from(await upstreamResponse.arrayBuffer());
        if (body.length > projectProxy.maxBytes) {
            throw new Error('project upstream response too large');
        }
        JSON.parse(body.toString('utf8'));
        return {
            body
        };
    } finally {
        clearTimeout(timeout);
    }
};

const fetchScratchProject = async ({
    projectId,
    projectProxy
}) => {
    const errors = [];
    for (const baseUrl of projectProxy.baseUrls) {
        try {
            return await fetchScratchProjectFromSource({
                baseUrl,
                projectId,
                projectProxy
            });
        } catch (error) {
            errors.push(error);
        }
    }
    throw errors[errors.length - 1] || new Error('project upstream unavailable');
};

const getScratchProjectCachePath = ({
    projectId,
    projectProxy
}) => resolve(projectProxy.cacheDir, `${projectId}.json`);

const writeScratchProjectCache = ({
    body,
    projectId,
    projectProxy
}) => {
    mkdirSync(projectProxy.cacheDir, {
        recursive: true
    });
    const cachePath = getScratchProjectCachePath({
        projectId,
        projectProxy
    });
    const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        writeFileSync(tmpPath, body);
        renameSync(tmpPath, cachePath);
    } catch (error) {
        try {
            unlinkSync(tmpPath);
        } catch (cleanupError) {
            // Ignore cleanup failures; the response can still be served from memory.
        }
    }
};

const sendScratchProjectBuffer = ({
    body,
    response
}) => {
    response.writeHead(200, {
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': body.length,
        'Content-Type': 'application/json; charset=utf-8',
        ...createSecurityHeaders()
    });
    response.end(body);
};

const serveCachedScratchProject = ({
    projectId,
    projectProxy,
    request,
    response
}) => {
    const cachePath = getScratchProjectCachePath({
        projectId,
        projectProxy
    });
    try {
        const fileStat = statSync(cachePath);
        if (!fileStat.isFile()) return false;
        response.writeHead(200, {
            'Cache-Control': 'public, max-age=86400',
            'Content-Length': fileStat.size,
            'Content-Type': 'application/json; charset=utf-8',
            ...createSecurityHeaders()
        });
        if (request.method === 'HEAD') {
            response.end();
            return true;
        }
        createReadStream(cachePath).pipe(response);
        return true;
    } catch (error) {
        return false;
    }
};

const handleScratchProjectRequest = async ({
    projectProxy,
    request,
    response,
    url
}) => {
    const projectId = readScratchProjectIdFromPath(url.pathname);
    if (!projectId) {
        sendJson(response, 404, {error: 'Not found'});
        return;
    }

    if (serveCachedScratchProject({
        projectId,
        projectProxy,
        request,
        response
    })) {
        return;
    }

    try {
        const fetchedProject = await fetchScratchProject({
            projectId,
            projectProxy
        });
        writeScratchProjectCache({
            body: fetchedProject.body,
            projectId,
            projectProxy
        });
        if (request.method === 'HEAD') {
            response.writeHead(200, {
                'Cache-Control': 'public, max-age=86400',
                'Content-Length': fetchedProject.body.length,
                'Content-Type': 'application/json; charset=utf-8',
                ...createSecurityHeaders()
            });
            response.end();
            return;
        }
        sendScratchProjectBuffer({
            body: fetchedProject.body,
            response
        });
    } catch (error) {
        sendJson(response, error.statusCode === 404 ? 404 : 502, {
            error: 'Scratch project proxy failed.',
            route: '/internalapi/project/:projectId'
        });
    }
};

const resolveStaticPath = (staticRoot, pathname) => {
    const decodedPath = decodeURIComponent(pathname);
    const safePath = normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = resolve(staticRoot, `.${safePath}`);
    const rootWithSeparator = staticRoot.endsWith(sep) ? staticRoot : `${staticRoot}${sep}`;
    if (candidatePath !== staticRoot && candidatePath.indexOf(rootWithSeparator) !== 0) {
        return null;
    }
    return candidatePath;
};

const normalizeStaticRequestPath = pathname => {
    if (pathname === '/preview' || pathname === '/preview/') {
        return '/index.html';
    }
    if (String(pathname || '').indexOf('/preview/') === 0) {
        return pathname.slice('/preview'.length);
    }
    return pathname;
};

const serveStatic = ({
    request,
    response,
    staticRoot,
    url
}) => {
    const staticPathname = normalizeStaticRequestPath(url.pathname);
    const candidatePath = resolveStaticPath(staticRoot, staticPathname === '/' ? '/index.html' : staticPathname);
    if (!candidatePath) {
        sendJson(response, 403, {error: 'Forbidden'});
        return;
    }

    let filePath = candidatePath;
    try {
        const fileStat = statSync(filePath);
        if (fileStat.isDirectory()) filePath = join(filePath, 'index.html');
    } catch (error) {
        filePath = join(staticRoot, 'index.html');
    }

    try {
        const fileStat = statSync(filePath);
        if (!fileStat.isFile()) {
            sendJson(response, 404, {error: 'Not found'});
            return;
        }
        response.writeHead(200, {
            'Cache-Control': extname(filePath) === '.html' ? 'no-store' : 'public, max-age=300',
            'Content-Length': fileStat.size,
            'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream',
            ...createSecurityHeaders()
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        createReadStream(filePath).pipe(response);
    } catch (error) {
        sendJson(response, 404, {error: 'Not found'});
    }
};

const createRequestHandler = ({
    staticRoot,
    assetProxy = readAssetProxyConfig({staticRoot}),
    auth = readPreviewAuth(),
    expectHttps = false,
    hostAllowlist = [],
    middlewareUrl,
    projectProxy = readProjectProxyConfig({staticRoot}),
    publicBaseUrl = '',
    tlsTermination = 'external'
}) => (request, response) => {
    const url = new URL(request.url, 'http://scratch-ai-preview.local');
    installStructuredRequestLog({
        request,
        response,
        url
    });

    if (!hasAllowedHost({
        hostAllowlist,
        request
    })) {
        sendForbidden(response);
        return;
    }

    if (url.pathname === PREVIEW_LOGIN_PATH) {
        handlePreviewLogin({
            auth,
            request,
            response,
            url
        });
        return;
    }

    if (url.pathname === PREVIEW_LOGOUT_PATH) {
        handlePreviewLogout(response);
        return;
    }

    if (!hasPreviewAccess({
        auth,
        request
    })) {
        if (isHtmlNavigation({
            request,
            url
        })) {
            sendPreviewLoginPage({
                response,
                returnTo: `${url.pathname}${url.search}`
            });
            return;
        }
        sendUnauthorized(response);
        return;
    }

    if (request.method === 'GET' && url.pathname === '/preview-statusz') {
        sendJson(response, 200, createPreviewStatus({
            assetProxy,
            auth,
            expectHttps,
            hostAllowlist,
            middlewareUrl,
            projectProxy,
            publicBaseUrl,
            tlsTermination,
            staticRoot
        }));
        return;
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && readScratchAssetFilenameFromPath(url.pathname)) {
        handleScratchAssetRequest({
            assetProxy,
            request,
            response,
            url
        });
        return;
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && isScratchProjectProxyPath(url.pathname)) {
        handleScratchProjectRequest({
            projectProxy,
            request,
            response,
            url
        });
        return;
    }

    if (isProxyPath(url.pathname)) {
        proxyRequest({
            middlewareUrl,
            request,
            response,
            url
        });
        return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, {error: 'Method not allowed'});
        return;
    }

    serveStatic({
        request,
        response,
        staticRoot,
        url
    });
};

const startServer = (config = readPreviewConfig(process.env)) => {
    const {
        assetProxy,
        auth,
        expectHttps,
        hostAllowlist,
        host,
        middlewareUrl,
        port,
        projectProxy,
        publicBaseUrl,
        tlsTermination,
        staticRoot
    } = config;
    const server = createServer(createRequestHandler({
        assetProxy,
        auth,
        expectHttps,
        hostAllowlist,
        middlewareUrl,
        projectProxy,
        publicBaseUrl,
        tlsTermination,
        staticRoot
    }));
    server.listen(port, host, () => {
        console.log(`Scratch AI preview listening on http://${host}:${port}`);
        console.log(`Static root: ${staticRoot}`);
        console.log(`Middleware proxy: ${middlewareUrl}`);
        console.log(`Scratch asset cache configured: ${assetProxy && assetProxy.cacheDir ? 'true' : 'false'}`);
        console.log(`Scratch project cache configured: ${projectProxy && projectProxy.cacheDir ? 'true' : 'false'}`);
        console.log(`Basic auth configured: ${auth && auth.configured ? 'true' : 'false'}`);
        console.log(`Host allowlist configured: ${hostAllowlist && hostAllowlist.length ? 'true' : 'false'}`);
        console.log(`Public base URL configured: ${publicBaseUrl ? 'true' : 'false'}`);
    });
    return server;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    startServer();
}

export {
    createRequestHandler,
    createPreviewStatus,
    readBasicAuthCredentials,
    readAssetProxyConfig,
    readHostAllowlist,
    readProjectProxyConfig,
    readPreviewConfig,
    startServer
};
