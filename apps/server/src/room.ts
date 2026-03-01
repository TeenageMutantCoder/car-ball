import type { MatchId, MatchPhase, MatchState, PlayerId, TeamId } from "@car-ball/protocol";

export const DEFAULT_MIN_PLAYERS = 2;
export const DEFAULT_MAX_PLAYERS = 4;
export const DEFAULT_MATCH_DURATION_MS = 5 * 60 * 1000;
export const TEAM_A_ID = "team-a" as const;
export const TEAM_B_ID = "team-b" as const;

export type RoomTransitionErrorCode =
  | "INVALID_ROOM_CONFIG"
  | "INVALID_PHASE"
  | "ROOM_FULL"
  | "ROOM_LOCKED"
  | "PLAYER_ALREADY_JOINED"
  | "PLAYER_NOT_FOUND"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYER_NOT_READY";

export interface RoomPlayer {
  playerId: PlayerId;
  teamId: TeamId;
  joinOrder: number;
  ready: boolean;
}

export interface RoomState {
  roomId: string;
  minPlayers: number;
  maxPlayers: number;
  nextMatchNumber: number;
  players: RoomPlayer[];
  match: MatchState;
}

export interface CreateRoomOptions {
  roomId: string;
  minPlayers?: number;
  maxPlayers?: number;
}

export interface StartMatchOptions {
  durationMs?: number;
}

export interface RoomTransitionSuccess {
  ok: true;
  room: RoomState;
}

export interface RoomTransitionFailure {
  ok: false;
  room: RoomState;
  code: RoomTransitionErrorCode;
  message: string;
}

export type RoomTransitionResult = RoomTransitionSuccess | RoomTransitionFailure;

const DEFAULT_IDLE_MATCH_ID = "match:idle";

function createIdleMatchState(matchId: MatchId = DEFAULT_IDLE_MATCH_ID): MatchState {
  return {
    matchId,
    phase: "lobby",
    tick: 0,
    scoreByTeam: {},
    timeRemainingMs: 0
  };
}

function success(room: RoomState): RoomTransitionSuccess {
  return { ok: true, room };
}

function failure(room: RoomState, code: RoomTransitionErrorCode, message: string): RoomTransitionFailure {
  return { ok: false, room, code, message };
}

function ensureLobbyPhase(room: RoomState): RoomTransitionFailure | null {
  if (room.match.phase !== "lobby") {
    return failure(room, "INVALID_PHASE", `Operation requires lobby phase, received ${room.match.phase}.`);
  }

  return null;
}

function buildMatchId(roomId: string, matchNumber: number): MatchId {
  return `${roomId}:match:${matchNumber}`;
}

function buildScoreByTeam(teamIds: TeamId[]): Record<TeamId, number> {
  const uniqueTeamIds = [...new Set(teamIds)];
  const scoreByTeam: Record<TeamId, number> = {};

  for (const teamId of uniqueTeamIds) {
    scoreByTeam[teamId] = 0;
  }

  return scoreByTeam;
}

function isActiveMatchPhase(phase: MatchPhase): boolean {
  return phase !== "lobby" && phase !== "finished";
}

export function createRoom(options: CreateRoomOptions): RoomState {
  const minPlayers = options.minPlayers ?? DEFAULT_MIN_PLAYERS;
  const maxPlayers = options.maxPlayers ?? DEFAULT_MAX_PLAYERS;

  if (minPlayers < 1 || maxPlayers < minPlayers) {
    throw new Error(
      `Invalid room configuration: minPlayers (${minPlayers}) must be >= 1 and <= maxPlayers (${maxPlayers}).`
    );
  }

  return {
    roomId: options.roomId,
    minPlayers,
    maxPlayers,
    nextMatchNumber: 1,
    players: [],
    match: createIdleMatchState()
  };
}

