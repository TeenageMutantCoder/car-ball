import type { InputFrame, PlayerId } from "@car-ball/protocol";
import { DEFAULT_MAX_SUBSTEPS, FIXED_STEP_MS } from "./constants.ts";
import { createRapierShadowInitContext } from "./rapierColliders.ts";
import { RapierShadowWorld, type RapierShadowConfig, type RapierShadowMetrics } from "./rapierShadow.ts";
import { createInitialWorldState, type WorldState } from "./state.ts";
import { tickWorld } from "./tick.ts";

export interface SimulationConfig {
  fixedStepMs?: number;
  maxSubsteps?: number;
  matchDurationSeconds?: number;
  rapierShadow?: RapierShadowConfig;
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
  private readonly rapierShadow: RapierShadowWorld;
  private readonly rapierBallAuthority: boolean;

  constructor(playerIds: PlayerId[], config: SimulationConfig = {}) {
    this.fixedStepMs = config.fixedStepMs ?? FIXED_STEP_MS;
    this.maxSubsteps = config.maxSubsteps ?? DEFAULT_MAX_SUBSTEPS;
    this.world = createInitialWorldState({
      playerIds,
      matchDurationSeconds: config.matchDurationSeconds
    });
    this.rapierShadow = new RapierShadowWorld({
      ...config.rapierShadow,
      initContext: config.rapierShadow?.initContext ?? createRapierShadowInitContext(this.world)
    });
    this.rapierBallAuthority = config.rapierShadow?.ballAuthority ?? false;
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
      const rapierReport = this.rapierShadow.step(this.fixedStepMs / 1000);
      if (this.rapierBallAuthority && rapierReport?.authoritativeBallState) {
        const { position, velocity } = rapierReport.authoritativeBallState;
        if (isFiniteVec3(position) && isFiniteVec3(velocity)) {
          this.world.ball.position = {
            x: position.x,
            y: position.y,
            z: position.z
          };
          this.world.ball.velocity = {
            x: velocity.x,
            y: velocity.y,
            z: velocity.z
          };
        }
      }

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

  resetRapierShadow(): void {
    this.rapierShadow.reset();
  }

  getRapierShadowMetrics(): RapierShadowMetrics {
    return this.rapierShadow.getMetrics();
  }
}

function isFiniteVec3(value: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
