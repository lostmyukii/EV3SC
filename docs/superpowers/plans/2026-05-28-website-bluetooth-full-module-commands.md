# Website Bluetooth Full Module Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ScratchAI website Bluetooth flow select a full VSLE Bluetooth transport that preserves the complete VSLE-EV3 command surface, while keeping official firmware Bluetooth compatibility explicitly limited.

**Architecture:** Keep Scratch blocks transport-agnostic: reporters and booleans read `SensorCache`, commands go to the local WeisileLink JSON-RPC endpoint, and WeisileLink selects `wifi`, `vsle-bluetooth`, or `official-bluetooth`. Reuse the existing EV3SC JSON-line Bluetooth transport and EV3 server RFCOMM listener for full VSLE mode, generalize the native byte-stream adapter boundary for macOS/Windows, and generate a command coverage matrix from the extension, validators, JSON-RPC host handlers, and EV3 server dispatch.

**Tech Stack:** JavaScript ES2020 VSLE-EV3 extension tests with `node:test`, Python 3.9+ WeisileLink with `pytest`, EV3 Python 3.5-compatible server tests, macOS/Windows native adapter process boundary, ScratchAI browser rehearsal scripts, Markdown evidence docs.

---

## Scope

This plan implements the design in `docs/superpowers/specs/2026-05-28-website-bluetooth-full-module-commands-design.md` and the constraints in `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` and `AGENTS.md`.

In scope:

- A generated coverage matrix proving every current EV3 website block is cache-backed, host-side, or EV3-dispatched for full VSLE Bluetooth.
- `vsle-bluetooth` as the explicit full-module Bluetooth transport name, while preserving `bluetooth` as a backward-compatible alias for current callers.
- A shared native byte-stream adapter protocol usable by full VSLE Bluetooth and official firmware Direct Command Bluetooth.
- Full VSLE Bluetooth fake-adapter tests for JSON-line connect, auth, command ack, sensor routing, timeout, disconnect, and safe stop behavior.
- EV3 setup updates for enabling the existing RFCOMM JSON-line listener.
- Scratch connection modal copy and parameters for WiFi Full VSLE, Bluetooth Full VSLE, and Official Firmware Bluetooth Compatibility without changing Scratch visual design.
- Browser rehearsal and real-hardware evidence gates that block classroom-ready claims until evidence exists.
- Progress-log updates, commits, and GitHub pushes after each completed task.

Out of scope:

- Direct browser Web Bluetooth.
- Replacing the ev3dev full VSLE path with official LEGO firmware Direct Commands.
- Claiming macOS/Windows Bluetooth classroom readiness without signed/notarized release artifacts and clean-machine evidence.
- Changing Scratch menu, palette, block, stage, sprite, sound, costume, font, or save/load visual design.

## File Structure

Create or modify these files:

- Create `scripts/generate_vsle_bluetooth_coverage.py`: parses the EV3 extension, command validators, JSON-RPC host handlers, and EV3 server dispatch to produce the full-module Bluetooth coverage table.
- Create `tests/test_vsle_bluetooth_coverage.py`: verifies the generated matrix has no unknown current EV3 blocks and keeps official firmware compatibility separate.
- Create `docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md`: checked-in generated command coverage report.
- Modify `weisile-link/weisile_link/runtime/degradation.py`: add transport display metadata so status can distinguish `vsle-bluetooth` from `official-bluetooth`.
- Modify `weisile-link/weisile_link/transport/selector.py`: accept `vsle-bluetooth`, preserve `bluetooth` as an alias, and return capability metadata.
- Modify `weisile-link/tests/test_transport_selector.py`: transport alias, status, and unsupported-mode tests.
- Create `weisile-link/weisile_link/transport/native_byte_stream.py`: shared adapter protocol and helper dataclass for byte-stream status.
- Modify `weisile-link/weisile_link/transport/native_adapter_process.py`: expose connect channel/profile parameters and status without official-firmware naming.
- Modify `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`: depend on the shared byte-stream protocol.
- Modify `weisile-link/tests/test_native_adapter_process.py`: shared adapter process coverage.
- Modify `weisile-link/weisile_link/transport/bluetooth_transport.py`: support an injected native byte-stream adapter and expose `VSLEBluetoothTransport` as the product-facing class while keeping `BluetoothTransport` import-compatible.
- Modify `weisile-link/tests/test_bluetooth_transport.py`: fake native adapter tests for JSON-line full VSLE Bluetooth.
- Modify `weisile-link/weisile_link/cli.py`: read `WEISILE_VSLE_BT_ADAPTER`, accept `WEISILE_TRANSPORT=vsle-bluetooth`, and keep `official-bluetooth` separate.
- Modify `weisile-link/weisile_link/json_rpc_server.py`: server factory recognizes `vsle-bluetooth`; `/api/status` includes active transport, capability, native adapter, and unsupported capability fields.
- Modify `weisile-link/tests/test_json_rpc_server.py`: `vsle.setTransport` and `/api/status` coverage.
- Modify `ev3-firmware/systemd/vsle-ev3-server.service`: document and wire `EV3_ENABLE_BLUETOOTH=0` as the safe default.
- Modify `ev3-firmware/scripts/install.sh`: allow explicit Bluetooth enablement in the generated EV3 env file.
- Modify `docs/EV3DEV_SETUP.md` and `ev3-firmware/README.md`: full VSLE Bluetooth setup steps and safety notes.
- Modify `tests/test_ev3_autostart_assets.py` and `tests/test_ev3_server.py`: EV3 setup and RFCOMM parity coverage.
- Modify `vsle-ev3-extension/index.js`: three connection choices and `vsle-bluetooth` / `official-bluetooth` params while preserving Scratch modal style.
- Modify `vsle-ev3-extension/tests/test_connection_modal.js` and `vsle-ev3-extension/tests/test_extension.js`: modal and command parameter tests.
- Modify `vsle-ev3-extension/README.md`: connection mode documentation.
- Create `scripts/run_vsle_bluetooth_smoke.py`: evidence runner for real ev3dev EV3 full Bluetooth smoke.
- Create `tests/test_vsle_bluetooth_smoke.py`: smoke evidence validation tests.
- Create `docs/classroom/vsle_bluetooth_full_module_smoke.template.json`: evidence template.
- Modify `docs/classroom/REAL_EV3_REHEARSAL.md`: full Bluetooth rehearsal path.
- Modify `docs/SOURCE_REGISTER.md`: source basis for full VSLE Bluetooth, native byte stream, Scratch modal changes, and smoke evidence.
- Modify `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`: progress entries after each task.

## Task 1: Generate Full VSLE Bluetooth Command Coverage Matrix

**Files:**
- Create: `scripts/generate_vsle_bluetooth_coverage.py`
- Create: `tests/test_vsle_bluetooth_coverage.py`
- Create: `docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md`
- Modify: `docs/SOURCE_REGISTER.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write the failing coverage tests**

Create `tests/test_vsle_bluetooth_coverage.py`:

```python
from pathlib import Path

