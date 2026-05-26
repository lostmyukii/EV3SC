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

## Phase 1 Step 9 — Sensor Cache and 20 Sensor Blocks

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 4.3 second block category with 20 sensor/system blocks; Section 4.4 50Hz `SensorCache` state-store contract; Section 9 EV3 capability matrix; Phase 1 sensor acceptance criteria |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Sensor cache key names, sensor port names, no-network reporter/Boolean rule, and `gyro.reset` command name |
| ev3dev2 sensors documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/sensors.html` | Official ColorSensor, UltrasonicSensor, GyroSensor, TouchSensor, and InfraredSensor properties/methods, including IR beacon and remote button APIs |
| Scratch VM EV3 extension | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js` | Scratch-side sensor reporter/Boolean block shape, menu formatting, cast usage, and cache-backed sensor read pattern |
| EV3 server baseline | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | EV3 sensor payload shape consumed by the extension and expanded for IR beacon/remote channel snapshots |
| WeisileLink Scratch JSON-RPC server | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | Base64 sensor notification path that forwards EV3 sensor payloads into the extension cache |

## Phase 1 Step 10 — TurboWarp Integration Test Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 3.1-3.5 Scratch visual preservation, Unsandboxed extension loading flow, and allowlisted extension URL; Phase 1 TurboWarp integration testing task and acceptance criteria |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | No Scratch visual design changes, Unsandboxed-only loading, local development URL, sensor cache reporter rule, and GitHub/progress workflow |
| TurboWarp Unsandboxed Extensions documentation | `https://docs.turbowarp.org/development/extensions/unsandboxed` | Expected global `Scratch` registration path, `Scratch.extensions.unsandboxed` guard, and `Scratch.extensions.register` integration behavior |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Actual extension load path, `getInfo()` block surface, JSON-RPC command dispatch, and cache-backed sensor reporters under the TurboWarp-style VM harness |
| WeisileLink Scratch JSON-RPC server | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | Local Scratch Link compatible endpoint and base64 sensor notification envelope used by the integration harness |

## Phase 2 Step 1 — Sound and Display Blocks

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 4.3 sound/display block definitions; Section 9 sound and display capability matrix; Phase 2 `Sound + display blocks (14 blocks)` task |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Sound/display command naming, display coordinate bounds, JSON-RPC compatibility, and complete scoped implementation rule |
| ev3dev2 sound documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/sound.html` | Official `Sound.play_tone`, `Sound.play_file`, `Sound.beep`, `Sound.set_volume`, and sound process behavior |
| ev3dev2 display documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/display.html` | Official `Display.text_pixels`, `Display.clear`, drawing primitives, image canvas, and `Display.update` behavior |
| WeisileLink validation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/validation.py` | Command allowlist and normalization rules extended for `sound.playFile`, `display.number`, `display.image`, `display.textAt`, and `display.update` |
| EV3 server baseline | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | Existing sound/display dispatch path extended to cover all 14 sound/display blocks |

## Phase 2 Step 2 — System and Data Collection Blocks

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 4.3 system and AI Quest data collection block definitions; Section 7 data-pipeline payload shape; Section 8 AI Quest workflow; Section 9 capability matrix; Phase 2 `System + data collection blocks (14 blocks)` task |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Sensor cache reporter rule, JSON-RPC command compatibility, GitHub/progress workflow, and complete scoped implementation rule |
| ev3dev2 LEDs documentation | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/stable/leds.html` | Official `Leds` status-light adapter and `set_color` behavior for EV3 brick LEDs |
| EV3 server data baseline | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | Existing bounded data collection buffer, 50Hz collection loop, sensor snapshot payloads, and EV3 ack/error envelope extended for auto collect, CSV export, Trainer-unavailable fallback, and system commands |
| WeisileLink validation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/validation.py` | Command allowlist and normalization extended for system LED/stop commands, Trainer upload/export commands, and bounded auto-collection intervals |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Existing Unsandboxed extension, cache-backed reporter pattern, JSON-RPC command dispatch, and TurboWarp registration surface expanded from 48 to all 62 blocks |
| Python CSV standard library | `https://docs.python.org/3/library/csv.html` | Dependency-free CSV export for collected classroom sensor samples |

