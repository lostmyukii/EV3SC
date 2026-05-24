#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="vsle-ev3-server.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SERVER_SRC="${SERVER_SRC:-${FIRMWARE_DIR}/vsle_ev3_server.py}"
SERVER_DST="${SERVER_DST:-/home/robot/vsle_ev3_server.py}"
SERVICE_SRC="${SERVICE_SRC:-${FIRMWARE_DIR}/systemd/${SERVICE_NAME}}"
SERVICE_DST="${SERVICE_DST:-/etc/systemd/system/${SERVICE_NAME}}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/robot/vsle-backups}"
CONFIG_DIR="${CONFIG_DIR:-/home/robot/.config/vsle}"
ENV_FILE="${ENV_FILE:-${CONFIG_DIR}/ev3.env}"
SKIP_PIP_INSTALL="${SKIP_PIP_INSTALL:-0}"

sudo_cmd=(sudo)
if [ "$(id -u)" -eq 0 ]; then
  sudo_cmd=()
fi

require_file() {
  local path="$1"
  local label="$2"
  if [ ! -r "${path}" ]; then
    echo "${label} not found: ${path}" >&2
    exit 1
  fi
}

backup_if_present() {
  local path="$1"
  local backup_dir="$2"
  if [ -e "${path}" ]; then
    mkdir -p "${backup_dir}"
    cp -a "${path}" "${backup_dir}/"
  fi
}

write_env_file_if_missing() {
  if [ -e "${ENV_FILE}" ]; then
    chmod 600 "${ENV_FILE}"
    return
  fi

  mkdir -p "${CONFIG_DIR}"
  umask 077
  local token
  token="$(
    python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode("ascii").rstrip("="))'
  )"
  {
    echo "WEISILE_PAIRING_TOKEN=${token}"
    echo "EV3_WS_PORT=8765"
    echo "MAX_COLLECTED_POINTS=10000"
    echo "LOG_LEVEL=INFO"
  } >"${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

if [ ! -r "${SERVER_SRC}" ]; then
  echo "vsle_ev3_server.py not found: ${SERVER_SRC}" >&2
  exit 1
fi
require_file "${SERVICE_SRC}" "${SERVICE_NAME}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_ROOT}/${timestamp}"
backup_if_present "${SERVER_DST}" "${backup_dir}"
backup_if_present "${SERVICE_DST}" "${backup_dir}"

write_env_file_if_missing

if [ "${SKIP_PIP_INSTALL}" != "1" ]; then
  python3 -m pip install --user --upgrade websockets ev3dev2
fi

install -m 0755 "${SERVER_SRC}" "${SERVER_DST}"
"${sudo_cmd[@]}" install -D -m 0644 "${SERVICE_SRC}" "${SERVICE_DST}"
"${sudo_cmd[@]}" systemctl daemon-reload
"${sudo_cmd[@]}" systemctl enable --now ${SERVICE_NAME}
"${sudo_cmd[@]}" systemctl status --no-pager ${SERVICE_NAME}

echo "VSLE EV3 autostart installed."
echo "Service: ${SERVICE_NAME}"
echo "Server: ${SERVER_DST}"
echo "Backup: ${backup_dir}"
