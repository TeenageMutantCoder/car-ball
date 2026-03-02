import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";

import {
  decodeEvent,
  encodeEvent,
  ProtocolVersionError,
  type PlayerId,
  type ServerEvent,
  type Snapshot,
} from "@car-ball/protocol";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import type { ServerRuntime } from "./runtime.ts";

const ROOM_MATCH_TOKEN = ":match:";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PATH = "/ws";
const DEFAULT_MAX_BUFFERED_AMOUNT_BYTES = 256 * 1024;

export interface LiveTransportConfig {
  runtime: ServerRuntime;
  host?: string;
  port?: number;
  path?: string;
  now?: () => number;
  tickIntervalMs?: number;
  maxBufferedAmountBytes?: number;
}

export interface LiveTransportMetrics {
  activeSessions: number;
  inboundPackets: number;
  outboundPackets: number;
  droppedSnapshotsBackpressure: number;
}

export interface LiveTransportServer {
  start: () => Promise<{ host: string; port: number; path: string }>;
  stop: () => Promise<void>;
  getMetrics: () => LiveTransportMetrics;
}

interface ClientSession {
  socket: WebSocket;
  roomId: string;
  playerId: PlayerId;
  lastInboundSequence: number;
  lastInboundTimestamp: number;
  nextOutboundSequence: number;
}

function expectedCarId(playerId: PlayerId): string {
  return `car:${playerId}`;
}

function parseRoomId(matchId: string): string | null {
  const separatorIndex = matchId.indexOf(ROOM_MATCH_TOKEN);
  if (separatorIndex <= 0) {
    return null;
  }

  return matchId.slice(0, separatorIndex);
}

function toUtf8Payload(payload: RawData): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }

  return payload.toString("utf8");
}

function parseConnectionRequest(request: IncomingMessage): { roomId: string; playerId: PlayerId } | null {
  const host = request.headers.host ?? DEFAULT_HOST;
  const url = new URL(request.url ?? DEFAULT_PATH, `http://${host}`);
  const roomId = url.searchParams.get("roomId")?.trim();
  const playerId = url.searchParams.get("playerId")?.trim();

  if (!roomId || !playerId) {
    return null;
  }

  return {
    roomId,
    playerId,
  };
}

