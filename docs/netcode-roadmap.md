# Netcode Migration Roadmap

Status: ACTIVE
LastUpdated: 2026-03-01
Owner: WS-F / WS-E

## Current Runtime State

- Implemented today: in-process server runtime loop with protocol envelope encode/decode coverage and deterministic snapshot emission.
- Implemented today: client prediction/reconciliation/impairment modules with unit tests.
- Implemented today: refreshed in-process E2E suite with explicit authoritative state-transition assertions.
- Implemented today: minimal live socket transport wiring between client and server with envelope validation and snapshot fanout.
- Implemented today: transport-path session/ownership enforcement and inbound monotonic cadence checks.
- Implemented today: runnable server entrypoint script that boots runtime + transport and binds a room/player set.
- Implemented today: client WebSocket transport module and networked Babylon bootstrap wiring for live input/snapshot flow.

## Migration Gate Metrics

Move from client-authoritative+validation toward server-authoritative simulation when all conditions hold for at least 2 consecutive soak cycles:

1. Correction frequency:
   - clean: <= 12 corrections/min/player
   - 5% loss: <= 30 corrections/min/player
2. Correction magnitude:
   - p95 <= 20cm
   - p99 <= 60cm
   - max <= 120cm
3. Replay drift:
   - sampled drift rate <= 0.5%
   - end drift <= 15cm (car), <= 25cm (ball)
4. Performance:
   - frame p95 <= 16.7ms
   - physics p95 <= 6ms
   - render p95 <= 9ms
   - server tick p95 <= 8.3ms, p99 <= 12ms

## Phased Delivery

### Phase 0: In-Process E2E Baseline (Completed)

- Reintroduced in-process E2E with explicit before/after authoritative state assertions.
- Coverage includes accepted input mutation, rejected input no-op guarantees, and snapshot monotonic sequencing checks.

### Phase 1: Minimal Live Transport (Completed)

- Added server network listener with protocol envelope validation (`server.error` on malformed/version-mismatch input).
- Added client live transport adapter that forwards encoded input frames and ingests server snapshots.
- Added runnable server startup command (`@car-ball/server` `npm run start`).
- Added client WebSocket transport implementation and networked scene bootstrap helper.
- Preserved existing protocol event types and runtime contracts.

### Phase 2: Authoritative Reconciliation Enforcement (Partial)

- Snapshot ingestion now records correction telemetry (thresholded) in the live client adapter path.
- Release gating remains tied to benchmark and soak artifacts evaluated by existing SLO scripts.

### Phase 3: Competitive Hardening (Partial)

- Added anti-abuse session binding enforcement (`session playerId` and `playerId -> carId` ownership checks) in transport path.
- Added stricter transport cadence checks (monotonic inbound sequence and timestamp validation).
- Multi-client reconnect/resync impairment expansion remains open.

## Evidence Links

- `docs/inprocess-e2e-test-plan.md`
- `apps/client/src/net/inprocess.ts`
- `apps/client/src/net/inprocess.test.ts`
- `apps/client/src/net/live.ts`
- `apps/client/src/net/live.test.ts`
- `apps/client/src/net/websocket.ts`
- `apps/client/src/net/websocket.test.ts`
- `apps/client/src/main.ts`
- `scripts/evaluate_slo_gates.ts`
- `scripts/soak_release_check.ts`
- `apps/server/src/inprocess.e2e.test.ts`
- `apps/server/src/transport.ts`
- `apps/server/src/transport.test.ts`
- `apps/server/src/start.ts`
