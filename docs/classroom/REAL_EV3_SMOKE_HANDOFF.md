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
