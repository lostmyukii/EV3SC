#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="vsle-ev3-server.service"
FIRSTBOOT_SERVICE_NAME="vsle-firstboot.service"
SERVER_DST="${SERVER_DST:-/home/robot/vsle_ev3_server.py}"
SERVICE_DST="${SERVICE_DST:-/etc/systemd/system/${SERVICE_NAME}}"
TOOLS_DIR="${TOOLS_DIR:-/home/robot/vsle-tools}"
FIRSTBOOT_DST="${FIRSTBOOT_DST:-${TOOLS_DIR}/vsle_firstboot.py}"
FIRSTBOOT_SERVICE_DST="${FIRSTBOOT_SERVICE_DST:-/etc/systemd/system/${FIRSTBOOT_SERVICE_NAME}}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/robot/vsle-backups}"

sudo_cmd=(sudo)
if [ "$(id -u)" -eq 0 ]; then
  sudo_cmd=()
fi

latest_backup="$(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1)"
if [ -z "${latest_backup}" ]; then
  echo "No VSLE EV3 backup found under ${BACKUP_ROOT}" >&2
  exit 1
fi

if [ -r "${latest_backup}/vsle_ev3_server.py" ]; then
  install -m 0755 "${latest_backup}/vsle_ev3_server.py" "${SERVER_DST}"
fi

if [ -r "${latest_backup}/vsle_firstboot.py" ]; then
  install -d -m 0755 "${TOOLS_DIR}"
  install -m 0755 "${latest_backup}/vsle_firstboot.py" "${FIRSTBOOT_DST}"
fi

if [ -r "${latest_backup}/${SERVICE_NAME}" ]; then
  "${sudo_cmd[@]}" install -D -m 0644 "${latest_backup}/${SERVICE_NAME}" "${SERVICE_DST}"
  "${sudo_cmd[@]}" systemctl daemon-reload
  "${sudo_cmd[@]}" systemctl enable --now ${SERVICE_NAME}
else
  "${sudo_cmd[@]}" systemctl disable --now ${SERVICE_NAME} || true
  "${sudo_cmd[@]}" rm -f "${SERVICE_DST}"
  "${sudo_cmd[@]}" systemctl daemon-reload
fi

if [ -r "${latest_backup}/${FIRSTBOOT_SERVICE_NAME}" ]; then
  "${sudo_cmd[@]}" install -D -m 0644 "${latest_backup}/${FIRSTBOOT_SERVICE_NAME}" "${FIRSTBOOT_SERVICE_DST}"
  "${sudo_cmd[@]}" systemctl daemon-reload
  "${sudo_cmd[@]}" systemctl enable ${FIRSTBOOT_SERVICE_NAME}
else
  "${sudo_cmd[@]}" systemctl disable --now ${FIRSTBOOT_SERVICE_NAME} || true
  "${sudo_cmd[@]}" rm -f "${FIRSTBOOT_SERVICE_DST}"
  "${sudo_cmd[@]}" systemctl daemon-reload
fi

echo "VSLE EV3 autostart rollback applied from ${latest_backup}."
