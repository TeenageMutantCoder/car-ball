# CarBall Progress Log

Chronological append-only implementation log. Add one entry per meaningful update.

## Agent Mode (Multi-Agent Safe)

- Log is append-only: never edit or delete old entries.
- One update event per entry with stable task IDs.
- Status names must match registry: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.
- Source of truth for current state is `docs/agent-task-registry.yaml`.

## Entry Template

### YYYY-MM-DDTHH:MM:SSZ | Agent: <agent-name>

- changed_tasks:
  - id: WS-X-000
    from: TODO
    to: IN_PROGRESS
- summary:
- blockers:
  - task_id: WS-X-000
    blocked_by:
    unblock_plan:
- evidence:
  - path:
- next_actions:
- related_pr_or_commit:

---

## Entries

### 2026-02-28T00:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-G-TRACK-001
    from: TODO
    to: DONE
- summary: Created initial progress tracking system files.
- blockers: []
- evidence:
  - path: docs/progress-board.md
  - path: docs/progress-log.md
- next_actions:
  - Assign owners and start WS-A-001.
- related_pr_or_commit: n/a

### 2026-03-01T05:50:00Z | Agent: copilot

- changed_tasks: []
- summary: Added minimal in-process E2E runtime coverage (protocol input to authoritative snapshot path), introduced client in-process net adapter tests, and closed immediate docs drift by adding netcode roadmap and fixing stale progress-board evidence path.
- blockers: []
- evidence:
  - path: apps/server/src/inprocess.e2e.test.ts
  - path: apps/client/src/net/inprocess.ts
  - path: apps/client/src/net/inprocess.test.ts
  - path: docs/netcode-roadmap.md
  - path: docs/progress-board.md
- next_actions:
  - Implement live transport (minimal socket wiring) using the netcode roadmap Phase 1 slice.
  - Route authoritative snapshots through client reconciliation telemetry in runtime loop.
- related_pr_or_commit: n/a

### 2026-02-28T00:30:00Z | Agent: copilot

- changed_tasks:
  - id: WS-A-002
    from: TODO
    to: DONE
  - id: WS-C-002
    from: TODO
    to: DONE
  - id: WS-E-001
    from: TODO
    to: DONE
- summary: Used parallel subagents to complete entity ownership contract, server room lifecycle, and sim world entity model with snapshot mapping.
- blockers: []
- evidence:
  - path: docs/entity-ownership.md
  - path: apps/server/src/room.ts
  - path: apps/server/src/room.test.ts
  - path: packages/sim/src/state.ts
  - path: packages/sim/src/snapshot.ts
  - path: packages/sim/src/state.test.ts
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
  - path: docs/implementation-plan-parallel.md
  - path: docs/plan-v2-architecture.md
- next_actions:
  - Implement WS-E-002 server tick and snapshot loop.
  - Implement WS-D-001 Babylon client shell and render bridge.
  - Implement WS-C-003 control windows for jump/flip/boost.
- related_pr_or_commit: n/a

### 2026-02-28T01:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-003
    from: TODO
    to: DONE
  - id: WS-D-001
    from: TODO
    to: DONE
  - id: WS-E-002
    from: TODO
    to: DONE
- summary: Completed parallel implementation of sim control windows, Babylon client shell/renderer bridge, and server tick/snapshot runtime with tests.
- blockers: []
- evidence:
  - path: packages/sim/src/tick.ts
  - path: packages/sim/src/tick.jump.test.ts
  - path: apps/client/src/main.ts
  - path: apps/client/src/render/rendererBridge.ts
  - path: apps/server/src/runtime.ts
  - path: apps/server/src/runtime.test.ts
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
  - path: docs/implementation-plan-parallel.md
  - path: docs/plan-v2-architecture.md
- next_actions:
  - Implement WS-E-003 server validation checks.
  - Implement WS-D-002 input bindings and frame emitter.
  - Implement WS-C-004 wall and ceiling traction model.
- related_pr_or_commit: n/a

### 2026-02-28T01:30:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-004
    from: TODO
    to: DONE
  - id: WS-D-002
    from: TODO
    to: DONE
  - id: WS-E-003
    from: TODO
    to: DONE
- summary: Completed wall/ceiling traction model, client input binding + frame emitter, and server-side validation checks with telemetry counters.
- blockers: []
- evidence:
  - path: packages/sim/src/tick.traction.test.ts
  - path: apps/client/src/input/frameEmitter.ts
  - path: apps/client/src/input/frameEmitter.test.ts
  - path: apps/server/src/validation.ts
  - path: apps/server/src/validation.test.ts
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
- next_actions:
  - Implement WS-E-004 reconnect and resync flow.
  - Implement WS-D-003 interpolation and camera modes.
  - Implement WS-C-005 replay drift assertions automation.
- related_pr_or_commit: n/a

### 2026-02-28T02:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-005
    from: TODO
    to: DONE
  - id: WS-D-003
    from: TODO
    to: DONE
  - id: WS-E-004
    from: TODO
    to: DONE
