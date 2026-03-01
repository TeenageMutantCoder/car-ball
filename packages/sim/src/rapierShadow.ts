export interface RapierShadowBackend {
  init(): void;
  step(dtSeconds: number): void;
  reset(): void;
}

export interface RapierShadowConfig {
  enabled?: boolean;
  shadowMode?: boolean;
  createBackend?: () => RapierShadowBackend;
}

export interface RapierShadowMetrics {
  enabled: boolean;
  shadowMode: boolean;
  initialized: boolean;
  stepCount: number;
  resetCount: number;
  lastStepDtSeconds: number | null;
}

function createNoopBackend(): RapierShadowBackend {
  return {
    init(): void {
      return;
    },
    step(): void {
      return;
    },
    reset(): void {
      return;
    }
  };
}

export class RapierShadowWorld {
  private readonly enabled: boolean;
  private readonly shadowMode: boolean;
  private readonly backend: RapierShadowBackend;
  private initialized = false;
  private stepCount = 0;
  private resetCount = 0;
  private lastStepDtSeconds: number | null = null;

  constructor(config: RapierShadowConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.shadowMode = config.shadowMode ?? true;
    this.backend = config.createBackend ? config.createBackend() : createNoopBackend();

    if (this.enabled) {
      this.backend.init();
      this.initialized = true;
    }
  }

  step(dtSeconds: number): void {
    if (!this.enabled || !this.shadowMode || !this.initialized) {
      return;
    }

    this.backend.step(dtSeconds);
    this.stepCount += 1;
    this.lastStepDtSeconds = dtSeconds;
  }

  reset(): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    this.backend.reset();
    this.resetCount += 1;
    this.stepCount = 0;
    this.lastStepDtSeconds = null;
  }

  getMetrics(): RapierShadowMetrics {
    return {
      enabled: this.enabled,
      shadowMode: this.shadowMode,
      initialized: this.initialized,
      stepCount: this.stepCount,
      resetCount: this.resetCount,
      lastStepDtSeconds: this.lastStepDtSeconds
    };
  }
}