## Phase 2 Step 3 — Bluetooth Classic Transport Fallback

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 5.2 transport selection; Section 5.5 Bluetooth Classic stdlib transport; Section 16 WiFi-to-Bluetooth degradation and reconnect behavior; Phase 2 Bluetooth fallback task |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Non-negotiable Python stdlib Bluetooth rule, no pybluez, EV3SC standalone ownership, GitHub/progress workflow |
| Python socket documentation | `https://docs.python.org/3/library/socket.html` | `AF_BLUETOOTH`, `SOCK_STREAM`, `BTPROTO_RFCOMM`, and RFCOMM address tuple behavior |
| EV3 server baseline | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | Reused the existing pairing, JSON command, ack envelope, safety shutdown, and 50Hz sensor payload over an RFCOMM JSON-line stream |
| WeisileLink WiFi transport baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/transport/wifi_transport.py` | Reused command validation, ack-future resolution, sensor cache updates, timeout handling, and degradation-state behavior for Bluetooth parity |
| WeisileLink degradation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/runtime/degradation.py` | Reused `TransportKind.BLUETOOTH`, WiFi-first fallback flags, connection state, and sensor freshness cache |

## Phase 2 Step 4 — Sensor Router and WeisileAI Trainer Integration

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 5.4 Sensor Data Router; Section 7.2 Scratch and Trainer payload shapes; Section 8.1 Trainer `sensor_stream` buffering behavior; Section 10.1/10.2 Trainer REST and WebSocket endpoints; Section 10.6 REST envelope; Section 15 local-first privacy; Section 16.2 Trainer degradation; Section 17.2 `trainer_clients` status field |
| Scratch Link Network Protocol | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/NetworkProtocol.md` | Preserved Scratch-facing JSON-RPC notification semantics while moving sensor broadcast into the shared router |
| Scratch VM BT socket | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/io/bt.js` | Preserved official `didReceiveMessage` notification compatibility for Scratch clients |
| EV3 server baseline | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | Reused the EV3 `sensor_update` payload shape, `system.collecting`, `system.collect_label`, `system.collected_points`, motors, sensors, and bounded data semantics |
| WeisileLink observability baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/observability/health.py` | Reused `RuntimeCounters.trainer_clients`, `/api/status` payload generation, and alert-compatible collected point counts |
| WeisileLink degradation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/runtime/degradation.py` | Reused Trainer-unavailable degradation and bounded collected-point state without breaking robot control |
| WeisileAI middleware reference | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/ai-middleware/` | Confirmed there is no existing EV3 Trainer endpoint to port yet; this step keeps EV3 Trainer integration local to EV3SC using the spec-defined WebSocket stream and internal REST contracts |
| Python standard library documentation | `https://docs.python.org/3/library/csv.html` | Dependency-free CSV export for the bounded local Trainer buffer |

