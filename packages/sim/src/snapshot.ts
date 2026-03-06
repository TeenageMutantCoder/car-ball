import {
  PROTOCOL_VERSION,
  type MatchId,
  type MatchPhase,
  type Rotation,
  type Snapshot,
  type TeamId,
  type Vec3
} from "@car-ball/protocol";
import { MATCH_MAIN_ID, TEAM_BLUE_ID, TEAM_ORANGE_ID, type WorldState } from "./state.ts";

export interface ToProtocolSnapshotOptions {
  sequence: number;
  timestamp: number;
  matchId?: MatchId;
  scoreByTeam?: Record<TeamId, number>;
  phase?: MatchPhase;
}

function cloneVec3(value: Vec3): Vec3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z
  };
}

function orientationToRotation(heading: number, pitch: number, roll: number): Rotation {
  const halfHeading = heading / 2;
  const halfPitch = pitch / 2;
  const halfRoll = roll / 2;

  const cz = Math.cos(halfHeading);
  const sz = Math.sin(halfHeading);
  const cy = Math.cos(halfPitch);
  const sy = Math.sin(halfPitch);
  const cx = Math.cos(halfRoll);
  const sx = Math.sin(halfRoll);

  return {
    x: cz * cy * sx - sz * sy * cx,
    y: cz * sy * cx + sz * cy * sx,
    z: sz * cy * cx - cz * sy * sx,
    w: cz * cy * cx + sz * sy * sx
  };
}

function magnitude(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vec3): Vec3 {
  const length = magnitude(vector);
  if (length <= Number.EPSILON) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

function rotationFromBasis(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Rotation {
  const m00 = xAxis.x;
  const m01 = yAxis.x;
  const m02 = zAxis.x;
  const m10 = xAxis.y;
  const m11 = yAxis.y;
  const m12 = zAxis.y;
  const m20 = xAxis.z;
  const m21 = yAxis.z;
  const m22 = zAxis.z;

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return {
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
      w: 0.25 * s
    };
  }

  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return {
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
      w: (m21 - m12) / s
    };
  }

  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return {
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
      w: (m02 - m20) / s
    };
  }

  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return {
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
    w: (m10 - m01) / s
  };
}

function tractionOrientationToRotation(car: WorldState["cars"][string]): Rotation {
  const upAxis = normalize(car.tractionNormal);
  if (magnitude(upAxis) <= Number.EPSILON) {
    return orientationToRotation(car.heading, car.pitch, car.roll);
  }

  const reference = Math.abs(upAxis.z) < 0.95 ? ({ x: 0, y: 0, z: 1 } as Vec3) : ({ x: 1, y: 0, z: 0 } as Vec3);
  const tangentX = normalize(cross(reference, upAxis));
  const tangentY = normalize(cross(upAxis, tangentX));

  const forwardAxis = normalize({
    x: tangentX.x * Math.cos(car.heading) + tangentY.x * Math.sin(car.heading),
    y: tangentX.y * Math.cos(car.heading) + tangentY.y * Math.sin(car.heading),
    z: tangentX.z * Math.cos(car.heading) + tangentY.z * Math.sin(car.heading)
  });

  const sideAxis = normalize(cross(upAxis, forwardAxis));
  return rotationFromBasis(forwardAxis, sideAxis, upAxis);
}

function defaultPhase(world: WorldState): MatchPhase {
  return world.clock.isOver ? "finished" : "playing";
}

export function worldToProtocolSnapshot(world: WorldState, options: ToProtocolSnapshotOptions): Snapshot {
  const orderedCars = Object.values(world.cars)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((car) => ({
      id: car.id,
      ownerPlayerId: car.playerId,
      teamId: car.teamId,
      position: cloneVec3(car.position),
      velocity: cloneVec3(car.velocity),
      rotation: car.tractionAttached
        ? tractionOrientationToRotation(car)
        : orientationToRotation(car.heading, car.pitch, car.roll),
      boost: car.boost,
      onGround: car.onGround
    }));

  return {
    version: PROTOCOL_VERSION,
    sequence: options.sequence,
    timestamp: options.timestamp,
    tick: world.clock.tick,
    match: {
      matchId: options.matchId ?? MATCH_MAIN_ID,
      phase: options.phase ?? defaultPhase(world),
      tick: world.clock.tick,
      scoreByTeam: options.scoreByTeam ?? {
        [TEAM_BLUE_ID]: 0,
        [TEAM_ORANGE_ID]: 0
      },
      timeRemainingMs: Math.round(world.clock.remainingSeconds * 1000)
    },
    cars: orderedCars,
    ball: {
      id: world.ball.id,
      position: cloneVec3(world.ball.position),
      velocity: cloneVec3(world.ball.velocity)
    }
  };
}
