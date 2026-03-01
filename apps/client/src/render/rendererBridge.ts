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
  private previousSnapshot: RenderSnapshotState | null = null;
  private currentSnapshot: RenderSnapshotState | null = null;
  private latestInputFrame: InputFrame | null = null;

  applySnapshot(snapshot: Snapshot): RenderSnapshotState {
    const normalizedSnapshot = normalizeSnapshot(snapshot);
    this.previousSnapshot = this.currentSnapshot;
    this.currentSnapshot = normalizedSnapshot;
    return normalizedSnapshot;
  }

  getLatestSnapshot(): RenderSnapshotState | null {
    return this.currentSnapshot;
  }

  getPreviousSnapshot(): RenderSnapshotState | null {
    return this.previousSnapshot;
  }

  getInterpolatedSnapshot(alpha: number): RenderSnapshotState | null {
    const current = this.currentSnapshot;
    if (current === null) {
      return null;
    }

    const previous = this.previousSnapshot;
    if (previous === null) {
      return cloneRenderSnapshot(current);
    }

    return interpolateSnapshots(previous, current, alpha);
  }

  applyInputFrame(inputFrame: InputFrame): InputFrame {
    this.latestInputFrame = cloneInputFrame(inputFrame);
    return this.latestInputFrame;
  }

  getLatestInputFrame(): InputFrame | null {
    return this.latestInputFrame;
  }
}

export function interpolateSnapshots(
  previous: RenderSnapshotState,
  current: RenderSnapshotState,
  alpha: number,
): RenderSnapshotState {
  const clampedAlpha = clampAlpha(alpha);
  const previousCarsById = new Map(previous.cars.map((car) => [car.id, car]));
  const currentCarsById = new Map(current.cars.map((car) => [car.id, car]));
  const carIds = new Set([...previousCarsById.keys(), ...currentCarsById.keys()]);
  const cars = [...carIds]
    .sort((left, right) => left.localeCompare(right))
    .map((carId) => interpolateCar(previousCarsById.get(carId), currentCarsById.get(carId), clampedAlpha));

  return {
    sequence: current.sequence,
    timestamp: current.timestamp,
    tick: current.tick,
    match: {
      ...current.match,
      scoreByTeam: cloneScoreByTeam(current.match.scoreByTeam),
    },
    cars,
    ball: {
      id: current.ball.id,
      position: interpolateVec3(previous.ball.position, current.ball.position, clampedAlpha),
      velocity: interpolateVec3(previous.ball.velocity, current.ball.velocity, clampedAlpha),
    },
  };
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

function cloneRenderSnapshot(snapshot: RenderSnapshotState): RenderSnapshotState {
  return {
    sequence: snapshot.sequence,
    timestamp: snapshot.timestamp,
    tick: snapshot.tick,
    match: {
      ...snapshot.match,
      scoreByTeam: cloneScoreByTeam(snapshot.match.scoreByTeam),
    },
    cars: snapshot.cars.map((car) => ({
      id: car.id,
      ownerPlayerId: car.ownerPlayerId,
      teamId: car.teamId,
      position: cloneVec3(car.position),
      velocity: cloneVec3(car.velocity),
      rotation: cloneRotation(car.rotation),
      boost: car.boost,
    })),
    ball: {
      id: snapshot.ball.id,
      position: cloneVec3(snapshot.ball.position),
      velocity: cloneVec3(snapshot.ball.velocity),
    },
  };
}

function interpolateCar(
  previous: RenderCarState | undefined,
  current: RenderCarState | undefined,
  alpha: number,
): RenderCarState {
  if (previous === undefined && current === undefined) {
    throw new Error("Expected at least one car state to interpolate.");
  }

  if (previous === undefined) {
    return {
      id: current!.id,
      ownerPlayerId: current!.ownerPlayerId,
      teamId: current!.teamId,
      position: cloneVec3(current!.position),
      velocity: cloneVec3(current!.velocity),
      rotation: cloneRotation(current!.rotation),
      boost: current!.boost,
    };
  }

  if (current === undefined) {
    return {
      id: previous.id,
      ownerPlayerId: previous.ownerPlayerId,
      teamId: previous.teamId,
      position: cloneVec3(previous.position),
      velocity: cloneVec3(previous.velocity),
      rotation: cloneRotation(previous.rotation),
      boost: previous.boost,
    };
  }

  return {
    id: current.id,
    ownerPlayerId: current.ownerPlayerId,
    teamId: current.teamId,
    position: interpolateVec3(previous.position, current.position, alpha),
    velocity: interpolateVec3(previous.velocity, current.velocity, alpha),
    rotation: normalizeRotation({
      x: interpolateNumber(previous.rotation.x, current.rotation.x, alpha),
      y: interpolateNumber(previous.rotation.y, current.rotation.y, alpha),
      z: interpolateNumber(previous.rotation.z, current.rotation.z, alpha),
      w: interpolateNumber(previous.rotation.w, current.rotation.w, alpha),
    }),
    boost: interpolateNumber(previous.boost, current.boost, alpha),
  };
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) {
    return 0;
  }

  if (alpha <= 0) {
    return 0;
  }

  if (alpha >= 1) {
    return 1;
  }

  return alpha;
}

function interpolateNumber(previous: number, current: number, alpha: number): number {
  return previous + (current - previous) * alpha;
}

function interpolateVec3(previous: Vec3, current: Vec3, alpha: number): Vec3 {
  return {
    x: interpolateNumber(previous.x, current.x, alpha),
    y: interpolateNumber(previous.y, current.y, alpha),
    z: interpolateNumber(previous.z, current.z, alpha),
  };
}

function normalizeRotation(rotation: Rotation): Rotation {
  const magnitude = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (magnitude === 0) {
    return {
      x: 0,
      y: 0,
      z: 0,
      w: 1,
    };
  }

  return {
    x: rotation.x / magnitude,
    y: rotation.y / magnitude,
    z: rotation.z / magnitude,
    w: rotation.w / magnitude,
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