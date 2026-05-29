# Windows Release Preflight

Ready: no

## Checks

- tool:signtool: fail - signtool was not found on PATH
- host_os_windows: fail - Darwin
- executable_path: fail - executable_path was not provided
- windows_sign_identity: fail - windows_sign_identity was not provided
- timestamp_url: fail - timestamp_url was not provided
- windows_signing_implementation: pass - desktop/scripts/build_release_artifacts.py runs SignTool sign and verify

## Release Commands

```bash
./.venv/bin/python desktop/scripts/build_release_artifacts.py windows --executable desktop/build/windows/WeisileLink.exe --output desktop/release/windows --version 0.1.0 --sign-identity "VSLE Windows Code Signing" --timestamp-url https://timestamp.digicert.com
```
