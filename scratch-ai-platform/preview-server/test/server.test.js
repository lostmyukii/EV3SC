import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, writeFile} from 'node:fs/promises';
import {createServer, request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
    createRequestHandler,
    readBasicAuthCredentials,
    readHostAllowlist,
    readPreviewConfig
} from '../src/server.js';

const createBasicAuth = (username, password) => `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const requestPreviewStatusWithHost = ({
    hostHeader,
    port
}) => new Promise((resolve, reject) => {
    const request = httpRequest({
        headers: {
            Host: hostHeader
        },
        host: '127.0.0.1',
        method: 'GET',
        path: '/preview-statusz',
        port
    }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
            resolve({
                body: Buffer.concat(chunks).toString('utf8'),
                statusCode: response.statusCode
            });
        });
    });
    request.on('error', reject);
    request.end();
});

test('parses preview auth config without exposing secrets', () => {
    const config = readPreviewConfig({
        SCRATCH_AI_MIDDLEWARE_URL: 'http://127.0.0.1:9999/',
        SCRATCH_AI_PREVIEW_ALLOWED_HOSTS: 'scratch-ai.example, 49.232.81.132, scratch-ai.example',
        SCRATCH_AI_PREVIEW_AUTH_PASSWORD: 'secret',
        SCRATCH_AI_PREVIEW_AUTH_USERNAME: 'teacher',
        SCRATCH_AI_PREVIEW_PORT: '19000',
        SCRATCH_AI_PUBLIC_BASE_URL: 'https://scratch-ai.example/',
        SCRATCH_AI_EXPECT_HTTPS: 'true',
        SCRATCH_AI_STATIC_ROOT: '/tmp/static'
    });

    assert.equal(config.auth.configured, true);
    assert.equal(config.auth.username, 'teacher');
    assert.equal(config.auth.password, 'secret');
    assert.deepEqual(config.hostAllowlist, ['scratch-ai.example', '49.232.81.132']);
    assert.equal(config.publicBaseUrl, 'https://scratch-ai.example');
    assert.equal(config.expectHttps, true);
    assert.equal(config.middlewareUrl, 'http://127.0.0.1:9999');
    assert.equal(config.port, 19000);
});

test('normalizes preview host allowlist entries', () => {
    assert.deepEqual(
        readHostAllowlist('Scratch-AI.example:18602, [::1]:18602, 127.0.0.1:18602'),
        ['scratch-ai.example', '::1', '127.0.0.1']
    );
});

test('reads basic auth credentials from request headers', () => {
    const credentials = readBasicAuthCredentials({
        headers: {
            authorization: createBasicAuth('teacher', 'secret')
        }
    });

    assert.deepEqual(credentials, {
        password: 'secret',
        username: 'teacher'
    });
});

test('shows browser login page when preview auth is configured', async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-static-'));
    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Scratch AI</title>');
    const server = createServer(createRequestHandler({
        auth: {
            configured: true,
            password: 'secret',
            username: 'teacher'
        },
        hostAllowlist: ['127.0.0.1'],
        middlewareUrl: 'http://127.0.0.1:9',
        staticRoot
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const lockedResponse = await fetch(`http://127.0.0.1:${port}/`);
        const lockedHtml = await lockedResponse.text();
        assert.equal(lockedResponse.status, 200);
        assert.equal(lockedHtml.includes('Preview access'), true);
        assert.equal(lockedResponse.headers.get('www-authenticate'), null);

        const jsonLockedResponse = await fetch(`http://127.0.0.1:${port}/preview-statusz`);
        assert.equal(jsonLockedResponse.status, 401);
        assert.equal(jsonLockedResponse.headers.get('www-authenticate'), null);

        const okResponse = await fetch(`http://127.0.0.1:${port}/`, {
            headers: {
                Authorization: createBasicAuth('teacher', 'secret')
            }
        });
        const html = await okResponse.text();
        assert.equal(okResponse.status, 200);
        assert.equal(html.includes('Scratch AI'), true);
        assert.equal(okResponse.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(okResponse.headers.get('x-frame-options'), 'SAMEORIGIN');

        const statusResponse = await fetch(`http://127.0.0.1:${port}/preview-statusz`, {
            headers: {
                Authorization: createBasicAuth('teacher', 'secret')
            }
        });
        const statusJson = await statusResponse.json();
        assert.equal(statusJson.ready, true);
        assert.equal(statusJson.accessControl.basicAuthConfigured, true);
        assert.equal(statusJson.accessControl.hostAllowlistConfigured, true);
        assert.equal(statusJson.readiness.publicBaseUrlConfigured, false);
        assert.equal(statusJson.readiness.valuesRedacted, true);
        assert.equal(Boolean(statusResponse.headers.get('x-scratch-ai-request-id')), true);
        assert.equal(JSON.stringify(statusJson).includes('secret'), false);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(staticRoot, {
            force: true,
            recursive: true
        });
    }
});

