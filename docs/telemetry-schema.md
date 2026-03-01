# Telemetry Schema (G0 Freeze)

Status: FROZEN_FOR_MVP
EffectiveDate: 2026-02-28
Owner: WS-G-001

## Common Event Envelope

```yaml
telemetryEnvelope:
  required:
    schemaVersion: 1
    tsMs: integer
    source: enum(client|server|sim)
    sessionId: string
    matchId: string
```

## Required Client Metrics

```yaml
clientMetrics:
  required:
    frameTimeMs: number
    physicsTimeMs: number
    renderTimeMs: number
    fps: number
    pingRttMs: number
    correctionCount: integer
    correctionMagnitudeCmP95: number
  units:
    frameTimeMs: ms
    physicsTimeMs: ms
    renderTimeMs: ms
    fps: frames_per_second
    pingRttMs: ms
    correctionCount: count_per_min_per_player
    correctionMagnitudeCmP95: cm
```

## Required Server Metrics

```yaml
serverMetrics:
  required:
    tickDurationP95Ms: number
    tickDurationP99Ms: number
    missedTickRatePct: number
    roomCount: integer
    inboundPacketsPerSec: number
    outboundPacketsPerSec: number
  units:
    tickDurationP95Ms: ms
    tickDurationP99Ms: ms
    missedTickRatePct: percent
    roomCount: count
    inboundPacketsPerSec: packets_per_second
    outboundPacketsPerSec: packets_per_second
```

## Required Simulation Metrics

```yaml
simMetrics:
  required:
    tickRateHz: number
    substepsPerFrameP95: number
    droppedAccumulatorMsTotal: number
    replayDriftRatePct: number
    replayEndDriftCarCm: number
    replayEndDriftBallCm: number
  units:
    tickRateHz: hz
    substepsPerFrameP95: count
    droppedAccumulatorMsTotal: ms
    replayDriftRatePct: percent
    replayEndDriftCarCm: cm
    replayEndDriftBallCm: cm
```

## Minimum Benchmark Artifact Fields

```yaml
benchmarkArtifact:
  required:
    benchmarkId: string
    runAtIso: string
    gitCommit: string
    scenario: enum(1v1|2v2)
    durationMinutes: number
    browser: string
    networkProfile: enum(clean|loss_5pct|jitter)
    constants:
      tickRateHz: number
      snapshotRateHz: number
      inputRateHz: number
      maxSubsteps: number
      reconcileThresholdCm: number
    sloResults:
      frameP95Ms: number
      physicsP95Ms: number
      renderP95Ms: number
      serverTickP95Ms: number
      serverTickP99Ms: number
      correctionsPerMinPerPlayer: number
      correctionMagnitudeCmP95: number
      replayDriftRatePct: number
      pass: boolean
```
