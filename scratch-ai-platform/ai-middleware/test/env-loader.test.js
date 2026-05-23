import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
    parseEnvFile,
    readEnvFile,
    resolveMiddlewareEnv
} from '../src/env-loader.js';

test('parses simple server-only env files without shell evaluation', () => {
    const parsed = parseEnvFile([
        '# Scratch AI secrets',
        'AI_MODEL_ENABLED=true',
        'export MOONSHOT_MODEL="moonshot-v1-8k"',
        "MOONSHOT_API_KEY='test-key'",
        'MOONSHOT_BASE_URL=https://api.moonshot.cn/v1'
    ].join('\n'));

    assert.deepEqual(parsed, {
        AI_MODEL_ENABLED: 'true',
        MOONSHOT_MODEL: 'moonshot-v1-8k',
        MOONSHOT_API_KEY: 'test-key',
        MOONSHOT_BASE_URL: 'https://api.moonshot.cn/v1'
    });
});

test('rejects malformed env lines', () => {
    assert.throws(() => parseEnvFile('not a key value'), /Invalid env file line 1/);
    assert.throws(() => parseEnvFile('BAD-KEY=value'), /Invalid env key on line 1/);
});

test('merges env file values with process env overrides and safe metadata', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'scratch-ai-env-'));
    const envPath = join(tempDir, 'scratch-ai.env');
    writeFileSync(envPath, [
        'AI_MODEL_ENABLED=true',
        'MOONSHOT_API_KEY=file-key',
        'MOONSHOT_MODEL=file-model'
    ].join('\n'));

    try {
        const resolved = resolveMiddlewareEnv({
            SCRATCH_AI_ENV_FILE: envPath,
            MOONSHOT_MODEL: 'process-model'
        });

        assert.equal(resolved.AI_MODEL_ENABLED, 'true');
        assert.equal(resolved.MOONSHOT_API_KEY, 'file-key');
        assert.equal(resolved.MOONSHOT_MODEL, 'process-model');
        assert.equal(resolved.__SCRATCH_AI_ENV_FILE_CONFIGURED, 'true');
        assert.equal(resolved.__SCRATCH_AI_ENV_FILE_LOADED, 'true');
    } finally {
        rmSync(tempDir, {
            recursive: true,
            force: true
        });
    }
});

test('allows missing env file and keeps model disabled by config default', () => {
    const resolved = resolveMiddlewareEnv({
        SCRATCH_AI_ENV_FILE: '/tmp/scratch-ai-missing-env-file'
    });

    assert.equal(resolved.__SCRATCH_AI_ENV_FILE_CONFIGURED, 'true');
    assert.equal(resolved.__SCRATCH_AI_ENV_FILE_LOADED, 'false');
    assert.equal(readEnvFile('/tmp/scratch-ai-missing-env-file').MOONSHOT_API_KEY, undefined);
});
