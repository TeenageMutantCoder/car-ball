import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCorrection,
  computePositionErrorCm,
  computeVelocityError,
  createCorrectionTelemetry,
  shouldCorrect,
} from "./reconciliation.ts";

test("computePositionErrorCm returns euclidean distance in centimeters", () => {
  const errorCm = computePositionErrorCm(
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 4, z: 0 },
  );

  assert.equal(errorCm, 500);
});

test("computeVelocityError returns euclidean delta magnitude", () => {
  const error = computeVelocityError(
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 6, z: 3 },
  );

  assert.equal(error, 5);
});

test("shouldCorrect applies deadzone threshold strictly", () => {
  assert.equal(shouldCorrect(0, 10), false);
  assert.equal(shouldCorrect(10, 10), false);
  assert.equal(shouldCorrect(10.001, 10), true);
});

test("shouldCorrect normalizes invalid inputs safely", () => {
  assert.equal(shouldCorrect(Number.NaN, 10), false);
  assert.equal(shouldCorrect(5, Number.NaN), true);
  assert.equal(shouldCorrect(-10, 2), false);
  assert.equal(shouldCorrect(1, -10), true);
});

test("applyCorrection interpolates and clamps alpha", () => {
  const previous = { x: 0, y: 10, z: 20 };
  const current = { x: 10, y: 20, z: 30 };

  assert.deepEqual(applyCorrection(previous, current, 0.5), { x: 5, y: 15, z: 25 });
  assert.deepEqual(applyCorrection(previous, current, -1), previous);
  assert.deepEqual(applyCorrection(previous, current, 2), current);
  assert.deepEqual(applyCorrection(previous, current, Number.NaN), previous);
});

test("correction telemetry tracks rolling window count, average magnitude, and max spike", () => {
  const telemetry = createCorrectionTelemetry(60_000);

  const first = telemetry.recordCorrection(10, 0);
  assert.deepEqual(first, {
    correctionsPerMinuteWindow: 1,
    averageMagnitudeCm: 10,
    maxSpikeCm: 10,
  });

  const second = telemetry.recordCorrection(30, 20_000);
  assert.deepEqual(second, {
    correctionsPerMinuteWindow: 2,
    averageMagnitudeCm: 20,
    maxSpikeCm: 30,
  });

  const third = telemetry.recordCorrection(25, 61_000);
  assert.deepEqual(third, {
    correctionsPerMinuteWindow: 2,
    averageMagnitudeCm: 27.5,
    maxSpikeCm: 30,
  });

  const currentMetrics = telemetry.getMetrics(90_000);
  assert.deepEqual(currentMetrics, {
    correctionsPerMinuteWindow: 1,
    averageMagnitudeCm: 25,
    maxSpikeCm: 25,
  });
});

test("correction telemetry reset clears counters", () => {
  const telemetry = createCorrectionTelemetry(60_000);
  telemetry.recordCorrection(15, 10_000);
  telemetry.recordCorrection(25, 20_000);

  telemetry.reset();

  assert.deepEqual(telemetry.getMetrics(30_000), {
    correctionsPerMinuteWindow: 0,
    averageMagnitudeCm: 0,
    maxSpikeCm: 0,
  });
});