## Phase 2 Step 5 — Multi-EV3 Session Management

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 1.3 WiFi multi-device rationale; Section 5.6 WiFi transport; Phase 2 `Multi-EV3 session management`; Section 13.2 `test_multi_ev3` no-cross-contamination requirement; Phase 2 acceptance criterion for 2 simultaneous EV3 bricks |
| Scratch Link Network Protocol | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/NetworkProtocol.md` | Preserved discovery/connect flow and device selection by Scratch Link peripheral identity |
| Scratch VM BT socket | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/io/bt.js` | Preserved Scratch-facing `didDiscoverPeripheral` and `didReceiveMessage` compatibility while adding EV3 session identity |
| WeisileLink WiFi transport baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/transport/wifi_transport.py` | Reused one WiFi transport per EV3 session with independent command validation, ack futures, sensor callback, and degradation state |
| WeisileLink sensor router baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/router/sensor_router.py` | Reused one router and bounded Trainer buffer per EV3 session to isolate Scratch notifications, Trainer streams, collected rows, and REST snapshots |
| WeisileLink observability baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/observability/health.py` | Extended `/api/status` with per-session health while preserving existing top-level health fields |

## Phase 2 Step 6 — Sensor Data Panel UI

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 3.1-3.3 Scratch visual-preservation rules; Section 4.4 `SensorCache`; Section 11.3 sensor data panel layout, width, background, and active-state color; Phase 2 `Sensor data panel UI` task |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Collapsible sensor panel allowed beside the stage, no Scratch visual changes, all sensor reads from `SensorCache`, EV3SC standalone ownership, and GitHub/progress workflow |
| Scratch GUI colors | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/css/colors.css` | Scratch UI text color, white/primary surfaces, border transparency, and active UI color references used to keep the panel visually native |
| Scratch GUI units and typography | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/css/units.css`, `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/css/typography.css` | Scratch spacing, border radius, and `"Helvetica Neue", Helvetica, Arial, sans-serif` font stack |
| Scratch GUI monitor styling | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/components/monitor/monitor.css` | Monitor-style compact rows, borders, rounded meters, and stage-overlay-safe visual language for live values |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Existing `SensorCache`, data collection commands, and no-DOM-load integration boundary extended with the panel model, renderer, and explicit host mounting |

## Phase 2 Step 7 — Connection Modal Polish

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 3.1-3.5 connection flow and strict Scratch visual preservation; Section 5.2 transport selection; Section 11.2 WiFi/Bluetooth connection modal layout; Phase 2 `Connection modal polish (WiFi/BT selection)` task |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Connection modal may be added only when it copies Scratch's hardware modal style; no existing Scratch visual design changes; WiFi and Bluetooth development must be source-backed |
| Scratch GUI connection modal component | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/components/connection-modal/connection-modal.jsx` | Scratch hardware modal structure, phases, header behavior, help/cancel hooks, and modal ID |
| Scratch GUI connection modal styles | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/components/connection-modal/connection-modal.css`, `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/components/modal/modal.css` | Modal width, header/body/footer layout, button radius, purple connection button, green success color, dots, and font stack |
| Scratch official EV3 icon asset | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/lib/libraries/extensions/ev3/ev3-small.svg` | Copied into `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/assets/ev3-small.svg` so EV3SC remains standalone while matching Scratch's EV3 connection visuals |
| WeisileLink transport baselines | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/transport/wifi_transport.py`, `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/transport/bluetooth_transport.py`, `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/transport/selector.py` | Endpoint reconfiguration for modal-submitted `ev3_ip` and `ev3_bt` before reconnecting the selected transport |

