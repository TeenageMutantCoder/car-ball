import assert from "node:assert/strict";
import test from "node:test";

import {
  ProtocolVersionError,
  decodeEvent,
  encodeEvent,
} from "./codec.ts";
import { PROTOCOL_VERSION, type ClientEvent } from "./contracts.ts";

test("encodes and decodes v1 client input event roundtrip", () => {
  const event: ClientEvent = {
    type: "client.input",
    version: PROTOCOL_VERSION,
    sequence: 42,
    timestamp: 1_714_000_000_000,
    tick: 128,
    playerId: "player-1",
    carId: "car-1",
    controls: {
      throttle: 1,
      steer: -0.3,
      pitch: 0,
      roll: 0,
      jump: false,
      boost: true,
      handbrake: false,
    },
  };

  const encoded = encodeEvent(event);
  const decoded = decodeEvent(encoded);

  assert.deepEqual(decoded, event);
});

test("throws on decode when message version mismatches", () => {
  const payload = JSON.stringify({
    type: "client.ready",
    version: 999,
    sequence: 1,
    timestamp: 1000,
    playerId: "player-1",
    ready: true,
  });

  assert.throws(() => decodeEvent(payload), (error: unknown) => {
    assert.ok(error instanceof ProtocolVersionError);
    assert.equal(error.expected, PROTOCOL_VERSION);
    assert.equal(error.received, 999);
    return true;
  });
});