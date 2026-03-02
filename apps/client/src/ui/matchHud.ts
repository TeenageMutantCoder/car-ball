import type { RenderSnapshotState } from "../render/rendererBridge.ts";

const TEAM_BLUE_ID = "team:blue";
const TEAM_ORANGE_ID = "team:orange";

export interface MatchHud {
  update: (snapshot: RenderSnapshotState) => void;
  dispose: () => void;
}

export interface MatchHudValues {
  blueScore: number;
  orangeScore: number;
  clock: string;
}

interface MatchHudElement {
  style: Record<string, string>;
  textContent: string | null;
  append: (...elements: unknown[]) => void;
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
  };
}

export function createMatchHud(documentLike: MatchHudDocumentLike = resolveDocument()): MatchHud {
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
  documentLike.body.append(root);

  return {
    update(snapshot: RenderSnapshotState): void {
      const values = getMatchHudValues(snapshot);
      blueScore.textContent = String(values.blueScore);
      orangeScore.textContent = String(values.orangeScore);
      clock.textContent = values.clock;
    },
    dispose(): void {
      root.remove();
    },
  };
}
