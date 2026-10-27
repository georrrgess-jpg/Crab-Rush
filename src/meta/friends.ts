/**
 * Crab friends (UPDATE3_PLAN.md §6.1), pure: six NPC crabs move into the Cove as its Comfort grows.
 * Each offers a chain of three quests that track lifetime progress in every mode (measured from when
 * the quest was accepted), paying pearls, a decoration and finally the friend's hat.
 */
import type { Metrics } from './achievements';

export interface QuestDef {
  text: string;
  metric: keyof Metrics;
  target: number;
  pearls: number;
  /** a decoration (src/meta/cove.ts id) or a wardrobe hat ("hat:id") given with the reward */
  gift?: string;
}

export interface FriendDef {
  id: string;
  name: string;
  /** Comfort needed for them to move in */
  comfort: number;
  body: number;
  dark: number;
  belly: number;
  line: string;
  quests: [QuestDef, QuestDef, QuestDef];
}

const q = (text: string, metric: keyof Metrics, target: number, pearls: number, gift?: string): QuestDef => ({ text, metric, target, pearls, gift });

export const FRIENDS: FriendDef[] = [
  {
    id: 'shelly', name: 'Shelly', comfort: 10, body: 0xff9ab8, dark: 0xd8507a, belly: 0xffe0ec, line: 'Ooh, a Cove! Can I stay? I love shiny shells.',
    quests: [q('Collect 300 shells', 'shells', 300, 5), q('Hop 40 times', 'hops', 40, 8, 'flowers'), q('Collect 2,000 shells', 'shells', 2000, 15, 'hat:sunflower')],
  },
  {
    id: 'barnacle', name: 'Captain Barnacle', comfort: 30, body: 0x4a7ab8, dark: 0x2a4a80, belly: 0xc8dcff, line: 'Ahoy! A fine harbour. Show me some seamanship!',
    quests: [q('Run 3,000 m in total', 'distance', 3000, 6), q('Hop 15 waves', 'waves', 15, 10, 'net'), q('Earn 12 Island Hop stars', 'stars', 12, 18, 'hat:captain')],
  },
  {
    id: 'coco', name: 'Coco', comfort: 60, body: 0x8a5a34, dark: 0x5a3418, belly: 0xf2d0a0, line: 'I fell out of a palm tree. Coconuts everywhere!',
    quests: [q('Play 10 runs or levels', 'runs', 10, 6), q('5 close shaves', 'closeShaves', 5, 10, 'palms'), q('Earn 3 Tide Rush crowns', 'crowns', 3, 20, 'hat:propeller')],
  },
  {
    id: 'pip', name: 'Pip', comfort: 100, body: 0x7ad85a, dark: 0x3a9a2a, belly: 0xe0ffd0, line: 'Hi hi hi! Can we race? Please please please?',
    quests: [q('Reach 1,000 m in one run', 'best', 1000, 8), q('Grab 10 power-ups', 'powerups', 10, 12, 'surfboards'), q('Reach 3,000 m in one run', 'best', 3000, 25, 'hat:beanie')],
  },
  {
    id: 'granny', name: 'Granny Pinch', comfort: 150, body: 0xb0a0c8, dark: 0x7a6a98, belly: 0xf0e8ff, line: 'In my day we scuttled uphill both ways. Lovely cove, dear.',
    quests: [q('A 3-day Daily Tide streak', 'streak', 3, 10), q('Own 12 wardrobe items', 'items', 12, 14, 'hammock'), q('Earn 36 Island Hop stars', 'stars', 36, 30, 'hat:flower')],
  },
  {
    id: 'dj', name: 'DJ Claws', comfort: 210, body: 0x3a3a48, dark: 0x1e1e28, belly: 0xff5ab0, line: 'Yo! This beach needs a beat. Let us turn it up!',
    quests: [q('Reach Sunny Pass tier 10', 'tier', 10, 12), q('Collect 10,000 shells', 'shells', 10000, 20, 'lanterns'), q('Reach Sunny Pass tier 25', 'tier', 25, 40, 'hat:headphones')],
  },
];
export const FRIEND_BY_ID = new Map(FRIENDS.map((f) => [f.id, f]));

export interface FriendsState {
  /** friends who have moved in, in order */
  moved: string[];
  /** per friend: the active quest (3 = all done) and the metric value when it was accepted */
  quests: Record<string, { idx: number; base: number }>;
}

export function defaultFriends(): FriendsState {
  return { moved: [], quests: {} };
}

/** Move in everyone the Comfort allows; returns the newcomers. */
export function moveIn(s: FriendsState, comf: number, m: Metrics): string[] {
  const out: string[] = [];
  for (const f of FRIENDS) {
    if (s.moved.includes(f.id) || comf < f.comfort) continue;
    s.moved.push(f.id);
    s.quests[f.id] = { idx: 0, base: questBase(f.quests[0].metric, m) };
    out.push(f.id);
  }
  return out;
}

/** "best"-style metrics count from zero; totals count from when the quest started */
function questBase(metric: keyof Metrics, m: Metrics): number {
  return metric === 'best' || metric === 'streak' || metric === 'tier' || metric === 'stars' || metric === 'items' || metric === 'crowns' ? 0 : m[metric];
}

export function questProgress(s: FriendsState, id: string, m: Metrics): { quest: QuestDef | null; have: number; done: boolean } {
  const f = FRIEND_BY_ID.get(id);
  const st = s.quests[id];
  if (!f || !st || st.idx >= 3) return { quest: null, have: 0, done: false };
  const qd = f.quests[st.idx] as QuestDef;
  const have = Math.max(0, m[qd.metric] - st.base);
  return { quest: qd, have: Math.min(have, qd.target), done: have >= qd.target };
}

/** Claim a finished quest: returns its reward and starts the next one. */
export function claimQuest(s: FriendsState, id: string, m: Metrics): QuestDef | null {
  const p = questProgress(s, id, m);
  if (!p.quest || !p.done) return null;
  const st = s.quests[id] as { idx: number; base: number };
  st.idx++;
  const f = FRIEND_BY_ID.get(id) as FriendDef;
  if (st.idx < 3) st.base = questBase((f.quests[st.idx] as QuestDef).metric, m);
  return p.quest;
}
