import type { RenderSnapshotState } from "../render/rendererBridge.ts";

const TEAM_BLUE_ID = "team:blue";
const TEAM_ORANGE_ID = "team:orange";

export interface MatchHud {
  update: (snapshot: RenderSnapshotState) => void;
  dispose: () => void;
}

export interface MatchHudOptions {
  onRestart?: () => void;
}

export interface MatchHudValues {
  blueScore: number;
  orangeScore: number;
  clock: string;
  boost: number;
}

interface MatchHudElement {
  style: Record<string, string>;
  textContent: string | null;
  append: (...elements: unknown[]) => void;
  addEventListener: (type: string, listener: () => void) => void;
  remove: () => void;
}

interface MatchHudDocumentLike {
  createElement: (tagName: string) => MatchHudElement;
  body: {
    append: (element: MatchHudElement) => void;
  };
}

function resolveDocument(): MatchHudDocumentLike {
  if (typeof document === "undefined") {
    throw new Error("createMatchHud requires document in browser runtime.");
  }

  return document as unknown as MatchHudDocumentLike;
}

export function formatTimeRemaining(timeRemainingMs: number): string {
  const clampedMs = Number.isFinite(timeRemainingMs) ? Math.max(0, timeRemainingMs) : 0;
  const totalSeconds = Math.floor(clampedMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getMatchHudValues(snapshot: Pick<RenderSnapshotState, "match">): MatchHudValues {
  return {
    blueScore: snapshot.match.scoreByTeam[TEAM_BLUE_ID] ?? 0,
    orangeScore: snapshot.match.scoreByTeam[TEAM_ORANGE_ID] ?? 0,
    clock: formatTimeRemaining(snapshot.match.timeRemainingMs),
    boost: 0,
  };
}

function clampBoost(boost: number): number {
  if (!Number.isFinite(boost)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(boost)));
}

export function getMatchHudValuesForCar(
  snapshot: Pick<RenderSnapshotState, "match" | "cars">,
  carId?: string,
): MatchHudValues {
  const localCar = carId ? snapshot.cars.find((car) => car.id === carId) : undefined;
  return {
    blueScore: snapshot.match.scoreByTeam[TEAM_BLUE_ID] ?? 0,
    orangeScore: snapshot.match.scoreByTeam[TEAM_ORANGE_ID] ?? 0,
    clock: formatTimeRemaining(snapshot.match.timeRemainingMs),
    boost: clampBoost(localCar?.boost ?? 0),
  };
}

export function createMatchHud(
  documentLike: MatchHudDocumentLike = resolveDocument(),
  localCarId?: string,
  options: MatchHudOptions = {},
): MatchHud {
  const root = documentLike.createElement("div");
  root.style.position = "fixed";
  root.style.top = "0";
  root.style.left = "0";
  root.style.right = "0";
  root.style.display = "flex";
  root.style.justifyContent = "center";
  root.style.padding = "12px 16px";
  root.style.pointerEvents = "none";
  root.style.zIndex = "1000";

  const panel = documentLike.createElement("div");
  panel.style.display = "flex";
  panel.style.alignItems = "center";
  panel.style.gap = "18px";
  panel.style.padding = "8px 14px";
  panel.style.borderRadius = "10px";
  panel.style.background = "rgba(12, 16, 24, 0.72)";
  panel.style.color = "#f3f6ff";
  panel.style.fontFamily = "system-ui, sans-serif";
  panel.style.fontSize = "16px";
  panel.style.fontWeight = "600";

  const blueScore = documentLike.createElement("span");
  blueScore.style.color = "#5a94ff";
  blueScore.textContent = "0";

  const separator = documentLike.createElement("span");
  separator.textContent = "-";

  const orangeScore = documentLike.createElement("span");
  orangeScore.style.color = "#ff9a4f";
  orangeScore.textContent = "0";

  const clock = documentLike.createElement("span");
  clock.style.minWidth = "64px";
  clock.style.textAlign = "right";
  clock.textContent = "00:00";

  panel.append(blueScore, separator, orangeScore, clock);
  root.append(panel);

  const boostRoot = documentLike.createElement("div");
  boostRoot.style.position = "fixed";
  boostRoot.style.right = "16px";
  boostRoot.style.bottom = "16px";
  boostRoot.style.pointerEvents = "none";
  boostRoot.style.zIndex = "1000";

  const boostPanel = documentLike.createElement("div");
  boostPanel.style.display = "flex";
  boostPanel.style.alignItems = "baseline";
  boostPanel.style.gap = "10px";
  boostPanel.style.padding = "10px 14px";
  boostPanel.style.borderRadius = "10px";
  boostPanel.style.background = "rgba(12, 16, 24, 0.72)";
  boostPanel.style.color = "#f3f6ff";
  boostPanel.style.fontFamily = "system-ui, sans-serif";

  const boostLabel = documentLike.createElement("span");
  boostLabel.style.fontSize = "12px";
  boostLabel.style.fontWeight = "600";
  boostLabel.style.opacity = "0.8";
  boostLabel.textContent = "BOOST";

  const boostValue = documentLike.createElement("span");
  boostValue.style.fontSize = "28px";
  boostValue.style.fontWeight = "700";
  boostValue.textContent = "0";

  boostPanel.append(boostLabel, boostValue);
  boostRoot.append(boostPanel);

  const gameOverRoot = documentLike.createElement("div");
  gameOverRoot.style.position = "fixed";
  gameOverRoot.style.left = "0";
  gameOverRoot.style.right = "0";
  gameOverRoot.style.bottom = "96px";
  gameOverRoot.style.display = "none";
  gameOverRoot.style.justifyContent = "center";
  gameOverRoot.style.pointerEvents = "none";
  gameOverRoot.style.zIndex = "1000";

  const restartButton = documentLike.createElement("button");
  restartButton.style.pointerEvents = "auto";
  restartButton.style.padding = "10px 16px";
  restartButton.style.borderRadius = "10px";
  restartButton.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  restartButton.style.background = "rgba(12, 16, 24, 0.9)";
  restartButton.style.color = "#f3f6ff";
  restartButton.style.fontFamily = "system-ui, sans-serif";
  restartButton.style.fontSize = "14px";
  restartButton.style.fontWeight = "700";
  restartButton.textContent = "Restart game";
  restartButton.addEventListener("click", () => {
    const fallbackRestart =
      typeof window !== "undefined" && window.location
        ? () => {
            window.location.reload();
          }
        : undefined;

    const restart = options.onRestart ?? fallbackRestart;
    restart?.();
  });

  gameOverRoot.append(restartButton);

  documentLike.body.append(root);
  documentLike.body.append(boostRoot);
  documentLike.body.append(gameOverRoot);

  return {
    update(snapshot: RenderSnapshotState): void {
      const values = getMatchHudValuesForCar(snapshot, localCarId);
      blueScore.textContent = String(values.blueScore);
      orangeScore.textContent = String(values.orangeScore);
      clock.textContent = values.clock;
      boostValue.textContent = String(values.boost);
      gameOverRoot.style.display = snapshot.match.phase === "finished" ? "flex" : "none";
    },
    dispose(): void {
      root.remove();
      boostRoot.remove();
      gameOverRoot.remove();
    },
  };
}
