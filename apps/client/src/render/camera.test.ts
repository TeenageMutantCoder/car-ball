import assert from "node:assert/strict";
import test from "node:test";

import type { RenderSnapshotState } from "./rendererBridge.ts";
import { createCameraController, resolveCameraPose, resolveNextCameraMode } from "./camera.ts";

function buildRenderSnapshot(): RenderSnapshotState {
  return {
    sequence: 5,
    timestamp: 1_738_120_123_000,
    tick: 55,
    match: {
      matchId: "match-1",
      phase: "playing",
      tick: 55,
      scoreByTeam: {
        "team-a": 1,
        "team-b": 2,
      },
      timeRemainingMs: 90_000,
    },
    cars: [
      {
        id: "car-1",
        ownerPlayerId: "player-1",
        teamId: "team-a",
        position: { x: 3, y: 1, z: 2 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 42,
      },
    ],
    ball: {
      id: "ball-1",
      position: { x: -5, y: 2, z: 6 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  };
}

test("resolveNextCameraMode toggles forward and ball", () => {
  assert.equal(resolveNextCameraMode("forward"), "ball");
  assert.equal(resolveNextCameraMode("ball"), "forward");
});

test("createCameraController exposes mode state and toggle behavior", () => {
  const controller = createCameraController({ initialMode: "ball" });

  assert.equal(controller.getMode(), "ball");
  assert.equal(controller.toggleMode(), "forward");
  assert.equal(controller.setMode("ball"), "ball");
  assert.equal(controller.getMode(), "ball");
});

test("resolveCameraPose targets focus car in forward mode", () => {
  const snapshot = buildRenderSnapshot();
  const pose = resolveCameraPose("forward", snapshot, "car-1");

  assert.deepEqual(pose.target, { x: 3, y: 1, z: 2 });
  assert.equal(pose.radius, 24);
});

test("resolveCameraPose targets ball in ball mode and missing-car fallback", () => {
  const snapshot = buildRenderSnapshot();

  const ballPose = resolveCameraPose("ball", snapshot, "car-1");
  assert.deepEqual(ballPose.target, { x: -5, y: 2, z: 6 });
  assert.equal(ballPose.radius, 14);

  const fallbackPose = resolveCameraPose("forward", snapshot, "car-missing");
  assert.deepEqual(fallbackPose.target, { x: -5, y: 2, z: 6 });
});