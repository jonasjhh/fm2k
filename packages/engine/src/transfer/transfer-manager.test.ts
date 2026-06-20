import { assertDefined } from '@fm2k/state';
import { TransferManager } from './transfer-manager.ts';
import type { TransferManagerConfig } from './transfer-manager.ts';
import { ClubManager } from '../club/club-manager.ts';
import type { Player, PlayerAttributes, Formation } from '@fm2k/match';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAttrs(overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return {
    speed: 10, strength: 10, agility: 10,
    passing: 10, finishing: 10, technique: 10,
    defending: 10, stamina: 10, awareness: 10, composure: 10,
    ...overrides,
  };
}

let playerCounter = 0;
function makePlayer(attrs: Partial<PlayerAttributes> = {}): Player {
  const id = `tp-${++playerCounter}`;
  return {
    id,
    name: `Transfer Player ${playerCounter}`,
    nationality: 'norwegian',
    age: 25,
    position: 'CM',
    potential: 70,
    attributes: makeAttrs(attrs),
  };
}

// Deterministic factory — always returns the same player template
function makePlayerFactory(attrs: Partial<PlayerAttributes> = {}): () => Player {
  return () => makePlayer(attrs);
}

function makeManager(overrides: Partial<TransferManagerConfig> = {}): TransferManager {
  return new TransferManager({
    marketSize: 5,
    listingDuration: 3,
    playerFactory: makePlayerFactory(),
    ...overrides,
  });
}

// Minimal ClubManager for purchase tests
function makeClubManager(budget: number): ClubManager {
  const squad: Player[] = Array.from({ length: 15 }, (_, i) => ({
    id: `sq-${i}`, name: `Squad ${i}`, nationality: 'norwegian', age: 25,
    position: 'CM' as const, potential: 70,
    attributes: makeAttrs(),
  }));
  return new ClubManager({
    clubId: 'club-1', clubName: 'Test FC', divisionId: 'div1',
    squad, budget,
    formation: '4-4-2' as Formation,
    startingXI: squad.slice(0, 11).map(p => p.id),
    benchPlayers: squad.slice(11, 15).map(p => p.id),
    stadiumCapacity: 10_000,
    stadiumSectors: {},
  });
}

// ── TransferManager initial state ─────────────────────────────────────────────

