import type { ClientMessage, ServerMessage } from 'shared';

type MessageHandler = (msg: ServerMessage) => void;

export class Network {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          // ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        console.log('Disconnected from server');
      };
    });
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }
}
