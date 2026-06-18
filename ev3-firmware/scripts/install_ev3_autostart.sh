#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="vsle-ev3-server.service"
FIRSTBOOT_SERVICE_NAME="vsle-firstboot.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SERVER_SRC="${SERVER_SRC:-${FIRMWARE_DIR}/vsle_ev3_server.py}"
SERVER_DST="${SERVER_DST:-/home/robot/vsle_ev3_server.py}"
SERVICE_SRC="${SERVICE_SRC:-${FIRMWARE_DIR}/systemd/${SERVICE_NAME}}"
SERVICE_DST="${SERVICE_DST:-/etc/systemd/system/${SERVICE_NAME}}"
FIRSTBOOT_SERVICE_SRC="${FIRSTBOOT_SERVICE_SRC:-${FIRMWARE_DIR}/systemd/${FIRSTBOOT_SERVICE_NAME}}"
FIRSTBOOT_SERVICE_DST="${FIRSTBOOT_SERVICE_DST:-/etc/systemd/system/${FIRSTBOOT_SERVICE_NAME}}"
FIRSTBOOT_SRC="${FIRSTBOOT_SRC:-${FIRMWARE_DIR}/scripts/vsle_firstboot.py}"
TOOLS_DIR="${TOOLS_DIR:-/home/robot/vsle-tools}"
FIRSTBOOT_DST="${FIRSTBOOT_DST:-${TOOLS_DIR}/vsle_firstboot.py}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/robot/vsle-backups}"
CONFIG_DIR="${CONFIG_DIR:-/home/robot/.config/vsle}"
ENV_FILE="${ENV_FILE:-${CONFIG_DIR}/ev3.env}"
DEVICE_FILE="${DEVICE_FILE:-${CONFIG_DIR}/device.json}"
MANIFEST_FILE="${MANIFEST_FILE:-${CONFIG_DIR}/manifest.json}"
SKIP_PIP_INSTALL="${SKIP_PIP_INSTALL:-0}"
GOLDEN_IMAGE_MODE="${VSLE_GOLDEN_IMAGE_MODE:-0}"
EV3_ENABLE_BLUETOOTH="${VSLE_EV3_ENABLE_BLUETOOTH:-0}"
EV3_BT_ADDRESS="${VSLE_EV3_BT_ADDRESS:-}"
EV3_BT_RFCOMM_CHANNEL="${VSLE_EV3_BT_RFCOMM_CHANNEL:-1}"

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

ensure_env_key() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  if grep -q "^${key}=" "${ENV_FILE}"; then
    awk -v key="${key}" -v value="${value}" '
      BEGIN { prefix = key "=" }
      index($0, prefix) == 1 { $0 = key "=" value }
      { print }
    ' "${ENV_FILE}" >"${tmp_file}"
    cat "${tmp_file}" >"${ENV_FILE}"
  else
    echo "${key}=${value}" >>"${ENV_FILE}"
  fi
  rm -f "${tmp_file}"
}

write_env_file() {
  mkdir -p "${CONFIG_DIR}"
  umask 077
  if [ ! -e "${ENV_FILE}" ]; then
    local token
    token="$(
      python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode("ascii").rstrip("="))'
    )"
    {
      echo "WEISILE_PAIRING_TOKEN=${token}"
    } >"${ENV_FILE}"
  fi
  ensure_env_key "EV3_WS_PORT" "8765"
  ensure_env_key "MAX_COLLECTED_POINTS" "10000"
  ensure_env_key "LOG_LEVEL" "INFO"
  ensure_env_key "EV3_ENABLE_BLUETOOTH" "${EV3_ENABLE_BLUETOOTH}"
  ensure_env_key "EV3_BT_ADDRESS" "${EV3_BT_ADDRESS}"
  ensure_env_key "EV3_BT_RFCOMM_CHANNEL" "${EV3_BT_RFCOMM_CHANNEL}"
  chmod 600 "${ENV_FILE}"
}

if [ ! -r "${SERVER_SRC}" ]; then
  echo "vsle_ev3_server.py not found: ${SERVER_SRC}" >&2
  exit 1
fi
require_file "${SERVICE_SRC}" "${SERVICE_NAME}"
require_file "${FIRSTBOOT_SERVICE_SRC}" "${FIRSTBOOT_SERVICE_NAME}"
require_file "${FIRSTBOOT_SRC}" "vsle_firstboot.py"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_ROOT}/${timestamp}"
backup_if_present "${SERVER_DST}" "${backup_dir}"
backup_if_present "${SERVICE_DST}" "${backup_dir}"
backup_if_present "${FIRSTBOOT_SERVICE_DST}" "${backup_dir}"
backup_if_present "${FIRSTBOOT_DST}" "${backup_dir}"

if [ "${GOLDEN_IMAGE_MODE}" != "1" ]; then
  write_env_file
else
  mkdir -p "${CONFIG_DIR}"
  rm -f "${ENV_FILE}" "${DEVICE_FILE}" "${MANIFEST_FILE}"
fi

if [ "${SKIP_PIP_INSTALL}" != "1" ]; then
  python3 -m pip install --user --upgrade websockets ev3dev2
fi

install -m 0755 "${SERVER_SRC}" "${SERVER_DST}"
install -d -m 0755 "${TOOLS_DIR}"
install -m 0755 "${FIRSTBOOT_SRC}" "${FIRSTBOOT_DST}"
"${sudo_cmd[@]}" install -D -m 0644 "${SERVICE_SRC}" "${SERVICE_DST}"
"${sudo_cmd[@]}" install -D -m 0644 "${FIRSTBOOT_SERVICE_SRC}" "${FIRSTBOOT_SERVICE_DST}"
"${sudo_cmd[@]}" systemctl daemon-reload
if [ "${GOLDEN_IMAGE_MODE}" = "1" ]; then
  "${sudo_cmd[@]}" systemctl enable ${FIRSTBOOT_SERVICE_NAME} ${SERVICE_NAME}
else
  "${sudo_cmd[@]}" systemctl enable --now ${FIRSTBOOT_SERVICE_NAME}
  "${sudo_cmd[@]}" systemctl enable --now ${SERVICE_NAME}
fi

echo "VSLE EV3 autostart installed."
echo "Service: ${SERVICE_NAME}"
echo "First boot service: ${FIRSTBOOT_SERVICE_NAME}"
echo "Server: ${SERVER_DST}"
echo "First boot tool: ${FIRSTBOOT_DST}"
echo "Backup: ${backup_dir}"
if [ "${GOLDEN_IMAGE_MODE}" = "1" ]; then
  echo "Golden image mode: identity files removed; first EV3 boot will provision them."
fi
