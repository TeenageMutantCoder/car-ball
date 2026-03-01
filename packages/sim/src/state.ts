import type { PlayerId, Vec3 } from "@car-ball/protocol";
import { DEFAULT_MATCH_DURATION_SECONDS } from "./constants.ts";

export interface CarState {
  id: string;
  playerId: PlayerId;
  position: Vec3;
  velocity: Vec3;
  heading: number;
  boost: number;
  onGround: boolean;
}

export interface BallState {
  id: string;
  position: Vec3;
  velocity: Vec3;
}

export interface WorldClock {
  tick: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  isOver: boolean;
}

export interface WorldState {
  clock: WorldClock;
  cars: Record<string, CarState>;
  ball: BallState;
}

export interface CreateWorldOptions {
  playerIds: PlayerId[];
  matchDurationSeconds?: number;
}

function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

function createCarState(playerId: PlayerId, spawnX: number): CarState {
  return {
    id: `car:${playerId}`,
    playerId,
    position: vec3(spawnX, 0, 0),
    velocity: vec3(),
    heading: 0,
    boost: 100,
    onGround: true
  };
}

export function createInitialWorldState(options: CreateWorldOptions): WorldState {
  const cars: WorldState["cars"] = {};
  const orderedPlayerIds = [...options.playerIds].sort();
  const matchDurationSeconds = options.matchDurationSeconds ?? DEFAULT_MATCH_DURATION_SECONDS;

  orderedPlayerIds.forEach((playerId, index) => {
    const spawnX = index % 2 === 0 ? -10 - index * 2 : 10 + index * 2;
    const car = createCarState(playerId, spawnX);
    cars[car.id] = car;
  });

  const ball: BallState = {
    id: "ball:main",
    position: vec3(0, 0, 1.5),
    velocity: vec3()
  };

  return {
    clock: {
      tick: 0,
      elapsedSeconds: 0,
      remainingSeconds: matchDurationSeconds,
      isOver: false
    },
    cars,
    ball
  };
}
