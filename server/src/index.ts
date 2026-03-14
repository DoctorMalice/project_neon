import { WebSocketServer, WebSocket } from 'ws';
import {
  generateMap,
  findPath,
  isWalkable,
  TICK_RATE,
  TICK_INTERVAL_MS,
  MOVEMENT_SPEED,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  CHAT_HISTORY_SIZE,
  ITEM_RESPAWN_MS,
  COMBAT_ENGAGE_RANGE,
  type TileType,
  type Position,
  type ClientMessage,
  type ServerMessage,
  type ServerPlayerState,
  type GroundItem,
  type InventoryItem,
} from 'shared';
import { initEnemySpawns, getActiveMapEnemies, enemySpawns, ENEMY_DEFS } from './enemies';
import * as combat from './combat';

// ---- State ----

interface ServerPlayer {
  id: string;
  displayName: string;
  position: Position;
  path: Position[];
  pathIndex: number;
  ws: WebSocket;
}

const PORT = Number(process.env.PORT) || 3001;
const map: TileType[][] = generateMap();
const players = new Map<string, ServerPlayer>();
const chatHistory: ServerMessage[] = [];
let nextPlayerId = 1;
let nextItemId = 1;

// ---- Ground items ----

interface ItemSpawnDef {
  itemType: string;
  x: number;
  y: number;
}

interface ServerGroundItem {
  id: string;
  itemType: string;
  x: number;
  y: number;
  active: boolean;
}

// Define where items spawn on the map
const ITEM_SPAWN_DEFS: ItemSpawnDef[] = [
  { itemType: 'Gold Pieces', x: 24, y: 24 },
  { itemType: 'Gold Pieces', x: 30, y: 15 },
  { itemType: 'Gold Pieces', x: 15, y: 35 },
];

const groundItems = new Map<string, ServerGroundItem>();
const inventories = new Map<string, InventoryItem[]>();

// Initialize ground items
for (const def of ITEM_SPAWN_DEFS) {
  const id = String(nextItemId++);
  groundItems.set(id, { id, ...def, active: true });
}

// ---- Enemies ----

initEnemySpawns();

// ---- Combat ----

const playerCombats = new Map<string, string>(); // playerId → combatId

function addToInventory(playerId: string, itemType: string, quantity: number): void {
  const inv = inventories.get(playerId) ?? [];
  const existing = inv.find((i) => i.itemType === itemType);
  if (existing) {
    existing.quantity += quantity;
  } else {
    inv.push({ itemType, quantity });
  }
  inventories.set(playerId, inv);
  const player = players.get(playerId);
  if (player) {
    send(player.ws, { type: 'INVENTORY', items: inv });
  }
}

function onCombatEnd(combatId: string, winners: Map<string, { xp: number; loot: InventoryItem[] }>): void {
  // Remove all players from combat tracking
  for (const [playerId, cid] of playerCombats) {
    if (cid === combatId) {
      playerCombats.delete(playerId);
    }
  }
  // Award loot to winners
  for (const [playerId, reward] of winners) {
    for (const item of reward.loot) {
      addToInventory(playerId, item.itemType, item.quantity);
    }
  }
}

function onEnemyDied(spawn: { id: string; defId: string; active: boolean; x: number; y: number }): void {
  broadcast({ type: 'ENEMY_DESPAWN', enemyId: spawn.id });

  const def = ENEMY_DEFS[spawn.defId];
  if (!def) return;

  setTimeout(() => {
    spawn.active = true;
    broadcast({
      type: 'ENEMY_SPAWN',
      enemy: { id: spawn.id, defId: spawn.defId, name: def.name, x: spawn.x, y: spawn.y },
    });
  }, def.respawnMs);
}

// ---- WebSocket server ----

