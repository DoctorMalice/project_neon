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
export const COMBAT_CRIT_BASE_PERCENT = 1;          // base crit chance (1%)
export const COMBAT_CRIT_MULTIPLIER = 3;
export const COMBAT_DODGE_BASE_PERCENT = 1;          // base dodge chance (1%)
export const COMBAT_DEFEND_REDUCTION = 0.5;
export const COMBAT_BONUS_DIVISOR_CHANCE = 50;       // bonus / 50 added to base percentage
export const COMBAT_BONUS_DIVISOR_POWER = 10;        // power / 10 = max hit bonus
export const COMBAT_BONUS_DIVISOR_ACCURACY = 10;     // accuracy / 10 = min hit bonus
export const COMBAT_BONUS_DIVISOR_DEFENSE = 10;      // defense / 10 = defense percentage
export const COMBAT_LEVEL_SCALE_PER_LEVEL = 0.05;
export const COMBAT_LEVEL_SCALE_MIN = 0;
export const COMBAT_LEVEL_SCALE_MAX = 2.5;
export const COMBAT_LEVEL_CLOSE_BAND = 10;           // within 10 levels = "close", min 1 damage
export const COMBAT_ACTION_TIMEOUT_MS = 30_000;
export const COMBAT_ENGAGE_RANGE = 2.5;
