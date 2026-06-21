# ScratchAI EV3 Discovery Modal Sync - 2026-06-21

Public URL: `http://101.42.92.6:18612/`

Release: `scratchai-18612-20260621-discover-normalize`

Remote path: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260621-discover-normalize`

Code commit: `dbaf08b`

## Fix

The Windows wizard could prove `scratch_link_protocol_ok=True` and
`scratch_link_discover_ok=True`, but the ScratchAI connection modal could still
stay on "正在查找设备". The browser-side EV3 compatibility layer now:

- normalizes discovered peripherals that have a name but no `peripheralId`,
  creating a stable `vsle-ev3-wifi` device entry for the Scratch modal;
- accepts older WeisileLink `discover` JSON-RPC result payloads when the runtime
  does not also send a `didDiscoverPeripheral` notification.

## Deployment Evidence

- Public `gui.js` SHA-256:
  `49489a730fb1658cf00cc52e43b924e298038ecb434fdb0092aa814bb2eff718`
- Public VSLE-EV3 extension SHA-256:
  `cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d`
- Public bundle markers found: `peripheral_id`, `deviceId`,
  `VSLE EV3 WiFi`, `EV3 已连接`
- Services after restart: preview `active`, middleware `active`, asset `active`
- `scripts/verify_scratchai_preview.py --url http://101.42.92.6:18612/`
  passed.

## Local Verification

- Node behavior script: missing `peripheralId` still emits
  `PERIPHERAL_LIST_UPDATE`.
- Node behavior script: result-only `discover` still emits
  `PERIPHERAL_LIST_UPDATE`.
- Node require check for `scratch3_vsle_ev3_compat` passed.
- `.venv/bin/python -m pytest tests/test_scratchai_ev3_connection_diagnostics.py -q`
  passed with `3 passed`.
- `git diff --check` passed.
- Scratch GUI `npm run build:dev` passed.

Note: the full `scratch-vm` tap file and direct eslint invocation timed out or
hung in this local environment. The changed discovery behavior was covered by
focused Node scripts, and the rebuilt public bundle was verified after deploy.
