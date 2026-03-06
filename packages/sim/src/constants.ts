import type { Vec3 } from "@car-ball/protocol";

export const TICK_RATE = 120;
export const FIXED_STEP_SECONDS = 1 / TICK_RATE;
export const FIXED_STEP_MS = 1000 / TICK_RATE;
export const DEFAULT_MAX_SUBSTEPS = 8;
export const DEFAULT_MATCH_DURATION_SECONDS = 5 * 60;

export const DOUBLE_JUMP_WINDOW_TICKS = 90;
export const DOUBLE_JUMP_VERTICAL_IMPULSE = 5;
export const DOUBLE_JUMP_DIRECTIONAL_IMPULSE = 4;

export const TRACTION_CONTACT_DISTANCE = 0.35;
export const TRACTION_ATTACH_MAX_SPEED = 16;
export const TRACTION_DETACH_SPEED = 24;
export const TRACTION_DETACH_NORMAL_SPEED = 8;
export const TRACTION_DETACH_MAX_ANGLE_FROM_TANGENT_RADIANS = Math.PI / 4;
export const TRACTION_DAMPING_PER_SECOND = 2.4;

export const DEFAULT_CAR_HALF_EXTENTS = {
	x: 1.2,
	y: 0.8,
	z: 1.2
} as const;

export const CAR_SURFACE_BOUNCE_RESTITUTION = 0.35;
export const CAR_SURFACE_TANGENTIAL_DAMPING = 0.94;
export const CAR_SURFACE_BOUNCE_MIN_NORMAL_SPEED = 0.5;
export const CEILING_TRACTION_WHEEL_ALIGNMENT_MIN_Z = 0.6;

export interface BoxVolume {
	min: Vec3;
	max: Vec3;
}

export const DEFAULT_ARENA_HALF_EXTENTS = {
	x: 120,
	y: 80,
	z: 30
} as const;

export const ARENA_WALL_THICKNESS = 0.1;
export const ARENA_CORNER_RADIUS = 3;
export const ARENA_RAMP_SEGMENTS = 100;

export const DEFAULT_ARENA_BOUNDS: BoxVolume = {
	min: { x: -DEFAULT_ARENA_HALF_EXTENTS.x, y: -DEFAULT_ARENA_HALF_EXTENTS.y, z: 0 },
	max: { x: DEFAULT_ARENA_HALF_EXTENTS.x, y: DEFAULT_ARENA_HALF_EXTENTS.y, z: DEFAULT_ARENA_HALF_EXTENTS.z }
};

export interface RoundedArenaWallLayout {
	straightWalls: {
		id: "arena:wall-x-min" | "arena:wall-x-max" | "arena:wall-y-min" | "arena:wall-y-max";
		center: Vec3;
		size: Vec3;
	}[];
	rampPanels: {
		id: string;
		center: Vec3;
		size: Vec3;
		rotationAxis: "x" | "y" | "z";
		rotationAngleRadians: number;
	}[];
}

