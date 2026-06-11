import type { LeagueState, ClubState, TransferListing } from '@fm2k/engine';
import type { EditableCountry, LastMatchResult } from './game-store';

export type SaveType = 'QUICK' | 'AUTO';

// Bump SAVE_VERSION whenever the save format changes.
// Bump MIN_LOADABLE_VERSION only when old saves can no longer be safely migrated.
export const SAVE_VERSION = 2;
export const MIN_LOADABLE_VERSION = 1;

export type SaveCompatibility = 'ok' | 'outdated' | 'incompatible';

export function checkSaveCompatibility(save: SaveData): SaveCompatibility {
  if (save.version > SAVE_VERSION) return 'incompatible'; // written by a newer build
  if (save.version < MIN_LOADABLE_VERSION) return 'incompatible';
  if (save.version < SAVE_VERSION) return 'outdated';
  return 'ok';
}

export interface SaveData {
  version: number;
  type: SaveType;
  savedAt: string;
  teamName: string;
  matchday: number;
  playerTeamId: string;
  selectedLeagueIds?: string[];
  editableCountries: EditableCountry[];
  currentMatchday: number;
  seasonComplete: boolean;
  activeTab: string;
  lastMatchResult: LastMatchResult | null;
  leagueState: LeagueState;
  leagueStates?: Record<string, LeagueState>;
  clubState: ClubState;
  transferListings: TransferListing[];
}

export function saveKey(type: SaveType, teamName: string): string {
  return `fm2k-${type}-${teamName}`;
}

export function writeSave(data: SaveData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(saveKey(data.type, data.teamName), JSON.stringify(data));
}

export function deleteSave(type: SaveType, teamName: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(saveKey(type, teamName));
}

export function readAllSaves(): SaveData[] {
  if (typeof window === 'undefined') return [];
  const saves: SaveData[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('fm2k-QUICK-') && !key?.startsWith('fm2k-AUTO-')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key)!) as SaveData;
      saves.push(data);
    } catch { /* skip corrupt entries */ }
  }
  return saves.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