## Phase 3 Step 1 — AI Quest Sample Projects

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 8.2 `record -> upload -> train -> export` AI Quest workflow; Section 10 Trainer REST/WebSocket contracts; Section 15 local-first privacy and deletion controls; Phase 3 `AI Quest data collection sample projects` task |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3SC standalone ownership, no Scratch visual-design changes, source-backed EV3/Scratch behavior, complete scoped implementation, GitHub/progress workflow |
| Scratch VM SB3 serializer | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/serialization/sb3.js` | Source-backed `project.json` target/block/extension layout, `extensions` list, and extension opcode prefix behavior used by generated sample project JSON |
| Scratch VM extension metadata docs | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-metadata.js` | Source-backed extension `id`, block `opcode`, argument metadata, and menu constraints used when validating `vsleev3_*` sample opcodes |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Current `getInfo()` block metadata used to validate each sample command opcode and prevent drift from the runnable extension |
| WeisileLink Trainer router baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/router/sensor_router.py` | Current Trainer feature fields, CSV export semantics, and local buffer behavior mirrored by sample workflow plans |

## Phase 3 Preview — Local Frontend/Backend Stack

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 4.4 `SensorCache`; Section 5.4 concurrent Scratch + Trainer routing; Section 7.2 Scratch notification and Trainer stream shapes; Section 8.2 AI Quest record/upload/export workflow; Section 10.1/10.2 Trainer endpoints; Section 11.2/11.3 modal and sensor panel surfaces |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3SC standalone ownership, no Scratch GUI visual changes, source-backed Scratch/EV3 behavior, complete scoped implementation, and GitHub/progress workflow |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Reused the project-owned Unsandboxed extension bundle, `SensorCache`, `WeisileLinkClient`, connection modal, sensor panel, and AI Quest data collection commands in the preview frontend |
| WeisileLink JSON-RPC server baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | Reused the real Scratch-compatible `/scratch/bt` JSON-RPC server, Trainer WebSocket endpoint, sensor routing, and upload/collection command path instead of a mock protocol |
| AI Quest sample package | `/Users/yukii/Desktop/EV3SC/ai-quest-samples/projects/*.json` | Rendered the existing source-backed classroom sample workflows inside the preview page |
| websockets 15 upgrade documentation | `https://websockets.readthedocs.io/en/15.0/howto/upgrade.html` | Confirmed the server connection object exposes the request path as `connection.request.path`, so `ScratchJsonRpcServer` now accepts path metadata from both legacy two-argument handlers and current connection objects |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Phase 3 `Motor PID parameter blocks` task and EV3 capability matrix row for motor PID parameters |
| python-ev3dev2 motor docs | `https://ev3dev-lang.readthedocs.io/projects/python-ev3dev/en/latest/motors.html` | Source-backed `Motor.position_p`, `position_i`, `position_d`, `speed_p`, `speed_i`, and `speed_d` attributes used for the PID set/read implementation |
| ev3dev LEGO Linux motor driver docs | `https://docs.ev3dev.org/projects/lego-linux-drivers/en/ev3dev-jessie/motors.html` | Kernel driver-backed `hold_pid/Kp`, `hold_pid/Ki`, `hold_pid/Kd`, `speed_pid/Kp`, `speed_pid/Ki`, and `speed_pid/Kd` read/write semantics mapped through ev3dev2 properties |

## Phase 3 Step 3 — Trainer Training Pipeline E2E

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 8.2 `record -> upload -> train -> export` workflow, Decision Tree model requirement, 70% accuracy gate, `model_rules.json` export, Section 10 REST envelopes, and Section 15 local-first privacy/deletion controls |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3SC-only ownership, complete scoped implementation, source-backed behavior, no Scratch visual-design changes, GitHub/progress workflow |
| WeisileLink Trainer router baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/router/sensor_router.py` | Existing bounded EV3 Trainer rows, supported feature fields, label limits, and CSV export semantics used as the input contract for local training |
| WeisileAI middleware reference | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/ai-middleware/README.md` | Read-only reference for keeping AI/model work behind server-side contracts and avoiding raw student data or secrets in exported artifacts |
| Python standard library documentation | `https://docs.python.org/3/library/json.html` | Dependency-free deterministic `model_rules.json` serialization for the exported classroom rules model |

## Phase 3 Step 4 — Docker Deployment Packaging

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 13.8 CI/CD package checks, Section 14 deployment flow, service templates, environment variable defaults, rollback/recovery, and release checklist requirements |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3SC-only deployment ownership, no committed secrets, complete scoped implementation, test and GitHub/progress workflow |
| Docker Compose file reference | `https://docs.docker.com/compose/compose-file/` | Source-backed Compose service, env file, port, volume, restart, and healthcheck structure for `deploy/docker-compose.yml` |
| Docker Compose services reference | `https://docs.docker.com/reference/compose-file/services/` | Source-backed `healthcheck` and `depends_on.condition: service_healthy` behavior used by the preview service |
| Dockerfile reference | `https://docs.docker.com/reference/dockerfile/` | Source-backed `FROM`, `COPY`, `USER`, `EXPOSE`, `HEALTHCHECK`, and `CMD` instructions used by the WeisileLink image |
| WeisileLink runtime baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | Existing `ScratchJsonRpcServer`, `ScratchServerConfig`, transport wiring, and Trainer WebSocket runtime used by the packaged `python -m weisile_link` entrypoint |
| Local preview baseline | `/Users/yukii/Desktop/EV3SC/preview/weisile_preview_server.py` | Current localhost preview page and port `3001` behavior exposed by the Compose preview service |

## Phase 3 Step 5 — Teacher Guide and Student Workbooks

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Phase 3 `Teacher guide + student workbooks` task, Section 8.2 AI Quest workflow, Section 13.6/13.7 classroom gates, Section 14 deployment flow, and privacy/safety requirements |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | Classroom reliability, Scratch visual-identity constraints, EV3SC-only documentation ownership, no committed secrets, and progress/GitHub workflow |
| AI Quest sample manifests | `/Users/yukii/Desktop/EV3SC/ai-quest-samples/projects/*.json` | Workbook titles, goals, estimated minutes, hardware ports, labels, Trainer features, 70% accuracy gate, and export artifacts |
| AI Quest sample documentation | `/Users/yukii/Desktop/EV3SC/docs/AI_QUEST_SAMPLE_PROJECTS.md`, `/Users/yukii/Desktop/EV3SC/ai-quest-samples/README.md` | Source-backed `record -> upload -> train -> export` classroom workflow, supported labels/features, privacy bounds, and sample package commands |
| EV3 setup documentation | `/Users/yukii/Desktop/EV3SC/docs/EV3DEV_SETUP.md` | Teacher preflight and recovery guidance for EV3 setup, autostart, verification, and rollback |
| Deployment documentation | `/Users/yukii/Desktop/EV3SC/deploy/README.md` | Teacher-computer startup, localhost-only deployment defaults, pairing token handling, rollback, and emergency stop guidance |
| Trainer pipeline implementation | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/trainer_pipeline.py` | 70% accuracy gate, local-first exported `model_rules.json`, and no raw student data in exported model rules |

## Phase 3 Step 6 — Performance Testing

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Phase 3 `Performance testing (50Hz sustained, 4h session)` task; Section 13.4 sustained performance test; Section 13.6 dropped-update, drift, and memory gates; Section 17.3 runtime alert thresholds |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3SC-only ownership, complete scoped implementation, SensorCache reporter rule, no Scratch visual-design changes, GitHub/progress workflow, and classroom reliability target |
| EV3 server sensor loop | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | Source-backed monotonic `next_tick` 50Hz sensor broadcast model used by the performance harness drift calculations |
| WeisileLink observability baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/observability/health.py` | Existing `sensor_hz`, memory, transport, and collected-point health fields used to align report gates with runtime status |
| WeisileLink Trainer router baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/router/sensor_router.py` | Existing bounded collection buffer and `MAX_COLLECTED_POINTS` behavior covered by the performance documentation |

## Phase 3 Step 7 — Security Review

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Phase 3 `Security review` task; Section 13.6 critical gates; Section 14.4 deployment defaults; Section 15 threat model, transport security, privacy, and physical safety controls |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3SC-only ownership, no committed secrets, complete scoped implementation, no Scratch visual-design changes, and GitHub/progress workflow |
| WeisileLink JSON-RPC server | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | Scratch-compatible path handling, Origin allowlist enforcement, localhost default config, REST clear/export/train routes, and source-backed JSON-RPC command dispatch |
| WeisileLink command validation | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/validation.py` | COMMAND_VALIDATORS allowlist, label limit, motor speed/time clamps, asset filename validation, and PID bounds |
| EV3 firmware server | `/Users/yukii/Desktop/EV3SC/ev3-firmware/vsle_ev3_server.py` | EV3 `auth.pair` handshake, repeated command validation, bounded data collection, motor stop safety, and data.clear handling |
| Trainer pipeline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/trainer_pipeline.py` | Local-first training, no raw rows in exported `model_rules.json`, privacy metadata, and `/api/data/clear` guidance |
| Deployment package | `/Users/yukii/Desktop/EV3SC/deploy/env.example`, `/Users/yukii/Desktop/EV3SC/deploy/docker-compose.yml`, `/Users/yukii/Desktop/EV3SC/deploy/README.md` | Localhost-only published ports, safe checked-in env defaults, omitted pairing token, and teacher-facing Origin/pairing guidance |
| WeisileLink structured logging | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/observability/logging.py` | Token redaction and label truncation evidence for Section 17.1 privacy-safe logs |

## ScratchAI Integration — EV3 Extension Entry

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Requirement that the ScratchAI extension library `EV3` entry loads complete VSLE-EV3, preserves the Scratch UI surface, and selects the EV3 block category after click |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 3.4 allowed Unsandboxed extension URLs, Section 3.5 extension loading flow, and Scratch visual preservation constraints |
| Scratch GUI extension library baseline | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/lib/libraries/extensions/index.jsx` | Existing Scratch extension picker card metadata and icon assets reused while changing only the EV3 target URL/category mapping |
| Scratch GUI extension library container | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-gui/src/containers/extension-library.jsx` | Existing click flow that already calls `vm.extensionManager.loadExtensionURL`, extended to select the loaded VSLE category id |
| Scratch VM extension manager baseline | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-manager.js` | Existing extension registration and primitive preparation path reused for the allowlisted main-thread Unsandboxed loader |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Project-owned complete EV3 block surface loaded behind the ScratchAI `EV3` card |

## ScratchAI Integration — Official EV3 Compatibility

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Requirement that older `.sb3` projects using official Scratch EV3 blocks automatically map to the complete VSLE-EV3 runtime |
| Scratch VM official EV3 extension source | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js` | Source-backed official `ev3` extension id, 11 opcode names, port menu values, timing bounds, and MIDI note-to-frequency formula |
| Scratch VM extension manager baseline | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-manager.js` | Built-in extension loading path for project deserialization of `ev3_*` opcodes |
| Scratch VM SB3 EV3 fixture | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-vm/test/fixtures/load-extensions/confirm-load/ev3-simple-project.sb3` | Existing official EV3 project fixture used to verify old project loading selects the VSLE-backed compatibility extension |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Project-owned VSLE JSON-RPC method names and cache-backed reporter contract mirrored by the VM-safe compatibility wrapper |

## ScratchAI Integration — AI Quest API Contract

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Sections 8-11 define the AI Quest API contract, upload data boundary, model scopes, and cloud/cached/local fallback prediction modes |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 8.2 AI Quest workflow and Section 15 privacy constraints for local-first data handling and provider isolation |
| Local Trainer pipeline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/trainer_pipeline.py` | Source-backed local decision tree training, accuracy gate, and model-rule export behavior reused by the AI Quest mock provider |
| Sensor router buffer | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/router/sensor_router.py` | Existing bounded EV3 training buffer extended with raw EV3 time-series frames for contract-level upload sanitization |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Existing EV3 data collection blocks extended with AI Quest contract commands and synchronous prediction/status reporters |

## ScratchAI Integration — AI Quest Provider Abstraction

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Sections 8, 9, 11, and 13 define the provider abstraction, server-side credentials, allowed raw time-series upload, cloud/cached/local prediction, and provider-unavailable error states |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 10.6 REST envelope and Section 15 privacy requirements for keeping provider credentials server-side and mapping retryable cloud failures safely |
| AI Quest contract baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/ai_quest_contract.py` | Existing contract-level normalization and cloud/cached/local fallback behavior extended to support configured providers and cloud-only model references |
| Local Trainer pipeline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/trainer_pipeline.py` | Source-backed local decision tree behavior reused by the deterministic mock provider and cached model export |
| Python standard library documentation | `https://docs.python.org/3/library/urllib.request.html` | Dependency-free HTTPS JSON request implementation for the WeisileAI provider shell |

## ScratchAI Integration — AI Quest Raw Time-Series Governance

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Section 8 requires dataset/model deletion and audit metadata; Section 9 allows raw EV3 time-series upload but requires consent, progress status, retry/error reporting, deletion, and audit logs; Section 13 defines student-visible upload/cloud error states |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 10.6 REST envelope and Section 15 privacy controls for explicit export/delete, student-data minimization, and teacher-facing clear/delete tooling |
| AI Quest provider abstraction | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/ai_quest_providers.py` | Provider delete methods, retryable provider failure metadata, and credential redaction reused by contract-level governance |
| Scratch-compatible JSON-RPC server | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | JSON-RPC 2.0 and REST envelope mapping for upload status, audit, dataset deletion, model deletion, and retryable cloud errors |

## ScratchAI Integration — AI Quest Model Scope And Sharing

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Sections 8-12 define model publish/list/select/delete, project/class/course scopes, cached/local prediction, and pure `.sb3` AI Quest metadata stripping |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | AI Quest workflow and privacy requirements for safe model references, local cached models, and export/delete boundaries |
| AI Quest contract baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/ai_quest_contract.py` | Existing normalized dataset/training/prediction state extended with safe model catalog, publish/withdraw behavior, cache controls, prediction-mode reporting, and `.sb3` metadata stripping |
| Scratch-compatible JSON-RPC server | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/json_rpc_server.py` | JSON-RPC 2.0 and REST route mapping for shared model operations and prediction-mode queries |
| VSLE-EV3 extension baseline | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Existing EV3 category AI Quest block surface extended with publish/list/cache/use-cache/clear-cache controls and synchronous model availability reporters |

## ScratchAI Integration — Unified Local Preview Stack

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Development sequence item 10 requires a unified local preview stack for ScratchAI editor, middleware, asset worker, WeisileLink, EV3 simulation, and AI Quest cloud mock |
| ScratchAI editor preview startup | `/Users/yukii/Desktop/EV3SC/scripts/start_scratchai_preview.py` | Existing EV3SC-owned ScratchAI editor command and prerequisite checks reused by the unified stack |
| ScratchAI service servers | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/ai-middleware/src/server.js`, `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/asset-worker/src/server.js`, `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/preview-server/src/server.js` | Local service start commands, ports, health/status routes, and localhost-only preview behavior |
| VSLE preview backend | `/Users/yukii/Desktop/EV3SC/preview/weisile_preview_server.py` | Existing simulated EV3 transport, 50Hz-style sensor stream, Scratch Link compatible WebSocket endpoint, Trainer WebSocket endpoint, and mock AI Quest provider wiring |
| VSLE-EV3 extension bundle | `/Users/yukii/Desktop/EV3SC/vsle-ev3-extension/index.js` | Unsandboxed extension bundle served locally for the ScratchAI `EV3` extension-library entry |
| Python standard library documentation | `https://docs.python.org/3/library/urllib.request.html` | Proxy-free local HTTP health checks for `scripts/verify_unified_preview.py`, keeping localhost verification independent from developer machine proxy settings |

## ScratchAI Integration — Final Automated Acceptance

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| ScratchAI VSLE-EV3 integration design | `/Users/yukii/Desktop/EV3SC/docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md` | Required final product behavior: ScratchAI `EV3` tile loads complete VSLE-EV3, official EV3 `.sb3` projects remain compatible, AI Quest supports cloud/cached/localFallback prediction, and raw EV3 data governance remains in the server-side API |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 13 testing requirements, Section 13.7 manual classroom acceptance, Section 14.6 release checklist, and the Development Progress Log next step for ScratchAI-centered final acceptance |
| Final acceptance verifier | `/Users/yukii/Desktop/EV3SC/scripts/verify_scratchai_final_acceptance.py` | Aggregates the existing EV3SC-owned automated gates for unified preview runtime, extension-library routing, legacy EV3 compatibility, VSLE-EV3 block surface, AI Quest provider/fallback behavior, deployment packaging, EV3 autostart, security, and 50Hz performance |
| Final acceptance report | `/Users/yukii/Desktop/EV3SC/docs/scratchai/FINAL_ACCEPTANCE.md`, `/Users/yukii/Desktop/EV3SC/docs/scratchai/final_acceptance_report.json` | Records automated acceptance evidence and explicitly keeps classroom approval blocked until real EV3 classroom rehearsal evidence is attached |

## ScratchAI Integration — Real EV3 Classroom Rehearsal

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 13.7 manual classroom acceptance requires a 30-device rehearsal, at least 10 real EV3 bricks when hardware is available, a 45-minute student workflow, disconnect/reconnect records, dropped-update evidence, memory-growth evidence, and no code changes during class |
| ScratchAI browser rehearsal evidence | `/Users/yukii/Desktop/EV3SC/docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `/Users/yukii/Desktop/EV3SC/docs/classroom/evidence/scratchai_unified_stack_ai_helper.png`, `/Users/yukii/Desktop/EV3SC/docs/classroom/evidence/scratchai_unified_stack_browser_state.json` | Records the Section 13.7 ScratchAI unified-stack browser gate, including the stale static `8601` preview that was avoided and the verified `8611` unified stack where the localized AI Thinking Helper is visible |
| ScratchAI port parity and asset draft audit | `/Users/yukii/Desktop/EV3SC/docs/scratchai/SCRATCHAI_PORT_PARITY_AUDIT.md`, `/Users/yukii/Desktop/EV3SC/docs/classroom/evidence/scratchai_asset_draft_generated_20260525.png` | Records the comparison between the EV3SC-owned ScratchAI port and the read-only ScratchAI reference, the fixed preview/runtime gaps for asset generation, and browser evidence that the AI assistant generated a local sprite draft |
| ScratchAI preview verifier | `/Users/yukii/Desktop/EV3SC/scripts/verify_scratchai_preview.py`, `/Users/yukii/Desktop/EV3SC/scripts/verify_unified_preview.py` | Verifies the served ScratchAI editor bundle enables the AI Thinking Helper and that the configured VSLE-EV3 extension URL is browser-reachable instead of hidden behind a browser-time `process` guard |
| Section 13.7 simulated preview runner | `/Users/yukii/Desktop/EV3SC/scripts/run_section13_7_preview_rehearsal.py`, `/Users/yukii/Desktop/EV3SC/docs/classroom/SECTION_13_7_PREVIEW_REHEARSAL.md`, `/Users/yukii/Desktop/EV3SC/docs/classroom/evidence/section13_7_preview_rehearsal_20260525.json` | Captures simulated-preview evidence for the 45-minute sensor freshness run, AI Quest collection/training/export flow, 30 connected simulated EV3 devices, disconnect recovery, dropped-update estimate, and memory growth while keeping physical classroom approval blocked |
| Real EV3 rehearsal runner | `/Users/yukii/Desktop/EV3SC/scripts/run_real_ev3_rehearsal.py` | Builds the Section 13.7 gate plan, writes a real-hardware evidence template, captures one-brick smoke evidence through WeisileLink when explicitly confirmed as real EV3 hardware, evaluates evidence, and keeps classroom approval blocked until all required real EV3 gates pass |
| Real EV3 smoke readiness evidence | `/Users/yukii/Desktop/EV3SC/docs/classroom/REAL_EV3_SMOKE_READINESS.md`, `/Users/yukii/Desktop/EV3SC/docs/classroom/real_ev3_smoke_readiness.json` | Non-invasive TCP readiness evidence for ordered physical EV3 endpoint candidates and the local WeisileLink endpoint before the operator may run a confirmed one-brick smoke capture |
| Real EV3 smoke handoff | `/Users/yukii/Desktop/EV3SC/docs/classroom/REAL_EV3_SMOKE_HANDOFF.md` | Operator-facing physical EV3 preflight and smoke-capture command sequence, including EV3 endpoint checks, WeisileLink real WiFi transport startup, explicit hardware confirmation warning, and the Section 13.7 follow-up command |
| Real EV3 rehearsal evidence report | `/Users/yukii/Desktop/EV3SC/docs/classroom/REAL_EV3_REHEARSAL.md`, `/Users/yukii/Desktop/EV3SC/docs/classroom/real_ev3_rehearsal_evidence.template.json`, `/Users/yukii/Desktop/EV3SC/docs/classroom/real_ev3_rehearsal_pending_report.json` | Records the current blocked hardware gate and the JSON fields QA must fill from real ScratchAI + EV3 + AI Quest rehearsal evidence |

## Rules

- Do not invent Scratch Link, Scratch VM, EV3, ev3dev, or ev3dev2 behavior from
  memory.
- Add a row here whenever code ports, adapts, or depends on upstream behavior.
- Keep local paths inside `/Users/yukii/Desktop/EV3SC/` for project-owned files;
  external source paths are read-only references unless ported into this repo.