export function createRoundedArenaWallLayout(
	arenaBounds: BoxVolume,
	wallThickness = ARENA_WALL_THICKNESS,
	cornerRadius = ARENA_CORNER_RADIUS,
	rampSegments = ARENA_RAMP_SEGMENTS
): RoundedArenaWallLayout {
	const centerX = (arenaBounds.min.x + arenaBounds.max.x) / 2;
	const centerY = (arenaBounds.min.y + arenaBounds.max.y) / 2;
	const centerZ = (arenaBounds.min.z + arenaBounds.max.z) / 2;
	const sizeX = Math.abs(arenaBounds.max.x - arenaBounds.min.x);
	const sizeY = Math.abs(arenaBounds.max.y - arenaBounds.min.y);
	const sizeZ = Math.abs(arenaBounds.max.z - arenaBounds.min.z);
	const halfThickness = wallThickness / 2;
	const panelArcLength = Math.max(wallThickness, 2 * cornerRadius * Math.sin((Math.PI / 2) / (rampSegments * 2)));

	const straightWallSizeY = Math.max(wallThickness, sizeY - cornerRadius * 2);
	const straightWallSizeX = Math.max(wallThickness, sizeX - cornerRadius * 2);
	const rampPanels: RoundedArenaWallLayout["rampPanels"] = [];

	const addVerticalCornerRampPanels = (
		idPrefix: string,
		centerCorner: { x: number; y: number },
		angleStart: number,
		angleEnd: number
	): void => {
		for (let index = 0; index < rampSegments; index += 1) {
			const alpha = (index + 0.5) / rampSegments;
			const angle = angleStart + (angleEnd - angleStart) * alpha;
			const normalX = Math.cos(angle);
			const normalY = Math.sin(angle);

			rampPanels.push({
				id: `${idPrefix}:${index}`,
				center: {
					x: centerCorner.x + normalX * (cornerRadius + halfThickness),
					y: centerCorner.y + normalY * (cornerRadius + halfThickness),
					z: centerZ
				},
				size: {
					x: wallThickness,
					y: panelArcLength,
					z: sizeZ
				},
				rotationAxis: "z",
				rotationAngleRadians: angle
			});
		}
	};

	const addFloorRampPanelsAlongXWall = (
		idPrefix: string,
		centerArc: { x: number; z: number },
		angleStart: number,
		angleEnd: number
	): void => {
		for (let index = 0; index < rampSegments; index += 1) {
			const alpha = (index + 0.5) / rampSegments;
			const angle = angleStart + (angleEnd - angleStart) * alpha;
			const normalX = Math.cos(angle);
			const normalZ = Math.sin(angle);

			rampPanels.push({
				id: `${idPrefix}:${index}`,
				center: {
					x: centerArc.x + normalX * (cornerRadius + halfThickness),
					y: centerY,
					z: centerArc.z + normalZ * (cornerRadius + halfThickness)
				},
				size: {
					x: wallThickness,
					y: straightWallSizeY,
					z: panelArcLength
				},
				rotationAxis: "y",
				rotationAngleRadians: Math.atan2(-normalZ, normalX)
			});
		}
	};

	const addFloorRampPanelsAlongYWall = (
		idPrefix: string,
		centerArc: { y: number; z: number },
		angleStart: number,
		angleEnd: number
	): void => {
		for (let index = 0; index < rampSegments; index += 1) {
			const alpha = (index + 0.5) / rampSegments;
			const angle = angleStart + (angleEnd - angleStart) * alpha;
			const normalY = Math.cos(angle);
			const normalZ = Math.sin(angle);

			rampPanels.push({
				id: `${idPrefix}:${index}`,
				center: {
					x: centerX,
					y: centerArc.y + normalY * (cornerRadius + halfThickness),
					z: centerArc.z + normalZ * (cornerRadius + halfThickness)
				},
				size: {
					x: straightWallSizeX,
					y: wallThickness,
					z: panelArcLength
				},
				rotationAxis: "x",
				rotationAngleRadians: Math.atan2(normalZ, normalY)
			});
		}
	};

	addVerticalCornerRampPanels(
		"arena:ramp-corner-x-min-y-min",
		{ x: arenaBounds.min.x + cornerRadius, y: arenaBounds.min.y + cornerRadius },
		Math.PI,
		(3 * Math.PI) / 2
	);
	addVerticalCornerRampPanels(
		"arena:ramp-corner-x-min-y-max",
		{ x: arenaBounds.min.x + cornerRadius, y: arenaBounds.max.y - cornerRadius },
		Math.PI / 2,
		Math.PI
	);
	addVerticalCornerRampPanels(
		"arena:ramp-corner-x-max-y-min",
		{ x: arenaBounds.max.x - cornerRadius, y: arenaBounds.min.y + cornerRadius },
		(3 * Math.PI) / 2,
		2 * Math.PI
	);
	addVerticalCornerRampPanels(
		"arena:ramp-corner-x-max-y-max",
		{ x: arenaBounds.max.x - cornerRadius, y: arenaBounds.max.y - cornerRadius },
		0,
		Math.PI / 2
	);

	addFloorRampPanelsAlongXWall(
		"arena:ramp-floor-wall-x-min",
		{ x: arenaBounds.min.x + cornerRadius, z: arenaBounds.min.z + cornerRadius },
		Math.PI,
		(3 * Math.PI) / 2
	);
	addFloorRampPanelsAlongXWall(
		"arena:ramp-floor-wall-x-max",
		{ x: arenaBounds.max.x - cornerRadius, z: arenaBounds.min.z + cornerRadius },
		(3 * Math.PI) / 2,
		2 * Math.PI
	);
	addFloorRampPanelsAlongYWall(
		"arena:ramp-floor-wall-y-min",
		{ y: arenaBounds.min.y + cornerRadius, z: arenaBounds.min.z + cornerRadius },
		Math.PI,
		(3 * Math.PI) / 2
	);
	addFloorRampPanelsAlongYWall(
		"arena:ramp-floor-wall-y-max",
		{ y: arenaBounds.max.y - cornerRadius, z: arenaBounds.min.z + cornerRadius },
		(3 * Math.PI) / 2,
		2 * Math.PI
	);

	return {
		straightWalls: [
			{
				id: "arena:wall-x-min",
				center: { x: arenaBounds.min.x - halfThickness, y: centerY, z: centerZ },
				size: { x: wallThickness, y: straightWallSizeY, z: sizeZ }
			},
			{
				id: "arena:wall-x-max",
				center: { x: arenaBounds.max.x + halfThickness, y: centerY, z: centerZ },
				size: { x: wallThickness, y: straightWallSizeY, z: sizeZ }
			},
			{
				id: "arena:wall-y-min",
				center: { x: centerX, y: arenaBounds.min.y - halfThickness, z: centerZ },
				size: { x: straightWallSizeX, y: wallThickness, z: sizeZ }
			},
			{
				id: "arena:wall-y-max",
				center: { x: centerX, y: arenaBounds.max.y + halfThickness, z: centerZ },
				size: { x: straightWallSizeX, y: wallThickness, z: sizeZ }
			}
		],
		rampPanels
	};
}

