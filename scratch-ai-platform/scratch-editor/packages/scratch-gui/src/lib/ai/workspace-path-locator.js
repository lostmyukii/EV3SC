import {
    AI_LOGIC_PATH_TYPES,
    createBroadcastLinkPath,
    createLogicFlowPath
} from './evidence-checklist.js';

const AI_LOGIC_WORKSPACE_FOCUS_EVENT = 'AI_LOGIC_WORKSPACE_FOCUS';

const readArray = value => (Array.isArray(value) ? value : []);

const readLogic = projectSummary => (
    projectSummary && projectSummary.logic ? projectSummary.logic : {}
);

const readReferenceBlockIds = reference => {
    const blockIds = readArray(reference && reference.blockIds)
        .filter(blockId => typeof blockId === 'string' && blockId.length > 0);
    if (blockIds.length) return blockIds;
    return reference && reference.scriptId ? [reference.scriptId] : [];
};

const createWorkspaceLocation = ({
    blockId,
    blockIds,
    message,
    pathId,
    scriptId,
    targetId,
    targetName,
    type
}) => {
    if (!pathId || !targetId || !blockId) return null;

    return {
        blockId,
        blockIds: readArray(blockIds),
        message,
        pathId,
        scriptId,
        targetId,
        targetName,
        type
    };
};

const resolveLogicFlowLocation = (activePathId, flows) => {
    const flow = flows.find(candidate => createLogicFlowPath(candidate).pathId === activePathId);
    if (!flow) return null;

    return createWorkspaceLocation({
        blockId: flow.scriptId,
        blockIds: flow.blockIds,
        pathId: activePathId,
        scriptId: flow.scriptId,
        targetId: flow.targetId,
        targetName: flow.targetName,
        type: AI_LOGIC_PATH_TYPES.LOGIC_FLOW
    });
};

const findBroadcastAnchor = link => {
    const sends = readArray(link && link.sends);
    const receives = readArray(link && link.receives);
    return sends.find(reference => readReferenceBlockIds(reference).length > 0) ||
        receives.find(reference => readReferenceBlockIds(reference).length > 0) ||
        sends[0] ||
        receives[0] ||
        null;
};

const resolveBroadcastLocation = (activePathId, links) => {
    const link = links.find(candidate => (
        createBroadcastLinkPath(candidate && candidate.name).pathId === activePathId
    ));
    if (!link) return null;

    const anchor = findBroadcastAnchor(link);
    const anchorBlockIds = readReferenceBlockIds(anchor);
    const relatedBlockIds = readArray(link.sends)
        .concat(readArray(link.receives))
        .flatMap(readReferenceBlockIds);

    return createWorkspaceLocation({
        blockId: anchorBlockIds[0],
        blockIds: relatedBlockIds,
        message: link.name,
        pathId: activePathId,
        scriptId: anchor && anchor.scriptId,
        targetId: anchor && anchor.targetId,
        targetName: anchor && anchor.targetName,
        type: AI_LOGIC_PATH_TYPES.BROADCAST_LINK
    });
};

const resolveScratchWorkspaceLocation = ({
    activePathId,
    projectSummary
} = {}) => {
    if (!activePathId) return null;

    const logic = readLogic(projectSummary);
    const flows = readArray(logic.flows);
    const links = readArray(logic.broadcastLinks);

    return resolveLogicFlowLocation(activePathId, flows) ||
        resolveBroadcastLocation(activePathId, links);
};

const emitWorkspaceFocus = (vm, payload) => {
    if (!vm || typeof vm.emit !== 'function') return;
    vm.emit(AI_LOGIC_WORKSPACE_FOCUS_EVENT, payload);
};

const clearScratchWorkspacePathFocus = vm => {
    emitWorkspaceFocus(vm, {
        clear: true
    });
    return null;
};

const focusScratchWorkspacePath = ({
    activePathId,
    projectSummary,
    vm
} = {}) => {
    const location = resolveScratchWorkspaceLocation({
        activePathId,
        projectSummary
    });

    if (!location) {
        return clearScratchWorkspacePathFocus(vm);
    }

    if (
        location.targetId &&
        vm &&
        vm.editingTarget &&
        vm.editingTarget.id !== location.targetId &&
        typeof vm.setEditingTarget === 'function'
    ) {
        vm.setEditingTarget(location.targetId);
    }

    emitWorkspaceFocus(vm, location);
    return location;
};

export {
    AI_LOGIC_WORKSPACE_FOCUS_EVENT,
    clearScratchWorkspacePathFocus,
    focusScratchWorkspacePath,
    resolveScratchWorkspaceLocation
};

export default resolveScratchWorkspaceLocation;
