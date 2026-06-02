# ScratchAI Public Site + Local Bluetooth End-to-End Guide

Audience: teacher, pilot lead, or classroom support engineer.

Goal: open the public ScratchAI site at `http://101.42.92.6:18612/`, run
WeisileLink Desktop on the teacher computer, select `Bluetooth Full VSLE`, and
collect real EV3 evidence from the browser-to-local-Bluetooth path.

## What This Test Proves

This test verifies the classroom path:

```text
ScratchAI public website
  -> VSLE-EV3 Unsandboxed extension
  -> local WeisileLink Desktop on the teacher computer
  -> Bluetooth Full VSLE / vsle-bluetooth
  -> ev3dev EV3 running vsle_ev3_server.py
  -> real EV3 sensors, display, sound, status light, and motors
```

The cloud server does not connect to EV3 Bluetooth directly. It only hosts the
website and extension. Bluetooth pairing and EV3 control happen on the teacher
computer through local WeisileLink Desktop at
`ws://127.0.0.1:20111/scratch/bt`.

## Before You Start

Use one teacher computer and one real EV3 brick.

Required:

- EV3 is running ev3dev, not official LEGO firmware.
- EV3 has the EV3SC `vsle_ev3_server.py` service installed.
- EV3 Bluetooth/RFCOMM listener is enabled for Full VSLE Bluetooth.
- EV3 is paired with the teacher computer.
- WeisileLink Desktop is installed or otherwise started on the teacher computer.
- The teacher computer can open `http://101.42.92.6:18612/`.
- Motor tests use a real motor plugged into EV3 output port `A`.

Do not put server passwords, pairing tokens, API keys, or student raw data into
evidence files or screenshots.

## Step 1: Confirm The Public Site Is Ready

On the teacher computer, open:

```text
http://101.42.92.6:18612/
```

Expected:

- The ScratchAI editor opens.
- The EV3 extension is available.
- The EV3 extension comes from
  `http://101.42.92.6:18612/vsle-ev3-extension/index.js`.

If the page does not open, stop here and report the page URL, time, and browser
error.

## Step 2: Start WeisileLink Desktop Locally

Start WeisileLink Desktop on the teacher computer.

Expected local endpoints:

```text
ws://127.0.0.1:20111/scratch/bt
ws://127.0.0.1:8766
```

The app should use:

- Transport: `vsle-bluetooth`
- User-facing label: `Bluetooth Full VSLE`
- EV3 target: the paired ev3dev EV3 Bluetooth address

If using the developer checkout instead of the packaged desktop app, start the
same local bridge in Full VSLE Bluetooth mode and keep the terminal open. Do not
paste or commit the pairing token.

## Step 3: Select Bluetooth Full VSLE In ScratchAI

In ScratchAI:

1. Open the EV3 connection flow.
2. Choose `Bluetooth Full VSLE`.
3. Do not choose `Official Firmware Bluetooth Compatibility`.
4. Do not use browser Web Bluetooth.
5. Wait for the EV3 connection state to become visible.

Expected:

- Selected transport label: `Bluetooth Full VSLE`
- Internal transport: `vsle-bluetooth`
- WeisileLink endpoint stays local:
  `ws://127.0.0.1:20111/scratch/bt`
- Browser direct Bluetooth is not used.

## Step 4: Run The Safe Block Checklist

Run these blocks from ScratchAI, in order. Record only what you directly see or
hear.

### System And Sensor

1. `EV3已连接?`
   - Expected: `true`
2. `EV3电池电压 (V)`
   - Expected: a real number such as `7.5` to `8.2`
3. `设置状态灯为 green`
   - Expected: EV3 center light turns green
4. `等待 100 毫秒`
   - Expected: block completes
5. `关闭状态灯`
   - Expected: EV3 status light turns off

### Sound

1. `发出哔声`
   - Expected: teacher hears a beep
2. `播放音调`
   - Expected: teacher hears the tone

### Display

1. `清屏`
   - Expected: EV3 display clears
2. `显示文字`
   - Expected: text appears on the EV3 screen

### Data Collection

1. `开始采集数据 标签=课堂测试`
2. Wait 2 to 5 seconds.
3. Check `已采集数据条数`
   - Expected: the number increases above `0`
4. `停止数据采集`

### Motor Safety

Before running a motor block:

- Put the EV3 on the table.
- Keep fingers, cables, and loose parts away from the motor axle.
- Plug one real motor into output port `A`.

