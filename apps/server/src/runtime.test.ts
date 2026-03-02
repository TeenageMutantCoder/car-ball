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

test("enqueueInputFrame rejects impossible acceleration and records telemetry", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(20_000, 1)
  });

  runtime.createRoomRuntime("room-d");
  const room = runtime.attachPlayerIds("room-d", ["player-1"]);

  const result = runtime.enqueueInputFrame("room-d", {
    version: 1,
    sequence: 1,
    timestamp: 20_000,
    tick: 1,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 2,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "IMPOSSIBLE_ACCELERATION");

  runtime.tickOnce();

  assert.equal(room.sim.world.clock.tick, 1);
  assert.equal(room.sim.world.cars["car:player-1"]?.velocity.x ?? 0, 0);

  assert.deepEqual(runtime.getValidationTelemetry("room-d"), {
    accepted: 0,
    rejected: 1,
    rejectedByCode: {
      IMPOSSIBLE_ACCELERATION: 1,
      INVALID_BOOST_USAGE: 0,
      COOLDOWN_ABUSE: 0
    }
  });
});

test("enqueueInputFrame enforces cooldown abuse checks", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    now: createMonotonicNow(30_000, 1)
  });

  runtime.createRoomRuntime("room-e");
  runtime.attachPlayerIds("room-e", ["player-1"]);

  const first = runtime.enqueueInputFrame("room-e", {
    version: 1,
    sequence: 1,
    timestamp: 30_000,
    tick: 1,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false
    }
  });

  const second = runtime.enqueueInputFrame("room-e", {
    version: 1,
    sequence: 2,
    timestamp: 30_001,
    tick: 2,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false
    }
  });

  assert.deepEqual(first, { ok: true });
  assert.equal(second.ok, false);
  assert.equal(second.code, "COOLDOWN_ABUSE");

  assert.deepEqual(runtime.getValidationTelemetry("room-e"), {
    accepted: 1,
    rejected: 1,
    rejectedByCode: {
      IMPOSSIBLE_ACCELERATION: 0,
      INVALID_BOOST_USAGE: 0,
      COOLDOWN_ABUSE: 1
    }
  });
});

test("runtime propagates rapier shadow flags to room simulation", () => {
  const runtime = createServerRuntime({
    rapierEnabled: true,
    rapierShadowMode: true,
    now: createMonotonicNow(40_000, 1)
  });

  runtime.createRoomRuntime("room-rapier-a");
  const room = runtime.attachPlayerIds("room-rapier-a", ["player-1"]);

  const metrics = room.sim.getRapierShadowMetrics();
  assert.equal(metrics.enabled, true);
  assert.equal(metrics.shadowMode, true);
  assert.equal(metrics.initialized, true);
});

test("runtime enables rapier shadow and ball authority by default", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(50_000, 1)
  });

  runtime.createRoomRuntime("room-rapier-b");
  const room = runtime.attachPlayerIds("room-rapier-b", ["player-1"]);

  const metrics = room.sim.getRapierShadowMetrics();
  assert.equal(metrics.enabled, true);
  assert.equal(metrics.shadowMode, true);
  assert.equal(metrics.ballAuthority, true);
  assert.equal(metrics.initialized, true);
});

test("runtime propagates rapier ball authority flag", () => {
  const runtime = createServerRuntime({
    rapierEnabled: true,
    rapierShadowMode: false,
    rapierBallAuthority: true,
    now: createMonotonicNow(60_000, 1)
  });

  runtime.createRoomRuntime("room-rapier-c");
  const room = runtime.attachPlayerIds("room-rapier-c", ["player-1"]);

  const metrics = room.sim.getRapierShadowMetrics();
  assert.equal(metrics.enabled, true);
  assert.equal(metrics.shadowMode, false);
  assert.equal(metrics.ballAuthority, true);
});

test("runtime rejects impossible rapier ball-authority transitions and emits telemetry", () => {
  const runtime = createServerRuntime({
    rapierEnabled: true,
    rapierShadowMode: false,
    rapierBallAuthority: true,
    now: createMonotonicNow(70_000, 1)
  });

  runtime.createRoomRuntime("room-rapier-guard");
  const room = runtime.attachPlayerIds("room-rapier-guard", ["player-1"]);

  const simWithPatchedAdvance = room.sim as unknown as {
    world: typeof room.sim.world;
    advance: (elapsedMs: number) => {
      substeps: number;
      droppedMs: number;
      accumulatorMs: number;
      tick: number;
    };
  };
  const originalAdvance = simWithPatchedAdvance.advance.bind(room.sim);
  simWithPatchedAdvance.advance = (elapsedMs: number) => {
    const result = originalAdvance(elapsedMs);
    simWithPatchedAdvance.world.ball.position.x = Number.NaN;
    return result;
  };

  const before = {
    position: { ...room.sim.world.ball.position },
    velocity: { ...room.sim.world.ball.velocity }
  };

  runtime.tickOnce();

  assert.deepEqual(room.sim.world.ball.position, before.position);
  assert.deepEqual(room.sim.world.ball.velocity, before.velocity);
  assert.deepEqual(runtime.getRapierAuthorityTelemetry("room-rapier-guard"), {
    rejectedImpossibleTransitions: 1,
    rejectedNonFiniteTransitions: 1,
    rejectedOverspeedTransitions: 0,
    rejectedDisplacementTransitions: 0
  });
});

test("restartMatch resets finished room to a fresh playing state", () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(80_000, 1)
  });

  runtime.createRoomRuntime("room-restart-a");
  const room = runtime.attachPlayerIds("room-restart-a", ["player-1", "player-2"]);

  room.sim.world.clock.remainingSeconds = 0;
  room.sim.world.clock.isOver = true;
  runtime.tickOnce();

  const beforeRestartTick = room.sim.world.clock.tick;
  const restarted = runtime.restartMatch("room-restart-a");

  assert.equal(beforeRestartTick > 0, true);
  assert.equal(restarted.sim.world.clock.tick, 0);
  assert.equal(restarted.sim.world.clock.isOver, false);

  const snapshot = runtime.reconnectPlayer("room-restart-a", "player-1").snapshot;
  assert.equal(snapshot.match.phase, "playing");
  assert.equal(snapshot.tick, 0);
});
