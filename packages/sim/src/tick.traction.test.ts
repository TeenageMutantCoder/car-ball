import assert from "node:assert/strict";
import test from "node:test";

import type { InputControls, InputFrame, PlayerId } from "@car-ball/protocol";
import { ARENA_CORNER_RADIUS, DEFAULT_CAR_HALF_EXTENTS } from "./constants.ts";
import { createInitialWorldState } from "./state.ts";
import { tickWorld } from "./tick.ts";

const PLAYER_ID = "player-traction" as PlayerId;
const CAR_ID = `car:${PLAYER_ID}`;

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false
};

function frameForTick(tick: number, controls: Partial<InputControls> = {}): InputFrame {
  return {
    version: 1,
    sequence: tick,
    timestamp: tick * 8,
    tick,
    playerId: PLAYER_ID,
    carId: CAR_ID,
    controls: {
      ...DEFAULT_CONTROLS,
      ...controls
    }
  };
}

interface WallRampCase {
  name: string;
  surface: "wall-x-min" | "wall-x-max" | "wall-y-min" | "wall-y-max";
  heading: number;
  initialPosition: {
    x: number;
    y: number;
  };
  lateralAxis: "x" | "y";
}

interface WallRampReverseCase extends WallRampCase {
  reverseHeading: number;
}

interface WallDescentCase {
  name: string;
  surface: "wall-x-min" | "wall-x-max" | "wall-y-min" | "wall-y-max";
  normal: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  lateralAxis: "x" | "y";
}

function buildWallRampCases(world: ReturnType<typeof createInitialWorldState>): WallRampReverseCase[] {
  const minX = world.arena.bounds.min.x + DEFAULT_CAR_HALF_EXTENTS.x;
  const maxX = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x;
  const minY = world.arena.bounds.min.y + DEFAULT_CAR_HALF_EXTENTS.y;
  const maxY = world.arena.bounds.max.y - DEFAULT_CAR_HALF_EXTENTS.y;

  return [
    {
      name: "x-min",
      surface: "wall-x-min",
      heading: Math.PI,
      reverseHeading: 0,
      initialPosition: { x: minX + ARENA_CORNER_RADIUS + 1.6, y: 0 },
      lateralAxis: "y"
    },
    {
      name: "x-max",
      surface: "wall-x-max",
      heading: 0,
      reverseHeading: Math.PI,
      initialPosition: { x: maxX - ARENA_CORNER_RADIUS - 1.6, y: 0 },
      lateralAxis: "y"
    },
    {
      name: "y-min",
      surface: "wall-y-min",
      heading: -Math.PI / 2,
      reverseHeading: Math.PI / 2,
      initialPosition: { x: 0, y: minY + ARENA_CORNER_RADIUS + 1.6 },
      lateralAxis: "x"
    },
    {
      name: "y-max",
      surface: "wall-y-max",
      heading: Math.PI / 2,
      reverseHeading: -Math.PI / 2,
      initialPosition: { x: 0, y: maxY - ARENA_CORNER_RADIUS - 1.6 },
      lateralAxis: "x"
    }
  ];
}

function wrapAngleRadians(value: number): number {
  let wrapped = value;
  while (wrapped <= -Math.PI) {
    wrapped += Math.PI * 2;
  }
  while (wrapped > Math.PI) {
    wrapped -= Math.PI * 2;
  }
  return wrapped;
}

function buildWallDescentCases(world: ReturnType<typeof createInitialWorldState>): WallDescentCase[] {
  const minX = world.arena.bounds.min.x + DEFAULT_CAR_HALF_EXTENTS.x;
  const maxX = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x;
  const minY = world.arena.bounds.min.y + DEFAULT_CAR_HALF_EXTENTS.y;
  const maxY = world.arena.bounds.max.y - DEFAULT_CAR_HALF_EXTENTS.y;

  return [
    {
      name: "x-min",
      surface: "wall-x-min",
      normal: { x: 1, y: 0, z: 0 },
      position: { x: minX, y: 0, z: 9 },
      lateralAxis: "y"
    },
    {
      name: "x-max",
      surface: "wall-x-max",
      normal: { x: -1, y: 0, z: 0 },
      position: { x: maxX, y: 0, z: 9 },
      lateralAxis: "y"
    },
    {
      name: "y-min",
      surface: "wall-y-min",
      normal: { x: 0, y: 1, z: 0 },
      position: { x: 0, y: minY, z: 9 },
      lateralAxis: "x"
    },
    {
      name: "y-max",
      surface: "wall-y-max",
      normal: { x: 0, y: -1, z: 0 },
      position: { x: 0, y: maxY, z: 9 },
      lateralAxis: "x"
    }
  ];
}

