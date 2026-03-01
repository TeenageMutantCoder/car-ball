import assert from "node:assert/strict";
import test from "node:test";

import { decodeEvent, encodeEvent, type InputFrame, type ServerEvent, type Snapshot } from "@car-ball/protocol";

import { createServerRuntime, type RuntimeRoom } from "./runtime.ts";

function createMonotonicNow(startMs: number, deltaMs: number): () => number {
  let current = startMs - deltaMs;

  return () => {
    current += deltaMs;
    return current;
  };
}

function encodeClientInput(frame: InputFrame): string {
  return encodeEvent({
    type: "client.input",
    ...frame
  });
}

function decodeClientInput(payload: string): InputFrame {
  const event = decodeEvent(payload);
  if (event.type !== "client.input") {
    throw new Error(`expected client.input event, received ${event.type}`);
  }

  const { type: _eventType, ...frame } = event;
  return frame;
}

function decodeServerEvent(payload: string): ServerEvent {
  const event = decodeEvent(payload);

  if (event.type === "client.input" || event.type === "client.ping" || event.type === "client.ready") {
    throw new Error(`expected server event, received ${event.type}`);
  }

  return event;
}

function assertSnapshotMatchesAuthoritativeWorld(snapshot: Snapshot, room: RuntimeRoom): void {
  const world = room.sim.world;

  assert.equal(snapshot.tick, world.clock.tick);
  assert.equal(snapshot.match.tick, world.clock.tick);
  assert.equal(snapshot.ball.id, world.ball.id);
  assert.deepEqual(snapshot.ball.position, world.ball.position);
  assert.deepEqual(snapshot.ball.velocity, world.ball.velocity);

  const snapshotCarsById = new Map(snapshot.cars.map((car) => [car.id, car]));
  const worldCars = Object.values(world.cars);
  assert.equal(snapshotCarsById.size, worldCars.length);

  for (const worldCar of worldCars) {
    const snapshotCar = snapshotCarsById.get(worldCar.id);
    assert(snapshotCar, `snapshot car missing for id ${worldCar.id}`);

    assert.equal(snapshotCar.ownerPlayerId, worldCar.playerId);
    assert.equal(snapshotCar.teamId, worldCar.teamId);
    assert.deepEqual(snapshotCar.position, worldCar.position);
    assert.deepEqual(snapshotCar.velocity, worldCar.velocity);
    assert.equal(snapshotCar.boost, worldCar.boost);
  }
}

test("e2e accepted input mutates authoritative car state", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(200_000, 1)
  });

  runtime.createRoomRuntime("room-e2e-a");
  const room = runtime.attachPlayerIds("room-e2e-a", ["player-1"]);

  const beforeCar = room.sim.world.cars["car:player-1"];
  assert(beforeCar);
  const beforePosition = { ...beforeCar.position };
  const beforeVelocity = { ...beforeCar.velocity };
  const beforeBoost = beforeCar.boost;
  const beforeTick = room.sim.world.clock.tick;

  const inputPayload = encodeClientInput({
    version: 1,
    sequence: 1,
    timestamp: 200_000,
    tick: beforeTick + 1,
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

  const decodedInput = decodeClientInput(inputPayload);
  const enqueueResult = runtime.enqueueInputFrame("room-e2e-a", decodedInput);
  assert.deepEqual(enqueueResult, { ok: true });

  const tickResult = runtime.tickOnce();
  assert.equal(tickResult.snapshots.length, 1);
  assert.equal(tickResult.events.length, 1);

  const afterCar = room.sim.world.cars["car:player-1"];
  assert(afterCar);
  const afterTick = room.sim.world.clock.tick;

  assert.equal(afterTick, beforeTick + 1);

  const planarVelocityDelta = Math.hypot(
    afterCar.velocity.x - beforeVelocity.x,
    afterCar.velocity.y - beforeVelocity.y
  );
  const planarPositionDelta = Math.hypot(
    afterCar.position.x - beforePosition.x,
    afterCar.position.y - beforePosition.y
  );

  assert(planarVelocityDelta > 0, "accepted input should change authoritative velocity");
  assert(planarPositionDelta > 0, "accepted input should change authoritative position");
  assert.equal(afterCar.boost, beforeBoost);

  const outboundPayload = encodeEvent(tickResult.events[0]!);
  const decodedOutbound = decodeServerEvent(outboundPayload);
  assert.equal(decodedOutbound.type, "server.snapshot");
  assert.equal(decodedOutbound.tick, afterTick);
  assert.equal(decodedOutbound.match.tick, afterTick);
  assert.equal(decodedOutbound.cars[0]?.id, "car:player-1");
});

