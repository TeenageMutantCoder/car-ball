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
import {
  type InputFrame,
  type Snapshot,
  type Vec3,
} from "@car-ball/protocol";
import {
  DEFAULT_ARENA_BOUNDS,
  createGoalVolumesForArena,
  type BoxVolume,
} from "@car-ball/sim";

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
import { createMatchHud, type MatchHudOptions } from "./ui/matchHud.ts";

const INPUT_RATE_HZ = 60;
const INPUT_EMIT_INTERVAL_MS = 1_000 / INPUT_RATE_HZ;
const NETWORK_MIN_INPUT_TICK_DELTA = 2;

interface GoalVolume extends BoxVolume {
  teamId: string;
}

const ARENA_BOUNDS: BoxVolume = DEFAULT_ARENA_BOUNDS;

const ARENA_WALL_THICKNESS = 0.6;

const GOAL_VOLUMES: GoalVolume[] = createGoalVolumes(ARENA_BOUNDS);

export interface InputFrameContext {
  playerId: string;
  carId: string;
  getTick?: () => number | null;
}

export interface BabylonSceneBootstrapOptions {
  canvas: HTMLCanvasElement;
  rendererBridge?: RendererBridge;
  debugHud?: DebugHud;
  matchHudOptions?: MatchHudOptions;
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
  const matchHud = createMatchHud(undefined, inputFrameContext.carId, options.matchHudOptions);
  const engine = new Engine(options.canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 24, Vector3.Zero(), scene);
  camera.attachControl(options.canvas, true);
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  const cameraController = createCameraController({ initialMode: options.initialCameraMode });
  const inputBindings =
    options.inputBindings ??
    createInputBindings({
      onCameraToggle: () => {
        cameraController.toggleMode();
      },
    });

  const light = new HemisphericLight("sun", new Vector3(0, 1, 0), scene);
  light.intensity = 0.95;

  const ballMesh = MeshBuilder.CreateSphere("ball", { diameter: 1.2 }, scene);
  const carMeshes = new Map<string, Mesh>();

  const blueTeamMaterial = new StandardMaterial("team-blue", scene);
  blueTeamMaterial.diffuseColor = new Color3(0.25, 0.5, 1);
  const orangeTeamMaterial = new StandardMaterial("team-orange", scene);
  orangeTeamMaterial.diffuseColor = new Color3(1, 0.6, 0.2);
  const neutralMaterial = new StandardMaterial("team-neutral", scene);
  neutralMaterial.diffuseColor = new Color3(0.85, 0.85, 0.85);

  const arenaFloorMaterial = new StandardMaterial("arena-floor-material", scene);
  arenaFloorMaterial.diffuseColor = new Color3(0.2, 0.24, 0.28);

  const arenaWallMaterial = new StandardMaterial("arena-wall-material", scene);
  arenaWallMaterial.diffuseColor = new Color3(0.2, 0.24, 0.28);
  arenaWallMaterial.alpha = 0.35;

  const goalBlueMaterial = new StandardMaterial("goal-blue", scene);
  goalBlueMaterial.diffuseColor = new Color3(0.25, 0.5, 1);
  goalBlueMaterial.alpha = 0.35;

  const goalOrangeMaterial = new StandardMaterial("goal-orange", scene);
  goalOrangeMaterial.diffuseColor = new Color3(1, 0.6, 0.2);
  goalOrangeMaterial.alpha = 0.35;

