/* global __SCRATCH_AI_ENABLED__, __SCRATCH_AI_PANEL_ENABLED__, __SCRATCH_AI_EXTENSION_ENABLED__ */
/* global __SCRATCH_AI_MENU_ENABLED__, __SCRATCH_AI_LOGGING_ENABLED__, __SCRATCH_AI_META_EXPORT_ENABLED__ */
/* global __SCRATCH_AI_TEACHER_PANEL_ENABLED__, __SCRATCH_AI_KNOWLEDGE_LOCK_ENABLED__ */
/* global __SCRATCH_AI_LESSON_PREP_ENABLED__, __SCRATCH_AI_PROJECT_PLANNER_ENABLED__ */
/* global __SCRATCH_AI_LOGIC_VIS_ENABLED__, __SCRATCH_AI_PUBLISHING_ENABLED__ */
/* global __SCRATCH_AI_IMAGE_BLOCKS_ENABLED__, __SCRATCH_AI_VOICE_BLOCKS_ENABLED__ */
/* global __SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__, __SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__ */
/* global __SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__, __SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__ */
/* global __SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__ */
/* global __SCRATCH_AI_EXTERNAL_TUTORIAL_VIDEOS_ENABLED__, __SCRATCH_AI_TUTORIAL_TRACKING_PIXELS_ENABLED__ */
/* global __SCRATCH_AI_MIDDLEWARE_URL__ */

const parseBooleanFlag = (value, defaultValue = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string' || value.length === 0) return defaultValue;

    switch (value.toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
        return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
        return false;
    default:
        return defaultValue;
    }
};

const scratchAIEnabled = parseBooleanFlag(
    typeof __SCRATCH_AI_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_ENABLED__,
    false
);

const readStringFlag = value => (typeof value === 'string' ? value.trim() : '');

const aiFeatureFlags = Object.freeze({
    scratchAIEnabled,
    scratchAIPanelEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_PANEL_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_PANEL_ENABLED__,
            false
        ),
    scratchAIExtensionEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_EXTENSION_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_EXTENSION_ENABLED__,
            false
        ),
    scratchAIMenuEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_MENU_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_MENU_ENABLED__,
            false
        ),
    scratchAILoggingEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_LOGGING_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_LOGGING_ENABLED__,
            false
        ),
    scratchAIMetaExportEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_META_EXPORT_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_META_EXPORT_ENABLED__,
            false
        ),
    scratchAITeacherPanelEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_TEACHER_PANEL_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_TEACHER_PANEL_ENABLED__,
            false
        ),
    scratchAIKnowledgeLockEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_KNOWLEDGE_LOCK_ENABLED__ === 'undefined' ?
                '' : __SCRATCH_AI_KNOWLEDGE_LOCK_ENABLED__,
            false
        ),
    scratchAILessonPrepEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_LESSON_PREP_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_LESSON_PREP_ENABLED__,
            false
        ),
    scratchAIProjectPlannerEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_PROJECT_PLANNER_ENABLED__ === 'undefined' ?
                '' : __SCRATCH_AI_PROJECT_PLANNER_ENABLED__,
            false
        ),
    scratchAILogicVisEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_LOGIC_VIS_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_LOGIC_VIS_ENABLED__,
            false
        ),
    scratchAIPublishingEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_PUBLISHING_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_PUBLISHING_ENABLED__,
            false
        ),
    scratchAIImageBlocksEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_IMAGE_BLOCKS_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_IMAGE_BLOCKS_ENABLED__,
            false
        ),
    scratchAIVoiceBlocksEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_VOICE_BLOCKS_ENABLED__ === 'undefined' ? '' : __SCRATCH_AI_VOICE_BLOCKS_ENABLED__,
            false
        ),
    scratchAIOneLineProjectEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__ === 'undefined' ?
                '' : __SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__,
            false
        ),
    scratchAIAdditionTemplateEnabled: scratchAIEnabled &&
        parseBooleanFlag(
            typeof __SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__ === 'undefined' ?
                '' : __SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__,
            false
        ),
    scratchAITextToSpeechExtensionEnabled: parseBooleanFlag(
        typeof __SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__ === 'undefined' ?
            '' : __SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__,
        false
    ),
    scratchAITranslateExtensionEnabled: parseBooleanFlag(
        typeof __SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__ === 'undefined' ?
            '' : __SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__,
        false
    ),
    scratchAISpeechToTextExtensionEnabled: parseBooleanFlag(
        typeof __SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__ === 'undefined' ?
            '' : __SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__,
        false
    ),
    scratchAIExternalTutorialVideosEnabled: parseBooleanFlag(
        typeof __SCRATCH_AI_EXTERNAL_TUTORIAL_VIDEOS_ENABLED__ === 'undefined' ?
            '' : __SCRATCH_AI_EXTERNAL_TUTORIAL_VIDEOS_ENABLED__,
        false
    ),
    scratchAITutorialTrackingPixelsEnabled: parseBooleanFlag(
        typeof __SCRATCH_AI_TUTORIAL_TRACKING_PIXELS_ENABLED__ === 'undefined' ?
            '' : __SCRATCH_AI_TUTORIAL_TRACKING_PIXELS_ENABLED__,
        false
    ),
    scratchAIMiddlewareUrl: readStringFlag(
        typeof __SCRATCH_AI_MIDDLEWARE_URL__ === 'undefined' ? '' : __SCRATCH_AI_MIDDLEWARE_URL__
    )
});

export {
    parseBooleanFlag
};

export default aiFeatureFlags;