Run:

```text
电机 A 以 40 % 速度运行 1 秒
```

Expected: A port motor turns visibly.

Then run:

```text
停止所有电机
```

Expected: motor stops.

## Step 5: Record Evidence

Copy the teacher block rehearsal template:

```bash
cp docs/classroom/scratchai_teacher_block_rehearsal.template.json \
  docs/classroom/evidence/scratchai_teacher_block_rehearsal_YYYYMMDD.json
```

Fill only observed facts. For this public-site Bluetooth run, the important
fields are:

```json
{
  "browser_url": "http://101.42.92.6:18612/",
  "scratch_visual_design_changed": false,
  "scratch_unsandboxed_loaded": true,
  "extension_loaded_as_main_thread_script": true,
  "extension_worker_loaded": false,
  "selected_transport_label": "Bluetooth Full VSLE",
  "selected_transport": "vsle-bluetooth",
  "transport_capability": "full",
  "used_browser_direct_bluetooth": false,
  "weisilelink_endpoint": "ws://127.0.0.1:20111/scratch/bt",
  "connected_state_source": "weisilelink_health_and_sensor_freshness",
  "connection_state_visible": true,
  "command_source": "scratch_blocks",
  "real_ev3_project_used": true,
  "ev3_runs_ev3dev_server": true,
  "disconnect_stop_ok": true
}
```

Fill `sensor_freshness_ms_max` and `sensor_updates_observed` from WeisileLink
diagnostics or the local evidence capture. Do not guess these values. If they
are not measured, leave them empty and treat the gate as not passed yet.

For `block_groups_exercised`, list at least one observed block from each group:

```json
{
  "motor": ["电机 A 以 40 % 速度运行 1 秒", "停止所有电机"],
  "sensor": ["EV3电池电压 (V)", "EV3已连接?"],
  "sound": ["发出哔声", "播放音调"],
  "display": ["清屏", "显示文字"],
  "system": ["设置状态灯为 green", "关闭状态灯", "等待 100 毫秒"],
  "data_collection": ["开始采集数据", "已采集数据条数", "停止数据采集"],
  "ai_quest": ["recorded host-side AI Quest/data path if exercised"]
}
```

If AI Quest was not exercised in this run, leave the `ai_quest` list empty and
the gate will correctly remain blocked for full teacher rehearsal.

## Step 6: Validate Evidence

Run:

```bash
.venv/bin/python scripts/run_scratchai_teacher_block_rehearsal.py \
  --evidence docs/classroom/evidence/scratchai_teacher_block_rehearsal_YYYYMMDD.json \
  --report docs/classroom/SCRATCHAI_TEACHER_BLOCK_REHEARSAL.md
```

Expected passing summary:

```text
Teacher-facing Scratch block rehearsal: yes
```

If the report lists blocking items, fix only the listed missing evidence and
rerun the command.

## Troubleshooting

### The Website Opens But EV3 Does Not Connect

Check:

- WeisileLink Desktop is running on the same teacher computer as the browser.
- The local endpoint is `ws://127.0.0.1:20111/scratch/bt`.
- The selected mode is `Bluetooth Full VSLE`.
- The EV3 is paired to the teacher computer.
- The EV3 is running ev3dev and `vsle-ev3-server`.
- Browser Web Bluetooth was not used.

### Battery Shows A Number But `EV3已连接?` Is False

Hard refresh the browser page and reconnect. The public extension must include
the `received_at_ms` freshness fix. If the issue remains, record the browser
time, EV3 time if visible, and latest battery value.

### Motor Does Not Move

Do not increase speed first. Check:

- Motor cable is in top output port `A`, not bottom sensor ports `1-4`.
- Motor cable is firmly connected on both ends.
- If the motor was plugged in after the EV3 service started, restart
  `vsle-ev3-server` on the EV3, then reconnect from ScratchAI.
- Try `电机 A 以 40 % 速度运行 1 秒` again.

### The Cloud Server Bluetooth Check Fails

That is expected. The server does not own Bluetooth. Bluetooth must be tested on
the teacher computer with local WeisileLink Desktop and a paired EV3.

## Cleanup

At the end:

1. Run `停止所有电机`.
2. Stop data collection.
3. Disconnect EV3 in ScratchAI.
4. Close WeisileLink Desktop.
5. Shut down the EV3 normally.