- summary: Completed replay drift reporting/assertions, client interpolation + camera modes, and server reconnect/resync flow.
- blockers: []
- evidence:
  - path: packages/sim/src/replayDrift.ts
  - path: packages/sim/src/replayDrift.test.ts
  - path: apps/client/src/render/camera.ts
  - path: apps/client/src/render/camera.test.ts
  - path: apps/server/src/runtime.reconnect.test.ts
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
- next_actions:
  - Implement WS-D-004 client debug HUD metrics.
  - Implement WS-F-001 client prediction history buffer.
  - Implement WS-F-002 reconciliation smoothing metrics.
- related_pr_or_commit: n/a

### 2026-02-28T02:30:00Z | Agent: copilot

- changed_tasks:
  - id: WS-D-004
    from: TODO
    to: DONE
  - id: WS-F-001
    from: TODO
    to: DONE
  - id: WS-F-002
    from: TODO
    to: DONE
- summary: Completed client debug HUD metrics, prediction history buffer, and reconciliation smoothing/telemetry modules with tests.
- blockers: []
- evidence:
  - path: apps/client/src/debug/hud.ts
  - path: apps/client/src/debug/hud.test.ts
  - path: apps/client/src/net/prediction.ts
  - path: apps/client/src/net/prediction.test.ts
  - path: apps/client/src/net/reconciliation.ts
  - path: apps/client/src/net/reconciliation.test.ts
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
- next_actions:
  - Implement WS-F-003 network impairment simulation controls.
  - Implement WS-G-002 benchmark scenarios and harness.
  - Implement WS-G-003 SLO gate evaluation.
- related_pr_or_commit: n/a

### 2026-02-28T03:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-F-003
    from: TODO
    to: DONE
  - id: WS-G-002
    from: TODO
    to: DONE
  - id: WS-G-003
    from: TODO
    to: DONE
  - id: WS-G-004
    from: TODO
    to: DONE
- summary: Completed impairment simulation controls, benchmark harness, SLO gate evaluator, and soak release check scripts; executed benchmark and soak runs.
- blockers: []
- evidence:
  - path: apps/client/src/net/impairment.ts
  - path: apps/client/src/net/impairment.test.ts
  - path: scripts/benchmark_harness.ts
  - path: scripts/evaluate_slo_gates.ts
  - path: scripts/soak_release_check.ts
  - path: artifacts/benchmarks
  - path: artifacts/gates/slo-gate-report.json
  - path: artifacts/releases/soak-release-decision.json
- next_actions:
  - Optional: tune impairment profile thresholds for stricter stress-case pass criteria.
  - Optional: wire reconciliation telemetry directly into runtime HUD panel.
- related_pr_or_commit: n/a

### 2026-02-28T00:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-G-PLAN-002
    from: TODO
    to: DONE
- summary: Expanded task registry to 28 medium-granularity tasks with explicit dependencies and synced board TODO backlog.
- blockers: []
- evidence:
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
  - path: scripts/validate_task_registry.ts
- next_actions:
  - Claim first G0 tasks (WS-A-001 WS-A-002 WS-B-001 WS-G-001) with owners.
  - Begin implementation streams after G0 freeze completion.
- related_pr_or_commit: n/a

### 2026-02-28T00:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-G-PLAN-001
    from: TODO
    to: DONE
- summary: Integrated parallel subagent recommendations into execution gates, measurable SLO go/no-go criteria, and board evidence tracking fields.
- blockers: []
- evidence:
  - path: docs/implementation-plan-parallel.md
  - path: docs/progress-board.md
- next_actions:
  - Mirror selected T-G* slices into docs/agent-task-registry.yaml with immutable IDs.
  - Start G0 freeze tasks before feature stream work.
- related_pr_or_commit: n/a

### 2026-02-28T00:00:00Z | Agent: copilot

- changed_tasks:
  - id: WS-G-TRACK-002
    from: TODO
    to: DONE
- summary: Added machine-readable task registry and multi-agent edit protocol.
- blockers: []
- evidence:
  - path: docs/agent-task-registry.yaml
  - path: docs/progress-board.md
  - path: docs/progress-log.md
  - path: docs/implementation-plan-parallel.md
- next_actions:
  - Keep all status updates in docs/agent-task-registry.yaml first, then sync board.
- related_pr_or_commit: n/a

### 2026-03-01T06:00:00Z | Agent: copilot

- changed_tasks: []
- summary: Removed insufficient smoke-style in-process E2E test and added a stronger state-transition-focused in-process E2E test plan with roadmap alignment updates.
- blockers: []
- evidence:
  - path: apps/server/src/inprocess.e2e.test.ts
  - path: docs/inprocess-e2e-test-plan.md
  - path: docs/netcode-roadmap.md
- next_actions:
  - Implement Phase 1 from docs/inprocess-e2e-test-plan.md with before/after authoritative state assertions.
  - Reintroduce server in-process E2E tests that validate accepted and rejected input state transitions.
- related_pr_or_commit: n/a

### 2026-03-01T06:20:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-006
    from: TODO
    to: DONE
  - id: WS-E-005
    from: TODO
    to: IN_PROGRESS
