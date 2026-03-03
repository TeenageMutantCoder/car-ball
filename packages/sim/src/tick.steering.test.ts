import assert from "node:assert/strict";
import test from "node:test";

import type { InputControls, InputFrame, PlayerId } from "@car-ball/protocol";
import { createInitialWorldState } from "./state.ts";
import { tickWorld } from "./tick.ts";

const PLAYER_ID = "player-steering" as PlayerId;
const CAR_ID = `car:${PLAYER_ID}`;

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
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
      ...controls,
    },
  };
}

test("left steer turns counterclockwise in top view", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  assert.equal(car.heading, 0);
  tickWorld(world, [frameForTick(1, { steer: -1 })]);

  assert.ok(car.heading > 0, `Expected heading > 0 for left steer, got ${car.heading}`);
});

test("right steer turns clockwise in top view", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  assert.equal(car.heading, 0);
  tickWorld(world, [frameForTick(1, { steer: 1 })]);

  assert.ok(car.heading < 0, `Expected heading < 0 for right steer, got ${car.heading}`);
});

test("right steer while reversing bends path right in top view", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  for (let tick = 1; tick <= 20; tick += 1) {
    tickWorld(world, [frameForTick(tick, { throttle: -1, steer: 1 })]);
  }

  assert.ok(car.position.y < 0, `Expected reverse-right arc with y < 0, got ${car.position.y}`);
});

test("left steer while reversing bends path left in top view", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  for (let tick = 1; tick <= 20; tick += 1) {
    tickWorld(world, [frameForTick(tick, { throttle: -1, steer: -1 })]);
  }

  assert.ok(car.position.y > 0, `Expected reverse-left arc with y > 0, got ${car.position.y}`);
});

test("air roll left twists car around forward axis while airborne", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  tickWorld(world, [frameForTick(1, { jump: true })]);
  const rollBeforeInput = car.roll;

  tickWorld(world, [frameForTick(2, { roll: -1 })]);

  assert.ok(car.onGround === false, "Expected car to remain airborne during roll test.");
  assert.ok(car.roll < rollBeforeInput, `Expected roll to decrease on left roll, got ${car.roll}`);
});

test("air pitch up rotates car around horizontal axis while airborne", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  tickWorld(world, [frameForTick(1, { jump: true })]);
  const pitchBeforeInput = car.pitch;

  tickWorld(world, [frameForTick(2, { pitch: -1 })]);

  assert.ok(car.onGround === false, "Expected car to remain airborne during pitch test.");
  assert.ok(car.pitch < pitchBeforeInput, `Expected pitch to decrease on pitch-up input, got ${car.pitch}`);
});
