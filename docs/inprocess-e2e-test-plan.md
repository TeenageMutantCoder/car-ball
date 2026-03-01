# Improved In-Process E2E Test Plan

Status: IN_PROGRESS
LastUpdated: 2026-03-01
Owner: WS-E / WS-F

## Goal

Replace smoke-style E2E checks with in-process E2E tests that assert concrete authoritative state changes caused by event processing.

## Test Design Principles

- Keep transport in-process (no sockets) but preserve protocol envelope boundaries (`encodeEvent`/`decodeEvent`).
- Assert before/after state deltas, not just event presence.
- Validate both accepted and rejected event paths.
- Keep scenarios deterministic via fixed `now()` and fixed tick/snapshot rates.

## Scope

- Server runtime event processing and world-state mutation.
- Protocol roundtrip integrity for client/server events.
- Client-facing snapshot ingestion semantics at the adapter boundary.

## Phase 1: Authoritative State Transition E2E

1. Input Accepted -> Car State Changes
   - Arrange room with one player and initial state snapshot.
   - Send valid `client.input` event, tick runtime, capture authoritative snapshot.
   - Assert expected deltas for the controlled car (position/velocity/boost/tick as applicable).

2. Input Rejected -> No Unauthorized State Mutation
   - Send invalid cadence or impossible acceleration event.
   - Assert rejection code and unchanged authoritative car state for that invalid frame.
   - Assert validation telemetry counters increment correctly.

3. Snapshot Sequencing and Match Clock Integrity
   - Advance through multiple ticks and emitted snapshots.
   - Assert monotonically increasing `sequence`, `tick`, and expected `match.tick`/clock behavior.

## Phase 2: Multi-Event Interaction E2E

1. Interleaved Inputs Across Players
   - Two players send ordered inputs in the same room.
   - Assert each car mutates only from its owner’s accepted frames.

2. Disconnect/Reconnect Resync Consistency
   - Disconnect a player, verify input rejection while disconnected.
   - Reconnect, request resync snapshot, and assert snapshot equals current authoritative world tick/state.

3. Goal/Score State Evolution
   - Drive deterministic scenario where goal volume interaction occurs.
   - Assert `scoreByTeam` and match phase transitions are reflected in snapshots.

## Phase 3: Adapter-Level In-Process Flow Assertions

1. Client Input Payload Mapping
   - Assert adapter-produced payload decodes to exact `client.input` fields.

2. Snapshot Ingestion Produces Expected Render State Deltas
   - Feed successive authoritative snapshots into adapter/bridge boundary.
   - Assert render-facing state progression for car and ball values.

3. Non-Snapshot Events Are Ignored Without Side Effects
   - Feed `server.pong`/`server.error` and assert no snapshot mutation.

## Acceptance Criteria

- At least one E2E test per Phase 1 scenario is implemented and passing.
- Every E2E test includes explicit before/after assertions on authoritative state fields.
- Negative-path assertions exist for rejected events and no-op handling.
- Tests run under existing workspace command:
  - `npm test --workspaces --if-present`

## Implementation Progress (2026-03-01)

- Implemented and passing:
   - Phase 1.1 Input Accepted -> Car State Changes
   - Phase 1.2 Input Rejected -> No Unauthorized State Mutation
   - Phase 1.3 Snapshot Sequencing and Match Clock Integrity
   - Phase 2.1 Interleaved Inputs Across Players
   - Phase 2.2 Disconnect/Reconnect Resync Consistency
   - Phase 3.1 Client Input Payload Mapping
   - Phase 3.2 Snapshot Ingestion Produces Expected Render State Deltas
   - Phase 3.3 Non-Snapshot Events Are Ignored Without Side Effects

- Remaining planned item:
   - Phase 2.3 Goal/Score State Evolution

- Blocker for Phase 2.3:
   - Current simulation/runtime does not yet produce goal-volume scoring transitions or authoritative `scoreByTeam` evolution; snapshot score values remain default unless explicitly injected.

## File Targets

- `apps/server/src/inprocess.e2e.test.ts` (reintroduced with improved assertions)
- `apps/client/src/net/inprocess.test.ts` (adapter boundary assertions)
- Optional helper extraction if needed:
  - `apps/server/src/testUtils/`
