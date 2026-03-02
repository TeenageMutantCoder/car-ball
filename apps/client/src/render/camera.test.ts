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

test("resolveNextCameraMode toggles car and ball", () => {
  assert.equal(resolveNextCameraMode("car"), "ball");
  assert.equal(resolveNextCameraMode("ball"), "car");
});

test("createCameraController exposes mode state and toggle behavior", () => {
  const controller = createCameraController({ initialMode: "ball" });

  assert.equal(controller.getMode(), "ball");
  assert.equal(controller.toggleMode(), "car");
  assert.equal(controller.setMode("ball"), "ball");
  assert.equal(controller.getMode(), "ball");
});

test("resolveCameraPose uses third-person car camera behind focus car", () => {
  const snapshot = buildRenderSnapshot();
  const pose = resolveCameraPose("car", snapshot, "car-1");

  assert.deepEqual(pose.position, { x: -11, y: 6, z: 2 });
  assert.deepEqual(pose.target, { x: 21, y: 2.5, z: 2 });
});

test("resolveCameraPose ball mode keeps position but targets ball", () => {
  const snapshot = buildRenderSnapshot();

  const ballPose = resolveCameraPose("ball", snapshot, "car-1");
  const carPose = resolveCameraPose("car", snapshot, "car-1");

  assert.deepEqual(ballPose.position, carPose.position);
  assert.deepEqual(ballPose.target, { x: -5, y: 2, z: 6 });
});

test("resolveCameraPose missing-car fallback anchors camera from ball", () => {
  const snapshot = buildRenderSnapshot();

  const fallbackPose = resolveCameraPose("car", snapshot, "car-missing");
  assert.deepEqual(fallbackPose.position, { x: -19, y: 7, z: 6 });
  assert.deepEqual(fallbackPose.target, { x: 13, y: 3.5, z: 6 });
});