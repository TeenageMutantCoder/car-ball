import type { InputFrame, MatchPhase, PlayerId, ServerEvent, Snapshot, TeamId, Vec3 } from "@car-ball/protocol";
import { SimulationCore, TEAM_BLUE_ID, TEAM_ORANGE_ID, worldToProtocolSnapshot } from "@car-ball/sim";
import {
  createInputValidationRoomState,
  createInputValidationTelemetry,
  createInputValidationTelemetryAccumulator,
  minInputTickDelta,
  recordValidationResult,
  type InputValidationResult,
  type InputValidationRoomState,
  type InputValidationTelemetry,
  validateInputFrame
} from "./validation.ts";

export const DEFAULT_TICK_RATE_HZ = 120;
export const DEFAULT_SNAPSHOT_RATE_HZ = 20;

export interface RuntimeConfig {
  tickRateHz?: number;
  snapshotRateHz?: number;
  rapierEnabled?: boolean;
  rapierShadowMode?: boolean;
  rapierBallAuthority?: boolean;
  now?: () => number;
}

export interface RuntimeRoom {
  roomId: string;
  playerIds: PlayerId[];
  sim: SimulationCore;
}

export interface TickResult {
  snapshots: Snapshot[];
  events: ServerEvent[];
}

export interface RuntimeMetrics {
  tickDurationMs: number;
  roomCount: number;
}

export interface RuntimeInputReject {
  ok: false;
  code: "PLAYER_DISCONNECTED" | "PLAYER_NOT_IN_ROOM";
  reason: string;
}

export type EnqueueInputFrameResult = InputValidationResult | RuntimeInputReject;

export interface ReconnectPlayerResult {
  snapshot: Snapshot;
  events: ServerEvent[];
}

interface RuntimeRoomInternal {
  roomId: string;
  playerIds: PlayerId[];
  sim: SimulationCore;
  sequence: number;
  matchPhase: MatchPhase;
  scoreByTeam: Record<TeamId, number>;
  goalPauseTicksRemaining: number;
  pendingInputs: InputFrame[];
  disconnectedPlayerIds: Set<PlayerId>;
  validationState: InputValidationRoomState;
  validationTelemetry: InputValidationTelemetry;
}

function createInitialScoreByTeam(): Record<TeamId, number> {
  return {
    [TEAM_BLUE_ID]: 0,
    [TEAM_ORANGE_ID]: 0
  };
}

function isInsideBox(position: Vec3, volume: { min: Vec3; max: Vec3 }): boolean {
  return (
    position.x >= volume.min.x &&
    position.x <= volume.max.x &&
    position.y >= volume.min.y &&
    position.y <= volume.max.y &&
    position.z >= volume.min.z &&
    position.z <= volume.max.z
  );
}

function uniqueSortedPlayerIds(playerIds: PlayerId[]): PlayerId[] {
  return [...new Set(playerIds)].sort();
}

function assertPositiveFiniteInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }
}

function assertTickRateCompatibility(tickRateHz: number, snapshotRateHz: number): void {
  if (tickRateHz % snapshotRateHz !== 0) {
    throw new Error(`tickRateHz (${tickRateHz}) must be divisible by snapshotRateHz (${snapshotRateHz}).`);
  }
}

export class ServerRuntime {
  readonly tickRateHz: number;
  readonly snapshotRateHz: number;
  readonly fixedStepMs: number;

  private readonly snapshotEveryTicks: number;
  private readonly minInputTickDelta: number;
  private readonly rapierEnabled: boolean;
  private readonly rapierShadowMode: boolean;
  private readonly rapierBallAuthority: boolean;
  private readonly now: () => number;
  private readonly rooms = new Map<string, RuntimeRoomInternal>();
  private metrics: RuntimeMetrics = {
    tickDurationMs: 0,
    roomCount: 0
  };

  constructor(config: RuntimeConfig = {}) {
    const tickRateHz = config.tickRateHz ?? DEFAULT_TICK_RATE_HZ;
    const snapshotRateHz = config.snapshotRateHz ?? DEFAULT_SNAPSHOT_RATE_HZ;

    assertPositiveFiniteInteger(tickRateHz, "tickRateHz");
    assertPositiveFiniteInteger(snapshotRateHz, "snapshotRateHz");
    assertTickRateCompatibility(tickRateHz, snapshotRateHz);

    this.tickRateHz = tickRateHz;
    this.snapshotRateHz = snapshotRateHz;
    this.fixedStepMs = 1000 / tickRateHz;
    this.snapshotEveryTicks = tickRateHz / snapshotRateHz;
    this.minInputTickDelta = minInputTickDelta(tickRateHz);
    this.rapierEnabled = config.rapierEnabled ?? true;
    this.rapierShadowMode = config.rapierShadowMode ?? true;
    this.rapierBallAuthority = config.rapierBallAuthority ?? true;
    this.now = config.now ?? Date.now;
  }

