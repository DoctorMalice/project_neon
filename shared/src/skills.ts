import type { CombatStrategy } from './combat-types';
import { getLevelFromXP } from './character';

// ---- Skill IDs ----

export const COMBAT_SKILL_IDS = [
  'melee_technique',
  'melee_accuracy',
  'melee_power',
  'melee_speed',
  'melee_defense',
  'melee_agility',
] as const;

export type CombatSkillId = typeof COMBAT_SKILL_IDS[number];
export type SkillId = CombatSkillId;
export type SkillXPMap = Partial<Record<SkillId, number>>;

// ---- Skill definitions ----

export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  stat: 'accuracy' | 'power' | 'speed' | 'defense' | 'dodge' | null;
}

export const SKILL_DEFS: Record<CombatSkillId, SkillDef> = {
  melee_technique: { id: 'melee_technique', name: 'Melee Technique', description: 'General melee proficiency, gates higher-level gear', stat: null },
  melee_accuracy:  { id: 'melee_accuracy',  name: 'Melee Accuracy',  description: 'Improves accuracy through precise strikes', stat: 'accuracy' },
  melee_power:     { id: 'melee_power',     name: 'Melee Power',     description: 'Improves power through forceful blows', stat: 'power' },
  melee_speed:     { id: 'melee_speed',     name: 'Melee Speed',     description: 'Improves speed through quick attacks', stat: 'speed' },
  melee_defense:   { id: 'melee_defense',   name: 'Melee Defense',   description: 'Improves defense through defensive combat', stat: 'defense' },
  melee_agility:   { id: 'melee_agility',   name: 'Melee Agility',   description: 'Improves dodge through agile maneuvers', stat: 'dodge' },
};

// ---- Mappings ----

export const STRATEGY_SKILL_MAP: Record<CombatStrategy, CombatSkillId> = {
  technical: 'melee_technique',
  accurate:  'melee_accuracy',
  strong:    'melee_power',
  fast:      'melee_speed',
  defensive: 'melee_defense',
  agile:     'melee_agility',
};

export const SKILL_STAT_MAP: Partial<Record<CombatSkillId, 'accuracy' | 'power' | 'speed' | 'defense' | 'dodge'>> = {
  melee_accuracy:  'accuracy',
  melee_power:     'power',
  melee_speed:     'speed',
  melee_defense:   'defense',
  melee_agility:   'dodge',
};

// ---- Constants ----

export const SKILL_TO_CORE_XP_DIVISOR = 5;
export const BASE_SKILL_XP = 50;
export const SKILL_XP_PER_DAMAGE = 10;

// ---- Skill bonus resolution ----

export interface SkillBonuses {
  accuracy: number;
  power: number;
  speed: number;
  defense: number;
  dodge: number;
}

export function resolveSkillBonuses(skills: SkillXPMap): SkillBonuses {
  const bonuses: SkillBonuses = { accuracy: 0, power: 0, speed: 0, defense: 0, dodge: 0 };

  for (const skillId of COMBAT_SKILL_IDS) {
    const xp = skills[skillId];
    if (!xp || xp <= 0) continue;
    const level = getLevelFromXP(xp);
    if (level <= 0) continue;
    const stat = SKILL_STAT_MAP[skillId];
    if (stat) bonuses[stat] += level;
  }

  return bonuses;
}
