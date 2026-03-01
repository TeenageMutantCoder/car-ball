import assert from "node:assert/strict";
import test from "node:test";

import {
  createRoom,
  endMatch,
  joinRoom,
  leaveRoom,
  setPlayerReady,
  startMatch,
  TEAM_A_ID,
  TEAM_B_ID,
  type RoomState,
  type RoomTransitionResult
} from "./room.ts";

function assertSuccess(result: RoomTransitionResult): RoomState {
  assert.equal(result.ok, true);
  return result.room;
}

test("two clients complete create/join/ready/start/end/leave lifecycle", () => {
  let room = createRoom({ roomId: "room-1", minPlayers: 2, maxPlayers: 2 });

  room = assertSuccess(joinRoom(room, "player-1"));
  room = assertSuccess(joinRoom(room, "player-2"));

  assert.equal(room.players[0]?.teamId, TEAM_A_ID);
  assert.equal(room.players[1]?.teamId, TEAM_B_ID);

  room = assertSuccess(setPlayerReady(room, "player-1", true));
  room = assertSuccess(setPlayerReady(room, "player-2", true));
  room = assertSuccess(startMatch(room, { durationMs: 120_000 }));

  assert.equal(room.match.phase, "playing");
  assert.equal(room.match.matchId, "room-1:match:1");
  assert.deepEqual(room.match.scoreByTeam, {
    [TEAM_A_ID]: 0,
    [TEAM_B_ID]: 0
  });

  room = assertSuccess(endMatch(room));
  assert.equal(room.match.phase, "finished");

  room = assertSuccess(leaveRoom(room, "player-2"));
  room = assertSuccess(leaveRoom(room, "player-1"));
  assert.equal(room.players.length, 0);
});

test("start fails when all players are not ready", () => {
  let room = createRoom({ roomId: "room-2" });
  room = assertSuccess(joinRoom(room, "player-1"));
  room = assertSuccess(joinRoom(room, "player-2"));
  room = assertSuccess(setPlayerReady(room, "player-1", true));

  const startResult = startMatch(room);
  assert.equal(startResult.ok, false);
  assert.equal(startResult.code, "PLAYER_NOT_READY");
});

test("join fails after match start and leave can force finished phase", () => {
  let room = createRoom({ roomId: "room-3", minPlayers: 2 });
  room = assertSuccess(joinRoom(room, "player-1"));
  room = assertSuccess(joinRoom(room, "player-2"));
  room = assertSuccess(setPlayerReady(room, "player-1", true));
  room = assertSuccess(setPlayerReady(room, "player-2", true));
  room = assertSuccess(startMatch(room));

  const joinAfterStart = joinRoom(room, "player-3");
  assert.equal(joinAfterStart.ok, false);
  assert.equal(joinAfterStart.code, "ROOM_LOCKED");

  room = assertSuccess(leaveRoom(room, "player-2"));
  assert.equal(room.match.phase, "finished");
});
