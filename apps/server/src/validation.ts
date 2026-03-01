import type { InputFrame, PlayerId } from "@car-ball/protocol";
import type { SimulationCore } from "@car-ball/sim";

export const DEFAULT_INPUT_RATE_HZ = 60;
export const DEFAULT_MAX_CONTROL_MAGNITUDE = 1;

export type InputValidationRejectionCode =
  | "IMPOSSIBLE_ACCELERATION"
  | "INVALID_BOOST_USAGE"
  | "COOLDOWN_ABUSE";

export interface InputValidationAccept {
  ok: true;
}

export interface InputValidationReject {
  ok: false;
  code: InputValidationRejectionCode;
  reason: string;
}

export type InputValidationResult = InputValidationAccept | InputValidationReject;

export interface InputValidationTelemetry {
  accepted: number;
  rejected: number;
  rejectedByCode: Record<InputValidationRejectionCode, number>;
}

export interface InputValidationRoomState {
  readonly lastAcceptedTickByPlayerId: Map<PlayerId, number>;
}

export interface ValidateInputFrameContext {
  frame: InputFrame;
  sim: SimulationCore;
  state: InputValidationRoomState;
  minTickDelta: number;
}

const EMPTY_ACCEPT: InputValidationAccept = { ok: true };

export function createInputValidationRoomState(): InputValidationRoomState {
  return {
    lastAcceptedTickByPlayerId: new Map<PlayerId, number>()
  };
}

export function createInputValidationTelemetry(): InputValidationTelemetry {
  return {
    accepted: 0,
    rejected: 0,
    rejectedByCode: {
      IMPOSSIBLE_ACCELERATION: 0,
      INVALID_BOOST_USAGE: 0,
      COOLDOWN_ABUSE: 0
    }
  };
}

export function createInputValidationTelemetryAccumulator(
  snapshots: InputValidationTelemetry[]
): InputValidationTelemetry {
  const totals = createInputValidationTelemetry();

  for (const telemetry of snapshots) {
    totals.accepted += telemetry.accepted;
    totals.rejected += telemetry.rejected;

    totals.rejectedByCode.IMPOSSIBLE_ACCELERATION += telemetry.rejectedByCode.IMPOSSIBLE_ACCELERATION;
    totals.rejectedByCode.INVALID_BOOST_USAGE += telemetry.rejectedByCode.INVALID_BOOST_USAGE;
    totals.rejectedByCode.COOLDOWN_ABUSE += telemetry.rejectedByCode.COOLDOWN_ABUSE;
  }

  return totals;
}

export function recordValidationResult(
  telemetry: InputValidationTelemetry,
  result: InputValidationResult
): void {
  if (result.ok) {
    telemetry.accepted += 1;
    return;
  }

  telemetry.rejected += 1;
  telemetry.rejectedByCode[result.code] += 1;
}

export function minInputTickDelta(tickRateHz: number, inputRateHz = DEFAULT_INPUT_RATE_HZ): number {
  if (!Number.isFinite(tickRateHz) || tickRateHz <= 0) {
    throw new Error(`tickRateHz must be > 0. Received: ${tickRateHz}`);
  }

  if (!Number.isFinite(inputRateHz) || inputRateHz <= 0) {
    throw new Error(`inputRateHz must be > 0. Received: ${inputRateHz}`);
  }

  return Math.max(1, Math.ceil(tickRateHz / inputRateHz));
}

function reject(code: InputValidationRejectionCode, reason: string): InputValidationReject {
  return {
    ok: false,
    code,
    reason
  };
}

function hasImpossibleAcceleration(frame: InputFrame): InputValidationReject | null {
  const { throttle, steer } = frame.controls;

  if (!Number.isFinite(throttle) || Math.abs(throttle) > DEFAULT_MAX_CONTROL_MAGNITUDE) {
    return reject(
      "IMPOSSIBLE_ACCELERATION",
      `throttle must be finite and within [-${DEFAULT_MAX_CONTROL_MAGNITUDE}, ${DEFAULT_MAX_CONTROL_MAGNITUDE}].`
    );
  }

  if (!Number.isFinite(steer) || Math.abs(steer) > DEFAULT_MAX_CONTROL_MAGNITUDE) {
    return reject(
      "IMPOSSIBLE_ACCELERATION",
      `steer must be finite and within [-${DEFAULT_MAX_CONTROL_MAGNITUDE}, ${DEFAULT_MAX_CONTROL_MAGNITUDE}].`
    );
  }

  return null;
}

function hasCooldownAbuse(
  frame: InputFrame,
  state: InputValidationRoomState,
  minTickDelta: number
): InputValidationReject | null {
  const previousTick = state.lastAcceptedTickByPlayerId.get(frame.playerId);
  if (previousTick === undefined) {
    return null;
  }

  const tickDelta = frame.tick - previousTick;
  if (tickDelta >= minTickDelta) {
    return null;
  }

  return reject(
    "COOLDOWN_ABUSE",
    `input cadence exceeded: tick delta ${tickDelta} is below minimum ${minTickDelta}.`
  );
}

function hasInvalidBoostUsage(frame: InputFrame, sim: SimulationCore): InputValidationReject | null {
  if (!frame.controls.boost) {
    return null;
  }

  const car = sim.world.cars[frame.carId];
  if (!car) {
    return reject("INVALID_BOOST_USAGE", `car ${frame.carId} not found in authoritative world.`);
  }

  if (car.playerId !== frame.playerId) {
    return reject("INVALID_BOOST_USAGE", `car ${frame.carId} is not owned by player ${frame.playerId}.`);
  }

  if (frame.tick > sim.world.clock.tick + 1) {
    return null;
  }

  if (car.boost <= 0) {
    return reject("INVALID_BOOST_USAGE", `boost requested with depleted reserve for tick ${frame.tick}.`);
  }

  return null;
}

export function validateInputFrame(context: ValidateInputFrameContext): InputValidationResult {
  const { frame, sim, state, minTickDelta } = context;

  const impossibleAcceleration = hasImpossibleAcceleration(frame);
  if (impossibleAcceleration) {
    return impossibleAcceleration;
  }

  const invalidBoostUsage = hasInvalidBoostUsage(frame, sim);
  if (invalidBoostUsage) {
    return invalidBoostUsage;
  }

  const cooldownAbuse = hasCooldownAbuse(frame, state, minTickDelta);
  if (cooldownAbuse) {
    return cooldownAbuse;
  }

  state.lastAcceptedTickByPlayerId.set(frame.playerId, frame.tick);
  return EMPTY_ACCEPT;
}
