# VSLE Scratch-EV3 Teacher Guide

This guide supports one 45-minute classroom flow for the VSLE Scratch-EV3
platform. It is grounded in the current EV3SC implementation: the Unsandboxed
VSLE-EV3 extension, WeisileLink, the EV3 firmware server, the AI Quest sample
manifests, and the local WeisileAI Trainer pipeline.

## Lesson Goal

Students program a LEGO EV3 robot in Scratch, collect labeled sensor data, train
a local decision tree, and export two artifacts:

- `vsle_ev3_data.csv`
- `model_rules.json`

The required workflow is:

```text
record -> upload -> train -> export
```

The model must pass the 70% accuracy gate before students treat predictions as
usable. All model training happens on the teacher computer through WeisileLink
and WeisileAI Trainer, not on the EV3 brick.

## Teacher preflight checklist

Run this before students enter the room.

- Confirm EV3 bricks are charged and have the expected sensors attached.
- Start WeisileLink with localhost-only defaults from `deploy/README.md`.
- Confirm `WEISILE_PAIRING_TOKEN` is configured privately when pairing is used.
- Open the Scratch/TurboWarp environment and load the Unsandboxed VSLE-EV3 extension.
- Confirm the Scratch visual identity is unchanged except the allowed EV3
  extension entry, connection modal, and collapsible sensor panel.
- Connect one EV3 and verify `/api/status` reports Scratch and Trainer clients.
- Check live sensor values in the panel. Reporter blocks must read from
  `SensorCache`, not from network requests.
- Export and clear one short practice dataset with `/api/data/clear`.
- Keep a printed or projected Emergency stop plan visible.

Never modify Scratch visual design during class. Student trust comes partly from
the interface behaving like standard Scratch.

## 45-Minute Classroom Flow

| Time | Teacher action | Student action | Evidence |
|------|----------------|----------------|----------|
| 0-5 min | Introduce labels, sensors, and safety roles. | Choose driver, builder, and recorder roles. | Team roles assigned. |
| 5-10 min | Demonstrate connect, live sensors, and Emergency stop. | Confirm their sensor panel values change. | SensorCache-backed values update. |
| 10-25 min | Guide the workbook record stage. | Collect both labels with the EV3. | Local buffer count increases. |
| 25-30 min | Demonstrate upload to Trainer. | Upload their rows. | Trainer receives the buffer. |
| 30-37 min | Guide train and feature selection. | Train a decision tree. | Accuracy meets the 70% accuracy gate. |
| 37-42 min | Guide export. | Export `vsle_ev3_data.csv` and `model_rules.json`. | Files are saved locally. |
| 42-45 min | Lead cleanup and reflection. | Clear data with `/api/data/clear`. | Buffer count returns to zero. |

## Which Workbook To Use

| Workbook | Best first use | Hardware |
|----------|----------------|----------|
| `WORKBOOK_OBSTACLE_AVOIDANCE.md` | First AI Quest or distance-sensor lesson | Motor A, ultrasonic S2, touch S4 |
| `WORKBOOK_LINE_PATROL.md` | Color/reflected-light lesson | Motors A/B, color S1, gyro S3 |
| `WORKBOOK_TOUCH_STOP_SAFETY.md` | Safety and event-trigger lesson | Motors A/B, gyro S3, touch S4 |

## Safety Rules

- Keep robots on the floor or a low test mat.
- Use modest motor speeds from the sample scripts.
- Keep hands clear of moving wheels until motors stop.
- Use the red Scratch stop button first.
- If motion continues, use Emergency stop: stop the bridge, then power down the
  EV3 from its menu.
- Do not run a pilot lesson until Section 13.6 Critical Remediation Gates are
  complete.
- A 30-device rehearsal is required before classroom deployment.

## Privacy Rules

Use classroom labels only. Do not collect student names, photos, voice, account
IDs, classroom seating, or free-form personal descriptions.

Approved labels are short task labels such as:

- `safe-zone`
- `obstacle-zone`
- `line`
- `floor`
- `moving`
- `pressed-stop`

After export, clear the local buffer with `/api/data/clear`. The exported model
rules must not include raw student data rows.

## Troubleshooting

| Symptom | Likely cause | Recovery |
|---------|--------------|----------|
| Scratch cannot connect | WeisileLink is not running or wrong host. | Start WeisileLink and confirm localhost port `20111`. |
| Trainer chart is empty | Trainer WebSocket is not connected. | Confirm port `8766` and reconnect the Trainer panel. |
| Sensor panel is stale | EV3 sensor stream stopped. | Reconnect EV3, check WiFi, then verify `/api/status`. |
| Upload reports unavailable | No Trainer subscriber is connected. | Open the Trainer view and retry upload. |
| Accuracy is below 70% | Labels overlap or data is too noisy. | Collect more balanced rows and clean obvious outliers. |
| Export is blocked | No trained model exists. | Train again, then export `model_rules.json`. |
| Robot does not stop | Command path is interrupted. | Use Emergency stop and power down the EV3. |

## Assessment rubric

| Level | Evidence |
|-------|----------|
| 4 | Team explains why a chosen feature predicts the label, exports both files, clears data, and tests prediction on a new physical case. |
| 3 | Team completes record, upload, train, and export with accuracy at or above the 70% accuracy gate. |
| 2 | Team records and uploads data but needs support to balance labels or interpret model rules. |
| 1 | Team can connect and read sensors but does not complete the training workflow. |

## Teacher Verification Notes

Before calling a class run successful, record:

- number of EV3 bricks connected;
- number of teams that exported `vsle_ev3_data.csv`;
- number of teams that exported `model_rules.json`;
- lowest model accuracy accepted;
- any disconnects, reconnect time, or dropped sensor streams;
- whether `/api/data/clear` was used at cleanup.

Keep this record with the deployment checklist in `deploy/README.md`.
