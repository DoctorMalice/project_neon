import { Application, Container, Graphics } from 'pixi.js';
import { TileType, TILE_SIZE, type Position } from 'shared';

// Tile colors
const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x4a8c3f,
  [TileType.Dirt]: 0x8b7355,
  [TileType.Water]: 0x3366aa,
  [TileType.Wall]: 0x555555,
};

const PLAYER_COLOR = 0x00ffcc;
const LOCAL_PLAYER_COLOR = 0x00ffff;
const PATH_PREVIEW_COLOR = 0xffffff;

// Zoom
const MIN_ZOOM = 1.0; // current default = max zoom out
const MAX_ZOOM = 3.0; // 3x zoom in
const ZOOM_STEP = 0.15;
const ZOOM_LERP_SPEED = 0.15; // smoothing factor per frame

interface RenderPlayer {
  id: string;
  x: number;
  y: number;
  isLocal: boolean;
}

export class Renderer {
  private app: Application;
  private worldContainer: Container;
  private tileGraphics: Graphics;
  private playerGraphics: Graphics;
  private pathGraphics: Graphics;

  private map: TileType[][] = [];
  private camera: Position = { x: 0, y: 0 };
  private players: RenderPlayer[] = [];
  private pathPreview: Position[] = [];
  private zoom = MIN_ZOOM;
  private targetZoom = MIN_ZOOM;

  // Label management
  private labelsContainer: HTMLElement;
  private labelElements: Map<string, HTMLDivElement> = new Map();
  private playerNames: Map<string, string> = new Map();

