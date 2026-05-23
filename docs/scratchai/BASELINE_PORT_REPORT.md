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

- AI Quest cloud API contract.
- Official EV3 opcode compatibility mapping.

The ScratchAI editor can now be locally previewed from EV3SC.

## ScratchAI EV3 Extension Entry

| Command | Expected result | Result |
|---|---|---|
| `npm --workspace @scratch/scratch-gui run test:unit -- --runTestsByPath test/unit/util/extensions-library.test.jsx test/unit/containers/extension-library.test.jsx` | exits 0 | passed; EV3 extension library card points to `http://localhost:8000/vsle-ev3-extension/index.js` and selects loaded category `vsleev3` |
| `npm --workspace @scratch/scratch-vm exec -- tap test/unit/extension_unsandboxed_loader.js` | exits 0 | passed; VSLE-EV3 URL is allowlisted for Unsandboxed loading and registers through the main-thread Scratch API |
| `.venv/bin/python -m pytest weisile-link/tests/test_json_rpc_server.py -v` | exits 0 | passed; WeisileLink accepts the ScratchAI editor preview Origin `http://127.0.0.1:8601` while preserving Origin rejection tests |
| `cd vsle-ev3-extension && npm test` | exits 0 | passed; VSLE-EV3 extension still exposes the complete 64-block surface with category name `EV3` |
| `npm --workspace @scratch/scratch-vm run build` | exits 0 | passed; Scratch VM builds after adding the allowlisted Unsandboxed extension URL loader |
| `npm --workspace @scratch/scratch-gui run build:dev` | exits 0 | passed; Scratch GUI development bundle builds with the EV3 entry routed to VSLE-EV3 |
| Playwright smoke against `http://127.0.0.1:8601/` with `python3 -m http.server 8000 --bind 127.0.0.1` serving EV3SC | EV3 card click loads VSLE-EV3 blocks | passed; clicked extension library `EV3`, fetched `http://localhost:8000/vsle-ev3-extension/index.js` with HTTP 200, and found VSLE-EV3 block text including `停止所有EV3功能`, `EV3电池电压`, and `EV3已连接?` |

## ScratchAI Official EV3 Compatibility

| Command | Expected result | Result |
|---|---|---|
| `npm --workspace @scratch/scratch-vm exec -- tap test/unit/extension_vsle_ev3_compat.js` | exits 0 | passed; built-in `ev3` now loads the VSLE-backed compatibility extension, maps all 11 official opcodes, and verifies the old EV3 `.sb3` fixture registers `ev3_getDistance` through the compatibility runtime |
| `npm --workspace @scratch/scratch-vm exec -- tap test/unit/extension_vsle_ev3_compat.js test/unit/extension_unsandboxed_loader.js` | exits 0 | passed; 25 checks cover legacy EV3 opcode mapping plus the Unsandboxed VSLE-EV3 URL loader |
| `SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED=1 npm --workspace @scratch/scratch-vm exec -- tap test/integration/load-extensions.js` | exits 0 | passed; 23 checks cover the full extension fixture loop, including the official EV3 `.sb3` compatibility path while honoring ScratchAI's default external-service policy |
| `npm --workspace @scratch/scratch-vm run lint` | exits 0 | passed with existing warning-only JSDoc and format-message output; no blocking lint errors from the EV3 compatibility work |
| `npm --workspace @scratch/scratch-vm run build` | exits 0 | passed with the existing optional `canvas` warning from the Scratch SVG/jsdom dependency path; the built-in compatibility extension does not pull the Unsandboxed VSLE bundle into the VM build |

## ScratchAI EV3 AI Quest API Contract

| Command | Expected result | Result |
|---|---|---|
| `.venv/bin/python -m pytest weisile-link/tests/test_ai_quest_contract.py weisile-link/tests/test_json_rpc_server_ai_quest.py -q` | exits 0 | passed; verifies server-side AI Quest upload sanitization, provider response normalization, cloud/cached/localFallback prediction modes, and JSON-RPC `aiquest.*` routing without EV3 transport commands |
| `.venv/bin/python -m pytest weisile-link/tests -q` | exits 0 | passed; 105 WeisileLink tests cover existing Scratch Link compatibility, sensor routing, Trainer routes, and the new AI Quest contract path |
| `cd vsle-ev3-extension && npm test` | exits 0 | passed; 29 extension tests cover the complete EV3 block surface plus AI Quest upload/train/status/select/predict/export blocks and synchronous AI Quest reporters |