from scripts.generate_vsle_bluetooth_coverage import (
    CoverageRow,
    generate_coverage_rows,
    render_markdown,
)


ROOT = Path(__file__).resolve().parents[1]


def test_full_vsle_bluetooth_matrix_has_no_unknown_current_blocks():
    rows = generate_coverage_rows(ROOT)
    assert rows
    unknown = [
        row for row in rows
        if row.full_vsle_bluetooth_status == "unknown"
    ]
    assert unknown == []
    opcodes = {row.opcode for row in rows}
    assert "motorRunTimed" in opcodes
    assert "getGyroAngle" in opcodes
    assert "playTone" in opcodes
    assert "displayText" in opcodes
    assert "startDataCollection" in opcodes
    assert "predictWithAIQuestModel" in opcodes


def test_cache_backed_blocks_are_not_marked_ev3_dispatched():
    rows = generate_coverage_rows(ROOT)
    by_opcode = {row.opcode: row for row in rows}
    assert by_opcode["getUltrasonicDistance"].full_vsle_bluetooth_status == (
        "cache-backed"
    )
    assert by_opcode["getTouchPressed"].full_vsle_bluetooth_status == (
        "cache-backed"
    )
    assert by_opcode["getBatteryLevel"].full_vsle_bluetooth_status == (
        "cache-backed"
    )


def test_official_firmware_compatibility_stays_separate():
    rows = generate_coverage_rows(ROOT)
    by_opcode = {row.opcode: row for row in rows}
    assert by_opcode["motorStop"].official_firmware_status in {
        "native",
        "compatibility-unavailable",
    }
    assert by_opcode["motorSetPID"].official_firmware_status == (
        "compatibility-unavailable"
    )
    assert by_opcode["uploadToTrainer"].official_firmware_status == (
        "host-side"
    )


