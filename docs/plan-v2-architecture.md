# RL-Style Web Game Architecture Plan V2

## Overview

This plan keeps the original stack direction (Babylon.js + Rapier + shared simulation), while reducing ambiguity with explicit simulation/network contracts, measurable performance budgets, and migration gates from client-authoritative validation to server-authoritative competitive play.

This document is the architecture companion to `docs/implementation-plan-parallel.md` and task status in `docs/agent-task-registry.yaml`.

Target scope: desktop browser, 1v1/2v2, RL-like control feel.

## Current Status (Synced)

Completed from registry:
- WS-A-001, WS-A-002, WS-A-003, WS-A-004, WS-A-005
- WS-B-001, WS-B-002, WS-B-003
- WS-C-001, WS-C-002, WS-C-003, WS-C-004
- WS-C-005
- WS-D-001, WS-D-002, WS-D-003, WS-D-004
- WS-E-001, WS-E-002, WS-E-003, WS-E-004
- WS-F-001, WS-F-002, WS-F-003
- WS-G-001, WS-G-002, WS-G-003, WS-G-004

Primary artifacts already created:
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
- `packages/sim/src/traction.test.ts`
- `packages/sim/src/replayDrift.test.ts`
- `scripts/benchmark_harness.ts`
- `scripts/evaluate_slo_gates.ts`
- `scripts/soak_release_check.ts`

## Steps (Architecture to Implementation Mapping)

1. Freeze G0 contracts and telemetry fields using:
  - `docs/runtime-constants.md`
  - `docs/protocol-envelope.md`
  - `docs/telemetry-schema.md`
2. Use npm workspaces monorepo (`package.json` workspaces) with shared packages:
  - `apps/client`
  - `apps/server`
  - `packages/protocol`
  - `packages/sim`
3. Maintain deterministic-style simulation core in:
  - `packages/sim/src/simulation.ts`
  - `packages/sim/src/state.ts`
  - `packages/sim/src/tick.ts`
4. Continue simulation expansion with pending tasks:
  - `WS-C-002` world entity model
  - `WS-C-003` controls/jump/flip/boost windows
  - `WS-C-004` wall/ceiling traction model
  - `WS-C-005` replay drift assertions
5. Continue client/server runtime build-out with pending tasks:
  - `WS-D-001` through `WS-D-004`
  - `WS-E-001` through `WS-E-004`
6. Add netcode prediction/reconciliation and impairment tooling:
  - `WS-F-001` through `WS-F-003`
7. Add benchmarking and release-gate automation:
  - `WS-G-002` through `WS-G-004`
8. Maintain migration gate in `docs/netcode-roadmap.md` for transition toward server-authoritative simulation based on correction/error thresholds.

## Verification

- Unit/integration tests in `packages/sim/tests` for replay consistency, jump/flip timing windows, boost invariants, and goal detection.
- Soak tests (10–20 min matches) with synthetic packet loss/jitter; verify correction frequency and error bounds remain within targets.
- Browser performance checks on Chrome/Firefox/Edge desktop with acceptance budget:
  - frame time p95 <= 16.7 ms
  - physics p95 <= 6 ms
  - render p95 <= 9 ms
  - correction spikes bounded during collision bursts
- Manual gameplay checks for wall/ceiling drivable continuity, aerial controllability, and camera stability under rapid transitions.

## Decisions

- Use Rapier for physics performance/stability, with explicit note that cross-platform bit-exact determinism is not required; stable replay parity is the target.
- Keep client-authoritative + server validation for V1 speed, but predefine migration triggers and shared `sim` boundaries to avoid rewrite risk.
- Lock MVP to desktop 60 FPS and 1v1/2v2 only; defer 3v3+, mobile, and cosmetic systems until performance/error gates pass.
- Enforce concrete performance SLOs from day one rather than optimizing later.

## Source of Truth

- Task status and dependencies: `docs/agent-task-registry.yaml`
- Parallel execution plan: `docs/implementation-plan-parallel.md`
- Architecture baseline: this file
