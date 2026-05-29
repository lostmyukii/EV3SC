# VSLE Bluetooth Full Module Smoke Report

Classroom ready: no

## Blocking Items
- installed_from_release_artifact must be true
- sensor_freshness_ms_max must be <= 25

## Mode Decision
Diagnostic fallback: yes
WiFi Full VSLE remains the classroom 50Hz path.
Full VSLE Bluetooth is retained only for non-classroom diagnostics or fallback on this evidence until a redesigned Bluetooth path or new real-EV3 evidence satisfies the 25ms freshness gate.
