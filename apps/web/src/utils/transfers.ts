import { fmt } from './formatting';

/** Confirm + one-click sign a player at the given price, alerting on failure.
 *  Shared by every "Buy" action (Transfers list, scouted-player modals). */
export function buyPlayerWithConfirm(
  signPlayer: (playerId: string) => boolean,
  playerName: string,
  playerId: string,
  price: number,
): boolean {
  if (!confirm(`Sign ${playerName} for £${fmt(price)}?`)) { return false; }
  if (!signPlayer(playerId)) {
    alert('Transfer failed — insufficient budget or the window is closed.');
    return false;
  }
  return true;
}
