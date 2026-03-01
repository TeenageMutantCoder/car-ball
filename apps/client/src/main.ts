import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
} from "@babylonjs/core";
import type { Snapshot } from "@car-ball/protocol";

import { RendererBridge, type RenderSnapshotState } from "./render/rendererBridge.ts";

export interface BabylonSceneBootstrapOptions {
  canvas: HTMLCanvasElement;
  rendererBridge?: RendererBridge;
  onFrame?: (context: { scene: Scene; deltaMs: number; rendererBridge: RendererBridge }) => void;
}

export interface BabylonSceneBootstrap {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  rendererBridge: RendererBridge;
  applySnapshot: (snapshot: Snapshot) => RenderSnapshotState;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export function bootstrapBabylonScene(options: BabylonSceneBootstrapOptions): BabylonSceneBootstrap {
  if (typeof window === "undefined") {
    throw new Error("bootstrapBabylonScene is browser-only and requires window.");
  }

  const rendererBridge = options.rendererBridge ?? new RendererBridge();
  const engine = new Engine(options.canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 24, Vector3.Zero(), scene);
  camera.attachControl(options.canvas, true);

  const light = new HemisphericLight("sun", new Vector3(0, 1, 0), scene);
  light.intensity = 0.95;

  const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 26 }, scene);
  ground.position.y = -0.5;

  MeshBuilder.CreateSphere("ball", { diameter: 1.2 }, scene);

  let previousFrameTime = performance.now();

  const renderTick = () => {
    const currentFrameTime = performance.now();
    const deltaMs = currentFrameTime - previousFrameTime;
    previousFrameTime = currentFrameTime;

    options.onFrame?.({ scene, deltaMs, rendererBridge });
    scene.render();
  };

  const handleResize = () => {
    engine.resize();
  };

  window.addEventListener("resize", handleResize);

  return {
    engine,
    scene,
    camera,
    rendererBridge,
    applySnapshot(snapshot: Snapshot): RenderSnapshotState {
      return rendererBridge.applySnapshot(snapshot);
    },
    start(): void {
      previousFrameTime = performance.now();
      engine.runRenderLoop(renderTick);
    },
    stop(): void {
      engine.stopRenderLoop(renderTick);
    },
    dispose(): void {
      engine.stopRenderLoop(renderTick);
      window.removeEventListener("resize", handleResize);
      scene.dispose();
      engine.dispose();
    },
  };
}