import type { Player, Team, CountryKey } from '@fm2k/engine';
import type { EditableCountry, EditableDivision } from './editable-country.ts';

export interface WorldDivision {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly countryId: CountryKey;
}

export interface WorldCountry {
  readonly id: CountryKey;
  readonly name: string;
  readonly nationality: string;
}

/**
 * The live, mutable game world: every club-owned player, team, division and country,
 * flat and id-linked — replacing the nested `EditableCountry[] -> divisions[] ->
 * teams[]` tree as the thing the session actually mutates during a game. `Team`
 * objects keep stable identity for their whole lifetime; `team.squad` is a view kept
 * in sync with `players` by this module's mutators, never hand-spliced by callers.
 *
 * Free agents are NOT tracked here — they live in `TransferManager`'s own pool
 * (`players` here only ever holds players with a real `clubId`).
 */
export interface World {
  readonly players: Map<string, Player & { clubId: string }>;
  readonly teams: Map<string, Team>;
  /** team id -> division id. The only thing promotion/relegation changes. */
  readonly teamDivision: Map<string, string>;
  readonly divisions: Map<string, WorldDivision>;
  readonly countries: Map<string, WorldCountry>;
}

function resyncSquad(world: World, teamId: string): void {
  const team = world.teams.get(teamId);
  if (!team) { return; }
  team.squad = [...world.players.values()].filter(p => p.clubId === teamId);
}

/** Build a fresh `World` from the nested editable-country tree (a brand-new game,
 *  a loaded save merged with defaults, or the pre-game team editor's current state). */
export function buildWorld(countries: EditableCountry[]): World {
  const players = new Map<string, Player & { clubId: string }>();
  const teams = new Map<string, Team>();
  const teamDivision = new Map<string, string>();
  const divisions = new Map<string, WorldDivision>();
  const worldCountries = new Map<string, WorldCountry>();

  for (const country of countries) {
    worldCountries.set(country.id, { id: country.id, name: country.name, nationality: country.nationality });
    for (const division of country.divisions) {
      divisions.set(division.id, {
        id: division.id, name: division.name, level: division.level, countryId: country.id,
      });
      for (const team of division.teams) {
        teams.set(team.id, team);
        teamDivision.set(team.id, division.id);
        for (const player of team.squad) {
          players.set(player.id, { ...player, clubId: team.id });
        }
      }
    }
  }

  return { players, teams, teamDivision, divisions, countries: worldCountries };
}

/** Project the World back into the nested `EditableCountry[]` shape the snapshot/
 *  pre-game-editor UI expects — derived fresh each call, never the stored truth. */
export function worldToEditableCountries(world: World): EditableCountry[] {
  return [...world.countries.values()].map(country => {
    const divisions: EditableDivision[] = [...world.divisions.values()]
      .filter(d => d.countryId === country.id)
      .sort((a, b) => a.level - b.level)
      .map(division => ({
        id: division.id,
        name: division.name,
        level: division.level,
        teams: [...world.teams.values()].filter(t => world.teamDivision.get(t.id) === division.id),
      }));
    return { id: country.id, name: country.name, nationality: country.nationality, divisions };
  });
}

// ── lookups ──────────────────────────────────────────────────────────────────────

export function teamById(world: World, teamId: string): Team | null {
  return world.teams.get(teamId) ?? null;
}

export function divisionForTeam(world: World, teamId: string): WorldDivision | null {
  const divisionId = world.teamDivision.get(teamId);
  return divisionId ? world.divisions.get(divisionId) ?? null : null;
}

export function countryForTeam(world: World, teamId: string): WorldCountry | null {
  const division = divisionForTeam(world, teamId);
  return division ? world.countries.get(division.countryId) ?? null : null;
}

export function teamsInDivision(world: World, divisionId: string): Team[] {
  return [...world.teams.values()].filter(t => world.teamDivision.get(t.id) === divisionId);
}

export function teamsInCountry(world: World, countryId: string): Team[] {
  const divisionIds = new Set(divisionsInCountry(world, countryId).map(d => d.id));
  return [...world.teams.values()].filter(t => {
    const divisionId = world.teamDivision.get(t.id);
    return divisionId !== undefined && divisionIds.has(divisionId);
  });
}

