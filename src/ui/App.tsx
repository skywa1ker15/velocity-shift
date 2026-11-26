/**
 * React UI root: picks the screen from the store. All screens are DOM layered over the canvas.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { Game } from '../app/Game';
import { useUi } from '../app/store';
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
export function useMenuNav(onBack?: () => void, autoFocus = true) {
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
      const down = e.key === 'ArrowDown' || (e.key === 's' && tag !== 'input');
      const up = e.key === 'ArrowUp' || (e.key === 'w' && tag !== 'input');
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
  }, [onBack, autoFocus]);
  return ref;
}

export function Panel({
  title,
  kicker,
  children,
  wide,
  onBack,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  wide?: boolean;
  onBack?: () => void;
}) {
  const ref = useMenuNav(onBack);
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

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dismiss(toasts[0].id), 4200);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          <span className="toast-kind">
            {t.kind === 'achievement'
              ? 'ACHIEVEMENT'
              : t.kind === 'unlock'
                ? 'UNLOCKED'
                : t.kind === 'collect'
                  ? 'SHARD'
                  : 'NOTE'}
          </span>
          <strong>{t.title}</strong>
          <span>{t.text}</span>
        </div>
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
