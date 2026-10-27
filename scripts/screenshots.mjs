// Usage: npm run shots -- <label> [--no-build] [--only=title,run] [--views=phone,chromebook,desktop] [--quality=high]
// Builds the game, serves the preview build and captures real screenshots with Playwright.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'dev';
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};
const noBuild = args.includes('--no-build');
const only = opt('only', '').split(',').filter(Boolean);
const views = opt('views', 'phone,chromebook,desktop').split(',');
const quality = opt('quality', 'high');
const outDir = path.resolve('docs/screenshots');
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneland: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  chromebook: { width: 1366, height: 768, deviceScaleFactor: 1 },
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 },
};

if (!noBuild) execSync('npx vite build', { stdio: 'inherit' });
const port = 4173 + Math.floor(Math.random() * 500);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: false });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const base = `http://localhost:${port}/`;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(base);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
log('server up');

// Scenes drive the real game through window.__crab (src/game.ts installHooks)
const SCENES = {
  title: async (p) => {
    await p.evaluate(() => window.__crab.setState('title'));
    await p.evaluate(() => window.__crab.frames(40));
    // let the Home entrance animation finish
    await p.waitForTimeout(1400);
  },
  run: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 7, autopilot: true, tutorial: false }));
    await p.evaluate(() => window.__crab.frames(60 * 9));
    await p.evaluate(() => window.__crab.frames(6));
  },
  tutorial: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 3, autopilot: false, tutorial: true }));
    await p.evaluate(() => window.__crab.frames(60 * 6.5));
  },
  pier: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 11, autopilot: true, tutorial: false, start: 760 }));
    await p.evaluate(() => window.__crab.frames(60 * 3));
  },
  tidepool: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 12, autopilot: true, tutorial: false, start: 1660 }));
    await p.evaluate(() => window.__crab.frames(60 * 3));
  },
  sunset: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 13, autopilot: true, tutorial: false, start: 2860 }));
    await p.evaluate(() => window.__crab.frames(60 * 3));
  },
  night: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 14, autopilot: true, tutorial: false, start: 5300 }));
    await p.evaluate(() => window.__crab.frames(60 * 3));
  },
  cup: async (p) => {
    await p.evaluate(() => window.__crab.clearCups(['sandy']));
    await p.evaluate(() => window.__crab.setState('cup'));
    await p.evaluate(() => window.__crab.frames(30));
    await p.waitForTimeout(900);
  },
  race: async (p) => {
    await p.evaluate(() => window.__crab.race('sandy', { autopilot: true }));
    await p.evaluate(() => window.__crab.frames(60 * 6));
    await p.evaluate(() => window.__crab.frames(6));
  },
  dash: async (p) => {
    await p.evaluate(() => window.__crab.race('sandy', { autopilot: true }));
    // run until a Shell Dash fires
    await p.evaluate(() => {
      for (let i = 0; i < 400; i++) {
        window.__crab.skip(30);
        const r = window.__crab.raceInfo();
        if (r.dashT > 1.6) break;
      }
      window.__crab.frames(12);
    });
  },
  podium: async (p) => {
    await p.evaluate(() => window.__crab.race('sandy', { autopilot: true }));
    await p.evaluate(() => {
      for (let i = 0; i < 600 && window.__crab.raceInfo().state !== 'raceEnd'; i++) window.__crab.skip(30);
      window.__crab.frames(30);
    });
    await p.waitForTimeout(1500);
  },
  map: async (p) => {
    await p.evaluate(() => { window.__crab.unlockAll(2); window.__crab.game.save.data.levels['pier-3'] = undefined; delete window.__crab.game.save.data.levels['pier-3']; window.__crab.setState('map'); window.__crab.frames(10); });
    await p.waitForTimeout(700);
  },
  levelintro: async (p) => {
    await p.evaluate(() => { window.__crab.unlockAll(2); window.__crab.level('shore-3', { intro: true }); window.__crab.frames(10); });
    await p.waitForTimeout(500);
  },
  level: async (p) => {
    await p.evaluate(() => { window.__crab.level('sunset-1', { autopilot: true }); window.__crab.frames(60 * 6.2); });
  },
  chase: async (p) => {
    await p.evaluate(() => { window.__crab.level('shore-6', { autopilot: true }); window.__crab.game.world.chaseGap = 6; window.__crab.frames(60 * 4); window.__crab.game.world.chaseGap = 4.5; window.__crab.frames(4); });
  },
  levelend: async (p) => {
    await p.evaluate(() => { window.__crab.level('cove-1', { autopilot: true }); window.__crab.skip(60 * 40); window.__crab.frames(60 * 2); });
    await p.waitForTimeout(2600);
  },
  results: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 7, autopilot: true, tutorial: false }));
    await p.evaluate(() => window.__crab.frames(60 * 12));
    await p.evaluate(() => window.__crab.crash());
    await p.evaluate(() => window.__crab.frames(60 * 1.6));
    // the staged reveal takes a few seconds
    await p.waitForTimeout(4200);
  },
  pause: async (p) => {
    await p.evaluate(() => window.__crab.startRun({ seed: 5, autopilot: true, tutorial: false }));
    await p.evaluate(() => window.__crab.frames(60 * 5));
    await p.evaluate(() => window.__crab.setState('pause'));
    await p.evaluate(() => window.__crab.frames(2));
  },
  shop: async (p) => {
    await p.evaluate(() => window.__crab.setState('shop'));
    await p.evaluate(() => window.__crab.frames(30));
  },
  // ---- Phase F: Wardrobe, Sunny Pass, Daily Tide
  wardrobe: async (p) => {
    await p.evaluate(() => { window.__crab.xp(9000); const d = window.__crab.game.save.data; for (const t of [5, 10, 15, 20]) d.passClaimed.push(t); d.wardrobe.owned.hats.push('parrot', 'sunflower', 'beanie', 'chef'); window.__crab.wear('hats', 'parrot'); window.__crab.setState('shop'); window.__crab.frames(10); });
    await p.waitForTimeout(2500);
    await p.click('#shop [data-tab="hats"]');
    await p.evaluate(() => window.__crab.frames(30));
    await p.waitForTimeout(300);
  },
  trail: async (p) => {
    await p.evaluate(() => { window.__crab.wear('trails', 'rainbow'); window.__crab.wear('hats', 'crown'); window.__crab.wear('bodies', 'midnight'); window.__crab.startRun({ seed: 9, autopilot: true, tutorial: false }); window.__crab.frames(60 * 6); });
  },
  dance: async (p) => {
    await p.evaluate(() => { window.__crab.wear('dances', 'spin'); window.__crab.wear('hats', 'viking'); window.__crab.setState('title'); window.__crab.cam(0.4, 1.4, 4.6); window.__crab.crabCelebrate(); window.__crab.frames(60 * 1.15); });
  },
  pass: async (p) => {
    await p.evaluate(() => { window.__crab.xp(6000, 2); const d = window.__crab.game.save.data; d.passClaimed.push(1, 2, 3, 4, 5, 6, 7, 8); window.__crab.setState('pass'); window.__crab.frames(10); });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { window.__crab.setState('pass'); window.__crab.frames(10); });
    await p.waitForTimeout(900);
  },
  // ---- Update 3 Phase F: outfits, dyes, pass bonus, Daily calendar
  outfits: async (p) => {
    await p.evaluate(() => {
      const d = window.__crab.game.save.data;
      d.pearls = 60;
      d.wardrobe.owned.hats.push('parrot', 'sunflower', 'chef');
      d.dyes.parrot = [1, 2];
      d.outfits[0] = { body: 'sandy', hat: 'parrot', trail: 'sand', dance: 'clap' };
      window.__crab.wear('hats', 'parrot');
      window.__crab.setState('shop');
      window.__crab.frames(10);
    });
    await p.waitForTimeout(2500);
    await p.click('#shop [data-tab="hats"]');
    await p.evaluate(() => { window.__crab.frames(30); document.querySelector('#shop .dyes')?.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(300);
  },
  passbonus: async (p) => {
    await p.evaluate(() => { window.__crab.xp(200000); const d = window.__crab.game.save.data; d.passBonus = Math.max(0, d.passBonus + 174); for (let t = 1; t <= 40; t++) d.passClaimed.push(t); window.__crab.setState('pass'); window.__crab.frames(10); });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { window.__crab.setState('pass'); window.__crab.frames(10); });
    await p.waitForTimeout(600);
  },
  dailycal: async (p) => {
    await p.evaluate(() => {
      window.__crab.setDate('2026-10-26T15:00:00');
      const d = window.__crab.game.save.data.daily;
      const hist = [];
      for (let i = 1; i <= 24; i++) if (i % 5) hist.push(new Date(Date.UTC(2026, 9, 26 - i)).toISOString().slice(0, 10));
      Object.assign(d, { lastDate: '2026-10-25', streak: 4, history: hist.reverse() });
      d.scores = Object.fromEntries(hist.map((k, i) => [k, 600 + ((i * 397) % 1900)]));
      d.bestByMod = { gullDay: 1840, bigWaves: 2410, mirror: 960 };
      window.__crab.setState('daily');
      window.__crab.frames(10);
    });
    await p.waitForTimeout(900);
    await p.evaluate(() => (document.querySelectorAll('#daily .dt-chip')[1] ?? document.querySelector('#daily .dt-chip'))?.click());
    await p.waitForTimeout(500);
    await p.waitForTimeout(300);
  },
  whatsnew: async (p) => {
    await p.evaluate(() => { window.__crab.whatsNew(); window.__crab.frames(10); });
    await p.waitForTimeout(1500);
  },
  // ---- Update 4: a scuttler mid-warning / mid-crossing
  scuttle: async (p) => {
    await p.evaluate(() => {
      const c = window.__crab;
      for (let seed = 1; seed < 40; seed++) {
        c.startRun({ seed, autopilot: true, tutorial: false, start: 1500 });
        for (let i = 0; i < 1200; i++) {
          c.skip(2);
          const g = c.game;
          const e = g.world.entities.find((x) => x.kind === 'scuttle' && !x.dead && x.state === 1 && x.wz - g.world.dist < 26 && x.wz - g.world.dist > 16);
          if (e) { c.frames(14); return; }
        }
      }
    });
  },
  daily: async (p) => {
    await p.evaluate(() => {
      window.__crab.setDate('2026-10-26T15:00:00');
      const d = window.__crab.game.save.data.daily;
      Object.assign(d, { lastDate: '2026-10-25', streak: 5, savers: 1, bestToday: 0, bestDate: '', history: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] });
      window.__crab.setState('daily');
      window.__crab.frames(10);
    });
    await p.waitForTimeout(900);
  },
  homestreak: async (p) => {
    await p.evaluate(() => {
      window.__crab.setDate('2026-10-26T15:00:00');
      window.__crab.xp(1500, 2);
      const d = window.__crab.game.save.data;
      Object.assign(d.daily, { lastDate: '2026-10-25', streak: 6, savers: 0, history: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] });
      d.best = 1840;
      window.__crab.game.boostOn = true;
      window.__crab.setState('title');
      window.__crab.frames(40);
    });
    await p.waitForTimeout(1400);
  },
  dailyrun: async (p) => {
    await p.evaluate(() => { window.__crab.setDate('2026-10-29T15:00:00'); window.__crab.daily({ autopilot: true }); window.__crab.frames(60 * 8); });
  },
  dailyresults: async (p) => {
    await p.evaluate(() => {
      window.__crab.setDate('2026-10-26T15:00:00');
      Object.assign(window.__crab.game.save.data.daily, { lastDate: '2026-10-25', streak: 6, savers: 0, history: ['2026-10-25'] });
      window.__crab.daily({ autopilot: true });
      window.__crab.frames(60 * 10);
      window.__crab.crash();
      window.__crab.frames(60 * 1.6);
    });
    await p.waitForTimeout(4200);
  },
  // ---- Update 3: boot cinematic frames
  cine1: async (p) => { await p.evaluate(() => window.__crab.cine(0.6)); },
  cine2: async (p) => { await p.evaluate(() => window.__crab.cine(1.9)); await p.waitForTimeout(600); },
  cine3: async (p) => { await p.evaluate(() => window.__crab.cine(2.75)); await p.waitForTimeout(400); },
  cine4: async (p) => { await p.evaluate(() => window.__crab.cine(3.6)); await p.waitForTimeout(500); },
  homegolden: async (p) => {
    await p.evaluate(() => { window.__crab.setDate('2026-10-26T18:10:00'); window.__crab.setState('title'); window.__crab.frames(30); });
    await p.waitForTimeout(800);
  },
  homenight: async (p) => {
    await p.evaluate(() => { window.__crab.setDate('2026-10-26T22:30:00'); window.__crab.setState('title'); window.__crab.frames(30); });
    await p.waitForTimeout(800);
  },
  // ---- Update 3 Phase D: Island Hop+
  mapchests: async (p) => {
    await p.evaluate(() => { window.__crab.unlockAll(2); const d = window.__crab.game.save.data; d.levels['shore-6'].stars = [true, true, true]; d.levels['shore-5'].stars = [true, true, true]; d.levels['shore-4'].stars = [true, true, true]; d.chests[1] = [0]; window.__crab.game.freshClear = 'pier-2'; window.__crab.setState('map'); window.__crab.frames(10); });
    await p.waitForTimeout(700);
  },
  chest: async (p) => {
    await p.evaluate(() => { window.__crab.unlockAll(2); window.__crab.setState('map'); window.__crab.game.openIslandChest(0, 0); window.__crab.frames(10); });
    await p.waitForTimeout(2200);
  },
  maprush: async (p) => {
    await p.evaluate(() => { window.__crab.unlockAll(3); const d = window.__crab.game.save.data; d.crowns = ['shore-1', 'shore-2', 'pier-1']; d.chests = [[0, 1, 2], [0, 1, 2], [], []]; window.__crab.game.mapRush = true; window.__crab.setState('map'); window.__crab.frames(10); });
    await p.waitForTimeout(700);
  },
  bonus: async (p) => {
    await p.evaluate(() => { const d = window.__crab.game.save.data; d.chests = [[0, 1, 2], [], [], []]; window.__crab.level('shore-b', { autopilot: true }); window.__crab.frames(60 * 5.4); });
  },
  rushintro: async (p) => {
    await p.evaluate(() => { window.__crab.unlockAll(3); window.__crab.level('pier-4', { intro: true, rush: true }); window.__crab.frames(10); });
    await p.waitForTimeout(500);
  },
  // ---- Update 3 Phase E: Crab Cove
  cove: async (p) => {
    await p.evaluate(() => { window.__crab.setState('cove'); window.__crab.frames(40); });
    await p.waitForTimeout(3500);
    await p.evaluate(() => window.__crab.frames(4));
  },
  covefull: async (p) => {
    await p.evaluate(() => {
      const g = window.__crab.game;
      const d = g.save.data;
      d.shells = 9000; d.pearls = 140;
      d.stats.totalShells = 12000; d.stats.totalDistance = 64000; d.stats.runs = 60; d.best = 3400; d.stats.totalHops = 700;
      const ids = ['tiki', 'bonfire', 'flamingo', 'palms', 'lighthouse', 'chest', 'statue', 'flowers', 'surfboards', 'hammock', 'fountain', 'lanterns'];
      d.cove.owned = ids.slice();
      ids.forEach((id, i) => { d.cove.plots[i] = id; });
      d.cove.lastGift = Date.now() - 3 * 3600_000;
      window.__crab.setState('cove');
      window.__crab.frames(40);
    });
    // decoration portraits render asynchronously (slow on software GL)
    await p.waitForFunction(() => Object.keys(window.__crab.game.coveThumbs).length > 0, null, { timeout: 30000 }).catch(() => {});
    await p.evaluate(() => window.__crab.frames(30));
    await p.waitForTimeout(300);
  },
  covefriends: async (p) => {
    await p.evaluate(() => { document.querySelector('#cove .wtabs [data-tab="friends"]').click(); window.__crab.frames(4); });
    await p.waitForTimeout(300);
  },
  covetrophies: async (p) => {
    await p.evaluate(() => { document.querySelector('#cove .wtabs [data-tab="trophies"]').click(); window.__crab.frames(4); });
    await p.waitForTimeout(300);
  },
  stats: async (p) => {
    await p.evaluate(() => window.__crab.setState('stats'));
    await p.evaluate(() => window.__crab.frames(10));
    await p.waitForTimeout(600);
  },
  settings: async (p) => {
    await p.evaluate(() => window.__crab.setState('settings'));
    await p.evaluate(() => window.__crab.frames(10));
  },
};

