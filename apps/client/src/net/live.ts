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
  shouldCorrect,
  type CorrectionMetrics,
  type CorrectionTelemetry,
} from "./reconciliation.ts";

const DEFAULT_RECONCILE_THRESHOLD_CM = 20;

export interface LiveClientNetSnapshotApplier<TRenderSnapshot> {
  applySnapshot: (snapshot: Snapshot) => TRenderSnapshot;
}

export interface LiveClientNetOptions {
  playerId: string;
  carId: string;
  now?: () => number;
  reconcileThresholdCm?: number;
  correctionTelemetry?: CorrectionTelemetry;
  getPredictedPosition?: () => Vec3 | null;
}

export interface LiveClientNet<TRenderSnapshot> {
  encodeInputFrame: (frame: InputFrame) => string;
  encodePing: (sequence: number, clientTimeMs?: number) => string;
  ingestServerPayload: (payload: string) => TRenderSnapshot | null;
  getCorrectionMetrics: () => CorrectionMetrics;
  resetCorrectionMetrics: () => void;
}

export function createLiveClientNet<TRenderSnapshot>(
  snapshotApplier: LiveClientNetSnapshotApplier<TRenderSnapshot>,
  options: LiveClientNetOptions,
): LiveClientNet<TRenderSnapshot> {
  const now = options.now ?? Date.now;
  const correctionTelemetry = options.correctionTelemetry ?? createCorrectionTelemetry();
  const configuredThresholdCm = options.reconcileThresholdCm;
  const reconcileThresholdCm = configuredThresholdCm !== undefined && Number.isFinite(configuredThresholdCm)
    ? Math.max(0, configuredThresholdCm)
    : DEFAULT_RECONCILE_THRESHOLD_CM;

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

    ingestServerPayload(payload: string): TRenderSnapshot | null {
      const event = decodeEvent(payload);
      if (event.type !== "server.snapshot") {
        return null;
      }

      recordCorrectionIfNeeded(event);
      return snapshotApplier.applySnapshot(event);
    },

    getCorrectionMetrics(): CorrectionMetrics {
      return correctionTelemetry.getMetrics(Math.round(now()));
    },

    resetCorrectionMetrics(): void {
      correctionTelemetry.reset();
    },
  };
}
