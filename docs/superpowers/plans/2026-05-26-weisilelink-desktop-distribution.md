# WeisileLink Desktop Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reliable macOS and Windows WeisileLink desktop distributions, then add an explicitly labeled official EV3 firmware Bluetooth compatibility mode.

**Architecture:** Keep the existing Python WeisileLink core as the Scratch-facing service and add desktop packaging, supervision, diagnostics, and OS-specific Bluetooth adapters around it. Full VSLE WiFi mode ships first; official firmware Bluetooth compatibility is added behind a separate transport that uses native macOS/Windows Bluetooth adapters and EV3 Direct Command encoding.

**Tech Stack:** Python 3.9+ WeisileLink core, pytest, Node-based ScratchAI browser verification, macOS LaunchAgent/pkg signing/notarization workflow, Windows service/startup packaging, native macOS Bluetooth adapter, native Windows Bluetooth adapter, EV3 Direct Command byte protocol.

---

## Scope

This plan implements the design in
`docs/superpowers/specs/2026-05-26-weisilelink-desktop-distribution-design.md`.

In scope:

- Desktop packaging scaffolds for macOS and Windows.
- Embedded-runtime release assumptions and installer validation.
- Auto-start registration and uninstall/rollback behavior.
- Diagnostics export with secret redaction.
- Clean-machine smoke scripts.
- Official EV3 firmware Bluetooth compatibility transport design and first
  code slice.
- Progress log entries and GitHub push after each completed task.

Out of scope:

- Changing Scratch visual design.
- Making AI Quest work over official firmware Bluetooth as a 50Hz stream.
- Claiming macOS/Windows official firmware Bluetooth support before native
  adapters and real EV3 smoke evidence pass.

## File Structure

Create or modify these files:

- Create `docs/desktop/WEISILELINK_DESKTOP.md`: cross-platform teacher install,
  modes, status, diagnostics, support.
- Create `docs/desktop/MACOS_INSTALL.md`: macOS installer, LaunchAgent,
  signing/notarization, logs, uninstall.
- Create `docs/desktop/WINDOWS_INSTALL.md`: Windows installer, service/startup,
  firewall, logs, uninstall.
- Create `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`: official
  firmware capability matrix and limitations.
- Create `docs/desktop/DIAGNOSTICS.md`: diagnostic export schema and redaction.
- Create `desktop/README.md`: release build entry point.
- Create `desktop/macos/weisile-link.launchd.plist`: release LaunchAgent
  template with bundled executable path.
- Create `desktop/macos/install.sh`: macOS installer helper for local QA.
- Create `desktop/macos/uninstall.sh`: macOS uninstall helper.
- Create `desktop/windows/weisile-link-service.xml`: Windows service metadata
  or service wrapper config used by packaging.
- Create `desktop/windows/install.ps1`: Windows install helper for local QA.
- Create `desktop/windows/uninstall.ps1`: Windows uninstall helper.
- Create `desktop/scripts/validate_desktop_assets.py`: static validation for
  desktop packaging files.
- Create `tests/test_desktop_packaging.py`: pytest coverage for desktop assets.
- Create `weisile-link/weisile_link/desktop/diagnostics.py`: diagnostics bundle
  generation and redaction.
- Create `weisile-link/tests/test_desktop_diagnostics.py`: diagnostics tests.
- Create `weisile-link/weisile_link/protocol/official_ev3_direct_command.py`:
  source-backed EV3 Direct Command encoder/decoder.
- Create `weisile-link/tests/test_official_ev3_direct_command.py`: direct
  command unit tests.
- Create `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`:
  platform-neutral transport shell using a native adapter interface.
- Create `weisile-link/tests/test_official_ev3_bt_transport.py`: fake-adapter
  tests for polling, cache updates, validation, and fail-closed behavior.
- Modify `weisile-link/weisile_link/cli.py`: add desktop config values only
  after tests describe them.
- Modify `docs/SOURCE_REGISTER.md`: cite Scratch Link, official Scratch EV3,
  EV3 Developer Kit, macOS/Windows packaging sources.
- Modify `AGENTS.md`: add desktop distribution and native Bluetooth rules.
- Modify `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`: add desktop distribution
  requirements and progress entries.

## Task 1: Desktop Documentation Skeleton and Packaging Asset Tests

