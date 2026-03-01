import assert from "node:assert/strict";
import test from "node:test";

import { decodeEvent, encodeEvent, type Snapshot } from "@car-ball/protocol";

import { createInprocessClientNet } from "./inprocess.ts";

function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    sequence: 1,
    timestamp: 50_000,
    tick: 6,
    match: {
      matchId: "match:test",
      phase: "playing",
      tick: 6,
      scoreByTeam: {
        "team:blue": 0,
        "team:orange": 0,
      },
      timeRemainingMs: 299_000,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 95,
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

test("in-process client net maps input payload to exact client.input fields", () => {
  const net = createInprocessClientNet({
    applySnapshot(snapshot) {
      return snapshot.tick;
    },
  });

  const payload = net.encodeInputFrame({
    version: 1,
    sequence: 7,
    timestamp: 123_456,
    tick: 15,
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

  const decoded = decodeEvent(payload);
  assert.equal(decoded.type, "client.input");

  assert.equal(decoded.version, 1);
  assert.equal(decoded.sequence, 7);
  assert.equal(decoded.timestamp, 123_456);
  assert.equal(decoded.tick, 15);
  assert.equal(decoded.playerId, "player-1");
  assert.equal(decoded.carId, "car:player-1");
  assert.deepEqual(decoded.controls, {
    throttle: 1,
    steer: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });
});

test("in-process client net snapshot ingestion yields render-state deltas", () => {
  const renderTicks: number[] = [];
  const net = createInprocessClientNet({
    applySnapshot(snapshot) {
      renderTicks.push(snapshot.tick);
      return snapshot.tick;
    },
  });

  const firstSnapshotPayload = encodeEvent({
    type: "server.snapshot",
    ...createSnapshot({
      sequence: 1,
      tick: 6,
      match: {
        matchId: "match:test",
        phase: "playing",
        tick: 6,
        scoreByTeam: {
          "team:blue": 0,
          "team:orange": 0,
        },
        timeRemainingMs: 299_000,
      },
      cars: [
        {
          id: "car:player-1",
          ownerPlayerId: "player-1",
          teamId: "team:blue",
          position: { x: 1, y: 0, z: 0 },
          velocity: { x: 0.2, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          boost: 95,
        },
      ],
    }),
  });

  const secondSnapshotPayload = encodeEvent({
    type: "server.snapshot",
    ...createSnapshot({
      sequence: 2,
      tick: 7,
      match: {
        matchId: "match:test",
        phase: "playing",
        tick: 7,
        scoreByTeam: {
          "team:blue": 1,
          "team:orange": 0,
        },
        timeRemainingMs: 298_992,
      },
      cars: [
        {
          id: "car:player-1",
          ownerPlayerId: "player-1",
          teamId: "team:blue",
          position: { x: 1.4, y: 0, z: 0 },
          velocity: { x: 0.4, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          boost: 94,
        },
      ],
      ball: {
        id: "ball:main",
        position: { x: 0.5, y: 0, z: 1.4 },
        velocity: { x: 0.1, y: 0, z: -0.05 },
      },
    }),
  });

  assert.equal(net.ingestServerPayload(firstSnapshotPayload), 6);
  assert.equal(net.ingestServerPayload(secondSnapshotPayload), 7);
  assert.deepEqual(renderTicks, [6, 7]);
});

test("in-process client net ignores non-snapshot events without side effects", () => {
  let appliedSnapshotCount = 0;
  const net = createInprocessClientNet({
    applySnapshot(snapshot) {
      appliedSnapshotCount += 1;
      return snapshot.tick;
    },
  });

  const pongPayload = encodeEvent({
    type: "server.pong",
    version: 1,
    sequence: 2,
    timestamp: 50_001,
    clientTimeMs: 50_000,
    serverTimeMs: 50_001,
  });

  const errorPayload = encodeEvent({
    type: "server.error",
    version: 1,
    sequence: 3,
    timestamp: 50_002,
    code: "BAD_MESSAGE",
    message: "simulated adapter-boundary error",
  });

  assert.equal(net.ingestServerPayload(pongPayload), null);
  assert.equal(net.ingestServerPayload(errorPayload), null);
  assert.equal(appliedSnapshotCount, 0);
});
