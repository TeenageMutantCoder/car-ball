# CarBall Technical Implementation Plan (Parallel Workstreams)

## 1) Goal and Constraints

Build an MVP Rocket League-style web game for desktop browsers with:
- 1v1 and 2v2 support
- 60 FPS target on mid-range desktop hardware
- Drivable walls and ceiling
- Shared simulation package used by both client and server
- Phase-1 networking: client-authoritative input with strict server validation

## 2) Parallelization Strategy

Work is split into independent workstreams with explicit contracts. Teams can move in parallel after a short alignment phase.

### Multi-Agent Coordination Protocol

To support concurrent AI agents safely:

1. Canonical task state lives in `docs/agent-task-registry.yaml`.
2. Human dashboard view lives in `docs/progress-board.md`.
3. Chronological audit trail lives in `docs/progress-log.md`.
4. Agents must update in this order:
   - Update registry task(s)
   - Sync dashboard rows/counts
   - Append progress log entry
5. Agents must only edit task IDs they touched and must not rename IDs.
6. Agents must run `node --experimental-strip-types scripts/validate_task_registry.ts` before handoff or merge.

This protocol minimizes merge conflicts and makes status machine-readable.

### Alignment Phase (Critical, 1-2 days)

These are mandatory before parallel execution:
1. Finalize simulation contract values:
   - `tickRate = 120`
   - `snapshotRate = 20-30`
   - `inputRate = 60`
   - `maxSubsteps`
   - `reconcileThreshold`
2. Freeze shared schemas for:
   - Input frames
   - Authoritative snapshots
   - Entity IDs and team/goal metadata
3. Define performance SLOs and telemetry fields:
   - frame p95 <= 16.7ms
   - physics p95 <= 6ms
   - render p95 <= 9ms
   - correction frequency threshold
4. Create monorepo skeleton and package boundaries.

No feature stream starts until these contracts are frozen.

---

## 3) Workstream Breakdown

## WS-A: Monorepo and Tooling Foundation

### Scope
Create project structure, build/test tooling, and CI baseline.

### Detailed Instructions
1. Create workspace packages:
   - `apps/client`
   - `apps/server`
   - `packages/sim`
   - `packages/protocol`
2. Configure package manager workspace and scripts:
   - root scripts for `dev`, `build`, `test`, `lint`, `typecheck`
3. Add TypeScript project references so `packages/protocol` and `packages/sim` build first.
4. Set up linting/formatting and pre-commit hooks.
5. Set up CI jobs:
   - typecheck
   - unit tests
   - build verification

### Deliverables
- Working monorepo with deterministic install/build
- CI green on first scaffold

### Dependencies
- None (starts immediately)

### Done Criteria
- Any developer can clone, install, and run all packages with one command.

---

## WS-B: Protocol and Shared Contracts

### Scope
Define all client/server/sim schemas and versioning rules.

### Detailed Instructions
1. Define protocol package exports:
   - `InputFrame`
   - `Snapshot`
   - `MatchState`
   - `ServerEvent` and `ClientEvent`
2. Add sequence numbers and timestamps to all networked messages.
3. Add schema version field and compatibility check policy.
4. Add serialization strategy:
   - Start with JSON for developer velocity
   - Add optional binary encoder abstraction behind shared interface
5. Add protocol unit tests:
   - Encode/decode roundtrip
   - Unknown field handling
   - Version mismatch behavior

### Deliverables
- Stable contract package consumed by client/server/sim

### Dependencies
- WS-A base project structure

### Done Criteria
- Protocol package can be bumped independently with clear changelog semantics.

---

## WS-C: Simulation Core and Physics

### Scope
Build fixed-step world simulation and Rapier integration, including wall/ceiling drive model.

### Detailed Instructions
1. Implement simulation loop in `packages/sim`:
   - Fixed timestep accumulator
   - Catch-up cap to prevent spiral of death
2. Implement entity model:
   - Car rigid body state
   - Ball rigid body state
   - Arena/goal volumes
3. Implement wall/ceiling traction model:
   - Surface normal alignment
   - Adhesion/downforce term
   - Detach threshold by speed/angle
4. Implement car controls mapping:
   - throttle/steer/brake
   - jump/double-jump/flip windows
   - boost force and resource drain
5. Implement collisions and material tuning:
   - car-ground
   - car-wall/ceiling
   - car-ball
6. Add deterministic-style replay harness:
   - Seeded input script playback
   - State hash snapshots per N ticks

### Deliverables
- Headless simulation package with reproducible behavior targets

### Dependencies
- WS-B contracts for input/output shape

### Done Criteria
- Replay tests pass within acceptable numeric drift bounds.
- Car can drive on floor, walls, and ceiling with smooth transitions.

---

## WS-D: Client Rendering and Input Layer

### Scope
Build Babylon scene, camera system, and client runtime that consumes sim snapshots.

### Detailed Instructions
1. Initialize Babylon scene and arena rendering assets.
2. Implement render bridge:
   - Render interpolation from sim snapshots
   - No direct render-to-sim mutation
3. Implement input system and bindings from README control scheme.
4. Implement camera modes:
   - forward camera
   - ball camera
   - camera toggle key behavior
5. Implement local debug HUD:
   - fps
   - frame time
   - correction count
   - ping
