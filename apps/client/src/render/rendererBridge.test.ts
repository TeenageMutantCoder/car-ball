import assert from "node:assert/strict";
import test from "node:test";

import type { Snapshot } from "@car-ball/protocol";

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

test("applySnapshot does not mutate frozen protocol snapshots", () => {
  const bridge = new RendererBridge();
  const frozenSnapshot = deepFreeze(buildSnapshot());

  assert.doesNotThrow(() => {
    bridge.applySnapshot(frozenSnapshot);
  });
});