import asyncio
import json

from weisile_link.json_rpc_server import ScratchJsonRpcServer
from weisile_link.runtime.degradation import DegradationManager, TransportKind

from tests.test_json_rpc_server import FakeTransport, FakeWebSocket


async def collect_ai_quest_rows(server):
    for distance, label in (
        (8.0, "obstacle"),
        (12.0, "obstacle"),
        (35.0, "safe"),
        (42.0, "safe"),
    ):
        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 1716387600.123,
                "sensors": {
                    "S2": {
                        "type": "ultrasonic",
                        "distance_cm": distance,
                    }
                },
                "motors": {"A": {"position": 0}},
                "system": {
                    "collecting": True,
                    "collect_label": label,
                    "student_name": "not allowed",
                },
            }
        )


def test_ai_quest_json_rpc_contract_upload_train_predict_and_export():
    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        websocket = FakeWebSocket()
        await collect_ai_quest_rows(server)

        for request in (
            {
                "jsonrpc": "2.0",
                "id": "aiq-upload",
                "method": "aiquest.uploadDataset",
                "params": {
                    "consent": True,
                    "scope": "project",
                    "scope_id": "scratch-project-1",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-train",
                "method": "aiquest.startTraining",
                "params": {"accuracy_gate": 0.7},
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-status",
                "method": "aiquest.getTrainingStatus",
            },
        ):
            await server.handle_json_rpc_message(websocket, json.dumps(request))

        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 1716387605.123,
                "sensors": {
                    "S2": {
                        "type": "ultrasonic",
                        "distance_cm": 9.0,
                    }
                },
                "motors": {"A": {"position": 0}},
                "system": {"collecting": False},
            }
        )

        for request in (
            {
                "jsonrpc": "2.0",
                "id": "aiq-predict",
                "method": "aiquest.predictCurrent",
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-export",
                "method": "aiquest.exportModel",
            },
        ):
            await server.handle_json_rpc_message(websocket, json.dumps(request))

        upload = websocket.sent[0]["result"]
        trained = websocket.sent[1]["result"]
        status = websocket.sent[2]["result"]
        prediction = websocket.sent[3]["result"]
        exported = websocket.sent[4]["result"]

        assert upload["dataset_id"].startswith("mock-dataset-")
        assert upload["uploaded_samples"] == 4
        assert upload["audit"]["provider"] == "mock"
        assert trained["status"] == "succeeded"
        assert status["status"] == "succeeded"
        assert prediction["label"] == "obstacle"
        assert prediction["mode"] == "cloud"
        assert exported["filename"] == "ai_quest_model_report.json"
        assert "student_name" not in json.dumps(upload)
        assert transport.commands == []

    asyncio.run(scenario())


def test_ai_quest_predict_current_degrades_to_local_fallback_without_model():
    async def scenario():
        manager = DegradationManager()
        transport = FakeTransport(manager=manager)
        server = ScratchJsonRpcServer(transport, manager=manager)
        websocket = FakeWebSocket()
        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 1716387600.123,
                "sensors": {"S2": {"type": "ultrasonic", "distance_cm": 9.0}},
                "system": {"collecting": False},
            }
        )

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "aiq-local",
                    "method": "aiquest.predictCurrent",
                }
            ),
        )

        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": "aiq-local",
                "result": {
                    "label": "obstacle",
                    "confidence": 0.5,
                    "mode": "localFallback",
                    "model_id": "local-distance-rule",
                },
            }
        ]
        assert transport.commands == []

    asyncio.run(scenario())
