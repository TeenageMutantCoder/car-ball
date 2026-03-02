import type { InputControls } from "@car-ball/protocol";

const DEFAULT_CONTROLS: InputControls = {
  throttle: 0,
  steer: 0,
  jump: false,
  boost: false,
  handbrake: false,
};

const THROTTLE_FORWARD_CODES = new Set(["KeyW"]);
const THROTTLE_REVERSE_CODES = new Set(["KeyS"]);
const STEER_LEFT_CODES = new Set(["KeyA"]);
const STEER_RIGHT_CODES = new Set(["KeyD"]);
const JUMP_CODES = new Set(["Space"]);
const BOOST_CODES = new Set(["ArrowUp"]);
const HANDBRAKE_CODES = new Set(["ShiftLeft", "ShiftRight"]);
const CAMERA_TOGGLE_CODES = new Set(["KeyC"]);

type KeyStateCode =
  | "throttle.forward"
  | "throttle.reverse"
  | "steer.left"
  | "steer.right"
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

    const keyStateCode = mapEventToStateCode(event.code);
    if (keyStateCode === undefined) {
      return;
    }

    if (shouldPreventDefault) {
      event.preventDefault();
    }

    pressedStates.add(keyStateCode);
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    const keyStateCode = mapEventToStateCode(event.code);
    if (keyStateCode === undefined) {
      return;
    }

    if (shouldPreventDefault) {
      event.preventDefault();
    }

    pressedStates.delete(keyStateCode);
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

function mapEventToStateCode(code: string): KeyStateCode | undefined {
  if (THROTTLE_FORWARD_CODES.has(code)) {
    return "throttle.forward";
  }

  if (THROTTLE_REVERSE_CODES.has(code)) {
    return "throttle.reverse";
  }

  if (STEER_LEFT_CODES.has(code)) {
    return "steer.left";
  }

  if (STEER_RIGHT_CODES.has(code)) {
    return "steer.right";
  }

  if (JUMP_CODES.has(code)) {
    return "jump";
  }

  if (BOOST_CODES.has(code)) {
    return "boost";
  }

  if (HANDBRAKE_CODES.has(code)) {
    return "handbrake";
  }

  return undefined;
}

function controlsFromPressedStates(pressedStates: ReadonlySet<KeyStateCode>): InputControls {
  const throttle = Number(pressedStates.has("throttle.forward")) - Number(pressedStates.has("throttle.reverse"));
  const steer = Number(pressedStates.has("steer.right")) - Number(pressedStates.has("steer.left"));

  return {
    ...DEFAULT_CONTROLS,
    throttle,
    steer,
    jump: pressedStates.has("jump"),
    boost: pressedStates.has("boost"),
    handbrake: pressedStates.has("handbrake"),
  };
}
