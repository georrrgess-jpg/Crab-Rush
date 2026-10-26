import { CFG, QUALITY, type QualityPreset } from './config';
import { Audio } from './core/audio';
import { DebugOverlay, parseFlags, type Flags } from './core/debug';
import { Input, type Action } from './core/input';
import { Loop } from './core/loop';
import { SaveStore } from './core/save';
import { Autopilot } from './sim/autopilot';
import type { GameEvent } from './sim/events';
import { World, defaultRunOptions, type RunOptions } from './sim/world';
import { pickQuality } from './render/renderer';
import { CRAB_SKINS } from './render/models/crab';
import { GameView, type CamMode } from './render/view';
import { UI, type GoalView } from './ui/ui';

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
  private resultsAt = 0;
  private clock = 0;
  private skipRender = false;
  private touchLayer: HTMLElement;
  private quality: QualityPreset;
  private returnTo: State = 'title';
  private runStartedWithTutorial = false;
  lastResults: Record<string, number | boolean | string> = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.save = new SaveStore();
    if (this.flags.reset) this.save.reset();
    this.quality = pickQuality(this.flags.quality, this.save.data.settings.quality);
    this.view = new GameView(canvas, this.quality);
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
    this.input.attachSurface(this.touchLayer);
    this.input.onAction = (a, c) => this.onAction(a, !!c);
    this.loop = new Loop({ step: (dt) => this.step(dt), render: (a, dt) => this.render(a, dt) }, CFG.simHz);
    if (this.flags.debug) this.debug = new DebugOverlay(app);

    const skin = CRAB_SKINS.find((s) => s.id === this.save.data.crabs.selected) ?? CRAB_SKINS[0]!;
    this.view.setSkin(skin);
    this.view.setReduceMotion(this.reduceMotion);

    // viewport
    const resize = (): void => {
      const r = app.getBoundingClientRect();
      this.view.resize(r.width, r.height);
      if (this.state === 'running' || this.state === 'intro') this.pause();
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
    // audio unlock on the first gesture
    const unlock = (): void => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    this.view.renderer.onContextLost = () => {
      this.pause();
      this.ui.toast('Graphics were reset', { sub: 'Tap to reload', life: 60 });
      window.addEventListener('pointerdown', () => location.reload(), { once: true });
    };

    this.installHooks();
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
  }

  // ------------------------------------------------------------------ flow
  private toTitle(): void {
    this.state = 'title';
    this.world.mode = 'idle';
    this.world.dist = 0;
    this.world.prevDist = 0;
    this.world.entities.length = 0;
    this.world.shells.length = 0;
    this.input.setPointerEnabled(false);
    this.touchLayer.classList.remove('active');
    this.ui.setTitleInfo(this.save.data.best, this.goalViews());
    this.ui.setPlayPrompt(this.input.lastDevice === 'keyboard');
    this.ui.show('title');
    this.audio.setMusicMode('menu');
  }

  private onPlay(): void {
    if (this.state !== 'title') return;
    this.audio.unlock();
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
    this.ui.showCountdown(3);
    this.audio.play('countdown');
    this.input.setPointerEnabled(true);
  }

  private openShop(): void {
    this.ui.toast('Crabs & upgrades are coming in the next build!');
  }
  private openSettings(): void {
    this.ui.toast('Settings are coming in the next build!');
  }
  private openHowTo(): void {
    this.ui.toast('Swipe or tap to change lanes, swipe up to hop!');
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
    }
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
    const goalRewards = 0;
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
    this.save.save();
    this.lastResults = { distance, pickups, bonus, total, newBest };

    this.state = 'results';
    this.resultsAt = this.clock;
    this.ui.showResults({
      distance,
      best: prevBest,
      newBest,
      pickups,
      bonus,
      goalRewards,
      total,
      balance: d.shells,
      goals: this.goalViews(),
      unlock: this.nextUnlock(),
      zone: CFG.zoneNames[w.zone] ?? '',
    });
    if (newBest) this.audio.play('newBest');
  }

  private nextUnlock(): { name: string; have: number; need: number } | null {
    const d = this.save.data;
    const crab = CRAB_SKINS.filter((s) => !d.crabs.owned.includes(s.id) && (CFG.crabPrices[s.id] ?? 0) > 0).sort((a, b) => (CFG.crabPrices[a.id] ?? 0) - (CFG.crabPrices[b.id] ?? 0))[0];
    if (crab) return { name: crab.name, have: d.shells, need: CFG.crabPrices[crab.id] ?? 0 };
    return null;
  }

  private goalViews(): GoalView[] {
    return [];
  }

  // ------------------------------------------------------------------ render
  private render(alpha: number, frameDt: number): void {
    if (this.skipRender) return;
    this.handleEvents(this.world.events);
    this.world.events.length = 0;
    const mode: CamMode = this.state === 'title' ? 'title' : this.state === 'intro' ? 'intro' : this.state === 'shop' ? 'shop' : 'run';
    const dt = this.state === 'paused' ? 0 : frameDt;
    this.view.frame(this.world, alpha, dt, mode, this.introT);
    if (this.state === 'running' || this.state === 'intro' || this.state === 'crashing' || this.state === 'countdown' || this.state === 'paused') {
      const w = this.world;
      const pk = w.power.kind;
      this.ui.updateHUD(w.runShells, w.distance, pk, pk ? w.power.t / w.power.dur : 0, w.streak);
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
          q: this.quality.name,
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
        else if (name === 'pause') {
          if (g.state !== 'running') g.startRun(false);
          g.pause();
        }
      },
      /** advance n frames of `dt` seconds; renders only the last one */
      frames(n: number, dt = 1 / 60) {
        g.skipRender = true;
        for (let i = 0; i < n - 1; i++) g.loop.tick(dt);
        g.skipRender = false;
        g.loop.tick(dt);
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
      info() {
        return { state: g.state, dist: g.world.dist, mode: g.world.mode, results: g.lastResults, stats: g.view.renderer.stats };
      },
    };
    (window as unknown as { __crab: typeof hooks }).__crab = hooks;
  }
}
