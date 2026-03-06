import type { WorldState } from "./state.ts";
import { DEFAULT_CAR_HALF_EXTENTS } from "./constants.ts";
import type { RapierColliderSpec, RapierMaterialTable, RapierShadowInitContext } from "./rapierShadow.ts";

export const DEFAULT_BALL_COLLIDER_RADIUS = 0.6;
export const DEFAULT_CAR_PROXY_HALF_EXTENTS = DEFAULT_CAR_HALF_EXTENTS;

export function createRapierMaterialTable(): RapierMaterialTable {
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

export function createRapierColliderSpecs(world: WorldState): RapierColliderSpec[] {
  const { min, max } = world.arena.bounds;
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2
  };

  const wallThickness = 0.1;
  const halfX = Math.max(0.1, (max.x - min.x) / 2);
  const halfY = Math.max(0.1, (max.y - min.y) / 2);
  const halfZ = Math.max(0.1, (max.z - min.z) / 2);

  const colliders: RapierColliderSpec[] = [
    {
      id: "arena:floor",
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: center.x,
        y: center.y,
        z: min.z - wallThickness / 2
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: halfX,
          y: halfY,
          z: wallThickness / 2
        }
      }
    },
    {
      id: "arena:ceiling",
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: center.x,
        y: center.y,
        z: max.z + wallThickness / 2
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: halfX,
          y: halfY,
          z: wallThickness / 2
        }
      }
    },
    {
      id: "arena:wall-x-min",
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: min.x - wallThickness / 2,
        y: center.y,
        z: center.z
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: wallThickness / 2,
          y: halfY,
          z: halfZ
        }
      }
    },
    {
      id: "arena:wall-x-max",
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: max.x + wallThickness / 2,
        y: center.y,
        z: center.z
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: wallThickness / 2,
          y: halfY,
          z: halfZ
        }
      }
    },
    {
      id: "arena:wall-y-min",
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: center.x,
        y: min.y - wallThickness / 2,
        z: center.z
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: halfX,
          y: wallThickness / 2,
          z: halfZ
        }
      }
    },
    {
      id: "arena:wall-y-max",
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: center.x,
        y: max.y + wallThickness / 2,
        z: center.z
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: halfX,
          y: wallThickness / 2,
          z: halfZ
        }
      }
    },
    {
      id: world.ball.id,
      bodyType: "dynamic",
      materialPreset: "ball-dynamic",
      translation: {
        x: world.ball.position.x,
        y: world.ball.position.y,
        z: world.ball.position.z
      },
      shape: {
        kind: "sphere",
        radius: DEFAULT_BALL_COLLIDER_RADIUS
      }
    }
  ];

  for (const car of Object.values(world.cars)) {
    colliders.push({
      id: car.id,
      bodyType: "kinematic-position",
      materialPreset: "arena-static",
      translation: {
        x: car.position.x,
        y: car.position.y,
        z: car.position.z
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: DEFAULT_CAR_PROXY_HALF_EXTENTS.x,
          y: DEFAULT_CAR_PROXY_HALF_EXTENTS.y,
          z: DEFAULT_CAR_PROXY_HALF_EXTENTS.z
        }
      }
    });
  }

  return colliders.sort((left, right) => left.id.localeCompare(right.id));
}

export function createRapierShadowInitContext(world: WorldState): RapierShadowInitContext {
  return {
    colliders: createRapierColliderSpecs(world),
    materials: createRapierMaterialTable()
  };
}