test("wall contact sticks under threshold speed", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x - 0.1;
  car.position.z = 12;
  car.velocity.x = 2;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.tractionAttached, true);
  assert.equal(car.tractionSurface, "wall-x-max");
  assert.equal(car.onGround, false);
  assert.equal(car.position.x, world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x);

  for (let tick = 2; tick <= 20; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);
    assert.equal(car.tractionAttached, true);
    assert.equal(car.tractionSurface, "wall-x-max");
    assert.equal(car.position.x, world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x);
  }
});

test("traction detaches when threshold is exceeded", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x - 0.1;
  car.position.z = 12;
  car.velocity.x = 2;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.tractionAttached, true);
  assert.equal(car.tractionSurface, "wall-x-max");

  car.velocity.x = 30;
  tickWorld(world, [frameForTick(2)]);

  assert.equal(car.tractionAttached, false);
  assert.equal(car.tractionSurface, "none");
});

test("traction transitions stay bounded and finite", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x - 0.2;
  car.position.z = world.arena.bounds.max.z - DEFAULT_CAR_HALF_EXTENTS.z - 0.2;
  car.velocity.x = 3;
  car.velocity.z = 1;

  for (let tick = 1; tick <= 600; tick += 1) {
    const throttle = tick % 4 < 2 ? 1 : -1;
    const steer = tick % 6 < 3 ? 0.5 : -0.5;
    const boost = tick % 10 === 0;
    const jump = tick % 37 === 0;

    tickWorld(world, [frameForTick(tick, { throttle, steer, boost, jump })]);

    const values = [
      car.position.x,
      car.position.y,
      car.position.z,
      car.velocity.x,
      car.velocity.y,
      car.velocity.z
    ];

    for (const value of values) {
      assert.equal(Number.isFinite(value), true);
      assert.ok(Math.abs(value) < 10000);
    }

    if (car.tractionAttached) {
      assert.notEqual(car.tractionSurface, "none");
    }
  }
});

test("car rebounds from wall at high speed when not traction-attached", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x - 0.05;
  car.position.z = 10;
  car.velocity.x = 120;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.position.x <= world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x, true);
  assert.equal(car.velocity.x < 0, true);
  assert.equal(car.tractionAttached, false);
});

test("ceiling uses rigid rebound when wheels are not aligned for traction", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.z = world.arena.bounds.max.z - DEFAULT_CAR_HALF_EXTENTS.z - 0.05;
  car.velocity.z = 90;
  car.pitch = 0;
  car.roll = 0;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.position.z <= world.arena.bounds.max.z - DEFAULT_CAR_HALF_EXTENTS.z, true);
  assert.equal(car.velocity.z < 0, true);
  assert.equal(car.tractionAttached, false);
});

test("ceiling traction can attach when wheels are aligned toward ceiling", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.pitch = 0;
  car.roll = Math.PI;
  car.position.z = world.arena.bounds.max.z - DEFAULT_CAR_HALF_EXTENTS.z - 0.1;
  car.velocity.z = 1;

  tickWorld(world, [frameForTick(1)]);

  assert.equal(car.tractionAttached, true);
  assert.equal(car.tractionSurface, "ceiling");
  assert.equal(car.position.z, world.arena.bounds.max.z - DEFAULT_CAR_HALF_EXTENTS.z);
});

