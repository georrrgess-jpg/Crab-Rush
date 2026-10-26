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
  cove: async (p) => {
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
    log(`${v}: ready`);
    // shop portraits render in the background after boot (async GPU readback)
    await page.waitForFunction(() => window.__crab.game.shop.thumbs.length > 0, null, { timeout: 15000 }).catch(() => {});
    for (const s of sceneNames) {
      log(`${v}: scene ${s}`);
      await SCENES[s](page);
      await page.waitForTimeout(250);
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
