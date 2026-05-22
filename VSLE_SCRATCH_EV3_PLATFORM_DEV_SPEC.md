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
| Only 11 EV3 blocks (sensor coverage <40%) | Severely restricts curriculum | 62 blocks covering all EV3 capabilities |
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
│  62 blocks · Full sensor coverage · 50Hz realtime cache           │
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
| BT transport | Python `socket` stdlib (RFCOMM) where OS supports `AF_BLUETOOTH` | No pybluez dependency; Linux/ev3dev supported, macOS/Windows use WiFi first |
| WiFi transport | asyncio WebSocket (WiFi dongle) | Enables multi-EV3, 50Hz streaming, eliminates Bluetooth |
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
│  │  │ 62 EV3 blocks              │◄─┼──┼─►                      │   │
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
| 🔴 电机控制 | #E6001F | 14 blocks | All motor movement, position, sync |
| 🟠 传感器读取 | #FF6680 | 20 blocks | All sensors, all modes, all ports |
| 🟡 声音输出 | #FFAB19 | 6 blocks | Tone, play file, volume |
| 🟢 显示屏 | #4CBF56 | 8 blocks | LCD text, image, clear |
| 🔵 系统控制 | #4C97FF | 6 blocks | LED, buttons, battery, stop |
| 🟣 数据采集 | #855CD6 | 8 blocks | AI Quest collection pipeline |

**Total: 62 blocks** (vs 11 in original scratch3_ev3)

### 4.3 Complete Block Specification

#### Category 1: 电机控制 (Motor Control)

```javascript
// 14 blocks — covers FULL ev3dev tacho-motor capability

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
{ opcode: 'getMotorPosition',
  text: '电机 [PORT] 当前位置 (度)',                  // NEW
  blockType: 'reporter'
},
{ opcode: 'getMotorSpeed',
  text: '电机 [PORT] 当前速度 (%)',                   // NEW
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
| Motor PID params | LargeMotor | `kp`, `ki`, `kd` | 🔜 Phase 2 | |
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

**Total: 62 blocks covering 100% of EV3 educational hardware capabilities.**

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
- [ ] Bluetooth transport functional as fallback
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

The 62 Scratch blocks require dedicated JavaScript tests before Phase 2 exit:

```
test_getInfo_contains_all_62_blocks:
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
```

Merges are blocked when any required check fails.

---

## 14. Deployment

### 14.1 WeisileLink Service (Teacher Computer)

```bash
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

- If WiFi fails, try Bluetooth only when the host OS supports stdlib RFCOMM.
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
| Teacher computer Bluetooth transport | Linux only for stdlib RFCOMM | macOS/Windows require future adapter or WiFi |
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
| Official EV3 extension has only 11 blocks, <40% sensor coverage | → 62 blocks, 100% coverage |
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

---

*Document ends. Next: CLAUDE.md for development assistant instructions.*