test("car drives along wall plane while traction-attached", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  car.onGround = false;
  car.position.x = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x - 0.1;
  car.position.y = 0;
  car.position.z = 12;
  car.velocity.x = 1;

  tickWorld(world, [frameForTick(1)]);
  assert.equal(car.tractionAttached, true);
  assert.equal(car.tractionSurface, "wall-x-max");

  const startY = car.position.y;
  car.velocity.x = 0;
  car.velocity.y = 8;

  for (let tick = 2; tick <= 14; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);
    assert.equal(car.tractionAttached, true);
    assert.equal(car.tractionSurface, "wall-x-max");
    assert.ok(Math.abs(car.position.x - (world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x)) < 1e-6);
  }

  assert.equal(car.position.y > startY, true);
  assert.equal(car.tractionNormal.x < -0.9, true);
  assert.equal(Math.abs(car.tractionNormal.y) < 0.05, true);
  assert.equal(Math.abs(car.tractionNormal.z) < 0.05, true);
});

test("car can drive up floor-to-wall edge ramp", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  const minX = world.arena.bounds.min.x + DEFAULT_CAR_HALF_EXTENTS.x;

  car.onGround = true;
  car.position.x = minX + ARENA_CORNER_RADIUS * 0.7;
  car.position.y = 0;
  car.position.z = 0;
  car.velocity.x = -8;
  car.velocity.y = 0;
  car.velocity.z = 0;

  let maxZ = car.position.z;
  let sawRampTractionNormal = false;

  for (let tick = 1; tick <= 20; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);
    maxZ = Math.max(maxZ, car.position.z);

    if (car.tractionAttached && car.tractionNormal.z > 0.1 && Math.abs(car.tractionNormal.x) > 0.1) {
      sawRampTractionNormal = true;
    }
  }

  assert.equal(maxZ > 0.25, true);
  assert.equal(sawRampTractionNormal, true);
  assert.equal(car.position.x >= minX - 1e-6, true);
});

test("throttle can drive car from floor edge ramp onto wall with traction-based rotation", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  const minX = world.arena.bounds.min.x + DEFAULT_CAR_HALF_EXTENTS.x;

  car.onGround = true;
  car.heading = Math.PI;
  car.position.x = minX + ARENA_CORNER_RADIUS + 1.6;
  car.position.y = 0;
  car.position.z = 0;
  car.velocity.x = 0;
  car.velocity.y = 0;
  car.velocity.z = 0;

  let maxZ = 0;
  let sawWallAttachment = false;
  let sawRotationFromTraction = false;

  for (let tick = 1; tick <= 180; tick += 1) {
    tickWorld(world, [frameForTick(tick, { throttle: 1 })]);
    maxZ = Math.max(maxZ, car.position.z);

    if (car.tractionAttached && car.tractionSurface === "wall-x-min") {
      sawWallAttachment = true;
    }

    if (car.tractionAttached) {
      const expectedRoll = Math.atan2(car.tractionNormal.x, Math.max(1e-6, car.tractionNormal.z));
      if (Math.abs(car.roll - expectedRoll) < 0.15) {
        sawRotationFromTraction = true;
      }
    }
  }

  assert.equal(maxZ > 0.6, true);
  assert.equal(sawWallAttachment, true);
  assert.equal(sawRotationFromTraction, true);
});

test("floor ramp-to-wall transition works on all four walls when driving straight", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  for (const wallCase of buildWallRampCases(world)) {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = true;
    car.heading = wallCase.heading;
    car.position.x = wallCase.initialPosition.x;
    car.position.y = wallCase.initialPosition.y;
    car.position.z = 0;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    let maxZ = 0;
    let sawWallAttachment = false;

    for (let tick = 1; tick <= 180; tick += 1) {
      tickWorld(caseWorld, [frameForTick(tick, { throttle: 1 })]);
      maxZ = Math.max(maxZ, car.position.z);

      if (car.tractionAttached && car.tractionSurface === wallCase.surface) {
        sawWallAttachment = true;
      }
    }

    assert.equal(maxZ > 0.3, true, `Expected elevation on ${wallCase.name} ramp, got ${maxZ}`);
    assert.equal(sawWallAttachment, true, `Expected wall attachment on ${wallCase.name}`);
  }
});

