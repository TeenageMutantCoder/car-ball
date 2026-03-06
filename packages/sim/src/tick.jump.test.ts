import assert from "node:assert/strict";
import test from "node:test";

import type { InputControls, InputFrame, PlayerId } from "@car-ball/protocol";
import { DOUBLE_JUMP_WINDOW_TICKS } from "./constants.ts";
import { createInitialWorldState } from "./state.ts";
import { tickWorld } from "./tick.ts";

const PLAYER_ID = "player-1" as PlayerId;
const CAR_ID = `car:${PLAYER_ID}`;

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
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

test("double jump within the window succeeds", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  tickWorld(world, [frameForTick(1, { jump: true })]);
  assert.equal(car.jumpCount, 1);
  assert.equal(car.onGround, false);

  tickWorld(world, [frameForTick(2, { jump: false })]);
  const velocityBeforeSecondJump = { ...car.velocity };

  tickWorld(world, [frameForTick(3, { jump: true, throttle: 1 })]);

  assert.equal(car.jumpCount, 2);
  assert.equal(car.jumpWindowTicksRemaining, 0);
  assert.ok(car.velocity.z > velocityBeforeSecondJump.z);
  assert.ok(car.velocity.x > velocityBeforeSecondJump.x);
});

test("second jump after the window expires fails", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  tickWorld(world, [frameForTick(1, { jump: true })]);

  for (let tick = 2; tick <= DOUBLE_JUMP_WINDOW_TICKS + 3; tick += 1) {
    tickWorld(world, [frameForTick(tick, { jump: false })]);
  }

  assert.equal(car.onGround, false);
  assert.equal(car.jumpCount, 1);
  assert.equal(car.jumpWindowTicksRemaining, 0);

  const velocityBeforeAttempt = { ...car.velocity };
  tickWorld(world, [frameForTick(DOUBLE_JUMP_WINDOW_TICKS + 4, { jump: true })]);

  assert.equal(car.jumpCount, 1);
  assert.ok(car.velocity.z < velocityBeforeAttempt.z);
  assert.ok(Math.abs(car.velocity.x - velocityBeforeAttempt.x) < 0.001);
});

test("landing resets jump eligibility", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  tickWorld(world, [frameForTick(1, { jump: true })]);

  let tick = 2;
  while (!car.onGround && tick < 500) {
    tickWorld(world, [frameForTick(tick, { jump: false })]);
    tick += 1;
  }

  assert.equal(car.onGround, true);
  assert.equal(car.jumpCount, 0);
  assert.equal(car.jumpWindowTicksRemaining, 0);

  tickWorld(world, [frameForTick(tick, { jump: true })]);
  assert.equal(car.jumpCount, 1);
  assert.equal(car.onGround, false);
});
