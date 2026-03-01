import type { AnyEvent, Envelope } from "./contracts.js";
import { PROTOCOL_VERSION } from "./contracts.js";

export class ProtocolVersionError extends Error {
  readonly expected: number;
  readonly received: number;

  constructor(expected: number, received: number) {
    super(`Protocol version mismatch: expected v${expected}, received v${received}`);
    this.name = "ProtocolVersionError";
    this.expected = expected;
    this.received = received;
  }
}

export function assertProtocolVersion(message: Envelope): void {
  if (message.version !== PROTOCOL_VERSION) {
    throw new ProtocolVersionError(PROTOCOL_VERSION, message.version);
  }
}

export function encodeEvent(event: AnyEvent): string {
  assertProtocolVersion(event);
  return JSON.stringify(event);
}

export function decodeEvent(payload: string): AnyEvent {
  const parsed = JSON.parse(payload) as AnyEvent;
  assertProtocolVersion(parsed as Envelope);
  return parsed;
}
