# CarBall Implementation Progress Board

Use this file as the quick status dashboard.

## Agent Mode (Multi-Agent Safe)

- Canonical source of task state: `docs/agent-task-registry.yaml`
- This board is a human-readable projection of the registry.
- Agents should update the registry first, then sync this board.
- Never rename task IDs (e.g., `WS-A-001`).
- If a task is `BLOCKED`, always include `Blocked By` and `Unblock Plan`.

## Status Legend

- TODO: planned but not started
- IN PROGRESS: actively being worked on
- BLOCKED: cannot proceed due to dependency/issue
- DONE: completed and verified

## Quick Snapshot

Update this section first.

- Last updated: 2026-03-02
- Sprint / Milestone: MVP-1
- Overall completion: 91%
- P0 gate pass rate: 0/0
- Last full benchmark date: 2026-03-02
- Last soak date: YYYY-MM-DD

### Counts

- TODO: 2
- IN PROGRESS: 1
- BLOCKED: 0
- DONE: 32

## Release Gate Summary

| Gate | Threshold | Latest Value | Evidence | Status |
|---|---|---|---|---|
| Frame p95 | <= 16.7ms | 0.0701ms | artifacts/benchmarks/2026-03-02T01-05-50-229Z/summary.json | PASS |
| Physics p95 | <= 6ms | 0.0017ms | artifacts/benchmarks/2026-03-02T01-05-50-229Z/impairment_matrix__loss_5pct.json | PASS |
| Render p95 | <= 9ms | 0.0031ms | artifacts/benchmarks/2026-03-02T01-05-50-229Z/impairment_matrix__loss_5pct.json | PASS |
| Server tick p95/p99 | <= 8.3ms / <= 12ms | 0.0022ms / 0.0443ms | artifacts/benchmarks/2026-03-02T01-05-50-229Z/summary.json | PASS |
| Corrections/min/player | <= 12 clean, <= 30 at 5% loss | clean=0, loss_5pct=277.5 | artifacts/benchmarks/2026-03-02T01-05-50-229Z/summary.json | FAIL |
| Replay drift | <= 0.5% sampled ticks | loss_5pct=100% | artifacts/benchmarks/2026-03-02T01-05-50-229Z/summary.json | FAIL |

## In Progress

| ID | Workstream | Task | Owner | Started | Target | Metrics Snapshot | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| WS-F-004 | WS-F | Tune reconciliation for hybrid collisions | unassigned | 2026-03-01 | - | tests pass; latest benchmark clean=0 corr/min, loss_5pct=277.5 corr/min | artifacts/benchmarks/2026-03-02T01-05-50-229Z/summary.json | Harness now applies profile deadzone+smoothing, but loss_5pct correction rate and replay drift still exceed acceptance bounds. |

## Blocked

| ID | Workstream | Task | Blocked By | Since | Unblock Plan | Metrics Snapshot |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## To Do

| ID | Workstream | Task | Priority | Dependency |
|---|---|---|---|---|
| WS-G-005 | WS-G | Add hybrid Rapier benchmark gate suite | P1 | WS-F-004, WS-G-003 |
| WS-G-006 | WS-G | Run hybrid soak cycles and recommendation | P1 | WS-G-005 |

## Done

