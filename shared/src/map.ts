import { TileType, BLOCKED_TILES, type Position } from './types';
import { MAP_WIDTH, MAP_HEIGHT } from './constants';

/**
 * Generate the PoC tile map.
 * Mostly grass with some dirt paths and a few water/wall obstacles.
 */
export function generateMap(): TileType[][] {
  const map: TileType[][] = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Border walls
      if (x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1) {
        row.push(TileType.Wall);
        continue;
      }

      // A small pond in the upper-right area
      if (x >= 35 && x <= 42 && y >= 5 && y <= 12) {
        row.push(TileType.Water);
        continue;
      }

      // Some wall structures — a small building with a door at (13, 26)
      if (x >= 10 && x <= 16 && y >= 20 && y <= 26) {
        const isEdge = x === 10 || x === 16 || y === 20 || y === 26;
        const isDoor = x === 13 && y === 26;
        if (isEdge && !isDoor) {
          row.push(TileType.Wall);
          continue;
        }
      }

      // Dirt paths — horizontal and vertical crossroads
      if (y === 25 || x === 25) {
        row.push(TileType.Dirt);
        continue;
      }

      // Another dirt path
      if (x === 40 && y >= 15 && y <= 45) {
        row.push(TileType.Dirt);
        continue;
      }

      row.push(TileType.Grass);
    }
    row.push();
    map.push(row);
  }

  return map;
}

/** Check if a tile position is walkable */
export function isWalkable(map: TileType[][], pos: Position): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= MAP_WIDTH || pos.y >= MAP_HEIGHT) {
    return false;
  }
  return !BLOCKED_TILES.has(map[pos.y][pos.x]);
}