  createRoomRuntime(roomId: string): RuntimeRoom {
    if (this.rooms.has(roomId)) {
      throw new Error(`Room runtime already exists for roomId ${roomId}.`);
    }

    const internal = this.createInternalRoom(roomId, []);
    this.rooms.set(roomId, internal);
    this.metrics.roomCount = this.rooms.size;
    return this.toRuntimeRoom(internal);
  }

  attachPlayerIds(roomId: string, playerIds: PlayerId[]): RuntimeRoom {
    const room = this.requireRoom(roomId);
    const normalizedPlayerIds = uniqueSortedPlayerIds(playerIds);

    room.playerIds = normalizedPlayerIds;
    room.sim = new SimulationCore(normalizedPlayerIds, {
      fixedStepMs: this.fixedStepMs,
      rapierShadow: {
        enabled: this.rapierEnabled,
        shadowMode: this.rapierShadowMode,
        ballAuthority: this.rapierBallAuthority
      }
    });
    room.matchPhase = "playing";
    room.scoreByTeam = createInitialScoreByTeam();
    room.goalPauseTicksRemaining = 0;
    room.pendingInputs = [];
    room.disconnectedPlayerIds = new Set<PlayerId>();
    room.validationState = createInputValidationRoomState();
    room.validationTelemetry = createInputValidationTelemetry();

    return this.toRuntimeRoom(room);
  }

  enqueueInputFrame(roomId: string, frame: InputFrame): EnqueueInputFrameResult {
    const room = this.requireRoom(roomId);

    if (!room.playerIds.includes(frame.playerId)) {
      return {
        ok: false,
        code: "PLAYER_NOT_IN_ROOM",
        reason: `player ${frame.playerId} is not attached to room ${roomId}.`
      };
    }

    if (room.disconnectedPlayerIds.has(frame.playerId)) {
      return {
        ok: false,
        code: "PLAYER_DISCONNECTED",
        reason: `player ${frame.playerId} is disconnected in room ${roomId}.`
      };
    }

    const validationResult = validateInputFrame({
      frame,
      sim: room.sim,
      state: room.validationState,
      minTickDelta: this.minInputTickDelta
    });

    recordValidationResult(room.validationTelemetry, validationResult);

    if (!validationResult.ok) {
      return validationResult;
    }

    room.pendingInputs.push(frame);
    return validationResult;
  }

  disconnectPlayer(roomId: string, playerId: PlayerId): void {
    const room = this.requireRoom(roomId);

    if (!room.playerIds.includes(playerId)) {
      throw new Error(`Player ${playerId} is not attached to room ${roomId}.`);
    }

    room.disconnectedPlayerIds.add(playerId);
    room.pendingInputs = room.pendingInputs.filter((pendingFrame) => pendingFrame.playerId !== playerId);
  }

  reconnectPlayer(roomId: string, playerId: PlayerId): ReconnectPlayerResult {
    const room = this.requireRoom(roomId);

    if (!room.playerIds.includes(playerId)) {
      throw new Error(`Player ${playerId} is not attached to room ${roomId}.`);
    }

    room.disconnectedPlayerIds.delete(playerId);

    const snapshot = worldToProtocolSnapshot(room.sim.world, {
      sequence: room.sequence,
      timestamp: Math.round(this.now()),
      matchId: `${roomId}:match:runtime`,
      phase: room.matchPhase,
      scoreByTeam: {
        ...room.scoreByTeam
      }
    });

    return {
      snapshot,
      events: [
        {
          type: "server.snapshot",
          ...snapshot
        }
      ]
    };
  }

