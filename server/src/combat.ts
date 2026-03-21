import {
  COMBAT_RUN_CHANCE,
  COMBAT_CRIT_BASE_PERCENT,
  COMBAT_CRIT_MULTIPLIER,
  COMBAT_DODGE_BASE_PERCENT,
  COMBAT_DEFEND_REDUCTION,
  COMBAT_BONUS_DIVISOR_CHANCE,
  COMBAT_BONUS_DIVISOR_POWER,
  COMBAT_BONUS_DIVISOR_ACCURACY,
  COMBAT_BONUS_DIVISOR_DEFENSE,
  COMBAT_LEVEL_SCALE_PER_LEVEL,
  COMBAT_LEVEL_SCALE_MIN,
  COMBAT_LEVEL_SCALE_MAX,
  COMBAT_LEVEL_CLOSE_BAND,
  COMBAT_ACTION_TIMEOUT_MS,
  BASE_SKILL_XP,
  SKILL_XP_PER_DAMAGE,
  STRATEGY_SKILL_MAP,
  type CombatState,
  type CombatParticipant,
  type CombatAction,
  type CombatLogEntry,
  type CombatStats,
  type CombatStrategy,
  type CombatSkillId,
  type PhysicalDamageType,
  type DamageType,
  type WeightedEntry,
  type EnemyCombatFlags,
  DEFAULT_ENEMY_COMBAT_FLAGS,
  type InventoryItem,
  type ServerMessage,
  type Equipment,
  type RegenStats,
  resolveEquipmentBonuses,
  ABILITY_DEFS,
  type AbilityId,
  SPELL_DEFS,
  type SpellId,
  AURA_DEFS,
  type AuraId,
  computeAuraEffects,
} from 'shared';
import { ENEMY_DEFS, enemySpawns, type ServerEnemySpawn } from './enemies';
import type { WebSocket } from 'ws';

// ---- Types ----

interface PlayerHandle {
  id: string;
  displayName: string;
  ws: WebSocket;
}

interface CombatInstance {
  id: string;
  state: CombatState;
  enemySpawn: ServerEnemySpawn;
  playerActions: Map<string, CombatAction>;
  players: Map<string, PlayerHandle>;
  actionTimeout: ReturnType<typeof setTimeout> | null;
  autoDefendedPlayerIds: Set<string>;
  playerStrategyDamage: Map<string, Map<CombatSkillId, number>>; // playerId → skillId → total damage
  onEnd: (combatId: string, winners: Map<string, { xp: number; loot: InventoryItem[] }>, allyFinalStats: Map<string, CombatStats>, skillXP: Map<string, Record<string, number>>) => void;
  onEnemyDied: (spawn: ServerEnemySpawn) => void;
  onPlayerFled: (playerId: string) => void;
}

// ---- State ----

let nextCombatId = 1;
const combats = new Map<string, CombatInstance>();

// ---- Helpers ----

