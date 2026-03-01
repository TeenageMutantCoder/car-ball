import type { Vec3 } from "@car-ball/protocol";

export interface RapierShadowBackend {
  init(context: RapierShadowInitContext): void;
  step(dtSeconds: number): RapierShadowStepReport | undefined;
  reset(): void;
}

export type RapierMaterialPreset = "arena-static" | "ball-dynamic";

export type RapierColliderShape =
  | {
      kind: "cuboid";
      halfExtents: {
        x: number;
        y: number;
        z: number;
      };
    }
  | {
      kind: "sphere";
      radius: number;
    };

export interface RapierColliderSpec {
  id: string;
  bodyType: "fixed" | "dynamic";
  materialPreset: RapierMaterialPreset;
  translation: {
    x: number;
    y: number;
    z: number;
  };
  shape: RapierColliderShape;
}

export interface RapierMaterialSpec {
  friction: number;
  restitution: number;
}

export type RapierMaterialTable = Record<RapierMaterialPreset, RapierMaterialSpec>;

export interface RapierShadowInitContext {
  colliders: RapierColliderSpec[];
  materials: RapierMaterialTable;
}

export interface RapierShadowStepReport {
  contactCount?: number;
  maxPenetrationDepthCm?: number;
  authoritativeBallState?: {
    position: Vec3;
    velocity: Vec3;
  };
}

export interface RapierShadowConfig {
  enabled?: boolean;
  shadowMode?: boolean;
  ballAuthority?: boolean;
  initContext?: RapierShadowInitContext;
  createBackend?: () => RapierShadowBackend;
}

export interface RapierShadowMetrics {
  enabled: boolean;
  shadowMode: boolean;
  ballAuthority: boolean;
  initialized: boolean;
  colliderCount: number;
  materialPresetCount: number;
  stepCount: number;
  resetCount: number;
  lastStepDtSeconds: number | null;
  lastContactCount: number;
  contactCountTotal: number;
  maxPenetrationDepthCmP95Approx: number;
}

function createNoopBackend(): RapierShadowBackend {
  return {
    init(): void {
      return;
    },
    step(): undefined {
      return undefined;
    },
    reset(): void {
      return;
    }
  };
}

export class RapierShadowWorld {
  private readonly enabled: boolean;
  private readonly shadowMode: boolean;
  private readonly ballAuthority: boolean;
  private readonly backend: RapierShadowBackend;
  private readonly initContext: RapierShadowInitContext;
  private initialized = false;
  private colliderCount = 0;
  private materialPresetCount = 0;
  private stepCount = 0;
  private resetCount = 0;
  private lastStepDtSeconds: number | null = null;
  private lastContactCount = 0;
  private contactCountTotal = 0;
  private penetrationSamplesCm: number[] = [];

  constructor(config: RapierShadowConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.shadowMode = config.shadowMode ?? true;
    this.ballAuthority = config.ballAuthority ?? false;
    this.initContext = config.initContext ?? { colliders: [], materials: defaultMaterialTable() };
    this.backend = config.createBackend ? config.createBackend() : createNoopBackend();

    if (this.enabled) {
      this.backend.init(this.initContext);
      this.initialized = true;
      this.colliderCount = this.initContext.colliders.length;
      this.materialPresetCount = Object.keys(this.initContext.materials).length;
    }
  }

  step(dtSeconds: number): RapierShadowStepReport | undefined {
    if (!this.enabled || !this.initialized) {
      return undefined;
    }

    if (!this.shadowMode && !this.ballAuthority) {
      return undefined;
    }

    const report = this.backend.step(dtSeconds);
    this.stepCount += 1;
    this.lastStepDtSeconds = dtSeconds;

    if (report) {
      const contactCount = Math.max(0, Math.floor(report.contactCount ?? 0));
      const penetrationDepthCm = Math.max(0, report.maxPenetrationDepthCm ?? 0);
      this.lastContactCount = contactCount;
      this.contactCountTotal += contactCount;
      this.penetrationSamplesCm.push(penetrationDepthCm);
      if (this.penetrationSamplesCm.length > 256) {
        this.penetrationSamplesCm.shift();
      }
    }

    return report;
  }

  reset(): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    this.backend.reset();
    this.resetCount += 1;
    this.stepCount = 0;
    this.lastStepDtSeconds = null;
    this.lastContactCount = 0;
    this.contactCountTotal = 0;
    this.penetrationSamplesCm = [];
  }

  getMetrics(): RapierShadowMetrics {
    return {
      enabled: this.enabled,
      shadowMode: this.shadowMode,
      ballAuthority: this.ballAuthority,
      initialized: this.initialized,
      colliderCount: this.colliderCount,
      materialPresetCount: this.materialPresetCount,
      stepCount: this.stepCount,
      resetCount: this.resetCount,
      lastStepDtSeconds: this.lastStepDtSeconds,
      lastContactCount: this.lastContactCount,
      contactCountTotal: this.contactCountTotal,
      maxPenetrationDepthCmP95Approx: approximateP95(this.penetrationSamplesCm)
    };
  }
}

function defaultMaterialTable(): RapierMaterialTable {
  return {
    "arena-static": {
      friction: 0.65,
      restitution: 0.35
    },
    "ball-dynamic": {
      friction: 0.28,
      restitution: 0.72
    }
  };
}

function approximateP95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
}
