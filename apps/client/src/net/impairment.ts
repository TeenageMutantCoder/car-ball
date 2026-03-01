export interface NetworkImpairmentProfile {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  seed?: number | string;
}

export const BUILTIN_IMPAIRMENT_PROFILES = {
  clean: {
    latencyMs: 0,
    jitterMs: 0,
    packetLossPct: 0,
  },
  loss_5pct: {
    latencyMs: 0,
    jitterMs: 0,
    packetLossPct: 5,
  },
  jitter: {
    latencyMs: 40,
    jitterMs: 20,
    packetLossPct: 0,
  },
} as const satisfies Record<string, NetworkImpairmentProfile>;

export type BuiltinImpairmentProfileName = keyof typeof BUILTIN_IMPAIRMENT_PROFILES;

export interface NetworkImpairmentQueue<TFrame> {
  enqueueOutbound: (frame: TFrame, enqueueTimeMs: number) => void;
  dequeueDeliverable: (timeMs: number) => TFrame[];
  getPendingCount: () => number;
  reset: () => void;
}

interface QueueEntry<TFrame> {
  frame: TFrame;
  deliverAtMs: number;
  dropped: boolean;
}

export function createNetworkImpairmentQueue<TFrame>(
  profileInput: NetworkImpairmentProfile | BuiltinImpairmentProfileName,
): NetworkImpairmentQueue<TFrame> {
  const profile = normalizeProfile(profileInput);
  const random = createDeterministicRandom(profile.seed);
  const queue: QueueEntry<TFrame>[] = [];

  return {
    enqueueOutbound(frame: TFrame, enqueueTimeMs: number): void {
      const normalizedEnqueueTimeMs = Number.isFinite(enqueueTimeMs) ? enqueueTimeMs : 0;
      const dropped = random() < profile.packetLossPct / 100;
      const jitterOffsetMs = profile.jitterMs > 0 ? (random() * 2 - 1) * profile.jitterMs : 0;
      const delayMs = Math.max(0, profile.latencyMs + jitterOffsetMs);

      queue.push({
        frame,
        deliverAtMs: normalizedEnqueueTimeMs + delayMs,
        dropped,
      });
    },

    dequeueDeliverable(timeMs: number): TFrame[] {
      const normalizedTimeMs = Number.isFinite(timeMs) ? timeMs : 0;
      const deliverable: TFrame[] = [];

      while (queue.length > 0) {
        const next = queue[0]!;

        if (next.dropped) {
          queue.shift();
          continue;
        }

        if (next.deliverAtMs > normalizedTimeMs) {
          break;
        }

        deliverable.push(next.frame);
        queue.shift();
      }

      return deliverable;
    },

    getPendingCount(): number {
      return queue.length;
    },

    reset(): void {
      queue.length = 0;
    },
  };
}

function normalizeProfile(
  profileInput: NetworkImpairmentProfile | BuiltinImpairmentProfileName,
): NetworkImpairmentProfile {
  const sourceProfile =
    typeof profileInput === "string" ? BUILTIN_IMPAIRMENT_PROFILES[profileInput] : profileInput;

  if (sourceProfile === undefined) {
    throw new Error(`Unknown impairment profile: ${String(profileInput)}`);
  }

  const latencyMs = normalizeNonNegative(sourceProfile.latencyMs, "latencyMs");
  const jitterMs = normalizeNonNegative(sourceProfile.jitterMs, "jitterMs");
  const packetLossPct = normalizeRange(
    sourceProfile.packetLossPct,
    "packetLossPct",
    0,
    100,
  );

  return {
    latencyMs,
    jitterMs,
    packetLossPct,
    seed: "seed" in sourceProfile ? sourceProfile.seed : undefined,
  };
}

function normalizeNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }

  return value;
}

function normalizeRange(value: number, name: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}.`);
  }

  return value;
}

function createDeterministicRandom(seed: number | string | undefined): () => number {
  let state = createSeedState(seed);

  return (): number => {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createSeedState(seed: number | string | undefined): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error("seed must be a finite number or string.");
    }

    return normalizeUint32(seed);
  }

  if (typeof seed === "string") {
    let hash = 2166136261;
    for (const character of seed) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }

    return normalizeUint32(hash);
  }

  return 0x12345678;
}

function normalizeUint32(value: number): number {
  return (Math.trunc(value) >>> 0) || 1;
}