# ScratchAI EV3 AI Quest API Contract

Date: 2026-05-23

This document records the EV3SC-owned server-side contract used by ScratchAI
EV3 blocks. Scratch blocks call WeisileLink JSON-RPC methods; WeisileLink owns
provider credentials, data normalization, model references, and fallback
prediction.

## Block To Server Contract

| EV3 block opcode | JSON-RPC method | Server behavior |
|---|---|---|
| `uploadAIQuestDataset` | `aiquest.uploadDataset` | Uploads the collected EV3 time-series dataset through the AI Quest provider contract after consent is attached by the block |
| `startAIQuestTraining` | `aiquest.startTraining` | Starts training from the latest uploaded dataset and normalizes provider job/model metadata |
| `refreshAIQuestTrainingStatus` | `aiquest.getTrainingStatus` | Returns the latest normalized job status |
| `getAIQuestUploadStatus` | `aiquest.getUploadStatus` | Returns upload progress/status for the latest or selected dataset |
| `selectAIQuestModel` | `aiquest.selectModel` | Stores a safe model reference for `project`, `classSession`, or `courseTask` scope |
| `updateAIQuestPrediction` | `aiquest.predictCurrent` | Predicts from the latest EV3 sensor frame using `cloud`, `cached`, or `localFallback` mode |
| `exportAIQuestModel` | `aiquest.exportModel` | Exports model rules/report without raw datasets or provider credentials |
| `deleteAIQuestDataset` | `aiquest.deleteDataset` | Deletes provider/local dataset state and records an audit event |
| `deleteAIQuestModel` | `aiquest.deleteModel` | Deletes provider/local model state, cached rules, and active references |
| `getAIQuestAuditLog` | `aiquest.getAuditLog` | Returns teacher-reviewable audit metadata without raw sensor samples |

Reporter and Boolean blocks read the extension's last AI Quest state
synchronously:

- `getAIQuestPrediction`
- `isAIQuestPrediction`
- `getAIQuestModelAccuracy`
- `getAIQuestTrainingStatus`
- `getAIQuestPredictionMode`

## Data Boundary

Allowed upload fields are limited to EV3 classroom sensor data:

- timestamp, label, brick identifier, and scoped project/class/course metadata
- sensor values for color, ultrasonic, gyro, touch, and infrared fields
- motor position, speed, and running state
- battery, EV3 buttons, collecting state, and collection label
- normalized training features derived from those EV3 fields

The contract strips disallowed content before provider upload:

- student real names
- raw Scratch project JSON or `.sb3` data
- costumes, sounds, images, or Scratch assets
- provider keys, tokens, passwords, and local file paths

## Provider Boundary

`AIQuestContractService` calls provider adapters through
`weisile_link.ai_quest_providers`. Empty local development configuration uses
the deterministic `MockAIQuestProvider`; production-style configuration can
select a WeisileAI shell or a mock third-party adapter without exposing cloud
credentials to Scratch.

Supported server-side configuration:

- `AI_QUEST_PROVIDER=weisileai`
- `WEISILE_AIQUEST_ENDPOINT`
- `WEISILE_AIQUEST_TOKEN`
- `AI_QUEST_PROVIDER=mock-third-party`
- `AI_QUEST_THIRD_PARTY_ENDPOINT`
- `AI_QUEST_THIRD_PARTY_TOKEN`
- `AI_QUEST_TIMEOUT_SECONDS`
- `AI_QUEST_MAX_RETRIES`

Provider responses are normalized through the same contract shape:

- dataset: `dataset_id`, `status`, `uploaded_samples`, `audit`
- training: `job_id`, `status`, `model_id`, `metrics.accuracy`
- prediction: `label`, `confidence`, `mode`, `model_id`

Credentials remain server-side. Browser/Scratch blocks never receive provider
tokens and only store safe dataset/model references.

The WeisileAI shell uses dependency-free server-side HTTPS JSON calls and
retries retryable provider failures such as HTTP 429 and 5xx responses.
Retry exhaustion is mapped to `AIQUEST_PROVIDER_UNAVAILABLE` with
`retryable: true`. Invalid provider responses map to
`AIQUEST_PROVIDER_INVALID_RESPONSE` with `retryable: false`.

Training providers may return only a safe cloud `model_id` without local model
rules. That cloud-only model reference can still be selected for cloud
prediction. Cached prediction is used only when local model rules are present.

## Governance Routes And States

AI Quest governance is available through JSON-RPC and internal REST routes:

- `GET /api/aiquest/upload-status`
- `GET /api/aiquest/audit`
- `POST /api/aiquest/delete-dataset`
- `POST /api/aiquest/delete-model`

Upload status is intentionally small and student-visible:

- `notStarted`
- `complete`
- `failed`
- `deleted`

Every upload failure includes `retryable`, `error.code`, and `error.message`.
Provider outages that can be retried are returned from REST as HTTP 503 and
from JSON-RPC with `data.retryable: true`.

Audit records include only minimized metadata:

- event name
- timestamp
- provider name
- safe dataset/model identifier
- safe project/class/course scope
- status, retryability, provider audit ID, and short message

Audit records never include raw EV3 samples, Scratch project JSON, student
names, provider credentials, or local file paths.

## Prediction Modes

`aiquest.predictCurrent` chooses modes in this order:

1. `cloud`: active provider model is available.
2. `cached`: the active model is cached locally and cloud prediction is
   unavailable.
3. `localFallback`: no usable model is available; a deterministic local
   distance/touch rule keeps Scratch scripts running.

EV3 motor and sensor control remains independent of AI Quest availability.
