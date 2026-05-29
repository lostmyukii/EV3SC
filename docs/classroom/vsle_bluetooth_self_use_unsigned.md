# VSLE Bluetooth Full Module Smoke Report

Self-use unsigned ready: yes
Classroom ready: no
Bluetooth classroom baseline ready: no
Bluetooth high-speed 50Hz ready: no
Release-artifact evidence ready: no

Self-use unsigned validation is for local/internal functional testing only and does not replace signed/notarized release evidence.

## Baseline Blocking Items
- installed_from_release_artifact must be true

## High-Speed 50Hz Blocking Items
- Bluetooth classroom baseline must pass first
- sensor_freshness_ms_max must be <= 25

## Measured Bluetooth sampling
- Max freshness gap: 499.251ms
- Average freshness gap: 106.065ms
- P95 freshness gap: 246.559ms
- Sensor updates observed: 86
- Estimated average sample rate: 9.43 Hz
