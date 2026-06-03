# Internal Test Release Evidence

Target: all
Internal status: partial
Internal ready: yes

## Internal Test Release

- Goal: runnable internal testing build.
- macOS signing: Internal Test Optional
- macOS notarization: Internal Test Optional
- Windows signing: Internal Test Optional
- Windows timestamp URL: Internal Test Optional

## Internal Test Required Checks

- macOS dev/unsigned build can generate: pass
- Application startup: verify with the command below.
- Core function verification: verify with the commands below.
- Build commands are reproducible: yes

## Production Release

- Goal: external/customer distribution.
- macos_developer_id: Production Release Blocker
- macos_notarization: Production Release Blocker
- windows_code_signing_certificate: Production Release Blocker
- windows_timestamp_url: Production Release Blocker
- windows_publisher_reputation: Production Release Blocker

## Build Commands

```bash
/Users/yukii/Desktop/EV3SC/.venv/bin/python /Users/yukii/Desktop/EV3SC/desktop/scripts/build_weisilelink_executable.py --target macos --output /Users/yukii/Desktop/EV3SC/desktop/build/macos --clean
```

```bash
/Users/yukii/Desktop/EV3SC/.venv/bin/python /Users/yukii/Desktop/EV3SC/desktop/scripts/build_release_artifacts.py macos --executable /Users/yukii/Desktop/EV3SC/desktop/build/macos/WeisileLink --native-adapter /Users/yukii/Desktop/EV3SC/desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter --output /Users/yukii/Desktop/EV3SC/desktop/release/internal/macos --version 0.1.0-internal --allow-unsigned
```

```bash
./.venv/bin/python desktop/scripts/run_internal_release_flow.py --target windows
```

## Application Startup Verification

```bash
desktop/build/macos/WeisileLink desktop-start --check-only --config .tmp/internal-release-check/config.json --ready-timeout 0.1
```

Observed startup state: `needs_pairing` (exit 3).
Expected internal-test states are `ready`, `needs_pairing`, or `needs_attention`; an unpaired test machine normally reports `needs_pairing`.

## Core Function Verification

```bash
./.venv/bin/python -m pytest tests/test_desktop_packaging.py tests/test_desktop_install_smoke.py -v
```

## Known Security Prompts

- macOS may show 'cannot verify developer' for unsigned builds.

## Notes

Target all builds the current host target and records host requirements for unavailable targets.
