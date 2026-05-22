# VSLE-EV3 Extension

TurboWarp Unsandboxed extension for the VSLE Scratch-EV3 platform.

## Development

Run checks:

```bash
npm test
npm run test:integration
npm run check
```

Serve from the repository root path expected by TurboWarp:

```bash
npm run serve
```

Then load:

```javascript
vm.extensionManager.loadExtensionURL(
    'http://localhost:8000/vsle-ev3-extension/index.js'
);
```

`localhost:3001` is also supported for project compatibility when the
TurboWarp fork allowlist includes that exact URL:

```bash
npm run serve:3001
```

## Scope

This extension currently implements the source-backed Unsandboxed skeleton,
all Phase 1 blocks, and the first Phase 2 block group:

- 14 motor blocks from `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`.
- 20 sensor/system reporter blocks for color, ultrasonic, gyro, touch,
  infrared, EV3 brick buttons, and battery level.
- 6 sound blocks for tone, tone-and-wait, file playback, volume, beep, and stop.
- 8 display blocks for text, numbers, images, coordinates, lines, circles,
  clearing, and update.
- JSON-RPC 2.0 command dispatch to `ws://127.0.0.1:20111/scratch/bt`.
- Scratch Link base64 sensor notifications into `SensorCache`.
- Synchronous reporter and Boolean cache reads. The only sensor command in
  this phase is `resetGyro`, which sends `gyro.reset` to WeisileLink.

The extension does not modify Scratch GUI styling or existing Scratch visual
design.