/** A country's divisions, ordered top (level 1) to bottom. */
export function divisionsInCountry(world: World, countryId: string): WorldDivision[] {
  return [...world.divisions.values()].filter(d => d.countryId === countryId).sort((a, b) => a.level - b.level);
}

// ── mutations ────────────────────────────────────────────────────────────────────

/** Remove a player from the world entirely (sold, poached) — resyncs their old
 *  team's squad. Returns the removed player (sans `clubId`), or null if not found. */
export function removePlayerFromWorld(world: World, playerId: string): Player | null {
  const player = world.players.get(playerId);
  if (!player) { return null; }
  const { clubId, ...rest } = player;
  world.players.delete(playerId);
  resyncSquad(world, clubId);
  return rest;
}

/** Add a player (new signing, youth replacement) to a team — resyncs that team's squad. */
export function addPlayerToWorld(world: World, player: Player, teamId: string): void {
  world.players.set(player.id, { ...player, clubId: teamId });
  resyncSquad(world, teamId);
}

/** Promotion/relegation: reassign which division a team belongs to. Squad untouched. */
export function moveTeamToDivision(world: World, teamId: string, divisionId: string): void {
  world.teamDivision.set(teamId, divisionId);
}

/** Wholesale-replace a team's squad (season churn, AI-market results, or mirroring the
 *  human club's own state) — drops the team's current player records and re-adds the
 *  given ones, all tagged with `teamId`. */
export function setTeamSquad(world: World, teamId: string, squad: Player[]): void {
  for (const [id, p] of world.players) {
    if (p.clubId === teamId) { world.players.delete(id); }
  }
  for (const player of squad) { world.players.set(player.id, { ...player, clubId: teamId }); }
  resyncSquad(world, teamId);
}

// ── save/load (flat round-trip) ───────────────────────────────────────────────────

export interface FlatWorld {
  players: (Player & { clubId: string })[];
  teams: Team[];
  teamDivision: Record<string, string>;
  divisions: WorldDivision[];
  countries: WorldCountry[];
}

/** Flatten a World (or the subset belonging to `countryIds`, if given) into plain
 *  arrays/records suitable for JSON storage. `Team.squad` is zeroed out in the result
 *  since the flat `players` array already carries that information (avoids storing it
 *  twice) — restore it with `worldFromFlat`. */
export function worldToFlat(world: World, countryIds?: Iterable<string>): FlatWorld {
  const keep = countryIds ? new Set(countryIds) : null;
  const countries = [...world.countries.values()].filter(c => !keep || keep.has(c.id));
  const divisions = [...world.divisions.values()].filter(d => !keep || keep.has(d.countryId));
  const divisionIds = new Set(divisions.map(d => d.id));
  const teams = [...world.teams.values()].filter(t => {
    const divisionId = world.teamDivision.get(t.id);
    return divisionId !== undefined && divisionIds.has(divisionId);
  });
  const teamIds = new Set(teams.map(t => t.id));
  const players = [...world.players.values()].filter(p => teamIds.has(p.clubId));
  const teamDivision: Record<string, string> = {};
  for (const t of teams) {
    const divisionId = world.teamDivision.get(t.id);
    if (divisionId) { teamDivision[t.id] = divisionId; }
  }
  return { players, teams: teams.map(t => ({ ...t, squad: [] })), teamDivision, divisions, countries };
}

/** Rebuild a World from flattened arrays (loading a save) — resyncs every team's
 *  squad from the flat `players` array since `teams[].squad` arrives empty. */
export function worldFromFlat(flat: FlatWorld): World {
  const players = new Map(flat.players.map(p => [p.id, p]));
  const teams = new Map(flat.teams.map(t => [t.id, t]));
  const world: World = {
    players,
    teams,
    teamDivision: new Map(Object.entries(flat.teamDivision)),
    divisions: new Map(flat.divisions.map(d => [d.id, d])),
    countries: new Map(flat.countries.map(c => [c.id, c])),
  };
  for (const teamId of teams.keys()) { resyncSquad(world, teamId); }
  return world;
}
