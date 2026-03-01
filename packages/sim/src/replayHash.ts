import { createHash } from "node:crypto";
import type { InputFrame, PlayerId } from "@car-ball/protocol";
import { SimulationCore } from "./simulation.ts";
import type { WorldState } from "./state.ts";

export interface ReplayHashEntry {
  tick: number;
  hash: string;
}

export interface ReplayHashRunOptions {
  playerIds: PlayerId[];
  inputFrames: InputFrame[];
  totalTicks: number;
  hashEveryNTicks: number;
  fixedStepMs?: number;
  maxSubsteps?: number;
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`);

  return `{${entries.join(",")}}`;
}

export function hashWorldState(world: WorldState, algorithm = "sha256"): string {
  const payload = stableStringify(world);
  return createHash(algorithm).update(payload).digest("hex");
}

export function runReplayHashSnapshots(options: ReplayHashRunOptions): ReplayHashEntry[] {
  if (options.hashEveryNTicks <= 0) {
    throw new Error("hashEveryNTicks must be greater than zero");
  }

  const sim = new SimulationCore(options.playerIds, {
    fixedStepMs: options.fixedStepMs,
    maxSubsteps: options.maxSubsteps
  });

  const framesByTick = new Map<number, InputFrame[]>();
  for (const frame of options.inputFrames) {
    const existing = framesByTick.get(frame.tick);
    if (existing) {
      existing.push(frame);
      continue;
    }

    framesByTick.set(frame.tick, [frame]);
  }

  const snapshots: ReplayHashEntry[] = [];

  for (let tick = 1; tick <= options.totalTicks; tick += 1) {
    sim.enqueueInputs(framesByTick.get(tick) ?? []);
    sim.advance(sim.fixedStepMs);

    if (tick % options.hashEveryNTicks === 0) {
      snapshots.push({
        tick,
        hash: hashWorldState(sim.world)
      });
    }
  }

  return snapshots;
}