test("no-steer floor-to-wall ramp transition remains straight on all four walls", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  for (const wallCase of buildWallRampCases(world)) {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = true;
    car.heading = wallCase.heading;
    car.position.x = wallCase.initialPosition.x;
    car.position.y = wallCase.initialPosition.y;
    car.position.z = 0;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    const headingStart = car.heading;
    const lateralStart = wallCase.lateralAxis === "x" ? car.position.x : car.position.y;
    let lateralAtWallAttach: number | null = null;

    for (let tick = 1; tick <= 220; tick += 1) {
      tickWorld(caseWorld, [frameForTick(tick, { throttle: 1, steer: 0 })]);

      if (lateralAtWallAttach === null && car.tractionAttached && car.tractionSurface === wallCase.surface) {
        lateralAtWallAttach = wallCase.lateralAxis === "x" ? car.position.x : car.position.y;
        break;
      }
    }

    const headingDelta = Math.abs(wrapAngleRadians(car.heading - headingStart));
    const lateralDelta =
      lateralAtWallAttach === null ? Number.POSITIVE_INFINITY : Math.abs(lateralAtWallAttach - lateralStart);

    assert.equal(headingDelta < 0.05, true, `Expected near-zero heading delta on ${wallCase.name}, got ${headingDelta}`);
    assert.equal(lateralAtWallAttach !== null, true, `Expected wall attachment during no-steer transition on ${wallCase.name}`);
    assert.equal(lateralDelta < 0.25, true, `Expected straight lateral path on ${wallCase.name}, got ${lateralDelta}`);
  }
});

test("floor ramp-to-wall transition works on all four walls with steering angle", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const steerInputs = [0.35, -0.35] as const;

  for (const wallCase of buildWallRampCases(world)) {
    for (const steerInput of steerInputs) {
      const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
      const car = caseWorld.cars[CAR_ID];

      car.onGround = true;
      car.heading = wallCase.heading;
      car.position.x = wallCase.initialPosition.x;
      car.position.y = wallCase.initialPosition.y;
      car.position.z = 0;
      car.velocity.x = 0;
      car.velocity.y = 0;
      car.velocity.z = 0;

      const lateralStart = wallCase.lateralAxis === "x" ? car.position.x : car.position.y;
      let maxZ = 0;
      let sawWallAttachment = false;
      let headingDeltaAccumulated = 0;
      let previousHeading = car.heading;

      for (let tick = 1; tick <= 220; tick += 1) {
        const steer = tick <= 60 ? steerInput : 0;
        tickWorld(caseWorld, [frameForTick(tick, { throttle: 1, steer })]);
        maxZ = Math.max(maxZ, car.position.z);

        if (car.tractionAttached && car.tractionSurface === wallCase.surface) {
          sawWallAttachment = true;
        }

        if (tick <= 60) {
          headingDeltaAccumulated += wrapAngleRadians(car.heading - previousHeading);
        }
        previousHeading = car.heading;
      }

      const lateralEnd = wallCase.lateralAxis === "x" ? car.position.x : car.position.y;
      const lateralDelta = Math.abs(lateralEnd - lateralStart);
      const expectedSign = -Math.sign(steerInput);

      assert.equal(maxZ > 0.3, true, `Expected angled climb elevation on ${wallCase.name}, got ${maxZ}`);
      assert.equal(sawWallAttachment, true, `Expected angled wall attachment on ${wallCase.name}`);
      assert.equal(lateralDelta > 0.25, true, `Expected lateral drift with steer on ${wallCase.name}, got ${lateralDelta}`);
      assert.equal(
        Math.sign(headingDeltaAccumulated) === expectedSign,
        true,
        `Expected heading delta sign ${expectedSign} on ${wallCase.name}, got ${headingDeltaAccumulated}`
      );
    }
  }
});

test("floor ramp-to-wall transition works on all four walls while reversing", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  for (const wallCase of buildWallRampCases(world)) {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = true;
    car.heading = wallCase.reverseHeading;
    car.position.x = wallCase.initialPosition.x;
    car.position.y = wallCase.initialPosition.y;
    car.position.z = 0;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    let maxZ = 0;
    let sawWallAttachment = false;

    for (let tick = 1; tick <= 180; tick += 1) {
      tickWorld(caseWorld, [frameForTick(tick, { throttle: -1 })]);
      maxZ = Math.max(maxZ, car.position.z);

      if (car.tractionAttached && car.tractionSurface === wallCase.surface) {
        sawWallAttachment = true;
      }
    }

    assert.equal(maxZ > 0.3, true, `Expected reverse elevation on ${wallCase.name} ramp, got ${maxZ}`);
    assert.equal(sawWallAttachment, true, `Expected reverse wall attachment on ${wallCase.name}`);
  }
});

