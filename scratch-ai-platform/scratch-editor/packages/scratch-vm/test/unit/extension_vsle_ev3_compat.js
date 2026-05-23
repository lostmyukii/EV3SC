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
