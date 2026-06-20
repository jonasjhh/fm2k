/**
 * One-time migration: converts each country's nested
 * `divisions[].teams[].players[]` JSON into three flat, id-linked files —
 * `<country>/divisions.json`, `<country>/teams.json`, `<country>/players.json` —
 * so no single file is large and unrelated edits (one team's colours vs. one
 * player's attributes) don't collide in the same blob.
 *
 * Usage:
 *   pnpm --filter @fm2k/engine migrate-country-data
 *
 * Run once against the existing nested `<country>.json` files. Does not delete
 * the old files — review the new output, then remove the old nested files by hand.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { COUNTRY_IDS } from '../src/index.ts';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/data');

interface NestedPlayer {
  id: string;
  name: string;
  nationality?: string;
  age?: number;
  position: string;
  potential?: number;
  attributes: Record<string, number>;
}

interface NestedTeam {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  players: NestedPlayer[];
}

interface NestedDivision {
  id: string;
  name: string;
  level: number;
  teams: NestedTeam[];
}

interface NestedCountry {
  country: string;
  nationality: string;
  divisions: NestedDivision[];
}

for (const countryId of COUNTRY_IDS) {
  const filePath = join(DATA_DIR, `${countryId}.json`);
  const data: NestedCountry = JSON.parse(readFileSync(filePath, 'utf-8'));

  const divisions = data.divisions.map(d => ({ id: d.id, name: d.name, level: d.level }));
  const teams = data.divisions.flatMap(d => d.teams.map(t => ({
    id: t.id,
    name: t.name,
    divisionId: d.id,
    ...(t.primaryColor !== undefined && { primaryColor: t.primaryColor }),
    ...(t.secondaryColor !== undefined && { secondaryColor: t.secondaryColor }),
  })));
  const players = data.divisions.flatMap(d => d.teams.flatMap(t => t.players.map(p => ({
    id: p.id,
    name: p.name,
    clubId: t.id,
    ...(p.nationality !== undefined && { nationality: p.nationality }),
    ...(p.age !== undefined && { age: p.age }),
    position: p.position,
    ...(p.potential !== undefined && { potential: p.potential }),
    attributes: p.attributes,
  }))));

  const outDir = join(DATA_DIR, countryId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'divisions.json'), JSON.stringify(divisions, null, 2) + '\n');
  writeFileSync(join(outDir, 'teams.json'), JSON.stringify(teams, null, 2) + '\n');
  writeFileSync(join(outDir, 'players.json'), JSON.stringify(players, null, 2) + '\n');
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify({ country: data.country, nationality: data.nationality }, null, 2) + '\n');

  console.log(`✓ ${countryId}: ${divisions.length} divisions, ${teams.length} teams, ${players.length} players`);
}

console.log('Done. Review packages/engine/src/data/<country>/ output, then delete the old <country>.json files.');
