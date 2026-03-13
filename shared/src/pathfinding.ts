import type { Position } from './types';
import type { TileType } from './types';
import { isWalkable } from './map';

interface AStarNode {
  x: number;
  y: number;
  g: number; // cost from start
  h: number; // heuristic to end
  f: number; // g + h
  parent: AStarNode | null;
}

/** Manhattan distance heuristic (no diagonals) */
function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 4-directional neighbors */
const DIRECTIONS: Position[] = [
  { x: 0, y: -1 }, // up
  { x: 1, y: 0 },  // right
  { x: 0, y: 1 },  // down
  { x: -1, y: 0 }, // left
];

/**
 * A* pathfinding on a 2D tile grid.
 * Returns an array of positions from start to end (inclusive), or null if no path exists.
 * Movement is 4-directional (no diagonals) to match the RuneScape grid feel.
 */
export function findPath(
  map: TileType[][],
  start: Position,
  end: Position,
  maxIterations = 10000
): Position[] | null {
  // If the destination is blocked, no path
  if (!isWalkable(map, end)) {
    return null;
  }

  // Already there
  if (start.x === end.x && start.y === end.y) {
    return [{ x: start.x, y: start.y }];
  }

  const openSet: AStarNode[] = [];
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };

  openSet.push(startNode);

  let iterations = 0;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest f score
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const current = openSet[lowestIdx];

    // Reached the goal
    if (current.x === end.x && current.y === end.y) {
      const path: Position[] = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    // Move current from open to closed
    openSet.splice(lowestIdx, 1);
    const key = `${current.x},${current.y}`;
    closedSet.add(key);

    // Check neighbors
    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const neighborKey = `${nx},${ny}`;

      if (closedSet.has(neighborKey)) continue;
      if (!isWalkable(map, { x: nx, y: ny })) continue;

      const g = current.g + 1;
      const h = heuristic({ x: nx, y: ny }, end);
      const f = g + h;

      // Check if already in open set with a better score
      const existing = openSet.find((n) => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = f;
          existing.parent = current;
        }
        continue;
      }

      openSet.push({ x: nx, y: ny, g, h, f, parent: current });
    }
  }

  // No path found
  return null;
}
