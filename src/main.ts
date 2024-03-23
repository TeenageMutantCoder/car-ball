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
  KeyboardEventTypes,
  type AbstractMesh,
  FollowCamera,
  Texture,
  CubeTexture,
} from "@babylonjs/core";
import {
  Body,
  Box,
  ContactMaterial,
  Cylinder,
  Heightfield,
  Material,
  Quaternion,
  RaycastVehicle,
  Vec3,
  World,
} from "cannon-es";

class App {
  readonly #canvas: HTMLCanvasElement;
  readonly #engine: Engine;
  readonly #scene: Scene;
  #physicsDebugger: InstanceType<typeof CannonDebugger> | null = null;
  #world: World | null = null;
  readonly #inputMap: Record<string, KeyboardEventTypes> = {};
  #car: AbstractMesh | null = null;
  #physicsVehicle: RaycastVehicle | null = null;
  #camera: FollowCamera | null = null;
  readonly #groundSize = 1000;
  readonly #maxSteerVal = 0.5;
  readonly #maxForce = 200;
  readonly #brakeForce = 10000;

  constructor() {
    this.#canvas = this.#createCanvas();
    this.#engine = new Engine(this.#canvas, true);
    const engine = this.#engine;
    window.addEventListener("resize", function() {
      engine.resize();
    });
    this.#scene = this.#createScene();
  }

  async setup(): Promise<void> {
    this.#addObjects();
    this.#addPhysics();
    this.#addDebuggers();
  }

  run(): void {
    if (this.#world === null) throw new Error("Physics world not initialized");

    this.#engine.runRenderLoop(() => {
      this.#world?.fixedStep();
      this.#physicsDebugger?.update();
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
    scene.createDefaultSkybox(skyboxTexture, true, 1000);

    scene.onKeyboardObservable.add((kbInfo) => {
      this.#inputMap[kbInfo.event.key] = kbInfo.type;
    });

    scene.onBeforeRenderObservable.add(() => {
      this.#updateFromKeyboard();
    });

    return scene;
  }

  #addObjects(): void {
    this.#camera = new FollowCamera(
      "Camera",
      new Vector3(0, 10, 0),
      this.#scene,
    );
    this.#camera.radius = 27;
    this.#camera.heightOffset = 10;
    this.#camera.rotationOffset = 180;
    this.#camera.cameraAcceleration = 0.125;
    this.#camera.maxCameraSpeed = 3;
    this.#camera.attachControl(true);

