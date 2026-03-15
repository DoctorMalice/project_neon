// ---- Attribute system ----

export const ATTRIBUTE_KEYS = [
  'constitution', 'regeneration', 'mentis', 'fortitude',
  'endurance', 'recovery', 'tenacity', 'recuperation',
  'aura', 'meditation', 'strength', 'toughness', 'intelligence', 'dexterity',
  'celerity', 'charisma', 'luck',
] as const;

export type AttributeKey = typeof ATTRIBUTE_KEYS[number];
export type Attributes = Record<AttributeKey, number>;
export type AttributeGrowths = Record<AttributeKey, number>;

function zeroAttributes(): Attributes {
  return {
    constitution: 0, regeneration: 0, mentis: 0, fortitude: 0,
    endurance: 0, recovery: 0, tenacity: 0, recuperation: 0,
    aura: 0, meditation: 0, strength: 0, toughness: 0,
    intelligence: 0, dexterity: 0, celerity: 0, charisma: 0, luck: 0,
  };
}

// ---- Races ----

export interface RaceDef {
  name: string;
  attributes: Attributes;
  growths: AttributeGrowths;
}

export const RACE_IDS = ['Human', 'Orc', 'Dwarf', 'Elf', 'Gnome', 'Halfling'] as const;
export type RaceId = typeof RACE_IDS[number];

export const RACES: Record<RaceId, RaceDef> = {
  Human: {
    name: 'Human',
    attributes: {
      constitution: 5, regeneration: 0, mentis: 5, fortitude: 0,
      endurance: 5, recovery: 5, tenacity: 5, recuperation: 3,
      aura: 5, meditation: 2, strength: 5, toughness: 5,
      intelligence: 5, dexterity: 5, celerity: 5, charisma: 5, luck: 5,
    },
    growths: {
      constitution: 25, regeneration: 0, mentis: 25, fortitude: 0,
      endurance: 25, recovery: 25, tenacity: 25, recuperation: 25,
      aura: 25, meditation: 0, strength: 25, toughness: 25,
      intelligence: 25, dexterity: 25, celerity: 25, charisma: 25, luck: 25,
    },
  },
  Orc: {
    name: 'Orc',
    attributes: {
      constitution: 10, regeneration: 0, mentis: 2, fortitude: 0,
      endurance: 8, recovery: 4, tenacity: 8, recuperation: 3,
      aura: 2, meditation: 1, strength: 9, toughness: 9,
      intelligence: 2, dexterity: 2, celerity: 4, charisma: 1, luck: 5,
    },
    growths: {
      constitution: 50, regeneration: 0, mentis: 10, fortitude: 0,
      endurance: 40, recovery: 15, tenacity: 35, recuperation: 25,
      aura: 10, meditation: 0, strength: 45, toughness: 45,
      intelligence: 15, dexterity: 10, celerity: 15, charisma: 10, luck: 25,
    },
  },
  Dwarf: {
    name: 'Dwarf',
    attributes: {
      constitution: 6, regeneration: 0, mentis: 3, fortitude: 0,
      endurance: 8, recovery: 6, tenacity: 6, recuperation: 3,
      aura: 3, meditation: 1, strength: 7, toughness: 7,
      intelligence: 4, dexterity: 4, celerity: 3, charisma: 4, luck: 5,
    },
    growths: {
      constitution: 30, regeneration: 0, mentis: 15, fortitude: 0,
      endurance: 45, recovery: 25, tenacity: 30, recuperation: 25,
      aura: 15, meditation: 0, strength: 35, toughness: 35,
      intelligence: 20, dexterity: 20, celerity: 15, charisma: 15, luck: 25,
    },
  },
  Elf: {
    name: 'Elf',
    attributes: {
      constitution: 2, regeneration: 0, mentis: 8, fortitude: 0,
      endurance: 6, recovery: 7, tenacity: 4, recuperation: 3,
      aura: 3, meditation: 2, strength: 2, toughness: 2,
      intelligence: 8, dexterity: 7, celerity: 6, charisma: 5, luck: 5,
    },
    growths: {
      constitution: 10, regeneration: 0, mentis: 45, fortitude: 0,
      endurance: 25, recovery: 25, tenacity: 15, recuperation: 25,
      aura: 15, meditation: 0, strength: 10, toughness: 10,
      intelligence: 50, dexterity: 40, celerity: 30, charisma: 25, luck: 25,
    },
  },
  Gnome: {
    name: 'Gnome',
    attributes: {
      constitution: 1, regeneration: 0, mentis: 10, fortitude: 0,
      endurance: 2, recovery: 5, tenacity: 5, recuperation: 3,
      aura: 2, meditation: 2, strength: 1, toughness: 1,
      intelligence: 10, dexterity: 8, celerity: 4, charisma: 7, luck: 9,
    },
    growths: {
      constitution: 10, regeneration: 0, mentis: 50, fortitude: 0,
      endurance: 20, recovery: 25, tenacity: 10, recuperation: 20,
      aura: 10, meditation: 0, strength: 10, toughness: 10,
      intelligence: 50, dexterity: 35, celerity: 20, charisma: 30, luck: 50,
    },
  },
  Halfling: {
    name: 'Halfling',
    attributes: {
      constitution: 2, regeneration: 0, mentis: 6, fortitude: 0,
      endurance: 6, recovery: 4, tenacity: 5, recuperation: 3,
      aura: 3, meditation: 2, strength: 3, toughness: 3,
      intelligence: 6, dexterity: 10, celerity: 4, charisma: 7, luck: 6,
    },
    growths: {
      constitution: 20, regeneration: 0, mentis: 30, fortitude: 0,
      endurance: 20, recovery: 20, tenacity: 15, recuperation: 15,
      aura: 10, meditation: 0, strength: 20, toughness: 20,
      intelligence: 25, dexterity: 50, celerity: 25, charisma: 40, luck: 40,
    },
  },
};

