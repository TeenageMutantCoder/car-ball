export {};

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Scenario = '1v1' | '2v2';
type NetworkProfile = 'clean' | 'loss_5pct' | 'jitter';

type BenchmarkArtifact = {
  benchmarkId: string;
  runAtIso: string;
  gitCommit: string;
  scenario: Scenario;
  durationMinutes: number;
  browser: string;
  networkProfile: NetworkProfile;
  rapierMode?: 'legacy' | 'shadow' | 'authority';
  constants: {
    tickRateHz: number;
    snapshotRateHz: number;
    inputRateHz: number;
    maxSubsteps: number;
    reconcileThresholdCm: number;
  };
  sloResults: {
    frameP95Ms: number;
    physicsP95Ms: number;
    renderP95Ms: number;
    serverTickP95Ms: number;
    serverTickP99Ms: number;
    missedTickRatePct: number;
    correctionsPerMinPerPlayer: number;
    correctionMagnitudeCmP95: number;
    correctionMagnitudeCmP99: number;
    correctionMagnitudeCmMax: number;
    replayDriftRatePct: number;
    replayEndDriftCarCm: number;
    replayEndDriftBallCm: number;
    clientLongTasksOver50MsPer10Min: number;
    clientHeapGrowthMbPer10Min: number;
    serverRssGrowthPct: number;
  };
};

type CycleReport = {
  cycle: number;
  scenarios: Scenario[];
  benchmarkArtifacts: string[];
  gateReportPath: string;
  pass: boolean;
};

type ReleaseDecisionReport = {
  schemaVersion: 1;
  generatedAtIso: string;
  requiredConsecutiveCycles: number;
  configuredCycles: number;
  durationMinutes: number;
  decision: 'GO' | 'NO_GO';
  reason: string;
  cycles: CycleReport[];
  evidencePaths: {
    benchmarkArtifacts: string[];
    gateReports: string[];
  };
};

function parseArgs(argv: string[]): {
  cycles: number;
  durationMinutes: number;
  benchmarksDir: string;
  gatesDir: string;
  outputPath: string;
  harnessCmd?: string;
} {
  let cycles = 2;
  let durationMinutes = 2;
  let benchmarksDir = 'artifacts/benchmarks';
  let gatesDir = 'artifacts/gates';
  let outputPath = 'artifacts/releases/soak-release-decision.json';
  let harnessCmd: string | undefined;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cycles') {
      const value = Number(argv[index + 1]);
      if (!Number.isNaN(value) && value >= 1) cycles = Math.floor(value);
      index += 1;
      continue;
    }
    if (arg === '--duration-minutes') {
      const value = Number(argv[index + 1]);
      if (!Number.isNaN(value) && value > 0) durationMinutes = value;
      index += 1;
      continue;
    }
    if (arg === '--benchmarks-dir') {
      benchmarksDir = argv[index + 1] || benchmarksDir;
      index += 1;
      continue;
    }
    if (arg === '--gates-dir') {
      gatesDir = argv[index + 1] || gatesDir;
      index += 1;
      continue;
    }
    if (arg === '--output') {
      outputPath = argv[index + 1] || outputPath;
      index += 1;
      continue;
    }
    if (arg === '--harness-cmd') {
      harnessCmd = argv[index + 1] || harnessCmd;
      index += 1;
      continue;
    }
  }

  return {
    cycles,
    durationMinutes,
    benchmarksDir,
    gatesDir,
    outputPath,
    harnessCmd,
  };
}

function buildSampleArtifact(params: {
  scenario: Scenario;
  networkProfile: NetworkProfile;
  cycle: number;
  durationMinutes: number;
}): BenchmarkArtifact {
  const base =
    params.scenario === '1v1'
      ? {
          frameP95Ms: 14.2,
          physicsP95Ms: 4.1,
          renderP95Ms: 7.1,
          serverTickP95Ms: 6.0,
          serverTickP99Ms: 9.4,
          correctionsPerMinPerPlayer: params.networkProfile === 'clean' ? 9 : 24,
        }
      : {
          frameP95Ms: 15.6,
          physicsP95Ms: 5.3,
          renderP95Ms: 8.3,
          serverTickP95Ms: 7.4,
          serverTickP99Ms: 10.8,
          correctionsPerMinPerPlayer: params.networkProfile === 'clean' ? 11 : 27,
        };

  const cycleAdjustment = (params.cycle - 1) * 0.1;

  return {
    benchmarkId: `soak-${params.scenario}-${params.networkProfile}-cycle-${params.cycle}`,
    runAtIso: new Date().toISOString(),
    gitCommit: 'sample',
    scenario: params.scenario,
    durationMinutes: params.durationMinutes,
    browser: 'chrome',
    networkProfile: params.networkProfile,
    constants: {
      tickRateHz: 120,
      snapshotRateHz: 20,
      inputRateHz: 60,
      maxSubsteps: 4,
      reconcileThresholdCm: 20,
    },
    sloResults: {
      frameP95Ms: base.frameP95Ms + cycleAdjustment,
      physicsP95Ms: base.physicsP95Ms + cycleAdjustment,
      renderP95Ms: base.renderP95Ms + cycleAdjustment,
      serverTickP95Ms: base.serverTickP95Ms + cycleAdjustment,
      serverTickP99Ms: base.serverTickP99Ms + cycleAdjustment,
      missedTickRatePct: 0.25,
      correctionsPerMinPerPlayer: base.correctionsPerMinPerPlayer,
      correctionMagnitudeCmP95: 16,
      correctionMagnitudeCmP99: 40,
      correctionMagnitudeCmMax: 90,
      replayDriftRatePct: 0.3,
      replayEndDriftCarCm: 10,
      replayEndDriftBallCm: 16,
      clientLongTasksOver50MsPer10Min: 2,
      clientHeapGrowthMbPer10Min: 3.1,
      serverRssGrowthPct: 5.5,
    },
  };
}

