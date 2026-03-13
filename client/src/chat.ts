import type { Network } from './network';

export class Chat {
  private log: HTMLElement;
  private input: HTMLInputElement;
  private network: Network;
  private isInputFocused = false;

  constructor(network: Network) {
    this.network = network;
    this.log = document.getElementById('chat-log')!;
    this.input = document.getElementById('chat-input') as HTMLInputElement;

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.sendMessage();
      }
      // Stop propagation so game doesn't handle input while typing
      e.stopPropagation();
    });

    this.input.addEventListener('focus', () => {
      this.isInputFocused = true;
    });

    this.input.addEventListener('blur', () => {
      this.isInputFocused = false;
    });

    // Global Enter key to focus chat
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.isInputFocused) {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  get isFocused(): boolean {
    return this.isInputFocused;
  }

  addMessage(name: string, message: string) {
    const el = document.createElement('div');
    el.className = 'chat-message';
    el.innerHTML = `<span class="name">${this.escapeHtml(name)}:</span> ${this.escapeHtml(message)}`;
    this.log.appendChild(el);
    this.log.scrollTop = this.log.scrollHeight;
  }

  addSystemMessage(message: string) {
    const el = document.createElement('div');
    el.className = 'chat-message system';
    el.textContent = message;
    this.log.appendChild(el);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private sendMessage() {
    const message = this.input.value.trim();
    if (!message) return;

    this.network.send({ type: 'CHAT', message });
    this.input.value = '';
    this.input.blur();
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
