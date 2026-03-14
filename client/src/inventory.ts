export class Inventory {
  private items: Map<string, number> = new Map();
  private panel: HTMLElement;
  private list: HTMLElement;
  private button: HTMLElement;
  private visible = false;

  constructor() {
    // Toggle button
    this.button = document.createElement('div');
    this.button.id = 'inventory-btn';
    this.button.textContent = 'Inventory';
    this.button.addEventListener('click', () => this.toggle());
    document.getElementById('game-container')!.appendChild(this.button);

    // Panel
    this.panel = document.createElement('div');
    this.panel.id = 'inventory-panel';
    this.panel.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'inventory-header';
    header.textContent = 'Inventory';
    this.panel.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'inventory-list';
    this.panel.appendChild(this.list);

    document.getElementById('game-container')!.appendChild(this.panel);

    // Keyboard shortcut
    window.addEventListener('keydown', (e) => {
      if (e.key === 'i' || e.key === 'I') {
        // Don't toggle if typing in an input
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        this.toggle();
      }
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'flex' : 'none';
  }

  update(items: Array<{ itemType: string; quantity: number }>) {
    this.items.clear();
    for (const item of items) {
      this.items.set(item.itemType, item.quantity);
    }
    this.render();
  }

  private render() {
    this.list.innerHTML = '';
    if (this.items.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = 'No items';
      this.list.appendChild(empty);
      return;
    }
    for (const [itemType, quantity] of this.items) {
      const row = document.createElement('div');
      row.className = 'inventory-item';
      row.textContent = `${itemType} x${quantity}`;
      this.list.appendChild(row);
    }
  }
}
