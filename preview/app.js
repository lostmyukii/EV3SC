const sampleFiles = [
    'obstacle_avoidance_collector.json',
    'line_patrol_color_collector.json',
    'touch_stop_safety_collector.json'
];

const state = {
    extension: null,
    link: null,
    sensorPanel: null,
    trainerSocket: null,
    logLines: []
};

globalThis.VSLEPreview = state;

const log = message => {
    const time = new Date().toLocaleTimeString();
    state.logLines.unshift(`[${time}] ${message}`);
    state.logLines = state.logLines.slice(0, 8);
    document.getElementById('event-log').textContent = state.logLines.join('\n');
};

const setStatus = (id, text, ok = false) => {
    const element = document.getElementById(id);
    element.textContent = text;
    element.classList.toggle('ok', ok);
};

const loadVsleExtension = async () => {
    const sourceUrl = document
        .querySelector('meta[name="vsle-extension-source"]')
        .getAttribute('content');
    const source = await fetch(`${sourceUrl}?preview=${Date.now()}`, {
        cache: 'no-store'
    })
        .then(response => response.text());
    const module = {exports: {}};
    const exports = module.exports;
    const runner = new Function('module', 'exports', source);
    runner(module, exports);
    return module.exports;
};

const mountSamples = async () => {
    const host = document.querySelector('[data-ai-quest-samples]');
    const projects = await Promise.all(sampleFiles.map(file => (
        fetch(`/ai-quest-samples/projects/${file}`).then(response => response.json())
    )));
    host.innerHTML = projects.map(project => `
        <article class="sample-card">
          <h3>${project.title}</h3>
          <p>${project.goal}</p>
          <div class="tag-row">
            ${project.labels.map(label => `<span>${label}</span>`).join('')}
          </div>
        </article>
    `).join('');
};

const connectBridge = async () => {
    await state.link.connect();
    await state.link.sendCommand({method: 'startNotifications', params: {}});
    setStatus('bridge-status', 'Bridge: connected', true);
    log('WeisileLink preview backend connected');
};

const connectTrainer = () => new Promise(resolve => {
    const socket = new WebSocket('ws://127.0.0.1:8766');
    socket.onopen = () => {
        state.trainerSocket = socket;
        setStatus('trainer-status', 'Trainer: subscribed', true);
        log('Trainer preview subscription opened');
        resolve();
    };
    socket.onmessage = event => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'sensor_stream') {
            document.getElementById('sensor-rate').textContent =
                `ultrasonic ${payload.ultrasonic_cm.toFixed(1)} cm · collected ${state.extension.getDataCount()}`;
        }
    };
    socket.onerror = () => {
        setStatus('trainer-status', 'Trainer: offline');
        resolve();
    };
});

const wireControls = () => {
    document.getElementById('connect-link').addEventListener('click', async () => {
        try {
            await connectBridge();
        } catch (error) {
            setStatus('bridge-status', 'Bridge: failed');
            log(`Bridge error: ${error.message || 'connection failed'}`);
        }
    });
    document.getElementById('start-safe').addEventListener('click', async () => {
        await state.extension.startDataCollection({LABEL: 'safe-zone'});
        log('Started safe-zone data collection');
    });
    document.getElementById('stop-collect').addEventListener('click', async () => {
        await state.extension.stopDataCollection();
        log('Stopped data collection');
    });
    document.getElementById('upload-data').addEventListener('click', async () => {
        const result = await state.extension.uploadToTrainer();
        log(`Uploaded ${result.uploaded_points || 0} rows to Trainer`);
    });
    document.getElementById('export-data').addEventListener('click', async () => {
        await state.extension.exportDataCSV();
        log('CSV export command sent');
    });
};

const boot = async () => {
    const vsle = await loadVsleExtension();
    const sensorCache = new vsle.SensorCache();
    state.link = new vsle.WeisileLinkClient({sensorCache});
    state.extension = new vsle.VSLEEV3Extension({
        sensorCache,
        link: state.link
    });
    state.sensorPanel = state.extension.createSensorDataPanel({
        container: document.querySelector('[data-vsle-sensor-panel-host]'),
        collectionTarget: 30
    });
    state.extension.createConnectionModal({
        container: document.querySelector('[data-vsle-connection-modal-host]'),
        ev3Ip: '127.0.0.1',
        message: '本地预览模式'
    });
    await mountSamples();
    wireControls();
    connectTrainer();
    setInterval(() => state.sensorPanel.render(), 250);
    log('Preview shell ready');
};

boot().catch(error => {
    setStatus('bridge-status', 'Preview failed');
    log(error.message || String(error));
});
