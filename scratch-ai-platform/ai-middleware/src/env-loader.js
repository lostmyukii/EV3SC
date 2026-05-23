import {existsSync, readFileSync} from 'node:fs';

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_FILE_CONFIGURED_KEY = '__SCRATCH_AI_ENV_FILE_CONFIGURED';
const ENV_FILE_LOADED_KEY = '__SCRATCH_AI_ENV_FILE_LOADED';

const unquoteEnvValue = value => {
    const trimmed = String(value || '').trim();
    if (trimmed.length < 2) return trimmed;

    const quote = trimmed[0];
    if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
        return trimmed;
    }

    const body = trimmed.slice(1, -1);
    if (quote === "'") return body;

    return body
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
};

const parseEnvFile = contents => {
    const env = {};

    String(contents || '').split(/\r?\n/).forEach((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) return;

        const normalizedLine = trimmedLine.startsWith('export ') ?
            trimmedLine.slice('export '.length).trim() :
            trimmedLine;
        const equalsIndex = normalizedLine.indexOf('=');
        if (equalsIndex === -1) {
            throw new Error(`Invalid env file line ${index + 1}`);
        }

        const key = normalizedLine.slice(0, equalsIndex).trim();
        if (!ENV_KEY_PATTERN.test(key)) {
            throw new Error(`Invalid env key on line ${index + 1}`);
        }

        env[key] = unquoteEnvValue(normalizedLine.slice(equalsIndex + 1));
    });

    return env;
};

const readEnvFile = filePath => {
    const normalizedPath = String(filePath || '').trim();
    if (!normalizedPath || !existsSync(normalizedPath)) return {};
    return parseEnvFile(readFileSync(normalizedPath, 'utf8'));
};

const resolveMiddlewareEnv = (processEnv = {}) => {
    const envFilePath = String(processEnv.SCRATCH_AI_ENV_FILE || '').trim();
    const fileEnv = readEnvFile(envFilePath);

    return {
        ...fileEnv,
        ...processEnv,
        [ENV_FILE_CONFIGURED_KEY]: envFilePath ? 'true' : 'false',
        [ENV_FILE_LOADED_KEY]: envFilePath && existsSync(envFilePath) ? 'true' : 'false'
    };
};

export {
    ENV_FILE_CONFIGURED_KEY,
    ENV_FILE_LOADED_KEY,
    parseEnvFile,
    readEnvFile,
    resolveMiddlewareEnv
};
