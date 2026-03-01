# Netcode Migration Roadmap

Status: ACTIVE
LastUpdated: 2026-03-01
Owner: WS-F / WS-E

## Current Runtime State

- Implemented today: in-process server runtime loop with protocol envelope encode/decode coverage and deterministic snapshot emission.
- Implemented today: client prediction/reconciliation/impairment modules with unit tests.
- In-process E2E smoke path was removed pending stronger state-transition-focused coverage.
- Not yet implemented: live socket transport wiring between browser client and server process.

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

### Phase 0: In-Process E2E Baseline (Planned Refresh)

- Reintroduce in-process E2E with explicit before/after authoritative state assertions.
- Track implementation from `docs/inprocess-e2e-test-plan.md`.

### Phase 1: Minimal Live Transport

- Add minimal server network listener with protocol envelope validation.
- Add client transport adapter that forwards emitted input frames and ingests server snapshots.
- Preserve existing protocol types and runtime contracts.

### Phase 2: Authoritative Reconciliation Enforcement

- Ensure snapshot ingestion path feeds reconciliation metrics in live loop.
- Gate release on correction/error thresholds from this document.

### Phase 3: Competitive Hardening

- Add anti-abuse ownership/session enforcement and stricter cadence checks in transport path.
- Extend reconnect/resync coverage to multi-client impairment scenarios.

## Evidence Links

- `docs/inprocess-e2e-test-plan.md`
- `apps/client/src/net/inprocess.ts`
- `apps/client/src/net/inprocess.test.ts`
- `scripts/evaluate_slo_gates.ts`
- `scripts/soak_release_check.ts`
