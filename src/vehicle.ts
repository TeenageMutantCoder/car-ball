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
  type WheelInfoOptions,
} from "cannon-es";

export class Vehicle {
  readonly #inputMap: Record<string, KeyboardEventTypes | boolean> = {};
  #chassisMesh: AbstractMesh | null = null;
  #wheelMeshes: AbstractMesh[] | null = null;
  #camera: FollowCamera | null = null;
  #physicsVehicle: RaycastVehicle | null = null;
  #up: Vec3 = Vec3.ZERO;
  #right: Vec3 = Vec3.ZERO;
  #forward: Vec3 = Vec3.ZERO;
  #lastJumpTime: number | null = null;
  #hasStoppedJumping = true;
  #hasUsedDoubleJump = false;
  #isSelfRighting = false;
  #selfRightingProgress = 0;
  readonly #numOfSelfRightingSteps = 100;
  readonly #sizeX = 6;
  readonly #sizeY = 3;
  readonly #sizeZ = 12;
  readonly #mass = 100;
  readonly #maxSteerValue = 0.7;
  readonly #downforceAmount = 700;
  readonly #maxDownforceAmount = 3000;
  readonly #maxForceAmount = 2000;
  readonly #boostForceAmount = 8000;
  readonly #brakeForceAmount = 100;
  readonly #jumpForceAmount = 2000;
  readonly #maxAngularVelocity = 5;
  readonly #maxDoubleJumpTimeMilliseconds = 1500;
  readonly #minDoubleJumpTimeMilliseconds = 100;
  readonly #aerialPitchTorque = 7000;
  readonly #aerialYawTorque = 7000;
  readonly #aerialRollTorque = 7000;
  readonly #defaultWheelOptions = {
    radius: 1.25,
    directionLocal: new Vec3(0, -1, 0),
    axleLocal: new Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new Vec3(),
    frictionSlip: 3,
  } satisfies WheelInfoOptions;

  readonly #wheelPositions = {
    frontLeft: new Vec3(-3, 0, 4.5),
    frontRight: new Vec3(3, 0, 4.5),
    rearLeft: new Vec3(-3, 0, -4.5),
    rearRight: new Vec3(3, 0, -4.5),
  };

  setupScene(scene: Scene): void {
    this.#chassisMesh = MeshBuilder.CreateBox(
      "vehicle",
      {
        width: this.#sizeX,
        height: this.#sizeY,
        depth: this.#sizeZ,
      },
      scene,
    );

    const frontLeftWheel = MeshBuilder.CreateCylinder(
      "wheelFrontLeft",
      {
        diameter: this.#defaultWheelOptions.radius * 2,
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
    this.#wheelMeshes = [
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
    this.#camera.lockedTarget = this.#chassisMesh;

    scene.onKeyboardObservable.add((kbInfo) => {
      const keysWithNormalCasing = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ];
      const key = kbInfo.event.key;
      const keyName = keysWithNormalCasing.includes(key)
        ? key
        : key.toLowerCase();
      this.#inputMap[keyName] = kbInfo.type;
      this.#inputMap.shiftKey = kbInfo.event.shiftKey;
      this.#inputMap.ctrlKey = kbInfo.event.ctrlKey;
    });
  }

  setupPhysics(world: World, groundMaterial: Material): void {
    const chassisShape = new Box(
      new Vec3(this.#sizeX / 2, this.#sizeY / 2, this.#sizeZ / 2),
    );
    const chassisMaterial = new Material("chassis");
    const chassisBody = new Body({
      mass: this.#mass,
      material: chassisMaterial,
    });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, this.#sizeY, 0);
    chassisBody.inertia.set(0, 0, 0);

    this.#physicsVehicle = new RaycastVehicle({
      chassisBody,
      indexForwardAxis: 2,
      indexRightAxis: 0,
    });

    this.#physicsVehicle.addWheel({
      ...this.#defaultWheelOptions,
      chassisConnectionPointLocal: this.#wheelPositions.frontLeft,
    });
    this.#physicsVehicle.addWheel({
      ...this.#defaultWheelOptions,
      chassisConnectionPointLocal: this.#wheelPositions.frontRight,
    });
    this.#physicsVehicle.addWheel({
      ...this.#defaultWheelOptions,
      chassisConnectionPointLocal: this.#wheelPositions.rearLeft,
      isFrontWheel: false,
    });
    this.#physicsVehicle.addWheel({
      ...this.#defaultWheelOptions,
      chassisConnectionPointLocal: this.#wheelPositions.rearRight,
      isFrontWheel: false,
    });

    this.#physicsVehicle.addToWorld(world);

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

    const chassisGround = new ContactMaterial(chassisMaterial, groundMaterial, {
      friction: 0.01,
    });
    world.addContactMaterial(chassisGround);
  }

  updateFromPhysics(): void {
    if (
      this.#physicsVehicle === null ||
      this.#chassisMesh === null ||
      this.#wheelMeshes === null
    ) {
      return;
    }

    const areWheelsOnGround =
      this.#physicsVehicle.numWheelsOnGround ===
      this.#physicsVehicle.wheelInfos.length;
    if (areWheelsOnGround) {
      const downforce = this.#up.scale(
        -Math.min(
          this.#maxDownforceAmount,
          this.#downforceAmount *
          this.#physicsVehicle.chassisBody.velocity.length(),
        ),
      );
      this.#physicsVehicle.chassisBody.applyForce(downforce);
    }

    const physicsCarPosition = Vector3.FromArray(
      this.#physicsVehicle.chassisBody.position.toArray(),
    );
    const physicsCarQuaternion = Quaternion.FromArray(
      this.#physicsVehicle.chassisBody.quaternion.toArray(),
    );
    this.#chassisMesh.position.copyFrom(physicsCarPosition);
    this.#chassisMesh.rotationQuaternion = physicsCarQuaternion;

    this.#wheelMeshes.forEach((wheel, wheelIndex) => {
      if (this.#physicsVehicle === null || this.#chassisMesh === null) return;
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

  updateDirectionVectors(): void {
    if (this.#physicsVehicle === null) return;

    this.#forward = this.#physicsVehicle.wheelInfos[0].worldTransform.position
      .vsub(this.#physicsVehicle.wheelInfos[2].worldTransform.position)
      .unit();
    this.#right = this.#physicsVehicle.wheelInfos[1].worldTransform.position
      .vsub(this.#physicsVehicle.wheelInfos[0].worldTransform.position)
      .unit();
    this.#up = this.#forward.cross(this.#right).unit();
  }

  updateFromKeyboard(): void {
    if (this.#physicsVehicle === null) return;
    const areWheelsOnGround =
      this.#physicsVehicle.numWheelsOnGround ===
      this.#physicsVehicle.wheelInfos.length;
    const isStuckUpsideDown =
      this.#physicsVehicle.chassisBody.position.y < 1.5 &&
      this.#up.almostEquals(new Vec3(0, -1, 0), 0.2);

    // Accelerating/Reversing
    if (
      this.#inputMap.w === KeyboardEventTypes.KEYDOWN &&
      this.#inputMap.s === KeyboardEventTypes.KEYDOWN
    ) {
      this.#physicsVehicle.applyEngineForce(0, 0);
      this.#physicsVehicle.applyEngineForce(0, 1);
      this.#physicsVehicle.applyEngineForce(0, 2);
      this.#physicsVehicle.applyEngineForce(0, 3);
    } else if (this.#inputMap.w === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.applyEngineForce(-this.#maxForceAmount, 0);
      this.#physicsVehicle.applyEngineForce(-this.#maxForceAmount, 1);
      this.#physicsVehicle.applyEngineForce(-this.#maxForceAmount, 2);
      this.#physicsVehicle.applyEngineForce(-this.#maxForceAmount, 3);
    } else if (this.#inputMap.s === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.applyEngineForce(this.#maxForceAmount, 0);
      this.#physicsVehicle.applyEngineForce(this.#maxForceAmount, 1);
      this.#physicsVehicle.applyEngineForce(this.#maxForceAmount, 2);
      this.#physicsVehicle.applyEngineForce(this.#maxForceAmount, 3);
    }

    if (this.#inputMap.w === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.applyEngineForce(0, 0);
      this.#physicsVehicle.applyEngineForce(0, 1);
      this.#physicsVehicle.applyEngineForce(0, 2);
      this.#physicsVehicle.applyEngineForce(0, 3);

      // Reset input map so that we do not trigger this code again
      // Otherwise, we can end up in a state where one key is KEYDOWN and the other is KEYUP
      delete this.#inputMap.w;
    }

    if (this.#inputMap.s === KeyboardEventTypes.KEYUP) {
      this.#physicsVehicle.applyEngineForce(0, 0);
      this.#physicsVehicle.applyEngineForce(0, 1);
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
      this.#physicsVehicle.setSteeringValue(-this.#maxSteerValue, 0);
      this.#physicsVehicle.setSteeringValue(-this.#maxSteerValue, 1);
    } else if (this.#inputMap.d === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.setSteeringValue(this.#maxSteerValue, 0);
      this.#physicsVehicle.setSteeringValue(this.#maxSteerValue, 1);
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
      this.#physicsVehicle.setBrake(this.#brakeForceAmount, 0);
      this.#physicsVehicle.setBrake(this.#brakeForceAmount, 1);
      this.#physicsVehicle.setBrake(this.#brakeForceAmount, 2);
      this.#physicsVehicle.setBrake(this.#brakeForceAmount, 3);
    }

    if (this.#inputMap.shiftKey === false) {
      this.#physicsVehicle.setBrake(0, 0);
      this.#physicsVehicle.setBrake(0, 1);
      this.#physicsVehicle.setBrake(0, 2);
      this.#physicsVehicle.setBrake(0, 3);

      delete this.#inputMap.b;
    }

    // Air Pitch (up/down)
    if (this.#inputMap.w === KeyboardEventTypes.KEYDOWN && !areWheelsOnGround) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#right.scale(this.#aerialPitchTorque),
      );
    }
    if (this.#inputMap.s === KeyboardEventTypes.KEYDOWN && !areWheelsOnGround) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#right.scale(-this.#aerialPitchTorque),
      );
    }

    // Air Yaw (left/right)
    if (this.#inputMap.a === KeyboardEventTypes.KEYDOWN && !areWheelsOnGround) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#up.scale(-this.#aerialYawTorque),
      );
    }
    if (this.#inputMap.d === KeyboardEventTypes.KEYDOWN && !areWheelsOnGround) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#up.scale(this.#aerialYawTorque),
      );
    }

    // Air Roll (twisting)
    if (
      this.#inputMap.ArrowLeft === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#forward.scale(this.#aerialRollTorque),
      );
    }
    if (
      this.#inputMap.ArrowRight === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#forward.scale(-this.#aerialRollTorque),
      );
    }

    // Jumping
    if (areWheelsOnGround) {
      this.#hasUsedDoubleJump = false;
      this.#isSelfRighting = false;
      this.#selfRightingProgress = 0;
    }
    if (this.#inputMap[" "] === KeyboardEventTypes.KEYUP) {
      this.#hasStoppedJumping = true;
    }

    if (
      this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN &&
      areWheelsOnGround &&
      this.#hasStoppedJumping
    ) {
      this.#lastJumpTime = Date.now();
      this.#hasStoppedJumping = false;
      this.#physicsVehicle.chassisBody.applyImpulse(
        this.#up.scale(this.#jumpForceAmount),
      );
    }

    const canDoubleJump =
      !areWheelsOnGround &&
      !isStuckUpsideDown &&
      !this.#hasUsedDoubleJump &&
      this.#hasStoppedJumping &&
      this.#lastJumpTime !== null &&
      Date.now() - this.#lastJumpTime > this.#minDoubleJumpTimeMilliseconds &&
      Date.now() - this.#lastJumpTime < this.#maxDoubleJumpTimeMilliseconds;
    if (this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN && canDoubleJump) {
      this.#hasUsedDoubleJump = true;
      this.#hasStoppedJumping = false;
      this.#physicsVehicle.chassisBody.applyImpulse(
        this.#up.scale(this.#jumpForceAmount * 0.75),
      );
    }

    // Self-righting (get back onto wheels after being stuck upside down)
    if (this.#isSelfRighting && this.#selfRightingProgress <= 1) {
      const currentRotation = new Vec3();
      this.#physicsVehicle.chassisBody.quaternion.toEuler(currentRotation);
      const newQuaternion = new CannonQuaternion();
      newQuaternion.setFromEuler(0, currentRotation.y, 0);
      this.#physicsVehicle.chassisBody.quaternion.slerp(
        newQuaternion,
        this.#selfRightingProgress,
        this.#physicsVehicle.chassisBody.quaternion,
      );
      this.#selfRightingProgress += 1 / this.#numOfSelfRightingSteps;
    }
    if (
      this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN &&
      isStuckUpsideDown &&
      this.#hasStoppedJumping
    ) {
      this.#isSelfRighting = true;
      this.#lastJumpTime = null;
      this.#selfRightingProgress = 0;
    }

    // Boosting
    if (this.#inputMap.ArrowUp === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.chassisBody.applyForce(
        this.#forward.scale(this.#boostForceAmount),
      );
    }

    // Limit angular velocity
    if (
      this.#physicsVehicle.chassisBody.angularVelocity.length() >
      this.#maxAngularVelocity
    ) {
      this.#physicsVehicle.chassisBody.angularVelocity.copy(
        this.#physicsVehicle.chassisBody.angularVelocity
          .unit()
          .scale(this.#maxAngularVelocity),
      );
    }
  }
}