def test_markdown_report_is_deterministic_and_mentions_source_files():
    rows = [
        CoverageRow(
            module="Motor",
            opcode="motorStop",
            block_type="command",
            method="motor.stop",
            full_vsle_bluetooth_status="ev3-dispatched",
            official_firmware_status="native",
            source="vsle-ev3-extension/index.js",
        )
    ]
    markdown = render_markdown(rows)
    assert "# VSLE Bluetooth Full Module Command Coverage" in markdown
    assert "`vsle-ev3-extension/index.js`" in markdown
    assert "| Motor | `motorStop` | command | `motor.stop` | ev3-dispatched | native |" in markdown
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest tests/test_vsle_bluetooth_coverage.py -v
```

Expected: fail during import with `No module named 'scripts.generate_vsle_bluetooth_coverage'`.

- [ ] **Step 3: Implement the generator**

Create `scripts/generate_vsle_bluetooth_coverage.py`:

```python
#!/usr/bin/env python3
"""Generate VSLE Bluetooth command coverage from EV3SC-owned sources."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable, List


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = Path("vsle-ev3-extension/index.js")
VALIDATION = Path("weisile-link/weisile_link/protocol/validation.py")
JSON_RPC = Path("weisile-link/weisile_link/json_rpc_server.py")
EV3_SERVER = Path("ev3-firmware/vsle_ev3_server.py")

CACHE_BACKED_PREFIXES = (
    "get",
    "is",
)
HOST_SIDE_METHODS = {
    "data.uploadToTrainer",
    "aiquest.uploadDataset",
    "aiquest.startTraining",
    "aiquest.getTrainingStatus",
    "aiquest.predictCurrent",
    "aiquest.exportModel",
    "aiquest.clearModel",
}
OFFICIAL_NATIVE_METHODS = {
    "motor.stop",
    "motor.stopAll",
    "system.stopAll",
}


@dataclass(frozen=True)
class CoverageRow:
    module: str
    opcode: str
    block_type: str
    method: str
    full_vsle_bluetooth_status: str
    official_firmware_status: str
    source: str


def generate_coverage_rows(root: Path = ROOT) -> List[CoverageRow]:
    extension_text = _read(root, EXTENSION)
    validators_text = _read(root, VALIDATION)
    json_rpc_text = _read(root, JSON_RPC)
    ev3_server_text = _read(root, EV3_SERVER)
    validators = set(re.findall(r'"([a-zA-Z0-9_.]+)"\s*:', validators_text))
    host_handlers = set(re.findall(r'"(aiquest\.[a-zA-Z0-9_]+)"', json_rpc_text))
    host_handlers.add("data.uploadToTrainer")
    ev3_methods = set(re.findall(r'method == "([a-zA-Z0-9_.]+)"', ev3_server_text))

    rows: List[CoverageRow] = []
    for block in _iter_blocks(extension_text):
        method = _method_for_opcode(block["opcode"], extension_text)
        full_status = _full_status(block, method, validators, host_handlers, ev3_methods)
        official_status = _official_status(method, full_status)
        rows.append(
            CoverageRow(
                module=_module_for_opcode(block["opcode"]),
                opcode=block["opcode"],
                block_type=block["block_type"],
                method=method,
                full_vsle_bluetooth_status=full_status,
                official_firmware_status=official_status,
                source=str(EXTENSION),
            )
        )
    return sorted(rows, key=lambda row: (row.module, row.opcode))


def render_markdown(rows: Iterable[CoverageRow]) -> str:
    lines = [
        "# VSLE Bluetooth Full Module Command Coverage",
        "",
        "Generated from `vsle-ev3-extension/index.js`, `weisile-link/weisile_link/protocol/validation.py`, `weisile-link/weisile_link/json_rpc_server.py`, and `ev3-firmware/vsle_ev3_server.py`.",
        "",
        "| Module | Opcode | Block type | Method | Full VSLE Bluetooth | Official firmware compatibility |",
        "|---|---|---|---|---|---|",
    ]
    for row in rows:
        lines.append(
            f"| {row.module} | `{row.opcode}` | {row.block_type} | `{row.method}` | {row.full_vsle_bluetooth_status} | {row.official_firmware_status} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_report(root: Path = ROOT) -> Path:
    report = root / "docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md"
    report.write_text(render_markdown(generate_coverage_rows(root)), encoding="utf-8")
    return report


def _read(root: Path, relative: Path) -> str:
    return (root / relative).read_text(encoding="utf-8")


def _iter_blocks(extension_text: str):
    for match in re.finditer(
        r"opcode:\s*'([^']+)'.{0,800}?blockType:\s*Scratch\.BlockType\.([A-Z_]+)",
        extension_text,
        re.DOTALL,
    ):
        yield {
            "opcode": match.group(1),
            "block_type": match.group(2).lower().replace("_", "-"),
        }


def _method_for_opcode(opcode: str, extension_text: str) -> str:
    body_match = re.search(
        rf"(async\s+)?{re.escape(opcode)}\s*\([^)]*\)\s*\{{(?P<body>.*?)\n        \}}",
        extension_text,
        re.DOTALL,
    )
    if body_match:
        method_match = re.search(r"method:\s*'([^']+)'", body_match.group("body"))
        if method_match:
            return method_match.group(1)
    if opcode.startswith(("get", "is")):
        return "SensorCache"
    return "host-side"


def _full_status(block, method, validators, host_handlers, ev3_methods) -> str:
    if method == "SensorCache":
        return "cache-backed"
    if method in HOST_SIDE_METHODS or method in host_handlers:
        return "host-side"
    if method in validators and method in ev3_methods:
        return "ev3-dispatched"
    return "unknown"


def _official_status(method: str, full_status: str) -> str:
    if full_status == "host-side":
        return "host-side"
    if method in OFFICIAL_NATIVE_METHODS:
        return "native"
    if full_status == "cache-backed":
        return "compatibility-cache"
    return "compatibility-unavailable"


def _module_for_opcode(opcode: str) -> str:
    if opcode.startswith(("motor", "getMotor", "isMotor", "waitMotor")):
        return "Motor"
    if opcode.startswith(("getColor", "isColor", "getUltrasonic", "isUltrasonic", "getGyro", "resetGyro", "getTouch", "waitTouch", "getIR", "isBrickButton", "getBattery")):
        return "Sensor"
    if opcode in {"playTone", "playToneAndWait", "playSoundFile", "setVolume", "beep", "stopSound"}:
        return "Sound"
    if opcode.startswith(("display", "draw")):
        return "Display"
    if opcode.startswith(("setStatus", "statusLight", "waitMilliseconds", "stopAll", "isConnected")):
        return "System"
    if opcode.startswith(("startData", "stopData", "addData", "upload", "clearCollected", "getData", "exportData", "startAuto")):
        return "Data collection"
    if "AIQuest" in opcode or opcode.startswith(("uploadAIQuest", "trainAIQuest", "predictWithAIQuest")):
        return "AI Quest"
    return "Other"


if __name__ == "__main__":
    print(write_report(ROOT))
```

- [ ] **Step 4: Generate the report**

Run:

```bash
.venv/bin/python scripts/generate_vsle_bluetooth_coverage.py
```

Expected: prints `docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md`.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
.venv/bin/python -m pytest tests/test_vsle_bluetooth_coverage.py -v
```

Expected: all coverage tests pass.

- [ ] **Step 6: Update source register and progress log**

Add a `docs/SOURCE_REGISTER.md` row citing the generated coverage script/report and the design file. Commit and push:

```bash
git add scripts/generate_vsle_bluetooth_coverage.py tests/test_vsle_bluetooth_coverage.py docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md docs/SOURCE_REGISTER.md
git commit -m "test(bluetooth): add full module coverage matrix"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append a `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` progress entry using the printed hash, then commit and push:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record bluetooth coverage matrix"
git push origin codex/native-adapter-process
```

## Task 2: Add `vsle-bluetooth` Transport Alias and Status Metadata

**Files:**
- Modify: `weisile-link/weisile_link/runtime/degradation.py`
- Modify: `weisile-link/weisile_link/transport/selector.py`
- Modify: `weisile-link/weisile_link/sessions.py`
- Modify: `weisile-link/tests/test_transport_selector.py`
- Modify: `weisile-link/tests/test_observability.py`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing transport selector tests**

Append to `weisile-link/tests/test_transport_selector.py`:

```python
def test_auto_transport_accepts_vsle_bluetooth_alias_and_reports_full_capability():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=True)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        result = await transport.set_transport(
            "vsle-bluetooth", lambda _payload: None
        )

        assert result == {
            "transport": "vsle-bluetooth",
            "transport_capability": "full",
        }
        assert transport.active_transport_name == "vsle-bluetooth"
        assert manager.connection_state.transport_label == "vsle-bluetooth"
        assert manager.connection_state.transport_capability == "full"

    asyncio.run(scenario())


def test_auto_transport_preserves_plain_bluetooth_as_full_vsle_alias():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=True)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        result = await transport.set_transport(
            "bluetooth", lambda _payload: None
        )

        assert result["transport"] == "vsle-bluetooth"
        assert result["transport_alias"] == "bluetooth"

    asyncio.run(scenario())
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_transport_selector.py -v
```

Expected: fail because `vsle-bluetooth` is unsupported and `transport_label` is missing.

- [ ] **Step 3: Add transport metadata**

Modify `weisile-link/weisile_link/runtime/degradation.py`:

```python
@dataclass
class ConnectionState:
    connected: bool = False
    active_transport: Optional[TransportKind] = None
    transport_label: Optional[str] = None
    transport_capability: Optional[str] = None
    native_adapter_path: Optional[str] = None
    native_adapter_status: Optional[str] = None
    last_unsupported_capability: Optional[str] = None
    wifi_failed: bool = False
    bluetooth_failed: bool = False
    reconnect_count: int = 0
    last_failure_reason: Optional[str] = None
    sensor_cache_refresh_required: bool = False
```

Update `record_reconnected` to accept labels:

```python
def record_reconnected(
    self,
    transport: TransportKind,
    *,
    label: Optional[str] = None,
    capability: Optional[str] = None,
    native_adapter_path: Optional[str] = None,
    native_adapter_status: Optional[str] = None,
) -> Tuple[str, ...]:
    cleared = tuple(self._pending_command_ids)
    self._pending_command_ids.clear()
    self.connection_state.connected = True
    self.connection_state.active_transport = transport
    self.connection_state.transport_label = label or transport.value
    self.connection_state.transport_capability = capability
    self.connection_state.native_adapter_path = native_adapter_path
    self.connection_state.native_adapter_status = native_adapter_status
    self.connection_state.reconnect_count += 1
    self.connection_state.last_failure_reason = None
    self.connection_state.sensor_cache_refresh_required = True
    if transport == TransportKind.WIFI:
        self.connection_state.wifi_failed = False
    elif transport == TransportKind.BLUETOOTH:
        self.connection_state.bluetooth_failed = False
    return cleared
```

- [ ] **Step 4: Normalize selector names**

Modify `weisile-link/weisile_link/transport/selector.py`:

```python
FULL_BLUETOOTH_NAMES = {"bluetooth", "vsle-bluetooth", "vsle_bluetooth"}


def _normalize_transport_name(transport: str) -> str:
    normalized = str(transport).strip().lower().replace("_", "-")
    if normalized in FULL_BLUETOOTH_NAMES:
        return "vsle-bluetooth"
    if normalized in {"wifi", "auto"}:
        return normalized
    raise ConnectionError(f"Unsupported EV3 transport: {transport}")
```

Use `_normalize_transport_name` in `set_transport`, make `_transport_for("vsle-bluetooth")` return `self.bluetooth_transport`, and make `active_transport_name` return `manager.connection_state.transport_label` when set.

When `_connect_named("vsle-bluetooth", ...)` succeeds, call:

```python
self.manager.record_reconnected(
    TransportKind.BLUETOOTH,
    label="vsle-bluetooth",
    capability="full",
)
```

Return:

```python
{"transport": "vsle-bluetooth", "transport_capability": "full"}
```

If the original request was `bluetooth`, include `"transport_alias": "bluetooth"`.

- [ ] **Step 5: Add session status fields**

Modify `EV3Session.status_payload` in `weisile-link/weisile_link/sessions.py`:

```python
return {
    "brick_id": self.brick_id,
    "name": self.name,
    "connected": self.manager.connection_state.connected,
    "transport": (
        self.manager.connection_state.transport_label
        or (active_transport.value if active_transport else None)
    ),
    "transport_capability": self.manager.connection_state.transport_capability,
    "native_adapter_path": self.manager.connection_state.native_adapter_path,
    "native_adapter_status": self.manager.connection_state.native_adapter_status,
    "last_unsupported_capability": (
        self.manager.connection_state.last_unsupported_capability
    ),
    "scratch_clients": self.router.consumer_count("scratch"),
    "trainer_clients": self.router.consumer_count("trainer"),
    "collected_points": self.manager.collected_points,
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_transport_selector.py weisile-link/tests/test_observability.py -v
```

Expected: selector and observability tests pass.

- [ ] **Step 7: Commit, push, and log**

Run:

```bash
git add weisile-link/weisile_link/runtime/degradation.py weisile-link/weisile_link/transport/selector.py weisile-link/weisile_link/sessions.py weisile-link/tests/test_transport_selector.py weisile-link/tests/test_observability.py
git commit -m "feat(bluetooth): name full vsle transport"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append a progress entry with the hash, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record vsle bluetooth transport naming"
git push origin codex/native-adapter-process
```

## Task 3: Generalize the Native Byte-Stream Adapter Boundary

**Files:**
- Create: `weisile-link/weisile_link/transport/native_byte_stream.py`
- Modify: `weisile-link/weisile_link/transport/native_adapter_process.py`
- Modify: `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`
- Modify: `weisile-link/tests/test_native_adapter_process.py`
- Modify: `weisile-link/tests/test_official_ev3_bt_transport.py`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing shared adapter tests**

Append to `weisile-link/tests/test_native_adapter_process.py`:

```python
def test_native_adapter_process_connect_accepts_channel_and_reports_status():
    async def scenario():
        script = make_fake_adapter(
            [
                {"ok": True, "result": {"connected": True}},
                {
                    "ok": True,
                    "result": {
                        "connected": True,
                        "adapter_version": "fake-1",
                        "profile": "rfcomm",
                    },
                },
            ]
        )
        adapter = NativeAdapterProcess(script)

        await adapter.connect("00:16:53:AA:BB:CC", channel=1, profile="rfcomm")
        status = await adapter.status()

        assert status.connected is True
        assert status.adapter_version == "fake-1"
        assert status.profile == "rfcomm"
        assert adapter.executable == script
        await adapter.close()

    asyncio.run(scenario())
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_native_adapter_process.py -v
```

Expected: fail because `connect` lacks `channel` and `status` is missing.

- [ ] **Step 3: Create shared adapter protocol**

Create `weisile-link/weisile_link/transport/native_byte_stream.py`:

```python
"""Shared native Bluetooth Classic byte-stream boundary."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class NativeByteStreamStatus:
    connected: bool
    adapter_version: str = ""
    profile: str = ""
    last_error: Optional[str] = None


