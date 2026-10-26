import { btn, el } from './dom';
import { ICON } from './icons';

const crab = (x: number, y: number, s = 1, op = 1): string =>
  `<g transform="translate(${x} ${y}) scale(${s})" opacity="${op}"><ellipse cx="0" cy="0" rx="16" ry="11" fill="#e5452b"/><ellipse cx="0" cy="4" rx="11" ry="5" fill="#f7a76c"/><circle cx="-6" cy="-10" r="4" fill="#fff"/><circle cx="6" cy="-10" r="4" fill="#fff"/><circle cx="-6" cy="-9" r="2" fill="#14141c"/><circle cx="6" cy="-9" r="2" fill="#14141c"/><path d="M-16 -2c-8-3-9-10-4-13 1 4 3 6 6 6M16 -2c8-3 9-10 4-13-1 4-3 6-6 6" fill="#e5452b"/><ellipse cx="0" cy="-15" rx="15" ry="4" fill="#f2cf7a"/><path d="M-8 -15c0-7 16-7 16 0z" fill="#f2cf7a"/><rect x="-8" y="-17" width="16" height="2.5" fill="#2c4fa3"/></g>`;
const lanes = `<path d="M70 0 L20 120 M110 0 L90 120 M150 0 L170 120" stroke="#e9c37e" stroke-width="6" fill="none"/><path d="M90 0 L55 120 M130 0 L130 120" stroke="#fff3cf" stroke-width="3" opacity=".7" fill="none"/>`;

const D1 = `<svg class="dia" viewBox="0 0 220 120">${lanes}${crab(55, 92, 1, 0.45)}${crab(165, 92, 1, 0.45)}${crab(110, 92, 1.15)}<path d="M92 72 Q72 58 58 70" stroke="#2f98e8" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M52 64 l10 10 l4 -12z" fill="#2f98e8"/><path d="M128 72 Q148 58 162 70" stroke="#2f98e8" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M168 64 l-10 10 l-4 -12z" fill="#2f98e8"/></svg>`;
const D2 = `<svg class="dia" viewBox="0 0 220 120">${lanes}
<g transform="translate(38 48)"><rect x="-14" y="-6" width="28" height="30" fill="#e9c37e"/><rect x="-6" y="-26" width="12" height="22" fill="#f2d49a"/><path d="M-1 -26v-10h12v6h-12" fill="#e53935"/></g>
<g transform="translate(110 64)"><rect x="-26" y="-7" width="52" height="14" rx="7" fill="#a8743f"/><ellipse cx="26" cy="0" rx="4" ry="7" fill="#e2bd8a"/></g>
<g transform="translate(182 60)"><path d="M-30 8 q15 -26 30 -20 q14 4 30 20z" fill="#1fa6d6"/><path d="M-12 -2 l6 -6 l6 6 M0 -2 l6 -6 l6 6" stroke="#fff1a8" stroke-width="3" fill="none"/></g>
<text x="38" y="112" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="13" fill="#173f66">dodge</text>
<text x="110" y="112" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="13" fill="#173f66">hop or dodge</text>
<text x="182" y="112" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="13" fill="#173f66">hop</text></svg>`;
const D3 = `<svg class="dia" viewBox="0 0 220 120">${lanes}${crab(70, 88, 1.25)}<g transform="translate(108 30) scale(0.55)">${ICON.shell.replace('<svg viewBox="0 0 64 64" aria-hidden="true">', '').replace('</svg>', '').replace('id="sg"', 'id="sg2"').replace('url(#sg)', 'url(#sg2)')}</g><g transform="translate(140 52) scale(0.4)">${ICON.shell.replace('<svg viewBox="0 0 64 64" aria-hidden="true">', '').replace('</svg>', '').replace('id="sg"', 'id="sg3"').replace('url(#sg)', 'url(#sg3)')}</g>
<g transform="translate(176 40)"><rect x="-26" y="-26" width="52" height="66" rx="10" fill="#fff" opacity=".85"/>${crab(-11, -9, 0.55)}${crab(11, -9, 0.55).replace(/#e5452b/g, '#3f86e8')}${crab(-11, 22, 0.55).replace(/#e5452b/g, '#f27ab8')}${crab(11, 22, 0.55).replace(/#e5452b/g, '#4cbc5c')}</g></svg>`;

export class HowToScreen {
  readonly el: HTMLElement;
  constructor(back: () => void) {
    this.el = el('div', 'screen');
    this.el.id = 'howto';
    const dim = el('div', 'dim');
    const panel = el('div', 'panel');
    panel.innerHTML = `<div class="panel-head">How to Play</div>`;
    const body = el('div', 'panel-body');
    body.innerHTML = `<div class="howto-cards">
      <div class="howto-card"><div class="hd"><span class="num">1</span>Move left or right</div>${D1}<p>Swipe or tap a side to switch lanes. You can switch in mid-air too.</p></div>
      <div class="howto-card"><div class="hd"><span class="num">2</span>Dodge obstacles</div>${D2}<p>Tall things: dodge. Low things: hop or dodge. Waves: hop! Clipping something from the side only bumps you.</p></div>
      <div class="howto-card"><div class="hd"><span class="num">3</span>Collect shells &amp; unlock</div>${D3}<p>Shells unlock new crabs and upgrade power-ups. Finish goals for bonus shells.</p></div>
    </div>
    <div class="controls">
      <div><h4>Touch</h4>Swipe ◂ ▸ or tap a side: move<br>Swipe up: hop<br>Swipe down: drop fast</div>
      <div><h4>Keyboard</h4>${ICON.key('←')}${ICON.key('→')} or ${ICON.key('A')}${ICON.key('D')}: move<br>${ICON.key('↑')} ${ICON.key('W')} ${ICON.key('Space')}: hop<br>${ICON.key('↓')} ${ICON.key('S')}: drop · ${ICON.key('Esc')}: pause</div>
    </div>`;
    const done = btn('Got it!', 'big', back);
    done.style.width = '100%';
    done.style.marginTop = '12px';
    body.appendChild(done);
    panel.appendChild(body);
    this.el.append(dim, panel);
  }
}
