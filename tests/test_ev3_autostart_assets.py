import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EV3_DIR = ROOT / "ev3-firmware"
SERVICE = EV3_DIR / "systemd" / "vsle-ev3-server.service"
FIRSTBOOT_SERVICE = EV3_DIR / "systemd" / "vsle-firstboot.service"
INSTALL_ENTRY = EV3_DIR / "scripts" / "install.sh"
INSTALL = EV3_DIR / "scripts" / "install_ev3_autostart.sh"
ROLLBACK = EV3_DIR / "scripts" / "rollback_ev3_autostart.sh"
FIRSTBOOT = EV3_DIR / "scripts" / "vsle_firstboot.py"
SETUP_DOC = ROOT / "docs" / "EV3DEV_SETUP.md"
README = EV3_DIR / "README.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_systemd_unit_matches_ev3_autostart_contract():
    text = _read(SERVICE)

    assert "[Unit]" in text
    assert "Wants=network-online.target" in text
    assert "After=network-online.target" in text
    assert "[Service]" in text
    assert "Type=simple" in text
    assert "User=robot" in text
    assert "Group=robot" in text
    assert "WorkingDirectory=/home/robot" in text
    assert "EnvironmentFile=-/home/robot/.config/vsle/ev3.env" in text
    assert "Environment=EV3_WS_PORT=8765" in text
    assert "Environment=MAX_COLLECTED_POINTS=10000" in text
    assert "ExecStartPre=/usr/bin/test -r /home/robot/vsle_ev3_server.py" in text
    assert text.count("ExecStart=") == 1
    assert "ExecStart=/usr/bin/python3 /home/robot/vsle_ev3_server.py" in text
    assert "Restart=on-failure" in text
    assert "RestartSec=5" in text
    assert "KillSignal=SIGTERM" in text
    assert "TimeoutStopSec=5" in text
    assert "[Install]" in text
    assert "WantedBy=multi-user.target" in text
    assert "pybluez" not in text.lower()


def test_install_and_rollback_scripts_are_executable_and_valid_bash():
    for script in (INSTALL_ENTRY, INSTALL, ROLLBACK):
        assert os.access(script, os.X_OK), f"{script} must be executable"
        subprocess.run(["bash", "-n", str(script)], check=True)


def test_install_entry_runs_autostart_installer_through_bash():
    text = _read(INSTALL_ENTRY)

    assert 'exec bash "${SCRIPT_DIR}/install_ev3_autostart.sh" "$@"' in text
    assert 'exec "${SCRIPT_DIR}/install_ev3_autostart.sh" "$@"' not in text


def test_firstboot_script_is_executable_and_generates_private_identity(tmp_path):
    config_dir = tmp_path / "vsle"
    env_file = config_dir / "ev3.env"
    device_file = config_dir / "device.json"
    manifest_file = config_dir / "manifest.json"
    machine_id_file = tmp_path / "machine-id"
    bluetooth_file = tmp_path / "hci0-address"
    machine_id_file.write_text("abc123-machine\n", encoding="utf-8")
    bluetooth_file.write_text("A0:E6:F8:19:58:3C\n", encoding="utf-8")

    assert os.access(FIRSTBOOT, os.X_OK), "vsle_firstboot.py must be executable"
    subprocess.run(
        [
            sys.executable,
            str(FIRSTBOOT),
            "provision",
            "--config-dir",
            str(config_dir),
            "--env-file",
            str(env_file),
            "--device-file",
            str(device_file),
            "--manifest-file",
            str(manifest_file),
            "--machine-id-file",
            str(machine_id_file),
            "--bluetooth-address-file",
            str(bluetooth_file),
        ],
        check=True,
    )

    env_text = env_file.read_text(encoding="utf-8")
    device = json.loads(device_file.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))

    assert "WEISILE_PAIRING_TOKEN=" in env_text
    assert "VSLE_CLAIM_CODE=" in env_text
    assert "VSLE_BRICK_ID=VSLE-EV3-583C" in env_text
    assert "EV3_ENABLE_BLUETOOTH=1" in env_text
    assert "EV3_BT_ADDRESS=A0:E6:F8:19:58:3C" in env_text
    assert oct(env_file.stat().st_mode & 0o777) == "0o600"
    assert device["brick_id"] == "VSLE-EV3-583C"
    assert device["transport"] == "vsle-bluetooth"
    assert device["bluetooth"]["rfcomm_channel"] == 1
    assert device["claim"]["required"] is True
    assert "pairing_token" not in json.dumps(device).lower()
    assert "WEISILE_PAIRING_TOKEN" not in json.dumps(device)
    assert manifest["provisioning"] == "firstboot"


