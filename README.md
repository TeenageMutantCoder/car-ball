# CarBall

A game inspired by Rocket League and built for the web.

## Controls

W - Accelerate, flip forward, air pitch down

S - Reverse, flip backwards, air pitch up

A - Steer left, flip left, air yaw left

D - Steer right, flip right, air yaw right

Spacebar - Jump

Spacebar - Double-jump (when pressed shortly after initial jump)

Spacebar - Flip (when pressed shortly after initial jump and combined with WASD)

Shift - Brake

Left arrow key - Air roll left

Right arrow key - Air roll right

Up arrow key - Boost

Ctrl - Switch camera target (forward or ball)

Backspace - Reset car and ball position

## How to run

### From website

Not currently available.

### From source code

Prerequisites:
1. Node (https://nodejs.org/en)
2. Git (https://git-scm.com/)

Steps:
1. Open a terminal.
2. Clone the repository using `git clone git@github.com:TeenageMutantCoder/car-ball.git` or `git clone https://github.com/TeenageMutantCoder/car-ball.git`
3. Make the repository your current working directory using `cd car-ball`
4. Install dependencies using `npm install`
5. Run the web app using `npm run dev`
5. Visit the web app at http://localhost:5173/ 

## Extra details

End goal: An online, 3D multiplayer game with gameplay similar to Rocket League.

### High-level goals

1. A single-player version of the game with no menu or customization
2. Adding local multiplayer
3. Adding a menu and online multiplayer
4. Adding more customization options
5. ??? (if I get this far, think of something else to do)

### Steps for single player portion

1. Put a car on the ground.
2. Make that car drivable (with realistic physics) using the keyboard and/or game controller.
3. Allow the car to jump and boost.
4. Allow the car to flip (and flip-cancel).
5. Add a ball that can be moved when hit by the car.
6. Add a goal where the ball can be scored.
7. Allow the car to air roll.
8. Turn the ground into a field with walls and a ceiling.

### Sources of inspiration:

1. https://www.rocketleague.com/en
2. https://github.com/BabylonJS/Website/tree/master/build/Scenes/minority-race
3. https://doc.babylonjs.com/guidedLearning/workshop/Car_Driven
4. https://youtu.be/ueEmiDM94IE
5. https://ubm-twvideo01.s3.amazonaws.com/o1/vault/gdc2018/presentations/Cone_Jared_It_Is_Rocket.pdf
6. https://github.com/roboserg/RoboLeague
7. https://forum.babylonjs.com/t/real-physics-enabled-racing-game/4034/2
8. https://blog.raananweber.com/2016/09/06/webgl-car-physics-using-babylon-js-and-oimo-js/
9. https://forum.babylonjs.com/t/ammojs-vehicle-demo/453
10. https://playground.babylonjs.com/#609QKP#6
11. https://github.com/pmndrs/cannon-es/blob/master/examples/raycast_vehicle.html
