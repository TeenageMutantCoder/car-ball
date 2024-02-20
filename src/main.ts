import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import {
  Engine,
  Scene,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  SceneLoader,
  KeyboardEventTypes,
  type AbstractMesh,
  FollowCamera,
  Texture,
  CubeTexture,
} from "@babylonjs/core";

class App {
  readonly #canvas: HTMLCanvasElement;
  readonly #engine: Engine;
  readonly #scene: Scene;
  inputMap: Record<string, KeyboardEventTypes> = {};
  car: AbstractMesh | null = null;
  speed = 1.5;
  turnSpeed = 0.05;
  camera: FollowCamera | null = null;

  constructor() {
    this.#canvas = this.#createCanvas();
    this.#engine = new Engine(this.#canvas, true);
    const engine = this.#engine;
    window.addEventListener("resize", function() {
      engine.resize();
    });
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

    const light1 = new HemisphericLight("light1", new Vector3(1, 1, 0), scene);

    light1.intensity = 0.7;

    this.camera = new FollowCamera("Camera", new Vector3(0, 10, 0), scene);
    this.camera.radius = 27;
    this.camera.heightOffset = 10;
    this.camera.rotationOffset = 180;
    this.camera.cameraAcceleration = 0.125;
    this.camera.maxCameraSpeed = 3;

    SceneLoader.ImportMesh("", "./Buggy/", "Buggy.gltf", scene, (meshes) => {
      const buggy = meshes[0];
      this.car = buggy;
      this.car.position.y = 1;
      this.car.rotation = Vector3.Zero();
      this.car.scaling = new Vector3(0.1, 0.1, 0.1);

      if (this.camera !== null) {
        this.camera.lockedTarget = this.car;
      }
    });

    SceneLoader.ImportMesh("", "./Marble/", "marble.gltf", scene, (meshes) => {
      const ball = meshes[0];
      ball.position.x = -5;
      ball.position.y = 5;
      ball.position.z = 40;
      ball.rotation = Vector3.Zero();
      ball.scaling = new Vector3(10, 10, 10);
    });

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 1000, height: 1000 },
      scene,
    );
    const groundMaterial = new StandardMaterial("groundMat");
    const groundTexture = new Texture("./grass.jpg", scene);
    groundTexture.uScale = 100;
    groundTexture.vScale = 100;
    groundMaterial.diffuseTexture = groundTexture;
    ground.material = groundMaterial;
    ground.position.y = 0;

    const skyboxTexture = new CubeTexture("./Skybox/skybox", scene);
    scene.createDefaultSkybox(skyboxTexture, true, 1000);

    scene.onKeyboardObservable.add((kbInfo) => {
      this.inputMap[kbInfo.event.key] = kbInfo.type;
    });

    scene.onBeforeRenderObservable.add(() => {
      this._updateFromKeyboard();
    });

    return scene;
  }

  _updateFromKeyboard(): void {
    if (this.car === null) return;

    const forwardVector = this.car.forward.scale(this.speed);
    const carVelocity = Vector3.Zero();
    let isMoving = false;
    let isBackward = false;

    if (this.inputMap.w === KeyboardEventTypes.KEYDOWN) {
      carVelocity.addInPlace(forwardVector);
      isMoving = true;
    }
    if (this.inputMap.s === KeyboardEventTypes.KEYDOWN) {
      carVelocity.subtractInPlace(forwardVector);
      isMoving = true;
      isBackward = true;
    }

    this.car.position.addInPlace(carVelocity);

    const turnVector = new Vector3(0, this.turnSpeed, 0);
    if (isBackward) {
      turnVector.scaleInPlace(-1);
    }

    if (this.inputMap.a === KeyboardEventTypes.KEYDOWN && isMoving) {
      this.car.rotation.subtractInPlace(turnVector);
    }
    if (this.inputMap.d === KeyboardEventTypes.KEYDOWN && isMoving) {
      this.car.rotation.addInPlace(turnVector);
    }
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
