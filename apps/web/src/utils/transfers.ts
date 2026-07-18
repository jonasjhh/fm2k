import { useCallback } from 'react';
import { useConfirm, useAlert } from '@fm2k/design-system';
import { fmt } from './formatting';

/** Confirm + one-click sign a player at the given price, alerting on failure via the
 *  app's themed confirm/alert modals. Shared by every "Buy" action (Transfers list,
 *  scouted-player modals). */
export function useBuyPlayerWithConfirm(): (
  signPlayer: (playerId: string) => boolean,
  playerName: string,
  playerId: string,
  price: number,
) => Promise<boolean> {
  const confirm = useConfirm();
  const alert = useAlert();
  return useCallback(async (signPlayer, playerName, playerId, price) => {
    const ok = await confirm({
      title: 'Sign player',
      message: `Sign ${playerName} for £${fmt(price)}?`,
      confirmLabel: 'Sign',
    });
    if (!ok) { return false; }
    if (!signPlayer(playerId)) {
      await alert({ message: 'Transfer failed — insufficient budget or the window is closed.' });
      return false;
    }
    return true;
  }, [confirm, alert]);
}
