// End-to-end smoke test of the real build in Chromium: controls, pause, crash, results, replay.
// Usage: node scripts/smoke.mjs [--no-build]
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const port = 4800 + Math.floor(Math.random() * 400);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  // ---------------- desktop: keyboard + mouse
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?shots&reset&notut&seed=99&god&quality=low`);
  await page.waitForFunction(() => window.__crab?.ready);
  const st = () => page.evaluate(() => ({ state: window.__crab.game.state, lane: window.__crab.game.world.player.lane, y: window.__crab.game.world.player.y, grounded: window.__crab.game.world.player.grounded, dist: window.__crab.game.world.dist }));
  const fr = (n) => page.evaluate((k) => window.__crab.frames(k), n);
  check((await st()).state === 'title', 'boots to the title screen');
  await page.keyboard.press('Space');
  await fr(5);
  check(['intro', 'running'].includes((await st()).state), 'Space on the title starts a run');
  await fr(60);
  check((await st()).state === 'running', 'intro hands over to running');
  await page.keyboard.press('ArrowLeft');
  await fr(30);
  check((await st()).lane === 0, 'ArrowLeft moves one lane left');
  await page.keyboard.press('KeyD');
  await page.keyboard.press('KeyD');
  await fr(30);
  check((await st()).lane === 2, 'two D presses cross two lanes');
  await page.keyboard.press('ArrowUp');
  await fr(12);
  const air = await st();
  check(!air.grounded && air.y > 0.5, 'ArrowUp hops');
  await page.keyboard.press('ArrowDown');
  await fr(12);
  check((await st()).grounded, 'ArrowDown slams back to the ground');
  // mouse swipe left on the gesture surface
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(600, 402, { steps: 4 });
  await page.mouse.up();
  await fr(20);
  check((await st()).lane === 1, 'mouse drag left swipes one lane');
  // click right half
  await page.mouse.click(1000, 400);
  await fr(20);
  check((await st()).lane === 2, 'click on the right half moves right');
  await page.keyboard.press('Escape');
  await fr(2);
  check((await st()).state === 'paused', 'Escape pauses');
  const d0 = (await st()).dist;
  await fr(30);
  check((await st()).dist === d0, 'nothing moves while paused');
  await page.keyboard.press('Escape');
  await fr(2);
  check((await st()).state === 'countdown', 'Escape again resumes with a countdown');
  await fr(80);
  check((await st()).state === 'running', 'countdown returns to running');
  await page.evaluate(() => window.__crab.crash());
  await fr(140);
  await page.waitForTimeout(200);
  check((await st()).state === 'results', 'a crash leads to the results screen');
  check(await page.isVisible('#results .btn.big'), 'Play Again button is visible');
  await page.click('#results .btn.big');
  await page.waitForTimeout(400);
  await fr(3);
  check((await st()).state === 'running', 'Play Again restarts instantly (no intro)');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('crabdash.save')));
  check(saved && saved.stats.runs >= 1, 'progress is saved to localStorage');

  // ---------------- tutorial: slow-mo until the player moves
  await page.goto(`${base}?shots&reset&seed=5&quality=low`);
  await page.waitForFunction(() => window.__crab?.ready);
  await page.evaluate(() => window.__crab.startRun({ seed: 5, autopilot: false, tutorial: true }));
  let waited = 0;
  while (waited++ < 40 && (await page.evaluate(() => window.__crab.game.world.timeScale)) === 1) await fr(15);
  check((await page.evaluate(() => window.__crab.game.world.timeScale)) < 1, 'tutorial slows time before the first sandcastle');
  check(await page.isVisible('#tutorial .bubble'), 'tutorial prompt is shown');
  await page.keyboard.press('ArrowLeft');
  await fr(3);
  check((await page.evaluate(() => window.__crab.game.world.timeScale)) === 1, 'moving clears the slow-mo');

  // ---------------- shop: buy + wear + upgrade
  await page.evaluate(() => { window.__crab.grant(1000); window.__crab.setState('shop'); });
  await fr(3);
  check((await st()).state === 'shop', 'shop opens');
  await page.click('.tile:has-text("Chill")');
  await page.click('.crab-detail .btn');
  const afterBuy = await page.evaluate(() => window.__crab.game.save.data);
  check(afterBuy.crabs.owned.includes('chill') && afterBuy.crabs.selected === 'chill' && afterBuy.shells === 550, 'buying Chill spends 450 shells and wears it');
  await page.click('.tabs button:nth-child(2)');
  await page.click('.up-card .btn');
  check((await page.evaluate(() => window.__crab.game.save.data.upgrades.magnet)) === 1, 'buying a magnet upgrade raises its level');
  await page.keyboard.press('Escape');
  await fr(2);
  check((await st()).state === 'title', 'Escape leaves the shop');

  // ---------------- settings + how to play
  await page.click('button[aria-label="Settings"]');
  check((await st()).state === 'settings', 'settings open from the title');
  await page.click('.seg button:has-text("Low")');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('crabdash.save')).settings.quality)) === 'low', 'graphics setting is saved');
  await page.click('#settings .btn.big');
  check((await st()).state === 'title', 'Done returns to the title');
  await page.click('button[aria-label="How to play"]');
  check(await page.isVisible('#howto .howto-card'), 'how-to-play cards are shown');
  await page.click('#howto .btn.big');
  check((await st()).state === 'title', 'Got it returns to the title');
  await page.evaluate(() => window.__crab.startRun({ seed: 2, tutorial: false }));
  await page.keyboard.press('KeyP');
  await page.click('#pause .btn:has-text("Settings")');
  check((await st()).state === 'settings', 'settings open from the pause menu');
  await page.click('#settings .btn.big');
  check((await st()).state === 'paused', 'closing settings returns to the pause menu');
  await ctx.close();

  // ---------------- phone: touch
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pp = await pctx.newPage();
  pp.on('pageerror', (e) => errors.push(String(e)));
  await pp.goto(`${base}?shots&reset&notut&seed=99&god&quality=low`);
  await pp.waitForFunction(() => window.__crab?.ready);
  const pst = () => pp.evaluate(() => ({ state: window.__crab.game.state, lane: window.__crab.game.world.player.lane }));
  await pp.tap('#title .tap', { force: true });
  await pp.evaluate(() => window.__crab.frames(70));
  check((await pst()).state === 'running', 'tapping "Tap to Play" starts a run on a phone');
  await pp.touchscreen.tap(80, 500);
  await pp.evaluate(() => window.__crab.frames(20));
  check((await pst()).lane === 0, 'tapping the left half moves left');
  await pp.tap('.touch-btn.r');
  await pp.evaluate(() => window.__crab.frames(20));
  check((await pst()).lane === 1, 'the on-screen right arrow moves right');
  const pageScroll = await pp.evaluate(() => [window.scrollX, window.scrollY, document.documentElement.scrollWidth <= window.innerWidth]);
  check(pageScroll[0] === 0 && pageScroll[1] === 0 && pageScroll[2], 'no page scroll or horizontal overflow');
  // rotate the phone mid-run
  await pp.setViewportSize({ width: 844, height: 390 });
  await pp.waitForTimeout(200);
  await pp.evaluate(() => window.__crab.frames(2));
  check((await pst()).state === 'paused', 'rotating mid-run auto-pauses');
  const canvasOk = await pp.evaluate(() => { const c = document.getElementById('gl'); return c.clientWidth === 844 && c.clientHeight === 390; });
  check(canvasOk, 'the canvas follows the new orientation');
  await pp.tap('#pause .btn.big');
  await pp.evaluate(() => window.__crab.frames(80));
  check((await pst()).state === 'running', 'resume works after rotating');
  // small height jitter (mobile toolbars) must not pause
  await pp.setViewportSize({ width: 844, height: 370 });
  await pp.waitForTimeout(200);
  await pp.evaluate(() => window.__crab.frames(2));
  check((await pst()).state === 'running', 'small viewport jitter does not pause');
  await pctx.close();
} finally {
  await browser.close();
  server.kill();
}
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(failures ? `\n${failures} check(s) failed` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
