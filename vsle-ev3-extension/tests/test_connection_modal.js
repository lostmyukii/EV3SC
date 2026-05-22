const assert = require('node:assert/strict');
const test = require('node:test');

const {
    CONNECTION_MODAL_BUTTON_PURPLE,
    CONNECTION_MODAL_HEADER_GREEN,
    CONNECTION_MODAL_WIDTH_PX,
    ConnectionModal,
    VSLEEV3Extension,
    buildConnectionModalModel,
    renderConnectionModal
} = require('../index.js');

const connectionModalModule = require('../src/ui/connection_modal.js');

const makeExtension = () => {
    const sent = [];
    const link = {
        sendCommand: async command => {
            sent.push(command);
            return {ok: true, transport: command.params.transport};
        }
    };
    const extension = new VSLEEV3Extension({link});
    return {extension, sent};
};

const makeFakeContainer = () => {
    const listeners = new Map();
    const elements = {
        '[data-vsle-action="connect"]': {
            addEventListener: (_event, handler) => listeners.set('connect', handler)
        },
        '[data-vsle-action="cancel"]': {
            addEventListener: (_event, handler) => listeners.set('cancel', handler)
        },
        '[data-vsle-action="help"]': {
            addEventListener: (_event, handler) => listeners.set('help', handler)
        },
        '[data-vsle-transport="wifi"]': {
            addEventListener: (_event, handler) => listeners.set('wifi', handler)
        },
        '[data-vsle-transport="bluetooth"]': {
            addEventListener: (_event, handler) => listeners.set('bluetooth', handler)
        },
        '[data-vsle-input="wifi-ip"]': {
            addEventListener: (_event, handler) => listeners.set('wifi-ip', handler)
        },
        '[data-vsle-input="bt-address"]': {
            addEventListener: (_event, handler) => listeners.set('bt-address', handler)
        }
    };
    return {
        container: {
            innerHTML: '',
            querySelector (selector) {
                return elements[selector] || null;
            }
        },
        listeners
    };
};

test('buildConnectionModalModel normalizes WiFi and Bluetooth fields', () => {
    const model = buildConnectionModalModel({
        transport: 'bluetooth',
        ev3Ip: ' 192.168.5.42 ',
        ev3Bt: ' 00:16:53:AA:BB:CC ',
        status: 'connecting',
        message: '正在连接...'
    });

    assert.equal(model.transport, 'bluetooth');
    assert.equal(model.ev3Ip, '192.168.5.42');
    assert.equal(model.ev3Bt, '00:16:53:AA:BB:CC');
    assert.equal(model.status, 'connecting');
    assert.equal(model.message, '正在连接...');
    assert.deepEqual(model.layout, {
        widthPx: CONNECTION_MODAL_WIDTH_PX,
        headerGreen: CONNECTION_MODAL_HEADER_GREEN,
        buttonPurple: CONNECTION_MODAL_BUTTON_PURPLE
    });
});

test('src ui connection modal entry re-exports the runnable implementation', () => {
    assert.equal(connectionModalModule.ConnectionModal, ConnectionModal);
    assert.equal(
        connectionModalModule.buildConnectionModalModel,
        buildConnectionModalModel
    );
    assert.equal(connectionModalModule.renderConnectionModal, renderConnectionModal);
});

test('renderConnectionModal returns Scratch hardware modal style markup', () => {
    const html = renderConnectionModal({
        transport: 'wifi',
        ev3Ip: '192.168.1.100',
        status: 'connecting',
        message: '正在连接...'
    });

    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /id="connectionModal"/);
    assert.match(html, /连接到 EV3/);
    assert.match(html, /WiFi \(推荐\)/);
    assert.match(html, /蓝牙/);
    assert.match(html, /EV3 IP地址/);
    assert.match(html, /192\.168\.1\.100/);
    assert.match(html, /状态: 正在连接\.\.\./);
    assert.match(html, /data-vsle-action="help"/);
    assert.match(html, /data-vsle-action="connect"/);
    assert.match(html, /assets\/ev3-small\.svg/);
    assert.match(html, new RegExp(`width:\\s*${CONNECTION_MODAL_WIDTH_PX}px`));
    assert.match(html, new RegExp(`background-color:\\s*${CONNECTION_MODAL_HEADER_GREEN}`));
    assert.match(html, new RegExp(`background:\\s*${CONNECTION_MODAL_BUTTON_PURPLE}`));
    assert.match(html, /font-family:\s*"Helvetica Neue", Helvetica, Arial, sans-serif/);
});

test('ConnectionModal binds WiFi, Bluetooth, help, cancel, and connect actions', async () => {
    const {extension, sent} = makeExtension();
    const events = [];
    const {container, listeners} = makeFakeContainer();
    const modal = extension.createConnectionModal({
        container,
        onCancel: () => events.push('cancel'),
        onHelp: () => events.push('help')
    });

    assert.ok(modal instanceof ConnectionModal);
    assert.match(container.innerHTML, /连接到 EV3/);

    listeners.get('wifi-ip')({target: {value: '10.0.0.9'}});
    await listeners.get('connect')();

    listeners.get('bluetooth')();
    listeners.get('bt-address')({target: {value: '00:16:53:AA:BB:CC'}});
    await listeners.get('connect')();
    listeners.get('help')();
    listeners.get('cancel')();

    assert.deepEqual(sent, [
        {
            method: 'vsle.setTransport',
            params: {transport: 'wifi', ev3_ip: '10.0.0.9'}
        },
        {
            method: 'vsle.setTransport',
            params: {
                transport: 'bluetooth',
                ev3_bt: '00:16:53:AA:BB:CC'
            }
        }
    ]);
    assert.deepEqual(events, ['help', 'cancel']);
    assert.equal(modal.status, 'connected');
    assert.match(container.innerHTML, /状态: 已连接/);
});

