import type { InputFrame, PlayerId, ServerEvent, Snapshot } from "@car-ball/protocol";
import { SimulationCore, worldToProtocolSnapshot } from "@car-ball/sim";

export const DEFAULT_TICK_RATE_HZ = 120;
export const DEFAULT_SNAPSHOT_RATE_HZ = 20;

export interface RuntimeConfig {
  tickRateHz?: number;
  snapshotRateHz?: number;
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

interface RuntimeRoomInternal {
  roomId: string;
  playerIds: PlayerId[];
  sim: SimulationCore;
  sequence: number;
  pendingInputs: InputFrame[];
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
      fixedStepMs: this.fixedStepMs
    });
    room.pendingInputs = [];

    return this.toRuntimeRoom(room);
  }

  enqueueInputFrame(roomId: string, frame: InputFrame): void {
    const room = this.requireRoom(roomId);
    room.pendingInputs.push(frame);
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

      if (advanceResult.tick % this.snapshotEveryTicks !== 0) {
        continue;
      }

      const snapshot = worldToProtocolSnapshot(room.sim.world, {
        sequence: room.sequence,
        timestamp,
        matchId: `${roomId}:match:runtime`,
        phase: room.sim.world.clock.isOver ? "finished" : "playing"
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

  private createInternalRoom(roomId: string, playerIds: PlayerId[]): RuntimeRoomInternal {
    const normalizedPlayerIds = uniqueSortedPlayerIds(playerIds);

    return {
      roomId,
      playerIds: normalizedPlayerIds,
      sim: new SimulationCore(normalizedPlayerIds, {
        fixedStepMs: this.fixedStepMs
      }),
      sequence: 1,
      pendingInputs: []
    };
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
