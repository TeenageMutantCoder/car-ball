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

### Counts

- TODO: 0
- IN PROGRESS: 0
- BLOCKED: 0
- DONE: 0

## In Progress

| ID | Workstream | Task | Owner | Started | Target | Notes |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## Blocked

| ID | Workstream | Task | Blocked By | Since | Unblock Plan |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

## To Do

| ID | Workstream | Task | Priority | Dependency |
|---|---|---|---|---|
| WS-A-001 | WS-A | Initialize monorepo packages and workspace config | P0 | None |
| WS-B-001 | WS-B | Define protocol schemas and version field | P0 | WS-A-001 |
| WS-C-001 | WS-C | Build fixed-step simulation loop with accumulator | P0 | WS-B-001 |
| WS-D-001 | WS-D | Initialize Babylon client shell and render bridge | P0 | WS-B-001 |
| WS-E-001 | WS-E | Build server room lifecycle and snapshot broadcast | P0 | WS-B-001 |
| WS-F-001 | WS-F | Implement prediction and reconciliation loop | P1 | WS-D-001, WS-E-001 |
| WS-G-001 | WS-G | Set up benchmark and release gate harness | P1 | WS-A-001 |

## Done

| ID | Workstream | Task | Completed | Evidence |
|---|---|---|---|---|
| - | - | - | - | - |

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
