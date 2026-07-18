/**
 * Populates every team in every country with 25 generated female players,
 * replacing that country's `players.json` wholesale. Players are nationality-
 * and division-appropriate.
 *
 * Usage:
 *   pnpm --filter @fm2k/engine populate-teams
 *
 * Safe to re-run — regenerates all players from scratch each time.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { PlayerGenerator, sampleNormal } from '@fm2k/players';
import {
  divisionOverallDistribution, divisionCategoryBias, ageOverallBump, starBonus,
} from '../src/player/generation-profile.ts';
import { attrToJson } from '../src/data/country-data.ts';
import type { CountryDivisionRow, CountryTeamRow, CountryPlayerRow } from '../src/data/country-data.ts';
import type { PlayerPosition } from '@fm2k/match';
import type { NameCountry, CountryKey } from '@fm2k/names';

// Deliberately not imported from `../src/index.ts`/`teams-data.ts`: that barrel eagerly loads and
// parses every country's real `players.json` at import time (`DIVISION_TEAMS`), so it can't be
// relied on by the very script that (re)generates that data — this script bypasses it entirely.
const COUNTRY_IDS: readonly CountryKey[] = [
  'norway', 'england', 'germany', 'france', 'spain', 'italy', 'sweden', 'denmark',
];

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/data');

// ── 25-player position layout ─────────────────────────────────────────────────
// First 11 = 4-4-2 starters, remaining 14 = squad depth

const SQUAD_POSITIONS: PlayerPosition[] = [
  // starters — 4-4-2
  'GK',
  'LB', 'CB', 'CB', 'RB',
  'LM', 'CM', 'CM', 'RM',
  'ST', 'ST',
  // substitutes
  'GK',
  'CB', 'LB', 'RB',
  'CM', 'CM',
  'CM', 'CM',
  'LW', 'RW',
  'ST', 'ST', 'ST',
  'CM',
];

// ── player builder ────────────────────────────────────────────────────────────

function buildPlayer(
  generator: PlayerGenerator,
  position: PlayerPosition,
  divisionLevel: number,
  nationalityKey: CountryKey,
  nationality: string,
  clubId: string,
): CountryPlayerRow {
  // Age is sampled first so the career curve can shape the target overall: youngsters
  // arrive raw, prime-age veterans brush 70+, and the top flight gets its very rare
  // 85+ star. Builds sample freely from trait space (no archetype preset), so the
  // player mass shows continuous archetype clusters instead of uniform classes.
  const age = 17 + Math.floor(Math.random() * 19);
  const dist = divisionOverallDistribution(nationalityKey, divisionLevel);
  const overall = Math.round(
    sampleNormal(dist, Math.random) + ageOverallBump(age) + starBonus(divisionLevel, Math.random),
  );
  const categoryBias = divisionCategoryBias(divisionLevel);
  const player = generator.generatePlayer(position, { overall, age, categoryBias });

  return {
    id: player.id,
    name: player.name,
    clubId,
    nationality,
    age: player.age,
    pos: position,
    pot: player.potential,
    attr: attrToJson(player.attributes),
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

let totalTeams = 0;

for (const countryId of COUNTRY_IDS) {
  const countryDir = join(DATA_DIR, countryId);
  const meta = JSON.parse(readFileSync(join(countryDir, 'meta.json'), 'utf-8'));
  const divisions: CountryDivisionRow[] = JSON.parse(readFileSync(join(countryDir, 'divisions.json'), 'utf-8'));
  const teams: CountryTeamRow[] = JSON.parse(readFileSync(join(countryDir, 'teams.json'), 'utf-8'));
  const generator = new PlayerGenerator('female', countryId as NameCountry);

  const players: CountryPlayerRow[] = [];
  for (const division of divisions) {
    const dist = divisionOverallDistribution(countryId as CountryKey, division.level);
    const divisionTeams = teams.filter(t => t.divisionId === division.id);
    for (const team of divisionTeams) {
      for (const pos of SQUAD_POSITIONS) {
        players.push(buildPlayer(generator, pos, division.level, countryId as CountryKey, meta.nationality, team.id));
      }
      totalTeams++;
    }
    console.log(`  ${meta.country} · ${division.name} (L${division.level}, ~${dist.mean} OVR) — ${divisionTeams.length} teams`);
  }

  const playersPath = join(countryDir, 'players.json');
  if (existsSync(playersPath)) { unlinkSync(playersPath); }
  writeFileSync(playersPath, JSON.stringify(players, null, 2) + '\n');
  console.log(`✓ Wrote ${countryId}/players.json\n`);
}

console.log(`Done. Populated ${totalTeams} teams with ${SQUAD_POSITIONS.length} players each.`);