    SceneLoader.ImportMesh(
      "",
      "./Buggy/",
      "Buggy.gltf",
      this.#scene,
      (meshes) => {
        const car = meshes[0];
        this.#car = car;
        this.#car.position.y = 1;
        this.#car.rotation = Vector3.Zero();
        this.#car.scaling = new Vector3(0.1, 0.1, 0.1);

        if (this.#camera !== null) {
          this.#camera.lockedTarget = this.#car;
        }
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
      },
    );

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: this.#groundSize, height: this.#groundSize },
      this.#scene,
    );
    const groundMaterial = new StandardMaterial("groundMat");
    const groundTexture = new Texture("./grass.jpg", this.#scene);
    groundTexture.uScale = 100;
    groundTexture.vScale = 100;
    groundMaterial.diffuseTexture = groundTexture;
    ground.material = groundMaterial;
    ground.position.y = 0;
  }

  #addPhysics(): void {
    this.#world = new World();
    this.#world.defaultContactMaterial.friction = 0;
    this.#world.gravity.set(0, -10, 0);

    // Build the car chassis
    const chassisShape = new Box(new Vec3(2, 0.5, 1));
    const chassisBody = new Body({ mass: 150 });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 4, 0);
    chassisBody.angularVelocity.set(0, 0.5, 0);

    // Create the vehicle
    this.#physicsVehicle = new RaycastVehicle({
      chassisBody,
    });

    const wheelOptions = {
      radius: 0.5,
      directionLocal: new Vec3(0, -1, 0),
      suspensionStiffness: 30,
      suspensionRestLength: 0.3,
      frictionSlip: 1.4,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 100000,
      rollInfluence: 0.01,
      axleLocal: new Vec3(0, 0, 1),
      chassisConnectionPointLocal: new Vec3(-1, 0, 1),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    wheelOptions.chassisConnectionPointLocal.set(-1, 0, 1);
    this.#physicsVehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(-1, 0, -1);
    this.#physicsVehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(1, 0, 1);
    this.#physicsVehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(1, 0, -1);
    this.#physicsVehicle.addWheel(wheelOptions);

    this.#physicsVehicle.addToWorld(this.#world);

    // Add the wheel bodies
    const wheelBodies: Body[] = [];
    const wheelMaterial = new Material("wheel");
    this.#physicsVehicle.wheelInfos.forEach((wheel) => {
      const cylinderShape = new Cylinder(
        wheel.radius,
        wheel.radius,
        wheel.radius / 2,
        20,
      );
      const wheelBody = new Body({
        mass: 0,
        material: wheelMaterial,
      });
      wheelBody.type = Body.KINEMATIC;
      wheelBody.collisionFilterGroup = 0; // turn off collisions
      const quaternion = new Quaternion().setFromEuler(-Math.PI / 2, 0, 0);
      wheelBody.addShape(cylinderShape, new Vec3(), quaternion);
      wheelBodies.push(wheelBody);

      if (this.#world === null)
        throw new Error("Physics world failed to initialize");

      this.#world.addBody(wheelBody);
    });

    // Update the wheel bodies
    this.#world.addEventListener("postStep", () => {
      if (this.#physicsVehicle === null)
        throw new Error("Physics vehicle failed to initialize");

      for (let i = 0; i < this.#physicsVehicle.wheelInfos.length; i++) {
        this.#physicsVehicle.updateWheelTransform(i);
        const transform = this.#physicsVehicle.wheelInfos[i].worldTransform;
        const wheelBody = wheelBodies[i];
        wheelBody.position.copy(transform.position);
        wheelBody.quaternion.copy(transform.quaternion);
      }
    });

    // Add the ground
    const matrix: number[][] = [];
    for (let i = 0; i < this.#groundSize; i++) {
      matrix.push([]);
      for (let j = 0; j < this.#groundSize; j++) {
        const height = 1;
        matrix[i].push(height);
      }
    }

    const groundMaterial = new Material("ground");
    const heightfieldShape = new Heightfield(matrix, {
      elementSize: 1,
    });
    const heightfieldBody = new Body({
      mass: 0,
      material: groundMaterial,
    });
    heightfieldBody.addShape(heightfieldShape);
    heightfieldBody.position.set(
      -(this.#groundSize * heightfieldShape.elementSize) / 2,
      -1,
      (this.#groundSize * heightfieldShape.elementSize) / 2,
    );
    heightfieldBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.#world.addBody(heightfieldBody);

    // Define interactions between wheels and ground
    const wheelGround = new ContactMaterial(wheelMaterial, groundMaterial, {
      friction: 0.3,
      restitution: 0,
      contactEquationStiffness: 1000,
    });
    this.#world.addContactMaterial(wheelGround);
  }

  #updateFromKeyboard(): void {
    if (this.#physicsVehicle === null) return;

    // Accelerating/Reversing
    if (
      this.#inputMap.w === KeyboardEventTypes.KEYDOWN &&
      this.#inputMap.s === KeyboardEventTypes.KEYDOWN
    ) {
      this.#physicsVehicle.applyEngineForce(0, 2);
      this.#physicsVehicle.applyEngineForce(0, 3);
    } else if (this.#inputMap.w === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.applyEngineForce(-this.#maxForce, 2);
      this.#physicsVehicle.applyEngineForce(-this.#maxForce, 3);
    } else if (this.#inputMap.s === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.applyEngineForce(this.#maxForce, 2);
      this.#physicsVehicle.applyEngineForce(this.#maxForce, 3);
    }

    if (this.#inputMap.w === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.applyEngineForce(0, 2);
      this.#physicsVehicle.applyEngineForce(0, 3);

      // Reset input map so that we do not trigger this code again
      // Otherwise, we can end up in a state where one key is KEYDOWN and the other is KEYUP
      delete this.#inputMap.w;
    }

    if (this.#inputMap.s === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.applyEngineForce(0, 2);
      this.#physicsVehicle.applyEngineForce(0, 3);

      // Reset input map so that we do not trigger this code again
      // Otherwise, we can end up in a state where one key is KEYDOWN and the other is KEYUP
      delete this.#inputMap.s;
    }

    // Steering
    if (
      this.#inputMap.a === KeyboardEventTypes.KEYDOWN &&
      this.#inputMap.d === KeyboardEventTypes.KEYDOWN
    ) {
      this.#physicsVehicle.setSteeringValue(0, 0);
      this.#physicsVehicle.setSteeringValue(0, 1);
    } else if (this.#inputMap.a === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.setSteeringValue(-this.#maxSteerVal, 0);
      this.#physicsVehicle.setSteeringValue(-this.#maxSteerVal, 1);
    } else if (this.#inputMap.d === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.setSteeringValue(this.#maxSteerVal, 0);
      this.#physicsVehicle.setSteeringValue(this.#maxSteerVal, 1);
    }

    if (this.#inputMap.a === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.setSteeringValue(0, 0);
      this.#physicsVehicle.setSteeringValue(0, 1);

      // Reset input map so that we do not trigger this code again
      // Otherwise, we can end up in a state where one key is KEYDOWN and the other is KEYUP
      delete this.#inputMap.a;
    }

    if (this.#inputMap.d === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.setSteeringValue(0, 0);
      this.#physicsVehicle.setSteeringValue(0, 1);

      // Reset input map so that we do not trigger this code again
      // Otherwise, we can end up in a state where one key is KEYDOWN and the other is KEYUP
      delete this.#inputMap.d;
    }

    // Braking
    if (this.#inputMap.b === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.setBrake(this.#brakeForce, 0);
      this.#physicsVehicle.setBrake(this.#brakeForce, 1);
      this.#physicsVehicle.setBrake(this.#brakeForce, 2);
      this.#physicsVehicle.setBrake(this.#brakeForce, 3);
    }

    if (this.#inputMap.b === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.setBrake(0, 0);
      this.#physicsVehicle.setBrake(0, 1);
      this.#physicsVehicle.setBrake(0, 2);
      this.#physicsVehicle.setBrake(0, 3);

      delete this.#inputMap.b;
    }
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
        if (this.#scene.debugLayer.isVisible()) {
          this.#scene.debugLayer.hide();
        } else {
          void this.#scene.debugLayer.show();
        }
      }
    });
  }
}

const startApp = async (): Promise<void> => {
  const app = new App();
  await app.setup();
  app.run();
};

void startApp();
