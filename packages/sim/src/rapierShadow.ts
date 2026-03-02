import type { Vec3 } from "@car-ball/protocol";
import type { default as RAPIER } from "@dimforge/rapier3d";

let rapierModulePromise: Promise<typeof RAPIER> | null = null;

async function getRapierModule(): Promise<typeof RAPIER> {
  if (!rapierModulePromise) {
    rapierModulePromise = (async () => {
      const imported = await import("@dimforge/rapier3d-compat");
      await imported.default.init();
      return imported.default as typeof RAPIER;
    })();
  }

  return rapierModulePromise;
}

export interface RapierShadowBackend {
  init(context: RapierShadowInitContext): void;
  step(dtSeconds: number, context?: RapierShadowStepContext): RapierShadowStepReport | undefined;
  reset(): void;
  syncAuthoritativeBallState?(state: RapierAuthoritativeBallState): void;
  getStatus?(): {
    ready: boolean;
    error: string | null;
  };
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
  bodyType: "fixed" | "dynamic" | "kinematic-position";
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

export interface RapierShadowStepContext {
  kinematicBodies?: {
    id: string;
    translation: {
      x: number;
      y: number;
      z: number;
    };
  }[];
}

export interface RapierAuthoritativeBallState {
  position: Vec3;
  velocity: Vec3;
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
  backend: "rapier" | "custom";
  backendReady: boolean;
  backendError: string | null;
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
    },
    syncAuthoritativeBallState(): void {
      return;
    }
  };
}

class RapierCompatBackend implements RapierShadowBackend {
  private context: RapierShadowInitContext | null = null;
  private world: RAPIER.World | null = null;
  private ballBody: RAPIER.RigidBody | null = null;
  private ballCollider: RAPIER.Collider | null = null;
  private readonly kinematicBodies = new Map<string, RAPIER.RigidBody>();
  private ready = false;
  private error: string | null = null;
  private initializePromise: Promise<void> | null = null;

  init(context: RapierShadowInitContext): void {
    this.context = context;
    this.error = null;

    if (this.initializePromise) {
      return;
    }

    this.initializePromise = this.initializeWorld(context)
      .then(() => {
        this.ready = true;
      })
      .catch((error: unknown) => {
        this.ready = false;
        this.world = null;
        this.ballBody = null;
        this.ballCollider = null;
        this.error = error instanceof Error ? error.message : String(error);
      });
  }

  step(dtSeconds: number, context?: RapierShadowStepContext): RapierShadowStepReport | undefined {
    if (!this.ready || !this.world) {
      return undefined;
    }

    this.syncKinematicBodies(context);

    if (typeof this.world.timestep === "number") {
      this.world.timestep = dtSeconds;
    } else if (this.world.integrationParameters && typeof this.world.integrationParameters.dt === "number") {
      this.world.integrationParameters.dt = dtSeconds;
    }

    this.world.step();

    const report: RapierShadowStepReport = {
      contactCount: this.countBallContacts(),
      maxPenetrationDepthCm: 0
    };

    if (this.ballBody && typeof this.ballBody.translation === "function" && typeof this.ballBody.linvel === "function") {
      const position = this.ballBody.translation();
      const velocity = this.ballBody.linvel();

      if (isFiniteVec3(position) && isFiniteVec3(velocity)) {
        report.authoritativeBallState = {
          position: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          velocity: {
            x: velocity.x,
            y: velocity.y,
            z: velocity.z
          }
        };
      }
    }

    return report;
  }

  reset(): void {
    this.ready = false;
    this.error = null;
    this.world = null;
    this.ballBody = null;
    this.ballCollider = null;
    this.kinematicBodies.clear();
    this.initializePromise = null;

    if (this.context) {
      this.init(this.context);
    }
  }

  syncAuthoritativeBallState(state: RapierAuthoritativeBallState): void {
    if (!this.ready || !this.ballBody) {
      return;
    }

    const translation = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z
    };

    const linearVelocity = {
      x: state.velocity.x,
      y: state.velocity.y,
      z: state.velocity.z
    };

    if (typeof this.ballBody.setTranslation === "function") {
      this.ballBody.setTranslation(translation, true);
    }

    if (typeof this.ballBody.setLinvel === "function") {
      this.ballBody.setLinvel(linearVelocity, true);
    }

