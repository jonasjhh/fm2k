import { createMatchSimulator, Team, Player } from './index.js';

function createExamplePlayer(id: string, name: string, position: any, attributes: any = {}): Player {
  const baseAttributes = {
    // Physical
    speed: 70,
    strength: 70,
    agility: 70,
    // Technical
    passing: 70,
    finishing: 70,
    technique: 70,
    defending: 70,
    stamina: 75,
    // Mental
    awareness: 70,
    composure: 70,
  };

  return {
    id,
    name,
    position,
    attributes: { ...baseAttributes, ...attributes },
  };
}

function createExampleTeam(): Team {
  const homeTeam: Team = {
    id: 'home',
    name: 'Real Madrid',
    formation: '4-3-3',
    starters: [
      createExamplePlayer('courtois', 'Thibaut Courtois', 'GK', { agility: 89, awareness: 85, finishing: 25 }),
      createExamplePlayer('carvajal', 'Dani Carvajal', 'RB', { defending: 85, speed: 78, stamina: 88 }),
      createExamplePlayer('militao', 'Eder Militao', 'CB', { defending: 86, strength: 84, awareness: 82 }),
      createExamplePlayer('rudiger', 'Antonio Rudiger', 'CB', { defending: 84, strength: 86, agility: 75 }),
      createExamplePlayer('mendy', 'Ferland Mendy', 'LB', { defending: 82, speed: 85, technique: 76 }),
      createExamplePlayer('casemiro', 'Casemiro', 'CDM', { defending: 88, strength: 89, awareness: 85 }),
      createExamplePlayer('kroos', 'Toni Kroos', 'CM', { passing: 93, finishing: 82, awareness: 91 }),
      createExamplePlayer('modric', 'Luka Modric', 'CM', { passing: 91, technique: 88, agility: 85 }),
      createExamplePlayer('vinicius', 'Vinicius Jr.', 'LW', { speed: 95, technique: 90, agility: 88 }),
      createExamplePlayer('benzema', 'Karim Benzema', 'ST', { finishing: 91, technique: 85, composure: 89 }),
      createExamplePlayer('rodrygo', 'Rodrygo', 'RW', { speed: 87, technique: 85, finishing: 83 }),
    ],
    substitutes: [
      createExamplePlayer('lunin', 'Andriy Lunin', 'GK', { agility: 78, awareness: 76, finishing: 20 }),
      createExamplePlayer('alaba', 'David Alaba', 'CB', { defending: 84, passing: 86, technique: 84 }),
      createExamplePlayer('camavinga', 'Eduardo Camavinga', 'CM', { speed: 82, technique: 82, stamina: 86 }),
    ],
    tactics: {
      attackingMentality: 'attacking',
      passingStyle: 'short',
      tempo: 'fast',
      width: 'wide',
    },
  };

  return homeTeam;
}

function createAwayTeam(): Team {
  const awayTeam: Team = {
    id: 'away',
    name: 'Barcelona',
    formation: '4-3-3',
    starters: [
      createExamplePlayer('ter_stegen', 'Marc-André ter Stegen', 'GK', { agility: 87, awareness: 84, finishing: 22 }),
      createExamplePlayer('dest', 'Sergiño Dest', 'RB', { speed: 84, defending: 78, stamina: 85 }),
      createExamplePlayer('pique', 'Gerard Piqué', 'CB', { defending: 84, passing: 82, awareness: 88 }),
      createExamplePlayer('garcia', 'Eric García', 'CB', { defending: 80, passing: 84, technique: 81 }),
      createExamplePlayer('alba', 'Jordi Alba', 'LB', { speed: 82, passing: 84, technique: 83 }),
      createExamplePlayer('busquets', 'Sergio Busquets', 'CDM', { passing: 89, defending: 83, awareness: 92 }),
      createExamplePlayer('pedri', 'Pedri', 'CM', { passing: 88, technique: 85, awareness: 86 }),
      createExamplePlayer('de_jong', 'Frenkie de Jong', 'CM', { passing: 87, technique: 86, agility: 84 }),
      createExamplePlayer('fati', 'Ansu Fati', 'LW', { speed: 88, technique: 86, finishing: 84 }),
      createExamplePlayer('lewandowski', 'Robert Lewandowski', 'ST', { finishing: 94, strength: 84, composure: 91 }),
      createExamplePlayer('dembele', 'Ousmane Dembélé', 'RW', { speed: 93, technique: 88, agility: 89 }),
    ],
    substitutes: [
      createExamplePlayer('pena', 'Iñaki Peña', 'GK', { agility: 74, awareness: 72, finishing: 18 }),
      createExamplePlayer('araujo', 'Ronald Araújo', 'CB', { defending: 83, strength: 88, speed: 79 }),
      createExamplePlayer('gavi', 'Gavi', 'CM', { technique: 83, speed: 80, agility: 85 }),
    ],
    tactics: {
      attackingMentality: 'attacking',
      passingStyle: 'short',
      tempo: 'medium',
      width: 'balanced',
    },
  };

  return awayTeam;
}

export function runExampleMatch(): void {
  console.log('🏟️  El Clásico: Real Madrid vs Barcelona\n');

  const homeTeam = createExampleTeam();
  const awayTeam = createAwayTeam();

  const simulator = createMatchSimulator(homeTeam, awayTeam, {
    eventsPerMinute: 4,
  });

  const result = simulator.simulate();

  console.log(`Final Score: ${homeTeam.name} ${result.finalState.homeScore} - ${result.finalState.awayScore} ${awayTeam.name}`);
  console.log('\n📊 Match Statistics:');
  console.log(`Possession: ${homeTeam.name} ${result.statistics.possession.home}% - ${result.statistics.possession.away}% ${awayTeam.name}`);
  console.log(`Shots: ${homeTeam.name} ${result.statistics.shots.home} - ${result.statistics.shots.away} ${awayTeam.name}`);
  console.log(`Shots on Target: ${homeTeam.name} ${result.statistics.shotsOnTarget.home} - ${result.statistics.shotsOnTarget.away} ${awayTeam.name}`);

  console.log('\n⚽ Key Events:');
  const keyEvents = result.events.filter(e =>
    ['goal', 'save', 'half_time', 'full_time'].includes(e.type),
  );

  keyEvents.forEach(event => {
    const playerName = event.playerId
      ? (homeTeam.starters.find(p => p.id === event.playerId)?.name ||
         awayTeam.starters.find(p => p.id === event.playerId)?.name || 'Unknown')
      : '';

    console.log(`${event.minute}' - ${event.description}`);
  });

  console.log(`\n🎮 Total Events Generated: ${result.events.length}`);
}
