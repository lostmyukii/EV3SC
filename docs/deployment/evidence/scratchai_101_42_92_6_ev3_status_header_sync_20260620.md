# ScratchAI 101.42.92.6 EV3 Status Header Sync

- Status: completed
- Generated at: 2026-06-20T09:28:10Z
- Public URL: http://101.42.92.6:18612/
- Remote base directory: `/home/ubuntu/ev3sc-scratchai-18612`
- Previous release: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260603-bt-reconnect-cadence`
- New release: `/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260620-ev3-status`
- Code commit: `33feb63`

## What Changed

The public ScratchAI page now serves a rebuilt `gui.js` with the teacher-visible EV3 connection status pill in the stage header.

The rebuilt page contains the states:

- `EV3 已发现`
- `EV3 已连接`
- `正在接收传感器`
- `距上次传感器数据`
- `Link 未启动 / 20111 不可达`

## Verification

- Public `gui.js` SHA-256: `faef661f4d559e3bc8d455e921c8bec5176aacead48121d3e7e759218d8ba1ce`
- Public EV3 extension SHA-256: `cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d`
- Public root returned `HTTP 200`
- Public `gui.js` returned `HTTP 200` with `application/javascript; charset=utf-8`
- `scripts/verify_scratchai_preview.py --url http://101.42.92.6:18612/ --timeout-seconds 20` passed

Service status after release switch:

- `ev3sc-scratchai-preview-18612.service`: active
- `ev3sc-scratchai-middleware-18614.service`: active
- `ev3sc-scratchai-asset-18615.service`: active

## Boundary

The public host cannot directly validate the teacher computer's local EV3 Bluetooth or WiFi link. Real EV3 confirmation still requires the teacher Windows computer to run WeisileLink Desktop locally, open `http://101.42.92.6:18612/` on the same Windows machine, load the EV3 extension, and watch the new status pill move from discovery to connected/sensor-streaming.
