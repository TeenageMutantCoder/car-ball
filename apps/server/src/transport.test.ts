import assert from "node:assert/strict";
import test from "node:test";

import { decodeEvent, encodeEvent, type ServerEvent } from "@car-ball/protocol";
import { WebSocket } from "ws";

import { createServerRuntime } from "./runtime.ts";
import { createLiveTransportServer } from "./transport.ts";

function createMonotonicNow(startMs: number, deltaMs: number): () => number {
  let current = startMs - deltaMs;

  return () => {
    current += deltaMs;
    return current;
  };
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket open."));
    }, 3_000);

    socket.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForServerEvent(socket: WebSocket, predicate: (event: ServerEvent) => boolean): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for server event."));
    }, 4_000);

    const onMessage = (raw: Buffer): void => {
      try {
        const decoded = decodeEvent(raw.toString("utf8"));
        if (decoded.type === "client.input" || decoded.type === "client.ping" || decoded.type === "client.ready") {
          return;
        }

        if (!predicate(decoded)) {
          return;
        }

        clearTimeout(timeout);
        socket.off("message", onMessage);
        resolve(decoded);
      } catch (error) {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        reject(error);
      }
    };

    socket.on("message", onMessage);
  });
}

function waitForCondition(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for condition."));
      }
    }, 10);
  });
}

test("live transport sends snapshots and accepts valid bound player input", async () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(300_000, 1)
  });
  runtime.createRoomRuntime("room-live-a");
  runtime.attachPlayerIds("room-live-a", ["player-1"]);

  const transport = createLiveTransportServer({
    runtime,
    tickIntervalMs: 2,
  });

  const endpoint = await transport.start();

  const client = new WebSocket(
    `ws://${endpoint.host}:${endpoint.port}${endpoint.path}?roomId=room-live-a&playerId=player-1`,
  );

  try {
    await waitForOpen(client);
    await waitForCondition(() => transport.getMetrics().outboundPackets > 0);

    const inputTick = 1;

    client.send(
      encodeEvent({
        type: "client.input",
        version: 1,
        sequence: 1,
        timestamp: 300_000,
        tick: inputTick,
        playerId: "player-1",
        carId: "car:player-1",
        controls: {
          throttle: 1,
          steer: 0,
          pitch: 0,
          roll: 0,
          jump: false,
          boost: false,
          handbrake: false,
        },
      }),
    );

    await waitForCondition(() => runtime.getValidationTelemetry("room-live-a").accepted > 0);

    const metrics = transport.getMetrics();
    assert(metrics.outboundPackets > 0);
  } finally {
    client.close();
    await transport.stop();
  }
});

test("live transport rejects ownership violations in client.input", async () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(310_000, 1)
  });
  runtime.createRoomRuntime("room-live-b");
  runtime.attachPlayerIds("room-live-b", ["player-1", "player-2"]);

  const transport = createLiveTransportServer({
    runtime,
    tickIntervalMs: 2,
  });

  const endpoint = await transport.start();
  const client = new WebSocket(
    `ws://${endpoint.host}:${endpoint.port}${endpoint.path}?roomId=room-live-b&playerId=player-1`,
  );

  try {
    await waitForOpen(client);
    await waitForServerEvent(client, (event) => event.type === "server.snapshot");

    client.send(
      encodeEvent({
        type: "client.input",
        version: 1,
        sequence: 1,
        timestamp: 310_000,
        tick: 1,
        playerId: "player-2",
        carId: "car:player-2",
        controls: {
          throttle: 1,
          steer: 0,
          pitch: 0,
          roll: 0,
          jump: false,
          boost: false,
          handbrake: false,
        },
      }),
    );

    const errorEvent = await waitForServerEvent(
      client,
      (event) => event.type === "server.error" && event.code === "BAD_MESSAGE",
    );

    assert.equal(errorEvent.type, "server.error");
    assert.match(errorEvent.message, /session player binding/i);
  } finally {
    client.close();
    await transport.stop();
  }
});

