import assert from "node:assert/strict";
import test from "node:test";

import type { InputFrame } from "@car-ball/protocol";

import { SimulationCore } from "./simulation.ts";

test("advance caps accumulator by max substeps", () => {
  const sim = new SimulationCore(["player-1"], {
    fixedStepMs: 10,
    maxSubsteps: 4
  });

  const result = sim.advance(1000);

  assert.equal(result.substeps, 4);
  assert.equal(result.tick, 4);
  assert.equal(sim.world.clock.tick, 4);
  assert.equal(result.accumulatorMs, 0);
  assert.equal(result.droppedMs, 960);
});

test("late input ticks clamp to next simulation tick", () => {
  const sim = new SimulationCore(["player-1"], {
    fixedStepMs: 10,
    maxSubsteps: 4
  });

  sim.advance(20);
  assert.equal(sim.world.clock.tick, 2);

  const baselineVelocityX = sim.world.cars["car:player-1"]?.velocity.x ?? 0;

  const lateInput: InputFrame = {
    version: 1,
    sequence: 1,
    timestamp: 1,
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
  };

  sim.enqueueInput(lateInput);
  sim.advance(10);

  assert.equal(sim.world.clock.tick, 3);
  const velocityAfter = sim.world.cars["car:player-1"]?.velocity.x ?? 0;
  assert.notEqual(velocityAfter, baselineVelocityX);
});