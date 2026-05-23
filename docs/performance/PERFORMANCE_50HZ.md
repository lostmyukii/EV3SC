# 50Hz Sustained Performance Testing

This Phase 3 performance gate covers the 50Hz sustained stream required by
the VSLE Scratch-EV3 platform spec. It verifies the teacher-computer bridge and
EV3 stream contract without changing the Scratch visual identity or adding any
Scratch GUI dependency.

## Scope

The checked-in harness runs a deterministic 4-hour session simulation at 50Hz.
The full run models 720000 expected sensor updates, records delivered and
dropped updates, checks the drift bound, and reports memory growth. It exists
to enforce Section 13.6 Critical Remediation Gates before classroom rehearsal.

Sensor reporter behavior remains separate from this test: Scratch blocks must
read from SensorCache synchronously, while motor commands continue through the
JSON-RPC bridge. The harness does not introduce network reads into reporter or
Boolean blocks.

## Pass Gates

- Target cadence: 50Hz sustained stream.
- Minimum live alert cadence: observed sensor rate stays at or above 45Hz.
- Dropped-update gate: dropped updates <0.1%.
- Memory gate: memory growth <50MB over the 4-hour session simulation.
- Drift gate: drift bound is no more than one 20ms sensor interval.
- Data retention gate: collection code remains bounded by MAX_COLLECTED_POINTS.

## Local Simulation

Run the default report from the repository root:

```bash
python -m performance.sustained_50hz
```

The command writes:

- docs/performance/50hz_sustained_report.json
- docs/performance/50hz_sustained_report.md

The default run uses a 4-hour duration, 50Hz target, zero dropped updates, and
22MB simulated memory growth. The generated report is suitable for CI and for a
teacher-computer preflight record.

Failure rehearsal examples:

```bash
python -m performance.sustained_50hz --duration-seconds 100 --drop-every 100
python -m performance.sustained_50hz --duration-seconds 100 --final-memory-mb 151.5
python -m performance.sustained_50hz --duration-seconds 100 --drift-per-update-ms 0.01
```

These commands are expected to exit non-zero when they exceed the Section 13.6
Critical Remediation Gates.

## Manual 30-Device Rehearsal

For a classroom-scale rehearsal, use the Docker or local deployment flow first,
then connect the EV3 fleet in waves until the target 30-device rehearsal is
reached. During the rehearsal:

- Keep the EV3 server running with its monotonic 50Hz broadcast loop.
- Keep WeisileLink status open at `/api/status`.
- Confirm `sensor_hz` stays at or above 45Hz for every active EV3 session.
- Confirm collected samples remain bounded by MAX_COLLECTED_POINTS.
- Export the generated JSON report beside the classroom run notes.

The simulation does not replace hardware rehearsal; it is the repeatable gate
that prevents known 50Hz, dropped-update, memory, and drift failures from
shipping before EV3 hardware is available.