describe('TransferManager:', () => {
  describe('initial state:', () => {
    test('generates marketSize listings on construction', () => {
      expect(makeManager({ marketSize: 5 }).getListings()).toHaveLength(5);
    });

    test('each listing has a unique string id', () => {
      const ids = makeManager().getListings().map(l => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('each listing has an askingPrice > 0', () => {
      makeManager().getListings().forEach(l => expect(l.askingPrice).toBeGreaterThan(0));
    });

    test('each listing player has fitness 100', () => {
      makeManager().getListings().forEach(l => expect(l.player.fitness).toBe(100));
    });

    test('refreshedOnMatchday is 0', () => {
      expect(makeManager().getState().refreshedOnMatchday).toBe(0);
    });

    test('initial listings expire at matchday 0 + listingDuration', () => {
      const manager = makeManager({ listingDuration: 4 });
      manager.getListings().forEach(l => expect(l.expiresOnMatchday).toBe(4));
    });

    test('askingPrice scales with player quality', () => {
      const cheapManager = new TransferManager({
        marketSize: 1,
        playerFactory: makePlayerFactory({ finishing: 5, technique: 5 }),
      });
      const expensiveManager = new TransferManager({
        marketSize: 1,
        playerFactory: makePlayerFactory({ finishing: 18, technique: 18 }),
      });
      expect(expensiveManager.getListings()[0].askingPrice)
        .toBeGreaterThan(cheapManager.getListings()[0].askingPrice);
    });
  });

  describe('default player factory:', () => {
    test('picks positions from POSITIONS using the injected rng', () => {
      // No playerFactory → built-in factory: position = POSITIONS[floor(rng * 10)].
      // rng 0.5 → floor(5) = 5 → 'LM'.
      const manager = new TransferManager({ marketSize: 4, rng: () => 0.5 });
      expect(manager.getListings()).toHaveLength(4);
      expect(manager.getListings().every(l => l.player.position === 'LM')).toBe(true);
    });
  });

  describe('getActiveListings:', () => {
    test('all listings are active at matchday 0', () => {
      const manager = makeManager({ listingDuration: 3 });
      expect(manager.getActiveListings(0)).toHaveLength(5);
    });

    test('all listings are active before expiry matchday', () => {
      const manager = makeManager({ listingDuration: 3 });
      expect(manager.getActiveListings(2)).toHaveLength(5); // 3 > 2
    });

    test('all listings are expired at their expiry matchday', () => {
      const manager = makeManager({ listingDuration: 3 });
      expect(manager.getActiveListings(3)).toHaveLength(0); // 3 > 3 is false
    });

    test('returns empty array when all listings have expired', () => {
      const manager = makeManager({ listingDuration: 3 });
      expect(manager.getActiveListings(10)).toHaveLength(0);
    });
  });

  describe('refreshMarket:', () => {
    test('removes all expired listings', () => {
      const manager = makeManager({ listingDuration: 3 });
      manager.refreshMarket(5); // expiry was 3, now past
      // after refresh at md 5: old listings removed, 5 new ones added
      expect(manager.getListings()).toHaveLength(5);
    });

    test('new listings expire at currentMatchday + listingDuration', () => {
      const manager = makeManager({ listingDuration: 3 });
      manager.refreshMarket(5);
      manager.getListings().forEach(l => expect(l.expiresOnMatchday).toBe(8));
    });

    test('updates refreshedOnMatchday', () => {
      const manager = makeManager();
      manager.refreshMarket(7);
      expect(manager.getState().refreshedOnMatchday).toBe(7);
    });

    test('preserves unexpired listings and only tops up', () => {
      const manager = makeManager({ listingDuration: 5, marketSize: 5 });
      // At md 0: listings expire at 5. At md 3 they're still active (5 > 3).
      manager.refreshMarket(3);
      // All 5 original listings still valid → 0 new ones needed → still 5 total
      expect(manager.getListings()).toHaveLength(5);
    });

    test('tops up to marketSize when some listings expired', () => {
      // Create manager with 2 short-lived listings initially, then add 3 longer ones
      const factory = makePlayerFactory();
      const manager = new TransferManager({ marketSize: 5, listingDuration: 2, playerFactory: factory });
      // All 5 listings expire at md 2. At md 3 all expired → generates 5 new.
      manager.refreshMarket(3);
      expect(manager.getListings()).toHaveLength(5);
    });
  });

  describe('purchase:', () => {
    test('returns true when club has sufficient budget', () => {
      const manager = makeManager();
      const listing = manager.getListings()[0];
      const club = makeClubManager(listing.askingPrice * 2);
      expect(manager.purchase(listing.id, club)).toBe(true);
    });

    test('removes listing from market after successful purchase', () => {
      const manager = makeManager({ marketSize: 5 });
      const listing = manager.getListings()[0];
      const club = makeClubManager(listing.askingPrice * 2);
      manager.purchase(listing.id, club);
      expect(manager.getListings().map(l => l.id)).not.toContain(listing.id);
      expect(manager.getListings()).toHaveLength(4);
    });

    test('adds player to ClubManager squad', () => {
      const manager = makeManager();
      const listing = manager.getListings()[0];
      const club = makeClubManager(listing.askingPrice * 2);
      const squadBefore = club.getState().squad.length;
      manager.purchase(listing.id, club);
      expect(club.getState().squad).toHaveLength(squadBefore + 1);
      expect(club.getState().squad.find(p => p.id === listing.player.id)).toBeDefined();
    });

    test('deducts asking price from club budget', () => {
      const manager = makeManager();
      const listing = manager.getListings()[0];
      const budget = listing.askingPrice * 3;
      const club = makeClubManager(budget);
      manager.purchase(listing.id, club);
      expect(club.getState().budget).toBe(budget - listing.askingPrice);
    });

    test('returns false when club budget is insufficient', () => {
      const manager = makeManager();
      const listing = manager.getListings()[0];
      const club = makeClubManager(listing.askingPrice - 1);
      expect(manager.purchase(listing.id, club)).toBe(false);
    });

    test('does not remove listing when purchase fails due to budget', () => {
      const manager = makeManager({ marketSize: 5 });
      const listing = manager.getListings()[0];
      const club = makeClubManager(0);
      manager.purchase(listing.id, club);
      expect(manager.getListings()).toHaveLength(5);
    });

    test('returns false for unknown listing id', () => {
      const manager = makeManager();
      const club = makeClubManager(1_000_000);
      expect(manager.purchase('nonexistent-id', club)).toBe(false);
    });

    test('does not change state for unknown listing id', () => {
      const manager = makeManager({ marketSize: 5 });
      const club = makeClubManager(1_000_000);
      manager.purchase('nonexistent-id', club);
      expect(manager.getListings()).toHaveLength(5);
    });

    test('each listing can only be purchased once', () => {
      const manager = makeManager();
      const listing = manager.getListings()[0];
      const club = makeClubManager(listing.askingPrice * 10);
      manager.purchase(listing.id, club);
      const secondAttempt = manager.purchase(listing.id, club);
      expect(secondAttempt).toBe(false);
    });
  });

  describe('free-agent pool:', () => {
    test('starts empty', () => {
      expect(makeManager().getFreeAgents()).toHaveLength(0);
    });

    test('addFreeAgents adds players to the pool', () => {
      const manager = makeManager();
      manager.addFreeAgents([makePlayer(), makePlayer()]);
      expect(manager.getFreeAgents()).toHaveLength(2);
    });

    test('refresh lists free agents (e.g. sold players) before generating fresh ones', () => {
      const manager = makeManager({ marketSize: 5, listingDuration: 3 });
      const sold = makePlayer({ finishing: 18, technique: 18 });
      manager.addFreeAgents([sold]);
      manager.refreshMarket(3); // all initial listings expired (dur 3) → refill 5 from pool then factory
      expect(manager.getListings().some(l => l.player.id === sold.id)).toBe(true);
      expect(manager.getFreeAgents()).toHaveLength(0); // drawn out of the pool
    });

    test('a listed free agent can be purchased and leaves the market', () => {
      const manager = makeManager({ marketSize: 5, listingDuration: 3 });
      const sold = makePlayer();
      manager.addFreeAgents([sold]);
      manager.refreshMarket(3);
      const listing = assertDefined(manager.getListings().find(l => l.player.id === sold.id), 'listing not found');
      const club = makeClubManager(listing.askingPrice * 2);
      expect(manager.purchase(listing.id, club)).toBe(true);
      expect(manager.getListings().some(l => l.id === listing.id)).toBe(false);
    });
  });

  describe('subscribe:', () => {
    test('notifies listener when market is refreshed', () => {
      const manager = makeManager();
      let callCount = 0;
      manager.subscribe(() => { callCount++; });
      manager.refreshMarket(5);
      expect(callCount).toBeGreaterThan(0);
    });

    test('notifies listener on successful purchase', () => {
      const manager = makeManager();
      let callCount = 0;
      manager.subscribe(() => { callCount++; });
      const listing = manager.getListings()[0];
      const club = makeClubManager(listing.askingPrice * 2);
      manager.purchase(listing.id, club);
      expect(callCount).toBeGreaterThan(0);
    });

    test('returns unsubscribe function that stops notifications', () => {
      const manager = makeManager();
      let callCount = 0;
      const unsub = manager.subscribe(() => { callCount++; });
      unsub();
      manager.refreshMarket(5);
      expect(callCount).toBe(0);
    });
  });
});
