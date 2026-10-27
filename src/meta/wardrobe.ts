/** Wardrobe catalogue and ownership rules (UPDATE2_PLAN.md §6.3). Pure. */
export type Slot = 'bodies' | 'hats' | 'trails' | 'dances';

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  /** human-readable source shown on locked items */
  source: string;
}

const it = (slot: Slot, id: string, name: string, source: string): Item => ({ id, name, slot, source });

export const ITEMS: Item[] = [
  // bodies: the v1 crabs keep their v1 sources
  it('bodies', 'sandy', 'Sandy', 'Starter'),
  it('bodies', 'chill', 'Chill', 'Shells'),
  it('bodies', 'blossom', 'Blossom', 'Shells'),
  it('bodies', 'skipper', 'Skipper', 'Shells'),
  it('bodies', 'pinch', "Cap'n Pinch", 'Shells'),
  it('bodies', 'dazzle', 'Dazzle', 'Reach Sunset Lagoon'),
  it('bodies', 'coral', 'Coral', 'Sunny Pass tier 8'),
  it('bodies', 'midnight', 'Midnight', 'Sunny Pass tier 24'),
  it('bodies', 'reef', 'Reef', 'Open an Island Hop treasure chest'),
  it('bodies', 'lava', 'Lava', 'Earn 12 Tide Rush crowns'),
  it('bodies', 'pearl', 'Pearl', 'Crab Cove: 300 pearls'),
  it('bodies', 'gold', 'Golden Crab', 'Earn all 72 Island Hop stars'),
  // hats: v1 six + 12 new
  it('hats', 'straw', 'Straw Hat', 'Starter'),
  it('hats', 'shades', 'Shades', 'Comes with Chill'),
  it('hats', 'flower', 'Hibiscus', 'Comes with Blossom'),
  it('hats', 'captain', "Captain's Hat", 'Comes with Skipper'),
  it('hats', 'pirate', 'Tricorn', "Comes with Cap'n Pinch"),
  it('hats', 'tophat', 'Top Hat', 'Comes with Dazzle'),
  it('hats', 'none', 'No Hat', 'Starter'),
  it('hats', 'parrot', 'Parrot Pal', 'Sunny Pass tier 5'),
  it('hats', 'sunflower', 'Sunflower', 'Sunny Pass tier 10'),
  it('hats', 'beanie', 'Beanie', 'Sunny Pass tier 15'),
  it('hats', 'snorkel', 'Snorkel Mask', 'Complete Tide Pool Cove'),
  it('hats', 'crown', 'Crown', 'Sunny Pass tier 40'),
  it('hats', 'chef', 'Chef Hat', 'Sunny Pass tier 20'),
  it('hats', 'propeller', 'Propeller Cap', 'Complete Sunny Shore'),
  it('hats', 'flowercrown', 'Flower Crown', '7-day Daily Tide streak'),
  it('hats', 'headphones', 'Headphones', 'Sunny Pass tier 30'),
  it('hats', 'bucket', 'Bucket Hat', 'Complete Boardwalk Pier'),
  it('hats', 'viking', 'Viking Helmet', 'Sunny Pass tier 35'),
  it('hats', 'halo', 'Halo', 'Complete Sunset Lagoon'),
  // trails
  it('trails', 'sand', 'Sand Puffs', 'Starter'),
  it('trails', 'bubbles', 'Bubbles', 'Sunny Pass tier 3'),
  it('trails', 'petals', 'Petals', 'Sunny Pass tier 13'),
  it('trails', 'sparkles', 'Sparkles', 'Sunny Pass tier 18'),
  it('trails', 'notes', 'Music Notes', 'Sunny Pass tier 28'),
  it('trails', 'rainbow', 'Rainbow', 'Sunny Pass tier 38'),
  // victory dances
  it('dances', 'clap', 'Claw Clap', 'Starter'),
  it('dances', 'spin', 'Hop Spin', 'Sunny Pass tier 6'),
  it('dances', 'wave', 'Big Wave', 'Sunny Pass tier 16'),
  it('dances', 'shimmy', 'Shimmy', 'Sunny Pass tier 22'),
  it('dances', 'hattoss', 'Hat Toss', 'Sunny Pass tier 33'),
  it('dances', 'moonwalk', 'Moonscuttle', '30-day Daily Tide streak'),
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [`${i.slot}:${i.id}`, i]));

/** The hat each v1 crab came with. */
export const V1_CRAB_HATS: Record<string, string> = {
  sandy: 'straw',
  chill: 'shades',
  blossom: 'flower',
  skipper: 'captain',
  pinch: 'pirate',
  dazzle: 'tophat',
};

export interface WardrobeState {
  owned: Record<Slot, string[]>;
  equipped: { body: string; hat: string; trail: string; dance: string };
}

export function defaultWardrobe(): WardrobeState {
  return {
    owned: { bodies: ['sandy'], hats: ['straw', 'none'], trails: ['sand'], dances: ['clap'] },
    equipped: { body: 'sandy', hat: 'straw', trail: 'sand', dance: 'clap' },
  };
}

export function exists(slot: Slot, id: string): boolean {
  return ITEM_BY_ID.has(`${slot}:${id}`);
}

export function owns(w: WardrobeState, slot: Slot, id: string): boolean {
  return w.owned[slot].includes(id);
}

/** Grant an item; returns true if it was new. */
export function grant(w: WardrobeState, slot: Slot, id: string): boolean {
  if (!exists(slot, id) || owns(w, slot, id)) return false;
  w.owned[slot].push(id);
  return true;
}

const EQUIP_KEY: Record<Slot, keyof WardrobeState['equipped']> = { bodies: 'body', hats: 'hat', trails: 'trail', dances: 'dance' };

export function equip(w: WardrobeState, slot: Slot, id: string): boolean {
  if (!owns(w, slot, id)) return false;
  w.equipped[EQUIP_KEY[slot]] = id;
  return true;
}

/** Keep the wardrobe in step with v1-style crab ownership (each crab brings its body and hat). */
export function syncFromCrabs(w: WardrobeState, ownedCrabs: readonly string[]): void {
  for (const c of ownedCrabs) {
    grant(w, 'bodies', c);
    const hat = V1_CRAB_HATS[c];
    if (hat) grant(w, 'hats', hat);
  }
}

/** Owned items the player hasn't looked at yet ("slot:id"), optionally for one slot. */
export function unseen(w: WardrobeState, seen: readonly string[], slot?: Slot): string[] {
  const slots: Slot[] = slot ? [slot] : ['bodies', 'hats', 'trails', 'dances'];
  return slots.flatMap((sl) => w.owned[sl].map((id) => `${sl}:${id}`)).filter((k) => !seen.includes(k));
}
