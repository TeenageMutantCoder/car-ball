# CarBall Rapier Hybrid Migration Plan

## 1) Purpose

Define a low-risk migration from the current custom fixed-step simulation to a hybrid model that uses Rapier where it adds the most value first (collision/contact quality), while preserving MVP performance and online stability goals.

This plan is standalone and execution-oriented. It complements:
- `docs/implementation-plan-parallel.md` (program-level sequencing)
- `docs/agent-task-registry.yaml` (canonical task state)

## 2) Context and Current Baseline

Current implementation strengths:
- Shared fixed-step sim loop with replay drift tooling.
- Working client/server runtime with prediction/reconciliation and impairment simulation.
- Wall/ceiling traction model and gameplay windows (jump/double-jump/boost) already present.

Current gap against architecture direction:
- No Rapier dependency or runtime integration yet.
- Collision handling remains custom/kinematic and does not provide robust rigid-body contact behavior expected for RL-style car-ball interactions.

## 3) Non-Negotiable Constraints

- Preserve 120Hz server tick and current snapshot/input contracts unless explicitly versioned.
- Maintain MVP SLOs (frame/physics/render/server/reconciliation/replay).
- Avoid broad rewrites that destabilize prediction/reconciliation.
- Keep rollback path available at every phase via feature flags.

## 4) Target End State (Hybrid)

- Cars: custom authoritative movement model remains primary for MVP (traction/jump/flip feel and deterministic-ish replay behavior).
- Ball: Rapier-authoritative rigid-body with collision response against arena and car interaction proxies.
- Networking: server continues as authority, clients reconcile to snapshots with existing smoothing policy tuned for new collision profile.
- Validation: server validation extends to include Rapier-ball consistency and anti-abuse checks.

## 5) Migration Strategy (Phased)

## Phase H1 — Shadow Rapier Collision Layer (No Authority Shift)

Objective:
- Introduce Rapier world in `packages/sim` without changing authoritative outputs.

Scope:
- Add Rapier world lifecycle (init/step/reset) behind feature flags.
- Build arena colliders and ball collider shape/material table.
- Run Rapier in parallel and record divergence metrics against current sim collision outputs.
- Emit shadow telemetry for contact count, penetration depth, and correction deltas.

Exit criteria:
- No regression in current SLOs.
- Replay drift and correction metrics remain at or better than current baseline.
- Shadow telemetry stable across benchmark scenarios.

Rollback:
- Disable flag and revert to current custom collision path only.

## Phase H2 — Ball Authority Shift to Rapier

Objective:
- Move authoritative ball integration/collision response to Rapier while retaining custom car movement authority.

Scope:
- Server tick uses Rapier ball state as source of truth for snapshots.
- Car-to-ball interaction translated into impulses/forces through controlled adapter.
- Preserve existing client interpolation and reconciliation interfaces.
- Extend validation/telemetry for Rapier-ball authority behavior.

Exit criteria:
- Collision quality improves in collision-heavy and wall/ceiling stress scenarios.
- SLO gates pass in two consecutive benchmark runs.
- Correction spikes remain within configured thresholds.

Rollback:
- Feature-flag fallback to custom ball integration path.

## Phase H3 — Optional Car Rigid-Body Pilot

Objective:
- Evaluate whether Rapier car bodies provide net benefit without breaking gameplay feel/perf.

Scope:
- Add pilot mode for Rapier car rigid bodies in controlled environments.
- Keep default path on hybrid (custom cars + Rapier ball) until gates pass.
- Compare gameplay feel metrics and correction/stability metrics to hybrid baseline.

Exit criteria:
- Performance and netcode stability remain within MVP thresholds.
- Gameplay feel accepted in scripted and manual checks.
- Clear recommendation to either adopt or defer full car-body authority.

Rollback:
- Keep hybrid path as production default.

## 6) Feature Flags and Runtime Controls

Required flags:
- `sim.rapier.enabled` — enables Rapier world boot/step.
- `sim.rapier.shadowMode` — runs Rapier non-authoritatively and emits comparison telemetry.
- `sim.rapier.ballAuthority` — toggles authoritative ball state from Rapier.
- `sim.rapier.carBodyPilot` — enables optional car body pilot path.

Rules:
- Flags default to safest mode (`enabled=false` in production baseline).
- Flag state must be included in benchmark and soak artifacts.

## 7) Telemetry Additions

Add fields to shared telemetry envelope:
- `rapier.stepMs.p50/p95/p99`
- `rapier.contactCount`
- `rapier.penetrationDepthCm.p95`
- `rapier.ballStateDeltaCm.p95/p99` (shadow vs authoritative path)
- `rapier.ballVelocityDeltaCmPerSec.p95`
- `rapier.fallbackCount` (flagged fallback path activations)

These are additive fields and must not break existing consumers.

## 8) Test and Validation Matrix

Per phase, run:
- Unit tests: sim adapters, collision mapping, serialization invariants.
- Integration tests: server tick/snapshot correctness with feature flags on/off.
- Benchmarks: `1v1_baseline`, `2v2_collision_heavy`, `wall_ceiling_stress`, `impairment_matrix`.
- Soak: two consecutive cycles for target modes.

Additional checks:
- A/B comparison reports for custom vs hybrid correction metrics.
- Replay drift reports with and without Rapier paths.

Impairment-model assumptions for benchmark/gate runs:
- `loss_5pct` models reliable transport packet loss as delayed retransmission, not permanent input-frame loss.
- Replay drift metrics compare equivalent authoritative input streams (determinism signal), while network impairment impact is evaluated via correction metrics.
- These assumptions must remain explicit in benchmark harness comments and any future gate-threshold updates.

## 9) Risks and Mitigations

1. Determinism/replay drift increase
- Mitigation: keep authority shift incremental; gate by drift metrics before each phase exit.

2. Server tick budget regressions
- Mitigation: profile Rapier step costs; tune collider complexity and substep limits.

3. Gameplay feel degradation
- Mitigation: keep custom car authority through MVP; pilot car rigid bodies separately.

4. Reconciliation artifact spikes
- Mitigation: tune reconciliation deadzone/smoothing using hybrid-only telemetry slices.

## 10) Workstream Ownership

- WS-C (Simulation): Rapier world, collision adapters, ball authority integration.
- WS-E (Server): runtime authority wiring, snapshot semantics, validation integration.
- WS-F (Netcode): reconciliation tuning and correction thresholds for new collision profile.
- WS-G (QA-Perf): benchmark/soak updates, gate automation, release recommendation.

## 11) Go/No-Go Decision Framework

Go forward to next phase only when all are true:
- No P0 SLO regressions in two consecutive runs.
- Correction and drift metrics are at or better than phase baseline.
- No unresolved P0 gameplay regressions in collision-heavy scenarios.

No-go and hold phase if any condition fails twice consecutively.

## 12) Deliverables Checklist

- Implementation notes and assumptions documented.
- Feature flags wired and testable in CI/local runs.
- Benchmarks and soak artifacts include Rapier fields.
- Registry tasks updated with evidence and completion timestamps.
- Release recommendation generated with explicit phase outcome.