def test_firstboot_script_is_idempotent_without_force(tmp_path):
    config_dir = tmp_path / "vsle"
    env_file = config_dir / "ev3.env"
    device_file = config_dir / "device.json"
    manifest_file = config_dir / "manifest.json"

    command = [
        sys.executable,
        str(FIRSTBOOT),
        "provision",
        "--config-dir",
        str(config_dir),
        "--env-file",
        str(env_file),
        "--device-file",
        str(device_file),
        "--manifest-file",
        str(manifest_file),
        "--bluetooth-address",
        "A0:E6:F8:19:58:3C",
    ]
    subprocess.run(command, check=True)
    first_env = env_file.read_text(encoding="utf-8")
    first_device = device_file.read_text(encoding="utf-8")
    subprocess.run(command, check=True)

    assert env_file.read_text(encoding="utf-8") == first_env
    assert device_file.read_text(encoding="utf-8") == first_device


def test_firstboot_script_avoids_ev3_python_signature_syntax():
    text = _read(FIRSTBOOT)

    assert "->" not in text
    for line in text.splitlines():
        stripped = line.strip()
        assert stripped != "*,"
        if stripped.startswith("def "):
            signature = stripped.split(":", 1)[0]
            assert ": " not in signature


def test_firstboot_systemd_unit_runs_before_ev3_server_and_displays_code():
    text = _read(FIRSTBOOT_SERVICE)

    assert "Description=VSLE EV3 first-boot provisioning" in text
    assert "Before=vsle-ev3-server.service" in text
    assert "ConditionPathExists=!/home/robot/.config/vsle/manifest.json" in text
    assert "Type=oneshot" in text
    assert "User=root" in text
    assert (
        "ExecStartPre=/usr/bin/test -x /home/robot/vsle-tools/vsle_firstboot.py" in text
    )
    assert (
        "ExecStart=/usr/bin/python3 /home/robot/vsle-tools/vsle_firstboot.py provision --display"
        in text
    )
    assert "WantedBy=multi-user.target" in text


def test_install_script_backs_up_installs_dependencies_and_enables_service():
    text = _read(INSTALL)

    assert "set -euo pipefail" in text
    assert 'SERVICE_NAME="vsle-ev3-server.service"' in text
    assert 'SERVER_DST="${SERVER_DST:-/home/robot/vsle_ev3_server.py}"' in text
    assert 'SERVICE_DST="${SERVICE_DST:-/etc/systemd/system/${SERVICE_NAME}}"' in text
    assert 'BACKUP_ROOT="${BACKUP_ROOT:-/home/robot/vsle-backups}"' in text
    assert "SERVER_SRC" in text
    assert "vsle_ev3_server.py not found" in text
    assert "websockets ev3dev2" in text
    assert "pybluez" not in text.lower()
    assert "os.urandom(32)" in text
    assert "urlsafe_b64encode" in text
    assert "import secrets" not in text
    assert "WEISILE_PAIRING_TOKEN=" in text
    assert "chmod 600" in text
    assert "systemctl daemon-reload" in text
    assert "systemctl enable --now ${SERVICE_NAME}" in text
    assert "systemctl status --no-pager ${SERVICE_NAME}" in text
    assert 'FIRSTBOOT_SERVICE_NAME="vsle-firstboot.service"' in text
    assert "vsle_firstboot.py" in text
    assert "systemctl enable --now ${FIRSTBOOT_SERVICE_NAME}" in text


def test_install_script_supports_unprovisioned_golden_image_mode():
    text = _read(INSTALL)
    readme = _read(README)

    assert 'GOLDEN_IMAGE_MODE="${VSLE_GOLDEN_IMAGE_MODE:-0}"' in text
    assert 'rm -f "${ENV_FILE}" "${DEVICE_FILE}" "${MANIFEST_FILE}"' in text
    assert "systemctl enable ${FIRSTBOOT_SERVICE_NAME} ${SERVICE_NAME}" in text
    assert "Golden image mode: identity files removed" in text
    assert "VSLE_GOLDEN_IMAGE_MODE=1" in readme
    assert "first EV3 boot will provision" in readme
    assert "`brick_id`, claim code, and `WEISILE_PAIRING_TOKEN`" in readme


