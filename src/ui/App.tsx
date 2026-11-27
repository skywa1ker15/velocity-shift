/**
 * React UI root: picks the screen from the store. All screens are DOM layered over the canvas.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { Game } from '../app/Game';
import { useUi, type Toast } from '../app/store';
import { Hud } from './Hud';
import {
  Collection,
  Credits,
  LevelSelect,
  Loading,
  MainMenu,
  Ready,
  Title,
  TouchNotice,
  Unsupported,
} from './menus';
import { Pause, Results } from './overlays';
import { ControlsPanel, SettingsPanel } from './Settings';

const GameCtx = createContext<Game | null>(null);
export const useGame = (): Game => useContext(GameCtx)!;

/** Button with UI sounds. Every button in the game goes through this. */
export function Btn({
  onClick,
  children,
  className = '',
  quiet,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { quiet?: boolean }) {
  const game = useContext(GameCtx);
  return (
    <button
      {...rest}
      className={'btn ' + className}
      onMouseEnter={() => !quiet && game?.audio.uiHover()}
      onFocus={() => !quiet && game?.audio.uiHover()}
      onClick={(e) => {
        game?.audio.uiClick();
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}

/**
 * Keyboard navigation for a menu container: arrows / W-S move focus, Escape goes back.
 * (Enter and Space activate the focused button natively.)
 */
export function useMenuNav(onBack?: () => void, autoFocus = true, horizontal = false) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = () =>
      Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]'));
    if (autoFocus && !focused.current) {
      focused.current = true;
      (el.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0])?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (e.key === 'Escape' && onBack) {
        e.preventDefault();
        onBack();
        return;
      }
      // grids (level cards) also move with left/right and A/D
      const h = horizontal && tag !== 'input' && tag !== 'select';
      const down =
        e.key === 'ArrowDown' ||
        (e.key === 's' && tag !== 'input') ||
        (h && (e.key === 'ArrowRight' || e.key === 'd'));
      const up =
        e.key === 'ArrowUp' ||
        (e.key === 'w' && tag !== 'input') ||
        (h && (e.key === 'ArrowLeft' || e.key === 'a'));
      if (!down && !up) return;
      if (tag === 'select') return;
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      const n = i < 0 ? 0 : (i + (down ? 1 : -1) + list.length) % list.length;
      list[n].focus();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, autoFocus, horizontal]);
  return ref;
}

export function Panel({
  title,
  kicker,
  children,
  wide,
  onBack,
  grid,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  wide?: boolean;
  onBack?: () => void;
  /** Cards laid out in a row/grid: left/right move focus too. */
  grid?: boolean;
}) {
  const ref = useMenuNav(onBack, true, !!grid);
  return (
    <div className="screen dim">
      <div className={'panel' + (wide ? ' wide' : '')} ref={ref}>
        <header>
          {kicker && <span className="kicker">{kicker}</span>}
          <h2>{title}</h2>
        </header>
        <div className="panel-body">{children}</div>
        {onBack && (
          <footer>
            <Btn className="ghost" onClick={onBack}>
              ← Back
            </Btn>
          </footer>
        )}
      </div>
    </div>
  );
}

const TOAST_LABEL: Record<Toast['kind'], string> = {
  achievement: 'Achievement unlocked',
  unlock: 'Unlocked',
  collect: 'Shard',
  info: 'Note',
};

/** Major (achievement, unlock) cards are large and linger; minor chips (shard, note) are small and quick. */
function ToastIcon({ kind }: { kind: Toast['kind'] }) {
  if (kind === 'achievement')
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 1.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 16.6l-5.8 3.1 1.1-6.5L2.6 8.6l6.5-.9z"
          fill="currentColor"
        />
      </svg>
    );
  if (kind === 'unlock')
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2l8 10-8 10L4 12z M12 8l3.5 4-3.5 4-3.5-4z" fill="currentColor" fillRule="evenodd" />
      </svg>
    );
  if (kind === 'collect')
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3l6 9-6 9-6-9z" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
}

function ToastItem({ t, hidden }: { t: Toast; hidden: boolean }) {
  const dismiss = useUi((s) => s.dismissToast);
  const [leaving, setLeaving] = useState(false);
  const major = t.kind === 'achievement' || t.kind === 'unlock';
  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), major ? 5200 : 2600);
    const gone = setTimeout(() => dismiss(t.id), (major ? 5200 : 2600) + 320);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, [t.id, major, dismiss]);
  return (
    <div
      className={'toast ' + t.kind + (major ? ' major' : ' minor') + (leaving ? ' leaving' : '')}
      hidden={hidden}
    >
      <span className="toast-ico">
        <ToastIcon kind={t.kind} />
      </span>
      <span className="toast-body">
        {major && <span className="toast-kind">{TOAST_LABEL[t.kind]}</span>}
        <strong>{t.title}</strong>
        <span className="toast-text">{t.text}</span>
      </span>
    </div>
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const screen = useUi((s) => s.screen);
  const playing = screen === 'playing' || screen === 'paused';
  return (
    <div className={'toasts ' + (playing ? 'play' : 'ui')} aria-live="polite">
      {toasts.map((t) => (
        // the results card lists everything new (achievements, unlocks, shards) itself, so no
        // toast is ever drawn over its statistics
        <ToastItem key={t.id} t={t} hidden={screen === 'results'} />
      ))}
    </div>
  );
}

export function App({ game }: { game: Game | null }) {
  const screen = useUi((s) => s.screen);
  const overlay = useUi((s) => s.overlay);
  const contextLost = useUi((s) => s.contextLost);
  const storageOk = useUi((s) => s.storageOk);
  const set = useUi((s) => s.set);
  const closeOverlay = () => set({ overlay: null });

  let body: ReactNode;
  switch (screen) {
    case 'title':
      body = <Title />;
      break;
    case 'menu':
      body = <MainMenu />;
      break;
    case 'levels':
      body = <LevelSelect />;
      break;
    case 'collection':
      body = <Collection />;
      break;
    case 'credits':
      body = <Credits />;
      break;
    case 'loading':
      body = <Loading />;
      break;
    case 'ready':
      body = <Ready />;
      break;
    case 'playing':
      body = <Hud />;
      break;
    case 'paused':
      body = (
        <>
          <Hud frozen />
          {!overlay && <Pause />}
        </>
      );
      break;
    case 'results':
      body = <Results />;
      break;
    case 'unsupported':
      body = <Unsupported />;
      break;
    case 'touch':
      body = <TouchNotice />;
      break;
    default:
      body = null;
  }

  return (
    <GameCtx.Provider value={game}>
      {body}
      {overlay === 'settings' && <SettingsPanel onBack={closeOverlay} />}
      {overlay === 'controls' && <ControlsPanel onBack={closeOverlay} />}
      <Toasts />
      {contextLost && (
        <div className="banner">Graphics context lost — waiting for the browser to restore it…</div>
      )}
      {!storageOk && screen === 'menu' && (
        <div className="banner soft">
          Storage is unavailable in this browser mode — progress will not be saved.
        </div>
      )}
    </GameCtx.Provider>
  );
}