class NativeByteStreamAdapter(Protocol):
    async def connect(
        self,
        address: str,
        *,
        channel: int = 1,
        profile: str = "rfcomm",
    ) -> None:
        """Open an OS-native Bluetooth Classic byte stream."""

    async def send(self, payload: bytes) -> None:
        """Write raw bytes to the native connection."""

    async def recv(self) -> bytes:
        """Read raw bytes from the native connection."""

    async def status(self) -> NativeByteStreamStatus:
        """Return native adapter connection details."""

    async def close(self) -> None:
        """Close the native connection."""
```

- [ ] **Step 4: Update process adapter**

Modify `NativeAdapterProcess.connect`:

```python
async def connect(
    self,
    address: str,
    *,
    channel: int = 1,
    profile: str = "rfcomm",
) -> None:
    await self._ensure_process()
    await self._request(
        "connect",
        {
            "address": address,
            "channel": channel,
            "profile": profile,
        },
    )
```

Add:

```python
async def status(self) -> NativeByteStreamStatus:
    result = await self._request("status", {})
    return NativeByteStreamStatus(
        connected=bool(result.get("connected")),
        adapter_version=str(result.get("adapter_version", "")),
        profile=str(result.get("profile", "")),
        last_error=result.get("last_error"),
    )
```

Import `NativeByteStreamStatus` from the new module.

- [ ] **Step 5: Update official firmware transport imports**

In `official_ev3_bt_transport.py`, replace the local `NativeBluetoothAdapterProtocol` with:

```python
from weisile_link.transport.native_byte_stream import NativeByteStreamAdapter
```

Change the constructor annotation to:

```python
adapter: Optional[NativeByteStreamAdapter] = None,
```

- [ ] **Step 6: Run tests**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_native_adapter_process.py weisile-link/tests/test_official_ev3_bt_transport.py -v
```

Expected: all shared adapter and official firmware tests pass.

- [ ] **Step 7: Commit, push, and log**

Run:

```bash
git add weisile-link/weisile_link/transport/native_byte_stream.py weisile-link/weisile_link/transport/native_adapter_process.py weisile-link/weisile_link/transport/official_ev3_bt_transport.py weisile-link/tests/test_native_adapter_process.py weisile-link/tests/test_official_ev3_bt_transport.py
git commit -m "feat(bluetooth): generalize native byte stream"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append the progress entry, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record native byte stream boundary"
git push origin codex/native-adapter-process
```

## Task 4: Add Native Adapter Support to Full VSLE Bluetooth Transport

**Files:**
- Modify: `weisile-link/weisile_link/transport/bluetooth_transport.py`
- Modify: `weisile-link/weisile_link/transport/__init__.py`
- Modify: `weisile-link/tests/test_bluetooth_transport.py`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing full VSLE native adapter tests**

Append to `weisile-link/tests/test_bluetooth_transport.py`:

```python
class FakeNativeByteStream:
    def __init__(self):
        self.connected_to = None
        self.sent = []
        self.incoming = queue.Queue()
        self.closed = False

    async def connect(self, address, *, channel=1, profile="rfcomm"):
        self.connected_to = (address, channel, profile)

    async def send(self, payload):
        self.sent.append(payload)

    async def recv(self):
        return self.incoming.get(timeout=1)

    async def status(self):
        from weisile_link.transport.native_byte_stream import (
            NativeByteStreamStatus,
        )

        return NativeByteStreamStatus(
            connected=True,
            adapter_version="fake-native",
            profile="rfcomm",
        )

    async def close(self):
        self.closed = True

    def feed(self, payload):
        if isinstance(payload, dict):
            payload = json.dumps(payload, separators=(",", ":")).encode("utf-8") + b"\n"
        self.incoming.put(payload)


def test_vsle_bluetooth_uses_native_adapter_for_json_line_protocol():
    async def scenario():
        adapter = FakeNativeByteStream()
        manager = DegradationManager(bluetooth_supported=True)
        transport = VSLEBluetoothTransport(
            "00:16:53:AA:BB:CC",
            native_adapter=adapter,
            manager=manager,
            pairing_token="secret",
        )
        adapter.feed({"type": "ack", "id": "auth.pair", "ok": True})

        connected = await transport.connect(lambda _payload: None)

        assert connected is True
        assert adapter.connected_to == ("00:16:53:AA:BB:CC", 1, "rfcomm")
        assert json.loads(adapter.sent[0].decode("utf-8")) == {
            "id": "auth.pair",
            "method": "auth.pair",
            "params": {"token": "secret"},
        }
        assert manager.connection_state.transport_label == "vsle-bluetooth"
        assert manager.connection_state.transport_capability == "full"
        assert manager.connection_state.native_adapter_status == "fake-native"
        await transport.disconnect()

    asyncio.run(scenario())
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_bluetooth_transport.py -v
```

Expected: fail because `VSLEBluetoothTransport` and `native_adapter` are missing.

- [ ] **Step 3: Implement native adapter line I/O**

In `bluetooth_transport.py`, import the shared protocol:

```python
from weisile_link.transport.native_byte_stream import NativeByteStreamAdapter
```

Add `native_adapter: Optional[NativeByteStreamAdapter] = None` to `__init__` and store `self._native_adapter`.

Add helper methods:

```python
async def _open_native_adapter(self) -> bool:
    if self._native_adapter is None:
        return False
    try:
        await self._native_adapter.connect(
            self.ev3_address,
            channel=self.channel,
            profile="rfcomm",
        )
        status = await self._native_adapter.status()
        self.manager.record_reconnected(
            TransportKind.BLUETOOTH,
            label="vsle-bluetooth",
            capability="full",
            native_adapter_path=str(getattr(self._native_adapter, "executable", "")),
            native_adapter_status=status.adapter_version or status.profile,
        )
        return True
    except Exception as exc:
        self._record_failure(str(exc) or type(exc).__name__)
        return False


async def _write_bytes(self, payload: bytes) -> None:
    if self._native_adapter is not None:
        await self._native_adapter.send(payload)
        return
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, self._file.write, payload)
    flush = getattr(self._file, "flush", None)
    if flush is not None:
        await loop.run_in_executor(None, flush)


async def _read_bytes_line(self) -> bytes:
    if self._native_adapter is not None:
        buffer = bytearray()
        while True:
            chunk = await self._native_adapter.recv()
            if not chunk:
                raise ConnectionError("EV3 Bluetooth RFCOMM closed")
            buffer.extend(chunk)
            if b"\n" in chunk:
                break
        return bytes(buffer).split(b"\n", 1)[0] + b"\n"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, self._file.readline)
```

Use these helpers from `_write_json_line` and `_read_json_line`. In `connect`, when a native adapter exists, use `_open_native_adapter`, run `_pair` if needed, create the receive loop, and return true.

Add alias:

```python
class VSLEBluetoothTransport(BluetoothTransport):
    """Product-named full VSLE Bluetooth transport."""
```

- [ ] **Step 4: Update exports**

In `weisile-link/weisile_link/transport/__init__.py`:

```python
from .bluetooth_transport import BluetoothTransport, VSLEBluetoothTransport
```

Add `"VSLEBluetoothTransport"` to `__all__`.

- [ ] **Step 5: Run tests**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_bluetooth_transport.py -v
```

Expected: all full VSLE Bluetooth transport tests pass.

- [ ] **Step 6: Commit, push, and log**

Run:

```bash
git add weisile-link/weisile_link/transport/bluetooth_transport.py weisile-link/weisile_link/transport/__init__.py weisile-link/tests/test_bluetooth_transport.py
git commit -m "feat(bluetooth): support native full vsle adapter"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append the progress entry, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record full vsle native adapter"
git push origin codex/native-adapter-process
```

## Task 5: Wire Runtime Configuration, JSON-RPC Selection, and Status

**Files:**
- Modify: `weisile-link/weisile_link/cli.py`
- Modify: `weisile-link/weisile_link/json_rpc_server.py`
- Modify: `weisile-link/tests/test_json_rpc_server.py`
- Modify: `weisile-link/tests/test_native_adapter_process.py`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing runtime config tests**

Append to `weisile-link/tests/test_native_adapter_process.py`:

```python
def test_build_server_uses_native_process_adapter_for_vsle_bluetooth(monkeypatch, tmp_path):
    adapter_path = tmp_path / "adapter"
    adapter_path.write_text("#!/bin/sh\n", encoding="utf-8")
    adapter_path.chmod(0o755)
    monkeypatch.setenv("WEISILE_TRANSPORT", "vsle-bluetooth")
    monkeypatch.setenv("EV3_BT", "00:16:53:AA:BB:CC")
    monkeypatch.setenv("WEISILE_VSLE_BT_ADAPTER", str(adapter_path))

    from weisile_link.cli import WeisileLinkRuntimeConfig, build_server
    from weisile_link.transport.selector import AutoTransport
    from weisile_link.transport.bluetooth_transport import VSLEBluetoothTransport

    server = build_server(WeisileLinkRuntimeConfig.from_env())

    assert isinstance(server.transport, AutoTransport)
    assert isinstance(server.transport.bluetooth_transport, VSLEBluetoothTransport)
    assert server.transport.bluetooth_transport._native_adapter.executable == adapter_path
```

Append to `weisile-link/tests/test_json_rpc_server.py`:

```python
def test_status_payload_reports_vsle_bluetooth_capability():
    manager = DegradationManager(bluetooth_supported=True)
    manager.record_reconnected(
        TransportKind.BLUETOOTH,
        label="vsle-bluetooth",
        capability="full",
        native_adapter_path="/Applications/WeisileLink.app/native",
        native_adapter_status="fake-native",
    )
    transport = FakeTransport(manager=manager)
    server = ScratchJsonRpcServer(transport, manager=manager)

    response = server.handle_get("/api/status")
    payload = json.loads(response.body)

    assert payload["ev3_sessions"][0]["transport"] == "vsle-bluetooth"
    assert payload["ev3_sessions"][0]["transport_capability"] == "full"
    assert payload["ev3_sessions"][0]["native_adapter_status"] == "fake-native"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_native_adapter_process.py weisile-link/tests/test_json_rpc_server.py -v