  tickOnce(stepMs = this.fixedStepMs): TickResult {
    const tickStart = this.now();
    const timestamp = Math.round(tickStart);
    const snapshots: Snapshot[] = [];
    const events: ServerEvent[] = [];
    const orderedRoomIds = [...this.rooms.keys()].sort();

    for (const roomId of orderedRoomIds) {
      const room = this.requireRoom(roomId);
      const pending = room.pendingInputs;
      room.pendingInputs = [];

      if (pending.length > 0) {
        room.sim.enqueueInputs(pending);
      }

      const advanceResult = room.sim.advance(stepMs);

      if (advanceResult.substeps === 0) {
        continue;
      }

      this.updateMatchState(room);

      if (advanceResult.tick % this.snapshotEveryTicks !== 0) {
        continue;
      }

      const snapshot = worldToProtocolSnapshot(room.sim.world, {
        sequence: room.sequence,
        timestamp,
        matchId: `${roomId}:match:runtime`,
        phase: room.matchPhase,
        scoreByTeam: {
          ...room.scoreByTeam
        }
      });

      room.sequence += 1;
      snapshots.push(snapshot);
      events.push({
        type: "server.snapshot",
        ...snapshot
      });
    }

    this.metrics.tickDurationMs = Math.max(0, this.now() - tickStart);
    this.metrics.roomCount = this.rooms.size;

    return {
      snapshots,
      events
    };
  }

  getMetrics(): RuntimeMetrics {
    return {
      tickDurationMs: this.metrics.tickDurationMs,
      roomCount: this.rooms.size
    };
  }

  getValidationTelemetry(roomId?: string): InputValidationTelemetry {
    if (roomId) {
      const room = this.requireRoom(roomId);
      return {
        accepted: room.validationTelemetry.accepted,
        rejected: room.validationTelemetry.rejected,
        rejectedByCode: {
          IMPOSSIBLE_ACCELERATION: room.validationTelemetry.rejectedByCode.IMPOSSIBLE_ACCELERATION,
          INVALID_BOOST_USAGE: room.validationTelemetry.rejectedByCode.INVALID_BOOST_USAGE,
          COOLDOWN_ABUSE: room.validationTelemetry.rejectedByCode.COOLDOWN_ABUSE
        }
      };
    }

    return createInputValidationTelemetryAccumulator(
      [...this.rooms.values()].map((roomInternal) => roomInternal.validationTelemetry)
    );
  }

  private createInternalRoom(roomId: string, playerIds: PlayerId[]): RuntimeRoomInternal {
    const normalizedPlayerIds = uniqueSortedPlayerIds(playerIds);
    const enableRapierForRoom = this.rapierEnabled && normalizedPlayerIds.length > 0;

    return {
      roomId,
      playerIds: normalizedPlayerIds,
      sim: new SimulationCore(normalizedPlayerIds, {
        fixedStepMs: this.fixedStepMs,
        rapierShadow: {
          enabled: enableRapierForRoom,
          shadowMode: this.rapierShadowMode,
          ballAuthority: enableRapierForRoom ? this.rapierBallAuthority : false
        }
      }),
      sequence: 1,
      matchPhase: "playing",
      scoreByTeam: createInitialScoreByTeam(),
      goalPauseTicksRemaining: 0,
      pendingInputs: [],
      disconnectedPlayerIds: new Set<PlayerId>(),
      validationState: createInputValidationRoomState(),
      validationTelemetry: createInputValidationTelemetry()
    };
  }

  private updateMatchState(room: RuntimeRoomInternal): void {
    if (room.sim.world.clock.isOver) {
      room.matchPhase = "finished";
      room.goalPauseTicksRemaining = 0;
      return;
    }

    const ballPosition = room.sim.world.ball.position;
    const inBlueGoal = isInsideBox(ballPosition, room.sim.world.goals.blue.volume);
    const inOrangeGoal = isInsideBox(ballPosition, room.sim.world.goals.orange.volume);

    if (inBlueGoal || inOrangeGoal) {
      const scoringTeamId = inBlueGoal ? TEAM_ORANGE_ID : TEAM_BLUE_ID;
      room.scoreByTeam[scoringTeamId] += 1;
      room.matchPhase = "goal_pause";
      room.goalPauseTicksRemaining = 1;

      room.sim.world.ball.position = { x: 0, y: 0, z: 1.5 };
      room.sim.world.ball.velocity = { x: 0, y: 0, z: 0 };
      return;
    }

    if (room.goalPauseTicksRemaining > 0) {
      room.goalPauseTicksRemaining -= 1;

      if (room.goalPauseTicksRemaining === 0) {
        room.matchPhase = "playing";
      }
      return;
    }

    room.matchPhase = "playing";
  }

  private requireRoom(roomId: string): RuntimeRoomInternal {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room runtime not found for roomId ${roomId}.`);
    }

    return room;
  }

  private toRuntimeRoom(room: RuntimeRoomInternal): RuntimeRoom {
    return {
      roomId: room.roomId,
      playerIds: [...room.playerIds],
      sim: room.sim
    };
  }
}

export function createServerRuntime(config: RuntimeConfig = {}): ServerRuntime {
  return new ServerRuntime(config);
}
