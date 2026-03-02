import type { InputControls, InputFrame } from "@car-ball/protocol";
import {
  DOUBLE_JUMP_DIRECTIONAL_IMPULSE,
  DOUBLE_JUMP_VERTICAL_IMPULSE,
  DOUBLE_JUMP_WINDOW_TICKS,
  FIXED_STEP_SECONDS,
  TRACTION_ATTACH_MAX_SPEED,
  TRACTION_CONTACT_DISTANCE,
  TRACTION_DAMPING_PER_SECOND,
  TRACTION_DETACH_MAX_ANGLE_FROM_TANGENT_RADIANS,
  TRACTION_DETACH_NORMAL_SPEED,
  TRACTION_DETACH_SPEED
} from "./constants.ts";
import type { TractionSurface, WorldState } from "./state.ts";

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  boost: false,
  jump: false
};

const ACCELERATION = 42;
const BOOST_ACCELERATION = 24;
const BRAKE_DAMPING_PER_SECOND = 8;
const DRAG_DAMPING_PER_SECOND = 0.9;
const STEER_RADIANS_PER_SECOND = 2.6;
const BOOST_DRAIN_PER_SECOND = 35;
const JUMP_IMPULSE = 6;
const BALL_DAMPING_PER_SECOND = 0.5;
const GRAVITY_Z = -9.81;

const TRACTION_NONE_SURFACE: TractionSurface = "none";

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface TractionContactCandidate {
  surface: TractionSurface;
  normal: Vec3Like;
  distance: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function damping(dampingPerSecond: number, dtSeconds: number): number {
  return Math.max(0, 1 - dampingPerSecond * dtSeconds);
}

function dot(left: Vec3Like, right: Vec3Like): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Vec3Like): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function projectOntoPlane(vector: Vec3Like, normal: Vec3Like): Vec3Like {
  const normalVelocity = dot(vector, normal);
  return {
    x: vector.x - normal.x * normalVelocity,
    y: vector.y - normal.y * normalVelocity,
    z: vector.z - normal.z * normalVelocity
  };
}

