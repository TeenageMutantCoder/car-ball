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

test("disconnect blocks input", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(100_000, 1)
  });

  runtime.createRoomRuntime("room-reconnect-a");
  runtime.attachPlayerIds("room-reconnect-a", ["player-1"]);
  runtime.disconnectPlayer("room-reconnect-a", "player-1");

  const result = runtime.enqueueInputFrame("room-reconnect-a", {
    version: 1,
    sequence: 1,
    timestamp: 100_000,
    tick: 1,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      pitch: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "PLAYER_DISCONNECTED");
});

test("reconnect restores input acceptance", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(110_000, 1)
  });

  runtime.createRoomRuntime("room-reconnect-b");
  runtime.attachPlayerIds("room-reconnect-b", ["player-1"]);
  runtime.disconnectPlayer("room-reconnect-b", "player-1");

  const blocked = runtime.enqueueInputFrame("room-reconnect-b", {
    version: 1,
    sequence: 1,
    timestamp: 110_000,
    tick: 1,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      pitch: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false
    }
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "PLAYER_DISCONNECTED");

  runtime.reconnectPlayer("room-reconnect-b", "player-1");

  const accepted = runtime.enqueueInputFrame("room-reconnect-b", {
    version: 1,
    sequence: 2,
    timestamp: 110_001,
    tick: 1,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      pitch: 0,
      roll: 0,
      jump: false,
      boost: false,
      handbrake: false
    }
  });

  assert.deepEqual(accepted, { ok: true });
});

test("reconnect returns current snapshot with current tick", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(120_000, 2)
  });

  runtime.createRoomRuntime("room-reconnect-c");
  const room = runtime.attachPlayerIds("room-reconnect-c", ["player-1"]);

  runtime.tickOnce();
  runtime.tickOnce();
  runtime.tickOnce();

  const reconnectResult = runtime.reconnectPlayer("room-reconnect-c", "player-1");

  assert.equal(reconnectResult.snapshot.tick, room.sim.world.clock.tick);
  assert.equal(reconnectResult.snapshot.match.tick, room.sim.world.clock.tick);
  assert.equal(reconnectResult.snapshot.match.matchId, "room-reconnect-c:match:runtime");
  assert.equal(reconnectResult.events.length, 1);
  assert.equal(reconnectResult.events[0]?.type, "server.snapshot");
  assert.equal(reconnectResult.events[0]?.tick, room.sim.world.clock.tick);
});
