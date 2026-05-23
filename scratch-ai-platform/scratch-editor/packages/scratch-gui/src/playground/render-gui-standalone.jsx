import {EditorState, createStandaloneRoot, setAppElement} from '../index-standalone';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import {PLATFORM} from '../lib/platform.js';

import log from '../lib/log.js';

const onClickLogo = () => {
    window.location = 'https://scratch.mit.edu';
};

const handleTelemetryModalCancel = () => {
    log('User canceled telemetry modal');
};

const handleTelemetryModalOptIn = () => {
    log('User opted into telemetry');
};

const handleTelemetryModalOptOut = () => {
    log('User opted out of telemetry');
};

const resolveScratchHost = (configuredHost, sameOriginPath = '') => {
    if (configuredHost === 'same-origin' && typeof window === 'object') {
        return `${window.location.origin}${sameOriginPath}`;
    }
    return configuredHost || void 0;
};

const getScratchAssetHost = () => {
    const configuredHost = process.env.SCRATCH_AI_ASSET_HOST ||
        (process.env.SCRATCH_AI_MIDDLEWARE_URL === '/' ? 'same-origin' : '');
    return resolveScratchHost(configuredHost);
};

const getScratchProjectHost = () => {
    const configuredHost = process.env.SCRATCH_AI_PROJECT_HOST ||
        (process.env.SCRATCH_AI_MIDDLEWARE_URL === '/' ? 'same-origin' : '');
    return resolveScratchHost(configuredHost, '/internalapi/project');
};

/*
 * Render the GUI playground. This is a separate function because importing anything
 * that instantiates the VM causes unsupported browsers to crash
 * {object} appTarget - the DOM element to render to
 */
export default appTarget => {
    setAppElement(appTarget);
    const scratchAssetHost = getScratchAssetHost();
    const scratchProjectHost = getScratchProjectHost();
    if (scratchAssetHost && typeof window === 'object') {
        window.SCRATCH_ASSET_HOST = scratchAssetHost;
    }
    if (scratchProjectHost && typeof window === 'object') {
        window.SCRATCH_PROJECT_HOST = scratchProjectHost;
    }

    // TODO a hack for testing the backpack, allow backpack host to be set by url param
    const backpackHostMatches = window.location.href.match(/[?&]backpack_host=([^&]*)&?/);
    const backpackHost = backpackHostMatches ? backpackHostMatches[1] : null;

    const scratchDesktopMatches = window.location.href.match(/[?&]isScratchDesktop=([^&]+)/);
    let simulateScratchDesktop;
    if (scratchDesktopMatches) {
        try {
            // parse 'true' into `true`, 'false' into `false`, etc.
            simulateScratchDesktop = JSON.parse(scratchDesktopMatches[1]);
        } catch {
            // it's not JSON so just use the string
            // note that a typo like "falsy" will be treated as true
            simulateScratchDesktop = scratchDesktopMatches[1];
        }
    }

    if (process.env.NODE_ENV === 'production' && typeof window === 'object') {
        // Warn before navigating away
        window.onbeforeunload = () => true;
    }

    const state = new EditorState({
        showTelemetryModal: simulateScratchDesktop
    });
    const gui = createStandaloneRoot(state, appTarget, {
        wrappers: [HashParserHOC]
    });

    // important: this is checking whether `simulateScratchDesktop` is truthy, not just defined!
    if (simulateScratchDesktop) {
        gui.render({
            canEditTitle: true,
            platform: PLATFORM.DESKTOP,
            showTelemetryModal: true,
            assetHost: scratchAssetHost,
            projectHost: scratchProjectHost,
            canSave: false,
            onTelemetryModalCancel: handleTelemetryModalCancel,
            onTelemetryModalOptIn: handleTelemetryModalOptIn,
            onTelemetryModalOptOut: handleTelemetryModalOptOut
        });
    } else {
        gui.render({
            canEditTitle: true,
            backpackVisible: true,
            showComingSoon: true,
            backpackHost,
            assetHost: scratchAssetHost,
            projectHost: scratchProjectHost,
            canSave: false,
            onClickLogo
        });
    }
};
