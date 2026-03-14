// Server tick rate (ticks per second)
export const TICK_RATE = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE;

// Movement speed in tiles per second
export const MOVEMENT_SPEED = 4;

// Map dimensions (tiles)
export const MAP_WIDTH = 50;
export const MAP_HEIGHT = 50;

// Tile size in pixels (for rendering)
export const TILE_SIZE = 32;

// Chat
export const MAX_CHAT_MESSAGE_LENGTH = 200;
export const CHAT_HISTORY_SIZE = 100;

// Player
export const MAX_DISPLAY_NAME_LENGTH = 16;

// Items
export const ITEM_RESPAWN_MS = 10_000;

// Combat
export const COMBAT_RUN_CHANCE = 0.5;
export const COMBAT_CRIT_BASE = 0.01;
export const COMBAT_CRIT_MULTIPLIER = 3;
export const COMBAT_DODGE_BASE = 0.01;
export const COMBAT_DEFEND_REDUCTION = 0.5;
export const COMBAT_LEVEL_SCALE_PER_LEVEL = 0.05;
export const COMBAT_LEVEL_SCALE_MIN = 0;
export const COMBAT_LEVEL_SCALE_MAX = 2.5;
export const COMBAT_ACTION_TIMEOUT_MS = 30_000;
export const COMBAT_ENGAGE_RANGE = 1.5;
