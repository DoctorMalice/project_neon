import { ITEM_DEFS, type Equipment, type EquipSlot, EQUIP_SLOTS } from 'shared';
import type { Network } from './network';

// Reverse lookup: item name -> item def id
const NAME_TO_DEF_ID = new Map<string, string>();
for (const [id, def] of Object.entries(ITEM_DEFS)) {
  NAME_TO_DEF_ID.set(def.name, id);
}

export class Inventory {
  private items: Map<string, number> = new Map();
  private equipment: Equipment = {};
  private panel: HTMLElement;
  private list: HTMLElement;
  private equipSection: HTMLElement;
  private button: HTMLElement;
  private network: Network;
  private visible = false;

  constructor(network: Network) {
    this.network = network;

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

    // Equipment section
    const equipHeader = document.createElement('div');
    equipHeader.className = 'inventory-header';
    equipHeader.textContent = 'Equipment';
    this.panel.appendChild(equipHeader);

    this.equipSection = document.createElement('div');
    this.equipSection.className = 'inventory-list';
    this.panel.appendChild(this.equipSection);

    document.getElementById('game-container')!.appendChild(this.panel);

    // Keyboard shortcut
    window.addEventListener('keydown', (e) => {
      if (e.key === 'i' || e.key === 'I') {
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

  updateEquipment(equipment: Equipment) {
    this.equipment = equipment;
    this.render();
  }

  private render() {
    // Inventory items
    this.list.innerHTML = '';
    if (this.items.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = 'No items';
      this.list.appendChild(empty);
    } else {
      for (const [itemType, quantity] of this.items) {
        const row = document.createElement('div');
        row.className = 'inventory-item';

        const label = document.createElement('span');
        label.textContent = `${itemType} x${quantity}`;
        row.appendChild(label);

        // Check if equippable
        const defId = NAME_TO_DEF_ID.get(itemType);
        if (defId) {
          const def = ITEM_DEFS[defId];
          if (def && def.equipSlots.length > 0) {
            const equipBtn = document.createElement('button');
            equipBtn.className = 'inv-equip-btn';
            equipBtn.textContent = 'Equip';
            equipBtn.addEventListener('click', () => {
              // Pick first available slot
              const slot = def.equipSlots[0];
              this.network.send({ type: 'EQUIP', itemId: defId, slot });
            });
            row.appendChild(equipBtn);
          }
        }

        this.list.appendChild(row);
      }
    }

    // Equipment slots
    this.equipSection.innerHTML = '';
    let hasEquipped = false;
    const rendered = new Set<string>(); // avoid showing two-handers twice

    for (const slot of EQUIP_SLOTS) {
      const itemId = this.equipment[slot];
      if (!itemId) continue;

      // Two-handed dedup
      const key = `${itemId}`;
      if (rendered.has(key) && (slot === 'wield_left' || slot === 'wield_right')) continue;
      rendered.add(key);

      const def = ITEM_DEFS[itemId];
      const name = def?.name ?? itemId;
      hasEquipped = true;

      const row = document.createElement('div');
      row.className = 'inventory-item equip-slot-row';

      const slotLabel = document.createElement('span');
      slotLabel.className = 'equip-slot-label';
      slotLabel.textContent = formatSlot(slot);
      row.appendChild(slotLabel);

      const itemLabel = document.createElement('span');
      itemLabel.textContent = name;
      row.appendChild(itemLabel);

      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'inv-equip-btn';
      unequipBtn.textContent = 'Remove';
      unequipBtn.addEventListener('click', () => {
        this.network.send({ type: 'UNEQUIP', slot });
      });
      row.appendChild(unequipBtn);

      this.equipSection.appendChild(row);
    }

    if (!hasEquipped) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = 'Nothing equipped';
      this.equipSection.appendChild(empty);
    }
  }
}

function formatSlot(slot: EquipSlot): string {
  switch (slot) {
    case 'wield_left': return 'L Hand';
    case 'wield_right': return 'R Hand';
    case 'head': return 'Head';
    case 'chest': return 'Chest';
    case 'hands': return 'Hands';
    case 'legs': return 'Legs';
    case 'feet': return 'Feet';
    default: return slot;
  }
}
