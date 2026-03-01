import assert from "node:assert/strict";
import test from "node:test";

import type { InputFrame } from "@car-ball/protocol";
import { runReplayHashSnapshots } from "../src/replayHash.ts";

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

test("replay hash snapshots are deterministic for identical input streams", () => {
  const inputFrames = buildScript(180);

  const firstRun = runReplayHashSnapshots({
    playerIds: ["player-1"],
    inputFrames,
    totalTicks: 180,
    hashEveryNTicks: 15
  });

  const secondRun = runReplayHashSnapshots({
    playerIds: ["player-1"],
    inputFrames,
    totalTicks: 180,
    hashEveryNTicks: 15
  });

  assert.deepEqual(firstRun, secondRun);
  assert.ok(firstRun.length > 0);
});