**Files:**
- Create: `docs/desktop/WEISILELINK_DESKTOP.md`
- Create: `docs/desktop/MACOS_INSTALL.md`
- Create: `docs/desktop/WINDOWS_INSTALL.md`
- Create: `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`
- Create: `docs/desktop/DIAGNOSTICS.md`
- Create: `desktop/README.md`
- Create: `desktop/macos/weisile-link.launchd.plist`
- Create: `desktop/macos/install.sh`
- Create: `desktop/macos/uninstall.sh`
- Create: `desktop/windows/weisile-link-service.xml`
- Create: `desktop/windows/install.ps1`
- Create: `desktop/windows/uninstall.ps1`
- Create: `desktop/scripts/validate_desktop_assets.py`
- Create: `tests/test_desktop_packaging.py`

- [x] **Step 1: Write failing packaging tests**

Create `tests/test_desktop_packaging.py`:

```python
from pathlib import Path
import plistlib
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def test_desktop_docs_exist_and_name_both_modes():
    required = [
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
        ROOT / "docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md",
        ROOT / "docs/desktop/DIAGNOSTICS.md",
    ]
    for path in required:
        assert path.is_file(), path
        text = path.read_text(encoding="utf-8")
        assert "Full VSLE mode" in text
        assert "Official firmware Bluetooth compatibility mode" in text


def test_macos_launch_agent_uses_localhost_and_bundled_binary():
    plist_path = ROOT / "desktop/macos/weisile-link.launchd.plist"
    with plist_path.open("rb") as handle:
        data = plistlib.load(handle)
    assert data["Label"] == "cn.vsle.weisile-link"
    args = data["ProgramArguments"]
    assert any("WeisileLink" in item for item in args)
    env = data["EnvironmentVariables"]
    assert env["WEISILE_LINK_HOST"] == "127.0.0.1"
    assert env["WEISILE_LINK_PORT"] == "20111"
    assert data["RunAtLoad"] is True
    assert data["KeepAlive"] is True


def test_windows_install_scripts_keep_localhost_defaults():
    install_text = (ROOT / "desktop/windows/install.ps1").read_text(
        encoding="utf-8"
    )
    service_text = (ROOT / "desktop/windows/weisile-link-service.xml").read_text(
        encoding="utf-8"
    )
    assert "127.0.0.1" in install_text
    assert "20111" in install_text
    assert "8766" in install_text
    assert "WeisileLink" in service_text
    assert "WEISILE_LINK_HOST=127.0.0.1" in service_text


def test_desktop_asset_validator_passes():
    result = subprocess.run(
        ["python", "desktop/scripts/validate_desktop_assets.py"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr + result.stdout
```

- [x] **Step 2: Run the tests to verify they fail**

Run:

```bash
python -m pytest tests/test_desktop_packaging.py -v
```

Expected: FAIL because `docs/desktop` and `desktop` files do not exist.

- [x] **Step 3: Create the desktop documentation**

Create the five `docs/desktop/*.md` files. Each file must explicitly include:

```markdown
## Modes

- Full VSLE mode: EV3 boots ev3dev and runs `vsle_ev3_server.py`.
- Official firmware Bluetooth compatibility mode: EV3 keeps official LEGO
  firmware and connects over Bluetooth Classic for the supported Basic Pack.

## Reliability Rules

- The bridge binds to `127.0.0.1` by default.
- Installers bundle their runtime and do not require system Python.
- Logs and diagnostics redact tokens, API keys, and student raw data.
- Uninstall removes startup entries and preserves diagnostics unless the teacher
  chooses to delete them.
```

- [x] **Step 4: Create macOS packaging assets**

Create `desktop/macos/weisile-link.launchd.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>cn.vsle.weisile-link</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/WeisileLink.app/Contents/MacOS/WeisileLink</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>WEISILE_LINK_HOST</key>
    <string>127.0.0.1</string>
    <key>WEISILE_LINK_PORT</key>
    <string>20111</string>
    <key>TRAINER_WS_PORT</key>
    <string>8766</string>
    <key>WEISILE_TRANSPORT</key>
    <string>wifi</string>
    <key>LOG_LEVEL</key>
    <string>INFO</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>~/Library/Logs/WeisileLink/weisile-link.out.log</string>
  <key>StandardErrorPath</key>
  <string>~/Library/Logs/WeisileLink/weisile-link.err.log</string>
</dict>
</plist>
```

Create `desktop/macos/install.sh` and `desktop/macos/uninstall.sh` with `set -eu`,
localhost defaults, LaunchAgent load/unload, and log-directory creation.

- [x] **Step 5: Create Windows packaging assets**

