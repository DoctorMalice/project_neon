import type { ClientMessage, ServerMessage } from 'shared';

type MessageHandler = (msg: ServerMessage) => void;

export class Network {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];

  // Byte tracking
  bytesReceived = 0;
  bytesSent = 0;
  private bytesReceivedLog: { time: number; bytes: number }[] = [];
  private bytesSentLog: { time: number; bytes: number }[] = [];

  // Ping
  latency = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(url: string): Promise<void> {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.startPing();
        resolve();
      };
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

      this.ws.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : '';
        const size = new TextEncoder().encode(raw).byteLength;
        this.bytesReceived += size;
        this.bytesReceivedLog.push({ time: Date.now(), bytes: size });

        try {
          const msg: ServerMessage = JSON.parse(raw);
          if (msg.type === 'PONG') {
            this.latency = performance.now() - msg.timestamp;
          }
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          // ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        console.log('Disconnected from server');
        if (this.pingInterval) clearInterval(this.pingInterval);
      };
    });
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(msg);
      const size = new TextEncoder().encode(data).byteLength;
      this.bytesSent += size;
      this.bytesSentLog.push({ time: Date.now(), bytes: size });
      this.ws.send(data);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  /** Average bytes per minute (received + sent) over the last 60 seconds */
  getBytesPerMinute(): { recv: number; sent: number } {
    const cutoff = Date.now() - 60_000;
    this.bytesReceivedLog = this.bytesReceivedLog.filter((e) => e.time >= cutoff);
    this.bytesSentLog = this.bytesSentLog.filter((e) => e.time >= cutoff);
    const elapsed = Math.min(60, (Date.now() - (this.bytesReceivedLog[0]?.time ?? Date.now())) / 1000) || 1;
    const factor = 60 / elapsed;
    const recv = this.bytesReceivedLog.reduce((sum, e) => sum + e.bytes, 0) * factor;
    const sent = this.bytesSentLog.reduce((sum, e) => sum + e.bytes, 0) * factor;
    return { recv, sent };
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', timestamp: performance.now() });
    }, 2000);
  }
}
