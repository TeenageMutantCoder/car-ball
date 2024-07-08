import {
  type AbstractMesh,
  MeshBuilder,
  type Scene,
  Vector3,
  Axis,
  Space,
  KeyboardEventTypes,
  Quaternion,
  TransformNode,
  UniversalCamera,
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

  // Relative direction vectors
  #up: Vec3 = Vec3.ZERO;
  #right: Vec3 = Vec3.ZERO;
  #forward: Vec3 = Vec3.ZERO;

  // Object referencees
  #chassisMesh: AbstractMesh | null = null;
  #wheelMeshes: AbstractMesh[] | null = null;
  #camera: UniversalCamera | null = null;
  #cameraTarget: TransformNode | null = null;
  #cameraTargetType: "car" | "ball" = "car";
  #physicsVehicle: RaycastVehicle | null = null;
  #ball: AbstractMesh | null = null;

  // Wheel properties
  readonly #defaultWheelOptions = {
    radius: 1,
    directionLocal: new Vec3(0, -1, 0),
    axleLocal: new Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new Vec3(),
    frictionSlip: 3,
  } satisfies WheelInfoOptions;

  readonly #wheelPositions = {
    frontLeft: new Vec3(-2, 0, 3),
    frontRight: new Vec3(2, 0, 3),
    rearLeft: new Vec3(-2, 0, -3),
    rearRight: new Vec3(2, 0, -3),
  };

  // Jumping/Flipping states
  #lastJumpTime: number | null = null;
  #lastFlipTime: number | null = null;
  #hasStoppedJumping = true;
  #hasUsedDoubleJump = false;
  #isSelfRighting = false;
  #isJumping = false;

  // Physical properties
  readonly #sizeX = 4.5;
  readonly #sizeY = 2.75;
  readonly #sizeZ = 8;
  readonly #initialPosition = new Vec3(0, this.#sizeY + 1, 0);
  readonly #mass = 100;

  // Camera properties
  readonly #cameraHeight = 8;
  readonly #cameraDistance = this.#sizeZ * 4;

  // General movement properties
  readonly #maxSteerValue = 0.3;
  readonly #downforceAmount = 70;
  readonly #maxDownforceAmount = 3000;
  readonly #maxEngineForceAmount = 1000;
  readonly #boostForceAmount = 8000;
  readonly #brakeForceAmount = 50;
  readonly #maxAngularVelocity = 5.5;
  readonly #maxVelocity = 150;

  // Aerial movement properties
  readonly #aerialPitchTorque = 7000;
  readonly #aerialYawTorque = 7000;
  readonly #aerialRollTorque = 6000;

  // Jump properties
  readonly #jumpForceAmount = 26000;
  readonly #maxjumpDurationMilliseconds = 110;
  readonly #doubleJumpForceAmount = 1000;
  readonly #minDoubleJumpDurationMilliseconds = 100;
  readonly #maxDoubleJumpDurationMilliseconds = 1500;
  readonly #selfRightingForceAmount = 7000;
  readonly #selfRightingTorqueAmount = 1000000;
  readonly #selfRightingTorqueDelayAmountMilliseconds = 200;

  // Flip properties
  readonly #flipTorque = 370000;
  readonly #flipForce = 7000;
  readonly #sideFlipTorque = 200000;
  readonly #sideFlipHorizontalForce = 1500;
  readonly #flipImmobillityDurationMilliseconds = 200;

  setBall(ball: AbstractMesh): void {
    this.#ball = ball;
  }

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

    this.#camera = new UniversalCamera("Camera", new Vector3(0, 10, 0), scene);
    this.#cameraTarget = new TransformNode("cameraTarget", scene);
    this.#camera.lockedTarget = this.#cameraTarget;

    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey) {
        this.#cameraTargetType =
          this.#cameraTargetType === "car" ? "ball" : "car";
      }
    });

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

  setupPhysics(
    world: World,
    {
      groundMaterial,
      ballMaterial,
    }: { groundMaterial: Material; ballMaterial: Material },
  ): void {
    const chassisShape = new Box(
      new Vec3(this.#sizeX / 2, this.#sizeY / 2, this.#sizeZ / 2),
    );
    const chassisMaterial = new Material("chassis");
    const chassisBody = new Body({
      mass: this.#mass,
      material: chassisMaterial,
    });
    chassisBody.addShape(chassisShape);
    chassisBody.position.copy(this.#initialPosition);
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
      friction: 0.005,
    });
    world.addContactMaterial(chassisGround);

    const chassisBall = new ContactMaterial(chassisMaterial, ballMaterial, {
      restitution: 1.7,
    });
    world.addContactMaterial(chassisBall);
  }

  reset(): void {
    if (this.#physicsVehicle === null) return;

    this.#physicsVehicle.chassisBody.quaternion.copy(
      this.#physicsVehicle.chassisBody.initQuaternion,
    );
    this.#physicsVehicle.chassisBody.velocity.copy(
      this.#physicsVehicle.chassisBody.initVelocity,
    );
    this.#physicsVehicle.chassisBody.angularVelocity.copy(
      this.#physicsVehicle.chassisBody.initAngularVelocity,
    );
    this.#physicsVehicle.chassisBody.position.copy(
      this.#physicsVehicle.chassisBody.initPosition,
    );
  }

  updateCameraPosition(): void {
    if (
      this.#chassisMesh === null ||
      this.#physicsVehicle === null ||
      this.#camera === null ||
      this.#cameraTarget === null ||
      this.#chassisMesh.rotationQuaternion === null
    )
      return;

    if (this.#cameraTargetType === "car") {
      const velocityVector = new Vector3(
        ...this.#physicsVehicle.chassisBody.velocity.toArray(),
      ).normalize();
      velocityVector.y = 0;
      const forwardVector = this.#chassisMesh.forward.clone();
      forwardVector.y = 0;
      forwardVector.normalize();
      if (forwardVector.negate().equalsWithEpsilon(velocityVector, 0.1)) {
        forwardVector.negateInPlace();
      }

      const updatedCameraPosition = this.#chassisMesh.position.add(
        forwardVector.scale(-this.#cameraDistance),
      );
      updatedCameraPosition.y =
        this.#chassisMesh.position.y + this.#cameraHeight;
      this.#camera.position.copyFrom(updatedCameraPosition);
      const updatedCameraTargetPosition = this.#chassisMesh.position.add(
        forwardVector.scale((this.#sizeZ / 2) * 5),
      );
      updatedCameraTargetPosition.y =
        this.#chassisMesh.position.y + this.#cameraHeight;
      this.#cameraTarget.position.copyFrom(updatedCameraTargetPosition);

      return;
    }

    if (this.#cameraTargetType === "ball" && this.#ball !== null) {
      const ballDirectionVector = this.#chassisMesh.position
        .subtract(this.#ball.position)
        .normalize();
      const updatedCameraPosition = this.#chassisMesh.position.add(
        ballDirectionVector.scale(this.#cameraDistance),
      );
      updatedCameraPosition.y =
        this.#chassisMesh.position.y + this.#cameraHeight;
      this.#camera.position.copyFrom(updatedCameraPosition);
      this.#cameraTarget.position.copyFrom(this.#ball.position);
    }
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
    const isFacingUpwards = this.#up.almostEquals(new Vec3(0, 1, 0), 0.2);
    const isStuckUpsideDown =
      this.#physicsVehicle.chassisBody.position.y < 1.5 &&
      this.#up.almostEquals(new Vec3(0, -1, 0), 0.2);
    const timeSinceLastFlip =
      this.#lastFlipTime === null ? Infinity : Date.now() - this.#lastFlipTime;
    const timeSinceLastJump =
      this.#lastJumpTime === null ? Infinity : Date.now() - this.#lastJumpTime;
    const canDoubleJump =
      !areWheelsOnGround &&
      !isStuckUpsideDown &&
      !this.#hasUsedDoubleJump &&
      this.#hasStoppedJumping &&
      timeSinceLastJump > this.#minDoubleJumpDurationMilliseconds &&
      timeSinceLastJump < this.#maxDoubleJumpDurationMilliseconds;

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
      this.#physicsVehicle.applyEngineForce(-this.#maxEngineForceAmount, 0);
      this.#physicsVehicle.applyEngineForce(-this.#maxEngineForceAmount, 1);
      this.#physicsVehicle.applyEngineForce(-this.#maxEngineForceAmount, 2);
      this.#physicsVehicle.applyEngineForce(-this.#maxEngineForceAmount, 3);
    } else if (this.#inputMap.s === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.applyEngineForce(this.#maxEngineForceAmount, 0);
      this.#physicsVehicle.applyEngineForce(this.#maxEngineForceAmount, 1);
      this.#physicsVehicle.applyEngineForce(this.#maxEngineForceAmount, 2);
      this.#physicsVehicle.applyEngineForce(this.#maxEngineForceAmount, 3);
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
    }

    // Air Pitch (up/down)
    if (
      this.#inputMap.w === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround &&
      timeSinceLastFlip > this.#flipImmobillityDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#right.scale(this.#aerialPitchTorque),
      );
    }
    if (
      this.#inputMap.s === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround &&
      timeSinceLastFlip > this.#flipImmobillityDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#right.scale(-this.#aerialPitchTorque),
      );
    }

    // Air Yaw (left/right)
    if (
      this.#inputMap.a === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround &&
      timeSinceLastFlip > this.#flipImmobillityDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#up.scale(-this.#aerialYawTorque),
      );
    }
    if (
      this.#inputMap.d === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround &&
      timeSinceLastFlip > this.#flipImmobillityDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#up.scale(this.#aerialYawTorque),
      );
    }

    // Air Roll (twisting)
    if (
      this.#inputMap.ArrowLeft === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround &&
      timeSinceLastFlip > this.#flipImmobillityDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#forward.scale(this.#aerialRollTorque),
      );
    }
    if (
      this.#inputMap.ArrowRight === KeyboardEventTypes.KEYDOWN &&
      !areWheelsOnGround &&
      timeSinceLastFlip > this.#flipImmobillityDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyTorque(
        this.#forward.scale(-this.#aerialRollTorque),
      );
    }

    // Jumping
    if (areWheelsOnGround) {
      this.#hasUsedDoubleJump = false;
    }
    if (this.#inputMap[" "] === KeyboardEventTypes.KEYUP) {
      this.#hasStoppedJumping = true;
      this.#isJumping = false;
    }

    if (
      this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN &&
      areWheelsOnGround &&
      this.#hasStoppedJumping
    ) {
      this.#isJumping = true;
      this.#lastJumpTime = Date.now();
      this.#hasStoppedJumping = false;
    }
    if (
      this.#isJumping &&
      timeSinceLastJump < this.#maxjumpDurationMilliseconds
    ) {
      this.#physicsVehicle.chassisBody.applyForce(
        this.#up.scale(this.#jumpForceAmount),
      );
    }

    // Double jumping and flipping
    if (this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN && canDoubleJump) {
      this.#hasUsedDoubleJump = true;
      this.#hasStoppedJumping = false;
      if (
        this.#inputMap.w !== KeyboardEventTypes.KEYDOWN &&
        this.#inputMap.s !== KeyboardEventTypes.KEYDOWN &&
        this.#inputMap.a !== KeyboardEventTypes.KEYDOWN &&
        this.#inputMap.d !== KeyboardEventTypes.KEYDOWN
      ) {
        this.#physicsVehicle.chassisBody.applyImpulse(
          this.#up.scale(this.#doubleJumpForceAmount),
        );
      }

      // Front flip
      if (this.#inputMap.w === KeyboardEventTypes.KEYDOWN) {
        this.#lastFlipTime = Date.now();

        const horizontalForwardVector = this.#forward.clone();
        horizontalForwardVector.y = 0;

        this.#physicsVehicle.chassisBody.applyImpulse(
          horizontalForwardVector.scale(this.#flipForce),
        );
        this.#physicsVehicle?.chassisBody.applyTorque(
          this.#right.scale(this.#flipTorque),
        );
      }

      // Back flip
      if (this.#inputMap.s === KeyboardEventTypes.KEYDOWN) {
        this.#lastFlipTime = Date.now();

        const horizontalForwardVector = this.#forward.clone();
        horizontalForwardVector.y = 0;

        this.#physicsVehicle.chassisBody.applyImpulse(
          horizontalForwardVector.scale(-this.#flipForce),
        );
        this.#physicsVehicle.chassisBody.applyTorque(
          this.#right.scale(-this.#flipTorque),
        );
      }

      // Left side flip
      if (this.#inputMap.a === KeyboardEventTypes.KEYDOWN) {
        this.#lastFlipTime = Date.now();

        const horizontalForwardVector = this.#forward.clone();
        horizontalForwardVector.y = 0;
        const worldUpVector = new Vec3(0, 1, 0);
        const horizontalLeftVector = horizontalForwardVector
          .cross(worldUpVector)
          .unit();

        this.#physicsVehicle.chassisBody.applyImpulse(
          horizontalLeftVector.scale(this.#sideFlipHorizontalForce),
        );
        this.#physicsVehicle.chassisBody.applyTorque(
          this.#forward.scale(this.#sideFlipTorque),
        );
      }

      // Right side flip
      if (this.#inputMap.d === KeyboardEventTypes.KEYDOWN) {
        this.#lastFlipTime = Date.now();

        const horizontalForwardVector = this.#forward.clone();
        horizontalForwardVector.y = 0;
        const worldUpVector = new Vec3(0, 1, 0);
        const horizontalRightVector = worldUpVector
          .cross(horizontalForwardVector)
          .unit();

        this.#physicsVehicle.chassisBody.applyImpulse(
          horizontalRightVector.scale(this.#sideFlipHorizontalForce),
        );
        this.#physicsVehicle.chassisBody.applyTorque(
          this.#forward.scale(-this.#sideFlipTorque),
        );
      }
    }

    // Self-righting (get back onto wheels after being stuck upside down)
    if (this.#isSelfRighting && isFacingUpwards) {
      this.#physicsVehicle.chassisBody.torque = new Vec3(0, 0, 0);
      this.#physicsVehicle.chassisBody.angularVelocity = new Vec3(0, 0, 0);
      this.#isSelfRighting = false;
    }
    if (
      this.#inputMap[" "] === KeyboardEventTypes.KEYDOWN &&
      isStuckUpsideDown &&
      this.#hasStoppedJumping &&
      !this.#isSelfRighting
    ) {
      this.#isSelfRighting = true;
      this.#lastJumpTime = null;
      this.#physicsVehicle.chassisBody.applyImpulse(
        this.#up.scale(this.#selfRightingForceAmount),
      );
      setTimeout(() => {
        this.#physicsVehicle?.chassisBody.applyTorque(
          this.#forward.scale(this.#selfRightingTorqueAmount),
        );
      }, this.#selfRightingTorqueDelayAmountMilliseconds);
    }

    // Boosting
    if (this.#inputMap.ArrowUp === KeyboardEventTypes.KEYDOWN) {
      this.#physicsVehicle.chassisBody.applyForce(
        this.#forward.scale(this.#boostForceAmount),
      );
    }

    // Limiting angular velocity
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

    // Limiting velocity
    if (
      this.#physicsVehicle.chassisBody.velocity.length() > this.#maxVelocity
    ) {
      this.#physicsVehicle.chassisBody.velocity.copy(
        this.#physicsVehicle.chassisBody.velocity
          .unit()
          .scale(this.#maxVelocity),
      );
    }
  }
}
