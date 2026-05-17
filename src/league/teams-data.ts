import type { Team, Player, PlayerAttributes, Position } from '../shared/types.js'

function player(id: string, name: string, pos: string, attrs: Partial<PlayerAttributes> = {}): Player {
  const base: PlayerAttributes = {
    speed: 70, strength: 70, agility: 70, passing: 70, finishing: 70,
    technique: 70, defending: 70, stamina: 75, awareness: 70, composure: 70,
  }
  return { id, name, position: pos as Position, attributes: { ...base, ...attrs } }
}

export const DIVISION_TEAMS: Team[] = [
  // ─── Tier 1 ────────────────────────────────────────────────────────────────

  {
    id: 'ironvale',
    name: 'Ironvale FC',
    formation: '4-3-3',
    starters: [
      player('ivl-gk',  'Matt Crowley',    'GK', { agility: 87, awareness: 84, composure: 82, defending: 74, finishing: 22 }),
      player('ivl-lb',  'Sam Ferris',      'LB', { speed: 84, defending: 82, stamina: 86, agility: 80 }),
      player('ivl-cb1', 'Jordan Holt',     'CB', { defending: 88, strength: 86, awareness: 83, passing: 72 }),
      player('ivl-cb2', 'Ryan Marsh',      'CB', { defending: 86, strength: 84, awareness: 82, speed: 72 }),
      player('ivl-rb',  'Tom Reeves',      'RB', { speed: 83, defending: 81, stamina: 85, agility: 79 }),
      player('ivl-cm1', 'Dean Farley',     'CM', { passing: 88, awareness: 86, technique: 84, defending: 72, stamina: 84 }),
      player('ivl-cm2', 'Luca Moretti',    'CM', { passing: 84, technique: 82, awareness: 80, stamina: 86, defending: 74 }),
      player('ivl-cm3', 'Alex Norris',     'CM', { passing: 82, awareness: 82, defending: 80, stamina: 82, technique: 78 }),
      player('ivl-lw',  'Javier Cruz',     'LW', { speed: 92, agility: 88, technique: 86, finishing: 80, stamina: 85 }),
      player('ivl-st',  'Connor Blake',    'ST', { finishing: 90, composure: 86, technique: 82, strength: 80, speed: 82 }),
      player('ivl-rw',  'Ben Hartley',     'RW', { speed: 88, agility: 86, technique: 84, finishing: 78, stamina: 83 }),
    ],
    substitutes: [
      player('ivl-sub1', 'Kyle Denton',   'GK', { agility: 78, awareness: 76, composure: 72, defending: 64, finishing: 18 }),
      player('ivl-sub2', 'Marc Solano',   'CB', { defending: 82, strength: 80, awareness: 78, speed: 68 }),
      player('ivl-sub3', 'Phil Garrett',  'CM', { passing: 80, awareness: 78, technique: 76, stamina: 80 }),
      player('ivl-sub4', 'Owen Drake',    'ST', { finishing: 84, speed: 80, composure: 80, strength: 76 }),
    ],
  },

  {
    id: 'westbrook',
    name: 'Westbrook City',
    formation: '4-4-2',
    starters: [
      player('wbc-gk',  'Pete Hawkins',    'GK', { agility: 86, awareness: 86, composure: 83, defending: 76, finishing: 20 }),
      player('wbc-lb',  'Carlos Vega',     'LB', { speed: 82, defending: 84, stamina: 84, agility: 78 }),
      player('wbc-cb1', 'Dan Ashton',      'CB', { defending: 90, strength: 87, awareness: 85, passing: 70 }),
      player('wbc-cb2', 'Isaac Paine',     'CB', { defending: 88, strength: 85, awareness: 83, speed: 70 }),
      player('wbc-rb',  'Joe Mullins',     'RB', { speed: 80, defending: 84, stamina: 84, agility: 78 }),
      player('wbc-lm',  'Finn Pearce',     'LM', { speed: 86, agility: 84, technique: 80, stamina: 86, passing: 76 }),
      player('wbc-cm1', 'Will Cotton',     'CM', { passing: 86, awareness: 85, technique: 80, defending: 78, stamina: 83 }),
      player('wbc-cm2', 'Harry Simms',     'CM', { defending: 84, passing: 78, awareness: 82, stamina: 84, strength: 78 }),
      player('wbc-rm',  'Noah Baxter',     'RM', { speed: 84, agility: 82, technique: 79, stamina: 84, passing: 74 }),
      player('wbc-st1', 'Marco Diaz',      'ST', { finishing: 88, composure: 85, technique: 80, speed: 80, strength: 82 }),
      player('wbc-st2', 'Kevin Lamb',      'ST', { finishing: 86, strength: 84, composure: 82, speed: 78, technique: 76 }),
    ],
    substitutes: [
      player('wbc-sub1', 'Gary Finch',    'GK', { agility: 78, awareness: 77, composure: 72, defending: 65, finishing: 18 }),
      player('wbc-sub2', 'Lee Briggs',    'CB', { defending: 82, strength: 82, awareness: 78, speed: 66 }),
      player('wbc-sub3', 'Theo Mason',    'CM', { passing: 80, awareness: 79, technique: 75, stamina: 80 }),
      player('wbc-sub4', 'Rob Nance',     'ST', { finishing: 82, speed: 78, composure: 79, strength: 80 }),
    ],
  },

  // ─── Tier 2 ────────────────────────────────────────────────────────────────

  {
    id: 'northport',
    name: 'Northport Athletic',
    formation: '4-4-2',
    starters: [
      player('npa-gk',  'Steve Quill',     'GK', { agility: 82, awareness: 80, composure: 76, defending: 70, finishing: 19 }),
      player('npa-lb',  'Jake Barton',     'LB', { speed: 78, defending: 78, stamina: 80, agility: 74 }),
      player('npa-cb1', 'Chris Wade',      'CB', { defending: 82, strength: 80, awareness: 78, passing: 65 }),
      player('npa-cb2', 'Luke Stanley',    'CB', { defending: 80, strength: 78, awareness: 76, speed: 68 }),
      player('npa-rb',  'Neil Frost',      'RB', { speed: 76, defending: 78, stamina: 80, agility: 74 }),
      player('npa-lm',  'Raj Patel',       'LM', { speed: 80, agility: 78, technique: 74, stamina: 82, passing: 72 }),
      player('npa-cm1', 'Paul Hewitt',     'CM', { passing: 80, awareness: 78, technique: 74, defending: 72, stamina: 80 }),
      player('npa-cm2', 'James Crowe',     'CM', { passing: 76, defending: 76, awareness: 74, stamina: 80, strength: 74 }),
      player('npa-rm',  'Eddie Sparks',    'RM', { speed: 78, agility: 76, technique: 72, stamina: 80, passing: 70 }),
      player('npa-st1', 'Dave Quinn',      'ST', { finishing: 82, composure: 78, technique: 74, speed: 76, strength: 76 }),
      player('npa-st2', 'Alfie Cross',     'ST', { finishing: 80, strength: 78, composure: 76, speed: 74, technique: 72 }),
    ],
    substitutes: [
      player('npa-sub1', 'Tim Shore',     'GK', { agility: 74, awareness: 72, composure: 68, defending: 60, finishing: 16 }),
      player('npa-sub2', 'Glen Booth',    'CB', { defending: 76, strength: 74, awareness: 72, speed: 64 }),
      player('npa-sub3', 'Stuart Hay',    'CM', { passing: 74, awareness: 72, technique: 70, stamina: 76 }),
      player('npa-sub4', 'Leo Trott',     'ST', { finishing: 76, speed: 74, composure: 72, strength: 72 }),
    ],
  },

  {
    id: 'redcliff',
    name: 'Redcliff United',
    formation: '4-3-3',
    starters: [
      player('rcu-gk',  'Andy Thorn',      'GK', { agility: 81, awareness: 80, composure: 76, defending: 70, finishing: 18 }),
      player('rcu-lb',  'Luis Cabrera',    'LB', { speed: 79, defending: 77, stamina: 80, agility: 75 }),
      player('rcu-cb1', 'Mike Pender',     'CB', { defending: 82, strength: 80, awareness: 77, passing: 64 }),
      player('rcu-cb2', 'Scott Nolan',     'CB', { defending: 80, strength: 79, awareness: 76, speed: 67 }),
      player('rcu-rb',  'Shane Doyle',     'RB', { speed: 77, defending: 78, stamina: 80, agility: 74 }),
      player('rcu-cm1', 'Victor Mendes',   'CM', { passing: 81, awareness: 79, technique: 76, defending: 70, stamina: 80 }),
      player('rcu-cm2', 'Craig Hicks',     'CM', { passing: 77, technique: 74, awareness: 76, stamina: 80, defending: 72 }),
      player('rcu-cm3', 'Ross Keane',      'CM', { defending: 76, passing: 74, awareness: 74, stamina: 78, strength: 74 }),
      player('rcu-lw',  'Tony Vera',       'LW', { speed: 82, agility: 80, technique: 76, finishing: 72, stamina: 80 }),
      player('rcu-st',  'Karl Hendricks',  'ST', { finishing: 82, composure: 78, technique: 74, speed: 74, strength: 76 }),
      player('rcu-rw',  'Yusuf Osman',     'RW', { speed: 80, agility: 78, technique: 74, finishing: 70, stamina: 78 }),
    ],
    substitutes: [
      player('rcu-sub1', 'Ewan Paige',    'GK', { agility: 73, awareness: 71, composure: 67, defending: 60, finishing: 16 }),
      player('rcu-sub2', 'Kevin Baird',   'CB', { defending: 76, strength: 74, awareness: 72, speed: 64 }),
      player('rcu-sub3', 'Nate Fox',      'CM', { passing: 74, awareness: 72, technique: 70, stamina: 76 }),
      player('rcu-sub4', 'Brett Lowe',    'ST', { finishing: 76, speed: 72, composure: 72, strength: 73 }),
    ],
  },

  {
    id: 'southgate',
    name: 'Southgate Rovers',
    formation: '4-4-2',
    starters: [
      player('sgr-gk',  'Adam Pearson',    'GK', { agility: 80, awareness: 79, composure: 74, defending: 68, finishing: 17 }),
      player('sgr-lb',  'Bobby Dunn',      'LB', { speed: 77, defending: 76, stamina: 79, agility: 73 }),
      player('sgr-cb1', 'Clive Morton',    'CB', { defending: 80, strength: 78, awareness: 75, passing: 63 }),
      player('sgr-cb2', 'Phil Banks',      'CB', { defending: 78, strength: 77, awareness: 74, speed: 66 }),
      player('sgr-rb',  'Harry Groves',    'RB', { speed: 75, defending: 76, stamina: 79, agility: 73 }),
      player('sgr-lm',  'Darren Bell',     'LM', { speed: 79, agility: 77, technique: 73, stamina: 80, passing: 71 }),
      player('sgr-cm1', 'Nico Ruiz',       'CM', { passing: 79, awareness: 77, technique: 73, defending: 70, stamina: 79 }),
      player('sgr-cm2', 'Dale Kirk',       'CM', { defending: 74, passing: 73, awareness: 73, stamina: 79, strength: 73 }),
      player('sgr-rm',  'Josh Weir',       'RM', { speed: 77, agility: 75, technique: 71, stamina: 79, passing: 69 }),
      player('sgr-st1', 'Frank Gibbs',     'ST', { finishing: 80, composure: 76, technique: 72, speed: 74, strength: 75 }),
      player('sgr-st2', 'Cal Sims',        'ST', { finishing: 78, strength: 76, composure: 74, speed: 72, technique: 70 }),
    ],
    substitutes: [
      player('sgr-sub1', 'Ray Timms',     'GK', { agility: 72, awareness: 70, composure: 66, defending: 58, finishing: 15 }),
      player('sgr-sub2', 'Bryn Lee',      'CB', { defending: 74, strength: 73, awareness: 70, speed: 62 }),
      player('sgr-sub3', 'Ivan Ness',     'CM', { passing: 73, awareness: 71, technique: 68, stamina: 75 }),
      player('sgr-sub4', 'Cian Walsh',    'ST', { finishing: 74, speed: 72, composure: 70, strength: 72 }),
    ],
  },

  // ─── Tier 3 ────────────────────────────────────────────────────────────────

  {
    id: 'eastfield',
    name: 'Eastfield Town',
    formation: '4-4-2',
    starters: [
      player('eft-gk',  'Reg Stanton',     'GK', { agility: 76, awareness: 76, composure: 71, defending: 66, finishing: 17 }),
      player('eft-lb',  'Max Heron',       'LB', { speed: 73, defending: 73, stamina: 76, agility: 70 }),
      player('eft-cb1', 'Aaron Vines',     'CB', { defending: 76, strength: 74, awareness: 72, passing: 61 }),
      player('eft-cb2', 'Ian Cope',        'CB', { defending: 74, strength: 73, awareness: 70, speed: 64 }),
      player('eft-rb',  'Ollie Stamp',     'RB', { speed: 72, defending: 73, stamina: 76, agility: 70 }),
      player('eft-lm',  'Declan Ward',     'LM', { speed: 75, agility: 73, technique: 70, stamina: 77, passing: 68 }),
      player('eft-cm1', 'Grant Ford',      'CM', { passing: 75, awareness: 73, technique: 70, defending: 67, stamina: 76 }),
      player('eft-cm2', 'Oscar Penn',      'CM', { defending: 71, passing: 69, awareness: 70, stamina: 77, strength: 70 }),
      player('eft-rm',  'Lewis Crane',     'RM', { speed: 73, agility: 71, technique: 68, stamina: 76, passing: 66 }),
      player('eft-st1', 'Pete Stubbs',     'ST', { finishing: 76, composure: 72, technique: 69, speed: 71, strength: 72 }),
      player('eft-st2', 'Ray Holder',      'ST', { finishing: 74, strength: 72, composure: 70, speed: 69, technique: 67 }),
    ],
    substitutes: [
      player('eft-sub1', 'Mark Unwin',    'GK', { agility: 70, awareness: 68, composure: 64, defending: 56, finishing: 14 }),
      player('eft-sub2', 'Bert Lamb',     'CB', { defending: 70, strength: 70, awareness: 66, speed: 60 }),
      player('eft-sub3', 'Fred Gray',     'CM', { passing: 70, awareness: 68, technique: 65, stamina: 72 }),
      player('eft-sub4', 'Curt Rose',     'ST', { finishing: 70, speed: 68, composure: 67, strength: 70 }),
    ],
  },

  {
    id: 'millbrook',
    name: 'Millbrook FC',
    formation: '4-4-2',
    starters: [
      player('mfc-gk',  'Sid Cain',        'GK', { agility: 75, awareness: 75, composure: 70, defending: 65, finishing: 16 }),
      player('mfc-lb',  'Abe Rowe',        'LB', { speed: 72, defending: 72, stamina: 75, agility: 69 }),
      player('mfc-cb1', 'Don Pike',        'CB', { defending: 75, strength: 73, awareness: 70, passing: 60 }),
      player('mfc-cb2', 'Walt Penn',       'CB', { defending: 73, strength: 72, awareness: 68, speed: 63 }),
      player('mfc-rb',  'Sid Hall',        'RB', { speed: 71, defending: 72, stamina: 75, agility: 69 }),
      player('mfc-lm',  'Archie Tate',     'LM', { speed: 74, agility: 72, technique: 69, stamina: 76, passing: 67 }),
      player('mfc-cm1', 'Reg Nash',        'CM', { passing: 74, awareness: 72, technique: 69, defending: 66, stamina: 75 }),
      player('mfc-cm2', 'Norm Yates',      'CM', { defending: 70, passing: 68, awareness: 69, stamina: 76, strength: 69 }),
      player('mfc-rm',  'Al Vickers',      'RM', { speed: 72, agility: 70, technique: 67, stamina: 75, passing: 65 }),
      player('mfc-st1', 'Bert Stone',      'ST', { finishing: 75, composure: 71, technique: 68, speed: 70, strength: 71 }),
      player('mfc-st2', 'Ernie Fox',       'ST', { finishing: 73, strength: 71, composure: 69, speed: 68, technique: 66 }),
    ],
    substitutes: [
      player('mfc-sub1', 'Wally Cross',   'GK', { agility: 68, awareness: 67, composure: 62, defending: 55, finishing: 13 }),
      player('mfc-sub2', 'Len Marsh',     'CB', { defending: 70, strength: 68, awareness: 65, speed: 59 }),
      player('mfc-sub3', 'Roy Burns',     'CM', { passing: 69, awareness: 67, technique: 64, stamina: 71 }),
      player('mfc-sub4', 'Dan Hunt',      'ST', { finishing: 69, speed: 67, composure: 66, strength: 68 }),
    ],
  },

  {
    id: 'harborside',
    name: 'Harborside FC',
    formation: '4-4-2',
    starters: [
      player('hfc-gk',  'Ted Frame',       'GK', { agility: 74, awareness: 74, composure: 69, defending: 64, finishing: 16 }),
      player('hfc-lb',  'Vic Hardy',       'LB', { speed: 71, defending: 71, stamina: 74, agility: 68 }),
      player('hfc-cb1', 'Ron Dawes',       'CB', { defending: 74, strength: 72, awareness: 69, passing: 59 }),
      player('hfc-cb2', 'Len Kirk',        'CB', { defending: 72, strength: 71, awareness: 67, speed: 62 }),
      player('hfc-rb',  'Ken Watts',       'RB', { speed: 70, defending: 71, stamina: 74, agility: 68 }),
      player('hfc-lm',  'Alf Norris',      'LM', { speed: 73, agility: 71, technique: 68, stamina: 75, passing: 66 }),
      player('hfc-cm1', 'Stan Holt',       'CM', { passing: 73, awareness: 71, technique: 68, defending: 65, stamina: 74 }),
      player('hfc-cm2', 'Cyril Moore',     'CM', { defending: 69, passing: 67, awareness: 68, stamina: 75, strength: 68 }),
      player('hfc-rm',  'Bert Allman',     'RM', { speed: 71, agility: 69, technique: 66, stamina: 74, passing: 64 }),
      player('hfc-st1', 'Alec Birch',      'ST', { finishing: 74, composure: 70, technique: 67, speed: 69, strength: 70 }),
      player('hfc-st2', 'Cyrus Webb',      'ST', { finishing: 72, strength: 70, composure: 68, speed: 67, technique: 65 }),
    ],
    substitutes: [
      player('hfc-sub1', 'Harry Blane',   'GK', { agility: 67, awareness: 66, composure: 61, defending: 54, finishing: 13 }),
      player('hfc-sub2', 'Doug Swift',    'CB', { defending: 68, strength: 67, awareness: 64, speed: 58 }),
      player('hfc-sub3', 'Nat Stone',     'CM', { passing: 68, awareness: 66, technique: 63, stamina: 70 }),
      player('hfc-sub4', 'Denny Ash',     'ST', { finishing: 68, speed: 66, composure: 65, strength: 67 }),
    ],
  },

  // ─── Tier 4 ────────────────────────────────────────────────────────────────

  {
    id: 'thornwick',
    name: 'Thornwick Wanderers',
    formation: '4-4-2',
    starters: [
      player('tww-gk',  'Ed Plumb',        'GK', { agility: 71, awareness: 71, composure: 66, defending: 61, finishing: 15 }),
      player('tww-lb',  'Otto Sims',       'LB', { speed: 68, defending: 68, stamina: 71, agility: 65 }),
      player('tww-cb1', 'Eli Fenn',        'CB', { defending: 70, strength: 69, awareness: 65, passing: 57 }),
      player('tww-cb2', 'Jim Hale',        'CB', { defending: 68, strength: 68, awareness: 64, speed: 60 }),
      player('tww-rb',  'Hugh Dean',       'RB', { speed: 67, defending: 68, stamina: 71, agility: 65 }),
      player('tww-lm',  'Cecil Vane',      'LM', { speed: 70, agility: 68, technique: 65, stamina: 72, passing: 63 }),
      player('tww-cm1', 'Bart Moss',       'CM', { passing: 69, awareness: 68, technique: 64, defending: 62, stamina: 72 }),
      player('tww-cm2', 'Gil Crane',       'CM', { defending: 66, passing: 64, awareness: 65, stamina: 72, strength: 65 }),
      player('tww-rm',  'Ike Pool',        'RM', { speed: 68, agility: 66, technique: 63, stamina: 71, passing: 61 }),
      player('tww-st1', 'Gus Vale',        'ST', { finishing: 70, composure: 67, technique: 64, speed: 66, strength: 67 }),
      player('tww-st2', 'Ned Cope',        'ST', { finishing: 68, strength: 67, composure: 65, speed: 64, technique: 62 }),
    ],
    substitutes: [
      player('tww-sub1', 'Hob Keen',      'GK', { agility: 64, awareness: 63, composure: 58, defending: 52, finishing: 12 }),
      player('tww-sub2', 'Amos Ward',     'CB', { defending: 65, strength: 64, awareness: 61, speed: 56 }),
      player('tww-sub3', 'Burt Dale',     'CM', { passing: 65, awareness: 63, technique: 60, stamina: 67 }),
      player('tww-sub4', 'Vin Cole',      'ST', { finishing: 65, speed: 63, composure: 62, strength: 64 }),
    ],
  },

  {
    id: 'crestdale',
    name: 'Crestdale FC',
    formation: '4-4-2',
    starters: [
      player('cdc-gk',  'Clem Bray',       'GK', { agility: 70, awareness: 70, composure: 65, defending: 60, finishing: 15 }),
      player('cdc-lb',  'Ira Knox',        'LB', { speed: 67, defending: 67, stamina: 70, agility: 64 }),
      player('cdc-cb1', 'Sol Fry',         'CB', { defending: 69, strength: 68, awareness: 64, passing: 56 }),
      player('cdc-cb2', 'Nat Cole',        'CB', { defending: 67, strength: 67, awareness: 62, speed: 59 }),
      player('cdc-rb',  'Lew Carr',        'RB', { speed: 66, defending: 67, stamina: 70, agility: 64 }),
      player('cdc-lm',  'Zeb Webb',        'LM', { speed: 69, agility: 67, technique: 64, stamina: 71, passing: 62 }),
      player('cdc-cm1', 'Jed Duff',        'CM', { passing: 68, awareness: 67, technique: 63, defending: 61, stamina: 71 }),
      player('cdc-cm2', 'Walt Cope',       'CM', { defending: 65, passing: 63, awareness: 64, stamina: 71, strength: 64 }),
      player('cdc-rm',  'Cam Hale',        'RM', { speed: 67, agility: 65, technique: 62, stamina: 70, passing: 60 }),
      player('cdc-st1', 'Vern Ruck',       'ST', { finishing: 69, composure: 66, technique: 63, speed: 65, strength: 66 }),
      player('cdc-st2', 'Gib Wray',        'ST', { finishing: 67, strength: 66, composure: 64, speed: 63, technique: 61 }),
    ],
    substitutes: [
      player('cdc-sub1', 'Spike Teal',    'GK', { agility: 63, awareness: 62, composure: 57, defending: 51, finishing: 12 }),
      player('cdc-sub2', 'Reg Finn',      'CB', { defending: 64, strength: 63, awareness: 60, speed: 55 }),
      player('cdc-sub3', 'Bram Lake',     'CM', { passing: 64, awareness: 62, technique: 59, stamina: 66 }),
      player('cdc-sub4', 'Vince Peck',    'ST', { finishing: 64, speed: 62, composure: 61, strength: 63 }),
    ],
  },

  // ─── Tier 5 ────────────────────────────────────────────────────────────────

  {
    id: 'lakeside',
    name: 'Lakeside Athletic',
    formation: '4-4-2',
    starters: [
      player('lsa-gk',  'Mort Gale',       'GK', { agility: 66, awareness: 66, composure: 61, defending: 57, finishing: 14 }),
      player('lsa-lb',  'Hank Stow',       'LB', { speed: 63, defending: 63, stamina: 66, agility: 60 }),
      player('lsa-cb1', 'Chad Wren',       'CB', { defending: 65, strength: 64, awareness: 61, passing: 53 }),
      player('lsa-cb2', 'Rex Bolt',        'CB', { defending: 63, strength: 63, awareness: 59, speed: 56 }),
      player('lsa-rb',  'Slim Daw',        'RB', { speed: 62, defending: 63, stamina: 66, agility: 60 }),
      player('lsa-lm',  'Pep Nunn',        'LM', { speed: 65, agility: 63, technique: 60, stamina: 67, passing: 58 }),
      player('lsa-cm1', 'Dex Hart',        'CM', { passing: 64, awareness: 63, technique: 59, defending: 57, stamina: 67 }),
      player('lsa-cm2', 'Woody Falk',      'CM', { defending: 61, passing: 59, awareness: 60, stamina: 67, strength: 60 }),
      player('lsa-rm',  'Bert Drum',       'RM', { speed: 63, agility: 61, technique: 58, stamina: 66, passing: 56 }),
      player('lsa-st1', 'Monty Peel',      'ST', { finishing: 65, composure: 62, technique: 59, speed: 61, strength: 62 }),
      player('lsa-st2', 'Russ Grove',      'ST', { finishing: 63, strength: 62, composure: 60, speed: 59, technique: 57 }),
    ],
    substitutes: [
      player('lsa-sub1', 'Ned Vane',      'GK', { agility: 60, awareness: 58, composure: 54, defending: 48, finishing: 11 }),
      player('lsa-sub2', 'Flip Snow',     'CB', { defending: 60, strength: 59, awareness: 56, speed: 52 }),
      player('lsa-sub3', 'Skip Bale',     'CM', { passing: 60, awareness: 58, technique: 55, stamina: 62 }),
      player('lsa-sub4', 'Zach Moon',     'ST', { finishing: 60, speed: 58, composure: 57, strength: 59 }),
    ],
  },

  {
    id: 'dunmore',
    name: 'Dunmore City',
    formation: '4-4-2',
    starters: [
      player('dmc-gk',  'Hew Rust',        'GK', { agility: 64, awareness: 64, composure: 59, defending: 55, finishing: 14 }),
      player('dmc-lb',  'Silas Vann',      'LB', { speed: 61, defending: 61, stamina: 64, agility: 58 }),
      player('dmc-cb1', 'Thad Burr',       'CB', { defending: 63, strength: 62, awareness: 58, passing: 51 }),
      player('dmc-cb2', 'Cass Rowe',       'CB', { defending: 61, strength: 61, awareness: 57, speed: 54 }),
      player('dmc-rb',  'Ike Mott',        'RB', { speed: 60, defending: 61, stamina: 64, agility: 58 }),
      player('dmc-lm',  'Stub Nall',       'LM', { speed: 63, agility: 61, technique: 58, stamina: 65, passing: 56 }),
      player('dmc-cm1', 'Floss Dale',      'CM', { passing: 62, awareness: 61, technique: 57, defending: 55, stamina: 65 }),
      player('dmc-cm2', 'Buck Weir',       'CM', { defending: 59, passing: 57, awareness: 58, stamina: 65, strength: 58 }),
      player('dmc-rm',  'Cob Leam',        'RM', { speed: 61, agility: 59, technique: 56, stamina: 64, passing: 54 }),
      player('dmc-st1', 'Ash Plum',        'ST', { finishing: 63, composure: 60, technique: 57, speed: 59, strength: 60 }),
      player('dmc-st2', 'Rolf Drew',       'ST', { finishing: 61, strength: 60, composure: 58, speed: 57, technique: 55 }),
    ],
    substitutes: [
      player('dmc-sub1', 'Dab Croft',     'GK', { agility: 58, awareness: 56, composure: 52, defending: 46, finishing: 10 }),
      player('dmc-sub2', 'Oz Holt',       'CB', { defending: 58, strength: 57, awareness: 54, speed: 50 }),
      player('dmc-sub3', 'Tip Gale',      'CM', { passing: 58, awareness: 56, technique: 53, stamina: 60 }),
      player('dmc-sub4', 'Finn Nabb',     'ST', { finishing: 58, speed: 56, composure: 55, strength: 57 }),
    ],
  },
]