Create `desktop/windows/weisile-link-service.xml`:

```xml
<service>
  <id>WeisileLink</id>
  <name>WeisileLink</name>
  <description>VSLE Scratch-EV3 local bridge</description>
  <executable>%BASE%\WeisileLink.exe</executable>
  <arguments></arguments>
  <env name="WEISILE_LINK_HOST" value="127.0.0.1"/>
  <env name="WEISILE_LINK_PORT" value="20111"/>
  <env name="TRAINER_WS_PORT" value="8766"/>
  <env name="WEISILE_TRANSPORT" value="wifi"/>
  <env name="LOG_LEVEL" value="INFO"/>
  <onfailure action="restart" delay="5 sec"/>
</service>
```

Create `desktop/windows/install.ps1` and `desktop/windows/uninstall.ps1` with:

```powershell
$InstallRoot = "$env:LOCALAPPDATA\Programs\VSLE\WeisileLink"
$LogRoot = "$env:LOCALAPPDATA\VSLE\WeisileLink\logs"
$Env:WEISILE_LINK_HOST = "127.0.0.1"
$Env:WEISILE_LINK_PORT = "20111"
$Env:TRAINER_WS_PORT = "8766"
```

Do not open LAN firewall rules in the default script.

- [x] **Step 6: Create desktop asset validator**

Create `desktop/scripts/validate_desktop_assets.py`:

```python
#!/usr/bin/env python3
from pathlib import Path
import plistlib
import sys


ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    required = [
        "docs/desktop/WEISILELINK_DESKTOP.md",
        "docs/desktop/MACOS_INSTALL.md",
        "docs/desktop/WINDOWS_INSTALL.md",
        "docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md",
        "docs/desktop/DIAGNOSTICS.md",
        "desktop/macos/weisile-link.launchd.plist",
        "desktop/macos/install.sh",
        "desktop/macos/uninstall.sh",
        "desktop/windows/weisile-link-service.xml",
        "desktop/windows/install.ps1",
        "desktop/windows/uninstall.ps1",
    ]
    missing = [path for path in required if not (ROOT / path).is_file()]
    if missing:
        print("Missing desktop assets: " + ", ".join(missing), file=sys.stderr)
        return 1
    with (ROOT / "desktop/macos/weisile-link.launchd.plist").open("rb") as handle:
        plist = plistlib.load(handle)
    env = plist.get("EnvironmentVariables", {})
    if env.get("WEISILE_LINK_HOST") != "127.0.0.1":
        print("macOS LaunchAgent must bind localhost by default", file=sys.stderr)
        return 1
    windows_text = (ROOT / "desktop/windows/install.ps1").read_text(
        encoding="utf-8"
    )
    if "0.0.0.0" in windows_text:
        print("Windows default install must not bind LAN", file=sys.stderr)
        return 1
    print("desktop assets ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [x] **Step 7: Run tests and validator**

Run:

```bash
python -m pytest tests/test_desktop_packaging.py -v
desktop/scripts/validate_desktop_assets.py
```

Expected: all tests pass and validator prints `desktop assets ok`.

- [x] **Step 8: Commit**

Run:

```bash
git add docs/desktop desktop tests/test_desktop_packaging.py
git commit -m "docs(desktop): add WeisileLink installer design assets"
git push origin main
```

## Task 2: Diagnostics Export and Redaction

**Files:**
- Create: `weisile-link/weisile_link/desktop/__init__.py`
- Create: `weisile-link/weisile_link/desktop/diagnostics.py`
- Create: `weisile-link/tests/test_desktop_diagnostics.py`

- [ ] **Step 1: Write failing diagnostics tests**

Create `weisile-link/tests/test_desktop_diagnostics.py`:

```python
from weisile_link.desktop.diagnostics import (
    build_diagnostics_bundle,
    redact_secret_text,
)


def test_redact_secret_text_removes_tokens_and_api_keys():
    text = (
        "WEISILE_PAIRING_TOKEN=abc123\n"
        "DEEPSEEK_API_KEY=sk-secret\n"
        "label=" + "x" * 80 + "\n"
    )
    redacted = redact_secret_text(text)
    assert "abc123" not in redacted
    assert "sk-secret" not in redacted
    assert "WEISILE_PAIRING_TOKEN=<redacted>" in redacted
    assert "DEEPSEEK_API_KEY=<redacted>" in redacted
    assert "x" * 80 not in redacted


