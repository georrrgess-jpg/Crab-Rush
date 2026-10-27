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
  const shaders = await page.evaluate(() => window.__crab.shaderCheck());
  const badShaders = shaders.filter((x) => !x.ok);
  check(shaders.length >= 14 && badShaders.length === 0, `toy shader variants compile and draw (${shaders.length})${badShaders.length ? ': ' + badShaders.map((b) => b.name + ' ' + b.log).join(' | ') : ''}`);
  // synthesised music: the beach loop, three zone layers and the Island Hop / chase loops
  await page.evaluate(() => window.__crab.game.audio.unlock());
  const loops = await page.waitForFunction(() => window.__crab.game.audio.loops.size === 6, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check(loops, 'all six music loops render');
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
  check((await page.evaluate(() => window.__crab.game.save.data.xp)) > 0, 'a run earns Sunny Pass XP');
  await page.click('#results .res-card .res-big');
  check(await page.evaluate(() => document.getElementById('results').classList.contains('done')), 'tapping the results card skips the reveal');
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
  // wardrobe: equip an owned hat and a trail, mix them with the body
  await page.evaluate(() => { const w = window.__crab.game.save.data.wardrobe; w.owned.hats.push('beanie'); w.owned.trails.push('bubbles'); window.__crab.game.shop.render(window.__crab.game.save.data); });
  await page.click('#shop [data-tab="hats"]');
  await page.click('#shop [data-item="hats:beanie"]');
  await page.click('#shop [data-tab="trails"]');
  await page.click('#shop [data-item="trails:bubbles"]');
  const eq = await page.evaluate(() => window.__crab.game.save.data.wardrobe.equipped);
  check(eq.hat === 'beanie' && eq.trail === 'bubbles' && eq.body === 'chill', 'wardrobe equips a hat and a trail on the chosen body');
  check(await page.isVisible('#shop [data-item="trails:rainbow"].locked'), 'locked wardrobe items show as locked');
  await page.click('#shop [data-tab="upgrades"]');
  await page.click('.up-card .btn');
  check((await page.evaluate(() => window.__crab.game.save.data.upgrades.magnet)) === 1, 'buying a magnet upgrade raises its level');
  await page.keyboard.press('Escape');
  await fr(2);
  check((await st()).state === 'title', 'Escape leaves the shop');

  // ---------------- settings + how to play
  // Home: nav tabs, play card, Stats page
  check(await page.isVisible('#home .play-card'), 'Home shows the Play card');
  await page.click('#home .tab:has-text("Stats")');
  check((await st()).state === 'stats' && (await page.isVisible('#stats .stat')), 'Stats opens from the Home nav');
  await page.keyboard.press('Escape');
  check((await st()).state === 'title', 'Escape leaves Stats');
  await page.click('#home .tab:has-text("Settings")');
  check((await st()).state === 'settings', 'settings open from the title');
  await page.click('.set-row:has-text("Quality") .seg button:has-text("Low")');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('crabdash.save')).settings.quality)) === 'low', 'graphics setting is saved');
  await page.click('#settings .toggle[aria-label="Left-handed HUD"]');
  check((await page.evaluate(() => window.__crab.game.save.data.settings.leftHanded)) === true && (await page.evaluate(() => document.getElementById('hud').classList.contains('lefty'))), 'left-handed HUD toggles');
  await page.click('#settings .btn.big');
  check((await st()).state === 'title', 'Done returns to the title');
  await page.click('button[aria-label="How to play"]');
  check(await page.isVisible('#howto .howto-card'), 'how-to-play cards are shown');
  await page.click('#howto .btn.big');
  check((await st()).state === 'title', 'Got it returns to the title');
  // ---------------- Home v3: cinematic skip, carousel keys
  await page.evaluate(() => window.__crab.cine(1.2));
  check(await page.evaluate(() => window.__crab.game.view.cinematicPlaying && document.getElementById('home').classList.contains('cine')), 'the boot cinematic hides the Home chrome while it plays');
  await page.keyboard.press('KeyX');
  await fr(2);
  check(await page.evaluate(() => !window.__crab.game.view.cinematicPlaying && !document.getElementById('home').classList.contains('cine')), 'any key skips the cinematic');
  await page.evaluate(() => window.__crab.setState('title'));
  await page.keyboard.press('ArrowRight');
  check((await page.evaluate(() => window.__crab.game.ui.home.focused)) === 'islands', 'arrow keys move the mode carousel');
  await page.keyboard.press('ArrowLeft');
  check((await page.evaluate(() => window.__crab.game.ui.home.focused)) === 'beach', 'and back');

  // ---------------- Island Hop: Home card → map → intro → level → stars
  await page.click('#home .mode-card.islands');
  check((await st()).state === 'map' && (await page.isVisible('.lv-node.next')), 'Island Hop map opens from Home with the next level marked');
  check((await page.locator('.isl.locked').count()) === 3, 'islands 2–4 start locked behind star gates');
  await page.click('.lv-node.next');
  check((await st()).state === 'levelIntro' && (await page.isVisible('#level-intro .obj')), 'level intro shows the three star objectives');
  await page.evaluate(() => { window.__crab.game.flags.autopilot = true; });
  await page.click('#level-intro .btn.big');
  await fr(10);
  check(['intro', 'running'].includes((await st()).state) && (await page.isVisible('.lv-progress')), 'Play starts the level with the progress HUD');
  await page.evaluate(() => window.__crab.skip(60 * 45));
  await page.evaluate(() => window.__crab.frames(60 * 2));
  check((await st()).state === 'levelEnd', 'reaching the flag shows the level end screen');
  const rec = await page.evaluate(() => window.__crab.game.save.data.levels['shore-1']);
  check(!!rec && rec.stars[0] === true && rec.stars[1] === true, 'level stars (flag + all sand dollars) are saved');
  await page.evaluate(() => { window.__crab.game.flags.autopilot = false; });
  await fr(60);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__crab.game.state === 'map', null, { timeout: 2000 }).catch(() => {});
  const afterEsc = (await st()).state;
  check(afterEsc === 'map', `Escape from level end goes back to the map (${afterEsc})`);
  // ---------------- Sunny Pass: claim
  await page.evaluate(() => { window.__crab.xp(400); window.__crab.setState('pass'); });
  await fr(3);
  check((await st()).state === 'pass' && (await page.locator('.pt.ready').count()) >= 2, 'Sunny Pass opens with reached tiers ready to claim');
  const before = await page.evaluate(() => ({ claimed: window.__crab.game.save.data.passClaimed.length, owned: window.__crab.game.save.data.wardrobe.owned.trails.length }));
  await page.click('.pass-all');
  const after = await page.evaluate(() => ({ claimed: window.__crab.game.save.data.passClaimed.length, ready: document.querySelectorAll('.pt.ready').length, trails: window.__crab.game.save.data.wardrobe.owned.trails }));
  check(after.claimed > before.claimed && after.ready === 0, 'Claim all claims every reached tier');
  check(after.trails.includes('bubbles'), 'a claimed item lands in the wardrobe');
  await page.keyboard.press('Escape');
  await fr(2);
  check((await st()).state === 'title', 'Escape leaves the Sunny Pass');

  // ---------------- Daily Tide: start, finish, streak (faked dates)
  await page.evaluate(() => { window.__crab.setDate('2026-03-10T12:00:00'); window.__crab.setState('daily'); });
  await fr(3);
  check((await st()).state === 'daily' && (await page.isVisible('#daily .dt-name')), 'Daily Tide opens with today\'s modifier');
  await page.click('#daily .daily-play');
  await fr(10);
  const dk = await page.evaluate(() => ({ kind: window.__crab.game.world.kind, mod: window.__crab.game.world.modifier }));
  check(dk.kind === 'daily' && !!dk.mod, 'Play starts a Daily Tide run with a modifier');
  const shellsBefore = await page.evaluate(() => window.__crab.game.save.data.shells);
  await page.evaluate(() => { window.__crab.frames(60 * 3); window.__crab.crash(); window.__crab.frames(60 * 2); });
  const d1 = await page.evaluate(() => ({ state: window.__crab.game.state, daily: window.__crab.game.save.data.daily, shells: window.__crab.game.save.data.shells }));
  check(d1.state === 'results' && d1.daily.streak === 1 && d1.daily.lastDate === '2026-03-10' && d1.shells >= shellsBefore + 100, 'finishing records the day, starts a streak and pays the first-finish reward');
  await page.evaluate(() => { window.__crab.setDate('2026-03-11T09:00:00'); window.__crab.daily(); window.__crab.frames(60); window.__crab.crash(); window.__crab.frames(60 * 2); });
  check((await page.evaluate(() => window.__crab.game.save.data.daily.streak)) === 2, 'playing the next day extends the streak');
  await page.evaluate(() => { window.__crab.setDate('2026-03-14T09:00:00'); window.__crab.daily(); window.__crab.frames(60); window.__crab.crash(); window.__crab.frames(60 * 2); });
  check((await page.evaluate(() => window.__crab.game.save.data.daily.streak)) === 1, 'missing days without savers resets the streak');
  // mirror day swaps left and right
  await page.evaluate(() => { window.__crab.setDate('2026-01-04T09:00:00'); window.__crab.daily(); window.__crab.frames(70); });
  check((await page.evaluate(() => window.__crab.game.world.modifier)) === 'mirror' && (await page.evaluate(() => document.getElementById('gl').classList.contains('mirrored'))), 'Mirror Beach flips the view');
  await page.keyboard.press('ArrowLeft');
  await fr(30);
  check((await st()).lane === 2, 'Mirror Beach swaps left and right');
  await page.evaluate(() => { window.__crab.setDate(null); window.__crab.setState('title'); });
  check(!(await page.evaluate(() => document.getElementById('gl').classList.contains('mirrored'))), 'leaving a mirror run restores the view');

  // ---------------- Golden Shell boost
  await page.evaluate(() => { window.__crab.xp(0, 1); window.__crab.setState('title'); });
  await fr(3);
  await page.click('#home .boost-chip');
  const boosts0 = await page.evaluate(() => window.__crab.game.save.data.boosts);
  await page.click('#home .play-card');
  await fr(10);
  check((await page.evaluate(() => window.__crab.game.save.data.boosts)) === boosts0 - 1 && (await page.evaluate(() => window.__crab.game.runBoost)) === true, 'a Golden Shell is spent when the run starts');
  await page.evaluate(() => { window.__crab.frames(60 * 4); window.__crab.crash(); window.__crab.frames(60 * 2); });
  const res = await page.evaluate(() => window.__crab.game.lastResults);
  check(res.total >= res.pickups * 2 + res.bonus, 'the Golden Shell doubles the shells picked up');

  await page.evaluate(() => window.__crab.setState('title'));
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
  await pp.tap('#home .play-card');
  await pp.evaluate(() => window.__crab.frames(70));
  check((await pst()).state === 'running', 'tapping Play starts a run on a phone');
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