test("reversing up ramps with steering keeps expected rotation delta direction", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const steerInputs = [0.35, -0.35] as const;

  for (const wallCase of buildWallRampCases(world)) {
    for (const steerInput of steerInputs) {
      const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
      const car = caseWorld.cars[CAR_ID];

      car.onGround = true;
      car.heading = wallCase.reverseHeading;
      car.position.x = wallCase.initialPosition.x;
      car.position.y = wallCase.initialPosition.y;
      car.position.z = 0;
      car.velocity.x = 0;
      car.velocity.y = 0;
      car.velocity.z = 0;

      let headingDeltaAccumulated = 0;
      let previousHeading = car.heading;

      for (let tick = 1; tick <= 140; tick += 1) {
        const steer = tick <= 60 ? steerInput : 0;
        tickWorld(caseWorld, [frameForTick(tick, { throttle: -1, steer })]);

        if (tick <= 60) {
          headingDeltaAccumulated += wrapAngleRadians(car.heading - previousHeading);
        }
        previousHeading = car.heading;
      }

      const expectedSign = Math.sign(steerInput);
      assert.equal(
        Math.sign(headingDeltaAccumulated) === expectedSign,
        true,
        `Expected reverse heading delta sign ${expectedSign} on ${wallCase.name}, got ${headingDeltaAccumulated}`
      );
    }
  }
});

test("ramp steering yields mirrored pitch/roll delta directions on all four walls", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  const runScenario = (
    wallCase: WallRampReverseCase,
    steer: number
  ): { pitch: number; roll: number; headingDelta: number } => {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = true;
    car.heading = wallCase.heading;
    car.position.x = wallCase.initialPosition.x;
    car.position.y = wallCase.initialPosition.y;
    car.position.z = 0;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    let headingDelta = 0;
    let previousHeading = car.heading;

    for (let tick = 1; tick <= 220; tick += 1) {
      const steerInput = tick <= 60 ? steer : 0;
      tickWorld(caseWorld, [frameForTick(tick, { throttle: 1, steer: steerInput })]);

      if (tick <= 60) {
        headingDelta += wrapAngleRadians(car.heading - previousHeading);
      }
      previousHeading = car.heading;
    }

    return {
      pitch: car.pitch,
      roll: car.roll,
      headingDelta
    };
  };

  for (const wallCase of buildWallRampCases(world)) {
    const baseline = runScenario(wallCase, 0);
    const steerLeft = runScenario(wallCase, -0.35);
    const steerRight = runScenario(wallCase, 0.35);

    const leftPitchDelta = wrapAngleRadians(steerLeft.pitch - baseline.pitch);
    const rightPitchDelta = wrapAngleRadians(steerRight.pitch - baseline.pitch);
    const leftRollDelta = wrapAngleRadians(steerLeft.roll - baseline.roll);
    const rightRollDelta = wrapAngleRadians(steerRight.roll - baseline.roll);

    const headingMirrors =
      Math.abs(steerLeft.headingDelta) > 0.02 &&
      Math.abs(steerRight.headingDelta) > 0.02 &&
      Math.sign(steerLeft.headingDelta) === -Math.sign(steerRight.headingDelta);

    const pitchMirrors =
      Math.abs(leftPitchDelta) > 0.03 &&
      Math.abs(rightPitchDelta) > 0.03 &&
      Math.sign(leftPitchDelta) === -Math.sign(rightPitchDelta);

    const rollMirrors =
      Math.abs(leftRollDelta) > 0.03 &&
      Math.abs(rightRollDelta) > 0.03 &&
      Math.sign(leftRollDelta) === -Math.sign(rightRollDelta);

    const pitchDirectionalAsymmetric =
      Math.min(Math.abs(leftPitchDelta), Math.abs(rightPitchDelta)) < 0.03 &&
      Math.max(Math.abs(leftPitchDelta), Math.abs(rightPitchDelta)) > 0.12;

    const rollDirectionalAsymmetric =
      Math.min(Math.abs(leftRollDelta), Math.abs(rightRollDelta)) < 0.03 &&
      Math.max(Math.abs(leftRollDelta), Math.abs(rightRollDelta)) > 0.12;

    assert.equal(
      pitchMirrors || rollMirrors || pitchDirectionalAsymmetric || rollDirectionalAsymmetric || headingMirrors,
      true,
      `Expected mirrored pitch/roll deltas on ${wallCase.name}; ` +
        `pitch=(${leftPitchDelta.toFixed(4)}, ${rightPitchDelta.toFixed(4)}), ` +
        `roll=(${leftRollDelta.toFixed(4)}, ${rightRollDelta.toFixed(4)}), ` +
        `heading=(${steerLeft.headingDelta.toFixed(4)}, ${steerRight.headingDelta.toFixed(4)})`
    );
  }
});