test("e2e rejected input leaves authoritative car state unchanged for invalid frame", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(210_000, 1)
  });

  runtime.createRoomRuntime("room-e2e-b");
  const room = runtime.attachPlayerIds("room-e2e-b", ["player-1"]);

  const beforeCar = room.sim.world.cars["car:player-1"];
  assert(beforeCar);
  const beforePosition = { ...beforeCar.position };
  const beforeVelocity = { ...beforeCar.velocity };
  const beforeBoost = beforeCar.boost;
  const beforeTick = room.sim.world.clock.tick;

  const invalidInputPayload = encodeClientInput({
    version: 1,
    sequence: 1,
    timestamp: 210_000,
    tick: beforeTick + 1,
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

  const decodedInput = decodeClientInput(invalidInputPayload);
  const enqueueResult = runtime.enqueueInputFrame("room-e2e-b", decodedInput);
  assert.equal(enqueueResult.ok, false);
  assert.equal(enqueueResult.code, "IMPOSSIBLE_ACCELERATION");

  runtime.tickOnce();

  const afterCar = room.sim.world.cars["car:player-1"];
  assert(afterCar);
  const afterTick = room.sim.world.clock.tick;

  assert.equal(afterTick, beforeTick + 1);
  assert.deepEqual(afterCar.position, beforePosition);
  assert.deepEqual(afterCar.velocity, beforeVelocity);
  assert.equal(afterCar.boost, beforeBoost);

  assert.deepEqual(runtime.getValidationTelemetry("room-e2e-b"), {
    accepted: 0,
    rejected: 1,
    rejectedByCode: {
      IMPOSSIBLE_ACCELERATION: 1,
      INVALID_BOOST_USAGE: 0,
      COOLDOWN_ABUSE: 0
    }
  });
});

test("e2e snapshot sequence and match clock are monotonic across ticks", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 20,
    now: createMonotonicNow(220_000, 2)
  });

  runtime.createRoomRuntime("room-e2e-c");
  const room = runtime.attachPlayerIds("room-e2e-c", ["player-1"]);

  const snapshotEvents: ServerEvent[] = [];

  for (let tickIndex = 0; tickIndex < 18; tickIndex += 1) {
    const tickResult = runtime.tickOnce();
    for (const event of tickResult.events) {
      const payload = encodeEvent(event);
      snapshotEvents.push(decodeServerEvent(payload));
    }
  }

  assert.equal(room.sim.world.clock.tick, 18);
  assert.equal(snapshotEvents.length, 3);

  const snapshots = snapshotEvents.filter((event) => event.type === "server.snapshot");
  assert.equal(snapshots.length, 3);

  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index]!;
    const expectedSequence = index + 1;
    const expectedTick = (index + 1) * 6;

    assert.equal(snapshot.sequence, expectedSequence);
    assert.equal(snapshot.tick, expectedTick);
    assert.equal(snapshot.match.tick, expectedTick);
    assert.equal(snapshot.match.matchId, "room-e2e-c:match:runtime");

    if (index > 0) {
      const previous = snapshots[index - 1]!;
      assert(snapshot.sequence > previous.sequence);
      assert(snapshot.tick > previous.tick);
      assert(snapshot.match.tick > previous.match.tick);
    }
  }
});

