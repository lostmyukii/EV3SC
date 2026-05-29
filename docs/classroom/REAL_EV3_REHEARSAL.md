# Real EV3 Classroom Rehearsal

Date: 2026-05-25

This report covers the Section 13.7 manual classroom acceptance gate.
Automated localhost testing does not replace the real EV3 classroom rehearsal.

## Summary

- Status: BLOCKED
- Classroom approved: false
- Gates passed: 3
- Gates failed: 4
- Expected real EV3 bricks: 1
- Expected transport instances or simulated EV3 transports: 1

## Gate Results

| Gate | Status | Evidence detail |
|---|---|---|
| scratchai-unified-stack | FAIL | Requires `scratchai_unified_stack=true` from the rehearsal run. |
| real-ev3-endpoint | PASS | Requires `ev3_endpoint_connected=true` from a real EV3 brick. |
| weisilelink-real-transport | PASS | Requires `weisilelink_real_transport=true`, not simulation. |
| motor-command-safety | PASS | Requires motor command, emergency stop, and no in-class code changes. |
| sensor-stream-freshness | FAIL | Measured 17.30Hz for 0.2 minutes, dropped 0.000%, memory +0.0MB. |
| aiquest-collection-training-export | FAIL | Requires AI Quest collection plus training/export evidence. |
| multi-device-rehearsal | FAIL | Observed 1 transports and 1 real EV3 devices; max reconnect 0.0s. |

## Required Evidence

### ScratchAI unified stack

- Requirement: ScratchAI editor, EV3 extension-library entry, WeisileLink, EV3 firmware, and AI Quest middleware run from the EV3SC-owned source tree.
- Evidence: `scratchai_unified_stack=true` plus local stack health logs from the rehearsal computer.

### Real EV3 endpoint connected

- Requirement: At least one real ev3dev EV3 brick connects through the unified ScratchAI stack.
- Evidence: `ev3_endpoint_connected=true` with EV3 IP/host evidence and WeisileLink connection logs.

### WeisileLink real transport

- Requirement: WeisileLink uses a real WiFi or Bluetooth EV3 transport, not the local simulated preview transport.
- Evidence: `weisilelink_real_transport=true` with the transport mode and bridge status output.

### Motor command and safety

- Requirement: Scratch EV3 blocks drive motors at classroom-safe values and the emergency stop path stops motors and sound.
- Evidence: `motor_command_verified=true` and `emergency_stop_verified=true` with operator notes.

### Sensor stream freshness

- Requirement: The 45-minute student workflow streams sensor data close to the 50Hz target without excessive drops or memory growth.
- Evidence: `sensor_stream_hz>=45.0`, `sensor_stream_duration_minutes>=45.0`, `dropped_update_pct<=0.1`, and `memory_growth_mb<50.0`.

### AI Quest collection, training, and export

- Requirement: The 45-minute student workflow collects labeled EV3 data, uploads to Trainer, trains or selects a model, and exports model rules.
- Evidence: `aiquest_collection_verified=true` and `aiquest_training_export_verified=true` with export logs.

### 30-device classroom rehearsal

- Requirement: Start 1 WeisileLink instances or simulated EV3 transports on the classroom LAN, connect at least 1 real EV3 bricks if hardware is available, record disconnects, reconnect time, teacher recovery steps, and confirm the pilot required no code changes during class.
- Evidence: `transport_instance_count`, `device_count`, disconnect, reconnect, recovery-step, and no-code-change evidence.

## Attached Evidence Files

- `docs/classroom/real_ev3_smoke_evidence.json`
- `docs/classroom/evidence/real_ev3_smoke_transcript.json`
- `docs/classroom/vsle_bluetooth_full_module_smoke.template.json`
- `docs/classroom/vsle_bluetooth_full_module_smoke.md`

## Operator Notes

1-brick smoke capture. This does not replace the 45-minute Section 13.7 classroom rehearsal. No capture errors. Real EV3 confirmation was provided.

## Full VSLE Bluetooth Smoke Gate

The full-module Bluetooth path is separate from official-firmware Bluetooth
compatibility. It requires ev3dev, `vsle_ev3_server.py`,
`transport: "vsle-bluetooth"`, measured sensor data, all command groups,
Scratch unsandboxed loading, release-artifact install evidence, and disconnect
stop evidence.

Run the evidence gate after a real paired EV3 completes the full Bluetooth smoke:

```bash
.venv/bin/python scripts/run_vsle_bluetooth_smoke.py \
  --evidence docs/classroom/vsle_bluetooth_full_module_smoke.json \
  --report docs/classroom/vsle_bluetooth_full_module_smoke.md
```

Use `docs/classroom/vsle_bluetooth_full_module_smoke.template.json` as the
starting evidence shape. A missing field, false field, wrong transport, missing
sensor freshness measurement, or missing command group keeps
`Bluetooth classroom baseline ready` at `no`. The 25ms freshness target is
reported separately as `Bluetooth high-speed 50Hz ready`.

## Next Action

Classroom pilot remains blocked until these evidence gates pass: scratchai-unified-stack, sensor-stream-freshness, aiquest-collection-training-export, multi-device-rehearsal, and accepted real full VSLE Bluetooth smoke evidence in `docs/classroom/vsle_bluetooth_full_module_smoke.json`.