    if (typeof this.ballBody.setAngvel === "function") {
      this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    if (typeof this.ballBody.wakeUp === "function") {
      this.ballBody.wakeUp();
    }
  }

  getStatus(): { ready: boolean; error: string | null } {
    return {
      ready: this.ready,
      error: this.error
    };
  }

  private async initializeWorld(context: RapierShadowInitContext): Promise<void> {
    const rapier = await getRapierModule();

    const world = new rapier.World({ x: 0, y: 0, z: -9.81 });
    this.world = world;

    for (const collider of context.colliders) {
      const bodyDesc =
        collider.bodyType === "dynamic"
          ? rapier.RigidBodyDesc.dynamic()
          : collider.bodyType === "kinematic-position"
            ? rapier.RigidBodyDesc.kinematicPositionBased()
            : rapier.RigidBodyDesc.fixed();

      if (typeof bodyDesc.setTranslation === "function") {
        bodyDesc.setTranslation(collider.translation.x, collider.translation.y, collider.translation.z);
      }

      const body = world.createRigidBody(bodyDesc);

      const colliderDesc =
        collider.shape.kind === "sphere"
          ? rapier.ColliderDesc.ball(collider.shape.radius)
          : rapier.ColliderDesc.cuboid(
              collider.shape.halfExtents.x,
              collider.shape.halfExtents.y,
              collider.shape.halfExtents.z
            );

      const material = context.materials[collider.materialPreset];
      if (material) {
        if (typeof colliderDesc.setFriction === "function") {
          colliderDesc.setFriction(material.friction);
        }
        if (typeof colliderDesc.setRestitution === "function") {
          colliderDesc.setRestitution(material.restitution);
        }
      }

      const createdCollider = world.createCollider(colliderDesc, body);

      if (collider.id.startsWith("ball:")) {
        this.ballBody = body;
        this.ballCollider = createdCollider;
      } else if (collider.bodyType === "kinematic-position") {
        this.kinematicBodies.set(collider.id, body);
      }
    }
  }

  private syncKinematicBodies(context?: RapierShadowStepContext): void {
    if (!context?.kinematicBodies || context.kinematicBodies.length === 0) {
      return;
    }

    for (const bodyState of context.kinematicBodies) {
      const body = this.kinematicBodies.get(bodyState.id);
      if (!body) {
        continue;
      }

      if (typeof body.setNextKinematicTranslation === "function") {
        body.setNextKinematicTranslation(bodyState.translation);
      } else if (typeof body.setTranslation === "function") {
        body.setTranslation(bodyState.translation, true);
      }
    }
  }

  private countBallContacts(): number {
    if (!this.world || !this.ballCollider) {
      return 0;
    }

    if (typeof this.world.contactPairsWith !== "function") {
      return 0;
    }

    let count = 0;
    this.world.contactPairsWith(this.ballCollider, () => {
      count += 1;
    });

    return count;
  }
}

export class RapierShadowWorld {
  private readonly enabled: boolean;
  private readonly shadowMode: boolean;
  private readonly ballAuthority: boolean;
  private readonly backendType: "rapier" | "custom";
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
    this.backendType = config.createBackend ? "custom" : "rapier";
    this.backend = config.createBackend ? config.createBackend() : new RapierCompatBackend();

    if (this.enabled) {
      this.backend.init(this.initContext);
      this.initialized = true;
      this.colliderCount = this.initContext.colliders.length;
      this.materialPresetCount = Object.keys(this.initContext.materials).length;
    }
  }

  step(dtSeconds: number, context?: RapierShadowStepContext): RapierShadowStepReport | undefined {
    if (!this.enabled || !this.initialized) {
      return undefined;
    }

    if (!this.shadowMode && !this.ballAuthority) {
      return undefined;
    }

    const report = this.backend.step(dtSeconds, context);
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

  syncAuthoritativeBallState(state: RapierAuthoritativeBallState): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    this.backend.syncAuthoritativeBallState?.(state);
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
    const backendStatus = this.backend.getStatus?.() ?? { ready: false, error: null };

    return {
      enabled: this.enabled,
      shadowMode: this.shadowMode,
      ballAuthority: this.ballAuthority,
      backend: this.backendType,
      backendReady: backendStatus.ready,
      backendError: backendStatus.error,
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

function isFiniteVec3(value: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
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
