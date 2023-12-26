import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  SceneLoader,
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

    const camera = new ArcRotateCamera(
      "Camera",
      Math.PI / 2,
      (3 * Math.PI) / 8,
      50,
      Vector3.Zero(),
      scene,
    );
    camera.attachControl(this.#canvas, true);

    const light1 = new HemisphericLight("light1", new Vector3(1, 1, 0), scene);

    light1.intensity = 0.7;

    SceneLoader.ImportMesh("", "./Buggy/", "Buggy.gltf", scene, (meshes) => {
      const buggy = meshes[0];
      buggy.position.y = 1;
      buggy.scaling = new Vector3(0.1, 0.1, 0.1);
    });

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 1000, height: 1000 },
      scene,
    );
    ground.position.y = 0;

    const groundMat = new StandardMaterial("groundMat");
    groundMat.diffuseColor = new Color3(0.1, 0.5, 0.1);
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
