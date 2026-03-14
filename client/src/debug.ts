import type { Network } from './network';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export class DebugOverlay {
  private el: HTMLElement;
  private network: Network;
  private playerCount = 0;
  private mapTiles = 0;

  // FPS tracking
  private frameCount = 0;
  private fps = 0;
  private lastFpsTime = performance.now();

  constructor(network: Network) {
    this.network = network;

    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    document.getElementById('game-container')!.appendChild(this.el);
  }

  setPlayerCount(count: number) {
    this.playerCount = count;
  }

  setMapTiles(count: number) {
    this.mapTiles = count;
  }

  /** Call once per frame from the game loop */
  update() {
    const now = performance.now();
    this.frameCount++;
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount / elapsed) * 1000);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    const perMin = this.network.getBytesPerMinute();

    this.el.innerHTML = [
      `FPS: ${this.fps}`,
      `Ping: ${this.network.latency.toFixed(0)} ms`,
      `Players: ${this.playerCount}`,
      `Map tiles: ${this.mapTiles.toLocaleString()}`,
      `Data recv: ${formatBytes(this.network.bytesReceived)} (${formatBytes(perMin.recv)}/min)`,
      `Data sent: ${formatBytes(this.network.bytesSent)} (${formatBytes(perMin.sent)}/min)`,
    ].join('<br>');
  }
}
