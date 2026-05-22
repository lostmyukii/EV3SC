const assert = require('node:assert/strict');
const test = require('node:test');

const {
    SENSOR_PANEL_ACTIVE_GREEN,
    SENSOR_PANEL_BACKGROUND,
    SENSOR_PANEL_WIDTH_PX,
    SensorCache,
    VSLEEV3Extension,
    buildSensorDataPanelModel,
    renderSensorDataPanel,
    SensorDataPanel
} = require('../index.js');

const dataPanelModule = require('../src/ui/data_panel.js');

const makeExtension = () => {
    const sent = [];
    const link = {
        sendCommand: async command => {
            sent.push(command);
            return {ok: true};
        }
    };
    const sensorCache = new SensorCache({clock: () => 1000});
    const extension = new VSLEEV3Extension({link, sensorCache});
    return {extension, sent, sensorCache};
};

const populateCache = sensorCache => {
    sensorCache.update({
        brick_id: 'left-brick',
        brick_name: '左侧 EV3',
        sensors: {
            S1: {
                color: 4,
                reflected: 45,
                ambient: 12,
                rgb: [10, 20, 30]
            },
            S2: {distance_cm: 23.4, distance_inch: 9.2},
            S3: {angle: -12, rate: 6},
            S4: {pressed: true}
        },
        motors: {
            A: {position: 360, speed: 0, running: false},
            B: {position: -180, speed: 42, running: true},
            C: {position: 0, speed: 0, running: false},
            D: {position: 12, speed: -20, running: true}
        },
        system: {
            battery_pct: 87,
            battery_v: 7.62,
            collected_points: 18,
            collecting: true,
            collect_label: 'obstacle'
        },
        timestamp: 1000
    });
};

const makeFakeContainer = () => {
    const listeners = new Map();
    const elements = {
        '[data-vsle-action="toggle"]': {
            addEventListener: (_event, handler) => listeners.set('toggle', handler)
        },
        '[data-vsle-action="startCollect"]': {
            addEventListener: (_event, handler) => listeners.set('startCollect', handler)
        },
        '[data-vsle-action="uploadToTrainer"]': {
            addEventListener: (_event, handler) => listeners.set('uploadToTrainer', handler)
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

test('buildSensorDataPanelModel normalizes cache-backed EV3 state', () => {
    const sensorCache = new SensorCache({clock: () => 1000});
    populateCache(sensorCache);

    const model = buildSensorDataPanelModel(sensorCache, {
        now: () => 1100,
        collectionTarget: 30
    });

    assert.deepEqual(model.layout, {
        widthPx: SENSOR_PANEL_WIDTH_PX,
        background: SENSOR_PANEL_BACKGROUND,
        activeGreen: SENSOR_PANEL_ACTIVE_GREEN
    });
    assert.equal(model.connection.connected, true);
    assert.equal(model.connection.brickId, 'left-brick');
    assert.equal(model.connection.brickName, '左侧 EV3');
    assert.equal(model.sensors.color.value, 4);
    assert.equal(model.sensors.color.reflected, 45);
    assert.equal(model.sensors.distance.value, 23.4);
    assert.equal(model.sensors.gyro.angle, -12);
    assert.equal(model.sensors.touch.pressed, true);
    assert.deepEqual(model.motors.B, {
        port: 'B',
        position: -180,
        speed: 42,
        running: true
    });
    assert.deepEqual(model.collection, {
        collecting: true,
        label: 'obstacle',
        count: 18,
        target: 30,
        progressPct: 60
    });
});

test('src ui data panel entry re-exports the runnable implementation', () => {
    assert.equal(dataPanelModule.SensorDataPanel, SensorDataPanel);
    assert.equal(dataPanelModule.renderSensorDataPanel, renderSensorDataPanel);
    assert.equal(
        dataPanelModule.buildSensorDataPanelModel,
        buildSensorDataPanelModel
    );
});

test('renderSensorDataPanel returns Scratch-style collapsible panel markup', () => {
    const sensorCache = new SensorCache({clock: () => 1000});
    populateCache(sensorCache);

    const html = renderSensorDataPanel(sensorCache, {
        now: () => 1100,
        collectionTarget: 30
    });

    assert.match(html, /class="vsle-sensor-panel"/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /EV3 传感器实时数据/);
    assert.match(html, /颜色 S1/);
    assert.match(html, /45/);
    assert.match(html, /距离 S2/);
    assert.match(html, /23\.4cm/);
    assert.match(html, /陀螺 S3/);
    assert.match(html, /-12°/);
    assert.match(html, /触碰 S4/);
    assert.match(html, /已按/);
    assert.match(html, /A: 360°/);
    assert.match(html, /B: -180°/);
    assert.match(html, /18\/30/);
    assert.match(html, new RegExp(`width:\\s*${SENSOR_PANEL_WIDTH_PX}px`));
    assert.match(html, new RegExp(`background:\\s*${SENSOR_PANEL_BACKGROUND}`));
    assert.match(html, new RegExp(`background:\\s*${SENSOR_PANEL_ACTIVE_GREEN}`));
    assert.match(html, /font-family:\s*"Helvetica Neue", Helvetica, Arial, sans-serif/);
});

test('renderSensorDataPanel collapsed state keeps toggle and hides body', () => {
    const sensorCache = new SensorCache();
    const html = renderSensorDataPanel(sensorCache, {collapsed: true});

    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /data-vsle-action="toggle"/);
    assert.match(html, /style="display:none"/);
    assert.match(html, /展开/);
});

test('SensorDataPanel renders into a host container and binds actions', async () => {
    const {extension, sent, sensorCache} = makeExtension();
    populateCache(sensorCache);
    const {container, listeners} = makeFakeContainer();
    const panel = extension.createSensorDataPanel({
        container,
        now: () => 1100,
        collectionTarget: 30
    });

    assert.ok(panel instanceof SensorDataPanel);
    assert.match(container.innerHTML, /EV3 传感器实时数据/);
    assert.match(container.innerHTML, /18\/30/);

    await listeners.get('startCollect')();
    await listeners.get('uploadToTrainer')();
    listeners.get('toggle')();

    assert.deepEqual(sent, [
        {method: 'data.startCollect', params: {label: 'panel'}},
        {method: 'data.uploadToTrainer', params: {}}
    ]);
    assert.equal(panel.collapsed, true);
    assert.match(container.innerHTML, /aria-expanded="false"/);
});
