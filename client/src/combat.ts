import type { CombatState, ServerMessage, InventoryItem } from 'shared';
import { CombatUI } from './combat-ui';
import type { Network } from './network';

export class Combat {
  private ui: CombatUI;
  private network: Network;
  private currentCombatId: string | null = null;
  private myPlayerId: string | null = null;

  // Queued messages that arrive during playback
  private pendingUpdate: { state: CombatState } | null = null;
  private pendingEnd: { state: CombatState; result: 'victory' | 'defeat' | 'fled'; xp: number; loot: InventoryItem[] } | null = null;

  constructor(network: Network) {
    this.network = network;
    this.ui = new CombatUI();

    this.ui.setOnAction((action) => {
      if (!this.currentCombatId) return;
      this.network.send({
        type: 'COMBAT_ACTION',
        combatId: this.currentCombatId,
        action,
      });
    });
  }

  get inCombat(): boolean {
    return this.currentCombatId !== null;
  }

  setPlayerId(id: string): void {
    this.myPlayerId = id;
  }

  handleMessage(msg: ServerMessage): boolean {
    switch (msg.type) {
      case 'COMBAT_START':
        this.currentCombatId = msg.state.combatId;
        this.pendingUpdate = null;
        this.pendingEnd = null;
        this.ui.show(msg.state, this.myPlayerId!);
        return true;

      case 'COMBAT_UPDATE':
        if (!this.currentCombatId) return true;

        if (this.ui.inPlayback) {
          // Queue — will be processed after current playback finishes
          this.pendingUpdate = { state: msg.state };
          return true;
        }

        if (msg.state.log.length > 0) {
          // Round results arrived — start playback
          this.ui.startPlayback(msg.state, this.myPlayerId!, () => {
            this.onPlaybackDone(msg.state);
          });
        } else {
          // No log (e.g. ready status update during action phase)
          this.ui.updateState(msg.state, this.myPlayerId!);
        }
        return true;

      case 'COMBAT_END':
        if (this.ui.inPlayback) {
          // Queue the end — will show after current playback
          this.pendingEnd = { state: msg.state, result: msg.result, xp: msg.xpGained, loot: msg.loot };
          return true;
        }

        if (msg.state.log.length > 0) {
          // Play through the final round's log, then show result
          this.pendingEnd = { state: msg.state, result: msg.result, xp: msg.xpGained, loot: msg.loot };
          this.ui.startPlayback(msg.state, this.myPlayerId!, () => {
            this.onPlaybackDone(msg.state);
          });
        } else {
          this.ui.updateState(msg.state, this.myPlayerId!);
          this.ui.showResult(msg.result, msg.xpGained, msg.loot);
          this.currentCombatId = null;
        }
        return true;

      default:
        return false;
    }
  }

  private onPlaybackDone(playedState: CombatState): void {
    // Check if there's a pending end (combat over)
    if (this.pendingEnd) {
      const end = this.pendingEnd;
      this.pendingEnd = null;
      this.pendingUpdate = null;

      // If the end has a different log than what we just played, play it too
      if (end.state.combatId === playedState.combatId && end.state.log.length > 0 && end.state !== playedState) {
        this.ui.startPlayback(end.state, this.myPlayerId!, () => {
          this.ui.updateState(end.state, this.myPlayerId!);
          this.ui.showResult(end.result, end.xp, end.loot);
          this.currentCombatId = null;
        });
      } else {
        this.ui.updateState(end.state, this.myPlayerId!);
        this.ui.showResult(end.result, end.xp, end.loot);
        this.currentCombatId = null;
      }
      return;
    }

    // Check if there's a pending update (next round arrived while playing)
    if (this.pendingUpdate) {
      const update = this.pendingUpdate;
      this.pendingUpdate = null;

      if (update.state.log.length > 0) {
        this.ui.startPlayback(update.state, this.myPlayerId!, () => {
          this.onPlaybackDone(update.state);
        });
      } else {
        this.ui.updateState(update.state, this.myPlayerId!);
      }
      return;
    }

    // No queued messages — show the post-round state (next round's awaiting_action)
    this.ui.updateState(playedState, this.myPlayerId!);
  }
}
