import assert from "node:assert/strict";
import test from "node:test";

import type { InputControls, InputFrame, PlayerId } from "@car-ball/protocol";
import { createInitialWorldState } from "./state.ts";
import { tickWorld } from "./tick.ts";

const PLAYER_ID = "player-traction" as PlayerId;
const CAR_ID = `car:${PLAYER_ID}`;

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  jump: false,
  boost: false,
  handbrake: false
};

function frameForTick(tick: number, controls: Partial<InputControls> = {}): InputFrame {
  return {
    version: 1,
    sequence: tick,
    timestamp: tick * 8,
    tick,
    playerId: PLAYER_ID,
    carId: CAR_ID,
    controls: {
      ...DEFAULT_CONTROLS,
      ...controls
    }
  };
}

test("wall contact sticks under threshold speed", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - 0.1;
  car.position.z = 12;
  car.velocity.x = 2;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.tractionAttached, true);
  assert.equal(car.tractionSurface, "wall-x-max");
  assert.equal(car.onGround, false);
  assert.equal(car.position.x, world.arena.bounds.max.x);

  for (let tick = 2; tick <= 20; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);
    assert.equal(car.tractionAttached, true);
    assert.equal(car.tractionSurface, "wall-x-max");
    assert.equal(car.position.x, world.arena.bounds.max.x);
  }
});

test("traction detaches when threshold is exceeded", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - 0.1;
  car.position.z = 12;
  car.velocity.x = 2;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.tractionAttached, true);
  assert.equal(car.tractionSurface, "wall-x-max");

  car.velocity.x = 30;
  tickWorld(world, [frameForTick(2)]);

  assert.equal(car.tractionAttached, false);
  assert.equal(car.tractionSurface, "none");
});

test("traction transitions stay bounded and finite", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - 0.2;
  car.position.z = world.arena.bounds.max.z - 0.2;
  car.velocity.x = 3;
  car.velocity.z = 1;

  for (let tick = 1; tick <= 600; tick += 1) {
    const throttle = tick % 4 < 2 ? 1 : -1;
    const steer = tick % 6 < 3 ? 0.5 : -0.5;
    const boost = tick % 10 === 0;
    const jump = tick % 37 === 0;

    tickWorld(world, [frameForTick(tick, { throttle, steer, boost, jump })]);

    const values = [
      car.position.x,
      car.position.y,
      car.position.z,
      car.velocity.x,
      car.velocity.y,
      car.velocity.z
    ];

    for (const value of values) {
      assert.equal(Number.isFinite(value), true);
      assert.ok(Math.abs(value) < 10000);
    }

    if (car.tractionAttached) {
      assert.notEqual(car.tractionSurface, "none");
    }
  }
});
