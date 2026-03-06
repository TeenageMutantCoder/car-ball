import assert from "node:assert/strict";
import test from "node:test";

import { createRapierColliderSpecs, createRapierMaterialTable, createRapierShadowInitContext } from "./rapierColliders.ts";
import { createInitialWorldState } from "./state.ts";

test("rapier collider setup is deterministic and complete", () => {
  const world = createInitialWorldState({ playerIds: ["player-2", "player-1"] });

  const collidersA = createRapierColliderSpecs(world);
  const collidersB = createRapierColliderSpecs(world);

  assert.deepEqual(collidersA, collidersB);
  assert.equal(collidersA.length, 809);

  const ids = collidersA.map((collider) => collider.id);
  assert.equal(ids.includes("arena:ceiling"), true);
  assert.equal(ids.includes("arena:floor"), true);
  assert.equal(ids.includes("arena:wall-x-max"), true);
  assert.equal(ids.includes("arena:wall-x-min"), true);
  assert.equal(ids.includes("arena:wall-y-max"), true);
  assert.equal(ids.includes("arena:wall-y-min"), true);
  assert.equal(ids.includes("ball:main"), true);
  assert.equal(ids.includes("car:player-1"), true);
  assert.equal(ids.includes("car:player-2"), true);

  const ball = collidersA.find((collider) => collider.id === "ball:main");
  assert.ok(ball);
  assert.equal(ball.bodyType, "dynamic");
  assert.equal(ball.materialPreset, "ball-dynamic");
  assert.equal(ball.shape.kind, "sphere");

  const rampColliders = collidersA.filter((collider) => collider.id.startsWith("arena:ramp-"));
  assert.equal(rampColliders.length, 800);
  for (const rampCollider of rampColliders) {
    assert.equal(rampCollider.shape.kind, "cuboid");
    assert.ok(rampCollider.rotation);
  }
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

  assert.equal(initContext.colliders.length, 808);
  assert.equal(Object.keys(initContext.materials).length, 2);
});
