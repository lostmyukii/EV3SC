# Windows Desktop Locked Executable Design

## Problem

The Windows setup wizard installs WeisileLink Desktop with `-Force`, which
removes the existing target directory before copying the staged package. When
an installed `WeisileLink.exe` process is still running, Windows locks that
file and `Remove-Item` fails with access denied.

## Design

Before replacing an existing target directory, the confirmed install execution
will find running `WeisileLink` processes whose executable path is inside the
target install root. It will stop only those matching processes, wait for them
to exit, and then continue the existing remove, copy, helper, and startup
metadata flow.

Process discovery and stopping remain Windows-only. Non-Windows tests use an
injected process list so the matching and result behavior can be verified
without launching the Windows executable.

## Error Handling

If a matching process cannot be stopped or remains alive after the timeout, the
install returns a blocked result before deleting files. Evidence includes the
target executable path and remaining process IDs, plus a teacher-facing action
to close WeisileLink and retry.

Unrelated `WeisileLink` processes outside the target root are not stopped.

## Verification

- PowerShell runtime test for exact-path matching and successful stop.
- Static assertions that forced replacement invokes the stop/wait function.
- Existing complete Windows setup wizard test suite.
- PowerShell AST parsing.
- Three-pass install file verification.
- Regenerated `VSLE-Install` verification.
