export {};

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

type GateFailure = {
  metric: string;
  operator: '<=' | '<';
  threshold: number;
  actual: number;
};

type ArtifactGateResult = {
  artifactPath: string;
  benchmarkId: string;
  scenario: Scenario;
  networkProfile: NetworkProfile;
  pass: boolean;
  failedMetrics: GateFailure[];
};

type SloGateReport = {
  schemaVersion: 1;
  generatedAtIso: string;
  thresholdsSource: string;
  inputs: {
    artifactsDir: string;
    artifactCount: number;
  };
  summary: {
    pass: boolean;
    passedArtifacts: number;
    failedArtifacts: number;
  };
  results: ArtifactGateResult[];
};

type Threshold = {
  metric: keyof BenchmarkArtifact['sloResults'];
  operator: '<=' | '<';
  threshold: number;
  appliesTo?: (artifact: BenchmarkArtifact) => boolean;
};

const THRESHOLDS_SOURCE = 'docs/implementation-plan-parallel.md#8.1';

const THRESHOLDS: Threshold[] = [
  { metric: 'frameP95Ms', operator: '<=', threshold: 16.7 },
  { metric: 'physicsP95Ms', operator: '<=', threshold: 6 },
  { metric: 'renderP95Ms', operator: '<=', threshold: 9 },
  { metric: 'serverTickP95Ms', operator: '<=', threshold: 8.3 },
  { metric: 'serverTickP99Ms', operator: '<=', threshold: 12 },
  { metric: 'missedTickRatePct', operator: '<', threshold: 0.5 },
  {
    metric: 'correctionsPerMinPerPlayer',
    operator: '<=',
    threshold: 12,
    appliesTo: (artifact) => artifact.networkProfile === 'clean',
  },
  {
    metric: 'correctionsPerMinPerPlayer',
    operator: '<=',
    threshold: 30,
    appliesTo: (artifact) => artifact.networkProfile === 'loss_5pct',
  },
  { metric: 'correctionMagnitudeCmP95', operator: '<=', threshold: 20 },
  { metric: 'correctionMagnitudeCmP99', operator: '<=', threshold: 60 },
  { metric: 'correctionMagnitudeCmMax', operator: '<=', threshold: 120 },
  { metric: 'replayDriftRatePct', operator: '<=', threshold: 0.5 },
  { metric: 'replayEndDriftCarCm', operator: '<=', threshold: 15 },
  { metric: 'replayEndDriftBallCm', operator: '<=', threshold: 25 },
  { metric: 'clientLongTasksOver50MsPer10Min', operator: '<=', threshold: 3 },
  { metric: 'clientHeapGrowthMbPer10Min', operator: '<=', threshold: 5 },
  { metric: 'serverRssGrowthPct', operator: '<=', threshold: 8 },
];

function parseArgs(argv: string[]): {
  artifactsDir: string;
  outputPath: string;
  sampleIfEmpty: boolean;
} {
  let artifactsDir = 'artifacts/benchmarks';
  let outputPath = 'artifacts/gates/slo-gate-report.json';
  let sampleIfEmpty = false;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifacts-dir') {
      artifactsDir = argv[index + 1] || artifactsDir;
      index += 1;
      continue;
    }
    if (arg === '--output') {
      outputPath = argv[index + 1] || outputPath;
      index += 1;
      continue;
    }
    if (arg === '--sample-if-empty') {
      sampleIfEmpty = true;
    }
  }

  return { artifactsDir, outputPath, sampleIfEmpty };
}

