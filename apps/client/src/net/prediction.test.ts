import assert from "node:assert/strict";
import test from "node:test";

import type { InputFrame } from "@car-ball/protocol";

import { createPredictionHistory } from "./prediction.ts";

function createFrame(sequence: number, tick: number): InputFrame {
  return {
    version: 1,
    sequence,
    timestamp: 1_738_000_000_000 + sequence,
    tick,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: sequence % 2,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false,
    },
  };
}

test("prediction history keeps deterministic sequence order and supports replay retrieval", () => {
  const history = createPredictionHistory({ capacity: 8 });

  history.enqueue(createFrame(3, 103));
  history.enqueue(createFrame(1, 101));
  history.enqueue(createFrame(2, 102));

  const ordered = history.getRange();
  assert.deepEqual(
    ordered.map((frame) => [frame.sequence, frame.tick]),
    [
      [1, 101],
      [2, 102],
      [3, 103],
    ],
  );

  const replayFrames = history.getReplayFrames({ afterSequence: 1 });
  assert.deepEqual(
    replayFrames.map((frame) => frame.sequence),
    [2, 3],
  );

  const constrained = history.getRange({ startSequence: 2, endTick: 103 });
  assert.deepEqual(
    constrained.map((frame) => frame.sequence),
    [2, 3],
  );
});

test("prediction history trimBefore removes older sequence and tick ranges", () => {
  const history = createPredictionHistory({ capacity: 8 });

  history.enqueue(createFrame(1, 101));
  history.enqueue(createFrame(2, 102));
  history.enqueue(createFrame(3, 103));
  history.enqueue(createFrame(4, 104));

  const trimmedBySequence = history.trimBefore({ sequence: 3 });
  assert.equal(trimmedBySequence, 2);
  assert.deepEqual(
    history.getRange().map((frame) => frame.sequence),
    [3, 4],
  );

  const trimmedByTick = history.trimBefore({ tick: 104 });
  assert.equal(trimmedByTick, 1);
  assert.deepEqual(
    history.getRange().map((frame) => frame.sequence),
    [4],
  );
});

test("prediction history enforces bounded capacity while preserving newest frames", () => {
  const history = createPredictionHistory({ capacity: 3 });

  history.enqueue(createFrame(1, 201));
  history.enqueue(createFrame(2, 202));
  history.enqueue(createFrame(3, 203));
  history.enqueue(createFrame(4, 204));
  history.enqueue(createFrame(5, 205));

  assert.equal(history.getSize(), 3);
  assert.deepEqual(
    history.getRange().map((frame) => frame.sequence),
    [3, 4, 5],
  );

  history.enqueue(createFrame(2, 202));
  assert.deepEqual(
    history.getRange().map((frame) => frame.sequence),
    [3, 4, 5],
  );
});