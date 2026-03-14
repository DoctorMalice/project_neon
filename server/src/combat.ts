import {
  COMBAT_RUN_CHANCE,
  COMBAT_CRIT_BASE,
  COMBAT_CRIT_MULTIPLIER,
  COMBAT_DODGE_BASE,
  COMBAT_DEFEND_REDUCTION,
  COMBAT_LEVEL_SCALE_PER_LEVEL,
  COMBAT_LEVEL_SCALE_MIN,
  COMBAT_LEVEL_SCALE_MAX,
  COMBAT_ACTION_TIMEOUT_MS,
  type CombatState,
  type CombatParticipant,
  type CombatAction,
  type CombatLogEntry,
  type CombatStats,
  type CombatStrategy,
  type PhysicalDamageType,
  type DamageType,
  type WeightedEntry,
  type InventoryItem,
  type ServerMessage,
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
  onEnd: (combatId: string, winners: Map<string, { xp: number; loot: InventoryItem[] }>) => void;
  onEnemyDied: (spawn: ServerEnemySpawn) => void;
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

function makeParticipant(id: string, name: string, isEnemy: boolean, stats: CombatStats): CombatParticipant {
  return {
    id,
    name,
    isEnemy,
    stats: { ...stats, damageTypeBonuses: { ...stats.damageTypeBonuses }, resistances: { ...stats.resistances }, immunities: [...stats.immunities] },
    alive: true,
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
  strategy: CombatStrategy,
  damageType: DamageType,
  isDefending: boolean,
): CombatLogEntry {
  const bonus = STRATEGY_BONUSES[strategy];
  const effectiveAccuracy = attacker.stats.accuracy + bonus.accuracy;
  const effectivePower = attacker.stats.power + bonus.power;
  const effectiveDodge = defender.stats.dodge + (isDefending ? 0 : 0); // defender's dodge
  const effectiveDefense = defender.stats.defense;
  const effectiveCrit = attacker.stats.critBonus;

  // Step 1: Immunity check
  if (defender.stats.immunities.includes(damageType)) {
    return {
      actor: attacker.name,
      target: defender.name,
      damage: 0,
      crit: false,
      dodged: false,
      defended: false,
      immune: true,
      message: `${defender.name} is immune to ${damageType}!`,
    };
  }

  // Step 2: Dodge check
  const dodgeChance = COMBAT_DODGE_BASE + (effectiveDodge / 50);
  if (Math.random() < dodgeChance) {
    return {
      actor: attacker.name,
      target: defender.name,
      damage: 0,
      crit: false,
      dodged: true,
      defended: false,
      immune: false,
      message: `${defender.name} dodges ${attacker.name}'s attack!`,
    };
  }

  // Step 3: Damage roll
  const minDmg = 1 + Math.floor(effectiveAccuracy / 10);
  const maxDmg = 1 + Math.floor(effectivePower / 10);
  let damage = minDmg + Math.floor(Math.random() * (Math.max(maxDmg - minDmg + 1, 1)));

  // Step 4: Crit check
  const critChance = COMBAT_CRIT_BASE + (effectiveCrit / 50);
  const crit = Math.random() < critChance;
  if (crit) {
    damage = Math.floor(damage * COMBAT_CRIT_MULTIPLIER);
  }

  // Step 5: Defense mitigation
  damage = Math.floor(damage * (1 - effectiveDefense / 1000));

  // Step 6: Level scaling
  const levelScale = clamp(
    COMBAT_LEVEL_SCALE_MIN,
    COMBAT_LEVEL_SCALE_MAX,
    1 + (attacker.stats.level - defender.stats.level) * COMBAT_LEVEL_SCALE_PER_LEVEL,
  );
  damage = Math.floor(damage * levelScale);

  // Step 7: Defend reduction
  if (isDefending) {
    damage = Math.floor(damage * COMBAT_DEFEND_REDUCTION);
  }

  // Step 8: Minimum 1 damage
  damage = Math.max(1, damage);

  // Apply damage
  defender.stats.hp -= damage;
  if (defender.stats.hp <= 0) {
    defender.stats.hp = 0;
    defender.alive = false;
  }

  let message = `${attacker.name} attacks ${defender.name} for ${damage} damage!`;
  if (crit) message = `Critical hit! ${message}`;
  if (isDefending) message += ` (${defender.name} is defending)`;

  return {
    actor: attacker.name,
    target: defender.name,
    damage,
    crit,
    dodged: false,
    defended: isDefending,
    immune: false,
    message,
  };
}

// ---- Round resolution ----

function resolveRound(combat: CombatInstance): void {
  combat.state.phase = 'resolving';
  combat.state.log = [];

  const enemyDef = ENEMY_DEFS[combat.enemySpawn.defId];

  // Resolve ally actions
  for (const ally of combat.state.allies) {
    if (!ally.alive) continue;
    const action = combat.playerActions.get(ally.id);
    if (!action) continue;

    if (action.type === 'run') {
      if (Math.random() < COMBAT_RUN_CHANCE) {
        combat.state.log.push({
          actor: ally.name, target: '', damage: 0,
          crit: false, dodged: false, defended: false, immune: false,
          message: `${ally.name} fled from combat!`,
        });
        combat.state.phase = 'fled';
        endCombat(combat, 'fled');
        return;
      } else {
        combat.state.log.push({
          actor: ally.name, target: '', damage: 0,
          crit: false, dodged: false, defended: false, immune: false,
          message: `${ally.name} failed to run away!`,
        });
      }
    } else if (action.type === 'attack') {
      // Attack first alive enemy
      const target = combat.state.enemies.find(e => e.alive);
      if (target) {
        const entry = resolveDamage(ally, target, action.strategy, action.damageType ?? 'bludgeoning', false);
        combat.state.log.push(entry);
      }
    }
    // defend: no action needed, handled in damage pipeline
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
      const strategy = rollWeighted(enemyDef.strategies);
      const dmgType = rollWeighted(enemyDef.damageTypes);
      const playerAction = combat.playerActions.get(target.id);
      const isDefending = playerAction?.type === 'defend';
      const entry = resolveDamage(enemy, target, strategy, dmgType, isDefending);
      combat.state.log.push(entry);
    } else {
      combat.state.log.push({
        actor: enemy.name, target: '', damage: 0,
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

  // Continue to next round
  combat.state.round++;
  combat.state.phase = 'awaiting_action';
  combat.state.awaitingActionFrom = combat.state.allies.filter(a => a.alive).map(a => a.id);
  combat.playerActions.clear();

  // Send update to all players
  for (const player of combat.players.values()) {
    sendToPlayer(player, { type: 'COMBAT_UPDATE', state: combat.state });
  }

  // Start action timeout
  startActionTimeout(combat);
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

  // Send end message to all players
  for (const [playerId, player] of combat.players) {
    const reward = winners.get(playerId);
    sendToPlayer(player, {
      type: 'COMBAT_END',
      state: combat.state,
      result,
      xpGained: reward?.xp ?? 0,
      loot: reward?.loot ?? [],
    });
  }

  combat.onEnd(combat.id, winners);
  combats.delete(combat.id);
}

function startActionTimeout(combat: CombatInstance): void {
  if (combat.actionTimeout) clearTimeout(combat.actionTimeout);
  combat.actionTimeout = setTimeout(() => {
    // Auto-defend for anyone who hasn't submitted
    for (const playerId of combat.state.awaitingActionFrom) {
      if (!combat.playerActions.has(playerId)) {
        combat.playerActions.set(playerId, { type: 'defend', strategy: 'technical' });
      }
    }
    combat.state.awaitingActionFrom = [];
    resolveRound(combat);
  }, COMBAT_ACTION_TIMEOUT_MS);
}

// ---- Public API ----

function getDefaultPlayerStats(): CombatStats {
  return {
    level: 1,
    hp: 50, maxHp: 50,
    mp: 20, maxMp: 20,
    ep: 20, maxEp: 20,
    kp: 0, maxKp: 0,
    accuracy: 10,
    power: 8,
    speed: 8,
    defense: 5,
    dodge: 5,
    critBonus: 3,
    damageTypeBonuses: {},
    resistances: {},
    immunities: [],
  };
}

export function createCombat(
  player: PlayerHandle,
  enemySpawnId: string,
  onEnd: CombatInstance['onEnd'],
  onEnemyDied: CombatInstance['onEnemyDied'],
): string | null {
  const spawn = enemySpawns.get(enemySpawnId);
  if (!spawn || !spawn.active) return null;

  const enemyDef = ENEMY_DEFS[spawn.defId];
  if (!enemyDef) return null;

  const combatId = `combat_${nextCombatId++}`;

  const allyParticipant = makeParticipant(player.id, player.displayName, false, getDefaultPlayerStats());
  const enemyParticipant = makeParticipant(
    `enemy_${combatId}`,
    enemyDef.name,
    true,
    { ...enemyDef.baseStats, hp: enemyDef.baseStats.maxHp },
  );

  const state: CombatState = {
    combatId,
    phase: 'awaiting_action',
    round: 1,
    allies: [allyParticipant],
    enemies: [enemyParticipant],
    log: [],
    awaitingActionFrom: [player.id],
  };

  const combat: CombatInstance = {
    id: combatId,
    state,
    enemySpawn: spawn,
    playerActions: new Map(),
    players: new Map([[player.id, player]]),
    actionTimeout: null,
    onEnd,
    onEnemyDied,
  };

  combats.set(combatId, combat);

  sendToPlayer(player, { type: 'COMBAT_START', state });
  startActionTimeout(combat);

  return combatId;
}

export function joinCombat(player: PlayerHandle, combatId: string): boolean {
  const combat = combats.get(combatId);
  if (!combat) return false;
  if (combat.state.phase !== 'awaiting_action') return false;
  if (combat.state.allies.length >= 3) return false;
  if (combat.players.has(player.id)) return false;

  const allyParticipant = makeParticipant(player.id, player.displayName, false, getDefaultPlayerStats());
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

  // If all actions in, resolve round
  if (combat.state.awaitingActionFrom.length === 0) {
    resolveRound(combat);
  }

  return true;
}

export function handleDisconnect(playerId: string): void {
  for (const combat of combats.values()) {
    if (!combat.players.has(playerId)) continue;

    // Remove from combat
    combat.players.delete(playerId);
    const ally = combat.state.allies.find(a => a.id === playerId);
    if (ally) {
      ally.alive = false;
      ally.stats.hp = 0;
    }
    combat.state.awaitingActionFrom = combat.state.awaitingActionFrom.filter(id => id !== playerId);
    combat.playerActions.delete(playerId);

    // If no allies alive or no players left, end combat
    if (combat.players.size === 0 || combat.state.allies.every(a => !a.alive)) {
      combat.state.phase = 'defeat';
      endCombat(combat, 'defeat');
    } else if (combat.state.awaitingActionFrom.length === 0 && combat.state.phase === 'awaiting_action') {
      resolveRound(combat);
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
