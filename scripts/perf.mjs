// Draw-call / triangle budget check (PLAN.md §8.3, UPDATE2_PLAN.md §8.3).
// Usage: node scripts/perf.mjs [--no-build] [--tiers=high,medium,low] [--samples=10]
// Plays autopilot runs in every zone at each tier, samples renderer stats at busy moments and fails
// (exit 1) when the peak exceeds that tier's budget. Note: headless uses software WebGL, so this
// measures geometry/draw cost, not real fps.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1];
const tiers = opt('tiers', 'high,medium,low').split(',');
const samples = Number(opt('samples', '10'));
if (!args.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });

const port = 5200 + Math.floor(Math.random() * 400);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const ZONES = [['Sunny Shore', 0], ['Boardwalk Pier', 760], ['Tide Pool Cove', 1660], ['Sunset Lagoon', 2860]];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
try {
  for (const tier of tiers) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${base}?shots&reset&god&quality=${tier}`);
    await page.waitForFunction(() => window.__crab?.ready);
    // the Wardrobe portraits render in the background shortly after boot: let them finish so their
    // offscreen draws are not counted in a measured frame
    await page.waitForFunction(() => Object.keys(window.__crab.game.shop.thumbs?.hats ?? {}).length > 0, null, { timeout: 60000 }).catch(() => {});
    const budget = await page.evaluate((t) => window.__crab.budgets()[t], tier);
    const rows = [];
    let peakC = 0;
    let peakT = 0;
    for (const [name, start] of ZONES) {
      await page.evaluate((s) => window.__crab.startRun({ seed: 41, autopilot: true, tutorial: false, start: s }), start);
      let c = 0;
      let t = 0;
      for (let i = 0; i < samples; i++) {
        await page.evaluate(() => { window.__crab.skip(40); window.__crab.frames(2); });
        const s = await page.evaluate(() => window.__crab.game.view.renderer.stats);
        c = Math.max(c, s.calls);
        t = Math.max(t, s.triangles);
      }
      peakC = Math.max(peakC, c);
      peakT = Math.max(peakT, t);
      rows.push(`${name}: ${c} calls / ${(t / 1000).toFixed(0)}k tris`);
    }
    // Crab Cup: the player plus three rival crabs
    for (const cup of ['sandy', 'sunset']) {
      await page.evaluate((id) => window.__crab.race(id, { autopilot: true }), cup);
      let c = 0;
      let t = 0;
      for (let i = 0; i < samples; i++) {
        await page.evaluate(() => { window.__crab.skip(40); window.__crab.frames(2); });
        const s = await page.evaluate(() => window.__crab.game.view.renderer.stats);
        c = Math.max(c, s.calls);
        t = Math.max(t, s.triangles);
      }
      peakC = Math.max(peakC, c);
      peakT = Math.max(peakT, t);
      rows.push(`Race ${cup}: ${c} calls / ${(t / 1000).toFixed(0)}k tris`);
    }
    // menu scenes: Home (beach + carousel crab) and a fully decorated Crab Cove
    const MENUS = [
      ['Home', "window.__crab.setState('title')"],
      ['Dig', "window.__crab.setState('dig')"],
    ];
    for (const [name, code] of MENUS) {
      await page.evaluate((c) => new Function(c)(), code);
      let c = 0;
      let t = 0;
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.__crab.frames(6));
        const s = await page.evaluate(() => window.__crab.game.view.renderer.stats);
        c = Math.max(c, s.calls);
        t = Math.max(t, s.triangles);
      }
      peakC = Math.max(peakC, c);
      peakT = Math.max(peakT, t);
      rows.push(`${name}: ${c} calls / ${(t / 1000).toFixed(0)}k tris`);
    }
    const ok = peakC <= budget.drawCalls && peakT <= budget.triangles;
    if (!ok) failed = true;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${tier.padEnd(6)} peak ${peakC}/${budget.drawCalls} calls, ${(peakT / 1000).toFixed(0)}k/${budget.triangles / 1000}k tris  (${rows.join(' | ')})`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