function collectJsonFilesRecursively(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];

  const rootStats = fs.statSync(rootDir);
  if (!rootStats.isDirectory()) return [];

  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current);
    for (const entry of entries) {
      const next = path.join(current, entry);
      const stats = fs.statSync(next);
      if (stats.isDirectory()) {
        stack.push(next);
      } else if (entry.endsWith('.json')) {
        files.push(next);
      }
    }
  }

  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function evaluateArtifact(artifactPath: string, artifact: BenchmarkArtifact): ArtifactGateResult {
  const failedMetrics: GateFailure[] = [];

  for (const thresholdRule of THRESHOLDS) {
    if (thresholdRule.appliesTo && !thresholdRule.appliesTo(artifact)) {
      continue;
    }

    const actual = artifact.sloResults[thresholdRule.metric];
    const passes =
      thresholdRule.operator === '<='
        ? actual <= thresholdRule.threshold
        : actual < thresholdRule.threshold;

    if (!passes) {
      failedMetrics.push({
        metric: thresholdRule.metric,
        operator: thresholdRule.operator,
        threshold: thresholdRule.threshold,
        actual,
      });
    }
  }

  return {
    artifactPath,
    benchmarkId: artifact.benchmarkId,
    scenario: artifact.scenario,
    networkProfile: artifact.networkProfile,
    pass: failedMetrics.length === 0,
    failedMetrics,
  };
}

function createSampleArtifact(artifactsDir: string): BenchmarkArtifact {
  return {
    benchmarkId: 'sample-baseline-1v1-clean',
    runAtIso: new Date().toISOString(),
    gitCommit: 'sample',
    scenario: '1v1',
    durationMinutes: 2,
    browser: 'chrome',
    networkProfile: 'clean',
    constants: {
      tickRateHz: 120,
      snapshotRateHz: 20,
      inputRateHz: 60,
      maxSubsteps: 4,
      reconcileThresholdCm: 20,
    },
    sloResults: {
      frameP95Ms: 14.9,
      physicsP95Ms: 4.4,
      renderP95Ms: 7.3,
      serverTickP95Ms: 6.2,
      serverTickP99Ms: 9.8,
      missedTickRatePct: 0.2,
      correctionsPerMinPerPlayer: 8,
      correctionMagnitudeCmP95: 14,
      correctionMagnitudeCmP99: 32,
      correctionMagnitudeCmMax: 80,
      replayDriftRatePct: 0.2,
      replayEndDriftCarCm: 8,
      replayEndDriftBallCm: 12,
      clientLongTasksOver50MsPer10Min: 1,
      clientHeapGrowthMbPer10Min: 2,
      serverRssGrowthPct: 3,
    },
  };
}

function main(): number {
  const { artifactsDir, outputPath, sampleIfEmpty } = parseArgs(process.argv);

  const resolvedArtifactsDir = path.resolve(process.cwd(), artifactsDir);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);

  let artifactFiles = collectJsonFilesRecursively(resolvedArtifactsDir);

  if (artifactFiles.length === 0 && sampleIfEmpty) {
    fs.mkdirSync(resolvedArtifactsDir, { recursive: true });
    const samplePath = path.join(resolvedArtifactsDir, 'sample-benchmark-artifact.json');
    const sampleArtifact = createSampleArtifact(resolvedArtifactsDir);
    fs.writeFileSync(samplePath, `${JSON.stringify(sampleArtifact, null, 2)}\n`);
    artifactFiles = [samplePath];
  }

  if (artifactFiles.length === 0) {
    console.error(`No benchmark artifacts found in ${artifactsDir}`);
    console.error('Tip: run with --sample-if-empty or generate artifacts via soak:check.');
    return 2;
  }

  const results: ArtifactGateResult[] = [];

  for (const artifactPath of artifactFiles) {
    let parsed: BenchmarkArtifact;
    try {
      parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as BenchmarkArtifact;
    } catch (error) {
      console.error(`Failed to parse artifact JSON: ${artifactPath}`);
      console.error(String(error));
      return 2;
    }

    results.push(evaluateArtifact(path.relative(process.cwd(), artifactPath), parsed));
  }

  const failedArtifacts = results.filter((result) => !result.pass).length;
  const report: SloGateReport = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    thresholdsSource: THRESHOLDS_SOURCE,
    inputs: {
      artifactsDir,
      artifactCount: results.length,
    },
    summary: {
      pass: failedArtifacts === 0,
      passedArtifacts: results.length - failedArtifacts,
      failedArtifacts,
    },
    results,
  };

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`SLO gate report written: ${outputPath}`);
  console.log(
    `SLO gate status: ${report.summary.pass ? 'PASS' : 'FAIL'} (${report.summary.passedArtifacts}/${report.inputs.artifactCount} passing artifacts)`,
  );

  return report.summary.pass ? 0 : 1;
}

process.exit(main());
