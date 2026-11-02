import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import './ui/tokens.css';
import './ui/styles.css';
import './ui/screens.css';
import './ui/v4.css';
import './ui/cup.css';
import './ui/u5.css';
import './ui/theme6.css';
import './ui/splash.css';
import { installSizeClass } from './ui/kit';
import { Game } from './game';
import { Splash } from './ui/splash';

installSizeClass();
// the opening animation is already playing (index.html + splash.css); this drives its progress and exit
const splash = new Splash();
const canvas = document.getElementById('gl') as HTMLCanvasElement;

function showFatal(msg: string): void {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.remove('done', 'out', 'quick');
    loader.classList.add('fatal');
    loader.innerHTML = `<div class="loader-logo">Crab Rush</div><p style="max-width:80vw;text-align:center;font-size:18px">${msg}</p>`;
  }
}

function webgl2Supported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

if (!webgl2Supported()) {
  showFatal('Your browser or device does not support WebGL 2, which Crab Rush needs. Try an up-to-date Safari, Chrome, Edge or Firefox.');
} else {
  // staged start so the splash can paint its progress between the heavy steps (its animation runs on
  // the compositor, so it keeps moving even while these steps block the main thread)
  const progress = (pct: number, text?: string): Promise<void> =>
    new Promise((res) => {
      splash.progress(pct, text);
      requestAnimationFrame(() => setTimeout(res, 0));
    });
  void (async () => {
    try {
      await progress(18, 'Building the beach…');
      const game = new Game(canvas);
      await progress(62, 'Warming up the shaders…');
      // compile every program now so the first run doesn't hitch (UPDATE2_PLAN.md §4.4)
      await game.view.precompile();
      await progress(100, 'Off we scuttle!');
      // let the intro land its big moments, then boot under cover of the splash (the first frame and
      // its GPU uploads happen while it still covers the screen) and sweep it away with the wave
      await splash.ready();
      game.boot();
      requestAnimationFrame(() => requestAnimationFrame(() => splash.exit()));
    } catch (e) {
      console.error(e);
      showFatal('Something went wrong while starting the game. Please reload the page.');
    }
  })();
}

// offline play and a quick start from the home screen (production builds on a real browser only:
// tests and screenshots run without it so they always see the fresh build)
if (import.meta.env.PROD && 'serviceWorker' in navigator && !navigator.webdriver && !/[?&]shots/.test(location.search)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
