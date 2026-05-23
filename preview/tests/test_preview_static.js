const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('preview page mounts existing VSLE extension UI and AI Quest samples', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

    assert.match(html, /data-vsle-connection-modal-host/);
    assert.match(html, /data-vsle-sensor-panel-host/);
    assert.match(html, /data-ai-quest-samples/);
    assert.match(html, /vsle-ev3-extension\/index\.js/);
    assert.match(app, /WeisileLinkClient/);
    assert.match(app, /startNotifications/);
    assert.match(app, /ai-quest-samples\/projects/);
    assert.match(app, /ws:\/\/127\.0\.0\.1:8766/);
    assert.match(app, /cache: 'no-store'/);
    assert.match(app, /VSLEPreview/);
});

test('preview backend uses the real WeisileLink JSON-RPC server', () => {
    const server = fs.readFileSync(
        path.join(ROOT, 'weisile_preview_server.py'),
        'utf8'
    );

    assert.match(server, /ScratchJsonRpcServer/);
    assert.match(server, /handle_sensor_data/);
    assert.match(server, /run_trainer/);
    assert.match(server, /PreviewTransport/);
    assert.match(server, /data\.startCollect/);
});
