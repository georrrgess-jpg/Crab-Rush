import * as THREE from 'three';
import { CFG, QUALITY, type QualityPreset } from './config';
import { Audio } from './core/audio';
import { DebugOverlay, parseFlags, type Flags } from './core/debug';
import { Input, type Action } from './core/input';
import { Loop } from './core/loop';
import { QualityManager } from './core/quality';
import { SaveStore, type Settings } from './core/save';
import { buyCrab, buyUpgrade, canBuyCrab, grantSkillUnlocks, nextUnlock, selectCrab, upgradeCost } from './sim/economy';
import { Goals, type RunSnapshot } from './sim/goals';
import { HowToScreen } from './ui/howto';
import { SettingsScreen, StatsScreen } from './ui/settings';
import { Haptics } from './core/haptics';
import { PASS_TIERS, tierFromXp, xpFor } from './meta/xp';
import { MAX_BOOSTS, PASS_REWARDS, claim, claimable, type Reward } from './meta/pass';
import { MODIFIERS, currentStreak, dateKey, modifierFor, recordFinish, seedFor, type Modifier } from './meta/daily';
import { PassScreen, rewardView } from './ui/pass';
import { DailyScreen, type DailyData } from './ui/daily';
import { DANCE_SVG, GIFT_SVG } from './ui/icons';
import type { HomeData } from './ui/home';
import { LevelEnd, LevelIntro, MapScreen, type MapData } from './ui/islands';
import { LEVELS, LEVEL_BY_ID } from './sim/levelData';
import { compileLevel, type CompiledLevel } from './sim/levels';
import { evalStars, ruleHud, ruleState, ruleText } from './sim/objectives';
import { ISLAND_NAMES, ISLAND_REWARD_HATS, TOTAL_STARS, applyLevelResult, islandComplete, islandStars, islandUnlocked, levelUnlocked, nextLevel, totalStars } from './meta/islands';
import { ITEMS, equip, grant, type Slot } from './meta/wardrobe';
import { HAT_KINDS, type HatKind } from './render/models/hats';
import type { TrailKind } from './render/materials';

const ITEM_NAMES: Record<string, string> = Object.fromEntries(ITEMS.filter((i) => i.slot === 'hats').map((i) => [i.id, i.name]));
import { ShopScreen } from './ui/shop';
import { Autopilot } from './sim/autopilot';
import type { GameEvent } from './sim/events';
import { World, defaultRunOptions, type RunOptions } from './sim/world';
import { pickQuality } from './render/renderer';
import { BODY_SKINS, CRAB_SKINS } from './render/models/crab';
import { GameView, type CamMode } from './render/view';
import { UI, type GoalView } from './ui/ui';
import { fmt } from './ui/dom';
import { ICON } from './ui/icons';
import type { PowerKind } from './sim/events';

type State = 'boot' | 'title' | 'intro' | 'running' | 'paused' | 'countdown' | 'crashing' | 'results' | 'shop' | 'settings' | 'howto' | 'stats'
  | 'map' | 'levelIntro' | 'finishing' | 'levelEnd' | 'pass' | 'daily';

const INTRO_TIME = 0.8;
const COUNTDOWN_STEP = 0.4;

export class Game {
  state: State = 'boot';
  readonly flags: Flags = parseFlags();
  readonly save: SaveStore;
  readonly world = new World();
  readonly view: GameView;
  readonly ui: UI;
  readonly input = new Input();
  readonly audio = new Audio();
  readonly haptics = new Haptics();
  readonly loop: Loop;
  private debug: DebugOverlay | null = null;
  private autopilot: Autopilot | null = null;
  private introT = 0;
  private crashClock = 0;
  private hitStop = 0;
  private countdownT = 0;
  private lastCount = 0;
  private resultsAt = 0;
  private clock = 0;
  private skipRender = false;
  private touchLayer: HTMLElement;
  private quality: QualityPreset;
  private qm: QualityManager;
  private returnTo: State = 'title';
  private runStartedWithTutorial = false;
  lastResults: Record<string, number | boolean | string> = {};
  private goals: Goals;
  private shop: ShopScreen;
  private settings: SettingsScreen;
  private howto: HowToScreen;
  private stats: StatsScreen;
  private statsReturn: State = 'title';
  // Island Hop
  private map: MapScreen;
  private levelIntro: LevelIntro;
  private levelEnd: LevelEnd;
  private currentLevel: string | null = null;
  private compiled = new Map<string, CompiledLevel>();
  private finishClock = 0;
  private goalCheckT = 0;
  private thumbsReady = false;
  // Sunny Pass, Daily Tide, boosts (Phase F)
  private passScreen: PassScreen;
  private dailyScreen: DailyScreen;
  /** the Home Play card's Golden Shell toggle */
  private boostOn = false;
  /** this run spends a Golden Shell (2× shells at the end) */
  private runBoost = false;
  /** the current/last run is a Daily Tide run */
  private dailyRun = false;
  private runModifier: Modifier | null = null;
  /** test hook: a fixed "now" (ms) for Daily Tide dates */
  private fakeNow: number | null = null;
  private tierToast = 0;
  private rumbleT = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.save = new SaveStore();
    if (this.flags.reset) this.save.reset();
    this.quality = pickQuality(this.flags.quality, this.save.data.settings.quality);
    this.view = new GameView(canvas, this.quality);
    this.qm = new QualityManager(this.quality, this.autoQuality);
    this.tagQuality();
    const app = document.getElementById('app') as HTMLElement;
    this.touchLayer = document.getElementById('touch-layer') as HTMLElement;
    this.ui = new UI(
      document.getElementById('ui') as HTMLElement,
      {
        pause: () => this.pause(),
        resume: () => this.resume(),
        restart: () => this.restart(),
        home: () => this.goHome(),
        openSettings: () => this.openSettings(),
        touch: (a) => this.onAction(a, false),
        tap: () => this.audio.play('tap'),
      },
      {
        play: () => this.onPlay(),
        islands: () => this.openMap(),
        daily: () => this.openDaily(),
        wardrobe: () => this.openShop(),
        pass: () => this.openPass(),
        settings: () => this.openSettings(),
        howto: () => this.openHowTo(),
        stats: () => this.openStats(),
        poke: () => {
          this.audio.play('tap');
          this.haptics.play('light');
          this.view.crab.emote();
        },
        toggleBoost: () => {
          if (this.save.data.boosts <= 0) return;
          this.boostOn = !this.boostOn;
          this.audio.play(this.boostOn ? 'powerup' : 'tap');
          this.haptics.play('light');
          this.ui.setHome(this.homeData());
          if (this.boostOn) this.ui.toast('Golden Shell ready!', { kind: 'gold', sub: 'Your next Beach Run pays 2× shells', life: 2 });
        },
      },
      {
        again: () => this.restart(),
        home: () => this.goHome(),
        wardrobe: () => this.openShop(),
        tick: () => this.audio.play('tick'),
        pop: () => this.audio.play('pop'),
        levelUp: (tier) => {
          this.audio.play('levelUp');
          this.haptics.play('success');
          // several tiers in one fill: one toast for the last
          clearTimeout(this.tierToast);
          this.tierToast = window.setTimeout(() => this.ui.toast(`Sunny Pass tier ${tier}!`, { kind: 'gold', sub: 'Rewards are waiting on the Pass', life: 2.2 }), 450);
        },
      },
    );
    this.goals = new Goals(this.save.data.goals);
    this.shop = new ShopScreen(BODY_SKINS, {
      back: () => this.closeOverlay(),
      preview: (slot, id) => this.previewItem(slot, id),
      equip: (slot, id) => {
        const d = this.save.data;
        if (equip(d.wardrobe, slot, id)) {
          // keep the v1 field in step so economy / migration stay consistent
          if (slot === 'bodies' && d.crabs.owned.includes(id)) d.crabs.selected = id;
          this.save.save();
          this.audio.play('equip');
          this.haptics.play('light');
          this.previewItem(slot, id);
        }
        this.shop.render(d);
      },
      buyCrab: (id) => {
        if (buyCrab(this.save.data, id)) {
          this.save.save();
          this.audio.play('purchase');
          this.applyLook();
          this.ui.toast(`${this.skinOf(id).name} unlocked!`, { kind: 'gold' });
        } else this.audio.play('deny');
        this.shop.render(this.save.data);
      },
      buyUpgrade: (k: PowerKind) => {
        if (buyUpgrade(this.save.data, k)) {
          this.save.save();
          this.audio.play('purchase');
        } else this.audio.play('deny');
        this.shop.render(this.save.data);
      },
    });
    this.settings = new SettingsScreen({
      change: (st) => this.applySettings(st),
      reset: () => {
        this.save.reset();
        this.goals = new Goals(this.save.data.goals);
        this.applyLook();
        this.ui.toast('Progress erased');
      },
      back: () => this.closeOverlay(),
      stats: () => this.openStats(),
    });
    this.howto = new HowToScreen(() => this.closeOverlay());
    this.passScreen = new PassScreen({
      back: () => this.closeOverlay(),
      claim: (t) => this.claimTiers([t]),
      claimAll: () => this.claimTiers(claimable(this.save.data)),
    });
    this.dailyScreen = new DailyScreen({
      back: () => this.closeOverlay(),
      play: () => this.playDaily(),
    });
    this.stats = new StatsScreen(() => this.closeStats());
    this.map = new MapScreen({ back: () => this.closeOverlay(), open: (id) => this.openLevel(id) });
    this.levelIntro = new LevelIntro({ play: (id) => this.playLevel(id), back: () => this.openMap() });
    this.levelEnd = new LevelEnd({
      retry: () => this.retryLevel(),
      next: () => {
        const n = this.nextLevelId();
        if (n) this.openLevel(n);
        else this.openMap();
      },
      map: () => this.openMap(),
      star: (i: number) => {
        // three rising stamps
        this.audio.play('star', { pitch: i * 4 });
        this.haptics.play('light');
      },
    });
    this.ui.addScreen(this.shop.el);
    this.ui.addScreen(this.settings.el);
    this.ui.addScreen(this.howto.el);
    this.ui.addScreen(this.stats.el);
    this.ui.addScreen(this.map.el);
    this.ui.addScreen(this.levelIntro.el);
    this.ui.addScreen(this.levelEnd.el);
    this.ui.addScreen(this.passScreen.el);
    this.ui.addScreen(this.dailyScreen.el);
    this.input.attachSurface(this.touchLayer);
    this.input.onAction = (a, c) => this.onAction(a, !!c);
    this.loop = new Loop({ step: (dt) => this.step(dt), render: (a, dt) => this.render(a, dt) }, CFG.simHz);
    if (this.flags.debug) this.debug = new DebugOverlay(app);

