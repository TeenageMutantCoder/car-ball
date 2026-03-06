import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatchHud,
  formatTimeRemaining,
  getMatchHudValues,
  getMatchHudValuesForCar,
} from "./matchHud.ts";

class FakeElement {
  readonly tagName: string;
  style: Record<string, string> = {};
  textContent: string | null = null;
  children: FakeElement[] = [];
  removed = false;
  private listeners = new Map<string, Array<() => void>>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...elements: FakeElement[]): void {
    this.children.push(...elements);
  }

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type);
    if (existing) {
      existing.push(listener);
      return;
    }

    this.listeners.set(type, [listener]);
  }

  trigger(type: string): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener();
    }
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeDocument {
  readonly created: FakeElement[] = [];
  readonly appendedToBody: FakeElement[] = [];

  readonly body = {
    append: (element: FakeElement): void => {
      this.appendedToBody.push(element);
    },
  };

  createElement(_tagName: string): FakeElement {
    const element = new FakeElement(_tagName);
    this.created.push(element);
    return element;
  }
}

function findElementByText(
  elements: readonly FakeElement[],
  textContent: string,
  tagName?: string,
): FakeElement {
  const element = elements.find(
    (candidate) => candidate.textContent === textContent && (tagName === undefined || candidate.tagName === tagName),
  );
  assert.ok(element, `Expected to find element with text \"${textContent}\".`);
  return element;
}

test("formatTimeRemaining clamps invalid values and formats mm:ss", () => {
  assert.equal(formatTimeRemaining(0), "00:00");
  assert.equal(formatTimeRemaining(59_999), "00:59");
  assert.equal(formatTimeRemaining(60_000), "01:00");
  assert.equal(formatTimeRemaining(-1), "00:00");
  assert.equal(formatTimeRemaining(Number.NaN), "00:00");
});

test("getMatchHudValues maps team scores and time remaining", () => {
  const values = getMatchHudValues({
    match: {
      matchId: "match-main",
      phase: "playing",
      tick: 100,
      scoreByTeam: {
        "team:blue": 2,
        "team:orange": 1,
      },
      timeRemainingMs: 91_250,
    },
  });

  assert.deepEqual(values, {
    blueScore: 2,
    orangeScore: 1,
    clock: "01:31",
    boost: 0,
  });
});

test("getMatchHudValuesForCar returns clamped local car boost", () => {
  const values = getMatchHudValuesForCar(
    {
      match: {
        matchId: "match-main",
        phase: "playing",
        tick: 100,
        scoreByTeam: {
          "team:blue": 2,
          "team:orange": 1,
        },
        timeRemainingMs: 91_250,
      },
      cars: [
        {
          id: "car:player-1",
          ownerPlayerId: "player-1",
          teamId: "team:blue",
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          boost: 132.4,
          onGround: true,
          tractionAttached: false,
        },
      ],
    },
    "car:player-1",
  );

  assert.deepEqual(values, {
    blueScore: 2,
    orangeScore: 1,
    clock: "01:31",
    boost: 100,
  });
});

test("createMatchHud updates scoreboard and removes root on dispose", () => {
  const fakeDocument = new FakeDocument();
  const hud = createMatchHud(fakeDocument as never, "car:player-1");

  assert.equal(fakeDocument.appendedToBody.length, 3);

  const blueScore = findElementByText(fakeDocument.created, "0");
  const orangeScore = fakeDocument.created.filter((element) => element.textContent === "0")[1];
  const clock = findElementByText(fakeDocument.created, "00:00");
  const boostValue = fakeDocument.created.find(
    (element) => element.textContent === "0" && element.style.fontSize === "28px",
  );
  const restartButton = findElementByText(fakeDocument.created, "Restart game", "button");
  const root = fakeDocument.appendedToBody[0];
  const boostRoot = fakeDocument.appendedToBody[1];
  const gameOverRoot = fakeDocument.appendedToBody[2];

  assert.equal(blueScore?.textContent, "0");
  assert.equal(orangeScore?.textContent, "0");
  assert.equal(clock?.textContent, "00:00");
  assert.equal(boostValue?.textContent, "0");
  assert.equal(gameOverRoot?.style.display, "none");
  assert.equal(restartButton.textContent, "Restart game");

  hud.update({
    sequence: 1,
    timestamp: 1,
    tick: 1,
    match: {
      matchId: "match-main",
      phase: "playing",
      tick: 1,
      scoreByTeam: {
        "team:blue": 3,
        "team:orange": 4,
      },
      timeRemainingMs: 83_999,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 72.8,
        onGround: true,
        tractionAttached: false,
      },
    ],
    ball: {
      id: "ball-main",
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  });

  assert.equal(blueScore?.textContent, "3");
  assert.equal(orangeScore?.textContent, "4");
  assert.equal(clock?.textContent, "01:23");
  assert.equal(boostValue?.textContent, "73");
  assert.equal(gameOverRoot?.style.display, "none");

  hud.update({
    sequence: 2,
    timestamp: 2,
    tick: 2,
    match: {
      matchId: "match-main",
      phase: "finished",
      tick: 2,
      scoreByTeam: {
        "team:blue": 3,
        "team:orange": 4,
      },
      timeRemainingMs: 0,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 72.8,
        onGround: true,
        tractionAttached: false,
      },
    ],
    ball: {
      id: "ball-main",
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  });

  assert.equal(gameOverRoot?.style.display, "flex");

  hud.dispose();
  assert.equal(root?.removed, true);
  assert.equal(boostRoot?.removed, true);
  assert.equal(gameOverRoot?.removed, true);
});

test("createMatchHud restart button invokes onRestart when match is finished", () => {
  const fakeDocument = new FakeDocument();
  let restartCalls = 0;
  const hud = createMatchHud(fakeDocument as never, "car:player-1", {
    onRestart: () => {
      restartCalls += 1;
    },
  });

  hud.update({
    sequence: 1,
    timestamp: 1,
    tick: 1,
    match: {
      matchId: "match-main",
      phase: "finished",
      tick: 1,
      scoreByTeam: {
        "team:blue": 0,
        "team:orange": 0,
      },
      timeRemainingMs: 0,
    },
    cars: [
      {
        id: "car:player-1",
        ownerPlayerId: "player-1",
        teamId: "team:blue",
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        boost: 0,
        onGround: true,
        tractionAttached: false,
      },
    ],
    ball: {
      id: "ball-main",
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  });

  const restartButton = findElementByText(fakeDocument.created, "Restart game", "button");
  restartButton.trigger("click");

  assert.equal(restartCalls, 1);

  hud.dispose();
});
