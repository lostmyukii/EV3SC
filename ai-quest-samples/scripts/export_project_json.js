#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const {
    buildScratchProjectJson,
    loadSampleProjects,
    validateSampleProject
} = require('../index.js');
const {VSLEEV3Extension} = require('../../vsle-ev3-extension/index.js');

const args = process.argv.slice(2);
const outFlagIndex = args.indexOf('--out');
const outDir = outFlagIndex >= 0 && args[outFlagIndex + 1] ?
    args[outFlagIndex + 1] :
    path.join(__dirname, '..', 'dist');
const projectsDir = path.join(__dirname, '..', 'projects');

fs.mkdirSync(outDir, {recursive: true});

const projects = loadSampleProjects(projectsDir);
const opcodes = extensionOpcodes();
for (const project of projects) {
    const errors = validateSampleProject(project, {opcodes});
    if (errors.length > 0) {
        throw new Error(errors.join('; '));
    }
    const filename = `${project.id}.project.json`;
    const outputPath = path.join(outDir, filename);
    fs.writeFileSync(
        outputPath,
        `${JSON.stringify(buildScratchProjectJson(project), null, 2)}\n`,
        'utf8'
    );
    process.stdout.write(`${filename}\n`);
}

function extensionOpcodes () {
    const extension = new VSLEEV3Extension();
    return new Set(
        extension.getInfo().blocks
            .filter(block => block && typeof block === 'object')
            .map(block => `vsleev3_${block.opcode}`)
    );
}
