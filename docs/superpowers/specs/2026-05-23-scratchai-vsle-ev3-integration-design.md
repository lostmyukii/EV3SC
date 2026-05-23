# ScratchAI VSLE-EV3 Integration Design

Date: 2026-05-23
Status: Draft for user review
Scope: Requirements and integration design only. No implementation is included in this step.

## 1. Confirmed Product Intent

The final product is ScratchAI with a complete EV3 capability embedded inside the normal Scratch editor. The standalone EV3SC preview page is only a development aid and is not the target student experience.

Students must open the ScratchAI editor, use the Scratch extension library, click `EV3`, and receive the complete VSLE-EV3 module. The interface remains the Scratch interface. EV3 blocks are regular Scratch blocks that can be dragged into the scripting workspace and combined with native Scratch blocks such as events, control, variables, operators, looks, and sound.

The Scratch built-in EV3 extension is not the target implementation. Its official source may be used as an open-source compatibility reference, but the `EV3` extension entry in ScratchAI must load the complete VSLE-EV3 implementation developed in this project.

## 2. Non-Negotiable Requirements

- Development and authoritative source live under `/Users/yukii/Desktop/EV3SC/`.
- `/Users/yukii/Desktop/scratch ai/` is read-only reference material. It may be copied or ported into EV3SC, but it must not be modified.
- ScratchAI remains the main product surface.
- The Scratch visual design must stay unchanged except for additive Scratch-style extension behavior already allowed by `AGENTS.md`.
- The ScratchAI extension library entry is named `EV3`.
- The loaded block category is named `EV3`.
- EV3 block color is LEGO red `#E6001F`.
- Clicking `EV3` loads complete VSLE-EV3, not Scratch's official 11-block EV3 extension.
- EV3 blocks must be serializable in `.sb3` projects and recognizable after reopening.
- Older `.sb3` projects using official Scratch EV3 blocks must automatically map to the complete VSLE-EV3 runtime.
- AI Quest data collection, upload, training, export, and prediction are EV3 category blocks.
- EV3 raw sensor time series may be uploaded to a cloud model service through a governed AI Quest API.
- Cloud providers are accessed through a server-side provider abstraction; browser code never receives provider credentials.
- Offline or cloud-unavailable operation must support cached models and local fallback prediction.

## 3. Target Architecture

The target architecture is a single ScratchAI-centered platform:

```text
ScratchAI editor
  -> extension library entry: EV3
  -> complete VSLE-EV3 Scratch blocks
  -> WeisileLink local bridge
  -> EV3 firmware on ev3dev
  -> EV3 hardware

ScratchAI editor
  -> EV3 AI Quest blocks
  -> ScratchAI / EV3SC service middleware
  -> AI Quest API contract
  -> WeisileAI cloud or pluggable third-party provider
  -> cached model and local fallback runtime
```

The EV3SC code already contains VSLE-EV3 extension code, WeisileLink, EV3 firmware, sample AI Quest flows, local trainer behavior, deployment assets, and classroom docs. The missing product step is to make those capabilities live inside the ScratchAI editor rather than beside it.

## 4. ScratchAI Ownership Model

To satisfy the EV3SC boundary rule, the complete ScratchAI implementation must be ported into EV3SC before integration work modifies it.

Expected in-repo target:

```text
/Users/yukii/Desktop/EV3SC/
  scratch-ai-platform/
    scratch-editor/
    ai-middleware/
    asset-worker/
    preview-server/
    scripts/
  vsle-ev3-extension/
  weisile-link/
  ev3-firmware/
  ai-quest-samples/
```

After porting, EV3SC is the standalone project root. Builds, tests, previews, and deployment must not depend on `/Users/yukii/Desktop/scratch ai/`.

## 5. Extension Library Behavior

The ScratchAI extension library keeps an `EV3` tile. That tile keeps the normal Scratch extension library visual pattern and hardware connection expectations, but internally it loads the VSLE-EV3 extension.

Required behavior:

- Default ScratchAI editor startup does not automatically show the EV3 category.
- Clicking `EV3` in the extension library loads complete VSLE-EV3.
- The category displayed in the block palette is `EV3`.
- Official Scratch EV3 cannot remain as the active implementation behind the `EV3` tile.
- If the connection modal appears, it must follow Scratch's existing hardware modal style.
- The extension can add a collapsible sensor panel beside the stage when EV3 is active, as permitted by `AGENTS.md`.