```

Expected: runtime config test fails because `WEISILE_VSLE_BT_ADAPTER` is unread and status fields are absent.

- [ ] **Step 3: Update CLI config**

Modify `WeisileLinkRuntimeConfig` in `cli.py`:

```python
vsle_bt_adapter: str = ""
```

Read it from env:

```python
vsle_bt_adapter=os.getenv("WEISILE_VSLE_BT_ADAPTER", cls.vsle_bt_adapter),
```

Use `VSLEBluetoothTransport`:

```python
native_vsle_adapter = (
    NativeAdapterProcess(config.vsle_bt_adapter)
    if config.vsle_bt_adapter
    else None
)
if config.ev3_bt:
    bluetooth_transport = VSLEBluetoothTransport(
        config.ev3_bt,
        manager=manager,
        native_adapter=native_vsle_adapter,
    )
```

Accept full transport:

```python
elif config.transport in {"bluetooth", "vsle-bluetooth", "vsle_bluetooth"}:
    transport = AutoTransport(
        wifi_transport,
        bluetooth_transport,
        manager=manager,
        preferred="vsle-bluetooth",
    )
```

- [ ] **Step 4: Update JSON-RPC default factory**

In `json_rpc_server.py`, update imports to `VSLEBluetoothTransport`, build a native adapter from `WEISILE_VSLE_BT_ADAPTER`, and make `transport_mode in {"bluetooth", "vsle-bluetooth", "vsle_bluetooth"}` choose `preferred="vsle-bluetooth"`.

- [ ] **Step 5: Run tests**

Run:

```bash
.venv/bin/python -m pytest weisile-link/tests/test_native_adapter_process.py weisile-link/tests/test_json_rpc_server.py -v
```

Expected: runtime config and JSON-RPC status tests pass.

- [ ] **Step 6: Commit, push, and log**

Run:

```bash
git add weisile-link/weisile_link/cli.py weisile-link/weisile_link/json_rpc_server.py weisile-link/tests/test_native_adapter_process.py weisile-link/tests/test_json_rpc_server.py
git commit -m "feat(bridge): wire vsle bluetooth runtime"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append the progress entry, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record vsle bluetooth runtime wiring"
git push origin codex/native-adapter-process
```

## Task 6: Update EV3 Setup for Full Bluetooth Listener

**Files:**
- Modify: `ev3-firmware/systemd/vsle-ev3-server.service`
- Modify: `ev3-firmware/scripts/install.sh`
- Modify: `docs/EV3DEV_SETUP.md`
- Modify: `ev3-firmware/README.md`
- Modify: `tests/test_ev3_autostart_assets.py`
- Modify: `tests/test_ev3_server.py`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing EV3 setup tests**

Append to `tests/test_ev3_autostart_assets.py`:

```python
def test_ev3_systemd_documents_bluetooth_disabled_by_default():
    service = (ROOT / "ev3-firmware/systemd/vsle-ev3-server.service").read_text(
        encoding="utf-8"
    )
    assert "EV3_ENABLE_BLUETOOTH=0" in service
    assert "EV3_BT_RFCOMM_CHANNEL=1" in service


def test_install_script_can_enable_full_vsle_bluetooth_env():
    script = (ROOT / "ev3-firmware/scripts/install.sh").read_text(
        encoding="utf-8"
    )
    assert "EV3_ENABLE_BLUETOOTH" in script
    assert "VSLE_EV3_ENABLE_BLUETOOTH" in script
    assert "EV3_BT_RFCOMM_CHANNEL" in script
