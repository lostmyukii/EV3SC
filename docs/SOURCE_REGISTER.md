# Source Register

This project requires EV3 and Scratch behavior to be based on open-source
source code, official repositories, official documentation, or verified local
ports. This register records the sources used for the current implementation.

## Phase 1 Step 1 — WeisileLink JSON-RPC and Validation Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| Scratch Link Network Protocol | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/NetworkProtocol.md` | JSON-RPC 2.0 envelope shape, WebSocket path model, Scratch Link request/response expectations |
| Scratch Link Architecture | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/Architecture.md` | Scratch Link service boundary and WebSocket listener/RPC/session separation |
| Scratch VM EV3 extension | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js` | EV3 direct-command naming context and Scratch-side compatibility reference |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 10 API contracts, Section 13.6 critical gates, Section 15 security requirements, Section 16 error codes |
| JSON-RPC 2.0 specification | `https://www.jsonrpc.org/specification` | Generic JSON-RPC 2.0 response and error envelope semantics |

## Phase 1 Step 2 — Error Mapping and Reconnect/Degradation Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 10.4 Scratch-facing JSON-RPC error envelope; Section 16.1 error code and retryability catalog; Section 16.2 degradation rules; Section 16.3 reconnect behavior |
| WeisileLink JSON-RPC baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/json_rpc.py` | Reused `make_result` and `make_error` helpers for Scratch-compatible response envelopes |
| WeisileLink validation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/validation.py` | Confirms validation failures stop before transport dispatch; this step only maps runtime failures and degraded runtime state |
| Python standard library documentation | `https://docs.python.org/3/library/random.html` | `random.uniform` jitter source for Section 16.3 reconnect backoff; no external runtime dependency introduced |

## Phase 1 Step 3 — Health Check and Structured Logging Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 17.1 JSON structured log fields and log privacy rules; Section 17.2 `/api/status` response fields; Section 17.3 metrics and alert thresholds |
| WeisileLink degradation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/runtime/degradation.py` | Connection state, active transport, reconnect count, and collected point count used by `/api/status` |
| Python standard library documentation | `https://docs.python.org/3/library/json.html` | JSON serialization for health endpoint responses and structured JSON line logs |
| Python standard library documentation | `https://docs.python.org/3/library/datetime.html` | UTC ISO-8601 timestamp generation for structured log records |

## Phase 1 Step 4 — ev3dev SD Card Preparation and Autostart

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Phase 1 ev3dev SD card/autostart task; Section 14.2 EV3 setup; Section 14.5 rollback and recovery; Section 14.6 release checklist |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3 setup defaults: ev3dev, `robot@ev3dev.local`, default password, `websockets` and `ev3dev2`, no pybluez |
| ev3dev Getting Started | `https://www.ev3dev.org/docs/getting-started/` | Official SD card, boot, networking, SSH, and shutdown flow for EV3 |
| ev3dev Downloads | `https://www.ev3dev.org/downloads/` | Official EV3 image source and image-selection guidance |
| Debian systemd service manual | `https://manpages.debian.org/man/systemd.service` | Service unit sections and directives including `ExecStart`, `Restart`, and process handling |
| Debian systemd wiki | `https://wiki.debian.org/systemd/Services` | `systemctl enable` service startup workflow reference |

## Phase 1 Step 5 — EV3 Server Sensor Loop and Motor Control

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 6.1 EV3 command/data flow; Section 10.5 command protocol; Section 14.2 EV3 setup; Section 15.4 pairing-token control; Section 16 error and degradation rules |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3 WebSocket port, sensor data key names, motor/sensor port names, 50Hz sensor loop requirement, stdlib/no-pybluez rule, and safety expectations |
| ev3dev2 overview | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/` | Official Python API surface for the EV3 runtime used by the brick server |
| ev3dev2 motors documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/motors.html` | `LargeMotor`, `MediumMotor`, motor speed, timed run, position run, stop, and reset behavior |
| ev3dev2 sensors documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/sensors.html` | Color, ultrasonic, gyro, touch, and infrared sensor classes and value accessors |
| ev3dev2 sound documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/sound.html` | EV3 sound volume, tone, beep, and stop-equivalent behavior |
| ev3dev2 display documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/display.html` | EV3 LCD drawing primitives for text, line, circle, clear, and display updates |
| websockets documentation | `https://websockets.readthedocs.io/` | Async WebSocket server shape, `serve` lifecycle, ping interval, and coroutine-based client handling |

