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

## Scratch Editor Baseline

| Command | Expected result | Result |
|---|---|---|
| `cd scratch-ai-platform/scratch-editor && npm ci` | exits 0 | passed; installed 2795 packages after EV3SC-owned prepare fixes reused local microbit hex and skipped nested husky when `scratch-editor/.git` is absent |
| `cd scratch-ai-platform/scratch-editor && npm --workspace @scratch/scratch-svg-renderer run build` | exits 0 | passed; generated local ignored `@scratch/scratch-svg-renderer` dist artifacts required by VM tests |
| `cd scratch-ai-platform/scratch-editor && npm --workspace @scratch/scratch-vm run lint` | exits 0 | passed; ESLint and format-message reported warnings only, 0 errors |
| `cd scratch-ai-platform/scratch-editor && npm --workspace @scratch/scratch-vm exec -- tap test/unit/extension_ai_logic_coach.js test/unit/scratch_ai_script_draft.js test/unit/util_scratch-link-websocket.js test/unit/util_jsonrpc.js test/unit/util_jsonrpc-web-socket.js` | exits 0 | passed; TAP reported 85 pass, 0 fail across ScratchAI, Scratch Link fallback, and JSON-RPC support tests |
| `cd scratch-ai-platform/scratch-editor && npm --workspace @scratch/scratch-render run build` | exits 0 | passed; generated local ignored `@scratch/scratch-render` dist artifacts required by Scratch GUI |
| `cd scratch-ai-platform/scratch-editor && npm --workspace @scratch/scratch-vm run build` | exits 0 | passed; generated local ignored `@scratch/scratch-vm` dist artifacts required by Scratch GUI |
| `cd scratch-ai-platform/scratch-editor/packages/scratch-gui && npm run build:dev` | exits 0 | passed; webpack compiled Scratch GUI dev build successfully |
| `git status --short scratch-ai-platform \| rg "node_modules\|/build/\|/dist/\|test-results\|playground\|\\.tap" \|\| true` | no output | passed; generated dependency, build, documentation, and TAP artifacts remained ignored |

## Scratch Editor Preview Startup

| Command | Expected result | Result |
|---|---|---|
| `.venv/bin/python scripts/start_scratchai_preview.py --print-command` | exits 0 | passed; printed the EV3SC-owned `scratch-gui` webpack serve command, URL `http://127.0.0.1:8601/`, and ScratchAI feature flag environment |
| `.venv/bin/python scripts/start_scratchai_preview.py --host 127.0.0.1 --port 8601` | webpack dev server compiles and listens on localhost | passed; webpack-dev-server reported `http://127.0.0.1:8601/` and `compiled successfully` |
| `.venv/bin/python scripts/verify_scratchai_preview.py --url http://127.0.0.1:8601/ --timeout-seconds 30` | exits 0 while preview server is running | passed; HTTP 200 for `index.html`, HTTP 200 for `gui.js`, 34,384,505-byte ScratchAI-enabled GUI bundle |
| Playwright Chromium smoke against `http://127.0.0.1:8601/` | Scratch GUI renders in browser | passed; title `Scratch 3.0 GUI`, Motion/Looks/Events visible, 3 canvas elements, 0 page errors |

Notes:

- `npm --workspace @scratch/scratch-vm test -- --grep ScratchAI` is not a reliable ScratchAI-only smoke command in this workspace: npm appended `ScratchAI` to the package `tap` script, causing the full VM test pattern to run. That full run reached 3250 pass / 22 fail, with failures in upstream missing/corrupted costume fallback tests that attempted network `fetch`; it is recorded as out of scope for the ScratchAI targeted editor baseline.
- `@scratch/scratch-render` and `@scratch/scratch-vm` builds reported the upstream optional `canvas` resolution warning from `jsdom`/`isomorphic-dompurify`; webpack still exited 0.

## Not Covered In This Baseline

- EV3 extension replacement inside ScratchAI.
- AI Quest cloud API contract.
- Official EV3 opcode compatibility mapping.

The ScratchAI editor can now be locally previewed from EV3SC; replacing the
extension library `EV3` tile remains the next integration phase.

These are planned follow-up phases after the owned ScratchAI source tree is established.
