import assert from "node:assert/strict";
import test from "node:test";

import { createDebugHud } from "./hud.ts";

test("createDebugHud initializes defaults and returns immutable snapshots", () => {
  const hud = createDebugHud();

  const first = hud.getMetrics();
  assert.deepEqual(first, {
    fps: 0,
    frameTimeMs: 0,
    correctionCount: 0,
    pingMs: 0,
  });

  const second = hud.getMetrics();
  assert.notEqual(first, second);
  assert.deepEqual(second, first);
});

test("createDebugHud updateFrame tracks frame time and fps deterministically", () => {
  const hud = createDebugHud();

  const metrics = hud.updateFrame(16.6666666667);

  assert.equal(metrics.frameTimeMs, 16.6666666667);
  assert.ok(Math.abs(metrics.fps - 59.99999999988) < 0.000001);

  const zeroFrameMetrics = hud.updateFrame(0);
  assert.equal(zeroFrameMetrics.fps, 0);
});

test("createDebugHud supports correction and ping setters plus reset", () => {
  const hud = createDebugHud({
    initialMetrics: {
      pingMs: 25,
      correctionCount: 2,
      fps: 60,
      frameTimeMs: 16.67,
    },
  });

  hud.incrementCorrectionCount();
  hud.incrementCorrectionCount(3);
  hud.setPingMs(44);

  assert.deepEqual(hud.getMetrics(), {
    fps: 60,
    frameTimeMs: 16.67,
    correctionCount: 6,
    pingMs: 44,
  });

  hud.setCorrectionCount(10);
  hud.setFrameTimeMs(20);
  hud.setFps(50);

  assert.deepEqual(hud.getMetrics(), {
    fps: 50,
    frameTimeMs: 20,
    correctionCount: 10,
    pingMs: 44,
  });

  hud.reset({ pingMs: 12 });

  assert.deepEqual(hud.getMetrics(), {
    fps: 0,
    frameTimeMs: 0,
    correctionCount: 0,
    pingMs: 12,
  });
});

test("createDebugHud sanitizes invalid and negative values", () => {
  const hud = createDebugHud();

  hud.setFps(-5);
  hud.setFrameTimeMs(Number.NaN);
  hud.setPingMs(Number.POSITIVE_INFINITY);
  hud.incrementCorrectionCount(-10);

  assert.deepEqual(hud.getMetrics(), {
    fps: 0,
    frameTimeMs: 0,
    correctionCount: 0,
    pingMs: 0,
  });
});
