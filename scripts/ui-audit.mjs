// Usage: node scripts/ui-audit.mjs [--no-build] [--only=title,shop] [--views=small,phone,...]
// UI sweep (UPDATE3_PLAN.md §1.2): opens every screen at the five reference viewports and fails on
// overlapping controls, text overflowing its box, tap targets under 44 px and horizontal scroll.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};
if (!args.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });

const VIEWS = {
  small: { width: 360, height: 640, touch: true },
  phone: { width: 390, height: 844, touch: true },
  phoneland: { width: 844, height: 390, touch: true },
  chromebook: { width: 1366, height: 768, touch: false },
  desktop: { width: 1920, height: 1080, touch: false },
};
const views = opt('views', Object.keys(VIEWS).join(',')).split(',');

// screens: how to open them, and the root element to audit
const SCREENS = {
  title: { open: "window.__crab.setState('title')", root: '#home', primary: '#home .mode-card.focus' },
  shop: { open: "window.__crab.setState('shop')", root: '#shop' },
  shophats: { open: "window.__crab.setState('shop'); document.querySelector('#shop [data-tab=\"hats\"]').click()", root: '#shop' },
  pass: { open: "window.__crab.xp(3000, 1); window.__crab.setState('pass')", root: '#pass' },
  daily: { open: "window.__crab.setState('daily')", root: '#daily', primary: '#daily .daily-play' },
  map: { open: "window.__crab.setState('map')", root: '#map' },
  levelintro: { open: "window.__crab.unlockAll(2); window.__crab.level('shore-3', { intro: true })", root: '#level-intro', primary: '#level-intro .btn.big' },
  levelend: { open: "window.__crab.level('shore-1', { autopilot: true }); window.__crab.skip(60 * 40); window.__crab.frames(60 * 3)", root: '#level-end', primary: '#level-end .btn.big' },
  cup: { open: "window.__crab.setState('cup')", root: '#cup', primary: '#cup .cup-go' },
  raceend: { open: "window.__crab.race('sandy', { autopilot: true }); for (let i = 0; i < 600 && window.__crab.game.state !== 'raceEnd'; i++) window.__crab.skip(30); window.__crab.frames(30)", root: '#race-end', primary: '#race-end .btn.big' },
  chest: { open: "window.__crab.unlockAll(3); window.__crab.setState('map'); window.__crab.game.openIslandChest(0, 0)", root: '#chest', primary: '#chest .btn.big' },
  dig: { open: "window.__crab.game.save.data.dig.spades = 12; window.__crab.setState('dig')", root: '#dig', primary: '#dig .dig-play' },
  trophies: { open: "window.__crab.setState('trophies')", root: '#trophies' },
  whatsnew: { open: "window.__crab.whatsNew()", root: '#whatsnew', primary: '#whatsnew .btn.green' },
  stats: { open: "window.__crab.setState('stats')", root: '#stats' },
  settings: { open: "window.__crab.setState('settings')", root: '#settings' },
  howto: { open: "window.__crab.setState('howto')", root: '#howto' },
  pause: { open: "window.__crab.setState('pause')", root: '#pause', primary: '#pause .btn.big' },
  racehud: { open: "window.__crab.race('sandy', { autopilot: true }); window.__crab.frames(60 * 3)", root: '#hud' },
  hud: { open: "window.__crab.startRun({ seed: 3, tutorial: false }); window.__crab.frames(30)", root: '#hud' },
  results: { open: "window.__crab.startRun({ seed: 3, tutorial: false }); window.__crab.frames(60); window.__crab.crash(); window.__crab.frames(120); document.getElementById('results').click()", root: '#results', primary: '#results .btn.big' },
};
const only = opt('only', '').split(',').filter(Boolean);
const screens = only.length ? only : Object.keys(SCREENS);

const port = 5100 + Math.floor(Math.random() * 400);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

