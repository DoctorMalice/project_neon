import {
  type RaceId,
  type ClassId,
  type Attributes,
  type AttributeKey,
  type CharacterSheet,
  type CombatStats,
  type Equipment,
  type EquipSlot,
  type InventoryItem,
  ATTRIBUTE_KEYS,
  STARTING_ATTRIBUTE_POINTS,
  ATTRIBUTE_POINTS_PER_LEVEL,
  EQUIP_SLOTS,
  HAND_SLOTS,
  ITEM_DEFS,
  computeBaseAttributes,
  computeGrowths,
  deriveCombatStats,
  getLevelFromXP,
} from 'shared';

export interface ServerCharacter {
  sheet: CharacterSheet;
  combatStats: CombatStats;
  equipment: Equipment;
}

export function createCharacter(
  race: RaceId,
  cls: ClassId,
  initialAttributes: Partial<Attributes>,
): ServerCharacter {
  const baseAttrs = computeBaseAttributes(race, cls);
  const growths = computeGrowths(race, cls);

  // Validate and apply initial attribute allocation
  let cost = 0;
  for (const key of Object.keys(initialAttributes) as AttributeKey[]) {
    const val = initialAttributes[key];
    if (val && val > 0) {
      cost += val;
      baseAttrs[key] += val;
    }
  }

  const pointsSpent = Math.min(cost, STARTING_ATTRIBUTE_POINTS);
  // If they tried to spend more than allowed, clamp (server-side validation)
  if (cost > STARTING_ATTRIBUTE_POINTS) {
    // Reset — don't apply any
    const clean = computeBaseAttributes(race, cls);
    for (const key of ATTRIBUTE_KEYS) {
      baseAttrs[key] = clean[key];
    }
  }

  const sheet: CharacterSheet = {
    race,
    class: cls,
    level: 0,
    xp: 0,
    attributePoints: cost > STARTING_ATTRIBUTE_POINTS ? STARTING_ATTRIBUTE_POINTS : STARTING_ATTRIBUTE_POINTS - pointsSpent,
    attributes: baseAttrs,
    attributeGrowths: growths,
  };

  return {
    sheet,
    combatStats: deriveCombatStats(sheet),
    equipment: {},
  };
}

export interface LevelUpResult {
  leveled: boolean;
  oldLevel: number;
  newLevel: number;
  growthIncreases: Partial<Attributes>;
}

export function addXP(character: ServerCharacter, amount: number): LevelUpResult {
  const oldLevel = character.sheet.level;
  character.sheet.xp += amount;
  const newLevel = getLevelFromXP(character.sheet.xp);

  if (newLevel <= oldLevel) {
    return { leveled: false, oldLevel, newLevel: oldLevel, growthIncreases: {} };
  }

  const levelsGained = newLevel - oldLevel;
  character.sheet.attributePoints += ATTRIBUTE_POINTS_PER_LEVEL * levelsGained;

  const growthIncreases: Partial<Attributes> = {};

  for (let i = 0; i < levelsGained; i++) {
    for (const key of ATTRIBUTE_KEYS) {
      const growthRate = character.sheet.attributeGrowths[key];
      const guaranteed = Math.floor(growthRate / 100);
      const remainder = growthRate % 100;
      const randomGrowth = Math.random() * 100 < remainder ? 1 : 0;
      const total = guaranteed + randomGrowth;
      if (total > 0) {
        character.sheet.attributes[key] += total;
        growthIncreases[key] = (growthIncreases[key] ?? 0) + total;
      }
    }
  }

  character.sheet.level = newLevel;
  refreshCombatStats(character);

  return { leveled: true, oldLevel, newLevel, growthIncreases };
}