def test_ev3_systemd_documents_bluetooth_disabled_by_default():
    text = _read(SERVICE)

    assert "Environment=EV3_ENABLE_BLUETOOTH=0" in text
    assert "Environment=EV3_BT_ADDRESS=" in text
    assert "Environment=EV3_BT_RFCOMM_CHANNEL=1" in text


def test_ev3_systemd_env_file_overrides_default_bluetooth_values():
    lines = _read(SERVICE).splitlines()
    env_file_index = lines.index("EnvironmentFile=-/home/robot/.config/vsle/ev3.env")
    default_env_indexes = [
        index for index, line in enumerate(lines) if line.startswith("Environment=")
    ]

    assert default_env_indexes
    assert max(default_env_indexes) < env_file_index


def test_install_script_can_enable_full_vsle_bluetooth_env():
    entry = _read(INSTALL_ENTRY)
    text = _read(INSTALL)

    assert "install_ev3_autostart.sh" in entry
    assert 'EV3_ENABLE_BLUETOOTH="${VSLE_EV3_ENABLE_BLUETOOTH:-0}"' in text
    assert 'EV3_BT_ADDRESS="${VSLE_EV3_BT_ADDRESS:-}"' in text
    assert 'EV3_BT_RFCOMM_CHANNEL="${VSLE_EV3_BT_RFCOMM_CHANNEL:-1}"' in text
    assert "EV3_ENABLE_BLUETOOTH" in text
    assert "VSLE_EV3_ENABLE_BLUETOOTH" in text
    assert "EV3_BT_RFCOMM_CHANNEL" in text


def test_rollback_script_restores_latest_backup_and_restarts_service():
    text = _read(ROLLBACK)

    assert "set -euo pipefail" in text
    assert "latest_backup" in text
    assert "vsle_ev3_server.py" in text
    assert "vsle-ev3-server.service" in text
    assert "vsle_firstboot.py" in text
    assert "vsle-firstboot.service" in text
    assert "systemctl daemon-reload" in text
    assert "systemctl enable --now ${SERVICE_NAME}" in text
    assert "systemctl enable ${FIRSTBOOT_SERVICE_NAME}" in text
    assert "systemctl disable --now ${SERVICE_NAME}" in text


def test_ev3_setup_docs_cover_official_flow_install_verify_and_rollback():
    setup = _read(SETUP_DOC)
    readme = _read(README)
    combined = setup + "\n" + readme

    assert "https://www.ev3dev.org/docs/getting-started/" in setup
    assert "https://www.ev3dev.org/downloads/" in setup
    assert "https://manpages.debian.org/man/systemd.service" in setup
    assert "microSD" in setup
    assert "2GB" in setup
    assert "32GB" in setup
    assert "EV3DEV_BOOT" in setup
    assert "ssh robot@ev3dev.local" in setup
    assert "default password: maker" in setup
    assert "install_ev3_autostart.sh" in combined
    assert "rollback_ev3_autostart.sh" in combined
    assert "systemctl status vsle-ev3-server" in setup
    assert "journalctl -u vsle-ev3-server" in setup
    assert "WEISILE_PAIRING_TOKEN" in setup


def test_ev3_setup_docs_cover_full_vsle_bluetooth_mode():
    setup = _read(SETUP_DOC)
    readme = _read(README)
    combined = setup + "\n" + readme

    assert "## Full VSLE Bluetooth" in combined
    assert "requires ev3dev and `vsle_ev3_server.py`" in combined
    assert "not official firmware compatibility mode" in combined
    assert "VSLE_EV3_ENABLE_BLUETOOTH=1" in combined
    assert "VSLE_EV3_BT_ADDRESS" in combined
    assert "VSLE_EV3_BT_RFCOMM_CHANNEL=1" in combined
    assert "bash ./ev3-firmware/scripts/install.sh" in combined
    assert "hciconfig hci0 up" in combined
    assert "Powered: yes" in combined
    assert "vsle-bluetooth" in combined
    assert "official-bluetooth" in combined
    assert "AI Quest" in combined
    assert "50Hz raw streaming" in combined
