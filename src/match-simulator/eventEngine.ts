import { MatchState, MatchEvent, EventType, EventContext, Player, BallPosition } from './types.js';

export interface EventGenerator {
  canGenerate(context: EventContext): boolean;
  generate(context: EventContext): MatchEvent | null;
  getChainedEvents?(event: MatchEvent, context: EventContext): MatchEvent[];
}

export class EventEngine {
  private generators: Map<EventType, EventGenerator> = new Map();
  private eventIdCounter = 0;

  registerGenerator(type: EventType, generator: EventGenerator): void {
    this.generators.set(type, generator);
  }

  generateEvent(currentState: MatchState): MatchEvent | null {
    const context: EventContext = {
      currentState,
      probability: Math.random(),
      involvedPlayers: this.getAvailablePlayers(currentState),
    };

    const possibleEvents = this.getPossibleEvents(context);
    if (possibleEvents.length === 0) {return null;}

    const selectedEventType = this.selectRandomEvent(possibleEvents);
    const generator = this.generators.get(selectedEventType);

    if (!generator) {return null;}

    const event = generator.generate(context);
    if (!event) {return null;}

    const chainedEvents = generator.getChainedEvents?.(event, context) || [];
    if (chainedEvents.length > 0) {
      event.chainedEvent = chainedEvents[0];
    }

    return event;
  }

  private getPossibleEvents(context: EventContext): EventType[] {
    const possible: EventType[] = [];

    for (const [eventType, generator] of this.generators.entries()) {
      if (generator.canGenerate(context)) {
        possible.push(eventType);
      }
    }

    return possible;
  }

  private selectRandomEvent(events: EventType[]): EventType {
    return events[Math.floor(Math.random() * events.length)];
  }

  private getAvailablePlayers(state: MatchState): Player[] {
    return state.possession === 'home'
      ? state.currentPlayers.home
      : state.currentPlayers.away;
  }

  generateId(): string {
    return `event-${++this.eventIdCounter}`;
  }
}

export class PassGenerator implements EventGenerator {
  canGenerate(context: EventContext): boolean {
    return context.currentState.phase === 'first_half' || context.currentState.phase === 'second_half';
  }

  generate(context: EventContext): MatchEvent | null {
    const { currentState } = context;
    const passingTeam = currentState.possession === 'home' ? currentState.currentPlayers.home : currentState.currentPlayers.away;
    const passer = this.selectPasser(passingTeam, currentState.ballPosition);

    if (!passer) {return null;}

    const success = this.calculatePassSuccess(passer, currentState.ballPosition);
    const newState = this.createNewState(currentState, success);

    return {
      id: new EventEngine().generateId(),
      type: 'pass',
      minute: currentState.minute,
      team: currentState.possession,
      playerId: passer.id,
      description: success ? `${passer.name} completes a pass` : `${passer.name}'s pass is intercepted`,
      resultingState: newState,
    };
  }

  getChainedEvents(event: MatchEvent, context: EventContext): MatchEvent[] {
    if (event.type === 'pass' && event.description.includes('completes')) {
      const chainedContext: EventContext = {
        ...context,
        currentState: event.resultingState,
      };

      if (Math.random() < 0.3) {
        return [new ShotGenerator().generate(chainedContext)].filter(e => e !== null) as MatchEvent[];
      }
    }
    return [];
  }

  private selectPasser(players: Player[], ballPosition: BallPosition): Player | null {
    const availablePlayers = players.filter(p => p.position !== 'GK');
    if (availablePlayers.length === 0) {return null;}

    return availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
  }

  private calculatePassSuccess(player: Player, ballPosition: BallPosition): boolean {
    const baseSuccess = (player.attributes.passing + player.attributes.technique * 0.5) / 150;
    const positionModifier = ballPosition.zone === 'away_box' ? 0.8 : 1.0;
    const pressureModifier = player.attributes.composure / 100;
    return Math.random() < (baseSuccess * positionModifier * pressureModifier);
  }

  private createNewState(currentState: MatchState, passSuccess: boolean): MatchState {
    const newState = { ...currentState };

    if (!passSuccess) {
      newState.possession = currentState.possession === 'home' ? 'away' : 'home';
    }

    newState.ballPosition = this.getNewBallPosition(currentState.ballPosition, passSuccess);

    return newState;
  }

  private getNewBallPosition(currentPosition: BallPosition, success: boolean): BallPosition {
    if (!success) {
      return currentPosition;
    }

    const zones: BallPosition['zone'][] = ['home_box', 'home_third', 'middle_third', 'away_third', 'away_box'];
    const currentIndex = zones.indexOf(currentPosition.zone);
    const moveForward = Math.random() < 0.6;

    let newIndex = currentIndex;
    if (moveForward && currentIndex < zones.length - 1) {
      newIndex = Math.min(currentIndex + 1, zones.length - 1);
    } else if (!moveForward && currentIndex > 0) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    return {
      zone: zones[newIndex],
      side: Math.random() < 0.33 ? 'left' : Math.random() < 0.5 ? 'center' : 'right',
    };
  }
}