function rollWeighted<T>(entries: WeightedEntry<T>[]): T {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeParticipant(id: string, name: string, isEnemy: boolean, stats: CombatStats, equipment: Equipment = {}, combatFlags?: Partial<EnemyCombatFlags>, regenStats?: RegenStats): CombatParticipant {
  return {
    id,
    name,
    isEnemy,
    stats: { ...stats, damageTypeBonuses: { ...stats.damageTypeBonuses }, resistances: { ...stats.resistances }, immunities: [...stats.immunities] },
    alive: true,
    equipment,
    combatFlags,
    activeAuras: [],
    regenStats: regenStats ?? { regeneration: 0, fortitude: 0, recovery: 0, recuperation: 0, meditation: 0 },
  };
}

function sendToPlayer(player: PlayerHandle, msg: ServerMessage): void {
  if (player.ws.readyState === 1) { // WebSocket.OPEN
    player.ws.send(JSON.stringify(msg));
  }
}

// ---- Damage pipeline ----

import { STRATEGY_BONUSES } from 'shared';

function resolveDamage(
  attacker: CombatParticipant,
  defender: CombatParticipant,
  attackerStrategy: CombatStrategy,
  defenderStrategy: CombatStrategy,
  damageType: DamageType,
  isDefending: boolean,
): CombatLogEntry {
  const atkBonus = STRATEGY_BONUSES[attackerStrategy];
  const defBonus = STRATEGY_BONUSES[defenderStrategy];

  // Resolve combat flags (enemies use flags, players default to full capabilities)
  const atkFlags: EnemyCombatFlags = { ...DEFAULT_ENEMY_COMBAT_FLAGS, ...attacker.combatFlags };
  const defFlags: EnemyCombatFlags = { ...DEFAULT_ENEMY_COMBAT_FLAGS, ...defender.combatFlags };
  // Players always have full capabilities
  if (!attacker.isEnemy) { atkFlags.canCrit = true; atkFlags.canDodge = true; atkFlags.canMiss = false; }
  if (!defender.isEnemy) { defFlags.canCrit = true; defFlags.canDodge = true; defFlags.canMiss = true; }

  // Aura effects
  const atkAuraEffects = computeAuraEffects(attacker.activeAuras);
  const defAuraEffects = computeAuraEffects(defender.activeAuras);

  // Attacker offense: base stats + attacker strategy + equipment bonuses for this damage type
  const atkEquip = resolveEquipmentBonuses(attacker.equipment, damageType);
  const effectiveAccuracy = attacker.stats.accuracy + atkBonus.accuracy + atkEquip.accuracy;
  const effectivePower = attacker.stats.power + atkBonus.power + atkEquip.power;
  const effectiveSpeed = Math.floor(attacker.stats.speed * (1 + atkAuraEffects.speed));
  const effectiveCrit = attacker.stats.critBonus;

  // Defender defense: base stats + defender strategy + equipment bonuses for this damage type
  const defEquip = resolveEquipmentBonuses(defender.equipment, damageType);
  const effectiveDodge = defender.stats.dodge + defBonus.dodge + defEquip.dodge;
  const effectiveDefense = defender.stats.defense + defBonus.defense + defEquip.defense;

  // Step 1: Immunity check
  if (defender.stats.immunities.includes(damageType)) {
    return {
      actor: attacker.name,
      actorId: attacker.id,
      target: defender.name,
      targetId: defender.id,
      damage: 0,
      crit: false,
      dodged: false,
      defended: false,
      immune: true,
      message: `${defender.name} is immune to ${damageType}!`,
    };
  }

  // Step 2a: Miss check — attacker can miss (based on defender's dodge as hit avoidance)
  if (atkFlags.canMiss) {
    const missChance = clamp(0, 1, (COMBAT_DODGE_BASE_PERCENT + effectiveDodge / COMBAT_BONUS_DIVISOR_CHANCE) / 100);
    if (Math.random() < missChance) {
      return {
        actor: attacker.name,
        actorId: attacker.id,
        target: defender.name,
        targetId: defender.id,
        damage: 0,
        crit: false,
        dodged: false,
        defended: false,
        immune: false,
        message: `${attacker.name}'s attack misses ${defender.name}!`,
      };
    }
  }

  // Step 2b: Dodge check — chance = (basePercent + bonus / divisor) / 100
  const dodgeChance = defFlags.canDodge
    ? clamp(0, 1, (COMBAT_DODGE_BASE_PERCENT + effectiveDodge / COMBAT_BONUS_DIVISOR_CHANCE) / 100)
    : 0;
  if (dodgeChance > 0 && Math.random() < dodgeChance) {
    return {
      actor: attacker.name,
      actorId: attacker.id,
      target: defender.name,
      targetId: defender.id,
      damage: 0,
      crit: false,
      dodged: true,
      defended: false,
      immune: false,
      message: `${defender.name} dodges ${attacker.name}'s attack!`,
    };
  }

  // Step 3: Damage roll — maxHit from power, minHit from accuracy, clamped [1, maxHit]
  const maxHit = Math.max(1, 1 + Math.floor(effectivePower / COMBAT_BONUS_DIVISOR_POWER));
  const minHit = clamp(1, maxHit, 1 + Math.floor(effectiveAccuracy / COMBAT_BONUS_DIVISOR_ACCURACY));
  let damage = minHit + Math.floor(Math.random() * (maxHit - minHit + 1));

  // Step 4: Crit check (only if attacker canCrit)
  const critChance = atkFlags.canCrit
    ? clamp(0, 1, (COMBAT_CRIT_BASE_PERCENT + effectiveCrit / COMBAT_BONUS_DIVISOR_CHANCE) / 100)
    : 0;
  const crit = critChance > 0 && Math.random() < critChance;
  if (crit) {
    damage = Math.floor(damage * COMBAT_CRIT_MULTIPLIER);
  }

  // Step 5: Defense mitigation — defensePct = defense / divisor, multiplier = 1 - pct/100
  const defensePct = effectiveDefense / COMBAT_BONUS_DIVISOR_DEFENSE;
  const mitigationMultiplier = Math.max(0, 1 - defensePct / 100);

  // Step 6: Level scaling
  const levelScale = clamp(
    COMBAT_LEVEL_SCALE_MIN,
    COMBAT_LEVEL_SCALE_MAX,
    1 + (attacker.stats.level - defender.stats.level) * COMBAT_LEVEL_SCALE_PER_LEVEL,
  );
  damage = Math.floor(damage * mitigationMultiplier * levelScale);

  // Step 7: Defend reduction
  if (isDefending) {
    damage = Math.floor(damage * COMBAT_DEFEND_REDUCTION);
  }

  // Step 7b: Aura damage mitigation
  if (defAuraEffects.damageMitigation > 0) {
    damage = Math.floor(damage * (1 - defAuraEffects.damageMitigation));
  }

  // Step 8: Close-level band minimum — ensure at least 1 damage if within close band
  const levelDelta = Math.abs(attacker.stats.level - defender.stats.level);
  if (levelDelta <= COMBAT_LEVEL_CLOSE_BAND && damage < 1) {
    damage = 1;
  }

  // Apply damage
  defender.stats.hp -= damage;
  if (defender.stats.hp <= 0) {
    defender.stats.hp = 0;
    defender.alive = false;
  }

  let message = `${attacker.name} attacks ${defender.name} for ${damage} damage!`;
  if (crit) message = `Critical hit! ${message}`;

  return {
    actor: attacker.name,
    actorId: attacker.id,
    target: defender.name,
    targetId: defender.id,
    damage,
    crit,
    dodged: false,
    defended: isDefending,
    immune: false,
    message,
  };
}

// ---- Ability resolution ----

function resolveAbility(
  attacker: CombatParticipant,
  defender: CombatParticipant,
  abilityId: string,
  combat: CombatInstance,
): CombatLogEntry {
  const def = ABILITY_DEFS[abilityId as AbilityId];
  if (!def) {
    return { actor: attacker.name, actorId: attacker.id, target: '', targetId: '', damage: 0, crit: false, dodged: false, defended: false, immune: false, message: `${attacker.name} tries an unknown ability!` };
  }

  // Check EP
  if (attacker.stats.ep < def.epCost) {
    return { actor: attacker.name, actorId: attacker.id, target: '', targetId: '', damage: 0, crit: false, dodged: false, defended: false, immune: false, message: `${attacker.name} doesn't have enough EP for ${def.name}!` };
  }

  // Deduct EP
  attacker.stats.ep -= def.epCost;

  // Resolve as attack with ability modifiers
  // Use the ability's required strategy
  const strategy = def.requiredStrategy;
  const atkBonus = STRATEGY_BONUSES[strategy];
  const defBonus = STRATEGY_BONUSES['technical']; // enemies use technical by default

  const atkFlags: EnemyCombatFlags = { ...DEFAULT_ENEMY_COMBAT_FLAGS, ...attacker.combatFlags };
  const defFlags: EnemyCombatFlags = { ...DEFAULT_ENEMY_COMBAT_FLAGS, ...defender.combatFlags };
  if (!attacker.isEnemy) { atkFlags.canCrit = true; atkFlags.canDodge = true; atkFlags.canMiss = false; }
  if (!defender.isEnemy) { defFlags.canCrit = true; defFlags.canDodge = true; defFlags.canMiss = true; }

  const atkAuraEffects = computeAuraEffects(attacker.activeAuras);
  const defAuraEffects = computeAuraEffects(defender.activeAuras);

  const damageType: DamageType = 'bludgeoning';
  const atkEquip = resolveEquipmentBonuses(attacker.equipment, damageType);
  const effectiveAccuracy = attacker.stats.accuracy + atkBonus.accuracy + atkEquip.accuracy;
  const effectivePower = attacker.stats.power + atkBonus.power + atkEquip.power;
  const effectiveCrit = attacker.stats.critBonus;

  const defEquip = resolveEquipmentBonuses(defender.equipment, damageType);
  const effectiveDodge = defender.stats.dodge + defBonus.dodge + defEquip.dodge;
  const effectiveDefense = defender.stats.defense + defBonus.defense + defEquip.defense;

  // Dodge check
  const dodgeChance = defFlags.canDodge
    ? clamp(0, 1, (COMBAT_DODGE_BASE_PERCENT + effectiveDodge / COMBAT_BONUS_DIVISOR_CHANCE) / 100)
    : 0;
  if (dodgeChance > 0 && Math.random() < dodgeChance) {
    return { actor: attacker.name, actorId: attacker.id, target: defender.name, targetId: defender.id, damage: 0, crit: false, dodged: true, defended: false, immune: false, message: `${defender.name} dodges ${attacker.name}'s ${def.name}!` };
  }

  // Damage roll with ability multipliers
  let maxHit = Math.max(1, 1 + Math.floor(effectivePower / COMBAT_BONUS_DIVISOR_POWER));

  // Apply ability effects
  for (const effect of def.effects) {
    if (effect.type === 'max_hit_multiplier') {
      maxHit = Math.floor(maxHit * effect.value);
    }
  }

  const minHit = clamp(1, maxHit, 1 + Math.floor(effectiveAccuracy / COMBAT_BONUS_DIVISOR_ACCURACY));
  let damage = minHit + Math.floor(Math.random() * (maxHit - minHit + 1));

  // Crit
  const critChance = atkFlags.canCrit
    ? clamp(0, 1, (COMBAT_CRIT_BASE_PERCENT + effectiveCrit / COMBAT_BONUS_DIVISOR_CHANCE) / 100)
    : 0;
  const crit = critChance > 0 && Math.random() < critChance;
  if (crit) damage = Math.floor(damage * COMBAT_CRIT_MULTIPLIER);

  // Defense mitigation
  const defensePct = effectiveDefense / COMBAT_BONUS_DIVISOR_DEFENSE;
  const mitigationMultiplier = Math.max(0, 1 - defensePct / 100);

  // Level scaling
  const levelScale = clamp(COMBAT_LEVEL_SCALE_MIN, COMBAT_LEVEL_SCALE_MAX, 1 + (attacker.stats.level - defender.stats.level) * COMBAT_LEVEL_SCALE_PER_LEVEL);
  damage = Math.floor(damage * mitigationMultiplier * levelScale);

  // Aura damage mitigation
  if (defAuraEffects.damageMitigation > 0) {
    damage = Math.floor(damage * (1 - defAuraEffects.damageMitigation));
  }

  // Close-level band minimum
  const levelDelta = Math.abs(attacker.stats.level - defender.stats.level);
  if (levelDelta <= COMBAT_LEVEL_CLOSE_BAND && damage < 1) damage = 1;

  // Apply damage
  defender.stats.hp -= damage;
  if (defender.stats.hp <= 0) { defender.stats.hp = 0; defender.alive = false; }

  let message = `${attacker.name} uses ${def.name} on ${defender.name} for ${damage} damage!`;
  if (crit) message = `Critical hit! ${message}`;

  return { actor: attacker.name, actorId: attacker.id, target: defender.name, targetId: defender.id, damage, crit, dodged: false, defended: false, immune: false, message };
}

// ---- Spell resolution ----

function resolveSpell(
  caster: CombatParticipant,
  target: CombatParticipant,
  spellId: string,
  castStrategy: CombatStrategy,
): CombatLogEntry {
  const def = SPELL_DEFS[spellId as SpellId];
  if (!def) {
    return { actor: caster.name, actorId: caster.id, target: '', targetId: '', damage: 0, crit: false, dodged: false, defended: false, immune: false, message: `${caster.name} tries an unknown spell!` };
  }

  // Check MP
  if (caster.stats.mp < def.mpCost) {
    return { actor: caster.name, actorId: caster.id, target: '', targetId: '', damage: 0, crit: false, dodged: false, defended: false, immune: false, message: `${caster.name} doesn't have enough MP for ${def.name}!` };
  }

  // Deduct MP
  caster.stats.mp -= def.mpCost;

  // Backfire check
  if (Math.random() < def.backfireChance * 0.1) {
    const selfDamage = Math.max(1, Math.floor(def.basePower * 2));
    caster.stats.hp -= selfDamage;
    if (caster.stats.hp <= 0) { caster.stats.hp = 0; caster.alive = false; }
    return { actor: caster.name, actorId: caster.id, target: caster.name, targetId: caster.id, damage: selfDamage, crit: false, dodged: false, defended: false, immune: false, message: `${caster.name}'s ${def.name} backfires for ${selfDamage} damage!` };
  }

  // Immunity check
  if (target.stats.immunities.includes(def.element)) {
    return { actor: caster.name, actorId: caster.id, target: target.name, targetId: target.id, damage: 0, crit: false, dodged: false, defended: false, immune: true, message: `${target.name} is immune to ${def.element}!` };
  }

  // Spell damage uses intelligence as base stat
  const stratBonus = STRATEGY_BONUSES[castStrategy];
  const power = caster.stats.intelligence + stratBonus.power;
  const accuracy = caster.stats.intelligence + stratBonus.accuracy;

  let maxHit = Math.max(1, Math.floor(1 + power / COMBAT_BONUS_DIVISOR_POWER));
  const minHit = clamp(1, maxHit, 1 + Math.floor(accuracy / COMBAT_BONUS_DIVISOR_ACCURACY));
  let damage = minHit + Math.floor(Math.random() * (maxHit - minHit + 1));

  // Apply base_power multiplier
  damage = Math.floor(damage * def.basePower);
  if (damage < 1) damage = 1;

  // Elemental effectiveness
  const resistance = target.stats.resistances[def.element] ?? 0;
  const effectiveness = Math.max(0, 1 - resistance);
  damage = Math.floor(damage * effectiveness);

  // Crit check (casters can always crit)
  const critChance = clamp(0, 1, (COMBAT_CRIT_BASE_PERCENT + caster.stats.critBonus / COMBAT_BONUS_DIVISOR_CHANCE) / 100);
  const crit = Math.random() < critChance;
  if (crit) damage = Math.floor(damage * COMBAT_CRIT_MULTIPLIER);

  // Defense mitigation
  const defBonus = STRATEGY_BONUSES['technical'];
  const defEquip = resolveEquipmentBonuses(target.equipment, def.element);
  const effectiveDefense = target.stats.defense + defBonus.defense + defEquip.defense;
  const defensePct = effectiveDefense / COMBAT_BONUS_DIVISOR_DEFENSE;
  const mitigationMultiplier = Math.max(0, 1 - defensePct / 100);
  damage = Math.floor(damage * mitigationMultiplier);

  // Level scaling
  const levelScale = clamp(COMBAT_LEVEL_SCALE_MIN, COMBAT_LEVEL_SCALE_MAX, 1 + (caster.stats.level - target.stats.level) * COMBAT_LEVEL_SCALE_PER_LEVEL);
  damage = Math.floor(damage * levelScale);

  // Aura damage mitigation on defender
  const defAuraEffects = computeAuraEffects(target.activeAuras);
  if (defAuraEffects.damageMitigation > 0) {
    damage = Math.floor(damage * (1 - defAuraEffects.damageMitigation));
  }

  // Close-level band minimum
  const levelDelta = Math.abs(caster.stats.level - target.stats.level);
  if (levelDelta <= COMBAT_LEVEL_CLOSE_BAND && damage < 1) damage = 1;

  // Apply damage
  target.stats.hp -= damage;
  if (target.stats.hp <= 0) { target.stats.hp = 0; target.alive = false; }

  let effectMsg = '';
  if (effectiveness < 1 && effectiveness > 0) effectMsg = ' (resisted)';
  else if (effectiveness === 0) effectMsg = ' (fully resisted)';

  let message = `${caster.name} casts ${def.name} on ${target.name} for ${damage} ${def.element} damage!${effectMsg}`;
  if (crit) message = `Critical hit! ${message}`;

  return { actor: caster.name, actorId: caster.id, target: target.name, targetId: target.id, damage, crit, dodged: false, defended: false, immune: false, message };
}

// ---- Aura toggle ----

export function toggleAura(playerId: string, combatId: string, auraId: string): boolean {
  const combat = combats.get(combatId);
  if (!combat) return false;

  const ally = combat.state.allies.find(a => a.id === playerId);
  if (!ally || !ally.alive) return false;

  const def = AURA_DEFS[auraId as AuraId];
  if (!def) return false;

  const idx = ally.activeAuras.indexOf(auraId);
  if (idx >= 0) {
    // Deactivate
    ally.activeAuras.splice(idx, 1);
  } else {
    // Check KP to activate
    if (ally.stats.kp < def.kpCost) return false;
    ally.activeAuras.push(auraId);
  }

  // Broadcast updated state
  for (const player of combat.players.values()) {
    sendToPlayer(player, { type: 'COMBAT_UPDATE', state: combat.state });
  }

  return true;
}

// ---- Round-end resource regen and aura drain ----

function applyRoundEndRegen(combat: CombatInstance): void {
  for (const ally of combat.state.allies) {
    if (!ally.alive) continue;
    const r = ally.regenStats;

    // Regen resources
    ally.stats.hp = Math.min(ally.stats.maxHp, ally.stats.hp + Math.floor(r.regeneration / 10));
    ally.stats.mp = Math.min(ally.stats.maxMp, ally.stats.mp + Math.floor(r.fortitude / 10));
    ally.stats.sp = Math.min(ally.stats.maxSp, ally.stats.sp + Math.floor(r.recovery / 10));
    ally.stats.ep = Math.min(ally.stats.maxEp, ally.stats.ep + Math.floor(r.recuperation / 10));
    ally.stats.kp = Math.min(ally.stats.maxKp, ally.stats.kp + Math.floor(r.meditation / 10));

    // Drain aura KP costs
    if (ally.activeAuras.length > 0) {
      let totalKpCost = 0;
      for (const auraId of ally.activeAuras) {
        const auraDef = AURA_DEFS[auraId as AuraId];
        if (auraDef) totalKpCost += auraDef.kpCost;
      }
      ally.stats.kp -= totalKpCost;

      // If KP hits 0 or below, deactivate all auras
      if (ally.stats.kp <= 0) {
        ally.stats.kp = 0;
        ally.activeAuras = [];
        combat.state.log.push({
          actor: ally.name, actorId: ally.id, target: '', targetId: '', damage: 0,
          crit: false, dodged: false, defended: false, immune: false,
          message: `${ally.name}'s auras deactivate due to KP depletion!`,
        });
      }
    }

    // Clamp all resources
    ally.stats.hp = clamp(0, ally.stats.maxHp, ally.stats.hp);
    ally.stats.mp = clamp(0, ally.stats.maxMp, ally.stats.mp);
    ally.stats.sp = clamp(0, ally.stats.maxSp, ally.stats.sp);
    ally.stats.ep = clamp(0, ally.stats.maxEp, ally.stats.ep);
    ally.stats.kp = clamp(0, ally.stats.maxKp, ally.stats.kp);
  }
}

// ---- Round resolution ----

function resolveRound(combat: CombatInstance): void {
  combat.state.phase = 'resolving';
  combat.state.log = [];

  // Snapshot HP before any damage is applied
  const snapshot: Record<string, number> = {};
  for (const p of [...combat.state.allies, ...combat.state.enemies]) {
    snapshot[p.id] = p.stats.hp;
  }
  combat.state.preRoundHp = snapshot;

  const enemyDef = ENEMY_DEFS[combat.enemySpawn.defId];

  // Resolve flee attempts first (separate pass to avoid mutating allies during iteration)
  const fleeingIds: string[] = [];
  for (const ally of combat.state.allies) {
    if (!ally.alive) continue;
    const action = combat.playerActions.get(ally.id);
    if (action?.type !== 'run') continue;

    if (Math.random() < COMBAT_RUN_CHANCE) {
      combat.state.log.push({
        actor: ally.name, actorId: ally.id, target: '', targetId: '', damage: 0,
        crit: false, dodged: false, defended: false, immune: false,
        message: `${ally.name} fled from combat!`,
      });
      fleeingIds.push(ally.id);
    } else {
      combat.state.log.push({
        actor: ally.name, actorId: ally.id, target: '', targetId: '', damage: 0,
        crit: false, dodged: false, defended: false, immune: false,
        message: `${ally.name} failed to run away!`,
      });
    }
  }

  // Remove fled players
  for (const fledId of fleeingIds) {
    const player = combat.players.get(fledId);
    if (player) {
      sendToPlayer(player, {
        type: 'COMBAT_END',
        state: combat.state,
        result: 'fled',
        xpGained: 0,
        loot: [],
      });
    }
    combat.state.allies = combat.state.allies.filter(a => a.id !== fledId);
    combat.state.awaitingActionFrom = combat.state.awaitingActionFrom.filter(id => id !== fledId);
    combat.players.delete(fledId);
    combat.playerActions.delete(fledId);
    combat.onPlayerFled(fledId);
  }

  // If no allies left after fleeing, end combat
  if (combat.players.size === 0 || combat.state.allies.length === 0) {
    combat.state.phase = 'defeat';
    endCombat(combat, 'defeat');
    return;
  }

  // Resolve attack/defend actions
  for (const ally of combat.state.allies) {
    if (!ally.alive) continue;
    const action = combat.playerActions.get(ally.id);
    if (!action || action.type === 'run') continue; // run already handled

    if (action.type === 'attack') {
      const target = combat.state.enemies.find(e => e.alive);
      if (target) {
        const entry = resolveDamage(ally, target, action.strategy, 'technical', action.damageType ?? 'bludgeoning', false);
        combat.state.log.push(entry);

        // Track damage by skill for skill XP
        if (entry.damage > 0) {
          const skillId = STRATEGY_SKILL_MAP[action.strategy];
          let playerDmg = combat.playerStrategyDamage.get(ally.id);
          if (!playerDmg) {
            playerDmg = new Map();
            combat.playerStrategyDamage.set(ally.id, playerDmg);
          }
          playerDmg.set(skillId, (playerDmg.get(skillId) ?? 0) + entry.damage);
        }
      }
    } else if (action.type === 'ability') {
      const target = combat.state.enemies.find(e => e.alive);
      if (target && action.abilityId) {
        const entry = resolveAbility(ally, target, action.abilityId, combat);
        combat.state.log.push(entry);

        // Track damage by skill for skill XP (ability uses its required strategy)
        if (entry.damage > 0) {
          const abilityDef = ABILITY_DEFS[action.abilityId as AbilityId];
          if (abilityDef) {
            const skillId = STRATEGY_SKILL_MAP[abilityDef.requiredStrategy];
            let playerDmg = combat.playerStrategyDamage.get(ally.id);
            if (!playerDmg) {
              playerDmg = new Map();
              combat.playerStrategyDamage.set(ally.id, playerDmg);
            }
            playerDmg.set(skillId, (playerDmg.get(skillId) ?? 0) + entry.damage);
          }
        }
      }
    } else if (action.type === 'spell') {
      const target = combat.state.enemies.find(e => e.alive);
      if (target && action.spellId) {
        const entry = resolveSpell(ally, target, action.spellId, action.strategy);
        combat.state.log.push(entry);
      }
    } else if (action.type === 'defend') {
      combat.state.log.push({
        actor: ally.name, actorId: ally.id, target: '', targetId: '', damage: 0,
        crit: false, dodged: false, defended: true, immune: false,
        message: `${ally.name} takes a defensive stance!`,
      });
    }
  }

  // Check if all enemies dead
  if (combat.state.enemies.every(e => !e.alive)) {
    combat.state.phase = 'victory';
    endCombat(combat, 'victory');
    return;
  }

  // Resolve enemy actions
  for (const enemy of combat.state.enemies) {
    if (!enemy.alive) continue;

    const aliveAllies = combat.state.allies.filter(a => a.alive);
    if (aliveAllies.length === 0) break;

    const target = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
    const isAttacking = Math.random() < 0.75;

    if (isAttacking) {
      const enemyStrategy = rollWeighted(enemyDef.strategies);
      const dmgType = rollWeighted(enemyDef.damageTypes);
      const playerAction = combat.playerActions.get(target.id);
      const isDefending = playerAction?.type === 'defend';
      const playerStrategy = playerAction?.strategy ?? 'technical';
      const entry = resolveDamage(enemy, target, enemyStrategy, playerStrategy, dmgType, isDefending);
      combat.state.log.push(entry);
    } else {
      combat.state.log.push({
        actor: enemy.name, actorId: enemy.id, target: '', targetId: '', damage: 0,
        crit: false, dodged: false, defended: false, immune: false,
        message: `${enemy.name} takes a defensive stance.`,
      });
    }
  }

  // Check if all allies dead
  if (combat.state.allies.every(a => !a.alive)) {
    combat.state.phase = 'defeat';
    endCombat(combat, 'defeat');
    return;
  }

  // Round-end regen and aura drain
  applyRoundEndRegen(combat);

  // Continue to next round
  combat.state.round++;
  combat.state.phase = 'awaiting_action';
  combat.state.awaitingActionFrom = combat.state.allies.filter(a => a.alive).map(a => a.id);
  combat.playerActions.clear();

  // Reset deadline and ready state before broadcasting
  startActionTimeout(combat);

  // Send update to all players (log still has this round's entries)
  for (const [playerId, player] of combat.players) {
    sendToPlayer(player, {
      type: 'COMBAT_UPDATE',
      state: combat.state,
      autoDefended: combat.autoDefendedPlayerIds.has(playerId),
    });
  }

  // Clear after broadcasting so subsequent ready-status updates don't re-trigger playback
  combat.state.log = [];
  combat.autoDefendedPlayerIds.clear();
}

function endCombat(combat: CombatInstance, result: 'victory' | 'defeat' | 'fled'): void {
  if (combat.actionTimeout) {
    clearTimeout(combat.actionTimeout);
    combat.actionTimeout = null;
  }

  const winners = new Map<string, { xp: number; loot: InventoryItem[] }>();

  if (result === 'victory') {
    const enemyDef = ENEMY_DEFS[combat.enemySpawn.defId];

    for (const ally of combat.state.allies) {
      if (!ally.alive) continue;

      const loot: InventoryItem[] = [];
      for (const drop of enemyDef.dropTable) {
        if (Math.random() < drop.chance) {
          const qty = drop.minQty + Math.floor(Math.random() * (drop.maxQty - drop.minQty + 1));
          loot.push({ itemType: drop.itemType, quantity: qty });
        }
      }
      winners.set(ally.id, { xp: enemyDef.xpReward, loot });
    }

    // Mark enemy spawn as inactive, schedule respawn
    combat.enemySpawn.active = false;
    combat.onEnemyDied(combat.enemySpawn);
  }

  // Compute skill XP for all players who dealt damage
  const skillXP = new Map<string, Record<string, number>>();
  for (const [playerId, dmgMap] of combat.playerStrategyDamage) {
    const playerSkillXP: Record<string, number> = {};
    for (const [skillId, damage] of dmgMap) {
      playerSkillXP[skillId] = BASE_SKILL_XP + SKILL_XP_PER_DAMAGE * damage;
    }
    skillXP.set(playerId, playerSkillXP);
  }

  // Send end message to all players
  for (const [playerId, player] of combat.players) {
    const reward = winners.get(playerId);
    sendToPlayer(player, {
      type: 'COMBAT_END',
      state: combat.state,
      result,
      xpGained: reward?.xp ?? 0,
      loot: reward?.loot ?? [],
      skillXPGained: skillXP.get(playerId),
      autoDefended: combat.autoDefendedPlayerIds.has(playerId),
    });
  }

  // Collect final stats for all allies (including dead ones)
  const allyFinalStats = new Map<string, CombatStats>();
  for (const ally of combat.state.allies) {
    allyFinalStats.set(ally.id, ally.stats);
  }

  combat.onEnd(combat.id, winners, allyFinalStats, skillXP);
  combats.delete(combat.id);
}

function startActionTimeout(combat: CombatInstance): void {
  if (combat.actionTimeout) clearTimeout(combat.actionTimeout);
  combat.state.turnDeadline = Date.now() + COMBAT_ACTION_TIMEOUT_MS;
  combat.state.readyPlayerIds = [];
  combat.actionTimeout = setTimeout(() => {
    // Auto-defend for anyone who hasn't submitted
    combat.autoDefendedPlayerIds.clear();
    for (const playerId of combat.state.awaitingActionFrom) {
      if (!combat.playerActions.has(playerId)) {
        combat.playerActions.set(playerId, { type: 'defend', strategy: 'technical' });
        combat.autoDefendedPlayerIds.add(playerId);
      }
    }
    combat.state.awaitingActionFrom = [];
    resolveRound(combat);
  }, COMBAT_ACTION_TIMEOUT_MS);
}

// ---- Public API ----

export function createCombat(
  player: PlayerHandle,
  enemySpawnId: string,
  onEnd: CombatInstance['onEnd'],
  onEnemyDied: CombatInstance['onEnemyDied'],
  onPlayerFled: CombatInstance['onPlayerFled'],
  playerStats?: CombatStats,
  playerEquipment?: Equipment,
  playerRegenStats?: RegenStats,
): string | null {
  const spawn = enemySpawns.get(enemySpawnId);
  if (!spawn || !spawn.active) return null;

  const enemyDef = ENEMY_DEFS[spawn.defId];
  if (!enemyDef) return null;

  const combatId = `combat_${nextCombatId++}`;

  const stats = playerStats ?? { level: 1, hp: 10, maxHp: 10, mp: 10, maxMp: 10, sp: 10, maxSp: 10, ep: 10, maxEp: 10, kp: 10, maxKp: 10, accuracy: 0, power: 5, speed: 5, defense: 5, dodge: 5, intelligence: 5, critBonus: 5, damageTypeBonuses: {}, resistances: {}, immunities: [] };
  const allyParticipant = makeParticipant(player.id, player.displayName, false, stats, playerEquipment ?? {}, undefined, playerRegenStats);
  const enemyParticipant = makeParticipant(
    `enemy_${combatId}`,
    enemyDef.name,
    true,
    { ...enemyDef.baseStats, hp: enemyDef.baseStats.maxHp },
    {},
    enemyDef.combatFlags,
  );

  const state: CombatState = {
    combatId,
    phase: 'awaiting_action',
    round: 1,
    allies: [allyParticipant],
    enemies: [enemyParticipant],
    log: [],
    preRoundHp: {},
    awaitingActionFrom: [player.id],
    turnDeadline: Date.now() + COMBAT_ACTION_TIMEOUT_MS,
    readyPlayerIds: [],
  };

  const combat: CombatInstance = {
    id: combatId,
    state,
    enemySpawn: spawn,
    playerActions: new Map(),
    players: new Map([[player.id, player]]),
    actionTimeout: null,
    autoDefendedPlayerIds: new Set(),
    playerStrategyDamage: new Map(),
    onEnd,
    onEnemyDied,
    onPlayerFled,
  };

  combats.set(combatId, combat);

  sendToPlayer(player, { type: 'COMBAT_START', state });
  startActionTimeout(combat);

  return combatId;
}

export function joinCombat(player: PlayerHandle, combatId: string, playerStats?: CombatStats, playerEquipment?: Equipment, playerRegenStats?: RegenStats): boolean {
  const combat = combats.get(combatId);
  if (!combat) return false;
  if (combat.state.phase !== 'awaiting_action') return false;
  if (combat.state.allies.length >= 3) return false;
  if (combat.players.has(player.id)) return false;

  const stats = playerStats ?? { level: 1, hp: 10, maxHp: 10, mp: 10, maxMp: 10, sp: 10, maxSp: 10, ep: 10, maxEp: 10, kp: 10, maxKp: 10, accuracy: 0, power: 5, speed: 5, defense: 5, dodge: 5, intelligence: 5, critBonus: 5, damageTypeBonuses: {}, resistances: {}, immunities: [] };
  const allyParticipant = makeParticipant(player.id, player.displayName, false, stats, playerEquipment ?? {}, undefined, playerRegenStats);
  combat.state.allies.push(allyParticipant);
  combat.state.awaitingActionFrom.push(player.id);
  combat.players.set(player.id, player);

  // Send current state to new player
  sendToPlayer(player, { type: 'COMBAT_START', state: combat.state });

  // Notify existing players
  for (const [id, p] of combat.players) {
    if (id !== player.id) {
      sendToPlayer(p, { type: 'COMBAT_UPDATE', state: combat.state });
    }
  }

  return true;
}

export function submitAction(playerId: string, combatId: string, action: CombatAction): boolean {
  const combat = combats.get(combatId);
  if (!combat) return false;
  if (combat.state.phase !== 'awaiting_action') return false;
  if (!combat.state.awaitingActionFrom.includes(playerId)) return false;

  combat.playerActions.set(playerId, action);
  combat.state.awaitingActionFrom = combat.state.awaitingActionFrom.filter(id => id !== playerId);
  combat.state.readyPlayerIds.push(playerId);

  // If all actions in, resolve round
  if (combat.state.awaitingActionFrom.length === 0) {
    resolveRound(combat);
  } else {
    // Broadcast updated ready status to all players
    for (const player of combat.players.values()) {
      sendToPlayer(player, { type: 'COMBAT_UPDATE', state: combat.state });
    }
  }

  return true;
}

export function handleDisconnect(playerId: string): void {
  for (const combat of combats.values()) {
    if (!combat.players.has(playerId)) continue;

    // Remove from combat
    combat.players.delete(playerId);
    combat.state.allies = combat.state.allies.filter(a => a.id !== playerId);
    combat.state.awaitingActionFrom = combat.state.awaitingActionFrom.filter(id => id !== playerId);
    combat.state.readyPlayerIds = combat.state.readyPlayerIds.filter(id => id !== playerId);
    combat.playerActions.delete(playerId);

    // If no allies left or no players connected, end combat
    if (combat.players.size === 0 || combat.state.allies.length === 0) {
      combat.state.phase = 'defeat';
      endCombat(combat, 'defeat');
    } else if (combat.state.awaitingActionFrom.length === 0 && combat.state.phase === 'awaiting_action') {
      resolveRound(combat);
    } else {
      // Notify remaining players that an ally disconnected
      for (const player of combat.players.values()) {
        sendToPlayer(player, { type: 'COMBAT_UPDATE', state: combat.state });
      }
    }
  }
}

export function getCombatForEnemy(enemySpawnId: string): string | null {
  for (const combat of combats.values()) {
    if (combat.enemySpawn.id === enemySpawnId && combat.state.phase === 'awaiting_action') {
      return combat.id;
    }
  }
  return null;
}

export function getEnemySpawnForCombat(combatId: string): ServerEnemySpawn | null {
  const combat = combats.get(combatId);
  return combat?.enemySpawn ?? null;
}
