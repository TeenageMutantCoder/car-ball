import assert from "node:assert/strict";
import test from "node:test";

import { createRapierColliderSpecs, createRapierMaterialTable, createRapierShadowInitContext } from "./rapierColliders.ts";
import { createInitialWorldState } from "./state.ts";

test("rapier collider setup is deterministic and complete", () => {
  const world = createInitialWorldState({ playerIds: ["player-2", "player-1"] });

  const collidersA = createRapierColliderSpecs(world);
  const collidersB = createRapierColliderSpecs(world);

  assert.deepEqual(collidersA, collidersB);
  assert.equal(collidersA.length, 7);

  const ids = collidersA.map((collider) => collider.id);
  assert.deepEqual(ids, [
    "arena:ceiling",
    "arena:floor",
    "arena:wall-x-max",
    "arena:wall-x-min",
    "arena:wall-y-max",
    "arena:wall-y-min",
    "ball:main"
  ]);

  const ball = collidersA.find((collider) => collider.id === "ball:main");
  assert.ok(ball);
  assert.equal(ball.bodyType, "dynamic");
  assert.equal(ball.materialPreset, "ball-dynamic");
  assert.equal(ball.shape.kind, "sphere");
});

test("rapier material table presets remain bounded", () => {
  const materials = createRapierMaterialTable();

  assert.deepEqual(Object.keys(materials).sort(), ["arena-static", "ball-dynamic"]);
  assert.equal(materials["arena-static"].friction > 0, true);
  assert.equal(materials["arena-static"].friction <= 1, true);
  assert.equal(materials["ball-dynamic"].restitution > 0, true);
  assert.equal(materials["ball-dynamic"].restitution <= 1, true);
});

test("shadow init context includes colliders and materials", () => {
  const world = createInitialWorldState({ playerIds: ["player-1"] });
  const initContext = createRapierShadowInitContext(world);

  assert.equal(initContext.colliders.length, 7);
  assert.equal(Object.keys(initContext.materials).length, 2);
});
