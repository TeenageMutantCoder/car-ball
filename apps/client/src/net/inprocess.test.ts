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
        onGround: true,
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
      pitch: 0,
      roll: 0,
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
    pitch: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });
});

test("in-process client net snapshot ingestion yields render-state deltas", () => {
  const renderStates: Array<{
    tick: number;
    carX: number;
    carVx: number;
    carBoost: number;
    ballX: number;
    ballZ: number;
  }> = [];

  const net = createInprocessClientNet({
    applySnapshot(snapshot) {
      const car = snapshot.cars.find((candidate) => candidate.id === "car:player-1");
      assert(car);

      const renderState = {
        tick: snapshot.tick,
        carX: car.position.x,
        carVx: car.velocity.x,
        carBoost: car.boost,
        ballX: snapshot.ball.position.x,
        ballZ: snapshot.ball.position.z,
      };

      renderStates.push(renderState);
      return renderState;
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
          onGround: true,
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
          onGround: true,
        },
      ],
      ball: {
        id: "ball:main",
        position: { x: 0.5, y: 0, z: 1.4 },
        velocity: { x: 0.1, y: 0, z: -0.05 },
      },
    }),
  });

  const firstRenderState = net.ingestServerPayload(firstSnapshotPayload);
  const secondRenderState = net.ingestServerPayload(secondSnapshotPayload);

  assert.deepEqual(firstRenderState, {
    tick: 6,
    carX: 1,
    carVx: 0.2,
    carBoost: 95,
    ballX: 0,
    ballZ: 1.5,
  });

  assert.deepEqual(secondRenderState, {
    tick: 7,
    carX: 1.4,
    carVx: 0.4,
    carBoost: 94,
    ballX: 0.5,
    ballZ: 1.4,
  });

  assert.equal(renderStates.length, 2);
  assert.deepEqual(renderStates[0], firstRenderState);
  assert.deepEqual(renderStates[1], secondRenderState);

  assert(renderStates[1]!.tick > renderStates[0]!.tick);
  assert(renderStates[1]!.carX > renderStates[0]!.carX);
  assert(renderStates[1]!.carVx > renderStates[0]!.carVx);
  assert(renderStates[1]!.carBoost < renderStates[0]!.carBoost);
  assert(renderStates[1]!.ballX > renderStates[0]!.ballX);
  assert(renderStates[1]!.ballZ < renderStates[0]!.ballZ);
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
