export {};

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type NetworkProfileName = "clean" | "loss_5pct" | "jitter";
type ScenarioId = "1v1_baseline" | "2v2_collision_heavy" | "wall_ceiling_stress" | "impairment_matrix";
type ScenarioSize = "1v1" | "2v2";

type InputControls = {
  throttle: number;
  steer: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
};

type InputFrame = {
  version: 1;
  sequence: number;
  timestamp: number;
  tick: number;
  playerId: string;
  carId: string;
  controls: InputControls;
};

type BenchmarkArgs = {
  durationSeconds: number;
  outputRoot: string;
  sampleEveryNTicks: number;
};

type RuntimeConstants = {
  tickRateHz: number;
  snapshotRateHz: number;
  inputRateHz: number;
  maxSubsteps: number;
  reconcileThresholdCm: number;
};

type ScenarioDefinition = {
  id: ScenarioId;
  name: string;
  scenarioSize: ScenarioSize;
  players: string[];
  networkProfiles: NetworkProfileName[];
};

type ClientMetrics = {
  frameTimeMs: number;
  physicsTimeMs: number;
  renderTimeMs: number;
  fps: number;
  pingRttMs: number;
  correctionCount: number;
  correctionMagnitudeCmP95: number;
};

type ServerMetrics = {
  tickDurationP95Ms: number;
  tickDurationP99Ms: number;
  missedTickRatePct: number;
  roomCount: number;
  inboundPacketsPerSec: number;
  outboundPacketsPerSec: number;
};

type SimMetrics = {
  tickRateHz: number;
  substepsPerFrameP95: number;
  droppedAccumulatorMsTotal: number;
  replayDriftRatePct: number;
  replayEndDriftCarCm: number;
  replayEndDriftBallCm: number;
};

type SloResults = {
  frameP95Ms: number;
  physicsP95Ms: number;
  renderP95Ms: number;
  serverTickP95Ms: number;
  serverTickP99Ms: number;
  correctionsPerMinPerPlayer: number;
  correctionMagnitudeCmP95: number;
  replayDriftRatePct: number;
  pass: boolean;
};

type BenchmarkArtifact = {
  benchmarkId: string;
  runAtIso: string;
  gitCommit: string;
  scenario: ScenarioSize;
  durationMinutes: number;
  browser: string;
  networkProfile: NetworkProfileName;
  constants: RuntimeConstants;
  sloResults: SloResults;
};

type ScenarioArtifact = {
  telemetryEnvelope: {
    schemaVersion: 1;
    tsMs: number;
    source: "sim";
    sessionId: string;
    matchId: string;
  };
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuModel: string;
    cpuCount: number;
    totalMemMb: number;
    gitCommit: string;
  };
  scenarioMetadata: {
    scenarioId: ScenarioId;
    scenarioName: string;
    scenarioSize: ScenarioSize;
    players: string[];
    durationSeconds: number;
    totalTicks: number;
    networkProfile: NetworkProfileName;
    seed: number;
  };
  constants: RuntimeConstants;
  clientMetrics: ClientMetrics;
  serverMetrics: ServerMetrics;
  simMetrics: SimMetrics;
  benchmarkArtifact: BenchmarkArtifact;
  debug: {
    generatedInputFrames: number;
    impairedInputFrames: number;
    droppedInputFrames: number;
    delayedInputFrames: number;
    replaySampledTicks: number;
    replayFirstDivergedTick: number | null;
  };
};

const processRef = process;

