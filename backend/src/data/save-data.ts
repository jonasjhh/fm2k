import localforage from 'localforage';
import type {
  LeagueState, CompetitionState, ClubState, TransferListing,
  Player, ClubPlayer, PlayerAttributes, Team, Formation, PlayerPosition, TeamTactics,
  CountryKey, GameDateTime, RegimentId,
} from '@fm2k/engine';
import type { EditableCountry } from '../domain/editable-country.ts';
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
export const SAVE_VERSION = 11;
export const MIN_LOADABLE_VERSION = 9;

export type SaveCompatibility = 'ok' | 'outdated' | 'incompatible';

export function checkSaveCompatibility(save: SaveData): SaveCompatibility {
  if (save.version > SAVE_VERSION) {return 'incompatible';}
  if (save.version < MIN_LOADABLE_VERSION) {return 'incompatible';}
  if (save.version < SAVE_VERSION) {return 'outdated';}
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
}

export function saveKey(type: SaveType, teamName: string): string {
  return `fm2k-${type}-${teamName}`;
}

// ── compact player codec ──────────────────────────────────────────────────────
// Attributes stored as a fixed-order tuple instead of a named object, and
// top-level player keys are shortened. This roughly halves per-player storage.

// [speed, strength, agility, passing, finishing, technique, defending, stamina, awareness, composure]
type AttrPack = [number, number, number, number, number, number, number, number, number, number];

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'agility', 'passing', 'finishing',
  'technique', 'defending', 'stamina', 'awareness', 'composure',
];

interface PlayerPack { id: string; n: string; nat: string; a: number; pos: string; pot: number; at: AttrPack; }
interface ClubPlayerPack extends PlayerPack { fi: number; inj?: { t: string; mr: number }; sus?: { mr: number }; tr?: RegimentId; }

interface PackedTeam {
  id: string; name: string; f: string;
  q: PlayerPack[];
  col: { primary: string; secondary: string };
  tac?: TeamTactics;
}
interface PackedDivision { id: string; name: string; level: number; teams: PackedTeam[]; }
interface PackedCountry { id: string; name: string; nationality: string; divisions: PackedDivision[]; }

interface StoredSave extends Omit<SaveData, 'editableCountries' | 'clubState' | 'transferListings' | 'transferFreeAgents'> {
  editableCountries: PackedCountry[];
  clubState: Omit<ClubState, 'squad'> & { squad: ClubPlayerPack[] };
  transferListings: (Omit<TransferListing, 'player'> & { player: ClubPlayerPack })[];
  transferFreeAgents?: PlayerPack[];
}

function packAttrs(a: PlayerAttributes): AttrPack {
  return ATTR_KEYS.map(k => a[k]) as unknown as AttrPack;
}

function unpackAttrs(at: AttrPack): PlayerAttributes {
  return Object.fromEntries(ATTR_KEYS.map((k, i) => [k, at[i]])) as unknown as PlayerAttributes;
}

function packPlayer(p: Player): PlayerPack {
  return { id: p.id, n: p.name, nat: p.nationality, a: p.age, pos: p.position, pot: p.potential, at: packAttrs(p.attributes) };
}

function unpackPlayer(p: PlayerPack): Player {
  return { id: p.id, name: p.n, nationality: p.nat, age: p.a, position: p.pos as PlayerPosition, potential: p.pot, attributes: unpackAttrs(p.at) };
}

function packClubPlayer(p: ClubPlayer): ClubPlayerPack {
  const packed: ClubPlayerPack = { ...packPlayer(p), fi: p.fitness };
  if (p.injury) {packed.inj = { t: p.injury.type, mr: p.injury.matchesRemaining };}
  if (p.suspension) {packed.sus = { mr: p.suspension.matchesRemaining };}
  if (p.training) {packed.tr = p.training;}
  return packed;
}

function unpackClubPlayer(p: ClubPlayerPack): ClubPlayer {
  return {
    ...unpackPlayer(p),
    fitness: p.fi,
    injury: p.inj ? { type: p.inj.t, matchesRemaining: p.inj.mr } : undefined,
    suspension: p.sus ? { matchesRemaining: p.sus.mr } : undefined,
    // Preserved as-is; older saves (no per-player regiment) leave it unset and the
    // consumer (ClubManager / UI) falls back to DEFAULT_REGIMENT.
    training: p.tr,
  };
}

function packTeam(t: Team): PackedTeam {
  return {
    id: t.id, name: t.name, f: t.formation,
    q: t.squad.map(packPlayer),
    col: t.colors,
    ...(t.tactics && { tac: t.tactics }),
  };
}

function unpackTeam(t: PackedTeam): Team {
  return {
    id: t.id, name: t.name, formation: t.f as Formation,
    squad: t.q.map(unpackPlayer),
    colors: t.col,
    ...(t.tac && { tactics: t.tac }),
  };
}

function packCountry(c: EditableCountry): PackedCountry {
  return {
    id: c.id, name: c.name, nationality: c.nationality,
    divisions: c.divisions.map(d => ({
      id: d.id, name: d.name, level: d.level,
      teams: d.teams.map(packTeam),
    })),
  };
}

function unpackCountry(c: PackedCountry): EditableCountry {
  return {
    id: c.id as CountryKey, name: c.name, nationality: c.nationality,
    divisions: c.divisions.map(d => ({
      id: d.id, name: d.name, level: d.level,
      teams: d.teams.map(unpackTeam),
    })),
  };
}

function packSave(data: SaveData): StoredSave {
  return {
    ...data,
    editableCountries: data.editableCountries.map(packCountry),
    clubState: { ...data.clubState, squad: data.clubState.squad.map(packClubPlayer) },
    transferListings: data.transferListings.map(l => ({ ...l, player: packClubPlayer(l.player) })),
    transferFreeAgents: data.transferFreeAgents?.map(packPlayer),
  };
}

function unpackSave(stored: StoredSave): SaveData {
  return {
    ...stored,
    editableCountries: stored.editableCountries.map(unpackCountry),
    clubState: { ...stored.clubState, squad: stored.clubState.squad.map(unpackClubPlayer) },
    transferListings: stored.transferListings.map(l => ({ ...l, player: unpackClubPlayer(l.player) })),
    transferFreeAgents: stored.transferFreeAgents?.map(unpackPlayer),
  };
}

// ── public async API ──────────────────────────────────────────────────────────

export async function writeSave(data: SaveData): Promise<void> {
  await localforage.setItem(saveKey(data.type, data.teamName), packSave(data));
}

export async function deleteSave(type: SaveType, teamName: string): Promise<void> {
  await localforage.removeItem(saveKey(type, teamName));
}

export async function readAllSaves(): Promise<SaveData[]> {
  const keys = await localforage.keys();
  const saveKeys = keys.filter(k => k.startsWith('fm2k-QUICK-') || k.startsWith('fm2k-AUTO-'));
  const stored = await Promise.all(saveKeys.map(k => localforage.getItem<StoredSave>(k)));
  return stored
    .filter((s): s is StoredSave => s !== null)
    .map(unpackSave)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