- summary: Implemented Rapier shadow-world scaffolding in shared sim with feature flags and lifecycle hooks, wired runtime flag propagation, and added unit/integration coverage for critical behavior.
- blockers: []
- evidence:
  - path: packages/sim/src/rapierShadow.ts
  - path: packages/sim/src/simulation.ts
  - path: packages/sim/src/simulation.rapierShadow.test.ts
  - path: apps/server/src/runtime.ts
  - path: apps/server/src/runtime.test.ts
  - path: apps/server/src/start.ts
- next_actions:
  - Implement WS-C-007 arena and ball collider wiring.
  - Continue WS-E-005 to integrate Rapier ball authority into runtime snapshot/validation paths.
  - Extend benchmark/gate telemetry for hybrid metrics before WS-G-005.
- related_pr_or_commit: n/a

### 2026-03-01T06:40:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-007
    from: TODO
    to: DONE
- summary: Implemented deterministic arena/ball collider + material setup for Rapier shadow initialization and added focused test coverage for collider invariants and lifecycle telemetry.
- blockers: []
- evidence:
  - path: packages/sim/src/rapierColliders.ts
  - path: packages/sim/src/rapierColliders.test.ts
  - path: packages/sim/src/rapierShadow.ts
  - path: packages/sim/src/simulation.ts
  - path: packages/sim/src/simulation.rapierShadow.test.ts
  - path: apps/server/src/runtime.test.ts
- next_actions:
  - Start WS-C-008 by mapping Rapier-authoritative ball state into server snapshots.
  - Advance WS-E-005 validation paths for authority toggle behavior.
  - Extend hybrid telemetry fields needed by WS-G-005 gates.
- related_pr_or_commit: n/a

### 2026-03-01T07:05:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-008
    from: TODO
    to: DONE
- summary: Added Rapier-authoritative ball-state toggle path through sim/runtime/startup and verified authority application + guardrails with focused sim and runtime tests.
- blockers: []
- evidence:
  - path: packages/sim/src/rapierShadow.ts
  - path: packages/sim/src/simulation.ts
  - path: packages/sim/src/simulation.rapierShadow.test.ts
  - path: apps/server/src/runtime.ts
  - path: apps/server/src/runtime.test.ts
  - path: apps/server/src/start.ts
- next_actions:
  - Continue WS-E-005 by adding validation + telemetry for impossible ball-authority transitions.
  - Implement WS-F-004 reconciliation threshold tuning for hybrid authority mode.
  - Prepare WS-G-005 hybrid benchmark/gate variants using new authority flags.
- related_pr_or_commit: n/a

### 2026-03-01T07:20:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-008
    from: DONE
    to: IN_PROGRESS
- summary: Corrected task status after verification showed Rapier package was declared but not imported/used in the default runtime backend path.
- blockers: []
- evidence:
  - path: packages/sim/package.json
  - path: packages/sim/src/rapierShadow.ts
  - path: packages/sim/src/simulation.ts
- next_actions:
  - Implement real Rapier backend import/init/step path for shadow and ball authority modes.
  - Add tests proving default backend uses Rapier and emits authoritative ball state.
  - Re-run sim/runtime tests and restore DONE status only after validation.
- related_pr_or_commit: n/a

### 2026-03-01T07:35:00Z | Agent: copilot

- changed_tasks:
  - id: WS-C-008
    from: IN_PROGRESS
    to: DONE
- summary: Implemented real default Rapier backend loading/init/step path, wired backend readiness/error telemetry, and verified default backend Rapier usage with passing sim/runtime tests.
- blockers: []
- evidence:
  - path: packages/sim/package.json
  - path: packages/sim/src/rapierShadow.ts
  - path: packages/sim/src/simulation.ts
  - path: packages/sim/src/simulation.rapierShadow.test.ts
  - path: apps/server/src/runtime.ts
  - path: apps/server/src/runtime.test.ts
  - path: apps/server/src/start.ts
- next_actions:
  - Continue WS-E-005 validation and telemetry checks for impossible authority transitions.
  - Start WS-F-004 reconciliation tuning for hybrid authority mode.
  - Add WS-G-005 benchmark gate variants using Rapier backend readiness metrics.
- related_pr_or_commit: n/a

### 2026-03-01T08:10:00Z | Agent: copilot

- changed_tasks:
  - id: WS-E-005
    from: IN_PROGRESS
    to: DONE
- summary: Completed runtime Rapier ball-authority integration by adding impossible-transition validation guardrails, rollback handling, and room/global telemetry reporting with regression coverage.
- blockers: []
- evidence:
  - path: apps/server/src/runtime.ts
  - path: apps/server/src/runtime.test.ts
  - path: apps/server/src/start.ts
  - path: packages/sim/src/simulation.ts
  - path: packages/sim/src/rapierShadow.ts
- next_actions:
  - Start WS-F-004 reconciliation threshold tuning for hybrid collision scenarios.
  - Extend benchmark/gate scenarios for Rapier authority paths in WS-G-005.
  - Prepare hybrid soak recommendation workflow after WS-G-005 gates.
- related_pr_or_commit: n/a
