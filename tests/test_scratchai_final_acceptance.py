from pathlib import Path

from scripts.verify_scratchai_final_acceptance import (
    acceptance_summary,
    build_acceptance_plan,
    render_markdown_report,
    run_acceptance_plan,
)


def test_final_acceptance_plan_covers_scratchai_ev3_requirements():
    root = Path("/Users/yukii/Desktop/EV3SC")

    plan = build_acceptance_plan(root=root, include_runtime_preview=True)
    gate_ids = [gate.id for gate in plan.gates]
    manual_ids = [gate.id for gate in plan.manual_gates]

    assert gate_ids == [
        "unified-preview-plan",
        "unified-preview-runtime",
        "scratchai-ev3-entry",
        "legacy-ev3-compat",
        "vsle-extension-aiquest",
        "aiquest-contract-provider",
        "hardware-readiness-assets",
    ]
    assert manual_ids == ["real-ev3-classroom-rehearsal"]
    assert all(str(gate.cwd).startswith(str(root)) for gate in plan.gates)
    assert "/Users/yukii/Desktop/scratch ai" not in repr(plan)
    assert any("extension library `EV3`" in gate.requirement for gate in plan.gates)
    assert any("legacy official EV3" in gate.requirement for gate in plan.gates)
    assert any("cloud/cached/localFallback" in gate.requirement for gate in plan.gates)


def test_acceptance_runner_collects_json_ready_gate_results():
    plan = build_acceptance_plan(include_runtime_preview=False)
    calls = []

    def fake_runner(gate):
        calls.append(gate.id)
        return 0 if gate.id != "legacy-ev3-compat" else 1, "out", "err"

    results = run_acceptance_plan(plan, runner=fake_runner)
    summary = acceptance_summary(plan, results)

    assert calls == [gate.id for gate in plan.gates]
    assert summary["automatedOk"] is False
    assert summary["classroomApproved"] is False
    assert summary["passed"] == len(plan.gates) - 1
    assert summary["failed"] == 1
    assert summary["manualPending"] == 1
    assert summary["results"][0]["command"]
    assert summary["results"][0]["cwd"].startswith("/Users/yukii/Desktop/EV3SC")


def test_acceptance_markdown_report_records_pending_hardware_gate():
    plan = build_acceptance_plan(include_runtime_preview=False)

    results = run_acceptance_plan(
        plan,
        runner=lambda gate: (0, f"{gate.id} ok", ""),
    )
    markdown = render_markdown_report(plan, results)

    assert "ScratchAI VSLE-EV3 Final Acceptance" in markdown
    assert "| unified-preview-plan | PASS |" in markdown
    assert "| real-ev3-classroom-rehearsal | PENDING |" in markdown
    assert (
        "not classroom-approved until real EV3 hardware rehearsal evidence" in markdown
    )
