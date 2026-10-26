import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import './ui/styles.css';
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
  try {
    const game = new Game(canvas);
    game.boot();
  } catch (e) {
    console.error(e);
    showFatal('Something went wrong while starting the game. Please reload the page.');
  }
}