def test_build_diagnostics_bundle_excludes_raw_student_data():
    bundle = build_diagnostics_bundle(
        version="0.1.0-test",
        health={"ok": True, "collected_points": 42},
        config={"WEISILE_LINK_HOST": "127.0.0.1", "WEISILE_PAIRING_TOKEN": "secret"},
        recent_logs=[
            "transport_connected",
            "WEISILE_PAIRING_TOKEN=secret",
        ],
        include_student_data=False,
    )
    assert bundle["version"] == "0.1.0-test"
    assert bundle["health"]["ok"] is True
    assert bundle["config"]["WEISILE_PAIRING_TOKEN"] == "<redacted>"
    assert "secret" not in "\n".join(bundle["recent_logs"])
    assert "student_data" not in bundle
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd weisile-link && python -m pytest tests/test_desktop_diagnostics.py -v
```

Expected: FAIL because `weisile_link.desktop.diagnostics` is missing.

- [ ] **Step 3: Implement diagnostics redaction**

Create `weisile-link/weisile_link/desktop/diagnostics.py` with:

```python
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List


SECRET_NAMES = (
    "WEISILE_PAIRING_TOKEN",
    "DEEPSEEK_API_KEY",
    "SILICONFLOW_API_KEY",
    "OPENAI_API_KEY",
)


def redact_secret_text(text: str) -> str:
    redacted = text
    for name in SECRET_NAMES:
        redacted = re.sub(
            rf"({name}=)[^\s]+",
            rf"\1<redacted>",
            redacted,
        )
    redacted = re.sub(r"(label=).{65,}", r"\1<truncated>", redacted)
    return redacted


def build_diagnostics_bundle(
    *,
    version: str,
    health: Dict[str, Any],
    config: Dict[str, Any],
    recent_logs: Iterable[str],
    include_student_data: bool = False,
    student_data: Any = None,
) -> Dict[str, Any]:
    safe_config = {
        key: ("<redacted>" if key in SECRET_NAMES else value)
        for key, value in config.items()
    }
    bundle: Dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "health": health,
        "config": safe_config,
        "recent_logs": [redact_secret_text(line) for line in recent_logs],
    }
    if include_student_data:
        bundle["student_data"] = student_data
    return bundle
```

- [ ] **Step 4: Run diagnostics tests**

Run:

```bash
cd weisile-link && python -m pytest tests/test_desktop_diagnostics.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add weisile-link/weisile_link/desktop weisile-link/tests/test_desktop_diagnostics.py
git commit -m "feat(desktop): add diagnostics redaction bundle"
git push origin main
```

## Task 3: Official EV3 Direct Command Encoder

**Files:**
- Create: `weisile-link/weisile_link/protocol/official_ev3_direct_command.py`
- Create: `weisile-link/tests/test_official_ev3_direct_command.py`
- Modify: `docs/SOURCE_REGISTER.md`

- [ ] **Step 1: Write failing Direct Command tests**

Create `weisile-link/tests/test_official_ev3_direct_command.py`:

```python
from weisile_link.protocol.official_ev3_direct_command import (
    DIRECT_COMMAND_NO_REPLY,
    DIRECT_COMMAND_REPLY,
    OPINPUT_DEVICE_LIST,
    OPOUTPUT_STOP,
    build_direct_command,
    build_motor_stop,
    build_poll_device_list,
)


def test_build_direct_command_adds_size_and_header():
    payload = [OPOUTPUT_STOP, 0, 1, 1]
    command = build_direct_command(DIRECT_COMMAND_NO_REPLY, payload)
    assert command[0] == len(command) - 2
    assert command[1] == 0
    assert command[4] == DIRECT_COMMAND_NO_REPLY
    assert command[7:] == bytes(payload)


def test_build_motor_stop_uses_output_stop_opcode():
    command = build_motor_stop(port_mask=1, brake=True)
    assert command[4] == DIRECT_COMMAND_NO_REPLY
    assert command[7] == OPOUTPUT_STOP
    assert command[-1] == 1


def test_build_poll_device_list_requests_33_bytes():
    command = build_poll_device_list()
    assert command[4] == DIRECT_COMMAND_REPLY
    assert command[5] == 33
    assert OPINPUT_DEVICE_LIST in command
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd weisile-link && python -m pytest tests/test_official_ev3_direct_command.py -v
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement source-backed byte helpers**

Create `weisile-link/weisile_link/protocol/official_ev3_direct_command.py` with
constants copied from the EV3SC-owned official Scratch EV3 extension reference
and comments citing the EV3 Developer Kit:

