import { PROTOCOL_VERSION, type InputControls, type InputFrame, type ProtocolVersion, type Tick } from "@car-ball/protocol";

export interface InputFrameEmitter {
  emit: (tick: Tick, controls: InputControls) => InputFrame;
  getNextSequence: () => number;
  takeNextSequence: () => number;
}

export interface InputFrameEmitterOptions {
  playerId: string;
  carId: string;
  protocolVersion?: ProtocolVersion;
  now?: () => number;
  initialSequence?: number;
}

export function createInputFrameEmitter(options: InputFrameEmitterOptions): InputFrameEmitter {
  const version = options.protocolVersion ?? PROTOCOL_VERSION;
  const now = options.now ?? Date.now;
  let nextSequence = options.initialSequence ?? 1;

  return {
    emit(tick: Tick, controls: InputControls): InputFrame {
      const sequence = nextSequence;
      nextSequence += 1;

      return {
        version,
        sequence,
        timestamp: now(),
        tick,
        playerId: options.playerId,
        carId: options.carId,
        controls: {
          throttle: controls.throttle,
          steer: controls.steer,
          pitch: controls.pitch,
          roll: controls.roll,
          jump: controls.jump,
          boost: controls.boost,
          handbrake: controls.handbrake,
        },
      };
    },
    getNextSequence(): number {
      return nextSequence;
    },
    takeNextSequence(): number {
      const sequence = nextSequence;
      nextSequence += 1;
      return sequence;
    },
  };
}
