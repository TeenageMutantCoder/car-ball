import assert from "node:assert/strict";
import test from "node:test";

import { createInputBindings } from "./bindings.ts";

type KeyListener = (event: KeyboardEvent) => void;

class FakeKeyboardTarget {
  private readonly listeners: Record<"keydown" | "keyup", Set<KeyListener>> = {
    keydown: new Set(),
    keyup: new Set(),
  };

  addEventListener(type: "keydown" | "keyup", listener: KeyListener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "keydown" | "keyup", listener: KeyListener): void {
    this.listeners[type].delete(listener);
  }

  dispatch(type: "keydown" | "keyup", code: string, repeat = false): { prevented: boolean } {
    let prevented = false;
    const eventLike = {
      code,
      repeat,
      preventDefault(): void {
        prevented = true;
      },
    } as unknown as KeyboardEvent;

    for (const listener of this.listeners[type]) {
      listener(eventLike);
    }

    return { prevented };
  }

  listenersCount(type: "keydown" | "keyup"): number {
    return this.listeners[type].size;
  }
}

test("createInputBindings maps README controls into InputControls values", () => {
  const target = new FakeKeyboardTarget();
  const bindings = createInputBindings({ target });

  target.dispatch("keydown", "KeyW");
  target.dispatch("keydown", "KeyD");
  target.dispatch("keydown", "Space");
  target.dispatch("keydown", "ArrowUp");
  target.dispatch("keydown", "ShiftLeft");

  assert.deepEqual(bindings.getControls(), {
    throttle: 1,
    steer: 1,
    jump: true,
    boost: true,
    handbrake: true,
  });

  target.dispatch("keydown", "KeyS");
  target.dispatch("keydown", "KeyA");
  assert.deepEqual(bindings.getControls(), {
    throttle: 0,
    steer: 0,
    jump: true,
    boost: true,
    handbrake: true,
  });

  target.dispatch("keyup", "Space");
  target.dispatch("keyup", "ArrowUp");
  target.dispatch("keyup", "ShiftLeft");

  assert.deepEqual(bindings.getControls(), {
    throttle: 0,
    steer: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });

  bindings.dispose();
});

test("createInputBindings ignores unrelated keys and only prevents default for mapped controls", () => {
  const target = new FakeKeyboardTarget();
  const bindings = createInputBindings({ target });

  const unrelatedResult = target.dispatch("keydown", "ControlLeft");
  const mappedResult = target.dispatch("keydown", "KeyW");

  assert.equal(unrelatedResult.prevented, false);
  assert.equal(mappedResult.prevented, true);
  assert.deepEqual(bindings.getControls(), {
    throttle: 1,
    steer: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });

  bindings.dispose();
});

test("createInputBindings dispose detaches listeners and resets controls", () => {
  const target = new FakeKeyboardTarget();
  const bindings = createInputBindings({ target });

  target.dispatch("keydown", "KeyW");
  assert.equal(target.listenersCount("keydown"), 1);
  assert.equal(target.listenersCount("keyup"), 1);

  bindings.dispose();

  assert.equal(target.listenersCount("keydown"), 0);
  assert.equal(target.listenersCount("keyup"), 0);
  assert.deepEqual(bindings.getControls(), {
    throttle: 0,
    steer: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });
});

test("createInputBindings invokes camera toggle callback on KeyC keydown only", () => {
  const target = new FakeKeyboardTarget();
  let cameraToggleCount = 0;
  const bindings = createInputBindings({
    target,
    onCameraToggle: () => {
      cameraToggleCount += 1;
    },
  });

  const initial = target.dispatch("keydown", "KeyC");
  const repeated = target.dispatch("keydown", "KeyC", true);
  target.dispatch("keyup", "KeyC");

  assert.equal(initial.prevented, true);
  assert.equal(repeated.prevented, true);
  assert.equal(cameraToggleCount, 1);
  assert.deepEqual(bindings.getControls(), {
    throttle: 0,
    steer: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });

  bindings.dispose();
});
