const Q18_SCHEMA_VERSION = 'scratch-ai-q18-learning-tools-v1';

const Q18_TOOL_STATUS = Object.freeze({
    DISABLED: 'disabled',
    EMPTY: 'empty',
    LOCKED: 'locked',
    READY: 'ready'
});

const Q18_TOOL_IDS = Object.freeze({
    ADDITION_TEMPLATE: 'addition-template',
    ONE_LINE_PROJECT: 'one-line-project',
    VOICE_DRAFT: 'voice-draft'
});

const TEXT_LIMIT = 240;
const TITLE_LIMIT = 48;

const readText = value => (typeof value === 'string' ? value.trim() : '');

const truncateText = (value, limit = TEXT_LIMIT) => readText(value).slice(0, limit);

const normalizeText = value => truncateText(value).toLowerCase();

const hasAnyMarker = (text, markers) => {
    const normalizedText = normalizeText(text);
    return markers.some(marker => normalizedText.indexOf(marker.toLowerCase()) !== -1);
};

const createBlockedResult = ({
    reason,
    status,
    toolId
}) => ({
    schemaVersion: Q18_SCHEMA_VERSION,
    status,
    toolId,
    values: {},
    safeguards: {
        completeScriptGenerated: false,
        externalNetwork: false,
        modelCalled: false,
        previewOnly: true,
        projectMutated: false,
        reason,
        scratchProjectMutated: false,
        studentAudioUploaded: false
    }
});

const createGuardedResult = ({
    enabled,
    gateReviewed,
    hasText,
    toolId
}) => {
    if (!enabled) {
        return createBlockedResult({
            reason: 'feature-disabled',
            status: Q18_TOOL_STATUS.DISABLED,
            toolId
        });
    }
    if (!gateReviewed) {
        return createBlockedResult({
            reason: 'explain-gate-not-reviewed',
            status: Q18_TOOL_STATUS.LOCKED,
            toolId
        });
    }
    if (!hasText) {
        return createBlockedResult({
            reason: 'empty-input',
            status: Q18_TOOL_STATUS.EMPTY,
            toolId
        });
    }
    return null;
};

const readTargetName = projectSummary => {
    const targets = projectSummary && projectSummary.targets && Array.isArray(projectSummary.targets.items) ?
        projectSummary.targets.items :
        [];
    const sprite = targets.find(target => target && !target.isStage);
    return sprite && sprite.name ? sprite.name : 'Sprite';
};

const createSafeTitle = text => {
    const title = truncateText(text, TITLE_LIMIT)
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return title || 'Project skeleton';
};

const createVoiceDraft = ({
    enabled = false,
    gateReviewed = false,
    text = ''
} = {}) => {
    const safeText = truncateText(text);
    const blocked = createGuardedResult({
        enabled,
        gateReviewed,
        hasText: Boolean(safeText),
        toolId: Q18_TOOL_IDS.VOICE_DRAFT
    });
    if (blocked) return blocked;

    return {
        schemaVersion: Q18_SCHEMA_VERSION,
        status: Q18_TOOL_STATUS.READY,
        toolId: Q18_TOOL_IDS.VOICE_DRAFT,
        text: safeText,
        playback: {
            fallback: 'scratch-native-say-or-sound-library',
            generatedSoundAsset: false,
            provider: 'none',
            speechRecognition: false,
            ttsMode: 'mock-schema'
        },
        actions: [
            {
                id: 'say-first',
                label: 'Say the line on stage'
            },
            {
                id: 'choose-sound',
                label: 'Pick or record a Scratch sound'
            }
        ],
        safeguards: {
            completeScriptGenerated: false,
            externalNetwork: false,
            modelCalled: false,
            previewOnly: true,
            projectMutated: false,
            scratchProjectMutated: false,
            soundAssetGenerated: false,
            studentAudioUploaded: false
        },
        values: {
            actions: 2,
            characters: safeText.length
        }
    };
};

