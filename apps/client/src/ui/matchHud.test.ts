import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatchHud,
  formatTimeRemaining,
  getMatchHudValues,
  getMatchHudValuesForCar,
} from "./matchHud.ts";

class FakeElement {
  style: Record<string, string> = {};
  textContent: string | null = null;
  children: FakeElement[] = [];
  removed = false;

  append(...elements: FakeElement[]): void {
    this.children.push(...elements);
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
    const element = new FakeElement();
    this.created.push(element);
    return element;
  }
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

  assert.equal(fakeDocument.appendedToBody.length, 2);

  const blueScore = fakeDocument.created[2];
  const orangeScore = fakeDocument.created[4];
  const clock = fakeDocument.created[5];
  const boostValue = fakeDocument.created[9];
  const root = fakeDocument.created[0];
  const boostRoot = fakeDocument.created[6];

  assert.equal(blueScore?.textContent, "0");
  assert.equal(orangeScore?.textContent, "0");
  assert.equal(clock?.textContent, "00:00");
  assert.equal(boostValue?.textContent, "0");

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

  hud.dispose();
  assert.equal(root?.removed, true);
  assert.equal(boostRoot?.removed, true);
});