export function createLiveTransportServer(config: LiveTransportConfig): LiveTransportServer {
  const host = config.host ?? DEFAULT_HOST;
  const path = config.path ?? DEFAULT_PATH;
  const now = config.now ?? Date.now;
  const tickIntervalMs = Math.max(1, Math.floor(config.tickIntervalMs ?? config.runtime.fixedStepMs));
  const maxBufferedAmountBytes = Number.isFinite(config.maxBufferedAmountBytes)
    ? Math.max(0, Math.floor(config.maxBufferedAmountBytes!))
    : DEFAULT_MAX_BUFFERED_AMOUNT_BYTES;

  const runtime = config.runtime;
  const socketSessions = new Map<WebSocket, ClientSession>();
  const sessionsByRoom = new Map<string, Set<ClientSession>>();

  let inboundPackets = 0;
  let outboundPackets = 0;
  let droppedSnapshotsBackpressure = 0;

  let httpServer: HttpServer | null = null;
  let webSocketServer: WebSocketServer | null = null;
  let tickTimer: NodeJS.Timeout | null = null;
  let boundPort = config.port ?? 0;

  const removeSession = (session: ClientSession): void => {
    socketSessions.delete(session.socket);

    const roomSessions = sessionsByRoom.get(session.roomId);
    if (roomSessions) {
      roomSessions.delete(session);
      if (roomSessions.size === 0) {
        sessionsByRoom.delete(session.roomId);
      }
    }

    try {
      runtime.disconnectPlayer(session.roomId, session.playerId);
    } catch {
      // No-op: room/player may already be detached.
    }
  };

  const sendEvent = (session: ClientSession, event: ServerEvent): void => {
    if (session.socket.readyState !== 1) {
      return;
    }

    session.socket.send(encodeEvent(event));
    outboundPackets += 1;
  };

  const sendError = (
    session: ClientSession,
    code: "VERSION_MISMATCH" | "BAD_MESSAGE",
    message: string,
  ): void => {
    sendEvent(session, {
      type: "server.error",
      version: 1,
      sequence: session.nextOutboundSequence,
      timestamp: Math.round(now()),
      code,
      message,
    });
    session.nextOutboundSequence += 1;
  };

  const sendPong = (session: ClientSession, clientTimeMs: number): void => {
    sendEvent(session, {
      type: "server.pong",
      version: 1,
      sequence: session.nextOutboundSequence,
      timestamp: Math.round(now()),
      clientTimeMs,
      serverTimeMs: Math.round(now()),
    });
    session.nextOutboundSequence += 1;
  };

  const sendSnapshot = (session: ClientSession, snapshot: Snapshot, force = false): void => {
    if (!force && session.socket.bufferedAmount >= maxBufferedAmountBytes) {
      droppedSnapshotsBackpressure += 1;
      return;
    }

    sendEvent(session, {
      type: "server.snapshot",
      ...snapshot,
      sequence: session.nextOutboundSequence,
      timestamp: Math.round(now()),
    });
    session.nextOutboundSequence += 1;
  };

  const handleMessage = (session: ClientSession, rawPayload: RawData): void => {
    inboundPackets += 1;

    const payload = toUtf8Payload(rawPayload);

    try {
      const event = decodeEvent(payload);

      if (event.sequence <= session.lastInboundSequence) {
        sendError(session, "BAD_MESSAGE", `Inbound sequence must be monotonic. Received ${event.sequence}.`);
        return;
      }

      if (event.timestamp < session.lastInboundTimestamp) {
        sendError(
          session,
          "BAD_MESSAGE",
          `Inbound timestamp must be monotonic. Received ${event.timestamp}.`,
        );
        return;
      }

      session.lastInboundSequence = event.sequence;
      session.lastInboundTimestamp = event.timestamp;

      if (event.type === "client.ping") {
        sendPong(session, event.clientTimeMs);
        return;
      }

      if (event.type === "client.ready") {
        if (event.playerId !== session.playerId) {
          sendError(session, "BAD_MESSAGE", "client.ready playerId must match session player binding.");
        }
        return;
      }

      if (event.type !== "client.input") {
        sendError(session, "BAD_MESSAGE", `Unsupported client event type: ${event.type}.`);
        return;
      }

      if (event.playerId !== session.playerId) {
        sendError(session, "BAD_MESSAGE", "client.input playerId must match session player binding.");
        return;
      }

      if (event.carId !== expectedCarId(session.playerId)) {
        sendError(session, "BAD_MESSAGE", `client.input carId must equal ${expectedCarId(session.playerId)}.`);
        return;
      }

      const enqueueResult = runtime.enqueueInputFrame(session.roomId, event);
      if (!enqueueResult.ok) {
        sendError(session, "BAD_MESSAGE", `${enqueueResult.code}: ${enqueueResult.reason}`);
      }
    } catch (error) {
      if (error instanceof ProtocolVersionError) {
        sendError(session, "VERSION_MISMATCH", error.message);
        return;
      }

      const message = error instanceof Error ? error.message : "Malformed client payload.";
      sendError(session, "BAD_MESSAGE", message);
    }
  };

  const tickAndBroadcast = (): void => {
    const tickResult = runtime.tickOnce();
    for (const snapshot of tickResult.snapshots) {
      const roomId = parseRoomId(snapshot.match.matchId);
      if (roomId === null) {
        continue;
      }

      const roomSessions = sessionsByRoom.get(roomId);
      if (!roomSessions || roomSessions.size === 0) {
        continue;
      }

      for (const session of roomSessions) {
        sendSnapshot(session, snapshot);
      }
    }
  };

  const attachSession = (socket: WebSocket, request: IncomingMessage): void => {
    const parsed = parseConnectionRequest(request);
    if (!parsed) {
      socket.close(1008, "Missing roomId or playerId query parameters.");
      return;
    }

    let reconnectSnapshot: Snapshot;
    try {
      reconnectSnapshot = runtime.reconnectPlayer(parsed.roomId, parsed.playerId).snapshot;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown room/player binding.";
      socket.close(1008, reason);
      return;
    }

    const session: ClientSession = {
      socket,
      roomId: parsed.roomId,
      playerId: parsed.playerId,
      lastInboundSequence: 0,
      lastInboundTimestamp: 0,
      nextOutboundSequence: 1,
    };

    socketSessions.set(socket, session);

    let roomSessions = sessionsByRoom.get(parsed.roomId);
    if (!roomSessions) {
      roomSessions = new Set<ClientSession>();
      sessionsByRoom.set(parsed.roomId, roomSessions);
    }
    roomSessions.add(session);

    sendSnapshot(session, reconnectSnapshot, true);

    socket.on("message", (rawPayload: RawData) => {
      const activeSession = socketSessions.get(socket);
      if (!activeSession) {
        return;
      }

      handleMessage(activeSession, rawPayload);
    });

    socket.on("close", () => {
      const activeSession = socketSessions.get(socket);
      if (!activeSession) {
        return;
      }

      removeSession(activeSession);
    });
  };

  return {
    async start(): Promise<{ host: string; port: number; path: string }> {
      if (httpServer || webSocketServer || tickTimer) {
        throw new Error("Live transport server already started.");
      }

      const createdHttpServer = createServer();
      const createdWebSocketServer = new WebSocketServer({ server: createdHttpServer, path });

      createdWebSocketServer.on("connection", attachSession);

      await new Promise<void>((resolve, reject) => {
        createdHttpServer.once("error", reject);
        createdHttpServer.listen(boundPort, host, () => {
          createdHttpServer.off("error", reject);
          resolve();
        });
      });

      const address = createdHttpServer.address();
      if (!address || typeof address === "string") {
        await new Promise<void>((resolve) => {
          createdHttpServer.close(() => resolve());
        });
        throw new Error("Unable to resolve bound port for live transport server.");
      }

      boundPort = address.port;
      httpServer = createdHttpServer;
      webSocketServer = createdWebSocketServer;
      tickTimer = setInterval(tickAndBroadcast, tickIntervalMs);

      return {
        host,
        port: boundPort,
        path,
      };
    },

    async stop(): Promise<void> {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }

      const currentWebSocketServer = webSocketServer;
      webSocketServer = null;

      if (currentWebSocketServer) {
        for (const socket of currentWebSocketServer.clients) {
          socket.close();
        }

        await new Promise<void>((resolve) => {
          currentWebSocketServer.close(() => resolve());
        });
      }

      const currentHttpServer = httpServer;
      httpServer = null;
      if (currentHttpServer) {
        await new Promise<void>((resolve) => {
          currentHttpServer.close(() => resolve());
        });
      }

      socketSessions.clear();
      sessionsByRoom.clear();
    },

    getMetrics(): LiveTransportMetrics {
      return {
        activeSessions: socketSessions.size,
        inboundPackets,
        outboundPackets,
        droppedSnapshotsBackpressure,
      };
    },
  };
}
