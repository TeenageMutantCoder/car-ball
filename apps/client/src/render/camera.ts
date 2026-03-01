import type { Vec3 } from "@car-ball/protocol";

import type { RenderSnapshotState } from "./rendererBridge.ts";

export type CameraMode = "forward" | "ball";

export interface CameraPose {
  alpha: number;
  beta: number;
  radius: number;
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

const FORWARD_CAMERA_POSE = {
  alpha: Math.PI / 2,
  beta: Math.PI / 3,
  radius: 24,
} as const;

const BALL_CAMERA_POSE = {
  alpha: Math.PI / 2,
  beta: Math.PI / 3,
  radius: 14,
} as const;

export function createCameraController(options: CreateCameraControllerOptions = {}): CameraController {
  let mode: CameraMode = options.initialMode ?? "forward";

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
  return mode === "forward" ? "ball" : "forward";
}

export function resolveCameraPose(
  mode: CameraMode,
  snapshot: RenderSnapshotState,
  focusCarId: string,
): CameraPose {
  if (mode === "ball") {
    return {
      alpha: BALL_CAMERA_POSE.alpha,
      beta: BALL_CAMERA_POSE.beta,
      radius: BALL_CAMERA_POSE.radius,
      target: cloneVec3(snapshot.ball.position),
    };
  }

  const focusCar = snapshot.cars.find((car) => car.id === focusCarId);
  return {
    alpha: FORWARD_CAMERA_POSE.alpha,
    beta: FORWARD_CAMERA_POSE.beta,
    radius: FORWARD_CAMERA_POSE.radius,
    target: cloneVec3(focusCar?.position ?? snapshot.ball.position),
  };
}

function cloneVec3(value: Vec3): Vec3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}