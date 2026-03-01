# RL-Style Web Game Architecture Plan V2

## Overview

This plan keeps the original stack direction (Babylon.js + Rapier + shared simulation), while reducing ambiguity with explicit simulation/network contracts, measurable performance budgets, and migration gates from client-authoritative validation to server-authoritative competitive play.

Target scope: desktop browser, 1v1/2v2, RL-like control feel.

## Steps

1. Create architecture and constraints docs in `docs/architecture.md` and `docs/performance-budget.md` defining fixed contracts for `tickRate`, `snapshotRate`, `inputBufferMs`, `maxSubsteps`, and `reconcileThreshold`.
2. Initialize monorepo separation with `apps/client/package.json`, `apps/server/package.json`, `packages/sim/package.json`, and `pnpm-workspace.yaml` so `sim` is shared unchanged by client/server.
3. Implement deterministic-style simulation loop in `packages/sim/src/world.ts` with fixed tick at 120 Hz, accumulator clamp, and hard cap on catch-up steps to avoid frame-spiral stalls.
4. Implement physics adapter in `packages/sim/src/physics/rapier.ts` with explicit wall/ceiling handling rules: adhesion/downforce range, traction curve, detach threshold, and transition smoothing timers.
5. Define gameplay rules in `packages/sim/src/gameplay/jumpFlip.ts`, `packages/sim/src/gameplay/boost.ts`, and `packages/sim/src/gameplay/scoring.ts` with numeric windows for jump, double-jump, flip lockout, and boost refill/depletion.
6. Build render bridge in `apps/client/src/main.ts` and `apps/client/src/render/rendererBridge.ts` so rendering interpolates authoritative sim snapshots and never mutates sim state directly.
7. Implement phase-1 netcode in `apps/server/src/room.ts` and `apps/client/src/net/clientNet.ts`: client input stream at 60 Hz, server snapshot broadcast at 20–30 Hz, strict server validation for impossible acceleration/boost/cooldown states.
8. Add reconciliation policy in `apps/client/src/net/reconcile.ts` with deadzone + smoothing rules; track `positionErrorCm`, `velocityError`, and corrections/sec for tuning.
9. Add performance instrumentation in `packages/sim/src/debug/metrics.ts`, `apps/client/src/debug/hud.ts`, and `apps/server/src/telemetry.ts` to log physics ms, render ms, net ms, GC spikes, and desync rates.
10. Define migration gate in `docs/netcode-roadmap.md`: switch to server-authoritative simulation when correction/error thresholds exceed targets in production-like tests or when matchmaking becomes ranked/competitive.

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
