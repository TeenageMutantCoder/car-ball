import {
  ArcRotateCamera,
  Mesh,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
  Color3,
} from "@babylonjs/core";
import type { InputFrame, Snapshot } from "@car-ball/protocol";

import { createInputBindings, type InputBindings } from "./input/bindings.ts";
import { createInputFrameEmitter, type InputFrameEmitter } from "./input/frameEmitter.ts";
import { createLiveClientNet, type LiveClientNet } from "./net/live.ts";
import type { ReconciliationProfile } from "./net/reconciliation.ts";
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
import { createMatchHud } from "./ui/matchHud.ts";

const INPUT_RATE_HZ = 60;
const INPUT_EMIT_INTERVAL_MS = 1_000 / INPUT_RATE_HZ;
const NETWORK_MIN_INPUT_TICK_DELTA = 2;

interface GoalVolume {
  teamId: string;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

const GOAL_VOLUMES: GoalVolume[] = [
  {
    teamId: "team:blue",
    min: { x: -58, y: -8, z: 0 },
    max: { x: -54, y: 8, z: 6 },
  },
  {
    teamId: "team:orange",
    min: { x: 54, y: -8, z: 0 },
    max: { x: 58, y: 8, z: 6 },
  },
];

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
  reconciliationProfile?: ReconciliationProfile;
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
  const matchHud = createMatchHud();
  const engine = new Engine(options.canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 24, Vector3.Zero(), scene);
  camera.attachControl(options.canvas, true);
  const cameraController = createCameraController({ initialMode: options.initialCameraMode });

  const light = new HemisphericLight("sun", new Vector3(0, 1, 0), scene);
  light.intensity = 0.95;

  const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 26 }, scene);
  ground.position.y = -0.5;

  const ballMesh = MeshBuilder.CreateSphere("ball", { diameter: 1.2 }, scene);
  const carMeshes = new Map<string, Mesh>();

  const blueTeamMaterial = new StandardMaterial("team-blue", scene);
  blueTeamMaterial.diffuseColor = new Color3(0.25, 0.5, 1);
  const orangeTeamMaterial = new StandardMaterial("team-orange", scene);
  orangeTeamMaterial.diffuseColor = new Color3(1, 0.6, 0.2);
  const neutralMaterial = new StandardMaterial("team-neutral", scene);
  neutralMaterial.diffuseColor = new Color3(0.85, 0.85, 0.85);

  for (const goalVolume of GOAL_VOLUMES) {
    const goalCenter = protocolToRenderVector3(centerOfVolume(goalVolume));
    const goalSize = sizeInRenderSpace(goalVolume);
    const goalMesh = MeshBuilder.CreateBox(
      `goal:${goalVolume.teamId}`,
      {
        width: goalSize.x,
        height: goalSize.y,
        depth: goalSize.z,
      },
      scene,
    );
    goalMesh.position = goalCenter;
    goalMesh.material = goalVolume.teamId === "team:blue" ? blueTeamMaterial : orangeTeamMaterial;
  }

  const syncRenderMeshes = (renderSnapshot: RenderSnapshotState): void => {
    ballMesh.position.set(renderSnapshot.ball.position.x, renderSnapshot.ball.position.y, renderSnapshot.ball.position.z);

    const activeCarIds = new Set(renderSnapshot.cars.map((car) => car.id));
    for (const [carId, mesh] of carMeshes) {
      if (!activeCarIds.has(carId)) {
        mesh.dispose();
        carMeshes.delete(carId);
      }
    }

    for (const car of renderSnapshot.cars) {
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateBox(car.id, { width: 2.6, height: 0.8, depth: 1.6 }, scene);
        mesh.material =
          car.teamId === "team:blue"
            ? blueTeamMaterial
            : car.teamId === "team:orange"
              ? orangeTeamMaterial
              : neutralMaterial;
        carMeshes.set(car.id, mesh);
      }

      mesh.position.set(car.position.x, car.position.y, car.position.z);
      mesh.rotationQuaternion = new Quaternion(
        car.rotation.x,
        car.rotation.y,
        car.rotation.z,
        car.rotation.w,
      );
    }
  };

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
      syncRenderMeshes(renderSnapshot);
      matchHud.update(renderSnapshot);

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
      matchHud.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function centerOfVolume(goalVolume: GoalVolume): { x: number; y: number; z: number } {
  return {
    x: (goalVolume.min.x + goalVolume.max.x) / 2,
    y: (goalVolume.min.y + goalVolume.max.y) / 2,
    z: (goalVolume.min.z + goalVolume.max.z) / 2,
  };
}

function sizeInRenderSpace(goalVolume: GoalVolume): { x: number; y: number; z: number } {
  return {
    x: Math.abs(goalVolume.max.x - goalVolume.min.x),
    y: Math.abs(goalVolume.max.z - goalVolume.min.z),
    z: Math.abs(goalVolume.max.y - goalVolume.min.y),
  };
}

function protocolToRenderVector3(value: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(value.x, value.z, value.y);
}

export function bootstrapNetworkedBabylonScene(
  options: NetworkedBabylonSceneBootstrapOptions,
): NetworkedBabylonSceneBootstrap {
  const rendererBridge = options.rendererBridge ?? new RendererBridge();

  const baseInputFrameContext = options.inputFrameContext ?? {
    playerId: "player-1",
    carId: "car:player-1",
  };

  let nextNetworkInputTick = 1;
  const inputFrameContext: InputFrameContext = baseInputFrameContext.getTick
    ? baseInputFrameContext
    : {
      ...baseInputFrameContext,
      getTick: () => {
        const latestSnapshotTick = rendererBridge.getLatestSnapshot()?.tick;
        if (latestSnapshotTick !== undefined && nextNetworkInputTick <= latestSnapshotTick) {
          nextNetworkInputTick = latestSnapshotTick + NETWORK_MIN_INPUT_TICK_DELTA;
        }

        const tick = nextNetworkInputTick;
        nextNetworkInputTick += NETWORK_MIN_INPUT_TICK_DELTA;
        return tick;
      },
    };

  let transport: WebSocketClientTransport | null = null;

  const base = bootstrapBabylonScene({
    ...options,
    rendererBridge,
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
      reconciliationProfile: options.reconciliationProfile,
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