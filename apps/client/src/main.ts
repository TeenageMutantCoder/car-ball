import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
} from "@babylonjs/core";
import type { InputFrame, Snapshot } from "@car-ball/protocol";

import { createInputBindings, type InputBindings } from "./input/bindings.ts";
import { createInputFrameEmitter, type InputFrameEmitter } from "./input/frameEmitter.ts";
import { RendererBridge, type RenderSnapshotState } from "./render/rendererBridge.ts";

const INPUT_RATE_HZ = 60;
const INPUT_EMIT_INTERVAL_MS = 1_000 / INPUT_RATE_HZ;

export interface InputFrameContext {
  playerId: string;
  carId: string;
  getTick?: () => number;
}

export interface BabylonSceneBootstrapOptions {
  canvas: HTMLCanvasElement;
  rendererBridge?: RendererBridge;
  inputBindings?: InputBindings;
  inputFrameEmitter?: InputFrameEmitter;
  inputFrameContext?: InputFrameContext;
  onInputFrame?: (frame: InputFrame) => void;
  onFrame?: (context: { scene: Scene; deltaMs: number; rendererBridge: RendererBridge }) => void;
}

export interface BabylonSceneBootstrap {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  rendererBridge: RendererBridge;
  inputBindings: InputBindings;
  inputFrameEmitter: InputFrameEmitter;
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
  const inputBindings = options.inputBindings ?? createInputBindings();
  const inputFrameContext = options.inputFrameContext ?? {
    playerId: "player-1",
    carId: "car:player-1",
  };
  const inputFrameEmitter =
    options.inputFrameEmitter ??
    createInputFrameEmitter({
      playerId: inputFrameContext.playerId,
      carId: inputFrameContext.carId,
    });
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
  let inputTick = 1;
  let inputAccumulatorMs = 0;

  const renderTick = () => {
    const currentFrameTime = performance.now();
    const deltaMs = currentFrameTime - previousFrameTime;
    previousFrameTime = currentFrameTime;

    inputAccumulatorMs += deltaMs;
    while (inputAccumulatorMs >= INPUT_EMIT_INTERVAL_MS) {
      const tick = inputFrameContext.getTick?.() ?? inputTick;
      const inputFrame = inputFrameEmitter.emit(tick, inputBindings.getControls());
      rendererBridge.applyInputFrame(inputFrame);
      options.onInputFrame?.(inputFrame);

      inputAccumulatorMs -= INPUT_EMIT_INTERVAL_MS;
      inputTick += 1;
    }

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
    inputBindings,
    inputFrameEmitter,
    applySnapshot(snapshot: Snapshot): RenderSnapshotState {
      return rendererBridge.applySnapshot(snapshot);
    },
    start(): void {
      previousFrameTime = performance.now();
      inputAccumulatorMs = 0;
      engine.runRenderLoop(renderTick);
    },
    stop(): void {
      engine.stopRenderLoop(renderTick);
    },
    dispose(): void {
      engine.stopRenderLoop(renderTick);
      window.removeEventListener("resize", handleResize);
      inputBindings.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}