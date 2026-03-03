export const TICK_RATE = 120;
export const FIXED_STEP_SECONDS = 1 / TICK_RATE;
export const FIXED_STEP_MS = 1000 / TICK_RATE;
export const DEFAULT_MAX_SUBSTEPS = 8;
export const DEFAULT_MATCH_DURATION_SECONDS = 5 * 60;

import type { Vec3 } from "@car-ball/protocol";

export const DOUBLE_JUMP_WINDOW_TICKS = 90;
export const DOUBLE_JUMP_VERTICAL_IMPULSE = 5;
export const DOUBLE_JUMP_DIRECTIONAL_IMPULSE = 4;

export const TRACTION_CONTACT_DISTANCE = 0.35;
export const TRACTION_ATTACH_MAX_SPEED = 16;
export const TRACTION_DETACH_SPEED = 24;
export const TRACTION_DETACH_NORMAL_SPEED = 8;
export const TRACTION_DETACH_MAX_ANGLE_FROM_TANGENT_RADIANS = Math.PI / 4;
export const TRACTION_DAMPING_PER_SECOND = 2.4;

export interface BoxVolume {
	min: Vec3;
	max: Vec3;
}

export const DEFAULT_ARENA_HALF_EXTENTS = {
	x: 120,
	y: 80,
	z: 30
} as const;

export const DEFAULT_ARENA_BOUNDS: BoxVolume = {
	min: { x: -DEFAULT_ARENA_HALF_EXTENTS.x, y: -DEFAULT_ARENA_HALF_EXTENTS.y, z: 0 },
	max: { x: DEFAULT_ARENA_HALF_EXTENTS.x, y: DEFAULT_ARENA_HALF_EXTENTS.y, z: DEFAULT_ARENA_HALF_EXTENTS.z }
};

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
