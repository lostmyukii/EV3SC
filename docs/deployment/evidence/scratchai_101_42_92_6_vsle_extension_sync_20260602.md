# ScratchAI 101.42.92.6 VSLE Extension Sync

Date: 2026-06-02

## Result

- Server sync: pass
- Public preview: pass
- Public VSLE-EV3 extension: pass
- Cloud-server direct Bluetooth: not testable by design

## Deployment

- URL: `http://101.42.92.6:18612/`
- Remote base directory: `/home/ubuntu/ev3sc-scratchai-18612`
- New release: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260602-vsle-extension-freshness`
- Synced path: `vsle-ev3-extension/`
- Preserved remote GUI build: `static/gui.js` still points to `http://101.42.92.6:18612/vsle-ev3-extension/index.js`

## Verification

The public extension route returns JavaScript with 101685 bytes and includes:

- `Bluetooth Full VSLE`
- `vsle-bluetooth`
- `received_at_ms`

The public GUI route still embeds the public extension URL and does not embed the local development URL `127.0.0.1:8000`.

Systemd services after sync:

- `ev3sc-scratchai-preview-18612.service`: active
- `ev3sc-scratchai-middleware-18614.service`: active
- `ev3sc-scratchai-asset-18615.service`: active

## Bluetooth Boundary

The cloud server does not have a detectable Bluetooth adapter, its `bluetooth`
service is inactive, and `127.0.0.1:20111` is closed on the server. This is
expected for the product architecture: the browser loads ScratchAI from the
public server, then talks to WeisileLink Desktop on the teacher computer at
`ws://127.0.0.1:20111/scratch/bt`. Real EV3 Bluetooth validation must therefore
be run from the teacher computer with WeisileLink Desktop and a paired EV3, not
from the cloud host itself.