test("e2e interleaved multi-player inputs apply only accepted owner frames", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(230_000, 1)
  });

  runtime.createRoomRuntime("room-e2e-d");
  const room = runtime.attachPlayerIds("room-e2e-d", ["player-1", "player-2"]);

  const beforeCar1 = room.sim.world.cars["car:player-1"];
  const beforeCar2 = room.sim.world.cars["car:player-2"];
  assert(beforeCar1);
  assert(beforeCar2);
  const beforeVelocity1 = { ...beforeCar1.velocity };
  const beforeVelocity2 = { ...beforeCar2.velocity };
  const beforePosition1 = { ...beforeCar1.position };
  const beforePosition2 = { ...beforeCar2.position };

  const acceptedP1 = runtime.enqueueInputFrame(
    "room-e2e-d",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 1,
        timestamp: 230_000,
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
      })
    )
  );

  const acceptedP2 = runtime.enqueueInputFrame(
    "room-e2e-d",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 2,
        timestamp: 230_001,
        tick: 1,
        playerId: "player-2",
        carId: "car:player-2",
        controls: {
          throttle: -1,
          steer: 0,
          jump: false,
          boost: false,
          handbrake: false
        }
      })
    )
  );

  const rejectedSpoof = runtime.enqueueInputFrame(
    "room-e2e-d",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 3,
        timestamp: 230_002,
        tick: 1,
        playerId: "player-1",
        carId: "car:player-2",
        controls: {
          throttle: 1,
          steer: 0,
          jump: false,
          boost: true,
          handbrake: false
        }
      })
    )
  );

  assert.deepEqual(acceptedP1, { ok: true });
  assert.deepEqual(acceptedP2, { ok: true });
  assert.equal(rejectedSpoof.ok, false);
  assert.equal(rejectedSpoof.code, "INVALID_BOOST_USAGE");

  runtime.tickOnce();

  const afterCar1 = room.sim.world.cars["car:player-1"];
  const afterCar2 = room.sim.world.cars["car:player-2"];
  assert(afterCar1);
  assert(afterCar2);

  const speedDelta1 = Math.hypot(
    afterCar1.velocity.x - beforeVelocity1.x,
    afterCar1.velocity.y - beforeVelocity1.y
  );
  const speedDelta2 = Math.hypot(
    afterCar2.velocity.x - beforeVelocity2.x,
    afterCar2.velocity.y - beforeVelocity2.y
  );

  assert(speedDelta1 > 0, "player-1 accepted frame should mutate car:player-1");
  assert(speedDelta2 > 0, "player-2 accepted frame should mutate car:player-2");

  const baselineRuntime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(230_000, 1)
  });
  baselineRuntime.createRoomRuntime("room-e2e-d-baseline");
  const baselineRoom = baselineRuntime.attachPlayerIds("room-e2e-d-baseline", ["player-1", "player-2"]);

  const baselineAcceptedP1 = baselineRuntime.enqueueInputFrame(
    "room-e2e-d-baseline",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 1,
        timestamp: 230_000,
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
      })
    )
  );
  assert.deepEqual(baselineAcceptedP1, { ok: true });

  const baselineAcceptedP2 = baselineRuntime.enqueueInputFrame(
    "room-e2e-d-baseline",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 2,
        timestamp: 230_001,
        tick: 1,
        playerId: "player-2",
        carId: "car:player-2",
        controls: {
          throttle: -1,
          steer: 0,
          jump: false,
          boost: false,
          handbrake: false
        }
      })
    )
  );
  assert.deepEqual(baselineAcceptedP2, { ok: true });

  baselineRuntime.tickOnce();

  const baselineAfterCar1 = baselineRoom.sim.world.cars["car:player-1"];
  const baselineAfterCar2 = baselineRoom.sim.world.cars["car:player-2"];
  assert(baselineAfterCar1);
  assert(baselineAfterCar2);

  assert.deepEqual(afterCar1.position, baselineAfterCar1.position);
  assert.deepEqual(afterCar1.velocity, baselineAfterCar1.velocity);
  assert.deepEqual(afterCar2.position, baselineAfterCar2.position);
  assert.deepEqual(afterCar2.velocity, baselineAfterCar2.velocity);

  assert.notDeepEqual(afterCar1.position, beforePosition1);
  assert.notDeepEqual(afterCar2.position, beforePosition2);

  assert.deepEqual(runtime.getValidationTelemetry("room-e2e-d"), {
    accepted: 2,
    rejected: 1,
    rejectedByCode: {
      IMPOSSIBLE_ACCELERATION: 0,
      INVALID_BOOST_USAGE: 1,
      COOLDOWN_ABUSE: 0
    }
  });
});

