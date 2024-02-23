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
  HavokPlugin,
  PhysicsShapeSphere,
  PhysicsShapeBox,
  Quaternion,
  PhysicsBody,
  PhysicsMotionType,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

class App {
  readonly #canvas: HTMLCanvasElement;
  readonly #engine: Engine;
  readonly #scene: Scene;
  inputMap: Record<string, KeyboardEventTypes> = {};
  car: AbstractMesh | null = null;
  speed = 50;
  turnSpeed = 1;
  camera: FollowCamera | null = null;

  constructor() {
    this.#canvas = this.#createCanvas();
    this.#engine = new Engine(this.#canvas, true);
    const engine = this.#engine;
    window.addEventListener("resize", function() {
      engine.resize();
    });
    this.#scene = this.#createScene();
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
    scene.createDefaultSkybox(skyboxTexture, true, 1000);

    scene.onKeyboardObservable.add((kbInfo) => {
      this.inputMap[kbInfo.event.key] = kbInfo.type;
    });

    scene.onBeforeRenderObservable.add(() => {
      this.#updateFromKeyboard();
    });

    return scene;
  }

  #addObjects(): void {
    this.camera = new FollowCamera(
      "Camera",
      new Vector3(0, 10, 0),
      this.#scene,
    );
    this.camera.radius = 27;
    this.camera.heightOffset = 10;
    this.camera.rotationOffset = 180;
    this.camera.cameraAcceleration = 0.125;
    this.camera.maxCameraSpeed = 3;
    this.camera.attachControl(true);

    SceneLoader.ImportMesh(
      "",
      "./Buggy/",
      "Buggy.gltf",
      this.#scene,
      (meshes) => {
        const car = meshes[0];
        this.car = car;
        this.car.position.y = 1;
        this.car.rotation = Vector3.Zero();
        this.car.scaling = new Vector3(0.1, 0.1, 0.1);

        if (this.camera !== null) {
          this.camera.lockedTarget = this.car;
        }

        const carCenterLocation = this.car
          .getBoundingInfo()
          .boundingBox.center.add(new Vector3(2.5, 2, 2));
        const carPhysicsShape = new PhysicsShapeBox(
          carCenterLocation,
          Quaternion.Identity(),
          new Vector3(7, 6, 15),
          this.#scene,
        );
        const carPhysicsBody = new PhysicsBody(
          this.car,
          PhysicsMotionType.DYNAMIC,
          false,
          this.#scene,
        );
        carPhysicsBody.shape = carPhysicsShape;
        carPhysicsBody.setMassProperties({
          mass: 1,
        });
      },
    );

    SceneLoader.ImportMesh(
      "",
      "./Marble/",
      "marble.gltf",
      this.#scene,
      (meshes) => {
        const ball = meshes[0];
        ball.position.x = -5;
        ball.position.y = 5;
        ball.position.z = 40;
        ball.rotation = Vector3.Zero();
        ball.scaling = new Vector3(10, 10, 10);

        const ballPhysicsShape = new PhysicsShapeSphere(
          ball.getBoundingInfo().boundingSphere.center,
          4,
          this.#scene,
        );
        const ballPhysicsBody = new PhysicsBody(
          ball,
          PhysicsMotionType.DYNAMIC,
          false,
          this.#scene,
        );
        ballPhysicsBody.shape = ballPhysicsShape;
        ballPhysicsBody.setMassProperties({
          mass: 1,
        });
      },
    );

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 1000, height: 1000 },
      this.#scene,
    );
    const groundMaterial = new StandardMaterial("groundMat");
    const groundTexture = new Texture("./grass.jpg", this.#scene);
    groundTexture.uScale = 100;
    groundTexture.vScale = 100;
    groundMaterial.diffuseTexture = groundTexture;
    ground.material = groundMaterial;
    ground.position.y = 0;

    const groundPhysicsShape = new PhysicsShapeBox(
      ground.position,
      Quaternion.Identity(),
      new Vector3(1000, 0.1, 1000),
      this.#scene,
    );
    const groundPhysicsBody = new PhysicsBody(
      ground,
      PhysicsMotionType.STATIC,
      false,
      this.#scene,
    );
    groundPhysicsBody.shape = groundPhysicsShape;
    groundPhysicsBody.setMassProperties({
      mass: 0,
    });
  }

  #updateFromKeyboard(): void {
    if (this.car === null) return;

    // Forward and backward movement
    const newLinearVelocity = Vector3.Zero();
    const forwardVector = this.car.forward.scale(this.speed);

    if (this.inputMap.w === KeyboardEventTypes.KEYDOWN) {
      newLinearVelocity.addInPlace(forwardVector);
    }
    if (this.inputMap.s === KeyboardEventTypes.KEYDOWN) {
      newLinearVelocity.subtractInPlace(forwardVector);
    }

    this.car.physicsBody?.setLinearVelocity(newLinearVelocity);

    // Left and right turning
    const isMoving = !newLinearVelocity.equals(Vector3.Zero());
    const isMovingBackward =
      isMoving && newLinearVelocity.equals(forwardVector.scale(-1));
    const newAngularVelocity = Vector3.Zero();
    const turnVector = new Vector3(0, this.turnSpeed, 0);
    if (isMovingBackward) {
      turnVector.scaleInPlace(-1);
    }

    if (this.inputMap.a === KeyboardEventTypes.KEYDOWN && isMoving) {
      newAngularVelocity.subtractInPlace(turnVector);
    }
    if (this.inputMap.d === KeyboardEventTypes.KEYDOWN && isMoving) {
      newAngularVelocity.addInPlace(turnVector);
    }

    this.car.physicsBody?.setAngularVelocity(newAngularVelocity);
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

  async setup(): Promise<void> {
    const gravityVector = new Vector3(0, -9.81, 0);
    const havokInstance = await HavokPhysics();
    const physicsPlugin = new HavokPlugin(true, havokInstance);
    this.#scene.enablePhysics(gravityVector, physicsPlugin);

    this.#addObjects();
    this.#addInspectorListener();
  }

  run(): void {
    this.#engine.runRenderLoop(() => {
      this.#scene.render();
    });
  }
}

const startApp = async (): Promise<void> => {
  const app = new App();
  await app.setup();
  app.run();
};

void startApp();