const wss = new WebSocketServer({ port: PORT });
console.log(`Game server listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let player: ServerPlayer | null = null;

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'JOIN') {
      if (player) return; // already joined

      const displayName = msg.displayName
        .trim()
        .slice(0, MAX_DISPLAY_NAME_LENGTH) || 'Anon';

      const id = String(nextPlayerId++);
      player = {
        id,
        displayName,
        position: findSpawnPoint(),
        path: [],
        pathIndex: 0,
        ws,
      };
      players.set(id, player);

      // Tell this player their ID
      send(ws, { type: 'JOINED', playerId: id });

      // Send the map
      send(ws, {
        type: 'MAP',
        width: map[0].length,
        height: map.length,
        tiles: map.map((row) => row.map((t) => t as number)),
      });

      // Send current world state
      send(ws, {
        type: 'WORLD_STATE',
        players: getPlayerStates(),
      });

      // Send ground items
      send(ws, {
        type: 'GROUND_ITEMS',
        items: getActiveGroundItems(),
      });

      // Send enemy spawns
      send(ws, {
        type: 'ENEMY_SPAWNS',
        enemies: getActiveMapEnemies(),
      });

      // Send initial empty inventory
      inventories.set(id, []);
      send(ws, { type: 'INVENTORY', items: [] });

      // Send chat history
      for (const chatMsg of chatHistory) {
        send(ws, chatMsg);
      }

      // Announce to others
      broadcast({
        type: 'PLAYER_JOIN',
        player: playerToState(player),
      }, id);

      console.log(`${displayName} (${id}) joined`);
      return;
    }

    if (!player) return; // not joined yet

    if (msg.type === 'MOVE_TO') {
      // Block movement while in combat
      if (playerCombats.has(player.id)) return;

      const targetX = Math.round(msg.x);
      const targetY = Math.round(msg.y);
      const target = { x: targetX, y: targetY };

      if (!isWalkable(map, target)) return;

      // Compute path from player's current tile position
      const from = {
        x: Math.round(player.position.x),
        y: Math.round(player.position.y),
      };

      const path = findPath(map, from, target);
      if (!path || path.length === 0) return;

      // Skip the start tile — the player is already on/near it.
      // Without this, rapid clicks cause backtracking to the rounded tile.
      player.path = path.length > 1 ? path.slice(1) : path;
      player.pathIndex = 0;
      return;
    }

    if (msg.type === 'CHAT') {
      const message = msg.message.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      if (!message) return;

      const chatMsg: ServerMessage = {
        type: 'CHAT',
        playerId: player.id,
        displayName: player.displayName,
        message,
        timestamp: Date.now(),
      };

      chatHistory.push(chatMsg);
      if (chatHistory.length > CHAT_HISTORY_SIZE) {
        chatHistory.shift();
      }

      broadcast(chatMsg);
      return;
    }

    if (msg.type === 'PING') {
      send(ws, { type: 'PONG', timestamp: msg.timestamp });
      return;
    }

    if (msg.type === 'PICKUP') {
      const item = groundItems.get(msg.itemId);
      if (!item || !item.active) return;

      // Must be within ~1 tile (accounts for client prediction being ahead of server)
      const dx = player.position.x - item.x;
      const dy = player.position.y - item.y;
      if (dx * dx + dy * dy > 1.5 * 1.5) return;

      item.active = false;
      broadcast({ type: 'ITEM_PICKED_UP', itemId: item.id, playerId: player.id });

      // Update inventory
      const inv = inventories.get(player.id) ?? [];
      const existing = inv.find((i) => i.itemType === item.itemType);
      if (existing) {
        existing.quantity++;
      } else {
        inv.push({ itemType: item.itemType, quantity: 1 });
      }
      inventories.set(player.id, inv);
      send(ws, { type: 'INVENTORY', items: inv });

      // Schedule respawn
      setTimeout(() => {
        item.active = true;
        broadcast({ type: 'ITEM_SPAWN', item: { id: item.id, itemType: item.itemType, x: item.x, y: item.y } });
      }, ITEM_RESPAWN_MS);
      return;
    }

    if (msg.type === 'ATTACK_ENEMY') {
      if (playerCombats.has(player.id)) return;

      const spawn = enemySpawns.get(msg.enemySpawnId);
      if (!spawn || !spawn.active) return;

      // Check range — generous to account for client prediction running ahead of server
      const dx = player.position.x - spawn.x;
      const dy = player.position.y - spawn.y;
      if (dx * dx + dy * dy > COMBAT_ENGAGE_RANGE * COMBAT_ENGAGE_RANGE + 1) return;

      // Check if enemy is already in combat (co-op join)
      const existingCombatId = combat.getCombatForEnemy(msg.enemySpawnId);
      if (existingCombatId) {
        const joined = combat.joinCombat(
          { id: player.id, displayName: player.displayName, ws: player.ws },
          existingCombatId,
        );
        if (joined) {
          playerCombats.set(player.id, existingCombatId);
          // Stop movement
          player.path = [];
          player.pathIndex = 0;
        }
        return;
      }

      // Create new combat
      const combatId = combat.createCombat(
        { id: player.id, displayName: player.displayName, ws: player.ws },
        msg.enemySpawnId,
        onCombatEnd,
        onEnemyDied,
      );
      if (combatId) {
        playerCombats.set(player.id, combatId);
        // Stop movement
        player.path = [];
        player.pathIndex = 0;
      }
      return;
    }

    if (msg.type === 'COMBAT_ACTION') {
      if (!playerCombats.has(player.id)) return;
      combat.submitAction(player.id, msg.combatId, msg.action);
      return;
    }

    if (msg.type === 'JOIN_COMBAT') {
      if (playerCombats.has(player.id)) return;
      const joined = combat.joinCombat(
        { id: player.id, displayName: player.displayName, ws: player.ws },
        msg.combatId,
      );
      if (joined) {
        playerCombats.set(player.id, msg.combatId);
        player.path = [];
        player.pathIndex = 0;
      }
      return;
    }
  });

  ws.on('close', () => {
    if (player) {
      // Handle combat disconnect
      if (playerCombats.has(player.id)) {
        combat.handleDisconnect(player.id);
        playerCombats.delete(player.id);
      }

      players.delete(player.id);
      inventories.delete(player.id);
      broadcast({ type: 'PLAYER_LEAVE', playerId: player.id });
      console.log(`${player.displayName} (${player.id}) left`);
    }
  });
});

// ---- Game loop ----

function tick() {
  const tilesPerTick = MOVEMENT_SPEED / TICK_RATE;

  for (const player of players.values()) {
    // Don't move players in combat
    if (playerCombats.has(player.id)) continue;

    let remaining = tilesPerTick;

    while (remaining > 0 && player.pathIndex < player.path.length) {
      const target = player.path[player.pathIndex];
      const dx = target.x - player.position.x;
      const dy = target.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= remaining) {
        // Reached this waypoint — snap and carry leftover into next waypoint
        player.position.x = target.x;
        player.position.y = target.y;
        remaining -= dist;
        player.pathIndex++;
      } else {
        // Move toward waypoint, consuming all remaining budget
        player.position.x += (dx / dist) * remaining;
        player.position.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
  }

  // Broadcast world state to all
  const stateMsg: ServerMessage = {
    type: 'WORLD_STATE',
    players: getPlayerStates(),
  };
  broadcast(stateMsg);
}

setInterval(tick, TICK_INTERVAL_MS);

// ---- Helpers ----

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage, excludeId?: string) {
  const data = JSON.stringify(msg);
  for (const player of players.values()) {
    if (player.id === excludeId) continue;
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function playerToState(p: ServerPlayer): ServerPlayerState {
  const target = p.pathIndex < p.path.length
    ? p.path[p.path.length - 1]
    : null;
  return {
    id: p.id,
    displayName: p.displayName,
    x: p.position.x,
    y: p.position.y,
    targetX: target?.x ?? null,
    targetY: target?.y ?? null,
  };
}

function getPlayerStates(): ServerPlayerState[] {
  return Array.from(players.values()).map(playerToState);
}

function getActiveGroundItems(): GroundItem[] {
  return Array.from(groundItems.values())
    .filter((i) => i.active)
    .map(({ id, itemType, x, y }) => ({ id, itemType, x, y }));
}

function findSpawnPoint(): Position {
  // Spawn near center, on a walkable tile
  const cx = Math.floor(map[0].length / 2);
  const cy = Math.floor(map.length / 2);

  for (let r = 0; r < 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const pos = { x: cx + dx, y: cy + dy };
        if (isWalkable(map, pos)) return pos;
      }
    }
  }

  return { x: cx, y: cy };
}
