import assert from "node:assert/strict";
import test from "node:test";

import { decodeEvent, encodeEvent, type Snapshot } from "@car-ball/protocol";

import { createLiveClientNet } from "./live.ts";

function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    sequence: 1,
    timestamp: 10_000,
    tick: 8,
    match: {
      matchId: "room-live:match:runtime",
      phase: "playing",
      tick: 8,
      scoreByTeam: {
        "team:blue": 0,
        "team:orange": 0,
      },
      timeRemainingMs: 290_000,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 100,
      },
    ],
    ball: {
      id: "ball:main",
      position: { x: 0, y: 0, z: 1.5 },
      velocity: { x: 0, y: 0, z: 0 },
    },
    ...overrides,
  };
}

test("live client net encodes protocol-compliant input and ping payloads", () => {
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
      now: () => 5_000,
    },
  );

  const inputPayload = net.encodeInputFrame({
    version: 1,
    sequence: 3,
    timestamp: 4_999,
    tick: 12,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false,
    },
  });
  const inputDecoded = decodeEvent(inputPayload);
  assert.equal(inputDecoded.type, "client.input");
  assert.equal(inputDecoded.sequence, 3);

  const pingPayload = net.encodePing(4);
  const pingDecoded = decodeEvent(pingPayload);
  assert.equal(pingDecoded.type, "client.ping");
  assert.equal(pingDecoded.sequence, 4);
  assert.equal(pingDecoded.clientTimeMs, 5_000);
});

test("live client net applies snapshot payloads and ignores non-snapshot events", () => {
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
    },
  );

  const snapshotPayload = encodeEvent({
    type: "server.snapshot",
    ...createSnapshot({ tick: 10 }),
  });

  const pongPayload = encodeEvent({
    type: "server.pong",
    version: 1,
    sequence: 11,
    timestamp: 10_001,
    clientTimeMs: 10_000,
    serverTimeMs: 10_001,
  });

  assert.equal(net.ingestServerPayload(snapshotPayload), 10);
  assert.equal(net.ingestServerPayload(pongPayload), null);
});

test("live client net records correction metrics when authoritative snapshot exceeds threshold", () => {
  let nowMs = 20_000;
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
      now: () => nowMs,
      reconcileThresholdCm: 20,
      getPredictedPosition: () => ({ x: 0, y: 0, z: 0 }),
    },
  );

  const smallErrorPayload = encodeEvent({
    type: "server.snapshot",
    ...createSnapshot({
      tick: 11,
      cars: [
        {
          id: "car:player-1",
          ownerPlayerId: "player-1",
          teamId: "team:blue",
          position: { x: 0.1, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          boost: 100,
        },
      ],
    }),
  });
  net.ingestServerPayload(smallErrorPayload);

  nowMs = 20_100;
  const largeErrorPayload = encodeEvent({
    type: "server.snapshot",
    ...createSnapshot({
      tick: 12,
      cars: [
        {
          id: "car:player-1",
          ownerPlayerId: "player-1",
          teamId: "team:blue",
          position: { x: 0.6, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          boost: 100,
        },
      ],
    }),
  });
  net.ingestServerPayload(largeErrorPayload);

  const metrics = net.getCorrectionMetrics();
  assert.equal(metrics.correctionsPerMinuteWindow, 1);
  assert(metrics.maxSpikeCm >= 60);
  assert(metrics.averageMagnitudeCm >= 60);
  assert.equal(metrics.rapierBallAuthority, true);
  assert.equal(metrics.deadzoneCm, 20);

  net.resetCorrectionMetrics();
  const afterReset = net.getCorrectionMetrics();
  assert.equal(afterReset.correctionsPerMinuteWindow, 0);
  assert.equal(afterReset.rapierBallAuthority, true);
});

test("live client net applies profile-based deadzone when threshold is not overridden", () => {
  let nowMs = 31_000;
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
      now: () => nowMs,
      reconciliationProfile: "loss_5pct",
      rapierBallAuthority: true,
      getPredictedPosition: () => ({ x: 0, y: 0, z: 0 }),
    },
  );

  const belowThresholdPayload = encodeEvent({
    type: "server.snapshot",
    ...createSnapshot({
      tick: 13,
      cars: [
        {
          id: "car:player-1",
          ownerPlayerId: "player-1",
          teamId: "team:blue",
          position: { x: 0.26, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          boost: 100,
        },
      ],
    }),
  });

  net.ingestServerPayload(belowThresholdPayload);

  const metrics = net.getCorrectionMetrics();
  assert.equal(metrics.correctionsPerMinuteWindow, 0);
  assert.equal(metrics.deadzoneCm, 27);
  assert.equal(Math.abs(metrics.smoothingAlpha - 0.35) < 1e-9, true);
});

test("live client net defaults to clean reconciliation tuning when profile is unspecified", () => {
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
      getPredictedPosition: () => null,
    },
  );

  const metrics = net.getCorrectionMetrics();
  assert.equal(metrics.deadzoneCm, 17);
  assert.equal(Math.abs(metrics.smoothingAlpha - 0.45) < 1e-9, true);
});