## 6. Block Surface

The EV3 category must include the complete self-developed EV3 surface, including:

- Motor commands and reporters.
- Color, ultrasonic, gyro, touch, infrared, motor, battery, button, and system reporters.
- Sound blocks.
- Display and drawing blocks.
- Status light and emergency stop blocks.
- Connection and transport state blocks.
- AI Quest data collection blocks.
- AI Quest upload, training, export, and prediction blocks.
- Model cache and offline fallback blocks.

AI Quest blocks live in the `EV3` category because the learning flow is sensor-driven and must be programmable inside Scratch scripts.

Required AI Quest block capabilities:

- Start data collection with a label.
- Stop data collection.
- Record one labeled data point.
- Return collected row count.
- Clear local collected data.
- Upload a full raw time-series dataset.
- Start cloud training.
- Query training status.
- Select or publish a model.
- Predict current sensor state with the current model.
- Report whether prediction equals a selected label.
- Report model accuracy, model status, and prediction mode.
- Export model rules or a model report.
- Cache the current model locally.
- Use cached model.
- Clear local model cache.

## 7. Official EV3 Compatibility

Scratch official EV3 projects must continue to open and run. Existing official EV3 opcodes should map to the VSLE-EV3 implementation.

Compatibility design:

- Keep recognition for official `ev3` extension IDs and opcodes when loading `.sb3`.
- Map official EV3 motor commands to VSLE motor command methods.
- Map official distance, brightness, button, and motor position reporters to cache-backed VSLE reporters.
- Preserve official EV3 block serialization enough that old projects do not lose scripts.
- New projects should use the complete VSLE-EV3 block set behind the `EV3` entry.
- Compatibility logic must be covered by fixtures with old official EV3 `.sb3` project JSON.

This compatibility layer is a bridge for old projects, not a reason to keep the official EV3 extension as the active user-facing implementation.

## 8. AI Quest Cloud API Contract

ScratchAI and EV3 blocks must call a project-defined AI Quest API contract, not provider-specific APIs directly.

The contract must support:

- Create dataset.
- Append or upload labeled samples.
- Upload complete EV3 time-series data.
- Finalize dataset.
- Start training job.
- Query training job status.
- Get metrics and accuracy.
- Publish model.
- List available project, class, or course-task models.
- Select active model.
- Predict from current EV3 sensor frame or short window.
- Export model rules or report.
- Delete dataset.
- Delete model.
- Return audit metadata for teacher review.

Provider model:

- Default provider target is WeisileAI / AI Quest cloud.
- Third-party general model services may be added behind the provider abstraction.
- All provider credentials stay server-side.
- Browser requests go through ScratchAI / EV3SC middleware.
- Provider-specific payloads and responses are normalized to the AI Quest contract.

## 9. Uploaded Data Boundary

Uploading full EV3 raw sensor time series is allowed.

Allowed dataset contents:

- Session and project scoped identifiers.
- EV3 brick identifier or pseudonymous device identifier.
- Sampling timestamps.
- Sensor port and sensor type.
- Color, reflected light, ambient light, RGB.
- Ultrasonic distance.
- Gyro angle and rate.
- Touch pressed state.
- Infrared proximity, beacon, and remote values.
- Motor position, speed, and running state.
- Battery, button, and runtime status.
- Collection label.
- Sampling frequency and collection window metadata.
- Class session, course task, and project scope metadata.

Disallowed dataset contents:

- Student real names.
- Raw `.sb3` files or complete project JSON.
- Costumes, sounds, images, or other Scratch assets.
- AI chat logs.
- Teacher private policy text beyond minimized scope IDs.
- Provider keys, tokens, passwords, or local file paths.

The upload path must include consent, progress status, retry/error reporting, dataset deletion, model deletion, and audit logs.

## 10. Model Scope and Sharing

Models support multiple scopes:

- `project`: owned by one Scratch project or student work.
- `classSession`: shared by a class session.
- `courseTask`: shared by a course task or curriculum activity.

Students can use project-level models in their own project. Teachers can publish, withdraw, or select class/course shared models. Scratch projects must store safe model references and metadata only. Pure Scratch export must be able to remove AI Quest model references.

## 11. Online, Cached, and Local Fallback Prediction

