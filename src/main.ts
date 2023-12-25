import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  type Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from "@babylonjs/core";

class App {
  readonly #canvas: HTMLCanvasElement;
  readonly #engine: Engine;
  readonly #scene: Scene;

  constructor() {
    this.#canvas = this.#createCanvas();
    this.#engine = new Engine(this.#canvas, true);
    this.#scene = this.#createScene();

    this.#addInspectorListener();
  }

  #createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.id = "gameCanvas";
    document.body.appendChild(canvas);
    return canvas;
  }

  #createScene(): Scene {
    const scene = new Scene(this.#engine);

    const camera: ArcRotateCamera = new ArcRotateCamera(
      "Camera",
      Math.PI / 2,
      (3 * Math.PI) / 8,
      50,
      Vector3.Zero(),
      scene,
    );
    camera.attachControl(this.#canvas, true);

    const light1: HemisphericLight = new HemisphericLight(
      "light1",
      new Vector3(1, 1, 0),
      scene,
    );

    light1.intensity = 0.7;

    const boxSize = 5;
    const box: Mesh = MeshBuilder.CreateBox("box", { size: boxSize }, scene);

    box.position.y = 0.5 * boxSize;

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 100, height: 100 },
      scene,
    );
    ground.position.y = 0;

    const groundMat = new StandardMaterial("groundMat");
    groundMat.diffuseColor = new Color3(0, 1, 0);
    ground.material = groundMat;

    return scene;
  }

  #addInspectorListener(): void {
    window.addEventListener("keydown", (ev) => {
      // Shift+Ctrl+Alt+I
      if (
        ev.shiftKey &&
        ev.ctrlKey &&
        ev.altKey &&
        ev.key.toLowerCase() === "i"
      ) {
        if (this.#scene.debugLayer.isVisible()) {
          this.#scene.debugLayer.hide();
        } else {
          void this.#scene.debugLayer.show();
        }
      }
    });
  }

  run(): void {
    this.#engine.runRenderLoop(() => {
      this.#scene.render();
    });
  }
}

const startApp = (): void => {
  const app = new App();
  app.run();
};

startApp();
