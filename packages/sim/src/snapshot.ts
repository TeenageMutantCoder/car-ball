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
      rotation: orientationToRotation(car.heading, car.pitch, car.roll),
      boost: car.boost
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
