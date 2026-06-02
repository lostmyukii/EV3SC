# Public ScratchAI + Local EV3 Bluetooth Quick Start

Use this README when a teacher needs to test the public ScratchAI website with a
real EV3 over local Bluetooth.

Full guide:
`docs/classroom/SCRATCHAI_PUBLIC_SITE_LOCAL_BLUETOOTH_E2E.md`

## One-Minute Summary

Open:

```text
http://101.42.92.6:18612/
```

Run WeisileLink Desktop on the same teacher computer.

Choose:

```text
Bluetooth Full VSLE
```

Do not choose:

```text
Official Firmware Bluetooth Compatibility
```

Expected path:

```text
Public ScratchAI website
  -> local WeisileLink Desktop
  -> Bluetooth Full VSLE
  -> ev3dev EV3
```

The server does not connect to EV3 Bluetooth directly.

## Teacher Checklist

Before opening ScratchAI:

- EV3 is powered on.
- EV3 is running ev3dev and `vsle-ev3-server`.
- EV3 is paired with the teacher computer.
- WeisileLink Desktop is running locally.
- A motor is plugged into EV3 output port `A` for the motor test.

In ScratchAI:

1. Open `http://101.42.92.6:18612/`.
2. Open the EV3 connection flow.
3. Select `Bluetooth Full VSLE`.
4. Confirm `EV3已连接? = true`.
5. Check `EV3电池电压 (V)` shows a real number.
6. Run `设置状态灯为 green`.
7. Run `发出哔声` or `播放音调`.
8. Run `清屏`, then `显示文字`.
9. Run data collection and confirm `已采集数据条数` increases.
10. Run `电机 A 以 40 % 速度运行 1 秒`.
11. Run `停止所有电机`.

## Evidence To Capture

Use:

```text
docs/classroom/evidence/scratchai_teacher_block_rehearsal_YYYYMMDD.json
```

Must record:

- Public browser URL: `http://101.42.92.6:18612/`
- Selected transport label: `Bluetooth Full VSLE`
- Selected transport: `vsle-bluetooth`
- WeisileLink endpoint: `ws://127.0.0.1:20111/scratch/bt`
- Browser direct Bluetooth used: `false`
- EV3 runs ev3dev server: `true`
- One observed block from motor, sensor, sound, display, system, data
  collection, and AI Quest if AI Quest is part of the rehearsal.

Validate:

```bash
.venv/bin/python scripts/run_scratchai_teacher_block_rehearsal.py \
  --evidence docs/classroom/evidence/scratchai_teacher_block_rehearsal_YYYYMMDD.json \
  --report docs/classroom/SCRATCHAI_TEACHER_BLOCK_REHEARSAL.md
```

## Common Fixes

`EV3已连接?` is false:

- Make sure WeisileLink Desktop is running on the same computer as the browser.
- Re-select `Bluetooth Full VSLE`.
- Re-pair EV3 Bluetooth if needed.
- Restart `vsle-ev3-server` on the EV3 if hardware was plugged in after boot.

Motor does not move:

- Use output port `A` on top of the EV3.
- Keep speed at `40` and time at `1` second for the first test.
- Run `停止所有电机` before retrying.

Cloud server Bluetooth test fails:

- This is normal. The cloud server only hosts the website. Bluetooth is local to
  the teacher computer.

