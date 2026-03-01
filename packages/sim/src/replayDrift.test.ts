import assert from "node:assert/strict";
import test from "node:test";

import type { InputFrame } from "@car-ball/protocol";
import { runReplayDriftReport } from "./replayDrift.ts";

function buildScript(totalTicks: number): InputFrame[] {
  const frames: InputFrame[] = [];

  for (let tick = 1; tick <= totalTicks; tick += 1) {
    frames.push({
      version: 1,
      timestamp: tick * 8,
      playerId: "player-1",
      carId: "car:player-1",
      tick,
      sequence: tick,
      controls: {
        throttle: tick % 2 === 0 ? 1 : 0.8,
        steer: tick % 3 === 0 ? 0.3 : -0.25,
        handbrake: tick % 10 === 0,
        boost: tick % 5 === 0,
        jump: tick % 37 === 0
      }
    });
  }

  return frames;
}

test("replay drift report is zero for identical input streams", () => {
  const inputFrames = buildScript(180);

  const report = runReplayDriftReport({
    playerIds: ["player-1"],
    baselineInputFrames: inputFrames,
    candidateInputFrames: inputFrames,
    totalTicks: 180,
    sampleEveryNTicks: 15
  });

  assert.equal(report.sampledTicks, 12);
  assert.equal(report.driftCount, 0);
  assert.equal(report.driftRatePct, 0);
  assert.equal(report.firstDivergedTick, null);
  assert.equal(report.endCarDriftCm, 0);
  assert.equal(report.endBallDriftCm, 0);
});

test("replay drift report captures divergence for different input streams", () => {
  const baselineInputFrames = buildScript(180);
  const candidateInputFrames = baselineInputFrames.map((frame) => ({
    ...frame,
    controls: { ...frame.controls }
  }));

  for (const frame of candidateInputFrames) {
    if (frame.tick >= 60) {
      frame.controls.throttle = 0.2;
      frame.controls.steer = 1;
      frame.controls.boost = false;
    }
  }

  const report = runReplayDriftReport({
    playerIds: ["player-1"],
    baselineInputFrames,
    candidateInputFrames,
    totalTicks: 180,
    sampleEveryNTicks: 15
  });

  assert.ok(report.sampledTicks > 0);
  assert.ok(report.driftCount > 0);
  assert.ok(report.driftRatePct > 0);
  assert.ok(report.firstDivergedTick !== null);
  assert.ok(report.endCarDriftCm > 0);
  assert.equal(report.endBallDriftCm, 0);
});
