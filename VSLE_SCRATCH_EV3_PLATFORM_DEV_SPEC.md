# VSLE Scratch-EV3 Unified Platform
## Technical Development Specification v1.0

> **Project Codename**: VSLE-SEP (Scratch-EV3 Platform)
> **Document Type**: International Engineering Specification
> **Standard Reference**: Google Engineering Practices · IEEE 730-2014 · ISO/IEC 25010
> **Authors**: WeisileEDU Engineering Team
> **Date**: 2026-05-22
> **Status**: CONDITIONALLY APPROVED FOR PHASE 1 DEVELOPMENT
> **Deployment Gate**: NOT APPROVED FOR CLASSROOM DEPLOYMENT until all Critical remediation items in Section 15-17 and Section 13.6 are verified.

### Audit Remediation Notice

This v1.0 specification has been corrected against `vsle_document_audit_final.md`
(2026-05-22). The audit found that the core architecture is sound, but security,
error handling, operations, and test governance were not complete enough for a
7-15 student classroom deployment. This document now treats those areas as
blocking requirements rather than optional follow-up work.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Layer 1 — Scratch Frontend (TurboWarp)](#3-layer-1--scratch-frontend-turbowarp)
4. [Layer 2 — VSLE-EV3 Extension](#4-layer-2--vsle-ev3-extension)
5. [Layer 3 — WeisileLink Bridge Service](#5-layer-3-weisilelink-bridge-service)
6. [Layer 4 — EV3 Hardware Abstraction](#6-layer-4--ev3-hardware-abstraction)
7. [Real-Time Data Pipeline](#7-real-time-data-pipeline)
8. [WeisileAI Trainer Integration](#8-weisileai-trainer-integration)
9. [EV3 Full Capability Matrix](#9-ev3-full-capability-matrix)
10. [API Contracts](#10-api-contracts)
11. [UI/UX Requirements](#11-uiux-requirements)
12. [Development Phases](#12-development-phases)
13. [Testing Requirements](#13-testing-requirements)
14. [Deployment](#14-deployment)
15. [Security, Privacy, and Safety](#15-security-privacy-and-safety)
16. [Error Handling and Degradation](#16-error-handling-and-degradation)
17. [Operations and Monitoring](#17-operations-and-monitoring)
18. [Compatibility Matrix](#18-compatibility-matrix)
19. [Licensing and Open Source Compliance](#19-licensing-and-open-source-compliance)
20. [Document Governance](#20-document-governance)

---

## 1. Executive Summary

### 1.1 Problem Statement

The official Scratch Link + EV3 integration has five fundamental limitations confirmed by the feasibility report (`scratch_ev3_feasibility_report.docx`):

| Limitation | Impact | Our Solution |
|-----------|--------|--------------|
| Only 11 EV3 blocks (sensor coverage <40%) | Severely restricts curriculum | 64 blocks covering all EV3 capabilities |
| Scratch Link requires native OS installation | Deployment friction in classrooms | WeisileLink: pure Python, zero-install server |
| No continuous sensor data streaming (Mailbox is unidirectional) | Cannot support AI data collection | 50Hz WebSocket push pipeline |
| Bluetooth Classic only, no multi-device | 1 EV3 per computer maximum | WiFi transport: 30+ EV3 simultaneous |
| EV3 stopped (2021), official software dead | Hardware investment wasted | ev3dev gives EV3 a second life |

### 1.2 Solution Architecture Summary

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1: BROWSER (Scratch Interface — Visually Unchanged)        │
│  TurboWarp fork + VSLE-EV3 Unsandboxed Extension                 │
│  + WeisileAI Trainer panel (side panel, Scratch-native look)      │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 2: VSLE-EV3 EXTENSION (JavaScript, TurboWarp)             │
│  64 blocks · Full sensor coverage · 50Hz realtime cache           │
│  AI Quest data collection blocks · WeisileLink WebSocket client   │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 3: WeisileLink BRIDGE SERVICE (Python asyncio)             │
│  JSON-RPC 2.0 compatible · Dual transport (BT Classic + WiFi)     │
│  Sensor data router → Scratch + WeisileAI Trainer simultaneously  │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 4: EV3 HARDWARE ABSTRACTION (Python, ev3dev)              │
│  ev3dev2 library · sysfs interface · 50Hz sensor loop             │
│  WebSocket server on EV3 (WiFi transport)                         │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Engineering Decisions

| Decision | Choice | Rationale |
|---------|--------|-----------|
| Scratch base | TurboWarp (MIT) | Unsandboxed Extension support, zero latency, active maintenance |
| Extension type | Unsandboxed Extension | Eliminates Worker postMessage overhead; required for 50Hz sensor polling |
| EV3 OS | ev3dev (GPL-2.0) | Only option supporting Python WebSocket server on EV3 hardware |
| Bridge protocol | JSON-RPC 2.0 over WebSocket | Scratch Link compatible; enables drop-in replacement |
| Full-mode BT transport | `vsle-bluetooth` JSON-line transport over verified Linux RFCOMM or project-owned native byte-stream adapters | No pybluez dependency; Mac browser full VSLE Bluetooth smoke is the first no-Windows functional test path, while signed artifact evidence is reserved for Production Release |
| WiFi transport | asyncio WebSocket (WiFi dongle) | Enables multi-EV3, 50Hz streaming, eliminates Bluetooth |
| WeisileLink Desktop | Internal Test Release can be unsigned; Production Release requires signed macOS/Windows local app with bundled runtime | Makes internal validation possible without signing credentials while preserving reliable external distribution requirements |
| Official firmware compatibility | Separate Bluetooth Classic mode using EV3 Direct Commands | Fast no-ev3dev trial path for basic non-AI projects; not equivalent to full VSLE mode |
| UI preservation | Strict Scratch visual identity | Zero learning curve for existing Scratch users |
| Data pipeline | WebSocket broadcast router | Single EV3 data stream → multiple consumers simultaneously |

### 1.4 Alternatives Considered

| Alternative | Rejected / Deferred Reason |
|-------------|----------------------------|
| Official Scratch Link only | Limited EV3 block coverage, Bluetooth-only, no 50Hz sensor stream |
| Sandboxed Scratch extension | Worker/postMessage latency is not suitable for motor control |
| Browser Web Bluetooth direct to EV3 | Browser support and EV3 protocol coverage are insufficient for classrooms |
| Running ML on EV3 | EV3 CPU/RAM constraints make classroom AI training unreliable |
| pybluez Bluetooth stack | Abandoned dependency with macOS/Python compatibility risk |
| Cloud-only data collection | Adds privacy and classroom connectivity risks; local-first is required |

---

## 2. System Architecture

### 2.1 Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER LAYER                                                       │
│                                                                      │
│  ┌──────────────────────────────────┐  ┌───────────────────────┐   │
│  │     TurboWarp Scratch Editor      │  │  WeisileAI Trainer     │   │
│  │  (Visually identical to Scratch)  │  │  (Side panel / tab)    │   │
│  │                                  │  │                        │   │
│  │  ┌────────────────────────────┐  │  │  Real-time sensor      │   │
│  │  │ VSLE-EV3 Extension (JS)    │  │  │  charts + data labels  │   │
│  │  │ Unsandboxed, zero-latency  │  │  │  + training pipeline   │   │
│  │  │ 64 EV3 blocks              │◄─┼──┼─►                      │   │
│  │  │ Sensor cache @50Hz         │  │  │  ws://localhost:8766   │   │
│  │  └────────────┬───────────────┘  │  └───────────────────────┘   │
│  └───────────────┼──────────────────┘                               │
│                  │ ws://localhost:20111/scratch/bt                   │
├──────────────────┼──────────────────────────────────────────────────┤
│  BRIDGE LAYER    │                                                   │
│                  ▼                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  WeisileLink (Python asyncio)                                  │  │
│  │  ┌──────────────────────┐  ┌────────────────────────────────┐ │  │
│  │  │ Scratch JSON-RPC 2.0 │  │ Sensor Data Router             │ │  │
│  │  │ Compatible Server    │  │ EV3 data → Scratch + Trainer  │ │  │
│  │  │ Port: 20111          │  │ simultaneously                 │ │  │
│  │  └──────────┬───────────┘  └────────────────────────────────┘ │  │
│  │             │  Transport Abstraction Layer                      │  │
│  │     ┌───────┴────────┐                                         │  │
│  │     ▼                ▼                                          │  │
│  │  BT Classic       WiFi WebSocket                                │  │
│  │  (socket stdlib)  (port 8765)                                   │  │
│  └──────────┬───────────┬─────────────────────────────────────────┘  │
│             │           │                                             │
├─────────────┼───────────┼─────────────────────────────────────────── │
│  HARDWARE   │           │                                             │
│  LAYER      ▼           ▼                                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  EV3 Brick (ev3dev Linux)                                     │   │
│  │                                                               │   │
│  │  vsle_ev3_server.py                                           │   │
│  │  ├─ asyncio WebSocket server (port 8765, WiFi)               │   │
│  │  ├─ 50Hz sensor polling loop                                  │   │
│  │  ├─ ev3dev2 motor/sensor API                                  │   │
│  │  └─ sysfs direct access (fallback)                            │   │
│  │                                                               │   │
│  │  SENSORS: Color · Ultrasonic · Gyro · Touch · IR · Temp      │   │
│  │  MOTORS:  A · B · C · D (LargeMotor / MediumMotor)           │   │
│  │  I/O:     Speaker · LCD Display · Buttons · LED               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Repository Structure

```
vsle-scratch-ev3/                          ← Project root
├── CLAUDE.md                              ← AI assistant instructions
├── VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md ← This document
├── README.md
│
├── packages/
│   ├── scratch-editor/                    ← TurboWarp fork (git submodule)
│   │   └── packages/
│   │       ├── scratch-vm/
│   │       │   └── src/extensions/
│   │       │       └── scratch3_ev3/
│   │       │           └── index.js       ← REPLACE with vsle-ev3 extension
│   │       ├── scratch-gui/               ← UI: DO NOT change visual design
│   │       └── scratch-blocks/
│   │
│   ├── vsle-ev3-extension/                ← NEW: Full EV3 extension
│   │   ├── src/
│   │   │   ├── index.js                   ← Extension entry point
│   │   │   ├── blocks/
│   │   │   │   ├── motors.js              ← All motor blocks
│   │   │   │   ├── sensors.js             ← All sensor blocks
│   │   │   │   ├── sound.js               ← Sound/tone blocks
│   │   │   │   ├── display.js             ← LCD display blocks
│   │   │   │   └── data_collection.js     ← AI Quest data blocks
│   │   │   ├── protocol/
│   │   │   │   ├── json_rpc_client.js     ← WeisileLink client
│   │   │   │   └── sensor_cache.js        ← 50Hz sensor state cache
│   │   │   └── ui/
│   │   │       ├── connection_modal.jsx   ← Scratch-style connection UI
│   │   │       └── data_panel.jsx         ← Embedded data panel
│   │   ├── assets/
│   │   │   ├── ev3-block-icon.svg
│   │   │   └── ev3-menu-icon.svg
│   │   └── package.json
│   │
│   ├── weisile-link/                      ← NEW: Bridge service
│   │   ├── weisile_link.py                ← Main entry point
│   │   ├── transport/
│   │   │   ├── bluetooth_transport.py     ← BT Classic (socket stdlib)
│   │   │   └── wifi_transport.py          ← WiFi WebSocket transport
│   │   ├── protocol/
│   │   │   ├── json_rpc_server.py         ← Scratch-compatible JSON-RPC
│   │   │   └── ev3_direct_command.py      ← EV3 bytecode builder
│   │   ├── router/
│   │   │   └── sensor_router.py           ← Data broadcast to consumers
│   │   ├── requirements.txt
│   │   └── tests/
│   │
│   └── weisileai-trainer/                 ← WeisileAI Trainer (existing)
│       └── (existing files, add EV3 data source)
│
├── ev3-firmware/                          ← Code deployed to EV3
│   ├── vsle_ev3_server.py                 ← Main server on EV3
│   ├── sensors/
│   │   ├── color_sensor.py
│   │   ├── ultrasonic_sensor.py
│   │   ├── gyro_sensor.py
│   │   ├── touch_sensor.py
│   │   └── ir_sensor.py
│   ├── motors/
│   │   └── motor_controller.py
│   ├── io/
│   │   ├── sound_controller.py
│   │   └── display_controller.py
│   ├── setup/
│   │   ├── install.sh                     ← One-command EV3 setup
│   │   └── autostart.service              ← systemd auto-start
│   └── README_EV3_SETUP.md
│
├── deploy/
│   ├── docker-compose.yml                 ← Dev environment
│   ├── weisile-link.service               ← systemd service file
│   └── nginx.conf                         ← Production reverse proxy
│
└── docs/
    ├── ARCHITECTURE.md
    ├── EV3_BLOCK_REFERENCE.md
    └── SENSOR_DATA_FORMAT.md
```

---

## 3. Layer 1 — Scratch Frontend (TurboWarp)

### 3.1 Guiding Principle: Strict Visual Preservation

> **NON-NEGOTIABLE RULE**: The Scratch interface MUST look and feel identical to standard Scratch 3.0. Students and teachers who know Scratch should experience zero learning curve. All new EV3 and AI features are additive — they appear as extensions, not UI modifications.

### 3.2 What MUST NOT Change

- Menu bar layout and icons
- Block palette visual design (colors, shapes, fonts)
- Stage dimensions and aspect ratio
- Sprite/backdrop/sound panel layout
- Green flag / stop button behavior
- Costumes and sounds editors
- File save/load behavior
- All existing block categories appearance

### 3.3 What CAN Be Added

- **Extension library**: New "唯思乐 EV3" entry in the extension picker (following exact Scratch design patterns)
- **Connection modal**: Standard Scratch hardware connection UI pattern (copying micro:bit / EV3 modal design exactly)
- **Sensor data panel**: Collapsible side panel that matches Scratch's design language (same fonts, colors, border radius)
- **EV3 block category**: New category in palette — LEGO EV3 red (#E6001F) following Scratch color conventions

### 3.4 TurboWarp Configuration

```javascript
// turbowarp-config.js
// Enable Unsandboxed Extension for VSLE-EV3
// This allows zero-latency block execution required for motor control

module.exports = {
    allowedExtensions: [
        'http://localhost:8000/vsle-ev3-extension/index.js', // default dev host
        'http://localhost:3001/vsle-ev3-extension/index.js', // allowed only when dev server uses 3001
        'https://platform.vsle.cn/extensions/ev3/index.js'   // prod
    ],
    unsandboxedExtensions: true,  // REQUIRED for EV3 real-time control
    turboMode: false,              // Don't force turbo — preserve Scratch behavior
    interpolation: false
};
```

**Whitelist rule**: the development server host MUST be present in
`allowedExtensions` before loading the Unsandboxed Extension. Use
`localhost:8000` as the default documented dev host. `localhost:3001` is
acceptable only when the TurboWarp fork is configured to allow that exact URL.

### 3.5 Extension Loading Flow

```
Student clicks "Extensions" button (existing Scratch UI)
    → Extension picker shows "唯思乐 EV3" card
    → Student clicks card
    → VSLE-EV3 Extension loads as Unsandboxed
    → EV3 blocks appear in block palette
    → Connection modal appears (standard Scratch modal design)
    → Student confirms EV3 IP address or selects Bluetooth
    → WebSocket connects to WeisileLink
    → Sensor cache starts populating at 50Hz
    → Blocks become active
```

---

## 4. Layer 2 — VSLE-EV3 Extension

### 4.1 Architecture Overview

```javascript
// vsle-ev3-extension/src/index.js (Unsandboxed TurboWarp Extension)

class VsleEV3Extension {
    constructor(runtime) {
        this.runtime = runtime;
        this.link = new WeisleLinkClient();     // WebSocket to WeisileLink
        this.sensorCache = new SensorCache();   // 50Hz sensor state store
        this.dataCollector = new DataCollector(); // AI Quest data pipeline
        this._initConnection();
    }
}
```

### 4.2 Block Categories

The extension registers **6 block categories**:

| Category | Color | Block Count | Description |
|---------|-------|-------------|-------------|
| 🔴 电机控制 | #E6001F | 16 blocks | All motor movement, position, sync, PID |
| 🟠 传感器读取 | #FF6680 | 20 blocks | All sensors, all modes, all ports |
| 🟡 声音输出 | #FFAB19 | 6 blocks | Tone, play file, volume |
| 🟢 显示屏 | #4CBF56 | 8 blocks | LCD text, image, clear |
| 🔵 系统控制 | #4C97FF | 6 blocks | LED, buttons, battery, stop |
| 🟣 数据采集 | #855CD6 | 8 blocks | AI Quest collection pipeline |

**Total: 64 blocks** (vs 11 in original scratch3_ev3)

### 4.3 Complete Block Specification

#### Category 1: 电机控制 (Motor Control)

```javascript
// 16 blocks — covers FULL ev3dev tacho-motor capability

{ opcode: 'motorRunForever',
  text: '电机 [PORT] 以 [SPEED] % 速度持续运行',
  blockType: 'command',
  arguments: {
    PORT: { type: 'string', menu: 'motorPorts', defaultValue: 'A' },
    SPEED: { type: 'number', defaultValue: 50 }
  }
},
{ opcode: 'motorRunTimed',
  text: '电机 [PORT] 以 [SPEED] % 速度运行 [TIME] 秒',
  blockType: 'command'
},
{ opcode: 'motorRunToAbsPos',
  text: '电机 [PORT] 运行到绝对位置 [DEGREES] 度',  // NEW vs original
  blockType: 'command'
},
{ opcode: 'motorRunToRelPos',
  text: '电机 [PORT] 旋转 [DEGREES] 度',            // NEW vs original
  blockType: 'command'
},
{ opcode: 'motorStop',
  text: '停止电机 [PORT]',
  blockType: 'command'
},
{ opcode: 'motorStopAll',
  text: '停止所有电机',
  blockType: 'command'
},
{ opcode: 'motorSetSpeed',
  text: '设置电机 [PORT] 速度为 [SPEED] %',         // NEW
  blockType: 'command'
},
{ opcode: 'motorSyncRun',
  text: '同步运行电机 [PORT_L] 和 [PORT_R] 速度 [SPEED] 时间 [TIME] 秒',  // NEW
  blockType: 'command'
},
{ opcode: 'motorSyncTurn',
  text: '同步电机 [PORT_L] [PORT_R] 转向 [TURN] 速度 [SPEED]',  // NEW
  blockType: 'command'
},
{ opcode: 'motorResetPosition',
  text: '重置电机 [PORT] 位置计数',                  // NEW
  blockType: 'command'
},
{ opcode: 'motorSetPID',
  text: '设置电机 [PORT] [MODE] PID [TERM] 为 [VALUE]', // NEW Phase 3
  blockType: 'command'
},
{ opcode: 'getMotorPosition',
  text: '电机 [PORT] 当前位置 (度)',                  // NEW
  blockType: 'reporter'
},
{ opcode: 'getMotorSpeed',
  text: '电机 [PORT] 当前速度 (%)',                   // NEW
  blockType: 'reporter'
},
{ opcode: 'getMotorPID',
  text: '电机 [PORT] [MODE] PID [TERM]',              // NEW Phase 3
  blockType: 'reporter'
},
{ opcode: 'waitMotorStopped',
  text: '等待电机 [PORT] 停止',                       // NEW
  blockType: 'command'
},
{ opcode: 'isMotorRunning',
  text: '电机 [PORT] 正在运行?',
  blockType: 'Boolean'
}
```

#### Category 2: 传感器读取 (Sensor Reading)

```javascript
// 20 blocks — covers ALL sensor types and ALL modes

// ── Color Sensor ──────────────────────────────────────────────────
{ opcode: 'getColorSensorColor',
  text: '颜色传感器 [PORT] 识别颜色',                 // Returns: 1-8 color ID
  blockType: 'reporter'
},
{ opcode: 'getColorSensorReflected',
  text: '颜色传感器 [PORT] 反射光强度',               // Returns: 0-100
  blockType: 'reporter'
},
{ opcode: 'getColorSensorAmbient',
  text: '颜色传感器 [PORT] 环境光强度',               // NEW: ambient mode
  blockType: 'reporter'
},
{ opcode: 'getColorSensorRGB',
  text: '颜色传感器 [PORT] RGB值 [CHANNEL]',          // NEW: R/G/B individual
  blockType: 'reporter'
},
{ opcode: 'isColor',
  text: '颜色传感器 [PORT] 检测到 [COLOR]?',
  blockType: 'Boolean'
},

// ── Ultrasonic Sensor ─────────────────────────────────────────────
{ opcode: 'getUltrasonicDistance',
  text: '超声波传感器 [PORT] 距离 (厘米)',
  blockType: 'reporter'
},
{ opcode: 'getUltrasonicDistanceInch',
  text: '超声波传感器 [PORT] 距离 (英寸)',             // NEW
  blockType: 'reporter'
},
{ opcode: 'isUltrasonicNear',
  text: '超声波传感器 [PORT] 距离小于 [DISTANCE] 厘米?',
  blockType: 'Boolean'
},

// ── Gyro Sensor ───────────────────────────────────────────────────
{ opcode: 'getGyroAngle',
  text: '陀螺仪传感器 [PORT] 角度',                   // NEW (not in original)
  blockType: 'reporter'
},
{ opcode: 'getGyroRate',
  text: '陀螺仪传感器 [PORT] 角速度 (°/s)',           // NEW
  blockType: 'reporter'
},
{ opcode: 'resetGyro',
  text: '重置陀螺仪传感器 [PORT]',                    // NEW
  blockType: 'command'
},

// ── Touch Sensor ──────────────────────────────────────────────────
{ opcode: 'getTouchPressed',
  text: '触碰传感器 [PORT] 被按下?',
  blockType: 'Boolean'
},
{ opcode: 'waitTouchPress',
  text: '等待触碰传感器 [PORT] 被按下',               // NEW
  blockType: 'command'
},
{ opcode: 'waitTouchRelease',
  text: '等待触碰传感器 [PORT] 松开',                 // NEW
  blockType: 'command'
},

// ── IR Sensor ─────────────────────────────────────────────────────
{ opcode: 'getIRDistance',
  text: '红外传感器 [PORT] 距离',                     // NEW
  blockType: 'reporter'
},
{ opcode: 'getIRBeaconHeading',
  text: '红外传感器 [PORT] 信标方向 (频道 [CHANNEL])',// NEW
  blockType: 'reporter'
},
{ opcode: 'getIRBeaconDistance',
  text: '红外传感器 [PORT] 信标距离 (频道 [CHANNEL])',// NEW
  blockType: 'reporter'
},
{ opcode: 'getIRRemoteButton',
  text: '红外遥控器 [PORT] 频道 [CHANNEL] 按钮',     // NEW
  blockType: 'reporter'
},

// ── EV3 Buttons ───────────────────────────────────────────────────
{ opcode: 'isBrickButtonPressed',
  text: 'EV3砖块 [BUTTON] 键被按下?',               // NEW
  blockType: 'Boolean'
},
{ opcode: 'getBatteryLevel',
  text: 'EV3电池电量 (%)',                          // NEW
  blockType: 'reporter'
}
```

#### Category 3: 声音输出 (Sound)

```javascript
// 6 blocks

{ opcode: 'playTone',
  text: '播放音调 [FREQ] Hz 持续 [DURATION] 秒',
  blockType: 'command'
},
{ opcode: 'playToneAndWait',
  text: '播放音调 [FREQ] Hz 持续 [DURATION] 秒 并等待',  // NEW
  blockType: 'command'
},
{ opcode: 'playSoundFile',
  text: '播放声音文件 [FILE]',                           // NEW
  blockType: 'command'
},
{ opcode: 'setVolume',
  text: '设置音量为 [VOLUME] %',                         // NEW
  blockType: 'command'
},
{ opcode: 'beep',
  text: '发出哔声',
  blockType: 'command'
},
{ opcode: 'stopSound',
  text: '停止声音',
  blockType: 'command'
}
```

#### Category 4: 显示屏 (Display)

```javascript
// 8 blocks — EV3 LCD display control

{ opcode: 'displayText',
  text: '在第 [LINE] 行显示 [TEXT]',
  blockType: 'command'
},
{ opcode: 'displayNumber',
  text: '在第 [LINE] 行显示数字 [NUMBER]',
  blockType: 'command'
},
{ opcode: 'displayClear',
  text: '清空显示屏',
  blockType: 'command'
},
{ opcode: 'displayImage',
  text: '显示图案 [IMAGE]',
  blockType: 'command'
},
{ opcode: 'displayTextAt',
  text: '在位置 X=[X] Y=[Y] 显示 [TEXT]',             // NEW: precise position
  blockType: 'command'
},
{ opcode: 'drawLine',
  text: '从 [X1],[Y1] 到 [X2],[Y2] 画线',            // NEW
  blockType: 'command'
},
{ opcode: 'drawCircle',
  text: '在 [X],[Y] 画圆形 半径=[R]',                 // NEW
  blockType: 'command'
},
{ opcode: 'displayUpdate',
  text: '刷新显示屏',
  blockType: 'command'
}
```

#### Category 5: 系统控制 (System)

```javascript
// 6 blocks

{ opcode: 'setStatusLight',
  text: '设置状态灯为 [COLOR]',
  blockType: 'command'
},
{ opcode: 'statusLightOff',
  text: '关闭状态灯',
  blockType: 'command'
},
{ opcode: 'waitMilliseconds',
  text: '等待 [MS] 毫秒',                              // NEW: millisecond precision
  blockType: 'command'
},
{ opcode: 'stopAllEV3',
  text: '停止所有EV3功能',
  blockType: 'command'
},
{ opcode: 'isConnected',
  text: 'EV3已连接?',
  blockType: 'Boolean'
},
{ opcode: 'getBatteryVoltage',
  text: 'EV3电池电压 (V)',
  blockType: 'reporter'
}
```

#### Category 6: 数据采集 (AI Quest Data Collection)

```javascript
// 8 blocks — AI Quest pipeline integration

{ opcode: 'startDataCollection',
  text: '开始采集数据 标签=[LABEL]',
  blockType: 'command',
  arguments: {
    LABEL: { type: 'string', defaultValue: '类别A' }
  }
},
{ opcode: 'stopDataCollection',
  text: '停止数据采集',
  blockType: 'command'
},
{ opcode: 'addDataPoint',
  text: '手动记录一条数据 标签=[LABEL]',              // Single-shot capture
  blockType: 'command'
},
{ opcode: 'uploadToTrainer',
  text: '上传数据到训练工场',
  blockType: 'command'
},
{ opcode: 'clearCollectedData',
  text: '清空已采集数据',
  blockType: 'command'
},
{ opcode: 'getDataCount',
  text: '已采集数据条数',
  blockType: 'reporter'
},
{ opcode: 'exportDataCSV',
  text: '导出数据为CSV文件',
  blockType: 'command'
},
{ opcode: 'startAutoCollect',
  text: '每 [INTERVAL] 毫秒自动采集一条 标签=[LABEL]',
  blockType: 'command'
}
```

### 4.4 Sensor Cache (50Hz State Store)

```javascript
// vsle-ev3-extension/src/protocol/sensor_cache.js
// All sensor reads come from cache — no network round-trip during block execution

class SensorCache {
    constructor() {
        this.data = {
            sensors: {
                S1: { color: 0, reflected: 0, ambient: 0, rgb: [0,0,0] },
                S2: { distance_cm: 0, distance_inch: 0 },
                S3: { angle: 0, rate: 0 },
                S4: { pressed: false }
            },
            motors: {
                A: { position: 0, speed: 0, running: false },
                B: { position: 0, speed: 0, running: false },
                C: { position: 0, speed: 0, running: false },
                D: { position: 0, speed: 0, running: false }
            },
            system: {
                battery_pct: 100,
                battery_v: 7.5,
                buttons: { up: false, down: false, left: false, right: false, center: false }
            },
            timestamp: 0
        };
        this.updateRate = 0;  // Hz counter
    }

    update(sensorPayload) {
        // Called by WebSocket message handler at ~50Hz
        this.data = { ...sensorPayload, timestamp: Date.now() };
        this._trackUpdateRate();
    }

    get(path) {
        // e.g. get('sensors.S1.color') or get('motors.A.position')
        return path.split('.').reduce((obj, key) => obj?.[key], this.data);
    }
}
```

---

## 5. Layer 3 — WeisileLink Bridge Service

### 5.1 Overview

WeisileLink is a Python asyncio application that:
1. Implements the Scratch Link JSON-RPC 2.0 protocol (port 20111, path `/scratch/bt`)
2. Manages dual transport: Bluetooth Classic RFCOMM OR WiFi WebSocket
3. Routes sensor data simultaneously to Scratch extension AND WeisileAI Trainer
4. Provides a subscription endpoint for the WeisileAI Trainer (port 8766)

### 5.2 Startup & Transport Selection

```
$ python weisile_link.py --transport wifi --ev3-ip 192.168.1.100
$ python weisile_link.py --transport bluetooth --ev3-bt 00:16:53:XX:XX:XX
$ python weisile_link.py --transport auto  # Try WiFi first, fall back to BT
```

### 5.3 JSON-RPC 2.0 Compatibility Layer

WeisileLink speaks the **exact same protocol** as the official Scratch Link. This means:

- The official TurboWarp EV3 extension (`scratch3_ev3`) works unchanged
- The VSLE-EV3 extension works with WeisileLink
- Students cannot tell the difference

```python
# weisile-link/protocol/json_rpc_server.py

SUPPORTED_METHODS = {
    'discover':          self._handle_discover,
    'connect':           self._handle_connect,
    'send':              self._handle_send,       # Commands TO EV3
    'startNotifications': self._handle_subscribe,  # Sensor data FROM EV3
    'stopNotifications': self._handle_unsubscribe,
    # VSLE EXTENSIONS:
    'vsle.setTransport': self._handle_set_transport,  # Switch BT/WiFi
    'vsle.subscribe':    self._handle_trainer_subscribe, # WeisileAI sub
}
```

### 5.4 Sensor Data Router

```python
# weisile-link/router/sensor_router.py

class SensorDataRouter:
    """
    Receives sensor data from EV3 transport.
    Broadcasts to ALL registered consumers simultaneously.
    No data duplication, no synchronization overhead.
    """
    def __init__(self):
        self.consumers: Set[WebSocketConsumer] = set()

    def register(self, consumer: WebSocketConsumer):
        self.consumers.add(consumer)

    def unregister(self, consumer: WebSocketConsumer):
        self.consumers.discard(consumer)

    async def broadcast(self, sensor_data: dict):
        """
        Called at ~50Hz by the transport layer.
        Formats data for each consumer type and sends simultaneously.
        """
        if not self.consumers:
            return

        # Format 1: Scratch Extension format (JSON-RPC notification)
        scratch_payload = self._format_for_scratch(sensor_data)

        # Format 2: WeisileAI Trainer format (flat JSON for charts)
        trainer_payload = self._format_for_trainer(sensor_data)

        # Send to all consumers concurrently
        tasks = []
        targets = []
        for consumer in self.consumers:
            if consumer.consumer_type == 'scratch':
                tasks.append(consumer.send(scratch_payload))
                targets.append(consumer)
            elif consumer.consumer_type == 'trainer':
                tasks.append(consumer.send(trainer_payload))
                targets.append(consumer)

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for consumer, result in zip(targets, results):
            if isinstance(result, Exception):
                logging.warning(
                    "sensor_broadcast_failed",
                    extra={
                        "consumer_type": consumer.consumer_type,
                        "error": repr(result)
                    }
                )
                consumer.mark_unhealthy(result)
```

Router failures MUST be observable. `return_exceptions=True` is permitted only
when each exception is logged, counted in metrics, and reflected in the health
status for that consumer.

### 5.5 Bluetooth Classic Transport (Python stdlib)

```python
# weisile-link/transport/bluetooth_transport.py
# Uses Python socket stdlib — NO pybluez dependency

import socket
import asyncio

EV3_BT_PORT = 1       # RFCOMM channel 1 (standard EV3 channel)
EV3_PAIRING_PIN = b'1234'

class BluetoothTransport:
    """
    Bluetooth Classic RFCOMM transport.
    Uses Python 3.3+ socket module with AF_BLUETOOTH / BTPROTO_RFCOMM.
    No pybluez dependency is permitted.

    Platform note:
    - Linux and ev3dev support AF_BLUETOOTH directly.
    - macOS and Windows teacher machines MUST default to WiFi transport unless
      an OS-specific Bluetooth adapter is implemented and tested separately.
    """

    def __init__(self, ev3_address: str):
        self.address = ev3_address
        self.sock = None
        self._connected = False

    async def connect(self) -> bool:
        loop = asyncio.get_event_loop()
        try:
            self.sock = socket.socket(
                socket.AF_BLUETOOTH,
                socket.SOCK_STREAM,
                socket.BTPROTO_RFCOMM
            )
            self.sock.settimeout(10)
            await loop.run_in_executor(
                None,
                self.sock.connect,
                (self.address, EV3_BT_PORT)
            )
            self._connected = True
            return True
        except (socket.error, OSError) as e:
            return False

    async def send_direct_command(self, command_bytes: bytes) -> bytes:
        """Send EV3 Direct Command and receive response."""
        if not self._connected:
            raise RuntimeError("Not connected to EV3")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.sock.sendall, command_bytes)
        response = await loop.run_in_executor(None, self.sock.recv, 1024)
        return response
```

### 5.6 WiFi WebSocket Transport

```python
# weisile-link/transport/wifi_transport.py

import asyncio
import websockets
import json
import os

class WiFiTransport:
    """
    WiFi WebSocket transport.
    Connects to vsle_ev3_server.py running on EV3 with WiFi USB dongle.
    Preferred transport: lower latency, multi-device support, 50Hz stable.
    """

    def __init__(self, ev3_ip: str, port: int = 8765):
        self.uri = f"ws://{ev3_ip}:{port}"
        self.ws = None
        self._sensor_callback = None
        self._receive_task = None
        self._pairing_token = os.environ.get('WEISILE_PAIRING_TOKEN', '')

    async def connect(self, on_sensor_data) -> bool:
        self._sensor_callback = on_sensor_data
        try:
            self.ws = await websockets.connect(self.uri, ping_interval=5)
            if self._pairing_token:
                await self.ws.send(json.dumps({
                    'method': 'auth.pair',
                    'params': {'token': self._pairing_token}
                }))
                auth_ack = json.loads(await self.ws.recv())
                if not auth_ack.get('ok'):
                    await self.ws.close(code=1008, reason='pairing failed')
                    return False
            self._receive_task = asyncio.create_task(self._receive_loop())
            return True
        except (OSError, json.JSONDecodeError, websockets.exceptions.WebSocketException):
            return False

    async def _receive_loop(self):
        """50Hz sensor data receive loop from EV3."""
        async for message in self.ws:
            data = json.loads(message)
            if data.get('type') == 'sensor_update':
                await self._sensor_callback(data)

    async def send_command(self, command: dict) -> dict:
        """Send control command to EV3, receive acknowledgment."""
        await self.ws.send(json.dumps(command))
        response = await self.ws.recv()
        return json.loads(response)
```

---

## 6. Layer 4 — EV3 Hardware Abstraction

### 6.1 vsle_ev3_server.py (Deployed to EV3)

This is the Python service running on the EV3 brick under ev3dev.

```python
#!/usr/bin/env python3
"""
VSLE EV3 Server — runs on EV3 brick with ev3dev Linux
Provides WebSocket server for WiFi communication with WeisileLink.
Handles ALL sensor reading and motor control.
"""

import asyncio
import websockets
import json
import time
import logging
import os
from collections import deque

# ev3dev2 imports
from ev3dev2.sensor.lego import (
    ColorSensor, UltrasonicSensor, GyroSensor,
    TouchSensor, InfraredSensor
)
from ev3dev2.motor import (
    LargeMotor, MediumMotor,
    OUTPUT_A, OUTPUT_B, OUTPUT_C, OUTPUT_D,
    SpeedPercent, MoveSteering, MoveTank
)
from ev3dev2.power import PowerSupply
from ev3dev2.sound import Sound
from ev3dev2.display import Display
from ev3dev2.button import Button

SENSOR_HZ = 50          # Target sensor polling rate
WS_PORT    = 8765       # WebSocket server port
SENSOR_INTERVAL = 1.0 / SENSOR_HZ
MAX_COLLECTED_POINTS = 10000  # classroom-safe bounded buffer
PAIRING_TOKEN = os.environ.get('WEISILE_PAIRING_TOKEN', '')

class VsleEV3Server:

    def __init__(self):
        self._init_hardware()
        self.clients: set = set()
        self.collecting: bool = False
        self.collect_label: str = ''
        self.collected_data = deque(maxlen=MAX_COLLECTED_POINTS)
        self._active_sound_process = None

    def _init_hardware(self):
        """Initialize all available hardware. Use try/except per port."""
        self.sensors = {}
        self.motors = {}

        # Auto-detect sensors on ports 1-4
        for port, port_name in [(1,'S1'), (2,'S2'), (3,'S3'), (4,'S4')]:
            for SensorClass in [ColorSensor, UltrasonicSensor, GyroSensor,
                                  TouchSensor, InfraredSensor]:
                try:
                    sensor = SensorClass(f'in{port}')
                    if not str(getattr(sensor, 'address', '')).endswith(f'in{port}'):
                        continue
                    self.sensors[port_name] = sensor
                    logging.info(
                        "sensor_detected",
                        extra={
                            "port": port_name,
                            "driver": getattr(sensor, "driver_name", ""),
                            "class": SensorClass.__name__
                        }
                    )
                    break
                except Exception as exc:
                    logging.debug(
                        "sensor_detection_failed",
                        extra={
                            "port": port_name,
                            "class": SensorClass.__name__,
                            "error": repr(exc)
                        }
                    )
                    continue

        # Auto-detect motors on ports A-D
        for port, port_name, port_const in [
            ('a', 'A', OUTPUT_A), ('b', 'B', OUTPUT_B),
            ('c', 'C', OUTPUT_C), ('d', 'D', OUTPUT_D)
        ]:
            for MotorClass in [LargeMotor, MediumMotor]:
                try:
                    motor = MotorClass(port_const)
                    if not str(getattr(motor, 'address', '')).endswith(port_const):
                        continue
                    self.motors[port_name] = motor
                    logging.info(
                        "motor_detected",
                        extra={
                            "port": port_name,
                            "driver": getattr(motor, "driver_name", ""),
                            "class": MotorClass.__name__
                        }
                    )
                    break
                except Exception as exc:
                    logging.debug(
                        "motor_detection_failed",
                        extra={
                            "port": port_name,
                            "class": MotorClass.__name__,
                            "error": repr(exc)
                        }
                    )
                    continue

        # System hardware
        self.power   = PowerSupply()
        self.sound   = Sound()
        self.display = Display()
        self.buttons = Button()

    def _read_all_sensors(self) -> dict:
        """Read all connected sensors. Return dict for JSON serialization."""
        readings = {
            'type': 'sensor_update',
            'timestamp': time.time(),
            'sensors': {},
            'motors': {},
            'system': {
                'battery_pct': self.power.measured_battery_level,
                'battery_v':   self.power.measured_volts,
                'buttons': {
                    'up':     self.buttons.up,
                    'down':   self.buttons.down,
                    'left':   self.buttons.left,
                    'right':  self.buttons.right,
                    'center': self.buttons.enter
                }
            }
        }

        for port_name, sensor in self.sensors.items():
            try:
                s = {}
                if isinstance(sensor, ColorSensor):
                    s = {
                        'type': 'color',
                        'color': sensor.color,
                        'reflected': sensor.reflected_light_intensity,
                        'ambient':   sensor.ambient_light_intensity,
                        'rgb':       list(sensor.rgb)
                    }
                elif isinstance(sensor, UltrasonicSensor):
                    s = {
                        'type': 'ultrasonic',
                        'distance_cm':   sensor.distance_centimeters,
                        'distance_inch': sensor.distance_inches
                    }
                elif isinstance(sensor, GyroSensor):
                    s = {
                        'type': 'gyro',
                        'angle': sensor.angle,
                        'rate':  sensor.rate
                    }
                elif isinstance(sensor, TouchSensor):
                    s = {
                        'type': 'touch',
                        'pressed': sensor.is_pressed
                    }
                elif isinstance(sensor, InfraredSensor):
                    s = {
                        'type': 'infrared',
                        'distance': sensor.proximity
                    }
                readings['sensors'][port_name] = s
            except Exception as e:
                readings['sensors'][port_name] = {'error': str(e)}

        for port_name, motor in self.motors.items():
            try:
                readings['motors'][port_name] = {
                    'position': motor.position,
                    'speed':    motor.speed,
                    'running':  motor.is_running
                }
            except Exception as e:
                readings['motors'][port_name] = {'error': str(e)}

        return readings

    async def _authenticate_client(self, websocket) -> bool:
        """Require pairing token before accepting non-public EV3 commands."""
        if not PAIRING_TOKEN:
            return True

        try:
            message = await asyncio.wait_for(websocket.recv(), timeout=5)
            cmd = json.loads(message)
        except (asyncio.TimeoutError, json.JSONDecodeError):
            await websocket.close(code=1008, reason='pairing required')
            return False

        token = cmd.get('params', {}).get('token')
        if cmd.get('method') != 'auth.pair' or token != PAIRING_TOKEN:
            await websocket.close(code=1008, reason='pairing failed')
            return False

        await websocket.send(json.dumps({
            'type': 'ack',
            'id': cmd.get('id'),
            'ok': True
        }))
        return True

    async def sensor_broadcast_loop(self):
        """50Hz sensor data broadcast to all connected clients."""
        next_tick = time.monotonic()
        while True:
            if self.clients:
                data = self._read_all_sensors()

                # Append to data collection if active
                if self.collecting:
                    self.collected_data.append({
                        **data,
                        'label': self.collect_label
                    })

                msg = json.dumps(data)
                disconnected = set()
                for ws in self.clients:
                    try:
                        await ws.send(msg)
                    except websockets.exceptions.ConnectionClosed:
                        disconnected.add(ws)
                self.clients -= disconnected

            next_tick += SENSOR_INTERVAL
            sleep_for = next_tick - time.monotonic()
            if sleep_for <= 0:
                # If a slow hardware read or network send overruns the 20ms
                # budget, skip catch-up sleeps instead of building latency.
                next_tick = time.monotonic()
                sleep_for = 0
            await asyncio.sleep(sleep_for)

    async def command_handler(self, websocket, message: str):
        """Execute command received from WeisileLink."""
        cmd = json.loads(message)
        method = cmd.get('method', '')
        params = cmd.get('params', {})
        cmd_id = cmd.get('id')

        result = {'ok': True}

        try:
            if method == 'motor.runForever':
                motor = self.motors[params['port']]
                motor.run_forever(speed_sp=params['speed'])

            elif method == 'motor.runTimed':
                motor = self.motors[params['port']]
                motor.run_timed(
                    speed_sp=params['speed'],
                    time_sp=int(params['time'] * 1000)
                )

            elif method == 'motor.runToAbsPos':
                motor = self.motors[params['port']]
                motor.run_to_abs_pos(
                    position_sp=params['degrees'],
                    speed_sp=params.get('speed', 50)
                )

            elif method == 'motor.runToRelPos':
                motor = self.motors[params['port']]
                motor.run_to_rel_pos(
                    position_sp=params['degrees'],
                    speed_sp=params.get('speed', 50)
                )

            elif method == 'motor.stop':
                self.motors[params['port']].stop()

            elif method == 'motor.stopAll':
                for motor in self.motors.values():
                    motor.stop()

            elif method == 'motor.syncRun':
                tank = MoveTank(
                    self.motors[params['port_l']].address,
                    self.motors[params['port_r']].address
                )
                tank.on_for_seconds(
                    left_speed=SpeedPercent(params['speed']),
                    right_speed=SpeedPercent(params['speed']),
                    seconds=params['time']
                )

            elif method == 'motor.resetPosition':
                self.motors[params['port']].reset()

            elif method == 'motor.syncTurn':
                steering = MoveSteering(
                    self.motors[params['port_l']].address,
                    self.motors[params['port_r']].address
                )
                steering.on(
                    steering=params['turn'],
                    speed=SpeedPercent(params['speed'])
                )

            elif method == 'sound.playTone':
                self.sound.play_tone(
                    frequency=params['freq'],
                    duration=params.get('duration', 0.5),
                    volume=params.get('volume', 100),
                    play_type=Sound.PLAY_NO_WAIT_FOR_COMPLETE
                )

            elif method == 'sound.playToneWait':
                self.sound.play_tone(
                    frequency=params['freq'],
                    duration=params['duration'],
                    volume=params.get('volume', 100),
                    play_type=Sound.PLAY_WAIT_FOR_COMPLETE
                )

            elif method == 'sound.beep':
                self.sound.beep()

            elif method == 'sound.stop':
                stop = getattr(self.sound, 'stop', None)
                if callable(stop):
                    stop()
                elif self._active_sound_process:
                    self._active_sound_process.terminate()
                    self._active_sound_process = None

            elif method == 'sound.setVolume':
                self.sound.set_volume(params['volume'])

            elif method == 'display.text':
                self.display.text_pixels(
                    params['text'],
                    clear_screen=(params.get('line', 1) == 1),
                    x=0,
                    y=(params.get('line', 1) - 1) * 15
                )
                self.display.update()

            elif method == 'display.clear':
                self.display.clear()
                self.display.update()

            elif method == 'display.drawLine':
                self.display.line(
                    clear_screen=False,
                    x1=params['x1'],
                    y1=params['y1'],
                    x2=params['x2'],
                    y2=params['y2']
                )
                self.display.update()

            elif method == 'display.drawCircle':
                self.display.circle(
                    clear_screen=False,
                    x=params['x'],
                    y=params['y'],
                    radius=params['r']
                )
                self.display.update()

            elif method == 'gyro.reset':
                sensor = self.sensors.get(params['port'])
                if sensor and isinstance(sensor, GyroSensor):
                    sensor.reset()

            elif method == 'data.startCollect':
                self.collecting = True
                self.collect_label = params.get('label', 'unknown')

            elif method == 'data.stopCollect':
                self.collecting = False

            elif method == 'data.addPoint':
                snapshot = self._read_all_sensors()
                snapshot['label'] = params.get('label', 'unknown')
                self.collected_data.append(snapshot)

            elif method == 'data.getAll':
                result = {'ok': True, 'data': list(self.collected_data)}

            elif method == 'data.clear':
                self.collected_data.clear()

        except (KeyError, AttributeError) as e:
            result = {'ok': False, 'error': str(e)}

        # Send acknowledgment
        ack = json.dumps({'type': 'ack', 'id': cmd_id, **result})
        await websocket.send(ack)

    async def handler(self, websocket, path):
        if not await self._authenticate_client(websocket):
            return

        self.clients.add(websocket)
        try:
            async for message in websocket:
                await self.command_handler(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)

    async def run(self):
        async with websockets.serve(self.handler, '0.0.0.0', WS_PORT):
            await self.sensor_broadcast_loop()


if __name__ == '__main__':
    server = VsleEV3Server()
    asyncio.get_event_loop().run_until_complete(server.run())
```

### 6.2 Hardware Detection Requirements

Sensor and motor auto-detection must be explicit and diagnosable:

- Detect each physical port independently; multiple sensors of the same class on
  different ports must be supported.
- After constructing a sensor or motor, verify that the device address matches
  the requested port before accepting it.
- Log all detected hardware with port, driver name, and class.
- Log detection failures at debug level, but never hide a connected port from
  `/api/status`.
- Missing hardware is not fatal; commands targeting missing ports return
  `EV3_INVALID_PORT`.

---

## 7. Real-Time Data Pipeline

### 7.1 Data Flow Diagram

```
EV3 Sensors (hardware)
    ↓ ev3dev2 library read (~1ms)
    ↓ 50Hz polling loop
vsle_ev3_server.py (on EV3)
    ↓ WebSocket push (WiFi, ~5ms RTT)
WeisileLink wifi_transport.py
    ↓ asyncio
SensorDataRouter.broadcast()
    ↓ asyncio.gather (concurrent)
    ├─→ Scratch Extension (ws://localhost:20111)
    │       ↓ JSON-RPC notification
    │   sensor_cache.update()   ← 50Hz
    │       ↓
    │   Scratch blocks read from cache (0ms — no network)
    │
    └─→ WeisileAI Trainer (ws://localhost:8766)
            ↓ flat JSON
        Real-time sensor charts
        Data collection buffer
        AI Quest training pipeline
```

### 7.2 Message Format Specification

#### EV3 → WeisileLink (WiFi transport, 50Hz)

```json
{
  "type": "sensor_update",
  "timestamp": 1716387600.123,
  "sensors": {
    "S1": {
      "type": "color",
      "color": 3,
      "reflected": 45,
      "ambient": 12,
      "rgb": [120, 98, 76]
    },
    "S2": {
      "type": "ultrasonic",
      "distance_cm": 23.4,
      "distance_inch": 9.2
    },
    "S3": {
      "type": "gyro",
      "angle": -12,
      "rate": 0
    },
    "S4": {
      "type": "touch",
      "pressed": false
    }
  },
  "motors": {
    "A": { "position": 360, "speed": 0, "running": false },
    "B": { "position": -180, "speed": 0, "running": false }
  },
  "system": {
    "battery_pct": 87,
    "battery_v": 7.8,
    "buttons": {
      "up": false, "down": false, "left": false,
      "right": false, "center": false
    }
  }
}
```

#### WeisileLink → Scratch Extension (JSON-RPC notification)

```json
{
  "jsonrpc": "2.0",
  "method": "notifyDeviceDidReceiveMessage",
  "params": {
    "message": "<base64 encoded sensor payload>"
  }
}
```

#### WeisileLink → WeisileAI Trainer (flat JSON, 50Hz)

```json
{
  "type": "sensor_stream",
  "t": 1716387600123,
  "color_reflected": 45,
  "color_ambient": 12,
  "color_id": 3,
  "ultrasonic_cm": 23.4,
  "gyro_angle": -12,
  "gyro_rate": 0,
  "touch_pressed": false,
  "motor_a_pos": 360,
  "motor_b_pos": -180,
  "battery_pct": 87,
  "collecting": true,
  "label": "obstacle"
}
```

### 7.3 Latency Budget

| Stage | Target Latency | Measured (WiFi LAN) |
|-------|---------------|---------------------|
| EV3 sensor read (sysfs) | < 2ms | ~0.8ms |
| EV3 WebSocket push | < 5ms | ~2ms |
| WeisileLink receive + route | < 1ms | ~0.5ms |
| Scratch cache update | < 0.1ms | ~0.05ms |
| Block reads from cache | 0ms | 0ms |
| **Total block execution latency** | **< 8ms** | **~3.4ms** |

**Comparison**: Official Scratch Link (Bluetooth) typical RTT: 20–100ms, with 500ms+ spikes.

---

## 8. WeisileAI Trainer Integration

### 8.1 Connection Setup

The WeisileAI Trainer connects to WeisileLink's subscription endpoint:

```javascript
// weisileai-trainer/src/datasources/ev3_source.js

class EV3DataSource {
    constructor() {
        this.ws = new WebSocket('ws://localhost:8766');
        this.buffer = [];

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'sensor_stream') {
                this._handleSensorUpdate(data);
            }
        };
    }

    _handleSensorUpdate(data) {
        // Feed real-time chart
        this.emit('sensor_data', data);

        // Buffer for training collection
        if (data.collecting) {
            this.buffer.push({
                features: this._extractFeatures(data),
                label: data.label,
                timestamp: data.t
            });
        }
    }

    _extractFeatures(data) {
        return {
            color_reflected: data.color_reflected,
            ultrasonic_cm: data.ultrasonic_cm,
            gyro_angle: data.gyro_angle,
            touch_pressed: data.touch_pressed ? 1 : 0,
            motor_a_pos: data.motor_a_pos
        };
    }
}
```

### 8.2 AI Quest Data Collection Workflow

```
Scratch Program (EV3 控制 + 数据采集):

[当绿旗被点击]
[设置数据标签为 "安全区域"]
[开始采集数据]
重复 30 次:
    [移动电机 A 速度50 时间0.5秒]
    [等待 0.5 秒]
[停止数据采集]

[设置数据标签为 "障碍区域"]
[开始采集数据]
[等待 触碰传感器S4 被按下]
[停止采集 15 秒后自动停止]
[上传数据到训练工场]

                ↓
WeisileAI Trainer receives buffered data
                ↓
AI Quest 5-step pipeline:
Step 2: Data Cleaning (anomaly detection)
Step 3: Feature Selection (color / distance / gyro)
Step 4: Train model (Decision Tree, 70% accuracy gate)
Step 5: Export rules → model_rules.json
                ↓
Back in Scratch:
if [训练工场预测: 当前传感器数据] = "障碍区域":
    [停止电机]
```

---

## 9. EV3 Full Capability Matrix

This matrix documents every hardware capability exposed through VSLE blocks:

| Capability | EV3 Hardware | ev3dev2 API | VSLE Block | Block Count |
|-----------|-------------|-------------|------------|-------------|
| Color detection | Color Sensor | `sensor.color` | ✅ getColorSensorColor | 5 |
| Reflected light | Color Sensor | `sensor.reflected_light_intensity` | ✅ getColorSensorReflected | |
| Ambient light | Color Sensor | `sensor.ambient_light_intensity` | ✅ getColorSensorAmbient | |
| RGB values | Color Sensor | `sensor.rgb` | ✅ getColorSensorRGB | |
| Distance (cm) | Ultrasonic | `sensor.distance_centimeters` | ✅ getUltrasonicDistance | 3 |
| Distance (inch) | Ultrasonic | `sensor.distance_inches` | ✅ getUltrasonicDistanceInch | |
| Gyro angle | Gyro Sensor | `sensor.angle` | ✅ getGyroAngle | 3 |
| Gyro rate | Gyro Sensor | `sensor.rate` | ✅ getGyroRate | |
| Gyro reset | Gyro Sensor | `sensor.reset()` | ✅ resetGyro | |
| Touch state | Touch Sensor | `sensor.is_pressed` | ✅ getTouchPressed | 3 |
| Touch wait | Touch Sensor | asyncio wait | ✅ waitTouchPress | |
| IR proximity | IR Sensor | `sensor.proximity` | ✅ getIRDistance | 4 |
| IR beacon heading | IR Sensor | `sensor.beacon()` | ✅ getIRBeaconHeading | |
| IR remote button | IR Sensor | `sensor.top_left()` etc | ✅ getIRRemoteButton | |
| Motor continuous | LargeMotor | `run_forever()` | ✅ motorRunForever | 10 |
| Motor timed | LargeMotor | `run_timed()` | ✅ motorRunTimed | |
| Motor absolute pos | LargeMotor | `run_to_abs_pos()` | ✅ motorRunToAbsPos | |
| Motor relative pos | LargeMotor | `run_to_rel_pos()` | ✅ motorRunToRelPos | |
| Motor stop | LargeMotor | `stop()` | ✅ motorStop | |
| Motor sync run | MoveTank | `on_for_seconds()` | ✅ motorSyncRun | |
| Motor sync turn | MoveSteering | `on()` | ✅ motorSyncTurn | |
| Motor position read | LargeMotor | `motor.position` | ✅ getMotorPosition | |
| Motor speed read | LargeMotor | `motor.speed` | ✅ getMotorSpeed | |
| Motor PID params | LargeMotor | `speed_p`, `speed_i`, `speed_d`; `position_p`, `position_i`, `position_d` | ✅ motorSetPID / getMotorPID | 2 |
| Play tone | Sound | `play_tone()` | ✅ playTone | 6 |
| Play file | Sound | `play_file()` | ✅ playSoundFile | |
| Set volume | Sound | `set_volume()` | ✅ setVolume | |
| LCD text | Display | `text_pixels()` | ✅ displayText | 8 |
| LCD image | Display | `image.show()` | ✅ displayImage | |
| LCD draw | Display | `draw.line()` | ✅ drawLine | |
| LCD clear | Display | `clear()` | ✅ displayClear | |
| Status LED | Button class | led control | ✅ setStatusLight | 2 |
| Brick buttons | Button | `button.up` etc | ✅ isBrickButtonPressed | 1 |
| Battery level | PowerSupply | `measured_battery_level` | ✅ getBatteryLevel | 2 |
| Battery voltage | PowerSupply | `measured_volts` | ✅ getBatteryVoltage | |
| Data collection | (custom) | buffer + WebSocket | ✅ startDataCollection | 8 |
| Data upload | (custom) | HTTP POST to Trainer | ✅ uploadToTrainer | |

**Total: 64 blocks covering 100% of EV3 educational hardware capabilities.**

---

## 10. API Contracts

### 10.1 WeisileLink REST API (internal, for Trainer)

```
GET  /api/status                → WeisileLink health + transport info
GET  /api/ev3/sensors           → Current sensor snapshot
GET  /api/ev3/motors            → Current motor state
POST /api/ev3/command           → Send direct command
GET  /api/data/collected        → Get all collected data
POST /api/data/clear            → Clear collected data
POST /api/data/export           → Download as CSV
POST /api/trainer/train         → Train local Decision Tree rules
POST /api/trainer/export        → Export model_rules.json
```

### 10.2 WeisileLink WebSocket Endpoints

```
ws://localhost:20111/scratch/bt  → Scratch extension connection (JSON-RPC 2.0)
ws://localhost:8766              → WeisileAI Trainer subscription
```

### 10.3 Command Payload Reference

All commands to EV3 use this envelope:

```json
{
  "id": "uuid-v4-string",
  "method": "motor.runTimed",
  "params": {
    "port": "A",
    "speed": 50,
    "time": 2.0
  }
}
```

All responses use:

```json
{
  "type": "ack",
  "id": "uuid-v4-string",
  "ok": true
}
```

### 10.4 JSON-RPC Error Envelope

All Scratch-facing errors MUST use JSON-RPC 2.0 error format. EV3-facing
transport acknowledgments MAY use the `ack` envelope above, but WeisileLink must
translate failures back into JSON-RPC errors before returning to Scratch.

```json
{
  "jsonrpc": "2.0",
  "id": "uuid-v4-string",
  "error": {
    "code": -32021,
    "message": "EV3 motor port is not connected",
    "data": {
      "method": "motor.runTimed",
      "port": "A",
      "retryable": false
    }
  }
}
```

### 10.5 Required Payload Validation

Every command received by WeisileLink and `vsle_ev3_server.py` MUST validate:

| Field | Rule |
|-------|------|
| `method` | Must be in the command allowlist |
| `port` | Motors: `A-D`; sensors: `S1-S4`; reject unknown ports |
| `speed` | Clamp to `-100..100`; reject non-numeric values |
| `time` / `duration` | Clamp to `0..60` seconds for classroom safety |
| `freq` | Clamp to `20..20000` Hz |
| `volume` | Clamp to `0..100` |
| PID `mode` / `term` | Mode must be `speed` or `position`; term must be `kp`, `ki`, or `kd` |
| PID `value` | Clamp to `0..10000` as a VSLE classroom safety bound |
| `label` | UTF-8 string, max 64 characters |
| display coordinates | Clamp to EV3 LCD bounds `0..177` x `0..127` |

Invalid commands MUST fail closed: no motor or actuator action is executed after
validation fails.

### 10.6 Trainer REST Response Schema

REST endpoints return a common envelope:

```json
{
  "ok": true,
  "timestamp": "2026-05-22T12:00:00Z",
  "data": {}
}
```

Failure response:

```json
{
  "ok": false,
  "timestamp": "2026-05-22T12:00:00Z",
  "error": {
    "code": "EV3_TRANSPORT_DISCONNECTED",
    "message": "No EV3 transport is connected",
    "retryable": true
  }
}
```

---

## 11. UI/UX Requirements

### 11.1 EV3 Extension Card (in Scratch Extension Picker)

Follows **exact Scratch extension card design**:

```
┌──────────────────────────────────────────┐
│  [EV3 Brick illustration - same style    │
│   as official LEGO EV3 Scratch card]     │
│                                          │
│  唯思乐 EV3                              │
│  控制 LEGO EV3 机器人，读取所有传感器，   │
│  采集数据用于 AI 训练。                   │
│                                          │
│  [要求硬件连接]                           │
└──────────────────────────────────────────┘
```

Design constraints:
- Same card dimensions: 296×220px
- Same font: Helvetica Neue, 14px
- Same border radius: 8px
- Same hover state: box-shadow lift

### 11.2 Connection Modal

Uses the **same Scratch connection modal design** as the official micro:bit / EV3 modal:

```
┌─────────────────────────────────────────────────────┐
│  ✕                    连接到 EV3                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  连接方式                                            │
│  ○ WiFi (推荐)  ○ 蓝牙                              │
│                                                      │
│  EV3 IP地址:  [192.168.1.100    ]                   │
│                                                      │
│  [EV3 brick animation — same as official modal]      │
│                                                      │
│  状态: 正在连接...  ●●●                              │
│                                                      │
│  [帮助]                         [连接]               │
└─────────────────────────────────────────────────────┘
```

### 11.3 Sensor Data Panel

Collapsible panel docked to the right of the Scratch stage:

```
Scratch Stage (unchanged)   │ Sensor Panel (collapsible, 280px)
────────────────────────────┤──────────────────────────────────
                            │  EV3 传感器实时数据
                            │  ┌──────────────────────────┐
                            │  │ 颜色 S1  ████░  45      │
                            │  │ 距离 S2  ██████ 23.4cm  │
                            │  │ 陀螺 S3  ▶ -12°         │
                            │  │ 触碰 S4  ● 未按         │
                            │  └──────────────────────────┘
                            │  电机
                            │  ┌──────────────────────────┐
                            │  │ A: 360°  ■ 停止         │
                            │  │ B: -180° ■ 停止         │
                            │  └──────────────────────────┘
                            │  数据采集: ■■■■░░  18/30  │
                            │  [开始采集] [上传训练工场]  │
```

Design constraints: same font, same gray (#F5F5F5 background), same green (#4CBF56) for active states.

### 11.4 Block Visual Design

EV3 blocks use standard Scratch block design language:

- **Motor blocks**: LEGO red `#E6001F` (matches LEGO brand color)
- **Sensor reporter blocks**: Oval shape, same as all Scratch reporters
- **Boolean sensor blocks**: Hexagonal shape, standard Scratch Boolean
- **Command blocks**: Standard notched rectangle
- **Block text**: Same font as all Scratch blocks (Helvetica Neue)
- **Icons**: 40×40px SVG, white on transparent (same style as official EV3 icon)

---

## 12. Development Phases

### Phase 1 — Foundation (Weeks 1–4)

**Goal**: Single EV3 controlled from Scratch via WiFi, basic sensor reading

**Additional Gate**: Critical audit remediation must be completed before any
classroom deployment, even if Phase 1 functionality appears to work.

| Task | Responsible | Duration |
|------|------------|----------|
| Security/privacy baseline + command validation | Backend | 2 days |
| Error code system + reconnect/degradation rules | Backend | 1 day |
| Health check + structured logging baseline | Backend | 1 day |
| ev3dev SD card preparation + autostart | Hardware | 3 days |
| `vsle_ev3_server.py` — sensor loop + motor control | Backend | 5 days |
| `wifi_transport.py` in WeisileLink | Backend | 3 days |
| `json_rpc_server.py` — Scratch-compatible server | Backend | 4 days |
| VSLE-EV3 Extension skeleton + 14 motor blocks | Frontend | 5 days |
| Sensor cache + 20 sensor blocks | Frontend | 5 days |
| TurboWarp integration testing | QA | 3 days |

**Phase 1 Acceptance Criteria**:
- [ ] EV3 moves forward/backward from Scratch blocks
- [ ] Color sensor value readable in Scratch reporter
- [ ] Ultrasonic distance readable in Scratch reporter
- [ ] Gyro angle readable in Scratch reporter
- [ ] Touch sensor boolean works in Scratch `if` block
- [ ] Connection modal shows EV3 status
- [ ] Scratch visual design unchanged from standard Scratch
- [ ] Section 13.6 Critical Remediation Gates pass for local pilot use

### Phase 2 — Full Capability (Weeks 5–8)

**Goal**: All 62 blocks implemented, multi-EV3, data pipeline

| Task | Duration |
|------|----------|
| Sound + display blocks (14 blocks) | 4 days |
| System + data collection blocks (14 blocks) | 4 days |
| Bluetooth Classic transport | 4 days |
| Sensor data router + WeisileAI Trainer integration | 5 days |
| Multi-EV3 session management | 5 days |
| Sensor data panel UI | 4 days |
| Connection modal polish (WiFi/BT selection) | 2 days |

**Phase 2 Acceptance Criteria**:
- [ ] All 62 blocks functional
- [ ] Real-time sensor chart in WeisileAI Trainer showing EV3 data
- [ ] Data collection workflow: record → upload → train → export
- [ ] Bluetooth transport functional as Linux/ev3dev RFCOMM fallback
- [ ] 2 simultaneous EV3 bricks supported

### Phase 3 — Polish & AI Quest (Weeks 9–12)

**Goal**: AI Quest data collection workflow, deployment, teacher tools

| Task | Duration |
|------|----------|
| AI Quest data collection sample projects | 4 days |
| Motor PID parameter blocks | 3 days |
| EV3 data → WeisileAI Trainer training pipeline E2E | 5 days |
| Docker deployment packaging | 3 days |
| Teacher guide + student workbooks | 5 days |
| Performance testing (50Hz sustained, 4h session) | 3 days |
| Security review | 2 days |

### Phase 4 — WeisileLink Desktop and Official Firmware Compatibility

**Goal**: Package WeisileLink as reliable macOS/Windows teacher-computer apps
and add a clearly labeled official EV3 firmware Bluetooth compatibility mode.

This phase does not replace full VSLE mode. Full VSLE mode remains the
production classroom path for AI Quest, 50Hz raw sensor streaming, multi-device
sessions, PID tuning, and complete display/system control.

| Task | Duration |
|------|----------|
| Desktop documentation and packaging asset tests | 2 days |
| Diagnostics export with redaction tests | 2 days |
| EV3 Direct Command encoder for official firmware mode | 4 days |
| Official firmware Bluetooth transport shell behind native adapter interface | 3 days |
| macOS packaging assets, LaunchAgent, signing/notarization notes | 4 days |
| Windows packaging assets, startup/service path, firewall-safe defaults | 4 days |
| Native macOS and Windows Bluetooth adapter evidence gates | 5 days |
| Clean-machine install, upgrade, reboot, uninstall, and diagnostics smoke | 4 days |

**Phase 4 Acceptance Criteria**:
- [ ] macOS and Windows release artifacts bundle their runtime and do not depend
      on system Python.
- [ ] Both desktop packages bind `20111` and `8766` to `127.0.0.1` by default.
- [ ] Install, upgrade, auto-start, health check, diagnostics export, crash
      restart, stop/start controls, and uninstall are documented and tested.
- [ ] Clean-machine desktop approval is backed by
      `scripts/run_desktop_install_smoke.py` evidence with
      `installed_from_release_artifact`, `started_after_reboot`,
      `scratch_link_endpoint_ok`, and
      `official_firmware_bt_real_ev3_ok` true for the target OS.
- [ ] Diagnostics redact pairing tokens, API keys, Bluetooth addresses unless
      explicitly included, oversized labels, and student raw data by default.
- [ ] Official EV3 firmware Bluetooth compatibility is labeled as a limited
      Basic Pack mode until native adapter tests and real official-firmware EV3
      smoke evidence pass separately on macOS and Windows.
- [ ] Unsupported AI Quest, 50Hz raw streaming, PID, full display drawing, and
      advanced sensor features fail closed or are hidden/marked unsupported.

---

## 13. Testing Requirements

### 13.1 Unit Tests

All Python modules require 80%+ test coverage:

```python
# tests/test_bluetooth_transport.py
def test_rfcomm_connection_stdlib():
    """Confirm socket.AF_BLUETOOTH works without pybluez"""

# tests/test_sensor_router.py
def test_broadcast_to_multiple_consumers():
    """50Hz broadcast reaches Scratch + Trainer simultaneously"""

# tests/test_direct_command.py
def test_motor_run_timed_encoding():
    """Verify EV3 bytecode encoding matches Developer Kit spec"""
```

### 13.2 Integration Tests

```
test_ev3_wifi_round_trip:
  Latency from Scratch block execution to EV3 motor start < 50ms

test_sensor_cache_freshness:
  Sensor value read from cache is not older than 25ms

test_data_collection_integrity:
  1000 data points collected, 0 dropped, timestamps monotonic

test_multi_ev3:
  2 EV3 bricks, 1 Scratch session — no cross-contamination
```

### 13.3 UI Tests

```
test_scratch_visual_identity:
  Screenshot comparison: VSLE platform vs standard Scratch
  Allowed diff: EV3 block category addition only
  Block colors, fonts, shapes: pixel-perfect match

test_connection_modal_design:
  Modal dimensions, fonts, colors match Scratch design system
```

### 13.4 Performance Tests

```
test_sustained_50hz:
  Run for 4 hours at 50Hz sensor polling
  Memory usage increase: < 50MB
  Dropped sensor updates: < 0.1%

test_bluetooth_reconnect:
  Simulate BT disconnect → auto-reconnect within 5 seconds
```

### 13.5 JavaScript Extension Tests

The core 62 Scratch blocks require dedicated JavaScript tests before Phase 2
exit. Phase 3 motor PID blocks extend the current tested surface to 64 blocks:

```
test_getInfo_contains_all_current_blocks:
  getInfo() exposes every block listed in Section 4.3

test_reporter_blocks_are_sync:
  Reporter and Boolean opcodes never return Promise and never await network I/O

test_sensor_cache_path_defaults:
  Missing sensor paths return safe typed defaults: number=0, bool=false, string=''

test_command_validation:
  Invalid ports, speeds, labels, and durations are rejected or clamped before send

test_json_rpc_client_error_mapping:
  JSON-RPC error responses surface clear Scratch-visible error state
```

### 13.6 Critical Remediation Gates

Classroom deployment is blocked until all gates below pass:

| Gate | Verification |
|------|--------------|
| Security | Localhost-only bridge by default, EV3 `auth.pair` token handshake verified, command validation tests pass |
| Privacy | Student data minimization documented, export/delete workflow tested |
| Error handling | JSON-RPC error codes covered by unit tests and reconnect integration tests |
| Operations | `/api/status` and EV3 health checks return actionable status |
| 50Hz timing | 4-hour sustained test, drift bounded, dropped updates `<0.1%` |
| Data buffer | `MAX_COLLECTED_POINTS` cap verified; no unbounded memory growth |
| Known code fixes | `websockets.serve`, display draw API, sound stop behavior covered by tests |
| Scratch identity | Screenshot diff passes with only allowed EV3 additions |
| Desktop install reliability | macOS and Windows clean install, upgrade, login/reboot auto-start, health check, diagnostics export, crash restart, stop/start, and uninstall verified from release artifacts; `scripts/run_desktop_install_smoke.py` must accept the evidence JSON |
| Official firmware BT compatibility | Native adapter tests plus real official-firmware EV3 smoke evidence pass on each OS before the mode is marked available; localhost-only developer smoke is explicitly insufficient |

### 13.6.1 Mac Browser Full VSLE Bluetooth Smoke

When a Windows computer is not available, QA should test the no-WiFi full-module
Bluetooth path from the Mac browser first. This smoke is:

```text
ScratchAI browser -> WeisileLink Desktop -> vsle-bluetooth -> ev3dev EV3 server
```

Required evidence:
- ScratchAI browser loads the VSLE-EV3 extension as an Unsandboxed Extension.
- The selected Scratch connection mode is `Bluetooth Full VSLE`, never direct
  browser Bluetooth and never `Official Firmware Bluetooth Compatibility`.
- WeisileLink reports `transport: "vsle-bluetooth"` and routes commands through
  the EV3SC JSON-line transport.
- `scripts/run_vsle_bluetooth_smoke.py` records every server-side Scratch EV3
  module command group: motor, sensor, sound, display, system,
  data_collection, and ai_quest.
- `scripts/run_macos_browser_vsle_bluetooth_smoke.py` combines the ScratchAI
  browser Unsandboxed evidence with the full `vsle-bluetooth` command-group
  evidence and writes
  `docs/classroom/macos_browser_vsle_bluetooth_smoke.md`.
- For self-use/internal validation before Developer ID signing exists,
  `scripts/run_vsle_bluetooth_smoke.py --self-use-unsigned` can write
  `docs/classroom/vsle_bluetooth_self_use_unsigned.md` and accept the same real
  command-group evidence without requiring
  `installed_from_release_artifact: true`.
- `scripts/run_vsle_bluetooth_sensor_port_matrix.py` validates declared real
  EV3 sensor and motor port combinations from
  `docs/classroom/vsle_bluetooth_sensor_port_matrix.json` and writes
  `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`.
- Bluetooth classroom baseline does not require release-artifact evidence.
  Release-artifact evidence remains a separate distribution gate reported by
  `Release-artifact evidence ready`.
- Reporter and Boolean blocks remain cache-backed, disconnect stop behavior is
  observed, and Bluetooth sampling metrics are recorded.

Mac browser full VSLE Bluetooth smoke can validate the server-side Scratch EV3
module path before Windows evidence is available, but it does not replace signed
release-artifact evidence, macOS notarized install evidence, or separate
Windows evidence. Self-use unsigned validation is likewise only a local/internal
functional regression gate; keep release/distribution readiness separate if the
release artifact, notarized install, or Windows evidence gates are the only
missing proof.

### 13.7 Manual Classroom Acceptance Test

Before any pilot class, QA must run a 30-device rehearsal:

1. Start 30 WeisileLink instances or simulated EV3 transports on the classroom LAN.
2. Connect at least 10 real EV3 bricks if hardware is available.
3. Run a 45-minute student workflow: connect, drive motors, stream sensors,
   collect labeled data, upload to Trainer, export model rules.
4. Record disconnects, reconnect time, dropped updates, memory growth, and teacher
   recovery steps.
5. Pilot is blocked if any failure requires code changes during class.

### 13.8 CI/CD Minimum Pipeline

Every pull request must run:

```yaml
required_checks:
  - python: black --check . && python -m pytest
  - javascript: npm run lint && npm test
  - extension: getInfo block count and sync reporter tests
  - docs: markdown link check for docs/*.md
  - package: build Scratch editor and WeisileLink artifacts
  - desktop: python desktop/scripts/validate_desktop_assets.py && python -m pytest tests/test_desktop_packaging.py
  - installer-smoke: python -m pytest tests/test_desktop_install_smoke.py && python scripts/run_desktop_install_smoke.py --evidence <clean-machine-evidence.json> --report <install-smoke-report.md>
```

Merges are blocked when any required check fails.

---

## 14. Deployment

### 14.1 WeisileLink Service (Teacher Computer)

```bash
# Run with Docker Compose (local preview + WeisileLink)
docker compose -f deploy/docker-compose.yml config
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up

# Install
pip install -r weisile-link/requirements.txt

# Run as system service (macOS)
cp deploy/weisile-link.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/weisile-link.plist

# Run as system service (Linux)
sudo cp deploy/weisile-link.service /etc/systemd/system/
sudo systemctl enable --now weisile-link
```

### 14.2 EV3 Setup (One-time per brick)

```bash
# Flash ev3dev to SD card (done once)
# Insert SD card into EV3
# Connect EV3 via USB for initial setup

ssh robot@ev3dev.local
bash <(curl -s https://platform.vsle.cn/ev3/install.sh)
# This installs: vsle_ev3_server.py + dependencies + systemd autostart
```

### 14.3 Student Browser

Students access: `https://scratch.vsle.cn` (VSLE-hosted TurboWarp)

Or install locally:
```bash
cd packages/scratch-editor
npm install && npm run build
# Serve dist/ folder on local HTTP server
```

### 14.4 Deployment Configuration

All deployment-time values MUST be configurable through environment variables
or a checked-in example config file:

| Setting | Default | Required Rule |
|---------|---------|---------------|
| `WEISILE_LINK_HOST` | `127.0.0.1` | Bind localhost by default; LAN binding requires explicit teacher action |
| `WEISILE_LINK_PORT` | `20111` | Scratch JSON-RPC endpoint |
| `TRAINER_WS_PORT` | `8766` | Trainer subscription endpoint |
| `EV3_WS_PORT` | `8765` | EV3 firmware WebSocket endpoint |
| `WEISILE_PAIRING_TOKEN` | generated | Required for non-localhost clients |
| `MAX_COLLECTED_POINTS` | `10000` | Must remain bounded |
| `LOG_LEVEL` | `INFO` | `DEBUG` only for development |

Secrets and pairing tokens MUST NOT be committed to git.

### 14.5 Rollback and Recovery

Production releases must include:

- A versioned WeisileLink package with previous version retained locally.
- EV3 firmware install script that backs up the previous `vsle_ev3_server.py`.
- One-command rollback for teacher computers and EV3 bricks.
- A documented "classroom emergency stop": stop all motors, stop sound, clear
  command queue, disconnect EV3 transports, and preserve collected data.

### 14.6 Release Checklist

- [ ] Section 13.6 Critical Remediation Gates pass
- [ ] CI runs Python, JavaScript, lint, and packaging checks
- [ ] EV3 firmware package installed on a clean ev3dev SD card
- [ ] WeisileLink starts after reboot on the teacher computer
- [ ] Logs and health endpoints confirm transport, sensor rate, and client count
- [ ] Rollback tested at least once on both teacher computer and EV3

### 14.7 WeisileLink Desktop Distribution

The desktop distribution is the supported teacher-computer install path for
macOS and Windows. It wraps the existing WeisileLink core service with installer
assets, startup supervision, diagnostics, and OS-specific native adapter
boundaries.

Required release behavior:
- Bundle the Python runtime or ship a self-contained executable. Classroom
  artifacts must not use a teacher machine's system Python.
- Bind `20111` and `8766` to `127.0.0.1` by default. LAN binding requires an
  explicit teacher configuration and pairing-token setup.
- Provide documented install, upgrade, start, stop, health check, diagnostics
  export, crash restart, and uninstall flows.
- Sign release artifacts before external classroom distribution. macOS packages
  must be notarized before non-developer distribution.
- Preserve teacher configuration and pairing tokens during upgrade; remove
  startup entries and service files during uninstall.
- Write logs to documented user- or system-owned VSLE directories, not temporary
  folders.
- Redact pairing tokens, API keys, Bluetooth addresses unless explicitly
  included, oversized labels, and student raw data from diagnostics by default.
- Pass the install smoke evidence gate with `scripts/run_desktop_install_smoke.py`
  before any OS-specific desktop package or official firmware Bluetooth mode is
  marked classroom ready. The evidence JSON must come from an installed release
  artifact and must set `installed_from_release_artifact`,
  `started_after_reboot`, `scratch_link_endpoint_ok`, and
  `official_firmware_bt_real_ev3_ok` to true.
- Reject developer-checkout, localhost-only, or simulated-only evidence for
  classroom readiness claims.

macOS packaging must install a signed `WeisileLink.app` and a per-user
LaunchAgent. Windows packaging must provide a signed installer with either a
per-user startup task or a documented machine-wide service path for IT-managed
labs.

Official EV3 firmware Bluetooth compatibility is a separate desktop mode. It
uses host-native Bluetooth Classic adapters and EV3 Direct Commands; Python
stdlib RFCOMM is not a supported macOS/Windows path. This mode may cover basic
motor, touch, ultrasonic, color brightness, motor position, and sound workflows,
but it must remain labeled as a limited compatibility mode until native adapter
tests and real official-firmware EV3 smoke evidence pass on that OS.

---

## 15. Security, Privacy, and Safety

This platform controls physical robots around children. Security failures can
become physical safety failures, so security is a classroom launch blocker.

### 15.1 Threat Model

| Threat | Required Mitigation |
|--------|---------------------|
| Unauthorized motor command on classroom LAN | Pairing token, command allowlist, localhost binding by default |
| Malicious web page connecting to WeisileLink | Origin allowlist and token challenge before command acceptance |
| Oversized payload or label causing memory growth | Payload size limits and bounded data buffers |
| Student data leakage | Data minimization, local-first storage, explicit export/delete controls |
| Unsafe actuator values | Input validation and classroom speed/time limits |
| Lost connection while motors run | Transport watchdog stops motors on disconnect |

### 15.2 Transport Security

- WeisileLink binds to `127.0.0.1` by default.
- LAN access requires explicit teacher configuration and pairing token generation.
- Production browser access uses HTTPS/WSS.
- EV3 WiFi transport may run on classroom LAN without TLS only when isolated from
  the public internet; the pairing token still applies.
- EV3 firmware implements an `auth.pair` handshake before accepting command or
  sensor-stream clients when `WEISILE_PAIRING_TOKEN` is configured.
- Bluetooth is a fallback transport, not the primary classroom deployment path.

### 15.3 Privacy Requirements

The platform is used by students aged 7-15, so data handling must assume COPPA,
FERPA, GDPR-K, and local school policy sensitivity:

- Do not collect names, account IDs, photos, voice, or location in EV3 telemetry.
- Training labels are user-entered educational categories only; max 64 characters.
- Raw sensor data stays local unless a teacher explicitly exports or uploads it.
- Every export must include timestamp, project ID, and deletion instructions.
- Teacher-facing tooling must provide "delete collected data" and "clear session".

### 15.4 Physical Safety Controls

- Motor speeds are clamped to `-100..100`.
- Timed commands are capped at 60 seconds.
- On bridge disconnect, EV3 server must stop all motors within 500ms.
- Emergency stop command `motor.stopAll` must remain available even when data
  collection or Trainer upload is active.
- Firmware must reject unknown commands rather than ignore and continue silently.

## 16. Error Handling and Degradation

### 16.1 Error Code System

| Code | Meaning | Retryable |
|------|---------|-----------|
| `EV3_TRANSPORT_DISCONNECTED` | No active BT/WiFi transport | yes |
| `EV3_COMMAND_TIMEOUT` | Command ack not received before timeout | yes |
| `EV3_INVALID_COMMAND` | Method not in allowlist | no |
| `EV3_INVALID_PORT` | Motor/sensor port is invalid or absent | no |
| `EV3_SENSOR_STALE` | Sensor cache older than freshness budget | yes |
| `EV3_HARDWARE_ERROR` | ev3dev2 raised hardware exception | maybe |
| `TRAINER_UNAVAILABLE` | WeisileAI Trainer subscription/upload unavailable | yes |
| `DATA_BUFFER_FULL` | Collection buffer reached configured cap | no |

### 16.2 Degradation Rules

- In full VSLE mode, if WiFi fails, try Bluetooth only when the host OS supports
  verified stdlib RFCOMM and the EV3-side RFCOMM listener is configured.
- In official firmware compatibility mode, use only the OS-native Bluetooth
  adapter boundary; do not fall back to Python stdlib Bluetooth on macOS or
  Windows.
- If both transports fail, Scratch blocks remain visible but connection state is
  false and command blocks return JSON-RPC errors.
- If Trainer is unavailable, robot control and local data collection continue.
- If sensor data becomes stale for more than 200ms, reporter blocks return last
  known safe value and `isConnected` becomes false.
- If any command validation fails, do not send a partial command to EV3.

### 16.3 Reconnect Behavior

WeisileLink must use exponential backoff with jitter:

| Attempt | Delay |
|---------|-------|
| 1 | 0.5s |
| 2 | 1s |
| 3 | 2s |
| 4+ | 5s max |

On reconnect, WeisileLink refreshes sensor cache, clears pending command futures,
and leaves collected data intact.

## 17. Operations and Monitoring

### 17.1 Structured Logging

All services log structured JSON lines:

```json
{
  "ts": "2026-05-22T12:00:00.000Z",
  "level": "INFO",
  "service": "weisile-link",
  "event": "transport_connected",
  "transport": "wifi",
  "ev3_ip": "192.168.1.100"
}
```

Logs must never include pairing tokens or student-entered labels longer than
64 characters.

### 17.2 Health Checks

`GET /api/status` must include:

```json
{
  "ok": true,
  "transport": "wifi",
  "ev3_connected": true,
  "scratch_clients": 1,
  "trainer_clients": 1,
  "sensor_hz": 49.8,
  "sensor_age_ms": 12,
  "collected_points": 240,
  "memory_mb": 82
}
```

### 17.3 Metrics and Alerts

Minimum runtime metrics:

| Metric | Alert Threshold |
|--------|-----------------|
| `sensor_hz` | `<45Hz` for 10 seconds |
| `sensor_age_ms` | `>200ms` |
| `command_timeout_count` | `>3` in 60 seconds |
| `transport_reconnect_count` | `>5` in 10 minutes |
| `collected_points` | `>=MAX_COLLECTED_POINTS` |
| `memory_mb` | grows `>50MB` during 4-hour test |

Teacher-facing UI should translate alerts into plain recovery steps.

## 18. Compatibility Matrix

| Component | Supported | Notes |
|-----------|-----------|-------|
| Browser | Current Chrome/Edge/Safari | Must support WebSocket and TurboWarp build |
| Scratch runtime | TurboWarp fork | Unsandboxed Extension required |
| Teacher computer WiFi transport | macOS, Windows, Linux | Primary supported classroom path |
| Full VSLE Bluetooth transport | Primary no-WiFi full-module path when compatible EV3 WiFi dongles are unavailable | Real ev3dev command groups can pass through `vsle-bluetooth`; Mac browser full VSLE Bluetooth smoke is the first functional test path when no Windows host is available, while the 25ms high-speed gate and Production Release artifact gates remain separate |
| Teacher computer Bluetooth transport | macOS via project-owned native byte-stream adapter; Linux only where stdlib RFCOMM is verified; Windows pending target-host native evidence | Browser code must not open direct Bluetooth connections; Windows evidence remains separate from Mac smoke evidence |
| WeisileLink Desktop macOS | Internal Test Release unsigned artifact available; Production Release planned | Internal Test Release permits unsigned macOS builds with LaunchAgent, bundled runtime, localhost defaults, native adapter, and evidence report. Developer ID signing, notarization, and signed `.pkg` are Production Release Blocker items for external distribution. |
| WeisileLink Desktop Windows | Internal Test Release requires Windows host or GitHub Actions `windows-latest`; Production Release planned | Internal Test Release permits unsigned `WeisileLink.exe`/installer output on the target Windows host. Windows code signing certificate, timestamp URL, and SmartScreen/publisher reputation are Production Release Blocker items, not internal-test blockers. |
| Official EV3 firmware Bluetooth compatibility | Limited planned mode | Basic non-AI pack only until native adapter tests, release-artifact install smoke, and real official-firmware EV3 smoke evidence pass per OS |
| EV3 OS | ev3dev Stretch/Buster compatible image | Must support Python 3 and ev3dev2 |
| EV3 hardware | LEGO MINDSTORMS EV3 | WiFi USB dongle recommended |
| Python | 3.9+ on teacher computer; EV3-compatible Python on brick | Avoid pybluez |

## 19. Licensing and Open Source Compliance

### 19.1 License Position

The repository must include `LICENSE` and `NOTICE` before external release.
Planned license selection:

| Component | Upstream License | VSLE Handling |
|-----------|------------------|---------------|
| TurboWarp-derived editor | MIT | Preserve notices and modifications |
| ev3dev / ev3dev2 runtime | GPL-2.0 ecosystem | Keep firmware/server distribution compliant |
| New VSLE extension and bridge code | TBD before release | Recommended: MIT or Apache-2.0 |
| Scratch assets or visual patterns | Scratch/TurboWarp terms | Do not redistribute restricted assets without review |

### 19.2 Compliance Tasks

- Add root `LICENSE`.
- Add `NOTICE` listing TurboWarp, Scratch, LEGO EV3 references, ev3dev, and
  Python package dependencies.
- Document which assets are original VSLE-created assets.
- Avoid implying LEGO, Scratch, or MIT endorsement.

## 20. Document Governance

### 20.1 Required Follow-up Documents

The main specification must remain readable. Phase 2 should split detailed
material into:

- `docs/SECURITY_PRIVACY.md`
- `docs/API_REFERENCE.md`
- `docs/TEST_PLAN.md`
- `docs/DEPLOYMENT.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/EV3_BLOCK_REFERENCE.md`
- `docs/GLOSSARY.md`

### 20.2 Glossary

| Term | Definition |
|------|------------|
| Sensor Cache | In-memory 50Hz state store read synchronously by Scratch reporter blocks |
| WeisileLink | Python bridge replacing Scratch Link while preserving JSON-RPC compatibility |
| Trainer | WeisileAI data collection and model training interface |
| Unsandboxed Extension | TurboWarp extension mode that runs without Worker isolation for low latency |
| Classroom Deployment | Any pilot or production use with students present |

### 20.3 Change Control

- Every completed development or documentation step must be committed.
- Every completed step must be logged in `Development Progress Log`.
- Critical remediation items must not be closed without verification evidence.
- Status may change from conditional to approved only after Section 13.6 gates pass.

### 20.4 Revision History

| Version | Date | Change |
|---------|------|--------|
| v1.0 | 2026-05-22 | Initial unified platform specification |
| v1.0-audit-remediated | 2026-05-22 | Added audit-driven security, reliability, operations, testing, deployment, licensing, and governance requirements |
| v1.0-round2-remediated | 2026-05-22 | Closed second-audit remaining items: typo fix, Python task API update, EV3 pairing handshake, hardware detection implementation guidance, and time-series data-store debt |

### 20.5 Technical Debt Register

| ID | Topic | Status | Decision Needed By | Notes |
|----|-------|--------|--------------------|-------|
| TD-01 | Time-series data store for long-running classroom telemetry | Open | Phase 2 data pipeline design | Choose between InfluxDB, TimescaleDB, or local file-backed storage after measuring classroom retention, query, and deployment needs. Phase 1 remains local-first with bounded in-memory buffers and explicit CSV export. |

---

## Appendix A: Feasibility Report Key Findings vs Implementation

| Finding (from scratch_ev3_feasibility_report.docx) | Implementation Decision |
|-----------------------------------------------------|------------------------|
| Official EV3 extension has only 11 blocks, <40% sensor coverage | → 64 blocks, 100% coverage |
| Scratch Link Mailbox is unidirectional; cannot push sensor data | → ev3dev server pushes at 50Hz |
| pyscrlink dropped EV3 BT Classic support | → Python `socket` stdlib RFCOMM, no pybluez |
| WiFi latency 5-20ms vs BT 10-100ms | → WiFi recommended; BT as fallback |
| Unsandboxed Extension eliminates 1s+ block delay | → Unsandboxed as sole extension type |
| ev3dev supports 50,000+ Debian packages | → Full Python ecosystem on EV3 |
| ARM9 300MHz no FPU — limits computation on EV3 | → All ML computation in WeisileAI Trainer, not EV3 |
| EV3 sysfs "everything is a file" design | → ev3dev2 library abstracts sysfs cleanly |
| 20-31 person-month development estimate | → Phase 1 target: 4 weeks MVP (focused scope) |
| Dual transport strategy recommended | → WiFi (primary) + BT Classic (fallback) ✅ |

---

## Development Progress Log

> This section is maintained automatically. Every completed task is recorded here before moving to the next step.
> Format: date · commit hash · what was done · files touched · next step.

### [2026-05-22] Project boundary and workflow rules established
- **Status**: ✅ Completed
- **Commit**: _(initial — no code changes yet)_
- **What was done**: Added mandatory project boundary rules to CLAUDE.md — all files strictly under `/Users/yukii/Desktop/EV3SC/`, git commit required after every step, progress log entry required after every step.
- **Files created/modified**: `CLAUDE.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: `git init` in EV3SC if not already a repo, then begin Phase 1 — `vsle_ev3_server.py` + `wifi_transport.py`.

### [2026-05-22] Audit remediation requirements incorporated
- **Status**: ✅ Completed
- **Commit**: `72394b6`
- **What was done**: Updated the platform specification using `vsle_document_audit_final.md`. The spec now marks classroom deployment as blocked until critical remediation gates pass, adds security/privacy/safety, error handling, operations, compatibility, licensing, and governance sections, and corrects known code risks documented by the audit.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement and verify the Section 13.6 Critical Remediation Gates before any classroom pilot.

### [2026-05-22] Round two audit findings resolved
- **Status**: ✅ Completed
- **Commit**: `4410881`
- **What was done**: Applied the remaining findings from `vsle_audit_round2_final.md`. Fixed the ultrasonic inch opcode spelling, replaced the deprecated asyncio task API in the WiFi transport example, added EV3 `auth.pair` token handshake logic, strengthened hardware detection guidance in the server example, and recorded the time-series data-store decision as technical debt.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Begin Phase 1 implementation against the updated Critical Remediation Gates and resolve `TD-01` during Phase 2 data pipeline design.

### [2026-05-22] GitHub and open-source workflow rules added
- **Status**: ✅ Completed
- **Commit**: `bed3338`
- **What was done**: Updated `AGENTS.md` and `CLAUDE.md` so every completed-step commit must be pushed to GitHub, and EV3/Scratch development must use open-source source code, official repositories, official documentation, or verified local ports instead of invented APIs. Attempted `git push`, but GitHub sync is currently blocked because no remote is configured.
- **Files created/modified**: `AGENTS.md`, `CLAUDE.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Configure a GitHub `origin` remote for `/Users/yukii/Desktop/EV3SC/`, then push the pending commits.

### [2026-05-22] GitHub origin configured and synchronized
- **Status**: ✅ Completed
- **Commit**: `5b3547b`
- **What was done**: Confirmed `origin` is configured as `https://github.com/lostmyukii/EV3SC.git` and the local `main` branch is synchronized with `origin/main`. The previous GitHub blocker is cleared; future completed-step commits must be pushed immediately.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Continue Phase 1 work with source-backed EV3/Scratch implementation and push every completed-step commit to GitHub.

### [2026-05-22] WeisileLink JSON-RPC validation baseline
- **Status**: ✅ Completed
- **Commit**: `bbefe96`
- **What was done**: Created the `weisile-link` Python project skeleton with JSON-RPC 2.0 response helpers, request parsing, VSLE EV3 command allowlist validation, structured protocol errors, and tests. Added `docs/SOURCE_REGISTER.md` to record the Scratch Link, Scratch VM EV3 extension, JSON-RPC, and VSLE spec sources used for this source-backed implementation.
- **Files created/modified**: `.gitignore`, `docs/SOURCE_REGISTER.md`, `weisile-link/pyproject.toml`, `weisile-link/weisile_link/protocol/*.py`, `weisile-link/tests/*.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement WeisileLink error-code mapping and reconnect/degradation skeleton based on Section 16, reusing the JSON-RPC helpers from this step.

### [2026-05-22] Complete scoped implementation rule added
- **Status**: ✅ Completed
- **Commit**: `fbf2535`
- **What was done**: Updated `AGENTS.md` and `CLAUDE.md` so completed development steps cannot be minimal, placeholder, happy-path-only, or patch-later work. Each scoped step now must include the full required behavior, validation, error handling, source-backed API behavior, tests, and documentation/progress updates for that scope.
- **Files created/modified**: `AGENTS.md`, `CLAUDE.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement WeisileLink error-code mapping and reconnect/degradation skeleton based on Section 16, reusing the JSON-RPC helpers from the completed baseline.

### [2026-05-22] WeisileLink error and degradation baseline
- **Status**: ✅ Completed
- **Commit**: `2523510`
- **What was done**: Added the Section 16 error catalog and retryability metadata, runtime exception-to-protocol mapping, EV3 ack-to-JSON-RPC translation, reconnect backoff policy with jitter, and degradation state handling for WiFi/BT fallback, Trainer outages, stale sensors, pending command clearing, and bounded data buffers. Added unit tests covering all spec error codes and the reconnect/degradation rules, and configured Black with the project-required 80-character line limit.
- **Files created/modified**: `docs/SOURCE_REGISTER.md`, `weisile-link/pyproject.toml`, `weisile-link/weisile_link/protocol/error_mapping.py`, `weisile-link/weisile_link/runtime/*.py`, `weisile-link/tests/test_error_mapping.py`, `weisile-link/tests/test_reconnect_degradation.py`, formatting updates in `weisile-link/weisile_link/protocol/json_rpc.py` and `weisile-link/weisile_link/protocol/validation.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement WeisileLink health check and structured logging baseline from Section 17, including `/api/status` shape, transport/sensor counters, and token-safe JSON log records.

### [2026-05-22] WeisileLink health and structured logging baseline
- **Status**: ✅ Completed
- **Commit**: `9880416`
- **What was done**: Added a Section 17 observability baseline with framework-neutral `GET /api/status` handling, status payload generation, alert threshold evaluation, UTC JSON structured logs, and log sanitization that redacts token-like fields and truncates labels to 64 characters. Added tests for connected/disconnected health payloads, alert thresholds, status endpoint routing, and token-safe log output.
- **Files created/modified**: `docs/SOURCE_REGISTER.md`, `weisile-link/weisile_link/observability/*.py`, `weisile-link/tests/test_observability.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement ev3dev SD card preparation and autostart documentation/scripts, keeping all generated project files under `/Users/yukii/Desktop/EV3SC/`.

### [2026-05-22] ev3dev SD card and autostart setup
- **Status**: ✅ Completed
- **Commit**: `fcb2776`
- **What was done**: Added official-source-backed EV3 setup documentation, a systemd service unit for `vsle_ev3_server.py`, install and rollback scripts that back up existing EV3 files, generate a local pairing token env file, install `websockets` and `ev3dev2`, enable autostart, and fail closed when the server file is absent. Added tests for service contents, bash syntax, executable permissions, installer behavior, rollback behavior, and setup documentation coverage.
- **Files created/modified**: `docs/EV3DEV_SETUP.md`, `docs/SOURCE_REGISTER.md`, `ev3-firmware/README.md`, `ev3-firmware/scripts/*.sh`, `ev3-firmware/systemd/vsle-ev3-server.service`, `tests/test_ev3_autostart_assets.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement `ev3-firmware/vsle_ev3_server.py` with sensor loop, motor control, pairing handshake, command validation, and safety shutdown behavior based on the spec and ev3dev2 documentation.

### [2026-05-22] ev3dev server sensor loop and motor control
- **Status**: ✅ Completed
- **Commit**: `d78b78b`
- **What was done**: Added the EV3 brick WebSocket server with pairing-token handshake, 50Hz sensor broadcast loop, command validation/clamping, motor/sound/display/gyro/data command dispatch, bounded data collection, and fail-safe motor stop on client disconnect or shutdown. Added source-backed unit tests for authentication, invalid commands, command normalization, hardware dispatch, sensor payload shape, data buffer limits, disconnect safety, and server startup options.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement `weisile-link/weisile_link/transport/wifi_transport.py` for WeisileLink-to-EV3 WebSocket transport, reusing the existing error mapping, reconnect/degradation, health, and EV3 ack handling baselines.

### [2026-05-22] WeisileLink WiFi WebSocket transport
- **Status**: ✅ Completed
- **Commit**: `1041105`
- **What was done**: Added the WeisileLink WiFi transport for connecting to `vsle_ev3_server.py`, including pairing-token auth, a single receive loop that routes 50Hz sensor updates and resolves command ack futures, EV3 command validation/normalization before send, timeout handling, disconnect handling, pending-command cleanup, and degradation state updates. Added tests covering pairing, sensor cache updates, command ack resolution, validation fail-closed behavior, command timeout, pairing failure, and EV3 disconnects.
- **Files created/modified**: `weisile-link/weisile_link/transport/*.py`, `weisile-link/weisile_link/runtime/degradation.py`, `weisile-link/tests/test_wifi_transport.py`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement `weisile-link/weisile_link/json_rpc_server.py` as the Scratch-compatible local JSON-RPC/WebSocket server on `ws://localhost:20111/scratch/bt`, using the WiFi transport, JSON-RPC helpers, EV3 ack mapping, and observability baselines.

### [2026-05-22] Scratch-compatible JSON-RPC server
- **Status**: ✅ Completed
- **Commit**: `42a25bb`
- **What was done**: Added the local Scratch Link compatible JSON-RPC/WebSocket server for `ws://127.0.0.1:20111/scratch/bt`, including path rejection, `getVersion`, `discover`, `connect`, high-level `send`, direct VSLE EV3 method forwarding, notification subscription handling, EV3 ack-to-JSON-RPC mapping, transport error mapping, sensor update notifications for VSLE and official Scratch VM method names, JSON-RPC notification no-response semantics, and `/api/status` integration. Added tests for all server paths and preserved the source register with Scratch Link and Scratch VM references.
- **Files created/modified**: `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_json_rpc_server.py`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement the VSLE-EV3 unsandboxed extension skeleton and the first 14 motor blocks, porting from the verified local Scratch VM EV3 extension style without changing Scratch visual design.

### [2026-05-22] VSLE-EV3 unsandboxed motor blocks
- **Status**: ✅ Completed
- **Commit**: `7fe564f`
- **What was done**: Added the TurboWarp Unsandboxed VSLE-EV3 extension skeleton, the full Phase 1 14-block motor category, JSON-RPC 2.0 command dispatch to the local WeisileLink Scratch endpoint, Scratch Link base64 sensor notification ingestion into `SensorCache`, and synchronous motor reporter/Boolean cache reads. Added Node tests and a no-dependency development entry point for checking, testing, and serving the extension.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/package.json`, `vsle-ev3-extension/README.md`, `docs/SOURCE_REGISTER.md`, `tests/test_ev3_autostart_assets.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement SensorCache + 20 sensor blocks for color, ultrasonic, gyro, touch, and infrared reporters/booleans, keeping all reporter and Boolean blocks synchronous cache reads.

### [2026-05-22] Sensor cache and sensor blocks
- **Status**: ✅ Completed
- **Commit**: `9c9add1`
- **What was done**: Expanded the VSLE-EV3 extension from 14 motor blocks to 34 Phase 1 blocks by adding the 20 sensor/system blocks, a defaulted deep-merge `SensorCache`, synchronous cache-backed reporter/Boolean reads, cache-polled touch wait blocks, and `gyro.reset` command dispatch. Extended the EV3 sensor snapshot for infrared beacon and remote channel data using the official ev3dev2 InfraredSensor API, and added tests for all new extension behavior plus IR payload shape.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/README.md`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Run TurboWarp integration testing for the Phase 1 Scratch extension flow, including loading the Unsandboxed extension, confirming Scratch visual design remains unchanged, and verifying EV3 motor/sensor acceptance criteria against the local WeisileLink server.

### [2026-05-22] TurboWarp integration test baseline
- **Status**: ✅ Completed
- **Commit**: `243ef16`
- **What was done**: Added a repeatable TurboWarp-style integration harness that loads the extension through a global `Scratch` object, verifies Unsandboxed registration, confirms all 34 Phase 1 blocks are exposed, guards against Scratch GUI DOM access, sends a motor command through the local WeisileLink JSON-RPC endpoint shape, and injects base64 sensor notifications into `SensorCache`. Added a Phase 1 integration report that records automated coverage and clearly separates simulated checks from real EV3 hardware, screenshot-diff, and classroom rehearsal gates.
- **Files created/modified**: `vsle-ev3-extension/tests/test_turbowarp_integration.js`, `vsle-ev3-extension/package.json`, `vsle-ev3-extension/README.md`, `docs/TURBOWARP_PHASE1_INTEGRATION.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Begin Phase 2 by implementing the 14 sound and display blocks, source-backed by the existing EV3 server command handlers and ev3dev2 sound/display APIs.

### [2026-05-22] Sound and display block baseline
- **Status**: ✅ Completed
- **Commit**: `efd18d7`
- **What was done**: Added the Phase 2 sound and display block group to the Unsandboxed VSLE-EV3 extension, expanding the exposed block set from 34 to 48 blocks. Extended WeisileLink validation and the EV3 server with source-backed sound file, volume, tone, display text, number, image, drawing, and LCD update command handling, including fail-closed asset name validation and cross-layer tests.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/tests/test_turbowarp_integration.js`, `vsle-ev3-extension/README.md`, `weisile-link/weisile_link/protocol/validation.py`, `weisile-link/tests/test_validation.py`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/TURBOWARP_PHASE1_INTEGRATION.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement the Phase 2 system and data collection blocks, including extension commands, WeisileLink validation, EV3 server dispatch, cache-backed system reporters, and tests.

### [2026-05-22] System and data collection block baseline
- **Status**: ✅ Completed
- **Commit**: `d06b1f4`
- **What was done**: Added the remaining Phase 2 system and AI Quest data collection block group, expanding the Unsandboxed extension to the full 62-block VSLE EV3 surface. Extended WeisileLink validation and EV3 firmware dispatch for status light control, emergency stop, cache-backed connection/battery/data reporters, bounded auto collection, CSV export, and Trainer-unavailable degradation.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/tests/test_turbowarp_integration.js`, `vsle-ev3-extension/README.md`, `weisile-link/weisile_link/protocol/validation.py`, `weisile-link/tests/test_validation.py`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/TURBOWARP_PHASE1_INTEGRATION.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement Bluetooth Classic transport as the Phase 2 fallback transport, using Python stdlib RFCOMM where supported and preserving the WiFi transport/degradation behavior.

### [2026-05-22] Standalone EV3SC ownership rule
- **Status**: ✅ Completed
- **Commit**: `8a3be37`
- **What was done**: Updated assistant workflow rules so `/Users/yukii/Desktop/EV3SC/` must independently contain the complete VSLE Scratch-EV3 implementation, including runtime code, tests, docs, setup scripts, and deployment assets. External folders such as `/Users/yukii/Desktop/scratch ai/` are now explicitly source references only and cannot be required at runtime, test time, build time, or deployment time.
- **Files created/modified**: `AGENTS.md`, `CLAUDE.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement Bluetooth Classic transport as the Phase 2 fallback transport, using Python stdlib RFCOMM where supported and preserving the WiFi transport/degradation behavior.

### [2026-05-23] Bluetooth Classic fallback transport
- **Status**: ✅ Completed
- **Commit**: `5faef4a`
- **What was done**: Added a source-backed WeisileLink Bluetooth Classic RFCOMM transport that uses Python stdlib sockets, validates commands before send, resolves EV3 ack futures, routes sensor updates into the shared cache, handles pairing, timeout, disconnect, and Linux-only stdlib RFCOMM support checks. Added WiFi-first auto transport fallback, `vsle.setTransport` switching, and an optional EV3-side RFCOMM JSON-line listener that reuses the existing EV3 pairing, command, ack, sensor, and safety shutdown behavior.
- **Files created/modified**: `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/weisile_link/transport/selector.py`, `weisile-link/weisile_link/transport/__init__.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_bluetooth_transport.py`, `weisile-link/tests/test_transport_selector.py`, `weisile-link/tests/test_json_rpc_server.py`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/EV3DEV_SETUP.md`, `ev3-firmware/README.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement the Phase 2 sensor data router and WeisileAI Trainer integration, including multi-consumer 50Hz broadcast, Trainer subscription/upload path, health counters, and tests.

### [2026-05-23] Sensor router and WeisileAI Trainer integration
- **Status**: ✅ Completed
- **Commit**: `9ab9987`
- **What was done**: Added a WeisileLink `SensorDataRouter` that broadcasts each EV3 `sensor_update` concurrently to Scratch JSON-RPC notification consumers and WeisileAI Trainer `sensor_stream` consumers. Added a bounded local Trainer buffer, CSV export, Trainer WebSocket endpoint on port `8766`, `data.uploadToTrainer` availability handling, Trainer client health counts, and internal Trainer REST routes for sensors, motors, collected data, clear, export, and direct EV3 command dispatch.
- **Files created/modified**: `weisile-link/weisile_link/router/__init__.py`, `weisile-link/weisile_link/router/sensor_router.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_sensor_router.py`, `weisile-link/tests/test_json_rpc_server.py`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 2 multi-EV3 session management, including per-brick session identity, routing isolation, client-visible status, and tests.

### [2026-05-23] Multi-EV3 session management
- **Status**: ✅ Completed
- **Commit**: `7fa5fc5`
- **What was done**: Added per-brick WeisileLink EV3 sessions, Scratch peripheral discovery/connect routing by `peripheralId`, isolated per-session sensor routers and training buffers, Trainer streams tagged with `brick_id`, per-session REST filters, and `/api/status` session summaries.
- **Files created/modified**: `weisile-link/weisile_link/sessions.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/weisile_link/router/sensor_router.py`, `weisile-link/tests/test_multi_ev3_sessions.py`, `weisile-link/tests/test_json_rpc_server.py`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 2 sensor data panel UI, keeping Scratch visual identity unchanged and using cache-backed sensor status.

### [2026-05-23] Sensor data panel UI
- **Status**: ✅ Completed
- **Commit**: `43cfa0f`
- **What was done**: Added a cache-backed, collapsible Scratch-style EV3 sensor panel with normalized sensor/motor/collection state, 280px additive panel rendering, explicit host mounting, collection/upload action bindings, and tests that preserve the no-DOM-load TurboWarp boundary. The implementation is fully inside EV3SC and reads from `SensorCache` instead of making network requests.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/src/ui/data_panel.js`, `vsle-ev3-extension/tests/test_sensor_data_panel.js`, `vsle-ev3-extension/package.json`, `vsle-ev3-extension/README.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 2 connection modal polish for WiFi/Bluetooth selection, preserving Scratch's standard hardware connection modal style.

### [2026-05-23] Connection modal polish
- **Status**: ✅ Completed
- **Commit**: `4d1c7a6`
- **What was done**: Added a Scratch-style EV3 connection modal with WiFi IP and Bluetooth address selection, explicit host mounting, the official EV3 icon copied into EV3SC, and `vsle.setTransport` action binding. Extended WeisileLink transport switching so modal-submitted `ev3_ip` and `ev3_bt` reconfigure WiFi/Bluetooth endpoints before reconnecting.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/src/ui/connection_modal.js`, `vsle-ev3-extension/tests/test_connection_modal.js`, `vsle-ev3-extension/assets/ev3-small.svg`, `vsle-ev3-extension/package.json`, `vsle-ev3-extension/README.md`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/weisile_link/sessions.py`, `weisile-link/weisile_link/transport/wifi_transport.py`, `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/weisile_link/transport/selector.py`, `weisile-link/tests/test_json_rpc_server.py`, `weisile-link/tests/test_wifi_transport.py`, `weisile-link/tests/test_bluetooth_transport.py`, `docs/SOURCE_REGISTER.md`
- **Next step**: Begin Phase 3 AI Quest data collection sample projects, including source-backed sample workflows for record, upload, train, and export.

### [2026-05-23] AI Quest data collection sample projects
- **Status**: ✅ Completed
- **Commit**: `9173a85`
- **What was done**: Added the first Phase 3 AI Quest sample package with three source-backed classroom workflows for obstacle avoidance, line patrol, and touch-stop safety. Each sample validates the `record -> upload -> train -> export` flow, uses current `vsleev3_*` block opcodes from the extension, documents privacy/deletion controls, and can export Scratch `project.json` files for TurboWarp/Scratch packaging.
- **Files created/modified**: `ai-quest-samples/index.js`, `ai-quest-samples/package.json`, `ai-quest-samples/projects/*.json`, `ai-quest-samples/scripts/export_project_json.js`, `ai-quest-samples/tests/test_samples.js`, `ai-quest-samples/README.md`, `docs/AI_QUEST_SAMPLE_PROJECTS.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 3 motor PID parameter blocks, source-backed by ev3dev2 motor PID attributes and end-to-end validation across VSLE extension, WeisileLink, and EV3 firmware.

### [2026-05-23] Local frontend/backend preview stack
- **Status**: ✅ Completed
- **Commit**: `485ef4d`
- **What was done**: Added a development-only preview page that mounts the existing VSLE-EV3 extension bundle, connection modal, sensor panel, and AI Quest sample cards against a simulated EV3 transport. The preview backend reuses the real WeisileLink Scratch JSON-RPC server and Trainer WebSocket endpoint, and the integration now handles current `websockets` request-path behavior plus EV3 epoch-second timestamps in `SensorCache`.
- **Files created/modified**: `preview/index.html`, `preview/styles.css`, `preview/app.js`, `preview/weisile_preview_server.py`, `preview/package.json`, `preview/tests/test_preview_static.js`, `preview/README.md`, `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `weisile-link/pyproject.toml`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_json_rpc_server.py`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 3 motor PID parameter blocks, source-backed by ev3dev2 motor PID attributes and end-to-end validation across VSLE extension, WeisileLink, and EV3 firmware.

### [2026-05-23] Motor PID parameter blocks
- **Status**: ✅ Completed
- **Commit**: `707cd3f`
- **What was done**: Added two Phase 3 motor PID blocks, `motorSetPID` and `getMotorPID`, expanding the current VSLE-EV3 extension surface to 64 blocks. The implementation validates and clamps PID parameters in WeisileLink and EV3 firmware, maps `speed`/`position` PID terms to ev3dev2 motor attributes, streams PID values through the motor cache, and keeps PID reporter reads synchronous.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/tests/test_turbowarp_integration.js`, `vsle-ev3-extension/README.md`, `weisile-link/weisile_link/protocol/validation.py`, `weisile-link/tests/test_validation.py`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/SOURCE_REGISTER.md`, `docs/TURBOWARP_PHASE1_INTEGRATION.md`, `AGENTS.md`, `CLAUDE.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement Phase 3 EV3 data → WeisileAI Trainer training pipeline E2E, including record/upload/train/export validation and tests.

### [2026-05-23] EV3 data to WeisileAI Trainer E2E pipeline
- **Status**: ✅ Completed
- **Commit**: `3d46fc7`
- **What was done**: Added a local WeisileAI Trainer decision-tree pipeline that trains from collected EV3 sensor rows, enforces the 70% classroom accuracy gate, stores one trained model per EV3 session, and exports `model_rules.json` without raw student data. Added Trainer REST routes for `POST /api/trainer/train` and `POST /api/trainer/export`, plus end-to-end record/upload/train/export tests.
- **Files created/modified**: `weisile-link/weisile_link/trainer_pipeline.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/weisile_link/sessions.py`, `weisile-link/tests/test_trainer_pipeline.py`, `weisile-link/tests/test_json_rpc_server.py`, `docs/AI_QUEST_SAMPLE_PROJECTS.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement Phase 3 Docker deployment packaging, including standalone service/container definitions and deployment validation inside EV3SC.

### [2026-05-23] Docker deployment packaging
- **Status**: ✅ Completed
- **Commit**: `e641b46`
- **What was done**: Added a standalone Docker deployment package with a non-root WeisileLink image, localhost-only Compose services for WeisileLink and the local preview, safe environment defaults, native Linux/macOS service templates, and deployment validation checks. Added a packaged `python -m weisile_link` entrypoint and root pytest configuration so deployment and WeisileLink tests can run together from the EV3SC root.
- **Files created/modified**: `.dockerignore`, `deploy/Dockerfile.weisile-link`, `deploy/docker-compose.yml`, `deploy/env.example`, `deploy/README.md`, `deploy/weisile-link.service`, `deploy/weisile-link.plist`, `deploy/scripts/validate_deployment_assets.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/__main__.py`, `tests/test_deployment_packaging.py`, `pyproject.toml`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement Phase 3 teacher guide + student workbooks, including classroom-ready lesson flow, AI Quest worksheets, troubleshooting, and verification docs.

### [2026-05-23] Teacher guide and student workbooks
- **Status**: ✅ Completed
- **Commit**: `17b3b87`
- **What was done**: Added classroom-ready teacher guidance and three student workbooks aligned to the AI Quest sample manifests for obstacle avoidance, line patrol, and touch-stop safety. The materials cover the 45-minute lesson flow, teacher preflight, Scratch visual identity constraints, safety, privacy, troubleshooting, assessment, prediction testing, exports, and cleanup.
- **Files created/modified**: `docs/classroom/README.md`, `docs/classroom/TEACHER_GUIDE.md`, `docs/classroom/WORKBOOK_OBSTACLE_AVOIDANCE.md`, `docs/classroom/WORKBOOK_LINE_PATROL.md`, `docs/classroom/WORKBOOK_TOUCH_STOP_SAFETY.md`, `tests/test_classroom_docs.py`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 3 performance testing, including 50Hz sustained stream validation, 4-hour session simulation, drift bounds, dropped-update thresholds, and reporting.

### [2026-05-23] 50Hz sustained performance testing
- **Status**: ✅ Completed
- **Commit**: `c4e35b6`
- **What was done**: Added a source-backed Phase 3 performance harness for deterministic 4-hour 50Hz session simulation, dropped-update threshold checks, drift bounds, memory-growth gates, JSON/Markdown reporting, and classroom rehearsal documentation. Added regression tests for pass/fail gates and generated the checked-in 50Hz sustained report artifacts.
- **Files created/modified**: `performance/__init__.py`, `performance/sustained_50hz.py`, `tests/test_performance_50hz.py`, `docs/performance/PERFORMANCE_50HZ.md`, `docs/performance/50hz_sustained_report.json`, `docs/performance/50hz_sustained_report.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement Phase 3 security review, including localhost-only defaults, pairing-token verification, command validation review, privacy/deletion checks, and documentation of any remaining deployment blockers.

### [2026-05-23] Phase 3 security review
- **Status**: ✅ Completed
- **Commit**: `e8efbf3`
- **What was done**: Added browser Origin allowlist enforcement for the Scratch-compatible WeisileLink WebSocket server, configurable through `WEISILE_ALLOWED_ORIGINS`, while preserving localhost defaults and native client compatibility. Added a Phase 3 security review report covering Section 13.6 and Section 15 gates, plus tests for localhost binding, pairing-token behavior, command validation, privacy/delete controls, bounded buffers, and token-safe logs.
- **Files created/modified**: `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/tests/test_json_rpc_server.py`, `tests/test_security_review.py`, `docs/security/SECURITY_REVIEW.md`, `deploy/env.example`, `deploy/README.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the final release readiness and classroom hardware acceptance pass, including Section 14.6 release checklist review, Section 13.7 30-device rehearsal planning, and any real-EV3 hardware evidence the pilot requires.

### [2026-05-23] ScratchAI VSLE-EV3 integration design
- **Status**: ✅ Completed
- **Commit**: `bd5b957`
- **What was done**: Captured the confirmed requirement that ScratchAI is the main product surface and its `EV3` extension entry must load the complete self-developed VSLE-EV3 module instead of Scratch's official 11-block EV3 extension. The design also defines old official EV3 project compatibility, AI Quest cloud API boundaries, raw EV3 time-series upload, model scopes, cloud/cached/local fallback prediction, and required tests.
- **Files created/modified**: `docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md`
- **Next step**: User review of the written design, then implementation planning for porting ScratchAI into EV3SC and running baseline ScratchAI regression checks.

### [2026-05-23] ScratchAI port baseline implementation plan
- **Status**: ✅ Completed
- **Commit**: `a56e933`
- **What was done**: Added the first implementation plan after the ScratchAI VSLE-EV3 design, scoped to porting ScratchAI into EV3SC and proving a standalone baseline before replacing the EV3 extension entry. The plan decomposes port tooling, source copy, standalone checks, service tests, editor baseline checks, commit/push/log requirements, and verification commands.
- **Files created/modified**: `docs/superpowers/plans/2026-05-23-scratchai-port-baseline.md`
- **Next step**: Choose the execution mode for the plan: Subagent-Driven or Inline Execution.

### [2026-05-23] ScratchAI port tooling
- **Status**: ✅ Completed
- **Commit**: `25cf27b`
- **What was done**: Added deterministic ScratchAI port tooling that copies source from the authorized local scratchai reference into EV3SC while excluding generated dependency and build artifacts. Added pytest coverage for exclusion and overwrite behavior.
- **Files created/modified**: `.gitignore`, `scripts/port_scratchai_platform.py`, `tests/test_scratchai_port_scripts.py`
- **Next step**: Use the port tool to create the EV3SC-owned `scratch-ai-platform/` source tree.

### [2026-05-23] ScratchAI source port
- **Status**: ✅ Completed
- **Commit**: `ee3cf8b`
- **What was done**: Ported the complete ScratchAI platform source into EV3SC under `scratch-ai-platform/` while excluding generated dependency and build artifacts. The copied source now gives EV3SC in-repo ownership of ScratchAI editor, middleware, asset worker, preview server, scripts, lockfiles, tests, and docs needed for later EV3 integration.
- **Files created/modified**: `scratch-ai-platform/**`
- **Next step**: Add standalone ownership checks that fail if the copied ScratchAI tree depends on the original scratchai folder.

### [2026-05-23] ScratchAI standalone ownership checks
- **Status**: ✅ Completed
- **Commit**: `41d0c20`
- **What was done**: Added standalone verification for the EV3SC-owned ScratchAI copy, including required package checks, symlink escape detection, and package script checks that reject dependencies on `/Users/yukii/Desktop/scratch ai/`.
- **Files created/modified**: `scripts/check_scratchai_standalone.py`, `tests/test_scratchai_port_scripts.py`
- **Next step**: Run ScratchAI service package tests inside EV3SC and record baseline results.

### [2026-05-23] ScratchAI service baseline
- **Status**: ✅ Completed
- **Commit**: `f91c0e0`
- **What was done**: Ran baseline tests for the EV3SC-owned ScratchAI middleware, asset worker, preview server, standalone ownership checker, and port verification scripts. Recorded the command results in the ScratchAI baseline report.
- **Files created/modified**: `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Install Scratch editor dependencies from the EV3SC-owned lockfile and run the first Scratch editor baseline checks.

### [2026-05-23] ScratchAI microbit prepare fallback
- **Status**: ✅ Completed
- **Commit**: `9a2ce11`
- **What was done**: Updated the EV3SC-owned Scratch GUI prepare script to reuse an existing local microbit hex file before falling back to the Scratch download URL. This keeps `npm ci` compatible with the locally ported ScratchAI source when Node fetch cannot reach `downloads.scratch.mit.edu` through the current network path.
- **Files created/modified**: `scratch-ai-platform/scratch-editor/packages/scratch-gui/scripts/prepare.mjs`
- **Next step**: Retry Scratch editor dependency installation and continue the editor baseline checks.

### [2026-05-23] ScratchAI nested husky install guard
- **Status**: ✅ Completed
- **Commit**: `52b69f5`
- **What was done**: Added a Scratch editor prepare guard so husky hook installation only runs when the ported `scratch-editor/` directory is itself a git checkout. This lets `npm ci` run inside EV3SC's nested ScratchAI source tree without failing on a missing `scratch-editor/.git` directory.
- **Files created/modified**: `scratch-ai-platform/scratch-editor/package.json`, `scratch-ai-platform/scratch-editor/scripts/install-husky-if-git.mjs`
- **Next step**: Retry Scratch editor dependency installation and continue the editor baseline checks.

### [2026-05-23] ScratchAI editor baseline
- **Status**: ✅ Completed
- **Commit**: `635881b`
- **What was done**: Installed Scratch editor dependencies from the EV3SC-owned lockfile, built the local Scratch renderer/VM workspace artifacts required by the nested ScratchAI editor, ran targeted ScratchAI VM smoke tests, and verified the Scratch GUI development build succeeds. Recorded the exact commands, fallback notes, and generated-artifact ignore checks in the ScratchAI baseline report.
- **Files created/modified**: `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Create a local ScratchAI preview startup path inside EV3SC and verify the Scratch editor loads before replacing the EV3 extension entry with VSLE-EV3.

### [2026-05-23] ScratchAI editor preview startup
- **Status**: ✅ Completed
- **Commit**: `8bdf87d`
- **What was done**: Added an EV3SC-local ScratchAI editor preview launcher and verifier that start the EV3SC-owned `scratch-gui` webpack server, embed ScratchAI feature flags, and verify the Scratch GUI HTML plus `gui.js` bundle. Confirmed the editor loads in Playwright Chromium with the Scratch title, Motion/Looks/Events categories, canvas rendering, and no page errors.
- **Files created/modified**: `scripts/start_scratchai_preview.py`, `scripts/verify_scratchai_preview.py`, `tests/test_scratchai_preview_startup.py`, `docs/scratchai/PREVIEW_STARTUP.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Replace the ScratchAI extension library `EV3` entry so clicking `EV3` loads the complete VSLE-EV3 implementation instead of Scratch's official EV3 extension.

### [2026-05-23] ScratchAI EV3 extension entry replacement
- **Status**: ✅ Completed
- **Commit**: `691c6e9`
- **What was done**: Replaced the EV3 extension-library entry in the EV3SC-owned ScratchAI editor so clicking `EV3` loads the complete VSLE-EV3 extension from an allowlisted Unsandboxed URL and selects the `vsleev3` category. Added the main-thread Unsandboxed loader path in Scratch VM, preserved Scratch visual metadata, aligned the EV3 block category name, and allowed the ScratchAI preview Origin through WeisileLink.
- **Files created/modified**: `scratch-ai-platform/scratch-editor/packages/scratch-gui/src/lib/libraries/extensions/index.jsx`, `scratch-ai-platform/scratch-editor/packages/scratch-gui/src/containers/extension-library.jsx`, `scratch-ai-platform/scratch-editor/packages/scratch-gui/webpack.config.js`, `scratch-ai-platform/scratch-editor/packages/scratch-gui/test/unit/util/extensions-library.test.jsx`, `scratch-ai-platform/scratch-editor/packages/scratch-gui/test/unit/containers/extension-library.test.jsx`, `scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-manager.js`, `scratch-ai-platform/scratch-editor/packages/scratch-vm/test/unit/extension_unsandboxed_loader.js`, `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_json_rpc_server.py`, `deploy/env.example`, `deploy/README.md`, `docs/security/SECURITY_REVIEW.md`, `docs/scratchai/PREVIEW_STARTUP.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement official Scratch EV3 project/block compatibility mapping so existing `.sb3` projects that reference Scratch's built-in EV3 opcodes automatically run through the complete VSLE-EV3 runtime in ScratchAI.

### [2026-05-23] ScratchAI official EV3 compatibility mapping
- **Status**: ✅ Completed
- **Commit**: `5180ee7`
- **What was done**: Added an EV3SC-owned Scratch VM compatibility extension for legacy official `ev3` projects, mapping all 11 official Scratch EV3 opcodes to VSLE JSON-RPC commands and synchronous `SensorCache` reporter reads. Replaced the VM built-in `ev3` loader with the compatibility runtime, verified old EV3 `.sb3` fixture loading, and documented the source-backed mapping plus ScratchAI external-service-policy test note.
- **Files created/modified**: `scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_vsle_ev3_compat/index.js`, `scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-manager.js`, `scratch-ai-platform/scratch-editor/packages/scratch-vm/test/unit/extension_vsle_ev3_compat.js`, `docs/scratchai/EV3_COMPATIBILITY_MAPPING.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Connect EV3 category AI Quest blocks to a server-side AI Quest API contract, including cloud-provider normalization, safe model references, and local/cache fallback behavior.

### [2026-05-23] ScratchAI EV3 AI Quest API contract
- **Status**: ✅ Completed
- **Commit**: `7eed4db`
- **What was done**: Added the EV3SC-owned AI Quest server-side contract used by ScratchAI EV3 blocks, including sanitized EV3 time-series upload, provider-response normalization, safe project/class/course model scopes, cloud/cached/localFallback prediction, and model export without raw datasets or credentials. Extended the VSLE-EV3 category with AI Quest upload, training, status, model selection, prediction, accuracy/mode reporter, Boolean label match, and export blocks.
- **Files created/modified**: `weisile-link/weisile_link/ai_quest_contract.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/weisile_link/router/sensor_router.py`, `weisile-link/tests/test_ai_quest_contract.py`, `weisile-link/tests/test_json_rpc_server_ai_quest.py`, `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/tests/test_turbowarp_integration.js`, `docs/scratchai/AI_QUEST_API_CONTRACT.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Add the real provider abstraction layer, including a WeisileAI provider shell, a mock third-party adapter, provider configuration, retry/error mapping, and provider-specific normalization tests behind the AI Quest contract.

### [2026-05-23] ScratchAI EV3 AI Quest provider abstraction
- **Status**: ✅ Completed
- **Commit**: `85ffd77`
- **What was done**: Added the EV3SC-owned AI Quest provider abstraction behind the ScratchAI EV3 contract, including server-side WeisileAI provider shell configuration, dependency-free HTTPS JSON calls, retryable provider error mapping, mock third-party response adaptation, deterministic local preview provider, and cloud-only model references for providers that return safe `model_id` values without local rules.
- **Files created/modified**: `weisile-link/weisile_link/ai_quest_providers.py`, `weisile-link/weisile_link/ai_quest_contract.py`, `weisile-link/tests/test_ai_quest_providers.py`, `docs/scratchai/AI_QUEST_API_CONTRACT.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Add full AI Quest raw time-series governance, including consent/progress states, audit log records, dataset deletion, model deletion, and user-visible retry/error handling across JSON-RPC and REST routes.

### [2026-05-23] ScratchAI EV3 AI Quest raw time-series governance
- **Status**: ✅ Completed
- **Commit**: `950d5ef`
- **What was done**: Added AI Quest governance for raw EV3 time-series workflows, including consent failure status, upload status/progress records, teacher-reviewable audit metadata, provider/local dataset deletion, provider/local model deletion, and retryable provider error handling through both JSON-RPC and internal REST routes. Verified governance records exclude raw samples, student names, Scratch project JSON, local paths, and provider credentials.
- **Files created/modified**: `weisile-link/weisile_link/ai_quest_contract.py`, `weisile-link/weisile_link/ai_quest_providers.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_ai_quest_contract.py`, `weisile-link/tests/test_ai_quest_providers.py`, `weisile-link/tests/test_json_rpc_server_ai_quest.py`, `docs/scratchai/AI_QUEST_API_CONTRACT.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Add model scopes and shared-model management for ScratchAI EV3 projects, including project/class/course model listing, publish/withdraw behavior, cached-model controls, prediction-mode reporting, and pure `.sb3` metadata stripping.

### [2026-05-23] ScratchAI EV3 AI Quest model scope and sharing
- **Status**: ✅ Completed
- **Commit**: `2290ece`
- **What was done**: Added shared AI Quest model management for ScratchAI EV3 projects, including project/class/course model catalogs, publish/list/withdraw behavior, cached-model selection and clearing, prediction-mode reporting, and pure `.sb3` AI Quest metadata stripping. Extended JSON-RPC, REST, and EV3 category blocks so Scratch projects can manage shared and cached models without exposing raw rules, rows, provider credentials, or cloud-only metadata.
- **Files created/modified**: `weisile-link/weisile_link/ai_quest_contract.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/tests/test_ai_quest_contract.py`, `weisile-link/tests/test_json_rpc_server_ai_quest.py`, `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `docs/scratchai/AI_QUEST_API_CONTRACT.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Build the unified local preview stack for ScratchAI editor, middleware, asset worker, WeisileLink, EV3 simulation, and AI Quest cloud mock.

### [2026-05-23] ScratchAI unified local preview stack
- **Status**: ✅ Completed
- **Commit**: `030521f`
- **What was done**: Added an EV3SC-owned unified local preview stack that starts the ScratchAI editor, ScratchAI middleware, asset worker, preview gateway, VSLE-EV3 extension static hosting, WeisileLink EV3 simulation, Trainer WebSocket, and AI Quest mock provider together. Added a verification script that checks all HTTP/WebSocket endpoints, supports custom WeisileLink/Trainer ports, and bypasses developer machine HTTP proxies for localhost health checks; verified the running stack with 7/7 checks passing.
- **Files created/modified**: `scripts/start_unified_preview.py`, `scripts/verify_unified_preview.py`, `tests/test_unified_preview_stack.py`, `preview/weisile_preview_server.py`, `docs/scratchai/UNIFIED_PREVIEW_STACK.md`, `docs/scratchai/PREVIEW_STARTUP.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the ScratchAI-centered final acceptance pass: verify extension-library `EV3` loading inside the unified stack, legacy `.sb3` compatibility, AI Quest mock/cloud/local fallback flows, and real EV3 hardware readiness evidence for classroom pilot.

### [2026-05-23] ScratchAI final automated acceptance gates
- **Status**: ✅ Completed
- **Commit**: `2bcc4c1`
- **What was done**: Added a final ScratchAI-centered automated acceptance verifier that aggregates the unified preview plan/runtime checks, ScratchAI `EV3` extension-library routing, legacy official EV3 compatibility, complete VSLE-EV3 AI Quest block surface, AI Quest cloud/cached/localFallback provider behavior, and deployment/hardware-readiness asset tests. Generated JSON and Markdown acceptance reports showing 7/7 automated gates passed while keeping classroom approval blocked until real EV3 classroom rehearsal evidence is attached.
- **Files created/modified**: `scripts/verify_scratchai_final_acceptance.py`, `tests/test_scratchai_final_acceptance.py`, `docs/scratchai/FINAL_ACCEPTANCE.md`, `docs/scratchai/final_acceptance_report.json`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the real EV3 classroom rehearsal gate from Section 13.7: connect real EV3 hardware through the unified ScratchAI stack, record motor/sensor/AI Quest evidence, and capture multi-device pilot readiness results.

### [2026-05-23] Real EV3 classroom rehearsal evidence gate
- **Status**: ✅ Completed
- **Commit**: `b3efafd`
- **What was done**: Added a repeatable Section 13.7 real EV3 classroom rehearsal evidence runner that builds the 30-device/10-real-brick gate plan, writes a hardware evidence template, evaluates attached evidence, and keeps classroom approval blocked when no real EV3 evidence exists. Generated the current blocked rehearsal report so the project cannot accidentally treat automated localhost acceptance as pilot approval.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/REAL_EV3_REHEARSAL.md`, `docs/classroom/real_ev3_rehearsal_evidence.template.json`, `docs/classroom/real_ev3_rehearsal_pending_report.json`, `docs/classroom/README.md`, `docs/scratchai/FINAL_ACCEPTANCE.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Connect real EV3 hardware and run `scripts/run_real_ev3_rehearsal.py --evidence-json docs/classroom/real_ev3_rehearsal_evidence.json --json-report docs/classroom/real_ev3_rehearsal_report.json --report docs/classroom/REAL_EV3_REHEARSAL.md --require-passed`, starting with a 1-brick smoke rehearsal and then the Section 13.7 30-transport / 10-real-brick classroom rehearsal.

### [2026-05-24] Real EV3 one-brick smoke evidence capture
- **Status**: ✅ Completed
- **Commit**: `acfdd17`
- **What was done**: Added a one-brick smoke capture mode to the real EV3 rehearsal runner. The script can connect to WeisileLink via Scratch Link compatible JSON-RPC, discover/connect the EV3 peripheral, subscribe to sensor notifications, optionally run a low-speed 0.25s motor test, issue emergency stop commands, and write smoke evidence/transcript JSON while requiring explicit `--confirm-real-ev3` before simulator ACKs can count as physical EV3 evidence.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/README.md`, `docs/classroom/real_ev3_rehearsal_evidence.template.json`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the one-brick smoke capture against a real EV3 brick using `--capture-smoke --confirm-real-ev3 --run-safe-motor-test`, attach the generated evidence/transcript files, then promote to the full Section 13.7 30-transport / 10-real-brick rehearsal with AI Quest collection/training/export evidence.

### [2026-05-24] Real EV3 smoke capture blocked attempt
- **Status**: ✅ Completed
- **Commit**: `4aac1cb`
- **What was done**: Ran the one-brick smoke capture against the local WeisileLink-compatible endpoint without `--confirm-real-ev3`, recorded evidence/transcript/report artifacts, and verified the report stays `BLOCKED` because physical EV3 hardware was not confirmed. The evidence shows local JSON-RPC connect/stop/sensor notifications but keeps `ev3_endpoint_connected=false`, `weisilelink_real_transport=false`, and `classroomApproved=false`.
- **Files created/modified**: `docs/classroom/REAL_EV3_REHEARSAL.md`, `docs/classroom/real_ev3_smoke_evidence.json`, `docs/classroom/real_ev3_smoke_report.json`, `docs/classroom/evidence/real_ev3_smoke_transcript.json`, `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Connect physical EV3 hardware, rerun `scripts/run_real_ev3_rehearsal.py --capture-smoke --confirm-real-ev3 --run-safe-motor-test ...`, attach the confirmed smoke evidence, then proceed to the full Section 13.7 30-transport / 10-real-brick classroom rehearsal with AI Quest collection/training/export evidence.

### [2026-05-24] Real EV3 smoke handoff package
- **Status**: ✅ Completed
- **Commit**: `6113e1d`
- **What was done**: Added a physical EV3 smoke-capture handoff generated by the rehearsal runner, including EV3 endpoint checks, WeisileLink real WiFi transport startup, explicit `--confirm-real-ev3` warning, confirmed one-brick smoke command, and the Section 13.7 full rehearsal follow-up command. The current local probe found WeisileLink on `127.0.0.1:20111`, but `ev3dev.local` was not resolvable, so the real hardware gate remains blocked until a physical EV3 is connected.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/classroom/README.md`, `docs/SOURCE_REGISTER.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Connect a physical EV3 running `vsle_ev3_server.py`, start WeisileLink with `EV3_IP=<real-ev3-host> WEISILE_TRANSPORT=wifi`, then run the confirmed one-brick smoke command from `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md` using `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-24] Real EV3 smoke readiness probe
- **Status**: ✅ Completed
- **Commit**: `78eda95`
- **What was done**: Added a non-invasive smoke readiness probe to the real EV3 rehearsal runner and recorded current endpoint evidence. The probe checks TCP reachability only, sends no EV3 commands, and currently reports `safe_to_run_confirmed_smoke=false` because `ev3dev.local:8765` is not resolvable while local WeisileLink on `127.0.0.1:20111` is reachable.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/REAL_EV3_SMOKE_READINESS.md`, `docs/classroom/real_ev3_smoke_readiness.json`, `docs/classroom/README.md`, `docs/SOURCE_REGISTER.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Connect a physical EV3 running `vsle_ev3_server.py`, rerun the smoke readiness probe until both EV3 and WeisileLink endpoints are reachable, then run the confirmed one-brick smoke command with `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-24] Real EV3 smoke readiness gate
- **Status**: ✅ Completed
- **Commit**: `37290d7`
- **What was done**: Added `--require-smoke-ready` to the non-invasive readiness probe so automation exits with code 2 until both the physical EV3 endpoint and local WeisileLink endpoint are reachable. Regenerated the operator handoff and current readiness evidence; the gate still blocks confirmed smoke capture because `ev3dev.local:8765` is not resolvable while `127.0.0.1:20111` is reachable.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/classroom/real_ev3_smoke_readiness.json`, `docs/classroom/README.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Connect a physical EV3, rerun `scripts/run_real_ev3_rehearsal.py --check-smoke-readiness ... --require-smoke-ready` until it exits 0, then run the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-24] Real EV3 smoke readiness timestamp evidence
- **Status**: ✅ Completed
- **Commit**: `be9a92b`
- **What was done**: Reran the smoke readiness gate and added the exact `created_at` timestamp to the Markdown readiness report so each blocked/proceed result is auditable from both JSON and Markdown evidence. The latest evidence still blocks confirmed smoke capture because `ev3dev.local:8765` is not resolvable while local WeisileLink on `127.0.0.1:20111` is reachable.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/REAL_EV3_SMOKE_READINESS.md`, `docs/classroom/real_ev3_smoke_readiness.json`
- **Next step**: Connect a physical EV3, rerun the readiness gate until it exits 0, then run the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-24] Real EV3 readiness candidate hosts
- **Status**: ✅ Completed
- **Commit**: `6c94e15`
- **What was done**: Added ordered EV3 host/IP candidates to the non-invasive smoke readiness gate so classroom operators can probe `ev3dev.local` plus a real EV3 IP from `hostname -I` before running confirmed smoke. Regenerated the handoff and current readiness evidence; the gate still blocks confirmed smoke capture because `ev3dev.local:8765` is not reachable while local WeisileLink on `127.0.0.1:20111` is reachable.
- **Files created/modified**: `scripts/run_real_ev3_rehearsal.py`, `tests/test_real_ev3_rehearsal.py`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/classroom/REAL_EV3_SMOKE_READINESS.md`, `docs/classroom/real_ev3_smoke_readiness.json`, `docs/classroom/README.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Connect a physical EV3, rerun the readiness gate with `--ev3-candidate-host <real-ev3-ip>` if mDNS does not resolve, wait for exit 0, then run the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-24] Real EV3 readiness evidence refresh
- **Status**: ✅ Completed
- **Commit**: `2080233`
- **What was done**: Reran the non-invasive smoke readiness gate and refreshed the JSON/Markdown evidence timestamp. The gate still blocks confirmed smoke capture because `ev3dev.local:8765` is not reachable while local WeisileLink on `127.0.0.1:20111` is reachable.
- **Files created/modified**: `docs/classroom/REAL_EV3_SMOKE_READINESS.md`, `docs/classroom/real_ev3_smoke_readiness.json`
- **Next step**: Connect a physical EV3, rerun the readiness gate with `--ev3-candidate-host <real-ev3-ip>` if mDNS does not resolve, wait for exit 0, then run the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-25] ev3dev Stretch USB offline install compatibility
- **Status**: ✅ Completed
- **Commit**: `d34fdf6`
- **What was done**: Fixed the EV3 firmware installer and server for the physical EV3 running the official ev3dev Stretch image over USB networking. Replaced the Python 3.6-only `secrets` token generator with a Python 3.5-compatible `os.urandom`/base64 generator, removed Python 3.6/3.7-only EV3 server runtime APIs, documented the no-pip offline `websockets==7.0` install path, and verified the real EV3 service reaches `active (running)` with port `8765` listening at `169.254.251.64`.
- **Files created/modified**: `docs/EV3DEV_SETUP.md`, `ev3-firmware/scripts/install_ev3_autostart.sh`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_autostart_assets.py`, `tests/test_ev3_server.py`
- **Next step**: Start WeisileLink against the real EV3 endpoint `169.254.251.64:8765`, rerun the non-invasive smoke readiness gate until it exits 0, then run the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test`.

### [2026-05-25] Real EV3 smoke readiness confirmed over USB
- **Status**: ✅ Completed
- **Commit**: `ee05f59`
- **What was done**: Reconnected the physical EV3 over USB networking after reboot at `169.254.64.103`, confirmed `vsle-ev3-server` autostart stayed `active (running)`, restarted WeisileLink against the real EV3 endpoint on port `21111`, and reran the non-invasive smoke readiness gate. The gate now reports both `ev3dev.local:8765` and `169.254.64.103:8765` reachable, with `safe_to_run_confirmed_smoke=true`.
- **Files created/modified**: `docs/classroom/REAL_EV3_SMOKE_READINESS.md`, `docs/classroom/real_ev3_smoke_readiness.json`
- **Next step**: With the operator physically clearing Motor A, run the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test`, then attach the generated evidence/transcript before proceeding to the full Section 13.7 classroom rehearsal.

### [2026-05-25] Real EV3 USB smoke transport stabilized
- **Status**: ✅ Completed
- **Commit**: `21c50da`
- **What was done**: Fixed the real EV3 USB smoke path after the first confirmed capture attempt exposed two integration faults: the Mac `websockets` client was honoring the local proxy for the link-local EV3 address, and ev3dev Stretch's Python 3.5/websockets 7 server protocol did not support the `async for` receive loop. WeisileLink now disables WebSocket proxying for direct EV3 connections, the EV3 server uses an explicit `recv()` loop, and a no-motor real EV3 smoke capture now confirms real endpoint connection, real transport, emergency stop ack, and sensor notifications.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `weisile-link/weisile_link/transport/wifi_transport.py`, `weisile-link/tests/test_wifi_transport.py`, `docs/classroom/REAL_EV3_REHEARSAL.md`, `docs/classroom/real_ev3_smoke_evidence.json`, `docs/classroom/real_ev3_smoke_report.json`, `docs/classroom/evidence/real_ev3_smoke_transcript.json`
- **Next step**: After the operator confirms Motor A has clear space and the mechanism is safe, rerun the confirmed one-brick smoke capture with `--confirm-real-ev3 --run-safe-motor-test` so Motor A turns at low speed for about 0.25 seconds and the script records the final motor ack plus emergency stop evidence.

### [2026-05-25] Confirmed Motor A real EV3 smoke capture
- **Status**: ✅ Completed
- **Commit**: `b9b2941`
- **What was done**: Ran the confirmed one-brick smoke capture against the physical EV3 over USB networking with `--confirm-real-ev3 --run-safe-motor-test`. The capture recorded `connect_ok=true`, `motor_ack=true`, `emergency_stop_ack=true`, `sound_stop_ack=true`, no capture errors, and 173 real sensor notifications over about 10 seconds while keeping the broader classroom approval blocked until the remaining Section 13.7 evidence is collected.
- **Files created/modified**: `docs/classroom/REAL_EV3_REHEARSAL.md`, `docs/classroom/real_ev3_smoke_evidence.json`, `docs/classroom/real_ev3_smoke_report.json`, `docs/classroom/evidence/real_ev3_smoke_transcript.json`
- **Next step**: Run the Section 13.7 classroom rehearsal evidence pass: verify the ScratchAI unified stack in the browser, collect the 45-minute sensor freshness evidence, complete AI Quest collection/training/export evidence, and record the classroom rehearsal/multi-device recovery evidence.

### [2026-05-25] ScratchAI browser rehearsal gate
- **Status**: ✅ Completed
- **Commit**: `e29f45e`
- **What was done**: Added a browser rehearsal gate that rejects ScratchAI previews whose GUI bundle contains the AI assistant source but was compiled with disabled ScratchAI runtime flags. Recorded screenshot and Markdown evidence showing the current `127.0.0.1:8601` preview is a stale/static build without the visible AI assistant, so it cannot count as Section 13.7 ScratchAI unified-stack browser evidence.
- **Files created/modified**: `scripts/verify_scratchai_preview.py`, `scripts/verify_unified_preview.py`, `tests/test_scratchai_preview_verifier.py`, `tests/test_unified_preview_stack.py`, `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/evidence/scratchai_preview_missing_assistant.png`, `docs/classroom/README.md`, `docs/scratchai/PREVIEW_STARTUP.md`, `docs/scratchai/BASELINE_PORT_REPORT.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Stop or move the stale static `8601` preview, start the proper ScratchAI unified preview stack with `SCRATCH_AI_ENABLED=true` and `SCRATCH_AI_PANEL_ENABLED=true`, rerun unified browser verification until the AI Thinking Helper appears, then collect the 45-minute sensor freshness, AI Quest collection/training/export, and multi-device/disconnect recovery evidence.

### [2026-05-25] Section 13.7 ScratchAI preview rehearsal evidence
- **Status**: ✅ Completed
- **Commit**: `38eb0c0`
- **What was done**: Avoided the stale static `8601` preview, verified the real ScratchAI unified stack on `8611` with the localized AI Thinking Helper visible, and captured the simulated-preview Section 13.7 rehearsal evidence. The 45-minute sensor phase measured 49.977Hz for 45.001 minutes with 0.033% estimated dropped updates and 30.422MB memory growth; AI Quest uploaded 10,000 points, trained successfully at 0.8762 accuracy, exported model rules, and recorded 30 simulated device connections plus disconnect recovery in 0.065s. This is simulated preview evidence only; physical EV3 classroom approval still requires real endpoint and real transport evidence.
- **Files created/modified**: `preview/weisile_preview_server.py`, `preview/tests/test_preview_static.js`, `scripts/run_section13_7_preview_rehearsal.py`, `tests/test_preview_backend.py`, `tests/test_section13_7_preview_rehearsal.py`, `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/SECTION_13_7_PREVIEW_REHEARSAL.md`, `docs/classroom/evidence/scratchai_unified_stack_ai_helper.png`, `docs/classroom/evidence/scratchai_unified_stack_browser_state.json`, `docs/classroom/evidence/section13_7_preview_rehearsal_20260525.json`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the remaining Section 13.7 real-hardware classroom pass with physical EV3 endpoints: repeat the 45-minute workflow against real WeisileLink transport, attach real EV3 multi-device/disconnect records, and keep pilot approval blocked if any classroom failure requires code changes.

### [2026-05-25] ScratchAI asset draft parity audit
- **Status**: ✅ Completed
- **Commit**: `b8b7d5b`
- **What was done**: Audited the EV3SC-owned ScratchAI port against the read-only ScratchAI reference after the AI assistant appeared but did not generate a sprite draft. Confirmed the assistant source, AI library, asset worker, and preview server were ported without source diffs; fixed the real runtime gaps by enabling the full ScratchAI preview flags, defaulting unified preview asset drafts to `template-svg`, and passing dynamic editor origins into middleware CORS. Browser evidence now shows `Make draft` returning a completed `template-svg` sprite draft with `result.generated=true`.
- **Files created/modified**: `scratch-ai-platform/ai-middleware/src/config.js`, `scratch-ai-platform/ai-middleware/src/server.js`, `scratch-ai-platform/ai-middleware/test/server.test.js`, `scripts/start_scratchai_preview.py`, `scripts/start_unified_preview.py`, `scripts/verify_scratchai_preview.py`, `scripts/verify_unified_preview.py`, `tests/test_scratchai_preview_startup.py`, `tests/test_scratchai_preview_verifier.py`, `tests/test_unified_preview_stack.py`, `docs/scratchai/SCRATCHAI_PORT_PARITY_AUDIT.md`, `docs/scratchai/PREVIEW_STARTUP.md`, `docs/scratchai/UNIFIED_PREVIEW_STACK.md`, `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/evidence/scratchai_asset_generator_visible_20260525.png`, `docs/classroom/evidence/scratchai_asset_generator_section_20260525.png`, `docs/classroom/evidence/scratchai_asset_draft_generated_20260525.png`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the remaining Section 13.7 real-hardware classroom pass with physical EV3 endpoints: repeat the 45-minute workflow against real WeisileLink transport, attach real EV3 multi-device/disconnect records, and keep pilot approval blocked if any classroom failure requires code changes.

### [2026-05-25] Configured public EV3 extension unsandboxed URL
- **Status**: ✅ Completed
- **Commit**: `b49bbd3`
- **What was done**: Added a deployment-safe VSLE-EV3 extension URL path so `SCRATCH_AI_VSLE_EV3_EXTENSION_URL` can register the public EV3 extension as an Unsandboxed Extension without changing Scratch visual design. Verified the configured public URL fails before the patch and passes afterward, plus syntax checks on the changed VM and test files.
- **Files created/modified**: `scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-manager.js`, `scratch-ai-platform/scratch-editor/packages/scratch-vm/test/unit/extension_unsandboxed_loader.js`
- **Next step**: Build the ScratchAI unified preview with the public EV3 extension URL, deploy it to `101.42.92.6` on an isolated port, configure DeepSeek text AI and the in-repo transparent sprite draft provider, then audit browser/health evidence without touching existing server applications.

### [2026-05-25] Legacy preview static asset compatibility
- **Status**: ✅ Completed
- **Commit**: `8532d86`
- **What was done**: Fixed the ScratchAI preview gateway so authenticated `/preview/index.html` and its relative assets, such as `/preview/gui.js`, resolve to the deployed static root instead of falling back to HTML. Added a regression test that fails on the MIME mismatch and passes after the `/preview/*` static-prefix normalization.
- **Files created/modified**: `scratch-ai-platform/preview-server/src/server.js`, `scratch-ai-platform/preview-server/test/server.test.js`
- **Next step**: Redeploy the updated preview gateway to `101.42.92.6:18612`, verify both `/` and `/preview/index.html` browser paths show AI Thinking Helper, then finish the deployment audit evidence.

### [2026-05-25] ScratchAI public deployment audit
- **Status**: ✅ Completed
- **Commit**: `c0eadfe`
- **What was done**: Deployed the EV3SC-owned ScratchAI unified preview to `101.42.92.6` on isolated port `18612`, with middleware on `127.0.0.1:18614` and asset worker on `127.0.0.1:18615` so existing applications on `80`, `3000`, and `8001` remain untouched. Audited DeepSeek text AI configuration, the in-repo `template-svg` transparent role draft provider, authenticated role draft generation, browser-visible AI Thinking Helper, asset generator visibility, and the fixed legacy `/preview/index.html` path.
- **Files created/modified**: `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`, `docs/deployment/evidence/scratchai_101_42_92_6_root_ai_helper_20260525.png`, `docs/deployment/evidence/scratchai_101_42_92_6_ai_helper_open_20260525.png`, `docs/deployment/evidence/scratchai_101_42_92_6_ai_helper_open_state_20260525.json`, `docs/deployment/evidence/scratchai_101_42_92_6_asset_generator_20260525.png`, `docs/deployment/evidence/scratchai_101_42_92_6_asset_generator_state_20260525.json`, `docs/deployment/evidence/scratchai_101_42_92_6_preview_path_ai_helper_20260525.png`, `docs/deployment/evidence/scratchai_101_42_92_6_preview_path_state_20260525.json`
- **Next step**: Continue Section 13.7 with physical-classroom evidence: run the real 45-minute sensor freshness pass, AI Quest collection/training/export against the classroom stack, and multi-device/disconnect recovery records.

### [2026-05-25] Transparent template sprite drafts
- **Status**: ✅ Completed
- **Commit**: `e242b58`
- **What was done**: Fixed the local `template-svg` image provider so character/sprite drafts omit the background rectangle and remain transparent when adopted into Scratch, while backdrop drafts still keep a full background. Added regression coverage that decodes the SVG data URI and verifies character drafts have no background rect while backdrops do.
- **Files created/modified**: `scratch-ai-platform/asset-worker/src/server.js`, `scratch-ai-platform/asset-worker/test/server.test.js`
- **Next step**: Redeploy the updated asset worker to `101.42.92.6:18615`, rerun authenticated role-draft smoke evidence through `101.42.92.6:18612`, and update the deployment audit with the verified transparent sprite result.

### [2026-05-25] Transparent sprite deployment verification
- **Status**: ✅ Completed
- **Commit**: `6d47d8b`
- **What was done**: Updated the public deployment audit after redeploying the asset worker and rerunning authenticated sprite/backdrop draft checks through `101.42.92.6:18612`. The evidence confirms `template-svg` character drafts complete with `svgHasBackgroundRect=false`, while backdrop drafts complete with `svgHasBackgroundRect=true`.
- **Files created/modified**: `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`
- **Next step**: Continue Section 13.7 real-hardware classroom evidence: 45-minute sensor freshness, AI Quest collection/training/export, and multi-device/disconnect recovery.

### [2026-05-26] SiliconFlow role image provider deployment verification
- **Status**: ✅ Completed
- **Commit**: `65718ad`
- **What was done**: Configured the isolated `101.42.92.6:18612` ScratchAI deployment to use the server-side `siliconflow-image` provider for role image drafts while keeping the API key in the remote secret env only. Verified the authenticated public gateway reports `currentProvider=siliconflow-image`, keeps DeepSeek text AI enabled, and completes a character PNG generation with transparent-background validation and server-side background repair.
- **Files created/modified**: `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`
- **Next step**: Continue Section 13.7 real-hardware classroom evidence: run the real 45-minute sensor freshness pass, AI Quest collection/training/export against the classroom stack, and multi-device/disconnect recovery records.

### [2026-05-26] ScratchAI testing auth bypass verification
- **Status**: ✅ Completed
- **Commit**: `040d728`
- **What was done**: Disabled Basic Auth on the isolated `101.42.92.6:18612` ScratchAI preview for the current testing stage while retaining `systemcreator` as the staged username for future re-enabling. Verified unauthenticated root preview, preview status, DeepSeek health, SiliconFlow manifest, and SiliconFlow role image generation, including rejection of an opaque image and successful transparent role generation with server-side repair.
- **Files created/modified**: `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`
- **Next step**: Continue Section 13.7 real-hardware classroom evidence: run the real 45-minute sensor freshness pass, AI Quest collection/training/export against the classroom stack, and multi-device/disconnect recovery records.

### [2026-05-26] ScratchAI EV3 browser unsandboxed URL fix
- **Status**: ✅ Completed
- **Commit**: `beb1c4b`
- **What was done**: Fixed the ScratchAI VM extension manager so the build-configured `SCRATCH_AI_VSLE_EV3_EXTENSION_URL` remains browser-reachable after webpack replaces the environment variable, allowing the public VSLE-EV3 extension URL to stay on the Unsandboxed Extension path instead of falling back to the sandbox worker. Added verifier/startup coverage and local browser evidence showing EV3 blocks load from the configured URL; a fresh audit still shows the currently deployed `101.42.92.6:18612` bundle is stale and needs redeployment before the public site reflects the fix.
- **Files created/modified**: `scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extension-support/extension-manager.js`, `scratch-ai-platform/scratch-editor/packages/scratch-vm/test/unit/extension_unsandboxed_loader.js`, `scripts/start_scratchai_preview.py`, `scripts/start_unified_preview.py`, `scripts/verify_scratchai_preview.py`, `scripts/verify_unified_preview.py`, `tests/test_scratchai_preview_startup.py`, `tests/test_scratchai_preview_verifier.py`, `tests/test_unified_preview_stack.py`, `docs/SOURCE_REGISTER.md`, `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/evidence/scratchai_ev3_blocks_loaded_20260526.json`, `docs/classroom/evidence/scratchai_ev3_blocks_loaded_20260526.png`, `docs/scratchai/PREVIEW_STARTUP.md`, `docs/scratchai/UNIFIED_PREVIEW_STACK.md`
- **Next step**: Redeploy the isolated ScratchAI preview on `101.42.92.6:18612` after SSH/server access is available, then rerun the browser EV3 extension click audit against the public site.

### [2026-05-26] Public EV3 extension deployment verification
- **Status**: ✅ Completed
- **Commit**: `06b37fd`
- **What was done**: Recorded the refreshed public deployment audit after the isolated `101.42.92.6:18612` ScratchAI bundle was redeployed with the configured public VSLE-EV3 extension URL. Browser evidence confirms the `EV3` extension card loads the VSLE-EV3 category, shows EV3 blocks in the palette, fetches `/vsle-ev3-extension/index.js` as a main-thread script, and does not load the EV3 extension through a sandbox worker.
- **Files created/modified**: `docs/SOURCE_REGISTER.md`, `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`, `docs/deployment/evidence/scratchai_101_42_92_6_ev3_blocks_loaded_20260526.json`, `docs/deployment/evidence/scratchai_101_42_92_6_ev3_blocks_loaded_20260526.png`
- **Next step**: Continue Section 13.7 real-hardware classroom evidence: run the real 45-minute sensor freshness pass, AI Quest collection/training/export against the classroom stack, and multi-device/disconnect recovery records.

### [2026-05-26] WeisileLink desktop distribution design audit
- **Status**: ✅ Completed
- **Commit**: `31fdc46`
- **What was done**: Added the WeisileLink Desktop macOS/Windows distribution design and implementation plan, then audited and connected the docs back into `AGENTS.md`, the source register, and the main platform specification. The spec now separates full VSLE mode from official EV3 firmware Bluetooth compatibility mode, adds desktop installer reliability gates, native Bluetooth adapter boundaries, clean-machine release checks, and explicit unsupported-mode limitations.
- **Files created/modified**: `AGENTS.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`, `docs/SOURCE_REGISTER.md`, `docs/superpowers/specs/2026-05-26-weisilelink-desktop-distribution-design.md`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Execute Task 1 from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`: create desktop install docs, macOS/Windows packaging asset skeletons, and failing-then-passing packaging validation tests.

### [2026-05-26] WeisileLink desktop installer design assets
- **Status**: ✅ Completed
- **Commit**: `434bb47`
- **What was done**: Added desktop install documentation, macOS LaunchAgent/install/uninstall assets, Windows startup/service install assets, and a static desktop asset validator. Verified the Task 1 tests failed before assets existed, then passed after implementation with `desktop assets ok`.
- **Files created/modified**: `docs/desktop/*.md`, `desktop/README.md`, `desktop/macos/*`, `desktop/windows/*`, `desktop/scripts/validate_desktop_assets.py`, `tests/test_desktop_packaging.py`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Execute Task 2 from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`: implement diagnostics export and redaction in `weisile-link/weisile_link/desktop/diagnostics.py` with failing-then-passing tests.

### [2026-05-26] WeisileLink desktop diagnostics redaction bundle
- **Status**: ✅ Completed
- **Commit**: `4d4f77e`
- **What was done**: Added the WeisileLink desktop diagnostics package with token/API-key redaction, oversized label truncation, default Bluetooth address redaction, optional device-identifier inclusion for support, and default exclusion of raw student data. Verified the diagnostics tests failed before the package existed, then passed after implementation.
- **Files created/modified**: `weisile-link/weisile_link/desktop/__init__.py`, `weisile-link/weisile_link/desktop/diagnostics.py`, `weisile-link/tests/test_desktop_diagnostics.py`, `docs/SOURCE_REGISTER.md`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Execute Task 3 from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`: implement the official EV3 Direct Command encoder with source-backed byte framing tests and source-register updates.

### [2026-05-26] Official EV3 Direct Command encoder
- **Status**: ✅ Completed
- **Commit**: `407a58e`
- **What was done**: Added the source-backed official EV3 Direct Command encoder for command header framing, device-list polling, motor stop, sensor SI polling, and motor-count polling. The implementation follows the EV3SC-owned Scratch official EV3 extension constants and the LEGO EV3 Communication Developer Kit Direct Command frame layout.
- **Files created/modified**: `weisile-link/weisile_link/protocol/official_ev3_direct_command.py`, `weisile-link/tests/test_official_ev3_direct_command.py`, `docs/SOURCE_REGISTER.md`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Execute Task 4 from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`: add the official firmware Bluetooth transport shell behind a native adapter protocol and keep macOS/Windows support unavailable until adapter evidence exists.

### [2026-05-26] Official EV3 Bluetooth transport shell
- **Status**: ✅ Completed
- **Commit**: `fc48944`
- **What was done**: Added the official EV3 firmware Bluetooth compatibility transport shell with a project-owned native adapter protocol, explicit unsupported behavior when no adapter is injected, safe all-motor stop on disconnect, and a CLI `official-bluetooth` entry. The implementation does not claim macOS/Windows Bluetooth support and keeps real adapter/hardware approval behind the next evidence gate.
- **Files created/modified**: `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`, `weisile-link/tests/test_official_ev3_bt_transport.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/transport/__init__.py`, `docs/SOURCE_REGISTER.md`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Execute Task 5 from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`: add macOS/Windows native adapter package documentation plus clean-machine installer and official-firmware hardware smoke evidence gates.

### [2026-05-26] Desktop install smoke evidence gate
- **Status**: ✅ Completed
- **Commit**: `c57952d`
- **What was done**: Added macOS and Windows native Bluetooth adapter boundary README files plus a desktop install smoke evidence runner that writes Markdown reports and refuses to mark support ready without release-artifact install, reboot/startup, Scratch Link endpoint, and real official-firmware EV3 Bluetooth evidence. Updated the desktop docs and source register so localhost-only developer runs cannot be mistaken for classroom-ready support.
- **Files created/modified**: `desktop/macos/native/README.md`, `desktop/windows/native/README.md`, `scripts/run_desktop_install_smoke.py`, `tests/test_desktop_install_smoke.py`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`, `docs/SOURCE_REGISTER.md`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Execute Task 6 from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`: audit and update `AGENTS.md` and the main platform spec so desktop distribution requirements, compatibility rows, and installer gates remain aligned with the implemented evidence workflow.

### [2026-05-26] WeisileLink desktop requirements alignment
- **Status**: ✅ Completed
- **Commit**: `c2485a2`
- **What was done**: Updated `AGENTS.md` and the main platform specification so the desktop release rules, Phase 4 acceptance criteria, Section 13.6/13.8 gates, Section 14.7 desktop distribution rules, and Section 18 compatibility rows all reference the same install-smoke evidence workflow. The docs now explicitly reject developer-checkout, localhost-only, and simulated-only evidence for classroom-ready desktop or official-firmware Bluetooth claims.
- **Files created/modified**: `AGENTS.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`, `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`
- **Next step**: Run the Final Verification block from `docs/superpowers/plans/2026-05-26-weisilelink-desktop-distribution.md`, including desktop packaging tests, install-smoke tests, WeisileLink desktop/official-firmware tests, desktop asset validation, and final git status review.

### [2026-05-26] WeisileLink desktop final verification
- **Status**: ✅ Completed
- **Commit**: `b499e3e`
- **What was done**: Ran the Final Verification block from the WeisileLink Desktop distribution plan. The root desktop packaging/install-smoke tests passed 10/10, the WeisileLink desktop diagnostics plus official EV3 Direct Command and Bluetooth transport tests passed 20/20, the desktop asset validator printed `desktop assets ok`, and git status showed only the preexisting local `.DS_Store`, `.preview-run/`, and `downloads/` artifacts outside this plan.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Collect real clean-machine macOS and Windows release-artifact evidence plus real official-firmware EV3 Bluetooth smoke evidence before any desktop package or compatibility mode is marked classroom ready.

### [2026-05-26] Desktop clean-machine evidence gate check
- **Status**: ✅ Completed
- **Commit**: `3610692`
- **What was done**: Ran `scripts/run_desktop_install_smoke.py` against the documented macOS and Windows evidence paths. Both gates correctly exited non-zero because the required clean-machine evidence JSON files are not present, and the generated reports record `Classroom ready: no` without fabricating release support.
- **Files created/modified**: `docs/desktop/evidence/macos-install-smoke.md`, `docs/desktop/evidence/windows-install-smoke.md`
- **Next step**: Produce real `docs/desktop/evidence/macos-install-smoke.json` and `docs/desktop/evidence/windows-install-smoke.json` from signed release-artifact installs on clean machines, including reboot/startup, Scratch Link endpoint, and real official-firmware EV3 Bluetooth smoke evidence, then rerun the gates until the reports say `Classroom ready: yes`.

### [2026-05-27] Desktop release artifact packager
- **Status**: ✅ Completed
- **Commit**: `1c71202`
- **What was done**: Added a reproducible WeisileLink Desktop release artifact packager for macOS and Windows zip/manifest layouts from self-contained executables. The packager refuses unsigned artifacts by default, records localhost defaults and non-classroom status in manifests, and was used to generate an ignored internal macOS unsigned smoke artifact from a PyInstaller onefile executable.
- **Files created/modified**: `.gitignore`, `desktop/scripts/build_release_artifacts.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Build or obtain a Windows self-contained `WeisileLink.exe` on a real Windows build host, package it with `desktop/scripts/build_release_artifacts.py`, then move both OS artifacts into signing/notarization and clean-machine install smoke evidence collection.

### [2026-05-27] macOS LaunchAgent install log path fix
- **Status**: ✅ Completed
- **Commit**: `d4c92e4`
- **What was done**: Verified the installed macOS app binary can start on temporary localhost ports, then fixed the LaunchAgent template so install-time scripts write absolute log paths instead of `~` paths that launchd does not expand reliably. Added regression coverage and regenerated the ignored internal macOS unsigned smoke artifact with the corrected installer assets.
- **Files created/modified**: `desktop/macos/install.sh`, `desktop/macos/weisile-link.launchd.plist`, `desktop/scripts/validate_desktop_assets.py`, `tests/test_desktop_packaging.py`
- **Next step**: Reinstall the regenerated macOS smoke artifact on this Mac after stopping local port conflicts, then collect clean-machine signed-artifact evidence on macOS and Windows.

### [2026-05-27] macOS native adapter process bridge
- **Status**: ✅ Completed
- **Commit**: `1b161e5`
- **What was done**: Added an EV3SC-owned macOS IOBluetooth command-line adapter for official-firmware EV3 Bluetooth compatibility and a Python JSON-line subprocess bridge that injects it through `WEISILE_OFFICIAL_BT_ADAPTER`. Added tests for adapter process connect/send/recv/close behavior, native error propagation, CLI adapter injection, and macOS Objective-C syntax validation while keeping classroom readiness blocked until real signed-artifact and EV3 smoke evidence exists.
- **Files created/modified**: `desktop/macos/native/README.md`, `desktop/macos/native/WeisileEV3BluetoothAdapter.m`, `desktop/macos/native/build.sh`, `weisile-link/weisile_link/transport/native_adapter_process.py`, `weisile-link/tests/test_native_adapter_process.py`, `weisile-link/weisile_link/cli.py`, `docs/SOURCE_REGISTER.md`
- **Next step**: Build the macOS native adapter into the desktop release artifact, then collect real paired-EV3 official-firmware Bluetooth smoke evidence and clean-machine signed/notarized install evidence before marking the mode available.

### [2026-05-27] Official EV3 Bluetooth sensor cache polling
- **Status**: ✅ Completed
- **Commit**: `b5bfa74`
- **What was done**: Added Direct Reply validation and global-memory decoders for official EV3 firmware responses, plus fake-adapter verified device-list and sensor/motor polling through the official Bluetooth transport. The transport now writes Basic Pack values into the same `SensorCache` paths used by Scratch while keeping real macOS official-firmware hardware approval blocked behind release-artifact smoke evidence.
- **Files created/modified**: `weisile-link/weisile_link/protocol/official_ev3_direct_command.py`, `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`, `weisile-link/tests/test_official_ev3_direct_command.py`, `weisile-link/tests/test_official_ev3_bt_transport.py`, `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Package the macOS native adapter into a signed/notarized desktop release artifact, then run a real paired official-firmware EV3 smoke test and record `official_firmware_bt_real_ev3_ok: true` only from the install-smoke evidence workflow.

### [2026-05-27] macOS native adapter release bundling
- **Status**: ✅ Completed
- **Commit**: `14a68e9`
- **What was done**: Updated the desktop release packager so macOS artifacts must include the built `WeisileEV3BluetoothAdapter` binary under the app bundle resources, added LaunchAgent wiring for `WEISILE_OFFICIAL_BT_ADAPTER`, and regenerated an internal unsigned macOS smoke artifact with a manifest that records the native adapter is present while official-firmware Bluetooth remains not classroom ready.
- **Files created/modified**: `desktop/scripts/build_release_artifacts.py`, `desktop/scripts/validate_desktop_assets.py`, `desktop/macos/install.sh`, `desktop/macos/weisile-link.launchd.plist`, `tests/test_desktop_release_packaging.py`, `tests/test_desktop_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the macOS release artifact on a clean macOS machine with a paired official-firmware EV3 and record real install-smoke evidence, including `official_firmware_bt_real_ev3_ok: true`, before marking the compatibility mode available.

### [2026-05-28] Website Bluetooth full module command design
- **Status**: ✅ Completed
- **Commit**: `f267fc6`
- **What was done**: Added a design for making the ScratchAI website Bluetooth flow support the full VSLE-EV3 module command surface through a dedicated `vsle-bluetooth` full-mode transport. The design separates full ev3dev/VSLE Bluetooth from official-firmware Bluetooth compatibility so the website does not imply complete module support from the limited Direct Command mode.
- **Files created/modified**: `docs/superpowers/specs/2026-05-28-website-bluetooth-full-module-commands-design.md`
- **Next step**: Review the design, then create an implementation plan for the `vsle-bluetooth` full-mode transport, website connection-flow copy, tests, and real EV3 Bluetooth evidence gates.

### [2026-05-28] Website Bluetooth design audit
- **Status**: ✅ Completed
- **Commit**: `6cfb33d`
- **What was done**: Audited the website Bluetooth full-module design against the current EV3SC block surface, WeisileLink command validators, existing full-mode RFCOMM transport, EV3 server Bluetooth listener, and official-firmware compatibility boundary. Clarified that `vsle-bluetooth` should be a clear product alias or rename of the existing full VSLE JSON-line Bluetooth path, not a duplicate implementation, and that EV3-side work means enabling/updating the EV3SC server rather than writing a new LEGO firmware image.
- **Files created/modified**: `docs/superpowers/specs/2026-05-28-website-bluetooth-full-module-commands-design.md`
- **Next step**: Create the implementation plan with a generated command coverage matrix, full Bluetooth transport aliasing, native byte-stream adapter generalization, EV3 setup updates, and real EV3 full-Bluetooth smoke evidence gates.

### [2026-05-28] macOS native adapter Bluetooth usage metadata
- **Status**: ✅ Completed
- **Commit**: `968faba`
- **What was done**: Added an Info.plist for the EV3SC-owned macOS native Bluetooth adapter, embedded the Bluetooth usage descriptions into the built adapter binary, ad-hoc signed the built adapter for local verification, and added macOS app bundle metadata coverage so release artifacts carry the required Bluetooth permission text. Verified the related desktop release packaging and native adapter tests, plus the desktop asset validator.
- **Files created/modified**: `desktop/macos/native/WeisileEV3BluetoothAdapter-Info.plist`, `desktop/macos/native/build.sh`, `desktop/scripts/build_release_artifacts.py`, `tests/test_desktop_release_packaging.py`, `weisile-link/tests/test_native_adapter_process.py`
- **Next step**: Create the implementation plan with a generated command coverage matrix, full Bluetooth transport aliasing, native byte-stream adapter generalization, EV3 setup updates, and real EV3 full-Bluetooth smoke evidence gates.

### [2026-05-28] Website Bluetooth full module implementation plan
- **Status**: ✅ Completed
- **Commit**: `e16d641`
- **What was done**: Added the implementation plan for the ScratchAI website full-module Bluetooth path. The plan decomposes `vsle-bluetooth` work into generated command coverage, transport aliasing, shared native byte-stream adapter generalization, full VSLE Bluetooth fake-adapter tests, runtime/status wiring, EV3 setup updates, Scratch connection modal copy, smoke evidence gates, and final verification.
- **Files created/modified**: `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`
- **Next step**: Execute Task 1 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: generate the full VSLE Bluetooth command coverage matrix and commit the coverage report with tests.

### [2026-05-28] VSLE Bluetooth full module coverage matrix
- **Status**: ✅ Completed
- **Commit**: `6c6efca`
- **What was done**: Added a generated coverage matrix for every current VSLE-EV3 Scratch block, proving each block is full-VSLE-Bluetooth cache-backed, host-side, or EV3-dispatched. The report also keeps official-firmware Bluetooth compatibility status separate so limited Direct Command support is not presented as full module coverage.
- **Files created/modified**: `scripts/generate_vsle_bluetooth_coverage.py`, `tests/test_vsle_bluetooth_coverage.py`, `docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Execute Task 2 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: add the explicit `vsle-bluetooth` transport alias and status metadata while preserving `bluetooth` as a backward-compatible full-VSLE alias.

### [2026-05-28] VSLE Bluetooth transport naming metadata
- **Status**: ✅ Completed
- **Commit**: `27c7bd1`
- **What was done**: Added `vsle-bluetooth` as the canonical full-module Bluetooth transport name in the WeisileLink selector while keeping plain `bluetooth` as a backward-compatible alias. Status payloads now include transport capability, native adapter path/status, and unsupported-capability metadata so full VSLE Bluetooth remains distinct from official-firmware compatibility mode.
- **Files created/modified**: `weisile-link/weisile_link/runtime/degradation.py`, `weisile-link/weisile_link/transport/selector.py`, `weisile-link/weisile_link/sessions.py`, `weisile-link/weisile_link/observability/health.py`, `weisile-link/tests/test_transport_selector.py`, `weisile-link/tests/test_observability.py`, `weisile-link/tests/test_multi_ev3_sessions.py`
- **Next step**: Execute Task 3 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: generalize the native byte-stream adapter boundary so full VSLE Bluetooth and official-firmware Bluetooth can share the same adapter protocol without conflating their capabilities.

### [2026-05-28] Native byte-stream adapter boundary
- **Status**: ✅ Completed
- **Commit**: `190775a`
- **What was done**: Added a shared native byte-stream adapter protocol and status model for Bluetooth Classic subprocess adapters. `NativeAdapterProcess` now passes channel/profile metadata and exposes adapter status, the official-firmware EV3 Bluetooth transport consumes the shared boundary, and the macOS native adapter implements a matching `status` command without claiming classroom-ready Bluetooth support.
- **Files created/modified**: `weisile-link/weisile_link/transport/native_byte_stream.py`, `weisile-link/weisile_link/transport/native_adapter_process.py`, `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`, `desktop/macos/native/WeisileEV3BluetoothAdapter.m`, `weisile-link/tests/test_native_adapter_process.py`
- **Next step**: Execute Task 4 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: add native-adapter-backed fake tests for the full VSLE Bluetooth JSON-line transport so `vsle-bluetooth` can share the byte-stream boundary while staying separate from official-firmware compatibility mode.

### [2026-05-28] Full VSLE native Bluetooth adapter
- **Status**: ✅ Completed
- **Commit**: `f9ba4e4`
- **What was done**: Added `VSLEBluetoothTransport` as the product-facing full-module Bluetooth transport while keeping `BluetoothTransport` import-compatible. The full VSLE transport can now use an injected native byte-stream adapter for JSON-line auth, command ack resolution, sensor cache routing, timeout handling, and best-effort `system.stopAll` before disconnect, without conflating it with official-firmware Direct Command compatibility mode.
- **Files created/modified**: `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/weisile_link/transport/__init__.py`, `weisile-link/tests/test_bluetooth_transport.py`
- **Next step**: Execute Task 5 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: wire runtime configuration, JSON-RPC transport selection, and `/api/status` metadata for `WEISILE_VSLE_BT_ADAPTER` and `vsle-bluetooth`.

### [2026-05-28] VSLE Bluetooth runtime wiring
- **Status**: ✅ Completed
- **Commit**: `419c493`
- **What was done**: Wired `WEISILE_VSLE_BT_ADAPTER` into packaged runtime configuration and the JSON-RPC default server factory so `WEISILE_TRANSPORT=vsle-bluetooth` selects `VSLEBluetoothTransport` with a native byte-stream adapter. `/api/status` session payload coverage now verifies full VSLE Bluetooth capability and native adapter status metadata, and the Bluetooth transport creates its write lock lazily so synchronous server factories can construct it safely.
- **Files created/modified**: `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/json_rpc_server.py`, `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/tests/test_native_adapter_process.py`, `weisile-link/tests/test_json_rpc_server.py`
- **Next step**: Execute Task 6 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: update EV3 setup assets and docs for the full VSLE Bluetooth listener, keeping Bluetooth disabled by default until explicitly enabled and documented.

### [2026-05-28] Full VSLE Bluetooth EV3 setup
- **Status**: ✅ Completed
- **Commit**: `80b25c8`
- **What was done**: Updated EV3 systemd and installer assets so the full VSLE Bluetooth RFCOMM listener is disabled by default and only enabled through explicit `VSLE_EV3_ENABLE_BLUETOOTH` install-time configuration. Added the `install.sh` entrypoint, ensured generated EV3 env files contain Bluetooth keys, documented the `vsle-bluetooth` ev3dev-only setup path, and verified the Bluetooth endpoint reuses the same auth and command handler path as WiFi.
- **Files created/modified**: `ev3-firmware/systemd/vsle-ev3-server.service`, `ev3-firmware/scripts/install.sh`, `ev3-firmware/scripts/install_ev3_autostart.sh`, `docs/EV3DEV_SETUP.md`, `ev3-firmware/README.md`, `tests/test_ev3_autostart_assets.py`, `tests/test_ev3_server.py`
- **Next step**: Execute Task 7 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: update the Scratch connection modal and extension transport parameters so the website offers WiFi Full VSLE, Bluetooth Full VSLE, and Official Firmware Bluetooth Compatibility without changing Scratch visual design.

### [2026-05-28] Extension Bluetooth connection mode
- **Status**: ✅ Completed
- **Commit**: `bb13d1d`
- **What was done**: Updated the additive Scratch-style EV3 connection modal to expose WiFi Full VSLE, Bluetooth Full VSLE, and Official Firmware Bluetooth Compatibility as separate transport choices without changing Scratch GUI files. The extension now normalizes legacy `bluetooth` to `vsle-bluetooth`, sends `ev3_bt` for full VSLE Bluetooth, and sends `ev3_official_bt` for official-firmware compatibility.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_connection_modal.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/README.md`
- **Next step**: Execute Task 8 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: add the full VSLE Bluetooth smoke evidence gate so real and fake evidence can distinguish full ev3dev Bluetooth from official-firmware compatibility.

### [2026-05-28] Full VSLE Bluetooth smoke gate
- **Status**: ✅ Completed
- **Commit**: `dedf166`
- **What was done**: Added an evidence-driven full VSLE Bluetooth smoke gate that accepts only real `vsle-bluetooth` evidence with release-artifact install, ev3dev server runtime, fresh sensors, every command group, unsandboxed Scratch loading, and disconnect stop proof. Missing, false, stale, or official-firmware compatibility evidence keeps classroom readiness blocked.
- **Files created/modified**: `scripts/run_vsle_bluetooth_smoke.py`, `tests/test_vsle_bluetooth_smoke.py`, `docs/classroom/vsle_bluetooth_full_module_smoke.template.json`, `docs/classroom/REAL_EV3_REHEARSAL.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Execute Task 9 from `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`: run the final full VSLE Bluetooth verification pass and record the final source/register/spec status.

### [2026-05-28] Full VSLE Bluetooth final verification
- **Status**: ✅ Completed
- **Commit**: `02f4385`
- **What was done**: Ran the final full VSLE Bluetooth verification pass: the Python matrix/transport/server suite passed 95/95, the VSLE extension JavaScript suite passed 30/30, the desktop asset validator printed `desktop assets ok`, and the smoke evidence runner kept the template evidence blocked with `Classroom ready: no`. Real full Bluetooth classroom readiness remains blocked until physical `vsle-bluetooth` smoke evidence is collected and accepted by `scripts/run_vsle_bluetooth_smoke.py`.
- **Files created/modified**: `docs/SOURCE_REGISTER.md`
- **Next step**: Collect real full VSLE Bluetooth smoke evidence with a paired ev3dev EV3 running `vsle_ev3_server.py`, write `docs/classroom/vsle_bluetooth_full_module_smoke.json`, and rerun `scripts/run_vsle_bluetooth_smoke.py` to generate the accepted classroom smoke report.

### [2026-05-28] Full VSLE Bluetooth smoke evidence blocker
- **Status**: ✅ Completed
- **Commit**: `eed4612`
- **What was done**: Ran `scripts/run_vsle_bluetooth_smoke.py` against the expected real evidence path and generated `docs/classroom/vsle_bluetooth_full_module_smoke.md`. The report correctly remains `Classroom ready: no` because `docs/classroom/vsle_bluetooth_full_module_smoke.json` has not been collected from a physical paired ev3dev EV3.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_full_module_smoke.md`, `docs/classroom/REAL_EV3_REHEARSAL.md`
- **Next step**: Connect a real paired ev3dev EV3 running `vsle_ev3_server.py`, perform the full `vsle-bluetooth` classroom smoke, fill `docs/classroom/vsle_bluetooth_full_module_smoke.json`, and rerun the smoke gate until the report is accepted.

### [2026-05-28] Full VSLE Bluetooth smoke handoff
- **Status**: ✅ Completed
- **Commit**: `77a3a49`
- **What was done**: Added a full VSLE Bluetooth hardware smoke handoff to the classroom real EV3 instructions, including EV3-side RFCOMM enablement, macOS native byte-stream adapter build, WeisileLink `vsle-bluetooth` launch command, ScratchAI mode selection, command-group coverage, evidence JSON fields, and final smoke gate validation. The handoff keeps Bluetooth addresses out of committed evidence and keeps classroom readiness blocked until the smoke report says `Classroom ready: yes`.
- **Files created/modified**: `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`
- **Next step**: Use the handoff with a physical paired ev3dev EV3, collect `docs/classroom/vsle_bluetooth_full_module_smoke.json`, and rerun `scripts/run_vsle_bluetooth_smoke.py` to replace the blocker report with accepted real full Bluetooth smoke evidence.

### [2026-05-28] EV3 SD card install teaching guide
- **Status**: ✅ Completed
- **Commit**: `fd39746`
- **What was done**: Created the root `README.md` as a step-by-step teaching entry for installing ev3dev on a new EV3 SD card before collecting full VSLE Bluetooth evidence. The guide now records confirmed Phase 0 material requirements and Phase 1 download/image-selection steps, with later phases to be appended as the install is walked through.
- **Files created/modified**: `README.md`
- **Next step**: Continue Phase 2 in `README.md`: flash the ev3dev EV3 image to the microSD card with Etcher, eject cleanly, and boot the EV3 from the card.

### [2026-05-28] Classroom download cache prepared
- **Status**: ✅ Completed
- **Commit**: `9d34562`
- **What was done**: Confirmed the EV3 ev3dev image was already present under the local EV3SC download cache and downloaded official Balena Etcher v1.17.0 installers for both macOS and Windows. Updated the teaching README with exact local paths, official source links, SHA-256 values, and basic verification results while ignoring the large local binary cache in git.
- **Files created/modified**: `README.md`, `.gitignore`, local ignored cache files under `downloads/ev3dev/` and `downloads/tools/`
- **Next step**: Continue Phase 2 in `README.md`: flash `ev3dev-stretch-ev3-generic-2020-04-10.zip` to the microSD card with Etcher, eject cleanly, and boot the EV3 from the card.

### [2026-05-28] EV3 SD card flashed
- **Status**: ✅ Completed
- **Commit**: `aefda5b`
- **What was done**: Flashed the ev3dev EV3 image to the inserted 15.8GB external SD card identified as `/dev/disk4`, confirmed the resulting `EV3DEV_BOOT` and Linux partitions, verified the Linux partition read-back hash matched the image partition hash, and ejected the card cleanly. Updated the README with the classroom Etcher flow plus the confirmed Mac-assisted flash evidence.
- **Files created/modified**: `README.md`
- **Next step**: Insert the SD card into the EV3, power on the brick, and confirm the EV3 boots to the ev3dev startup screen before continuing to first-login/network setup.

### [2026-05-28] EV3 first boot confirmed
- **Status**: ✅ Completed
- **Commit**: `bda3d4a`
- **What was done**: Recorded that the EV3 screen showed the ev3dev startup screen after booting from the flashed SD card. Updated the teaching guide with first-boot waiting guidance, a 15-minute no-progress troubleshooting threshold, and ev3dev reference links for classroom reuse.
- **Files created/modified**: `README.md`
- **Next step**: Continue Phase 4 in `README.md`: connect to the booted EV3 for first-login and network setup.

### [2026-05-28] EV3 first boot reflash recovery
- **Status**: ✅ Completed
- **Commit**: `5277b62`
- **What was done**: Investigated an EV3 first-boot stall after power-cycling during a long `Starting` screen. The SD card evidence showed `EV3DEV_BOOT` was readable and the Linux partition had expanded to the full card size, so the guide now records the likely interrupted first-boot initialization and the completed reflash recovery with matching Linux partition read-back hash.
- **Files created/modified**: `README.md`
- **Next step**: Insert the reflashed SD card into the EV3 again, boot without interrupting `Starting`, and wait for the ev3dev/Brickman main interface before continuing to first-login/network setup.

### [2026-05-29] EV3 ev3dev page reached
- **Status**: ✅ Completed
- **Commit**: `10e0320`
- **What was done**: Recorded the successful Phase 3 end state: after another EV3 reboot, loading finished and the brick entered the ev3dev page. The README now treats this as the confirmed point for moving from SD-card boot recovery to first-login and network setup.
- **Files created/modified**: `README.md`
- **Next step**: Continue Phase 4 in `README.md`: connect to the EV3 for first-login and network setup, then prepare the EV3-side VSLE server install.

### [2026-05-29] EV3 USB SSH login verified
- **Status**: ✅ Completed
- **Commit**: `d3b7708`
- **What was done**: Verified first login over the EV3 mini USB connection after Wi-Fi showed `Not Available`. macOS detected the brick as `EV3+ev3dev` on `en10`, SSH over the IPv6 link-local address succeeded with `robot` / `maker`, and read-only checks captured hostname, kernel, USB address, and root filesystem status.
- **Files created/modified**: `README.md`
- **Next step**: Continue Phase 5 in `README.md`: install the EV3-side VSLE server over the working USB SSH connection and prepare the brick for WeisileLink testing.

### [2026-05-29] EV3 VSLE server installed
- **Status**: ✅ Completed
- **Commit**: `3d082d1`
- **What was done**: Installed the EV3-side `vsle_ev3_server.py` over the working USB SSH connection and enabled `vsle-ev3-server.service` with `SKIP_PIP_INSTALL=1` after checking dependencies. The brick already had `ev3dev2 2.1.0`, lacked `pip`, received offline `websockets 7.0`, listened on `0.0.0.0:8765`, and passed a local token-redacted WebSocket pairing plus `sensor_update` smoke check.
- **Files created/modified**: `README.md`
- **Next step**: Make the installed EV3 server reachable from WeisileLink through Wi-Fi or full VSLE Bluetooth, collect `docs/classroom/vsle_bluetooth_full_module_smoke.json`, and rerun `scripts/run_vsle_bluetooth_smoke.py` until the report is accepted.

### [2026-05-29] EV3 full VSLE Bluetooth listener enabled
- **Status**: ✅ Completed
- **Commit**: `ebd4a1d`
- **What was done**: Enabled the EV3-side full VSLE Bluetooth RFCOMM listener over the USB SSH recovery path. Real hardware showed that the systemd env file had to override default Bluetooth values, the listener needed the EV3 controller address `A0:E6:F8:19:58:3C`, and the controller had to be unblocked from RF-kill before `Powered`, `Discoverable`, and `Pairable` were all `yes`; the pairing token was rotated after diagnostics and remains redacted.
- **Files created/modified**: `README.md`, `docs/EV3DEV_SETUP.md`, `ev3-firmware/README.md`, `ev3-firmware/systemd/vsle-ev3-server.service`, `tests/test_ev3_autostart_assets.py`
- **Next step**: Pair the Mac with the discoverable ev3dev EV3, point WeisileLink at `vsle-bluetooth`, collect `docs/classroom/vsle_bluetooth_full_module_smoke.json`, and rerun `scripts/run_vsle_bluetooth_smoke.py`.

### [2026-05-29] macOS Bluetooth adapter bundle launch
- **Status**: ✅ Completed
- **Commit**: `3786568`
- **What was done**: Updated the macOS native Bluetooth adapter to build as an app bundle and added a LaunchServices-compatible localhost socket bridge so WeisileLink can communicate with the adapter while macOS applies the bundle Bluetooth usage description. Release packaging now preserves the adapter `.app` bundle instead of flattening it into a single binary, and the desktop install assets/docs point to the executable inside that bundle.
- **Files created/modified**: `desktop/macos/native/WeisileEV3BluetoothAdapter.m`, `desktop/macos/native/build.sh`, `weisile-link/weisile_link/transport/native_adapter_process.py`, `weisile-link/weisile_link/transport/bluetooth_transport.py`, `desktop/scripts/build_release_artifacts.py`, `desktop/scripts/validate_desktop_assets.py`, `desktop/macos/weisile-link.launchd.plist`, `desktop/macos/install.sh`, `desktop/macos/native/README.md`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`, `tests/test_desktop_packaging.py`, `tests/test_desktop_release_packaging.py`, `weisile-link/tests/test_native_adapter_process.py`, `weisile-link/tests/test_json_rpc_server.py`
- **Next step**: Pair the Mac with the discoverable ev3dev EV3, start WeisileLink with `WEISILE_TRANSPORT=vsle-bluetooth` and the bundled adapter executable path, then collect and validate `docs/classroom/vsle_bluetooth_full_module_smoke.json`.

### [2026-05-29] VSLE Bluetooth non-invasive hardware smoke
- **Status**: ✅ Completed
- **Commit**: `f1f87f7`
- **What was done**: Confirmed the paired macOS teacher computer can reach the ev3dev EV3 through the app-bundled native adapter and `VSLEBluetoothTransport` without running motors. The smoke completed token pairing, received a real sensor update containing `motors`, `sensors`, and `system`, and disconnected cleanly while keeping the pairing token out of committed logs.
- **Files created/modified**: `README.md`
- **Next step**: Run the full `vsle-bluetooth` classroom smoke with safe command-group coverage, collect `docs/classroom/vsle_bluetooth_full_module_smoke.json`, and rerun `scripts/run_vsle_bluetooth_smoke.py`.

### [2026-05-29] VSLE Bluetooth safe command-group preflight
- **Status**: ✅ Completed
- **Commit**: `6a44387`
- **What was done**: Collected real paired-ev3dev `vsle-bluetooth` preflight evidence for safe command groups without moving motors. The EV3 accepted motor stop, system stop, display, sound, and data-collection commands, but the smoke report correctly remains `Classroom ready: no` because release-artifact install, ScratchAI browser, AI Quest evidence, and the 25ms sensor freshness gate are still unmet; measured `sensor_freshness_ms_max` was `2369.593`.
- **Files created/modified**: `README.md`, `docs/classroom/vsle_bluetooth_full_module_smoke.json`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`
- **Next step**: Investigate and fix the Bluetooth sensor freshness gap, then rerun the full `vsle-bluetooth` classroom smoke until `sensor_freshness_ms_max <= 25` while also collecting release-artifact, ScratchAI browser, and AI Quest evidence.

### [2026-05-29] VSLE Bluetooth full command-group smoke attempt
- **Status**: ✅ Completed
- **Commit**: `5761293`
- **What was done**: Ran a real paired-ev3dev `vsle-bluetooth` full command-group smoke attempt with safe hardware limits and regenerated `docs/classroom/vsle_bluetooth_full_module_smoke.json`. The EV3 accepted sound, display, system, and data-collection commands, but the report correctly remains `Classroom ready: no` because the current brick reported no connected motor or sensor ports, AI Quest training had no varying real features, the run was not from a clean-machine release artifact, ScratchAI browser Unsandboxed evidence was not collected, and measured `sensor_freshness_ms_max` was `391.316`.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_full_module_smoke.json`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`
- **Next step**: Attach the required classroom hardware to the EV3, at minimum one motor and one sensor with varied readings, then rerun the full Bluetooth smoke; after that collect ScratchAI browser Unsandboxed evidence, release-artifact install evidence, and continue the Bluetooth freshness fix until the validator reports classroom-ready.

### [2026-05-29] VSLE Bluetooth native recv freshness fix
- **Status**: ✅ Completed
- **Commit**: `329beb3`
- **What was done**: Fixed the macOS native adapter process path so `recv` uses a short explicit timeout instead of the adapter default 5 second blocking read, and made VSLE Bluetooth treat that short timeout as idle polling rather than a disconnect. Added regression tests for the native adapter timeout parameter, timeout mapping, and session liveness after idle native receive polling; a real EV3 probe confirmed `system.stopAll` still receives an ack after a 6 second idle window.
- **Files created/modified**: `weisile-link/weisile_link/transport/native_adapter_process.py`, `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/tests/test_native_adapter_process.py`, `weisile-link/tests/test_bluetooth_transport.py`
- **Next step**: Rerun the full `vsle-bluetooth` command-group smoke with motor A attached, regenerate `docs/classroom/vsle_bluetooth_full_module_smoke.json`, then collect ScratchAI browser Unsandboxed evidence and release-artifact install evidence.

### [2026-05-29] Full Bluetooth smoke with motor A
- **Status**: ✅ Completed
- **Commit**: `500bca1`
- **What was done**: Restarted the EV3 `vsle-ev3-server` after confirming the physical A-port large motor, reran the real full `vsle-bluetooth` smoke, and regenerated `docs/classroom/vsle_bluetooth_full_module_smoke.json`. The run observed motor A and 117 sensor updates; motor, sound, display, system, data collection, and AI Quest groups passed with 28 collected rows and a trained AI Quest model, while the report correctly remains `Classroom ready: no` because no sensor port was connected, browser Unsandboxed evidence and release-artifact install evidence were not attached, and measured `sensor_freshness_ms_max` was `2385.959`.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_full_module_smoke.json`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`
- **Next step**: Collect ScratchAI browser Unsandboxed evidence, collect or document the release-artifact install evidence gate, then continue the Bluetooth freshness investigation and attach at least one real sensor for the remaining sensor command group.

### [2026-05-29] ScratchAI browser Unsandboxed evidence
- **Status**: ✅ Completed
- **Commit**: `fa45bd8`
- **What was done**: Collected ScratchAI browser rehearsal evidence showing the EV3 extension URL loaded as a main-thread script resource with no extension-worker resource for that URL. The full Bluetooth smoke evidence now records `scratch_unsandboxed_loaded: true`, while classroom readiness remains blocked by release-artifact install evidence, the missing real sensor command group, and the Bluetooth sensor freshness target.
- **Files created/modified**: `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/evidence/scratchai_browser_unsandboxed_20260529.json`, `docs/classroom/evidence/scratchai_browser_unsandboxed_20260529.png`, `docs/classroom/vsle_bluetooth_full_module_smoke.json`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`
- **Next step**: Attach at least one real EV3 sensor, rerun the full `vsle-bluetooth` smoke while continuing the freshness investigation until `sensor_freshness_ms_max <= 25`, and collect release-artifact install evidence before claiming classroom readiness.

### [2026-05-29] Full Bluetooth smoke with S1 touch sensor
- **Status**: ✅ Completed
- **Commit**: `b7ba724`
- **What was done**: Verified the attached S1 touch sensor at the ev3dev sysfs layer, restarted the EV3 server so it rescanned hardware, confirmed `S1` appears as `type: touch` in the VSLE data stream, and reran the real `vsle-bluetooth` command-group smoke. Motor, sensor, sound, display, system, data collection, and AI Quest command groups now all pass; the report remains `Classroom ready: no` because the run was not from a release artifact and `sensor_freshness_ms_max` is still `2549.83`.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_full_module_smoke.json`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`
- **Next step**: Investigate the remaining Bluetooth sensor freshness gap until `sensor_freshness_ms_max <= 25`, then collect clean release-artifact install evidence before claiming classroom readiness.

### [2026-05-29] Bluetooth freshness root-cause diagnosis
- **Status**: ✅ Completed
- **Commit**: `5d270b9`
- **What was done**: Ran non-invasive freshness diagnostics without moving motors. The EV3-local WebSocket stream averaged `138.141ms`, direct `read_all()` averaged `89.566ms`, and component timing showed that motor PID reads and EV3 button polling each exceed the 25ms freshness budget on real ev3dev hardware; the issue is therefore rooted in the EV3 hardware snapshot path, not only in the macOS native Bluetooth adapter.
- **Files created/modified**: `docs/performance/BLUETOOTH_FRESHNESS_DIAGNOSIS.md`
- **Next step**: Implement a cache-tiered EV3 snapshot path that keeps sensors high-frequency while moving motor PID, battery, and EV3 button reads to lower-frequency cached fields, then rerun the no-motor freshness diagnostic and full `vsle-bluetooth` smoke.

### [2026-05-29] EV3 tiered snapshot cache
- **Status**: ✅ Completed
- **Commit**: `39229ff`
- **What was done**: Added a TDD regression test for the EV3 hardware snapshot path and changed `read_all()` so S1 sensor data and motor position/speed/running stay high-frequency while motor PID, battery, and EV3 button fields are refreshed from a lower-frequency cache. The slow snapshot is invalidated after `motor.setPID` so Scratch-visible PID data updates after PID commands.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`
- **Next step**: Deploy the updated EV3 server to the brick, restart `vsle-ev3-server.service`, and rerun the no-motor freshness diagnostic with EV3, A-port motor, and S1 touch sensor still connected.

### [2026-05-29] EV3 tiered snapshot cache deployed
- **Status**: ✅ Completed
- **Commit**: `e970777`
- **What was done**: Uploaded the tiered-cache EV3 server to `/home/robot/vsle_ev3_server.py`, restarted `vsle-ev3-server.service`, and ran a no-motor direct `read_all()` probe with the EV3, A-port motor, and S1 touch sensor still connected. The average direct read dropped from `89.566ms` to `14.009ms`, but the max read was still `76.289ms` because slow-cache refresh still happens inline when the cache expires.
- **Files created/modified**: `docs/performance/BLUETOOTH_FRESHNESS_DIAGNOSIS.md`
- **Next step**: Use TDD to move slow snapshot refresh fully out of the high-frequency `read_all()` path so refresh ticks do not block the 25ms freshness gate.

### [2026-05-29] EV3 slow snapshot moved off hot path
- **Status**: ✅ Completed
- **Commit**: `7a28c09`
- **What was done**: Added TDD coverage proving `read_all()` only merges a completed slow cache and that `slow_snapshot_loop()` refreshes PID, battery, and EV3 button data without calling `read_all()`. Deployed commit `39bca9e` to the EV3, restarted `vsle-ev3-server.service`, and ran a no-motor hot-path probe; average direct `read_all()` was `14.731ms`, while max was still `59.465ms`.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `docs/performance/BLUETOOTH_FRESHNESS_DIAGNOSIS.md`
- **Next step**: Profile S1 sensor reads separately from motor position/speed/running reads; if motor basics cause the remaining max spikes, move motor basics to a medium-frequency cache while keeping S1 on the high-frequency path.

### [2026-05-29] EV3 hot path split probe
- **Status**: ✅ Completed
- **Commit**: `b468f77`
- **What was done**: Ran a no-motor EV3-local split probe with the service paused, measuring S1 sensor reads, motor A position/speed/running reads, and combined `read_all()` separately. S1-only max was `13.653ms`, motor-basic-only max was `12.964ms`, and combined hot-path max was `19.761ms`, so motor basics were not moved to a medium-frequency cache in this step.
- **Files created/modified**: `docs/performance/BLUETOOTH_FRESHNESS_DIAGNOSIS.md`
- **Next step**: Rerun the full `vsle-bluetooth` freshness evidence path; if it still exceeds the 25ms gate, profile the bridge/native-adapter receive path and EV3 WebSocket broadcast loop before adding more EV3-side caching.

### [2026-05-29] Bluetooth RFCOMM boundary probe
- **Status**: ✅ Completed
- **Commit**: `4b3a75d`
- **What was done**: Reduced the macOS native adapter receive poll interval from `50ms` to `5ms`, added compact high-frequency EV3 Bluetooth sensor payloads for RFCOMM clients, and reran the real full `vsle-bluetooth` evidence path. The compact stream removed PID, battery, and button fields from Bluetooth frames while keeping WiFi/WebSocket clients on the full payload, but real EV3 evidence still missed the 25ms classroom freshness gate, pointing to an EV3 RFCOMM/macOS IOBluetooth cadence limit rather than the Python hardware snapshot path.
- **Files created/modified**: `desktop/macos/native/WeisileEV3BluetoothAdapter.m`, `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `weisile-link/tests/test_native_adapter_process.py`, `docs/performance/BLUETOOTH_FRESHNESS_DIAGNOSIS.md`, `docs/classroom/vsle_bluetooth_full_module_smoke.json`
- **Next step**: Decide whether full VSLE Bluetooth remains a non-classroom diagnostic/fallback mode with lower freshness expectations, or redesign the Bluetooth stream around a different native adapter/protocol strategy and collect new real-EV3 evidence; clean release-artifact install evidence is still required before any classroom-ready claim.

### [2026-05-29] VSLE Bluetooth fallback decision
- **Status**: ✅ Completed
- **Commit**: `b939311`
- **What was done**: Recorded the evidence-driven decision that `vsle-bluetooth` remains a non-classroom diagnostic/fallback mode on current macOS RFCOMM evidence, while WiFi Full VSLE remains the 50Hz classroom path. Updated the smoke report generator so command-group-passing but freshness-blocked evidence explicitly reports `Diagnostic fallback: yes` instead of being confused with classroom readiness.
- **Files created/modified**: `scripts/run_vsle_bluetooth_smoke.py`, `tests/test_vsle_bluetooth_smoke.py`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/superpowers/specs/2026-05-28-website-bluetooth-full-module-commands-design.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Collect clean release-artifact install evidence for WeisileLink Desktop and proceed with WiFi Full VSLE classroom readiness gates, or start a new Bluetooth transport redesign task before trying to make `vsle-bluetooth` meet the 25ms classroom freshness gate.

### [2026-05-29] No-WiFi Bluetooth classroom direction
- **Status**: ✅ Completed
- **Commit**: `fb9eb25`
- **What was done**: Updated the overall Bluetooth full-module design and project agent rules to match the no-WiFi classroom requirement: when compatible EV3 WiFi dongles are unavailable, `vsle-bluetooth` is the primary full-module classroom path, not a diagnostic-only fallback. The acceptance model is now split into a Bluetooth full-module classroom baseline with measured sampling and a separate 50Hz/high-speed freshness gate.
- **Files created/modified**: `AGENTS.md`, `docs/superpowers/specs/2026-05-28-website-bluetooth-full-module-commands-design.md`
- **Next step**: Update the smoke evidence gate, reports, and classroom handoff docs so `vsle-bluetooth` can produce a baseline classroom verdict separate from the 25ms high-speed gate.

### [2026-05-29] VSLE Bluetooth baseline smoke gate split
- **Status**: ✅ Completed
- **Commit**: `bdf1ea4`
- **What was done**: Split the full VSLE Bluetooth smoke validator into two verdicts: the no-WiFi Bluetooth classroom baseline and the separate Bluetooth high-speed 50Hz gate. The report now records measured Bluetooth sampling, the evidence template includes observed sampling fields, and the classroom handoff docs no longer describe command-group-passing Bluetooth evidence as a diagnostic-only fallback.
- **Files created/modified**: `scripts/run_vsle_bluetooth_smoke.py`, `tests/test_vsle_bluetooth_smoke.py`, `docs/classroom/vsle_bluetooth_full_module_smoke.template.json`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/classroom/REAL_EV3_REHEARSAL.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Collect clean WeisileLink Desktop release-artifact install evidence for `vsle-bluetooth`, set `installed_from_release_artifact` from that evidence, and rerun `scripts/run_vsle_bluetooth_smoke.py` to accept the no-WiFi Bluetooth classroom baseline while leaving the 50Hz gate separate.

### [2026-05-29] VSLE Bluetooth desktop install smoke mode
- **Status**: ✅ Completed
- **Commit**: `96f79f5`
- **What was done**: Added `--mode vsle-bluetooth` to the desktop install smoke validator so clean release-artifact evidence for the no-WiFi full VSLE Bluetooth path can be validated with `vsle_bluetooth_real_ev3_ok`, separate from official-firmware compatibility evidence. Updated macOS/Windows/Desktop docs, the real EV3 handoff, and generated blocked macOS/Windows VSLE Bluetooth install reports that correctly remain `Classroom ready: no` until clean-machine evidence JSON files exist.
- **Files created/modified**: `scripts/run_desktop_install_smoke.py`, `tests/test_desktop_install_smoke.py`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`, `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.md`, `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.md`
- **Next step**: Produce or install a signed/notarized WeisileLink Desktop release artifact on a clean macOS machine, collect `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json` with `vsle_bluetooth_real_ev3_ok: true`, rerun `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth`, then use the accepted report to set `installed_from_release_artifact: true` in the full VSLE Bluetooth classroom smoke JSON.

### [2026-05-29] VSLE Bluetooth install evidence templates
- **Status**: ✅ Completed
- **Commit**: `eeac73b`
- **What was done**: Added macOS and Windows `vsle-bluetooth` desktop install smoke evidence templates that are blocked by default, plus tests proving the templates cannot approve classroom readiness until real clean-machine release-artifact evidence is filled. Updated desktop install docs and the source register so the evidence collection path starts from platform-specific templates without treating placeholders as proof.
- **Files created/modified**: `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json`, `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`, `tests/test_desktop_install_smoke.py`
- **Next step**: On a clean macOS machine, install the signed/notarized WeisileLink Desktop release artifact, copy `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json` to `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json`, fill only observed release-artifact and real ev3dev `vsle-bluetooth` evidence, rerun `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth`, then use the accepted report to set `installed_from_release_artifact: true` in the full VSLE Bluetooth classroom smoke JSON.

### [2026-05-29] Desktop release manifest evidence gate
- **Status**: ✅ Completed
- **Commit**: `379b11e`
- **What was done**: Strengthened `scripts/run_desktop_install_smoke.py` so `installed_from_release_artifact: true` now requires a real release artifact manifest. The gate rejects evidence without a manifest, unsigned artifacts, and macOS artifacts that are not notarized; a temporary check against the current unsigned macOS manifest correctly reported `Classroom ready: no`.
- **Files created/modified**: `scripts/run_desktop_install_smoke.py`, `tests/test_desktop_install_smoke.py`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`, `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json`, `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json`, `docs/SOURCE_REGISTER.md`
- **Next step**: Produce a signed and notarized macOS WeisileLink Desktop release artifact, ensure its generated manifest records `signed: true` and `notarized: true`, install that artifact on a clean macOS machine, then collect `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json` with real `vsle-bluetooth` EV3 evidence and rerun `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth`.

### [2026-05-29] macOS release notarization helper
- **Status**: ✅ Completed
- **Commit**: `aab07dc`
- **What was done**: Added `desktop/scripts/notarize_macos_release.py` so a signed macOS WeisileLink artifact can be submitted with `xcrun notarytool`, stapled and validated with `xcrun stapler`, rezipped, and recorded as `notarized: true` only after tool validation succeeds. Added regression tests with a fake `xcrun`, docs that require `--keychain-profile` instead of command-line Apple passwords, and source register coverage.
- **Files created/modified**: `desktop/scripts/notarize_macos_release.py`, `tests/test_macos_notarization.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the real macOS release flow with a Developer ID signing identity and Apple notarytool keychain profile: build the signed artifact, run `desktop/scripts/notarize_macos_release.py --keychain-profile <profile>`, confirm the manifest records `signed: true` and `notarized: true`, then install it on a clean macOS machine for `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] macOS signed installer package helper
- **Status**: ✅ Completed
- **Commit**: `63b6462`
- **What was done**: Added `desktop/scripts/build_macos_pkg.py` so a signed and notarized macOS WeisileLink app can be wrapped into a signed classroom `.pkg` with `pkgbuild` and `productbuild`. The desktop install smoke gate now rejects macOS release-artifact evidence unless the manifest records a signed installer package and SHA-256 hash.
- **Files created/modified**: `desktop/scripts/build_macos_pkg.py`, `tests/test_macos_pkg_packaging.py`, `scripts/run_desktop_install_smoke.py`, `tests/test_desktop_install_smoke.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run the real macOS release flow with a Developer ID Application identity, Apple notarytool keychain profile, and Developer ID Installer identity: build the signed app artifact, notarize it, build the signed `.pkg`, then install that package on a clean macOS machine for `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] macOS release preflight gate
- **Status**: ✅ Completed
- **Commit**: `6a7cd0b`
- **What was done**: Added a local macOS release preflight gate that checks the self-contained WeisileLink executable path, native adapter app, Developer ID Application identity, Developer ID Installer identity, Apple notarytool keychain profile, and required macOS packaging tools before running the real classroom release flow. The current evidence report is blocked because release input paths, signing identities, and the notarytool profile were not provided, while the required macOS tools are present.
- **Files created/modified**: `desktop/scripts/check_macos_release_preflight.py`, `tests/test_macos_release_preflight.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`, `docs/desktop/evidence/macos-release-preflight.json`, `docs/desktop/evidence/macos-release-preflight.md`
- **Next step**: Provide the self-contained WeisileLink executable, built native adapter app, Developer ID Application identity, Developer ID Installer identity, and notarytool keychain profile; rerun `desktop/scripts/check_macos_release_preflight.py` until it reports `Ready: yes`, then execute the signed app, notarization, signed `.pkg`, and clean-machine `vsle-bluetooth` install-smoke evidence flow.

### [2026-05-29] macOS release preflight autodetect
- **Status**: ✅ Completed
- **Commit**: `bf6fbaf`
- **What was done**: Updated the macOS release preflight to auto-detect the standard local self-contained WeisileLink executable and bundled native Bluetooth adapter when they exist under `desktop/build/macos/`. Regenerated the preflight evidence so the current blocker is narrowed to the missing Developer ID Application identity, Developer ID Installer identity, and Apple notarytool keychain profile; no classroom readiness is claimed.
- **Files created/modified**: `desktop/scripts/check_macos_release_preflight.py`, `tests/test_macos_release_preflight.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`, `docs/desktop/evidence/macos-release-preflight.json`, `docs/desktop/evidence/macos-release-preflight.md`
- **Next step**: Provide the real Developer ID Application identity, Developer ID Installer identity, and notarytool keychain profile; rerun `desktop/scripts/check_macos_release_preflight.py` until it reports `Ready: yes`, then build the signed app, notarize it, build the signed `.pkg`, and collect clean-machine `vsle-bluetooth` install-smoke evidence from the release artifact.

### [2026-05-29] macOS signing identity autodetect
- **Status**: ✅ Completed
- **Commit**: `17192a0`
- **What was done**: Extended the macOS release preflight so it auto-detects a unique Developer ID Application identity and a unique Developer ID Installer identity from the local keychain when they exist, while still requiring explicit flags if identities are missing or ambiguous. Regenerated the preflight evidence; this machine still has no matching Developer ID identities and no notarytool profile, so release/classroom readiness remains blocked.
- **Files created/modified**: `desktop/scripts/check_macos_release_preflight.py`, `tests/test_macos_release_preflight.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`, `docs/desktop/evidence/macos-release-preflight.json`, `docs/desktop/evidence/macos-release-preflight.md`
- **Next step**: Install or provide the real Developer ID Application and Developer ID Installer identities plus an Apple notarytool keychain profile, rerun `desktop/scripts/check_macos_release_preflight.py` until `Ready: yes`, then run the signed app, notarization, signed `.pkg`, and clean-machine `vsle-bluetooth` install-smoke evidence flow.

### [2026-05-29] macOS notary profile environment
- **Status**: ✅ Completed
- **Commit**: `371679a`
- **What was done**: Added `WEISILE_NOTARY_KEYCHAIN_PROFILE` support to the macOS release preflight so the Apple notarytool keychain profile can be supplied through the local environment instead of command-line flags or committed files. The preflight still requires `xcrun notarytool history` to succeed before it marks the profile check as passing, and this machine remains blocked because no real profile is configured.
- **Files created/modified**: `desktop/scripts/check_macos_release_preflight.py`, `tests/test_macos_release_preflight.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Configure real Developer ID Application and Developer ID Installer identities plus `WEISILE_NOTARY_KEYCHAIN_PROFILE` or `--notary-keychain-profile`, rerun `desktop/scripts/check_macos_release_preflight.py` until `Ready: yes`, then execute signed app packaging, notarization, signed `.pkg`, and clean-machine `vsle-bluetooth` install-smoke evidence collection.

### [2026-05-29] Guarded macOS release flow runner
- **Status**: ✅ Completed
- **Commit**: `8325350`
- **What was done**: Added `desktop/scripts/run_macos_release_flow.py`, a guarded runner that first runs the macOS release preflight and refuses to execute signing, notarization, or package creation unless the preflight report is `Ready: yes`. The runner then passes the verified executable path, native adapter path, Developer ID identities, and notarytool profile into the existing signed app, notarization, and signed `.pkg` scripts in order.
- **Files created/modified**: `desktop/scripts/run_macos_release_flow.py`, `tests/test_macos_release_flow.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Configure real Developer ID Application and Developer ID Installer identities plus `WEISILE_NOTARY_KEYCHAIN_PROFILE` or `--notary-keychain-profile`, rerun `desktop/scripts/run_macos_release_flow.py`, and after it produces a signed/notarized app plus signed `.pkg`, install the package on a clean macOS machine to collect `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] macOS release flow blocked evidence
- **Status**: ✅ Completed
- **Commit**: `1d5f86b`
- **What was done**: Extended the guarded macOS release runner so every run writes JSON and Markdown status reports, including blocked preflight runs that execute zero signing, notarization, or package commands. Generated the current blocked release-flow evidence showing that this machine remains stopped at preflight because Developer ID identities and a notarytool profile are not configured.
- **Files created/modified**: `desktop/scripts/run_macos_release_flow.py`, `tests/test_macos_release_flow.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/evidence/macos-release-flow.json`, `docs/desktop/evidence/macos-release-flow.md`
- **Next step**: Configure real Developer ID Application and Developer ID Installer identities plus `WEISILE_NOTARY_KEYCHAIN_PROFILE` or `--notary-keychain-profile`, rerun `desktop/scripts/run_macos_release_flow.py` until the release-flow report is `release-flow-complete`, then install the signed package on a clean macOS machine and collect `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] Windows release flow blocked evidence
- **Status**: ✅ Completed
- **Commit**: `d502412`
- **What was done**: Added a Windows release preflight and guarded release-flow runner that write JSON and Markdown reports, refuse to execute release commands unless the preflight reports `Ready: yes`, and currently block because this Mac is not a Windows SignTool host and Windows signing is not wired into the packager yet. Added TDD coverage for the blocked and ready-runner paths plus desktop docs that keep unsigned Windows zip artifacts out of classroom-ready evidence.
- **Files created/modified**: `desktop/scripts/check_windows_release_preflight.py`, `desktop/scripts/run_windows_release_flow.py`, `desktop/scripts/build_release_artifacts.py`, `tests/test_windows_release_preflight.py`, `tests/test_windows_release_flow.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/evidence/windows-release-preflight.json`, `docs/desktop/evidence/windows-release-preflight.md`, `docs/desktop/evidence/windows-release-flow.json`, `docs/desktop/evidence/windows-release-flow.md`
- **Next step**: Wire real Windows SignTool signing into `desktop/scripts/build_release_artifacts.py`, produce a self-contained `WeisileLink.exe` on a Windows build host, rerun `desktop/scripts/check_windows_release_preflight.py` until `Ready: yes`, then execute the guarded Windows release flow and collect clean-machine `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] Windows SignTool signing path
- **Status**: ✅ Completed
- **Commit**: `dbdbfb2`
- **What was done**: Wired Windows SignTool signing into the desktop release packager: on a Windows build host it now signs the copied `WeisileLink/WeisileLink.exe`, verifies the signature, emits a signed zip name, and records signing metadata in the manifest. Updated the Windows preflight and current evidence so the signing implementation passes while this Mac remains blocked because it is not a Windows SignTool host and lacks a Windows executable plus signing inputs.
- **Files created/modified**: `desktop/scripts/build_release_artifacts.py`, `desktop/scripts/check_windows_release_preflight.py`, `tests/test_desktop_release_packaging.py`, `tests/test_windows_release_preflight.py`, `desktop/README.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/evidence/windows-release-preflight.json`, `docs/desktop/evidence/windows-release-preflight.md`
- **Next step**: Produce a self-contained `WeisileLink.exe` on a Windows build host with `signtool` available, provide `WEISILE_WINDOWS_SIGN_IDENTITY` and `WEISILE_WINDOWS_TIMESTAMP_URL` or equivalent flags, rerun `desktop/scripts/check_windows_release_preflight.py` until `Ready: yes`, then execute `desktop/scripts/run_windows_release_flow.py` and collect clean-machine `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] Desktop executable build helper
- **Status**: ✅ Completed
- **Commit**: `22554ee`
- **What was done**: Added `desktop/scripts/build_weisilelink_executable.py` so the self-contained WeisileLink executable can be built with PyInstaller on the target OS before release packaging. The helper documents and enforces the Windows build-host boundary by refusing `--target windows` from this macOS host, preventing local developer binaries from being mistaken for Windows classroom artifacts.
- **Files created/modified**: `desktop/scripts/build_weisilelink_executable.py`, `tests/test_desktop_executable_build.py`, `desktop/README.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run `desktop/scripts/build_weisilelink_executable.py --target windows --output desktop/build/windows --clean` on a Windows build host to produce `desktop/build/windows/WeisileLink.exe`, provide `WEISILE_WINDOWS_SIGN_IDENTITY` and `WEISILE_WINDOWS_TIMESTAMP_URL`, rerun the Windows preflight until `Ready: yes`, then execute the guarded Windows release flow and collect clean-machine `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] Windows build-host handoff preflight
- **Status**: ✅ Completed
- **Commit**: `0341779`
- **What was done**: Updated the Windows release preflight so blocked reports now include an "Executable Build Commands" section with the exact target-host PyInstaller command for producing `desktop/build/windows/WeisileLink.exe`. Refreshed the blocked Windows preflight evidence and documentation so the next Windows build host can follow the report directly without treating macOS developer state as release evidence.
- **Files created/modified**: `desktop/scripts/check_windows_release_preflight.py`, `tests/test_windows_release_preflight.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/evidence/windows-release-preflight.json`, `docs/desktop/evidence/windows-release-preflight.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Move to a real Windows build host, run the preflight report's executable build command to generate `desktop/build/windows/WeisileLink.exe`, configure `WEISILE_WINDOWS_SIGN_IDENTITY` and `WEISILE_WINDOWS_TIMESTAMP_URL`, rerun the Windows preflight until `Ready: yes`, then run `desktop/scripts/run_windows_release_flow.py`.

### [2026-05-29] Windows release handoff script
- **Status**: ✅ Completed
- **Commit**: `1a0f4ad`
- **What was done**: Added `desktop/windows/build_release.ps1`, a Windows-only PowerShell wrapper that runs the target-OS executable build, Windows release preflight, and guarded signed release flow in sequence. The script requires `WEISILE_WINDOWS_SIGN_IDENTITY` and `WEISILE_WINDOWS_TIMESTAMP_URL` or matching parameters, refuses non-Windows hosts, and never uses `--allow-unsigned`.
- **Files created/modified**: `desktop/windows/build_release.ps1`, `tests/test_windows_release_handoff.py`, `desktop/README.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Run `desktop/windows/build_release.ps1` on a real Windows build host with `signtool`, `WEISILE_WINDOWS_SIGN_IDENTITY`, and `WEISILE_WINDOWS_TIMESTAMP_URL` configured, then use the resulting signed release manifest for clean-machine `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] Windows signed installer evidence gate
- **Status**: ✅ Completed
- **Commit**: `19111a9`
- **What was done**: Strengthened `scripts/run_desktop_install_smoke.py` so Windows release-artifact evidence now requires signed installer manifest fields, not just a signed zip containing `WeisileLink.exe`. The gate rejects Windows manifests without `windows_installer`, `windows_installer_type`, `windows_installer_signed: true`, and a 64-character `windows_installer_sha256`; docs now state that a signed zip alone is not classroom evidence.
- **Files created/modified**: `scripts/run_desktop_install_smoke.py`, `tests/test_desktop_install_smoke.py`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Add or run the real Windows installer build step on a Windows build host so the signed release manifest records `windows_installer`, `windows_installer_type`, `windows_installer_signed`, and `windows_installer_sha256`, then collect clean-machine `vsle-bluetooth` install-smoke evidence.

### [2026-05-29] Mac browser full VSLE Bluetooth smoke priority
- **Status**: ✅ Completed
- **Commit**: `0789c31`
- **What was done**: Updated the development rules so a Mac browser full VSLE Bluetooth smoke is the first functional test path when Windows hardware is unavailable. The docs now require ScratchAI browser unsandboxed loading, local WeisileLink Desktop, real `vsle-bluetooth` command-group evidence, and a clear boundary that Mac smoke does not replace signed release-artifact or Windows evidence.
- **Files created/modified**: `AGENTS.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `tests/test_vsle_bluetooth_smoke.py`
- **Next step**: Use the Mac browser full VSLE Bluetooth smoke flow to validate the server-side Scratch EV3 module path, then collect signed macOS release-artifact evidence and separate Windows evidence when the required hosts are available.

### [2026-05-29] Mac browser full VSLE Bluetooth smoke gate
- **Status**: ✅ Completed
- **Commit**: `7b0e120`
- **What was done**: Added a combined evidence gate for the no-Windows functional path: ScratchAI browser Unsandboxed extension evidence plus real `vsle-bluetooth` command-group evidence. The generated report validates the server-side Scratch EV3 module path while keeping classroom release readiness, 50Hz Bluetooth readiness, and Windows evidence explicitly blocked.
- **Files created/modified**: `scripts/run_macos_browser_vsle_bluetooth_smoke.py`, `tests/test_macos_browser_vsle_bluetooth_smoke.py`, `docs/classroom/macos_browser_vsle_bluetooth_smoke.md`, `AGENTS.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Produce a signed and notarized macOS WeisileLink Desktop release artifact, install it on a clean macOS machine, collect `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json`, and use the accepted release evidence to unblock the no-WiFi Bluetooth classroom baseline.

### [2026-05-29] VSLE Bluetooth release evidence bridge
- **Status**: ✅ Completed
- **Commit**: `704635e`
- **What was done**: Added a bridge gate that applies clean-machine `vsle-bluetooth` desktop install evidence to the full Bluetooth classroom smoke JSON only after `scripts/run_desktop_install_smoke.py --mode vsle-bluetooth` would accept it. The current bridge report remains blocked because `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json` has not been collected from a signed/notarized clean-machine install.
- **Files created/modified**: `scripts/apply_vsle_bluetooth_install_evidence.py`, `tests/test_vsle_bluetooth_release_evidence_bridge.py`, `docs/classroom/vsle_bluetooth_release_evidence_bridge.md`, `AGENTS.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Configure real Developer ID Application and Installer identities plus an Apple notarytool profile, run `desktop/scripts/run_macos_release_flow.py` until it produces a signed/notarized app and signed `.pkg`, then install that package on a clean macOS machine and collect `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json`.

### [2026-05-29] macOS release blocker report details
- **Status**: ✅ Completed
- **Commit**: `ae2f5bf`
- **What was done**: Expanded the guarded macOS release-flow reports so blocked preflight runs include concrete `Preflight Blocking Checks` and the `Release Commands After Preflight Passes`. Regenerated the current macOS release-flow evidence, which now shows this machine has the local build outputs and tools but is blocked by missing Developer ID Application, Developer ID Installer, and Apple notarytool profile inputs.
- **Files created/modified**: `desktop/scripts/run_macos_release_flow.py`, `tests/test_macos_release_flow.py`, `docs/desktop/evidence/macos-release-flow.json`, `docs/desktop/evidence/macos-release-flow.md`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Install or provide the real Developer ID Application and Developer ID Installer identities plus `WEISILE_NOTARY_KEYCHAIN_PROFILE`, rerun `desktop/scripts/run_macos_release_flow.py` until the release-flow report is `release-flow-complete`, then collect clean-machine `vsle-bluetooth` install-smoke evidence.

### [2026-05-30] VSLE Bluetooth self-use unsigned validation
- **Status**: ✅ Completed
- **Commit**: `82d0c49`
- **What was done**: Added `--self-use-unsigned` to the full VSLE Bluetooth smoke runner so local/internal testing can pass on real `vsle-bluetooth` command-group evidence without Developer ID release evidence. The generated report keeps classroom readiness and release-artifact evidence blocked, making the boundary explicit.
- **Files created/modified**: `scripts/run_vsle_bluetooth_smoke.py`, `tests/test_vsle_bluetooth_smoke.py`, `docs/classroom/vsle_bluetooth_self_use_unsigned.md`, `AGENTS.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: If the project remains self-use only, continue using the self-use unsigned and Mac browser gates for functional regression; if external classroom distribution resumes, configure Developer ID signing/notarization and collect clean-machine install evidence.

### [2026-05-30] VSLE Bluetooth baseline release-evidence decoupling
- **Status**: ✅ Completed
- **Commit**: `e5c8d92`
- **What was done**: Decoupled `Bluetooth classroom baseline ready` from `installed_from_release_artifact` so self-use and internal Bluetooth classroom baseline tests can pass without Developer ID signing or notarization. Release evidence remains visible as the separate `Release-artifact evidence ready` verdict for future external distribution.
- **Files created/modified**: `scripts/run_vsle_bluetooth_smoke.py`, `tests/test_vsle_bluetooth_smoke.py`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`, `docs/classroom/vsle_bluetooth_self_use_unsigned.md`, `AGENTS.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Continue self-use regression with the Bluetooth baseline and Mac browser gates; only re-enable release-artifact install evidence as a required gate when signed external distribution is needed.

### [2026-05-30] Mac-first self-use Bluetooth regression pass
- **Status**: ✅ Completed
- **Commit**: `7bf0c1d`
- **What was done**: Re-ran the self-use regression gates against the current evidence: full VSLE Bluetooth baseline, self-use unsigned Bluetooth, and Mac browser full VSLE Bluetooth all returned exit code 0. The reports remained content-stable, with Bluetooth classroom baseline ready, Mac browser server-side path validated, release-artifact evidence still separate, and Bluetooth 50Hz still not ready.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Improve Bluetooth sampling freshness toward the separate 50Hz gate and expand physical EV3 sensor/port combination coverage.

### [2026-05-30] VSLE Bluetooth sensor port matrix gate
- **Status**: ✅ Completed
- **Commit**: `808d5b5`
- **What was done**: Added a real hardware sensor/motor port matrix gate for self-use `vsle-bluetooth` regression. The current matrix report accepts the observed S1 touch sensor and A motor evidence, while keeping S2-S4 and B-D visibly untested until future physical runs cover them.
- **Files created/modified**: `scripts/run_vsle_bluetooth_sensor_port_matrix.py`, `tests/test_vsle_bluetooth_sensor_port_matrix.py`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.template.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`, `AGENTS.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/SOURCE_REGISTER.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Run additional physical EV3 matrix captures for S2-S4 sensor types and B-D motor ports, then regenerate the matrix report before returning to the separate Bluetooth 50Hz freshness optimization.

### [2026-05-30] S2 ultrasonic USB matrix evidence
- **Status**: ✅ Completed
- **Commit**: `cab736f`
- **What was done**: Used USB SSH to verify the real EV3 had `vsle-ev3-server` active and ev3dev sysfs detected an ultrasonic sensor on input 2 as `lego-ev3-us`, mode `US-DIST-CM`, with a 124.4 cm reading. Added a redacted evidence JSON, updated the matrix gate to mark USB sysfs snapshots as freshness-not-applicable instead of a fake Bluetooth freshness value, fixed the template test so it no longer overwrites the checked-in report, and regenerated the matrix report with S2 covered.
- **Files created/modified**: `scripts/run_vsle_bluetooth_sensor_port_matrix.py`, `tests/test_vsle_bluetooth_sensor_port_matrix.py`, `docs/classroom/vsle_bluetooth_s2_usb_sysfs_20260530.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`
- **Next step**: Connect the next real sensor to S3 or S4, or connect a real motor to output B, then capture the next matrix evidence run and regenerate the report.

### [2026-05-30] B motor USB matrix evidence
- **Status**: ✅ Completed
- **Commit**: `acb21c1`
- **What was done**: Used USB SSH to verify the real EV3 still had `vsle-ev3-server` active and ev3dev sysfs detected a large motor on output B as `lego-ev3-l-motor`. Added a redacted B-port motor snapshot, updated the matrix gate so motor-only hardware snapshots can be recorded without pretending they are sensor stream updates, and regenerated the matrix report with B covered while keeping C and D untested.
- **Files created/modified**: `scripts/run_vsle_bluetooth_sensor_port_matrix.py`, `tests/test_vsle_bluetooth_sensor_port_matrix.py`, `docs/classroom/vsle_bluetooth_b_motor_usb_sysfs_20260530.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`
- **Next step**: Connect a real motor to output C or D, or move the next sensor to S3 or S4, then capture the next matrix evidence run and regenerate the report.

### [2026-05-30] C motor USB matrix evidence
- **Status**: ✅ Completed
- **Commit**: `4d37f9c`
- **What was done**: Used USB SSH to verify the real EV3 still had `vsle-ev3-server` active and ev3dev sysfs detected a large motor on output C as `lego-ev3-l-motor`. Added a redacted C-port motor snapshot and regenerated the matrix report with A, B, and C covered while keeping D untested.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_c_motor_usb_sysfs_20260530.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`
- **Next step**: Connect a real motor to output D, or move the next sensor to S3 or S4, then capture the next matrix evidence run and regenerate the report.

### [2026-05-30] D motor USB matrix evidence
- **Status**: ✅ Completed
- **Commit**: `d037092`
- **What was done**: Used USB SSH to verify the real EV3 still had `vsle-ev3-server` active and ev3dev sysfs detected a large motor on output D as `lego-ev3-l-motor`. Added a redacted D-port motor snapshot and regenerated the matrix report with A, B, C, and D motor ports all covered.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_d_motor_usb_sysfs_20260530.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`
- **Next step**: Move the next real sensor to S3 or S4, then capture the next matrix evidence run and regenerate the report.

### [2026-05-30] S3 ultrasonic USB matrix evidence
- **Status**: ✅ Completed
- **Commit**: `f8fff3d`
- **What was done**: Used USB SSH to verify the real EV3 still had `vsle-ev3-server` active and ev3dev sysfs detected an ultrasonic sensor on input 3 as `lego-ev3-us`, mode `US-DIST-CM`, with a 139.7 cm reading. Added a redacted S3 sensor snapshot and regenerated the matrix report with S1, S2, and S3 covered while keeping S4 untested.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_s3_ultrasonic_usb_sysfs_20260530.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`
- **Next step**: Move the next real sensor to S4, then capture the next matrix evidence run and regenerate the report.

### [2026-05-30] S4 touch USB matrix evidence
- **Status**: ✅ Completed
- **Commit**: `deb0306`
- **What was done**: Used USB SSH to verify the real EV3 still had `vsle-ev3-server` active and ev3dev sysfs detected a touch sensor on input 4 as `lego-ev3-touch`, mode `TOUCH`, with `pressed: false`. Added a redacted S4 sensor snapshot and regenerated the matrix report with S1-S4 sensor ports and A-D motor ports all covered.
- **Files created/modified**: `docs/classroom/vsle_bluetooth_s4_touch_usb_sysfs_20260530.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.json`, `docs/classroom/vsle_bluetooth_sensor_port_matrix.md`
- **Next step**: Return to the separate Bluetooth 50Hz freshness optimization, or repeat the matrix with additional sensor types such as gyro, color, and infrared.

### [2026-05-30] Bluetooth sensor send backpressure optimization
- **Status**: ✅ Completed
- **Commit**: `062ad65`
- **What was done**: Added an EV3-side Bluetooth latest-sensor send queue so compact `sensor_update` broadcasts no longer await a slow RFCOMM `sendall` call inside the 50Hz sampling loop. Command acknowledgements still use the regular awaited send path, while sensor updates coalesce to the newest payload if the Bluetooth link stalls.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`
- **Next step**: Deploy the updated `ev3-firmware/vsle_ev3_server.py` to the real EV3, restart `vsle-ev3-server`, and rerun the real `vsle-bluetooth` freshness smoke to measure whether `sensor_freshness_ms_max` moves toward the separate `<= 25ms` 50Hz gate.

### [2026-05-30] Bluetooth 50Hz teaching gate clarification
- **Status**: ✅ Completed
- **Commit**: `3f0a1df`
- **What was done**: Updated the full VSLE Bluetooth smoke report so `<= 25ms` freshness is treated as an optional high-speed/raw-streaming target rather than a blocker for ordinary teaching or self-use. Regenerated the baseline and self-use reports and added a regression assertion that baseline-ready evidence with a slower Bluetooth stream still reports the 50Hz items as optional.
- **Files created/modified**: `scripts/run_vsle_bluetooth_smoke.py`, `tests/test_vsle_bluetooth_smoke.py`, `docs/classroom/vsle_bluetooth_full_module_smoke.md`, `docs/classroom/vsle_bluetooth_self_use_unsigned.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`
- **Next step**: Continue teaching/self-use regression on the Bluetooth classroom baseline and Mac browser gates; only deploy and retest the 50Hz optimization when a lesson explicitly needs high-speed raw streaming.

### [2026-05-30] Mac-first teaching self-use regression pass
- **Status**: ✅ Completed
- **Commit**: `102af00`
- **What was done**: Re-ran the teaching/self-use regression gates from the Mac-first Bluetooth path: full VSLE Bluetooth baseline, self-use unsigned Bluetooth, Mac browser full VSLE Bluetooth, and the physical sensor/motor port matrix all returned exit code 0. The reports remained content-stable: Bluetooth classroom baseline and self-use unsigned are ready, Mac browser server-side Scratch EV3 module path is validated, sensor and motor matrix coverage has no untested ports, while release-artifact, Windows, and optional 50Hz high-speed evidence remain separate.
- **Files created/modified**: `docs/classroom/evidence/macos_first_self_use_regression_20260530.json`
- **Next step**: Use this Mac-first baseline for ordinary teaching/self-use lessons, then run one browser-guided Scratch block rehearsal with a real EV3 project to confirm the teacher-facing workflow end to end.

### [2026-05-30] ScratchAI teacher block rehearsal gate
- **Status**: ✅ Completed
- **Commit**: `4be19d4`
- **What was done**: Added a dedicated evidence gate for the teacher-facing ScratchAI browser block rehearsal after the Mac-first Bluetooth baseline. The gate requires the website to keep the standard Scratch visual design, load VSLE-EV3 as an Unsandboxed main-thread script, select `Bluetooth Full VSLE`/`vsle-bluetooth`, avoid direct browser Bluetooth, show connection state from WeisileLink health and sensor freshness, and exercise at least one Scratch block from each EV3 module.
- **Files created/modified**: `scripts/run_scratchai_teacher_block_rehearsal.py`, `tests/test_scratchai_teacher_block_rehearsal.py`, `docs/classroom/scratchai_teacher_block_rehearsal.template.json`, `docs/classroom/SCRATCHAI_TEACHER_BLOCK_REHEARSAL.md`, `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/classroom/README.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Fill `docs/classroom/evidence/scratchai_teacher_block_rehearsal_YYYYMMDD.json` from a real browser-guided Scratch project run against the EV3, run `scripts/run_scratchai_teacher_block_rehearsal.py`, and only then update the teacher-facing rehearsal report from blocked to passing evidence.

### [2026-06-01] Real EV3 USB paired smoke evidence
- **Status**: ✅ Completed
- **Commit**: `de90418`
- **What was done**: Recovered the EV3 USB endpoint after mDNS moved from `169.254.253.67` to `169.254.5.255`, identified missing pairing-token authentication as the cause of the first WeisileLink disconnect, and captured a token-paired real EV3 USB/WebSocket smoke. The paired run confirmed the real endpoint and transport, safety stop acknowledgements, and 62 sensor notifications over 10 seconds; a browser attempt also recorded that the currently served static ScratchAI build still points EV3 to the deployed public extension URL while the local-url webpack preview did not finish bundling.
- **Files created/modified**: `docs/classroom/evidence/real_ev3_usb_smoke_readiness_20260601.json`, `docs/classroom/evidence/real_ev3_usb_smoke_readiness_20260601.md`, `docs/classroom/evidence/real_ev3_usb_smoke_evidence_20260601.json`, `docs/classroom/evidence/real_ev3_usb_smoke_report_20260601.json`, `docs/classroom/evidence/real_ev3_usb_smoke_report_20260601.md`, `docs/classroom/evidence/real_ev3_usb_smoke_transcript_20260601.json`, `docs/classroom/evidence/real_ev3_usb_paired_smoke_evidence_20260601.json`, `docs/classroom/evidence/real_ev3_usb_paired_smoke_report_20260601.json`, `docs/classroom/evidence/real_ev3_usb_paired_smoke_report_20260601.md`, `docs/classroom/evidence/real_ev3_usb_paired_smoke_transcript_20260601.json`, `docs/classroom/evidence/scratchai_browser_local_ev3_attempt_20260601.json`, `docs/classroom/evidence/scratchai_browser_local_ev3_attempt_20260601.png`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Fix or rebuild the ScratchAI preview so `SCRATCH_AI_VSLE_EV3_EXTENSION_URL=http://127.0.0.1:8000/vsle-ev3-extension/index.js` produces a browser-loadable bundle, then rerun local browser Unsandboxed evidence; separately continue the longer sensor freshness, AI Quest, and multi-device gates.

### [2026-06-01] Local ScratchAI browser EV3 extension evidence
- **Status**: ✅ Completed
- **Commit**: `f489db4`
- **What was done**: Added a tested local preview preparation helper that rewrites only ignored Scratch GUI build artifacts from the deployed EV3 extension URL to `http://127.0.0.1:8000/vsle-ev3-extension/index.js` and cache-busts the local HTML bundle entry. Re-ran the in-app browser path at `http://127.0.0.1:8611/?ev3sc-local-preview=local`, clicked the EV3 extension tile, and captured evidence showing the local VSLE-EV3 script loaded on the main thread with no `extension-worker` or public EV3 extension URL reference.
- **Files created/modified**: `scripts/prepare_scratchai_local_ev3_preview.py`, `tests/test_scratchai_local_ev3_preview.py`, `docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md`, `docs/classroom/evidence/scratchai_browser_local_unsandboxed_20260601.json`, `docs/classroom/evidence/scratchai_browser_local_unsandboxed_20260601.png`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Fill and validate the teacher-facing Scratch block rehearsal evidence against the real EV3 path, especially `Bluetooth Full VSLE` selection, connection state from WeisileLink health/freshness, and one Scratch block per EV3 module; current full Bluetooth evidence still needs the AI Quest/full command-group blockers resolved before the combined Mac browser gate can pass again.

### [2026-06-01] Teacher block rehearsal preflight evidence
- **Status**: ✅ Completed
- **Commit**: `1b69249`
- **What was done**: Captured a teacher-facing Scratch block rehearsal preflight from the live local ScratchAI browser page. The preflight confirms the local VSLE-EV3 extension remains loaded as a main-thread script and EV3 blocks are visible, while the generated gate report correctly stays blocked because `Bluetooth Full VSLE` was not selected in the browser, local WeisileLink was not listening on `20111`/`8766`, the EV3 USB endpoint was not reachable during the probe, and no Scratch block execution evidence was collected.
- **Files created/modified**: `docs/classroom/evidence/scratchai_teacher_block_rehearsal_preflight_20260601.json`, `docs/classroom/evidence/scratchai_teacher_block_rehearsal_preflight_20260601.png`, `docs/classroom/SCRATCHAI_TEACHER_BLOCK_REHEARSAL.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Restore a live WeisileLink + real EV3 connection, select `Bluetooth Full VSLE` from the Scratch connection flow, execute at least one Scratch block from each EV3 module, then regenerate the teacher block rehearsal evidence until `scripts/run_scratchai_teacher_block_rehearsal.py` returns exit code 0.

### [2026-06-02] Browser EV3 sensor notification subscription
- **Status**: ✅ Completed
- **Commit**: `23b1adb`
- **What was done**: Fixed the VSLE-EV3 Unsandboxed browser client so it sends `startNotifications` immediately after opening the local WeisileLink WebSocket. This allows Scratch reporter and Boolean blocks to receive the EV3 sensor stream through the cache instead of staying on default values after a successful paired WeisileLink connection.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/tests/test_turbowarp_integration.js`
- **Next step**: Refresh the local ScratchAI browser page against the updated local EV3 extension and re-check `EV3已连接?` / battery reporter values with the token-paired WeisileLink service still running.

### [2026-06-02] Browser EV3 host freshness status
- **Status**: ✅ Completed
- **Commit**: `cc07d4d`
- **What was done**: Fixed the browser-side EV3 connection reporter to use the host receive time for freshness while preserving the EV3 payload timestamp for sample metadata. This handles real ev3dev bricks whose system clock can lag behind the teacher computer, so cache-backed reporters can show real values such as battery voltage while `EV3已连接?` still reflects recently received data.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`
- **Next step**: Refresh the local ScratchAI browser preview against the updated local extension URL and verify `EV3已连接?` now returns `true` while `EV3电池电压 (V)` continues to report the real EV3 battery value.

### [2026-06-02] GitHub sync blocked for browser EV3 freshness fix
- **Status**: ⚠️ Blocked
- **Commit**: `b577535` local only
- **What was done**: Attempted to push the browser EV3 host freshness fix and progress log to `origin/codex/native-adapter-process`, but GitHub HTTPS failed repeatedly with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Restore GitHub network access and rerun `git push origin codex/native-adapter-process` before marking the browser EV3 freshness fix fully synchronized.

### [2026-06-02] Public ScratchAI VSLE extension sync
- **Status**: ✅ Completed
- **Commit**: `6958e47`
- **What was done**: Synced the current EV3SC-owned VSLE-EV3 extension to `http://101.42.92.6:18612/` as release `scratchai-18612-20260602-vsle-extension-freshness` while preserving the remote Scratch GUI build and public extension URL. Verified that the public extension route now serves `Bluetooth Full VSLE`, `vsle-bluetooth`, and the `received_at_ms` host freshness fix; also recorded that the cloud server itself cannot directly test Bluetooth because the architecture requires local WeisileLink Desktop on the teacher computer.
- **Files created/modified**: `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_sync_20260602.json`, `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_sync_20260602.md`, `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Open `http://101.42.92.6:18612/` from the teacher computer with WeisileLink Desktop running locally, select `Bluetooth Full VSLE`, and collect real EV3 Bluetooth/Scratch block evidence from the local machine.

### [2026-06-02] Public ScratchAI local Bluetooth teacher guide
- **Status**: ✅ Completed
- **Commit**: `de9027b`
- **What was done**: Added teacher-facing documentation for the public ScratchAI website plus local WeisileLink Desktop Bluetooth Full VSLE evidence flow. The guide explains the cloud/local Bluetooth boundary, safe classroom block checklist, evidence fields, validation command, and quick troubleshooting, with a separate README for fast teacher onboarding.
- **Files created/modified**: `docs/classroom/SCRATCHAI_PUBLIC_SITE_LOCAL_BLUETOOTH_E2E.md`, `docs/classroom/public-site-local-bluetooth-readme/README.md`, `docs/classroom/README.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Use the guide on a teacher computer with WeisileLink Desktop and a paired ev3dev EV3 to fill `docs/classroom/evidence/scratchai_teacher_block_rehearsal_YYYYMMDD.json`, then run `scripts/run_scratchai_teacher_block_rehearsal.py`.

### [2026-06-02] Public ScratchAI USB token recovery README
- **Status**: ✅ Completed
- **Commit**: `0dd0549`
- **What was done**: Updated the root README with the current public ScratchAI plus local `vsle-bluetooth` test flow, including the exact developer-checkout WeisileLink startup command, the expected EV3 extension/category check, and the distinction between Bluetooth physical connection and sensor-stream authorization. The README now states that USB is only needed for first setup, token recovery, or EV3 service troubleshooting, not for every normal Bluetooth lesson.
- **Files created/modified**: `README.md`
- **Next step**: Use the USB connection only to retrieve the pairing token or verify the EV3 service state, restart local WeisileLink with the token, then rerun the public ScratchAI `Bluetooth Full VSLE` sensor-stream test.

### [2026-06-02] EV3 numeric boolean cache normalization
- **Status**: ✅ Completed
- **Commit**: `64f094d`
- **What was done**: During the real Bluetooth sensor rehearsal, S4 touch hardware was confirmed to stream `0 → 1 → 0` over WeisileLink while Scratch stayed false because browser Boolean blocks only accepted strict `true`. Normalized EV3 cache-backed Boolean reads so numeric `1`/`0` values work for S4 touch, brick buttons, motor running state, wait blocks, and the sensor panel.
- **Files created/modified**: `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `vsle-ev3-extension/tests/test_sensor_data_panel.js`
- **Next step**: Sync the updated extension to the public ScratchAI route, refresh the browser page, and rerun the S4 touch block test against the real EV3.

### [2026-06-02] GitHub sync blocked for numeric boolean fix
- **Status**: ⚠️ Blocked
- **Commit**: `7082795` local only
- **What was done**: Attempted to push the numeric EV3 Boolean normalization fix and progress log to `origin/codex/native-adapter-process`, but GitHub HTTPS failed with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Restore GitHub HTTPS network access and rerun `git push origin codex/native-adapter-process` before marking the numeric Boolean fix fully synchronized.

### [2026-06-02] GitHub sync restored for numeric boolean fix
- **Status**: ✅ Completed
- **Commit**: `0122ac9`
- **What was done**: Rechecked GitHub HTTPS connectivity and successfully pushed the numeric EV3 Boolean normalization fix, its progress entry, and the recorded push-blocker entry to `origin/codex/native-adapter-process`.
- **Files created/modified**: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Publish the updated `vsle-ev3-extension/index.js` to the public ScratchAI route and rerun the real S4 touch block test from the browser.

### [2026-06-02] Public ScratchAI numeric Boolean extension sync
- **Status**: ✅ Completed
- **Commit**: `7ca1a88`
- **What was done**: Published the updated EV3SC-owned `vsle-ev3-extension/` to the public ScratchAI host as release `scratchai-18612-20260602-numeric-boolean`, preserving the existing Scratch GUI build and its public EV3 extension URL. Verified that the public extension route SHA-256 matches the local extension and includes the `safeBoolean` numeric EV3 Boolean fix for payloads such as S4 touch `pressed: 1`.
- **Files created/modified**: `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_numeric_boolean_sync_20260602.json`, `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_numeric_boolean_sync_20260602.md`, `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`
- **Next step**: Refresh the public ScratchAI browser page, re-add the EV3 extension so the browser loads the updated script, and rerun the real S4 touch block test with local WeisileLink Bluetooth running.

### [2026-06-03] VSLE Bluetooth reconnect and connection cadence
- **Status**: ✅ Completed
- **Commit**: `a17d9af`
- **What was done**: Fixed the local `vsle-bluetooth` transport so repeated Scratch/diagnostic `connect` calls reuse the active EV3 RFCOMM session instead of reopening the native adapter stream. Also adjusted the EV3 browser connection reporter to tolerate the measured Bluetooth classroom baseline cadence while keeping reporter and Boolean blocks cache-backed.
- **Files created/modified**: `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/tests/test_bluetooth_transport.py`, `vsle-ev3-extension/index.js`, `vsle-ev3-extension/tests/test_extension.js`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Sync the updated VSLE extension to `http://101.42.92.6:18612/`, restart the local WeisileLink process from the updated checkout, hard-refresh ScratchAI, and rerun S1-S4 real sensor checks without USB.

### [2026-06-03] Public ScratchAI Bluetooth reconnect extension sync
- **Status**: ✅ Completed
- **Commit**: `b93a2ab`
- **What was done**: Published the Bluetooth reconnect/cadence VSLE-EV3 extension to the public ScratchAI host as release `scratchai-18612-20260603-bt-reconnect-cadence`. Verified the public extension SHA-256 matches local, contains `CONNECTION_STALE_MS = 5000`, keeps numeric EV3 Boolean handling, and the public preview/middleware/asset services are active.
- **Files created/modified**: `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_bt_reconnect_cadence_sync_20260603.json`, `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_bt_reconnect_cadence_sync_20260603.md`, `docs/deployment/SCRATCHAI_101_42_92_6_DEPLOYMENT_AUDIT.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Stop any older local WeisileLink process, restart it from the updated checkout with the saved pairing token, hard-refresh `http://101.42.92.6:18612/`, re-add the EV3 extension, and rerun the real S1-S4 sensor checks without USB.

### [2026-06-03] EV3 classroom provisioning design
- **Status**: ✅ Completed
- **Commit**: `3d7aa62`
- **What was done**: Added a classroom provisioning design for scaling EV3SC beyond the current developer USB/token workflow. The design defines an unprovisioned EV3 golden SD image, first-boot identity and claim-code generation, Desktop pairing wizard, secure token storage, macOS package requirements, Windows MSI/native Bluetooth adapter requirements, classroom roster support, and clean-machine acceptance gates.
- **Files created/modified**: `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `docs/classroom/README.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement the first vertical slice: EV3 first-boot claim-code provisioning, `auth.claim`, Desktop profile/token storage, and a minimal pairing wizard that pairs one fresh EV3 without USB.

### [2026-06-03] EV3 first-boot provisioning assets
- **Status**: ✅ Completed
- **Commit**: `ee176c6`
- **What was done**: Added the EV3 first-boot provisioning tool and systemd unit so classroom golden SD cards remain unprovisioned until each cloned EV3 boots for the first time. The first boot now creates a unique brick ID, pairing token, claim code, private env file, non-secret device manifest, and golden-image install path without baking one token into every cloned card.
- **Files created/modified**: `ev3-firmware/scripts/vsle_firstboot.py`, `ev3-firmware/systemd/vsle-firstboot.service`, `ev3-firmware/scripts/install_ev3_autostart.sh`, `ev3-firmware/scripts/rollback_ev3_autostart.sh`, `ev3-firmware/README.md`, `tests/test_ev3_autostart_assets.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement the `auth.claim` EV3 server and WeisileLink pairing contract so WeisileLink Desktop can claim a fresh EV3 by brick ID and claim code, store the pairing token securely, and start Bluetooth Full VSLE without USB.

### [2026-06-03] EV3 claim pairing handshake
- **Status**: ✅ Completed
- **Commit**: `80a1afb`
- **What was done**: Implemented the EV3 `auth.claim` pairing handshake for first-run classroom provisioning. The EV3 server now validates the one-time claim code, rate-limits failed attempts, returns the long runtime pairing token and device manifest only on success, marks the claim code used in the private env file, and WeisileLink Bluetooth transport now has a tested `claim()` method for the Desktop pairing wizard.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/tests/test_bluetooth_transport.py`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement Desktop profile and credential storage so the claimed token is saved outside the visible config file, with macOS Keychain and Windows Credential Manager adapters behind a common WeisileLink Desktop credential interface.

### [2026-06-03] Desktop secure EV3 profile storage
- **Status**: ✅ Completed
- **Commit**: `bc4ff76`
- **What was done**: Added the WeisileLink Desktop profile and credential layer for classroom EV3 pairing. `auth.claim` results can now be saved as non-secret profiles while the raw pairing token is stored behind macOS Keychain or Windows Credential Manager references; runtime startup can resolve a profile back into the needed environment without writing tokens into `config.json`.
- **Files created/modified**: `weisile-link/weisile_link/desktop/profiles.py`, `weisile-link/weisile_link/desktop/__init__.py`, `weisile-link/tests/test_desktop_profiles.py`, `desktop/README.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Implement the first-run Desktop pairing command/wizard flow that opens Bluetooth, calls `BluetoothTransport.claim()`, saves the secure profile, starts WeisileLink from the saved profile, and performs the ready-check sensor subscription without USB.

### [2026-06-03] Desktop first-run EV3 pairing command
- **Status**: ✅ Completed
- **Commit**: `f66ceb4`
- **What was done**: Added a minimal first-run Desktop pairing flow exposed through `python -m weisile_link desktop-pair`. The command opens full VSLE Bluetooth, calls EV3 `auth.claim`, saves the secure profile, reconnects using the stored credential, waits for a sensor update as the ready check, and prints only redacted JSON with `paired`, `ready`, and `ready_check` fields.
- **Files created/modified**: `weisile-link/weisile_link/desktop/pairing.py`, `weisile-link/tests/test_desktop_pairing.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/desktop/__init__.py`, `desktop/README.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Wire the saved Desktop profile into the packaged WeisileLink startup path so the app can launch/reconnect the local JSON-RPC bridge from `config.json`, surface the four teacher health states, and open ScratchAI without terminal environment variables.

### [2026-06-03] Desktop saved-profile startup path
- **Status**: ✅ Completed
- **Commit**: `1e66ce9`
- **What was done**: Added the Desktop runtime startup layer that resolves a saved EV3 profile from `config.json`, retrieves the raw token from the secure credential backend, converts it into a token-aware WeisileLink runtime config, and exposes `python -m weisile_link desktop-start` plus `--check-only` for the four teacher states: ready, starting, needs pairing, and needs attention. The startup payload is safe for a classroom UI and does not print pairing tokens.
- **Files created/modified**: `weisile-link/weisile_link/desktop/runtime.py`, `weisile-link/tests/test_desktop_runtime.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/desktop/__init__.py`, `desktop/README.md`
- **Next step**: Add the one-click ScratchAI launch and packaged Desktop supervision wrapper so macOS/Windows app shells can start `desktop-start`, monitor `20111`/`8766`, open the public ScratchAI URL, and route failures into guided diagnostics.

### [2026-06-03] Desktop ScratchAI supervisor launch
- **Status**: ✅ Completed
- **Commit**: `7b16cd8`
- **What was done**: Added a reusable Desktop supervisor layer and `python -m weisile_link desktop-supervise` command for the future macOS/Windows app shells. The supervisor runs a stored-credential EV3 ready-check, starts a child `desktop-start` bridge without placing tokens on the command line, monitors local ports `20111` and `8766`, optionally opens the configured ScratchAI URL, and returns redacted four-state JSON that routes missing credentials to pairing and bridge/EV3 failures to guided diagnostics.
- **Files created/modified**: `weisile-link/weisile_link/desktop/supervisor.py`, `weisile-link/tests/test_desktop_supervisor.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/desktop/__init__.py`, `desktop/README.md`
- **Next step**: Wire the supervisor into macOS LaunchAgent and Windows shortcut/startup assets so installed packages call `desktop-supervise` with the bundled native adapter, preserve localhost defaults, and expose diagnostics/log paths suitable for clean-machine install smoke evidence.

### [2026-06-03] Desktop supervisor startup assets
- **Status**: ✅ Completed
- **Commit**: `71a5b72`
- **What was done**: Updated the macOS LaunchAgent, macOS installer script, Windows startup script, and Windows service template so installed Desktop assets call `desktop-supervise` instead of the old developer environment-variable startup path. The assets keep localhost defaults, pass the bundled macOS native adapter, create documented config/log/diagnostics directories, avoid forcing `WEISILE_TRANSPORT=wifi`, and keep Windows native RFCOMM adapter support gated until the adapter exists.
- **Files created/modified**: `desktop/macos/weisile-link.launchd.plist`, `desktop/macos/install.sh`, `desktop/windows/install.ps1`, `desktop/windows/weisile-link-service.xml`, `desktop/scripts/validate_desktop_assets.py`, `tests/test_desktop_packaging.py`, `tests/test_desktop_release_packaging.py`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`
- **Next step**: Add a teacher-safe Desktop diagnostics/status command that runs the same local port, profile, credential, native adapter, and sensor-stream checks used by the supervisor, then writes a redacted support bundle for clean-machine install smoke evidence.

### [2026-06-03] Desktop safe diagnostics command
- **Status**: ✅ Completed
- **Commit**: `d0a1ceb`
- **What was done**: Added `python -m weisile_link desktop-diagnostics` and a reusable Desktop diagnostics service. The command checks saved profile presence, secure credential availability, native adapter executability, local ports `20111` and `8766`, EV3 authentication, and fresh sensor stream readiness, then prints or writes a recursive redacted support bundle that hides pairing tokens, API keys, Bluetooth addresses by default, long labels, and raw student data.
- **Files created/modified**: `weisile-link/weisile_link/desktop/diagnostics.py`, `weisile-link/tests/test_desktop_diagnostics.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/desktop/__init__.py`, `desktop/README.md`, `docs/desktop/DIAGNOSTICS.md`
- **Next step**: Thread the diagnostics command into clean-machine install smoke evidence so release artifacts can prove installed-from-artifact startup, localhost endpoint readiness, diagnostics export redaction, and real EV3 Bluetooth sensor readiness in one evidence JSON.

### [2026-06-03] Desktop install smoke diagnostics evidence gate
- **Status**: ✅ Completed
- **Commit**: `3f1627c`
- **What was done**: Updated the clean-machine desktop install smoke gate so release evidence must include an installed `desktop-diagnostics` export, default redaction approval, and a real EV3 Bluetooth sensor-ready signal. The validator now opens the diagnostics bundle, requires `state: ready` and a passing `ev3_ready_check`, rejects unredacted tokens/API keys/Bluetooth addresses/student data, and records diagnostics metadata when applying accepted VSLE Bluetooth release evidence to classroom smoke evidence.
- **Files created/modified**: `scripts/run_desktop_install_smoke.py`, `tests/test_desktop_install_smoke.py`, `scripts/apply_vsle_bluetooth_install_evidence.py`, `tests/test_vsle_bluetooth_release_evidence_bridge.py`, `docs/desktop/DIAGNOSTICS.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`, `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json`, `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json`, `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement fleet-facing classroom profile support: import/export a roster package, map expected S1-S4 sensors per EV3, and use the saved roster data in Desktop ready checks so teachers can prepare multiple EV3 bricks without terminal commands.

### [2026-06-03] Desktop classroom roster profiles
- **Status**: ✅ Completed
- **Commit**: `26fdfcc`
- **What was done**: Added non-secret classroom roster import/export support through `python -m weisile_link desktop-roster`. The Desktop profile store now persists roster devices and expected S1-S4 sensor layouts, merges matching roster data into paired profiles, and Desktop ready checks require expected real sensor ports before reporting `ready` when a roster layout is present.
- **Files created/modified**: `weisile-link/weisile_link/desktop/roster.py`, `weisile-link/weisile_link/desktop/profiles.py`, `weisile-link/weisile_link/desktop/pairing.py`, `weisile-link/weisile_link/desktop/runtime.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/desktop/__init__.py`, `weisile-link/tests/test_desktop_roster.py`, `weisile-link/tests/test_desktop_profiles.py`, `weisile-link/tests/test_desktop_pairing.py`, `weisile-link/tests/test_desktop_runtime.py`, `desktop/README.md`, `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement the next fleet-tools slice: device rename flow, token rotation command, and lost-token recovery guardrails so a teacher can maintain a classroom set after the initial roster import.

### [2026-06-03] Desktop fleet maintenance commands
- **Status**: ✅ Completed
- **Commit**: `edc39f7`
- **What was done**: Added the first fleet maintenance command set for classroom EV3 upkeep. Teachers can now rename a device/profile without touching credentials, rotate a runtime pairing token through authenticated `auth.rotate`, and run a guarded lost-token recovery flow that preserves non-secret roster data and never prints raw old or new tokens.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `weisile-link/weisile_link/transport/bluetooth_transport.py`, `weisile-link/tests/test_bluetooth_transport.py`, `weisile-link/weisile_link/desktop/maintenance.py`, `weisile-link/tests/test_desktop_maintenance.py`, `weisile-link/weisile_link/desktop/profiles.py`, `weisile-link/weisile_link/cli.py`, `weisile-link/weisile_link/desktop/__init__.py`, `desktop/README.md`, `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Implement multi-EV3 profile selection for the Desktop startup/supervisor path so a teacher can choose which paired classroom brick to launch without editing config files.

### [2026-06-03] Desktop multi-EV3 profile selection
- **Status**: ✅ Completed
- **Commit**: `651dbd6`
- **What was done**: Added token-safe multi-EV3 profile selection for the Desktop classroom path. `desktop-device list` now shows paired device summaries without credential references, `desktop-device select` updates the default brick, and `desktop-start`/`desktop-supervise` can launch either the selected default or a one-time `--brick-id` override while keeping pairing tokens out of command output and child process arguments.
- **Files created/modified**: `weisile-link/weisile_link/desktop/profiles.py`, `weisile-link/weisile_link/desktop/maintenance.py`, `weisile-link/tests/test_desktop_maintenance.py`, `weisile-link/tests/test_desktop_runtime.py`, `weisile-link/tests/test_desktop_supervisor.py`, `desktop/README.md`, `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Add a 10-device fleet rehearsal evidence gate that imports a roster, pairs/selects multiple simulated classroom EV3 profiles, runs Desktop startup/supervisor checks for each profile, and records token-safe evidence before moving to signed clean-machine package evidence.

### [2026-06-03] Desktop fleet rehearsal evidence gate
- **Status**: ✅ Completed
- **Commit**: `8bedbc3`
- **What was done**: Added a simulated 10-device Desktop fleet rehearsal gate. The runner imports a token-free classroom roster, saves paired profiles through the secure Desktop profile layer, selects each classroom EV3, runs startup and supervisor checks for every profile, rejects fewer than 10 devices, and writes token-safe JSON and Markdown evidence that remains explicitly separate from signed release-artifact readiness.
- **Files created/modified**: `scripts/run_desktop_fleet_rehearsal.py`, `tests/test_desktop_fleet_rehearsal.py`, `docs/desktop/evidence/desktop-fleet-rehearsal.json`, `docs/desktop/DESKTOP_FLEET_REHEARSAL.md`, `desktop/README.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `docs/SOURCE_REGISTER.md`
- **Next step**: Collect signed clean-machine macOS/Windows release evidence and real EV3 Bluetooth install smoke artifacts, starting with the macOS Developer ID/notarization release flow when signing credentials are available.

### [2026-06-03] Desktop release evidence readiness blocked
- **Status**: ✅ Completed
- **Commit**: `1b8dd09`
- **What was done**: Refreshed the guarded macOS and Windows release-evidence gates. Both release flows stopped at preflight and executed zero release commands: macOS is blocked by missing Developer ID Application identity, Developer ID Installer identity, and notarytool profile; Windows is blocked because this host is macOS, SignTool is unavailable, `WeisileLink.exe` is missing, and Windows signing/timestamp inputs are not configured.
- **Files created/modified**: `docs/desktop/evidence/release-evidence-readiness-20260603.json`, `docs/desktop/evidence/release-evidence-readiness-20260603.md`, `docs/desktop/evidence/macos-release-flow.json`, `docs/SOURCE_REGISTER.md`
- **Next step**: Provide macOS Developer ID Application and Installer identities plus `WEISILE_NOTARY_KEYCHAIN_PROFILE`, then rerun `desktop/scripts/run_macos_release_flow.py`; or move to a Windows build host with SignTool, `desktop/build/windows/WeisileLink.exe`, `WEISILE_WINDOWS_SIGN_IDENTITY`, and `WEISILE_WINDOWS_TIMESTAMP_URL`, then collect clean-machine EV3 Bluetooth install smoke evidence from the signed artifact.

### [2026-06-03] Internal unsigned desktop release target
- **Status**: ✅ Completed
- **Commit**: `4380712`
- **What was done**: Split desktop release evidence into Internal Test Release and Production Release tracks. Added reproducible unsigned internal build commands, generated a macOS unsigned internal artifact/evidence report, recorded `needs_pairing` as the expected unpaired startup state, and kept Developer ID signing, notarization, Windows signing, timestamp URLs, and SmartScreen/publisher reputation as Production Release Blocker items only.
- **Files created/modified**: `desktop/scripts/run_internal_release_flow.py`, `tests/test_internal_release_flow.py`, `package.json`, `README.md`, `desktop/README.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WINDOWS_INSTALL.md`, `docs/desktop/evidence/internal-release.json`, `docs/desktop/evidence/internal-release.md`, `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md`, `AGENTS.md`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Run `npm run build:win:internal` on a real Windows host or GitHub Actions `windows-latest`, then use the generated unsigned Windows internal evidence for tester handoff while leaving production signing and notarization for the Production Release stage.

### [2026-06-03] GitHub Actions Windows internal release evidence
- **Status**: ✅ Completed
- **Commit**: `ee84e98`
- **What was done**: Added and pushed a `windows-latest` GitHub Actions workflow that runs `npm run build:win:internal`, then confirmed run `26879990306` completed successfully. The workflow uploaded the unsigned internal artifact bundle as `windows-internal-release-evidence` (artifact `7382544085`, digest `sha256:1853a7de52b37c683247440afa8cf66d112fe19993bc5876f4a20f1528c75fb0`); local unauthenticated artifact download returns GitHub `401`, so testers should download it through the authenticated Actions UI.
- **Files created/modified**: `.github/workflows/windows-internal-release.yml`, `scripts/run_internal_release_flow.js`, `package.json`, `tests/test_internal_release_flow.py`, `README.md`, `desktop/README.md`, `docs/desktop/MACOS_INSTALL.md`, `docs/desktop/WEISILELINK_DESKTOP.md`, `docs/desktop/WINDOWS_INSTALL.md`
- **Next step**: Download the `windows-internal-release-evidence` artifact from the successful GitHub Actions run and use its unsigned Windows evidence for internal tester handoff; keep Windows code signing, timestamp URL, and SmartScreen reputation on the Production Release track only.

### [2026-06-03] Windows internal release artifact handoff evidence
- **Status**: ✅ Completed
- **Commit**: `c63a6f6`
- **What was done**: Downloaded the authenticated GitHub Actions artifact `windows-internal-release-evidence` from run `26879990306` and stored it as EV3SC-owned internal Windows unsigned test delivery evidence. Verified the local artifact SHA-256 matches the GitHub Actions digest `sha256:1853a7de52b37c683247440afa8cf66d112fe19993bc5876f4a20f1528c75fb0`, recorded the download receipt, and confirmed the zip contains the Windows unsigned internal release evidence, `WeisileLink.exe`, installer helpers, service metadata, manifest, and unsigned release zip.
- **Files created/modified**: `docs/desktop/evidence/windows-internal-release-evidence/windows-internal-release-evidence.zip`, `docs/desktop/evidence/windows-internal-release-evidence/README.md`, `docs/desktop/evidence/windows-internal-release-evidence/download-receipt.json`, `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- **Next step**: Hand the unsigned Windows internal artifact to VSLE-controlled internal testers and collect clean-machine Windows install smoke evidence before any Windows package is treated as release-artifact classroom evidence; keep production Windows code signing, timestamp URL, and SmartScreen/publisher reputation gates separate.

### [2026-06-03] Installation wizard initial package
- **Status**: ✅ Completed
- **Commit**: `9e5e4b9`
- **What was done**: Created the first consolidated installation wizard package with a Chinese step-by-step guide, install file manifest, validation script, and ordered install file entry points for SD card flashing, EV3 server setup, WeisileLink Desktop, evidence templates, and AI Quest samples. The package kept large local installation downloads as relative links to EV3SC-owned assets so the repository would not duplicate oversized binaries.
- **Files created/modified**: `install-wizard/README.md`, `install-wizard/INSTALL_FILES_MANIFEST.md`, `install-wizard/check_install_files.sh`, `install-wizard/安装向导.md`, `install-wizard/files/`
- **Next step**: Audit the full EV3SC folder and reorganize the wizard into a top-level `install/` folder split by macOS, Windows, and shared EV3 materials.

### [2026-06-03] Platform-split install folder audit and validation
- **Status**: ✅ Completed
- **Commit**: `a9590d9`
- **What was done**: Replaced the initial `install-wizard/` package with a top-level `install/` folder split into `mac/`, `windows/`, and `shared/` sections. Audited installation assets across the EV3SC folder, documented large-file handling, added a USB copy helper that expands symlinks, and verified both the source install folder and a copied USB-style folder with repeated three-pass hash, archive, JSON, DMG, executable, and symlink checks.
- **Files created/modified**: `install/README.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `install/ASSET_AUDIT.md`, `install/INSTALL_FILES_MANIFEST.md`, `install/check_install_files.sh`, `install/make_usb_copy.sh`, `install/mac/`, `install/windows/`, `install/shared/`, `install-wizard/`
- **Next step**: Use `install/make_usb_copy.sh` for internal tester handoff, then collect clean-machine macOS and Windows install smoke evidence from signed release artifacts before external classroom distribution.

### [2026-06-03] Windows setup wizard development design
- **Status**: ✅ Completed
- **Commit**: `a2416a9`
- **What was done**: Added a Windows graphical setup wizard development design that defines feasibility boundaries, a PowerShell/WPF recommendation, iOS/Apple-inspired UX principles, step-by-step page flow, automation modules, manual confirmation gates, security rules, test strategy, and staged implementation phases for automating the Windows VSLE Scratch-EV3 install flow.
- **Files created/modified**: `install/windows/WINDOWS_SETUP_WIZARD_DEVELOPMENT.md`, `install/windows/README.md`
- **Next step**: Build the Phase A Windows setup wizard skeleton with a WPF stepper window and no install actions until validation modules and tests are in place.

### [2026-06-03] Windows setup wizard Phase A shell
- **Status**: ✅ Completed
- **Commit**: `9a67956`
- **What was done**: Added the Windows Phase A WPF setup wizard shell with a safe PowerShell entrypoint, XAML stepper layout, complete 11-step setup model, README handoff notes, install-folder manifest/audit wiring, and static regression tests. The shell only renders the guide and explicitly avoids install, copy, archive extraction, SD-card, SSH, and process-launch actions.
- **Files created/modified**: `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `install/windows/lib/SetupWizard.psm1`, `install/windows/README.md`, `install/check_install_files.sh`, `install/INSTALL_FILES_MANIFEST.md`, `install/ASSET_AUDIT.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_a.py`
- **Next step**: Implement Phase B file validation UI by adding a PowerShell install-file checker module and wiring Step 1 to deterministic pass/fail states without requiring Git or Unix tools on Windows.

### [2026-06-03] Windows setup wizard Phase B file validation
- **Status**: ✅ Completed
- **Commit**: `40a6285`
- **What was done**: Added a PowerShell install-file validation module for the Windows setup wizard and wired the `Validate Files` step to deterministic `passed`, `warning`, or `blocked` UI states. The validator checks required files, SHA-256 hashes, JSON parsing, XML/XAML parsing, and expected Windows evidence zip entries without installing, copying, extracting archives, flashing SD cards, running SSH, or starting WeisileLink.
- **Files created/modified**: `install/windows/lib/InstallFileChecks.psm1`, `install/windows/lib/SetupWizard.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/README.md`, `install/check_install_files.sh`, `install/INSTALL_FILES_MANIFEST.md`, `install/ASSET_AUDIT.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_b.py`
- **Next step**: Implement Phase C Desktop install automation for the wizard by expanding the Windows evidence bundle into a staging area, locating `WeisileLink.exe`, preparing the local install root, and proving the install action stays behind explicit user control.

### [2026-06-03] Windows setup wizard Phase C desktop staging
- **Status**: ✅ Completed
- **Commit**: `e6bf01d`
- **What was done**: Added a Windows Desktop install preparation module for the setup wizard. The `Install WeisileLink Desktop` step now expands the Windows internal evidence bundle into a temporary staging folder, verifies `WeisileLink.exe`, install/uninstall helpers, service metadata, manifest, and nested unsigned release zip, then shows a manual confirmation state before any copy or install action can occur.
- **Files created/modified**: `install/windows/lib/WindowsInstallActions.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/README.md`, `install/check_install_files.sh`, `install/INSTALL_FILES_MANIFEST.md`, `install/ASSET_AUDIT.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_c.py`
- **Next step**: Complete the remaining Phase C install execution slice by adding an explicit confirmation control that copies staged files to a temp install root, invokes the Windows helper only after confirmation, and verifies the startup command points to `desktop-supervise`.

### [2026-06-03] Windows setup wizard Phase C confirmed desktop install execution
- **Status**: ✅ Completed
- **Commit**: `7ee9748`
- **What was done**: Added the explicit `Confirm Install` path for the Windows Desktop step. The wizard now keeps staging separate from installation, copies staged WeisileLink Desktop files only after confirmation, runs the Windows helper only from that confirmed path, and verifies copied startup metadata points to `desktop-supervise` with localhost defaults. macOS validation covers tests, evidence bundle extraction, temp-root copy behavior, and static XAML/XML checks; Windows WPF smoke is still required for visual and click-flow accuracy.
- **Files created/modified**: `install/windows/lib/WindowsInstallActions.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `install/windows/README.md`, `install/check_install_files.sh`, `install/INSTALL_FILES_MANIFEST.md`, `install/ASSET_AUDIT.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_c.py`, `tests/test_windows_setup_wizard_phase_c_execution.py`
- **Next step**: Start Phase D EV3 Guided Setup by adding the SSH/transport input model and a guarded EV3 server install runner that keeps destructive or credential-sensitive actions behind manual confirmation.

### [2026-06-03] Windows setup wizard Phase D EV3 input and guarded install planning
- **Status**: ✅ Completed
- **Commit**: `3c12808`
- **What was done**: Added the Phase D EV3 guided setup module and UI wiring. The wizard now exposes WiFi Full VSLE, Bluetooth Full VSLE, and USB-assisted setup inputs, validates SSH host/user and Bluetooth address without storing secrets, prepares an EV3 server SSH/SCP install command plan from in-repo install assets, and keeps command execution behind `Confirm EV3 Install`.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `install/windows/README.md`, `install/check_install_files.sh`, `install/INSTALL_FILES_MANIFEST.md`, `install/ASSET_AUDIT.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`
- **Next step**: Continue Phase D by adding real Windows PowerShell 5.1 + EV3 hardware smoke evidence for the SSH install path and a Bluetooth Full VSLE pairing confirmation/report slice.

### [2026-06-04] Windows setup wizard PowerShell Core runtime smoke
- **Status**: ✅ Completed
- **Commit**: `fc9e266`
- **What was done**: Installed and used PowerShell Core on macOS to run a real module-level smoke for the Windows setup wizard. Fixed PowerShell 7 compatibility in the install-file checker result collection and EV3 setup parameter names, then added an automated `pwsh` runtime test that imports the wizard modules, validates install files, builds an EV3 server install plan, and stages the Windows Desktop package. WPF/Windows PowerShell 5.1 visual smoke remains a Windows-only gate.
- **Files created/modified**: `install/windows/lib/InstallFileChecks.psm1`, `install/windows/lib/Ev3ConnectionChecks.psm1`, `install/windows/setup-wizard.ps1`, `tests/test_windows_setup_wizard_pwsh_runtime.py`
- **Next step**: Run the same wizard on a Windows PowerShell 5.1 machine to validate WPF rendering/click flow, then collect real EV3 SSH install and Bluetooth Full VSLE pairing evidence.

### [2026-06-04] Windows setup wizard WPF smoke harness
- **Status**: ✅ Completed
- **Commit**: `5c51d33`
- **What was done**: Added a Windows-only WPF smoke runner and evidence template for the setup wizard. The runner blocks clearly on macOS/PowerShell Core, and on Windows PowerShell 5.1 it imports wizard modules, loads the XAML through WPF, verifies key controls and manual confirmation gates, and writes JSON evidence without marking production ready.
- **Files created/modified**: `install/windows/run-wpf-smoke.ps1`, `install/windows/03-evidence-templates/windows-setup-wizard-wpf-smoke.template.json`, `install/windows/README.md`, `install/INSTALL_FILES_MANIFEST.md`, `install/ASSET_AUDIT.md`, `install/check_install_files.sh`, `tests/test_windows_setup_wizard_wpf_smoke.py`
- **Next step**: Run `install/windows/run-wpf-smoke.ps1` on a Windows PowerShell 5.1 machine, then collect real EV3 SSH install and Bluetooth Full VSLE pairing evidence.

### [2026-06-04] Windows double-click setup launcher
- **Status**: ✅ Completed
- **Commit**: `4eb3a0f`
- **What was done**: Added a root-level Windows double-click launcher so teachers can open the WPF setup wizard without manually running `.ps1` files or typing PowerShell commands. The launcher uses the system Windows PowerShell 5.1 executable internally, keeps the existing setup wizard behavior, and adds a short Windows start-here note for handoff.
- **Files created/modified**: `install/Start-VSLE-Setup-Wizard.cmd`, `install/START_HERE_WINDOWS.txt`, `install/check_install_files.sh`, `install/INSTALL_FILES_MANIFEST.md`, `install/README.md`, `install/windows/README.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `install/ASSET_AUDIT.md`, `tests/test_windows_setup_launcher.py`
- **Next step**: Generate a fresh USB-ready `VSLE-Install` folder and have the Windows machine double-click `Start-VSLE-Setup-Wizard.cmd`; a true signed `.exe` installer remains the next production packaging milestone.

### [2026-06-04] Windows setup wizard Chinese UI
- **Status**: ✅ Completed
- **Commit**: `32ee294`
- **What was done**: Localized the Windows WPF setup wizard shell, step model, status labels, buttons, EV3 input labels, launcher messages, and start-here note into Chinese for teacher-facing installation. Added `-DisableNameChecking` to the wizard and smoke module imports so Windows PowerShell no longer shows the unapproved-verb warning for `WindowsInstallActions`.
- **Files created/modified**: `install/windows/setup-wizard.xaml`, `install/windows/lib/SetupWizard.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/run-wpf-smoke.ps1`, `install/Start-VSLE-Setup-Wizard.cmd`, `install/START_HERE_WINDOWS.txt`, `tests/test_windows_setup_wizard_chinese_ui.py`, `tests/test_windows_setup_wizard_phase_a.py`, `tests/test_windows_setup_wizard_phase_c_execution.py`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`
- **Next step**: Regenerate the USB-ready `VSLE-Install` folder and verify the Windows machine opens the Chinese wizard by double-clicking `Start-VSLE-Setup-Wizard.cmd` without the PowerShell module warning.

### [2026-06-04] Windows launcher CMD encoding fix
- **Status**: ✅ Completed
- **Commit**: `dda5631`
- **What was done**: Fixed the Windows double-click launcher after CMD misread Chinese UTF-8 text as commands. The launcher is now ASCII-only with Windows CRLF line endings, while the WPF wizard itself remains Chinese; tests now enforce those launcher byte-level constraints.
- **Files created/modified**: `install/Start-VSLE-Setup-Wizard.cmd`, `tests/test_windows_setup_launcher.py`, `tests/test_windows_setup_wizard_chinese_ui.py`
- **Next step**: Regenerate `VSLE-Install` and retry double-clicking `Start-VSLE-Setup-Wizard.cmd` on Windows.

### [2026-06-04] Windows PowerShell 5 Chinese encoding fix
- **Status**: ✅ Completed
- **Commit**: `3699303`
- **What was done**: Added UTF-8 BOM encoding to the Chinese Windows setup wizard PowerShell/XAML files so Windows PowerShell 5.1 reads Chinese strings correctly instead of treating UTF-8 as the local ANSI code page. Added regression tests that enforce BOM-tagged Chinese wizard files and reject smart quotes, while keeping the CMD launcher ASCII-only/CRLF.
- **Files created/modified**: `install/windows/setup-wizard.ps1`, `install/windows/run-wpf-smoke.ps1`, `install/windows/lib/SetupWizard.psm1`, `install/windows/setup-wizard.xaml`, `tests/test_windows_setup_encoding.py`
- **Next step**: Regenerate `VSLE-Install` and retry double-clicking `Start-VSLE-Setup-Wizard.cmd` on Windows; if Windows PowerShell 5.1 still fails, provide an English-only fallback package.

### [2026-06-04] Windows setup wizard button wiring fix
- **Status**: ✅ Completed
- **Commit**: `f751bd7`
- **What was done**: Wired the Windows setup wizard Back, Continue, and Export Diagnostics buttons, and wrapped button actions with visible error reporting so future click failures appear in the wizard instead of looking inert. Added a regression test that requires every visible wizard button to have a click handler and keeps the Chinese PowerShell 5.1 encoding constraints intact.
- **Files created/modified**: `install/windows/setup-wizard.ps1`, `tests/test_windows_setup_wizard_phase_a.py`
- **Next step**: Regenerate `VSLE-Install`, copy the fresh folder to Windows, and verify `Start-VSLE-Setup-Wizard.cmd` opens the Chinese wizard with working Back, Continue, Retry, Export Diagnostics, and confirmation buttons.

### [2026-06-04] Windows setup wizard Phase E clarity
- **Status**: ✅ Completed
- **Commit**: `b5a83b0`
- **What was done**: Added teacher-facing Phase E clarity to the Windows setup wizard: current-step progress, explicit completion condition, current hardware location, automatic check-item details, and SD-card location guidance that distinguishes Windows computer, EV3 brick, and first-boot states. File validation now maps the existing hash/path/JSON/XML/zip checks into seven visible check items and reaches 100% when the validation result passes.
- **Files created/modified**: `install/windows/lib/SetupWizard.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `tests/test_windows_setup_wizard_phase_e_clarity.py`
- **Next step**: Regenerate `VSLE-Install`, copy the fresh folder to Windows, and visually verify the Chinese WPF wizard shows the new progress bar, 100% file-check result, SD-card location copy, and manual confirmation guidance.

### [2026-06-04] Windows setup wizard Phase F manual confirmation progress
- **Status**: ✅ Completed
- **Commit**: `0e0cd14`
- **What was done**: Added teacher confirmation checkboxes for manual Windows setup steps and wired them to the current-step progress bar. Manual steps now show an "人工确认清单"; checking required items updates progress, and Continue stays disabled until all required confirmations are checked, while automatic validation steps still use system-driven progress.
- **Files created/modified**: `install/windows/lib/SetupWizard.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `tests/test_windows_setup_wizard_phase_f_manual_confirmations.py`
- **Next step**: Regenerate `VSLE-Install`, copy the fresh folder to Windows, and verify the WPF checkbox interactions visually: checking and unchecking manual items should change progress and gate Continue.

### [2026-06-04] Windows setup wizard fixed manual confirmation panel
- **Status**: ✅ Completed
- **Commit**: `9efbb0b`
- **What was done**: Promoted the manual confirmation checklist into a fixed, blue-highlighted panel near the top of the Windows WPF wizard step details so it remains visible on real Windows displays. The panel now shows its own checked-count label, wraps long Chinese confirmation text, and hides automatically on steps without manual confirmations.
- **Files created/modified**: `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `tests/test_windows_setup_wizard_phase_f_manual_confirmations.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy the fresh folder to Windows, and verify that the fixed checklist is visible immediately after opening manual steps such as the welcome, SD-card, EV3 boot, Bluetooth, and ScratchAI steps.

### [2026-06-04] Windows setup wizard scrollable details
- **Status**: ✅ Completed
- **Commit**: `7bdda61`
- **What was done**: Wrapped the Windows setup wizard step-detail area in a WPF `ScrollViewer` so teachers can scroll down when Windows display scaling or smaller screen height clips the lower cards. The bottom navigation buttons remain outside the scroll area so Back, Retry, Export, Confirm, and Continue stay visible while details scroll.
- **Files created/modified**: `install/windows/setup-wizard.xaml`, `tests/test_windows_setup_wizard_phase_e_clarity.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy it to Windows, and verify the right-side detail panel can scroll downward to reveal all cards on the target Windows display.

### [2026-06-04] EV3 SD card flashing flow clarity
- **Status**: ✅ Completed
- **Commit**: `1ee4235`
- **What was done**: Clarified the Windows setup wizard's SD-card step as the full ev3dev system flashing workflow rather than a vague preparation step. The teacher-facing flow now explicitly covers inserting the microSD card into Windows, opening Etcher, choosing `Flash from file`, selecting the ev3dev zip, choosing the external SD-card target, clicking `Flash`, waiting for `Flash Complete`, and safely ejecting the card before moving it to the EV3.
- **Files created/modified**: `install/windows/lib/SetupWizard.psm1`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `install/windows/README.md`, `tests/test_windows_setup_wizard_phase_e_clarity.py`, `tests/test_windows_setup_wizard_phase_f_manual_confirmations.py`, `tests/test_windows_setup_wizard_chinese_ui.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy it to Windows, and verify that the SD-card page clearly shows the full Etcher flashing sequence and manual confirmation checklist.

### [2026-06-04] EV3 connection field guidance
- **Status**: ✅ Completed
- **Commit**: `63ad802`
- **What was done**: Added teacher-facing input guidance directly to the Windows setup wizard's EV3 connection panel and related steps. The interface now defaults the EV3 SSH address to `ev3dev.local`, explains where to find an EV3 IP address, states the `robot` user and `maker` password behavior, explains how to find the EV3 Bluetooth address, and gives the Windows Bluetooth pairing path without requiring teachers to search externally.
- **Files created/modified**: `install/windows/setup-wizard.xaml`, `install/windows/lib/SetupWizard.psm1`, `install/windows/README.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy it to Windows, and visually verify the connection-method step shows the default SSH host, field guidance, Bluetooth-address instructions, and Windows pairing path in the scrollable details area.

### [2026-06-04] Windows setup wizard local bridge verification
- **Status**: ✅ Completed
- **Commit**: `62c4518`
- **What was done**: Added a real local bridge verification step to the Windows setup wizard. The step first checks whether `127.0.0.1:20111` and `127.0.0.1:8766` already respond, starts `WeisileLink.exe desktop-supervise` when needed on Windows, polls both ports, records process ID and endpoint evidence, and blocks the wizard if the bridge cannot be verified.
- **Files created/modified**: `install/windows/lib/WindowsInstallActions.psm1`, `install/windows/setup-wizard.ps1`, `install/windows/lib/SetupWizard.psm1`, `install/windows/README.md`, `tests/test_windows_setup_wizard_phase_g_local_bridge.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy the fresh folder to Windows, and validate that the local bridge step starts or detects WeisileLink Desktop and only continues after both localhost ports pass.

### [2026-06-05] EV3 token rotation Python 3.5 compatibility
- **Status**: ✅ Completed
- **Commit**: `5f050f7`
- **What was done**: Fixed a regression that made the EV3 server import Python 3.6-only `secrets` during startup/token rotation on ev3dev Stretch. Token rotation now uses the same Python 3.5-compatible `os.urandom` plus URL-safe base64 pattern used by the EV3 installer, and `/Users/yukii/Desktop/VSLE-Install` was regenerated with the fixed EV3 server.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows and rerun the EV3 Server install step; if it still blocks, export diagnostics and inspect `journalctl -u vsle-ev3-server.service -n 80 --no-pager`.

### [2026-06-05] EV3 Python 3.5 keyword-only signature compatibility
- **Status**: ✅ Completed
- **Commit**: `3d6453c`
- **What was done**: Fixed the EV3 server `SyntaxError` seen on the physical brick's Python 3.5.3 by removing the keyword-only marker from the token-rotation persistence helper signature. Added a regression assertion that keeps EV3 server code free of the bare `*` signature marker, and regenerated `/Users/yukii/Desktop/VSLE-Install` with the corrected file.
- **Files created/modified**: `ev3-firmware/vsle_ev3_server.py`, `tests/test_ev3_server.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, rerun the EV3 Server install step against `169.254.53.80`, and confirm `python3 -m py_compile vsle_ev3_server.py` passes on the EV3 before continuing.

### [2026-06-05] Windows EV3 install script permission compatibility
- **Status**: ✅ Completed
- **Commit**: `9bc3723`
- **What was done**: Fixed the Windows setup wizard EV3 server install step so Windows/OpenSSH runs the copied EV3 install script through `bash ./scripts/install.sh` instead of executing `./scripts/install.sh` directly. This avoids `Permission denied` when Windows or SCP drops the POSIX executable bit, and `/Users/yukii/Desktop/VSLE-Install` was regenerated with the corrected wizard files.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`, `install/windows/README.md`, `install/windows/WINDOWS_SETUP_WIZARD_DEVELOPMENT.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, replace the old folder, and rerun the EV3 Server install step against the reachable EV3 IP such as `169.254.53.80`.

### [2026-06-06] EV3 autostart child installer permission compatibility
- **Status**: ✅ Completed
- **Commit**: `7a0c7ea`
- **What was done**: Fixed the follow-on EV3 install failure where `scripts/install.sh` entered successfully but then directly executed `scripts/install_ev3_autostart.sh`, which could still fail with `Permission denied` after Windows/OpenSSH copying removed executable bits. The EV3 install entrypoint now runs the child installer through `bash`, user-facing EV3 setup commands were updated to use `bash`, and `/Users/yukii/Desktop/VSLE-Install` was regenerated with the corrected firmware package.
- **Files created/modified**: `ev3-firmware/scripts/install.sh`, `tests/test_ev3_autostart_assets.py`, `ev3-firmware/README.md`, `README.md`, `docs/EV3DEV_SETUP.md`, `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`, `docs/superpowers/plans/2026-05-28-website-bluetooth-full-module-commands.md`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, replace the old copy, and rerun the EV3 Server install step; if the service still blocks after this permission chain is fixed, inspect the new wizard evidence and `systemctl status vsle-ev3-server.service`.

### [2026-06-06] Windows wizard live diagnostics export
- **Status**: ✅ Completed
- **Commit**: `6774b83`
- **What was done**: Fixed the Windows setup wizard diagnostics export so it records the live setup-step model instead of the stale WPF list snapshot, and now includes the current on-screen status/evidence text. Button-handler failures are also persisted into the selected step before export, preventing empty `pending` diagnostics when EV3 setup input validation or button handling fails.
- **Files created/modified**: `install/windows/setup-wizard.ps1`, `tests/test_windows_setup_wizard_phase_a.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows and retry the EV3 Server step; if it still appears unresponsive, export diagnostics again so the JSON includes the live screen evidence and exact blocking state.

### [2026-06-06] Windows EV3 install failure evidence fallback
- **Status**: ✅ Completed
- **Commit**: `f7e4c57`
- **What was done**: Fixed a follow-on diagnostics gap where the EV3 Server step could become blocked with empty evidence. EV3 command failures now include the failing step, executable, exit code, and captured command output, while the WPF wizard falls back to explicit non-empty diagnostic text when a result or exception does not provide details.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `install/windows/setup-wizard.ps1`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, use the EV3's numeric USB/IP address if `ev3dev.local` is unreliable, and export diagnostics again if the EV3 Server step blocks.

### [2026-06-06] Windows EV3 remote error evidence expansion
- **Status**: ✅ Completed
- **Commit**: `7bbc9fc`
- **What was done**: Expanded Windows setup wizard EV3 command failure capture so PowerShell `ErrorRecord` objects expose the real SSH or remote stderr message, error type, error ID, category, and position instead of showing only `System.Management.Automation.RemoteException`. The desktop `/Users/yukii/Desktop/VSLE-Install` folder was regenerated after the user deleted the previous copy, and the regenerated copy passed its own install-file verification.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, rerun the EV3 Server step, and inspect the now-expanded evidence text if the EV3 still blocks.

### [2026-06-06] Windows EV3 strict PowerShell stderr capture
- **Status**: ✅ Completed
- **Commit**: `4e61e2f`
- **What was done**: Fixed the Windows setup wizard EV3 command runner for Windows PowerShell 5.1 strict error mode by temporarily capturing native SSH/SCP stderr with `$ErrorActionPreference = "Continue"` inside the command boundary and then restoring the previous preference. ErrorRecord formatting now also considers `ErrorDetails`, `TargetObject`, and the full record text, and `/Users/yukii/Desktop/VSLE-Install` was regenerated and verified from the copied folder.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`, `tests/test_windows_setup_wizard_pwsh_runtime.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, rerun the EV3 Server step, and use the expanded evidence to address the actual SSH or EV3 service error if the step still blocks.

### [2026-06-07] Windows EV3 sudo TTY install fix
- **Status**: ✅ Completed
- **Commit**: `4dbb5e1`
- **What was done**: Fixed the EV3 Server install command after diagnostics showed `sudo: no tty present and no askpass program specified`. The Windows wizard now runs the remote install through `ssh -tt`, validates sudo with `sudo -v` before installing systemd units, and explains that SSH login and sudo install may each ask for the default EV3 password without storing it.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `install/windows/setup-wizard.xaml`, `install/windows/README.md`, `install/VSLE_Scratch-EV3_完整安装向导.md`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`, `tests/test_windows_setup_wizard_pwsh_runtime.py`, `/Users/yukii/Desktop/VSLE-Install`
- **Next step**: Copy the regenerated `/Users/yukii/Desktop/VSLE-Install` folder to Windows, rerun the EV3 Server step, and enter `maker` for both the SSH login prompt and the sudo prompt if both appear.

### [2026-06-07] Windows EV3 external install console
- **Status**: ✅ Completed
- **Commit**: `e795e11`
- **What was done**: Changed the Windows setup wizard EV3 install confirmation so SSH/SCP and sudo run in a separate PowerShell window instead of synchronously blocking the WPF UI thread. The wizard now records the external runner process and result JSON, keeps Continue blocked while the install is still running, and lets Retry load the final result back into the EV3 setup step.
- **Files created/modified**: `install/windows/setup-wizard.ps1`, `tests/test_windows_setup_wizard_phase_a.py`, `tests/test_windows_setup_wizard_phase_c.py`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`
- **Next step**: Regenerate a fresh Windows install handoff from the EV3SC `install/` tree, copy it to the Windows machine, rerun the EV3 Server install step, enter the EV3 password in the separate PowerShell window, then return to the wizard and click Retry.

### [2026-06-07] EV3 firstboot signature compatibility
- **Status**: ✅ Completed
- **Commit**: `ce299f7`
- **What was done**: Fixed the real EV3 `vsle-firstboot.service` failure after EV3 Python reported `SyntaxError: invalid syntax` at the annotated `_device_manifest` signature. The firstboot provisioning script now uses conservative unannotated function signatures without keyword-only markers, and a regression test blocks reintroducing that EV3-incompatible signature style.
- **Files created/modified**: `ev3-firmware/scripts/vsle_firstboot.py`, `tests/test_ev3_autostart_assets.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy it to Windows, rerun the EV3 Server install step against `169.254.34.253`, then confirm `vsle-firstboot.service` and `vsle-ev3-server.service` become active.

### [2026-06-09] Windows EV3 sudo password failure guidance
- **Status**: ✅ Completed
- **Commit**: `e9383dd`
- **What was done**: Diagnosed the EV3 Server install failure as `sudo: 3 incorrect password attempts` after SSH reached `169.254.120.160`. The Windows wizard now recognizes that raw SSH/sudo output and adds a Chinese action hint telling teachers to rerun the install and enter the EV3 `robot` user password at the sudo prompt without storing the password.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, copy it to Windows, rerun the EV3 Server install step against the current EV3 IP, type `yes` at any new host-key prompt, then type the EV3 `robot` password at both SSH and sudo prompts.

### [2026-06-09] Windows EV3 PowerShell 5 parser-safe hint text
- **Status**: ✅ Completed
- **Commit**: `44842db`
- **What was done**: Fixed the Windows PowerShell parser failure reported from `Ev3ConnectionChecks.psm1` after the sudo hint was added. The EV3 connection module now keeps the parser-facing source ASCII-only and builds the Chinese sudo guidance from Unicode code points at runtime, while tests assert the module remains ASCII-safe and the generated hint still renders in Chinese.
- **Files created/modified**: `install/windows/lib/Ev3ConnectionChecks.psm1`, `tests/test_windows_setup_wizard_phase_d_ev3_setup.py`
- **Next step**: Regenerate `/Users/yukii/Desktop/VSLE-Install`, replace the Windows copy, and start the setup wizard again so Windows PowerShell 5.1 can import the EV3 connection module cleanly.

---

*Document ends. Next: CLAUDE.md for development assistant instructions.*
