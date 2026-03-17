import { ITEM_DEFS, type Equipment, type EquipSlot, EQUIP_SLOTS, RECIPES, canCraft } from 'shared';
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
  private craftSection: HTMLElement;
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

    // Crafting section
    const craftHeader = document.createElement('div');
    craftHeader.className = 'inventory-header';
    craftHeader.textContent = 'Crafting';
    this.panel.appendChild(craftHeader);

    this.craftSection = document.createElement('div');
    this.craftSection.className = 'inventory-list';
    this.panel.appendChild(this.craftSection);

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
            const hasMultipleHandSlots = def.equipSlots.includes('wield_left') && def.equipSlots.includes('wield_right');
            if (hasMultipleHandSlots && def.handedness !== 'two_hand') {
              // Show separate buttons for each hand
              for (const slot of ['wield_left', 'wield_right'] as const) {
                const btn = document.createElement('button');
                btn.className = 'inv-equip-btn';
                btn.textContent = slot === 'wield_left' ? 'L' : 'R';
                btn.title = slot === 'wield_left' ? 'Equip Left Hand' : 'Equip Right Hand';
                btn.addEventListener('click', () => {
                  this.network.send({ type: 'EQUIP', itemId: defId, slot });
                });
                row.appendChild(btn);
              }
            } else {
              const equipBtn = document.createElement('button');
              equipBtn.className = 'inv-equip-btn';
              equipBtn.textContent = 'Equip';
              equipBtn.addEventListener('click', () => {
                this.network.send({ type: 'EQUIP', itemId: defId, slot: def.equipSlots[0] });
              });
              row.appendChild(equipBtn);
            }
          }
        }

        this.list.appendChild(row);
      }
    }

    // Equipment slots
    this.equipSection.innerHTML = '';
    let hasEquipped = false;
    const twoHandRendered = new Set<string>();

    for (const slot of EQUIP_SLOTS) {
      const itemId = this.equipment[slot];
      if (!itemId) continue;

      const def = ITEM_DEFS[itemId];

      // Skip duplicate slot for two-handed weapons
      if (def?.handedness === 'two_hand' && (slot === 'wield_left' || slot === 'wield_right')) {
        if (twoHandRendered.has(itemId)) continue;
        twoHandRendered.add(itemId);
      }

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

    // Crafting recipes
    this.craftSection.innerHTML = '';
    for (const recipe of Object.values(RECIPES)) {
      const row = document.createElement('div');
      row.className = 'craft-recipe';

      const name = document.createElement('div');
      name.className = 'craft-recipe-name';
      name.textContent = recipe.name;
      row.appendChild(name);

      const ingredients = document.createElement('div');
      ingredients.className = 'craft-ingredients';
      for (const ing of recipe.inputs) {
        const have = this.items.get(ing.itemName) ?? 0;
        const enough = have >= ing.quantity;
        const ingEl = document.createElement('span');
        ingEl.className = `craft-ingredient ${enough ? 'have' : 'need'}`;
        ingEl.textContent = `${ing.itemName} ${have}/${ing.quantity}`;
        ingredients.appendChild(ingEl);
      }
      row.appendChild(ingredients);

      const craftable = canCraft(recipe, this.items);
      const craftBtn = document.createElement('button');
      craftBtn.className = 'inv-equip-btn';
      craftBtn.textContent = 'Craft';
      craftBtn.disabled = !craftable;
      if (!craftable) craftBtn.style.opacity = '0.4';
      craftBtn.addEventListener('click', () => {
        this.network.send({ type: 'CRAFT', recipeId: recipe.id });
      });
      row.appendChild(craftBtn);

      this.craftSection.appendChild(row);
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
