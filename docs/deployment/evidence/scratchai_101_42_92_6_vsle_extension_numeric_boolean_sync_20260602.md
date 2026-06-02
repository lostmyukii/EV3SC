# ScratchAI 101.42.92.6 VSLE Numeric Boolean Extension Sync

Date: 2026-06-02

## Result

- Server sync: pass
- Public preview: pass
- Public VSLE-EV3 extension: pass
- Numeric EV3 Boolean fix: pass

## Deployment

- URL: `http://101.42.92.6:18612/`
- Remote base directory: `/home/ubuntu/ev3sc-scratchai-18612`
- New release: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260602-numeric-boolean`
- Synced path: `vsle-ev3-extension/`
- Preserved remote GUI build: `static/gui.js` still points to `http://101.42.92.6:18612/vsle-ev3-extension/index.js`

## Verification

The public extension route returns JavaScript with 101921 bytes and its SHA-256
matches the local EV3SC extension file:

```text
df600e57304fc15e28a729f2fd00f1a081152cd436da08de245e71b2838e7154
```

The public extension includes:

- `const safeBoolean`
- `value === 1`
- `value === '1'`
- `Bluetooth Full VSLE`
- `received_at_ms`

The public GUI route still embeds the public extension URL and does not embed
the local development URL `127.0.0.1:8000`.

Systemd services after sync:

- `ev3sc-scratchai-preview-18612.service`: active
- `ev3sc-scratchai-middleware-18614.service`: active
- `ev3sc-scratchai-asset-18615.service`: active

## Next Test

Refresh the teacher browser page at `http://101.42.92.6:18612/`, reload the EV3
extension, and rerun the S4 touch block test with local WeisileLink Bluetooth
still running.
