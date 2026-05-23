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
| `selectAIQuestModel` | `aiquest.selectModel` | Stores a safe model reference for `project`, `classSession`, or `courseTask` scope |
| `updateAIQuestPrediction` | `aiquest.predictCurrent` | Predicts from the latest EV3 sensor frame using `cloud`, `cached`, or `localFallback` mode |
| `exportAIQuestModel` | `aiquest.exportModel` | Exports model rules/report without raw datasets or provider credentials |

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

The current implementation uses `AIQuestContractService` with a deterministic
`MockAIQuestProvider` for local development and classroom preview. Provider
responses are normalized through the same contract shape used by future
WeisileAI or third-party providers:

- dataset: `dataset_id`, `status`, `uploaded_samples`, `audit`
- training: `job_id`, `status`, `model_id`, `metrics.accuracy`
- prediction: `label`, `confidence`, `mode`, `model_id`

Credentials remain server-side. Browser/Scratch blocks never receive provider
tokens and only store safe dataset/model references.

## Prediction Modes

`aiquest.predictCurrent` chooses modes in this order:

1. `cloud`: active provider model is available.
2. `cached`: the active model is cached locally and cloud prediction is
   unavailable.
3. `localFallback`: no usable model is available; a deterministic local
   distance/touch rule keeps Scratch scripts running.

EV3 motor and sensor control remains independent of AI Quest availability.