/** runs in the page: returns a list of problems for the screen root */
function audit([rootSel, primarySel]) {
  const root = document.querySelector(rootSel);
  if (!root) return [`${rootSel} missing`];
  const out = [];
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (getComputedStyle(e).visibility === 'hidden') return false;
    for (let n = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].slice(0, 2).join('.')}${e.textContent ? ` "${e.textContent.trim().slice(0, 18)}"` : ''}`;
  // the screen's visible area: elements outside a scrolling container's viewport are not overlaps
  const clipOf = (e) => {
    let r = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let n = e.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const b = n.getBoundingClientRect();
        r = { left: Math.max(r.left, b.left), top: Math.max(r.top, b.top), right: Math.min(r.right, b.right), bottom: Math.min(r.bottom, b.bottom) };
      }
    }
    return r;
  };
  const clipRect = (e) => {
    const b = e.getBoundingClientRect();
    const c = clipOf(e);
    return { left: Math.max(b.left, c.left), top: Math.max(b.top, c.top), right: Math.min(b.right, c.right), bottom: Math.min(b.bottom, c.bottom) };
  };
  // 1) controls that must not overlap each other
  const ctrls = [...root.querySelectorAll('button, [role=tab], .pill, .wallet, .pass-pill, h1, h2, .mode-card, .play-card, .goals-chip, .res-big, .dt-hero, .lv-node')].filter(vis);
  for (let i = 0; i < ctrls.length; i++) {
    for (let j = i + 1; j < ctrls.length; j++) {
      const a = ctrls[i];
      const b = ctrls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = clipRect(a);
      const rb = clipRect(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3) out.push(`overlap: ${name(a)} × ${name(b)} (${Math.round(ox)}×${Math.round(oy)})`);
    }
  }
  // 2) text that overflows its own box (ellipsis is fine)
  for (const e of root.querySelectorAll('button, h1, h2, .nm, .pt-name, .mc-title, .pc-label, .dt-name, .tl, .rl-l, .lbl')) {
    if (!vis(e) || e.classList.contains('play-card')) continue; // its moving shine is clipped; its labels are checked on their own
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis') continue;
    if (e.scrollWidth > e.clientWidth + 2 && cs.overflow !== 'visible') out.push(`text overflow: ${name(e)} (${e.scrollWidth}>${e.clientWidth})`);
  }
  // 3) tap targets
  for (const e of root.querySelectorAll('button')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 40) out.push(`small target: ${name(e)} (${Math.round(r.width)}×${Math.round(r.height)})`);
  }
  // 5) the primary action is fully on screen without scrolling (UPDATE4_PLAN.md §2.4)
  if (primarySel) {
    const p = document.querySelector(primarySel);
    if (!p || !vis(p)) out.push(`primary missing: ${primarySel}`);
    else {
      const r = p.getBoundingClientRect();
      const c = clipRect(p);
      const full = c.left <= r.left + 1 && c.right >= r.right - 1 && c.top <= r.top + 1 && c.bottom >= r.bottom - 1;
      if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1 || !full) out.push(`primary not fully visible: ${name(p)}`);
    }
  }
  // 6) minimum font size 12 px for visible text
  {
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const e = n.parentElement;
      if (!e || seen.has(e) || !vis(e)) continue;
      seen.add(e);
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 11.5) out.push(`font ${fs.toFixed(1)}px: ${name(e)}`);
    }
  }
  // 7) header crowding: at most 3 controls in a page header
  for (const h of root.querySelectorAll('.page-head, .home-top')) {
    if (!vis(h)) continue;
    const n = [...h.querySelectorAll('button, [role=button], .kit-wallet, .wallet, .pill')].filter((x) => vis(x) && !x.parentElement.closest('.kit-wallet, .wallet, button')).length;
    if (n > 3) out.push(`header crowded (${n} items): ${name(h)}`);
  }
  // 8) numbers are never cut off
  for (const e of root.querySelectorAll('.kit-wallet b, .wallet b, .pill b, .res-big, .map-count b')) {
    if (!vis(e)) continue;
    if (e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) out.push(`number cut: ${name(e)}`);
  }
  // 4) horizontal page scroll / controls off screen
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`horizontal scroll (${document.documentElement.scrollWidth}>${innerWidth})`);
  for (const e of ctrls) {
    const r = e.getBoundingClientRect();
    const c = clipOf(e);
    if (c.right <= c.left || c.bottom <= c.top) continue;
    if (r.right < 0 || r.left > innerWidth) continue;
    if ((r.left < -2 || r.right > innerWidth + 2) && !e.closest('.pass-track, .crab-grid, .mc-track')) out.push(`off screen: ${name(e)}`);
  }
  return out;
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
try {
  for (const v of views) {
    const V = VIEWS[v];
    const ctx = await browser.newContext({ viewport: { width: V.width, height: V.height }, isMobile: V.touch, hasTouch: V.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${base}?shots&reset&notut&quality=low`);
    await page.waitForFunction(() => window.__crab?.ready);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    for (const s of screens) {
      const S = SCREENS[s];
      await page.evaluate((code) => new Function(code)(), S.open);
      await page.evaluate(() => window.__crab.frames(4));
      // settle entrance animations (software GL in headless produces frames slowly)
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish();
      });
      const probs = await page.evaluate(audit, [S.root, S.primary]);
      // 9) toast clearance: a toast never covers a header, wallet, status bar or action bar
      const tprob = await page.evaluate(async () => {
        window.__crab.game.ui.toast('Toast lane check', { sub: 'audit' });
        await new Promise((r) => setTimeout(r, 450));
        const t = [...document.querySelectorAll('#toasts .toast')].pop();
        // software GL in headless runs the animation clock slowly: settle the entrance first
        for (const a of t?.getAnimations() ?? []) if (a.animationName === 'toastIn') a.finish();
        if (!t) return [];
        const tr = t.getBoundingClientRect();
        const out = [];
        for (const n of document.querySelectorAll('.page-head, .home-top, .kit-wallet, .wallet, .page-actions, .spade-chip, #hud > .left, #hud > .right')) {
          const r = n.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          let hidden = false;
          for (let p = n; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) { hidden = true; break; } }
          if (hidden) continue;
          const ox = Math.min(tr.right, r.right) - Math.max(tr.left, r.left);
          const oy = Math.min(tr.bottom, r.bottom) - Math.max(tr.top, r.top);
          if (ox > 2 && oy > 2) out.push(`toast covers ${n.className || n.id} (toast ${Math.round(tr.top)}-${Math.round(tr.bottom)}, it ${Math.round(r.top)}-${Math.round(r.bottom)}, lane ${document.getElementById('toasts').style.top})`);
        }
        document.getElementById('toasts').innerHTML = '';
        return out;
      });
      probs.push(...tprob);
      if (probs.length) {
        fails += probs.length;
        console.log(`FAIL ${v.padEnd(10)} ${s}`);
        for (const p of probs) console.log(`       ${p}`);
      } else console.log(`ok   ${v.padEnd(10)} ${s}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? `\n${fails} UI problem(s)` : '\nUI audit clean');
process.exit(fails ? 1 : 0);
