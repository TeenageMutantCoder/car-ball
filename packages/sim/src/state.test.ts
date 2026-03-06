import assert from "node:assert/strict";
import test from "node:test";

import {
  GOAL_BLUE_ID,
  GOAL_ORANGE_ID,
  TEAM_BLUE_ID,
  TEAM_ORANGE_ID,
  createInitialWorldState
} from "./state.ts";
import { worldToProtocolSnapshot } from "./snapshot.ts";

test("createInitialWorldState includes arena and goal volume defaults", () => {
  const world = createInitialWorldState({ playerIds: ["player-2", "player-1"] });

  assert.equal(world.arena.id, "arena:main");
  assert.equal(world.goals.blue.id, GOAL_BLUE_ID);
  assert.equal(world.goals.orange.id, GOAL_ORANGE_ID);
  assert.equal(world.goals.blue.teamId, TEAM_BLUE_ID);
  assert.equal(world.goals.orange.teamId, TEAM_ORANGE_ID);
  assert.equal(world.ball.id, "ball:main");

  const car1 = world.cars["car:player-1"];
  const car2 = world.cars["car:player-2"];

  assert.ok(car1);
  assert.ok(car2);
  assert.equal(car1.teamId, TEAM_BLUE_ID);
  assert.equal(car2.teamId, TEAM_ORANGE_ID);
  assert.equal(car1.jumpCount, 0);
  assert.equal(car1.jumpWindowTicksRemaining, 0);
  assert.equal(car1.jumpPressedLastTick, false);
});

test("worldToProtocolSnapshot maps world state deterministically", () => {
  const world = createInitialWorldState({ playerIds: ["player-b", "player-a"] });

  world.clock.tick = 42;
  world.clock.remainingSeconds = 10.25;
  world.ball.velocity.x = 1.5;
  world.cars["car:player-a"].heading = Math.PI / 2;

  const first = worldToProtocolSnapshot(world, {
    sequence: 7,
    timestamp: 123456
  });

  const second = worldToProtocolSnapshot(world, {
    sequence: 7,
    timestamp: 123456
  });

  assert.deepEqual(first, second);
  assert.equal(first.tick, 42);
  assert.equal(first.match.tick, 42);
  assert.equal(first.match.phase, "playing");
  assert.equal(first.match.timeRemainingMs, 10250);
  assert.deepEqual(first.cars.map((car) => car.id), ["car:player-a", "car:player-b"]);
  assert.equal(first.cars[0].rotation.z, Math.sin(Math.PI / 4));
  assert.equal(first.cars[0].rotation.w, Math.cos(Math.PI / 4));
  assert.equal(first.cars[0].onGround, true);
});

test("worldToProtocolSnapshot encodes pitch and roll into car rotation", () => {
  const world = createInitialWorldState({ playerIds: ["player-a"] });
  const car = world.cars["car:player-a"];

  car.heading = 0;
  car.pitch = Math.PI / 6;
  car.roll = Math.PI / 8;

  const snapshot = worldToProtocolSnapshot(world, {
    sequence: 1,
    timestamp: 1
  });

  const rotation = snapshot.cars[0].rotation;
  assert.notEqual(rotation.x, 0);
  assert.notEqual(rotation.y, 0);
});
