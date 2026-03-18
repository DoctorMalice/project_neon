import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CharacterSheet, Position, Equipment, CombatStats } from 'shared';
import type { InventoryItem } from 'shared';

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

export interface SavedPlayer {
  token: string;
  displayName: string;
  sheet: CharacterSheet;
  combatStats?: CombatStats;
  inventory: InventoryItem[];
  equipment: Equipment;
  position: Position;
  savedAt: number;
}

let db: Record<string, SavedPlayer> = {};

export function loadAll(): void {
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const raw = fs.readFileSync(PLAYERS_FILE, 'utf-8');
      db = JSON.parse(raw);
      console.log(`Loaded ${Object.keys(db).length} saved player(s)`);
    }
  } catch (err) {
    console.error('Failed to load player data:', err);
    db = {};
  }
}

function writeToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to save player data:', err);
  }
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function savePlayer(token: string, displayName: string, sheet: CharacterSheet, combatStats: CombatStats, inventory: InventoryItem[], equipment: Equipment, position: Position): void {
  db[token] = {
    token,
    displayName,
    sheet,
    combatStats,
    inventory,
    equipment,
    position,
    savedAt: Date.now(),
  };
  writeToDisk();
}

export function getPlayer(token: string): SavedPlayer | null {
  return db[token] ?? null;
}

export function deletePlayer(token: string): void {
  delete db[token];
  writeToDisk();
}
