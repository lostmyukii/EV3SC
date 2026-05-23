import {
    createConfiguredModelProvider,
    describeModelProvider,
    readModelProviderAssistantText
} from './model-provider.js';
import {
    createModelRequestSafetyGate,
    createSafetyGatePublicSummary,
    minimizeModelRequestPayload,
    truncateText
} from './model-request-safety-gate.js';

const SOCRATIC_SYSTEM_PROMPT = [
    'You are an AI logic coach for Scratch learners aged 8-14.',
    'Use Socratic guidance: ask questions and give hints before giving solutions.',
    'Do not provide a complete copy-paste Scratch block sequence by default.',
    'If the student asks for direct code, ask for goal, current logic, and evidence first.',
    'Keep the answer short, concrete, and friendly.'
].join(' ');

const summarizeRequestContext = request => JSON.stringify({
    gateDraft: request.gateDraft || {},
    evidenceChecklist: request.evidenceChecklist || {},
    projectSummary: request.projectSummary || {},
    teacherPolicy: request.teacherPolicy || {}
});

const buildSocraticMessages = request => {
    const minimizedRequest = minimizeModelRequestPayload(request || {});
    const systemPrompt = minimizedRequest.teacherPolicy && minimizedRequest.teacherPolicy.active ? [
        SOCRATIC_SYSTEM_PROMPT,
        'Follow the teacher locked knowledge policy. Keep questions, hints, and rubric language inside the selected knowledge points unless the student asks for an extension.'
    ].join(' ') : SOCRATIC_SYSTEM_PROMPT;

    return [
        {
            role: 'system',
            content: systemPrompt
        },
        {
            role: 'user',
            content: [
                `Student question: ${truncateText(minimizedRequest.studentText)}`,
                `Local context: ${truncateText(summarizeRequestContext(minimizedRequest), 3000)}`
            ].join('\n')
        }
    ];
};

const createDisabledReply = (providerInfo, safetyGate) => ({
    provider: providerInfo.provider,
    model: providerInfo.model,
    modelEnabled: false,
    safetyGate: createSafetyGatePublicSummary(safetyGate),
    text: 'Model access is disabled. Use the local Evidence checklist and Question queue first.'
});

const createSocraticModelReply = async ({
    config,
    fetchImpl,
    modelProvider,
    request
}) => {
    const safetyGate = createModelRequestSafetyGate(request || {});
    const provider = modelProvider || createConfiguredModelProvider({
        config,
        fetchImpl
    });
    const providerInfo = describeModelProvider(provider);

    if (!config.modelEnabled) {
        return createDisabledReply(providerInfo, safetyGate);
    }

    if (!safetyGate.allowed) {
        return {
            provider: providerInfo.provider,
            model: providerInfo.model,
            modelEnabled: true,
            blocked: true,
            safetyGate: createSafetyGatePublicSummary(safetyGate),
            text: 'Model request blocked by the safety gate. Use the local Evidence checklist and Question queue first.'
        };
    }

    const responseJson = await provider.createChatCompletion({
        messages: buildSocraticMessages(safetyGate.minimizedRequest),
        maxTokens: 500,
        temperature: 0.2
    });

    return {
        provider: providerInfo.provider,
        model: providerInfo.model,
        blocked: false,
        modelEnabled: true,
        safetyGate: createSafetyGatePublicSummary(safetyGate),
        teacherPolicy: safetyGate.minimizedRequest.teacherPolicy,
        text: readModelProviderAssistantText(provider, responseJson),
        usage: responseJson.usage || null
    };
};

export {
    SOCRATIC_SYSTEM_PROMPT,
    buildSocraticMessages,
    createSocraticModelReply
};
