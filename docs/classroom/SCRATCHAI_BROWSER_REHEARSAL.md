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

## Evidence

| Check | Result | Evidence |
|---|---|---|
| Stale static `8601` preview not used | PASS | Port `8601` was identified as a plain `python -m http.server` static preview compiled without ScratchAI runtime flags, so it was avoided for Section 13.7 evidence. |
| ScratchAI unified stack health | PASS | `scripts/verify_unified_preview.py` passed 7/7 checks against ports `8611`, `8807`, `8810`, `8612`, `8010`, `20211`, and `18766`. |
| AI assistant visible in browser | PASS | Browser DOM inspection found `data-testid="ai-logic-coach-toggle"` and the visible localized control text `AI思考帮手`. |
| ScratchAI runtime flags enabled | PASS | The served `gui.js` contains `SCRATCH_AI_ENABLED=true`, `SCRATCH_AI_PANEL_ENABLED=true`, and `ai-logic-coach-toggle`. |
| EV3SC-owned runtime | PASS | The stack runs from `/Users/yukii/Desktop/EV3SC/` and does not depend on `/Users/yukii/Desktop/scratch ai/` at runtime. |

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

## Browser Result

The in-app browser was opened to `http://127.0.0.1:8611/`. The Scratch visual
surface remained the standard Scratch GUI, and the ScratchAI assistant appeared
as the right-side localized `AI思考帮手` control.

## Next Action

Use `docs/classroom/SECTION_13_7_PREVIEW_REHEARSAL.md` and
`docs/classroom/evidence/section13_7_preview_rehearsal_20260525.json` for the
45-minute simulated-preview rehearsal evidence. Physical EV3 classroom approval
remains blocked until real EV3 endpoint and real transport evidence are
attached.