6. Add render quality tiers (low/medium/high) with conservative default.

### Deliverables
- Playable local client driven by simulation snapshots

### Dependencies
- WS-B message contracts
- WS-C sim outputs

### Done Criteria
- Stable 60 FPS on target hardware in isolated local match scene.

---

## WS-E: Server Runtime and Match Orchestration

### Scope
Create real-time server process, rooms, state broadcast, and validation logic.

### Detailed Instructions
1. Build room lifecycle:
   - create/join/leave
   - ready/start/end match
2. Implement input ingestion pipeline:
   - sequence handling
   - stale frame rejection
   - basic anti-spam limits
3. Implement validation checks:
   - impossible acceleration
   - invalid boost consumption
   - cooldown abuse
4. Broadcast authoritative snapshots at contract rate.
5. Implement reconnect behavior and state resync.
6. Add server telemetry:
   - tick duration
   - room count
   - packet rates
   - correction-trigger events

### Deliverables
- Multiplayer server supporting 1v1 and 2v2 rooms

### Dependencies
- WS-B contracts
- WS-C simulation integration

### Done Criteria
- Two clients can complete full match loop with stable sync under normal network.

---

## WS-F: Netcode Prediction and Reconciliation

### Scope
Implement client prediction/reconciliation with smooth correction behavior.

### Detailed Instructions
1. Implement local input prediction immediately on key events.
2. Store rolling input history buffer with sequence IDs.
3. On authoritative snapshot:
   - compare local predicted state
   - calculate position/velocity error
   - apply deadzone and smooth correction policy
4. Implement correction metrics:
   - corrections per minute
   - average correction magnitude
   - max correction spike
5. Implement packet impairment simulation toggles:
   - latency
   - jitter
   - packet loss

### Deliverables
- Playable online feel with bounded correction artifacts

### Dependencies
- WS-D client runtime
- WS-E snapshot stream

### Done Criteria
- Corrections remain under agreed thresholds in 5-10% packet loss tests.

---

## WS-G: QA, Performance, and Release Gates

### Scope
Own test plans, benchmarks, regression checks, and MVP go/no-go criteria.

### Detailed Instructions
1. Build automated test matrix:
   - unit tests for sim/gameplay
   - protocol tests
   - integration smoke tests
2. Create performance benchmark scenarios:
   - 1v1 baseline
   - 2v2 collision-heavy sequence
   - wall/ceiling transition stress
3. Define release gates for MVP:
   - SLO pass rates
   - sync stability
   - no critical gameplay rule regressions
4. Create bug triage workflow with severity and owner mapping.
5. Run soak tests (10-20 minutes per session) and publish reports.

### Deliverables
- Repeatable quality and performance validation pipeline

### Dependencies
- Partial outputs from WS-C, WS-D, WS-E, WS-F

### Done Criteria
- MVP passes all release gates for two consecutive test cycles.

---

## 4) Dependency Graph (Who Can Start When)

- Day 1: WS-A starts immediately.
- After WS-A scaffold: WS-B starts.
- After WS-B contracts freeze: WS-C, WS-D, WS-E start in parallel.
- After WS-D and WS-E produce first online loop: WS-F starts.
- WS-G starts early for harness setup, then runs continuously as streams land.

Critical path: WS-A -> WS-B -> (WS-C + WS-E) -> WS-F -> MVP gate.

## 4.1) Task ID Contract

- Task IDs are immutable and globally unique (example: `WS-C-001`).
- New tasks must use the next numeric suffix within the workstream.
- Dependencies must reference IDs, not free text.
- Status values are restricted to: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

If a task is `BLOCKED`, `blocked_by` and `unblock_plan` are required in the registry.

## 5) Integration Cadence

Use short integration windows to avoid long-lived divergence.

- Daily:
  - Merge contract-safe changes only
  - Run typecheck + targeted tests
- Twice weekly:
  - End-to-end multiplayer integration session
  - Replay and performance dashboard review
- Weekly:
  - Re-baseline tuning constants and correction thresholds

## 6) Handoff Contracts

Each stream must provide these artifacts before handoff:

- API/contract summary (inputs, outputs, version)
- Runtime assumptions (tick rates, timing windows, limits)
- Test evidence and known limitations
- Telemetry fields emitted

No handoff is accepted without these artifacts.

## 7) Risk Register and Mitigations

1. Wall/ceiling behavior feels unstable
   - Mitigation: isolate traction constants, build scripted transition tests, tune with telemetry.
2. Reconciliation jitter too visible
   - Mitigation: tune deadzones/smoothing, reduce snapshot noise, improve interpolation strategy.
3. Server CPU spikes in collision-heavy play
   - Mitigation: profile hot paths, cap room count per process, reduce expensive validations.
4. Contract churn blocks parallel teams
   - Mitigation: freeze protocol early, use additive versioning, schedule contract review windows.

## 8) Definition of MVP Complete

MVP is complete only when all conditions hold:
- 1v1 and 2v2 are playable end-to-end
- Drivable floor/wall/ceiling transitions are reliable
- Performance SLOs are met on target desktop browsers
- Correction and desync metrics remain under agreed thresholds
- Regression suite and soak tests pass for two consecutive cycles
