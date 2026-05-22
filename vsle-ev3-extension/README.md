# VSLE-EV3 Extension

TurboWarp Unsandboxed extension for the VSLE Scratch-EV3 platform.

## Development

Run checks:

```bash
npm test
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

This step implements the source-backed Unsandboxed extension skeleton and the
Phase 1 motor block category:

- 14 motor blocks from `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`.
- JSON-RPC 2.0 command dispatch to `ws://127.0.0.1:20111/scratch/bt`.
- Scratch Link base64 sensor notifications into `SensorCache`.
- Synchronous motor reporter and Boolean cache reads.

The extension does not modify Scratch GUI styling or existing Scratch visual
design.
