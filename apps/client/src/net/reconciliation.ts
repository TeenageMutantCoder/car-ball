import type { Vec3 } from "@car-ball/protocol";

const CM_PER_METER = 100;
const DEFAULT_TELEMETRY_WINDOW_MS = 60_000;

export interface CorrectionMetrics {
  correctionsPerMinuteWindow: number;
  averageMagnitudeCm: number;
  maxSpikeCm: number;
}

export interface CorrectionTelemetry {
  recordCorrection: (magnitudeCm: number, timestampMs: number) => CorrectionMetrics;
  getMetrics: (timestampMs: number) => CorrectionMetrics;
  reset: () => void;
}

interface CorrectionSample {
  timestampMs: number;
  magnitudeCm: number;
}

export function computePositionErrorCm(predicted: Vec3, authoritative: Vec3): number {
  return magnitude(subtractVec3(authoritative, predicted)) * CM_PER_METER;
}

export function computeVelocityError(predicted: Vec3, authoritative: Vec3): number {
  return magnitude(subtractVec3(authoritative, predicted));
}

export function shouldCorrect(positionErrorCm: number, deadzoneCm: number): boolean {
  const normalizedDeadzoneCm = Number.isFinite(deadzoneCm) ? Math.max(0, deadzoneCm) : 0;
  const normalizedErrorCm = Number.isFinite(positionErrorCm) ? Math.max(0, positionErrorCm) : 0;
  return normalizedErrorCm > normalizedDeadzoneCm;
}

export function applyCorrection(previous: Vec3, current: Vec3, alpha: number): Vec3 {
  const clampedAlpha = clampUnit(alpha);
  return {
    x: interpolateNumber(previous.x, current.x, clampedAlpha),
    y: interpolateNumber(previous.y, current.y, clampedAlpha),
    z: interpolateNumber(previous.z, current.z, clampedAlpha),
  };
}

export function createCorrectionTelemetry(windowMs = DEFAULT_TELEMETRY_WINDOW_MS): CorrectionTelemetry {
  const normalizedWindowMs = Number.isFinite(windowMs) ? Math.max(1, windowMs) : DEFAULT_TELEMETRY_WINDOW_MS;
  const samples: CorrectionSample[] = [];

  return {
    recordCorrection(magnitudeCm: number, timestampMs: number): CorrectionMetrics {
      const normalizedMagnitudeCm = Number.isFinite(magnitudeCm) ? Math.max(0, magnitudeCm) : 0;
      const normalizedTimestampMs = Number.isFinite(timestampMs) ? timestampMs : 0;

      samples.push({
        timestampMs: normalizedTimestampMs,
        magnitudeCm: normalizedMagnitudeCm,
      });

      pruneSamples(samples, normalizedTimestampMs, normalizedWindowMs);
      return computeMetrics(samples);
    },

    getMetrics(timestampMs: number): CorrectionMetrics {
      const normalizedTimestampMs = Number.isFinite(timestampMs) ? timestampMs : 0;
      pruneSamples(samples, normalizedTimestampMs, normalizedWindowMs);
      return computeMetrics(samples);
    },

    reset(): void {
      samples.length = 0;
    },
  };
}

function pruneSamples(samples: CorrectionSample[], nowMs: number, windowMs: number): void {
  const minTimestamp = nowMs - windowMs;
  while (samples.length > 0 && samples[0]!.timestampMs < minTimestamp) {
    samples.shift();
  }
}

function computeMetrics(samples: CorrectionSample[]): CorrectionMetrics {
  if (samples.length === 0) {
    return {
      correctionsPerMinuteWindow: 0,
      averageMagnitudeCm: 0,
      maxSpikeCm: 0,
    };
  }

  let magnitudeTotalCm = 0;
  let maxSpikeCm = 0;

  for (const sample of samples) {
    magnitudeTotalCm += sample.magnitudeCm;
    if (sample.magnitudeCm > maxSpikeCm) {
      maxSpikeCm = sample.magnitudeCm;
    }
  }

  return {
    correctionsPerMinuteWindow: samples.length,
    averageMagnitudeCm: magnitudeTotalCm / samples.length,
    maxSpikeCm,
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function interpolateNumber(previous: number, current: number, alpha: number): number {
  return previous + (current - previous) * alpha;
}

function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function magnitude(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}