  createArenaMeshes(scene, ARENA_BOUNDS, arenaFloorMaterial, arenaWallMaterial);

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
    goalMesh.material = goalVolume.teamId === "team:blue" ? goalBlueMaterial : goalOrangeMaterial;
  }

  const syncRenderMeshes = (renderSnapshot: RenderSnapshotState): void => {
    ballMesh.position.copyFrom(renderToSceneVector3(renderSnapshot.ball.position));

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

      mesh.position.copyFrom(renderToSceneVector3(car.position));
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
      const resolvedTick = inputFrameContext.getTick?.();
      if (resolvedTick === null) {
        inputAccumulatorMs = Math.min(inputAccumulatorMs, INPUT_EMIT_INTERVAL_MS);
        break;
      }

      const tick = resolvedTick ?? inputTick;
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
      camera.setPosition(renderToSceneVector3(cameraPose.position));
      camera.setTarget(renderToSceneVector3(cameraPose.target));
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

function createGoalVolumes(arenaBounds: BoxVolume): GoalVolume[] {
  const goals = createGoalVolumesForArena(arenaBounds);

  return [
    {
      teamId: "team:blue",
      min: goals.minX.min,
      max: goals.minX.max,
    },
    {
      teamId: "team:orange",
      min: goals.maxX.min,
      max: goals.maxX.max,
    },
  ];
}

function createArenaMeshes(
  scene: Scene,
  bounds: BoxVolume,
  floorMaterial: StandardMaterial,
  wallMaterial: StandardMaterial,
): void {
  const halfThickness = ARENA_WALL_THICKNESS / 2;
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;
  const sizeX = Math.abs(bounds.max.x - bounds.min.x);
  const sizeY = Math.abs(bounds.max.y - bounds.min.y);
  const sizeZ = Math.abs(bounds.max.z - bounds.min.z);

  const floorMesh = createProtocolAlignedBox(
    "arena:floor",
    { x: sizeX, y: sizeY, z: ARENA_WALL_THICKNESS },
    { x: centerX, y: centerY, z: bounds.min.z - halfThickness },
    scene,
  );
  floorMesh.material = floorMaterial;

  const wallXMinMesh = createProtocolAlignedBox(
    "arena:wall-x-min",
    { x: ARENA_WALL_THICKNESS, y: sizeY, z: sizeZ },
    { x: bounds.min.x - halfThickness, y: centerY, z: centerZ },
    scene,
  );
  wallXMinMesh.material = wallMaterial;

  const wallXMaxMesh = createProtocolAlignedBox(
    "arena:wall-x-max",
    { x: ARENA_WALL_THICKNESS, y: sizeY, z: sizeZ },
    { x: bounds.max.x + halfThickness, y: centerY, z: centerZ },
    scene,
  );
  wallXMaxMesh.material = wallMaterial;

  const wallYMinMesh = createProtocolAlignedBox(
    "arena:wall-y-min",
    { x: sizeX + ARENA_WALL_THICKNESS * 2, y: ARENA_WALL_THICKNESS, z: sizeZ },
    { x: centerX, y: bounds.min.y - halfThickness, z: centerZ },
    scene,
  );
  wallYMinMesh.material = wallMaterial;

  const wallYMaxMesh = createProtocolAlignedBox(
    "arena:wall-y-max",
    { x: sizeX + ARENA_WALL_THICKNESS * 2, y: ARENA_WALL_THICKNESS, z: sizeZ },
    { x: centerX, y: bounds.max.y + halfThickness, z: centerZ },
    scene,
  );
  wallYMaxMesh.material = wallMaterial;
}

function createProtocolAlignedBox(
  name: string,
  size: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  scene: Scene,
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    {
      width: size.x,
      height: size.z,
      depth: size.y,
    },
    scene,
  );
  mesh.position = protocolToRenderVector3(center);
  return mesh;
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

export function renderToSceneVector3(value: Vec3): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

export function createNetworkInputTickResolver(
  getLatestSnapshotTick: () => number | undefined,
  minInputTickDelta = NETWORK_MIN_INPUT_TICK_DELTA,
): () => number | null {
  let nextNetworkInputTick = 1;
  let previousLatestSnapshotTick: number | null = null;

  return () => {
    const latestSnapshotTick = getLatestSnapshotTick();
    if (latestSnapshotTick === undefined) {
      return null;
    }

    if (
      previousLatestSnapshotTick !== null &&
      latestSnapshotTick < previousLatestSnapshotTick
    ) {
      nextNetworkInputTick = latestSnapshotTick + minInputTickDelta;
    }

    previousLatestSnapshotTick = latestSnapshotTick;

    if (nextNetworkInputTick <= latestSnapshotTick) {
      nextNetworkInputTick = latestSnapshotTick + minInputTickDelta;
    }

    const tick = nextNetworkInputTick;
    nextNetworkInputTick += minInputTickDelta;
    return tick;
  };
}

export function bootstrapNetworkedBabylonScene(
  options: NetworkedBabylonSceneBootstrapOptions,
): NetworkedBabylonSceneBootstrap {
  const rendererBridge = options.rendererBridge ?? new RendererBridge();

  const baseInputFrameContext = options.inputFrameContext ?? {
    playerId: "player-1",
    carId: "car:player-1",
  };

  const inputFrameContext: InputFrameContext = baseInputFrameContext.getTick
    ? baseInputFrameContext
    : {
      ...baseInputFrameContext,
      getTick: createNetworkInputTickResolver(
        () => rendererBridge.getLatestSnapshot()?.tick,
        NETWORK_MIN_INPUT_TICK_DELTA,
      ),
    };

  let transport: WebSocketClientTransport | null = null;

  const base = bootstrapBabylonScene({
    ...options,
    rendererBridge,
    matchHudOptions: {
      onRestart: () => {
        const sequence = base.inputFrameEmitter.takeNextSequence();
        transport?.sendReady(sequence, true, inputFrameContext.playerId);
      },
    },
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