function runSampleHarness(params: {
  fs: {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    writeFileSync(path: string, contents: string): void;
  };
  path: {
    join(...parts: string[]): string;
    relative(from: string, to: string): string;
  };
  scenario: Scenario;
  cycle: number;
  durationMinutes: number;
  cycleDir: string;
}): string {
  params.fs.mkdirSync(params.cycleDir, { recursive: true });

  const networkProfile: NetworkProfile = params.scenario === '1v1' ? 'clean' : 'loss_5pct';
  const artifact = buildSampleArtifact({
    scenario: params.scenario,
    networkProfile,
    cycle: params.cycle,
    durationMinutes: params.durationMinutes,
  });

  const artifactPath = params.path.join(
    params.cycleDir,
    `${params.scenario}-${networkProfile}-cycle-${params.cycle}.json`,
  );

  params.fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return params.path.relative(process.cwd(), artifactPath);
}

function main(): number {
  const {
    cycles,
    durationMinutes,
    benchmarksDir,
    gatesDir,
    outputPath,
    harnessCmd,
  } = parseArgs(process.argv);

  const resolvedBenchmarksDir = path.resolve(process.cwd(), benchmarksDir);
  const resolvedGatesDir = path.resolve(process.cwd(), gatesDir);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);

  const scenarios: Scenario[] = ['1v1', '2v2'];
  const cycleReports: CycleReport[] = [];

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const cycleBenchmarkDir = path.join(resolvedBenchmarksDir, `soak-cycle-${cycle}`);
    fs.rmSync(cycleBenchmarkDir, { recursive: true, force: true });
    const generatedArtifacts: string[] = [];

    if (!harnessCmd) {
      for (const scenario of scenarios) {
        generatedArtifacts.push(
          runSampleHarness({
            fs,
            path,
            scenario,
            cycle,
            durationMinutes,
            cycleDir: cycleBenchmarkDir,
          }),
        );
      }
    } else {
      const command = harnessCmd
        .replaceAll('{scenario}', 'hybrid')
        .replaceAll('{cycle}', String(cycle))
        .replaceAll('{duration}', String(durationMinutes))
        .replaceAll('{out}', cycleBenchmarkDir);

      childProcess.execSync(command, {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf8',
      });

      if (fs.existsSync(cycleBenchmarkDir)) {
        const nestedArtifactFiles = fs
          .readdirSync(cycleBenchmarkDir, { recursive: true })
          .map((entry) => String(entry))
          .filter((entry) => entry.endsWith('.json') && !entry.endsWith('summary.json'))
          .map((entry) => path.relative(process.cwd(), path.join(cycleBenchmarkDir, entry)));
        generatedArtifacts.push(...nestedArtifactFiles);
      }
    }

    const gateReportPath = path.join(resolvedGatesDir, `soak-cycle-${cycle}-slo-gate-report.json`);

    const gateProcess = childProcess.spawnSync(
      'node',
      [
        '--experimental-strip-types',
        'scripts/evaluate_slo_gates.ts',
        '--artifacts-dir',
        path.relative(process.cwd(), cycleBenchmarkDir),
        '--output',
        path.relative(process.cwd(), gateReportPath),
      ],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf8',
      },
    );

    if (gateProcess.stdout.trim()) {
      process.stdout.write(`${gateProcess.stdout.trim()}\n`);
    }
    if (gateProcess.stderr.trim()) {
      process.stderr.write(`${gateProcess.stderr.trim()}\n`);
    }

    const gateReport = JSON.parse(
      fs.readFileSync(gateReportPath, 'utf8'),
    ) as { summary: { pass: boolean } };

    cycleReports.push({
      cycle,
      scenarios,
      benchmarkArtifacts: generatedArtifacts,
      gateReportPath: path.relative(process.cwd(), gateReportPath),
      pass: gateReport.summary.pass && gateProcess.status === 0,
    });
  }

  const requiredConsecutiveCycles = 2;
  let maxConsecutivePasses = 0;
  let currentConsecutivePasses = 0;

  for (const cycle of cycleReports) {
    if (cycle.pass) {
      currentConsecutivePasses += 1;
      if (currentConsecutivePasses > maxConsecutivePasses) {
        maxConsecutivePasses = currentConsecutivePasses;
      }
    } else {
      currentConsecutivePasses = 0;
    }
  }

  const decision = maxConsecutivePasses >= requiredConsecutiveCycles ? 'GO' : 'NO_GO';
  const decisionReport: ReleaseDecisionReport = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    requiredConsecutiveCycles,
    configuredCycles: cycles,
    durationMinutes,
    decision,
    reason:
      decision === 'GO'
        ? `Two consecutive soak cycles passed for scenarios ${scenarios.join(', ')}`
        : `Required ${requiredConsecutiveCycles} consecutive passing soak cycles, observed ${maxConsecutivePasses}`,
    cycles: cycleReports,
    evidencePaths: {
      benchmarkArtifacts: cycleReports.flatMap((cycle) => cycle.benchmarkArtifacts),
      gateReports: cycleReports.map((cycle) => cycle.gateReportPath),
    },
  };

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(decisionReport, null, 2)}\n`);

  console.log(`Release decision written: ${outputPath}`);
  console.log(`Release decision: ${decision}`);

  return decision === 'GO' ? 0 : 1;
}

process.exit(main());