```python
from __future__ import annotations

from typing import Iterable


DIRECT_COMMAND_REPLY = 0x00
DIRECT_COMMAND_NO_REPLY = 0x80

ONE_BYTE = 0x81
GLOBAL_VARIABLE_ONE_BYTE = 0xE1
GLOBAL_CONSTANT_INDEX_0 = 0x20
GLOBAL_VARIABLE_INDEX_0 = 0x60

OPINPUT_DEVICE_LIST = 0x98
OPINPUT_READSI = 0x9D
OPOUTPUT_STOP = 0xA3
OPOUTPUT_TIME_SPEED = 0xAF
OPOUTPUT_GET_COUNT = 0xB3
OPSOUND = 0x94
OPSOUND_CMD_TONE = 1

LAYER = 0
MAX_DEVICES = 32


def build_direct_command(
    command_type: int,
    bytecode: Iterable[int],
    *,
    allocation: int = 0,
    message_counter: int = 0,
) -> bytes:
    command = bytearray()
    command.extend(b"\x00\x00")
    command.append(message_counter & 0xFF)
    command.append((message_counter >> 8) & 0xFF)
    command.append(command_type)
    command.append(allocation & 0xFF)
    command.append((allocation >> 8) & 0xFF)
    command.extend(value & 0xFF for value in bytecode)
    length = len(command) - 2
    command[0] = length & 0xFF
    command[1] = (length >> 8) & 0xFF
    return bytes(command)


def build_poll_device_list() -> bytes:
    return build_direct_command(
        DIRECT_COMMAND_REPLY,
        [
            OPINPUT_DEVICE_LIST,
            ONE_BYTE,
            MAX_DEVICES,
            GLOBAL_VARIABLE_INDEX_0,
            GLOBAL_VARIABLE_ONE_BYTE,
            GLOBAL_CONSTANT_INDEX_0,
        ],
        allocation=33,
    )


def build_motor_stop(*, port_mask: int, brake: bool) -> bytes:
    return build_direct_command(
        DIRECT_COMMAND_NO_REPLY,
        [OPOUTPUT_STOP, LAYER, port_mask & 0x0F, 1 if brake else 0],
    )
```

- [ ] **Step 4: Run Direct Command tests**

Run:

```bash
cd weisile-link && python -m pytest tests/test_official_ev3_direct_command.py -v
```

Expected: PASS.

- [ ] **Step 5: Update source register**

Add a row under a new "WeisileLink Desktop Official EV3 Bluetooth" section in
`docs/SOURCE_REGISTER.md` citing:

```markdown
| Scratch official EV3 extension | `/Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js` | Source-backed Direct Command constants, motor stop/timed run, sensor polling, and reply parsing behavior for official firmware compatibility |
```

- [ ] **Step 6: Commit**

Run:

```bash
git add weisile-link/weisile_link/protocol/official_ev3_direct_command.py weisile-link/tests/test_official_ev3_direct_command.py docs/SOURCE_REGISTER.md
git commit -m "feat(protocol): add official EV3 direct command encoder"
git push origin main
```

## Task 4: Official Firmware Bluetooth Transport Shell

**Files:**
- Create: `weisile-link/weisile_link/transport/official_ev3_bt_transport.py`
- Create: `weisile-link/tests/test_official_ev3_bt_transport.py`
- Modify: `weisile-link/weisile_link/cli.py`

- [ ] **Step 1: Write fake-adapter transport tests**

Create `weisile-link/tests/test_official_ev3_bt_transport.py` with a fake native
adapter that records writes and returns deterministic EV3 replies. Tests must
cover:

```python
async def test_transport_rejects_commands_before_connect():
    ...

async def test_transport_sends_motor_stop_direct_command_after_validation():
    ...

async def test_transport_marks_unsupported_without_native_adapter():
    ...
```

The tests should assert that unsupported macOS/Windows native adapter absence
returns `False` from `connect()` rather than attempting Python stdlib Bluetooth.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd weisile-link && python -m pytest tests/test_official_ev3_bt_transport.py -v
```

Expected: FAIL because the transport does not exist.

- [ ] **Step 3: Implement transport shell with adapter boundary**

Create `official_ev3_bt_transport.py` with:

```python
class NativeBluetoothAdapterProtocol:
    async def connect(self, address: str) -> None: ...
    async def send(self, payload: bytes) -> None: ...
    async def recv(self) -> bytes: ...
    async def close(self) -> None: ...


