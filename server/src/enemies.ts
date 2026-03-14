import type { EnemyDef, MapEnemy } from 'shared';

// ---- Enemy definitions ----

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    tier: 1,
    baseStats: {
      level: 1,
      hp: 15, maxHp: 15,
      mp: 0, maxMp: 0,
      ep: 10, maxEp: 10,
      kp: 0, maxKp: 0,
      accuracy: 8,
      power: 6,
      speed: 10,
      defense: 4,
      dodge: 6,
      critBonus: 2,
      damageTypeBonuses: {},
      resistances: {},
      immunities: [],
    },
    respawnMs: 15_000,
    strategies: [
      { value: 'technical', weight: 3 },
      { value: 'fast', weight: 4 },
      { value: 'strong', weight: 2 },
      { value: 'defensive', weight: 1 },
    ],
    damageTypes: [
      { value: 'slicing', weight: 5 },
      { value: 'piercing', weight: 3 },
      { value: 'bludgeoning', weight: 2 },
    ],
    dropTable: [
      { itemType: 'Gold Pieces', chance: 0.8, minQty: 1, maxQty: 5 },
    ],
    xpReward: 10,
  },
};

// ---- Spawn locations ----

interface EnemySpawnDef {
  defId: string;
  x: number;
  y: number;
}

const ENEMY_SPAWN_DEFS: EnemySpawnDef[] = [
  { defId: 'goblin', x: 20, y: 20 },
  { defId: 'goblin', x: 28, y: 22 },
  { defId: 'goblin', x: 22, y: 30 },
];

// ---- Spawn state management ----

export interface ServerEnemySpawn {
  id: string;
  defId: string;
  x: number;
  y: number;
  active: boolean;
}

let nextEnemySpawnId = 1;

export const enemySpawns = new Map<string, ServerEnemySpawn>();

export function initEnemySpawns(): void {
  for (const def of ENEMY_SPAWN_DEFS) {
    const id = `enemy_${nextEnemySpawnId++}`;
    enemySpawns.set(id, { id, defId: def.defId, x: def.x, y: def.y, active: true });
  }
}

export function getActiveMapEnemies(getCombatIdForEnemy?: (spawnId: string) => string | null): MapEnemy[] {
  const result: MapEnemy[] = [];
  for (const spawn of enemySpawns.values()) {
    if (!spawn.active) continue;
    const def = ENEMY_DEFS[spawn.defId];
    if (!def) continue;
    result.push({
      id: spawn.id,
      defId: spawn.defId,
      name: def.name,
      x: spawn.x,
      y: spawn.y,
      combatId: getCombatIdForEnemy ? getCombatIdForEnemy(spawn.id) : null,
    });
  }
  return result;
}