// ---- Classes ----

export interface ClassDef {
  name: string;
  attributes: Attributes;
  growths: AttributeGrowths;
}

export const CLASS_IDS = ['Traveler', 'Apprentice', 'Fighter', 'Tank', 'Scholar', 'Craftsman', 'Merchant'] as const;
export type ClassId = typeof CLASS_IDS[number];

export const CLASSES: Record<ClassId, ClassDef> = {
  Traveler: {
    name: 'Traveler',
    attributes: {
      constitution: 5, regeneration: 0, mentis: 5, fortitude: 0,
      endurance: 5, recovery: 5, tenacity: 5, recuperation: 3,
      aura: 5, meditation: 2, strength: 5, toughness: 5,
      intelligence: 5, dexterity: 5, celerity: 5, charisma: 5, luck: 5,
    },
    growths: {
      constitution: 25, regeneration: 0, mentis: 25, fortitude: 0,
      endurance: 25, recovery: 25, tenacity: 25, recuperation: 25,
      aura: 25, meditation: 0, strength: 25, toughness: 25,
      intelligence: 25, dexterity: 25, celerity: 25, charisma: 25, luck: 25,
    },
  },
  Apprentice: {
    name: 'Apprentice',
    attributes: {
      constitution: 0, regeneration: 0, mentis: 0, fortitude: 0,
      endurance: 0, recovery: 0, tenacity: 0, recuperation: 0,
      aura: 0, meditation: 0, strength: 0, toughness: 0,
      intelligence: 0, dexterity: 0, celerity: 0, charisma: 0, luck: 0,
    },
    growths: {
      constitution: 50, regeneration: 0, mentis: 50, fortitude: 0,
      endurance: 50, recovery: 50, tenacity: 50, recuperation: 50,
      aura: 50, meditation: 0, strength: 50, toughness: 50,
      intelligence: 50, dexterity: 50, celerity: 50, charisma: 50, luck: 50,
    },
  },
  Fighter: {
    name: 'Fighter',
    attributes: {
      constitution: 8, regeneration: 0, mentis: 2, fortitude: 0,
      endurance: 6, recovery: 5, tenacity: 7, recuperation: 3,
      aura: 6, meditation: 1, strength: 7, toughness: 6,
      intelligence: 3, dexterity: 2, celerity: 6, charisma: 3, luck: 5,
    },
    growths: {
      constitution: 35, regeneration: 0, mentis: 10, fortitude: 0,
      endurance: 35, recovery: 30, tenacity: 30, recuperation: 35,
      aura: 30, meditation: 0, strength: 40, toughness: 30,
      intelligence: 10, dexterity: 15, celerity: 20, charisma: 10, luck: 20,
    },
  },
  Tank: {
    name: 'Tank',
    attributes: {
      constitution: 14, regeneration: 0, mentis: 1, fortitude: 0,
      endurance: 2, recovery: 2, tenacity: 5, recuperation: 3,
      aura: 7, meditation: 3, strength: 4, toughness: 14,
      intelligence: 3, dexterity: 1, celerity: 1, charisma: 5, luck: 5,
    },
    growths: {
      constitution: 50, regeneration: 0, mentis: 10, fortitude: 0,
      endurance: 30, recovery: 20, tenacity: 25, recuperation: 15,
      aura: 30, meditation: 0, strength: 30, toughness: 50,
      intelligence: 10, dexterity: 10, celerity: 15, charisma: 25, luck: 25,
    },
  },
  Scholar: {
    name: 'Scholar',
    attributes: {
      constitution: 1, regeneration: 0, mentis: 12, fortitude: 0,
      endurance: 2, recovery: 1, tenacity: 4, recuperation: 3,
      aura: 4, meditation: 4, strength: 2, toughness: 2,
      intelligence: 15, dexterity: 2, celerity: 3, charisma: 10, luck: 5,
    },
    growths: {
      constitution: 10, regeneration: 0, mentis: 60, fortitude: 0,
      endurance: 15, recovery: 20, tenacity: 15, recuperation: 25,
      aura: 15, meditation: 0, strength: 10, toughness: 10,
      intelligence: 65, dexterity: 15, celerity: 25, charisma: 40, luck: 25,
    },
  },
  Craftsman: {
    name: 'Craftsman',
    attributes: {
      constitution: 7, regeneration: 0, mentis: 3, fortitude: 0,
      endurance: 3, recovery: 4, tenacity: 1, recuperation: 1,
      aura: 1, meditation: 2, strength: 6, toughness: 6,
      intelligence: 3, dexterity: 15, celerity: 4, charisma: 8, luck: 6,
    },
    growths: {
      constitution: 30, regeneration: 0, mentis: 20, fortitude: 0,
      endurance: 20, recovery: 20, tenacity: 10, recuperation: 10,
      aura: 10, meditation: 0, strength: 30, toughness: 30,
      intelligence: 15, dexterity: 65, celerity: 20, charisma: 35, luck: 35,
    },
  },
  Merchant: {
    name: 'Merchant',
    attributes: {
      constitution: 2, regeneration: 0, mentis: 2, fortitude: 0,
      endurance: 1, recovery: 1, tenacity: 1, recuperation: 1,
      aura: 1, meditation: 1, strength: 1, toughness: 3,
      intelligence: 12, dexterity: 15, celerity: 5, charisma: 15, luck: 9,
    },
    growths: {
      constitution: 15, regeneration: 0, mentis: 15, fortitude: 0,
      endurance: 10, recovery: 10, tenacity: 10, recuperation: 10,
      aura: 10, meditation: 0, strength: 10, toughness: 20,
      intelligence: 45, dexterity: 60, celerity: 25, charisma: 60, luck: 50,
    },
  },
};

