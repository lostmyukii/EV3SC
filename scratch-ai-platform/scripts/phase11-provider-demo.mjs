import assert from 'node:assert/strict';
import {createServer} from 'node:http';

import {createMiddlewareConfig} from '../ai-middleware/src/config.js';
import {createRequestHandler} from '../ai-middleware/src/server.js';

const DEMO_ORIGIN = 'http://127.0.0.1:8603';

const createDemoPayload = overrides => Object.assign({
    modelConsent: true,
    studentText: 'Please give me one hint and mention logicFlow:script-1.',
    gateDraft: {
        goal: 'Make a quiz that gives feedback.',
        logic: 'When the answer is clicked, check whether it is right.',
        evidence: 'Try a right answer and see a good message.'
    },
    evidenceChecklist: {
        score: 4,
        maxScore: 5,
        items: [{
            id: 'gate.goal',
            pathId: 'gate:goal',
            score: 1,
            status: 'pass'
        }]
    },
    projectSummary: {
        targets: {
            total: 2,
            sprites: 1
        },
        blocks: {
            visible: 12,
            scripts: 2
        },
        events: {
            hats: 1
        },
        broadcasts: {
            sends: 0,
            receives: 0,
            messageCount: 0
        },
        logic: {
            flows: [{
                pathId: 'logicFlow:script-1',
                targetLabel: 'Sprite',
                scriptIndex: 1,
                trigger: {
                    opcode: 'event_whenflagclicked',
                    label: 'Green flag'
                },
                blockCount: 4,
                broadcastSends: []
            }],
            broadcastLinks: []
        }
    }
}, overrides || {});

const listen = server => new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
        resolve(server.address().port);
    });
});

const closeServer = server => new Promise((resolve, reject) => {
    server.close(error => {
        if (error) {
            reject(error);
            return;
        }
        resolve();
    });
});

const postJson = async (port, payload) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/socratic-chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: DEMO_ORIGIN
        },
        body: JSON.stringify(payload)
    });
    assert.equal(response.ok, true);
    return response.json();
};

const runMiddlewareScenario = async ({
    env,
    fetchImpl,
    name,
    payload
}) => {
    const server = createServer(createRequestHandler(createMiddlewareConfig(env), fetchImpl));
    const port = await listen(server);
    try {
        const reply = await postJson(port, payload);
        return {
            name,
            blocked: reply.blocked === true,
            modelEnabled: reply.modelEnabled === true,
            provider: reply.provider,
            text: reply.text,
            safetyGate: reply.safetyGate
        };
    } finally {
        await closeServer(server);
    }
};

let providerFetchCount = 0;
const fakeProviderFetch = async () => {
    providerFetchCount++;
    return {
        ok: true,
        json: async () => ({
            choices: [{
                message: {
                    content: 'Hint: first look at logicFlow:script-1 and say what should happen on the stage.'
                }
            }],
            usage: {
                total_tokens: 18
            }
        })
    };
};

const disabledReply = await runMiddlewareScenario({
    name: 'disabled',
    env: {
        AI_MODEL_ENABLED: 'false',
        MOONSHOT_API_KEY: ''
    },
    fetchImpl: fakeProviderFetch,
    payload: createDemoPayload()
});

const enabledReply = await runMiddlewareScenario({
    name: 'enabled',
    env: {
        AI_MODEL_ENABLED: 'true',
        MOONSHOT_API_KEY: 'demo-key'
    },
    fetchImpl: fakeProviderFetch,
    payload: createDemoPayload()
});

const blockedReply = await runMiddlewareScenario({
    name: 'enabled-blocked',
    env: {
        AI_MODEL_ENABLED: 'true',
        MOONSHOT_API_KEY: 'demo-key'
    },
    fetchImpl: fakeProviderFetch,
    payload: createDemoPayload({
        projectSummary: {
            logic: {
                flows: [{
                    targetId: 'private-target',
                    scriptId: 'private-script',
                    blockIds: ['private-script']
                }]
            }
        }
    })
});

assert.equal(disabledReply.modelEnabled, false);
assert.equal(enabledReply.modelEnabled, true);
assert.equal(enabledReply.blocked, false);
assert.match(enabledReply.text, /logicFlow:script-1/);
assert.equal(blockedReply.blocked, true);
assert.ok(blockedReply.safetyGate.blockedReasons.some(reason => reason.indexOf('forbidden-context:') === 0));
assert.equal(providerFetchCount, 1);

console.log(JSON.stringify({
    providerFetchCount,
    scenarios: [
        disabledReply,
        enabledReply,
        blockedReply
    ]
}, null, 2));
