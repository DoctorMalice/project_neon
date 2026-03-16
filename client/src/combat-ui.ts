import {
  COMBAT_STRATEGIES,
  COMBAT_ACTION_TIMEOUT_MS,
  PHYSICAL_DAMAGE_TYPES,
  type CombatState,
  type CombatStrategy,
  type PhysicalDamageType,
  type CombatAction,
  type InventoryItem,
} from 'shared';

export type CombatActionCallback = (action: CombatAction) => void;

const STRATEGY_LABELS: Record<CombatStrategy, string> = {
  technical: 'Technical',
  accurate: 'Accurate',
  strong: 'Strong',
  fast: 'Fast',
  defensive: 'Defensive',
  agile: 'Agile',
};

const DAMAGE_TYPE_LABELS: Record<PhysicalDamageType, string> = {
  slicing: 'Slicing',
  piercing: 'Piercing',
  bludgeoning: 'Bludgeon',
  crushing: 'Crushing',
  chopping: 'Chopping',
};

export class CombatUI {
  private overlay: HTMLDivElement;
  private enemySection: HTMLDivElement;
  private logSection: HTMLDivElement;
  private allySection: HTMLDivElement;
  private controlsSection: HTMLDivElement;
  private resultSection: HTMLDivElement;

  private selectedStrategy: CombatStrategy = 'technical';
  private selectedDamageType: PhysicalDamageType = 'slicing';
  private onAction: CombatActionCallback | null = null;
  private actionsEnabled = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private turnDeadline = 0;
  private serverTimeOffset = 0;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'combat-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div id="combat-panel">
        <div id="combat-header">
          <span id="combat-round-label">Combat</span>
          <span id="combat-timer"></span>
        </div>
        <div id="combat-participants">
          <div id="combat-allies-col">
            <div class="combat-section-label ally-label">Allies</div>
            <div id="combat-allies"></div>
          </div>
          <div id="combat-vs">VS</div>
          <div id="combat-enemies-col">
            <div class="combat-section-label enemy-label">Enemies</div>
            <div id="combat-enemies"></div>
          </div>
        </div>
        <div id="combat-log"></div>
        <div id="combat-controls">
          <div class="combat-control-group">
            <div class="combat-control-label">Strategy</div>
            <div id="combat-strategy-row" class="combat-btn-row"></div>
          </div>
          <div class="combat-control-group">
            <div class="combat-control-label">Damage Type</div>
            <div id="combat-damage-row" class="combat-btn-row"></div>
          </div>
          <div class="combat-divider"></div>
          <div id="combat-action-row" class="combat-btn-row"></div>
        </div>
        <div id="combat-result"></div>
      </div>
    `;

    document.getElementById('game-container')!.appendChild(this.overlay);

    this.enemySection = this.overlay.querySelector('#combat-enemies')!;
    this.logSection = this.overlay.querySelector('#combat-log')!;
    this.allySection = this.overlay.querySelector('#combat-allies')!;
    this.controlsSection = this.overlay.querySelector('#combat-controls')!;
    this.resultSection = this.overlay.querySelector('#combat-result')!;

    this.buildControls();
  }

  private buildControls(): void {
    const strategyRow = this.overlay.querySelector('#combat-strategy-row')!;
    const damageRow = this.overlay.querySelector('#combat-damage-row')!;
    const actionRow = this.overlay.querySelector('#combat-action-row')!;

    // Strategy buttons
    for (const strat of COMBAT_STRATEGIES) {
      const btn = document.createElement('button');
      btn.className = 'combat-toggle-btn';
      btn.textContent = STRATEGY_LABELS[strat];
      btn.dataset.strategy = strat;
      if (strat === this.selectedStrategy) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.selectedStrategy = strat;
        strategyRow.querySelectorAll('.combat-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      strategyRow.appendChild(btn);
    }

    // Damage type buttons
    for (const dt of PHYSICAL_DAMAGE_TYPES) {
      const btn = document.createElement('button');
      btn.className = 'combat-toggle-btn';
      btn.textContent = DAMAGE_TYPE_LABELS[dt];
      btn.dataset.damageType = dt;
      if (dt === this.selectedDamageType) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.selectedDamageType = dt;
        damageRow.querySelectorAll('.combat-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      damageRow.appendChild(btn);
    }

    // Action buttons
    const attackBtn = document.createElement('button');
    attackBtn.className = 'combat-action-btn attack';
    attackBtn.textContent = 'Attack';
    attackBtn.addEventListener('click', () => {
      if (!this.actionsEnabled || !this.onAction) return;
      this.onAction({ type: 'attack', strategy: this.selectedStrategy, damageType: this.selectedDamageType });
      this.setActionsEnabled(false);
    });

    const defendBtn = document.createElement('button');
    defendBtn.className = 'combat-action-btn defend';
    defendBtn.textContent = 'Defend';
    defendBtn.addEventListener('click', () => {
      if (!this.actionsEnabled || !this.onAction) return;
      this.onAction({ type: 'defend', strategy: this.selectedStrategy });
      this.setActionsEnabled(false);
    });

    const runBtn = document.createElement('button');
    runBtn.className = 'combat-action-btn run';
    runBtn.textContent = 'Run';
    runBtn.addEventListener('click', () => {
      if (!this.actionsEnabled || !this.onAction) return;
      this.onAction({ type: 'run', strategy: this.selectedStrategy });
      this.setActionsEnabled(false);
    });

    actionRow.appendChild(attackBtn);
    actionRow.appendChild(defendBtn);
    actionRow.appendChild(runBtn);
  }

  setOnAction(cb: CombatActionCallback): void {
    this.onAction = cb;
  }

  show(state: CombatState, myPlayerId: string): void {
    this.overlay.style.display = 'flex';
    this.resultSection.style.display = 'none';
    this.controlsSection.style.display = '';
    this.updateState(state, myPlayerId);
  }

  hide(): void {
    this.overlay.style.display = 'none';
    this.stopTimer();
  }

  get isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  setServerTimeOffset(offset: number): void {
    this.serverTimeOffset = offset;
  }

  updateState(state: CombatState, myPlayerId: string): void {
    // Round label
    const roundLabel = this.overlay.querySelector('#combat-round-label')!;
    roundLabel.textContent = `Combat — Round ${state.round}`;

    // Timer
    this.turnDeadline = state.turnDeadline;
    this.updateTimer();
    this.startTimer();

    // Enemies
    this.enemySection.innerHTML = state.enemies
      .map(e => {
        const pct = Math.max(0, e.stats.hp / e.stats.maxHp * 100);
        return `<div class="combat-card enemy">
          <div class="combat-card-name">${e.name}</div>
          <div class="combat-card-bar-row">
            <span class="combat-bar-label">HP</span>
            <div class="combat-bar-container">
              <div class="combat-bar hp" style="width:${pct}%"></div>
            </div>
            <span class="combat-bar-value">${e.stats.hp}/${e.stats.maxHp}</span>
          </div>
        </div>`;
      })
      .join('');

    // Allies
    this.allySection.innerHTML = state.allies
      .map(a => {
        const hpPct = Math.max(0, a.stats.hp / a.stats.maxHp * 100);
        const isMe = a.id === myPlayerId;
        let bars = `<div class="combat-card-bar-row">
            <span class="combat-bar-label">HP</span>
            <div class="combat-bar-container">
              <div class="combat-bar hp" style="width:${hpPct}%"></div>
            </div>
            <span class="combat-bar-value">${a.stats.hp}/${a.stats.maxHp}</span>
          </div>`;
        if (a.stats.maxMp > 0) {
          const mpPct = Math.max(0, a.stats.mp / a.stats.maxMp * 100);
          bars += `<div class="combat-card-bar-row">
            <span class="combat-bar-label">MP</span>
            <div class="combat-bar-container mp-bar">
              <div class="combat-bar mp" style="width:${mpPct}%"></div>
            </div>
            <span class="combat-bar-value">${a.stats.mp}/${a.stats.maxMp}</span>
          </div>`;
        }
        if (a.stats.maxSp > 0) {
          const spPct = Math.max(0, a.stats.sp / a.stats.maxSp * 100);
          bars += `<div class="combat-card-bar-row">
            <span class="combat-bar-label">SP</span>
            <div class="combat-bar-container sp-bar">
              <div class="combat-bar sp" style="width:${spPct}%"></div>
            </div>
            <span class="combat-bar-value">${a.stats.sp}/${a.stats.maxSp}</span>
          </div>`;
        }

        // Ally status (only show for other allies during awaiting_action phase)
        let statusHtml = '';
        if (!isMe && a.alive && state.phase === 'awaiting_action') {
          const isReady = state.readyPlayerIds.includes(a.id);
          if (isReady) {
            statusHtml = `<div class="combat-ally-status ready">Ready!</div>`;
          } else {
            statusHtml = `<div class="combat-ally-status deciding">Deciding next move...</div>`;
          }
        }

        return `<div class="combat-card ally ${isMe ? 'me' : ''}">
          <div class="combat-card-name">${a.name}${isMe ? ' (You)' : ''}</div>
          ${bars}
          ${statusHtml}
        </div>`;
      })
      .join('');

    // Log
    if (state.log.length > 0) {
      this.logSection.innerHTML = state.log
        .map(entry => `<div class="combat-log-entry${entry.crit ? ' crit' : ''}${entry.dodged ? ' dodged' : ''}">${entry.message}</div>`)
        .join('');
      this.logSection.scrollTop = this.logSection.scrollHeight;
    }

    // Enable/disable actions
    const awaiting = state.awaitingActionFrom.includes(myPlayerId);
    this.setActionsEnabled(awaiting);

    if (state.phase === 'awaiting_action' && !awaiting && state.awaitingActionFrom.length > 0) {
      this.setStatusText('Waiting for allies...');
    }
  }

  showResult(result: 'victory' | 'defeat' | 'fled', xp: number, loot: InventoryItem[]): void {
    this.controlsSection.style.display = 'none';
    this.resultSection.style.display = '';

    let html = `<div class="combat-result-title ${result}">${result === 'victory' ? 'Victory!' : result === 'defeat' ? 'Defeat!' : 'Fled!'}</div>`;
    if (result === 'victory') {
      html += `<div class="combat-reward">+${xp} XP</div>`;
      if (loot.length > 0) {
        html += loot.map(l => `<div class="combat-reward">${l.itemType} x${l.quantity}</div>`).join('');
      }
    }
    html += `<button id="combat-close-btn" class="combat-action-btn">Close</button>`;
    this.resultSection.innerHTML = html;

    this.resultSection.querySelector('#combat-close-btn')!.addEventListener('click', () => {
      this.hide();
    });
  }

  private setActionsEnabled(enabled: boolean): void {
    this.actionsEnabled = enabled;
    const btns = this.controlsSection.querySelectorAll('.combat-action-btn');
    btns.forEach(btn => {
      (btn as HTMLButtonElement).disabled = !enabled;
      btn.classList.toggle('disabled', !enabled);
    });
  }

  private setStatusText(text: string): void {
    const existing = this.controlsSection.querySelector('.combat-status');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'combat-status';
    el.textContent = text;
    this.controlsSection.appendChild(el);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => this.updateTimer(), 250);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateTimer(): void {
    const timerEl = this.overlay.querySelector('#combat-timer')!;
    if (!this.turnDeadline) {
      timerEl.textContent = '';
      return;
    }
    const now = Date.now() + this.serverTimeOffset;
    const remaining = Math.max(0, Math.ceil((this.turnDeadline - now) / 1000));
    const total = Math.ceil(COMBAT_ACTION_TIMEOUT_MS / 1000);
    timerEl.textContent = `${remaining}s`;
    timerEl.classList.toggle('combat-timer-urgent', remaining <= 5);

    // Update the timer bar width
    const barEl = this.overlay.querySelector('#combat-timer-bar') as HTMLElement | null;
    if (barEl) {
      barEl.style.width = `${Math.max(0, (remaining / total) * 100)}%`;
    }
  }
}
