export interface DebugHudMetrics {
  fps: number;
  frameTimeMs: number;
  correctionCount: number;
  pingMs: number;
}

export interface CreateDebugHudOptions {
  initialMetrics?: Partial<DebugHudMetrics>;
}

export interface DebugHud {
  getMetrics: () => Readonly<DebugHudMetrics>;
  updateFrame: (frameTimeMs: number) => Readonly<DebugHudMetrics>;
  setFrameTimeMs: (frameTimeMs: number) => Readonly<DebugHudMetrics>;
  setFps: (fps: number) => Readonly<DebugHudMetrics>;
  setPingMs: (pingMs: number) => Readonly<DebugHudMetrics>;
  incrementCorrectionCount: (count?: number) => Readonly<DebugHudMetrics>;
  setCorrectionCount: (count: number) => Readonly<DebugHudMetrics>;
  reset: (metrics?: Partial<DebugHudMetrics>) => Readonly<DebugHudMetrics>;
}

const DEFAULT_METRICS: DebugHudMetrics = {
  fps: 0,
  frameTimeMs: 0,
  correctionCount: 0,
  pingMs: 0,
};

function sanitizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function clampNonNegative(value: number): number {
  return Math.max(0, sanitizeNumber(value));
}

function withDefaults(metrics?: Partial<DebugHudMetrics>): DebugHudMetrics {
  return {
    fps: clampNonNegative(metrics?.fps ?? DEFAULT_METRICS.fps),
    frameTimeMs: clampNonNegative(metrics?.frameTimeMs ?? DEFAULT_METRICS.frameTimeMs),
    correctionCount: clampNonNegative(metrics?.correctionCount ?? DEFAULT_METRICS.correctionCount),
    pingMs: clampNonNegative(metrics?.pingMs ?? DEFAULT_METRICS.pingMs),
  };
}

export function createDebugHud(options: CreateDebugHudOptions = {}): DebugHud {
  let metrics = withDefaults(options.initialMetrics);

  const snapshot = (): Readonly<DebugHudMetrics> => ({ ...metrics });

  return {
    getMetrics(): Readonly<DebugHudMetrics> {
      return snapshot();
    },
    updateFrame(frameTimeMs: number): Readonly<DebugHudMetrics> {
      const nextFrameTimeMs = clampNonNegative(frameTimeMs);
      metrics = {
        ...metrics,
        frameTimeMs: nextFrameTimeMs,
        fps: nextFrameTimeMs <= 0 ? 0 : 1_000 / nextFrameTimeMs,
      };

      return snapshot();
    },
    setFrameTimeMs(frameTimeMs: number): Readonly<DebugHudMetrics> {
      metrics = {
        ...metrics,
        frameTimeMs: clampNonNegative(frameTimeMs),
      };

      return snapshot();
    },
    setFps(fps: number): Readonly<DebugHudMetrics> {
      metrics = {
        ...metrics,
        fps: clampNonNegative(fps),
      };

      return snapshot();
    },
    setPingMs(pingMs: number): Readonly<DebugHudMetrics> {
      metrics = {
        ...metrics,
        pingMs: clampNonNegative(pingMs),
      };

      return snapshot();
    },
    incrementCorrectionCount(count = 1): Readonly<DebugHudMetrics> {
      metrics = {
        ...metrics,
        correctionCount: clampNonNegative(metrics.correctionCount + clampNonNegative(count)),
      };

      return snapshot();
    },
    setCorrectionCount(count: number): Readonly<DebugHudMetrics> {
      metrics = {
        ...metrics,
        correctionCount: clampNonNegative(count),
      };

      return snapshot();
    },
    reset(nextMetrics: Partial<DebugHudMetrics> = {}): Readonly<DebugHudMetrics> {
      metrics = withDefaults(nextMetrics);
      return snapshot();
    },
  };
}
