import {
  TileType,
  findPath,
  isWalkable,
  MOVEMENT_SPEED,
  type ServerPlayerState,
  type Position,
  type GroundItem,
  type MapEnemy,
} from 'shared';
import type { CharacterSheet, CombatStats } from 'shared';
import { Network } from './network';
import { Renderer } from './renderer';
import { Chat } from './chat';
import { DebugOverlay } from './debug';
import { ContextMenu } from './context-menu';
import { Inventory } from './inventory';
import { Combat } from './combat';
import { CharacterCreate } from './character-create';
import { CharacterPanel } from './character-panel';

// ---- State ----
let myPlayerId: string | null = null;
let map: TileType[][] = [];
const playerStates: Map<string, ServerPlayerState> = new Map();

// ---- Local player prediction ----
// The client walks the local player along the path independently at the same
// speed the server uses. Server updates are used only for reconciliation.
let localPos: Position = { x: 0, y: 0 };
let localPath: Position[] = [];
let localPathIndex = 0;
let localInitialized = false;
const RECONCILE_THRESHOLD = 0.5; // tiles — snap-correct above this
const RECONCILE_LERP = 0.15;     // smooth correction speed per frame

// ---- Remote player interpolation (buffered) ----
// We store timestamped snapshots and render remote players at a fixed delay
// so we always have two snapshots to interpolate between.
const INTERP_DELAY_MS = 100; // render 100ms in the past
interface Snapshot {
  time: number;
  x: number;
  y: number;
}
const snapshotBuffers: Map<string, Snapshot[]> = new Map();
const MAX_SNAPSHOTS = 30;

// Ground items
const groundItems: Map<string, GroundItem> = new Map();

// Enemies
const enemies: Map<string, MapEnemy> = new Map();

// Pending pickup — walk to item, then pick up when we arrive
let pendingPickup: { itemId: string; x: number; y: number } | null = null;

// Pending attack — walk to enemy, then attack when we arrive
let pendingAttack: { enemyId: string; x: number; y: number } | null = null;

// Pending join combat — walk to enemy in combat, then join when we arrive
let pendingJoinCombat: { combatId: string; x: number; y: number } | null = null;

// Camera lerp
const CAMERA_LERP_SPEED = 0.1;
const cameraPos: Position = { x: 0, y: 0 };

// Timing
let lastFrameTime = performance.now();

// ---- Init ----
const network = new Network();
const renderer = new Renderer();
const chat = new Chat(network);
const debug = new DebugOverlay(network);
const contextMenu = new ContextMenu();
const inventory = new Inventory();
const combatManager = new Combat(network);
const characterPanel = new CharacterPanel(network);
let characterState: CharacterSheet | null = null;

