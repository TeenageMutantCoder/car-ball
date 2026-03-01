import assert from "node:assert/strict";
import test from "node:test";

import { SimulationCore } from "../src/simulation.ts";

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
