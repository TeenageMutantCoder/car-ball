import type { InputFrame, PlayerId } from "@car-ball/protocol";
import { DEFAULT_MAX_SUBSTEPS, FIXED_STEP_MS } from "./constants.ts";
import { createInitialWorldState, type WorldState } from "./state.ts";
import { tickWorld } from "./tick.ts";

export interface SimulationConfig {
  fixedStepMs?: number;
  maxSubsteps?: number;
  matchDurationSeconds?: number;
}

export interface AdvanceResult {
  substeps: number;
  droppedMs: number;
  accumulatorMs: number;
  tick: number;
}

export class SimulationCore {
  readonly fixedStepMs: number;
  readonly maxSubsteps: number;
  readonly world: WorldState;

  private accumulatorMs = 0;
  private readonly pendingInputsByTick = new Map<number, InputFrame[]>();

  constructor(playerIds: PlayerId[], config: SimulationConfig = {}) {
    this.fixedStepMs = config.fixedStepMs ?? FIXED_STEP_MS;
    this.maxSubsteps = config.maxSubsteps ?? DEFAULT_MAX_SUBSTEPS;
    this.world = createInitialWorldState({
      playerIds,
      matchDurationSeconds: config.matchDurationSeconds
    });
  }

  enqueueInput(frame: InputFrame): void {
    const existing = this.pendingInputsByTick.get(frame.tick);
    if (existing) {
      existing.push(frame);
      return;
    }

    this.pendingInputsByTick.set(frame.tick, [frame]);
  }

  enqueueInputs(frames: InputFrame[]): void {
    for (const frame of frames) {
      this.enqueueInput(frame);
    }
  }

  advance(elapsedMs: number): AdvanceResult {
    const clampedElapsedMs = Math.max(0, elapsedMs);
    this.accumulatorMs += clampedElapsedMs;

    const maxAccumulator = this.fixedStepMs * this.maxSubsteps;
    let droppedMs = 0;

    if (this.accumulatorMs > maxAccumulator) {
      droppedMs = this.accumulatorMs - maxAccumulator;
      this.accumulatorMs = maxAccumulator;
    }

    let substeps = 0;

    while (this.accumulatorMs >= this.fixedStepMs && substeps < this.maxSubsteps) {
      const nextTick = this.world.clock.tick + 1;
      const tickInputs = this.pendingInputsByTick.get(nextTick) ?? [];
      this.pendingInputsByTick.delete(nextTick);

      tickWorld(this.world, tickInputs, this.fixedStepMs / 1000);

      this.accumulatorMs -= this.fixedStepMs;
      substeps += 1;
    }

    return {
      substeps,
      droppedMs,
      accumulatorMs: this.accumulatorMs,
      tick: this.world.clock.tick
    };
  }
}