| ID | Workstream | Task | Completed | Evidence | Validation |
|---|---|---|---|---|---|
| WS-A-001 | WS-A | Freeze runtime constants and thresholds | 2026-02-28 | docs/runtime-constants.md | PASS |
| WS-A-002 | WS-A | Freeze entity ID ownership semantics | 2026-02-28 | docs/entity-ownership.md | PASS |
| WS-A-003 | WS-A | Scaffold monorepo packages and scripts | 2026-02-28 | package.json | PASS |
| WS-A-004 | WS-A | Configure TS project references | 2026-02-28 | tsconfig.json | PASS |
| WS-A-005 | WS-A | Add CI typecheck test build | 2026-02-28 | .github/workflows/ci.yml | PASS |
| WS-B-001 | WS-B | Freeze protocol envelope and versioning policy | 2026-02-28 | docs/protocol-envelope.md | PASS |
| WS-B-002 | WS-B | Define protocol v1 payload types | 2026-02-28 | packages/protocol/src/contracts.ts | PASS |
| WS-B-003 | WS-B | Add protocol roundtrip compatibility tests | 2026-02-28 | packages/protocol/src/codec.test.ts | PASS |
| WS-C-001 | WS-C | Build fixed-step simulation loop | 2026-02-28 | packages/sim/src/simulation.ts | PASS |
| WS-C-002 | WS-C | Implement world entity model | 2026-02-28 | packages/sim/src/state.ts | PASS |
| WS-C-003 | WS-C | Implement controls jump flip boost | 2026-02-28 | packages/sim/src/tick.jump.test.ts | PASS |
| WS-C-004 | WS-C | Implement wall and ceiling traction model | 2026-02-28 | packages/sim/src/tick.traction.test.ts | PASS |
| WS-C-005 | WS-C | Add replay hash and drift assertions | 2026-02-28 | packages/sim/src/replayDrift.test.ts | PASS |
| WS-C-006 | WS-C | Add Rapier world shadow bootstrap | 2026-03-01 | packages/sim/src/simulation.rapierShadow.test.ts | PASS |
| WS-C-007 | WS-C | Add Rapier ball and arena colliders | 2026-03-01 | packages/sim/src/rapierColliders.test.ts | PASS |
| WS-C-008 | WS-C | Shift server ball authority to Rapier | 2026-03-01 | packages/sim/src/simulation.rapierShadow.test.ts | PASS |
| WS-D-001 | WS-D | Initialize Babylon client shell and render bridge | 2026-02-28 | apps/client/src/main.ts | PASS |
| WS-D-002 | WS-D | Implement input bindings and frame emitter | 2026-02-28 | apps/client/src/input/frameEmitter.ts | PASS |
| WS-D-003 | WS-D | Implement interpolation and camera modes | 2026-02-28 | apps/client/src/render/camera.test.ts | PASS |
| WS-D-004 | WS-D | Add client debug HUD metrics | 2026-02-28 | apps/client/src/debug/hud.test.ts | PASS |
| WS-E-001 | WS-E | Build server room lifecycle | 2026-02-28 | apps/server/src/room.ts | PASS |
| WS-E-002 | WS-E | Implement server tick and snapshot loop | 2026-02-28 | apps/server/src/runtime.ts | PASS |
| WS-E-003 | WS-E | Add server validation checks | 2026-02-28 | apps/server/src/validation.ts | PASS |
| WS-E-004 | WS-E | Implement reconnect and resync flow | 2026-02-28 | apps/server/src/runtime.reconnect.test.ts | PASS |
| WS-E-005 | WS-E | Integrate Rapier ball authority in runtime | 2026-03-01 | apps/server/src/runtime.test.ts | PASS |
| WS-F-001 | WS-F | Implement client prediction history buffer | 2026-02-28 | apps/client/src/net/prediction.test.ts | PASS |
| WS-F-002 | WS-F | Implement reconciliation smoothing metrics | 2026-02-28 | apps/client/src/net/reconciliation.test.ts | PASS |
| WS-F-003 | WS-F | Add network impairment simulation controls | 2026-02-28 | apps/client/src/net/impairment.test.ts | PASS |
| WS-G-001 | WS-G | Freeze telemetry schema and benchmark fields | 2026-02-28 | docs/telemetry-schema.md | PASS |
| WS-G-002 | WS-G | Build benchmark scenarios and harness | 2026-02-28 | scripts/benchmark_harness.ts | PASS |
| WS-G-003 | WS-G | Implement SLO gate evaluation | 2026-02-28 | scripts/evaluate_slo_gates.ts | PASS |
| WS-G-004 | WS-G | Run soak tests and release check | 2026-02-28 | scripts/soak_release_check.ts | PASS |

## Workstream Rollup

| Workstream | Status | % Complete | Owner | Current Focus | Next Milestone |
|---|---|---:|---|---|---|
| WS-A Foundation | DONE | 100 | TBD | - | Completed |
| WS-B Protocol | DONE | 100 | TBD | - | Completed |
| WS-C Simulation | DONE | 100 | TBD | Real Rapier backend integrated and verified | Completed |
| WS-D Client | DONE | 100 | TBD | - | Completed |
| WS-E Server | DONE | 100 | TBD | Runtime Rapier authority validation + telemetry integrated | Completed |
| WS-F Netcode | IN PROGRESS | 75 | TBD | Reconciliation deadzone/smoothing retune for hybrid collisions | WS-F-004 |
| WS-G QA/Perf | TODO | 67 | TBD | Hybrid benchmark/gates pending | WS-G-005 |

## Update Rules (2-minute routine)

1. Move tasks between sections (To Do -> In Progress -> Done/Blocked).
2. Update `Counts` and `Overall completion`.
3. For blocked tasks, fill `Blocked By` and `Unblock Plan`.
4. Add one line to `docs/progress-log.md` describing what changed.

## Agent Sync Checklist

1. Edit `docs/agent-task-registry.yaml` only for touched task IDs.
2. Update this board tables for those same IDs.
3. Append one structured entry to `docs/progress-log.md`.
4. Preserve statuses exactly: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.
5. Run validator before handoff: `node --experimental-strip-types scripts/validate_task_registry.ts`.