## Phase 1 Step 6 — WeisileLink WiFi WebSocket Transport

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 5.6 WiFi transport API; Section 7.2 EV3 sensor update payload; Section 10.5 command validation; Section 16 timeout/disconnect degradation |
| EV3 server baseline | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | Pairing ack shape, command ack envelope, sensor update payload, and close-safety behavior expected by WeisileLink |
| WeisileLink validation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/validation.py` | Reused command allowlist and normalization so invalid commands never reach EV3 |
| WeisileLink error/degradation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/runtime/degradation.py` | Reused connection state, WiFi failure flags, sensor cache snapshots, and pending command tracking |
| websockets documentation | `https://websockets.readthedocs.io/` | Async WebSocket client connection API, ping interval option, and single receiver loop pattern |

## Phase 1 Step 7 — Scratch-Compatible JSON-RPC Server

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| Scratch Link Network Protocol | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/NetworkProtocol.md` | `/scratch/bt` path, JSON-RPC request/response/notification semantics, `getVersion`, `discover`, `connect`, `send`, and base64 message conventions |
| Scratch Link Architecture | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/Architecture.md` | WebSocket listener, JSON-RPC message handler, and session boundary used by the local Scratch-compatible server |
| Scratch VM BT socket | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/io/bt.js` | Official VM notifications: `didDiscoverPeripheral`, `didReceiveMessage`, request handling, and no-response notification behavior |
| Scratch VM WebSocket client | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/util/scratch-link-websocket.js` | Official local endpoint selection: `ws://127.0.0.1:20111/scratch/bt` |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 5.3 JSON-RPC compatibility; Section 7.2 sensor notifications; Section 10.2 endpoints; Section 10.4 error envelopes; Section 17 status observability |
| WeisileLink protocol/runtime baselines | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/*.py`, `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/runtime/degradation.py`, `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/observability/health.py` | Reused JSON-RPC helpers, EV3 ack mapping, command validation, degradation responses, and `/api/status` payload generation |

## Phase 1 Step 8 — VSLE-EV3 Unsandboxed Extension and Motor Blocks

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 3.4/3.5 Unsandboxed extension loading; Section 4.1 extension architecture; Section 4.2 category color/block counts; Section 4.3 first 14 motor blocks; Section 10.2 Scratch WebSocket endpoint |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Unsandboxed-only extension rule, no Scratch visual design changes, motor port names, SensorCache reporter rule, and WeisileLink command names |
| TurboWarp Unsandboxed Extensions documentation | `https://docs.turbowarp.org/development/extensions/unsandboxed` | IIFE registration pattern, `Scratch.extensions.unsandboxed` guard, `Scratch.extensions.register`, and unsandboxed block safety rules |
| Scratch VM EV3 extension | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js` | Scratch extension `getInfo()` shape, block/menu definitions, argument casting style, and EV3 extension source style |
| Scratch VM WebSocket client | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/util/scratch-link-websocket.js` | Local Scratch Link endpoint convention that points Scratch-compatible clients at `ws://127.0.0.1:20111/scratch/bt` |
| Scratch VM BT socket | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/io/bt.js` | Scratch Link base64 notification behavior and `didReceiveMessage` naming used by the extension sensor-cache bridge |
| WeisileLink Scratch JSON-RPC server | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | Direct VSLE method forwarding and sensor update notification payloads consumed by the extension client |

## Rules

- Do not invent Scratch Link, Scratch VM, EV3, ev3dev, or ev3dev2 behavior from
  memory.
- Add a row here whenever code ports, adapts, or depends on upstream behavior.
- Keep local paths inside `/Users/yukii/Desktop/EV3SC/` for project-owned files;
  external source paths are read-only references unless ported into this repo.
