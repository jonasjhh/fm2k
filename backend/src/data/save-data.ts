import localforage from 'localforage';
import type {
  LeagueState, CompetitionState, ClubState, TransferListing, Player, GameDateTime,
} from '@fm2k/engine';
import type { FlatWorld } from '../domain/world.ts';
import type { LastMatchResult } from '../domain/match-result.ts';

localforage.config({ name: 'fm2k', storeName: 'saves' });

export type SaveType = 'QUICK' | 'AUTO';

// Bump SAVE_VERSION whenever the save format changes.
// Bump MIN_LOADABLE_VERSION only when old saves can no longer be safely migrated.
// v4 added `cupStates` (national cup per nation). v5 added `now` (the game clock).
// v6 added `clubState.tactics` (manager intent: style + sliders).
// v7 added `clubPlayer.training` (per-player training regiment).
// v8 added `transferFreeAgents` (the shared free-agent pool behind the transfer market).
// v9 collapsed Team's starters/substitutes split into a single `squad` — the starting XI
// is no longer persisted on Team at all, so old saves can't be migrated (MIN bumped too).
// v10 added `clubState.recentDevelopment` (last season's per-player attribute deltas).
// v11 added `clubState.seasonStartSnapshot` (baseline `recentDevelopment` is diffed against).
// v12 flattened `editableCountries` into `players`/`teams`/`teamDivision`/`divisions`/
// `countries` (mirroring the runtime `World` model) and dropped the hand-rolled pack/
// unpack codec — old saves can't be migrated (MIN bumped too).
// v13 reshaped PlayerAttributes from 10 to 8 (dropped agility/awareness/composure, added
// keeping — REWORK_01.md Step 2) and removed the 'mentality' training regiment; attributes
// persist per-field, so old saves can't be migrated (MIN bumped too).
// v14 added `transferFreeAgentAvailability` (per-free-agent AI pickup-delay dates; optional,
// so v13 saves still load — a missing map just means every free agent is AI-visible).
export const SAVE_VERSION = 14;
export const MIN_LOADABLE_VERSION = 13;

export type SaveCompatibility = 'ok' | 'outdated' | 'incompatible';

export function checkSaveCompatibility(save: SaveData): SaveCompatibility {
  if (save.version > SAVE_VERSION) {return 'incompatible';}
  if (save.version < MIN_LOADABLE_VERSION) {return 'incompatible';}
  if (save.version < SAVE_VERSION) {return 'outdated';}
  return 'ok';
}

export interface SaveData extends FlatWorld {
  version: number;
  type: SaveType;
  savedAt: string;
  teamName: string;
  matchday: number;
  playerTeamId: string;
  selectedLeagueIds?: string[];
  currentMatchday: number;
  seasonComplete: boolean;
  /** The game clock at save time (snapped to a round boundary). */
  now?: GameDateTime;
  activeTab: string;
  lastMatchResult: LastMatchResult | null;
  leagueState: LeagueState;
  leagueStates?: Record<string, LeagueState>;
  cupStates?: Record<string, CompetitionState>;
  clubState: ClubState;
  transferListings: TransferListing[];
  /** The shared free-agent pool behind the market (sold/released players + churn youth). */
  transferFreeAgents?: Player[];
  /** Calendar date each pooled free agent becomes visible to AI clubs (pickup-delay drip). */
  transferFreeAgentAvailability?: Record<string, GameDateTime>;
}

export function saveKey(type: SaveType, teamName: string): string {
  return `fm2k-${type}-${teamName}`;
}

// ── public async API ──────────────────────────────────────────────────────────

export async function writeSave(data: SaveData): Promise<void> {
  await localforage.setItem(saveKey(data.type, data.teamName), data);
}

export async function deleteSave(type: SaveType, teamName: string): Promise<void> {
  await localforage.removeItem(saveKey(type, teamName));
}

export async function readAllSaves(): Promise<SaveData[]> {
  const keys = await localforage.keys();
  const saveKeys = keys.filter(k => k.startsWith('fm2k-QUICK-') || k.startsWith('fm2k-AUTO-'));
  const stored = await Promise.all(saveKeys.map(k => localforage.getItem<SaveData>(k)));
  return stored
    .filter((s): s is SaveData => s !== null)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