function parseArgs(argv: string[]): BenchmarkArgs {
  let durationSeconds = 20;
  let outputRoot = "artifacts/benchmarks";
  let sampleEveryNTicks = 15;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--durationSeconds") {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        durationSeconds = Math.max(2, Math.floor(parsed));
      }
      index += 1;
      continue;
    }

    if (arg === "--outputDir") {
      outputRoot = argv[index + 1] ?? outputRoot;
      index += 1;
      continue;
    }

    if (arg === "--sampleEveryNTicks") {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        sampleEveryNTicks = Math.max(1, Math.floor(parsed));
      }
      index += 1;
    }
  }

  return {
    durationSeconds,
    outputRoot,
    sampleEveryNTicks,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const clampedP = Math.min(1, Math.max(0, p));
  const index = Math.ceil(clampedP * sorted.length) - 1;
  const safeIndex = Math.min(sorted.length - 1, Math.max(0, index));
  const value = sorted[safeIndex] ?? 0;
  return Number(value.toFixed(4));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(4));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= -1) {
    return -1;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function controlsForTick(scenarioId: ScenarioId, tick: number, playerIndex: number, playerCount: number): InputControls {
  const phase = tick / 24;
  const wave = Math.sin(phase + playerIndex * 0.7);
  const alternating = (tick + playerIndex) % 24;

  if (scenarioId === "2v2_collision_heavy") {
    return {
      throttle: 1,
      steer: clampUnit(playerIndex % 2 === 0 ? wave : -wave),
      jump: alternating === 0 || alternating === 1,
      boost: alternating < 10,
      handbrake: alternating >= 12 && alternating <= 16,
    };
  }

  if (scenarioId === "wall_ceiling_stress") {
    return {
      throttle: 1,
      steer: clampUnit(Math.cos(phase * 0.9 + playerIndex)),
      jump: alternating === 0 || alternating === 12,
      boost: alternating < 18,
      handbrake: alternating >= 18,
    };
  }

  if (scenarioId === "impairment_matrix") {
    return {
      throttle: playerIndex % 2 === 0 ? 1 : 0.9,
      steer: clampUnit(Math.sin(phase * 0.5 + playerCount * 0.2)),
      jump: alternating === 0,
      boost: alternating < 8,
      handbrake: alternating >= 20,
    };
  }

  return {
    throttle: 1,
    steer: clampUnit(Math.sin(phase * 0.4 + playerIndex * 0.3) * 0.6),
    jump: alternating === 0,
    boost: alternating < 6,
    handbrake: false,
  };
}

function createNetworkProfile(profile: NetworkProfileName): {
  name: NetworkProfileName;
  lossRate: number;
  jitterMs: number;
  baseRttMs: number;
} {
  if (profile === "loss_5pct") {
    return {
      name: "loss_5pct",
      lossRate: 0.05,
      jitterMs: 8,
      baseRttMs: 48,
    };
  }

  if (profile === "jitter") {
    return {
      name: "jitter",
      lossRate: 0,
      jitterMs: 28,
      baseRttMs: 54,
    };
  }

  return {
    name: "clean",
    lossRate: 0,
    jitterMs: 1,
    baseRttMs: 24,
  };
}

function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function runScenario(options: {
  definition: ScenarioDefinition;
  profile: NetworkProfileName;
  constants: RuntimeConstants;
  durationSeconds: number;
  sampleEveryNTicks: number;
  benchmarkId: string;
  runAtIso: string;
  gitCommit: string;
  sessionId: string;
  matchId: string;
}): Promise<ScenarioArtifact> {
  const {
    definition,
    profile,
    constants,
    durationSeconds,
    sampleEveryNTicks,
    benchmarkId,
    runAtIso,
    gitCommit,
    sessionId,
    matchId,
  } = options;

  const [
    { createServerRuntime },
    { SimulationCore, worldToProtocolSnapshot, runReplayDriftReport },
    { createInputFrameEmitter },
    { createPredictionHistory },
    {
      applyCorrection,
      computePositionErrorCm,
      createCorrectionTelemetry,
      resolveReconciliationTuning,
      shouldCorrect,
    },
    { createDebugHud },
    { RendererBridge },
  ] = await Promise.all([
    import("../apps/server/src/runtime.ts"),
    import("../packages/sim/src/index.ts"),
    import("../apps/client/src/input/frameEmitter.ts"),
    import("../apps/client/src/net/prediction.ts"),
    import("../apps/client/src/net/reconciliation.ts"),
    import("../apps/client/src/debug/hud.ts"),
    import("../apps/client/src/render/rendererBridge.ts"),
  ]);

  const totalTicks = Math.max(2, Math.floor(durationSeconds * constants.tickRateHz));
  const inputEveryTicks = Math.max(1, Math.floor(constants.tickRateHz / constants.inputRateHz));
  const snapshotEveryTicks = Math.max(1, Math.floor(constants.tickRateHz / constants.snapshotRateHz));
  const localPlayerId = definition.players[0] ?? "player-1";
  const localCarId = `car:${localPlayerId}`;
  const fixedStepMs = 1000 / constants.tickRateHz;
  const randomSeed = hashSeed(`${definition.id}:${profile}:${totalTicks}`);
  const rand = mulberry32(randomSeed);
  const network = createNetworkProfile(profile);

  const emittersByPlayer = new Map<string, ReturnType<typeof createInputFrameEmitter>>();
  const candidateEmittersByPlayer = new Map<string, ReturnType<typeof createInputFrameEmitter>>();
  const historiesByPlayer = new Map<string, ReturnType<typeof createPredictionHistory>>();

  for (const playerId of definition.players) {
    emittersByPlayer.set(
      playerId,
      createInputFrameEmitter({
        playerId,
        carId: `car:${playerId}`,
        now: () => 0,
      })
    );

    candidateEmittersByPlayer.set(
      playerId,
      createInputFrameEmitter({
        playerId,
        carId: `car:${playerId}`,
        now: () => 0,
      })
    );

    historiesByPlayer.set(playerId, createPredictionHistory({ capacity: totalTicks * 2 }));
  }

  const baselineFrames: InputFrame[] = [];
  const candidateFrames: InputFrame[] = [];
  const baselineFramesByTick = new Map<number, InputFrame[]>();
  const candidateFramesByTick = new Map<number, InputFrame[]>();

  const lastCandidateTickByPlayer = new Map<string, number>();
  let droppedInputFrames = 0;
  let delayedInputFrames = 0;

  for (let tick = inputEveryTicks; tick <= totalTicks; tick += inputEveryTicks) {
    for (let playerIndex = 0; playerIndex < definition.players.length; playerIndex += 1) {
      const playerId = definition.players[playerIndex] as string;
      const emitter = emittersByPlayer.get(playerId);
      const history = historiesByPlayer.get(playerId);
      if (!emitter || !history) {
        continue;
      }

      const controls = controlsForTick(definition.id, tick, playerIndex, definition.players.length);
      const frame = emitter.emit(tick, controls) as InputFrame;
      frame.timestamp = Math.round(tick * fixedStepMs);
      history.enqueue(frame);
      baselineFrames.push(frame);

      const bucket = baselineFramesByTick.get(frame.tick);
      if (bucket) {
        bucket.push(frame);
      } else {
        baselineFramesByTick.set(frame.tick, [frame]);
      }

      if (rand() < network.lossRate) {
        droppedInputFrames += 1;
        continue;
      }

      const jitterMs = network.jitterMs <= 0 ? 0 : rand() * network.jitterMs;
      const delayTicks = Math.max(0, Math.round(jitterMs / fixedStepMs));
      let candidateTick = tick + delayTicks;
      if (delayTicks > 0) {
        delayedInputFrames += 1;
      }

      const lastCandidateTick = lastCandidateTickByPlayer.get(playerId) ?? 0;
      candidateTick = Math.max(candidateTick, lastCandidateTick + inputEveryTicks);

      if (candidateTick > totalTicks) {
        continue;
      }

      lastCandidateTickByPlayer.set(playerId, candidateTick);
      const candidateEmitter = candidateEmittersByPlayer.get(playerId);
      if (!candidateEmitter) {
        continue;
      }

      const candidateFrame = candidateEmitter.emit(candidateTick, frame.controls) as InputFrame;
      candidateFrame.timestamp = Math.round(candidateTick * fixedStepMs);
      candidateFrames.push(candidateFrame);

      const candidateBucket = candidateFramesByTick.get(candidateFrame.tick);
      if (candidateBucket) {
        candidateBucket.push(candidateFrame);
      } else {
        candidateFramesByTick.set(candidateFrame.tick, [candidateFrame]);
      }
    }
  }

  const runtime = createServerRuntime({
    tickRateHz: constants.tickRateHz,
    snapshotRateHz: constants.snapshotRateHz,
    now: () => performance.now(),
  });
  runtime.createRoomRuntime("benchmark-room");
  runtime.attachPlayerIds("benchmark-room", definition.players);

  const baselineSim = new SimulationCore(definition.players, {
    fixedStepMs,
    maxSubsteps: constants.maxSubsteps,
  });
  const candidateSim = new SimulationCore(definition.players, {
    fixedStepMs,
    maxSubsteps: constants.maxSubsteps,
  });

  const reconciliationTuning = resolveReconciliationTuning({
    profile,
    rapierBallAuthority: true,
  });

  const correctionTelemetry = createCorrectionTelemetry(60_000, {
    rapierBallAuthority: true,
    deadzoneCm: reconciliationTuning.deadzoneCm,
    smoothingAlpha: reconciliationTuning.smoothingAlpha,
  });
  const hud = createDebugHud();
  const rendererBridge = new RendererBridge();

  let inboundPackets = 0;
  let outboundPackets = 0;
  let droppedAccumulatorMsTotal = 0;
  let missedTicks = 0;

  const frameTimesMs: number[] = [];
  const physicsTimesMs: number[] = [];
  const renderTimesMs: number[] = [];
  const pingSamplesMs: number[] = [];
  const correctionMagnitudesCm: number[] = [];
  const substepsByFrame: number[] = [];
  const serverTickDurationsMs: number[] = [];
  let correctionEpisodeActive = false;

  for (let tick = 1; tick <= totalTicks; tick += 1) {
    const frameStart = performance.now();

    const candidateTickFrames = candidateFramesByTick.get(tick) ?? [];
    for (const frame of candidateTickFrames) {
      runtime.enqueueInputFrame("benchmark-room", frame);
      inboundPackets += 1;
    }

    const tickResult = runtime.tickOnce(fixedStepMs);
    const runtimeMetrics = runtime.getMetrics();
    serverTickDurationsMs.push(runtimeMetrics.tickDurationMs);
    outboundPackets += tickResult.events.length;

    const baselineTickFrames = baselineFramesByTick.get(tick) ?? [];
    baselineSim.enqueueInputs(baselineTickFrames);
    baselineSim.advance(fixedStepMs);

    candidateSim.enqueueInputs(candidateTickFrames);
    const physicsStart = performance.now();
    const advanceResult = candidateSim.advance(fixedStepMs);
    const physicsEnd = performance.now();
    physicsTimesMs.push(physicsEnd - physicsStart);

    substepsByFrame.push(advanceResult.substeps);
    droppedAccumulatorMsTotal += advanceResult.droppedMs;
    if (advanceResult.substeps === 0) {
      missedTicks += 1;
    }

    const isSnapshotTick = tick % snapshotEveryTicks === 0;
    if (isSnapshotTick) {
      const baselineCar = baselineSim.world.cars[localCarId];
      const candidateCar = candidateSim.world.cars[localCarId];
      if (baselineCar && candidateCar) {
        const errorCm = computePositionErrorCm(candidateCar.position, baselineCar.position);
        const shouldApplyCorrection = shouldCorrect(errorCm, reconciliationTuning.deadzoneCm);
        if (shouldApplyCorrection) {
          if (!correctionEpisodeActive) {
            correctionEpisodeActive = true;
            correctionTelemetry.recordCorrection(errorCm, Math.round(tick * fixedStepMs));
            correctionMagnitudesCm.push(errorCm);
            hud.incrementCorrectionCount(1);
          }

          candidateCar.position = applyCorrection(
            candidateCar.position,
            baselineCar.position,
            reconciliationTuning.smoothingAlpha,
          );
        } else {
          const resetEpisodeThresholdCm = reconciliationTuning.deadzoneCm * 0.2;
          if (!shouldCorrect(errorCm, resetEpisodeThresholdCm)) {
            correctionEpisodeActive = false;
          }
        }
      }
    }

    const snapshot = worldToProtocolSnapshot(baselineSim.world, {
      sequence: tick,
      timestamp: Math.round(tick * fixedStepMs),
      matchId,
      phase: baselineSim.world.clock.isOver ? "finished" : "playing",
    });

    const renderStart = performance.now();
    rendererBridge.applySnapshot(snapshot);
    rendererBridge.getInterpolatedSnapshot(0.5);
    const renderEnd = performance.now();
    renderTimesMs.push(renderEnd - renderStart);

    const pingJitterMs = network.jitterMs <= 0 ? 0 : (rand() * network.jitterMs * 2) - network.jitterMs;
    const pingRttMs = Math.max(0, network.baseRttMs + pingJitterMs);
    pingSamplesMs.push(pingRttMs);
    hud.setPingMs(pingRttMs);

    const frameEnd = performance.now();
    const frameTimeMs = frameEnd - frameStart;
    frameTimesMs.push(frameTimeMs);
    hud.updateFrame(frameTimeMs);
  }

  const replayDrift = runReplayDriftReport({
    playerIds: definition.players,
    baselineInputFrames: baselineFrames,
    candidateInputFrames: candidateFrames,
    totalTicks,
    sampleEveryNTicks,
    fixedStepMs,
    maxSubsteps: constants.maxSubsteps,
  });

  const durationMinutes = durationSeconds / 60;
  const correctionsPerMinPerPlayer = durationMinutes === 0 ? 0 : correctionMagnitudesCm.length / durationMinutes;

  const clientMetrics: ClientMetrics = {
    frameTimeMs: percentile(frameTimesMs, 0.95),
    physicsTimeMs: percentile(physicsTimesMs, 0.95),
    renderTimeMs: percentile(renderTimesMs, 0.95),
    fps: average(frameTimesMs) <= 0 ? 0 : Number((1000 / average(frameTimesMs)).toFixed(4)),
    pingRttMs: average(pingSamplesMs),
    correctionCount: correctionMagnitudesCm.length,
    correctionMagnitudeCmP95: percentile(correctionMagnitudesCm, 0.95),
  };

  const serverMetrics: ServerMetrics = {
    tickDurationP95Ms: percentile(serverTickDurationsMs, 0.95),
    tickDurationP99Ms: percentile(serverTickDurationsMs, 0.99),
    missedTickRatePct: Number(((missedTicks / totalTicks) * 100).toFixed(4)),
    roomCount: runtime.getMetrics().roomCount,
    inboundPacketsPerSec: Number((inboundPackets / durationSeconds).toFixed(4)),
    outboundPacketsPerSec: Number((outboundPackets / durationSeconds).toFixed(4)),
  };

  const simMetrics: SimMetrics = {
    tickRateHz: constants.tickRateHz,
    substepsPerFrameP95: percentile(substepsByFrame, 0.95),
    droppedAccumulatorMsTotal: Number(droppedAccumulatorMsTotal.toFixed(4)),
    replayDriftRatePct: Number(replayDrift.driftRatePct.toFixed(4)),
    replayEndDriftCarCm: Number(replayDrift.endCarDriftCm.toFixed(4)),
    replayEndDriftBallCm: Number(replayDrift.endBallDriftCm.toFixed(4)),
  };

  const correctionThreshold = profile === "clean" ? 12 : 30;
  const sloResults: SloResults = {
    frameP95Ms: clientMetrics.frameTimeMs,
    physicsP95Ms: clientMetrics.physicsTimeMs,
    renderP95Ms: clientMetrics.renderTimeMs,
    serverTickP95Ms: serverMetrics.tickDurationP95Ms,
    serverTickP99Ms: serverMetrics.tickDurationP99Ms,
    correctionsPerMinPerPlayer: Number(correctionsPerMinPerPlayer.toFixed(4)),
    correctionMagnitudeCmP95: clientMetrics.correctionMagnitudeCmP95,
    replayDriftRatePct: simMetrics.replayDriftRatePct,
    pass:
      clientMetrics.frameTimeMs <= 16.7 &&
      clientMetrics.physicsTimeMs <= 6 &&
      clientMetrics.renderTimeMs <= 9 &&
      serverMetrics.tickDurationP95Ms <= 8.3 &&
      serverMetrics.tickDurationP99Ms <= 12 &&
      correctionsPerMinPerPlayer <= correctionThreshold &&
        clientMetrics.correctionMagnitudeCmP95 <= reconciliationTuning.deadzoneCm &&
      simMetrics.replayDriftRatePct <= 0.5,
  };

  const benchmarkArtifact: BenchmarkArtifact = {
    benchmarkId,
    runAtIso,
    gitCommit,
    scenario: definition.scenarioSize,
    durationMinutes: Number(durationMinutes.toFixed(4)),
    browser: "headless-node",
    networkProfile: profile,
    constants,
    sloResults,
  };

  return {
    telemetryEnvelope: {
      schemaVersion: 1,
      tsMs: Date.now(),
      source: "sim",
      sessionId,
      matchId,
    },
    environment: {
      nodeVersion: processRef.version,
      platform: processRef.platform,
      arch: processRef.arch,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      cpuCount: os.cpus().length,
      totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      gitCommit,
    },
    scenarioMetadata: {
      scenarioId: definition.id,
      scenarioName: definition.name,
      scenarioSize: definition.scenarioSize,
      players: [...definition.players],
      durationSeconds,
      totalTicks,
      networkProfile: profile,
      seed: randomSeed,
    },
    constants,
    clientMetrics,
    serverMetrics,
    simMetrics,
    benchmarkArtifact,
    debug: {
      generatedInputFrames: baselineFrames.length,
      impairedInputFrames: candidateFrames.length,
      droppedInputFrames,
      delayedInputFrames,
      replaySampledTicks: replayDrift.sampledTicks,
      replayFirstDivergedTick: replayDrift.firstDivergedTick,
    },
  };
}

async function main(): Promise<number> {
  const args = parseArgs(processRef.argv);
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const outputDir = path.resolve(processRef.cwd(), args.outputRoot, timestamp);
  const benchmarkId = `ws-g-002-${timestamp}`;
  const runAtIso = new Date().toISOString();
  const gitCommit = getGitCommit();

  const constants: RuntimeConstants = {
    tickRateHz: 120,
    snapshotRateHz: 20,
    inputRateHz: 60,
    maxSubsteps: 8,
    reconcileThresholdCm: 20,
  };

  const scenarios: ScenarioDefinition[] = [
    {
      id: "1v1_baseline",
      name: "1v1 baseline",
      scenarioSize: "1v1",
      players: ["player-1", "player-2"],
      networkProfiles: ["clean"],
    },
    {
      id: "2v2_collision_heavy",
      name: "2v2 collision-heavy",
      scenarioSize: "2v2",
      players: ["player-1", "player-2", "player-3", "player-4"],
      networkProfiles: ["clean"],
    },
    {
      id: "wall_ceiling_stress",
      name: "wall-ceiling stress",
      scenarioSize: "1v1",
      players: ["player-1", "player-2"],
      networkProfiles: ["clean"],
    },
    {
      id: "impairment_matrix",
      name: "impairment matrix",
      scenarioSize: "1v1",
      players: ["player-1", "player-2"],
      networkProfiles: ["clean", "loss_5pct", "jitter"],
    },
  ];

  fs.mkdirSync(outputDir, { recursive: true });

  const artifacts: Array<{ file: string; artifact: ScenarioArtifact }> = [];

  for (const scenario of scenarios) {
    for (const profile of scenario.networkProfiles) {
      const matchId = `${scenario.id}:${profile}`;
      const sessionId = `${benchmarkId}:${scenario.id}`;
      const artifact = await runScenario({
        definition: scenario,
        profile,
        constants,
        durationSeconds: args.durationSeconds,
        sampleEveryNTicks: args.sampleEveryNTicks,
        benchmarkId,
        runAtIso,
        gitCommit,
        sessionId,
        matchId,
      });

      const fileName = `${scenario.id}__${profile}.json`;
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), "utf8");
      artifacts.push({ file: fileName, artifact });
    }
  }

  const summary = {
    benchmarkId,
    runAtIso,
    outputDir,
    scenarioCount: artifacts.length,
    durationSeconds: args.durationSeconds,
    constants,
    aggregate: {
      overallPass: artifacts.every(({ artifact }) => artifact.benchmarkArtifact.sloResults.pass),
      passCount: artifacts.filter(({ artifact }) => artifact.benchmarkArtifact.sloResults.pass).length,
      failCount: artifacts.filter(({ artifact }) => !artifact.benchmarkArtifact.sloResults.pass).length,
      maxFrameP95Ms: Math.max(...artifacts.map(({ artifact }) => artifact.clientMetrics.frameTimeMs), 0),
      maxServerTickP99Ms: Math.max(...artifacts.map(({ artifact }) => artifact.serverMetrics.tickDurationP99Ms), 0),
      maxReplayDriftRatePct: Math.max(...artifacts.map(({ artifact }) => artifact.simMetrics.replayDriftRatePct), 0),
    },
    runs: artifacts.map(({ file, artifact }) => ({
      file,
      scenarioId: artifact.scenarioMetadata.scenarioId,
      networkProfile: artifact.scenarioMetadata.networkProfile,
      pass: artifact.benchmarkArtifact.sloResults.pass,
      frameP95Ms: artifact.clientMetrics.frameTimeMs,
      serverTickP99Ms: artifact.serverMetrics.tickDurationP99Ms,
      correctionsPerMinPerPlayer: artifact.benchmarkArtifact.sloResults.correctionsPerMinPerPlayer,
      replayDriftRatePct: artifact.simMetrics.replayDriftRatePct,
    })),
  };

  const summaryPath = path.join(outputDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`Benchmark completed: ${summaryPath}`);
  for (const run of summary.runs) {
    console.log(
      `${run.scenarioId}/${run.networkProfile}: pass=${run.pass} frameP95=${run.frameP95Ms}ms tickP99=${run.serverTickP99Ms}ms drift=${run.replayDriftRatePct}%`
    );
  }

  return 0;
}

main()
  .then((code) => {
    processRef.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    processRef.exit(1);
  });
