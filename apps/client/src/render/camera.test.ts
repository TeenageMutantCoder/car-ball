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
        onGround: true,
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

test("resolveCameraPose ball mode prioritizes ball in weighted target", () => {
  const snapshot = buildRenderSnapshot();

  const ballPose = resolveCameraPose("ball", snapshot, "car-1");
  const carPose = resolveCameraPose("car", snapshot, "car-1");

  assert.notDeepEqual(ballPose.position, carPose.position);
  assert.ok(Math.abs(ballPose.target.x + 2.76) < 1e-12);
  assert.ok(Math.abs(ballPose.target.y - 3.97) < 1e-12);
  assert.ok(Math.abs(ballPose.target.z - 4.88) < 1e-12);
});

test("resolveCameraPose missing-car fallback anchors camera from ball", () => {
  const snapshot = buildRenderSnapshot();

  const fallbackPose = resolveCameraPose("car", snapshot, "car-missing");
  assert.deepEqual(fallbackPose.position, { x: -19, y: 7, z: 6 });
  assert.deepEqual(fallbackPose.target, { x: 13, y: 3.5, z: 6 });
});

test("car camera ignores pitch while grounded", () => {
  const snapshot = buildRenderSnapshot();
  snapshot.cars[0]!.rotation = {
    x: 0,
    y: 0,
    z: -Math.sin(Math.PI / 8),
    w: Math.cos(Math.PI / 8),
  };

  const pose = resolveCameraPose("car", snapshot, "car-1");
  assert.deepEqual(pose.position, { x: -11, y: 6, z: 2 });
});

test("camera controller keeps last grounded direction while airborne", () => {
  const controller = createCameraController();
  const snapshot = buildRenderSnapshot();

  const groundedPose = controller.resolvePose(snapshot, "car-1", 16, { yaw: 0, pitch: 0 });

  snapshot.cars[0]!.onGround = false;
  snapshot.cars[0]!.rotation = {
    x: 0,
    y: Math.sin(Math.PI / 2),
    z: 0,
    w: Math.cos(Math.PI / 2),
  };

  const airbornePose = controller.resolvePose(snapshot, "car-1", 16, { yaw: 0, pitch: 0 });
  assert.equal(airbornePose.position.x, groundedPose.position.x);
  assert.equal(airbornePose.position.z, groundedPose.position.z);
});

test("camera controller applies temporary look input with easing", () => {
  const controller = createCameraController();
  const snapshot = buildRenderSnapshot();

  const baseline = controller.resolvePose(snapshot, "car-1", 16, { yaw: 0, pitch: 0 });
  const lookRight = controller.resolvePose(snapshot, "car-1", 1000, { yaw: 1, pitch: 0 });

  assert.notEqual(lookRight.target.z, baseline.target.z);

  const released = controller.resolvePose(snapshot, "car-1", 1000, { yaw: 0, pitch: 0 });
  assert.ok(Math.abs(released.target.z - baseline.target.z) < Math.abs(lookRight.target.z - baseline.target.z));
});