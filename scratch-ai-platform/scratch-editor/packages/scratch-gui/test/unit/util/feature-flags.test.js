const GLOBAL_FLAG_NAMES = [
    '__SCRATCH_AI_ENABLED__',
    '__SCRATCH_AI_PANEL_ENABLED__',
    '__SCRATCH_AI_EXTENSION_ENABLED__',
    '__SCRATCH_AI_MENU_ENABLED__',
    '__SCRATCH_AI_LOGGING_ENABLED__',
    '__SCRATCH_AI_META_EXPORT_ENABLED__',
    '__SCRATCH_AI_TEACHER_PANEL_ENABLED__',
    '__SCRATCH_AI_KNOWLEDGE_LOCK_ENABLED__',
    '__SCRATCH_AI_LESSON_PREP_ENABLED__',
    '__SCRATCH_AI_PROJECT_PLANNER_ENABLED__',
    '__SCRATCH_AI_LOGIC_VIS_ENABLED__',
    '__SCRATCH_AI_PUBLISHING_ENABLED__',
    '__SCRATCH_AI_IMAGE_BLOCKS_ENABLED__',
    '__SCRATCH_AI_VOICE_BLOCKS_ENABLED__',
    '__SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__',
    '__SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__',
    '__SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__',
    '__SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__',
    '__SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__',
    '__SCRATCH_AI_EXTERNAL_TUTORIAL_VIDEOS_ENABLED__',
    '__SCRATCH_AI_TUTORIAL_TRACKING_PIXELS_ENABLED__',
    '__SCRATCH_AI_MIDDLEWARE_URL__'
];

const clearGlobalFlags = () => {
    for (const flagName of GLOBAL_FLAG_NAMES) {
        delete global[flagName];
    }
};

const readFeatureFlags = () => {
    jest.resetModules();
    return require('../../../src/lib/ai/feature-flags').default;
};

describe('ai feature flags', () => {
    beforeEach(clearGlobalFlags);
    afterEach(clearGlobalFlags);

    test('keeps project planner and logic visualization off by default', () => {
        const flags = readFeatureFlags();

        expect(flags.scratchAIProjectPlannerEnabled).toBe(false);
        expect(flags.scratchAILogicVisEnabled).toBe(false);
        expect(flags.scratchAIPublishingEnabled).toBe(false);
        expect(flags.scratchAIVoiceBlocksEnabled).toBe(false);
        expect(flags.scratchAIOneLineProjectEnabled).toBe(false);
        expect(flags.scratchAIAdditionTemplateEnabled).toBe(false);
        expect(flags.scratchAITextToSpeechExtensionEnabled).toBe(false);
        expect(flags.scratchAITranslateExtensionEnabled).toBe(false);
        expect(flags.scratchAISpeechToTextExtensionEnabled).toBe(false);
        expect(flags.scratchAIExternalTutorialVideosEnabled).toBe(false);
        expect(flags.scratchAITutorialTrackingPixelsEnabled).toBe(false);
    });

    test('requires the main AI flag before enabling staged feature flags', () => {
        global.__SCRATCH_AI_PROJECT_PLANNER_ENABLED__ = 'true';
        global.__SCRATCH_AI_LOGIC_VIS_ENABLED__ = 'true';
        global.__SCRATCH_AI_PUBLISHING_ENABLED__ = 'true';
        global.__SCRATCH_AI_VOICE_BLOCKS_ENABLED__ = 'true';
        global.__SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__ = 'true';
        global.__SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__ = 'true';

        let flags = readFeatureFlags();

        expect(flags.scratchAIProjectPlannerEnabled).toBe(false);
        expect(flags.scratchAILogicVisEnabled).toBe(false);
        expect(flags.scratchAIPublishingEnabled).toBe(false);
        expect(flags.scratchAIVoiceBlocksEnabled).toBe(false);
        expect(flags.scratchAIOneLineProjectEnabled).toBe(false);
        expect(flags.scratchAIAdditionTemplateEnabled).toBe(false);

        global.__SCRATCH_AI_ENABLED__ = 'true';
        flags = readFeatureFlags();

        expect(flags.scratchAIProjectPlannerEnabled).toBe(true);
        expect(flags.scratchAILogicVisEnabled).toBe(true);
        expect(flags.scratchAIPublishingEnabled).toBe(true);
        expect(flags.scratchAIVoiceBlocksEnabled).toBe(true);
        expect(flags.scratchAIOneLineProjectEnabled).toBe(true);
        expect(flags.scratchAIAdditionTemplateEnabled).toBe(true);
    });

    test('external Scratch service extension flags do not require the main AI flag', () => {
        global.__SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__ = 'true';
        global.__SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__ = 'true';
        global.__SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__ = 'true';

        const flags = readFeatureFlags();

        expect(flags.scratchAITextToSpeechExtensionEnabled).toBe(true);
        expect(flags.scratchAITranslateExtensionEnabled).toBe(true);
        expect(flags.scratchAISpeechToTextExtensionEnabled).toBe(true);
        expect(flags.scratchAIEnabled).toBe(false);
    });

    test('external tutorial resource flags do not require the main AI flag', () => {
        global.__SCRATCH_AI_EXTERNAL_TUTORIAL_VIDEOS_ENABLED__ = 'true';
        global.__SCRATCH_AI_TUTORIAL_TRACKING_PIXELS_ENABLED__ = 'true';

        const flags = readFeatureFlags();

        expect(flags.scratchAIExternalTutorialVideosEnabled).toBe(true);
        expect(flags.scratchAITutorialTrackingPixelsEnabled).toBe(true);
        expect(flags.scratchAIEnabled).toBe(false);
    });
});
