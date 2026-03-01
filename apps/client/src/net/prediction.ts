import type { InputFrame, Sequence, Tick } from "@car-ball/protocol";

const DEFAULT_CAPACITY = 256;

export interface PredictionHistoryRange {
  startSequence?: Sequence;
  endSequence?: Sequence;
  startTick?: Tick;
  endTick?: Tick;
}

export interface PredictionTrimBefore {
  sequence?: Sequence;
  tick?: Tick;
}

export interface PredictionReplayQuery {
  afterSequence?: Sequence;
  afterTick?: Tick;
}

export interface PredictionHistory {
  readonly capacity: number;
  enqueue: (frame: InputFrame) => InputFrame;
  getRange: (range?: PredictionHistoryRange) => InputFrame[];
  trimBefore: (trim: PredictionTrimBefore) => number;
  getReplayFrames: (query?: PredictionReplayQuery) => InputFrame[];
  getSize: () => number;
}

export interface PredictionHistoryOptions {
  capacity?: number;
}

export function createPredictionHistory(options: PredictionHistoryOptions = {}): PredictionHistory {
  const capacity = normalizeCapacity(options.capacity);
  const frames: InputFrame[] = [];

  const clone = (frame: InputFrame): InputFrame => ({
    version: frame.version,
    sequence: frame.sequence,
    timestamp: frame.timestamp,
    tick: frame.tick,
    playerId: frame.playerId,
    carId: frame.carId,
    controls: {
      throttle: frame.controls.throttle,
      steer: frame.controls.steer,
      jump: frame.controls.jump,
      boost: frame.controls.boost,
      handbrake: frame.controls.handbrake,
    },
  });

  const findSequenceIndex = (sequence: Sequence): number => {
    let low = 0;
    let high = frames.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midSequence = frames[mid]!.sequence;

      if (midSequence === sequence) {
        return mid;
      }

      if (midSequence < sequence) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return -low - 1;
  };

  const trimToCapacity = (): void => {
    while (frames.length > capacity) {
      frames.shift();
    }
  };

  return {
    capacity,
    enqueue(frame: InputFrame): InputFrame {
      const next = clone(frame);
      const foundIndex = findSequenceIndex(next.sequence);

      if (foundIndex >= 0) {
        frames[foundIndex] = next;
      } else {
        const insertAt = Math.abs(foundIndex + 1);
        frames.splice(insertAt, 0, next);
        trimToCapacity();
      }

      return clone(next);
    },

    getRange(range: PredictionHistoryRange = {}): InputFrame[] {
      return frames
        .filter((frame) => {
          if (range.startSequence !== undefined && frame.sequence < range.startSequence) {
            return false;
          }

          if (range.endSequence !== undefined && frame.sequence > range.endSequence) {
            return false;
          }

          if (range.startTick !== undefined && frame.tick < range.startTick) {
            return false;
          }

          if (range.endTick !== undefined && frame.tick > range.endTick) {
            return false;
          }

          return true;
        })
        .map(clone);
    },

    trimBefore(trim: PredictionTrimBefore): number {
      if (trim.sequence === undefined && trim.tick === undefined) {
        return 0;
      }

      const previousLength = frames.length;

      const retained = frames.filter((frame) => {
        if (trim.sequence !== undefined && frame.sequence < trim.sequence) {
          return false;
        }

        if (trim.tick !== undefined && frame.tick < trim.tick) {
          return false;
        }

        return true;
      });

      frames.length = 0;
      frames.push(...retained);

      return previousLength - frames.length;
    },

    getReplayFrames(query: PredictionReplayQuery = {}): InputFrame[] {
      return frames
        .filter((frame) => {
          if (query.afterSequence !== undefined && frame.sequence <= query.afterSequence) {
            return false;
          }

          if (query.afterTick !== undefined && frame.tick <= query.afterTick) {
            return false;
          }

          return true;
        })
        .map(clone);
    },

    getSize(): number {
      return frames.length;
    },
  };
}

function normalizeCapacity(capacity: number | undefined): number {
  if (capacity === undefined) {
    return DEFAULT_CAPACITY;
  }

  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error("Prediction history capacity must be a positive integer.");
  }

  return capacity;
}