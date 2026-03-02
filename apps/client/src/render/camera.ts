import type { Vec3 } from "@car-ball/protocol";

import type { RenderSnapshotState } from "./rendererBridge.ts";

export type CameraMode = "car" | "ball";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export interface CameraController {
  getMode: () => CameraMode;
  setMode: (mode: CameraMode) => CameraMode;
  toggleMode: () => CameraMode;
}

export interface CreateCameraControllerOptions {
  initialMode?: CameraMode;
}

const CAMERA_BACK_DISTANCE = 14;
const CAMERA_HEIGHT = 5;
const CAMERA_LOOK_AHEAD_DISTANCE = 18;
const CAR_CAM_TARGET_HEIGHT = 1.5;
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
const DEFAULT_FORWARD: Vec3 = { x: 1, y: 0, z: 0 };

export function createCameraController(options: CreateCameraControllerOptions = {}): CameraController {
  let mode: CameraMode = options.initialMode ?? "car";

  return {
    getMode(): CameraMode {
      return mode;
    },
    setMode(nextMode: CameraMode): CameraMode {
      mode = nextMode;
      return mode;
    },
    toggleMode(): CameraMode {
      mode = resolveNextCameraMode(mode);
      return mode;
    },
  };
}

export function resolveNextCameraMode(mode: CameraMode): CameraMode {
  return mode === "car" ? "ball" : "car";
}

export function resolveCameraPose(
  mode: CameraMode,
  snapshot: RenderSnapshotState,
  focusCarId: string,
): CameraPose {
  const focusCar = snapshot.cars.find((car) => car.id === focusCarId);
  const basePosition = focusCar?.position ?? snapshot.ball.position;
  const forward =
    focusCar === undefined
      ? DEFAULT_FORWARD
      : normalizeVec3(rotateVec3ByQuaternion(DEFAULT_FORWARD, focusCar.rotation));
  const cameraPosition = addVec3(
    addVec3(basePosition, scaleVec3(forward, -CAMERA_BACK_DISTANCE)),
    scaleVec3(WORLD_UP, CAMERA_HEIGHT),
  );

  if (mode === "ball") {
    return {
      position: cameraPosition,
      target: cloneVec3(snapshot.ball.position),
    };
  }

  return {
    position: cameraPosition,
    target: addVec3(
      addVec3(basePosition, scaleVec3(forward, CAMERA_LOOK_AHEAD_DISTANCE)),
      scaleVec3(WORLD_UP, CAR_CAM_TARGET_HEIGHT),
    ),
  };
}

function cloneVec3(value: Vec3): Vec3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

function scaleVec3(value: Vec3, scalar: number): Vec3 {
  return {
    x: value.x * scalar,
    y: value.y * scalar,
    z: value.z * scalar,
  };
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-6) {
    return DEFAULT_FORWARD;
  }

  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  };
}

function rotateVec3ByQuaternion(value: Vec3, quaternion: { x: number; y: number; z: number; w: number }): Vec3 {
  const u = { x: quaternion.x, y: quaternion.y, z: quaternion.z };
  const s = quaternion.w;
  const dotUV = dotVec3(u, value);
  const dotUU = dotVec3(u, u);
  const crossUV = crossVec3(u, value);

  const first = scaleVec3(u, 2 * dotUV);
  const second = scaleVec3(value, s * s - dotUU);
  const third = scaleVec3(crossUV, 2 * s);

  return addVec3(addVec3(first, second), third);
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}