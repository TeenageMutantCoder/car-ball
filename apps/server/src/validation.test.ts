import assert from "node:assert/strict";
import test from "node:test";

import type { InputFrame } from "@car-ball/protocol";
import { SimulationCore } from "@car-ball/sim";

import {
  createInputValidationRoomState,
  createInputValidationTelemetry,
  minInputTickDelta,
  recordValidationResult,
  validateInputFrame
} from "./validation.ts";

function createInputFrame(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    version: 1,
    sequence: 1,
    timestamp: 1,
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
    },
    ...overrides
  };
}

test("validateInputFrame accepts valid frame", () => {
  const sim = new SimulationCore(["player-1"]);
  const state = createInputValidationRoomState();

  const result = validateInputFrame({
    frame: createInputFrame(),
    sim,
    state,
    minTickDelta: 2
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.lastAcceptedTickByPlayerId.get("player-1"), 1);
});

test("validateInputFrame rejects impossible acceleration", () => {
  const sim = new SimulationCore(["player-1"]);
  const state = createInputValidationRoomState();

  const result = validateInputFrame({
    frame: createInputFrame({
      controls: {
        throttle: 1.2,
        steer: 0,
        pitch: 0,
        roll: 0,
        jump: false,
        boost: false,
        handbrake: false
      }
    }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "IMPOSSIBLE_ACCELERATION");
});

test("validateInputFrame rejects impossible air pitch magnitude", () => {
  const sim = new SimulationCore(["player-1"]);
  const state = createInputValidationRoomState();

  const result = validateInputFrame({
    frame: createInputFrame({
      controls: {
        throttle: 1,
        steer: 0,
        pitch: 1.2,
        roll: 0,
        jump: false,
        boost: false,
        handbrake: false
      }
    }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "IMPOSSIBLE_ACCELERATION");
});

test("validateInputFrame rejects invalid boost usage for immediate tick when depleted", () => {
  const sim = new SimulationCore(["player-1"]);
  sim.world.cars["car:player-1"]!.boost = 0;
  const state = createInputValidationRoomState();

  const result = validateInputFrame({
    frame: createInputFrame({
      controls: {
        throttle: 1,
        steer: 0,
        pitch: 0,
        roll: 0,
        jump: false,
        boost: true,
        handbrake: false
      }
    }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_BOOST_USAGE");
});

test("validateInputFrame allows future-tick boost despite current depletion", () => {
  const sim = new SimulationCore(["player-1"]);
  sim.world.cars["car:player-1"]!.boost = 0;
  const state = createInputValidationRoomState();

  const result = validateInputFrame({
    frame: createInputFrame({
      tick: sim.world.clock.tick + 5,
      controls: {
        throttle: 1,
        steer: 0,
        pitch: 0,
        roll: 0,
        jump: false,
        boost: true,
        handbrake: false
      }
    }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.deepEqual(result, { ok: true });
});

test("validateInputFrame rejects cooldown abuse for sub-threshold tick cadence", () => {
  const sim = new SimulationCore(["player-1"]);
  const state = createInputValidationRoomState();

  const accepted = validateInputFrame({
    frame: createInputFrame({ tick: 6 }),
    sim,
    state,
    minTickDelta: 2
  });
  assert.deepEqual(accepted, { ok: true });

  const rejected = validateInputFrame({
    frame: createInputFrame({ tick: 7, sequence: 2 }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "COOLDOWN_ABUSE");
});

test("validateInputFrame rejects far-future tick without poisoning subsequent cadence", () => {
  const sim = new SimulationCore(["player-1"]);
  const state = createInputValidationRoomState();

  const farFuture = validateInputFrame({
    frame: createInputFrame({ tick: 9 }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.equal(farFuture.ok, false);
  assert.equal(farFuture.code, "COOLDOWN_ABUSE");

  const nearFuture = validateInputFrame({
    frame: createInputFrame({ tick: 2, sequence: 2 }),
    sim,
    state,
    minTickDelta: 2
  });

  assert.deepEqual(nearFuture, { ok: true });
  assert.equal(state.lastAcceptedTickByPlayerId.get("player-1"), 2);
});

test("recordValidationResult tracks accepted and rejected counters", () => {
  const telemetry = createInputValidationTelemetry();

  recordValidationResult(telemetry, { ok: true });
  recordValidationResult(telemetry, {
    ok: false,
    code: "IMPOSSIBLE_ACCELERATION",
    reason: "bad throttle"
  });

  assert.deepEqual(telemetry, {
    accepted: 1,
    rejected: 1,
    rejectedByCode: {
      IMPOSSIBLE_ACCELERATION: 1,
      INVALID_BOOST_USAGE: 0,
      COOLDOWN_ABUSE: 0
    }
  });
});

test("minInputTickDelta derives cadence limit from tick and input rates", () => {
  assert.equal(minInputTickDelta(120, 60), 2);
  assert.equal(minInputTickDelta(120, 120), 1);
});
