import {
  decodeEvent,
  encodeEvent,
  type InputFrame,
  type Snapshot,
  type Vec3,
} from "@car-ball/protocol";

import {
  computePositionErrorCm,
  createCorrectionTelemetry,
  resolveReconciliationTuning,
  shouldCorrect,
  type CorrectionMetrics,
  type CorrectionTelemetry,
  type ReconciliationProfile,
} from "./reconciliation.ts";

const DEFAULT_RECONCILE_THRESHOLD_CM = 20;
const DEFAULT_RECONCILIATION_PROFILE: ReconciliationProfile = "clean";

export interface LiveClientNetSnapshotApplier<TRenderSnapshot> {
  applySnapshot: (snapshot: Snapshot) => TRenderSnapshot;
}

export interface LiveClientNetOptions {
  playerId: string;
  carId: string;
  now?: () => number;
  reconcileThresholdCm?: number;
  reconciliationProfile?: ReconciliationProfile;
  rapierBallAuthority?: boolean;
  correctionTelemetry?: CorrectionTelemetry;
  getPredictedPosition?: () => Vec3 | null;
}

export interface LiveClientNet<TRenderSnapshot> {
  encodeInputFrame: (frame: InputFrame) => string;
  encodePing: (sequence: number, clientTimeMs?: number) => string;
  encodeReady: (sequence: number, ready?: boolean, playerId?: string) => string;
  ingestServerPayload: (payload: string) => TRenderSnapshot | null;
  getCorrectionMetrics: () => CorrectionMetrics;
  resetCorrectionMetrics: () => void;
}

export function createLiveClientNet<TRenderSnapshot>(
  snapshotApplier: LiveClientNetSnapshotApplier<TRenderSnapshot>,
  options: LiveClientNetOptions,
): LiveClientNet<TRenderSnapshot> {
  const now = options.now ?? Date.now;
  const reconciliationProfile = options.reconciliationProfile ?? DEFAULT_RECONCILIATION_PROFILE;
  const rapierBallAuthority = options.rapierBallAuthority ?? true;
  const tuning = resolveReconciliationTuning({
    profile: reconciliationProfile,
    rapierBallAuthority
  });
  const configuredThresholdCm = options.reconcileThresholdCm;
  const reconcileThresholdCm = configuredThresholdCm !== undefined && Number.isFinite(configuredThresholdCm)
    ? Math.max(0, configuredThresholdCm)
    : Math.max(0, tuning.deadzoneCm || DEFAULT_RECONCILE_THRESHOLD_CM);
  const correctionTelemetry = options.correctionTelemetry ?? createCorrectionTelemetry(undefined, {
    rapierBallAuthority,
    deadzoneCm: reconcileThresholdCm,
    smoothingAlpha: tuning.smoothingAlpha
  });
  let lastSnapshotMatchId: string | null = null;
  let lastSnapshotTick = -1;
  let lastSnapshotSequence = -1;
  let lastSnapshotTimestamp = -1;

  const recordCorrectionIfNeeded = (snapshot: Snapshot): void => {
    if (!options.getPredictedPosition) {
      return;
    }

    const predictedPosition = options.getPredictedPosition();
    if (!predictedPosition) {
      return;
    }

    const authoritativeCar = snapshot.cars.find((car) => car.id === options.carId && car.ownerPlayerId === options.playerId);
    if (!authoritativeCar) {
      return;
    }

    const positionErrorCm = computePositionErrorCm(predictedPosition, authoritativeCar.position);
    if (!shouldCorrect(positionErrorCm, reconcileThresholdCm)) {
      return;
    }

    correctionTelemetry.recordCorrection(positionErrorCm, Math.round(now()));
  };

  const isStaleSnapshot = (snapshot: Snapshot): boolean => {
    const snapshotMatchId = snapshot.match.matchId;

    if (lastSnapshotMatchId !== snapshotMatchId) {
      return false;
    }

    const likelyStreamReset =
      lastSnapshotSequence >= 8 &&
      snapshot.sequence <= 2 &&
      lastSnapshotTick >= 8 &&
      snapshot.tick <= 2 &&
      snapshot.timestamp >= lastSnapshotTimestamp;

    if (likelyStreamReset) {
      return false;
    }

    if (snapshot.tick < lastSnapshotTick) {
      return true;
    }

    if (snapshot.tick === lastSnapshotTick && snapshot.sequence <= lastSnapshotSequence) {
      return true;
    }

    return false;
  };

  const markSnapshotApplied = (snapshot: Snapshot): void => {
    lastSnapshotMatchId = snapshot.match.matchId;
    lastSnapshotTick = snapshot.tick;
    lastSnapshotSequence = snapshot.sequence;
    lastSnapshotTimestamp = snapshot.timestamp;
  };

  return {
    encodeInputFrame(frame: InputFrame): string {
      return encodeEvent({
        type: "client.input",
        ...frame,
      });
    },

    encodePing(sequence: number, clientTimeMs = now()): string {
      return encodeEvent({
        type: "client.ping",
        version: 1,
        sequence,
        timestamp: Math.round(now()),
        clientTimeMs,
      });
    },

    encodeReady(sequence: number, ready = true, playerId = options.playerId): string {
      return encodeEvent({
        type: "client.ready",
        version: 1,
        sequence,
        timestamp: Math.round(now()),
        playerId,
        ready,
      });
    },

    ingestServerPayload(payload: string): TRenderSnapshot | null {
      const event = decodeEvent(payload);
      if (event.type !== "server.snapshot") {
        return null;
      }

      if (isStaleSnapshot(event)) {
        return null;
      }

      recordCorrectionIfNeeded(event);
      const applied = snapshotApplier.applySnapshot(event);
      markSnapshotApplied(event);
      return applied;
    },

    getCorrectionMetrics(): CorrectionMetrics {
      return correctionTelemetry.getMetrics(Math.round(now()));
    },

    resetCorrectionMetrics(): void {
      correctionTelemetry.reset();
    },
  };
}