test('issues preview session cookie from login form', async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-static-'));
    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Scratch AI</title>');
    const server = createServer(createRequestHandler({
        auth: {
            configured: true,
            password: 'secret',
            username: 'teacher'
        },
        middlewareUrl: 'http://127.0.0.1:9',
        staticRoot
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const badLoginResponse = await fetch(`http://127.0.0.1:${port}/preview-login`, {
            body: new URLSearchParams({
                password: 'wrong',
                returnTo: '/',
                username: 'teacher'
            }),
            method: 'POST'
        });
        const badLoginHtml = await badLoginResponse.text();
        assert.equal(badLoginResponse.status, 401);
        assert.equal(badLoginHtml.includes('Invalid username or password.'), true);

        const loginResponse = await fetch(`http://127.0.0.1:${port}/preview-login`, {
            body: new URLSearchParams({
                password: 'secret',
                returnTo: '/preview-statusz',
                username: 'teacher'
            }),
            method: 'POST',
            redirect: 'manual'
        });
        const setCookie = loginResponse.headers.get('set-cookie');
        assert.equal(loginResponse.status, 303);
        assert.equal(loginResponse.headers.get('location'), '/preview-statusz');
        assert.match(setCookie, /scratch_ai_preview_session=/);
        assert.match(setCookie, /HttpOnly/);

        const statusResponse = await fetch(`http://127.0.0.1:${port}/preview-statusz`, {
            headers: {
                Cookie: setCookie.split(';')[0]
            }
        });
        const statusJson = await statusResponse.json();
        assert.equal(statusResponse.status, 200);
        assert.equal(statusJson.accessControl.basicAuthConfigured, true);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(staticRoot, {
            force: true,
            recursive: true
        });
    }
});

test('serves static assets correctly under the legacy /preview path', async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-static-'));
    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><script src="gui.js"></script>');
    await writeFile(join(staticRoot, 'gui.js'), 'window.scratchAiPreviewLoaded = true;');
    const server = createServer(createRequestHandler({
        auth: {
            configured: false
        },
        middlewareUrl: 'http://127.0.0.1:9',
        staticRoot
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const indexResponse = await fetch(`http://127.0.0.1:${port}/preview/index.html`);
        assert.equal(indexResponse.status, 200);
        assert.equal(indexResponse.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.equal((await indexResponse.text()).includes('gui.js'), true);

        const scriptResponse = await fetch(`http://127.0.0.1:${port}/preview/gui.js`);
        assert.equal(scriptResponse.status, 200);
        assert.equal(scriptResponse.headers.get('content-type'), 'application/javascript; charset=utf-8');
        assert.equal(await scriptResponse.text(), 'window.scratchAiPreviewLoaded = true;');
    } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(staticRoot, {
            force: true,
            recursive: true
        });
    }
});

test('blocks requests from hosts outside the configured allowlist', async () => {
    const server = createServer(createRequestHandler({
        auth: {
            configured: false
        },
        hostAllowlist: ['scratch-ai.example'],
        middlewareUrl: 'http://127.0.0.1:9',
        staticRoot: tmpdir()
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const blockedResponse = await requestPreviewStatusWithHost({
            hostHeader: 'evil.example',
            port
        });
        assert.equal(blockedResponse.statusCode, 403);

        const okResponse = await requestPreviewStatusWithHost({
            hostHeader: 'scratch-ai.example',
            port
        });
        const okJson = JSON.parse(okResponse.body);
        assert.equal(okResponse.statusCode, 200);
        assert.equal(okJson.accessControl.hostAllowlistConfigured, true);
        assert.equal(okJson.readiness.publicBaseUrlConfigured, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('reports HTTPS and domain readiness without exposing the public URL', async () => {
    const server = createServer(createRequestHandler({
        auth: {
            configured: false
        },
        expectHttps: true,
        hostAllowlist: ['scratch-ai.example'],
        middlewareUrl: 'http://127.0.0.1:9',
        publicBaseUrl: 'https://scratch-ai.example',
        staticRoot: tmpdir(),
        tlsTermination: 'external'
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const response = await requestPreviewStatusWithHost({
            hostHeader: 'scratch-ai.example',
            port
        });
        const json = JSON.parse(response.body);

        assert.equal(response.statusCode, 200);
        assert.equal(json.readiness.publicBaseUrlConfigured, true);
        assert.equal(json.readiness.publicBaseUrlScheme, 'https');
        assert.equal(json.readiness.domainConfigured, true);
        assert.equal(json.readiness.httpsReady, true);
        assert.equal(json.readiness.httpsRequiredButMissing, false);
        assert.equal(json.readiness.publicHostAllowed, true);
        assert.equal(JSON.stringify(json).includes('https://scratch-ai.example'), false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('forwards only allowed administrative headers to middleware proxy', async () => {
    let capturedHeaders = null;
    const middlewareServer = createServer((request, response) => {
        capturedHeaders = request.headers;
        response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify({
            ok: true
        }));
    });
    await new Promise(resolve => middlewareServer.listen(0, '127.0.0.1', resolve));
    const middlewarePort = middlewareServer.address().port;

    const previewServer = createServer(createRequestHandler({
        auth: {
            configured: true,
            password: 'secret',
            username: 'teacher'
        },
        middlewareUrl: `http://127.0.0.1:${middlewarePort}`,
        staticRoot: tmpdir()
    }));
    await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const previewPort = previewServer.address().port;

    try {
        const response = await fetch(`http://127.0.0.1:${previewPort}/api/v1/teacher/knowledge-lock`, {
            method: 'POST',
            headers: {
                Authorization: createBasicAuth('teacher', 'secret'),
                'Content-Type': 'application/json',
                'X-Not-Forwarded': 'private',
                'X-Scratch-AI-Teacher-Session-Token': 'session-token'
            },
            body: JSON.stringify({
                teacherConsent: true
            })
        });
        const responseJson = await response.json();

        assert.equal(response.status, 200);
        assert.equal(responseJson.ok, true);
        assert.equal(capturedHeaders['x-scratch-ai-request-id'].length > 0, true);
        assert.equal(capturedHeaders['x-scratch-ai-teacher-session-token'], 'session-token');
        assert.equal(capturedHeaders['x-not-forwarded'], undefined);
        assert.equal(capturedHeaders.authorization, undefined);
    } finally {
        await new Promise(resolve => previewServer.close(resolve));
        await new Promise(resolve => middlewareServer.close(resolve));
    }
});

test('proxies Scratch library assets through a local cache', async () => {
    const assetFilename = '809d9b47347a6af2860e7a3a35bce057.svg';
    const assetBody = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    let upstreamHits = 0;
    const upstreamServer = createServer((request, response) => {
        upstreamHits++;
        assert.equal(request.url, `/internalapi/asset/${assetFilename}/get/`);
        response.writeHead(200, {
            'Content-Type': 'image/svg+xml; charset=utf-8'
        });
        response.end(assetBody);
    });
    await new Promise(resolve => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstreamServer.address().port;

    const staticRoot = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-static-'));
    const cacheDir = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-assets-'));
    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Scratch AI</title>');
    const previewServer = createServer(createRequestHandler({
        assetProxy: {
            baseUrls: [`http://127.0.0.1:${upstreamPort}/internalapi/asset/:asset/get/`],
            cacheDir,
            maxBytes: 1024 * 1024,
            resolveHost: 'cdn.assets.scratch.mit.edu',
            resolveIps: [],
            timeoutMs: 5000
        },
        auth: {
            configured: false
        },
        middlewareUrl: 'http://127.0.0.1:9',
        staticRoot
    }));
    await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const previewPort = previewServer.address().port;

    try {
        const firstResponse = await fetch(`http://127.0.0.1:${previewPort}/internalapi/asset/${assetFilename}/get/`);
        assert.equal(firstResponse.status, 200);
        assert.equal(firstResponse.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
        assert.equal(await firstResponse.text(), assetBody);

        const secondResponse = await fetch(`http://127.0.0.1:${previewPort}/internalapi/asset/${assetFilename}/get/`);
        assert.equal(secondResponse.status, 200);
        assert.equal(await secondResponse.text(), assetBody);
        assert.equal(upstreamHits, 1);
    } finally {
        await new Promise(resolve => previewServer.close(resolve));
        await new Promise(resolve => upstreamServer.close(resolve));
        await rm(staticRoot, {
            force: true,
            recursive: true
        });
        await rm(cacheDir, {
            force: true,
            recursive: true
        });
    }
});

test('proxies Scratch projects through a local cache', async () => {
    const projectId = '10015059';
    const projectBody = JSON.stringify({
        targets: [],
        meta: {
            semver: '3.0.0',
            vm: '0.2.0'
        }
    });
    let upstreamHits = 0;
    const upstreamServer = createServer((request, response) => {
        upstreamHits++;
        assert.equal(request.url, `/projects/${projectId}`);
        response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        response.end(projectBody);
    });
    await new Promise(resolve => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstreamServer.address().port;

    const staticRoot = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-static-'));
    const cacheDir = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-projects-'));
    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Scratch AI</title>');
    const previewServer = createServer(createRequestHandler({
        auth: {
            configured: false
        },
        middlewareUrl: 'http://127.0.0.1:9',
        projectProxy: {
            baseUrls: [`http://127.0.0.1:${upstreamPort}/projects/:projectId`],
            cacheDir,
            maxBytes: 1024 * 1024,
            timeoutMs: 5000
        },
        staticRoot
    }));
    await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const previewPort = previewServer.address().port;

    try {
        const firstResponse = await fetch(`http://127.0.0.1:${previewPort}/internalapi/project/${projectId}`);
        assert.equal(firstResponse.status, 200);
        assert.equal(firstResponse.headers.get('content-type'), 'application/json; charset=utf-8');
        assert.deepEqual(await firstResponse.json(), JSON.parse(projectBody));

        const secondResponse = await fetch(`http://127.0.0.1:${previewPort}/internalapi/project/${projectId}`);
        assert.equal(secondResponse.status, 200);
        assert.deepEqual(await secondResponse.json(), JSON.parse(projectBody));
        assert.equal(upstreamHits, 1);

        const statusResponse = await fetch(`http://127.0.0.1:${previewPort}/preview-statusz`);
        const statusJson = await statusResponse.json();
        assert.equal(statusJson.scratchProjects.cacheConfigured, true);
        assert.equal(statusJson.scratchProjects.proxyConfigured, true);
        assert.equal(statusJson.scratchProjects.sourceCount, 1);
        assert.equal(JSON.stringify(statusJson).includes(cacheDir), false);
        assert.equal(JSON.stringify(statusJson).includes(`127.0.0.1:${upstreamPort}`), false);
    } finally {
        await new Promise(resolve => previewServer.close(resolve));
        await new Promise(resolve => upstreamServer.close(resolve));
        await rm(staticRoot, {
            force: true,
            recursive: true
        });
        await rm(cacheDir, {
            force: true,
            recursive: true
        });
    }
});

test('rejects invalid Scratch project ids before proxying upstream', async () => {
    let upstreamHits = 0;
    const upstreamServer = createServer((request, response) => {
        upstreamHits++;
        response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        response.end('{}');
    });
    await new Promise(resolve => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstreamServer.address().port;
    const cacheDir = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-projects-'));

    const previewServer = createServer(createRequestHandler({
        auth: {
            configured: false
        },
        middlewareUrl: 'http://127.0.0.1:9',
        projectProxy: {
            baseUrls: [`http://127.0.0.1:${upstreamPort}/projects/:projectId`],
            cacheDir,
            maxBytes: 1024 * 1024,
            timeoutMs: 5000
        },
        staticRoot: tmpdir()
    }));
    await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const previewPort = previewServer.address().port;

    try {
        const response = await fetch(`http://127.0.0.1:${previewPort}/internalapi/project/not-a-number`);
        const responseJson = await response.json();
        assert.equal(response.status, 404);
        assert.equal(responseJson.error, 'Not found');
        assert.equal(upstreamHits, 0);
    } finally {
        await new Promise(resolve => previewServer.close(resolve));
        await new Promise(resolve => upstreamServer.close(resolve));
        await rm(cacheDir, {
            force: true,
            recursive: true
        });
    }
});

test('does not cache failed Scratch project upstream responses', async () => {
    const projectId = '10015059';
    const upstreamServer = createServer((request, response) => {
        response.writeHead(404, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify({
            error: 'missing'
        }));
    });
    await new Promise(resolve => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstreamServer.address().port;

    const cacheDir = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-projects-'));
    const previewServer = createServer(createRequestHandler({
        auth: {
            configured: false
        },
        middlewareUrl: 'http://127.0.0.1:9',
        projectProxy: {
            baseUrls: [`http://127.0.0.1:${upstreamPort}/projects/:projectId`],
            cacheDir,
            maxBytes: 1024 * 1024,
            timeoutMs: 5000
        },
        staticRoot: tmpdir()
    }));
    await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const previewPort = previewServer.address().port;

    try {
        const response = await fetch(`http://127.0.0.1:${previewPort}/internalapi/project/${projectId}`);
        const responseJson = await response.json();
        assert.equal(response.status, 404);
        assert.equal(responseJson.error, 'Scratch project proxy failed.');
        assert.equal(responseJson.route, '/internalapi/project/:projectId');
        await assert.rejects(() => stat(join(cacheDir, `${projectId}.json`)));
    } finally {
        await new Promise(resolve => previewServer.close(resolve));
        await new Promise(resolve => upstreamServer.close(resolve));
        await rm(cacheDir, {
            force: true,
            recursive: true
        });
    }
});

test('protects Scratch project proxy with preview auth', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scratch-ai-preview-projects-'));
    const previewServer = createServer(createRequestHandler({
        auth: {
            configured: true,
            password: 'secret',
            username: 'teacher'
        },
        middlewareUrl: 'http://127.0.0.1:9',
        projectProxy: {
            baseUrls: ['http://127.0.0.1:9/projects/:projectId'],
            cacheDir,
            maxBytes: 1024 * 1024,
            timeoutMs: 1000
        },
        staticRoot: tmpdir()
    }));
    await new Promise(resolve => previewServer.listen(0, '127.0.0.1', resolve));
    const previewPort = previewServer.address().port;

    try {
        const response = await fetch(`http://127.0.0.1:${previewPort}/internalapi/project/10015059`, {
            headers: {
                Accept: 'application/json'
            }
        });
        const responseJson = await response.json();
        assert.equal(response.status, 401);
        assert.equal(responseJson.error, 'Scratch AI preview access requires authentication.');
    } finally {
        await new Promise(resolve => previewServer.close(resolve));
        await rm(cacheDir, {
            force: true,
            recursive: true
        });
    }
});
