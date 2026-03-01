import type { InputFrame } from "@car-ball/protocol";

import type { LiveClientNet } from "./live.ts";

export interface WebSocketClientTransportOptions<TRenderSnapshot> {
  url: string;
  protocols?: string | string[];
  net: LiveClientNet<TRenderSnapshot>;
  webSocketFactory?: (url: string, protocols?: string | string[]) => WebSocket;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onSnapshot?: (snapshot: TRenderSnapshot) => void;
}

export interface WebSocketClientTransport {
  connect: () => void;
  disconnect: (code?: number, reason?: string) => void;
  isConnected: () => boolean;
  sendInputFrame: (frame: InputFrame) => boolean;
  sendPing: (sequence: number, clientTimeMs?: number) => boolean;
}

const OPEN_READY_STATE = 1;

function toPayloadString(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new TextDecoder().decode(view);
  }

  return null;
}

export function createWebSocketClientTransport<TRenderSnapshot>(
  options: WebSocketClientTransportOptions<TRenderSnapshot>,
): WebSocketClientTransport {
  const createSocket = options.webSocketFactory ?? ((url: string, protocols?: string | string[]) => new WebSocket(url, protocols));

  let socket: WebSocket | null = null;

  const onMessage = (event: MessageEvent): void => {
    const payload = toPayloadString(event.data);
    if (payload === null) {
      return;
    }

    const snapshot = options.net.ingestServerPayload(payload);
    if (snapshot !== null) {
      options.onSnapshot?.(snapshot);
    }
  };

  return {
    connect(): void {
      if (socket && (socket.readyState === OPEN_READY_STATE || socket.readyState === 0)) {
        return;
      }

      socket = createSocket(options.url, options.protocols);
      socket.addEventListener("open", () => {
        options.onOpen?.();
      });
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", (event) => {
        options.onError?.(event);
      });
      socket.addEventListener("close", (event) => {
        options.onClose?.(event);
      });
    },

    disconnect(code?: number, reason?: string): void {
      if (!socket) {
        return;
      }

      socket.removeEventListener("message", onMessage);
      socket.close(code, reason);
      socket = null;
    },

    isConnected(): boolean {
      return socket?.readyState === OPEN_READY_STATE;
    },

    sendInputFrame(frame: InputFrame): boolean {
      if (!socket || socket.readyState !== OPEN_READY_STATE) {
        return false;
      }

      socket.send(options.net.encodeInputFrame(frame));
      return true;
    },

    sendPing(sequence: number, clientTimeMs?: number): boolean {
      if (!socket || socket.readyState !== OPEN_READY_STATE) {
        return false;
      }

      socket.send(options.net.encodePing(sequence, clientTimeMs));
      return true;
    },
  };
}