const createOneLineProjectSkeleton = ({
    description = '',
    enabled = false,
    gateReviewed = false,
    projectSummary = {}
} = {}) => {
    const safeDescription = truncateText(description);
    const blocked = createGuardedResult({
        enabled,
        gateReviewed,
        hasText: Boolean(safeDescription),
        toolId: Q18_TOOL_IDS.ONE_LINE_PROJECT
    });
    if (blocked) return blocked;

    const title = createSafeTitle(safeDescription);
    const targetName = readTargetName(projectSummary);
    const wantsMath = hasAnyMarker(safeDescription, ['add', 'math', 'number', 'sum', '相加', '加法', '数字']);
    const targets = [
        {
            blocks: {},
            isStage: true,
            name: 'Stage',
            role: 'place'
        },
        {
            blocks: {},
            isStage: false,
            name: targetName,
            role: 'main actor'
        }
    ];
    const variables = wantsMath ? ['first number', 'second number', 'result'] : [];
    const steps = [
        'Name the project goal',
        'Choose the main sprite and backdrop',
        'List the checks before any script is built'
    ];

    return {
        schemaVersion: Q18_SCHEMA_VERSION,
        status: Q18_TOOL_STATUS.READY,
        toolId: Q18_TOOL_IDS.ONE_LINE_PROJECT,
        description: safeDescription,
        skeleton: {
            broadcasts: [],
            comments: [
                'Explain the start event before adding blocks.',
                'Test one visible result before adding another feature.'
            ],
            stage: 'Stage',
            targets,
            title,
            variables
        },
        proof: {
            allTargetBlocksEmpty: targets.every(target => Object.keys(target.blocks).length === 0),
            completeScriptGenerated: false,
            executableScriptsGenerated: false,
            targetCount: targets.length,
            targetsWithBlocks: targets.filter(target => Object.keys(target.blocks).length > 0).length
        },
        safeguards: {
            completeScriptGenerated: false,
            externalNetwork: false,
            modelCalled: false,
            previewOnly: true,
            projectMutated: false,
            scratchProjectMutated: false,
            studentAudioUploaded: false
        },
        steps,
        values: {
            steps: steps.length,
            targets: targets.length,
            variables: variables.length
        }
    };
};

const createAdditionTemplate = ({
    description = '',
    enabled = false,
    gateReviewed = false
} = {}) => {
    const safeDescription = truncateText(description || 'Add two numbers and show the result');
    const blocked = createGuardedResult({
        enabled,
        gateReviewed,
        hasText: Boolean(safeDescription),
        toolId: Q18_TOOL_IDS.ADDITION_TEMPLATE
    });
    if (blocked) return blocked;

    const variables = [
        {
            id: 'firstNumber',
            label: 'first number'
        },
        {
            id: 'secondNumber',
            label: 'second number'
        },
        {
            id: 'result',
            label: 'result'
        }
    ];
    const comments = [
        'Ask for the first number before changing any result.',
        'Ask for the second number before adding.',
        'Show the result only after both inputs are ready.'
    ];
    const explainQuestions = [
        'Where does the first number come from?',
        'Where does the second number come from?',
        'When is it safe to show the result?'
    ];

    return {
        schemaVersion: Q18_SCHEMA_VERSION,
        status: Q18_TOOL_STATUS.READY,
        toolId: Q18_TOOL_IDS.ADDITION_TEMPLATE,
        description: safeDescription,
        template: {
            comments,
            explainQuestions,
            operation: 'addition',
            variables
        },
        proof: {
            completeAnswerScript: false,
            executableBlocksGenerated: false,
            opcodes: [],
            variablesOnly: true
        },
        safeguards: {
            completeScriptGenerated: false,
            externalNetwork: false,
            modelCalled: false,
            previewOnly: true,
            projectMutated: false,
            scratchProjectMutated: false,
            studentAudioUploaded: false
        },
        values: {
            comments: comments.length,
            questions: explainQuestions.length,
            variables: variables.length
        }
    };
};

export {
    Q18_SCHEMA_VERSION,
    Q18_TOOL_IDS,
    Q18_TOOL_STATUS,
    createAdditionTemplate,
    createOneLineProjectSkeleton,
    createVoiceDraft
};