async function start(createResult: { displayName: string; race: string; class: string; initialAttributes: Record<string, number> }) {
  await renderer.init();

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsHost = window.location.hostname || 'localhost';
  await network.connect(`${wsProtocol}://${wsHost}:3001`);

  network.send({
    type: 'CHARACTER_CREATE',
    displayName: createResult.displayName,
    race: createResult.race,
    class: createResult.class,
    initialAttributes: createResult.initialAttributes,
  } as any);

  network.onMessage((msg) => {
    // Handle character messages
    if (msg.type === 'CHARACTER_STATE') {
      characterState = msg.sheet;
      characterPanel.update(msg.sheet, msg.combatStats);
      return;
    }
    if (msg.type === 'LEVEL_UP') {
      chat.addSystemMessage(`Level up! You are now level ${msg.newLevel}!`);
      return;
    }

    // Let combat manager handle combat messages first
    if (msg.type === 'COMBAT_START' || msg.type === 'COMBAT_UPDATE' || msg.type === 'COMBAT_END') {
      combatManager.handleMessage(msg);
      if (msg.type === 'COMBAT_START') {
        // Clear movement when entering combat
        localPath = [];
        localPathIndex = 0;
        renderer.setPathPreview([]);
        pendingPickup = null;
        pendingAttack = null;
        pendingJoinCombat = null;
      }
      return;
    }

    switch (msg.type) {
      case 'JOINED':
        myPlayerId = msg.playerId;
        combatManager.setPlayerId(msg.playerId);
        break;

      case 'MAP':
        map = msg.tiles as TileType[][];
        renderer.setMap(map);
        debug.setMapTiles(msg.width * msg.height);
        break;

      case 'WORLD_STATE': {
        const now = performance.now();
        for (const p of msg.players) {
          playerStates.set(p.id, p);


          if (p.id === myPlayerId) {
            // ---- Local player reconciliation ----
            if (!localInitialized) {
              localPos.x = p.x;
              localPos.y = p.y;
              cameraPos.x = p.x;
              cameraPos.y = p.y;
              localInitialized = true;
            }
            // Server correction is applied in the game loop via reconciliation
          } else {
            // ---- Remote player: push snapshot into buffer ----
            let buf = snapshotBuffers.get(p.id);
            if (!buf) {
              buf = [];
              snapshotBuffers.set(p.id, buf);
            }
            buf.push({ time: now, x: p.x, y: p.y });
            if (buf.length > MAX_SNAPSHOTS) buf.shift();
          }
        }

        // Remove players that are no longer in the state
        const activeIds = new Set(msg.players.map((p) => p.id));
        for (const id of playerStates.keys()) {
          if (!activeIds.has(id)) {
            playerStates.delete(id);
            snapshotBuffers.delete(id);
            renderer.removePlayer(id);
          }
        }
        break;
      }

      case 'PLAYER_JOIN':
        playerStates.set(msg.player.id, msg.player);
        snapshotBuffers.set(msg.player.id, [{
          time: performance.now(),
          x: msg.player.x,
          y: msg.player.y,
        }]);
        chat.addSystemMessage(`${msg.player.displayName} joined the game`);
        break;

      case 'PLAYER_LEAVE': {
        const leaving = playerStates.get(msg.playerId);
        playerStates.delete(msg.playerId);
        snapshotBuffers.delete(msg.playerId);
        renderer.removePlayer(msg.playerId);
        if (leaving) {
          chat.addSystemMessage(`${leaving.displayName} left the game`);
        }
        break;
      }

      case 'CHAT':
        chat.addMessage(msg.displayName, msg.message);
        renderer.showChatBubble(msg.playerId, msg.message);
        break;

      case 'GROUND_ITEMS':
        groundItems.clear();
        for (const item of msg.items) {
          groundItems.set(item.id, item);
        }
        renderer.setGroundItems(Array.from(groundItems.values()));
        break;

      case 'ITEM_SPAWN':
        groundItems.set(msg.item.id, msg.item);
        renderer.setGroundItems(Array.from(groundItems.values()));
        break;

      case 'ITEM_PICKED_UP':
        groundItems.delete(msg.itemId);
        renderer.setGroundItems(Array.from(groundItems.values()));
        if (pendingPickup && pendingPickup.itemId === msg.itemId) {
          pendingPickup = null;
        }
        break;

      case 'INVENTORY':
        inventory.update(msg.items);
        break;

      // Enemy spawn messages
      case 'ENEMY_SPAWNS':
        enemies.clear();
        for (const enemy of msg.enemies) {
          enemies.set(enemy.id, enemy);
        }
        renderer.setEnemies(Array.from(enemies.values()));
        break;

      case 'ENEMY_SPAWN':
        enemies.set(msg.enemy.id, msg.enemy);
        renderer.setEnemies(Array.from(enemies.values()));
        break;

      case 'ENEMY_DESPAWN':
        enemies.delete(msg.enemyId);
        renderer.setEnemies(Array.from(enemies.values()));
        if (pendingAttack && pendingAttack.enemyId === msg.enemyId) {
          pendingAttack = null;
        }
        break;
    }
  });

  // ---- Movement helper ----
  function moveToTile(target: Position) {
    if (!myPlayerId) return;
    if (!isWalkable(map, target)) return;

    const from = {
      x: Math.round(localPos.x),
      y: Math.round(localPos.y),
    };

    const path = findPath(map, from, target);
    if (path && path.length > 0) {
      localPath = path.length > 1 ? path.slice(1) : path;
      localPathIndex = 0;
      renderer.setPathPreview(localPath);
      network.send({ type: 'MOVE_TO', x: target.x, y: target.y });
    }
  }

  // ---- Item interaction helper ----
  function interactWithItem(item: GroundItem) {
    if (!myPlayerId) return;
    const tile = { x: item.x, y: item.y };

    // If already on the tile, pick up immediately
    const px = Math.round(localPos.x);
    const py = Math.round(localPos.y);
    if (px === item.x && py === item.y) {
      network.send({ type: 'PICKUP', itemId: item.id });
      return;
    }

    // Otherwise walk there, then pick up on arrival
    pendingPickup = { itemId: item.id, x: item.x, y: item.y };
    pendingAttack = null;
    moveToTile(tile);
  }

  // ---- Find adjacent tile to a target ----
  function findAdjacentTile(targetX: number, targetY: number): Position | null {
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
    ];
    const from = { x: Math.round(localPos.x), y: Math.round(localPos.y) };

    // If already adjacent, return current tile
    const dx = Math.abs(from.x - targetX);
    const dy = Math.abs(from.y - targetY);
    if (dx + dy === 1) return from;

    // Find the walkable adjacent tile with the shortest path
    let best: Position | null = null;
    let bestLen = Infinity;
    for (const dir of dirs) {
      const adj = { x: targetX + dir.x, y: targetY + dir.y };
      if (!isWalkable(map, adj)) continue;
      const path = findPath(map, from, adj);
      if (path && path.length < bestLen) {
        bestLen = path.length;
        best = adj;
      }
    }
    return best;
  }

  // ---- Enemy interaction helper ----
  function attackEnemy(enemy: MapEnemy) {
    if (!myPlayerId) return;

    // If already adjacent, send attack immediately
    const px = Math.round(localPos.x);
    const py = Math.round(localPos.y);
    const dx = Math.abs(px - enemy.x);
    const dy = Math.abs(py - enemy.y);
    if (dx + dy <= 1 && !(dx === 0 && dy === 0)) {
      network.send({ type: 'ATTACK_ENEMY', enemySpawnId: enemy.id });
      return;
    }

    // Find an adjacent tile and walk there
    const adj = findAdjacentTile(enemy.x, enemy.y);
    if (!adj) return;

    pendingAttack = { enemyId: enemy.id, x: adj.x, y: adj.y };
    pendingPickup = null;
    moveToTile(adj);
  }

  // ---- Join combat helper ----
  function joinCombat(combatId: string, targetX: number, targetY: number) {
    if (!myPlayerId) return;

    // If already adjacent, join immediately
    const px = Math.round(localPos.x);
    const py = Math.round(localPos.y);
    const dx = Math.abs(px - targetX);
    const dy = Math.abs(py - targetY);
    if (dx + dy <= 1 && !(dx === 0 && dy === 0)) {
      network.send({ type: 'JOIN_COMBAT', combatId });
      return;
    }

    // Walk to adjacent tile, then join
    const adj = findAdjacentTile(targetX, targetY);
    if (!adj) return;

    pendingJoinCombat = { combatId, x: adj.x, y: adj.y };
    pendingPickup = null;
    pendingAttack = null;
    moveToTile(adj);
  }

  // ---- Click to move (left click) ----
  renderer.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return; // left click only
    if (!myPlayerId || chat.isFocused) return;
    if (contextMenu.isVisible) return;
    if (combatManager.inCombat) return;

    // Check if clicking on a ground item
    const clickedItem = renderer.getItemAtScreen(e.clientX, e.clientY);
    if (clickedItem) {
      interactWithItem(clickedItem);
      return;
    }

    // Check if clicking on an enemy
    const clickedEnemy = renderer.getEnemyAtScreen(e.clientX, e.clientY);
    if (clickedEnemy) {
      attackEnemy(clickedEnemy);
      return;
    }

    pendingPickup = null;
    pendingAttack = null;
    pendingJoinCombat = null;
    const target = renderer.screenToWorld(e.clientX, e.clientY);
    moveToTile(target);
  });

  function clearPending() {
    pendingPickup = null;
    pendingAttack = null;
    pendingJoinCombat = null;
  }

  // ---- Right-click context menu ----
  renderer.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    if (!myPlayerId || chat.isFocused) return;
    if (combatManager.inCombat) return;

    const clickedEnemy = renderer.getEnemyAtScreen(e.clientX, e.clientY);
    const clickedItem = renderer.getItemAtScreen(e.clientX, e.clientY);
    const clickedPlayer = renderer.getPlayerAtScreen(e.clientX, e.clientY);
    const tile = renderer.screenToWorld(e.clientX, e.clientY);

    if (clickedEnemy) {
      if (clickedEnemy.combatId) {
        // Enemy is already in combat — offer to join
        const cid = clickedEnemy.combatId;
        contextMenu.show(e.clientX, e.clientY, [
          { label: `— ${clickedEnemy.name} (In Combat) —`, disabled: true, onSelect() {} },
          { label: 'Join Combat', onSelect() { joinCombat(cid, clickedEnemy.x, clickedEnemy.y); } },
          { label: 'Move Here', onSelect() { clearPending(); moveToTile(tile); } },
        ]);
      } else {
        // Enemy is idle
        contextMenu.show(e.clientX, e.clientY, [
          { label: `— ${clickedEnemy.name} —`, disabled: true, onSelect() {} },
          { label: `Attack ${clickedEnemy.name}`, onSelect() { attackEnemy(clickedEnemy); } },
          { label: 'Move Here', onSelect() { clearPending(); moveToTile(tile); } },
        ]);
      }
    } else if (clickedItem) {
      contextMenu.show(e.clientX, e.clientY, [
        { label: `— ${clickedItem.itemType} —`, disabled: true, onSelect() {} },
        { label: `Take ${clickedItem.itemType}`, onSelect() { interactWithItem(clickedItem); } },
        { label: 'Move Here', onSelect() { clearPending(); moveToTile(tile); } },
      ]);
    } else if (clickedPlayer && !clickedPlayer.isLocal) {
      const name = playerStates.get(clickedPlayer.id)?.displayName ?? clickedPlayer.id;
      const state = playerStates.get(clickedPlayer.id);
      const actions: Array<{ label: string; disabled?: boolean; onSelect: () => void }> = [
        { label: `— ${name} —`, disabled: true, onSelect() {} },
      ];
      // If this player is in combat, offer to join
      if (state?.combatId) {
        const cid = state.combatId;
        // Find the enemy they're fighting to get its position for adjacency walk
        const enemyInCombat = Array.from(enemies.values()).find(e => e.combatId === cid);
        if (enemyInCombat) {
          actions.push({ label: 'Join Combat', onSelect() { joinCombat(cid, enemyInCombat.x, enemyInCombat.y); } });
        }
      }
      actions.push(
        { label: 'Move Here', onSelect() { clearPending(); moveToTile(tile); } },
        { label: 'Follow', disabled: true, onSelect() {} },
        { label: 'Trade', disabled: true, onSelect() {} },
        { label: 'Inspect', disabled: true, onSelect() {} },
      );
      contextMenu.show(e.clientX, e.clientY, actions);
    } else {
      contextMenu.show(e.clientX, e.clientY, [
        { label: 'Move Here', onSelect() { clearPending(); moveToTile(tile); } },
      ]);
    }
  });

  // ---- Game loop ----
  const gameLoop = () => {
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000; // delta in seconds
    lastFrameTime = now;

    const renderPlayers: Array<{ id: string; x: number; y: number; isLocal: boolean; inCombat?: boolean }> = [];

    // ---- Local player: client-side prediction ----
    if (myPlayerId && localInitialized) {
      // Don't move while in combat
      if (!combatManager.inCombat) {
        // Walk along the path at MOVEMENT_SPEED tiles/sec
        let remaining = MOVEMENT_SPEED * dt;
        while (remaining > 0 && localPathIndex < localPath.length) {
          const target = localPath[localPathIndex];
          const dx = target.x - localPos.x;
          const dy = target.y - localPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= remaining) {
            localPos.x = target.x;
            localPos.y = target.y;
            remaining -= dist;
            localPathIndex++;
          } else {
            localPos.x += (dx / dist) * remaining;
            localPos.y += (dy / dist) * remaining;
            remaining = 0;
          }
        }
      }

      // Reconcile with server position
      const serverState = playerStates.get(myPlayerId);
      if (serverState) {
        const errX = serverState.x - localPos.x;
        const errY = serverState.y - localPos.y;
        const errDist = Math.sqrt(errX * errX + errY * errY);

        if (errDist > RECONCILE_THRESHOLD) {
          // Large desync — snap to server
          localPos.x = serverState.x;
          localPos.y = serverState.y;
          localPath = [];
          localPathIndex = 0;
        } else if (errDist > 0.01) {
          // Small drift — gently nudge toward server
          localPos.x += errX * RECONCILE_LERP;
          localPos.y += errY * RECONCILE_LERP;
        }
      }

      // Clear path preview when we arrive
      if (localPathIndex >= localPath.length && localPath.length > 0) {
        localPath = [];
        localPathIndex = 0;
        renderer.setPathPreview([]);
      }

      // Check pending pickup — send PICKUP when we arrive on the item's tile
      if (pendingPickup) {
        const px = Math.round(localPos.x);
        const py = Math.round(localPos.y);
        if (px === pendingPickup.x && py === pendingPickup.y) {
          network.send({ type: 'PICKUP', itemId: pendingPickup.itemId });
          pendingPickup = null;
        }
      }

      // Check pending attack — send ATTACK_ENEMY only after path is fully walked
      if (pendingAttack && localPath.length === 0) {
        const px = Math.round(localPos.x);
        const py = Math.round(localPos.y);
        if (px === pendingAttack.x && py === pendingAttack.y) {
          network.send({ type: 'ATTACK_ENEMY', enemySpawnId: pendingAttack.enemyId });
          pendingAttack = null;
        }
      }

      // Check pending join combat — send JOIN_COMBAT only after path is fully walked
      if (pendingJoinCombat && localPath.length === 0) {
        const px = Math.round(localPos.x);
        const py = Math.round(localPos.y);
        if (px === pendingJoinCombat.x && py === pendingJoinCombat.y) {
          network.send({ type: 'JOIN_COMBAT', combatId: pendingJoinCombat.combatId });
          pendingJoinCombat = null;
        }
      }

      renderPlayers.push({
        id: myPlayerId,
        x: localPos.x,
        y: localPos.y,
        isLocal: true,
        inCombat: combatManager.inCombat,
      });
    }

    // ---- Remote players: buffered interpolation ----
    const renderTime = now - INTERP_DELAY_MS;

    for (const [id, state] of playerStates) {
      if (id === myPlayerId) continue;

      const buf = snapshotBuffers.get(id);
      if (!buf || buf.length === 0) {
        renderPlayers.push({ id, x: state.x, y: state.y, isLocal: false, inCombat: !!state.combatId });
        continue;
      }

      // Find the two snapshots that straddle renderTime
      let x: number;
      let y: number;

      if (buf.length === 1 || renderTime <= buf[0].time) {
        // Only one snapshot or render time is before all snapshots
        x = buf[0].x;
        y = buf[0].y;
      } else if (renderTime >= buf[buf.length - 1].time) {
        // Past the latest snapshot — use latest position
        x = buf[buf.length - 1].x;
        y = buf[buf.length - 1].y;
      } else {
        // Interpolate between two surrounding snapshots
        let i = 0;
        while (i < buf.length - 1 && buf[i + 1].time < renderTime) i++;
        const a = buf[i];
        const b = buf[i + 1];
        const t = (renderTime - a.time) / (b.time - a.time);
        x = a.x + (b.x - a.x) * t;
        y = a.y + (b.y - a.y) * t;
      }

      renderPlayers.push({ id, x, y, isLocal: false, inCombat: !!playerStates.get(id)?.combatId });
    }

    // Camera lerps toward local player
    const localPlayer = renderPlayers.find((p) => p.isLocal);
    if (localPlayer) {
      cameraPos.x += (localPlayer.x - cameraPos.x) * CAMERA_LERP_SPEED;
      cameraPos.y += (localPlayer.y - cameraPos.y) * CAMERA_LERP_SPEED;
      renderer.setCamera(cameraPos);
    }

    renderer.setPlayers(renderPlayers);
    renderer.render();

    debug.setPlayerCount(renderPlayers.length);
    debug.update();

    requestAnimationFrame(gameLoop);
  };

  requestAnimationFrame(gameLoop);
}

// ---- Join screen with character creation ----
const joinScreen = document.getElementById('join-screen')!;
const charCreate = new CharacterCreate(joinScreen);
charCreate.setOnComplete((result) => {
  joinScreen.style.display = 'none';
  start(result);
});
