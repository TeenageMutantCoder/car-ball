import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILTIN_IMPAIRMENT_PROFILES,
  createNetworkImpairmentQueue,
} from "./impairment.ts";

test("network impairment is reproducible with the same seeded profile", () => {
  const profile = {
    latencyMs: 30,
    jitterMs: 10,
    packetLossPct: 30,
    seed: "ws-f-003",
  };

  const first = createNetworkImpairmentQueue<number>(profile);
  const second = createNetworkImpairmentQueue<number>(profile);

  for (let index = 0; index < 12; index += 1) {
    const now = index * 7;
    first.enqueueOutbound(index, now);
    second.enqueueOutbound(index, now);
  }

  const firstTimeline = [10, 25, 40, 60, 90, 120].flatMap((time) => first.dequeueDeliverable(time));
  const secondTimeline = [10, 25, 40, 60, 90, 120].flatMap((time) => second.dequeueDeliverable(time));

  assert.deepEqual(firstTimeline, secondTimeline);
});

test("network impairment applies packet loss percentages at extremes", () => {
  const noLoss = createNetworkImpairmentQueue<number>({
    latencyMs: 0,
    jitterMs: 0,
    packetLossPct: 0,
    seed: 99,
  });
  const fullLoss = createNetworkImpairmentQueue<number>({
    latencyMs: 0,
    jitterMs: 0,
    packetLossPct: 100,
    seed: 99,
  });

  for (let index = 1; index <= 5; index += 1) {
    noLoss.enqueueOutbound(index, 0);
    fullLoss.enqueueOutbound(index, 0);
  }

  assert.deepEqual(noLoss.dequeueDeliverable(0), [1, 2, 3, 4, 5]);
  assert.deepEqual(fullLoss.dequeueDeliverable(1000), []);
  assert.equal(fullLoss.getPendingCount(), 0);
});

test("network impairment delays delivery using latency and jitter", () => {
  const fixedLatency = createNetworkImpairmentQueue<number>({
    latencyMs: 50,
    jitterMs: 0,
    packetLossPct: 0,
    seed: "latency",
  });

  fixedLatency.enqueueOutbound(1, 0);
  fixedLatency.enqueueOutbound(2, 0);
  assert.deepEqual(fixedLatency.dequeueDeliverable(49), []);
  assert.deepEqual(fixedLatency.dequeueDeliverable(50), [1, 2]);

  const jittered = createNetworkImpairmentQueue<number>({
    ...BUILTIN_IMPAIRMENT_PROFILES.jitter,
    seed: "jitter-seed",
  });

  for (let frame = 1; frame <= 8; frame += 1) {
    jittered.enqueueOutbound(frame, 0);
  }

  const early = jittered.dequeueDeliverable(20);
  const medium = jittered.dequeueDeliverable(40);
  const late = jittered.dequeueDeliverable(70);

  assert.equal(early.length, 0);
  assert.ok(medium.length > 0);
  assert.deepEqual([...early, ...medium, ...late], [1, 2, 3, 4, 5, 6, 7, 8]);
});
