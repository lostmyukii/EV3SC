import fs from 'fs';
import {spawnSync} from 'child_process';


if (!fs.existsSync('.git')) {
    console.info('Skipping husky install: scratch-editor/.git is not present.');
    process.exit(0);
}

const result = spawnSync(
    'husky',
    ['install'],
    {
        shell: process.platform === 'win32',
        stdio: 'inherit'
    }
);

process.exit(result.status ?? 1);
