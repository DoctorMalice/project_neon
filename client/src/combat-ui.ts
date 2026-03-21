import {
  COMBAT_STRATEGIES,
  COMBAT_ACTION_TIMEOUT_MS,
  PHYSICAL_DAMAGE_TYPES,
  SKILL_DEFS,
  ABILITY_DEFS,
  ABILITY_IDS,
  SPELL_DEFS,
  SPELL_IDS,
  AURA_DEFS,
  AURA_IDS,
  type AbilityId,
  type SpellId,
  type AuraId,
  type CombatState,
  type CombatStrategy,
  type CombatSkillId,
  type PhysicalDamageType,
  type CombatAction,
  type CombatLogEntry,
  type CombatParticipant,
  type Equipment,
  type InventoryItem,
  getEquippedWeaponDamageTypes,
} from 'shared';

export type CombatActionCallback = (action: CombatAction) => void;
export type AuraToggleCallback = (auraId: string) => void;

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
  private onAuraToggle: AuraToggleCallback | null = null;
  private onClose: (() => void) | null = null;
  private actionsEnabled = false;
  private currentMyStats: CombatParticipant | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private turnDeadline = 0;
  private serverTimeOffset = 0;

  // Playback state
  private isInPlayback = false;
  private playbackLog: CombatLogEntry[] = [];
  private playbackIndex = 0;
  private displayedHp: Record<string, number> = {};
  private playbackState: CombatState | null = null;
  private playbackPlayerId: string | null = null;
  private onPlaybackComplete: (() => void) | null = null;
  private shownLogEntries: CombatLogEntry[] = [];

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
            <div class="combat-control-label">Auras</div>
            <div id="combat-aura-row" class="combat-btn-row"></div>
          </div>
          <div class="combat-divider"></div>
          <div id="combat-resource-display" class="combat-resource-display"></div>
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
    const auraRow = this.overlay.querySelector('#combat-aura-row')!;

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

    // Damage type buttons are built dynamically via setAvailableDamageTypes
    this.setAvailableDamageTypes(PHYSICAL_DAMAGE_TYPES as unknown as PhysicalDamageType[]);

    // Aura toggle buttons
    for (const auraId of AURA_IDS) {
      const def = AURA_DEFS[auraId];
      const btn = document.createElement('button');
      btn.className = 'combat-toggle-btn combat-aura-btn';
      btn.textContent = `${def.name} (${def.kpCost} KP)`;
      btn.dataset.auraId = auraId;
      btn.addEventListener('click', () => {
        if (!this.onAuraToggle) return;
        this.onAuraToggle(auraId);
      });
      auraRow.appendChild(btn);
    }

    // Action buttons — Attack first
    const attackBtn = document.createElement('button');
    attackBtn.className = 'combat-action-btn attack';
    attackBtn.textContent = 'Attack';
    attackBtn.addEventListener('click', () => {
      if (!this.actionsEnabled || !this.onAction) return;
      this.onAction({ type: 'attack', strategy: this.selectedStrategy, damageType: this.selectedDamageType });
      this.setActionsEnabled(false);
      this.logSection.innerHTML = `<div class="combat-log-entry combat-log-waiting">Waiting on other players...</div>`;
    });
    actionRow.appendChild(attackBtn);

    // Ability buttons
    for (const abilityId of ABILITY_IDS) {
      const def = ABILITY_DEFS[abilityId];
      const btn = document.createElement('button');
      btn.className = 'combat-action-btn ability';
      btn.textContent = `${def.name} (${def.epCost} EP)`;
      btn.dataset.abilityId = abilityId;
      btn.addEventListener('click', () => {
        if (!this.actionsEnabled || !this.onAction) return;
        this.onAction({ type: 'ability', strategy: def.requiredStrategy, abilityId });
        this.setActionsEnabled(false);
        this.logSection.innerHTML = `<div class="combat-log-entry combat-log-waiting">Waiting on other players...</div>`;
      });
      actionRow.appendChild(btn);
    }

    // Spell buttons
    for (const spellId of SPELL_IDS) {
      const def = SPELL_DEFS[spellId];
      const btn = document.createElement('button');
      btn.className = 'combat-action-btn spell';
      btn.textContent = `${def.name} (${def.mpCost} MP)`;
      btn.dataset.spellId = spellId;
      btn.addEventListener('click', () => {
        if (!this.actionsEnabled || !this.onAction) return;
        this.onAction({ type: 'spell', strategy: this.selectedStrategy, spellId });
        this.setActionsEnabled(false);
        this.logSection.innerHTML = `<div class="combat-log-entry combat-log-waiting">Waiting on other players...</div>`;
      });
      actionRow.appendChild(btn);
    }

    // Defend
    const defendBtn = document.createElement('button');
    defendBtn.className = 'combat-action-btn defend';
    defendBtn.textContent = 'Defend';
    defendBtn.addEventListener('click', () => {
      if (!this.actionsEnabled || !this.onAction) return;
      this.onAction({ type: 'defend', strategy: this.selectedStrategy });
      this.setActionsEnabled(false);
      this.logSection.innerHTML = `<div class="combat-log-entry combat-log-waiting">Waiting on other players...</div>`;
    });
    actionRow.appendChild(defendBtn);

    // Run
    const runBtn = document.createElement('button');
    runBtn.className = 'combat-action-btn run';
    runBtn.textContent = 'Run';
    runBtn.addEventListener('click', () => {
      if (!this.actionsEnabled || !this.onAction) return;
      this.onAction({ type: 'run', strategy: this.selectedStrategy });
      this.setActionsEnabled(false);
      this.logSection.innerHTML = `<div class="combat-log-entry combat-log-waiting">Waiting on other players...</div>`;
    });
    actionRow.appendChild(runBtn);
  }

  setOnAction(cb: CombatActionCallback): void {
    this.onAction = cb;
  }

  setOnAuraToggle(cb: AuraToggleCallback): void {
    this.onAuraToggle = cb;
  }

  setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  setAvailableDamageTypes(types: PhysicalDamageType[]): void {
    const damageRow = this.overlay.querySelector('#combat-damage-row')!;
    damageRow.innerHTML = '';

    // If current selection isn't in the new list, switch to first available
    if (!types.includes(this.selectedDamageType)) {
      this.selectedDamageType = types[0] ?? 'bludgeoning';
    }

    for (const dt of types) {
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
  }

  show(state: CombatState, myPlayerId: string, equipment?: Equipment): void {
    this.overlay.style.display = 'flex';
    this.resultSection.style.display = 'none';
    this.controlsSection.style.display = '';
    this.isInPlayback = false;
    if (equipment) {
      this.setAvailableDamageTypes(getEquippedWeaponDamageTypes(equipment));
    }
    this.updateState(state, myPlayerId);
  }

  hide(): void {
    this.overlay.style.display = 'none';
    this.stopTimer();
    this.isInPlayback = false;
  }

  get isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  get inPlayback(): boolean {
    return this.isInPlayback;
  }

  setServerTimeOffset(offset: number): void {
    this.serverTimeOffset = offset;
  }

  // Called for state updates that have no log (action phase updates, ready status changes)
  updateState(state: CombatState, myPlayerId: string): void {
    if (this.isInPlayback) return; // don't clobber playback

    // Track my stats for resource checks
    this.currentMyStats = state.allies.find(a => a.id === myPlayerId) ?? null;

    // Round label
    const roundLabel = this.overlay.querySelector('#combat-round-label')!;
    roundLabel.textContent = `Combat \u2014 Round ${state.round}`;

    // Timer
    this.turnDeadline = state.turnDeadline;
    this.updateTimer();
    this.startTimer();

    // Render participants with their actual server HP
    this.renderParticipants(state, myPlayerId, null);

    // Log — show prompt based on action state
    const myAlly = this.currentMyStats;
    const amDead = myAlly ? !myAlly.alive : false;
    const awaiting = state.awaitingActionFrom.includes(myPlayerId);
    if (state.phase === 'awaiting_action') {
      if (amDead) {
        this.logSection.innerHTML = `<div class="combat-log-entry combat-log-incapacitated">You are incapacitated!</div>`;
      } else if (awaiting) {
        this.logSection.innerHTML = `<div class="combat-log-entry combat-log-prompt">Choose an action...</div>`;
      } else if (state.awaitingActionFrom.length > 0) {
        this.logSection.innerHTML = `<div class="combat-log-entry combat-log-waiting">Waiting on other players...</div>`;
      }
    }

    // Show/hide controls
    this.controlsSection.style.display = amDead ? 'none' : '';
    this.resultSection.style.display = 'none';
    this.updateResourceDisplay();
    this.setActionsEnabled(awaiting);
  }

  // Start playback of round results
  startPlayback(state: CombatState, myPlayerId: string, onComplete: () => void): void {
    this.isInPlayback = true;
    this.playbackState = state;
    this.playbackPlayerId = myPlayerId;
    this.playbackLog = [...state.log];
    this.playbackIndex = 0;
    this.onPlaybackComplete = onComplete;
    this.shownLogEntries = [];

    // Initialize displayed HP from pre-round snapshot
    this.displayedHp = { ...state.preRoundHp };

    // Round label (show the round this log belongs to)
    const roundLabel = this.overlay.querySelector('#combat-round-label')!;
    roundLabel.textContent = `Combat \u2014 Round ${state.round}`;

    // Hide timer during playback
    this.stopTimer();
    const timerEl = this.overlay.querySelector('#combat-timer')!;
    timerEl.textContent = '';

    // Hide action controls, show result section area for the Next button
    this.controlsSection.style.display = 'none';
    this.resultSection.style.display = 'none';

    // Render participants with pre-round HP
    this.renderParticipants(state, myPlayerId, this.displayedHp);

    // Show first entry immediately
    if (this.playbackLog.length > 0) {
      this.advancePlayback();
    } else {
      // No log entries, just finish
      this.finishPlayback();
    }
  }

  private advancePlayback(): void {
    if (!this.playbackState || !this.playbackPlayerId) return;

    const entry = this.playbackLog[this.playbackIndex];
    this.shownLogEntries.push(entry);

    // Apply this entry's damage to displayedHp
    if (entry.targetId && entry.damage > 0) {
      if (this.displayedHp[entry.targetId] !== undefined) {
        this.displayedHp[entry.targetId] = Math.max(0, this.displayedHp[entry.targetId] - entry.damage);
      }
    }

    // Re-render participants with updated displayed HP
    this.renderParticipants(this.playbackState, this.playbackPlayerId, this.displayedHp);

    // Render shown log entries + Next button
    this.renderPlaybackLog();
  }

  private renderPlaybackLog(): void {
    const entry = this.shownLogEntries[this.shownLogEntries.length - 1];
    let html = `<div class="combat-log-entry${entry.crit ? ' crit' : ''}${entry.dodged ? ' dodged' : ''}">${entry.message}</div>`;

    const hasMore = this.playbackIndex < this.playbackLog.length - 1;
    if (hasMore) {
      html += `<button id="combat-next-btn" class="combat-next-btn">Next</button>`;
    } else {
      html += `<button id="combat-next-btn" class="combat-next-btn">Continue</button>`;
    }

    this.logSection.innerHTML = html;
    this.logSection.scrollTop = this.logSection.scrollHeight;

    this.logSection.querySelector('#combat-next-btn')!.addEventListener('click', () => {
      this.playbackIndex++;
      if (this.playbackIndex < this.playbackLog.length) {
        this.advancePlayback();
      } else {
        this.finishPlayback();
      }
    });
  }

  private finishPlayback(): void {
    this.isInPlayback = false;
    this.playbackState = null;
    this.playbackPlayerId = null;
    const cb = this.onPlaybackComplete;
    this.onPlaybackComplete = null;
    if (cb) cb();
  }

  showResult(result: 'victory' | 'defeat' | 'fled', xp: number, loot: InventoryItem[], skillXPGained?: Record<string, number>): void {
    this.controlsSection.style.display = 'none';
    this.stopTimer();

    const message = result === 'victory' ? 'You are victorious!'
      : result === 'defeat' ? 'You were defeated...'
      : 'You fled from combat!';

    // Final message in the log area, no button
    this.logSection.innerHTML = `<div class="combat-log-entry">${message}</div>`;

    // Rewards and close button in the result section
    this.resultSection.style.display = '';
    let html = '';
    if (result === 'victory') {
      html += `<div class="combat-reward">+${xp} XP</div>`;
      if (loot.length > 0) {
        html += loot.map(l => `<div class="combat-reward">${l.itemType} x${l.quantity}</div>`).join('');
      }
    }
    if (skillXPGained) {
      for (const [skillId, amount] of Object.entries(skillXPGained)) {
        const def = SKILL_DEFS[skillId as CombatSkillId];
        if (def) {
          html += `<div class="combat-reward skill-xp">+${amount} ${def.name} XP</div>`;
        }
      }
    }
    html += `<button id="combat-close-btn" class="combat-action-btn">Close</button>`;
    this.resultSection.innerHTML = html;

    this.resultSection.querySelector('#combat-close-btn')!.addEventListener('click', () => {
      if (this.onClose) this.onClose();
      this.hide();
    });
  }

  // Unified participant renderer
  // If overrideHp is provided, use those values instead of participant.stats.hp
  private renderParticipants(
    state: CombatState,
    myPlayerId: string,
    overrideHp: Record<string, number> | null,
  ): void {
    this.enemySection.innerHTML = state.enemies
      .map(e => this.renderEnemyCard(e, overrideHp))
      .join('');

    this.allySection.innerHTML = state.allies
      .map(a => this.renderAllyCard(a, myPlayerId, state, overrideHp))
      .join('');
  }

  private renderEnemyCard(e: CombatParticipant, overrideHp: Record<string, number> | null): string {
    const hp = overrideHp !== null ? (overrideHp[e.id] ?? e.stats.hp) : e.stats.hp;
    const pct = Math.max(0, hp / e.stats.maxHp * 100);
    return `<div class="combat-card enemy">
      <div class="combat-card-name">${e.name}</div>
      <div class="combat-card-bar-row">
        <span class="combat-bar-label">HP</span>
        <div class="combat-bar-container">
          <div class="combat-bar hp" style="width:${pct}%"></div>
        </div>
        <span class="combat-bar-value">${hp}/${e.stats.maxHp}</span>
      </div>
    </div>`;
  }

  private renderAllyCard(
    a: CombatParticipant,
    myPlayerId: string,
    state: CombatState,
    overrideHp: Record<string, number> | null,
  ): string {
    const hp = overrideHp !== null ? (overrideHp[a.id] ?? a.stats.hp) : a.stats.hp;
    const hpPct = Math.max(0, hp / a.stats.maxHp * 100);
    const isMe = a.id === myPlayerId;

    let bars = `<div class="combat-card-bar-row">
        <span class="combat-bar-label">HP</span>
        <div class="combat-bar-container">
          <div class="combat-bar hp" style="width:${hpPct}%"></div>
        </div>
        <span class="combat-bar-value">${hp}/${a.stats.maxHp}</span>
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
    if (a.stats.maxEp > 0) {
      const epPct = Math.max(0, a.stats.ep / a.stats.maxEp * 100);
      bars += `<div class="combat-card-bar-row">
        <span class="combat-bar-label">EP</span>
        <div class="combat-bar-container ep-bar">
          <div class="combat-bar ep" style="width:${epPct}%"></div>
        </div>
        <span class="combat-bar-value">${a.stats.ep}/${a.stats.maxEp}</span>
      </div>`;
    }
    if (a.stats.maxKp > 0) {
      const kpPct = Math.max(0, a.stats.kp / a.stats.maxKp * 100);
      bars += `<div class="combat-card-bar-row">
        <span class="combat-bar-label">KP</span>
        <div class="combat-bar-container kp-bar">
          <div class="combat-bar kp" style="width:${kpPct}%"></div>
        </div>
        <span class="combat-bar-value">${a.stats.kp}/${a.stats.maxKp}</span>
      </div>`;
    }

    // Active aura indicators
    let auraHtml = '';
    if (a.activeAuras && a.activeAuras.length > 0) {
      const auraNames = a.activeAuras
        .map(id => AURA_DEFS[id as AuraId]?.name)
        .filter(Boolean);
      if (auraNames.length > 0) {
        auraHtml = `<div class="combat-aura-indicators">${auraNames.join(', ')}</div>`;
      }
    }

    // Ally status (only during awaiting_action, not during playback)
    let statusHtml = '';
    if (!this.isInPlayback && !isMe && state.phase === 'awaiting_action') {
      if (!a.alive) {
        statusHtml = `<div class="combat-ally-status incapacitated">Incapacitated!</div>`;
      } else {
        const isReady = state.readyPlayerIds.includes(a.id);
        if (isReady) {
          statusHtml = `<div class="combat-ally-status ready">Ready!</div>`;
        } else {
          statusHtml = `<div class="combat-ally-status deciding">Deciding next move...</div>`;
        }
      }
    }

    return `<div class="combat-card ally ${isMe ? 'me' : ''}">
      <div class="combat-card-name">${a.name}${isMe ? ' (You)' : ''}</div>
      ${bars}
      ${auraHtml}
      ${statusHtml}
    </div>`;
  }

  private setActionsEnabled(enabled: boolean): void {
    this.actionsEnabled = enabled;
    const btns = this.controlsSection.querySelectorAll('.combat-action-btn');
    btns.forEach(btn => {
      const el = btn as HTMLButtonElement;
      if (!enabled) {
        el.disabled = true;
        el.classList.add('disabled');
        return;
      }

      // Check resource costs for ability/spell buttons
      const abilityId = el.dataset.abilityId;
      const spellId = el.dataset.spellId;
      if (abilityId && this.currentMyStats) {
        const def = ABILITY_DEFS[abilityId as AbilityId];
        const canAfford = def && this.currentMyStats.stats.ep >= def.epCost;
        el.disabled = !canAfford;
        el.classList.toggle('disabled', !canAfford);
      } else if (spellId && this.currentMyStats) {
        const def = SPELL_DEFS[spellId as SpellId];
        const canAfford = def && this.currentMyStats.stats.mp >= def.mpCost;
        el.disabled = !canAfford;
        el.classList.toggle('disabled', !canAfford);
      } else {
        el.disabled = false;
        el.classList.remove('disabled');
      }
    });

    // Update aura buttons
    this.updateAuraButtons();
  }

  private updateAuraButtons(): void {
    const auraRow = this.overlay.querySelector('#combat-aura-row');
    if (!auraRow) return;
    const btns = auraRow.querySelectorAll('.combat-aura-btn');
    btns.forEach(btn => {
      const el = btn as HTMLButtonElement;
      const auraId = el.dataset.auraId;
      if (!auraId || !this.currentMyStats) return;

      const isActive = this.currentMyStats.activeAuras?.includes(auraId);
      el.classList.toggle('active', !!isActive);

      // Disable if not active and can't afford
      const def = AURA_DEFS[auraId as AuraId];
      if (!isActive && def && this.currentMyStats.stats.kp < def.kpCost) {
        el.disabled = true;
        el.classList.add('disabled');
      } else {
        el.disabled = false;
        el.classList.remove('disabled');
      }
    });
  }

  private updateResourceDisplay(): void {
    const el = this.overlay.querySelector('#combat-resource-display');
    if (!el || !this.currentMyStats) return;
    const s = this.currentMyStats.stats;
    el.innerHTML = `<span class="combat-resource ep">EP: ${s.ep}/${s.maxEp}</span> <span class="combat-resource mp">MP: ${s.mp}/${s.maxMp}</span> <span class="combat-resource kp">KP: ${s.kp}/${s.maxKp}</span>`;
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
    if (!this.turnDeadline || this.isInPlayback) {
      timerEl.textContent = '';
      return;
    }
    const now = Date.now() + this.serverTimeOffset;
    const remaining = Math.max(0, Math.ceil((this.turnDeadline - now) / 1000));
    timerEl.textContent = `${remaining}s`;
    timerEl.classList.toggle('combat-timer-urgent', remaining <= 5);
  }
}
