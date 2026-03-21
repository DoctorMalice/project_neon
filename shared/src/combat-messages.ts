import type { CombatAction, CombatState, MapEnemy, InventoryItem } from './index';

// ---- Client → Server combat messages ----

export interface ClientAttackEnemyMessage {
  type: 'ATTACK_ENEMY';
  enemySpawnId: string;
}

export interface ClientCombatActionMessage {
  type: 'COMBAT_ACTION';
  combatId: string;
  action: CombatAction;
}

export interface ClientJoinCombatMessage {
  type: 'JOIN_COMBAT';
  combatId: string;
}

export interface ClientCombatAuraToggleMessage {
  type: 'COMBAT_AURA_TOGGLE';
  auraId: string;
}

export type ClientCombatMessage =
  | ClientAttackEnemyMessage
  | ClientCombatActionMessage
  | ClientJoinCombatMessage
  | ClientCombatAuraToggleMessage;

// ---- Server → Client combat messages ----

export interface ServerCombatStartMessage {
  type: 'COMBAT_START';
  state: CombatState;
}

export interface ServerCombatUpdateMessage {
  type: 'COMBAT_UPDATE';
  state: CombatState;
  autoDefended?: boolean;  // true if this player was auto-defended (timed out)
}

export interface ServerCombatEndMessage {
  type: 'COMBAT_END';
  state: CombatState;
  result: 'victory' | 'defeat' | 'fled';
  xpGained: number;
  loot: InventoryItem[];
  skillXPGained?: Record<string, number>;
  autoDefended?: boolean;  // true if this player was auto-defended (timed out)
}

export interface ServerEnemySpawnsMessage {
  type: 'ENEMY_SPAWNS';
  enemies: MapEnemy[];
}

export interface ServerEnemySpawnMessage {
  type: 'ENEMY_SPAWN';
  enemy: MapEnemy;
}

export interface ServerEnemyDespawnMessage {
  type: 'ENEMY_DESPAWN';
  enemyId: string;
}

export type ServerCombatMessage =
  | ServerCombatStartMessage
  | ServerCombatUpdateMessage
  | ServerCombatEndMessage
  | ServerEnemySpawnsMessage
  | ServerEnemySpawnMessage
  | ServerEnemyDespawnMessage;
