#!/usr/bin/env node
/**
 * Generate players for a given nationality, gender, and division level.
 *
 * Usage:
 *   pnpm --filter @fm2k/engine generate-players -- [options]
 *
 * Options:
 *   --nationality <id>    Country id: norway, england, germany, france, spain, italy, sweden, denmark  (default: norway)
 *   --gender <g>          male | female | all  (default: female)
 *   --division <level>    Division level 1–3, where 1 is top flight  (default: 1)
 *   --count <n>           Number of players to generate  (default: 25)
 *   --format <f>          table | json  (default: table)
 *
 * Examples:
 *   pnpm --filter @fm2k/engine generate-players -- --nationality england --division 1 --count 30
 *   pnpm --filter @fm2k/engine generate-players -- --nationality norway --division 2 --format json
 */

import {
  PlayerGenerator, COUNTRY_IDS, COUNTRY_DATA, calculateOverall,
  divisionOverallDistribution, divisionCategoryBias,
} from '../src/index.ts';
import type { PlayerPosition } from '../src/index.ts';
import type { Gender, NameCountry, CountryKey } from '@fm2k/names';

// ── position pool ─────────────────────────────────────────────────────────────
// A realistic squad shape; repeated as needed when count > pool size.

const POSITION_POOL: PlayerPosition[] = [
  'GK',
  'CB', 'CB', 'LB', 'RB',
  'CM', 'CM', 'CM', 'CM',
  'LM', 'RM',
  'LW', 'RW',
  'ST', 'ST', 'ST',
  // second rotation for larger squads
  'GK',
  'CB', 'LB', 'RB',
  'CM', 'CM', 'CM',
  'LW', 'RW',
  'ST',
];

// ── helpers ───────────────────────────────────────────────────────────────────

function parseArgs(): {
  nationality: string;
  gender: Gender;
  divisionLevel: number;
  count: number;
  format: 'table' | 'json';
} {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const nationality = get('--nationality', 'norway');
  const gender = get('--gender', 'female') as Gender;
  const divisionLevel = parseInt(get('--division', '1'), 10);
  const count = parseInt(get('--count', '25'), 10);
  const format = get('--format', 'table') as 'table' | 'json';

  if (!COUNTRY_IDS.includes(nationality as never)) {
    console.error(`Unknown nationality "${nationality}". Valid options: ${COUNTRY_IDS.join(', ')}`);
    process.exit(1);
  }
  if (!['male', 'female', 'all'].includes(gender)) {
    console.error(`Invalid gender "${gender}". Use: male, female, all`);
    process.exit(1);
  }
  if (divisionLevel < 1 || divisionLevel > 3 || Number.isNaN(divisionLevel)) {
    console.error('Division level must be 1, 2, or 3.');
    process.exit(1);
  }
  if (count < 1 || count > 500 || Number.isNaN(count)) {
    console.error('Count must be between 1 and 500.');
    process.exit(1);
  }

  return { nationality, gender, divisionLevel, count, format };
}

function divisionName(nationality: string, level: number): string {
  const country = COUNTRY_DATA[nationality as keyof typeof COUNTRY_DATA];
  return country?.divisions.find(d => d.level === level)?.name ?? `Division ${level}`;
}

function positionAt(index: number): PlayerPosition {
  return POSITION_POOL[index % POSITION_POOL.length];
}

// ── output ────────────────────────────────────────────────────────────────────

function renderTable(rows: ReturnType<typeof buildRow>[], nationality: string, divLevel: number): void {
  const header = [
    'Name'.padEnd(24),
    'Age'.padStart(3),
    'Pos'.padEnd(4),
    'OVR'.padStart(3),
    'Spd'.padStart(3),
    'Str'.padStart(3),
    'Agi'.padStart(3),
    'Pas'.padStart(3),
    'Fin'.padStart(3),
    'Tec'.padStart(3),
    'Def'.padStart(3),
    'Sta'.padStart(3),
    'Awa'.padStart(3),
    'Com'.padStart(3),
  ].join('  ');

  const div = divisionName(nationality, divLevel);
  const countryName = COUNTRY_DATA[nationality as keyof typeof COUNTRY_DATA]?.country ?? nationality;
  const dist = divisionOverallDistribution(nationality as CountryKey, divLevel);

  console.log(`\n${countryName} · ${div} · target OVR ~${dist.mean} (stdDev ${dist.stdDev})\n`);
  console.log(header);
  console.log('─'.repeat(header.length));

  for (const r of rows) {
    const line = [
      r.name.padEnd(24),
      String(r.age).padStart(3),
      r.position.padEnd(4),
      String(r.overall).padStart(3),
      String(r.attrs.speed).padStart(3),
      String(r.attrs.strength).padStart(3),
      String(r.attrs.agility).padStart(3),
      String(r.attrs.passing).padStart(3),
      String(r.attrs.finishing).padStart(3),
      String(r.attrs.technique).padStart(3),
      String(r.attrs.defending).padStart(3),
      String(r.attrs.stamina).padStart(3),
      String(r.attrs.awareness).padStart(3),
      String(r.attrs.composure).padStart(3),
    ].join('  ');
    console.log(line);
  }
  console.log();
}

function buildRow(player: ReturnType<PlayerGenerator['generatePlayer']>) {
  return {
    id: player.id,
    name: player.name,
    nationality: player.nationality,
    age: player.age,
    position: player.position,
    potential: player.potential,
    overall: Math.round(calculateOverall(player.attributes)),
    attrs: player.attributes,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

const { nationality, gender, divisionLevel, count, format } = parseArgs();

const generator = new PlayerGenerator(gender, nationality as NameCountry);
const overallDistribution = divisionOverallDistribution(nationality as CountryKey, divisionLevel);
const categoryBias = divisionCategoryBias(divisionLevel);

const players = Array.from({ length: count }, (_, i) => {
  const position = positionAt(i);
  return generator.generatePlayer(position, { overallDistribution, categoryBias });
});

if (format === 'json') {
  console.log(JSON.stringify(players.map(buildRow), null, 2));
} else {
  renderTable(players.map(buildRow), nationality, divisionLevel);
}
