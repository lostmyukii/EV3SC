# ScratchAI Browser Rehearsal Evidence

Date: 2026-05-25

This report covers the ScratchAI unified-stack browser slice of the
Section 13.7 classroom rehearsal gate. It checks the student-facing ScratchAI
editor surface before the longer sensor, AI Quest, and multi-device rehearsal
steps.

## Status

- Status: PASS for the simulated unified-stack browser gate
- Classroom approved: false
- Stale preview avoided: `http://127.0.0.1:8601/`
- Verified browser URL: `http://127.0.0.1:8611/`
- Screenshot: `docs/classroom/evidence/scratchai_unified_stack_ai_helper.png`
- Browser state JSON: `docs/classroom/evidence/scratchai_unified_stack_browser_state.json`
- EV3 blocks screenshot: `docs/classroom/evidence/scratchai_ev3_blocks_loaded_20260526.png`
- EV3 blocks state JSON: `docs/classroom/evidence/scratchai_ev3_blocks_loaded_20260526.json`

## Evidence

| Check | Result | Evidence |
|---|---|---|
| Stale static `8601` preview not used | PASS | Port `8601` was identified as a plain `python -m http.server` static preview compiled without ScratchAI runtime flags, so it was avoided for Section 13.7 evidence. |
| ScratchAI unified stack health | PASS | `scripts/verify_unified_preview.py` passed 7/7 checks against ports `8611`, `8807`, `8810`, `8612`, `8010`, `20211`, and `18766`. |
| AI assistant visible in browser | PASS | Browser DOM inspection found `data-testid="ai-logic-coach-toggle"` and the visible localized control text `AI思考帮手`. |
| ScratchAI runtime flags enabled | PASS | The served `gui.js` contains `SCRATCH_AI_ENABLED=true`, `SCRATCH_AI_PANEL_ENABLED=true`, `SCRATCH_AI_IMAGE_BLOCKS_ENABLED=true`, `ai-logic-coach-toggle`, and `ai-logic-coach-asset-generator`. |
| EV3 tile loads VSLE-EV3 blocks | PASS | Follow-up browser verification on `http://127.0.0.1:8611/` opened the Scratch extension library, clicked `EV3`, confirmed the `EV3` category is visible, and recorded EV3 motor/sensor blocks in the palette. Diagnostics show the extension loaded through a main-thread script tag from `http://127.0.0.1:8000/vsle-ev3-extension/index.js` and did not create `extension-worker.js`. |
| EV3SC-owned runtime | PASS | The stack runs from `/Users/yukii/Desktop/EV3SC/` and does not depend on `/Users/yukii/Desktop/scratch ai/` at runtime. |
| AI asset draft generation | PASS | Follow-up browser verification on `http://127.0.0.1:8631/` found the asset generator, submitted a sprite prompt through middleware, received `provider=template-svg`, `status=completed`, and `result.generated=true`, then showed `Draft generated` in the panel. Screenshot: `docs/classroom/evidence/scratchai_asset_draft_generated_20260525.png`. |

## Verifier Result

```bash
.venv/bin/python scripts/verify_unified_preview.py \
  --editor-port 8611 \
  --middleware-port 8807 \
  --asset-worker-port 8810 \
  --preview-gateway-port 8612 \
  --extension-port 8010 \
  --weisile-link-port 20211 \
  --trainer-port 18766 \
  --timeout-seconds 90
```

Result summary:

```text
passed: 7
failed: 0
scratchai-editor-html: matched Scratch 3.0 GUI; matched SCRATCH_AI_ENABLED=true, SCRATCH_AI_PANEL_ENABLED=true, ai-logic-coach-toggle
```

2026-05-26 EV3 tile follow-up command:

```bash
.venv/bin/python scripts/verify_unified_preview.py \
  --editor-port 8611 \
  --extension-port 8000 \
  --timeout-seconds 10
```

Result summary:

```text
passed: 7
failed: 0
scratchai-editor-html: matched SCRATCH_AI_VSLE_EV3_EXTENSION_URL=http://127.0.0.1:8000/vsle-ev3-extension/index.js
scratchai-editor-html: matched SCRATCH_AI_VSLE_EV3_EXTENSION_URL browser-reachable
```

## Browser Result

The in-app browser was opened to `http://127.0.0.1:8611/`. The Scratch visual
surface remained the standard Scratch GUI, and the ScratchAI assistant appeared
as the right-side localized `AI思考帮手` control.

The asset-draft follow-up opened the rebuilt ScratchAI GUI at
`http://127.0.0.1:8631/`, clicked AI Thinking Helper, submitted a sprite prompt,
and verified the generated draft card. The browser request was accepted by
middleware CORS for the current editor origin and returned a completed local
`template-svg` asset job.

The EV3 tile follow-up rebuilt the local static ScratchAI preview with
`SCRATCH_AI_VSLE_EV3_EXTENSION_URL=http://127.0.0.1:8000/vsle-ev3-extension/index.js`.
Before the fix, browser diagnostics showed the EV3 URL was still routed through
`extension-worker.js` because the configured URL was behind a browser-time
`process` guard. After the fix, diagnostics show a main-thread script load from
the local VSLE-EV3 URL, the extension library closes, and the `EV3` block
category appears with motor and sensor blocks.

## 2026-05-29 Browser Unsandboxed Evidence

- Status: PASS for ScratchAI browser EV3 tile main-thread loading evidence
- Browser URL: `http://127.0.0.1:8642/`
- Evidence JSON: `docs/classroom/evidence/scratchai_browser_unsandboxed_20260529.json`
- Screenshot: `docs/classroom/evidence/scratchai_browser_unsandboxed_20260529.png`
- Result: Chrome CDP opened the EV3SC ScratchAI browser surface, confirmed WebGL and `AI思考帮手`, opened the extension library, clicked the `EV3` tile, and observed the VSLE-EV3 URL inserted as a main-thread `script` resource with no `extension-worker` resource loaded for that URL.
- Note: The served build used the configured deployed VSLE-EV3 URL `http://101.42.92.6:18612/vsle-ev3-extension/index.js`; unit tests in `scratch-vm` continue to cover `Scratch.extensions.unsandboxed === true` for the VSLE-EV3 URL loader path.

## Next Action

Use `docs/classroom/SECTION_13_7_PREVIEW_REHEARSAL.md` and
`docs/classroom/evidence/section13_7_preview_rehearsal_20260525.json` for the
45-minute simulated-preview rehearsal evidence. Physical EV3 classroom approval
remains blocked until real EV3 endpoint and real transport evidence are
attached.
