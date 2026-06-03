# ScratchAI Public VSLE Extension Bluetooth Reconnect/Cadence Sync

- Status: completed
- Generated at: 2026-06-03T05:46:35Z
- Public URL: http://101.42.92.6:18612/
- Public extension URL: http://101.42.92.6:18612/vsle-ev3-extension/index.js
- Remote base directory: `/home/ubuntu/ev3sc-scratchai-18612`
- Previous release: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260602-numeric-boolean`
- New release: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260603-bt-reconnect-cadence`
- Code commit: `a17d9af`

## What Changed

The public ScratchAI route now serves the EV3SC-owned VSLE-EV3 extension with:

- reusable active `vsle-bluetooth` sessions on repeated Scratch/diagnostic `connect` calls
- a 5000 ms browser connection reporter window for the measured Bluetooth classroom baseline cadence
- the existing numeric EV3 Boolean normalization for payloads such as `S4.pressed: 1`

Only `static/vsle-ev3-extension/index.js` was replaced in the copied public release. The Scratch GUI build and visual design assets were preserved.

## Verification

- Local extension SHA-256: `cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d`
- Remote extension SHA-256: `cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d`
- Public extension SHA-256: `cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d`
- Public extension contains `CONNECTION_STALE_MS = 5000`
- Public extension keeps `safeBoolean` and `value === 1`
- Public page returned `HTTP/1.1 200 OK`

Service status after release switch:

- `ev3sc-scratchai-preview-18612.service`: active
- `ev3sc-scratchai-middleware-18614.service`: active
- `ev3sc-scratchai-asset-18615.service`: active

Local regression tests:

- `.venv/bin/python -m pytest weisile-link/tests/test_bluetooth_transport.py -q`: 15 passed
- `npm test -- --test-name-pattern='connection reporter|Bluetooth|numeric boolean|system blocks'` in `vsle-ev3-extension`: 35 passed

## Boundary

The public host cannot directly test the local Bluetooth EV3 path. Real EV3 validation still requires the teacher computer to run WeisileLink locally with the saved pairing token and then load the public ScratchAI page in the browser.
