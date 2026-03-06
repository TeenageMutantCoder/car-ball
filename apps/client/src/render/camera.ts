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
  resolvePose: (
    snapshot: RenderSnapshotState,
    focusCarId: string,
    deltaMs: number,
    lookInput: CameraLookInput,
  ) => CameraPose;
}

export interface CreateCameraControllerOptions {
  initialMode?: CameraMode;
}

export interface CameraLookInput {
  yaw: number;
  pitch: number;
}

interface CameraLookAngles {
  yaw: number;
  pitch: number;
}

interface ResolveCameraPoseOptions {
  lookAngles?: CameraLookAngles;
  drivingForwardByCarId?: Map<string, Vec3>;
}

const CAMERA_BACK_DISTANCE = 14;
const CAMERA_HEIGHT = 5;
const CAMERA_LOOK_AHEAD_DISTANCE = 18;
const CAR_CAM_TARGET_HEIGHT = 1.5;
const BALL_CAM_BALL_WEIGHT = 0.72;
const BALL_CAM_CAR_WEIGHT = 1 - BALL_CAM_BALL_WEIGHT;
const BALL_CAM_TARGET_HEIGHT = 2.25;
const LOOK_MAX_RADIANS = Math.PI / 2;
const LOOK_EASING_PER_SECOND = 12;
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
const DEFAULT_FORWARD: Vec3 = { x: 1, y: 0, z: 0 };