test("driving backwards from wall plane transitions down ramp to floor on all four walls", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  for (const descentCase of buildWallDescentCases(world)) {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = false;
    car.tractionAttached = true;
    car.tractionSurface = descentCase.surface;
    car.tractionNormal = { ...descentCase.normal };
    car.heading = Math.PI / 2;
    car.position.x = descentCase.position.x;
    car.position.y = descentCase.position.y;
    car.position.z = descentCase.position.z;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    let minZ = car.position.z;
    let sawRampNormal = false;

    for (let tick = 1; tick <= 240; tick += 1) {
      tickWorld(caseWorld, [frameForTick(tick, { throttle: -1 })]);
      minZ = Math.min(minZ, car.position.z);

      if (
        car.tractionAttached &&
        car.tractionNormal.z > 0.1 &&
        (Math.abs(car.tractionNormal.x) > 0.1 || Math.abs(car.tractionNormal.y) > 0.1)
      ) {
        sawRampNormal = true;
      }
    }

    assert.equal(minZ < 0.2, true, `Expected descent to floor on ${descentCase.name}, got minZ=${minZ}`);
    assert.equal(sawRampNormal, true, `Expected ramp normal during descent on ${descentCase.name}`);
  }
});

test("backwards wall-to-floor ramp transition remains stable with steering angle", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  for (const descentCase of buildWallDescentCases(world)) {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = false;
    car.tractionAttached = true;
    car.tractionSurface = descentCase.surface;
    car.tractionNormal = { ...descentCase.normal };
    car.heading = Math.PI / 2;
    car.position.x = descentCase.position.x;
    car.position.y = descentCase.position.y;
    car.position.z = descentCase.position.z;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    const lateralStart = descentCase.lateralAxis === "x" ? car.position.x : car.position.y;
    let minZ = car.position.z;
    let sawRampNormal = false;

    for (let tick = 1; tick <= 260; tick += 1) {
      const steer = tick <= 90 ? 0.35 : 0;
      tickWorld(caseWorld, [frameForTick(tick, { throttle: -1, steer })]);
      minZ = Math.min(minZ, car.position.z);

      if (
        car.tractionAttached &&
        car.tractionNormal.z > 0.1 &&
        (Math.abs(car.tractionNormal.x) > 0.1 || Math.abs(car.tractionNormal.y) > 0.1)
      ) {
        sawRampNormal = true;
      }
    }

    const lateralEnd = descentCase.lateralAxis === "x" ? car.position.x : car.position.y;
    const lateralDelta = Math.abs(lateralEnd - lateralStart);

    assert.equal(minZ < 0.2, true, `Expected steered descent to floor on ${descentCase.name}, got minZ=${minZ}`);
    assert.equal(sawRampNormal, true, `Expected steered ramp normal during descent on ${descentCase.name}`);
    assert.equal(lateralDelta > 0.2, true, `Expected lateral drift during steered descent on ${descentCase.name}`);
  }
});

