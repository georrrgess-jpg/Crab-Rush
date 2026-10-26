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
import { SettingsScreen } from './ui/settings';
import { ShopScreen } from './ui/shop';
import { Autopilot } from './sim/autopilot';
import type { GameEvent } from './sim/events';
import { World, defaultRunOptions, type RunOptions } from './sim/world';
import { pickQuality } from './render/renderer';
import { CRAB_SKINS } from './render/models/crab';
import { GameView, type CamMode } from './render/view';
import { UI, type GoalView } from './ui/ui';
import type { PowerKind } from './sim/events';

type State = 'boot' | 'title' | 'intro' | 'running' | 'paused' | 'countdown' | 'crashing' | 'results' | 'shop' | 'settings' | 'howto';

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
  private goalCheckT = 0;
  private thumbsReady = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.save = new SaveStore();
    if (this.flags.reset) this.save.reset();
    this.quality = pickQuality(this.flags.quality, this.save.data.settings.quality);
    this.view = new GameView(canvas, this.quality);
    this.qm = new QualityManager(this.quality, this.autoQuality);
    const app = document.getElementById('app') as HTMLElement;
    this.touchLayer = document.getElementById('touch-layer') as HTMLElement;
    this.ui = new UI(document.getElementById('ui') as HTMLElement, {
      play: () => this.onPlay(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.restart(),
      home: () => this.goHome(),
      openShop: () => this.openShop(),
      openSettings: () => this.openSettings(),
      openHowTo: () => this.openHowTo(),
      touch: (a) => this.onAction(a, false),
      tap: () => this.audio.play('tap'),
    });
    this.goals = new Goals(this.save.data.goals);
    this.shop = new ShopScreen(CRAB_SKINS, {
      back: () => this.closeOverlay(),
      preview: (id) => this.view.setSkin(this.skinOf(id)),
      select: (id) => {
        if (selectCrab(this.save.data, id)) {
          this.save.save();
          this.audio.play('tap');
          this.view.setSkin(this.skinOf(id));
        }
        this.shop.render(this.save.data);
      },
      buyCrab: (id) => {
        if (buyCrab(this.save.data, id)) {
          this.save.save();
          this.audio.play('purchase');
          this.view.setSkin(this.skinOf(id));
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
        this.view.setSkin(this.skinOf('sandy'));
        this.ui.toast('Progress erased');
      },
      back: () => this.closeOverlay(),
    });
    this.howto = new HowToScreen(() => this.closeOverlay());
    this.ui.addScreen(this.shop.el);
    this.ui.addScreen(this.settings.el);
    this.ui.addScreen(this.howto.el);
    this.input.attachSurface(this.touchLayer);
    this.input.onAction = (a, c) => this.onAction(a, !!c);
    this.loop = new Loop({ step: (dt) => this.step(dt), render: (a, dt) => this.render(a, dt) }, CFG.simHz);
    if (this.flags.debug) this.debug = new DebugOverlay(app);

    this.audio.setVolumes(this.save.data.settings.music, this.save.data.settings.sfx);
    const skin = CRAB_SKINS.find((s) => s.id === this.save.data.crabs.selected) ?? CRAB_SKINS[0]!;
    this.view.setSkin(skin);
    this.view.setReduceMotion(this.reduceMotion);

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
  private applyPendingQuality(): void {
    const p = this.qm.takePending();
    if (!p) return;
    this.quality = p;
    this.view.setQuality(p);
    this.view.renderer.setDprScale(1);
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
    setTimeout(() => this.prepareThumbs(), 1200);
  }

  // ------------------------------------------------------------------ flow
  private toTitle(): void {
    this.state = 'title';
    this.applyPendingQuality();
    this.resetWorldToBeach();
    this.ui.setShopBadge(this.anyAffordable());
    this.input.setPointerEnabled(false);
    this.touchLayer.classList.remove('active');
    this.ui.setTitleInfo(this.save.data.best, this.goalViews());
    this.ui.setPlayPrompt(this.input.lastDevice === 'keyboard');
    this.ui.show('title');
    this.maybeShowInstallTip();
    this.audio.setMusicMode('menu');
  }

  private onPlay(): void {
    if (this.state !== 'title') return;
    if (!this.flags.shots) this.audio.unlock();
    this.audio.play('tap');
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
    return opts;
  }

  startRun(withIntro: boolean): void {
    const opts = this.buildRunOptions();
    this.world.start(opts);
    this.runStartedWithTutorial = this.world.tutorialActive;
    this.view.resetRun(opts.best);
    this.autopilot = this.flags.autopilot ? new Autopilot(this.world) : null;
    this.ui.resetHUD();
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
    this.save.data.stats.runs++;
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
    this.audio.play('tap');
    this.ui.flashFade(() => this.startRun(false));
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
    this.ui.setTitleInfo(this.save.data.best, this.goalViews());
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
    return CRAB_SKINS.find((k) => k.id === id) ?? CRAB_SKINS[0]!;
  }

  private openShop(): void {
    if (this.state !== 'title' && this.state !== 'results') return;
    this.audio.play('tap');
    this.prepareThumbs();
    this.returnTo = 'title';
    this.resetWorldToBeach();
    this.state = 'shop';
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
      .renderCrabThumbs()
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
    this.view.setSkin(this.skinOf(this.save.data.crabs.selected));
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
    }
    this.view.setReduceMotion(this.reduceMotion);
    this.ui.setTouchButtons(this.touchButtonsWanted());
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
    if ((s === 'shop' || s === 'settings' || s === 'howto') && a === 'back') this.closeOverlay();
  }

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
        break;
      case 'running':
        this.autopilot?.update();
        this.world.step(dt * this.world.timeScale);
        this.checkCrash();
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
        if (this.crashClock >= CFG.crash.resultsDelay) this.endRun();
        break;
      }
      default:
        break;
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
    const newBest = distance > prevBest && prevBest > 0;
    const pickups = w.stats.shells;
    const bonus = w.stats.bonus;
    const snap = this.snapshot();
    const completedIds = [...this.goals.pending];
    const { completed, reward: goalRewards } = this.goals.finishRun(snap);
    const total = pickups + bonus + goalRewards;
    d.shells += total;
    if (w.startDist === 0) d.best = Math.max(d.best, distance);
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

    this.state = 'results';
    this.resultsAt = this.clock;
    this.applyPendingQuality();
    this.ui.showResults({
      distance,
      best: prevBest,
      newBest,
      pickups,
      bonus,
      goalRewards,
      total,
      balance: d.shells,
      goals: [
        ...completed.map((g) => ({ text: g.text, progress: 1, value: '', reward: (CFG.goalRewards[Math.min(g.tier, 4) - 1] as number) ?? 400, done: true })),
        ...this.goalViews(),
      ],
      unlock: nextUnlock(d, Object.fromEntries(CRAB_SKINS.map((k) => [k.id, k.name]))),
      zone: CFG.zoneNames[w.zone] ?? '',
    });
    this.ui.setShopBadge(this.anyAffordable());
    if (newBest) this.audio.play('newBest');
    for (const id of unlocked) this.ui.toast(`${this.skinOf(id).name} unlocked!`, { kind: 'gold', sub: 'Find them in Crabs', life: 3 });
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
    const mode: CamMode = this.state === 'title' || this.state === 'settings' || this.state === 'howto' ? (this.returnTo === 'paused' && this.state === 'settings' ? 'run' : 'title') : this.state === 'intro' ? 'intro' : this.state === 'shop' ? 'shop' : 'run';
    if (this.state === 'shop') this.view.shopSpin += frameDt * 0.5;
    const dt = this.state === 'paused' || (this.state === 'settings' && this.returnTo === 'paused') ? 0 : frameDt;
    this.view.frame(this.world, alpha, dt, mode, this.introT);
    if (this.qm.sample(frameDt * 1000, this.state === 'running')) this.view.renderer.setDprScale(this.qm.dprScale);
    if (this.state === 'running' || this.state === 'intro' || this.state === 'crashing' || this.state === 'countdown' || this.state === 'paused') {
      const w = this.world;
      const pk = w.power.kind;
      this.ui.updateHUD(w.runShells, w.distance, pk, pk ? w.power.t / w.power.dur : 0, w.streak);
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
          this.audio.play(ev.big ? 'bigShell' : 'shell', { streak: ev.streak });
          break;
        case 'laneChange':
          this.audio.play('lane', { pan: ev.dir * 0.4 });
          break;
        case 'hop':
          this.audio.play('hop');
          break;
        case 'land':
          this.audio.play(ev.hard ? 'slam' : 'land');
          break;
        case 'bump':
          this.audio.play('bump');
          break;
        case 'crash':
          this.audio.play('crash');
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
      ready: true,
      game: g,
      startRun(o: { seed?: number; start?: number; autopilot?: boolean; tutorial?: boolean } = {}) {
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
      act(a: Action) {
        g.onAction(a, false);
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
