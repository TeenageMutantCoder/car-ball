import assert from "node:assert/strict";
import test from "node:test";

import { SimulationCore } from "./simulation.ts";

test("rapier shadow mode preserves authoritative world outputs", () => {
  const baseline = new SimulationCore(["player-1"], {
    fixedStepMs: 8,
    maxSubsteps: 1,
    rapierShadow: {
      enabled: false
    }
  });

  const shadow = new SimulationCore(["player-1"], {
    fixedStepMs: 8,
    maxSubsteps: 1,
    rapierShadow: {
      enabled: true,
      shadowMode: true
    }
  });

  const frames = [
    {
      version: 1 as const,
      sequence: 1,
      timestamp: 8,
      tick: 1,
      playerId: "player-1",
      carId: "car:player-1",
      controls: {
        throttle: 1,
        steer: 0.3,
        jump: false,
        boost: true,
        handbrake: false
      }
    },
    {
      version: 1 as const,
      sequence: 2,
      timestamp: 16,
      tick: 2,
      playerId: "player-1",
      carId: "car:player-1",
      controls: {
        throttle: 0.8,
        steer: -0.2,
        jump: true,
        boost: false,
        handbrake: false
      }
    }
  ];

  baseline.enqueueInputs(frames);
  shadow.enqueueInputs(frames);

  baseline.advance(16);
  shadow.advance(16);

  assert.deepEqual(shadow.world, baseline.world);
});

test("rapier shadow lifecycle initializes and steps when enabled", () => {
  const calls = {
    init: 0,
    step: 0,
    reset: 0,
    lastDt: 0
  };

  const sim = new SimulationCore(["player-1"], {
    fixedStepMs: 10,
    maxSubsteps: 1,
    rapierShadow: {
      enabled: true,
      shadowMode: true,
      createBackend: () => ({
        init(): void {
          calls.init += 1;
        },
        step(dtSeconds: number): void {
          calls.step += 1;
          calls.lastDt = dtSeconds;
        },
        reset(): void {
          calls.reset += 1;
        }
      })
    }
  });

  const initialMetrics = sim.getRapierShadowMetrics();
  assert.equal(initialMetrics.enabled, true);
  assert.equal(initialMetrics.shadowMode, true);
  assert.equal(initialMetrics.initialized, true);
  assert.equal(calls.init, 1);

  sim.advance(10);

  const steppedMetrics = sim.getRapierShadowMetrics();
  assert.equal(calls.step, 1);
  assert.equal(calls.lastDt, 0.01);
  assert.equal(steppedMetrics.stepCount, 1);
  assert.equal(steppedMetrics.lastStepDtSeconds, 0.01);

  sim.resetRapierShadow();

  const resetMetrics = sim.getRapierShadowMetrics();
  assert.equal(calls.reset, 1);
  assert.equal(resetMetrics.stepCount, 0);
  assert.equal(resetMetrics.resetCount, 1);
  assert.equal(resetMetrics.lastStepDtSeconds, null);
});

test("rapier shadow does not step when disabled", () => {
  const calls = {
    init: 0,
    step: 0,
    reset: 0
  };

  const sim = new SimulationCore(["player-1"], {
    fixedStepMs: 8,
    maxSubsteps: 1,
    rapierShadow: {
      enabled: false,
      shadowMode: true,
      createBackend: () => ({
        init(): void {
          calls.init += 1;
        },
        step(): void {
          calls.step += 1;
        },
        reset(): void {
          calls.reset += 1;
        }
      })
    }
  });

  sim.advance(8);
  sim.resetRapierShadow();

  const metrics = sim.getRapierShadowMetrics();
  assert.equal(calls.init, 0);
  assert.equal(calls.step, 0);
  assert.equal(calls.reset, 0);
  assert.equal(metrics.enabled, false);
  assert.equal(metrics.initialized, false);
  assert.equal(metrics.stepCount, 0);
});

test("rapier shadow does not step when shadow mode is disabled", () => {
  const calls = {
    init: 0,
    step: 0,
    reset: 0
  };

  const sim = new SimulationCore(["player-1"], {
    fixedStepMs: 16,
    maxSubsteps: 1,
    rapierShadow: {
      enabled: true,
      shadowMode: false,
      createBackend: () => ({
        init(): void {
          calls.init += 1;
        },
        step(): void {
          calls.step += 1;
        },
        reset(): void {
          calls.reset += 1;
        }
      })
    }
  });

  sim.advance(16);

  const metrics = sim.getRapierShadowMetrics();
  assert.equal(calls.init, 1);
  assert.equal(calls.step, 0);
  assert.equal(metrics.enabled, true);
  assert.equal(metrics.shadowMode, false);
  assert.equal(metrics.stepCount, 0);
});
