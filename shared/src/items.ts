import type { DamageType, PhysicalDamageType } from './combat-types';

// ---- Equipment slots ----

export type EquipSlot = 'head' | 'chest' | 'hands' | 'legs' | 'feet' | 'wield_left' | 'wield_right';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'chest', 'hands', 'legs', 'feet', 'wield_left', 'wield_right'];

export const HAND_SLOTS: EquipSlot[] = ['wield_left', 'wield_right'];

export type Equipment = Partial<Record<EquipSlot, string>>; // slot -> item def id

// ---- Per-damage-type combat bonuses (mirrors IL structure) ----

export type DamageTypeBonusMap = Partial<Record<DamageType, number>>;

export interface ItemCombatBonus {
  accuracy: DamageTypeBonusMap;
  power: DamageTypeBonusMap;
  dodge: DamageTypeBonusMap;
  defense: DamageTypeBonusMap;
}

function emptyBonus(): ItemCombatBonus {
  return { accuracy: {}, power: {}, dodge: {}, defense: {} };
}

// ---- Item definitions ----

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  itemType: 'weapon' | 'armor' | 'resource';
  equipSlots: EquipSlot[];
  handedness: 'one_hand' | 'two_hand' | null;
  weaponType: string | null;
  armorType: string | null;
  damageTypes: PhysicalDamageType[];
  combatBonus: ItemCombatBonus;
  combatPenalty: ItemCombatBonus;
}

// Unarmed defaults
export const UNARMED_DAMAGE_TYPE: PhysicalDamageType = 'bludgeoning';

// ---- Item registry ----

export const ITEM_DEFS: Record<string, ItemDef> = {
  wood_knife: {
    id: 'wood_knife',
    name: 'Wood Knife',
    description: 'Standard wooden dagger; doubles as a utility knife',
    itemType: 'weapon',
    equipSlots: ['wield_left', 'wield_right'],
    handedness: 'one_hand',
    weaponType: 'dagger',
    armorType: null,
    damageTypes: ['slicing', 'piercing'],
    combatBonus: {
      accuracy: { slicing: 1, piercing: 1 },
      power: { piercing: 1 },
      dodge: { slicing: 1, piercing: 1, bludgeoning: 1, crushing: 1, chopping: 1 },
      defense: {},
    },
    combatPenalty: emptyBonus(),
  },
};

// ---- Helpers ----

export function getItemDef(id: string): ItemDef | undefined {
  return ITEM_DEFS[id];
}

export function getEquippedWeaponDamageTypes(equipment: Equipment): PhysicalDamageType[] {
  for (const slot of HAND_SLOTS) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    const def = ITEM_DEFS[itemId];
    if (def && def.damageTypes.length > 0) return def.damageTypes;
  }
  return [UNARMED_DAMAGE_TYPE];
}

/** Sum combat bonuses from all equipped items for a given damage type */
export function resolveEquipmentBonuses(
  equipment: Equipment,
  damageType: DamageType,
): { accuracy: number; power: number; dodge: number; defense: number } {
  const result = { accuracy: 0, power: 0, dodge: 0, defense: 0 };
  const seen = new Set<string>(); // avoid double-counting two-handed weapons

  for (const slot of EQUIP_SLOTS) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    if (seen.has(`${slot}:${itemId}`)) continue;
    seen.add(`${slot}:${itemId}`);

    // Two-handed: mark the other slot too
    const def = ITEM_DEFS[itemId];
    if (!def) continue;
    if (def.handedness === 'two_hand') {
      for (const hs of HAND_SLOTS) seen.add(`${hs}:${itemId}`);
    }

    result.accuracy += def.combatBonus.accuracy[damageType] ?? 0;
    result.power += def.combatBonus.power[damageType] ?? 0;
    result.dodge += def.combatBonus.dodge[damageType] ?? 0;
    result.defense += def.combatBonus.defense[damageType] ?? 0;
  }

  return result;
}
