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

test("tickOnce advances simulation tick", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(1_000, 1)
  });

  runtime.createRoomRuntime("room-a");
  const room = runtime.attachPlayerIds("room-a", ["player-2", "player-1"]);

  assert.equal(room.sim.world.clock.tick, 0);

  runtime.tickOnce();

  assert.equal(room.sim.world.clock.tick, 1);
});

test("snapshot event emits expected envelope and tick", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 20,
    now: createMonotonicNow(5_000, 2)
  });

  runtime.createRoomRuntime("room-b");
  runtime.attachPlayerIds("room-b", ["player-1", "player-2"]);

  let tickResult = runtime.tickOnce();
  for (let index = 1; index < 6; index += 1) {
    tickResult = runtime.tickOnce();
  }

  assert.equal(tickResult.snapshots.length, 1);
  assert.equal(tickResult.events.length, 1);

  const snapshotEvent = tickResult.events[0];
  assert(snapshotEvent);
  assert.equal(snapshotEvent.type, "server.snapshot");
  assert.equal(snapshotEvent.sequence, 1);
  assert.equal(snapshotEvent.tick, 6);
  assert.equal(snapshotEvent.match.matchId, "room-b:match:runtime");
  assert.equal(snapshotEvent.match.tick, 6);
});

test("metrics update tickDurationMs and roomCount", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(10_000, 3)
  });

  assert.deepEqual(runtime.getMetrics(), {
    tickDurationMs: 0,
    roomCount: 0
  });

  runtime.createRoomRuntime("room-c");
  runtime.attachPlayerIds("room-c", ["player-1"]);
  runtime.tickOnce();

  const metrics = runtime.getMetrics();
  assert.equal(metrics.roomCount, 1);
  assert.equal(metrics.tickDurationMs, 3);
});
