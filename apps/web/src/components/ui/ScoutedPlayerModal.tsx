'use client';
import Button from '@mui/material/Button';
import type { Player } from '@fm2k/engine';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/game-store';
import { fmt } from '../../utils/formatting';
import { buyPlayerWithConfirm } from '../../utils/transfers';
import PlayerDetailModal from './PlayerDetailModal';

interface Props {
  squad: Player[];
  playerId: string | null;
  onClose: () => void;
  teamId: string;
  /** Own-club players are never buyable and never shown with a Buy action. */
  isOwnTeam: boolean;
}

/** Read-only "scouting" view of a player from any club: never exposes training or selling,
 *  but offers a one-click Buy at the club's asking price when the player belongs to another club.
 *  Shared by TeamLineupDialog and TeamSquadDialog so the buy flow only lives in one place. */
export default function ScoutedPlayerModal({ squad, playerId, onClose, teamId, isOwnTeam }: Props) {
  const { clubState, transferWindow, signPlayer, getAskingPrice } = useGameStore(useShallow(s => ({
    clubState: s.clubState,
    transferWindow: s.transferWindow,
    signPlayer: s.signPlayer,
    getAskingPrice: s.getAskingPrice,
  })));

  const player = playerId ? squad.find(p => p.id === playerId) ?? null : null;
  const price = (!isOwnTeam && player) ? getAskingPrice(teamId, player.id) : null;
  const canAfford = price !== null && (clubState?.budget ?? 0) >= price;

  const handleBuy = () => {
    if (!player || price === null) { return; }
    if (buyPlayerWithConfirm(signPlayer, player.name, player.id, price)) { onClose(); }
  };

  return (
    <PlayerDetailModal
      player={player}
      onClose={onClose}
      actions={
        price !== null && (
          <Button variant="contained" disabled={!transferWindow.open || !canAfford} onClick={handleBuy}>
            {!transferWindow.open ? 'Window closed' : !canAfford ? 'Cannot afford' : `Buy · £${fmt(price)}`}
          </Button>
        )
      }
    />
  );
}
