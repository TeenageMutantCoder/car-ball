import { pathToFileURL } from "node:url";

import { createServerRuntime } from "./runtime.ts";
import { createLiveTransportServer } from "./transport.ts";

const DEFAULT_ROOM_ID = "room-main";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_PATH = "/ws";
const DEFAULT_PLAYERS = ["player-1", "player-2"];

export interface StartLiveServerConfig {
  roomId?: string;
  host?: string;
  port?: number;
  path?: string;
  playerIds?: string[];
  rapierEnabled?: boolean;
  rapierShadowMode?: boolean;
  rapierBallAuthority?: boolean;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

function parsePlayerIds(value: string | undefined): string[] {
  if (!value) {
    return [...DEFAULT_PLAYERS];
  }

  const ids = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ids.length > 0 ? ids : [...DEFAULT_PLAYERS];
}

export async function startLiveServer(config: StartLiveServerConfig = {}): Promise<void> {
  const roomId = config.roomId ?? process.env.CAR_BALL_ROOM_ID ?? DEFAULT_ROOM_ID;
  const host = config.host ?? process.env.HOST ?? DEFAULT_HOST;
  const port = config.port ?? parsePort(process.env.PORT);
  const path = config.path ?? process.env.CAR_BALL_WS_PATH ?? DEFAULT_PATH;
  const playerIds = config.playerIds ?? parsePlayerIds(process.env.CAR_BALL_PLAYER_IDS);
  const rapierEnabled = config.rapierEnabled ?? parseBoolean(process.env.CAR_BALL_RAPIER_ENABLED, false);
  const rapierShadowMode = config.rapierShadowMode ?? parseBoolean(process.env.CAR_BALL_RAPIER_SHADOW_MODE, true);
  const rapierBallAuthority =
    config.rapierBallAuthority ?? parseBoolean(process.env.CAR_BALL_RAPIER_BALL_AUTHORITY, false);

  const runtime = createServerRuntime({
    rapierEnabled,
    rapierShadowMode,
    rapierBallAuthority
  });
  runtime.createRoomRuntime(roomId);
  runtime.attachPlayerIds(roomId, playerIds);

  const transport = createLiveTransportServer({
    runtime,
    host,
    port,
    path,
  });

  const endpoint = await transport.start();

  process.stdout.write(
    `car-ball live server started: ws://${endpoint.host}:${endpoint.port}${endpoint.path}?roomId=${roomId}&playerId=<player-id>\n`,
  );
  process.stdout.write(`room=${roomId} players=${playerIds.join(",")}\n`);
  process.stdout.write(
    `rapier.enabled=${rapierEnabled} rapier.shadowMode=${rapierShadowMode} rapier.ballAuthority=${rapierBallAuthority}\n`
  );

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    await transport.stop();
  };

  process.on("SIGINT", () => {
    void stop().then(() => {
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    void stop().then(() => {
      process.exit(0);
    });
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void startLiveServer();
}
