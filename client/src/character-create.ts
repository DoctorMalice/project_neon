import {
  RACE_IDS, CLASS_IDS, RACES, CLASSES, ATTRIBUTE_KEYS,
  STARTING_ATTRIBUTE_POINTS, computeBaseAttributes,
  type RaceId, type ClassId, type Attributes, type AttributeKey,
} from 'shared';

export interface CharacterCreateResult {
  displayName: string;
  race: RaceId;
  class: ClassId;
  initialAttributes: Partial<Attributes>;
}

// Short descriptions for race/class picker
const RACE_DESCRIPTIONS: Record<RaceId, string> = {
  Human: 'Balanced all-around',
  Orc: 'Strong & tough, low magic',
  Dwarf: 'High endurance & defense',
  Elf: 'High magic & dexterity',
  Gnome: 'Powerful magic, fragile',
  Halfling: 'Agile & lucky',
};

const CLASS_DESCRIPTIONS: Record<ClassId, string> = {
  Traveler: 'Jack of all trades',
  Apprentice: 'No base stats, high growth',
  Fighter: 'Offense-focused warrior',
  Tank: 'Maximum durability',
  Scholar: 'Intelligence & magic',
  Craftsman: 'Dexterity specialist',
  Merchant: 'Charisma & luck',
};

// Compact attribute labels
const ATTR_LABELS: Record<AttributeKey, string> = {
  constitution: 'CON', regeneration: 'REG', mentis: 'MEN', fortitude: 'FOR',
  endurance: 'END', recovery: 'REC', tenacity: 'TEN', recuperation: 'RCP',
  aura: 'AUR', meditation: 'MED', strength: 'STR', toughness: 'TGH',
  intelligence: 'INT', dexterity: 'DEX', celerity: 'CEL', charisma: 'CHA', luck: 'LCK',
};

// Only show primary combat-relevant attributes in the picker for brevity
const ALLOCATABLE_KEYS: AttributeKey[] = [
  'constitution', 'mentis', 'endurance', 'tenacity', 'aura',
  'strength', 'toughness', 'intelligence', 'dexterity', 'celerity', 'charisma', 'luck',
];

export class CharacterCreate {
  private container: HTMLElement;
  private onComplete: ((result: CharacterCreateResult) => void) | null = null;

  private step: 'name' | 'race' | 'class' | 'attributes' = 'name';
  private displayName = '';
  private selectedRace: RaceId | null = null;
  private selectedClass: ClassId | null = null;
  private allocated: Partial<Record<AttributeKey, number>> = {};
  private pointsRemaining = STARTING_ATTRIBUTE_POINTS;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  setOnComplete(cb: (result: CharacterCreateResult) => void): void {
    this.onComplete = cb;
  }

  private render(): void {
    switch (this.step) {
      case 'name': return this.renderName();
      case 'race': return this.renderRace();
      case 'class': return this.renderClass();
      case 'attributes': return this.renderAttributes();
    }
  }

