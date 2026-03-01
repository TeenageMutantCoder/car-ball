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
import { createLiveClientNet, type LiveClientNet } from "./net/live.ts";
import { createPredictionHistory, type PredictionHistory } from "./net/prediction.ts";
import {
  createWebSocketClientTransport,
  type WebSocketClientTransport,
} from "./net/websocket.ts";
import {
  createCameraController,
  resolveCameraPose,
  type CameraMode,
} from "./render/camera.ts";
import { RendererBridge, type RenderSnapshotState } from "./render/rendererBridge.ts";
import { createDebugHud, type DebugHud } from "./debug/hud.ts";

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
  debugHud?: DebugHud;
  inputBindings?: InputBindings;
  inputFrameEmitter?: InputFrameEmitter;
  predictionHistory?: PredictionHistory;
  inputFrameContext?: InputFrameContext;
  initialCameraMode?: CameraMode;
  onInputFrame?: (frame: InputFrame) => void;
  onFrame?: (context: { scene: Scene; deltaMs: number; rendererBridge: RendererBridge }) => void;
}

export interface BabylonSceneBootstrap {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  rendererBridge: RendererBridge;
  debugHud: DebugHud;
  inputBindings: InputBindings;
  inputFrameEmitter: InputFrameEmitter;
  predictionHistory: PredictionHistory;
  getCameraMode: () => CameraMode;
  setCameraMode: (mode: CameraMode) => CameraMode;
  toggleCamera: () => CameraMode;
  applySnapshot: (snapshot: Snapshot) => RenderSnapshotState;
  getRenderSnapshot: (alpha: number) => RenderSnapshotState | null;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export interface NetworkedBabylonSceneBootstrapOptions extends BabylonSceneBootstrapOptions {
  websocketUrl: string;
  websocketProtocols?: string | string[];
  reconnectThresholdCm?: number;
}

export interface NetworkedBabylonSceneBootstrap extends BabylonSceneBootstrap {
  net: LiveClientNet<RenderSnapshotState>;
  transport: WebSocketClientTransport;
  connectNetwork: () => void;
  disconnectNetwork: (code?: number, reason?: string) => void;
  isNetworkConnected: () => boolean;
}

export function bootstrapBabylonScene(options: BabylonSceneBootstrapOptions): BabylonSceneBootstrap {
  if (typeof window === "undefined") {
    throw new Error("bootstrapBabylonScene is browser-only and requires window.");
  }

  const rendererBridge = options.rendererBridge ?? new RendererBridge();
  const debugHud = options.debugHud ?? createDebugHud();
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
  const predictionHistory = options.predictionHistory ?? createPredictionHistory();
  const engine = new Engine(options.canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 24, Vector3.Zero(), scene);
  camera.attachControl(options.canvas, true);
  const cameraController = createCameraController({ initialMode: options.initialCameraMode });

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
    debugHud.updateFrame(deltaMs);

    inputAccumulatorMs += deltaMs;
    while (inputAccumulatorMs >= INPUT_EMIT_INTERVAL_MS) {
      const tick = inputFrameContext.getTick?.() ?? inputTick;
      const inputFrame = inputFrameEmitter.emit(tick, inputBindings.getControls());
      rendererBridge.applyInputFrame(inputFrame);
      predictionHistory.enqueue(inputFrame);
      options.onInputFrame?.(inputFrame);

      inputAccumulatorMs -= INPUT_EMIT_INTERVAL_MS;
      inputTick += 1;
    }

    const interpolationAlpha = Math.min(Math.max(inputAccumulatorMs / INPUT_EMIT_INTERVAL_MS, 0), 1);
    const renderSnapshot = rendererBridge.getInterpolatedSnapshot(interpolationAlpha);
    if (renderSnapshot !== null) {
      const cameraPose = resolveCameraPose(cameraController.getMode(), renderSnapshot, inputFrameContext.carId);
      camera.alpha = cameraPose.alpha;
      camera.beta = cameraPose.beta;
      camera.radius = cameraPose.radius;
      camera.setTarget(new Vector3(cameraPose.target.x, cameraPose.target.y, cameraPose.target.z));
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
    debugHud,
    inputBindings,
    inputFrameEmitter,
    predictionHistory,
    getCameraMode(): CameraMode {
      return cameraController.getMode();
    },
    setCameraMode(mode: CameraMode): CameraMode {
      return cameraController.setMode(mode);
    },
    toggleCamera(): CameraMode {
      return cameraController.toggleMode();
    },
    applySnapshot(snapshot: Snapshot): RenderSnapshotState {
      return rendererBridge.applySnapshot(snapshot);
    },
    getRenderSnapshot(alpha: number): RenderSnapshotState | null {
      return rendererBridge.getInterpolatedSnapshot(alpha);
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

export function bootstrapNetworkedBabylonScene(
  options: NetworkedBabylonSceneBootstrapOptions,
): NetworkedBabylonSceneBootstrap {
  const inputFrameContext = options.inputFrameContext ?? {
    playerId: "player-1",
    carId: "car:player-1",
  };

  let transport: WebSocketClientTransport | null = null;

  const base = bootstrapBabylonScene({
    ...options,
    inputFrameContext,
    onInputFrame(frame): void {
      transport?.sendInputFrame(frame);
      options.onInputFrame?.(frame);
    },
  });

  const net = createLiveClientNet<RenderSnapshotState>(
    {
      applySnapshot(snapshot): RenderSnapshotState {
        const applied = base.applySnapshot(snapshot);
        const correctionMetrics = net.getCorrectionMetrics();
        base.debugHud.setCorrectionCount(correctionMetrics.correctionsPerMinuteWindow);
        return applied;
      },
    },
    {
      playerId: inputFrameContext.playerId,
      carId: inputFrameContext.carId,
      reconcileThresholdCm: options.reconnectThresholdCm,
      getPredictedPosition: () => {
        const latest = base.rendererBridge.getLatestSnapshot();
        if (!latest) {
          return null;
        }

        const predictedCar = latest.cars.find((car) => car.id === inputFrameContext.carId);
        return predictedCar ? predictedCar.position : null;
      },
    },
  );

  const websocketTransport = createWebSocketClientTransport({
    url: options.websocketUrl,
    protocols: options.websocketProtocols,
    net,
  });
  transport = websocketTransport;

  return {
    ...base,
    net,
    transport: websocketTransport,
    connectNetwork(): void {
      websocketTransport.connect();
    },
    disconnectNetwork(code?: number, reason?: string): void {
      websocketTransport.disconnect(code, reason);
    },
    isNetworkConnected(): boolean {
      return websocketTransport.isConnected();
    },
    dispose(): void {
      websocketTransport.disconnect(1000, "client dispose");
      base.dispose();
    },
  };
}