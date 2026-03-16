// ---- Combat strategies ----

export type CombatStrategy = 'technical' | 'accurate' | 'strong' | 'fast' | 'defensive' | 'agile';

export const COMBAT_STRATEGIES: CombatStrategy[] = [
  'technical', 'accurate', 'strong', 'fast', 'defensive', 'agile',
];

export interface StrategyBonus {
  accuracy: number;
  power: number;
  speed: number;
  defense: number;
  dodge: number;
}

export const STRATEGY_BONUSES: Record<CombatStrategy, StrategyBonus> = {
  technical:  { accuracy: 0,  power: 0,  speed: 0,  defense: 0,  dodge: 0 },
  accurate:   { accuracy: 10, power: -2, speed: -2, defense: -2, dodge: -2 },
  strong:     { accuracy: -2, power: 10, speed: -2, defense: -2, dodge: -2 },
  fast:       { accuracy: -2, power: -2, speed: 10, defense: -2, dodge: -2 },
  defensive:  { accuracy: -2, power: -2, speed: -2, defense: 10, dodge: -2 },
  agile:      { accuracy: -2, power: -2, speed: -2, defense: -2, dodge: 10 },
};

// ---- Damage types ----

export type PhysicalDamageType = 'slicing' | 'piercing' | 'bludgeoning' | 'crushing' | 'chopping';

export const PHYSICAL_DAMAGE_TYPES: PhysicalDamageType[] = [
  'slicing', 'piercing', 'bludgeoning', 'crushing', 'chopping',
];

export type ElementalDamageType = 'fire' | 'wind' | 'earth' | 'water' | 'energy';

export type DamageType = PhysicalDamageType | ElementalDamageType;

// ---- Combat stats ----

export interface CombatStats {
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  sp: number;
  maxSp: number;
  ep: number;
  maxEp: number;
  kp: number;
  maxKp: number;
  accuracy: number;
  power: number;
  speed: number;
  defense: number;
  dodge: number;
  critBonus: number;
  damageTypeBonuses: Partial<Record<DamageType, number>>;
  resistances: Partial<Record<DamageType, number>>;
  immunities: DamageType[];
}

// ---- Enemy definitions ----

export interface WeightedEntry<T> {
  value: T;
  weight: number;
}

export interface DropTableEntry {
  itemType: string;
  chance: number;
  minQty: number;
  maxQty: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  tier: number;
  baseStats: CombatStats;
  respawnMs: number;
  strategies: WeightedEntry<CombatStrategy>[];
  damageTypes: WeightedEntry<PhysicalDamageType>[];
  dropTable: DropTableEntry[];
  xpReward: number;
}

// ---- Combat actions ----

export interface CombatAction {
  type: 'attack' | 'defend' | 'run';
  strategy: CombatStrategy;
  damageType?: PhysicalDamageType;
}

// ---- Combat log ----

export interface CombatLogEntry {
  actor: string;
  target: string;
  damage: number;
  crit: boolean;
  dodged: boolean;
  defended: boolean;
  immune: boolean;
  message: string;
}

// ---- Combat state ----

export type CombatPhase = 'awaiting_action' | 'resolving' | 'victory' | 'defeat' | 'fled';

export interface CombatParticipant {
  id: string;
  name: string;
  isEnemy: boolean;
  stats: CombatStats;
  alive: boolean;
}

export interface CombatState {
  combatId: string;
  phase: CombatPhase;
  round: number;
  allies: CombatParticipant[];
  enemies: CombatParticipant[];
  log: CombatLogEntry[];
  awaitingActionFrom: string[];
  turnDeadline: number;    // server timestamp (ms) when auto-defend kicks in
  readyPlayerIds: string[]; // players who have submitted their action this round
}

// ---- Map enemy spawn ----

export interface MapEnemy {
  id: string;
  defId: string;
  name: string;
  x: number;
  y: number;
  combatId: string | null;
}