export function createCameraController(options: CreateCameraControllerOptions = {}): CameraController {
  let mode: CameraMode = options.initialMode ?? "car";
  let lookAngles: CameraLookAngles = { yaw: 0, pitch: 0 };
  const drivingForwardByCarId = new Map<string, Vec3>();

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
    resolvePose(
      snapshot: RenderSnapshotState,
      focusCarId: string,
      deltaMs: number,
      lookInput: CameraLookInput,
    ): CameraPose {
      lookAngles = updateLookAngles(lookAngles, lookInput, deltaMs);
      return resolveCameraPose(mode, snapshot, focusCarId, {
        lookAngles,
        drivingForwardByCarId,
      });
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
  options: ResolveCameraPoseOptions = {},
): CameraPose {
  const focusCar = snapshot.cars.find((car) => car.id === focusCarId);
  const basePosition = focusCar?.position ?? snapshot.ball.position;
  const forward = resolveDrivingForward(focusCar, focusCarId, options.drivingForwardByCarId);
  const ballDirection = normalizeHorizontalVec3(subtractVec3(snapshot.ball.position, basePosition));
  const followDirection =
    mode === "ball" && ballDirection !== null
      ? normalizeVec3(addVec3(scaleVec3(forward, 0.55), scaleVec3(ballDirection, 0.45)))
      : forward;
  const cameraPosition = addVec3(
    addVec3(basePosition, scaleVec3(followDirection, -CAMERA_BACK_DISTANCE)),
    scaleVec3(WORLD_UP, CAMERA_HEIGHT),
  );

  let target: Vec3;

  if (mode === "ball") {
    target = resolveBallCameraTarget(basePosition, snapshot.ball.position);
  } else {
    target = addVec3(
      addVec3(basePosition, scaleVec3(forward, CAMERA_LOOK_AHEAD_DISTANCE)),
      scaleVec3(WORLD_UP, CAR_CAM_TARGET_HEIGHT),
    );
  }

  const adjustedTarget = applyLookAngles(cameraPosition, target, options.lookAngles);

  return {
    position: cameraPosition,
    target: adjustedTarget,
  };
}

function resolveBallCameraTarget(carPosition: Vec3, ballPosition: Vec3): Vec3 {
  return {
    x: ballPosition.x * BALL_CAM_BALL_WEIGHT + carPosition.x * BALL_CAM_CAR_WEIGHT,
    y: ballPosition.y * BALL_CAM_BALL_WEIGHT + carPosition.y * BALL_CAM_CAR_WEIGHT + BALL_CAM_TARGET_HEIGHT,
    z: ballPosition.z * BALL_CAM_BALL_WEIGHT + carPosition.z * BALL_CAM_CAR_WEIGHT,
  };
}

function resolveDrivingForward(
  focusCar: RenderSnapshotState["cars"][number] | undefined,
  focusCarId: string,
  drivingForwardByCarId: Map<string, Vec3> | undefined,
): Vec3 {
  if (focusCar === undefined) {
    return DEFAULT_FORWARD;
  }

  const carForward = normalizeVec3(rotateVec3ByQuaternion(DEFAULT_FORWARD, focusCar.rotation));
  const flattenedForward = normalizeHorizontalVec3(carForward);
  const groundedForward = flattenedForward ?? DEFAULT_FORWARD;

  if (focusCar.onGround ?? false) {
    if (drivingForwardByCarId !== undefined) {
      drivingForwardByCarId.set(focusCarId, groundedForward);
    }

    return groundedForward;
  }

  const rememberedForward = drivingForwardByCarId?.get(focusCarId);
  if (rememberedForward !== undefined) {
    return rememberedForward;
  }

  if (drivingForwardByCarId !== undefined) {
    drivingForwardByCarId.set(focusCarId, groundedForward);
  }

  return groundedForward;
}

function applyLookAngles(position: Vec3, target: Vec3, lookAngles: CameraLookAngles | undefined): Vec3 {
  if (lookAngles === undefined) {
    return cloneVec3(target);
  }

  const direction = subtractVec3(target, position);
  const directionLength = Math.hypot(direction.x, direction.y, direction.z);
  if (directionLength < 1e-6) {
    return cloneVec3(target);
  }

  let rotatedDirection = rotateAroundAxis(direction, WORLD_UP, lookAngles.yaw);
  const normalizedDirection = normalizeVec3(rotatedDirection);
  const cameraRight = normalizeVec3(crossVec3(normalizedDirection, WORLD_UP));
  rotatedDirection = rotateAroundAxis(rotatedDirection, cameraRight, lookAngles.pitch);
  const normalizedRotatedDirection = normalizeVec3(rotatedDirection);

  return addVec3(position, scaleVec3(normalizedRotatedDirection, directionLength));
}

function updateLookAngles(
  currentAngles: CameraLookAngles,
  input: CameraLookInput,
  deltaMs: number,
): CameraLookAngles {
  const targetYaw = clamp(input.yaw, -1, 1) * LOOK_MAX_RADIANS;
  const targetPitch = clamp(input.pitch, -1, 1) * LOOK_MAX_RADIANS;
  const deltaSeconds = Math.max(0, deltaMs) / 1000;
  const alpha = 1 - Math.exp(-LOOK_EASING_PER_SECOND * deltaSeconds);

  return {
    yaw: clamp(lerp(currentAngles.yaw, targetYaw, alpha), -LOOK_MAX_RADIANS, LOOK_MAX_RADIANS),
    pitch: clamp(lerp(currentAngles.pitch, targetPitch, alpha), -LOOK_MAX_RADIANS, LOOK_MAX_RADIANS),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function normalizeHorizontalVec3(value: Vec3): Vec3 | null {
  const length = Math.hypot(value.x, value.z);
  if (length < 1e-6) {
    return null;
  }

  return {
    x: value.x / length,
    y: 0,
    z: value.z / length,
  };
}

function rotateAroundAxis(value: Vec3, axis: Vec3, angle: number): Vec3 {
  const normalizedAxis = normalizeVec3(axis);
  const cosTheta = Math.cos(angle);
  const sinTheta = Math.sin(angle);
  const first = scaleVec3(value, cosTheta);
  const second = scaleVec3(crossVec3(normalizedAxis, value), sinTheta);
  const third = scaleVec3(normalizedAxis, dotVec3(normalizedAxis, value) * (1 - cosTheta));

  return addVec3(addVec3(first, second), third);
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