export function joinRoom(room: RoomState, playerId: PlayerId): RoomTransitionResult {
  const lobbyGuard = ensureLobbyPhase(room);
  if (lobbyGuard) {
    return failure(room, "ROOM_LOCKED", "Cannot join after the match lifecycle has started.");
  }

  if (room.players.some((player) => player.playerId === playerId)) {
    return failure(room, "PLAYER_ALREADY_JOINED", `Player ${playerId} is already in room ${room.roomId}.`);
  }

  if (room.players.length >= room.maxPlayers) {
    return failure(room, "ROOM_FULL", `Room ${room.roomId} is at capacity (${room.maxPlayers}).`);
  }

  const teamACount = room.players.filter((player) => player.teamId === TEAM_A_ID).length;
  const teamBCount = room.players.filter((player) => player.teamId === TEAM_B_ID).length;
  const teamId = teamACount <= teamBCount ? TEAM_A_ID : TEAM_B_ID;
  const joinOrder = room.players.length + 1;

  return success({
    ...room,
    players: [
      ...room.players,
      {
        playerId,
        teamId,
        joinOrder,
        ready: false
      }
    ]
  });
}

export function leaveRoom(room: RoomState, playerId: PlayerId): RoomTransitionResult {
  const existingPlayer = room.players.find((player) => player.playerId === playerId);
  if (!existingPlayer) {
    return failure(room, "PLAYER_NOT_FOUND", `Player ${playerId} is not in room ${room.roomId}.`);
  }

  const players = room.players
    .filter((player) => player.playerId !== playerId)
    .map((player, index) => ({
      ...player,
      joinOrder: index + 1
    }));

  if (isActiveMatchPhase(room.match.phase) && players.length < room.minPlayers) {
    return success({
      ...room,
      players,
      match: {
        ...room.match,
        phase: "finished",
        timeRemainingMs: 0
      }
    });
  }

  return success({
    ...room,
    players
  });
}

export function setPlayerReady(room: RoomState, playerId: PlayerId, ready: boolean): RoomTransitionResult {
  const lobbyGuard = ensureLobbyPhase(room);
  if (lobbyGuard) {
    return lobbyGuard;
  }

  const existingPlayer = room.players.find((player) => player.playerId === playerId);
  if (!existingPlayer) {
    return failure(room, "PLAYER_NOT_FOUND", `Player ${playerId} is not in room ${room.roomId}.`);
  }

  const players = room.players.map((player) =>
    player.playerId === playerId
      ? {
          ...player,
          ready
        }
      : player
  );

  return success({
    ...room,
    players
  });
}

export function startMatch(room: RoomState, options?: StartMatchOptions): RoomTransitionResult {
  const lobbyGuard = ensureLobbyPhase(room);
  if (lobbyGuard) {
    return lobbyGuard;
  }

  if (room.players.length < room.minPlayers) {
    return failure(
      room,
      "NOT_ENOUGH_PLAYERS",
      `Room ${room.roomId} requires at least ${room.minPlayers} players to start.`
    );
  }

  const notReadyPlayer = room.players.find((player) => !player.ready);
  if (notReadyPlayer) {
    return failure(room, "PLAYER_NOT_READY", `Player ${notReadyPlayer.playerId} is not ready.`);
  }

  const durationMs = options?.durationMs ?? DEFAULT_MATCH_DURATION_MS;
  const matchId = buildMatchId(room.roomId, room.nextMatchNumber);
  const scoreByTeam = buildScoreByTeam(room.players.map((player) => player.teamId));

  return success({
    ...room,
    nextMatchNumber: room.nextMatchNumber + 1,
    players: room.players.map((player) => ({
      ...player,
      ready: false
    })),
    match: {
      matchId,
      phase: "playing",
      tick: 0,
      scoreByTeam,
      timeRemainingMs: durationMs
    }
  });
}

export function endMatch(room: RoomState): RoomTransitionResult {
  if (!isActiveMatchPhase(room.match.phase)) {
    return failure(
      room,
      "INVALID_PHASE",
      `endMatch requires an active match phase, received ${room.match.phase}.`
    );
  }

  return success({
    ...room,
    players: room.players.map((player) => ({
      ...player,
      ready: false
    })),
    match: {
      ...room.match,
      phase: "finished",
      timeRemainingMs: 0
    }
  });
}