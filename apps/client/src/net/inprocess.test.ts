import assert from "node:assert/strict";
import test from "node:test";

import { decodeEvent, encodeEvent } from "@car-ball/protocol";

import { createInprocessClientNet } from "./inprocess.ts";

test("in-process client net encodes protocol-compliant input frames", () => {
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
  assert.equal(decoded.tick, 15);
  assert.equal(decoded.playerId, "player-1");
});

test("in-process client net applies only server.snapshot payloads", () => {
  const net = createInprocessClientNet({
    applySnapshot(snapshot) {
      return snapshot.tick;
    },
  });

  const snapshotPayload = encodeEvent({
    type: "server.snapshot",
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
  });

  const pongPayload = encodeEvent({
    type: "server.pong",
    version: 1,
    sequence: 2,
    timestamp: 50_001,
    clientTimeMs: 50_000,
    serverTimeMs: 50_001,
  });

  assert.equal(net.ingestServerPayload(snapshotPayload), 6);
  assert.equal(net.ingestServerPayload(pongPayload), null);
});
