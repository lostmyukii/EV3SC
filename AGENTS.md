# AGENTS.md — VSLE Scratch-EV3 Platform

> **For Codex and AI assistants working on this project.**
> Read this file completely before touching any code.

---

## What This Project Is

A unified platform that connects LEGO EV3 robots to a Scratch programming environment,
with real-time sensor data streaming to an AI training system.

Three interlocking products:
1. **TurboWarp Scratch editor** — modified to load the VSLE-EV3 extension
2. **VSLE-EV3 Extension** — 62 blocks controlling all EV3 hardware
3. **WeisileLink** — Python bridge replacing Scratch Link (no install required)
4. **ev3dev server** — Python running on the EV3 hardware

Full specification: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` — read it.

---

## Project Boundary & Workflow Rules (Non-Negotiable)

### A. All development is strictly inside `/Users/yukii/Desktop/EV3SC/`

Every file created or modified during this project MUST live under `/Users/yukii/Desktop/EV3SC/`.
Do not write, edit, or delete anything outside this directory.

If a component already exists in `/Users/yukii/Desktop/scratch ai/` (scratchai folder):
- You MAY copy/port it into the EV3SC directory structure.
- You MUST NOT modify, delete, or break anything in the scratchai folder.
- After porting, treat the EV3SC copy as the authoritative source.
- EV3SC MUST NOT depend on the scratchai folder at runtime, test time, build time, or deployment time.

```
CORRECT: cp -r "/Users/yukii/Desktop/scratch ai/foo" /Users/yukii/Desktop/EV3SC/foo
WRONG:   editing files under "/Users/yukii/Desktop/scratch ai/" directly
```

### B. EV3SC must independently implement the complete platform

`/Users/yukii/Desktop/EV3SC/` is the standalone project root. It must contain
everything required to build, run, test, deploy, and document the VSLE
Scratch-EV3 platform.

Required in-repo ownership:

- TurboWarp/Scratch integration code and VSLE-EV3 extension source.
- WeisileLink Python bridge source, protocols, transports, runtime logic, and tests.
- EV3 firmware/server source, setup scripts, systemd units, and tests.
- WeisileAI Trainer integration code created for this project.
- Documentation, source register, progress log, configuration, and test assets.

External paths, including `/Users/yukii/Desktop/scratch ai/`, are source
references only. They may be read or copied from, but they must never be
required for EV3SC to function after the relevant code has been ported.

Before marking a feature complete, verify the EV3SC copy has the runnable
implementation, tests, and documentation needed for that feature. A feature is
not complete if it only points to an external folder, describes future work, or
depends on unported source outside EV3SC.

### C. Every development step must be committed to git

- Initialize `git init` in `/Users/yukii/Desktop/EV3SC/` if not already a repo.
- Commit after each discrete completed task (a file created, a feature working, a test passing).
- Use the project's conventional commit format:

```
feat(ev3): add gyro angle block
fix(bridge): handle BT reconnect correctly
test(sensor): add 50Hz cache freshness test
docs(spec): record Phase 1 completion
```

- Never batch multiple unrelated changes into a single commit.
- Never skip committing a completed step "to do it later".

### D. Every completed step must be pushed to GitHub

- After each completed-step commit, push the current branch to the GitHub remote.
- The GitHub remote must be named `origin` unless the user explicitly configures another remote.
- Do not claim a step is complete until the local commit exists and the GitHub push succeeds.
- If no GitHub remote is configured, authentication fails, or the network blocks the push, record the blocker in the progress log and ask the user for the missing GitHub setup before continuing development.
- Never use "will push later" as a substitute for GitHub synchronization.

### E. Record every completed step in the spec document

After each completed task or milestone, append a progress entry to
`VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` under the section `## Development Progress Log`
(create the section if it doesn't exist yet).

Entry format:

```markdown
### [YYYY-MM-DD] <Short Title>
- **Status**: ✅ Completed
- **Commit**: `<git short hash>`
- **What was done**: <1-3 sentences>
- **Files created/modified**: list them
- **Next step**: <what comes next>
```

Do not move on to the next task until the progress entry is written and committed.

---

## Critical Rules (Non-Negotiable)

### 1. NEVER change the visual design of Scratch

The Scratch interface must look and feel **identical** to standard Scratch 3.0.

```
DO NOT modify:
  - Menu bar layout, icons, colors
  - Block palette visual design
  - Stage dimensions or aspect ratio
  - Sprite/sound/costume panel layouts
  - Green flag or stop button
  - Any existing block colors or shapes
  - File save/load dialogs
  - Font choices anywhere in the UI

YOU MAY add:
  - New extension entry in the extension picker
  - Connection modal (must copy Scratch's modal design exactly)
  - Collapsible sensor panel beside the stage
  - EV3 block category (LEGO red #E6001F)
```

If a UI change is needed and you're not sure if it violates this rule, **ask before implementing**.

### 2. EV3 extension must be Unsandboxed

The extension MUST load as TurboWarp Unsandboxed Extension.
Sandboxed extensions have 1000ms+ latency — completely unusable for motor control.

```javascript
// CORRECT: Unsandboxed extension loaded from URL
vm.extensionManager.loadExtensionURL(
    'http://localhost:3001/vsle-ev3-extension/index.js'
);

// WRONG: Never register as builtin with sandbox
// (this defeats the entire purpose)
```

### 3. All sensor reads come from the cache

Sensor reporter blocks MUST read from `SensorCache`, never make a network call inline.

```javascript
// CORRECT: Read from 50Hz cache (0ms latency)
getDistance() {
    return this.sensorCache.get('sensors.S2.distance_cm') ?? 0;
}

// WRONG: await this.link.sendCommand({ method: 'sensor.read' })
// This introduces 10-100ms latency and will freeze Scratch animations
```

### 4. WeisileLink must be JSON-RPC 2.0 compatible

The official Scratch EV3 extension must work with WeisileLink unchanged.
Never break the Scratch Link protocol contract.

```python
# CORRECT response format
{"jsonrpc": "2.0", "id": 1, "result": {...}}

# WRONG - breaking compatibility
{"status": "ok", "data": {...}}  # Not JSON-RPC 2.0
```

### 5. Python stdlib for Bluetooth, no pybluez

```python
# CORRECT: Python stdlib socket
import socket
sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)

# WRONG: pybluez is abandoned, breaks on macOS/Python 3.10+
import bluetooth  # DO NOT USE
```

### 6. EV3 and Scratch development must be based on open-source code

When implementing EV3, Scratch, TurboWarp, Scratch Link compatibility, ev3dev, or ev3dev2 behavior:

- Use existing open-source code, official source repositories, official documentation, or code already ported into `/Users/yukii/Desktop/EV3SC/`.
- Cite the source in code comments, docs, commit messages, or progress log when a behavior is copied, adapted, or protocol-compatible.
- Prefer porting from the authorized local copy under `/Users/yukii/Desktop/scratch ai/` into `/Users/yukii/Desktop/EV3SC/` over inventing replacement behavior.
- Verify APIs against upstream source or docs before writing implementation details.
- Do not fabricate Scratch, TurboWarp, Scratch Link, EV3 bytecode, ev3dev, or ev3dev2 APIs from memory.
- If no open-source reference exists for a required behavior, document the gap, ask the user, and mark the work as experimental until verified.

### 7. Complete scoped implementation only — no patch-later development

Every completed development step MUST be complete for its stated scope.
Do not deliver a narrow "minimal implementation", placeholder, skeleton-only version, happy-path-only version, or temporary workaround with the intention of patching it later.

For each committed step:
- Implement the full behavior required by the current spec section, plan task, or acceptance gate.
- Include validation, error handling, source-backed API behavior, tests, and documentation/progress updates required for that scope.
- If the requested scope is too large to finish safely in one step, split it into smaller vertical slices, but each slice must still be complete and usable on its own.
- Do not mark a step complete while known required behavior for that step remains missing.
- Do not use "we will add this later" to defer requirements that belong to the current step.

---

## Project Structure

```
/Users/yukii/Desktop/scratch ai/
├── AGENTS.md                              ← You are here
├── VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md ← Full spec
├── scratch-ai-platform/
│   └── scratch-editor/
│       └── packages/
│           ├── scratch-vm/
│           │   └── src/extensions/
│           │       └── scratch3_ev3/
│           │           └── index.js       ← BASE CODE to extend
│           └── scratch-gui/               ← UI: preserve visual design
├── scratch-link/                          ← Reference: official protocol
└── [new directories to create]:
    ├── vsle-ev3-extension/                ← New: full EV3 extension
    ├── weisile-link/                      ← New: Python bridge
    └── ev3-firmware/                      ← New: code for EV3 brick
```

### Key Files to Know

| File | Purpose | Edit? |
|------|---------|-------|
| `scratch-editor/.../scratch3_ev3/index.js` | Official EV3 extension (11 blocks) | Reference only; replace with vsle extension |
| `scratch-link/` | Scratch Link source (Scratch protocol reference) | Read only; implement compatible server |
| `scratch-ai-platform/ai-middleware/` | Existing AI backend | Integrate, don't rewrite |

---

## How Scratch-EV3 Communication Works

```
[Scratch Block executes]
        ↓
[Extension reads from sensor_cache (0ms)]
        ↓ (for commands only)
[Extension sends JSON-RPC to WeisileLink]
        ↓ ws://localhost:20111/scratch/bt
[WeisileLink translates to EV3 command]
        ↓ WiFi WebSocket to EV3 IP
[EV3 runs vsle_ev3_server.py]
        ↓ ev3dev2 executes hardware action
[EV3 sensor loop pushes data @50Hz]
        ↑ back up the chain simultaneously
[WeisileLink broadcasts to Scratch + Trainer]
```

The key insight: **sensor reading and motor command are separate paths**.
- Sensor reads: EV3 pushes → cache → blocks read instantly
- Motor commands: blocks send → EV3 executes → ack received

---

## EV3 Hardware Reference

### Sensor Port Auto-Detection

The EV3 server tries each sensor class on each port:

```python
sensor_classes = [ColorSensor, UltrasonicSensor, GyroSensor, TouchSensor, InfraredSensor]
for port in ['in1', 'in2', 'in3', 'in4']:
    for cls in sensor_classes:
        try:
            sensor = cls(port)
            self.sensors[port] = sensor
            break
        except Exception:
            continue
```

### Sensor Data Keys (from sensor_cache)

```python
# Access pattern: sensor_cache.get('path.to.value')
'sensors.S1.color'         # int 0-7 (LEGO color ID)
'sensors.S1.reflected'     # int 0-100
'sensors.S1.ambient'       # int 0-100
'sensors.S1.rgb'           # list [r, g, b] each 0-255
'sensors.S2.distance_cm'   # float
'sensors.S2.distance_inch' # float
'sensors.S3.angle'         # int degrees
'sensors.S3.rate'          # int degrees/sec
'sensors.S4.pressed'       # bool
'motors.A.position'        # int degrees
'motors.A.speed'           # int -100..100
'motors.A.running'         # bool
'system.battery_pct'       # int 0-100
'system.buttons.up'        # bool
```

### Motor Port Names

| Code | EV3 Port | Typical Use |
|------|----------|-------------|
| 'A' | Output A | Right wheel / main motor |
| 'B' | Output B | Left wheel |
| 'C' | Output C | Attachment / grabber |
| 'D' | Output D | Auxiliary |

---

## Block Implementation Pattern

Every block follows this pattern:

```javascript
// COMMAND block — sends instruction to EV3, returns when ack received
async motorRunTimed({ PORT, SPEED, TIME }) {
    // 1. Validate inputs
    const speed = Math.max(-100, Math.min(100, Cast.toNumber(SPEED)));
    const time  = Math.max(0, Cast.toNumber(TIME));
    const port  = Cast.toString(PORT).toUpperCase();

    // 2. Send command (fire and forget for non-blocking, await for blocking)
    await this.link.sendCommand({
        method: 'motor.runTimed',
        params: { port, speed, time }
    });
    // Note: Scratch block returns immediately — EV3 runs asynchronously
    // Use 'waitMotorStopped' block if synchronous behavior needed
}

// REPORTER block — reads from cache, NO await
getDistance({ PORT }) {
    const port = Cast.toString(PORT).toUpperCase();
    const sensorSlot = this.portMap[port];  // e.g. 'S2'
    return this.sensorCache.get(`sensors.${sensorSlot}.distance_cm`) ?? 0;
}

// BOOLEAN block — reads from cache, NO await
getTouchPressed({ PORT }) {
    const sensorSlot = this.portMap[Cast.toString(PORT).toUpperCase()];
    return this.sensorCache.get(`sensors.${sensorSlot}.pressed`) ?? false;
}
```

**Never** put `await` in a reporter or Boolean block. It will freeze Scratch.

---

## WeisileLink Command Reference

Commands sent from Extension to WeisileLink (and forwarded to EV3):

```javascript
// Motor commands
{ method: 'motor.runForever',   params: { port, speed } }
{ method: 'motor.runTimed',     params: { port, speed, time } }
{ method: 'motor.runToAbsPos',  params: { port, degrees, speed } }
{ method: 'motor.runToRelPos',  params: { port, degrees, speed } }
{ method: 'motor.stop',         params: { port } }
{ method: 'motor.stopAll',      params: {} }
{ method: 'motor.syncRun',      params: { port_l, port_r, speed, time } }
{ method: 'motor.syncTurn',     params: { port_l, port_r, speed, turn } }
{ method: 'motor.resetPosition',params: { port } }

// Sound commands
{ method: 'sound.playTone',     params: { freq, duration, volume } }
{ method: 'sound.playToneWait', params: { freq, duration, volume } }
{ method: 'sound.beep',         params: {} }
{ method: 'sound.stop',         params: {} }
{ method: 'sound.setVolume',    params: { volume } }

// Display commands
{ method: 'display.text',       params: { text, line } }
{ method: 'display.clear',      params: {} }
{ method: 'display.drawLine',   params: { x1, y1, x2, y2 } }
{ method: 'display.drawCircle', params: { x, y, r } }

// Sensor commands
{ method: 'gyro.reset',         params: { port } }

// Data collection
{ method: 'data.startCollect',  params: { label } }
{ method: 'data.stopCollect',   params: {} }
{ method: 'data.addPoint',      params: { label } }
{ method: 'data.getAll',        params: {} }
{ method: 'data.clear',         params: {} }
```

---

## EV3 Setup Instructions

For testing: EV3 must run ev3dev with WiFi USB dongle.

```bash
# 1. Flash ev3dev to SD card: https://www.ev3dev.org/docs/getting-started/
# 2. Insert SD card + WiFi dongle into EV3
# 3. Power on EV3 — it boots ev3dev automatically
# 4. Connect to EV3 WiFi or find its IP
ssh robot@ev3dev.local   # default password: maker

# 5. Upload server file
scp ev3-firmware/vsle_ev3_server.py robot@ev3dev.local:~/

# 6. Install dependencies (on EV3)
pip3 install websockets ev3dev2

# 7. Run server
python3 vsle_ev3_server.py
# EV3 is now listening on port 8765

# 8. Find EV3 IP address
hostname -I
```

---

## Development Commands

```bash
# Start WeisileLink bridge service
cd weisile-link
python weisile_link.py --transport wifi --ev3-ip 192.168.1.100

# Start WeisileLink with Bluetooth
python weisile_link.py --transport bluetooth --ev3-bt 00:16:53:XX:XX:XX

# Start Scratch editor (development mode)
cd scratch-ai-platform/scratch-editor
npm run dev

# Load VSLE-EV3 extension in TurboWarp
# (in browser console after Scratch loads)
vm.extensionManager.loadExtensionURL('http://localhost:3001/vsle-ev3-extension/index.js')

# Run Python tests
cd weisile-link && python -m pytest tests/ -v

# Build for production
cd scratch-ai-platform/scratch-editor && npm run build
```

---

## Coding Standards

### JavaScript (Extension)

- ES2020+, no TypeScript (matches TurboWarp codebase)
- Async/await for commands, sync for sensor reads
- JSDoc for all public methods
- Follow existing scratch3_ev3/index.js style
- Lint: `npm run lint` must pass before any PR

### Python (WeisileLink + EV3 server)

- Python 3.9+ (compatible with ev3dev2 on EV3)
- async/await throughout (asyncio)
- Type hints on all function signatures
- Black formatter: `black .` must pass
- 80-char line limit
- No external dependencies except: `websockets`, `ev3dev2` (EV3 only)

### Git Conventions

```
feat(ev3): add gyro angle block
fix(bridge): handle BT reconnect correctly
test(sensor): add 50Hz cache freshness test
docs(blocks): update motor block reference
```

---

## Common Mistakes to Avoid

| Mistake | Why Wrong | Correct Approach |
|---------|-----------|-----------------|
| Putting `await` in reporter block | Freezes Scratch | Read from sensor cache synchronously |
| Importing pybluez | Abandoned, breaks on macOS | Use `socket.AF_BLUETOOTH` stdlib |
| Modifying scratch-gui CSS | Breaks Scratch visual identity | Add new CSS classes, don't modify existing |
| Using sandboxed extension | 1s+ latency breaks motor control | Must use Unsandboxed extension |
| Breaking JSON-RPC 2.0 format | Official scratch3_ev3 stops working | Test with both extensions |
| Running ML on EV3 | ARM9 300MHz no FPU — too slow | All ML in WeisileAI Trainer, not EV3 |
| Blocking the asyncio loop on WeisileLink | Drops sensor updates | Use `run_in_executor` for blocking I/O |

---

## Testing Checklist Before Any PR

- [ ] `npm run lint` passes in scratch-editor
- [ ] `black . && python -m pytest` passes in weisile-link
- [ ] Scratch visual design unchanged (screenshot diff against baseline)
- [ ] All 62 blocks listed in spec are present in getInfo()
- [ ] Sensor reporter blocks return correct type (number/bool/string)
- [ ] Motor commands complete without Scratch freezing
- [ ] WeisileLink handles EV3 disconnection gracefully (no crash)
- [ ] Data collection buffer works: record 50 points, upload all 50

---

## When You're Unsure

1. **Scratch visual design**: Default to "don't change it". Ask the user.
2. **New block needed**: Add it. More blocks = better. Follow the pattern.
3. **Protocol change**: Check the JSON-RPC 2.0 spec. Test with both extensions.
4. **EV3 hardware behavior**: Check ev3dev2 docs at https://ev3dev-lang.readthedocs.io/
5. **Performance concern**: Measure first. 50Hz is the target. Don't optimize prematurely.

---

*This project is for WeisileEDU's K-12 robotics + AI curriculum.*
*The students are 7–15 years old. The code must work reliably in classrooms.*
*When in doubt: simpler, more reliable, less clever.*