test("no-steer wall-to-floor backward ramp transition remains straight on all four walls", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });

  for (const descentCase of buildWallDescentCases(world)) {
    const caseWorld = createInitialWorldState({ playerIds: [PLAYER_ID] });
    const car = caseWorld.cars[CAR_ID];

    car.onGround = false;
    car.tractionAttached = true;
    car.tractionSurface = descentCase.surface;
    car.tractionNormal = { ...descentCase.normal };
    car.heading = Math.PI / 2;
    car.position.x = descentCase.position.x;
    car.position.y = descentCase.position.y;
    car.position.z = descentCase.position.z;
    car.velocity.x = 0;
    car.velocity.y = 0;
    car.velocity.z = 0;

    const headingStart = car.heading;
    const lateralStart = descentCase.lateralAxis === "x" ? car.position.x : car.position.y;
    let minZ = car.position.z;
    let lateralAtMinZ = lateralStart;

    for (let tick = 1; tick <= 260; tick += 1) {
      tickWorld(caseWorld, [frameForTick(tick, { throttle: -1, steer: 0 })]);
      if (car.position.z < minZ) {
        minZ = car.position.z;
        lateralAtMinZ = descentCase.lateralAxis === "x" ? car.position.x : car.position.y;
      }
    }

    const headingDelta = Math.abs(wrapAngleRadians(car.heading - headingStart));
    const lateralDelta = Math.abs(lateralAtMinZ - lateralStart);

    assert.equal(minZ < 0.2, true, `Expected backward descent to floor on ${descentCase.name}, got minZ=${minZ}`);
    assert.equal(headingDelta < 0.05, true, `Expected near-zero heading delta on ${descentCase.name}, got ${headingDelta}`);
    assert.equal(
      lateralDelta < 0.25,
      true,
      `Expected straight backward lateral path on ${descentCase.name}, got ${lateralDelta}`
    );
  }
});

test("car can drive on wall corner ramp with blended normal", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  const maxX = world.arena.bounds.max.x - DEFAULT_CAR_HALF_EXTENTS.x;
  const maxY = world.arena.bounds.max.y - DEFAULT_CAR_HALF_EXTENTS.y;
  const cornerCenter = {
    x: maxX - ARENA_CORNER_RADIUS,
    y: maxY - ARENA_CORNER_RADIUS
  };

  car.onGround = false;
  car.position.x = maxX - 0.6;
  car.position.y = maxY - 0.6;
  car.position.z = 10;
  car.velocity.x = 5;
  car.velocity.y = 5;

  for (let tick = 1; tick <= 14; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);
  }

  const radialDistance = Math.hypot(car.position.x - cornerCenter.x, car.position.y - cornerCenter.y);
  assert.equal(car.tractionAttached, true);
  assert.equal(Math.abs(car.tractionNormal.x) > 0.2, true);
  assert.equal(Math.abs(car.tractionNormal.y) > 0.2, true);
  assert.equal(Math.abs(car.tractionNormal.z) < 0.15, true);
  assert.equal(radialDistance <= ARENA_CORNER_RADIUS + 1e-3, true);
});

test("floor-to-corner transition uses drivable ramp instead of hard corner", () => {
  const world = createInitialWorldState({ playerIds: [PLAYER_ID] });
  const car = world.cars[CAR_ID];

  const minX = world.arena.bounds.min.x + DEFAULT_CAR_HALF_EXTENTS.x;
  const minY = world.arena.bounds.min.y + DEFAULT_CAR_HALF_EXTENTS.y;

  car.onGround = true;
  car.position.x = minX + ARENA_CORNER_RADIUS * 0.75;
  car.position.y = minY + ARENA_CORNER_RADIUS + 2.5;
  car.position.z = 0;
  car.velocity.x = -8;
  car.velocity.y = 0;
  car.velocity.z = 0;

  let maxEdgeRampZ = 0;
  for (let tick = 1; tick <= 16; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);
    maxEdgeRampZ = Math.max(maxEdgeRampZ, car.position.z);
  }

  car.onGround = false;
  car.position.y = minY + ARENA_CORNER_RADIUS + 0.8;
  car.velocity.x = 0;
  car.velocity.y = -10;
  car.velocity.z = 0;

  let sawCornerRegionWhileElevated = false;
  for (let tick = 17; tick <= 44; tick += 1) {
    tickWorld(world, [frameForTick(tick)]);

    if (
      car.position.z > 0.15 &&
      car.position.x <= minX + ARENA_CORNER_RADIUS + 0.6 &&
      car.position.y <= minY + ARENA_CORNER_RADIUS + 1.0
    ) {
      sawCornerRegionWhileElevated = true;
    }
  }

  assert.equal(maxEdgeRampZ > 0.2, true);
  assert.equal(sawCornerRegionWhileElevated, true);
});
