import type { InputControls, InputFrame } from "@car-ball/protocol";
import { FIXED_STEP_SECONDS } from "./constants.ts";
import type { WorldState } from "./state.ts";

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function damping(dampingPerSecond: number, dtSeconds: number): number {
  return Math.max(0, 1 - dampingPerSecond * dtSeconds);
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

    car.heading += steer * STEER_RADIANS_PER_SECOND * dtSeconds;

    const forwardX = Math.cos(car.heading);
    const forwardY = Math.sin(car.heading);

    const boostEnabled = controls.boost && car.boost > 0;
    const accel = throttle * ACCELERATION + (boostEnabled ? BOOST_ACCELERATION : 0);

    car.velocity.x += forwardX * accel * dtSeconds;
    car.velocity.y += forwardY * accel * dtSeconds;

    if (controls.jump && car.onGround) {
      car.velocity.z = JUMP_IMPULSE;
      car.onGround = false;
    }

    car.velocity.z -= 9.81 * dtSeconds;

    car.velocity.x *= damping(DRAG_DAMPING_PER_SECOND, dtSeconds);
    car.velocity.y *= damping(DRAG_DAMPING_PER_SECOND, dtSeconds);

    if (controls.handbrake) {
      car.velocity.x *= damping(BRAKE_DAMPING_PER_SECOND, dtSeconds);
      car.velocity.y *= damping(BRAKE_DAMPING_PER_SECOND, dtSeconds);
    }

    car.position.x += car.velocity.x * dtSeconds;
    car.position.y += car.velocity.y * dtSeconds;
    car.position.z += car.velocity.z * dtSeconds;

    if (car.position.z <= 0) {
      car.position.z = 0;
      car.velocity.z = 0;
      car.onGround = true;
    }

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
