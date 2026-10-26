import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import './ui/tokens.css';
import './ui/styles.css';
import './ui/screens.css';
import { Game } from './game';

const canvas = document.getElementById('gl') as HTMLCanvasElement;

function showFatal(msg: string): void {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.remove('done');
    loader.innerHTML = `<div class="loader-logo">Crab Dash</div><p style="max-width:80vw;text-align:center;font-size:18px">${msg}</p>`;
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
  showFatal('Your browser or device does not support WebGL 2, which Crab Dash needs. Try an up-to-date Safari, Chrome, Edge or Firefox.');
} else {
  // staged start so the loader can paint its progress between the heavy steps
  const loader = document.getElementById('loader');
  const tip = loader?.querySelector('.loader-tip');
  const progress = (pct: number, text?: string): Promise<void> =>
    new Promise((res) => {
      loader?.style.setProperty('--load', `${pct}%`);
      if (text && tip) tip.textContent = text;
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
      game.boot();
    } catch (e) {
      console.error(e);
      showFatal('Something went wrong while starting the game. Please reload the page.');
    }
  })();
}
