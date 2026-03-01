export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type Sequence = number;
export type TimestampMs = number;
export type Tick = number;

export type PlayerId = string;
export type CarId = string;
export type BallId = string;
export type TeamId = string;
export type GoalId = string;
export type MatchId = string;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Envelope {
  version: ProtocolVersion;
  sequence: Sequence;
  timestamp: TimestampMs;
}

export interface InputControls {
  throttle: number;
  steer: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface InputFrame extends Envelope {
  tick: Tick;
  playerId: PlayerId;
  carId: CarId;
  controls: InputControls;
}

export interface CarSnapshot {
  id: CarId;
  ownerPlayerId: PlayerId;
  teamId: TeamId;
  position: Vec3;
  velocity: Vec3;
  rotation: Rotation;
  boost: number;
}

export interface BallSnapshot {
  id: BallId;
  position: Vec3;
  velocity: Vec3;
}

export type MatchPhase = "lobby" | "countdown" | "playing" | "goal_pause" | "finished";

export interface MatchState {
  matchId: MatchId;
  phase: MatchPhase;
  tick: Tick;
  scoreByTeam: Record<TeamId, number>;
  timeRemainingMs: number;
}

export interface Snapshot extends Envelope {
  tick: Tick;
  match: MatchState;
  cars: CarSnapshot[];
  ball: BallSnapshot;
}

export type ClientEvent =
  | ({ type: "client.input" } & InputFrame)
  | ({ type: "client.ping" } & Envelope & { clientTimeMs: number })
  | ({ type: "client.ready" } & Envelope & { playerId: PlayerId; ready: boolean });

export type ServerEvent =
  | ({ type: "server.snapshot" } & Snapshot)
  | ({ type: "server.match_state" } & Envelope & { match: MatchState })
  | ({ type: "server.pong" } & Envelope & { clientTimeMs: number; serverTimeMs: number })
  | ({ type: "server.error" } & Envelope & { code: "VERSION_MISMATCH" | "BAD_MESSAGE"; message: string });

export type AnyEvent = ClientEvent | ServerEvent;
