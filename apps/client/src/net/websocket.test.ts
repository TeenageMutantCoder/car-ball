import assert from "node:assert/strict";
import test from "node:test";

import { decodeEvent, encodeEvent } from "@car-ball/protocol";

import { createLiveClientNet } from "./live.ts";
import { createWebSocketClientTransport } from "./websocket.ts";

type Listener = (event: unknown) => void;

class FakeWebSocket {
  readyState = 0;
  sent: string[] = [];
  closed = false;

  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type);
    if (!existing) {
      return;
    }

    existing.delete(listener);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = 3;
    this.closed = true;
  }

  emitOpen(): void {
    this.readyState = 1;
    this.emit("open", {});
  }

  emitMessage(payload: string): void {
    this.emit("message", { data: payload });
  }

  private emit(type: string, event: unknown): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

test("websocket transport sends encoded input frames once connected", () => {
  const fake = new FakeWebSocket();
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
      now: () => 1_000,
    },
  );

  const transport = createWebSocketClientTransport({
    url: "ws://localhost:8080/ws",
    net,
    webSocketFactory: () => fake as unknown as WebSocket,
  });

  transport.connect();
  assert.equal(transport.sendInputFrame({
    version: 1,
    sequence: 1,
    timestamp: 1_000,
    tick: 1,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false,
    },
  }), false);

  fake.emitOpen();
  assert.equal(transport.isConnected(), true);
  assert.equal(transport.sendInputFrame({
    version: 1,
    sequence: 2,
    timestamp: 1_001,
    tick: 2,
    playerId: "player-1",
    carId: "car:player-1",
    controls: {
      throttle: 1,
      steer: 0,
      jump: false,
      boost: false,
      handbrake: false,
    },
  }), true);

  assert.equal(fake.sent.length, 1);
  const decoded = decodeEvent(fake.sent[0]!);
  assert.equal(decoded.type, "client.input");
  assert.equal(decoded.sequence, 2);
});

test("websocket transport ingests server snapshots via live net", async () => {
  const fake = new FakeWebSocket();
  const appliedTicks: number[] = [];
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
    },
  );

  const transport = createWebSocketClientTransport({
    url: "ws://localhost:8080/ws",
    net,
    webSocketFactory: () => fake as unknown as WebSocket,
    onSnapshot(snapshotTick): void {
      appliedTicks.push(snapshotTick);
    },
  });

  transport.connect();
  fake.emitOpen();

  fake.emitMessage(encodeEvent({
    type: "server.snapshot",
    version: 1,
    sequence: 1,
    timestamp: 2_000,
    tick: 7,
    match: {
      matchId: "room-main:match:runtime",
      phase: "playing",
      tick: 7,
      scoreByTeam: {
        "team:blue": 0,
        "team:orange": 0,
      },
      timeRemainingMs: 295_000,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 100,
      },
    ],
    ball: {
      id: "ball:main",
      position: { x: 0, y: 0, z: 1.5 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  }));

  await flushMicrotasks();
  assert.deepEqual(appliedTicks, [7]);
});

test("websocket transport coalesces snapshot bursts to newest payload", async () => {
  const fake = new FakeWebSocket();
  const appliedTicks: number[] = [];
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
    },
  );

  const transport = createWebSocketClientTransport({
    url: "ws://localhost:8080/ws",
    net,
    webSocketFactory: () => fake as unknown as WebSocket,
    onSnapshot(snapshotTick): void {
      appliedTicks.push(snapshotTick);
    },
  });

  transport.connect();
  fake.emitOpen();

  fake.emitMessage(encodeEvent({
    type: "server.snapshot",
    version: 1,
    sequence: 1,
    timestamp: 2_000,
    tick: 7,
    match: {
      matchId: "room-main:match:runtime",
      phase: "playing",
      tick: 7,
      scoreByTeam: {
        "team:blue": 0,
        "team:orange": 0,
      },
      timeRemainingMs: 295_000,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 100,
      },
    ],
    ball: {
      id: "ball:main",
      position: { x: 0, y: 0, z: 1.5 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  }));

  fake.emitMessage(encodeEvent({
    type: "server.snapshot",
    version: 1,
    sequence: 2,
    timestamp: 2_001,
    tick: 8,
    match: {
      matchId: "room-main:match:runtime",
      phase: "playing",
      tick: 8,
      scoreByTeam: {
        "team:blue": 0,
        "team:orange": 0,
      },
      timeRemainingMs: 294_000,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 100,
      },
    ],
    ball: {
      id: "ball:main",
      position: { x: 0, y: 0, z: 1.5 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  }));

  await flushMicrotasks();
  assert.deepEqual(appliedTicks, [8]);
});

test("websocket transport disconnects cleanly", () => {
  const fake = new FakeWebSocket();
  const net = createLiveClientNet(
    {
      applySnapshot(snapshot) {
        return snapshot.tick;
      },
    },
    {
      playerId: "player-1",
      carId: "car:player-1",
    },
  );

  const transport = createWebSocketClientTransport({
    url: "ws://localhost:8080/ws",
    net,
    webSocketFactory: () => fake as unknown as WebSocket,
  });

  transport.connect();
  fake.emitOpen();
  assert.equal(transport.isConnected(), true);

  transport.disconnect(1000, "done");
  assert.equal(fake.closed, true);
  assert.equal(transport.isConnected(), false);
});
