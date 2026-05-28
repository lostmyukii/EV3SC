#!/usr/bin/env python3
"""Generate VSLE Bluetooth command coverage from EV3SC-owned sources."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Dict, Iterable, Iterator, List, Set


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = Path("vsle-ev3-extension/index.js")
VALIDATION = Path("weisile-link/weisile_link/protocol/validation.py")
JSON_RPC = Path("weisile-link/weisile_link/json_rpc_server.py")
EV3_SERVER = Path("ev3-firmware/vsle_ev3_server.py")
REPORT = Path("docs/desktop/VSLE_BLUETOOTH_COMMAND_COVERAGE.md")

METHOD_PATTERN = re.compile(
    r"['\"]((?:motor|sound|display|gyro|system|data|aiquest)\."
    r"[A-Za-z0-9_]+)['\"]"
)

OFFICIAL_NATIVE_METHODS = {
    "motor.stop",
    "motor.stopAll",
    "system.stopAll",
}

HOST_SIDE_METHODS = {
    "data.uploadToTrainer",
}

MODULE_NAMES = {
    "motor": "Motor",
    "sensor": "Sensor",
    "sound": "Sound",
    "display": "Display",
    "system": "System",
    "data": "Data",
    "aiQuest": "AI Quest",
}

BLOCK_TYPE_NAMES = {
    "command": "command",
    "reporter": "reporter",
    "bool": "boolean",
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
    """Return coverage rows for every current VSLE-EV3 Scratch block."""

    extension_text = _read(root, EXTENSION)
    validators = _extract_validators(_read(root, VALIDATION))
    host_handlers = _extract_host_handlers(_read(root, JSON_RPC))
    ev3_methods = _extract_ev3_methods(_read(root, EV3_SERVER))

    rows: List[CoverageRow] = []
    for block in _iter_blocks(extension_text):
        body = _method_body(extension_text, block["opcode"])
        method = _method_for_block(block, body)
        full_status = _full_status(
            block=block,
            method=method,
            validators=validators,
            host_handlers=host_handlers,
            ev3_methods=ev3_methods,
        )
        rows.append(
            CoverageRow(
                module=block["module"],
                opcode=block["opcode"],
                block_type=block["block_type"],
                method=method,
                full_vsle_bluetooth_status=full_status,
                official_firmware_status=_official_status(method, full_status),
                source=str(EXTENSION),
            )
        )

    return sorted(rows, key=lambda row: (row.module, row.opcode))


def render_markdown(rows: Iterable[CoverageRow]) -> str:
    """Render deterministic Markdown for the checked-in coverage report."""

    lines = [
        "# VSLE Bluetooth Full Module Command Coverage",
        "",
        "Generated from `vsle-ev3-extension/index.js`, "
        "`weisile-link/weisile_link/protocol/validation.py`, "
        "`weisile-link/weisile_link/json_rpc_server.py`, and "
        "`ev3-firmware/vsle_ev3_server.py`.",
        "",
        "Full VSLE Bluetooth means the ev3dev JSON-line Bluetooth path. "
        "Official firmware Bluetooth remains a separate limited "
        "compatibility mode.",
        "",
        "| Module | Opcode | Block type | Method | Full VSLE Bluetooth | "
        "Official firmware compatibility |",
        "|---|---|---|---|---|---|",
    ]
    for row in rows:
        lines.append(
            f"| {row.module} | `{row.opcode}` | {row.block_type} | "
            f"`{row.method}` | {row.full_vsle_bluetooth_status} | "
            f"{row.official_firmware_status} |"
        )
    lines.append("")
    lines.extend(
        [
            "## Status Legend",
            "",
            "- `ev3-dispatched`: validated by WeisileLink and handled by the "
            "EV3 ev3dev server over the full VSLE transport.",
            "- `cache-backed`: synchronous Scratch reporter or Boolean block "
            "reads from `SensorCache`; the transport owns sensor polling.",
            "- `host-side`: handled inside WeisileLink or local extension "
            "state without an EV3 hardware command.",
            "- `native`: available in the current official-firmware native "
            "adapter compatibility surface.",
            "- `compatibility-cache`: official firmware compatibility can "
            "serve the block only when its polling loop has populated "
            "`SensorCache`.",
            "- `compatibility-unavailable`: intentionally not claimed for "
            "official firmware Bluetooth compatibility.",
            "",
        ]
    )
    return "\n".join(lines)


def _read(root: Path, path: Path) -> str:
    return (root / path).read_text(encoding="utf-8")


def _iter_blocks(extension_text: str) -> Iterator[Dict[str, str]]:
    sections = list(
        re.finditer(r"\n        _([A-Za-z]+)Blocks \(\) \{", extension_text)
    )
    for index, section in enumerate(sections):
        module_key = section.group(1)
        start = section.end()
        end = (
            sections[index + 1].start()
            if index + 1 < len(sections)
            else extension_text.find("\n    const register", start)
        )
        if end == -1:
            end = len(extension_text)
        section_text = extension_text[start:end]
        for match in re.finditer(
            r"opcode:\s*'([^']+)'.{0,500}?blockType:\s*"
            r"(command|reporter|bool)",
            section_text,
            re.DOTALL,
        ):
            yield {
                "module": MODULE_NAMES.get(module_key, module_key),
                "opcode": match.group(1),
                "block_type": BLOCK_TYPE_NAMES[match.group(2)],
            }


def _method_body(extension_text: str, opcode: str) -> str:
    pattern = re.compile(
        rf"\n        (?:async\s+)?{re.escape(opcode)}\s*\([^)]*\)\s*\{{"
    )
    match = pattern.search(extension_text)
    if not match:
        return ""
    next_method = re.search(
        r"\n        (?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(",
        extension_text[match.end() :],
    )
    if not next_method:
        return extension_text[match.end() :]
    return extension_text[match.end() : match.end() + next_method.start()]


def _method_for_block(block: Dict[str, str], body: str) -> str:
    opcode = block["opcode"]
    if opcode.startswith(("getAIQuest", "isAIQuest")):
        return "aiquest-state"
    if block["block_type"] in {"reporter", "boolean"} and block["module"] in {
        "Motor",
        "Sensor",
        "System",
        "Data",
    }:
        return "sensor-cache"
    if "_waitForCache" in body:
        return "sensor-cache.wait"
    if "sensorCache.get" in body or "_cache" in body:
        return "sensor-cache"

    method = METHOD_PATTERN.search(body)
    if method:
        return method.group(1)

    if opcode == "waitMilliseconds":
        return "host.wait"
    return "host-side"


def _full_status(
    *,
    block: Dict[str, str],
    method: str,
    validators: Set[str],
    host_handlers: Set[str],
    ev3_methods: Set[str],
) -> str:
    if method in {"sensor-cache", "sensor-cache.wait"}:
        return "cache-backed"
    if method in {"host.wait", "host-side", "aiquest-state"}:
        return "host-side"
    if method in HOST_SIDE_METHODS or method in host_handlers:
        return "host-side"
    if method in validators and method in ev3_methods:
        return "ev3-dispatched"
    if block["block_type"] in {"reporter", "boolean"}:
        return "cache-backed"
    return "unknown"


def _official_status(method: str, full_status: str) -> str:
    if method in OFFICIAL_NATIVE_METHODS:
        return "native"
    if full_status == "cache-backed":
        return "compatibility-cache"
    if full_status == "host-side":
        return "host-side"
    return "compatibility-unavailable"


def _extract_validators(validation_text: str) -> Set[str]:
    return set(
        re.findall(
            r"^\s*[\"']([A-Za-z0-9_.]+)[\"']\s*:",
            validation_text,
            re.MULTILINE,
        )
    )


def _extract_host_handlers(json_rpc_text: str) -> Set[str]:
    handlers = set(
        re.findall(r"[\"'](aiquest\.[A-Za-z0-9_]+)[\"']", json_rpc_text)
    )
    handlers.update(HOST_SIDE_METHODS)
    return handlers


def _extract_ev3_methods(ev3_server_text: str) -> Set[str]:
    return set(METHOD_PATTERN.findall(ev3_server_text))


def main() -> None:
    rows = generate_coverage_rows(ROOT)
    output = ROOT / REPORT
    output.write_text(render_markdown(rows), encoding="utf-8")
    print(REPORT)


if __name__ == "__main__":
    main()
