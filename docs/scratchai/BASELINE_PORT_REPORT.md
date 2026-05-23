# ScratchAI Baseline Port Report

Date: 2026-05-23
Scope: ScratchAI source ownership and service package baseline inside EV3SC.

## Port Summary

- Source reference: `/Users/yukii/Desktop/scratch ai/scratch-ai-platform`
- EV3SC owned copy: `/Users/yukii/Desktop/EV3SC/scratch-ai-platform`
- Excluded generated directories: `.git`, `node_modules`, `build`, `dist`, `test-results`, `.cache`, `artifacts`
- Runtime/build/test dependency on `/Users/yukii/Desktop/scratch ai/`: not allowed

## Baseline Commands

| Command | Expected result | Result |
|---|---|---|
| `.venv/bin/python scripts/check_scratchai_standalone.py --root /Users/yukii/Desktop/EV3SC --forbidden-source "/Users/yukii/Desktop/scratch ai"` | exits 0 | passed; checked 10 required paths, 4 package files, 0 symlinks |
| `cd scratch-ai-platform/ai-middleware && npm test` | exits 0 | passed; Node test runner reported 87 pass, 0 fail |
| `cd scratch-ai-platform/asset-worker && npm test` | exits 0 | passed; Node test runner reported 14 pass, 0 fail |
| `cd scratch-ai-platform/preview-server && npm test` | exits 0 | passed; Node test runner reported 13 pass, 0 fail |
| `.venv/bin/python -m pytest tests/test_scratchai_port_scripts.py -v` | exits 0 | passed; pytest reported 5 passed |

## Not Covered In This Baseline

- Scratch editor dependency installation and browser preview.
- EV3 extension replacement inside ScratchAI.
- AI Quest cloud API contract.
- Official EV3 opcode compatibility mapping.

These are planned follow-up phases after the owned ScratchAI source tree is established.
