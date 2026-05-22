# AI Quest Sample Projects

This document records the first Phase 3 sample-project package for the VSLE
Scratch-EV3 platform. The runnable assets live under
`ai-quest-samples/` and stay fully inside EV3SC.

## What Is Included

Three sample manifests are available:

| Sample | Classroom purpose | Hardware path |
|--------|-------------------|---------------|
| `obstacle-avoidance-collector` | Collect safe and obstacle readings for a classifier | Motor A, ultrasonic S2, touch S4 |
| `line-patrol-color-collector` | Collect line and floor reflected-light readings | Motors A/B, color S1, gyro S3 |
| `touch-stop-safety-collector` | Collect moving and pressed-stop safety readings | Motors A/B, gyro S3, touch S4 |

Each sample has the same validated workflow:

1. `record`: VSLE-EV3 Scratch blocks collect labeled rows locally.
2. `upload`: `uploadToTrainer` sends the buffer to the Trainer subscription path.
3. `train`: WeisileAI Trainer uses decision tree training with a 70% accuracy gate.
4. `export`: `exportDataCSV` and Trainer export produce `vsle_ev3_data.csv`
   and `model_rules.json`.

## How To Use

```bash
cd ai-quest-samples
npm run build
```

The build command writes one Scratch `project.json` per sample into
`ai-quest-samples/dist/`. These project JSON files use the Scratch VM
`project.json` target/block structure and VSLE extension opcodes such as
`vsleev3_startDataCollection`, `vsleev3_uploadToTrainer`, and
`vsleev3_exportDataCSV`.

## Validation

`npm test` verifies:

- all sample manifests follow `record -> upload -> train -> export`;
- every VSLE block opcode exists in the current extension `getInfo()`;
- all labels satisfy the 64-character classroom limit;
- Trainer features are limited to the supported local sensor row fields;
- generated Scratch project JSON includes a connected green-flag stack;
- privacy metadata forbids student identifiers and documents `/api/data/clear`.

## Boundaries

This step creates sample projects and exportable project JSON. It does not train
a model end to end; that is the next Phase 3 step, where the EV3 data to
WeisileAI Trainer training pipeline will be exercised across collection,
training, and model rule export.
