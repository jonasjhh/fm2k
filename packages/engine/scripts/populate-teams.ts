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

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  PlayerGenerator, COUNTRY_IDS, divisionOverallDistribution, divisionCategoryBias,
} from '../src/index.ts';
import type { PlayerPosition } from '../src/index.ts';
import type { CountryDivisionRow, CountryTeamRow } from '../src/index.ts';
import type { NameCountry, CountryKey } from '@fm2k/names';

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

interface PlayerJson {
  id: string;
  name: string;
  clubId: string;
  nationality: string;
  age: number;
  position: string;
  potential: number;
  attributes: Record<string, number>;
}

function buildPlayer(
  generator: PlayerGenerator,
  position: PlayerPosition,
  divisionLevel: number,
  nationalityKey: CountryKey,
  nationality: string,
  clubId: string,
): PlayerJson {
  const overallDistribution = divisionOverallDistribution(nationalityKey, divisionLevel);
  const categoryBias = divisionCategoryBias(divisionLevel);
  const player = generator.generatePlayer(position, { overallDistribution, categoryBias });

  return {
    id: player.id,
    name: player.name,
    clubId,
    nationality,
    age: player.age,
    position,
    potential: player.potential,
    attributes: player.attributes,
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

  const players: PlayerJson[] = [];
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

  writeFileSync(join(countryDir, 'players.json'), JSON.stringify(players, null, 2) + '\n');
  console.log(`✓ Wrote ${countryId}/players.json\n`);
}

console.log(`Done. Populated ${totalTeams} teams with ${SQUAD_POSITIONS.length} players each.`);
