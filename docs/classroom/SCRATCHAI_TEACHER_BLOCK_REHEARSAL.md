# ScratchAI Teacher Block Rehearsal

Teacher-facing Scratch block rehearsal: no
Classroom release ready: no
Transport: vsle-bluetooth
Transport capability: full
Browser direct Bluetooth used: no
Scratch visual design changed: no
Connected-state source: not recorded
Max freshness gap: not recorded
Sensor updates observed: 0

This gate verifies the teacher-facing browser workflow only. It does not replace signed release-artifact evidence, Windows evidence, or the long Section 13.7 classroom rehearsal.

## Blocking Items
- scratch_unsandboxed_loaded must be true
- extension_loaded_as_main_thread_script must be true
- connection_state_visible must be true
- real_ev3_project_used must be true
- ev3_runs_ev3dev_server must be true
- disconnect_stop_ok must be true
- extension_worker_loaded must be false
- connected_state_source must use WeisileLink health and sensor freshness
- sensor_freshness_ms_max must be measured
- sensor_updates_observed must be greater than 0
- block_groups_exercised.motor must list at least one block
- block_groups_exercised.sensor must list at least one block
- block_groups_exercised.sound must list at least one block
- block_groups_exercised.display must list at least one block
- block_groups_exercised.system must list at least one block
- block_groups_exercised.data_collection must list at least one block
- block_groups_exercised.ai_quest must list at least one block

## Module Blocks Exercised
- motor: not recorded
- sensor: not recorded
- sound: not recorded
- display: not recorded
- system: not recorded
- data_collection: not recorded
- ai_quest: not recorded

## Evidence
- Browser URL: http://127.0.0.1:8642/
- WeisileLink endpoint: ws://127.0.0.1:20111/scratch/bt
- Command source: scratch_blocks
- Notes: not recorded
