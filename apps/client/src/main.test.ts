import assert from "node:assert/strict";
import test from "node:test";

import { createNetworkInputTickResolver, renderToSceneVector3 } from "./main.ts";

test("renderToSceneVector3 keeps rendererBridge coordinates unchanged", () => {
  const renderPosition = { x: 11, y: 7, z: -3 };
  const scenePosition = renderToSceneVector3(renderPosition);

  assert.deepEqual(
    {
      x: scenePosition.x,
      y: scenePosition.y,
      z: scenePosition.z,
    },
    renderPosition,
  );
});

test("createNetworkInputTickResolver waits for authoritative snapshot tick", () => {
  let latestSnapshotTick: number | undefined;
  const resolveTick = createNetworkInputTickResolver(() => latestSnapshotTick, 2);

  assert.equal(resolveTick(), null);

  latestSnapshotTick = 100;
  assert.equal(resolveTick(), 102);
  assert.equal(resolveTick(), 104);
});

test("createNetworkInputTickResolver re-bases when authoritative tick jumps ahead", () => {
  let latestSnapshotTick = 20;
  const resolveTick = createNetworkInputTickResolver(() => latestSnapshotTick, 2);

  assert.equal(resolveTick(), 22);
  assert.equal(resolveTick(), 24);

  latestSnapshotTick = 40;
  assert.equal(resolveTick(), 42);
  assert.equal(resolveTick(), 44);
});

test("createNetworkInputTickResolver re-bases when authoritative tick resets after restart", () => {
  let latestSnapshotTick = 100;
  const resolveTick = createNetworkInputTickResolver(() => latestSnapshotTick, 2);

  assert.equal(resolveTick(), 102);
  assert.equal(resolveTick(), 104);

  latestSnapshotTick = 0;
  assert.equal(resolveTick(), 2);
  assert.equal(resolveTick(), 4);
});
