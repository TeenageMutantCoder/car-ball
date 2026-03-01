import { createHash } from "node:crypto";
import type { InputFrame, PlayerId, Snapshot } from "@car-ball/protocol";
import { stableStringify } from "./replayHash.ts";
import { SimulationCore } from "./simulation.ts";
import { worldToProtocolSnapshot } from "./snapshot.ts";

export interface ReplayDriftRunOptions {
  playerIds: PlayerId[];
  baselineInputFrames: InputFrame[];
  candidateInputFrames: InputFrame[];
  totalTicks: number;
  sampleEveryNTicks: number;
  fixedStepMs?: number;
  maxSubsteps?: number;
}

export interface ReplayDriftReport {
  sampledTicks: number;
  driftCount: number;
  driftRatePct: number;
  firstDivergedTick: number | null;
  endCarDriftCm: number;
  endBallDriftCm: number;
}

function buildFramesByTick(inputFrames: InputFrame[]): Map<number, InputFrame[]> {
  const framesByTick = new Map<number, InputFrame[]>();

  for (const frame of inputFrames) {
    const existing = framesByTick.get(frame.tick);
    if (existing) {
      existing.push(frame);
      continue;
    }

    framesByTick.set(frame.tick, [frame]);
  }

  return framesByTick;
}

function hashSnapshot(snapshot: Snapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

function toSnapshot(sim: SimulationCore, tick: number): Snapshot {
  return worldToProtocolSnapshot(sim.world, {
    sequence: tick,
    timestamp: Math.round(tick * sim.fixedStepMs)
  });
}

function clampZero(value: number): number {
  return value === 0 ? 0 : value;
}

function toCentimeters(distance: number): number {
  return distance * 100;
}

function distance3d(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number }
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function calcEndCarDriftCm(baseline: Snapshot, candidate: Snapshot): number {
  let maxDistance = 0;

  for (const baselineCar of baseline.cars) {
    const candidateCar = candidate.cars.find((car) => car.id === baselineCar.id);
    if (!candidateCar) {
      continue;
    }

    maxDistance = Math.max(maxDistance, distance3d(baselineCar.position, candidateCar.position));
  }

  return clampZero(toCentimeters(maxDistance));
}

function calcEndBallDriftCm(baseline: Snapshot, candidate: Snapshot): number {
  return clampZero(toCentimeters(distance3d(baseline.ball.position, candidate.ball.position)));
}

export function runReplayDriftReport(options: ReplayDriftRunOptions): ReplayDriftReport {
  if (options.sampleEveryNTicks <= 0) {
    throw new Error("sampleEveryNTicks must be greater than zero");
  }

  const baselineSim = new SimulationCore(options.playerIds, {
    fixedStepMs: options.fixedStepMs,
    maxSubsteps: options.maxSubsteps
  });
  const candidateSim = new SimulationCore(options.playerIds, {
    fixedStepMs: options.fixedStepMs,
    maxSubsteps: options.maxSubsteps
  });

  const baselineByTick = buildFramesByTick(options.baselineInputFrames);
  const candidateByTick = buildFramesByTick(options.candidateInputFrames);

  let sampledTicks = 0;
  let driftCount = 0;
  let firstDivergedTick: number | null = null;

  for (let tick = 1; tick <= options.totalTicks; tick += 1) {
    baselineSim.enqueueInputs(baselineByTick.get(tick) ?? []);
    candidateSim.enqueueInputs(candidateByTick.get(tick) ?? []);

    baselineSim.advance(baselineSim.fixedStepMs);
    candidateSim.advance(candidateSim.fixedStepMs);

    if (tick % options.sampleEveryNTicks !== 0) {
      continue;
    }

    sampledTicks += 1;

    const baselineSnapshot = toSnapshot(baselineSim, tick);
    const candidateSnapshot = toSnapshot(candidateSim, tick);

    if (hashSnapshot(baselineSnapshot) === hashSnapshot(candidateSnapshot)) {
      continue;
    }

    driftCount += 1;
    if (firstDivergedTick === null) {
      firstDivergedTick = tick;
    }
  }

  const baselineFinal = toSnapshot(baselineSim, options.totalTicks);
  const candidateFinal = toSnapshot(candidateSim, options.totalTicks);

  return {
    sampledTicks,
    driftCount,
    driftRatePct: sampledTicks === 0 ? 0 : (driftCount / sampledTicks) * 100,
    firstDivergedTick,
    endCarDriftCm: calcEndCarDriftCm(baselineFinal, candidateFinal),
    endBallDriftCm: calcEndBallDriftCm(baselineFinal, candidateFinal)
  };
}