function normalForSurface(surface: TractionSurface): Vec3Like {
  switch (surface) {
    case "wall-x-min":
      return { x: 1, y: 0, z: 0 };
    case "wall-x-max":
      return { x: -1, y: 0, z: 0 };
    case "wall-y-min":
      return { x: 0, y: 1, z: 0 };
    case "wall-y-max":
      return { x: 0, y: -1, z: 0 };
    case "ceiling":
      return { x: 0, y: 0, z: -1 };
    case "none":
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

function setTractionDetached(car: WorldState["cars"][string]): void {
  car.tractionAttached = false;
  car.tractionSurface = TRACTION_NONE_SURFACE;
  car.tractionNormal = { x: 0, y: 0, z: 0 };
}

function setTractionAttached(car: WorldState["cars"][string], candidate: TractionContactCandidate): void {
  car.tractionAttached = true;
  car.tractionSurface = candidate.surface;
  car.tractionNormal = {
    x: candidate.normal.x,
    y: candidate.normal.y,
    z: candidate.normal.z
  };
  car.onGround = false;
}

function wallOrCeilingCandidate(world: WorldState, position: Vec3Like): TractionContactCandidate | undefined {
  const candidates: TractionContactCandidate[] = [];
  const { min, max } = world.arena.bounds;

  const xMinDistance = Math.abs(position.x - min.x);
  if (xMinDistance <= TRACTION_CONTACT_DISTANCE) {
    candidates.push({
      surface: "wall-x-min",
      normal: normalForSurface("wall-x-min"),
      distance: xMinDistance
    });
  }

  const xMaxDistance = Math.abs(max.x - position.x);
  if (xMaxDistance <= TRACTION_CONTACT_DISTANCE) {
    candidates.push({
      surface: "wall-x-max",
      normal: normalForSurface("wall-x-max"),
      distance: xMaxDistance
    });
  }

  const yMinDistance = Math.abs(position.y - min.y);
  if (yMinDistance <= TRACTION_CONTACT_DISTANCE) {
    candidates.push({
      surface: "wall-y-min",
      normal: normalForSurface("wall-y-min"),
      distance: yMinDistance
    });
  }

  const yMaxDistance = Math.abs(max.y - position.y);
  if (yMaxDistance <= TRACTION_CONTACT_DISTANCE) {
    candidates.push({
      surface: "wall-y-max",
      normal: normalForSurface("wall-y-max"),
      distance: yMaxDistance
    });
  }

  const ceilingDistance = Math.abs(max.z - position.z);
  if (ceilingDistance <= TRACTION_CONTACT_DISTANCE) {
    candidates.push({
      surface: "ceiling",
      normal: normalForSurface("ceiling"),
      distance: ceilingDistance
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((left, right) => {
    const distanceDelta = left.distance - right.distance;
    return distanceDelta !== 0 ? distanceDelta : left.surface.localeCompare(right.surface);
  });

  return candidates[0];
}

function clampPositionToSurface(world: WorldState, car: WorldState["cars"][string]): void {
  switch (car.tractionSurface) {
    case "wall-x-min":
      car.position.x = world.arena.bounds.min.x;
      break;
    case "wall-x-max":
      car.position.x = world.arena.bounds.max.x;
      break;
    case "wall-y-min":
      car.position.y = world.arena.bounds.min.y;
      break;
    case "wall-y-max":
      car.position.y = world.arena.bounds.max.y;
      break;
    case "ceiling":
      car.position.z = world.arena.bounds.max.z;
      break;
    case "none":
    default:
      break;
  }
}

function shouldDetachFromTraction(car: WorldState["cars"][string]): boolean {
  const speed = magnitude(car.velocity);
  if (speed > TRACTION_DETACH_SPEED) {
    return true;
  }

  const normalSpeed = Math.abs(dot(car.velocity, car.tractionNormal));
  if (normalSpeed > TRACTION_DETACH_NORMAL_SPEED) {
    return true;
  }

  if (speed <= Number.EPSILON) {
    return false;
  }

  const angleFromTangent = Math.asin(clamp(normalSpeed / speed, 0, 1));
  return angleFromTangent > TRACTION_DETACH_MAX_ANGLE_FROM_TANGENT_RADIANS;
}

function controlsForTick(inputFrames: InputFrame[]): Map<string, InputControls> {
  const latestByCar = new Map<string, InputFrame>();

  for (const frame of inputFrames) {
    const previous = latestByCar.get(frame.carId);
    if (previous === undefined || frame.sequence > previous.sequence) {
      latestByCar.set(frame.carId, frame);
    }
  }

  const controlsMap = new Map<string, InputControls>();
  for (const [carId, frame] of latestByCar.entries()) {
    controlsMap.set(carId, frame.controls);
  }

  return controlsMap;
}

export function tickWorld(world: WorldState, inputFrames: InputFrame[], dtSeconds = FIXED_STEP_SECONDS): void {
  const controlsByCar = controlsForTick(inputFrames);
  const sortedCarIds = Object.keys(world.cars).sort();

  for (const carId of sortedCarIds) {
    const car = world.cars[carId];
    const controls = controlsByCar.get(car.id) ?? DEFAULT_CONTROLS;

    const steer = clamp(controls.steer, -1, 1);
    const throttle = clamp(controls.throttle, -1, 1);
    const steeringDirection = throttle < 0 ? -1 : 1;

    car.heading -= steer * steeringDirection * STEER_RADIANS_PER_SECOND * dtSeconds;

    const forwardX = Math.cos(car.heading);
    const forwardY = Math.sin(car.heading);

    const boostEnabled = controls.boost && car.boost > 0;
    const accel = throttle * ACCELERATION + (boostEnabled ? BOOST_ACCELERATION : 0);
    const jumpPressed = controls.jump;
    const jumpEdge = jumpPressed && !car.jumpPressedLastTick;

    car.velocity.x += forwardX * accel * dtSeconds;
    car.velocity.y += forwardY * accel * dtSeconds;

    if (jumpEdge && car.onGround) {
      car.velocity.z = JUMP_IMPULSE;
      car.onGround = false;
      setTractionDetached(car);
      car.jumpCount = 1;
      car.jumpWindowTicksRemaining = DOUBLE_JUMP_WINDOW_TICKS;
    } else if (jumpEdge && !car.onGround && car.jumpCount === 1 && car.jumpWindowTicksRemaining > 0) {
      const rightX = -Math.sin(car.heading);
      const rightY = Math.cos(car.heading);
      const directionX = forwardX * throttle + rightX * steer;
      const directionY = forwardY * throttle + rightY * steer;
      const directionMagnitude = Math.hypot(directionX, directionY);

      if (directionMagnitude > 0) {
        const scale = DOUBLE_JUMP_DIRECTIONAL_IMPULSE / directionMagnitude;
        car.velocity.x += directionX * scale;
        car.velocity.y += directionY * scale;
      }

      car.velocity.z += DOUBLE_JUMP_VERTICAL_IMPULSE;
      car.jumpCount = 2;
      car.jumpWindowTicksRemaining = 0;
    }

    if (car.tractionAttached) {
      if (shouldDetachFromTraction(car)) {
        setTractionDetached(car);
      } else {
        const contactCandidate = wallOrCeilingCandidate(world, car.position);
        if (contactCandidate === undefined) {
          setTractionDetached(car);
        } else {
          setTractionAttached(car, contactCandidate);
        }
      }
    }

    if (!car.tractionAttached && !car.onGround) {
      const candidate = wallOrCeilingCandidate(world, car.position);
      const speed = magnitude(car.velocity);
      if (candidate !== undefined && speed <= TRACTION_ATTACH_MAX_SPEED) {
        setTractionAttached(car, candidate);
      }
    }

    if (car.tractionAttached) {
      const projectedGravity = projectOntoPlane({ x: 0, y: 0, z: GRAVITY_Z }, car.tractionNormal);
      car.velocity.x += projectedGravity.x * dtSeconds;
      car.velocity.y += projectedGravity.y * dtSeconds;
      car.velocity.z += projectedGravity.z * dtSeconds;

      const tractionDamping = damping(TRACTION_DAMPING_PER_SECOND, dtSeconds);
      car.velocity.x *= tractionDamping;
      car.velocity.y *= tractionDamping;
      car.velocity.z *= tractionDamping;

      const tangentVelocity = projectOntoPlane(car.velocity, car.tractionNormal);
      car.velocity.x = tangentVelocity.x;
      car.velocity.y = tangentVelocity.y;
      car.velocity.z = tangentVelocity.z;
    } else {
      car.velocity.z += GRAVITY_Z * dtSeconds;
    }

    car.velocity.x *= damping(DRAG_DAMPING_PER_SECOND, dtSeconds);
    car.velocity.y *= damping(DRAG_DAMPING_PER_SECOND, dtSeconds);

    if (controls.handbrake) {
      car.velocity.x *= damping(BRAKE_DAMPING_PER_SECOND, dtSeconds);
      car.velocity.y *= damping(BRAKE_DAMPING_PER_SECOND, dtSeconds);
    }

    car.position.x += car.velocity.x * dtSeconds;
    car.position.y += car.velocity.y * dtSeconds;
    car.position.z += car.velocity.z * dtSeconds;

    if (car.tractionAttached) {
      clampPositionToSurface(world, car);
    }

    if (car.position.z <= 0) {
      car.position.z = 0;
      car.velocity.z = 0;
      car.onGround = true;
      setTractionDetached(car);
      car.jumpCount = 0;
      car.jumpWindowTicksRemaining = 0;
    } else if (car.jumpCount === 1 && car.jumpWindowTicksRemaining > 0) {
      car.jumpWindowTicksRemaining -= 1;
    }

    car.jumpPressedLastTick = jumpPressed;

    car.boost = boostEnabled
      ? clamp(car.boost - BOOST_DRAIN_PER_SECOND * dtSeconds, 0, 100)
      : clamp(car.boost + 8 * dtSeconds, 0, 100);
  }

  world.ball.position.x += world.ball.velocity.x * dtSeconds;
  world.ball.position.y += world.ball.velocity.y * dtSeconds;
  world.ball.position.z += world.ball.velocity.z * dtSeconds;

  const ballDamping = damping(BALL_DAMPING_PER_SECOND, dtSeconds);
  world.ball.velocity.x *= ballDamping;
  world.ball.velocity.y *= ballDamping;
  world.ball.velocity.z *= ballDamping;

  world.clock.tick += 1;
  world.clock.elapsedSeconds += dtSeconds;
  world.clock.remainingSeconds = Math.max(0, world.clock.remainingSeconds - dtSeconds);
  world.clock.isOver = world.clock.remainingSeconds <= 0;
}
