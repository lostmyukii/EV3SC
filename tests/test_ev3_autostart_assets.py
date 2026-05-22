import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EV3_DIR = ROOT / "ev3-firmware"
SERVICE = EV3_DIR / "systemd" / "vsle-ev3-server.service"
INSTALL = EV3_DIR / "scripts" / "install_ev3_autostart.sh"
ROLLBACK = EV3_DIR / "scripts" / "rollback_ev3_autostart.sh"
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
    assert (
        "ExecStartPre=/usr/bin/test -r /home/robot/vsle_ev3_server.py" in text
    )
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
    for script in (INSTALL, ROLLBACK):
        assert os.access(script, os.X_OK), f"{script} must be executable"
        subprocess.run(["bash", "-n", str(script)], check=True)


def test_install_script_backs_up_installs_dependencies_and_enables_service():
    text = _read(INSTALL)

    assert "set -euo pipefail" in text
    assert 'SERVICE_NAME="vsle-ev3-server.service"' in text
    assert 'SERVER_DST="${SERVER_DST:-/home/robot/vsle_ev3_server.py}"' in text
    assert (
        'SERVICE_DST="${SERVICE_DST:-/etc/systemd/system/${SERVICE_NAME}}"'
        in text
    )
    assert 'BACKUP_ROOT="${BACKUP_ROOT:-/home/robot/vsle-backups}"' in text
    assert "SERVER_SRC" in text
    assert "vsle_ev3_server.py not found" in text
    assert "websockets ev3dev2" in text
    assert "pybluez" not in text.lower()
    assert "token_urlsafe" in text
    assert "WEISILE_PAIRING_TOKEN=" in text
    assert "chmod 600" in text
    assert "systemctl daemon-reload" in text
    assert "systemctl enable --now ${SERVICE_NAME}" in text
    assert "systemctl status --no-pager ${SERVICE_NAME}" in text


def test_rollback_script_restores_latest_backup_and_restarts_service():
    text = _read(ROLLBACK)

    assert "set -euo pipefail" in text
    assert "latest_backup" in text
    assert "vsle_ev3_server.py" in text
    assert "vsle-ev3-server.service" in text
    assert "systemctl daemon-reload" in text
    assert "systemctl enable --now ${SERVICE_NAME}" in text
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
