import assert from "node:assert/strict";
import test from "node:test";

import { createServerRuntime } from "./runtime.ts";

function createMonotonicNow(startMs: number, deltaMs: number): () => number {
  let current = startMs - deltaMs;

  return () => {
    current += deltaMs;
    return current;
  };
}

test("goal in blue volume awards orange and emits goal_pause then playing", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(260_000, 1)
  });

  runtime.createRoomRuntime("room-score-a");
  const room = runtime.attachPlayerIds("room-score-a", ["player-1"]);

  room.sim.world.ball.position = {
    x: room.sim.world.goals.blue.volume.min.x + 0.5,
    y: 0,
    z: 1
  };
  room.sim.world.ball.velocity = {
    x: 0,
    y: 0,
    z: 0
  };

  const firstTick = runtime.tickOnce();
  assert.equal(firstTick.events.length, 1);
  const firstEvent = firstTick.events[0];
  assert(firstEvent);
  assert.equal(firstEvent.type, "server.snapshot");
  assert.equal(firstEvent.match.phase, "goal_pause");
  assert.deepEqual(firstEvent.match.scoreByTeam, {
    "team:blue": 0,
    "team:orange": 1
  });
  assert.deepEqual(firstEvent.ball.position, { x: 0, y: 0, z: 1.5 });
  assert.deepEqual(firstEvent.ball.velocity, { x: 0, y: 0, z: 0 });

  const secondTick = runtime.tickOnce();
  assert.equal(secondTick.events.length, 1);
  const secondEvent = secondTick.events[0];
  assert(secondEvent);
  assert.equal(secondEvent.type, "server.snapshot");
  assert.equal(secondEvent.match.phase, "playing");
  assert.deepEqual(secondEvent.match.scoreByTeam, {
    "team:blue": 0,
    "team:orange": 1
  });
});

test("goal in orange volume awards blue", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(270_000, 1)
  });

  runtime.createRoomRuntime("room-score-b");
  const room = runtime.attachPlayerIds("room-score-b", ["player-1"]);

  room.sim.world.ball.position = {
    x: room.sim.world.goals.orange.volume.max.x - 0.5,
    y: 0,
    z: 1
  };
  room.sim.world.ball.velocity = {
    x: 0,
    y: 0,
    z: 0
  };

  const tickResult = runtime.tickOnce();
  assert.equal(tickResult.events.length, 1);
  const event = tickResult.events[0];
  assert(event);
  assert.equal(event.type, "server.snapshot");
  assert.equal(event.match.phase, "goal_pause");
  assert.deepEqual(event.match.scoreByTeam, {
    "team:blue": 1,
    "team:orange": 0
  });
});

test("finished match phase takes precedence over goal scoring", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(280_000, 1)
  });

  runtime.createRoomRuntime("room-score-c");
  const room = runtime.attachPlayerIds("room-score-c", ["player-1"]);

  room.sim.world.clock.remainingSeconds = 0;
  room.sim.world.clock.isOver = true;
  room.sim.world.ball.position = {
    x: room.sim.world.goals.blue.volume.min.x + 0.5,
    y: 0,
    z: 1
  };

  const tickResult = runtime.tickOnce();
  assert.equal(tickResult.events.length, 1);
  const event = tickResult.events[0];
  assert(event);
  assert.equal(event.type, "server.snapshot");
  assert.equal(event.match.phase, "finished");
  assert.deepEqual(event.match.scoreByTeam, {
    "team:blue": 0,
    "team:orange": 0
  });
});
