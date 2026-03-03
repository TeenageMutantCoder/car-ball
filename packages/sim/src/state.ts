import {
  type BallId,
  type CarId,
  type GoalId,
  type MatchId,
  type PlayerId,
  type TeamId,
  type Vec3
} from "@car-ball/protocol";
import {
  DEFAULT_ARENA_BOUNDS,
  DEFAULT_MATCH_DURATION_SECONDS,
  createGoalVolumesForArena,
  type BoxVolume
} from "./constants.ts";

export const TEAM_BLUE_ID = "team:blue" as TeamId;
export const TEAM_ORANGE_ID = "team:orange" as TeamId;
export const ARENA_MAIN_ID = "arena:main";
export const GOAL_BLUE_ID = "goal:blue" as GoalId;
export const GOAL_ORANGE_ID = "goal:orange" as GoalId;
export const MATCH_MAIN_ID = "match:main" as MatchId;

const DEFAULT_CAR_SPAWN = {
  baseOffsetX: 20,
  staggerPerIndexX: 4
} as const;

export type TractionSurface =
  | "none"
  | "wall-x-min"
  | "wall-x-max"
  | "wall-y-min"
  | "wall-y-max"
  | "ceiling";

export interface CarState {
  id: CarId;
  playerId: PlayerId;
  teamId: TeamId;
  position: Vec3;
  velocity: Vec3;
  heading: number;
  pitch: number;
  roll: number;
  boost: number;
  onGround: boolean;
  tractionAttached: boolean;
  tractionSurface: TractionSurface;
  tractionNormal: Vec3;
  jumpCount: number;
  jumpWindowTicksRemaining: number;
  jumpPressedLastTick: boolean;
}

export interface BallState {
  id: BallId;
  position: Vec3;
  velocity: Vec3;
}

export interface ArenaState {
  id: string;
  bounds: BoxVolume;
}

export interface GoalState {
  id: GoalId;
  teamId: TeamId;
  volume: BoxVolume;
}

export interface GoalsState {
  blue: GoalState;
  orange: GoalState;
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
  arena: ArenaState;
  goals: GoalsState;
}

export interface CreateWorldOptions {
  playerIds: PlayerId[];
  matchDurationSeconds?: number;
}

function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

function createCarState(playerId: PlayerId, teamId: TeamId, spawnX: number): CarState {
  return {
    id: `car:${playerId}`,
    playerId,
    teamId,
    position: vec3(spawnX, 0, 0),
    velocity: vec3(),
    heading: 0,
    pitch: 0,
    roll: 0,
    boost: 100,
    onGround: true,
    tractionAttached: false,
    tractionSurface: "none",
    tractionNormal: vec3(),
    jumpCount: 0,
    jumpWindowTicksRemaining: 0,
    jumpPressedLastTick: false
  };
}

function createDefaultArenaState(): ArenaState {
  return {
    id: ARENA_MAIN_ID,
    bounds: {
      min: vec3(DEFAULT_ARENA_BOUNDS.min.x, DEFAULT_ARENA_BOUNDS.min.y, DEFAULT_ARENA_BOUNDS.min.z),
      max: vec3(DEFAULT_ARENA_BOUNDS.max.x, DEFAULT_ARENA_BOUNDS.max.y, DEFAULT_ARENA_BOUNDS.max.z)
    }
  };
}

function createDefaultGoalsState(arenaBounds: BoxVolume): GoalsState {
  const goals = createGoalVolumesForArena(arenaBounds);

  return {
    blue: {
      id: GOAL_BLUE_ID,
      teamId: TEAM_BLUE_ID,
      volume: goals.minX
    },
    orange: {
      id: GOAL_ORANGE_ID,
      teamId: TEAM_ORANGE_ID,
      volume: goals.maxX
    }
  };
}

export function createInitialWorldState(options: CreateWorldOptions): WorldState {
  const cars: WorldState["cars"] = {};
  const orderedPlayerIds = [...options.playerIds].sort();
  const matchDurationSeconds = options.matchDurationSeconds ?? DEFAULT_MATCH_DURATION_SECONDS;

  orderedPlayerIds.forEach((playerId, index) => {
    const teamId = index % 2 === 0 ? TEAM_BLUE_ID : TEAM_ORANGE_ID;
    const spawnX = index % 2 === 0
      ? -DEFAULT_CAR_SPAWN.baseOffsetX - index * DEFAULT_CAR_SPAWN.staggerPerIndexX
      : DEFAULT_CAR_SPAWN.baseOffsetX + index * DEFAULT_CAR_SPAWN.staggerPerIndexX;
    const car = createCarState(playerId, teamId, spawnX);
    cars[car.id] = car;
  });

  const ball: BallState = {
    id: "ball:main",
    position: vec3(0, 0, 1.5),
    velocity: vec3()
  };

  const arena = createDefaultArenaState();

  return {
    clock: {
      tick: 0,
      elapsedSeconds: 0,
      remainingSeconds: matchDurationSeconds,
      isOver: false
    },
    cars,
    ball,
    arena,
    goals: createDefaultGoalsState(arena.bounds)
  };
}
