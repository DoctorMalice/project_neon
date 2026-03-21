import type { CombatStrategy, ElementalDamageType } from './combat-types';

// ---- Abilities (EP-based melee power moves) ----

export type AbilityId = 'strong_strike';

export interface AbilityEffect {
  type: 'max_hit_multiplier';
  value: number;
}

export interface AbilityDef {
  id: AbilityId;
  name: string;
  requiredStrategy: CombatStrategy;
  epCost: number;
  effects: AbilityEffect[];
}

export const ABILITY_DEFS: Record<AbilityId, AbilityDef> = {
  strong_strike: {
    id: 'strong_strike',
    name: 'Strong Strike',
    requiredStrategy: 'strong',
    epCost: 5,
    effects: [{ type: 'max_hit_multiplier', value: 2 }],
  },
};

export const ABILITY_IDS = Object.keys(ABILITY_DEFS) as AbilityId[];

// ---- Spells (MP-based elemental magic) ----

export type SpellId = 'energy_strike' | 'fire_strike' | 'wind_strike' | 'earth_strike' | 'water_strike';

export interface SpellDef {
  id: SpellId;
  name: string;
  element: ElementalDamageType;
  mpCost: number;
  basePower: number;
  backfireChance: number;
}

export const SPELL_DEFS: Record<SpellId, SpellDef> = {
  energy_strike: { id: 'energy_strike', name: 'Energy Strike', element: 'energy', mpCost: 5, basePower: 1.0, backfireChance: 0.1 },
  fire_strike:   { id: 'fire_strike',   name: 'Fire Strike',   element: 'fire',   mpCost: 5, basePower: 1.0, backfireChance: 0.1 },
  wind_strike:   { id: 'wind_strike',   name: 'Wind Strike',   element: 'wind',   mpCost: 5, basePower: 1.0, backfireChance: 0.1 },
  earth_strike:  { id: 'earth_strike',  name: 'Earth Strike',  element: 'earth',  mpCost: 5, basePower: 1.0, backfireChance: 0.1 },
  water_strike:  { id: 'water_strike',  name: 'Water Strike',  element: 'water',  mpCost: 5, basePower: 1.0, backfireChance: 0.1 },
};

export const SPELL_IDS = Object.keys(SPELL_DEFS) as SpellId[];

// ---- Auras (KP-based persistent passive effects) ----

export type AuraId = 'rush' | 'harden';

export interface AuraEffect {
  type: 'speed' | 'damage_mitigation';
  modifier: number;
}

export interface AuraDef {
  id: AuraId;
  name: string;
  kpCost: number;
  effects: AuraEffect[];
}

export const AURA_DEFS: Record<AuraId, AuraDef> = {
  rush:   { id: 'rush',   name: 'Rush',   kpCost: 5, effects: [{ type: 'speed', modifier: 0.10 }] },
  harden: { id: 'harden', name: 'Harden', kpCost: 5, effects: [{ type: 'damage_mitigation', modifier: 0.10 }] },
};

export const AURA_IDS = Object.keys(AURA_DEFS) as AuraId[];

// ---- Aura effect computation ----

export interface AuraEffects {
  speed: number;
  damageMitigation: number;
}

export function computeAuraEffects(activeAuraIds: string[]): AuraEffects {
  let speed = 0;
  let damageMitigation = 0;

  for (const auraId of activeAuraIds) {
    const def = AURA_DEFS[auraId as AuraId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.type === 'speed') speed += effect.modifier;
      else if (effect.type === 'damage_mitigation') damageMitigation += effect.modifier;
    }
  }

  return { speed, damageMitigation };
}
