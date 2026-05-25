# ScratchAI Port Parity Audit

Date: 2026-05-25

This audit checks the EV3SC-owned ScratchAI port against the read-only
reference at `/Users/yukii/Desktop/scratch ai/`. It was run after the browser
reported that the AI assistant did not generate a sprite draft.

## Scope

- Keep all runtime ownership inside `/Users/yukii/Desktop/EV3SC/`.
- Do not modify the read-only ScratchAI reference tree.
- Preserve the intentional VSLE-EV3 integration differences required by the
  ScratchAI VSLE-EV3 design.
- Verify that the AI Thinking Helper and asset draft generator are present and
  functional in the served browser bundle.

## Source Parity Checks

These checks returned no differences:

```bash
diff -qr \
  '/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/components/ai-logic-coach' \
  scratch-ai-platform/scratch-editor/packages/scratch-gui/src/components/ai-logic-coach

diff -qr \
  '/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/lib/ai' \
  scratch-ai-platform/scratch-editor/packages/scratch-gui/src/lib/ai

diff -qr -x artifacts \
  '/Users/yukii/Desktop/scratch ai/scratch-ai-platform/asset-worker' \
  scratch-ai-platform/asset-worker

diff -qr -x artifacts \
  '/Users/yukii/Desktop/scratch ai/scratch-ai-platform/preview-server' \
  scratch-ai-platform/preview-server
```

The standalone ownership checker also passed:

```bash
.venv/bin/python scripts/check_scratchai_standalone.py
```

Result summary:

```json
{
  "forbidden_source": "/Users/yukii/Desktop/scratch ai",
  "package_jsons_checked": 4,
  "required_paths_checked": 10,
  "root": "/Users/yukii/Desktop/EV3SC",
  "symlinks_checked": 231
}
```

## Expected Differences

These differences are intentional and required for the EV3SC integration:

- `scratch-gui/src/lib/libraries/extensions/index.jsx` keeps the normal
  Scratch extension library surface but routes the `EV3` tile to the complete
  VSLE-EV3 extension.
- `scratch-vm/src/extension-support/extension-manager.js` allows the
  project-owned VSLE-EV3 unsandboxed URL and maps legacy built-in `ev3`
  projects to the compatibility runtime.
- `scratch-vm/src/extensions/scratch3_vsle_ev3_compat/index.js` is EV3SC-only
  compatibility code for official Scratch EV3 `.sb3` projects.
- `scratch-ai-platform/ai-middleware/src/config.js`,
  `scratch-ai-platform/ai-middleware/src/server.js`, and
  `scratch-ai-platform/ai-middleware/test/server.test.js` now add dynamic local
  CORS origins so the unified preview can use non-stale editor ports.
- `scripts/start_scratchai_preview.py`,
  `scripts/start_unified_preview.py`,
  `scripts/verify_scratchai_preview.py`, and
  `scripts/verify_unified_preview.py` are EV3SC preview controls and now guard
  the full AI assistant and asset-draft path.

## Functional Gap Found

The AI assistant source was ported, but the served preview was not equivalent
to the ScratchAI runtime:

- `SCRATCH_AI_IMAGE_BLOCKS_ENABLED` was not set by the ScratchAI preview
  launcher, so the browser bundle could include assistant source while the
  asset generator stayed disabled.
- The unified preview stack defaulted the asset worker to `mock`, which
  intentionally reports that no image was generated.
- The middleware CORS allow-list was fixed to old local ports. When the editor
  moved to another preview port, the browser preflight was rejected before the
  generated sprite draft could reach the UI.

## Fix Verified

The preview and unified stack now enable the full assistant feature set,
default local asset drafts to `template-svg`, and pass the current editor,
gateway, and extension origins into middleware CORS.

Verification commands:

```bash
.venv/bin/python -m pytest \
  tests/test_scratchai_preview_startup.py \
  tests/test_unified_preview_stack.py \
  tests/test_scratchai_preview_verifier.py -q

npm test -- --test-name-pattern="configured ScratchAI preview origins|allows Scratch GUI local dev origins|routes asset image jobs through middleware proxy"

.venv/bin/python scripts/verify_scratchai_preview.py \
  --url http://127.0.0.1:8631/ \
  --timeout-seconds 20
```

Browser evidence:

- AI helper visible:
  `docs/classroom/evidence/scratchai_asset_generator_visible_20260525.png`
- Asset generator controls visible:
  `docs/classroom/evidence/scratchai_asset_generator_section_20260525.png`
- Sprite draft generated:
  `docs/classroom/evidence/scratchai_asset_draft_generated_20260525.png`

The browser request to `POST /api/v1/assets/image-jobs` returned HTTP 200 with
`access-control-allow-origin: http://127.0.0.1:8631`,
`provider: template-svg`, `status: completed`, and `result.generated: true`.

## Conclusion

No missing AI Thinking Helper or asset-generator source was found in the
ScratchAI port. The corrected gaps were runtime preview configuration issues:
feature flags, provider mode, and middleware CORS. The remaining ScratchAI
differences are deliberate EV3SC integration changes, not missing ported
ScratchAI functionality.
