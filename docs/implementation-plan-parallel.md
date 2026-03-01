# CarBall Technical Implementation Plan (Parallel Workstreams)

## 1) Goal and Constraints

Build an MVP Rocket League-style web game for desktop browsers with:
- 1v1 and 2v2 support
- 60 FPS target on mid-range desktop hardware
- Drivable walls and ceiling
- Shared simulation package used by both client and server
- Phase-1 networking: client-authoritative input with strict server validation

## 1.1) Status Snapshot (Synced with Registry)

Current completed tasks (see `docs/agent-task-registry.yaml` for authoritative state):
- `WS-A-001`, `WS-A-002`, `WS-A-003`, `WS-A-004`, `WS-A-005`
- `WS-B-001`, `WS-B-002`, `WS-B-003`
- `WS-C-001`, `WS-C-002`, `WS-C-003`, `WS-C-004`
- `WS-C-005`
- `WS-D-001`, `WS-D-002`, `WS-D-003`, `WS-D-004`
- `WS-E-001`, `WS-E-002`, `WS-E-003`, `WS-E-004`
- `WS-F-001`, `WS-F-002`
- `WS-F-003`
- `WS-G-001`, `WS-G-002`, `WS-G-003`, `WS-G-004`

Completed artifacts aligned to those tasks:
- `docs/runtime-constants.md`
- `docs/entity-ownership.md`
- `docs/protocol-envelope.md`
- `docs/telemetry-schema.md`
- `.github/workflows/ci.yml`
- `apps/client/src/main.ts`
- `apps/client/src/input/frameEmitter.ts`
- `apps/client/src/render/camera.ts`
- `apps/client/src/debug/hud.ts`
- `apps/client/src/net/prediction.ts`
- `apps/client/src/net/reconciliation.ts`
- `apps/client/src/net/impairment.ts`
- `apps/server/src/runtime.ts`
- `apps/server/src/validation.ts`
- `apps/server/src/runtime.reconnect.test.ts`
- `packages/sim/src/tick.jump.test.ts`
- `packages/sim/src/tick.traction.test.ts`
- `packages/sim/src/replayDrift.test.ts`
- `scripts/benchmark_harness.ts`
- `scripts/evaluate_slo_gates.ts`
- `scripts/soak_release_check.ts`

All baseline tasks in `docs/agent-task-registry.yaml` are currently `DONE`.

Hybrid migration follow-up tasks are tracked as new `TODO` items in the registry and detailed in:
- `docs/rapier-hybrid-migration-plan.md`

## 2) Parallelization Strategy

Work is split into independent workstreams with explicit contracts. Teams can move in parallel after a short alignment phase.

### Execution Gates (Required Before Next Phase)

- `G0 Contract Freeze` (day 0-2)
   - Freeze runtime constants: `tickRate`, `snapshotRate`, `inputRate`, `maxSubsteps`, `reconcileThreshold`.
   - Freeze protocol envelope: sequence/timestamp/version and message headers.
   - Freeze entity identity model: player/car/ball/team/goal IDs and ownership semantics (see `docs/entity-ownership.md`).
   - Freeze telemetry schema: frame, physics, render, correction, server tick metrics.

- `G1 Build Graph Ready` (day 2-4)
   - Monorepo builds in dependency order with project references.
   - CI runs typecheck, tests, and build checks.
   - Protocol v1 contracts and compatibility tests pass.

- `G2 Simulation Spine + Runtime Shells` (day 4-8)
   - Fixed-step simulation loop and replay harness are running.
   - Client snapshot ingest and server room tick/broadcast skeletons are running.

- `G3 Online Vertical Slice` (day 8-12)
   - End-to-end 1v1 loop works: join, start, play, score, end.
   - Prediction/reconciliation and reconnect/resync are operational.

- `G4 Quality/Performance Release Gate` (day 12+)
   - SLO gates pass for required browser/network scenarios.
   - Two consecutive soak cycles pass for 1v1 and 2v2.

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

## 4.2) Hidden Dependencies (Watchlist)

- Constants churn risk: changes to runtime constants after `G0` cascade across sim/server/client/netcode.
- Identity mismatch risk: inconsistent ownership/entity ID assumptions cause hard-to-debug desync.
- Telemetry lateness risk: missing shared metric fields blocks comparable performance gating.
- Replay variance risk: deterministic replay expectations can fail across platforms if not drift-bounded.
- Tick/snapshot coupling risk: server timing decisions directly affect interpolation/reconciliation behavior.

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

## 8.1) Measurable Release SLOs (Go/No-Go)

- Client performance (required browsers: Chrome, Firefox, Edge)
   - Frame time `p95 <= 16.7ms`
   - Physics time `p95 <= 6ms`
   - Render time `p95 <= 9ms`

- Server stability
   - Tick duration `p95 <= 8.3ms`, `p99 <= 12ms` at 120Hz
   - Missed ticks `< 0.5%` over 20-minute soak