// ---- Character sheet ----

export interface CharacterSheet {
  race: RaceId;
  class: ClassId;
  level: number;
  xp: number;
  attributePoints: number;
  attributes: Attributes;
  attributeGrowths: AttributeGrowths;
}

// ---- XP formulas ----

export const XP_BASE = 12500;
export const XP_EXPONENT = 9;
export const XP_DIVISOR = 100;
export const STARTING_ATTRIBUTE_POINTS = 5;
export const ATTRIBUTE_POINTS_PER_LEVEL = 3;

export function getTotalXPForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(XP_BASE * (Math.pow(XP_EXPONENT, level / XP_DIVISOR) - 1));
}

export function getLevelFromXP(xp: number): number {
  if (xp <= 0) return 0;
  const level = (XP_DIVISOR * Math.log(xp / XP_BASE + 1)) / Math.log(XP_EXPONENT);
  return Math.max(0, Math.floor(level));
}

// ---- Attribute computation ----

export function computeBaseAttributes(race: RaceId, cls: ClassId): Attributes {
  const raceData = RACES[race];
  const classData = CLASSES[cls];
  const result = zeroAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    result[key] = raceData.attributes[key] + classData.attributes[key];
  }
  return result;
}

export function computeGrowths(race: RaceId, cls: ClassId): AttributeGrowths {
  const raceData = RACES[race];
  const classData = CLASSES[cls];
  const result = zeroAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    result[key] = raceData.growths[key] + classData.growths[key];
  }
  return result;
}

// ---- Combat stat derivation ----

import type { CombatStats } from './combat-types';

export function deriveCombatStats(sheet: CharacterSheet): CombatStats {
  const a = sheet.attributes;
  return {
    level: sheet.level,
    hp: a.constitution, maxHp: a.constitution,
    mp: a.mentis, maxMp: a.mentis,
    sp: a.endurance, maxSp: a.endurance,
    ep: a.tenacity, maxEp: a.tenacity,
    kp: a.aura, maxKp: a.aura,
    accuracy: 0,
    power: a.strength,
    speed: a.celerity,
    defense: a.toughness,
    dodge: a.dexterity,
    critBonus: a.luck,
    damageTypeBonuses: {},
    resistances: {},
    immunities: [],
  };
}