```

Append to `tests/test_ev3_server.py`:

```python
def test_bluetooth_endpoint_uses_same_auth_and_command_handler_as_wifi():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="secret")
    endpoint = FakeWebSocket(
        [
            json.dumps(
                {
                    "id": "pair-1",
                    "method": "auth.pair",
                    "params": {"token": "secret"},
                }
            ),
            json.dumps(
                {
                    "id": "cmd-1",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            ),
        ]
    )

    asyncio.run(server.handle_bluetooth_endpoint(endpoint))

    assert endpoint.sent[0] == {"type": "ack", "id": "pair-1", "ok": True}
    assert endpoint.sent[1] == {"type": "ack", "id": "cmd-1", "ok": True}
    assert hardware.actions == [("motor_stop", "A")]
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest tests/test_ev3_autostart_assets.py tests/test_ev3_server.py -v
```

Expected: setup env assertions fail if the service/install script lacks Bluetooth env wiring.

- [ ] **Step 3: Wire service defaults**

Modify `ev3-firmware/systemd/vsle-ev3-server.service`:

```ini
Environment=EV3_ENABLE_BLUETOOTH=0
Environment=EV3_BT_ADDRESS=
Environment=EV3_BT_RFCOMM_CHANNEL=1
```

- [ ] **Step 4: Wire install script env file**

In `ev3-firmware/scripts/install.sh`, when writing the EV3 env file, include:

```bash
EV3_ENABLE_BLUETOOTH="${VSLE_EV3_ENABLE_BLUETOOTH:-0}"
EV3_BT_ADDRESS="${VSLE_EV3_BT_ADDRESS:-}"
EV3_BT_RFCOMM_CHANNEL="${VSLE_EV3_BT_RFCOMM_CHANNEL:-1}"
```

Write those keys into the generated environment file.

- [ ] **Step 5: Update docs**

In `docs/EV3DEV_SETUP.md` and `ev3-firmware/README.md`, add a section named `Full VSLE Bluetooth` with these facts:

````markdown
Full VSLE Bluetooth requires ev3dev and `vsle_ev3_server.py`; it is not official firmware compatibility mode. Enable it only after the EV3 is paired and classroom safety is checked:

```bash
VSLE_EV3_ENABLE_BLUETOOTH=1 VSLE_EV3_BT_RFCOMM_CHANNEL=1 ./ev3-firmware/scripts/install.sh
```

The ScratchAI website must select `vsle-bluetooth` for full module coverage. Official firmware compatibility remains `official-bluetooth` and does not cover AI Quest, PID, 50Hz raw streaming, or full display behavior.
````

- [ ] **Step 6: Run tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_ev3_autostart_assets.py tests/test_ev3_server.py -v
```

Expected: EV3 setup and server Bluetooth tests pass.

- [ ] **Step 7: Commit, push, and log**

Run:

```bash
git add ev3-firmware/systemd/vsle-ev3-server.service ev3-firmware/scripts/install.sh docs/EV3DEV_SETUP.md ev3-firmware/README.md tests/test_ev3_autostart_assets.py tests/test_ev3_server.py
git commit -m "docs(ev3): wire full vsle bluetooth setup"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append the progress entry, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record full bluetooth ev3 setup"
git push origin codex/native-adapter-process
```

## Task 7: Update Scratch Connection Modal and Extension Transport Parameters

**Files:**
- Modify: `vsle-ev3-extension/index.js`
- Modify: `vsle-ev3-extension/tests/test_connection_modal.js`
- Modify: `vsle-ev3-extension/tests/test_extension.js`
- Modify: `vsle-ev3-extension/README.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing modal tests**

Modify `test('buildConnectionModalModel normalizes WiFi and Bluetooth fields', ...)` in `vsle-ev3-extension/tests/test_connection_modal.js` to assert:

```javascript
const model = buildConnectionModalModel({
    transport: 'vsle-bluetooth',
    ev3Ip: ' 192.168.5.42 ',
    ev3Bt: ' 00:16:53:AA:BB:CC ',
    status: 'connecting',
    message: '正在连接...'
});

assert.equal(model.transport, 'vsle-bluetooth');
```

Add assertions in the render test:

```javascript
assert.match(html, /WiFi Full VSLE/);
assert.match(html, /Bluetooth Full VSLE/);
assert.match(html, /Official Firmware Bluetooth Compatibility/);
```

Update the connect-action expected payloads:

```javascript
{
    method: 'vsle.setTransport',
    params: {
        transport: 'vsle-bluetooth',
        ev3_bt: '00:16:53:AA:BB:CC'
    }
},
{
    method: 'vsle.setTransport',
    params: {
        transport: 'official-bluetooth',
        ev3_official_bt: '00:16:53:AA:BB:CC'
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd vsle-ev3-extension && npm test -- tests/test_connection_modal.js
```

Expected: fail because `normalizeTransport` only accepts `wifi` and `bluetooth`.

- [ ] **Step 3: Update transport normalization**

Modify `normalizeTransport`:

```javascript
const normalizeTransport = value => {
    const transport = String(value || 'wifi').toLowerCase().replace(/_/g, '-');
    if (transport === 'bluetooth') return 'vsle-bluetooth';
    if (['wifi', 'vsle-bluetooth', 'official-bluetooth'].includes(transport)) {
        return transport;
    }
    return 'wifi';
};
```

- [ ] **Step 4: Update modal rendering**

Render three radio choices with existing modal classes:

```javascript
[
    ['wifi', 'WiFi Full VSLE (推荐)'],
    ['vsle-bluetooth', 'Bluetooth Full VSLE'],
    ['official-bluetooth', 'Official Firmware Bluetooth Compatibility']
].forEach(...)
```

Keep the same modal width, fonts, colors, header, footer, and field layout.

- [ ] **Step 5: Update connection params**

Modify `_connectionParams`:

```javascript
if (this.transport === 'vsle-bluetooth') {
    return {transport: 'vsle-bluetooth', ev3Bt: this.ev3Bt};
}
if (this.transport === 'official-bluetooth') {
    return {
        transport: 'official-bluetooth',
        ev3OfficialBt: this.ev3Bt
    };
}
return {transport: 'wifi', ev3Ip: this.ev3Ip};
```

Modify `setTransport`:

```javascript
if (transport === 'vsle-bluetooth') {
    params.ev3_bt = trimOrDefault(args.EV3_BT || args.ev3Bt || args.ev3_bt, '');
} else if (transport === 'official-bluetooth') {
    params.ev3_official_bt = trimOrDefault(
        args.EV3_OFFICIAL_BT || args.ev3OfficialBt || args.ev3_official_bt,
        ''
    );
} else {
    params.ev3_ip = trimOrDefault(
        args.EV3_IP || args.ev3Ip || args.ev3_ip,
        CONNECTION_MODAL_DEFAULT_WIFI_IP
    );
}
```

- [ ] **Step 6: Run extension tests**

Run:

```bash
cd vsle-ev3-extension && npm test -- tests/test_connection_modal.js tests/test_extension.js
```

Expected: modal and extension tests pass.

- [ ] **Step 7: Commit, push, and log**

Run:

```bash
git add vsle-ev3-extension/index.js vsle-ev3-extension/tests/test_connection_modal.js vsle-ev3-extension/tests/test_extension.js vsle-ev3-extension/README.md
git commit -m "feat(extension): expose full bluetooth connection mode"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append the progress entry, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record extension bluetooth mode"
git push origin codex/native-adapter-process
```

## Task 8: Add Full VSLE Bluetooth Smoke Evidence Gate

**Files:**
- Create: `scripts/run_vsle_bluetooth_smoke.py`
- Create: `tests/test_vsle_bluetooth_smoke.py`
- Create: `docs/classroom/vsle_bluetooth_full_module_smoke.template.json`
- Modify: `docs/classroom/REAL_EV3_REHEARSAL.md`
- Modify: `docs/SOURCE_REGISTER.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Write failing smoke evidence tests**

Create `tests/test_vsle_bluetooth_smoke.py`:

```python
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/run_vsle_bluetooth_smoke.py"


def test_vsle_bluetooth_smoke_rejects_missing_evidence(tmp_path):
    report = tmp_path / "report.md"
    result = subprocess.run(
        [".venv/bin/python", str(SCRIPT), "--evidence", str(tmp_path / "missing.json"), "--report", str(report)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "Classroom ready: no" in report.read_text(encoding="utf-8")


def test_vsle_bluetooth_smoke_accepts_real_full_module_evidence(tmp_path):
    evidence = tmp_path / "evidence.json"
    evidence.write_text(
        json.dumps(
            {
                "installed_from_release_artifact": True,
                "ev3_runs_ev3dev_server": True,
                "transport": "vsle-bluetooth",
                "real_ev3_full_bluetooth_ok": True,
                "sensor_freshness_ms_max": 25,
                "command_groups": {
                    "motor": True,
                    "sensor": True,
                    "sound": True,
                    "display": True,
                    "system": True,
                    "data_collection": True,
                    "ai_quest": True,
                },
                "disconnect_stop_ok": True,
                "scratch_unsandboxed_loaded": True,
            }
        ),
        encoding="utf-8",
    )
    report = tmp_path / "report.md"
    result = subprocess.run(
        [".venv/bin/python", str(SCRIPT), "--evidence", str(evidence), "--report", str(report)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "Classroom ready: yes" in report.read_text(encoding="utf-8")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest tests/test_vsle_bluetooth_smoke.py -v
```

Expected: fail because `scripts/run_vsle_bluetooth_smoke.py` does not exist.

- [ ] **Step 3: Implement smoke evidence runner**

Create `scripts/run_vsle_bluetooth_smoke.py`:

```python
#!/usr/bin/env python3
"""Validate real full VSLE Bluetooth smoke evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_TRUE = (
    "installed_from_release_artifact",
    "ev3_runs_ev3dev_server",
    "real_ev3_full_bluetooth_ok",
    "disconnect_stop_ok",
    "scratch_unsandboxed_loaded",
)
REQUIRED_GROUPS = (
    "motor",
    "sensor",
    "sound",
    "display",
    "system",
    "data_collection",
    "ai_quest",
)


def validate_evidence(payload: dict) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_TRUE:
        if payload.get(key) is not True:
            errors.append(f"{key} must be true")
    if payload.get("transport") != "vsle-bluetooth":
        errors.append("transport must be vsle-bluetooth")
    if payload.get("sensor_freshness_ms_max", 999999) > 25:
        errors.append("sensor_freshness_ms_max must be <= 25")
    groups = payload.get("command_groups", {})
    for group in REQUIRED_GROUPS:
        if groups.get(group) is not True:
            errors.append(f"command_groups.{group} must be true")
    return errors


def write_report(report: Path, errors: list[str]) -> None:
    ready = not errors
    lines = [
        "# VSLE Bluetooth Full Module Smoke Report",
        "",
        f"Classroom ready: {'yes' if ready else 'no'}",
        "",
    ]
    if errors:
        lines.append("## Blocking Items")
        lines.extend(f"- {error}" for error in errors)
        lines.append("")
    report.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if not args.evidence.is_file():
        errors = [f"evidence file not found: {args.evidence}"]
    else:
        errors = validate_evidence(
            json.loads(args.evidence.read_text(encoding="utf-8"))
        )
    write_report(args.report, errors)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Add evidence template**

Create `docs/classroom/vsle_bluetooth_full_module_smoke.template.json`:

```json
{
  "installed_from_release_artifact": false,
  "ev3_runs_ev3dev_server": false,
  "transport": "vsle-bluetooth",
  "real_ev3_full_bluetooth_ok": false,
  "sensor_freshness_ms_max": 999999,
  "command_groups": {
    "motor": false,
    "sensor": false,
    "sound": false,
    "display": false,
    "system": false,
    "data_collection": false,
    "ai_quest": false
  },
  "disconnect_stop_ok": false,
  "scratch_unsandboxed_loaded": false
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_vsle_bluetooth_smoke.py -v
```

Expected: smoke evidence tests pass.

- [ ] **Step 6: Update classroom docs and source register**

Add a full VSLE Bluetooth section to `docs/classroom/REAL_EV3_REHEARSAL.md` with the smoke command:

```bash
.venv/bin/python scripts/run_vsle_bluetooth_smoke.py \
  --evidence docs/classroom/vsle_bluetooth_full_module_smoke.json \
  --report docs/classroom/vsle_bluetooth_full_module_smoke.md
```

State that a missing or false evidence field blocks classroom readiness.

- [ ] **Step 7: Commit, push, and log**

Run:

```bash
git add scripts/run_vsle_bluetooth_smoke.py tests/test_vsle_bluetooth_smoke.py docs/classroom/vsle_bluetooth_full_module_smoke.template.json docs/classroom/REAL_EV3_REHEARSAL.md docs/SOURCE_REGISTER.md
git commit -m "test(bluetooth): add full module smoke gate"
git push origin codex/native-adapter-process
SHORT_HASH="$(git rev-parse --short HEAD)"
```

Append the progress entry, then:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record full bluetooth smoke gate"
git push origin codex/native-adapter-process
```

## Task 9: Final Full VSLE Bluetooth Verification Pass

**Files:**
- Modify: `docs/SOURCE_REGISTER.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Run Python verification**

Run:

```bash
.venv/bin/python -m pytest \
  tests/test_vsle_bluetooth_coverage.py \
  tests/test_vsle_bluetooth_smoke.py \
  tests/test_ev3_autostart_assets.py \
  tests/test_ev3_server.py \
  weisile-link/tests/test_bluetooth_transport.py \
  weisile-link/tests/test_transport_selector.py \
  weisile-link/tests/test_native_adapter_process.py \
  weisile-link/tests/test_official_ev3_bt_transport.py \
  weisile-link/tests/test_json_rpc_server.py \
  -v
```

Expected: all listed tests pass.

- [ ] **Step 2: Run JavaScript verification**

Run:

```bash
cd vsle-ev3-extension && npm test -- \
  tests/test_connection_modal.js \
  tests/test_extension.js \
  tests/test_turbowarp_integration.js
```

Expected: all listed extension tests pass.

- [ ] **Step 3: Run asset validators**

Run:

```bash
.venv/bin/python desktop/scripts/validate_desktop_assets.py
```

Expected: `desktop assets ok`.

- [ ] **Step 4: Confirm real evidence remains separated**

Run:

```bash
.venv/bin/python scripts/run_vsle_bluetooth_smoke.py \
  --evidence docs/classroom/vsle_bluetooth_full_module_smoke.template.json \
  --report /tmp/vsle-bluetooth-template-report.md
```

Expected: command exits `1` and `/tmp/vsle-bluetooth-template-report.md` says `Classroom ready: no`.

- [ ] **Step 5: Review source register**

Ensure `docs/SOURCE_REGISTER.md` contains rows for:

- website Bluetooth full module command design;
- coverage matrix generator;
- full VSLE Bluetooth transport alias;
- shared native byte-stream adapter;
- EV3 RFCOMM listener setup;
- full Bluetooth smoke evidence gate.

- [ ] **Step 6: Commit final verification note**

Append a progress entry to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` summarizing the verification outputs and preserving the real-hardware evidence blocker if no physical smoke evidence was collected.

Run:

```bash
git add docs/SOURCE_REGISTER.md VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record full bluetooth verification"
git push origin codex/native-adapter-process
```

## Self-Review

Spec coverage:

- The generated matrix implements the design requirement to prove every current EV3 block as cache-backed, host-side, or EV3-dispatched.
- `vsle-bluetooth` transport naming, aliasing, and `/api/status` metadata are covered by Tasks 2 and 5.
- Native byte-stream adapter generalization is covered by Task 3.
- Full VSLE Bluetooth command transport parity is covered by Task 4.
- EV3 setup and RFCOMM listener documentation are covered by Task 6.
- Website connection flow copy and params are covered by Task 7.
- Browser and real-hardware evidence gates are covered by Task 8 and Task 9.
- Official firmware compatibility remains separate throughout Tasks 1, 3, 5, 8, and 9.

Placeholder scan:

- This plan contains concrete file paths, command lines, expected outputs, and code snippets for each task.
- No task instructs an implementer to invent missing behavior without tests.
- Real hardware classroom readiness remains blocked unless the smoke evidence runner accepts real `vsle-bluetooth` evidence.

Type consistency:

- The transport string is consistently `vsle-bluetooth`.
- The official firmware transport string remains `official-bluetooth`.
- The native adapter abstraction is consistently named `NativeByteStreamAdapter`.
- Status fields are consistently `transport`, `transport_capability`, `native_adapter_path`, `native_adapter_status`, and `last_unsupported_capability`.
