/**
 * Goals (PLAN.md §3): three active goals, replaced from a tiered pool when completed. Single-run goals
 * remember the best attempt so far; cumulative goals add up across runs. Pure logic, no DOM.
 */
import { CFG } from '../config';
import type { RunStats } from './world';

export interface RunSnapshot {
  distance: number;
  stats: RunStats;
  zone: number;
}

type Metric = (r: RunSnapshot) => number;

export interface GoalDef {
  id: string;
  tier: number; // 1..4 (5 = generated)
  text: string;
  target: number;
  unit: string;
  /** 'run' = achieve within one run; 'total' = accumulate across runs */
  kind: 'run' | 'total';
  metric: Metric;
}

const M = {
  dist: (r: RunSnapshot) => r.distance,
  shells: (r: RunSnapshot) => r.stats.shells,
  hops: (r: RunSnapshot) => r.stats.hops,
  lanes: (r: RunSnapshot) => r.stats.laneChanges,
  powerups: (r: RunSnapshot) => r.stats.powerups,
  waves: (r: RunSnapshot) => r.stats.wavesHopped,
  riders: (r: RunSnapshot) => r.stats.powerKinds.rider,
  shaves: (r: RunSnapshot) => r.stats.closeShaves,
  noShell: (r: RunSnapshot) => r.stats.maxDistNoShell,
  noHop: (r: RunSnapshot) => r.stats.maxDistNoHop,
  streak: (r: RunSnapshot) => r.stats.maxStreak,
  hopped: (r: RunSnapshot) => r.stats.obstaclesHopped,
  fevers: (r: RunSnapshot) => r.stats.fevers ?? 0,
  zone: (r: RunSnapshot) => r.zone,
  runs: () => 1,
};

const g = (id: string, tier: number, text: string, target: number, unit: string, metric: Metric, kind: 'run' | 'total' = 'run'): GoalDef => ({ id, tier, text, target, unit, kind, metric });

export const GOAL_POOL: GoalDef[] = [
  // tier 1
  g('run300', 1, 'Run 300 m', 300, 'm', M.dist),
  g('shells60', 1, 'Collect 60 shells in one run', 60, '', M.shells),
  g('hop5', 1, 'Hop 5 times in one run', 5, '', M.hops),
  g('lanes25', 1, 'Switch lanes 25 times in one run', 25, '', M.lanes),
  g('power1', 1, 'Grab a power-up', 1, '', M.powerups),
  g('play3', 1, 'Play 3 runs', 3, '', M.runs, 'total'),
  // tier 2
  g('run800', 2, 'Run 800 m', 800, 'm', M.dist),
  g('shells150', 2, 'Collect 150 shells in one run', 150, '', M.shells),
  g('waves5', 2, 'Hop over 5 waves in one run', 5, '', M.waves),
  g('pier', 2, 'Reach Boardwalk Pier', 1, '', M.zone),
  g('rider1', 2, 'Ride the Wave Rider', 1, '', M.riders),
  g('shave3', 2, 'Get 3 close shaves in one run', 3, '', M.shaves),
  g('fever1', 2, 'Start a Shell Fever', 1, '', M.fevers),
  // tier 3
  g('run1500', 3, 'Run 1,500 m', 1500, 'm', M.dist),
  g('shells300', 3, 'Collect 300 shells in one run', 300, '', M.shells),
  g('noshell500', 3, 'Run 500 m without collecting a shell', 500, 'm', M.noShell),
  g('cove', 3, 'Reach Tide Pool Cove', 2, '', M.zone),
  g('streak30', 3, 'Get a shell streak of 30', 30, '', M.streak),
  g('power4', 3, 'Grab 4 power-ups in one run', 4, '', M.powerups),
  g('fever3', 3, 'Start 3 Shell Fevers in one run', 3, '', M.fevers),
  // tier 4
  g('run2500', 4, 'Run 2,500 m', 2500, 'm', M.dist),
  g('sunset', 4, 'Reach Sunset Lagoon', 3, '', M.zone),
  g('shells500', 4, 'Collect 500 shells in one run', 500, '', M.shells),
  g('nohop1000', 4, 'Run 1,000 m without hopping', 1000, 'm', M.noHop),
  g('hopped40', 4, 'Hop over 40 obstacles in one run', 40, '', M.hopped),
];

