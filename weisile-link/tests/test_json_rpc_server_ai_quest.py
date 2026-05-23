import asyncio
import json

from weisile_link.ai_quest_contract import AIQuestContractService
from weisile_link.ai_quest_providers import AIQuestProviderUnavailable
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


def test_ai_quest_json_rpc_delete_status_and_audit_routes():
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
                "params": {"consent": True},
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-train",
                "method": "aiquest.startTraining",
            },
        ):
            await server.handle_json_rpc_message(websocket, json.dumps(request))

        dataset_id = websocket.sent[0]["result"]["dataset_id"]
        model_id = websocket.sent[1]["result"]["model_id"]

        for request in (
            {
                "jsonrpc": "2.0",
                "id": "aiq-status",
                "method": "aiquest.getUploadStatus",
                "params": {"dataset_id": dataset_id},
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-delete-dataset",
                "method": "aiquest.deleteDataset",
                "params": {"dataset_id": dataset_id},
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-delete-model",
                "method": "aiquest.deleteModel",
                "params": {"model_id": model_id},
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-audit",
                "method": "aiquest.getAuditLog",
            },
        ):
            await server.handle_json_rpc_message(websocket, json.dumps(request))

        status = websocket.sent[2]["result"]
        dataset_delete = websocket.sent[3]["result"]
        model_delete = websocket.sent[4]["result"]
        audit = websocket.sent[5]["result"]

        assert status["status"] == "complete"
        assert status["progress"] == 100
        assert dataset_delete["status"] == "deleted"
        assert dataset_delete["raw_dataset_retained"] is False
        assert model_delete["status"] == "deleted"
        assert model_delete["cached_model_retained"] is False
        assert "entries" in audit
        assert [entry["event"] for entry in audit["entries"][-2:]] == [
            "dataset.delete.complete",
            "model.delete.complete",
        ]

    asyncio.run(scenario())


def test_ai_quest_json_rpc_shared_model_and_cache_routes():
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
                    "scope_id": "student-project-7",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-train",
                "method": "aiquest.startTraining",
            },
        ):
            await server.handle_json_rpc_message(websocket, json.dumps(request))

        model_id = websocket.sent[1]["result"]["model_id"]

        for request in (
            {
                "jsonrpc": "2.0",
                "id": "aiq-publish",
                "method": "aiquest.publishModel",
                "params": {
                    "model_id": model_id,
                    "scope": "classSession",
                    "scope_id": "class-7a",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-list",
                "method": "aiquest.listModels",
                "params": {
                    "scope": "classSession",
                    "scope_id": "class-7a",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-cache",
                "method": "aiquest.cacheModel",
                "params": {"model_id": model_id},
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-use-cache",
                "method": "aiquest.useCachedModel",
                "params": {
                    "model_id": model_id,
                    "scope": "classSession",
                    "scope_id": "class-7a",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-mode",
                "method": "aiquest.getPredictionMode",
                "params": {
                    "scope": "classSession",
                    "scope_id": "class-7a",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-withdraw",
                "method": "aiquest.withdrawModel",
                "params": {
                    "model_id": model_id,
                    "scope": "classSession",
                    "scope_id": "class-7a",
                },
            },
            {
                "jsonrpc": "2.0",
                "id": "aiq-clear-cache",
                "method": "aiquest.clearModelCache",
                "params": {"model_id": model_id},
            },
        ):
            await server.handle_json_rpc_message(websocket, json.dumps(request))

        published = websocket.sent[2]["result"]
        listed = websocket.sent[3]["result"]
        cached = websocket.sent[4]["result"]
        selected_cached = websocket.sent[5]["result"]
        mode = websocket.sent[6]["result"]
        withdrawn = websocket.sent[7]["result"]
        cleared = websocket.sent[8]["result"]

        assert published["status"] == "published"
        assert published["scope"] == {
            "type": "classSession",
            "id": "class-7a",
        }
        assert listed["models"] == [published]
        assert "rule" not in json.dumps(listed)
        assert cached["status"] == "cached"
        assert selected_cached["prediction_mode"] == "cloud"
        assert mode["mode"] == "cloud"
        assert withdrawn["status"] == "withdrawn"
        assert cleared["status"] == "cleared"
        assert transport.commands == []

    asyncio.run(scenario())


def test_ai_quest_rest_shared_model_routes():
    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        await collect_ai_quest_rows(server)

        upload = await server.handle_post(
            "/api/aiquest/upload",
            json.dumps({"consent": True, "scope_id": "project-rest"}),
        )
        assert upload.status == 200
        train = await server.handle_post("/api/aiquest/train", "{}")
        model_id = json.loads(train.body)["data"]["model_id"]

        publish = await server.handle_post(
            "/api/aiquest/publish-model",
            json.dumps(
                {
                    "model_id": model_id,
                    "scope": "courseTask",
                    "scope_id": "mission-3",
                }
            ),
        )
        models = server.handle_get(
            "/api/aiquest/models?scope=courseTask&scope_id=mission-3"
        )
        mode = server.handle_get(
            "/api/aiquest/prediction-mode"
            "?scope=courseTask&scope_id=mission-3"
        )
        withdraw = await server.handle_post(
            "/api/aiquest/withdraw-model",
            json.dumps(
                {
                    "model_id": model_id,
                    "scope": "courseTask",
                    "scope_id": "mission-3",
                }
            ),
        )

        assert json.loads(publish.body)["data"]["status"] == "published"
        assert json.loads(models.body)["data"]["models"][0]["model_id"] == (
            model_id
        )
        assert json.loads(mode.body)["data"]["mode"] == "cloud"
        assert json.loads(withdraw.body)["data"]["status"] == "withdrawn"

    asyncio.run(scenario())


def test_ai_quest_rest_routes_surface_retryable_errors_and_audit():
    class FailingUploadProvider:
        name = "failing-cloud"

        def upload_dataset(self, payload):
            raise AIQuestProviderUnavailable(
                self.name,
                "upload_dataset",
                "cloud unavailable",
                status_code=503,
            )

    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        service = AIQuestContractService(provider=FailingUploadProvider())
        server = ScratchJsonRpcServer(
            transport,
            manager=transport.manager,
            ai_quest=service,
        )
        await collect_ai_quest_rows(server)

        failed = await server.handle_post(
            "/api/aiquest/upload",
            json.dumps({"consent": True, "id": "rest-upload"}),
        )
        status = server.handle_get("/api/aiquest/upload-status")
        audit = server.handle_get("/api/aiquest/audit")

        failed_body = json.loads(failed.body)
        status_body = json.loads(status.body)
        audit_body = json.loads(audit.body)

        assert failed.status == 503
        assert failed_body["error"]["code"] == "AIQUEST_PROVIDER_UNAVAILABLE"
        assert failed_body["error"]["retryable"] is True
        assert failed_body["error"]["data"]["status_code"] == 503
        assert status_body["data"]["status"] == "failed"
        assert status_body["data"]["retryable"] is True
        assert audit_body["data"]["entries"][-1]["event"] == (
            "dataset.upload.failed"
        )
        assert audit_body["data"]["entries"][-1]["retryable"] is True

    asyncio.run(scenario())
