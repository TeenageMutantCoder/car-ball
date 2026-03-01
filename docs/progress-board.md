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

- Last updated: YYYY-MM-DD
- Sprint / Milestone: MVP-1
- Overall completion: 0%
- P0 gate pass rate: 0/0
- Last full benchmark date: YYYY-MM-DD
- Last soak date: YYYY-MM-DD

### Counts

- TODO: 28
- IN PROGRESS: 0
- BLOCKED: 0
- DONE: 0

## Release Gate Summary

| Gate | Threshold | Latest Value | Evidence | Status |
|---|---|---|---|---|
| Frame p95 | <= 16.7ms | - | - | PENDING |
| Physics p95 | <= 6ms | - | - | PENDING |
| Render p95 | <= 9ms | - | - | PENDING |
| Server tick p95/p99 | <= 8.3ms / <= 12ms | - | - | PENDING |
| Corrections/min/player | <= 12 clean, <= 30 at 5% loss | - | - | PENDING |
| Replay drift | <= 0.5% sampled ticks | - | - | PENDING |

## In Progress

| ID | Workstream | Task | Owner | Started | Target | Metrics Snapshot | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - | - | - |

## Blocked

| ID | Workstream | Task | Blocked By | Since | Unblock Plan | Metrics Snapshot |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## To Do

| ID | Workstream | Task | Priority | Dependency |
|---|---|---|---|---|
| WS-A-001 | WS-A | Freeze runtime constants and thresholds | P0 | None |
| WS-A-002 | WS-A | Freeze entity ID ownership semantics | P0 | None |
| WS-B-001 | WS-B | Freeze protocol envelope and versioning policy | P0 | None |
| WS-G-001 | WS-G | Freeze telemetry schema and benchmark fields | P0 | None |
| WS-A-003 | WS-A | Scaffold monorepo packages and scripts | P0 | WS-A-001 |
| WS-A-004 | WS-A | Configure TS project references | P0 | WS-A-003 |
| WS-A-005 | WS-A | Add CI typecheck test build | P0 | WS-A-003 |
| WS-B-002 | WS-B | Define protocol v1 payload types | P0 | WS-A-004, WS-B-001, WS-A-002 |
| WS-B-003 | WS-B | Add protocol roundtrip compatibility tests | P0 | WS-B-002 |
| WS-C-001 | WS-C | Build fixed-step simulation loop | P0 | WS-A-001, WS-A-004 |
| WS-C-002 | WS-C | Implement world entity model | P0 | WS-C-001, WS-A-002, WS-B-002 |
| WS-C-003 | WS-C | Implement controls jump flip boost | P0 | WS-C-002, WS-A-001 |
| WS-C-004 | WS-C | Implement wall and ceiling traction model | P0 | WS-C-003 |
| WS-C-005 | WS-C | Add replay hash and drift assertions | P0 | WS-C-001, WS-B-002 |
| WS-D-001 | WS-D | Initialize Babylon client shell and render bridge | P0 | WS-A-004, WS-B-002 |
| WS-D-002 | WS-D | Implement input bindings and frame emitter | P0 | WS-D-001, WS-B-002, WS-A-001 |
| WS-E-001 | WS-E | Build server room lifecycle | P0 | WS-A-004, WS-B-002 |
| WS-E-002 | WS-E | Implement server tick and snapshot loop | P0 | WS-E-001, WS-C-002, WS-A-001 |
| WS-E-003 | WS-E | Add server validation checks | P0 | WS-E-002, WS-C-003 |
| WS-F-001 | WS-F | Implement client prediction history buffer | P1 | WS-D-002, WS-E-002 |
| WS-F-002 | WS-F | Implement reconciliation smoothing metrics | P1 | WS-F-001, WS-C-005 |
| WS-F-003 | WS-F | Add network impairment simulation controls | P1 | WS-F-002 |
| WS-G-002 | WS-G | Build benchmark scenarios and harness | P1 | WS-G-001, WS-D-004, WS-E-002, WS-F-003 |
| WS-G-003 | WS-G | Implement SLO gate evaluation | P1 | WS-G-002 |
| WS-G-004 | WS-G | Run soak tests and release check | P1 | WS-G-003 |

## Done

| ID | Workstream | Task | Completed | Evidence | Validation |
|---|---|---|---|---|---|
| - | - | - | - | - | PASS/FAIL |

## Workstream Rollup

| Workstream | Status | % Complete | Owner | Current Focus | Next Milestone |
|---|---|---:|---|---|---|
| WS-A Foundation | TODO | 0 | TBD | - | Scaffold merged |
| WS-B Protocol | TODO | 0 | TBD | - | Contracts frozen |
| WS-C Simulation | TODO | 0 | TBD | - | Wall/ceiling drive stable |
| WS-D Client | TODO | 0 | TBD | - | 60 FPS local scene |
| WS-E Server | TODO | 0 | TBD | - | 2v2 room loop stable |
| WS-F Netcode | TODO | 0 | TBD | - | Corrections within threshold |
| WS-G QA/Perf | TODO | 0 | TBD | - | MVP gates automated |

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
