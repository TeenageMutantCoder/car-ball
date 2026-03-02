import type { InputFrameContext } from "./main.ts";
import {
  bootstrapNetworkedBabylonScene,
  type NetworkedBabylonSceneBootstrap,
} from "./main.ts";
import type { ReconciliationProfile } from "./net/reconciliation.ts";

const DEFAULT_CANVAS_ID = "car-ball-canvas";
const DEFAULT_ROOM_ID = "room-main";
const DEFAULT_PLAYER_ID = "player-1";
const DEFAULT_WS_PATH = "/ws";
const DEFAULT_WS_PORT = "8080";
const VALID_RECONCILIATION_PROFILES: ReconciliationProfile[] = ["clean", "loss_5pct", "jitter"];
const DEFAULT_RECONCILIATION_PROFILE: ReconciliationProfile = "clean";

export interface StartClientAppOptions {
  canvas?: HTMLCanvasElement;
  canvasId?: string;
  roomId?: string;
  playerId?: string;
  reconciliationProfile?: ReconciliationProfile;
  networkProfile?: ReconciliationProfile;
  websocketUrl?: string;
  websocketPath?: string;
  autoStartRender?: boolean;
  autoConnectNetwork?: boolean;
}

function isReconciliationProfile(value: string | null | undefined): value is ReconciliationProfile {
  if (value === undefined || value === null) {
    return false;
  }

  return VALID_RECONCILIATION_PROFILES.includes(value as ReconciliationProfile);
}

export function resolveStartReconciliationProfile(
  options: Pick<StartClientAppOptions, "reconciliationProfile" | "networkProfile">,
  locationSearch?: string,
): ReconciliationProfile {
  if (isReconciliationProfile(options.reconciliationProfile)) {
    return options.reconciliationProfile;
  }

  if (isReconciliationProfile(options.networkProfile)) {
    return options.networkProfile;
  }

  const search =
    locationSearch ??
    (typeof window !== "undefined" && window.location ? window.location.search : "");
  const params = new URLSearchParams(search);
  const profileFromQuery = params.get("reconciliationProfile") ?? params.get("networkProfile");

  if (isReconciliationProfile(profileFromQuery)) {
    return profileFromQuery;
  }

  return DEFAULT_RECONCILIATION_PROFILE;
}

function ensureCanvas(options: StartClientAppOptions): HTMLCanvasElement {
  if (options.canvas) {
    return options.canvas;
  }

  const canvasId = options.canvasId ?? DEFAULT_CANVAS_ID;
  const existing = document.getElementById(canvasId);
  if (existing instanceof HTMLCanvasElement) {
    return existing;
  }

  const canvas = document.createElement("canvas");
  canvas.id = canvasId;
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.display = "block";
  document.body.append(canvas);

  return canvas;
}

function resolveWebSocketUrl(options: StartClientAppOptions): string {
  if (options.websocketUrl) {
    return options.websocketUrl;
  }

  const roomId = options.roomId ?? DEFAULT_ROOM_ID;
  const playerId = options.playerId ?? DEFAULT_PLAYER_ID;
  const path = options.websocketPath ?? DEFAULT_WS_PATH;

  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname || "127.0.0.1";
  const port = DEFAULT_WS_PORT;
  const encodedRoomId = encodeURIComponent(roomId);
  const encodedPlayerId = encodeURIComponent(playerId);

  return `${wsProtocol}://${host}:${port}${path}?roomId=${encodedRoomId}&playerId=${encodedPlayerId}`;
}

export function startClientApp(options: StartClientAppOptions = {}): NetworkedBabylonSceneBootstrap {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("startClientApp must run in a browser environment.");
  }

  const playerId = options.playerId ?? DEFAULT_PLAYER_ID;
  const inputFrameContext: InputFrameContext = {
    playerId,
    carId: `car:${playerId}`,
  };

  const app = bootstrapNetworkedBabylonScene({
    canvas: ensureCanvas(options),
    websocketUrl: resolveWebSocketUrl(options),
    inputFrameContext,
    reconciliationProfile: resolveStartReconciliationProfile(options),
  });

  if (options.autoConnectNetwork ?? true) {
    app.connectNetwork();
  }

  if (options.autoStartRender ?? true) {
    app.start();
  }

  return app;
}

function autoStartWhenReady(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startClientApp();
    }, { once: true });
    return;
  }

  startClientApp();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  autoStartWhenReady();
}