test("live transport rejects non-monotonic inbound sequence", async () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(320_000, 1)
  });
  runtime.createRoomRuntime("room-live-c");
  runtime.attachPlayerIds("room-live-c", ["player-1"]);

  const transport = createLiveTransportServer({
    runtime,
    tickIntervalMs: 2,
  });

  const endpoint = await transport.start();
  const client = new WebSocket(
    `ws://${endpoint.host}:${endpoint.port}${endpoint.path}?roomId=room-live-c&playerId=player-1`,
  );

  try {
    await waitForOpen(client);
    await waitForServerEvent(client, (event) => event.type === "server.snapshot");

    client.send(
      encodeEvent({
        type: "client.input",
        version: 1,
        sequence: 2,
        timestamp: 320_000,
        tick: 1,
        playerId: "player-1",
        carId: "car:player-1",
        controls: {
          throttle: 1,
          steer: 0,
          pitch: 0,
          roll: 0,
          jump: false,
          boost: false,
          handbrake: false,
        },
      }),
    );

    client.send(
      encodeEvent({
        type: "client.input",
        version: 1,
        sequence: 1,
        timestamp: 320_001,
        tick: 2,
        playerId: "player-1",
        carId: "car:player-1",
        controls: {
          throttle: 1,
          steer: 0,
          pitch: 0,
          roll: 0,
          jump: false,
          boost: false,
          handbrake: false,
        },
      }),
    );

    const errorEvent = await waitForServerEvent(
      client,
      (event) => event.type === "server.error" && event.code === "BAD_MESSAGE",
    );

    assert.equal(errorEvent.type, "server.error");
    assert.match(errorEvent.message, /inbound sequence must be monotonic/i);
  } finally {
    client.close();
    await transport.stop();
  }
});

test("live transport drops tick snapshots under backpressure", async () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(330_000, 1)
  });
  runtime.createRoomRuntime("room-live-d");
  runtime.attachPlayerIds("room-live-d", ["player-1"]);

  const transport = createLiveTransportServer({
    runtime,
    tickIntervalMs: 2,
    maxBufferedAmountBytes: 0
  });

  const endpoint = await transport.start();
  const client = new WebSocket(
    `ws://${endpoint.host}:${endpoint.port}${endpoint.path}?roomId=room-live-d&playerId=player-1`,
  );

  try {
    await waitForOpen(client);
    await waitForCondition(() => transport.getMetrics().outboundPackets >= 1);

    await new Promise((resolve) => setTimeout(resolve, 40));

    const metrics = transport.getMetrics();
    assert.equal(metrics.outboundPackets, 1);
    assert(metrics.droppedSnapshotsBackpressure > 0);
  } finally {
    client.close();
    await transport.stop();
  }
});

test("live transport accepts restart request via client.ready when match is finished", async () => {
  const runtime = createServerRuntime({
    now: createMonotonicNow(340_000, 1)
  });
  runtime.createRoomRuntime("room-live-e");
  const room = runtime.attachPlayerIds("room-live-e", ["player-1", "player-2"]);

  const transport = createLiveTransportServer({
    runtime,
    tickIntervalMs: 2,
  });

  const endpoint = await transport.start();
  const client = new WebSocket(
    `ws://${endpoint.host}:${endpoint.port}${endpoint.path}?roomId=room-live-e&playerId=player-1`,
  );

  try {
    await waitForOpen(client);
    await waitForServerEvent(client, (event) => event.type === "server.snapshot");

    room.sim.world.clock.remainingSeconds = 0;
    room.sim.world.clock.isOver = true;
    for (let tick = 0; tick < 6; tick += 1) {
      runtime.tickOnce();
    }
    await waitForServerEvent(client, (event) => event.type === "server.snapshot" && event.match.phase === "finished");

    client.send(
      encodeEvent({
        type: "client.ready",
        version: 1,
        sequence: 1,
        timestamp: 340_000,
        playerId: "player-1",
        ready: true,
      }),
    );

    const restartedSnapshot = await waitForServerEvent(
      client,
      (event) => event.type === "server.snapshot" && event.match.phase === "playing" && event.tick === 0,
    );

    assert.equal(restartedSnapshot.type, "server.snapshot");
    assert.equal(restartedSnapshot.match.phase, "playing");
  } finally {
    client.close();
    await transport.stop();
  }
});
