import assert from "node:assert/strict";
import test from "node:test";

import type { InputFrame, Snapshot } from "@car-ball/protocol";

import { RendererBridge } from "./rendererBridge.ts";

function buildSnapshot(): Snapshot {
  return {
    version: 1,
    sequence: 15,
    timestamp: 1_738_120_000_000,
    tick: 120,
    match: {
      matchId: "match-1",
      phase: "playing",
      tick: 120,
      scoreByTeam: {
        "team-b": 2,
        "team-a": 3,
      },
      timeRemainingMs: 89_000,
    },
    cars: [
      {
        id: "car-2",
        ownerPlayerId: "player-2",
        teamId: "team-b",
        position: { x: 4, y: 1, z: -2 },
        velocity: { x: 0, y: 0, z: 4 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 77,
      },
      {
        id: "car-1",
        ownerPlayerId: "player-1",
        teamId: "team-a",
        position: { x: -1, y: 1, z: 3 },
        velocity: { x: 2, y: 0, z: -2 },
        rotation: { x: 0, y: 0.4, z: 0, w: 0.9 },
        boost: 33,
      },
    ],
    ball: {
      id: "ball-1",
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 1, y: 0, z: -1 },
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    for (const nestedValue of Object.values(objectValue)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }

  return value;
}

test("applySnapshot is deterministic for equivalent snapshots", () => {
  const bridge = new RendererBridge();
  const snapshot = buildSnapshot();

  const firstApplied = bridge.applySnapshot(structuredClone(snapshot));
  const secondApplied = bridge.applySnapshot(structuredClone(snapshot));

  assert.deepEqual(firstApplied, secondApplied);
  assert.notEqual(firstApplied, secondApplied);
});

test("applySnapshot clones input and does not retain mutable references", () => {
  const bridge = new RendererBridge();
  const snapshot = buildSnapshot();

  const applied = bridge.applySnapshot(snapshot);

  snapshot.match.scoreByTeam["team-a"] = 999;
  snapshot.cars[0]!.position.x = 100;
  snapshot.ball.position.y = 42;

  assert.equal(applied.match.scoreByTeam["team-a"], 3);
  assert.equal(applied.cars[0]!.id, "car-1");
  assert.equal(applied.cars[0]!.position.x, -1);
  assert.equal(applied.ball.position.y, 1);
  assert.deepEqual(bridge.getLatestSnapshot(), applied);
});

test("applySnapshot tracks previous and current snapshots", () => {
  const bridge = new RendererBridge();
  const first = bridge.applySnapshot(buildSnapshot());
  const nextSnapshot = buildSnapshot();
  nextSnapshot.sequence = 16;
  nextSnapshot.tick = 121;
  nextSnapshot.cars[0]!.position.x = 14;
  const second = bridge.applySnapshot(nextSnapshot);

  assert.deepEqual(bridge.getPreviousSnapshot(), first);
  assert.deepEqual(bridge.getLatestSnapshot(), second);
});

test("getInterpolatedSnapshot interpolates car and ball transforms deterministically", () => {
  const bridge = new RendererBridge();
  const previous = buildSnapshot();
  const current = buildSnapshot();
  current.sequence = 20;
  current.tick = 130;
  current.timestamp = previous.timestamp + 100;
  current.cars[0]!.position = { x: 14, y: 3, z: 6 };
  current.cars[0]!.velocity = { x: 2, y: 4, z: 6 };
  current.cars[0]!.boost = 50;
  current.cars[1]!.position = { x: 9, y: 11, z: 13 };
  current.ball.position = { x: 10, y: 3, z: -8 };
  current.ball.velocity = { x: 3, y: 2, z: -5 };

  bridge.applySnapshot(previous);
  bridge.applySnapshot(current);

  const interpolated = bridge.getInterpolatedSnapshot(0.5);

  assert.ok(interpolated);
  assert.equal(interpolated.sequence, 20);
  assert.equal(interpolated.tick, 130);
  assert.equal(interpolated.cars[0]!.id, "car-1");
  assert.deepEqual(interpolated.cars[0]!.position, { x: 4, y: 6, z: 8 });
  assert.deepEqual(interpolated.ball.position, { x: 5, y: 2, z: -4 });
  assert.deepEqual(interpolated.ball.velocity, { x: 2, y: 1, z: -3 });

  const repeated = bridge.getInterpolatedSnapshot(0.5);
  assert.deepEqual(repeated, interpolated);
  assert.notEqual(repeated, interpolated);
});

test("getInterpolatedSnapshot clamps alpha bounds", () => {
  const bridge = new RendererBridge();
  const previous = buildSnapshot();
  const current = buildSnapshot();
  const currentCarOne = current.cars.find((car) => car.id === "car-1");
  assert.ok(currentCarOne);
  currentCarOne.position = { x: 99, y: 99, z: 99 };

  bridge.applySnapshot(previous);
  bridge.applySnapshot(current);

  const low = bridge.getInterpolatedSnapshot(-12);
  const high = bridge.getInterpolatedSnapshot(42);

  assert.ok(low);
  assert.ok(high);
  const lowCarOne = low.cars.find((car) => car.id === "car-1");
  const highCarOne = high.cars.find((car) => car.id === "car-1");
  assert.ok(lowCarOne);
  assert.ok(highCarOne);
  assert.deepEqual(lowCarOne.position, { x: -1, y: 1, z: 3 });
  assert.deepEqual(highCarOne.position, { x: 99, y: 99, z: 99 });
});

test("getInterpolatedSnapshot returns a clone of current snapshot when previous is absent", () => {
  const bridge = new RendererBridge();
  const current = bridge.applySnapshot(buildSnapshot());
  const interpolated = bridge.getInterpolatedSnapshot(0.25);

  assert.ok(interpolated);
  assert.deepEqual(interpolated, current);
  assert.notEqual(interpolated, current);
});

test("applySnapshot does not mutate frozen protocol snapshots", () => {
  const bridge = new RendererBridge();
  const frozenSnapshot = deepFreeze(buildSnapshot());

  assert.doesNotThrow(() => {
    bridge.applySnapshot(frozenSnapshot);
  });
});

test("applyInputFrame stores a cloned latest input frame", () => {
  const bridge = new RendererBridge();

  const frame: InputFrame = {
    version: 1,
    sequence: 9,
    timestamp: 1_738_160_123_456,
    tick: 77,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: -1,
      jump: true,
      boost: false,
      handbrake: false,
    },
  };

  const applied = bridge.applyInputFrame(frame);

  frame.controls.throttle = 0;
  frame.controls.jump = false;

  assert.deepEqual(applied.controls, {
    throttle: 1,
    steer: -1,
    jump: true,
    boost: false,
    handbrake: false,
  });
  assert.deepEqual(bridge.getLatestInputFrame(), applied);
});