/**
 * Entry point: capability checks, create the Game, mount the React UI.
 */
import '@fontsource/unbounded/latin-600.css';
import '@fontsource/unbounded/latin-800.css';
import '@fontsource/chakra-petch/latin-400.css';
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '../ui/styles.css';
import { createRoot } from 'react-dom/client';
import { Renderer } from '../render/Renderer';
import { App } from '../ui/App';
import { Game } from './Game';
import { ui } from './store';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const shell = document.getElementById('shell');
const root = createRoot(document.getElementById('ui')!);
const hideShell = () => shell?.remove();

// keyboard + mouse are required: phones and tablets get a friendly notice instead of a broken game
const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

let game: Game | null = null;

if (touchOnly) {
  ui.getState().set({ screen: 'touch' });
  hideShell();
} else if (!Renderer.isSupported()) {
  ui.getState().set({ screen: 'unsupported' });
  hideShell();
} else {
  try {
    game = new Game(canvas);
    (window as any).__vs = game; // read-only debug handle for automated tests
    game
      .boot((p, label) => ui.getState().set({ loadProgress: p, loadLabel: label }))
      .then(() => {
        ui.getState().set({ screen: 'title' });
        hideShell();
      })
      .catch((err) => {
        console.error(err);
        ui.getState().set({ screen: 'unsupported' });
        hideShell();
      });
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('dev')) {
      void import('../dev/tuning').then((m) => m.mountTuningPanel(game!));
    }
  } catch (err) {
    console.error(err);
    ui.getState().set({ screen: 'unsupported' });
    hideShell();
  }
}

root.render(<App game={game} />);
