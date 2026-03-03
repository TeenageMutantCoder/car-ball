import assert from "node:assert/strict";
import test from "node:test";

import { createInputFrameEmitter } from "./frameEmitter.ts";

test("createInputFrameEmitter emits protocol-aligned input frames", () => {
  let nowMs = 1_738_160_000_000;
  const now = () => nowMs;

  const emitter = createInputFrameEmitter({
    playerId: "player-1",
    carId: "car:player-1",
    now,
  });

  const controls = {
    throttle: 1,
    steer: -1,
    pitch: 1,
    roll: -1,
    jump: false,
    boost: true,
    handbrake: false,
  };

  const first = emitter.emit(120, controls);

  assert.deepEqual(first, {
    version: 1,
    sequence: 1,
    timestamp: 1_738_160_000_000,
    tick: 120,
    playerId: "player-1",
    carId: "car:player-1",
    controls,
  });

  nowMs += 16;
  const second = emitter.emit(121, {
    throttle: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    jump: true,
    boost: false,
    handbrake: true,
  });

  assert.equal(second.sequence, 2);
  assert.equal(second.timestamp, 1_738_160_000_016);
  assert.equal(second.tick, 121);
  assert.equal(emitter.getNextSequence(), 3);
});

test("createInputFrameEmitter clones controls payload", () => {
  const emitter = createInputFrameEmitter({
    playerId: "player-1",
    carId: "car:player-1",
    now: () => 500,
  });

  const controls = {
    throttle: 0.5,
    steer: -0.25,
    pitch: -0.5,
    roll: 0.25,
    jump: false,
    boost: false,
    handbrake: false,
  };

  const frame = emitter.emit(42, controls);
  controls.throttle = -1;
  controls.jump = true;

  assert.deepEqual(frame.controls, {
    throttle: 0.5,
    steer: -0.25,
    pitch: -0.5,
    roll: 0.25,
    jump: false,
    boost: false,
    handbrake: false,
  });
});

test("createInputFrameEmitter reserves sequence for non-input events", () => {
  const emitter = createInputFrameEmitter({
    playerId: "player-1",
    carId: "car:player-1",
    now: () => 500,
  });

  const reserved = emitter.takeNextSequence();
  assert.equal(reserved, 1);

  const frame = emitter.emit(42, {
    throttle: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });

  assert.equal(frame.sequence, 2);
  assert.equal(emitter.getNextSequence(), 3);
});