    this.audio.setVolumes(this.save.data.settings.music, this.save.data.settings.sfx);
    this.applyLook();
    this.view.setReduceMotion(this.reduceMotion);
    this.applyControlSettings();
    // desktop: the crab's eyes follow the cursor on Home
    window.addEventListener('pointermove', (e) => {
      if (this.state !== 'title' || e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      this.view.crab.look(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    });

    // viewport: pause on real size/orientation changes, not on small toolbar jitters
    let lastW = 0;
    let lastH = 0;
    const resize = (): void => {
      const r = app.getBoundingClientRect();
      this.view.resize(r.width, r.height);
      const big = lastW > 0 && (Math.abs(r.width - lastW) / lastW > 0.1 || Math.abs(r.height - lastH) / lastH > 0.2);
      lastW = r.width;
      lastH = r.height;
      if (big && (this.state === 'running' || this.state === 'intro')) this.pause();
    };
    new ResizeObserver(resize).observe(app);
    resize();
    // auto-pause
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
        this.loop.resetClock();
      }
    });
    window.addEventListener('blur', () => this.pause());
    window.addEventListener('pagehide', () => this.save.save());
    // audio unlock on user gestures (iOS needs it inside the gesture; unlock() is idempotent and
    // also resumes a context the OS suspended)
    const unlock = (): void => {
      if (!this.flags.shots) this.audio.unlock();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(ev, unlock, true);
    this.view.renderer.onContextLost = () => {
      this.pause();
      this.ui.toast('Graphics were reset', { sub: 'Tap to reload', life: 60 });
      window.addEventListener('pointerdown', () => location.reload(), { once: true });
    };

    this.installHooks();
  }

  private get autoQuality(): boolean {
    return !this.flags.quality && this.save.data.settings.quality === 'auto';
  }

  /** Apply a tier change the auto-quality manager asked for (only between runs: it rebuilds scenery). */
  /** CSS hooks for tier-dependent overlays (e.g. the vignette is off on Low). */
  private tagQuality(): void {
    const app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('q-low', 'q-medium', 'q-high');
    app.classList.add(`q-${this.quality.name}`);
  }

  private applyPendingQuality(): void {
    const p = this.qm.takePending();
    if (!p) return;
    this.quality = p;
    this.view.setQuality(p);
    this.view.renderer.setDprScale(1);
    this.tagQuality();
  }

  get reduceMotion(): boolean {
    const s = this.save.data.settings.reduceMotion;
    if (s !== null) return s;
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  boot(): void {
    this.toTitle();
    this.loop.manual = this.flags.shots;
    this.loop.start();
    this.loop.tick(1 / 60);
    // repaint canvas signs when fonts arrive
    document.fonts?.ready.then(() => this.view.entities.refreshSigns()).catch(() => {});
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('done');
      setTimeout(() => loader.remove(), 500);
    }
    if (this.flags.autopilot && !this.flags.shots) this.startRun(true);
    const hooks = (window as unknown as { __crab?: { ready: boolean } }).__crab;
    if (hooks) hooks.ready = true;
    setTimeout(() => this.prepareThumbs(), 1200);
  }

  // ------------------------------------------------------------------ flow
  toTitle(): void {
    this.state = 'title';
    this.currentLevel = null;
    this.setModifierView(null);
    this.dailyScreen.stop();
    this.audio.setTrack('beach');
    this.audio.setZone(0);
    this.audio.setRumble(0);
    this.ui.setLevelHUD(null);
    this.levelEnd.hide();
    this.applyPendingQuality();
    this.resetWorldToBeach();
    this.input.setPointerEnabled(false);
    this.touchLayer.classList.remove('active');
    this.ui.setHome(this.homeData());
    this.ui.show('title');
    this.maybeShowInstallTip();
    this.audio.setMusicMode('menu');
  }

  private onPlay(): void {
    if (this.state !== 'title') return;
    if (!this.flags.shots) this.audio.unlock();
    this.audio.play('tap');
    this.dailyRun = false;
    this.startRun(true);
  }

  private buildRunOptions(): RunOptions {
    const d = this.save.data;
    const opts = defaultRunOptions();
    opts.seed = this.flags.seed ?? (Math.random() * 1e9) | 0;
    opts.startDist = this.flags.start;
    opts.god = this.flags.god;
    opts.best = d.best;
    opts.upgrades = { ...d.upgrades };
    opts.zonesSeen = [...d.zonesSeen];
    const skipTut = this.flags.notut || this.flags.autopilot || this.flags.start > 0;
    opts.tutorial = skipTut ? null : { ...d.tutorial };
    if (this.dailyRun) {
      // everyone gets the same course today
      const key = this.todayKey();
      opts.seed = seedFor(key);
      opts.modifier = modifierFor(key);
      opts.tutorial = null;
      opts.startDist = 0;
    }
    return opts;
  }

  startRun(withIntro: boolean): void {
    const opts = this.buildRunOptions();
    this.world.start(opts);
    this.runModifier = opts.modifier ?? null;
    this.setModifierView(this.runModifier);
    this.audio.setTrack('beach');
    this.audio.setZone(this.world.zone);
    // Golden Shell: spent at the start of a Beach Run (not on Daily Tide)
    this.runBoost = false;
    if (!this.dailyRun && this.boostOn && this.save.data.boosts > 0) {
      this.save.data.boosts--;
      this.runBoost = true;
      this.boostOn = false;
      this.save.save();
    }
    this.runStartedWithTutorial = this.world.tutorialActive;
    this.view.resetRun(opts.best);
    this.autopilot = this.flags.autopilot ? new Autopilot(this.world) : null;
    this.ui.resetHUD();
    this.ui.setLevelHUD(this.world.level ? { chase: !!this.world.level.def.chase } : null);
    this.ui.hideTutorial();
    this.ui.clearToasts();
    this.ui.show('hud');
    this.ui.hideExtras();
    this.ui.setTouchButtons(this.touchButtonsWanted());
    this.input.setPointerEnabled(true);
    this.touchLayer.classList.add('active');
    this.crashClock = 0;
    this.hitStop = 0;
    this.introT = withIntro ? 0 : 1;
    this.state = withIntro ? 'intro' : 'running';
    this.audio.setMusicMode('run');
    if (this.runBoost) this.ui.toast('Golden Shell!', { kind: 'gold', sub: '2× shells this run', life: 2 });
    if (this.runModifier) {
      const m = MODIFIERS.find((x) => x.id === this.runModifier)!;
      this.ui.toast(`Daily Tide: ${m.name}`, { kind: 'gold', sub: m.desc, life: 2.4 });
    }
    const st = this.save.data.stats;
    st.runs++;
    const body = this.save.data.wardrobe.equipped.body;
    st.runsByCrab[body] = (st.runsByCrab[body] ?? 0) + 1;
  }

  /** Data for the Home screen. */
  private homeData(): HomeData {
    const d = this.save.data;
    const t = tierFromXp(d.xp);
    return {
      best: d.best,
      shells: d.shells,
      tier: t.tier,
      maxTier: PASS_TIERS,
      tierInto: t.into,
      tierNeed: t.need,
      passClaimable: claimable(d).length,
      goals: this.goalViews(),
      crabName: this.skinOf(d.wardrobe.equipped.body).name,
      wardrobeBadge: this.anyAffordable(),
      islands: { stars: totalStars(d.levels), total: TOTAL_STARS },
      daily: (() => {
        const today = this.todayKey();
        return { streak: currentStreak(d.daily, today), playedToday: d.daily.lastDate === today, modifier: MODIFIERS.find((m) => m.id === modifierFor(today))!.name, msLeft: this.msToMidnight() };
      })(),
      keyboard: this.input.lastDevice === 'keyboard',
      boosts: d.boosts,
      boostOn: this.boostOn && d.boosts > 0,
      nextReward: this.nextRewardText(),
    };
  }

  // ------------------------------------------------------------------ Sunny Pass / Daily Tide
  private now(): number {
    return this.fakeNow ?? Date.now();
  }
  private todayKey(): string {
    return dateKey(new Date(this.now()));
  }
  private msToMidnight(): number {
    const d = new Date(this.now());
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return m.getTime() - d.getTime();
  }

  /** Mirror Beach flips the canvas (input is swapped in onAction); Night Run forces the night palette. */
  private setModifierView(m: Modifier | null): void {
    this.canvas.classList.toggle('mirrored', m === 'mirror');
    this.view.nightForce = m === 'nightRun' ? 1 : 0;
  }

  private itemName(r: Reward): string {
    return rewardView(r, this.shop.thumbs).name;
  }

  /** "Next: Parrot Pal in 2 tiers" for the Home pass pill. */
  private nextRewardText(): string | null {
    const tier = tierFromXp(this.save.data.xp).tier;
    const i = PASS_REWARDS.findIndex((r, k) => k + 1 > tier && r.kind === 'item');
    if (i < 0) return null;
    const left = i + 1 - tier;
    return `Next: ${this.itemName(PASS_REWARDS[i] as Reward)}${left > 1 ? ` in ${left} tiers` : ''}`;
  }

  private passData() {
    const d = this.save.data;
    const t = tierFromXp(d.xp);
    return { tier: t.tier, into: t.into, need: t.need, claimed: d.passClaimed, boosts: d.boosts, thumbs: this.shop.thumbs };
  }

  openPass(): void {
    if (this.state !== 'title' && this.state !== 'results') return;
    this.audio.play('tap');
    this.prepareThumbs();
    if (this.state === 'results') {
      this.ui.flashFade(() => {
        this.toTitle();
        this.showPass();
      });
      return;
    }
    this.showPass();
  }

  private showPass(): void {
    this.audio.play('whoosh');
    this.returnTo = 'title';
    this.state = 'pass';
    this.ui.home.hide();
    this.passScreen.render(this.passData());
    this.ui.showExtra(this.passScreen.el);
  }

  private claimTiers(tiers: number[]): void {
    const d = this.save.data;
    const got: Reward[] = [];
    for (const t of tiers) {
      const r = claim(d, t);
      if (!r) continue;
      got.push(r);
      this.passScreen.render(this.passData(), false);
      this.passScreen.burst(t);
    }
    if (got.length === 0) return;
    this.save.save();
    this.audio.play('claim');
    this.haptics.play('success');
    const items = got.filter((r) => r.kind === 'item');
    const shells = got.reduce((a, r) => a + (r.kind === 'shells' ? r.amount : 0), 0);
    const boosts = got.filter((r) => r.kind === 'boost').length;
    if (got.length === 1) {
      const r = got[0] as Reward;
      this.ui.toast(r.kind === 'item' ? `${this.itemName(r)} unlocked!` : r.kind === 'boost' ? 'Golden Shell!' : `+${r.amount} shells`, {
        kind: 'gold',
        sub: r.kind === 'item' ? 'Find it in the Wardrobe' : r.kind === 'boost' ? (d.boosts >= MAX_BOOSTS ? 'Boost slots full' : 'Turn it on from the Play card') : undefined,
        life: 2.2,
      });
    } else {
      const parts = [items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : '', shells ? `${shells} shells` : '', boosts ? `${boosts} Golden Shell${boosts > 1 ? 's' : ''}` : ''].filter(Boolean);
      this.ui.toast(`Claimed ${got.length} rewards!`, { kind: 'gold', sub: parts.join(' · '), life: 2.6 });
    }
  }

  private dailyData(): DailyData {
    const d = this.save.data;
    const today = this.todayKey();
    const week: DailyData['week'] = [];
    const base = new Date(this.now());
    for (let i = 6; i >= 0; i--) {
      const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const key = dateKey(day);
      week.push({ key, label: i === 0 ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' }), done: d.daily.history.includes(key), today: i === 0 });
    }
    const streak = currentStreak(d.daily, today);
    const crown = this.shop.thumbs.hats.flowercrown;
    return {
      today,
      modifier: modifierFor(today),
      streak,
      savers: d.daily.savers,
      bestToday: d.daily.bestDate === today ? d.daily.bestToday : 0,
      playedToday: d.daily.lastDate === today,
      week,
      msLeft: this.msToMidnight(),
      milestones: [
        { days: 7, name: 'Flower Crown', art: crown ? `<img alt="" src="${crown}">` : GIFT_SVG, got: d.wardrobe.owned.hats.includes('flowercrown') },
        { days: 30, name: 'Moonscuttle dance', art: DANCE_SVG.moonwalk as string, got: d.wardrobe.owned.dances.includes('moonwalk') },
      ],
      firstXp: xpFor({ daily: true, streak: streak > 0 ? d.daily.streak + 1 : 1 }),
    };
  }

  openDaily(): void {
    if (this.state !== 'title' && this.state !== 'results') return;
    this.audio.play('tap');
    this.prepareThumbs();
    if (this.state === 'results') {
      this.ui.flashFade(() => {
        this.toTitle();
        this.showDaily();
      });
      return;
    }
    this.showDaily();
  }

  private showDaily(): void {
    this.audio.play('whoosh');
    this.returnTo = 'title';
    this.state = 'daily';
    this.ui.home.hide();
    this.dailyScreen.render(this.dailyData());
    this.ui.showExtra(this.dailyScreen.el);
  }

  private playDaily(): void {
    if (this.state !== 'daily') return;
    if (!this.flags.shots) this.audio.unlock();
    this.audio.play('tap');
    this.dailyScreen.stop();
    this.dailyRun = true;
    this.startRun(true);
  }

  /** Which control hints to show: touch on phones/tablets, keyboard on computers. */
  private promptDevice(): 'touch' | 'keyboard' | 'mouse' {
    if (this.input.lastDevice === 'keyboard') return 'keyboard';
    if (this.input.usedTouch) return 'touch';
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return coarse ? 'touch' : 'keyboard';
  }

  private touchButtonsWanted(): boolean {
    const s = this.save.data.settings.touchButtons;
    if (s === 'show') return true;
    if (s === 'hide') return false;
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return (coarse || this.input.usedTouch) && this.save.data.stats.runs < 6;
  }

  restart(): void {
    if (this.state === 'results' && this.clock - this.resultsAt < 0.25) return;
    if (this.currentLevel) return this.retryLevel();
    this.audio.play('tap');
    this.ui.flashFade(() => this.startRun(false));
  }

  // ------------------------------------------------------------------ Island Hop
  private compiledLevel(id: string): CompiledLevel {
    let c = this.compiled.get(id);
    if (!c) {
      c = compileLevel(LEVEL_BY_ID.get(id)!);
      this.compiled.set(id, c);
    }
    return c;
  }

  private mapData(): MapData {
    const r = this.save.data.levels;
    const next = nextLevel(r);
    return {
      totalStars: totalStars(r),
      maxStars: TOTAL_STARS,
      islands: ISLAND_NAMES.map((name, i) => ({
        name,
        stars: islandStars(r, i),
        unlocked: islandUnlocked(r, i),
        gate: CFG.island.gates[i] as number,
        complete: islandComplete(r, i),
        rewardName: (ITEM_NAMES[ISLAND_REWARD_HATS[i] as string] as string) ?? '',
        levels: LEVELS.filter((l) => l.island === i).map((l) => ({
          id: l.id,
          index: l.index,
          name: l.name,
          chase: !!l.chase,
          stars: r[l.id]?.stars ?? [false, false, false],
          unlocked: levelUnlocked(r, l.id),
          next: l.id === next,
        })),
      })),
    };
  }

  openMap(): void {
    const from = this.state;
    if (from !== 'title' && from !== 'levelIntro' && from !== 'levelEnd' && from !== 'results' && from !== 'paused') return;
    this.audio.play('tap');
    if (from === 'levelEnd' || from === 'results' || from === 'paused') {
      this.ui.flashFade(() => {
        this.toTitle();
        this.showMap();
      });
      return;
    }
    this.showMap();
  }

  private showMap(): void {
    this.audio.play('whoosh');
    this.currentLevel = null;
    this.returnTo = 'title';
    this.state = 'map';
    this.map.render(this.mapData());
    this.ui.home.hide();
    this.ui.showExtra(this.map.el);
  }

  private openLevel(id: string): void {
    if (!levelUnlocked(this.save.data.levels, id)) return;
    const from = this.state;
    const show = (): void => {
      const l = LEVEL_BY_ID.get(id)!;
      const rec = this.save.data.levels[id];
      this.state = 'levelIntro';
      this.lastIntro = id;
      this.levelIntro.render({ id, island: ISLAND_NAMES[l.island] as string, index: l.index, name: l.name, chase: !!l.chase, rule: ruleText(l.star3), stars: rec?.stars ?? [false, false, false], best: rec?.best ?? 0 });
      this.ui.showExtra(this.levelIntro.el);
    };
    this.audio.play('tap');
    if (from === 'levelEnd') {
      this.ui.flashFade(() => {
        this.toTitle();
        show();
      });
    } else show();
  }

  private playLevel(id: string): void {
    if (this.state !== 'levelIntro') return;
    if (!this.flags.shots) this.audio.unlock();
    this.audio.play('tap');
    this.startLevel(id, true);
  }

  private startLevel(id: string, withIntro: boolean): void {
    const cl = this.compiledLevel(id);
    this.currentLevel = id;
    this.dailyRun = false;
    this.runBoost = false;
    this.runModifier = null;
    this.setModifierView(null);
    const opts = defaultRunOptions();
    // a fixed seed per level so the course is learnable
    let h = 7;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    opts.seed = h;
    opts.startDist = (CFG.zoneStarts[cl.def.island] as number) + CFG.island.startOffset;
    opts.god = this.flags.god;
    opts.zonesSeen = [0, 1, 2, 3];
    opts.level = cl;
    this.world.start(opts);
    this.runStartedWithTutorial = false;
    this.view.resetRun(0);
    this.autopilot = this.flags.autopilot ? new Autopilot(this.world) : null;
    this.ui.resetHUD();
    this.ui.setLevelHUD({ chase: !!cl.def.chase });
    this.ui.hideTutorial();
    this.ui.clearToasts();
    this.ui.show('hud');
    this.ui.hideExtras();
    this.ui.setTouchButtons(this.touchButtonsWanted());
    this.input.setPointerEnabled(true);
    this.touchLayer.classList.add('active');
    this.crashClock = 0;
    this.hitStop = 0;
    this.finishClock = 0;
    this.introT = withIntro ? 0 : 1;
    this.state = withIntro ? 'intro' : 'running';
    this.audio.setMusicMode('run');
    this.audio.setTrack(cl.def.chase ? 'chase' : 'island');
    this.save.data.stats.runs++;
    this.ui.toast(cl.def.name, { sub: cl.def.chase ? 'Outrun the Great Wave!' : 'Grab all 3 sand dollars', kind: 'gold', life: 2.2 });
  }

  startLevelHook(id: string): void {
    this.startLevel(id, false);
  }
  openLevelHook(id: string): void {
    this.openLevel(id);
  }

  private retryLevel(): void {
    const id = this.currentLevel;
    if (!id) return;
    this.audio.play('tap');
    this.ui.flashFade(() => {
      this.levelEnd.hide();
      this.startLevel(id, false);
    });
  }

  private nextLevelId(): string | null {
    const cur = this.currentLevel ? LEVEL_BY_ID.get(this.currentLevel) : null;
    if (!cur) return null;
    const i = LEVELS.indexOf(cur);
    const n = LEVELS[i + 1];
    return n && levelUnlocked(this.save.data.levels, n.id) ? n.id : null;
  }

  /** A level ended: crashed (or caught by the wave) or reached the flag. */
  private endLevel(success: boolean): void {
    const w = this.world;
    const d = this.save.data;
    const id = this.currentLevel as string;
    const def = LEVEL_BY_ID.get(id)!;
    const earned = evalStars(def.star3, w.levelStats);
    // shells picked up always count; rewards and stars only on a finish
    const pickups = w.stats.shells + w.stats.bonus;
    d.shells += pickups;
    d.stats.totalShells += pickups;
    d.stats.totalHops += w.stats.hops;
    d.stats.totalWaves += w.stats.wavesHopped;
    d.stats.totalPowerups += w.stats.powerups;
    d.stats.totalDistance += w.distance;
    let reward = { stars: (d.levels[id]?.stars ?? [false, false, false]) as [boolean, boolean, boolean], newStars: 0, firstClear: false, shells: 0, xp: 0, islandCompleted: null as number | null, goldCrab: false };
    if (success) reward = applyLevelResult(d.levels, id, earned, w.levelStats.time);
    const xp = reward.xp + xpFor({ shells: w.stats.shells });
    d.shells += reward.shells;
    d.xp += xp;
    let islandReward: string | null = null;
    if (reward.islandCompleted !== null) {
      const hat = ISLAND_REWARD_HATS[reward.islandCompleted] as string;
      grant(d.wardrobe, 'hats', hat);
      islandReward = ITEM_NAMES[hat] ?? hat;
    }
    if (reward.goldCrab) grant(d.wardrobe, 'bodies', 'gold');
    this.save.save();
    this.state = 'levelEnd';
    this.resultsAt = this.clock;
    this.input.setPointerEnabled(false);
    this.ui.show('none');
    this.ui.showExtra(this.levelEnd.el);
    this.levelEnd.show(
      {
        success,
        name: def.name,
        stars: reward.stars,
        earned,
        rule: ruleText(def.star3),
        dollars: w.levelStats.dollars,
        time: w.levelStats.time,
        shells: reward.shells,
        xp,
        firstClear: reward.firstClear,
        islandReward,
        goldCrab: reward.goldCrab,
        hasNext: success && this.nextLevelId() !== null,
      },
      this.reduceMotion,
    );
    this.audio.setRumble(0);
    if (success) {
      this.audio.play('win');
      this.haptics.play('success');
    }
  }

  goHome(): void {
    if (this.state === 'paused' || this.state === 'running' || this.state === 'countdown') this.save.save();
    this.audio.play('tap');
    this.ui.flashFade(() => this.toTitle());
  }

  pause(): void {
    if (this.state !== 'running' && this.state !== 'intro' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.input.setPointerEnabled(false);
    this.ui.showCountdown(0);
    this.ui.setPauseInfo(this.goalViews(), this.world.distance, this.world.runShells);
    this.ui.show('pause');
    this.audio.setMusicMode('menu');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.audio.play('tap');
    this.ui.show('hud');
    this.state = 'countdown';
    this.countdownT = COUNTDOWN_STEP * 3;
    this.lastCount = 0;
    this.ui.showCountdown(3);
    this.input.setPointerEnabled(true);
  }

  private skinOf(id: string) {
    return BODY_SKINS.find((k) => k.id === id) ?? CRAB_SKINS[0]!;
  }

  /** Dress the game crab in the equipped wardrobe. */
  private applyLook(): void {
    const e = this.save.data.wardrobe.equipped;
    this.view.setSkin(this.skinOf(e.body), e.hat as HatKind);
    this.view.setTrail(e.trail as TrailKind);
    this.view.setDance(e.dance);
  }

  /** Wardrobe preview on the turntable (not saved): the rest of the outfit stays as equipped. */
  private previewItem(slot: Slot, id: string): void {
    const e = this.save.data.wardrobe.equipped;
    if (slot === 'bodies') this.view.setSkin(this.skinOf(id), e.hat as HatKind);
    else if (slot === 'hats') this.view.setSkin(this.skinOf(e.body), id as HatKind);
    else if (slot === 'trails') this.view.setTrail(id as TrailKind);
    else {
      this.view.setDance(id);
      this.view.crab.celebrate();
    }
  }

  private openShop(): void {
    if (this.state !== 'title' && this.state !== 'results') return;
    this.audio.play('tap');
    this.prepareThumbs();
    this.returnTo = 'title';
    this.resetWorldToBeach();
    this.state = 'shop';
    this.audio.play('whoosh');
    this.shop.open(this.save.data);
    this.ui.showExtra(this.shop.el);
    this.view.shopSpin = 0;
  }

  /** One-time tip for iPhone/iPad Safari: add to the home screen to play full screen. */
  private maybeShowInstallTip(): void {
    if (this.flags.shots || this.save.data.stats.runs < 1) return;
    const nav = navigator as Navigator & { standalone?: boolean };
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || nav.standalone) return;
    try {
      if (localStorage.getItem('crabdash.tip.a2hs')) return;
      localStorage.setItem('crabdash.tip.a2hs', '1');
    } catch {
      return;
    }
    this.ui.toast('Play full screen!', { sub: 'Tap Share, then “Add to Home Screen”', life: 5 });
  }

  /** Render shop portraits in the background (async GPU readback, no stalls). */
  private prepareThumbs(): void {
    if (this.thumbsReady) return;
    this.thumbsReady = true;
    void this.view
      .renderWardrobeThumbs(HAT_KINDS.filter((k) => k !== 'none'))
      .then((t) => {
        this.shop.thumbs = t;
        if (this.state === 'shop') this.shop.render(this.save.data);
      })
      .catch(() => (this.thumbsReady = false));
  }

  private openSettings(): void {
    if (this.state !== 'title' && this.state !== 'paused') return;
    this.audio.play('tap');
    this.returnTo = this.state;
    this.state = 'settings';
    this.settings.open(this.save.data.settings);
    this.ui.showExtra(this.settings.el);
  }

  openStats(): void {
    if (this.state !== 'title' && this.state !== 'settings') return;
    this.audio.play('tap');
    this.statsReturn = this.state;
    this.state = 'stats';
    const d = this.save.data;
    const fav = Object.entries(d.stats.runsByCrab).sort((a, b) => b[1] - a[1])[0];
    this.stats.render({
      best: d.best,
      runs: d.stats.runs,
      totalDistance: d.stats.totalDistance,
      totalShells: d.stats.totalShells,
      totalHops: d.stats.totalHops,
      totalWaves: d.stats.totalWaves,
      totalPowerups: d.stats.totalPowerups,
      totalCloseShaves: d.stats.totalCloseShaves,
      favourite: fav ? this.skinOf(fav[0]).name : '',
      favouriteRuns: fav ? fav[1] : 0,
      passTier: tierFromXp(d.xp).tier,
      islandStars: totalStars(d.levels),
      dailyStreak: currentStreak(d.daily, this.todayKey()),
    });
    this.ui.showExtra(this.stats.el);
  }

  private closeStats(): void {
    if (this.statsReturn === 'settings') {
      this.audio.play('tap');
      this.state = 'settings';
      this.settings.open(this.save.data.settings);
      this.ui.showExtra(this.settings.el);
    } else this.closeOverlay();
  }

  private openHowTo(): void {
    if (this.state !== 'title') return;
    this.audio.play('tap');
    this.returnTo = 'title';
    this.state = 'howto';
    this.ui.showExtra(this.howto.el);
  }

  /** Back out of shop / settings / how-to. */
  private closeOverlay(): void {
    this.audio.play('tap');
    this.ui.hideExtras();
    this.applyLook();
    if (this.returnTo === 'paused') {
      this.state = 'paused';
      this.ui.show('pause');
    } else this.toTitle();
  }

  private applySettings(st: Settings): void {
    const prev = this.save.data.settings;
    this.save.data.settings = st;
    this.save.save();
    this.audio.setVolumes(st.music, st.sfx);
    if (st.quality !== prev.quality) {
      this.quality = pickQuality(this.flags.quality, st.quality);
      this.view.setQuality(this.quality);
      this.view.renderer.setDprScale(1);
      this.qm.setEnabled(this.autoQuality, this.quality);
      this.tagQuality();
    }
    this.view.setReduceMotion(this.reduceMotion);
    this.ui.setTouchButtons(this.touchButtonsWanted());
    this.applyControlSettings();
  }

  /** haptics, swipe sensitivity, left-handed HUD, contrast outlines, motion */
  private applyControlSettings(): void {
    const st = this.save.data.settings;
    this.haptics.enabled = st.haptics;
    this.input.setSensitivity(st.swipeSensitivity);
    this.ui.setLefty(st.leftHanded);
    this.ui.setReduceMotion(this.reduceMotion);
    this.view.entities.setContrast(st.contrastOutlines);
  }

  private resetWorldToBeach(): void {
    this.world.mode = 'idle';
    this.world.dist = 0;
    this.world.prevDist = 0;
    this.world.entities.length = 0;
    this.world.shells.length = 0;
    this.view.resetRun(this.save.data.best);
  }

  private anyAffordable(): boolean {
    const d = this.save.data;
    if (CRAB_SKINS.some((k) => canBuyCrab(d, k.id))) return true;
    return (['magnet', 'shield', 'rider'] as PowerKind[]).some((k) => {
      const c = upgradeCost(d.upgrades[k]);
      return c !== null && d.shells >= c;
    });
  }

  private snapshot(): RunSnapshot {
    return { distance: this.world.distance, stats: this.world.stats, zone: this.world.stats.zonesReached };
  }

  // ------------------------------------------------------------------ input
  private onAction(a: Action, alsoConfirm: boolean): void {
    const s = this.state;
    if (s === 'running' || s === 'intro') {
      if (a === 'pause' || a === 'back') return this.pause();
      if (a === 'confirm') return;
      if (this.autopilot) return;
      // Mirror Beach: the picture is flipped, so are the controls
      if (this.runModifier === 'mirror' && (a === 'left' || a === 'right')) a = a === 'left' ? 'right' : 'left';
      this.world.act(a);
      return;
    }
    if (s === 'countdown') return;
    if (s === 'paused') {
      if (a === 'back' || a === 'pause' || a === 'confirm' || alsoConfirm) this.resume();
      return;
    }
    if (s === 'title') {
      if (a === 'confirm' || alsoConfirm) this.onPlay();
      return;
    }
    if (s === 'results') {
      if ((a === 'confirm' || alsoConfirm) && this.clock - this.resultsAt > 0.6) this.restart();
      else if (a === 'back') this.goHome();
      return;
    }
    if (s === 'stats' && a === 'back') return this.closeStats();
    if ((s === 'shop' || s === 'settings' || s === 'howto' || s === 'map' || s === 'pass' || s === 'daily') && a === 'back') this.closeOverlay();
    if (s === 'daily' && (a === 'confirm' || alsoConfirm)) this.playDaily();
    if (s === 'levelIntro') {
      if (a === 'back') this.openMap();
      else if ((a === 'confirm' || alsoConfirm) && this.currentLevelIntro()) this.playLevel(this.currentLevelIntro() as string);
    }
    if (s === 'levelEnd' && this.clock - this.resultsAt > 0.6) {
      if (a === 'back') this.openMap();
      else if (a === 'confirm' || alsoConfirm) this.retryLevel();
    }
  }

  private currentLevelIntro(): string | null {
    return this.lastIntro;
  }
  private lastIntro: string | null = null;

  // ------------------------------------------------------------------ fixed step
  private step(dt: number): void {
    this.clock += dt;
    switch (this.state) {
      case 'intro':
        this.introT = Math.min(1, this.introT + dt / INTRO_TIME);
        this.autopilot?.update();
        this.world.step(dt * this.world.timeScale);
        if (this.introT >= 1) this.state = 'running';
        this.checkCrash();
        this.checkFinish();
        break;
      case 'running':
        this.autopilot?.update();
        this.world.step(dt * this.world.timeScale);
        this.checkCrash();
        this.checkFinish();
        break;
      case 'countdown': {
        this.countdownT -= dt;
        const n = Math.ceil(this.countdownT / COUNTDOWN_STEP);
        if (n !== this.lastCount && n > 0) {
          this.lastCount = n;
          this.audio.play('countdown');
        }
        this.ui.showCountdown(Math.max(0, n));
        if (this.countdownT <= 0) {
          this.state = 'running';
          this.ui.showCountdown(0);
          this.audio.setMusicMode('run');
          this.audio.play('go');
          this.loop.resetClock();
        }
        break;
      }
      case 'crashing': {
        if (this.hitStop > 0) {
          this.hitStop -= dt;
          break;
        }
        const slow = this.crashClock < CFG.crash.slowMoTime ? CFG.crash.slowMo : 1;
        this.world.step(dt * slow);
        this.crashClock += dt;
        if (this.crashClock >= CFG.crash.resultsDelay) {
          if (this.world.kind === 'level') this.endLevel(false);
          else this.endRun();
        }
        break;
      }
      case 'finishing':
        // coast through the finish arch, then show the stars
        this.world.step(dt);
        this.finishClock += dt;
        if (this.finishClock >= 1.5) this.endLevel(true);
        break;
      default:
        break;
    }
  }

  /** Island Hop: the flag was reached → coast, celebrate, then the level end screen. */
  private checkFinish(): void {
    if (this.world.mode === 'finished' && (this.state === 'running' || this.state === 'intro')) {
      this.state = 'finishing';
      this.finishClock = 0;
      this.input.setPointerEnabled(false);
      this.audio.setMusicMode('menu');
    }
  }

  private checkCrash(): void {
    if (this.world.mode === 'crashing' && (this.state === 'running' || this.state === 'intro')) {
      this.state = 'crashing';
      this.crashClock = 0;
      this.hitStop = CFG.crash.hitStop;
      this.input.setPointerEnabled(false);
      this.audio.setMusicMode('menu');
    }
  }

  private endRun(): void {
    const w = this.world;
    const d = this.save.data;
    const distance = w.distance;
    const prevBest = d.best;
    const newBest = !this.dailyRun && distance > prevBest && prevBest > 0;
    const pickups = w.stats.shells;
    const bonus = w.stats.bonus;
    const snap = this.snapshot();
    const completedIds = [...this.goals.pending];
    const { completed, reward: goalRewards } = this.goals.finishRun(snap);
    // Golden Shell doubles the shells picked up; Daily Tide pays its first-finish reward
    const extra: { label: string; value: number }[] = [];
    if (this.runBoost) extra.push({ label: 'Golden Shell 2×', value: pickups });
    const daily = this.dailyRun ? this.finishDaily(distance, pickups) : null;
    if (daily?.firstToday) extra.push({ label: 'Daily Tide reward', value: CFG.daily.firstFinishShells });
    const total = pickups + bonus + goalRewards + extra.reduce((a, x) => a + x.value, 0);
    d.shells += total;
    if (w.startDist === 0 && !this.dailyRun) d.best = Math.max(d.best, distance);
    d.stats.totalShells += total;
    d.stats.totalDistance += distance;
    d.stats.totalHops += w.stats.hops;
    d.stats.totalWaves += w.stats.wavesHopped;
    d.stats.totalPowerups += w.stats.powerups;
    d.stats.totalCloseShaves += w.stats.closeShaves;
    for (let z = 0; z <= w.stats.zonesReached; z++) if (!d.zonesSeen.includes(z)) d.zonesSeen.push(z);
    if (w.learned.move) d.tutorial.move = true;
    if (w.learned.hop) d.tutorial.hop = true;
    if (this.runStartedWithTutorial && !w.tutorialActive) {
      d.tutorial.move = true;
      d.tutorial.hop = true;
    }
    const unlocked = grantSkillUnlocks(d);
    this.save.save();
    this.lastResults = { distance, pickups, bonus, total, newBest, goals: completed.length };
    void completedIds;

    // Sunny Pass XP for the run
    const xpBefore = d.xp;
    const xpGained = xpFor({ distance, shells: pickups, goals: completed.length, daily: !!daily?.firstToday, streak: daily?.streak });
    d.xp += xpGained;
    d.stats.longestRun = Math.max(d.stats.longestRun, w.time);
    this.save.save();

    this.state = 'results';
    this.resultsAt = this.clock;
    this.applyPendingQuality();
    if (newBest) this.view.celebrateResults();
    this.ui.showResults({
      title: daily ? (daily.newBest ? 'Tide Record!' : 'Daily Tide') : newBest ? 'New Best!' : 'Wipeout!',
      extra,
      banner: daily ? `${ICON.flame} Score <b>${fmt(daily.score)}</b>${daily.newBest ? ' · best today!' : ` · best ${fmt(daily.best)}`} · ${daily.streak}-day streak` : undefined,
      distance,
      best: prevBest,
      newBest,
      zone: CFG.zoneNames[w.zone] ?? '',
      pickups,
      bonus,
      completed: completed.map((g) => ({ text: g.text, reward: (CFG.goalRewards[Math.min(g.tier, 4) - 1] as number) ?? 400 })),
      balance: d.shells,
      xpBefore,
      xpGained,
      goals: this.goalViews(),
      unlock: nextUnlock(d, Object.fromEntries(CRAB_SKINS.map((k) => [k.id, k.name]))),
      wardrobeBadge: this.anyAffordable(),
    });
    if (newBest) {
      this.audio.play('newBest');
      this.haptics.play('success');
    }
    for (const id of unlocked) this.ui.toast(`${this.skinOf(id).name} unlocked!`, { kind: 'gold', sub: 'Find them in the Wardrobe', life: 3 });
    if (daily?.firstToday) setTimeout(() => this.audio.play('streakFlame'), 900);
    if (daily?.usedSavers) this.ui.toast('Streak saved!', { kind: 'green', sub: `A streak saver kept your ${daily.streak}-day streak alive`, life: 3 });
    if (daily?.milestone === 7) this.ui.toast('Flower Crown unlocked!', { kind: 'gold', sub: '7-day Daily Tide streak', life: 3.2 });
    if (daily?.milestone === 30) this.ui.toast('Moonscuttle unlocked!', { kind: 'gold', sub: '30-day Daily Tide streak', life: 3.2 });
  }

  /** Record a Daily Tide finish: score, streak, savers and streak cosmetics. */
  private finishDaily(distance: number, shells: number): { score: number; best: number; newBest: boolean; firstToday: boolean; streak: number; usedSavers: number; milestone: number | null } {
    const d = this.save.data;
    const score = Math.floor(distance) + shells * CFG.daily.shellScore;
    const r = recordFinish(d.daily, this.todayKey(), score);
    const crown = r.streak >= 7 && grant(d.wardrobe, 'hats', 'flowercrown');
    const moon = r.streak >= 30 && grant(d.wardrobe, 'dances', 'moonwalk');
    return { score, best: d.daily.bestToday, ...r, milestone: moon ? 30 : crown ? 7 : null };
  }

  private goalViews(): GoalView[] {
    const live = this.state === 'running' || this.state === 'paused' || this.state === 'countdown' || this.state === 'intro' || this.state === 'crashing';
    return this.goals.views(live ? this.snapshot() : null);
  }

  // ------------------------------------------------------------------ render
  private render(alpha: number, frameDt: number): void {
    if (this.skipRender) {
      // test-hook fast-forward: drop effects of skipped frames so they don't all fire at once
      this.world.events.length = 0;
      return;
    }
    this.handleEvents(this.world.events);
    this.world.events.length = 0;
    const menu = this.state === 'title' || this.state === 'settings' || this.state === 'howto' || this.state === 'stats' || this.state === 'map' || this.state === 'levelIntro' || this.state === 'pass' || this.state === 'daily';
    const mode: CamMode = menu ? (this.returnTo === 'paused' && this.state === 'settings' ? 'run' : 'title') : this.state === 'intro' ? 'intro' : this.state === 'shop' ? 'shop' : 'run';
    if (this.state === 'shop') this.view.shopSpin += frameDt * 0.5;
    const dt = this.state === 'paused' || (this.state === 'settings' && this.returnTo === 'paused') ? 0 : frameDt;
    this.view.frame(this.world, alpha, dt, mode, this.introT);
    if (this.qm.sample(frameDt * 1000, this.state === 'running')) this.view.renderer.setDprScale(this.qm.dprScale);
    if (this.state === 'running' || this.state === 'intro' || this.state === 'crashing' || this.state === 'countdown' || this.state === 'paused' || this.state === 'finishing') {
      const w = this.world;
      const pk = w.power.kind;
      this.ui.updateHUD(w.runShells, w.distance, pk, pk ? w.power.t / w.power.dur : 0, w.streak);
      if (w.level) {
        const rs = ruleState(w.level.def.star3, w.levelStats);
        const k = w.level.def.star3.kind;
        const progressRule = k === 'shells' || k === 'hourglasses' || k === 'streak';
        // "avoid" rules show green while intact; progress rules turn green once reached
        const ok = progressRule ? ruleState(w.level.def.star3, { ...w.levelStats, finished: true }).met : !rs.lost;
        this.ui.updateLevelHUD((w.dist - w.levelStart) / w.level.length, w.levelStats.dollars, ruleHud(w.level.def.star3, w.levelStats), ok, rs.lost, w.chaseGap);
        // the Great Wave rumbles louder as it closes in
        this.rumbleT -= frameDt;
        if (this.rumbleT <= 0) {
          this.rumbleT = 0.1;
          const live = w.chaseGap !== null && (this.state === 'running' || this.state === 'intro');
          this.audio.setRumble(live ? 1 - Math.min(1, (w.chaseGap as number) / CFG.island.chase.maxGap) : 0);
        }
      }
      this.goalCheckT -= frameDt;
      if (this.goalCheckT <= 0 && (this.state === 'running' || this.state === 'intro')) {
        this.goalCheckT = 0.25;
        for (const g of this.goals.checkLive(this.snapshot())) {
          this.audio.play('goal');
          this.ui.toast(`Goal complete! <span class="price">+${CFG.goalRewards[Math.min(g.tier, 4) - 1] ?? 400}</span>`, { kind: 'green', sub: g.text, life: 2.4 });
        }
      }
    }
    if (this.debug) {
      this.debug.update(frameDt, () => {
        const st = this.view.renderer.stats;
        return {
          fps: Math.round(1000 / this.loop.frameMs),
          ms: this.loop.frameMs,
          calls: st.calls,
          tris: st.triangles,
          dpr: this.view.renderer.currentDpr,
          q: `${this.quality.name}${this.autoQuality ? ' (auto)' : ''}`,
          budget: `${this.quality.drawCalls} calls / ${Math.round(this.quality.triangles / 1000)}k tris`,
          state: this.state,
          speed: this.world.speed,
          dist: Math.floor(this.world.dist),
          tier: this.world.tier,
          zone: this.world.zone,
          pattern: this.world.spawner?.lastPattern ?? '',
          ents: this.world.entities.length,
          shells: this.world.shells.length,
        };
      });
    }
  }

  private handleEvents(events: readonly GameEvent[]): void {
    if (events.length === 0) return;
    this.view.onEvents(events, this.world);
    for (const ev of events) {
      switch (ev.t) {
        case 'shell':
          this.audio.play(ev.big ? 'bigShell' : 'shell', { streak: ev.streak, pan: ev.x * 0.12 });
          if (!this.reduceMotion && !this.skipRender) {
            const p = this.view.toScreen(ev.x, ev.y + 0.6, 0);
            this.ui.flyShell(this.runModifier === 'mirror' ? this.canvas.clientWidth - p.x : p.x, p.y, ev.big);
          }
          break;
        case 'laneChange':
          this.audio.play('lane', { pan: ev.dir * 0.4 });
          this.haptics.play('light');
          break;
        case 'hop':
          this.audio.play('hop');
          break;
        case 'land':
          this.audio.play(ev.hard ? 'slam' : 'land');
          break;
        case 'bump':
          this.audio.play('bump', { pan: ev.x * 0.15 });
          this.haptics.play('medium');
          break;
        case 'crash':
          this.audio.play('crash');
          this.haptics.play('heavy');
          break;
        case 'closeShave':
          this.audio.play('closeShave');
          this.ui.floater(`Close shave! +${ev.reward}`, 0.5, 0.42);
          break;
        case 'powerup':
          this.audio.play(ev.kind === 'rider' ? 'rider' : 'powerup');
          this.ui.toast(ev.kind === 'magnet' ? 'Shell Magnet!' : ev.kind === 'shield' ? 'Bubble Shield!' : 'Wave Rider!', { kind: 'gold' });
          break;
        case 'powerupEnd':
          if (ev.popped) this.audio.play('shieldPop');
          break;
        case 'zoneEnter':
          this.audio.play('zone');
          this.audio.setZone(ev.zone);
          this.ui.toast(`New area: ${CFG.zoneNames[ev.zone]}!`, { kind: 'green', big: true, sub: ev.first ? `First visit bonus +${CFG.zoneBonus} shells` : undefined, life: 2.6 });
          if (ev.zone === 3 && !this.save.data.crabs.owned.includes('dazzle')) this.ui.toast('Dazzle unlocked!', { kind: 'gold', sub: 'A sparkly new crab', life: 3 });
          break;
        case 'milestone':
          this.audio.play('milestone');
          this.ui.floater(`${ev.dist.toLocaleString()} m!`, 0.5, 0.3);
          break;
        case 'newBest':
          this.audio.play('newBest');
          this.ui.toast('NEW BEST!', { kind: 'gold', big: true, life: 2.2 });
          break;
        case 'dollar':
          this.audio.play('dollar', { pan: ev.x * 0.12 });
          this.haptics.play('medium');
          break;
        case 'hourglass':
          this.audio.play('milestone');
          this.ui.floater('Wave pushed back!', 0.5, 0.36);
          break;
        case 'pad':
          this.audio.play('boing');
          break;
        case 'tidepool':
          this.audio.play('splash');
          break;
        case 'gullDive':
          this.audio.play('gull', { pan: ev.x * 0.15 });
          break;
        case 'tutorial':
          if (ev.step === 'complete') {
            this.ui.showTutorial('complete', this.promptDevice());
            setTimeout(() => this.ui.hideTutorial(), 1800);
          } else if (ev.show) {
            this.ui.showTutorial(ev.step, this.promptDevice());
            if (ev.need === 'none') setTimeout(() => this.ui.hideTutorial(), 2200);
          } else this.ui.hideTutorial();
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ test hooks
  private installHooks(): void {
    const g = this;
    const hooks = {
      /** true once boot() has run (the loader stages construction, shader warm-up and boot) */
      ready: false,
      game: g,
      startRun(o: { seed?: number; start?: number; autopilot?: boolean; tutorial?: boolean } = {}) {
        g.dailyRun = false;
        if (o.seed !== undefined) g.flags.seed = o.seed;
        if (o.start !== undefined) g.flags.start = o.start;
        if (o.autopilot !== undefined) g.flags.autopilot = o.autopilot;
        if (o.tutorial === false) g.flags.notut = true;
        if (o.tutorial === true) {
          g.flags.notut = false;
          g.save.data.tutorial = { move: false, hop: false };
        }
        g.startRun(false);
      },
      setState(name: string) {
        if (name === 'title') g.toTitle();
        else if (name === 'shop') {
          g.toTitle();
          g.openShop();
        } else if (name === 'settings') {
          g.toTitle();
          g.openSettings();
        } else if (name === 'map') {
          g.toTitle();
          g.openMap();
        } else if (name === 'pass') {
          g.toTitle();
          g.openPass();
        } else if (name === 'daily') {
          g.toTitle();
          g.openDaily();
        } else if (name === 'stats') {
          g.toTitle();
          g.openStats();
        } else if (name === 'howto') {
          g.toTitle();
          g.openHowTo();
        } else if (name === 'pause') {
          if (g.state !== 'running') g.startRun(false);
          g.pause();
        }
      },
      /** advance n frames of `dt` seconds; only the last 20 are rendered (so camera smoothing settles) */
      frames(n: number, dt = 1 / 60) {
        const rendered = Math.min(n, 20);
        g.skipRender = true;
        for (let i = 0; i < n - rendered; i++) g.loop.tick(dt);
        g.skipRender = false;
        for (let i = 0; i < rendered; i++) g.loop.tick(dt);
      },
      /** advance n frames without rendering (fast-forward) */
      skip(n: number, dt = 1 / 60) {
        g.skipRender = true;
        for (let i = 0; i < n; i++) g.loop.tick(dt);
        g.skipRender = false;
      },
      crash() {
        const w = g.world;
        if (w.mode === 'running') {
          w.mode = 'crashing';
          w.crashKind = 'block';
          w.events.push({ t: 'crash', kind: 'block' });
        }
      },
      grant(n: number) {
        g.save.data.shells += n;
        g.save.save();
      },
      /** add Sunny Pass XP / Golden Shells (screenshots, tests) */
      xp(n: number, boosts = 0) {
        g.save.data.xp += n;
        g.save.data.boosts = Math.min(MAX_BOOSTS, g.save.data.boosts + boosts);
        g.save.save();
      },
      /** fake the clock for Daily Tide (ISO date or ms; null = real time) */
      setDate(d: string | number | null) {
        g.fakeNow = d === null ? null : typeof d === 'number' ? d : new Date(d).getTime();
      },
      /** start today's Daily Tide run directly */
      daily(o: { autopilot?: boolean } = {}) {
        if (o.autopilot !== undefined) g.flags.autopilot = o.autopilot;
        g.toTitle();
        g.openDaily();
        g.playDaily();
      },
      /** wear a wardrobe item (owning it first) */
      wear(slot: Slot, id: string) {
        grant(g.save.data.wardrobe, slot, id);
        equip(g.save.data.wardrobe, slot, id);
        g.applyLook();
      },
      act(a: Action) {
        g.onAction(a, false);
      },
      /** start an Island Hop level directly (optionally autopiloted) */
      level(id: string, o: { autopilot?: boolean; intro?: boolean } = {}) {
        if (o.autopilot !== undefined) g.flags.autopilot = o.autopilot;
        g.toTitle();
        if (o.intro) {
          g.openMap();
          g.openLevelHook(id);
        } else g.startLevelHook(id);
      },
      /** unlock every level (screenshots / tests) */
      unlockAll(stars = 2) {
        for (const l of LEVELS) g.save.data.levels[l.id] = { stars: [true, stars > 1, stars > 2], best: 40 };
      },
      /** close-up camera at an offset from the crab (null restores the game camera) */
      cam(x: number | null, y = 1.6, z = 4.2) {
        g.view.debugCam = x === null ? null : new THREE.Vector3(x, y, z);
      },
      /** drive crab animations directly: emote(id), celebrate() */
      crabEmote(id?: string) {
        g.view.crab.emote(id);
      },
      crabCelebrate() {
        g.view.crab.celebrate();
      },
      manual(on: boolean) {
        g.loop.manual = on;
      },
      quality(name: 'low' | 'medium' | 'high') {
        g.quality = QUALITY[name];
        g.view.setQuality(g.quality);
      },
      /** compile + draw every toy shader variant (plain and instanced); returns per-variant status */
      shaderCheck() {
        return g.view.shaderCheck();
      },
      budgets() {
        return QUALITY;
      },
      info() {
        return { state: g.state, dist: g.world.dist, mode: g.world.mode, results: g.lastResults, stats: g.view.renderer.stats };
      },
    };
    (window as unknown as { __crab: typeof hooks }).__crab = hooks;
  }
}
