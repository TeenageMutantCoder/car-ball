import assert from "node:assert/strict";
import test from "node:test";

import { renderToSceneVector3 } from "./main.ts";

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
