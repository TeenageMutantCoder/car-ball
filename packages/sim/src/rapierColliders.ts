import type { WorldState } from "./state.ts";
import {
  ARENA_WALL_THICKNESS,
  DEFAULT_CAR_HALF_EXTENTS,
  createRoundedArenaWallLayout
} from "./constants.ts";
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

  const wallThickness = ARENA_WALL_THICKNESS;
  const halfX = Math.max(0.1, (max.x - min.x) / 2);
  const halfY = Math.max(0.1, (max.y - min.y) / 2);
  const halfZ = Math.max(0.1, (max.z - min.z) / 2);
  const roundedWallLayout = createRoundedArenaWallLayout(world.arena.bounds, wallThickness);

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

  for (const straightWall of roundedWallLayout.straightWalls) {
    colliders.push({
      id: straightWall.id,
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: straightWall.center.x,
        y: straightWall.center.y,
        z: straightWall.center.z
      },
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: straightWall.size.x / 2,
          y: straightWall.size.y / 2,
          z: straightWall.size.z / 2
        }
      }
    });
  }

  for (const rampPanel of roundedWallLayout.rampPanels) {
    const halfAngle = rampPanel.rotationAngleRadians / 2;
    const sinHalf = Math.sin(halfAngle);
    const cosHalf = Math.cos(halfAngle);
    const rotation =
      rampPanel.rotationAxis === "x"
        ? { x: sinHalf, y: 0, z: 0, w: cosHalf }
        : rampPanel.rotationAxis === "y"
          ? { x: 0, y: sinHalf, z: 0, w: cosHalf }
          : { x: 0, y: 0, z: sinHalf, w: cosHalf };

    colliders.push({
      id: rampPanel.id,
      bodyType: "fixed",
      materialPreset: "arena-static",
      translation: {
        x: rampPanel.center.x,
        y: rampPanel.center.y,
        z: rampPanel.center.z
      },
      rotation,
      shape: {
        kind: "cuboid",
        halfExtents: {
          x: rampPanel.size.x / 2,
          y: rampPanel.size.y / 2,
          z: rampPanel.size.z / 2
        }
      }
    });
  }

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
