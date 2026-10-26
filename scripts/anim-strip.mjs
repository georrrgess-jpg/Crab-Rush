// Usage: node scripts/anim-strip.mjs <label> [--no-build]
// Captures animation sequences of the crab (turntable, hop, crash, emotes) as image strips into
// docs/screenshots/<label>-strip-*.png using the window.__crab test hooks.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'dev';
if (!args.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const outDir = path.resolve('docs/screenshots');
mkdirSync(outDir, { recursive: true });
const tmp = path.join(os.tmpdir(), `strip-${process.pid}`);
mkdirSync(tmp, { recursive: true });

const port = 4700 + Math.floor(Math.random() * 400);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
await page.goto(`${base}?shots&reset&god&quality=high`);
await page.waitForFunction(() => window.__crab?.ready);
await page.addStyleTag({ content: '#ui{display:none!important} #vignette{display:none!important}' });

async function strip(name, steps) {
  const files = [];
  for (let i = 0; i < steps.length; i++) {
    await page.evaluate(steps[i]);
    const f = path.join(tmp, `${name}-${i}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  const out = path.join(outDir, `${label}-strip-${name}.png`);
  execSync(`convert ${files.map((f) => `"${f}"`).join(' ')} -resize 300x300 +append "${out}"`);
  console.log('saved', path.relative(process.cwd(), out));
}

// turntable on the title beach
await page.evaluate(() => { window.__crab.startRun({ seed: 3, autopilot: false, tutorial: false }); window.__crab.frames(30); });
const turn = [0, 1, 2, 3, 4, 5].map((i) => new Function(`const a=${i}*Math.PI/3; window.__crab.cam(Math.sin(a)*3.6, 1.7, Math.cos(a)*3.6); window.__crab.manual(true); window.__crab.frames(2);`));
await page.evaluate(() => window.__crab.cam(0, 1.7, 3.6));
await strip('run', [0, 1, 2, 3, 4, 5].map(() => () => window.__crab.frames(4)));
await strip('turntable', turn);
await page.evaluate(() => window.__crab.cam(0, 1.6, 4.4));
await strip('hop', [
  () => { window.__crab.act('hop'); window.__crab.frames(2); },
  () => window.__crab.frames(6),
  () => window.__crab.frames(8),
  () => window.__crab.frames(8),
  () => window.__crab.frames(8),
  () => window.__crab.frames(6),
]);
await page.evaluate(() => window.__crab.cam(2.2, 1.9, 4.6));
await strip('crash', [
  () => { window.__crab.crash(); window.__crab.frames(3); },
  () => window.__crab.frames(8),
  () => window.__crab.frames(10),
  () => window.__crab.frames(14),
  () => window.__crab.frames(30),
  () => window.__crab.frames(40),
]);
// emotes on the title screen
await page.evaluate(() => { window.__crab.setState('title'); window.__crab.frames(10); window.__crab.cam(0, 1.6, 4.2); });
const emotes = ['sandy', 'chill', 'blossom', 'skipper', 'pinch', 'dazzle', 'yawn', 'wave'];
await strip('emotes', emotes.map((id) => new Function(`window.__crab.crabEmote('${id}'); window.__crab.frames(45);`)));
await strip('celebrate', [0, 1, 2, 3, 4, 5].map((i) => (i === 0 ? () => { window.__crab.crabCelebrate(); window.__crab.frames(20); } : () => window.__crab.frames(18))));
// victory dances (mid-dance frame of each)
const dances = ['clap', 'spin', 'wave', 'shimmy', 'hattoss', 'moonwalk'];
await strip('dances', dances.map((id) => new Function(`window.__crab.wear('dances','${id}'); window.__crab.crabCelebrate(); window.__crab.frames(62);`)));
await strip('dance-hattoss', [0, 1, 2, 3, 4, 5].map((i) => (i === 0 ? () => { window.__crab.wear('dances', 'hattoss'); window.__crab.crabCelebrate(); window.__crab.frames(20); } : () => window.__crab.frames(22))));
// every body with its own hat, front three-quarter
const bodies = ['sandy', 'chill', 'blossom', 'skipper', 'pinch', 'dazzle', 'coral', 'midnight', 'gold'];
await page.evaluate(() => window.__crab.cam(1.4, 1.5, 3.8));
await strip('bodies', bodies.map((id) => new Function(`window.__crab.wear('bodies','${id}'); const k = window.__crab.game.view.skins; window.__crab.game.view.setSkin(window.__crab.game.skinOf('${id}')); window.__crab.frames(4);`)));
const hats = ['parrot', 'sunflower', 'beanie', 'snorkel', 'crown', 'chef', 'propeller', 'flowercrown', 'headphones', 'bucket', 'viking', 'halo'];
await page.evaluate(() => window.__crab.cam(0.9, 1.6, 3.0));
await strip('hats', hats.map((id) => new Function(`window.__crab.wear('bodies','sandy'); window.__crab.wear('hats','${id}'); window.__crab.frames(4);`)));
// lane change + slam in a run
await page.evaluate(() => { window.__crab.startRun({ seed: 3, autopilot: false, tutorial: false }); window.__crab.frames(30); window.__crab.cam(0, 1.7, 4.2); });
await strip('lane', [
  () => { window.__crab.act('left'); window.__crab.frames(2); },
  () => window.__crab.frames(4),
  () => window.__crab.frames(4),
  () => window.__crab.frames(6),
  () => { window.__crab.act('right'); window.__crab.frames(4); },
  () => window.__crab.frames(10),
]);
await strip('slam', [
  () => { window.__crab.act('hop'); window.__crab.frames(14); },
  () => { window.__crab.act('slam'); window.__crab.frames(3); },
  () => window.__crab.frames(4),
  () => window.__crab.frames(4),
  () => window.__crab.frames(5),
  () => window.__crab.frames(12),
]);
await browser.close();
server.kill();
rmSync(tmp, { recursive: true, force: true });
process.exit(0);