test("e2e disconnect blocks input and reconnect returns authoritative resync snapshot", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 20,
    now: createMonotonicNow(240_000, 2)
  });

  runtime.createRoomRuntime("room-e2e-e");
  const room = runtime.attachPlayerIds("room-e2e-e", ["player-1"]);

  runtime.tickOnce();
  runtime.tickOnce();
  const tickBeforeDisconnect = room.sim.world.clock.tick;

  runtime.disconnectPlayer("room-e2e-e", "player-1");

  const blockedResult = runtime.enqueueInputFrame(
    "room-e2e-e",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 1,
        timestamp: 240_000,
        tick: tickBeforeDisconnect + 1,
        playerId: "player-1",
        carId: "car:player-1",
        controls: {
          throttle: 1,
          steer: 0,
          jump: false,
          boost: false,
          handbrake: false
        }
      })
    )
  );

  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.code, "PLAYER_DISCONNECTED");

  runtime.tickOnce();

  const reconnectResult = runtime.reconnectPlayer("room-e2e-e", "player-1");
  const reconnectPayload = encodeEvent(reconnectResult.events[0]!);
  const reconnectEvent = decodeServerEvent(reconnectPayload);
  assert.equal(reconnectEvent.type, "server.snapshot");
  const { type: _eventType, ...eventSnapshot } = reconnectEvent;
  assert.deepEqual(reconnectResult.snapshot, eventSnapshot);
  assertSnapshotMatchesAuthoritativeWorld(reconnectResult.snapshot, room);

  const acceptedAfterReconnect = runtime.enqueueInputFrame(
    "room-e2e-e",
    decodeClientInput(
      encodeClientInput({
        version: 1,
        sequence: 2,
        timestamp: 240_010,
        tick: room.sim.world.clock.tick + 1,
        playerId: "player-1",
        carId: "car:player-1",
        controls: {
          throttle: 1,
          steer: 0,
          jump: false,
          boost: false,
          handbrake: false
        }
      })
    )
  );

  assert.deepEqual(acceptedAfterReconnect, { ok: true });
});

test("e2e goal-volume interaction evolves score and phase in snapshots", () => {
  const runtime = createServerRuntime({
    tickRateHz: 120,
    snapshotRateHz: 120,
    now: createMonotonicNow(250_000, 1)
  });

  runtime.createRoomRuntime("room-e2e-f");
  const room = runtime.attachPlayerIds("room-e2e-f", ["player-1"]);

  room.sim.world.ball.position = {
    x: room.sim.world.goals.blue.volume.min.x + 0.5,
    y: 0,
    z: 1
  };
  room.sim.world.ball.velocity = { x: 0, y: 0, z: 0 };

  const firstTick = runtime.tickOnce();
  assert.equal(firstTick.events.length, 1);

  const firstSnapshotPayload = encodeEvent(firstTick.events[0]!);
  const firstSnapshotEvent = decodeServerEvent(firstSnapshotPayload);
  assert.equal(firstSnapshotEvent.type, "server.snapshot");
  assert.equal(firstSnapshotEvent.match.phase, "goal_pause");
  assert.deepEqual(firstSnapshotEvent.match.scoreByTeam, {
    "team:blue": 0,
    "team:orange": 1
  });
  assert.deepEqual(firstSnapshotEvent.ball.position, { x: 0, y: 0, z: 1.5 });
  assert.deepEqual(firstSnapshotEvent.ball.velocity, { x: 0, y: 0, z: 0 });

  const secondTick = runtime.tickOnce();
  assert.equal(secondTick.events.length, 1);

  const secondSnapshotPayload = encodeEvent(secondTick.events[0]!);
  const secondSnapshotEvent = decodeServerEvent(secondSnapshotPayload);
  assert.equal(secondSnapshotEvent.type, "server.snapshot");
  assert.equal(secondSnapshotEvent.match.phase, "playing");
  assert.deepEqual(secondSnapshotEvent.match.scoreByTeam, {
    "team:blue": 0,
    "team:orange": 1
  });
});
