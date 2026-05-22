const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const {
    TRAINER_FEATURE_FIELDS,
    buildScratchProjectJson,
    buildTrainerWorkflowPlan,
    loadSampleProjects,
    validateSampleProject
} = require('../index.js');

const {VSLEEV3Extension} = require('../../vsle-ev3-extension/index.js');

const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

const extensionOpcodes = () => {
    const extension = new VSLEEV3Extension();
    return new Set(
        extension.getInfo().blocks
            .filter(block => block && typeof block === 'object')
            .map(block => `vsleev3_${block.opcode}`)
    );
};

test('sample manifests cover record upload train export without PII', () => {
    const projects = loadSampleProjects(PROJECTS_DIR);
    const opcodes = extensionOpcodes();

    assert.deepEqual(
        projects.map(project => project.id),
        [
            'obstacle-avoidance-collector',
            'line-patrol-color-collector',
            'touch-stop-safety-collector'
        ]
    );

    for (const project of projects) {
        assert.deepEqual(validateSampleProject(project, {opcodes}), []);
        assert.deepEqual(
            project.workflow.map(step => step.stage),
            ['record', 'upload', 'train', 'export']
        );
        assert.equal(project.privacy.localFirst, true);
        assert.equal(project.privacy.studentDataCollected, false);
        assert.equal(project.privacy.deleteRoute, '/api/data/clear');
        assert.match(project.privacy.deletionInstructions, /clear session/i);

        const json = JSON.stringify(project).toLowerCase();
        for (const forbidden of ['studentname', 'email', 'account', 'photo', 'voice', 'location']) {
            assert.equal(json.includes(forbidden), false);
        }
    }
});

test('Scratch project JSON uses VSLE extension opcodes and a connected stack', () => {
    const [project] = loadSampleProjects(PROJECTS_DIR);
    const scratchProject = buildScratchProjectJson(project);
    const sprite = scratchProject.targets.find(target => target.name === 'AI Quest EV3');
    const blocks = sprite.blocks;
    const extensionOpcodeSet = extensionOpcodes();
    const projectExtensionOpcodes = Object.values(blocks)
        .map(block => block.opcode)
        .filter(opcode => opcode.startsWith('vsleev3_'));

    assert.deepEqual(scratchProject.extensions, ['vsleev3']);
    assert.equal(scratchProject.targets[0].isStage, true);
    assert.equal(sprite.isStage, false);
    assert.equal(blocks.green_flag.opcode, 'event_whenflagclicked');
    assert.equal(blocks.green_flag.topLevel, true);
    assert.equal(blocks.green_flag.next, 'step_0');

    assert.ok(projectExtensionOpcodes.includes('vsleev3_startDataCollection'));
    assert.ok(projectExtensionOpcodes.includes('vsleev3_stopDataCollection'));
    assert.ok(projectExtensionOpcodes.includes('vsleev3_uploadToTrainer'));
    assert.ok(projectExtensionOpcodes.includes('vsleev3_exportDataCSV'));
    for (const opcode of projectExtensionOpcodes) {
        assert.equal(extensionOpcodeSet.has(opcode), true, opcode);
    }

    let cursor = 'green_flag';
    const visited = [];
    while (cursor) {
        visited.push(cursor);
        cursor = blocks[cursor].next;
    }
    assert.equal(visited.length, Object.keys(blocks).length);
    assert.deepEqual(blocks.step_0.inputs.LABEL, [1, [10, 'safe-zone']]);
});

test('Trainer workflow plan maps samples to REST endpoints and export artifacts', () => {
    const projects = loadSampleProjects(PROJECTS_DIR);

    for (const project of projects) {
        const plan = buildTrainerWorkflowPlan(project);

        assert.equal(plan.websocketEndpoint, 'ws://localhost:8766');
        assert.deepEqual(plan.restEndpoints, [
            '/api/data/collected',
            '/api/data/export',
            '/api/data/clear'
        ]);
        assert.equal(plan.model.type, 'decision_tree');
        assert.equal(plan.model.accuracyGate, 0.7);
        assert.deepEqual(plan.exportArtifacts, [
            'vsle_ev3_data.csv',
            'model_rules.json'
        ]);
        assert.deepEqual(plan.features, project.trainer.features);
        for (const feature of plan.features) {
            assert.equal(TRAINER_FEATURE_FIELDS.has(feature), true, feature);
        }
    }
});

test('export CLI writes one Scratch project JSON file per sample', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsle-ai-quest-'));
    const result = spawnSync(
        process.execPath,
        [
            path.join(__dirname, '..', 'scripts', 'export_project_json.js'),
            '--out',
            outDir
        ],
        {encoding: 'utf8'}
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /obstacle-avoidance-collector\.project\.json/);

    const files = fs.readdirSync(outDir).sort();
    assert.deepEqual(files, [
        'line-patrol-color-collector.project.json',
        'obstacle-avoidance-collector.project.json',
        'touch-stop-safety-collector.project.json'
    ]);

    const projectJson = JSON.parse(
        fs.readFileSync(
            path.join(outDir, 'obstacle-avoidance-collector.project.json'),
            'utf8'
        )
    );
    assert.deepEqual(projectJson.extensions, ['vsleev3']);
});
