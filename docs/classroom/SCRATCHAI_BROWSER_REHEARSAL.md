# ScratchAI Browser Rehearsal Evidence

Date: 2026-05-25

This report covers the ScratchAI unified-stack browser slice of the
Section 13.7 classroom rehearsal gate. It checks the student-facing ScratchAI
editor surface before the longer sensor, AI Quest, and multi-device rehearsal
steps.

## Status

- Status: BLOCKED
- Classroom approved: false
- Browser URL checked: `http://127.0.0.1:8601/`
- Process observed on port 8601: `python -m http.server 8601 --bind 127.0.0.1`
- Screenshot: `docs/classroom/evidence/scratchai_preview_missing_assistant.png`

## Evidence

| Check | Result | Evidence |
|---|---|---|
| Scratch GUI loads | PASS | `scripts/verify_scratchai_preview.py` fetched `index.html` and `gui.js` from `http://127.0.0.1:8601/`. |
| AI assistant visible in browser | FAIL | Browser DOM inspection found no `data-testid="ai-logic-coach-toggle"` and no `Thinking Helper` text in the page body. |
| ScratchAI runtime flags enabled | FAIL | The served `gui.js` compiles `scratchAIEnabled` and `scratchAIPanelEnabled` from empty strings, so the AI assistant is not mounted. |
| EV3SC ScratchAI source present | PASS | The EV3SC-owned source tree contains `components/ai-logic-coach`, `lib/ai`, ScratchAI feature flags, and middleware routes under `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/`. |

## Verifier Result

The improved verifier now blocks this exact false-positive case:

```bash
.venv/bin/python scripts/verify_scratchai_preview.py \
  --url http://127.0.0.1:8601/ \
  --timeout-seconds 10
```

Current result:

```text
ScratchAI GUI bundle is missing enabled assistant markers:
SCRATCH_AI_ENABLED=true, SCRATCH_AI_PANEL_ENABLED=true
```

## Root Cause

The ScratchAI assistant was ported into EV3SC source, but the currently visible
preview is being served from an already-built static bundle that was compiled
without ScratchAI runtime flags. That static preview can contain the assistant
source text in `gui.js` while still rendering no assistant in the browser.

Use `scripts/start_scratchai_preview.py` or the full
`scripts/start_unified_preview.py` stack so webpack compiles the ScratchAI
feature flags for the preview session. Do not use a plain static
`python -m http.server` preview as Section 13.7 ScratchAI browser evidence.

## Next Action

Stop or move the static 8601 server, start the EV3SC-owned unified preview stack,
rerun `scripts/verify_unified_preview.py`, and confirm in the browser that
`data-testid="ai-logic-coach-toggle"` is present before starting the 45-minute
sensor freshness run.