- Reconciliation quality
   - Clean network: corrections `<= 12/min/player`
   - 5% packet loss: corrections `<= 30/min/player`
   - Correction magnitude `p95 <= 20cm`, `p99 <= 60cm`, max `<= 120cm`

- Simulation replay stability
   - Drift rate `<= 0.5%` sampled ticks over 10-minute scripted replay
   - End-of-run drift: car `<= 15cm`, ball `<= 25cm`

- Memory and runtime health
   - Client long tasks (`>50ms`) `<= 3` per 10 minutes
   - Client heap growth slope `<= 5MB` per 10-minute soak after warm-up
   - Server RSS growth `<= 8%` over 20-minute soak

No-go if any P0 SLO fails in two consecutive benchmark runs.

## 9) Medium Task Slices (Parallel-Ready Backlog)

These slices are intended for 1-2 day execution units and should be mirrored in the registry as needed.

- `T-G0-001` Freeze runtime constants and reconciliation thresholds (deps: none)
- `T-G0-002` Freeze protocol envelope fields and versioning policy (deps: none)
- `T-G0-003` Freeze entity ID and ownership semantics (deps: none)
- `T-G0-004` Freeze telemetry schema for client/server/QA (deps: none)

- `T-G1-001` Scaffold workspace packages and root scripts (deps: `T-G0-001`)
- `T-G1-002` Add TS project references and deterministic build order (deps: `T-G1-001`)
- `T-G1-003` Add CI typecheck/test/build pipeline (deps: `T-G1-001`)
- `T-G1-004` Define protocol v1 types and events (deps: `T-G0-002`, `T-G1-002`)
- `T-G1-005` Add protocol roundtrip/compat tests (deps: `T-G1-004`)

- `T-G2-001` Implement fixed-step sim loop + catch-up cap (deps: `T-G0-001`, `T-G1-002`)
- `T-G2-002` Implement world entity model (deps: `T-G0-003`, `T-G2-001`, `T-G1-004`)
- `T-G2-003` Implement car control model + boost/jump/flip windows (deps: `T-G2-002`)
- `T-G2-004` Implement wall/ceiling adhesion + detach model (deps: `T-G2-003`)
- `T-G2-005` Add replay hash harness + drift assertions (deps: `T-G2-001`, `T-G1-004`)

- `T-G3-001` Implement server room lifecycle (deps: `T-G1-002`, `T-G1-004`)
- `T-G3-002` Implement server tick + snapshot broadcast loop (deps: `T-G3-001`, `T-G2-002`, `T-G0-001`)
- `T-G3-003` Implement client interpolation bridge (deps: `T-G2-001`, `T-G3-002`)
- `T-G3-004` Add client/server telemetry emitters (deps: `T-G0-004`, `T-G3-002`)

- `T-G4-001` Implement client prediction history + replay (deps: `T-G2-003`, `T-G3-002`)
- `T-G4-002` Implement reconciliation deadzone/smoothing + correction metrics (deps: `T-G4-001`, `T-G2-005`)
- `T-G4-003` Implement server validation checks (deps: `T-G3-002`, `T-G2-003`)
- `T-G4-004` Implement reconnect/resync flow (deps: `T-G3-002`, `T-G1-004`)
- `T-G4-005` Add impairment matrix + automated SLO checks (deps: `T-G4-002`, `T-G3-004`, `T-G1-003`)

## 9.1) Hybrid Rapier Migration Task Slices

Detailed standalone plan:
- `docs/rapier-hybrid-migration-plan.md`

Execution slices (1-2 day units, registry-backed):

- `T-HYB-001` Add Rapier world bootstrap in shadow mode (deps: `T-G2-005`, `T-G1-004`)
- `T-HYB-002` Add arena/ball colliders and material table (deps: `T-HYB-001`)
- `T-HYB-003` Emit Rapier shadow telemetry and divergence metrics (deps: `T-HYB-001`, `T-G0-004`)
- `T-HYB-004` Shift ball authority to Rapier on server tick path (deps: `T-HYB-002`, `T-G3-002`)
- `T-HYB-005` Extend server validation for Rapier-authoritative ball states (deps: `T-HYB-004`, `T-G4-003`)
- `T-HYB-006` Tune reconciliation thresholds for hybrid collision profile (deps: `T-HYB-004`, `T-G4-002`)
- `T-HYB-007` Add hybrid benchmark and SLO gate variants (deps: `T-HYB-003`, `T-HYB-006`, `T-G4-005`)
- `T-HYB-008` Run two-cycle hybrid soak and release recommendation (deps: `T-HYB-007`)

Mapping to workstreams:
- Simulation-heavy: `T-HYB-001`, `T-HYB-002`, `T-HYB-004`
- Server-heavy: `T-HYB-005`
- Netcode-heavy: `T-HYB-006`
- QA/Perf-heavy: `T-HYB-003`, `T-HYB-007`, `T-HYB-008`
