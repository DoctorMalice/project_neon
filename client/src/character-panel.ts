import {
  ATTRIBUTE_KEYS,
  type CharacterSheet,
  type CombatStats,
  type AttributeKey,
  type Attributes,
  getTotalXPForLevel,
} from 'shared';
import type { Network } from './network';

const ATTR_LABELS: Record<AttributeKey, string> = {
  constitution: 'CON', regeneration: 'REG', mentis: 'MEN', fortitude: 'FOR',
  endurance: 'END', recovery: 'REC', tenacity: 'TEN', recuperation: 'RCP',
  aura: 'AUR', meditation: 'MED', strength: 'STR', toughness: 'TGH',
  intelligence: 'INT', dexterity: 'DEX', celerity: 'CEL', charisma: 'CHA', luck: 'LCK',
};

const ATTR_FULL: Record<AttributeKey, string> = {
  constitution: 'Constitution (HP)', regeneration: 'Regeneration', mentis: 'Mentis (MP)',
  fortitude: 'Fortitude', endurance: 'Endurance (SP)', recovery: 'Recovery',
  tenacity: 'Tenacity (EP)', recuperation: 'Recuperation', aura: 'Aura (KP)',
  meditation: 'Meditation', strength: 'Strength (Power)', toughness: 'Toughness (Defense)',
  intelligence: 'Intelligence', dexterity: 'Dexterity (Dodge)', celerity: 'Celerity (Speed)',
  charisma: 'Charisma', luck: 'Luck (Crit)',
};

export class CharacterPanel {
  private btn: HTMLButtonElement;
  private panel: HTMLDivElement;
  private network: Network;
  private visible = false;
  private sheet: CharacterSheet | null = null;
  private combatStats: CombatStats | null = null;
  private pendingChanges: Partial<Record<AttributeKey, number>> = {};
  private pendingCost = 0;

  constructor(network: Network) {
    this.network = network;

    // Toggle button
    this.btn = document.createElement('button');
    this.btn.id = 'character-btn';
    this.btn.textContent = 'Character (C)';
    document.getElementById('game-container')!.appendChild(this.btn);

    // Panel
    this.panel = document.createElement('div');
    this.panel.id = 'character-panel';
    this.panel.style.display = 'none';
    document.getElementById('game-container')!.appendChild(this.panel);

    this.btn.addEventListener('click', () => this.toggle());

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        // Don't toggle if typing in an input
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        this.toggle();
      }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'flex' : 'none';
    if (this.visible) this.renderPanel();
  }

  update(sheet: CharacterSheet, combatStats: CombatStats): void {
    this.sheet = sheet;
    this.combatStats = combatStats;
    this.pendingChanges = {};
    this.pendingCost = 0;
    if (this.visible) this.renderPanel();
  }

  private renderPanel(): void {
    if (!this.sheet) {
      this.panel.innerHTML = '<div class="cp-header">No character data</div>';
      return;
    }

    const s = this.sheet;
    const xpCurrent = s.xp;
    const xpForCurrent = getTotalXPForLevel(s.level);
    const xpForNext = getTotalXPForLevel(s.level + 1);
    const xpInLevel = xpCurrent - xpForCurrent;
    const xpNeeded = xpForNext - xpForCurrent;
    const xpPct = xpNeeded > 0 ? Math.min(100, (xpInLevel / xpNeeded) * 100) : 0;

    let html = `
      <div class="cp-header">${s.race} ${s.class}</div>
      <div class="cp-level">Level ${s.level}</div>
      <div class="cp-xp-row">
        <div class="cp-xp-bar"><div class="cp-xp-fill" style="width:${xpPct}%"></div></div>
        <span class="cp-xp-text">${xpInLevel} / ${xpNeeded} XP</span>
      </div>
      <div class="cp-section-title">Resource Pools</div>
      <div class="cp-pools">
        <span>HP ${s.attributes.constitution}</span>
        <span>MP ${s.attributes.mentis}</span>
        <span>SP ${s.attributes.endurance}</span>
        <span>EP ${s.attributes.tenacity}</span>
        <span>KP ${s.attributes.aura}</span>
      </div>
      <div class="cp-section-title">Attributes ${s.attributePoints > 0 ? `<span class="cp-points">(${s.attributePoints - this.pendingCost} pts)</span>` : ''}</div>
      <div class="cp-attr-list" id="cp-attrs">
    `;

    for (const key of ATTRIBUTE_KEYS) {
      const val = s.attributes[key] + (this.pendingChanges[key] ?? 0);
      const canAllocate = s.attributePoints > 0;
      html += `<div class="cp-attr-row">
        <span class="cp-attr-label" title="${ATTR_FULL[key]}">${ATTR_LABELS[key]}</span>
        <span class="cp-attr-val">${val}</span>
        ${canAllocate ? `<button class="cp-attr-btn minus" data-key="${key}">-</button><button class="cp-attr-btn plus" data-key="${key}">+</button>` : ''}
      </div>`;
    }

    html += '</div>';

    if (this.sheet.attributePoints > 0) {
      html += `<button class="cp-apply-btn" id="cp-apply" ${this.pendingCost === 0 ? 'disabled' : ''}>Apply (${this.pendingCost} pts)</button>`;
    }

    this.panel.innerHTML = html;

    // Wire events
    const attrList = this.panel.querySelector('#cp-attrs');
    if (attrList) {
      attrList.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.cp-attr-btn') as HTMLElement | null;
        if (!btn) return;
        const key = btn.dataset.key as AttributeKey;
        if (btn.classList.contains('plus')) {
          if (this.pendingCost >= this.sheet!.attributePoints) return;
          this.pendingChanges[key] = (this.pendingChanges[key] ?? 0) + 1;
          this.pendingCost++;
        } else {
          if ((this.pendingChanges[key] ?? 0) <= 0) return;
          this.pendingChanges[key]! -= 1;
          this.pendingCost--;
        }
        this.renderPanel();
      });
    }

    const applyBtn = this.panel.querySelector('#cp-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (this.pendingCost <= 0) return;
        const changes: Partial<Attributes> = {};
        for (const key of ATTRIBUTE_KEYS) {
          if ((this.pendingChanges[key] ?? 0) > 0) {
            changes[key] = this.pendingChanges[key]!;
          }
        }
        this.network.send({ type: 'ALLOCATE_ATTRIBUTES', changes });
        this.pendingChanges = {};
        this.pendingCost = 0;
      });
    }
  }
}
