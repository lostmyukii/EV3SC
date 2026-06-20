#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="vsle-ev3-server.service"
FIRSTBOOT_SERVICE_NAME="vsle-firstboot.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${FIRMWARE_DIR}"

run_vsle_timed_step() {
  local step_name="$1"
  local step_timeout="$2"
  shift 2
  echo "VSLE_REMOTE_STEP_START: ${step_name}"
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout "${step_timeout}" "$@"
  else
    echo "VSLE_REMOTE_STEP_TIMEOUT_UNAVAILABLE: ${step_name}"
    "$@"
  fi
  local step_exit=$?
  set -e
  if [ "${step_exit}" -ne 0 ]; then
    echo "VSLE_REMOTE_STEP_FAILED: ${step_name} exit=${step_exit}" >&2
    return "${step_exit}"
  fi
  echo "VSLE_REMOTE_STEP_DONE: ${step_name}"
}

run_vsle_shell_step() {
  local step_name="$1"
  local step_timeout="$2"
  local step_script="$3"
  run_vsle_timed_step "${step_name}" "${step_timeout}" bash -lc "${step_script}"
}

collect_vsle_service_logs() {
  echo "VSLE_REMOTE_DIAGNOSTICS: ${FIRSTBOOT_SERVICE_NAME}"
  systemctl status "${FIRSTBOOT_SERVICE_NAME}" --no-pager -l || true
  journalctl -u "${FIRSTBOOT_SERVICE_NAME}" -n 80 --no-pager || true
  echo "VSLE_REMOTE_DIAGNOSTICS: ${SERVICE_NAME}"
  systemctl status "${SERVICE_NAME}" --no-pager -l || true
  journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
}

read_vsle_sudo_password() {
  echo "Enter the EV3 robot password once for remote sudo."
  echo "The input is visible so you can verify it. Do not share screenshots while typing."
  printf "EV3 robot password (press Enter to use maker): "
  IFS= read -r VSLE_SUDO_PASSWORD
  if [ -z "${VSLE_SUDO_PASSWORD}" ]; then
    VSLE_SUDO_PASSWORD="maker"
  fi
}

validate_vsle_sudo() {
  echo "VSLE_REMOTE_STEP_START: validate-sudo"
  set +e
  printf '%s\n' "${VSLE_SUDO_PASSWORD}" |
    sudo -S -p "[sudo] password for robot: " -v
  local sudo_exit=$?
  set -e
  unset VSLE_SUDO_PASSWORD
  if [ "${sudo_exit}" -ne 0 ]; then
    echo "VSLE_REMOTE_STEP_FAILED: validate-sudo exit=${sudo_exit}" >&2
    return "${sudo_exit}"
  fi
  echo "VSLE_REMOTE_STEP_DONE: validate-sudo"
}

write_vsle_install_manifest() {
  echo "VSLE_REMOTE_STEP_START: write-install-manifest"
  if [ -z "${VSLE_INSTALL_PACKAGE_HASH:-}" ]; then
    echo "VSLE_REMOTE_INSTALL_MANIFEST_HASH_MISSING"
  else
    {
      printf 'package_hash=%s\n' "${VSLE_INSTALL_PACKAGE_HASH}"
      date -u '+installed_at=%Y-%m-%dT%H:%M:%SZ'
    } > .vsle-install-manifest
  fi
  echo "VSLE_REMOTE_STEP_DONE: write-install-manifest"
}

read_vsle_sudo_password

run_vsle_shell_step unpack-offline-websockets 120s \
  'SITE="$(python3 -c '"'"'import site; print(site.USER_SITE)'"'"')" && mkdir -p "$SITE" && rm -rf /tmp/websockets-7.0 && tar -xzf websockets-7.0.tar.gz -C /tmp && rm -rf "$SITE/websockets" && cp -r /tmp/websockets-7.0/src/websockets "$SITE/websockets"'

run_vsle_timed_step compile-server 60s \
  python3 -m py_compile vsle_ev3_server.py

validate_vsle_sudo

if ! run_vsle_shell_step install-systemd-assets 360s \
  'SKIP_PIP_INSTALL=1 bash ./scripts/install.sh'; then
  collect_vsle_service_logs
  exit 1
fi

run_vsle_shell_step inspect-vsle-firstboot 45s \
  'systemctl status vsle-firstboot.service --no-pager -l || true'

if ! run_vsle_shell_step check-vsle-ev3-server 60s \
  'systemctl is-active vsle-ev3-server.service'; then
  collect_vsle_service_logs
  exit 1
fi

write_vsle_install_manifest
