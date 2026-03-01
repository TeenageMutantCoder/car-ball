import type { AnyEvent } from "@car-ball/protocol";

export function renderMessage(message: AnyEvent): string {
  return `Client received message type: ${message.type}`;
}
