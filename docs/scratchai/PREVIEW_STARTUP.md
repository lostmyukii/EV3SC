# ScratchAI Editor Preview Startup

Date: 2026-05-23

This preview path starts the EV3SC-owned ScratchAI editor from
`/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor`. It is the
Scratch editor surface that later receives the complete VSLE-EV3 extension
behind the normal `EV3` extension library entry.

It is different from `/Users/yukii/Desktop/EV3SC/preview/index.html`, which is
only a development aid for the standalone VSLE-EV3 panels and simulated bridge.

## Prerequisites

Run these from `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor`
after the source tree has been ported into EV3SC:

```bash
npm ci
npm --workspace @scratch/scratch-svg-renderer run build
npm --workspace @scratch/scratch-render run build
npm --workspace @scratch/scratch-vm run build
```

The generated `node_modules`, `build`, and `dist` artifacts remain ignored by
git. They must stay under `/Users/yukii/Desktop/EV3SC/`.

## Start The Editor

Run this from `/Users/yukii/Desktop/EV3SC`:

```bash
.venv/bin/python scripts/start_scratchai_preview.py --host 127.0.0.1 --port 8601
```

The script starts `webpack serve` from the EV3SC-owned `scratch-gui` package
and embeds ScratchAI feature flags plus the default local middleware URL
`http://127.0.0.1:8787`.

To inspect the exact command without starting the server:

```bash
.venv/bin/python scripts/start_scratchai_preview.py --print-command
```

## Verify The Editor

In another terminal, run:

```bash
.venv/bin/python scripts/verify_scratchai_preview.py --url http://127.0.0.1:8601/
```

The verifier polls the editor URL, checks the Scratch GUI HTML title, then
fetches `gui.js` and confirms the ScratchAI-enabled Scratch GUI bundle is being
served.

## Current Boundary

This startup path proves that the ScratchAI editor itself loads from EV3SC.
It does not yet replace the ScratchAI extension library `EV3` tile with
VSLE-EV3. That is the next integration step.
