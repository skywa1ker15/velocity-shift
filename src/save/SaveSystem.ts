/**
 * Local save: settings, key bindings and progress in localStorage; ghost recordings in IndexedDB.
 *
 * - The schema is versioned; `migrate` upgrades old saves so updates never wipe progress.
 * - Loaded data is validated; a corrupt save is backed up and replaced by defaults.
 * - Writes are debounced, and the game still runs when storage is unavailable (private mode).
 */
import { defaultBindings, sanitizeBindings, type Bindings } from '../input/bindings';
import { defaultSettings, sanitizeSettings, type Settings } from '../settings/settings';

export const SAVE_VERSION = 2;
const KEY = 'velocity-shift.save';
const BACKUP_KEY = 'velocity-shift.save.corrupt';

export interface LevelRecord {
  best: number | null;
  splits: number[];
  medal: number; // 0 none, 1 bronze, 2 silver, 3 gold, 4 platinum
  collectibles: string[];
  objectives: string[];
  completions: number;
}

export interface Totals {
  runs: number;
  deaths: number;
  distance: number;
  dashes: number;
  wallTime: number;
  slideDistance: number;
  playTime: number;
  topSpeed: number;
  longestWallChain: number;
}

export interface Equipped {
  suit: string;
  trail: string;
  lines: string;
  hud: string;
}

export interface SaveData {
  version: number;
  settings: Settings;
  bindings: Bindings;
  levels: Record<string, LevelRecord>;
  achievements: Record<string, number>; // id → unlock timestamp
  equipped: Equipped;
  totals: Totals;
  seenPrompts: string[];
}

export const emptyRecord = (): LevelRecord => ({ best: null, splits: [], medal: 0, collectibles: [], objectives: [], completions: 0 });

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  settings: { ...defaultSettings },
  bindings: structuredClone(defaultBindings),
  levels: {},
  achievements: {},
  equipped: { suit: 'ion', trail: 'pulse', lines: 'classic', hud: 'ion' },
  totals: { runs: 0, deaths: 0, distance: 0, dashes: 0, wallTime: 0, slideDistance: 0, playTime: 0, topSpeed: 0, longestWallChain: 0 },
  seenPrompts: [],
});

/** Upgrade any older save shape to the current version. Each step handles exactly one version bump. */
export function migrate(raw: any): any {
  const d = raw;
  if (typeof d.version !== 'number') d.version = 1;
  if (d.version === 1) {
    // v1 → v2: totals gained `longestWallChain`, equipped gained `hud`
    d.totals = { ...d.totals, longestWallChain: d.totals?.longestWallChain ?? 0 };
    d.equipped = { ...d.equipped, hud: d.equipped?.hud ?? 'ion' };
    d.version = 2;
  }
  return d;
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Validate + repair a parsed save. Never throws; unknown or malformed parts fall back to defaults. */
export function sanitizeSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const d = migrate(structuredClone(raw));
  base.settings = sanitizeSettings(d.settings);
  base.bindings = sanitizeBindings(d.bindings);
  if (d.levels && typeof d.levels === 'object') {
    for (const id of Object.keys(d.levels)) {
      const r = d.levels[id] ?? {};
      base.levels[id] = {
        best: typeof r.best === 'number' && r.best > 0 ? r.best : null,
        splits: Array.isArray(r.splits) ? r.splits.map((x: unknown) => numOr(x, 0)) : [],
        medal: Math.min(4, Math.max(0, Math.floor(numOr(r.medal, 0)))),
        collectibles: strArr(r.collectibles),
        objectives: strArr(r.objectives),
        completions: Math.max(0, Math.floor(numOr(r.completions, 0))),
      };
    }
  }
  if (d.achievements && typeof d.achievements === 'object') {
    for (const id of Object.keys(d.achievements)) base.achievements[id] = numOr(d.achievements[id], 0);
  }
  for (const k of Object.keys(base.equipped) as (keyof Equipped)[]) {
    if (typeof d.equipped?.[k] === 'string') base.equipped[k] = d.equipped[k];
  }
  for (const k of Object.keys(base.totals) as (keyof Totals)[]) base.totals[k] = Math.max(0, numOr(d.totals?.[k], 0));
  base.seenPrompts = strArr(d.seenPrompts);
  return base;
}

export class SaveSystem {
  data: SaveData;
  /** False when the browser refuses storage (private mode); the game then runs without saving. */
  available = true;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
    }
  }

  private load(): SaveData {
    let text: string | null;
    try {
      text = localStorage.getItem(KEY);
      localStorage.setItem(KEY + '.probe', '1');
      localStorage.removeItem(KEY + '.probe');
    } catch {
      this.available = false;
      return defaultSave();
    }
    if (!text) return defaultSave();
    try {
      return sanitizeSave(JSON.parse(text));
    } catch {
      try {
        localStorage.setItem(BACKUP_KEY, text); // keep the broken blob for recovery
      } catch {
        /* ignore */
      }
      return defaultSave();
    }
  }

  /** Schedule a write (debounced — never call storage every frame). */
  save() {
    if (!this.available) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    if (!this.available) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      this.available = false;
    }
  }

  record(levelId: string): LevelRecord {
    return (this.data.levels[levelId] ??= emptyRecord());
  }

  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importJson(text: string): boolean {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !('levels' in parsed)) return false;
      this.data = sanitizeSave(parsed);
      this.flush();
      return true;
    } catch {
      return false;
    }
  }

  reset(keepSettings = true) {
    const fresh = defaultSave();
    if (keepSettings) {
      fresh.settings = this.data.settings;
      fresh.bindings = this.data.bindings;
    }
    this.data = fresh;
    this.flush();
    void clearGhosts();
  }
}

// ----- ghosts (IndexedDB) ---------------------------------------------------------------
const DB = 'velocity-shift';
const STORE = 'ghosts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGhost(levelId: string, data: Float32Array): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data.buffer.slice(0), levelId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ghosts are optional: ignore storage failures */
  }
}

export async function loadGhost(levelId: string): Promise<Float32Array | null> {
  try {
    const db = await openDb();
    const buf = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(levelId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return buf ? new Float32Array(buf) : null;
  } catch {
    return null;
  }
}

export async function clearGhosts(): Promise<void> {
  try {
    const db = await openDb();
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    db.close();
  } catch {
    /* ignore */
  }
}