  // Chat bubbles
  private bubbleElements: Map<string, { el: HTMLDivElement; timeout: ReturnType<typeof setTimeout> }> = new Map();

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.tileGraphics = new Graphics();
    this.playerGraphics = new Graphics();
    this.pathGraphics = new Graphics();
    this.labelsContainer = document.getElementById('labels-container')!;
  }

  async init() {
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0x111111,
      antialias: false,
    });

    document.getElementById('game-container')!.prepend(this.app.canvas);

    this.worldContainer.addChild(this.tileGraphics);
    this.worldContainer.addChild(this.pathGraphics);
    this.worldContainer.addChild(this.playerGraphics);
    this.app.stage.addChild(this.worldContainer);

    // Zoom with scroll wheel
    this.app.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        this.targetZoom = Math.min(this.targetZoom + ZOOM_STEP, MAX_ZOOM);
      } else {
        this.targetZoom = Math.max(this.targetZoom - ZOOM_STEP, MIN_ZOOM);
      }
    }, { passive: false });
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  setMap(tiles: TileType[][]) {
    this.map = tiles;
  }

  setCamera(pos: Position) {
    this.camera = pos;
  }

  setPlayers(players: RenderPlayer[]) {
    this.players = players;
  }

  setPlayerName(id: string, name: string) {
    this.playerNames.set(id, name);
  }

  removePlayerName(id: string) {
    this.playerNames.delete(id);
    const label = this.labelElements.get(id);
    if (label) {
      label.remove();
      this.labelElements.delete(id);
    }
    const bubble = this.bubbleElements.get(id);
    if (bubble) {
      clearTimeout(bubble.timeout);
      bubble.el.remove();
      this.bubbleElements.delete(id);
    }
  }

  setPathPreview(path: Position[]) {
    this.pathPreview = path;
  }

  showChatBubble(playerId: string, message: string) {
    // Remove existing bubble
    const existing = this.bubbleElements.get(playerId);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.el.remove();
    }

    const el = document.createElement('div');
    el.className = 'chat-bubble';
    el.textContent = message;
    this.labelsContainer.appendChild(el);

    const timeout = setTimeout(() => {
      el.remove();
      this.bubbleElements.delete(playerId);
    }, 4000);

    this.bubbleElements.set(playerId, { el, timeout });
  }

  /** Effective tile size accounting for zoom */
  private get tileSize(): number {
    return TILE_SIZE * this.zoom;
  }

  /** Convert world tile position to screen coordinates */
  worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const ts = this.tileSize;
    const sx = (wx - this.camera.x) * ts + screenW / 2;
    const sy = (wy - this.camera.y) * ts + screenH / 2;
    return { sx, sy };
  }

  /** Convert screen coordinates to world tile position */
  screenToWorld(sx: number, sy: number): Position {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const ts = this.tileSize;
    const wx = (sx - screenW / 2) / ts + this.camera.x;
    const wy = (sy - screenH / 2) / ts + this.camera.y;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  render() {
    // Smooth zoom interpolation
    this.zoom += (this.targetZoom - this.zoom) * ZOOM_LERP_SPEED;
    if (Math.abs(this.targetZoom - this.zoom) < 0.001) this.zoom = this.targetZoom;

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const ts = this.tileSize;

    // Calculate visible tile range (viewport culling)
    const tilesX = Math.ceil(screenW / ts) + 2;
    const tilesY = Math.ceil(screenH / ts) + 2;
    const startX = Math.floor(this.camera.x - tilesX / 2);
    const startY = Math.floor(this.camera.y - tilesY / 2);
    const endX = startX + tilesX;
    const endY = startY + tilesY;

    // ---- Draw tiles ----
    this.tileGraphics.clear();
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        if (y < 0 || y >= this.map.length || x < 0 || x >= this.map[0].length) continue;
        const tile = this.map[y][x];
        const { sx, sy } = this.worldToScreen(x, y);
        this.tileGraphics.rect(sx, sy, ts, ts);
        this.tileGraphics.fill(TILE_COLORS[tile]);
        // Grid lines
        this.tileGraphics.rect(sx, sy, ts, ts);
        this.tileGraphics.stroke({ width: 1, color: 0x000000, alpha: 0.15 });
      }
    }

    // ---- Draw path preview ----
    this.pathGraphics.clear();
    for (const pos of this.pathPreview) {
      const { sx, sy } = this.worldToScreen(pos.x, pos.y);
      this.pathGraphics.rect(sx + ts * 0.3, sy + ts * 0.3, ts * 0.4, ts * 0.4);
      this.pathGraphics.fill({ color: PATH_PREVIEW_COLOR, alpha: 0.25 });
    }

    // ---- Draw players ----
    this.playerGraphics.clear();
    const activeIds = new Set<string>();

    for (const p of this.players) {
      activeIds.add(p.id);
      const { sx, sy } = this.worldToScreen(p.x, p.y);
      const centerX = sx + ts / 2;
      const centerY = sy + ts / 2;
      const radius = ts * 0.35;

      const color = p.isLocal ? LOCAL_PLAYER_COLOR : PLAYER_COLOR;
      this.playerGraphics.circle(centerX, centerY, radius);
      this.playerGraphics.fill(color);
      this.playerGraphics.circle(centerX, centerY, radius);
      this.playerGraphics.stroke({ width: 2, color: 0x000000, alpha: 0.4 });

      // Update HTML label position
      const name = this.playerNames.get(p.id) || p.id;
      let label = this.labelElements.get(p.id);
      if (!label) {
        label = document.createElement('div');
        label.className = 'player-label';
        this.labelsContainer.appendChild(label);
        this.labelElements.set(p.id, label);
      }
      label.textContent = name;
      label.style.left = `${centerX}px`;
      label.style.top = `${sy - 4}px`;

      // Update chat bubble position
      const bubble = this.bubbleElements.get(p.id);
      if (bubble) {
        bubble.el.style.left = `${centerX}px`;
        bubble.el.style.top = `${sy - 22}px`;
      }
    }

    // Remove labels for players that are gone
    for (const [id, label] of this.labelElements) {
      if (!activeIds.has(id)) {
        label.remove();
        this.labelElements.delete(id);
      }
    }
  }
}
