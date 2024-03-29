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
  Quaternion,
  Axis,
  Space,
} from "@babylonjs/core";
import {
  Body,
  Box,
  ContactMaterial,
  Cylinder,
  Material,
  Quaternion as CannonQuaternion,
  RaycastVehicle,
  Vec3,
  World,
  Sphere,
} from "cannon-es";

class App {
  readonly #canvas: HTMLCanvasElement;
  readonly #engine: Engine;
  readonly #scene: Scene;
  #physicsDebugger: InstanceType<typeof CannonDebugger> | null = null;
  #world: World | null = null;
  readonly #inputMap: Record<string, KeyboardEventTypes> = {};
  #car: AbstractMesh | null = null;
  #ball: AbstractMesh | null = null;
  #physicsVehicle: RaycastVehicle | null = null;
  #physicsBall: Body | null = null;
  #camera: FollowCamera | null = null;
  readonly #groundSize = 10000;
  readonly #maxSteerVal = 0.7;
  readonly #maxForce = 5000;
  readonly #brakeForce = 20;
  readonly #carSizeMultiplier = 3;

  constructor() {
    this.#canvas = this.#createCanvas();
    this.#engine = new Engine(this.#canvas, true);
    const engine = this.#engine;
    window.addEventListener("resize", function () {
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
      this.#updateFromPhysics();
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

    this.#car = MeshBuilder.CreateBox(
      "vehicle",
      {
        width: 1 * 2 * this.#carSizeMultiplier,
        height: 0.5 * 2 * this.#carSizeMultiplier,
        depth: 2 * 2 * this.#carSizeMultiplier,
      },
      this.#scene,
    );
    this.#camera.lockedTarget = this.#car;

    const frontLeftWheel = MeshBuilder.CreateCylinder(
      "wheelFrontLeft",
      {
        diameter: 0.5 * (0.75 * 2 * this.#carSizeMultiplier),
        height: 0.5,
        tessellation: 24,
      },
      this.#scene,
    );
    frontLeftWheel.rotate(Axis.Z, -Math.PI / 2, Space.LOCAL);
    frontLeftWheel.bakeCurrentTransformIntoVertices();
    frontLeftWheel.parent = this.#car;
    frontLeftWheel.position = new Vector3(
      -1 * this.#carSizeMultiplier,
      -1,
      1 * this.#carSizeMultiplier,
    );
    const frontRightWheel = frontLeftWheel.createInstance("wheelFrontRight");
    frontRightWheel.parent = this.#car;
    frontRightWheel.position = new Vector3(
      1 * this.#carSizeMultiplier,
      -1,
      1 * this.#carSizeMultiplier,
    );
    const rearLeftWheel = frontLeftWheel.createInstance("wheelRearLeft");
    rearLeftWheel.parent = this.#car;
    rearLeftWheel.position = new Vector3(
      -1 * this.#carSizeMultiplier,
      -1,
      -1.5 * this.#carSizeMultiplier,
    );
    const rearRightWheel = frontLeftWheel.createInstance("wheelRearRight");
    rearRightWheel.parent = this.#car;
    rearRightWheel.position = new Vector3(
      1 * this.#carSizeMultiplier,
      -1,
      -1.5 * this.#carSizeMultiplier,
    );

    SceneLoader.ImportMesh(
      "",
      "./Marble/",
      "marble.gltf",
      this.#scene,
      (meshes) => {
        this.#ball = meshes[0];
        this.#ball.name = "ball";
        this.#ball.rotation = Vector3.Zero();
        this.#ball.scaling = new Vector3(10, 10, 10);
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
    this.#world.gravity.set(0, -10, 0);

    // Build the car chassis
    const chassisShape = new Box(
      new Vec3(1, 0.5, 2).scale(this.#carSizeMultiplier),
    );
    const chassisBody = new Body({ mass: 150 });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 1.5 * this.#carSizeMultiplier, 0);

    // Create the vehicle
    this.#physicsVehicle = new RaycastVehicle({
      chassisBody,
      indexForwardAxis: 2,
      indexRightAxis: 0,
    });

    const wheelHeight = -1;
    const wheelOptions = {
      radius: 0.5 * (0.75 * this.#carSizeMultiplier),
      directionLocal: new Vec3(0, -1, 0),
      suspensionStiffness: 30,
      suspensionRestLength: 0.3,
      frictionSlip: 1.4,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 100000,
      rollInfluence: 0.01,
      axleLocal: new Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new Vec3(),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    // Front left wheel
    wheelOptions.chassisConnectionPointLocal.set(
      -1 * this.#carSizeMultiplier,
      wheelHeight,
      1 * this.#carSizeMultiplier,
    );
    this.#physicsVehicle.addWheel(wheelOptions);

    // Front right wheel
    wheelOptions.chassisConnectionPointLocal.set(
      1 * this.#carSizeMultiplier,
      wheelHeight,
      1 * this.#carSizeMultiplier,
    );
    this.#physicsVehicle.addWheel(wheelOptions);

    // Rear left wheel
    wheelOptions.chassisConnectionPointLocal.set(
      -1 * this.#carSizeMultiplier,
      wheelHeight,
      -1.5 * this.#carSizeMultiplier,
    );
    this.#physicsVehicle.addWheel(wheelOptions);

    // Rear right wheel
    wheelOptions.chassisConnectionPointLocal.set(
      1 * this.#carSizeMultiplier,
      wheelHeight,
      -1.5 * this.#carSizeMultiplier,
    );
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
      const quaternion = new CannonQuaternion().setFromEuler(
        0,
        0,
        -Math.PI / 2,
      );
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

    // Define interactions between wheels and ground
    const wheelGround = new ContactMaterial(wheelMaterial, groundMaterial, {
      friction: 0.3,
      restitution: 0,
      contactEquationStiffness: 1000,
    });
    this.#world.addContactMaterial(wheelGround);

    // Add the ball
    const ballShape = new Sphere(4);
    const ballMaterial = new Material({
      friction: 0.8,
      restitution: 0.6,
    });
    this.#physicsBall = new Body({
      mass: 10,
      shape: ballShape,
      material: ballMaterial,
    });
    this.#physicsBall.position.set(-5, 5, 40);
    this.#world.addBody(this.#physicsBall);

    // Define interactions between ball and ground
    const ballGround = new ContactMaterial(ballMaterial, groundMaterial, {
      friction: 0.8,
      restitution: 0.6,
      contactEquationStiffness: 1000,
    });
    this.#world.addContactMaterial(ballGround);
  }

  #updateFromKeyboard(): void {
    if (this.#physicsVehicle === null) return;

    this.#physicsVehicle.chassisBody.applyLocalForce(
      new Vec3(0, -8000, 0),
      new Vec3(0, 0, 0),
    );

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

  #updateFromPhysics(): void {
    if (
      this.#car === null ||
      this.#physicsVehicle === null ||
      this.#ball === null ||
      this.#physicsBall === null
    ) {
      return;
    }

    const physicsCarPosition = Vector3.FromArray(
      this.#physicsVehicle.chassisBody.position.toArray(),
    );
    const physicsCarQuaternion = Quaternion.FromArray(
      this.#physicsVehicle.chassisBody.quaternion.toArray(),
    );
    this.#car.position.copyFrom(physicsCarPosition);
    this.#car.rotationQuaternion = physicsCarQuaternion;

    const wheels = this.#car.getChildMeshes();

    const wheelInfo = this.#physicsVehicle.wheelInfos[0];
    console.log(
      Quaternion.FromArray(wheelInfo.worldTransform.quaternion.toArray())
        .toEulerAngles()
        .toString(),
    );

    wheels.forEach((wheel, wheelIndex) => {
      if (this.#physicsVehicle === null) return;
      const wheelInfo = this.#physicsVehicle.wheelInfos[wheelIndex];
      const wheelPosition = Vector3.FromArray(
        wheelInfo.worldTransform.position.toArray(),
      );

      const wheelQuaternion = Quaternion.FromArray(
        wheelInfo.worldTransform.quaternion.toArray(),
      );
      wheel.absolutePosition.copyFrom(wheelPosition);
      wheel.rotationQuaternion = wheelQuaternion;
    });

    const physicsBallPosition = Vector3.FromArray(
      this.#physicsBall.position.toArray(),
    );
    const physicsBallQuaternion = Quaternion.FromArray(
      this.#physicsBall.quaternion.toArray(),
    );
    this.#ball.position.copyFrom(physicsBallPosition);
    this.#ball.rotationQuaternion = physicsBallQuaternion;
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
