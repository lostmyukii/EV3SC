# VSLE AI Quest Samples

This package contains source-backed AI Quest sample projects for the EV3 data
collection workflow defined in `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`.

## Samples

| ID | Focus | Labels | Trainer features |
|----|-------|--------|------------------|
| `obstacle-avoidance-collector` | Distance and touch obstacle detection | `safe-zone`, `obstacle-zone` | `ultrasonic_cm`, `touch_pressed`, `gyro_angle`, `motor_a_pos` |
| `line-patrol-color-collector` | Reflected-light line patrol | `line`, `floor` | `color_reflected`, `gyro_angle`, `motor_a_pos` |
| `touch-stop-safety-collector` | Touch-triggered safety stop | `moving`, `pressed-stop` | `touch_pressed`, `gyro_angle`, `motor_a_pos` |

Each sample follows the required classroom workflow:

1. Record labeled EV3 sensor data from Scratch blocks.
2. Upload the local buffer to WeisileAI Trainer.
3. Train a decision tree with the 70% accuracy gate.
4. Export `vsle_ev3_data.csv` and `model_rules.json`.

## Commands

```bash
cd ai-quest-samples
npm run check
npm test
npm run build
```

`npm run build` writes generated Scratch `project.json` files into
`ai-quest-samples/dist/`. The generated JSON uses `vsleev3_*` opcodes so it
matches the unsandboxed VSLE-EV3 extension metadata.

## Privacy

The samples use educational labels only. They do not store names, accounts,
photos, voice, or device position. Teacher cleanup uses the local
`/api/data/clear` route after export or at the end of class.

## Sources

- `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` Section 8.2 AI Quest workflow.
- `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` Sections 10 and 15 for Trainer REST
  routes and privacy rules.
- Scratch VM `serialization/sb3.js` for `project.json` target/block structure.
- VSLE-EV3 extension `getInfo()` for the supported `vsleev3_*` opcodes.
