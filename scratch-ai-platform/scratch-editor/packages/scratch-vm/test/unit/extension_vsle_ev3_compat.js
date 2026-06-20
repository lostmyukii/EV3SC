const test = require('tap').test;
const path = require('path');

const ArgumentType = require('../../src/extension-support/argument-type');
const BlockType = require('../../src/extension-support/block-type');
const Cast = require('../../src/util/cast');
const dispatch = require('../../src/dispatch/central-dispatch');
const ExtensionManager = require('../../src/extension-support/extension-manager');
const VirtualMachine = require('../../src/index');
const readFileToBuffer = require('../fixtures/readProjectFile').readFileToBuffer;
const Scratch3VSLEEV3Compat = require('../../src/extensions/scratch3_vsle_ev3_compat');

class FakeSensorCache {
    constructor (data) {
        this.data = data || {};
    }

    get (cachePath) {
        return this.data[cachePath];
    }
}

class FakeLink {
    constructor () {
        this.commands = [];
    }

    async sendCommand (command) {
        this.commands.push(command);
        return {ok: true};
    }
}

const makeScratchApi = () => ({
    ArgumentType,
    BlockType,
    Cast
});

const officialOpcodes = [
    'motorTurnClockwise',
    'motorTurnCounterClockwise',
    'motorSetPower',
    'getMotorPosition',
    'whenButtonPressed',
    'whenDistanceLessThan',
    'whenBrightnessLessThan',
    'buttonPressed',
    'getDistance',
    'getBrightness',
    'beep'
];

test('builtin ev3 loads the VSLE-backed compatibility extension', t => {
    const previousServices = dispatch.services;
    const peripheralExtensions = {};
    const runtime = {
        registerPeripheralExtension: (id, extension) => {
            peripheralExtensions[id] = extension;
        },
        _registerExtensionPrimitives: () => {}
    };

    dispatch.services = {};
    dispatch.setServiceSync('runtime', runtime);

    const manager = new ExtensionManager(runtime);
    manager.loadExtensionURL('ev3');

    const serviceName = manager._loadedExtensions.get('ev3');
    const info = dispatch.services[serviceName].getInfo();

    t.equal(info.id, 'ev3');
    t.equal(info.name, 'EV3');
    t.same(info.blocks.map(block => block.opcode), officialOpcodes);
    t.type(peripheralExtensions.ev3.scan, 'function');

    dispatch.services = previousServices;
    t.end();
});

test('official EV3 motor and sound opcodes dispatch through VSLE commands', async t => {
    const link = new FakeLink();
    const sleeps = [];
    const extension = new Scratch3VSLEEV3Compat({}, 'ev3', {
        Scratch: makeScratchApi(),
        link,
        sleep: async ms => sleeps.push(ms)
    });

    extension.motorSetPower({PORT: '0', POWER: 75});
    await extension.motorTurnClockwise({PORT: '0', TIME: 2});
    await extension.motorTurnCounterClockwise({PORT: '1', TIME: 1});
    await extension.beep({NOTE: 60, TIME: 0.5});

    t.same(link.commands, [
        {
            method: 'motor.runTimed',
            params: {port: 'A', speed: 75, time: 2}
        },
        {
            method: 'motor.runTimed',
            params: {port: 'B', speed: -50, time: 1}
        },
        {
            method: 'sound.playToneWait',
            params: {
                freq: Math.pow(2, ((60 - 69 + 12) / 12)) * 440,
                duration: 0.5,
                volume: 100
            }
        }
    ]);
    t.same(sleeps, [2000, 1000]);
});

test('official EV3 reporters and hats use synchronous VSLE sensor cache reads', t => {
    const extension = new Scratch3VSLEEV3Compat({}, 'ev3', {
        Scratch: makeScratchApi(),
        link: new FakeLink(),
        sensorCache: new FakeSensorCache({
            'motors.A.position': 725,
            'sensors.S2.distance_cm': 42.1234,
            'sensors.S3.ambient': 66,
            'sensors.S3.pressed': true
        })
    });

    t.equal(extension.getMotorPosition({PORT: '0'}), 5);
    t.equal(extension.getDistance(), 42.12);
    t.equal(extension.getBrightness(), 66);
    t.equal(extension.buttonPressed({PORT: '2'}), true);
    t.equal(extension.whenButtonPressed({PORT: '2'}), true);
    t.equal(extension.whenDistanceLessThan({DISTANCE: 50}), true);
    t.equal(extension.whenBrightnessLessThan({DISTANCE: 50}), false);
    t.end();
});

test('official EV3 compatibility extension exposes local Link diagnostics', t => {
    const nowValues = [102300, 106000];
    const extension = new Scratch3VSLEEV3Compat({}, 'ev3', {
        Scratch: makeScratchApi(),
        link: new FakeLink(),
        clock: () => nowValues.shift() || 106000,
        sensorCache: new FakeSensorCache({
            timestamp: 100000
        })
    });

    let diagnostic = extension.getConnectionDiagnostic();

    t.equal(diagnostic.linkUrl, 'ws://127.0.0.1:20111/scratch/bt');
    t.equal(diagnostic.status, 'not_connected');
    t.match(diagnostic.message, /Link 未连接/);
    t.match(diagnostic.hint, /不能直接在浏览器地址栏打开/);

    extension.scan();
    diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'searching');
    t.match(diagnostic.message, /正在连接本机 Link/);

    extension._recordPeripheralDiscovered({
        peripheralId: 'vsle-ev3-wifi',
        name: 'VSLE EV3 WiFi'
    });
    diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'discovered');
    t.equal(diagnostic.peripheralName, 'VSLE EV3 WiFi');

    extension._recordConnected();
    diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'sensor_streaming');
    t.equal(diagnostic.freshnessSeconds, 2.3);
    t.match(diagnostic.message, /正在接收传感器实时数据/);

    diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'sensor_stale');
    t.equal(diagnostic.freshnessSeconds, 6);
    t.match(diagnostic.message, /传感器数据已停止更新/);
    t.end();
});

test('official EV3 compatibility extension maps Link search failures to teacher-readable diagnostics', t => {
    const extension = new Scratch3VSLEEV3Compat({}, 'ev3', {
        Scratch: makeScratchApi(),
        link: new FakeLink()
    });

    extension._recordConnectionError({code: 1008, reason: 'origin not allowed'});
    let diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'origin_rejected');
    t.match(diagnostic.message, /网页来源未被 WeisileLink 允许/);

    extension._recordConnectionError(new Error('timeout'));
    diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'link_unavailable');
    t.match(diagnostic.message, /Link 未启动/);

    extension._recordSearchTimeout();
    diagnostic = extension.getConnectionDiagnostic();
    t.equal(diagnostic.status, 'not_found');
    t.match(diagnostic.message, /没有发现 EV3 主机/);
    t.end();
});

test('official EV3 sb3 fixture loads with VSLE-backed ev3 primitives', async t => {
    const vm = new VirtualMachine();
    const projectPath = path.resolve(
        __dirname,
        '../fixtures/load-extensions/confirm-load/ev3-simple-project.sb3'
    );

    await vm.loadProject(readFileToBuffer(projectPath));

    const serviceName = vm.extensionManager._loadedExtensions.get('ev3');
    const info = dispatch.services[serviceName].getInfo();

    t.ok(vm.extensionManager.isExtensionLoaded('ev3'));
    t.equal(info.name, 'EV3');
    t.type(vm.runtime.getOpcodeFunction('ev3_getDistance'), 'function');

    vm.quit();
});
