import {
  type AbstractMesh,
  FollowCamera,
  MeshBuilder,
  type Scene,
  Vector3,
  Axis,
  Space,
  KeyboardEventTypes,
  Quaternion,
} from "@babylonjs/core";
import {
  type World,
  RaycastVehicle,
  Box,
  Vec3,
  Body,
  Material,
  Cylinder,
  Quaternion as CannonQuaternion,
  ContactMaterial,
} from "cannon-es";

export class Vehicle {
  readonly #inputMap: Record<string, KeyboardEventTypes | boolean> = {};
  #car: AbstractMesh | null = null;
  #wheels: AbstractMesh[] | null = null;
  #camera: FollowCamera | null = null;
  #physicsVehicle: RaycastVehicle | null = null;
  #lastJumpTime: number | null = null;
  #hasStoppedJumping = true;
  #hasUsedDoubleJump = false;
  readonly #maxSteerVal = 0.7;
  readonly #maxForce = 5000;
  readonly #brakeForce = 80;
  readonly #carSizeMultiplier = 3;
  readonly #maxDoubleJumpTimeMilliseconds = 1500;
  readonly #minDoubleJumpTimeMilliseconds = 100;

  setupScene(scene: Scene): void {
    this.#car = MeshBuilder.CreateBox(
      "vehicle",
      {
        width: 1 * 2 * this.#carSizeMultiplier,
        height: 0.5 * 2 * this.#carSizeMultiplier,
        depth: 2 * 2 * this.#carSizeMultiplier,
      },
      scene,
    );

    const frontLeftWheel = MeshBuilder.CreateCylinder(
      "wheelFrontLeft",
      {
        diameter: 0.5 * (0.75 * 2 * this.#carSizeMultiplier),
        height: 0.5,
        tessellation: 24,
      },
      scene,
    );
    frontLeftWheel.rotate(Axis.Z, -Math.PI / 2, Space.LOCAL);
    frontLeftWheel.bakeCurrentTransformIntoVertices();
    const frontRightWheel = frontLeftWheel.createInstance("wheelFrontRight");
    const rearLeftWheel = frontLeftWheel.createInstance("wheelRearLeft");
    const rearRightWheel = frontLeftWheel.createInstance("wheelRearRight");
    this.#wheels = [
      frontLeftWheel,
      frontRightWheel,
      rearLeftWheel,
      rearRightWheel,
    ];

    this.#camera = new FollowCamera("Camera", new Vector3(0, 10, 0), scene);
    this.#camera.radius = 27;
    this.#camera.heightOffset = 10;
    this.#camera.rotationOffset = 180;
    this.#camera.cameraAcceleration = 0.125;
    this.#camera.maxCameraSpeed = 3;
    this.#camera.attachControl(true);
    this.#camera.lockedTarget = this.#car;

    scene.onKeyboardObservable.add((kbInfo) => {
      this.#inputMap[kbInfo.event.key.toLowerCase()] = kbInfo.type;
      this.#inputMap.shiftKey = kbInfo.event.shiftKey;
      this.#inputMap.ctrlKey = kbInfo.event.ctrlKey;
    });
  }

  setupPhysics(world: World, groundMaterial: Material): void {
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

    this.#physicsVehicle.addToWorld(world);

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

      world.addBody(wheelBody);
    });

    // Update the wheel bodies
    world.addEventListener("postStep", () => {
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

    // Define interactions between wheels and ground
    const wheelGround = new ContactMaterial(wheelMaterial, groundMaterial, {
      friction: 0.3,
      restitution: 0,
      contactEquationStiffness: 1000,
    });
    world.addContactMaterial(wheelGround);
  }

  updateFromPhysics(): void {
    if (
      this.#physicsVehicle === null ||
      this.#car === null ||
      this.#wheels === null
    ) {
      return;
    }

    this.#physicsVehicle.chassisBody.applyForce(
      new Vec3(0, -8000, 0),
      new Vec3(0, 0, 0),
    );

    const physicsCarPosition = Vector3.FromArray(
      this.#physicsVehicle.chassisBody.position.toArray(),
    );
    const physicsCarQuaternion = Quaternion.FromArray(
      this.#physicsVehicle.chassisBody.quaternion.toArray(),
    );
    this.#car.position.copyFrom(physicsCarPosition);
    this.#car.rotationQuaternion = physicsCarQuaternion;

    this.#wheels.forEach((wheel, wheelIndex) => {
      if (this.#physicsVehicle === null || this.#car === null) return;
      const wheelInfo = this.#physicsVehicle.wheelInfos[wheelIndex];
      const wheelPosition = Vector3.FromArray(
        wheelInfo.worldTransform.position.toArray(),
      );

      const wheelQuaternion = Quaternion.FromArray(
        wheelInfo.worldTransform.quaternion.toArray(),
      );
      wheel.position.copyFrom(wheelPosition);
      wheel.rotationQuaternion = wheelQuaternion;
    });
  }

  updateFromKeyboard(): void {
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
    if (this.#inputMap.shiftKey === true) {
      this.#physicsVehicle.setBrake(this.#brakeForce, 0);
      this.#physicsVehicle.setBrake(this.#brakeForce, 1);
      this.#physicsVehicle.setBrake(this.#brakeForce, 2);
      this.#physicsVehicle.setBrake(this.#brakeForce, 3);
    }

    if (this.#inputMap.shiftKey === false) {
      this.#physicsVehicle.setBrake(0, 0);
      this.#physicsVehicle.setBrake(0, 1);
      this.#physicsVehicle.setBrake(0, 2);
      this.#physicsVehicle.setBrake(0, 3);

      delete this.#inputMap.b;
    }

    // Jumping
    const wheelsAreOnGround =
      this.#physicsVehicle.numWheelsOnGround ===
      this.#physicsVehicle.wheelInfos.length;
    if (wheelsAreOnGround) {
      this.#hasUsedDoubleJump = false;
    }
    if (this.#inputMap[" "] === KeyboardEventTypes.KEYUP) {
      this.#hasStoppedJumping = true;
    }

    if (
      this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN &&
      wheelsAreOnGround &&
      this.#hasStoppedJumping
    ) {
      this.#lastJumpTime = Date.now();
      this.#hasStoppedJumping = false;
      this.#physicsVehicle.chassisBody.applyImpulse(
        new Vec3(0, 4000, 0),
        new Vec3(0, 0, 0),
      );
    }

    const canDoubleJump =
      !wheelsAreOnGround &&
      !this.#hasUsedDoubleJump &&
      this.#hasStoppedJumping &&
      this.#lastJumpTime !== null &&
      Date.now() - this.#lastJumpTime > this.#minDoubleJumpTimeMilliseconds &&
      Date.now() - this.#lastJumpTime < this.#maxDoubleJumpTimeMilliseconds;
    if (this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN && canDoubleJump) {
      this.#hasUsedDoubleJump = true;
      this.#hasStoppedJumping = false;
      this.#physicsVehicle.chassisBody.applyImpulse(
        new Vec3(0, 4000, 0),
        new Vec3(0, 0, 0),
      );
    }
  }
}