  private renderName(): void {
    this.container.innerHTML = `
      <h1>Project Neon</h1>
      <input id="cc-name" type="text" placeholder="Enter your name" maxlength="16" autofocus />
      <button id="cc-next" class="cc-btn primary">Next</button>
    `;
    const input = this.container.querySelector('#cc-name') as HTMLInputElement;
    const btn = this.container.querySelector('#cc-next')!;
    const next = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      this.displayName = name;
      this.step = 'race';
      this.render();
    };
    btn.addEventListener('click', next);
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') next(); });
    input.focus();
  }

  private renderRace(): void {
    this.container.innerHTML = `
      <h2 class="cc-heading">Choose Your Race</h2>
      <div class="cc-grid" id="cc-race-grid"></div>
      <button id="cc-back" class="cc-btn">Back</button>
    `;
    const grid = this.container.querySelector('#cc-race-grid')!;
    for (const raceId of RACE_IDS) {
      const race = RACES[raceId];
      const btn = document.createElement('button');
      btn.className = 'cc-option-btn';
      btn.innerHTML = `<span class="cc-option-name">${race.name}</span><span class="cc-option-desc">${RACE_DESCRIPTIONS[raceId]}</span>`;
      btn.addEventListener('click', () => {
        this.selectedRace = raceId;
        this.step = 'class';
        this.render();
      });
      grid.appendChild(btn);
    }
    this.container.querySelector('#cc-back')!.addEventListener('click', () => {
      this.step = 'name';
      this.render();
    });
  }

  private renderClass(): void {
    this.container.innerHTML = `
      <h2 class="cc-heading">Choose Your Class</h2>
      <div class="cc-grid" id="cc-class-grid"></div>
      <button id="cc-back" class="cc-btn">Back</button>
    `;
    const grid = this.container.querySelector('#cc-class-grid')!;
    for (const classId of CLASS_IDS) {
      const cls = CLASSES[classId];
      const btn = document.createElement('button');
      btn.className = 'cc-option-btn';
      btn.innerHTML = `<span class="cc-option-name">${cls.name}</span><span class="cc-option-desc">${CLASS_DESCRIPTIONS[classId]}</span>`;
      btn.addEventListener('click', () => {
        this.selectedClass = classId;
        this.allocated = {};
        this.pointsRemaining = STARTING_ATTRIBUTE_POINTS;
        this.step = 'attributes';
        this.render();
      });
      grid.appendChild(btn);
    }
    this.container.querySelector('#cc-back')!.addEventListener('click', () => {
      this.step = 'race';
      this.render();
    });
  }

  private renderAttributes(): void {
    const base = computeBaseAttributes(this.selectedRace!, this.selectedClass!);

    this.container.innerHTML = `
      <h2 class="cc-heading">${this.selectedRace} ${this.selectedClass}</h2>
      <div class="cc-points">Points: <span id="cc-points-val">${this.pointsRemaining}</span> / ${STARTING_ATTRIBUTE_POINTS}</div>
      <div class="cc-attr-list" id="cc-attrs"></div>
      <div class="cc-btn-row">
        <button id="cc-back" class="cc-btn">Back</button>
        <button id="cc-join" class="cc-btn primary">Join Game</button>
      </div>
    `;

    const list = this.container.querySelector('#cc-attrs')!;
    for (const key of ALLOCATABLE_KEYS) {
      const alloc = this.allocated[key] ?? 0;
      const total = base[key] + alloc;
      const row = document.createElement('div');
      row.className = 'cc-attr-row';
      row.innerHTML = `
        <span class="cc-attr-label">${ATTR_LABELS[key]}</span>
        <span class="cc-attr-val" id="cc-val-${key}">${total}</span>
        <button class="cc-attr-btn minus" data-key="${key}">-</button>
        <button class="cc-attr-btn plus" data-key="${key}">+</button>
      `;
      list.appendChild(row);
    }

    // Wire +/- buttons
    list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.cc-attr-btn') as HTMLElement | null;
      if (!btn) return;
      const key = btn.dataset.key as AttributeKey;
      if (btn.classList.contains('plus')) {
        if (this.pointsRemaining <= 0) return;
        this.allocated[key] = (this.allocated[key] ?? 0) + 1;
        this.pointsRemaining--;
      } else {
        if ((this.allocated[key] ?? 0) <= 0) return;
        this.allocated[key]! -= 1;
        this.pointsRemaining++;
      }
      // Update display
      const total = base[key] + (this.allocated[key] ?? 0);
      this.container.querySelector(`#cc-val-${key}`)!.textContent = String(total);
      this.container.querySelector('#cc-points-val')!.textContent = String(this.pointsRemaining);
    });

    this.container.querySelector('#cc-back')!.addEventListener('click', () => {
      this.step = 'class';
      this.render();
    });

    this.container.querySelector('#cc-join')!.addEventListener('click', () => {
      if (this.onComplete) {
        // Filter out zero allocations
        const attrs: Partial<Attributes> = {};
        for (const key of ALLOCATABLE_KEYS) {
          if ((this.allocated[key] ?? 0) > 0) {
            attrs[key] = this.allocated[key]!;
          }
        }
        this.onComplete({
          displayName: this.displayName,
          race: this.selectedRace!,
          class: this.selectedClass!,
          initialAttributes: attrs,
        });
      }
    });
  }
}
