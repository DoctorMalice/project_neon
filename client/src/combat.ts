import type { CombatState, ServerMessage, InventoryItem } from 'shared';
import { CombatUI } from './combat-ui';
import type { Network } from './network';

export class Combat {
  private ui: CombatUI;
  private network: Network;
  private currentCombatId: string | null = null;
  private myPlayerId: string | null = null;

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
        this.ui.show(msg.state, this.myPlayerId!);
        return true;

      case 'COMBAT_UPDATE':
        if (this.currentCombatId) {
          this.ui.updateState(msg.state, this.myPlayerId!);
        }
        return true;

      case 'COMBAT_END':
        this.ui.updateState(msg.state, this.myPlayerId!);
        this.ui.showResult(msg.result, msg.xpGained, msg.loot);
        this.currentCombatId = null;
        return true;

      default:
        return false;
    }
  }
}
