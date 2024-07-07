import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import CannonDebugger from "./cannon_debugger";
import {
  Engine,
  Scene,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  SceneLoader,
  type AbstractMesh,
  Texture,
  CubeTexture,
  Quaternion,
} from "@babylonjs/core";
import {
  Body,
  Box,
  ContactMaterial,
  Material,
  Vec3,
  World,
  Sphere,
} from "cannon-es";
import { Vehicle } from "./vehicle";

class App {
  readonly #canvas: HTMLCanvasElement;
  readonly #engine: Engine;
  readonly #scene: Scene;
  #physicsDebugger: InstanceType<typeof CannonDebugger> | null = null;
  #world: World | null = null;
  readonly #vehicle: InstanceType<typeof Vehicle>;
  #ball: AbstractMesh | null = null;
  #physicsBall: Body | null = null;
  #shouldShowPhysicsDebugger = false;
  #paused = false;
  readonly #groundSize = 10000;
  readonly #ballRadius = 5;
  readonly #ballMass = 20;
  readonly #gravityVector = new Vec3(0, -35, 0);

  constructor() {
    this.#canvas = this.#createCanvas();
    this.#engine = new Engine(this.#canvas, true);
    const engine = this.#engine;
    window.addEventListener("resize", function () {
      engine.resize();
    });

    window.onbeforeunload = (ev) => {
      ev.preventDefault();
      return true;
    };
    this.#scene = this.#createScene();
    this.#vehicle = new Vehicle();
  }

  setup(): void {
    this.#addObjects();
    this.#addPhysics();
    this.#addDebuggers();

    document.addEventListener("keydown", (ev) => {
      if (!this.#shouldShowPhysicsDebugger) {
        ev.preventDefault();
      }

      if (ev.key === "Escape") {
        this.#paused = !this.#paused;
      } else if (ev.key === "Backspace") {
        this.#vehicle.reset();
        if (this.#physicsBall !== null) {
          this.#physicsBall.quaternion.copy(this.#physicsBall.initQuaternion);
          this.#physicsBall.velocity.copy(this.#physicsBall.initVelocity);
          this.#physicsBall.angularVelocity.copy(
            this.#physicsBall.initAngularVelocity,
          );
          this.#physicsBall.position.copy(this.#physicsBall.initPosition);
        }
      }
    });
  }

  run(): void {
    if (this.#world === null) throw new Error("Physics world not initialized");

    this.#engine.runRenderLoop(() => {
      if (!this.#paused) {
        this.#world?.fixedStep();
      }
      if (this.#shouldShowPhysicsDebugger) {
        this.#physicsDebugger?.update();
      }
      this.#scene.render();
    });
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

    const skyboxTexture = new CubeTexture("./Skybox/skybox", scene);
    scene.createDefaultSkybox(skyboxTexture, true, 10 ** 5);

    scene.onBeforeRenderObservable.add(() => {
      this.#vehicle.updateDirectionVectors();
      this.#updateFromKeyboard();
      this.#updateFromPhysics();
      this.#updateCameraPosition();
    });

    return scene;
  }

  #addObjects(): void {
    this.#vehicle.setupScene(this.#scene);

    SceneLoader.ImportMesh(
      "",
      "./Marble/",
      "marble.gltf",
      this.#scene,
      (meshes) => {
        this.#ball = meshes[0];
        this.#ball.name = "ball";
        this.#ball.rotation = Vector3.Zero();
        this.#ball.scaling = new Vector3(
          2.6 * this.#ballRadius,
          2.6 * this.#ballRadius,
          2.6 * this.#ballRadius,
        );
        this.#vehicle.setBall(this.#ball);
      },
    );

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: this.#groundSize, height: this.#groundSize },
      this.#scene,
    );
    const groundMaterial = new StandardMaterial("groundMat");
    const groundTexture = new Texture("./grass.jpg", this.#scene);
    groundTexture.uScale = this.#groundSize / 10;
    groundTexture.vScale = this.#groundSize / 10;
    groundMaterial.diffuseTexture = groundTexture;
    ground.material = groundMaterial;
    ground.position.y = 0;
  }

  #addPhysics(): void {
    this.#world = new World();
    this.#world.defaultContactMaterial.friction = 0;
    this.#world.gravity.copy(this.#gravityVector);

    // Add the ground
    const groundMaterial = new Material("ground");
    const groundHeight = 20;
    const groundBody = new Body({
      type: Body.STATIC,
      shape: new Box(
        new Vec3(this.#groundSize / 2, groundHeight, this.#groundSize / 2),
      ),
      material: groundMaterial,
    });
    groundBody.position.set(0, -groundHeight, 0);
    this.#world.addBody(groundBody);

    // Add the ball
    const ballShape = new Sphere(this.#ballRadius);
    const ballMaterial = new Material();
    this.#physicsBall = new Body({
      mass: this.#ballMass,
      shape: ballShape,
      material: ballMaterial,
    });
    this.#physicsBall.position.set(0, 5, 60);
    this.#world.addBody(this.#physicsBall);

    // Define interactions between ball and ground
    const ballGround = new ContactMaterial(ballMaterial, groundMaterial, {
      friction: 0.8,
      restitution: 0.6,
    });
    this.#world.addContactMaterial(ballGround);

    this.#vehicle.setupPhysics(this.#world, { groundMaterial, ballMaterial });
  }

  #updateFromKeyboard(): void {
    this.#vehicle.updateFromKeyboard();
  }

  #updateFromPhysics(): void {
    this.#vehicle.updateFromPhysics();

    if (this.#ball === null || this.#physicsBall === null) {
      return;
    }
    const physicsBallPosition = Vector3.FromArray(
      this.#physicsBall.position.toArray(),
    );
    const physicsBallQuaternion = Quaternion.FromArray(
      this.#physicsBall.quaternion.toArray(),
    );
    this.#ball.position.copyFrom(physicsBallPosition);
    this.#ball.rotationQuaternion = physicsBallQuaternion;
  }

  #updateCameraPosition(): void {
    this.#vehicle.updateCameraPosition();
  }

  #addDebuggers(): void {
    if (this.#world === null) throw new Error("Physics world not initialized");

    this.#physicsDebugger = new CannonDebugger(this.#scene, this.#world);

    window.addEventListener("keydown", (ev) => {
      // Shift+Ctrl+Alt+I
      if (
        ev.shiftKey &&
        ev.ctrlKey &&
        ev.altKey &&
        ev.key.toLowerCase() === "i"
      ) {
        this.#shouldShowPhysicsDebugger = !this.#shouldShowPhysicsDebugger;
        if (!this.#shouldShowPhysicsDebugger) {
          this.#physicsDebugger?.clear();
        }
        if (this.#scene.debugLayer.isVisible()) {
          this.#scene.debugLayer.hide();
        } else {
          void this.#scene.debugLayer.show();
        }
      }
    });
  }
}

const startApp = (): void => {
  const app = new App();
  app.setup();
  app.run();
};

startApp();
