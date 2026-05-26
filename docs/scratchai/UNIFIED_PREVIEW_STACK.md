# ScratchAI VSLE-EV3 Unified Preview Stack

Date: 2026-05-23

This is the EV3SC-owned local preview stack for the integrated ScratchAI +
VSLE-EV3 product surface. It starts the normal ScratchAI editor together with
the ScratchAI services, VSLE-EV3 extension hosting, WeisileLink, EV3 simulation,
and the AI Quest mock provider.

All commands run from `/Users/yukii/Desktop/EV3SC/` and use only files under
that project root.

## Services

`scripts/start_unified_preview.py` starts these services:

| Service | URL | Purpose |
|---|---|---|
| ScratchAI editor | `http://127.0.0.1:8601/` | Student-facing Scratch editor surface |
| VSLE-EV3 extension static server | `http://127.0.0.1:8000/vsle-ev3-extension/index.js` | Unsandboxed extension bundle loaded by the ScratchAI `EV3` tile |
| ScratchAI middleware | `http://127.0.0.1:8787` | ScratchAI server-side middleware with local model access disabled by default and local preview CORS origins supplied by the stack launcher |
| ScratchAI asset worker | `http://127.0.0.1:8790` | Local asset worker using `template-svg` by default so sprite/backdrop draft generation is exercised without downloading model weights |
| ScratchAI preview gateway | `http://127.0.0.1:8602` | Local preview gateway and Scratch asset/project proxy |
| WeisileLink EV3 simulation | `ws://127.0.0.1:20111/scratch/bt` | Scratch Link compatible JSON-RPC endpoint with simulated EV3 sensor stream |
| Trainer subscription | `ws://127.0.0.1:8766` | Trainer WebSocket endpoint reused by preview clients |

The WeisileLink preview backend sets `AI_QUEST_PROVIDER=mock`, so AI Quest
upload, training, prediction, shared model, and cached model flows stay local.
Provider credentials are not needed and are not exposed to browser code.

The asset worker defaults to `SCRATCH_AI_IMAGE_PROVIDER=template-svg`. This
keeps classroom preview generation local while still returning a completed
asset draft. To test a real configured image provider, pass
`--asset-image-provider openai`, `gemini-image`, or another supported provider
and keep credentials server-side.

## Prerequisites

The same ScratchAI editor prerequisites from `PREVIEW_STARTUP.md` must exist:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor
npm ci
npm --workspace @scratch/scratch-svg-renderer run build
npm --workspace @scratch/scratch-render run build
npm --workspace @scratch/scratch-vm run build
```

The script checks those artifacts before starting the unified stack.

## Inspect The Plan

```bash
cd /Users/yukii/Desktop/EV3SC
.venv/bin/python scripts/start_unified_preview.py --print-plan
```

This prints the exact commands, working directories, environment overrides, URLs,
and health checks. It is safe to run without opening ports.

## Start The Stack

```bash
cd /Users/yukii/Desktop/EV3SC
.venv/bin/python scripts/start_unified_preview.py
```

If another WeisileLink preview is already running, choose unused preview ports:

```bash
.venv/bin/python scripts/start_unified_preview.py \
  --weisile-link-port 20211 \
  --trainer-port 18766
```

The launcher passes the selected editor, extension, and preview-gateway origins
to the middleware through `SCRATCH_AI_ALLOWED_ORIGINS`. This prevents browser
preflight failures when avoiding a stale static preview on an old port.
It also passes the selected local extension URL to the editor through
`SCRATCH_AI_VSLE_EV3_EXTENSION_URL`, so the ScratchAI `EV3` tile loads the
VSLE-EV3 bundle as an Unsandboxed Extension from the same local host family as
the editor.

Open:

```text
http://127.0.0.1:8601/
```

Then use the ScratchAI extension library and click `EV3`. The tile loads the
EV3SC-owned VSLE-EV3 extension from the local static server and connects through
the simulated WeisileLink endpoint.

## Verify The Running Stack

In another terminal:

```bash
cd /Users/yukii/Desktop/EV3SC
.venv/bin/python scripts/verify_unified_preview.py
```

Pass the same custom ports to the verifier when the stack was started with
non-default ports:

```bash
.venv/bin/python scripts/verify_unified_preview.py \
  --weisile-link-port 20211 \
  --trainer-port 18766
```

The verifier checks:

- ScratchAI editor HTML.
- ScratchAI runtime flags for the AI Thinking Helper and asset generator.
- Browser-reachable `SCRATCH_AI_VSLE_EV3_EXTENSION_URL` in the served
  `gui.js`, so the EV3 tile cannot silently fall back to the sandbox worker.
- ScratchAI middleware health and runtime status.
- ScratchAI asset worker health.
- ScratchAI preview gateway status.
- WeisileLink JSON-RPC `getVersion`.
- Trainer WebSocket connectivity.

The output is JSON and exits non-zero if any service is unavailable.