export class ShotGenerator implements EventGenerator {
  canGenerate(context: EventContext): boolean {
    const { currentState } = context;
    return (currentState.ballPosition.zone === 'away_box' || currentState.ballPosition.zone === 'away_third') &&
           (currentState.phase === 'first_half' || currentState.phase === 'second_half');
  }

  generate(context: EventContext): MatchEvent | null {
    const { currentState } = context;
    const attackingTeam = currentState.possession === 'home' ? currentState.currentPlayers.home : currentState.currentPlayers.away;
    const shooter = this.selectShooter(attackingTeam);

    if (!shooter) {return null;}

    const shotQuality = this.calculateShotQuality(shooter, currentState.ballPosition);
    const newState = this.createNewState(currentState, shotQuality);

    return {
      id: new EventEngine().generateId(),
      type: 'shot',
      minute: currentState.minute,
      team: currentState.possession,
      playerId: shooter.id,
      description: `${shooter.name} takes a shot`,
      resultingState: newState,
    };
  }

  getChainedEvents(event: MatchEvent, context: EventContext): MatchEvent[] {
    if (event.type === 'shot') {
      const shotQuality = Math.random();

      if (shotQuality > 0.8) {
        return [new GoalGenerator().generate({
          ...context,
          currentState: event.resultingState,
        })].filter(e => e !== null) as MatchEvent[];
      } else if (shotQuality > 0.5) {
        return [new SaveGenerator().generate({
          ...context,
          currentState: event.resultingState,
        })].filter(e => e !== null) as MatchEvent[];
      }
    }
    return [];
  }

  private selectShooter(players: Player[]): Player | null {
    const attackers = players.filter(p =>
      ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(p.position),
    );

    if (attackers.length === 0) {
      const fieldPlayers = players.filter(p => p.position !== 'GK');
      return fieldPlayers[Math.floor(Math.random() * fieldPlayers.length)];
    }

    return attackers[Math.floor(Math.random() * attackers.length)];
  }

  private calculateShotQuality(player: Player, ballPosition: BallPosition): number {
    const baseFinishing = (player.attributes.finishing + player.attributes.technique * 0.3) / 130;
    const positionModifier = ballPosition.zone === 'away_box' ? 1.2 : 0.8;
    const composureModifier = player.attributes.composure / 100;
    return Math.min(baseFinishing * positionModifier * composureModifier, 1.0);
  }

  private createNewState(currentState: MatchState, shotQuality: number): MatchState {
    const newState = { ...currentState };
    newState.possession = currentState.possession === 'home' ? 'away' : 'home';
    newState.ballPosition = { zone: 'middle_third', side: 'center' };
    return newState;
  }
}

export class GoalGenerator implements EventGenerator {
  canGenerate(context: EventContext): boolean {
    return context.currentState.ballPosition.zone === 'away_box' &&
           (context.currentState.phase === 'first_half' || context.currentState.phase === 'second_half');
  }

  generate(context: EventContext): MatchEvent | null {
    const { currentState } = context;
    const scoringTeam = currentState.possession === 'home' ? currentState.currentPlayers.home : currentState.currentPlayers.away;
    const scorer = scoringTeam.find(p => ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(p.position)) || scoringTeam[0];

    if (!scorer) {return null;}

    const newState = { ...currentState };
    if (currentState.possession === 'home') {
      newState.homeScore += 1;
    } else {
      newState.awayScore += 1;
    }

    newState.possession = currentState.possession === 'home' ? 'away' : 'home';
    newState.ballPosition = { zone: 'middle_third', side: 'center' };

    return {
      id: new EventEngine().generateId(),
      type: 'goal',
      minute: currentState.minute,
      team: currentState.possession,
      playerId: scorer.id,
      description: `GOAL! ${scorer.name} scores!`,
      resultingState: newState,
    };
  }
}

export class SaveGenerator implements EventGenerator {
  canGenerate(context: EventContext): boolean {
    return context.currentState.ballPosition.zone === 'away_box' &&
           (context.currentState.phase === 'first_half' || context.currentState.phase === 'second_half');
  }

  generate(context: EventContext): MatchEvent | null {
    const { currentState } = context;
    const defendingTeam = currentState.possession === 'home' ? currentState.currentPlayers.away : currentState.currentPlayers.home;
    const goalkeeper = defendingTeam.find(p => p.position === 'GK');

    if (!goalkeeper) {return null;}

    const newState = { ...currentState };
    newState.possession = currentState.possession === 'home' ? 'away' : 'home';
    newState.ballPosition = { zone: 'away_third', side: 'center' };

    return {
      id: new EventEngine().generateId(),
      type: 'save',
      minute: currentState.minute,
      team: currentState.possession === 'home' ? 'away' : 'home',
      playerId: goalkeeper.id,
      description: `Great save by ${goalkeeper.name}!`,
      resultingState: newState,
    };
  }
}
