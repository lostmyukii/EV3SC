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

This extension currently implements the source-backed Unsandboxed skeleton
and the full 64-block VSLE EV3 surface:

- 16 motor blocks from `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`, including
  Phase 3 speed/position PID tuning blocks.
- 20 sensor/system reporter blocks for color, ultrasonic, gyro, touch,
  infrared, EV3 brick buttons, and battery level.
- 6 sound blocks for tone, tone-and-wait, file playback, volume, beep, and stop.
- 8 display blocks for text, numbers, images, coordinates, lines, circles,
  clearing, and update.
- 6 system blocks for status light control, millisecond waits, emergency stop,
  connection state, and battery voltage.
- 8 AI Quest data collection blocks for local labeled capture, manual samples,
  auto collection, upload/export commands, clear, and count reporting.
- JSON-RPC 2.0 command dispatch to `ws://127.0.0.1:20111/scratch/bt`.
- Scratch Link base64 sensor notifications into `SensorCache`.
- Synchronous reporter and Boolean cache reads. Sensor/system/data reporters
  read from `SensorCache`; command blocks send validated JSON-RPC envelopes to
  WeisileLink.
- A cache-backed, collapsible sensor data panel implementation in
  `src/ui/data_panel.js`. It renders Scratch-style HTML/CSS from `SensorCache`,
  keeps the standard Scratch UI untouched until a host container explicitly
  mounts it, and exposes buttons for starting collection and uploading to the
  Trainer through the existing extension commands.
- A Scratch-style EV3 connection modal implementation in
  `src/ui/connection_modal.js`. It supports WiFi Full VSLE, Bluetooth Full
  VSLE, and official firmware Bluetooth compatibility selection, uses the
  official Scratch EV3 small icon copied into this package, and calls
  `vsle.setTransport` without auto-inserting UI into Scratch.

The extension does not modify Scratch GUI styling or existing Scratch visual
design.

## Sensor Data Panel

Use the panel only from a Scratch/TurboWarp host that provides an additive
container beside the stage:

```javascript
const panel = extension.createSensorDataPanel({
    container: document.querySelector('[data-vsle-sensor-panel-host]'),
    collectionTarget: 30
});

panel.render();
```

The extension does not auto-insert this host. That keeps the normal Scratch
stage, block palette, menu bar, sprite panes, and existing CSS unchanged.

## Connection Modal

Use the connection modal from an additive Scratch/TurboWarp modal host:

```javascript
const modal = extension.createConnectionModal({
    container: document.querySelector('[data-vsle-connection-modal-host]'),
    ev3Ip: '192.168.1.100'
});

modal.render();
```

Selecting WiFi Full VSLE sends `vsle.setTransport` with `transport: "wifi"` and
`ev3_ip`. Selecting Bluetooth Full VSLE sends `transport: "vsle-bluetooth"` and
`ev3_bt`; the legacy `bluetooth` transport name is normalized to that full VSLE
mode. Selecting Official Firmware Bluetooth Compatibility sends
`transport: "official-bluetooth"` and `ev3_official_bt`. The modal mirrors
Scratch's hardware connection modal structure and does not change existing
Scratch GUI files.
