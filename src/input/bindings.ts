/** Rebindable actions and their defaults. Codes are KeyboardEvent.code values or Mouse0..Mouse4. */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'slide'
  | 'dash'
  | 'restart'
  | 'pause';

export type Bindings = Record<Action, string[]>;

export const actionLabels: Record<Action, string> = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Strafe left',
  right: 'Strafe right',
  jump: 'Jump / double jump / wall jump',
  sprint: 'Sprint',
  slide: 'Slide',
  dash: 'Dash',
  restart: 'Restart checkpoint (hold: level)',
  pause: 'Pause',
};

export const actionOrder: Action[] = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'slide', 'dash', 'restart', 'pause'];

// Slide defaults to C: Ctrl+W closes the browser tab, which would happen constantly while sliding forward.
export const defaultBindings: Bindings = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  slide: ['KeyC', 'Mouse1'],
  dash: ['KeyQ', 'KeyE'],
  restart: ['KeyR'],
  pause: ['KeyP'],
};

export function sanitizeBindings(raw: unknown): Bindings {
  const out: any = {};
  for (const a of actionOrder) {
    const v = raw && typeof raw === 'object' ? (raw as any)[a] : undefined;
    out[a] = Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.slice(0, 2) : [...defaultBindings[a]];
  }
  return out;
}

/** Actions already using `code` (other than `except`). */
export function findConflicts(b: Bindings, code: string, except: Action): Action[] {
  return actionOrder.filter((a) => a !== except && b[a].includes(code));
}

export const usesCtrl = (b: Bindings) => b.slide.some((c) => c.startsWith('Control'));

const special: Record<string, string> = {
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'ALT',
  AltRight: 'R-ALT',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse0: 'LMB',
  Mouse1: 'RMB',
  Mouse2: 'MMB',
  Mouse3: 'MOUSE 4',
  Mouse4: 'MOUSE 5',
  Escape: 'ESC',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backquote: '`',
};

export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (special[code]) return special[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}
