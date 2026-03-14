// ---- Core types ----

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  displayName: string;
  position: Position;
  /** The path the player is currently walking along (series of tile positions) */
  path: Position[];
  /** Index into path — which waypoint the player is currently moving toward */
  pathIndex: number;
}

// ---- Tile types ----

export enum TileType {
  Grass = 0,
  Dirt = 1,
  Water = 2, // blocked
  Wall = 3,  // blocked
}

/** Tiles that cannot be walked on */
export const BLOCKED_TILES = new Set<TileType>([TileType.Water, TileType.Wall]);

// ---- Inventory ----

export interface InventoryItem {
  itemType: string;
  quantity: number;
}

// ---- Ground items ----

export interface GroundItem {
  id: string;
  itemType: string;
  x: number;
  y: number;
}

// ---- Client → Server messages ----

export interface ClientMoveToMessage {
  type: 'MOVE_TO';
  x: number;
  y: number;
}

export interface ClientChatMessage {
  type: 'CHAT';
  message: string;
}

export interface ClientJoinMessage {
  type: 'JOIN';
  displayName: string;
}

export interface ClientPingMessage {
  type: 'PING';
  timestamp: number;
}

export interface ClientPickupMessage {
  type: 'PICKUP';
  itemId: string;
}

export type ClientMessage = ClientMoveToMessage | ClientChatMessage | ClientJoinMessage | ClientPingMessage | ClientPickupMessage;

// ---- Server → Client messages ----

export interface ServerPlayerState {
  id: string;
  displayName: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
}

export interface ServerWorldStateMessage {
  type: 'WORLD_STATE';
  players: ServerPlayerState[];
}

export interface ServerPlayerJoinMessage {
  type: 'PLAYER_JOIN';
  player: ServerPlayerState;
}

export interface ServerPlayerLeaveMessage {
  type: 'PLAYER_LEAVE';
  playerId: string;
}

export interface ServerChatMessage {
  type: 'CHAT';
  playerId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

export interface ServerMapMessage {
  type: 'MAP';
  width: number;
  height: number;
  tiles: number[][];
}

export interface ServerJoinedMessage {
  type: 'JOINED';
  playerId: string;
}

export interface ServerPongMessage {
  type: 'PONG';
  timestamp: number;
}

export interface ServerGroundItemsMessage {
  type: 'GROUND_ITEMS';
  items: GroundItem[];
}

export interface ServerItemPickedUpMessage {
  type: 'ITEM_PICKED_UP';
  itemId: string;
  playerId: string;
}

export interface ServerItemSpawnMessage {
  type: 'ITEM_SPAWN';
  item: GroundItem;
}

export interface ServerInventoryMessage {
  type: 'INVENTORY';
  items: InventoryItem[];
}

export type ServerMessage =
  | ServerWorldStateMessage
  | ServerPlayerJoinMessage
  | ServerPlayerLeaveMessage
  | ServerChatMessage
  | ServerMapMessage
  | ServerJoinedMessage
  | ServerPongMessage
  | ServerGroundItemsMessage
  | ServerItemPickedUpMessage
  | ServerItemSpawnMessage
  | ServerInventoryMessage;
