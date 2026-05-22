# TurboWarp Phase 1 Integration Test Report

Date: 2026-05-22

## Scope

This report records the repeatable Phase 1 TurboWarp integration checks for the
current repository state. The tests cover the VSLE-EV3 Unsandboxed extension
load path, Scratch Link compatible WeisileLink messaging, cache-backed sensor
reporters, and the "do not change Scratch visual design" rule at the extension
boundary.

## Automated Coverage

Run from `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension`:

```bash
npm run test:integration
```

The integration test verifies:

- TurboWarp-style URL loading by evaluating `index.js` with a global `Scratch`
  object instead of CommonJS `require`.
- `Scratch.extensions.unsandboxed` registration through
  `Scratch.extensions.register`.
- The full Phase 1 extension block surface: 34 blocks total.
- LEGO EV3 red category color `#E6001F` and `showStatusButton: true`.
- No Scratch GUI DOM reads or writes during extension load.
- Motor command flow from a Scratch block method to a JSON-RPC 2.0 request at
  `ws://127.0.0.1:20111/scratch/bt`.
- Base64 `didReceiveMessage` sensor notifications flowing into `SensorCache`.
- Color, ultrasonic, gyro, and touch reporter/Boolean values reading from cache.

## Phase 1 Acceptance Mapping

| Acceptance item | Automated result | Evidence |
|-----------------|------------------|----------|
| EV3 moves forward/backward from Scratch blocks | Simulated pass | `motorRunTimed` sends JSON-RPC `motor.runTimed` with normalized port/speed/time |
| Color sensor value readable in Scratch reporter | Pass | `getColorSensorColor` reads cached `sensors.S1.color` |
| Ultrasonic distance readable in Scratch reporter | Pass | `getUltrasonicDistance` reads cached `sensors.S2.distance_cm` |
| Gyro angle readable in Scratch reporter | Pass | `getGyroAngle` reads cached `sensors.S3.angle` |
| Touch sensor Boolean works in Scratch `if` block | Pass | `getTouchPressed` returns a Boolean from cached `sensors.S4.pressed` |
| Scratch visual design unchanged | Pass at extension boundary | Integration sandbox fails on DOM access; repo has no `scratch-gui` edits |
| Connection modal shows EV3 status | Not part of this automated extension test | Requires Scratch GUI integration work while preserving the standard Scratch modal pattern |
| Section 13.6 gates pass for local pilot use | Not deployment-approved | 4-hour 50Hz timing, screenshot diff, and classroom rehearsal remain release gates |

## Manual Hardware Smoke Test

Before marking classroom pilot readiness, run this with a real EV3 brick:

1. Start EV3 firmware on the brick and WeisileLink on the teacher computer.
2. Serve the extension with `npm run serve`.
3. Load the extension in TurboWarp with:

   ```javascript
   vm.extensionManager.loadExtensionURL(
       'http://localhost:8000/vsle-ev3-extension/index.js'
   );
   ```

4. Run one forward/backward motor command and confirm physical motor movement.
5. Confirm color, ultrasonic, gyro, and touch reporters update from live sensor
   data without Scratch animation freezes.
6. Capture a Scratch baseline screenshot and a VSLE-EV3 loaded screenshot; only
   the allowed extension additions may differ.

Classroom deployment remains blocked until the full Section 13.6 remediation
gates and Section 13.7 classroom rehearsal pass.
