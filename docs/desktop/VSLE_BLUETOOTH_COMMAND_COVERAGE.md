# VSLE Bluetooth Full Module Command Coverage

Generated from `vsle-ev3-extension/index.js`, `weisile-link/weisile_link/protocol/validation.py`, `weisile-link/weisile_link/json_rpc_server.py`, and `ev3-firmware/vsle_ev3_server.py`.

Full VSLE Bluetooth means the ev3dev JSON-line Bluetooth path. Official firmware Bluetooth remains a separate limited compatibility mode.

| Module | Opcode | Block type | Method | Full VSLE Bluetooth | Official firmware compatibility |
|---|---|---|---|---|---|
| AI Quest | `cacheAIQuestModel` | command | `aiquest.cacheModel` | host-side | host-side |
| AI Quest | `clearAIQuestModelCache` | command | `aiquest.clearModelCache` | host-side | host-side |
| AI Quest | `exportAIQuestModel` | command | `aiquest.exportModel` | host-side | host-side |
| AI Quest | `getAIQuestAvailableModelCount` | reporter | `aiquest-state` | host-side | host-side |
| AI Quest | `getAIQuestModelAccuracy` | reporter | `aiquest-state` | host-side | host-side |
| AI Quest | `getAIQuestPrediction` | reporter | `aiquest-state` | host-side | host-side |
| AI Quest | `getAIQuestPredictionMode` | reporter | `aiquest-state` | host-side | host-side |
| AI Quest | `getAIQuestTrainingStatus` | reporter | `aiquest-state` | host-side | host-side |
| AI Quest | `isAIQuestModelCached` | boolean | `aiquest-state` | host-side | host-side |
| AI Quest | `isAIQuestPrediction` | boolean | `aiquest-state` | host-side | host-side |
| AI Quest | `publishAIQuestModel` | command | `aiquest.publishModel` | host-side | host-side |
| AI Quest | `refreshAIQuestModelList` | command | `aiquest.listModels` | host-side | host-side |
| AI Quest | `refreshAIQuestPredictionMode` | command | `aiquest.getPredictionMode` | host-side | host-side |
| AI Quest | `refreshAIQuestTrainingStatus` | command | `aiquest.getTrainingStatus` | host-side | host-side |
| AI Quest | `selectAIQuestModel` | command | `aiquest.selectModel` | host-side | host-side |
| AI Quest | `startAIQuestTraining` | command | `aiquest.startTraining` | host-side | host-side |
| AI Quest | `updateAIQuestPrediction` | command | `aiquest.predictCurrent` | host-side | host-side |
| AI Quest | `uploadAIQuestDataset` | command | `aiquest.uploadDataset` | host-side | host-side |
| AI Quest | `useCachedAIQuestModel` | command | `aiquest.useCachedModel` | host-side | host-side |
| AI Quest | `withdrawAIQuestModel` | command | `aiquest.withdrawModel` | host-side | host-side |
| Data | `addDataPoint` | command | `data.addPoint` | ev3-dispatched | compatibility-unavailable |
| Data | `clearCollectedData` | command | `data.clear` | ev3-dispatched | compatibility-unavailable |
| Data | `exportDataCSV` | command | `data.exportCSV` | ev3-dispatched | compatibility-unavailable |
| Data | `getDataCount` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Data | `startAutoCollect` | command | `data.startAutoCollect` | ev3-dispatched | compatibility-unavailable |
| Data | `startDataCollection` | command | `data.startCollect` | ev3-dispatched | compatibility-unavailable |
| Data | `stopDataCollection` | command | `data.stopCollect` | ev3-dispatched | compatibility-unavailable |
| Data | `uploadToTrainer` | command | `data.uploadToTrainer` | host-side | host-side |
| Display | `displayClear` | command | `display.clear` | ev3-dispatched | compatibility-unavailable |
| Display | `displayImage` | command | `display.image` | ev3-dispatched | compatibility-unavailable |
| Display | `displayNumber` | command | `display.number` | ev3-dispatched | compatibility-unavailable |
| Display | `displayText` | command | `display.text` | ev3-dispatched | compatibility-unavailable |
| Display | `displayTextAt` | command | `display.textAt` | ev3-dispatched | compatibility-unavailable |
| Display | `displayUpdate` | command | `display.update` | ev3-dispatched | compatibility-unavailable |
| Display | `drawCircle` | command | `display.drawCircle` | ev3-dispatched | compatibility-unavailable |
| Display | `drawLine` | command | `display.drawLine` | ev3-dispatched | compatibility-unavailable |
| Motor | `getMotorPID` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Motor | `getMotorPosition` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Motor | `getMotorSpeed` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Motor | `isMotorRunning` | boolean | `sensor-cache` | cache-backed | compatibility-cache |
| Motor | `motorResetPosition` | command | `motor.resetPosition` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorRunForever` | command | `motor.runForever` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorRunTimed` | command | `motor.runTimed` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorRunToAbsPos` | command | `motor.runToAbsPos` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorRunToRelPos` | command | `motor.runToRelPos` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorSetPID` | command | `motor.setPID` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorSetSpeed` | command | `motor.runForever` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorStop` | command | `motor.stop` | ev3-dispatched | native |
| Motor | `motorStopAll` | command | `motor.stopAll` | ev3-dispatched | native |
| Motor | `motorSyncRun` | command | `motor.syncRun` | ev3-dispatched | compatibility-unavailable |
| Motor | `motorSyncTurn` | command | `motor.syncTurn` | ev3-dispatched | compatibility-unavailable |
| Motor | `waitMotorStopped` | command | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getBatteryLevel` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getColorSensorAmbient` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getColorSensorColor` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getColorSensorRGB` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getColorSensorReflected` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getGyroAngle` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getGyroRate` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getIRBeaconDistance` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getIRBeaconHeading` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getIRDistance` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getIRRemoteButton` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getTouchPressed` | boolean | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getUltrasonicDistance` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `getUltrasonicDistanceInch` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `isBrickButtonPressed` | boolean | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `isColor` | boolean | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `isUltrasonicNear` | boolean | `sensor-cache` | cache-backed | compatibility-cache |
| Sensor | `resetGyro` | command | `gyro.reset` | ev3-dispatched | compatibility-unavailable |
| Sensor | `waitTouchPress` | command | `sensor-cache.wait` | cache-backed | compatibility-cache |
| Sensor | `waitTouchRelease` | command | `sensor-cache.wait` | cache-backed | compatibility-cache |
| Sound | `beep` | command | `sound.beep` | ev3-dispatched | compatibility-unavailable |
| Sound | `playSoundFile` | command | `sound.playFile` | ev3-dispatched | compatibility-unavailable |
| Sound | `playTone` | command | `sound.playTone` | ev3-dispatched | compatibility-unavailable |
| Sound | `playToneAndWait` | command | `sound.playToneWait` | ev3-dispatched | compatibility-unavailable |
| Sound | `setVolume` | command | `sound.setVolume` | ev3-dispatched | compatibility-unavailable |
| Sound | `stopSound` | command | `sound.stop` | ev3-dispatched | compatibility-unavailable |
| System | `getBatteryVoltage` | reporter | `sensor-cache` | cache-backed | compatibility-cache |
| System | `isConnected` | boolean | `sensor-cache` | cache-backed | compatibility-cache |
| System | `setStatusLight` | command | `system.setStatusLight` | ev3-dispatched | compatibility-unavailable |
| System | `statusLightOff` | command | `system.statusLightOff` | ev3-dispatched | compatibility-unavailable |
| System | `stopAllEV3` | command | `system.stopAll` | ev3-dispatched | native |
| System | `waitMilliseconds` | command | `host.wait` | host-side | host-side |

## Status Legend

- `ev3-dispatched`: validated by WeisileLink and handled by the EV3 ev3dev server over the full VSLE transport.
- `cache-backed`: synchronous Scratch reporter or Boolean block reads from `SensorCache`; the transport owns sensor polling.
- `host-side`: handled inside WeisileLink or local extension state without an EV3 hardware command.
- `native`: available in the current official-firmware native adapter compatibility surface.
- `compatibility-cache`: official firmware compatibility can serve the block only when its polling loop has populated `SensorCache`.
- `compatibility-unavailable`: intentionally not claimed for official firmware Bluetooth compatibility.
