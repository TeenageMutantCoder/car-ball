import type { InputControls } from "@car-ball/protocol";

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
};

const THROTTLE_FORWARD_CODES = new Set(["KeyW"]);
const THROTTLE_REVERSE_CODES = new Set(["KeyS"]);
const STEER_LEFT_CODES = new Set(["KeyA"]);
const STEER_RIGHT_CODES = new Set(["KeyD"]);
const PITCH_DOWN_CODES = new Set(["KeyW"]);
const PITCH_UP_CODES = new Set(["KeyS"]);
const ROLL_LEFT_CODES = new Set(["ArrowLeft"]);
const ROLL_RIGHT_CODES = new Set(["ArrowRight"]);
const JUMP_CODES = new Set(["Space"]);
const BOOST_CODES = new Set(["ArrowUp"]);
const HANDBRAKE_CODES = new Set(["ShiftLeft", "ShiftRight"]);
const CAMERA_TOGGLE_CODES = new Set(["KeyC"]);

type KeyStateCode =
  | "throttle.forward"
  | "throttle.reverse"
  | "steer.left"
  | "steer.right"
  | "pitch.down"
  | "pitch.up"
  | "roll.left"
  | "roll.right"
  | "jump"
  | "boost"
  | "handbrake";

type KeyDownUpListener = (event: KeyboardEvent) => void;

export interface InputBindings {
  getControls: () => InputControls;
  dispose: () => void;
}

export interface InputBindingsOptions {
  target?: KeyboardInputTarget;
  preventDefault?: boolean;
  onCameraToggle?: () => void;
}

export interface KeyboardInputTarget {
  addEventListener: (type: "keydown" | "keyup", listener: KeyDownUpListener) => void;
  removeEventListener: (type: "keydown" | "keyup", listener: KeyDownUpListener) => void;
}

export function createInputBindings(options: InputBindingsOptions = {}): InputBindings {
  const target = resolveKeyboardTarget(options.target);
  const pressedStates = new Set<KeyStateCode>();
  const shouldPreventDefault = options.preventDefault ?? true;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (CAMERA_TOGGLE_CODES.has(event.code)) {
      if (shouldPreventDefault) {
        event.preventDefault();
      }

      if (!event.repeat) {
        options.onCameraToggle?.();
      }

      return;
    }

    const keyStateCodes = mapEventToStateCodes(event.code);
    if (keyStateCodes.length === 0) {
      return;
    }

    if (shouldPreventDefault) {
      event.preventDefault();
    }

    for (const keyStateCode of keyStateCodes) {
      pressedStates.add(keyStateCode);
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    const keyStateCodes = mapEventToStateCodes(event.code);
    if (keyStateCodes.length === 0) {
      return;
    }

    if (shouldPreventDefault) {
      event.preventDefault();
    }

    for (const keyStateCode of keyStateCodes) {
      pressedStates.delete(keyStateCode);
    }
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);

  return {
    getControls(): InputControls {
      return controlsFromPressedStates(pressedStates);
    },
    dispose(): void {
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
      pressedStates.clear();
    },
  };
}

function resolveKeyboardTarget(target: KeyboardInputTarget | undefined): KeyboardInputTarget {
  if (target !== undefined) {
    return target;
  }

  if (typeof window === "undefined") {
    throw new Error("createInputBindings requires a keyboard target outside the browser.");
  }

  return window;
}

function mapEventToStateCodes(code: string): KeyStateCode[] {
  const mapped: KeyStateCode[] = [];

  if (THROTTLE_FORWARD_CODES.has(code)) {
    mapped.push("throttle.forward");
  }

  if (THROTTLE_REVERSE_CODES.has(code)) {
    mapped.push("throttle.reverse");
  }

  if (STEER_LEFT_CODES.has(code)) {
    mapped.push("steer.left");
  }

  if (STEER_RIGHT_CODES.has(code)) {
    mapped.push("steer.right");
  }

  if (PITCH_DOWN_CODES.has(code)) {
    mapped.push("pitch.down");
  }

  if (PITCH_UP_CODES.has(code)) {
    mapped.push("pitch.up");
  }

  if (ROLL_LEFT_CODES.has(code)) {
    mapped.push("roll.left");
  }

  if (ROLL_RIGHT_CODES.has(code)) {
    mapped.push("roll.right");
  }

  if (JUMP_CODES.has(code)) {
    mapped.push("jump");
  }

  if (BOOST_CODES.has(code)) {
    mapped.push("boost");
  }

  if (HANDBRAKE_CODES.has(code)) {
    mapped.push("handbrake");
  }

  return mapped;
}

function controlsFromPressedStates(pressedStates: ReadonlySet<KeyStateCode>): InputControls {
  const throttle = Number(pressedStates.has("throttle.forward")) - Number(pressedStates.has("throttle.reverse"));
  const steer = Number(pressedStates.has("steer.right")) - Number(pressedStates.has("steer.left"));
  const pitch = Number(pressedStates.has("pitch.down")) - Number(pressedStates.has("pitch.up"));
  const roll = Number(pressedStates.has("roll.right")) - Number(pressedStates.has("roll.left"));

  return {
    ...DEFAULT_CONTROLS,
    throttle,
    steer,
    pitch,
    roll,
    jump: pressedStates.has("jump"),
    boost: pressedStates.has("boost"),
    handbrake: pressedStates.has("handbrake"),
  };
}