const sceneNames = only.length ? only : ['title', 'run', 'results'];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const files = [];
try {
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: { width: VIEWPORTS[v].width, height: VIEWPORTS[v].height }, deviceScaleFactor: VIEWPORTS[v].deviceScaleFactor, isMobile: !!VIEWPORTS[v].isMobile, hasTouch: !!VIEWPORTS[v].hasTouch });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    log(`${v}: loading`);
    await page.goto(`${base}?shots&quality=${quality}&reset`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__crab && window.__crab.ready, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    // the game loop is manual in shots mode; keep frames flowing so CSS animations advance
    await page.evaluate(() => { const f = () => requestAnimationFrame(f); f(); });
    log(`${v}: ready`);
    // shop portraits render in the background after boot (async GPU readback)
    await page.waitForFunction(() => window.__crab.game.shop.thumbs.length > 0, null, { timeout: 15000 }).catch(() => {});
    for (const s of sceneNames) {
      log(`${v}: scene ${s}`);
      await SCENES[s](page);
      await page.waitForTimeout(250);
      // software GL in headless Chromium produces frames slowly: settle finite UI animations
      await page.evaluate(() => {
        for (const a of document.getAnimations()) {
          const it = a.effect?.getTiming().iterations;
          if (it !== Infinity && a.animationName && /^(rt-|cardin|risein)/.test(a.animationName)) a.finish();
        }
      });
      const file = path.join(outDir, `${label}-${s}-${v}.png`);
      await page.screenshot({ path: file });
      files.push(file);
      log(`saved ${path.relative(process.cwd(), file)}`);
    }
    if (errors.length) console.log(`[${v}] page errors:\n  ` + errors.join('\n  '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(0);
