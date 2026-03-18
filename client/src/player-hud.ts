import type { CharacterSheet, CombatStats } from 'shared';
import { getTotalXPForLevel } from 'shared';

export class PlayerHud {
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'player-hud';
    this.container.style.display = 'none';
    document.getElementById('game-container')!.appendChild(this.container);
  }

  update(sheet: CharacterSheet, stats: CombatStats): void {
    this.container.style.display = '';

    const xpCurrent = sheet.xp;
    const xpForCurrent = getTotalXPForLevel(sheet.level);
    const xpForNext = getTotalXPForLevel(sheet.level + 1);
    const xpInLevel = xpCurrent - xpForCurrent;
    const xpNeeded = xpForNext - xpForCurrent;
    const xpPct = xpNeeded > 0 ? Math.min(100, (xpInLevel / xpNeeded) * 100) : 0;

    const hpPct = stats.maxHp > 0 ? Math.max(0, (stats.hp / stats.maxHp) * 100) : 0;
    const mpPct = stats.maxMp > 0 ? Math.max(0, (stats.mp / stats.maxMp) * 100) : 0;
    const spPct = stats.maxSp > 0 ? Math.max(0, (stats.sp / stats.maxSp) * 100) : 0;

    this.container.innerHTML = `
      <div class="hud-name">${sheet.race} ${sheet.class}</div>
      <div class="hud-level">Lv ${sheet.level}</div>
      <div class="hud-bar-row">
        <span class="hud-bar-label">XP</span>
        <div class="hud-bar"><div class="hud-bar-fill xp" style="width:${xpPct}%"></div></div>
        <span class="hud-bar-text">${xpInLevel}/${xpNeeded}</span>
      </div>
      <div class="hud-bar-row">
        <span class="hud-bar-label">HP</span>
        <div class="hud-bar"><div class="hud-bar-fill hp" style="width:${hpPct}%"></div></div>
        <span class="hud-bar-text">${stats.hp}/${stats.maxHp}</span>
      </div>
      ${stats.maxMp > 0 ? `<div class="hud-bar-row">
        <span class="hud-bar-label">MP</span>
        <div class="hud-bar"><div class="hud-bar-fill mp" style="width:${mpPct}%"></div></div>
        <span class="hud-bar-text">${stats.mp}/${stats.maxMp}</span>
      </div>` : ''}
      ${stats.maxSp > 0 ? `<div class="hud-bar-row">
        <span class="hud-bar-label">SP</span>
        <div class="hud-bar"><div class="hud-bar-fill sp" style="width:${spPct}%"></div></div>
        <span class="hud-bar-text">${stats.sp}/${stats.maxSp}</span>
      </div>` : ''}
    `;
  }
}
