const fs = require('node:fs');
const path = require('node:path');

// Sources: VSLE spec Section 8.2 AI Quest workflow; Scratch VM
// serialization/sb3.js project.json target/block layout; VSLE extension getInfo.
const SCHEMA_VERSION = 'vsle-ai-quest-sample-v1';
const VSLE_EXTENSION_ID = 'vsleev3';
const TRAINER_FEATURE_FIELDS = new Set([
    'color_reflected',
    'ultrasonic_cm',
    'gyro_angle',
    'touch_pressed',
    'motor_a_pos'
]);
const REQUIRED_WORKFLOW_STAGES = ['record', 'upload', 'train', 'export'];
const FORBIDDEN_PRIVACY_TERMS = [
    'studentname',
    'email',
    'account',
    'photo',
    'voice',
    'location'
];

const loadSampleProjects = projectsDir => fs.readdirSync(projectsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(
        fs.readFileSync(path.join(projectsDir, name), 'utf8')
    ))
    .sort((left, right) => left.order - right.order);

const validateSampleProject = (project, options = {}) => {
    const errors = [];
    const opcodes = options.opcodes || new Set();

    if (project.schemaVersion !== SCHEMA_VERSION) {
        errors.push(`Invalid schemaVersion for ${project.id}`);
    }
    if (!/^[a-z0-9-]+$/.test(String(project.id || ''))) {
        errors.push(`Invalid project id: ${project.id}`);
    }
    const stages = (project.workflow || []).map(step => step.stage);
    if (JSON.stringify(stages) !== JSON.stringify(REQUIRED_WORKFLOW_STAGES)) {
        errors.push(`${project.id} workflow must be record/upload/train/export`);
    }

    for (const label of project.labels || []) {
        if (String(label).length > 64) {
            errors.push(`${project.id} label exceeds 64 characters`);
        }
    }

    if (!project.privacy || project.privacy.localFirst !== true) {
        errors.push(`${project.id} must declare local-first privacy`);
    }
    if (!project.privacy || project.privacy.studentDataCollected !== false) {
        errors.push(`${project.id} must not collect student data`);
    }
    if (!project.privacy || project.privacy.deleteRoute !== '/api/data/clear') {
        errors.push(`${project.id} must document the clear-session route`);
    }

    const lowered = JSON.stringify(project).toLowerCase();
    for (const term of FORBIDDEN_PRIVACY_TERMS) {
        if (lowered.includes(term)) {
            errors.push(`${project.id} contains forbidden privacy term: ${term}`);
        }
    }

    for (const step of scratchSteps(project)) {
        const opcode = extensionOpcode(step.opcode);
        if (!opcodes.has(opcode)) {
            errors.push(`${project.id} uses unknown VSLE opcode: ${opcode}`);
        }
    }

    const trainer = project.trainer || {};
    for (const feature of trainer.features || []) {
        if (!TRAINER_FEATURE_FIELDS.has(feature)) {
            errors.push(`${project.id} uses unknown Trainer feature: ${feature}`);
        }
    }
    if (!trainer.model || trainer.model.type !== 'decision_tree') {
        errors.push(`${project.id} must use decision_tree sample model`);
    }
    if (!trainer.model || trainer.model.accuracyGate !== 0.7) {
        errors.push(`${project.id} must use the 70% accuracy gate`);
    }

    return errors;
};

const buildScratchProjectJson = project => {
    const blocks = createBlockStack(project);
    return {
        targets: [
            createStageTarget(),
            {
                isStage: false,
                name: 'AI Quest EV3',
                variables: {},
                lists: {},
                broadcasts: {},
                blocks,
                comments: {},
                currentCostume: 0,
                costumes: [],
                sounds: [],
                volume: 100,
                layerOrder: 1,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        monitors: [],
        extensions: [VSLE_EXTENSION_ID],
        meta: {
            semver: '3.0.0',
            vm: 'scratch-vm sb3 project.json',
            agent: 'EV3SC AI Quest sample builder'
        }
    };
};

const buildTrainerWorkflowPlan = project => ({
    projectId: project.id,
    websocketEndpoint: 'ws://localhost:8766',
    restEndpoints: [
        '/api/data/collected',
        '/api/data/export',
        '/api/data/clear'
    ],
    features: [...project.trainer.features],
    model: {
        type: project.trainer.model.type,
        accuracyGate: project.trainer.model.accuracyGate
    },
    exportArtifacts: [...project.trainer.exportArtifacts],
    deletion: {
        route: project.privacy.deleteRoute,
        instructions: project.privacy.deletionInstructions
    }
});

const scratchSteps = project => (project.workflow || [])
    .flatMap(step => step.script || []);

const createBlockStack = project => {
    const steps = scratchSteps(project);
    const blocks = {
        green_flag: {
            opcode: 'event_whenflagclicked',
            next: steps.length > 0 ? 'step_0' : null,
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true,
            x: 48,
            y: 64
        }
    };

    steps.forEach((step, index) => {
        const id = `step_${index}`;
        blocks[id] = {
            opcode: extensionOpcode(step.opcode),
            next: index === steps.length - 1 ? null : `step_${index + 1}`,
            parent: index === 0 ? 'green_flag' : `step_${index - 1}`,
            inputs: blockInputs(step.args || {}),
            fields: {},
            shadow: false,
            topLevel: false
        };
    });

    return blocks;
};

const blockInputs = args => Object.fromEntries(
    Object.entries(args).map(([name, value]) => [name, [1, primitive(value)]])
);

const primitive = value => {
    if (typeof value === 'number') {
        return [4, String(value)];
    }
    return [10, String(value)];
};

const extensionOpcode = opcode => `${VSLE_EXTENSION_ID}_${opcode}`;

const createStageTarget = () => ({
    isStage: true,
    name: 'Stage',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: 'on',
    textToSpeechLanguage: null
});

module.exports = {
    SCHEMA_VERSION,
    TRAINER_FEATURE_FIELDS,
    REQUIRED_WORKFLOW_STAGES,
    buildScratchProjectJson,
    buildTrainerWorkflowPlan,
    loadSampleProjects,
    validateSampleProject
};
