# Real EV3 Smoke Handoff

This handoff is for the physical EV3 operator. Local preview, simulator,
or localhost-only success is not enough for classroom approval.

Do not use `--confirm-real-ev3` unless the connected endpoint is a
physical LEGO EV3 brick running the EV3SC `vsle_ev3_server.py` on
ev3dev.

## Repository

- Run all commands from `/Users/yukii/Desktop/EV3SC`.
- Do not edit or depend on the external ScratchAI reference folder.

## EV3 Brick Preflight

On the teacher computer:

```bash
ping -c 1 ev3dev.local
nc -z -w 2 ev3dev.local 8765
```

On the EV3 brick:

```bash
systemctl status vsle-ev3-server
journalctl -u vsle-ev3-server -n 80 --no-pager
```

## WeisileLink Real Transport

Start WeisileLink against the physical EV3 endpoint:

```bash
PYTHONPATH=weisile-link EV3_IP=ev3dev.local EV3_WS_PORT=8765 \
  WEISILE_TRANSPORT=wifi .venv/bin/python -m weisile_link
```

Then verify the local Scratch Link compatible endpoint is reachable:

```bash
nc -z -w 2 127.0.0.1 20111
```

## Non-Invasive Smoke Readiness Gate

Run the readiness gate before the confirmed smoke capture. It exits
non-zero until both the physical EV3 endpoint and WeisileLink endpoint
are reachable:

If `ev3dev.local` does not resolve on the classroom network, append
`--ev3-candidate-host <real-ev3-ip>` after reading the EV3 IP from
`hostname -I` on the brick.

```bash
.venv/bin/python scripts/run_real_ev3_rehearsal.py \
  --check-smoke-readiness \
  --ev3-host ev3dev.local \
  --ev3-port 8765 \
  --weisile-link-host 127.0.0.1 \
  --weisile-link-port 20111 \
  --smoke-readiness-json docs/classroom/real_ev3_smoke_readiness.json \
  --smoke-readiness-report docs/classroom/REAL_EV3_SMOKE_READINESS.md \
  --require-smoke-ready
```

## Confirmed One-Brick Smoke Capture

Run only after physically confirming the EV3 endpoint and clearing the
motor area for the low-speed 0.25s motor A test:

```bash
.venv/bin/python scripts/run_real_ev3_rehearsal.py \
  --capture-smoke \
  --confirm-real-ev3 \
  --run-safe-motor-test \
  --weisile-link-url ws://127.0.0.1:20111/scratch/bt \
  --capture-seconds 10 \
  --capture-smoke-evidence docs/classroom/real_ev3_smoke_evidence.json \
  --capture-smoke-transcript docs/classroom/evidence/real_ev3_smoke_transcript.json \
  --json-report docs/classroom/real_ev3_smoke_report.json \
  --report docs/classroom/REAL_EV3_REHEARSAL.md \
  --expected-devices 1 \
  --expected-transport-instances 1
```

Expected smoke result: `real-ev3-endpoint`,
`weisilelink-real-transport`, and `motor-command-safety` can pass,
while the full classroom gate remains blocked until 45-minute sensor,
AI Quest, and multi-device evidence is attached.

## Full VSLE Bluetooth Smoke Evidence

This is the handoff for the website Bluetooth full-module path. It is not
official-firmware Bluetooth compatibility: the EV3 must run ev3dev and the
EV3SC `vsle_ev3_server.py` with the RFCOMM listener explicitly enabled.

Current evidence decision: `vsle-bluetooth` is the no-WiFi full-module
classroom path when compatible EV3 WiFi dongles are unavailable. The smoke gate
now reports two separate results: the Bluetooth classroom baseline and the
Bluetooth high-speed 50Hz gate.

On the EV3, enable the full VSLE Bluetooth listener only after pairing and
classroom safety checks:

```bash
VSLE_EV3_ENABLE_BLUETOOTH=1 VSLE_EV3_BT_RFCOMM_CHANNEL=1 ./scripts/install.sh
systemctl restart vsle-ev3-server
systemctl status vsle-ev3-server
```

On the teacher computer, build the native byte-stream adapter if this is a
macOS desktop smoke:

```bash
desktop/macos/native/build.sh --check
desktop/macos/native/build.sh
```

Start WeisileLink in full VSLE Bluetooth mode. Keep the EV3 Bluetooth address
out of committed logs and replace the placeholder locally:

```bash
PYTHONPATH=weisile-link \
  WEISILE_TRANSPORT=vsle-bluetooth \
  EV3_BT=00:16:53:XX:XX:XX \
  WEISILE_VSLE_BT_ADAPTER=desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter \
  .venv/bin/python -m weisile_link
```

In ScratchAI, choose `Bluetooth Full VSLE`, not
`Official Firmware Bluetooth Compatibility`. Exercise these command groups
against the physical brick:

- motor
- sensor
- sound
- display
- system
- data_collection
- ai_quest

After the smoke, copy the template and fill only evidence observed from the
real EV3 run:

```bash
cp docs/classroom/vsle_bluetooth_full_module_smoke.template.json \
  docs/classroom/vsle_bluetooth_full_module_smoke.json
```

Required pass fields:

- `installed_from_release_artifact`: true only for a release artifact run.
- `ev3_runs_ev3dev_server`: true only after confirming `vsle-ev3-server`.
- `transport`: `vsle-bluetooth`.
- `real_ev3_full_bluetooth_ok`: true only after a physical Bluetooth run.
- `sensor_freshness_ms_max`: observed max Bluetooth sensor freshness gap.
- `sensor_freshness_ms_avg_observed`: observed average Bluetooth freshness gap.
- `sensor_freshness_ms_p95_observed`: observed P95 Bluetooth freshness gap.
- `sensor_updates_observed`: number of Scratch-visible sensor updates observed.
- every `command_groups.*` value true after that group is exercised.
- `disconnect_stop_ok`: true only after disconnect stop behavior is observed.
- `scratch_unsandboxed_loaded`: true only for the unsandboxed ScratchAI path.

Validate the evidence:

```bash
.venv/bin/python scripts/run_vsle_bluetooth_smoke.py \
  --evidence docs/classroom/vsle_bluetooth_full_module_smoke.json \
  --report docs/classroom/vsle_bluetooth_full_module_smoke.md
```

The report must say `Bluetooth classroom baseline ready: yes` before this full
Bluetooth path can be treated as the no-WiFi classroom baseline. The separate
`Bluetooth high-speed 50Hz ready` result must say `yes` before any lesson or
release note claims 50Hz/high-speed Bluetooth streaming.

## Section 13.7 Full Classroom Rehearsal

After the confirmed smoke capture, collect the full evidence JSON for
the 30-transport / 10-real-brick rehearsal and run:

```bash
.venv/bin/python scripts/run_real_ev3_rehearsal.py \
  --evidence-json docs/classroom/real_ev3_rehearsal_evidence.json \
  --json-report docs/classroom/real_ev3_rehearsal_report.json \
  --report docs/classroom/REAL_EV3_REHEARSAL.md \
  --require-passed
```
