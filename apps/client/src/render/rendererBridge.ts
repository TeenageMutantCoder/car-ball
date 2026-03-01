import type { InputFrame, MatchState, Rotation, Snapshot, Vec3 } from "@car-ball/protocol";

export interface RenderCarState {
  id: string;
  ownerPlayerId: string;
  teamId: string;
  position: Vec3;
  velocity: Vec3;
  rotation: Rotation;
  boost: number;
}

export interface RenderBallState {
  id: string;
  position: Vec3;
  velocity: Vec3;
}

export interface RenderSnapshotState {
  sequence: number;
  timestamp: number;
  tick: number;
  match: MatchState;
  cars: RenderCarState[];
  ball: RenderBallState;
}

export class RendererBridge {
  private latestSnapshot: RenderSnapshotState | null = null;
  private latestInputFrame: InputFrame | null = null;

  applySnapshot(snapshot: Snapshot): RenderSnapshotState {
    const normalizedSnapshot = normalizeSnapshot(snapshot);
    this.latestSnapshot = normalizedSnapshot;
    return normalizedSnapshot;
  }

  getLatestSnapshot(): RenderSnapshotState | null {
    return this.latestSnapshot;
  }

  applyInputFrame(inputFrame: InputFrame): InputFrame {
    this.latestInputFrame = cloneInputFrame(inputFrame);
    return this.latestInputFrame;
  }

  getLatestInputFrame(): InputFrame | null {
    return this.latestInputFrame;
  }
}

function normalizeSnapshot(snapshot: Snapshot): RenderSnapshotState {
  const cars = snapshot.cars
    .map((car) => ({
      id: car.id,
      ownerPlayerId: car.ownerPlayerId,
      teamId: car.teamId,
      position: cloneVec3(car.position),
      velocity: cloneVec3(car.velocity),
      rotation: cloneRotation(car.rotation),
      boost: car.boost,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    sequence: snapshot.sequence,
    timestamp: snapshot.timestamp,
    tick: snapshot.tick,
    match: {
      ...snapshot.match,
      scoreByTeam: cloneScoreByTeam(snapshot.match.scoreByTeam),
    },
    cars,
    ball: {
      id: snapshot.ball.id,
      position: cloneVec3(snapshot.ball.position),
      velocity: cloneVec3(snapshot.ball.velocity),
    },
  };
}

function cloneVec3(value: Vec3): Vec3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function cloneRotation(value: Rotation): Rotation {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
    w: value.w,
  };
}

function cloneScoreByTeam(scoreByTeam: MatchState["scoreByTeam"]): MatchState["scoreByTeam"] {
  const cloned: MatchState["scoreByTeam"] = {};

  for (const teamId of Object.keys(scoreByTeam).sort()) {
    cloned[teamId] = scoreByTeam[teamId];
  }

  return cloned;
}

function cloneInputFrame(inputFrame: InputFrame): InputFrame {
  return {
    version: inputFrame.version,
    sequence: inputFrame.sequence,
    timestamp: inputFrame.timestamp,
    tick: inputFrame.tick,
    playerId: inputFrame.playerId,
    carId: inputFrame.carId,
    controls: {
      throttle: inputFrame.controls.throttle,
      steer: inputFrame.controls.steer,
      jump: inputFrame.controls.jump,
      boost: inputFrame.controls.boost,
      handbrake: inputFrame.controls.handbrake,
    },
  };
}