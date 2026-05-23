# VSLE Classroom Materials

This folder contains the Phase 3 teacher guide + student workbooks for the VSLE
Scratch-EV3 platform. The materials are written for ages 7-15 and match the
source-backed AI Quest sample projects in `ai-quest-samples/projects/`.

## Files

| File | Audience | Use |
|------|----------|-----|
| `TEACHER_GUIDE.md` | Teacher or club facilitator | Plan, run, verify, and recover a 45-minute AI Quest robotics lesson. |
| `WORKBOOK_OBSTACLE_AVOIDANCE.md` | Students | Collect distance and touch data for obstacle classification. |
| `WORKBOOK_LINE_PATROL.md` | Students | Collect reflected-light data for line and floor classification. |
| `WORKBOOK_TOUCH_STOP_SAFETY.md` | Students | Collect touch and motion data for a safety-stop classifier. |
| `REAL_EV3_REHEARSAL.md` | QA or pilot lead | Record the Section 13.7 real EV3 classroom rehearsal gate before pilot approval. |
| `REAL_EV3_SMOKE_HANDOFF.md` | Physical EV3 operator | Run the real-brick preflight, start WeisileLink against real hardware, and capture the confirmed one-brick smoke evidence. |
| `REAL_EV3_SMOKE_READINESS.md` | QA or pilot lead | Record the non-invasive endpoint readiness check before running `--confirm-real-ev3`. |
| `real_ev3_rehearsal_evidence.template.json` | QA or pilot lead | Record real hardware, sensor, AI Quest, and multi-device evidence for the rehearsal runner. |

## Source Alignment

The workbooks are intentionally tied to these sample IDs:

- `obstacle-avoidance-collector`
- `line-patrol-color-collector`
- `touch-stop-safety-collector`

Each workbook keeps the same labels, sensors, motors, features, 70% accuracy
gate, and export artifacts listed in the matching sample manifest.

## Real Hardware Rehearsal

Start with a single-brick smoke capture. The `--confirm-real-ev3` flag is an
operator assertion that the connected endpoint is physical EV3 hardware, not
the local preview simulator. Use `REAL_EV3_SMOKE_HANDOFF.md` as the operator
handoff before running the confirmed hardware command.

Before using `--confirm-real-ev3`, run the non-invasive readiness check:

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

```bash
.venv/bin/python scripts/run_real_ev3_rehearsal.py \
  --capture-smoke \
  --confirm-real-ev3 \
  --run-safe-motor-test \
  --capture-seconds 10 \
  --capture-smoke-evidence docs/classroom/real_ev3_smoke_evidence.json \
  --capture-smoke-transcript docs/classroom/evidence/real_ev3_smoke_transcript.json \
  --json-report docs/classroom/real_ev3_smoke_report.json \
  --report docs/classroom/REAL_EV3_REHEARSAL.md \
  --expected-devices 1 \
  --expected-transport-instances 1
```

Before any pilot class, run:

```bash
.venv/bin/python scripts/run_real_ev3_rehearsal.py \
  --evidence-json docs/classroom/real_ev3_rehearsal_evidence.json \
  --json-report docs/classroom/real_ev3_rehearsal_report.json \
  --report docs/classroom/REAL_EV3_REHEARSAL.md \
  --require-passed
```

Until real EV3 evidence is attached, the generated rehearsal report must remain
blocked and must not be treated as classroom approval.