class OfficialEV3BluetoothTransport:
    def __init__(self, ev3_address: str, adapter=None, manager=None):
        self.adapter = adapter
        self.ev3_address = ev3_address
        self.manager = manager or DegradationManager()

    async def connect(self, on_sensor_data):
        if self.adapter is None:
            self.manager.bluetooth_supported = False
            return False
        ...
```

This task is not allowed to claim real macOS or Windows Bluetooth support. It
only creates the tested core boundary.

- [ ] **Step 4: Run tests**

Run:

```bash
cd weisile-link && python -m pytest tests/test_official_ev3_bt_transport.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add weisile-link/weisile_link/transport/official_ev3_bt_transport.py weisile-link/tests/test_official_ev3_bt_transport.py weisile-link/weisile_link/cli.py
git commit -m "feat(bridge): add official EV3 bluetooth transport shell"
git push origin main
```

## Task 5: Native Adapter Packages and Real Hardware Gates

**Files:**
- Create: `desktop/macos/native/README.md`
- Create: `desktop/windows/native/README.md`
- Create: `scripts/run_desktop_install_smoke.py`
- Create: `tests/test_desktop_install_smoke.py`
- Modify: `docs/desktop/MACOS_INSTALL.md`
- Modify: `docs/desktop/WINDOWS_INSTALL.md`
- Modify: `docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md`

- [ ] **Step 1: Add native adapter README files**

Each README must state:

```markdown
This adapter is the only supported path for official LEGO firmware Bluetooth on
this OS. Python stdlib RFCOMM is not supported here. Real EV3 smoke evidence is
required before this adapter can be marked classroom ready.
```

- [ ] **Step 2: Add desktop smoke runner test**

Create `tests/test_desktop_install_smoke.py` to verify the runner refuses to mark
support complete without an evidence JSON containing:

```json
{
  "installed_from_release_artifact": true,
  "started_after_reboot": true,
  "scratch_link_endpoint_ok": true,
  "official_firmware_bt_real_ev3_ok": true
}
```

- [ ] **Step 3: Implement `scripts/run_desktop_install_smoke.py`**

The script must write a Markdown report and exit non-zero when required evidence
is missing. It must not fabricate success from localhost-only developer runs.

- [ ] **Step 4: Run smoke tests**

Run:

```bash
python -m pytest tests/test_desktop_install_smoke.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add desktop/macos/native desktop/windows/native scripts/run_desktop_install_smoke.py tests/test_desktop_install_smoke.py docs/desktop
git commit -m "test(desktop): add install smoke evidence gate"
git push origin main
```

## Task 6: AGENTS and Spec Updates

**Files:**
- Modify: `AGENTS.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Update `AGENTS.md`**

Add rules for desktop distribution:

```markdown
### 8. Desktop installers must be release-reliable

macOS and Windows WeisileLink work must include clean install, upgrade,
auto-start, health check, diagnostics, uninstall, and real hardware evidence
before a desktop release can be marked complete.
```

- [ ] **Step 2: Update the main spec**

Add:

- a Section 14 desktop distribution subsection;
- macOS and Windows compatibility rows;
- official firmware Bluetooth compatibility rows;
- desktop installer gates in Section 13.6/13.8.

- [ ] **Step 3: Commit**

Run:

```bash
git add AGENTS.md VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): add WeisileLink desktop distribution requirements"
git push origin main
```

## Final Verification

Run:

```bash
python -m pytest tests/test_desktop_packaging.py tests/test_desktop_install_smoke.py -v
cd weisile-link && python -m pytest tests/test_desktop_diagnostics.py tests/test_official_ev3_direct_command.py tests/test_official_ev3_bt_transport.py -v
desktop/scripts/validate_desktop_assets.py
git status --short --branch
```

Expected:

- pytest commands pass;
- validator prints `desktop assets ok`;
- `git status --short --branch` shows no uncommitted files from this plan
  except user-owned local runtime artifacts that preexisted the plan.

## Self-Review

- The plan separates full VSLE WiFi mode from official firmware Bluetooth
  compatibility.
- The plan does not mark macOS or Windows Bluetooth support complete without
  native adapters and real EV3 evidence.
- The plan includes install, upgrade, auto-start, health, diagnostics, uninstall,
  and crash recovery surfaces.
- No task writes outside `/Users/yukii/Desktop/EV3SC/`.
- Every task ends with a commit and push, matching project workflow rules.
