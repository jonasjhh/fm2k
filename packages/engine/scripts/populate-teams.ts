/**
 * Populates every team in every country JSON with 25 generated female players.
 * Players are nationality- and division-appropriate.
 *
 * Usage:
 *   pnpm --filter @fm2k/engine populate-teams
 *
 * Safe to re-run — regenerates all players from scratch each time.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { PlayerGenerator, COUNTRY_IDS, calculateOverall } from '../src/index.ts';
import type { PlayerPosition, PlayerAttributes } from '../src/index.ts';
import type { NameCountry } from '@fm2k/names';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/data');

// ── skill scaling (mirrors generate-players.ts) ───────────────────────────────

const NATION_BASE_OVR: Record<string, number> = {
  england: 72,
  spain:   72,
  germany: 71,
  france:  71,
  italy:   70,
  norway:  63,
  sweden:  63,
  denmark: 62,
};
const DIVISION_PENALTY = 9;

function targetOvr(nationality: string, divisionLevel: number): number {
  const base = NATION_BASE_OVR[nationality] ?? 60;
  return Math.max(40, base - (divisionLevel - 1) * DIVISION_PENALTY);
}

function scaleAttributes(attrs: PlayerAttributes, targetOverall: number): PlayerAttributes {
  const current = calculateOverall(attrs);
  const variance = (Math.random() - 0.5) * 8;
  const adjusted = Math.max(40, Math.min(95, targetOverall + variance));
  const scale = adjusted / (current * 5);
  const result: PlayerAttributes = { ...attrs };
  for (const key of Object.keys(attrs) as (keyof PlayerAttributes)[]) {
    result[key] = Math.max(40, Math.min(99, Math.round(attrs[key] * scale * 5)));
  }
  return result;
}

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
  nationality: string;
  age: number;
  position: string;
  potential: number;
  attributes: Record<string, number>;
}

function buildPlayer(
  generator: PlayerGenerator,
  position: PlayerPosition,
  ovr: number,
  nationality: string,
): PlayerJson {
  const raw = generator.generatePlayer(position, 1, 20);
  const scaledAttrs = scaleAttributes(raw.attributes, ovr);
  const scaledOvr = Math.round(calculateOverall(scaledAttrs));
  const potential = Math.min(99, scaledOvr + Math.floor(Math.random() * 15));

  return {
    id: raw.id,
    name: raw.name,
    nationality,
    age: raw.age,
    position,
    potential,
    attributes: scaledAttrs,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

let totalTeams = 0;

for (const countryId of COUNTRY_IDS) {
  const filePath = join(DATA_DIR, `${countryId}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const generator = new PlayerGenerator('female', countryId as NameCountry);

  for (const division of data.divisions) {
    const ovr = targetOvr(countryId, division.level);
    for (const team of division.teams) {
      team.players = SQUAD_POSITIONS.map(pos =>
        buildPlayer(generator, pos, ovr, data.nationality),
      );
      totalTeams++;
    }
    console.log(`  ${data.country} · ${division.name} (L${division.level}, ~${ovr} OVR) — ${division.teams.length} teams`);
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ Wrote ${countryId}.json\n`);
}

console.log(`Done. Populated ${totalTeams} teams with ${SQUAD_POSITIONS.length} players each.`);
