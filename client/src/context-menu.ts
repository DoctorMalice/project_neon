export interface MenuAction {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

export class ContextMenu {
  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'context-menu';
    this.el.style.display = 'none';
    document.getElementById('game-container')!.appendChild(this.el);

    // Close on any click outside
    document.addEventListener('pointerdown', (e) => {
      if (!this.el.contains(e.target as Node)) {
        this.hide();
      }
    });

    // Close on scroll/zoom
    document.addEventListener('wheel', () => this.hide(), { passive: true });
  }

  show(x: number, y: number, actions: MenuAction[]) {
    this.el.innerHTML = '';

    for (const action of actions) {
      const item = document.createElement('div');
      item.className = 'context-menu-item' + (action.disabled ? ' disabled' : '');
      item.textContent = action.label;
      if (!action.disabled) {
        item.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          action.onSelect();
          this.hide();
        });
      }
      this.el.appendChild(item);
    }

    this.el.style.display = 'block';
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;

    // Keep menu on screen
    requestAnimationFrame(() => {
      const rect = this.el.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.el.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this.el.style.top = `${y - rect.height}px`;
      }
    });
  }

  hide() {
    this.el.style.display = 'none';
  }

  get isVisible(): boolean {
    return this.el.style.display !== 'none';
  }
}
