import type { AnyEvent } from "@car-ball/protocol";

export * from "./main.ts";
export * from "./input/bindings.ts";
export * from "./input/frameEmitter.ts";
export * from "./render/camera.ts";
export * from "./render/rendererBridge.ts";

export function renderMessage(message: AnyEvent): string {
  return `Client received message type: ${message.type}`;
}