export function allocateAttributes(character: ServerCharacter, changes: Partial<Attributes>): boolean {
  let cost = 0;
  for (const key of Object.keys(changes) as AttributeKey[]) {
    const val = changes[key];
    if (val === undefined || val <= 0) continue;
    if (!ATTRIBUTE_KEYS.includes(key)) return false;
    cost += val;
  }

  if (cost <= 0 || cost > character.sheet.attributePoints) return false;

  character.sheet.attributePoints -= cost;
  for (const key of Object.keys(changes) as AttributeKey[]) {
    const val = changes[key];
    if (val && val > 0) {
      character.sheet.attributes[key] += val;
    }
  }

  refreshCombatStats(character);
  return true;
}

/** Recalculate max values from attributes but preserve current resource pools (clamped to new max) */
export function refreshCombatStats(character: ServerCharacter): void {
  const fresh = deriveCombatStats(character.sheet);
  const old = character.combatStats;

  // Preserve current resource values, clamped to new max
  fresh.hp = old ? Math.min(old.hp, fresh.maxHp) : fresh.maxHp;
  fresh.mp = old ? Math.min(old.mp, fresh.maxMp) : fresh.maxMp;
  fresh.sp = old ? Math.min(old.sp, fresh.maxSp) : fresh.maxSp;
  fresh.ep = old ? Math.min(old.ep, fresh.maxEp) : fresh.maxEp;
  fresh.kp = old ? Math.min(old.kp, fresh.maxKp) : fresh.maxKp;

  character.combatStats = fresh;
}

// ---- Equipment ----

export function equipItem(
  character: ServerCharacter,
  inventory: InventoryItem[],
  itemDefId: string,
  slot: EquipSlot,
): boolean {
  const def = ITEM_DEFS[itemDefId];
  if (!def) return false;
  if (!EQUIP_SLOTS.includes(slot)) return false;
  if (!def.equipSlots.includes(slot)) return false;

  // Must have item in inventory (match by item def name)
  const invEntry = inventory.find(i => i.itemType === def.name);
  if (!invEntry || invEntry.quantity < 1) return false;

  if (def.handedness === 'two_hand') {
    // Unequip both hand slots
    unequipSlot(character, inventory, 'wield_left');
    unequipSlot(character, inventory, 'wield_right');
    character.equipment.wield_left = itemDefId;
    character.equipment.wield_right = itemDefId;
  } else {
    // Unequip current item in target slot
    unequipSlot(character, inventory, slot);

    // If equipping a one-handed weapon, check if a two-hander occupies the other slot
    if (HAND_SLOTS.includes(slot)) {
      const otherSlot: EquipSlot = slot === 'wield_left' ? 'wield_right' : 'wield_left';
      const otherItemId = character.equipment[otherSlot];
      if (otherItemId) {
        const otherDef = ITEM_DEFS[otherItemId];
        if (otherDef?.handedness === 'two_hand') {
          unequipSlot(character, inventory, otherSlot);
        }
      }
    }

    character.equipment[slot] = itemDefId;
  }

  // Remove from inventory
  invEntry.quantity -= 1;
  if (invEntry.quantity <= 0) {
    const idx = inventory.indexOf(invEntry);
    inventory.splice(idx, 1);
  }

  refreshCombatStats(character);
  return true;
}

export function unequipSlot(
  character: ServerCharacter,
  inventory: InventoryItem[],
  slot: EquipSlot,
): boolean {
  const itemDefId = character.equipment[slot];
  if (!itemDefId) return false;

  const def = ITEM_DEFS[itemDefId];
  if (!def) {
    delete character.equipment[slot];
    return false;
  }

  if (def.handedness === 'two_hand') {
    delete character.equipment.wield_left;
    delete character.equipment.wield_right;
  } else {
    delete character.equipment[slot];
  }

  // Return to inventory
  const existing = inventory.find(i => i.itemType === def.name);
  if (existing) {
    existing.quantity += 1;
  } else {
    inventory.push({ itemType: def.name, quantity: 1 });
  }

  refreshCombatStats(character);
  return true;
}