/** Endless goals once the pool is done: alternating distance and shell targets that keep growing. */
export function generatedGoal(n: number): GoalDef {
  if (n % 2 === 0) {
    const target = 3000 + Math.floor(n / 2) * 500;
    return g(`gen-run-${n}`, 5, `Run ${target.toLocaleString('en-US')} m`, target, 'm', M.dist);
  }
  const target = 600 + Math.floor(n / 2) * 100;
  return g(`gen-shells-${n}`, 5, `Collect ${target} shells in one run`, target, '', M.shells);
}

export function rewardFor(def: GoalDef): number {
  return (CFG.goalRewards[Math.min(def.tier, 4) - 1] as number) ?? 400;
}

const BY_ID = new Map(GOAL_POOL.map((d) => [d.id, d]));
export function goalById(id: string): GoalDef {
  const d = BY_ID.get(id);
  if (d) return d;
  const m = /^gen-(?:run|shells)-(\d+)$/.exec(id);
  if (m) return generatedGoal(Number(m[1]));
  throw new Error(`unknown goal ${id}`);
}

export interface GoalState {
  active: string[];
  completed: string[];
  progress: Record<string, number>;
}

export interface GoalProgressView {
  id: string;
  text: string;
  progress: number;
  value: string;
  reward: number;
  done: boolean;
}

export class Goals {
  /** goals completed during the current run (paid at the results screen) */
  pending: string[] = [];

  constructor(public state: GoalState) {
    this.refill();
  }

  /** Fill active slots from the lowest unfinished tier, then generated goals. */
  refill(): void {
    const s = this.state;
    s.active = s.active.filter((id) => {
      try {
        goalById(id);
        return !s.completed.includes(id);
      } catch {
        return false;
      }
    });
    for (const def of GOAL_POOL) {
      if (s.active.length >= 3) break;
      if (s.completed.includes(def.id) || s.active.includes(def.id)) continue;
      // only draw from a tier once all lower tiers are exhausted or active
      const lowerOpen = GOAL_POOL.some((d) => d.tier < def.tier && !s.completed.includes(d.id) && !s.active.includes(d.id));
      if (lowerOpen) continue;
      s.active.push(def.id);
    }
    let n = 0;
    while (s.active.length < 3 && n < 1000) {
      const def = generatedGoal(n++);
      if (!s.completed.includes(def.id) && !s.active.includes(def.id)) s.active.push(def.id);
    }
  }

  private value(def: GoalDef, run: RunSnapshot | null): number {
    const prev = this.state.progress[def.id] ?? 0;
    if (!run) return prev;
    const v = def.metric(run);
    return def.kind === 'total' ? prev + v : Math.max(prev, v);
  }

  /** Called during a run: returns goals that just got completed. */
  checkLive(run: RunSnapshot): GoalDef[] {
    const done: GoalDef[] = [];
    for (const id of this.state.active) {
      if (this.pending.includes(id)) continue;
      const def = goalById(id);
      // total goals only count a run once it ends (e.g. "Play 3 runs")
      if (def.kind === 'total') continue;
      if (def.metric(run) >= def.target) {
        this.pending.push(id);
        done.push(def);
      }
    }
    return done;
  }

  /** Record the run, pay out completed goals, refill. */
  finishRun(run: RunSnapshot): { completed: GoalDef[]; reward: number } {
    const completed: GoalDef[] = [];
    for (const id of [...this.state.active]) {
      const def = goalById(id);
      const v = this.value(def, run);
      this.state.progress[id] = v;
      if (v >= def.target || this.pending.includes(id)) completed.push(def);
    }
    let reward = 0;
    for (const def of completed) {
      reward += rewardFor(def);
      this.state.completed.push(def.id);
      delete this.state.progress[def.id];
    }
    this.pending = [];
    this.refill();
    return { completed, reward };
  }

  views(run: RunSnapshot | null = null): GoalProgressView[] {
    return this.state.active.map((id) => {
      const def = goalById(id);
      const done = this.pending.includes(id);
      const v = done ? def.target : run && def.kind === 'run' ? Math.max(this.value(def, null), def.metric(run)) : this.value(def, null);
      const shown = def.id === 'pier' || def.id === 'cove' || def.id === 'sunset' ? (done ? 1 : 0) : Math.min(v, def.target);
      const target = def.id === 'pier' || def.id === 'cove' || def.id === 'sunset' ? 1 : def.target;
      return {
        id,
        text: def.text,
        progress: done ? 1 : Math.min(1, shown / target),
        value: `${Math.floor(shown).toLocaleString('en-US')} / ${target.toLocaleString('en-US')}${def.unit ? ` ${def.unit}` : ''}`,
        reward: rewardFor(def),
        done,
      };
    });
  }
}