export const DEFAULT_GOAL_GEOMETRY = {
	nearWallInset: 2,
	depth: 4,
	halfWidthY: 8,
	heightZ: 6
} as const;

export interface GoalVolumesBySide {
	minX: BoxVolume;
	maxX: BoxVolume;
}

export function createGoalVolumesForArena(arenaBounds: BoxVolume): GoalVolumesBySide {
	return {
		minX: {
			min: {
				x: arenaBounds.min.x + DEFAULT_GOAL_GEOMETRY.nearWallInset,
				y: -DEFAULT_GOAL_GEOMETRY.halfWidthY,
				z: 0
			},
			max: {
				x: arenaBounds.min.x + DEFAULT_GOAL_GEOMETRY.nearWallInset + DEFAULT_GOAL_GEOMETRY.depth,
				y: DEFAULT_GOAL_GEOMETRY.halfWidthY,
				z: DEFAULT_GOAL_GEOMETRY.heightZ
			}
		},
		maxX: {
			min: {
				x: arenaBounds.max.x - DEFAULT_GOAL_GEOMETRY.nearWallInset - DEFAULT_GOAL_GEOMETRY.depth,
				y: -DEFAULT_GOAL_GEOMETRY.halfWidthY,
				z: 0
			},
			max: {
				x: arenaBounds.max.x - DEFAULT_GOAL_GEOMETRY.nearWallInset,
				y: DEFAULT_GOAL_GEOMETRY.halfWidthY,
				z: DEFAULT_GOAL_GEOMETRY.heightZ
			}
		}
	};
}
