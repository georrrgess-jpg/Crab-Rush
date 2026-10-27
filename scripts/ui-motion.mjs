// Usage: node scripts/ui-motion.mjs <label> [--no-build]
// UI motion strips (UPDATE4_PLAN.md §3.2): card morph into a screen, Tide Gift coins flying into the
// wallet, and a sheet sliding up, captured frame by frame into docs/screenshots/<label>-motion-*.png.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'dev';
if (!args.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const out = path.resolve('docs/screenshots');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'motion-'));
const port = 5600 + Math.floor(Math.random() * 300);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.goto(`http://localhost:${port}/?shots&reset&notut&quality=low`);
await page.waitForFunction(() => window.__crab?.ready);
await page.evaluate(() => { window.__crab.frames(20); for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });

/** pause every running animation at time t (ms) and screenshot */
async function strip(name, start, times) {
  const files = [];
  await page.evaluate(start);
  for (const t of times) {
    await page.evaluate((t) => { for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) { a.pause(); a.currentTime = t; } }, t);
    const f = path.join(tmp, `${name}-${t}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  const dst = path.join(out, `${label}-motion-${name}.png`);
  execSync(`convert ${files.map((f) => `"${f}"`).join(' ')} -resize 220x +append "${dst}"`);
  console.log('saved', path.relative(process.cwd(), dst));
  await page.evaluate(() => { for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish(); else a.play(); });
}

await strip('morph', () => document.querySelector('#home .mode-card.daily').click(), [0, 90, 180, 280, 380, 520]);
await page.evaluate(() => window.__crab.setState('title'));
await strip('sheet', () => { window.__crab.setState('title'); document.querySelector('#home .tab:last-child').click(); }, [0, 80, 160, 240, 360]);
await strip('gifts', () => {
  const d = window.__crab.game.save.data;
  d.cove.lastGift = Date.now() - 4 * 3600_000;
  window.__crab.setState('cove');
  window.__crab.frames(10);
  document.querySelector('#cove .cove-gift').click();
}, [0, 150, 300, 450, 600, 800]);
await browser.close();
server.kill();