Prediction must support three runtime modes:

- `cloud`: prediction uses the active cloud model.
- `cached`: prediction uses the latest locally cached model from cloud training or publishing.
- `localFallback`: prediction uses local exported rules or a simple local model when cloud service is unavailable.

The EV3 category must include reporter/Boolean blocks so Scratch scripts can react to the current mode and model availability.

Cloud outages must not break normal EV3 hardware control. If cloud prediction is unavailable, motor control and local sensor cache continue operating.

## 12. Save, Load, and Export

Required save/load behavior:

- Scratch projects can save scripts containing EV3 blocks.
- Reopening a project restores EV3 block recognition.
- Official EV3 projects are mapped to the complete VSLE-EV3 runtime.
- AI Quest cloud model references are stored only as safe metadata.
- Raw uploaded datasets and provider responses are not written into `.sb3`.
- Pure `.sb3` export can strip AI Quest metadata while preserving regular Scratch project compatibility where possible.

## 13. Error Handling

Required student-visible states:

- EV3 bridge unavailable.
- EV3 brick disconnected.
- Sensor stream stale.
- Dataset upload pending, complete, failed, or retrying.
- Cloud provider unavailable.
- Training pending, complete, failed, or accuracy below threshold.
- Active model unavailable.
- Prediction mode changed from cloud to cached or local fallback.
- Old official EV3 block mapped successfully or requiring manual review.

Errors must not freeze Scratch scripts or the Scratch UI. Sensor reporter blocks continue to read from cache synchronously.

## 14. Testing Strategy

Required tests before implementation is considered complete:

- ScratchAI no-EV3 baseline loads and preserves standard Scratch behavior.
- Extension library `EV3` tile loads VSLE-EV3, not official EV3.
- EV3 category name and color are correct.
- EV3 blocks can be dragged into workspace in the ScratchAI GUI.
- EV3 blocks serialize and reload in project JSON.
- Official EV3 project fixture maps to VSLE-EV3 behavior.
- Sensor reporter and Boolean blocks are synchronous cache reads.
- Motor commands do not block Scratch UI.
- AI Quest upload sends allowed raw EV3 time series and excludes disallowed Scratch/student/private data.
- Cloud API provider adapter normalizes WeisileAI and mock third-party responses.
- Prediction supports cloud, cached, and local fallback modes.
- Pure `.sb3` export does not include raw AI Quest datasets or cloud credentials.
- Scratch visual regression checks show no unintended UI changes.

## 15. Development Sequence Recommendation

The next implementation planning step should decompose work into these phases:

1. Port ScratchAI into EV3SC as a standalone owned source tree.
2. Run ScratchAI baseline build, preview, and regression checks inside EV3SC.
3. Replace ScratchAI `EV3` extension library target with VSLE-EV3.
4. Integrate VSLE-EV3 with Scratch VM block registration, serialization, and reload.
5. Add official EV3 opcode compatibility mapping.
6. Connect EV3 category AI Quest blocks to a server-side AI Quest API contract.
7. Add cloud provider abstraction, mock provider tests, and WeisileAI provider shell.
8. Add full raw time-series upload, consent, audit, deletion, and error handling.
9. Add model scopes, shared models, prediction, cached model, and local fallback.
10. Build unified local preview stack for ScratchAI editor, middleware, asset worker, WeisileLink, EV3 simulation, and AI Quest cloud mock.

## 16. Open Decision Log

All major product decisions needed for the next planning step are resolved:

- Main product surface: ScratchAI editor.
- EV3 entry name: `EV3`.
- EV3 category name: `EV3`.
- EV3 category color: `#E6001F`.
- Extension loading: via extension library click, not loaded by default.
- Official EV3 extension: replaced as user-facing implementation.
- Official EV3 `.sb3` compatibility: required.
- AI Quest blocks: inside EV3 category.
- Cloud upload: full raw EV3 time series allowed.
- Cloud service: unified AI Quest API, default WeisileAI / AI Quest provider, future third-party provider support.
- Model scope: project and class/course sharing required.
- Offline support: cached model and local fallback prediction required.

## 17. User Review Gate

This design must be reviewed by the user before implementation planning begins. After approval, the next step is to write a detailed implementation plan for the first phase: porting ScratchAI into EV3SC as a standalone source tree and running baseline ScratchAI regression checks.
