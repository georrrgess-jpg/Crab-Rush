// Renders the app icons (PNG) from an inline SVG with Playwright. Usage: node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const svg = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fa2f2"/><stop offset="1" stop-color="#bfe9ff"/></linearGradient>
  <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dda6"/><stop offset="1" stop-color="#e9c37e"/></linearGradient>
  <radialGradient id="body" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ff7a5a"/><stop offset="0.7" stop-color="#e5452b"/><stop offset="1" stop-color="#b3261e"/></radialGradient>
  <clipPath id="c"><rect width="512" height="512" rx="${rounded ? 110 : 0}"/></clipPath>
</defs>
<g clip-path="url(#c)">
  <rect width="512" height="512" fill="url(#sky)"/>
  <path d="M0 300 Q256 270 512 300 V512 H0z" fill="#3fd6d0"/>
  <path d="M0 340 Q256 300 512 340 V512 H0z" fill="url(#sand)"/>
  <g stroke="#b3261e" stroke-width="16" stroke-linecap="round" fill="none">
    <path d="M150 360 L95 400 L80 445"/><path d="M160 385 L110 430 L105 470"/>
    <path d="M362 360 L417 400 L432 445"/><path d="M352 385 L402 430 L407 470"/>
  </g>
  <path d="M140 300 C70 290 55 220 95 195 C110 235 135 245 165 250" fill="#e5452b" stroke="#b3261e" stroke-width="10"/>
  <path d="M372 300 C442 290 457 220 417 195 C402 235 377 245 347 250" fill="#e5452b" stroke="#b3261e" stroke-width="10"/>
  <ellipse cx="256" cy="350" rx="135" ry="95" fill="url(#body)" stroke="#9a1f18" stroke-width="8"/>
  <ellipse cx="256" cy="395" rx="95" ry="45" fill="#f7a76c"/>
  <circle cx="210" cy="285" r="38" fill="#fff" stroke="#9a1f18" stroke-width="6"/><circle cx="302" cy="285" r="38" fill="#fff" stroke="#9a1f18" stroke-width="6"/>
  <circle cx="216" cy="292" r="19" fill="#14141c"/><circle cx="296" cy="292" r="19" fill="#14141c"/>
  <circle cx="222" cy="284" r="7" fill="#fff"/><circle cx="302" cy="284" r="7" fill="#fff"/>
  <ellipse cx="256" cy="232" rx="150" ry="34" fill="#f2cf7a" stroke="#8a5a1e" stroke-width="8"/>
  <path d="M176 230 C176 150 212 112 256 112 C300 112 336 150 336 230 Z" fill="#f2cf7a" stroke="#8a5a1e" stroke-width="8"/>
  <path d="M178 200 C230 216 282 216 334 200 L336 226 C284 242 228 242 176 226 Z" fill="#2c4fa3"/>
</g></svg>`;

const out = path.resolve('public');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const [file, size, rounded] of [['icon-512.png', 512, true], ['icon-192.png', 192, true], ['apple-touch-icon.png', 180, false], ['icon-maskable-512.png', 512, false]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(rounded).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, file), omitBackground: true });
  console.log('wrote public/' + file);
}
await browser.close();
