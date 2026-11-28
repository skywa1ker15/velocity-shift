/**
 * Game: owns the loop and wires every system together.
 *
 *   input → Simulation (120 Hz fixed ticks) → camera / body / effects / audio → renderer
 *                                    ↘ events → store (HUD, toasts) and progression
 *
 * The UI never calls into systems directly; it calls the small set of public methods here.
 */
import { BreakableView, type BreakInfo } from '../render/BreakableView';
import { SlashFx } from '../fx/SlashFx';
import { SLASHES, SwordPhase } from '../gameplay/Sword';
import * as THREE from 'three';
import type { Entity } from '../entities/Entities';
import { AudioEngine } from '../audio/AudioEngine';
import { CameraRig } from '../camera/CameraRig';
import { Body } from '../character/Body';
import { Gait } from '../character/Gait';
import { FixedLoop, SIM_DT } from '../core/loop';
import { getEnv, type EnvPreset } from '../environment/presets';
import { Motes, Sparks, Sprite, Stickers } from '../fx/Fx';
import { worldUniforms } from '../render/WorldMaterial';
import { Director } from '../multiverse/Director';
import { Scenery } from '../multiverse/Scenery';
import { FX, UNIVERSE_IDS, type FxLook, type UniverseId } from '../multiverse/universes';
import { withSlashables } from '../gameplay/slashables';
import { Simulation } from '../gameplay/Simulation';
import type { Action, Bindings } from '../input/bindings';
import { InputManager } from '../input/InputManager';
import { levelById, levels } from '../levels/registry';
import type { LevelData, LevelMeta } from '../levels/types';
import { MoveState } from '../movement/types';
import { initPhysics } from '../physics/PhysicsWorld';
import {
  addTotals,
  checkAchievements,
  cosmeticFor,
  finishRun,
  isUnlocked,
  type CosmeticCategory,
} from '../progression/Progression';
import { LevelView } from '../render/LevelView';
import { AutoQuality, guessTier, type TierName } from '../render/quality';
import { Renderer } from '../render/Renderer';
import { GhostPlayer, GhostRecorder } from '../replay/Ghost';
import { breakableCentre } from '../gameplay/breakables';
import { Bot } from '../gameplay/Bot';
import { Runner } from '../character/Runner';
import { moveStateNames } from '../movement/types';
import { applyLayouts, deleteGhost, ghostKey, loadGhost, saveGhost, SaveSystem } from '../save/SaveSystem';
import { motionProfile, type MotionProfile, type Settings } from '../settings/settings';
import { ui, type EvoHud } from './store';
import { EvoView } from '../render/EvoView';
import { ABILITIES, FLOW_NAMES, FLOW_TIERS, T as EVO_T, SYNERGIES } from '../evolution/abilities';
import { KINDS, type CollectibleKind, type Rarity } from '../evolution/collectibles';
import type { Slot } from '../evolution/slots';

const SLOT_FILES = import.meta.glob('../evolution/slots/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<Slot[]>
>;
const loadSlots = async (id: string): Promise<Slot[]> =>
  (await SLOT_FILES[`../evolution/slots/${id}.json`]?.()) ?? [];
const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
/** Flow tier colours for the energy wisps (tier 1..4). */
const FLOW_COLORS = [0x7ff3ff, 0x7ff3ff, 0x9dff7a, 0xffb547, 0xff5cf0];
const FLOW_COLS = FLOW_COLORS.map((c) => new THREE.Color(c));

type Mode = 'idle' | 'menu' | 'loading' | 'ready' | 'playing' | 'paused' | 'results';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _vel = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const WOOD_CHIP = new THREE.Color(0xd99a5c);
const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

const _gq0 = new THREE.Quaternion();
const _eq = new THREE.Quaternion();
const _gq1 = new THREE.Quaternion();
const _lvel = { x: 0, y: 0, z: 0 };

export class Game {
  readonly save = new SaveSystem();
  readonly audio = new AudioEngine();
  readonly renderer: Renderer;
  readonly input: InputManager;
  mode: Mode = 'idle';
  sim: Simulation | null = null;
  meta: LevelMeta | null = null;

  private loop: FixedLoop;
  private rig: CameraRig;
  private body: Body;
  private stickers!: Stickers;
  private sparks = new Sparks(420);
  private debrisLook: { shape: 'cube' | 'shard' | 'slab'; amount: number; push: number } = {
    shape: 'slab',
    amount: 1,
    push: 3,
  };
  private dust = new THREE.Color(0xf6f2e6);
  private sparkCol = new THREE.Color();
  private slideLook: FxLook['slide'] = { colors: [], size: 1, rate: 1, life: 0.3 };
  /** Colour for the next slide spark: cycles through the universe's palette, else the suit accent. */
  private pickSlideColor(i: number) {
    const c = this.slideLook.colors;
    if (c.length) this.sparkCol.set(c[(Math.floor(this.time * 14) + i) % c.length]);
    else this.sparkCol.copy(this.accent);
  }
  private trailT = 0;
  /** Share of the player's velocity that new dust inherits (so it is seen from first person). */
  private carry = new THREE.Vector3();
  private impactFx = 0;
  private motes: Motes | null = null;
  private view: LevelView | null = null;
  private data: LevelData | null = null;
  private env: EnvPreset = getEnv('awakening');
  private ghost: GhostPlayer;
  private recorder = new GhostRecorder();
  private auto: AutoQuality | null = null;
  private motion: MotionProfile;
  readonly gait: Gait;
  private time = 0;
  private hudClock = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private dashFx = 0;
  private menuT = 0;
  private restartHold = -1;
  private finishDelay = -1;
  private accent = new THREE.Color();
  private streak = new THREE.Color();
  private trailStyle = 0;
  private loadToken = 0;
  private slideSparkT = 0;
  private menuData: LevelData | null = null;
  // the menu backdrop: the autopilot really runs Level 1 and a chase camera follows the runner
  private menuSim: Simulation | null = null;
  private menuBot: Bot | null = null;
  private menuRunner = new Runner(false);
  private slash = new SlashFx();
  private breaks: BreakableView | null = null;
  private menuAcc = 0;
  private menuYaw = Math.PI;
  private menuCam = new THREE.Vector3();
  private menuSeeded = false;
  private menuSide = 1.05; // which shoulder the hero camera sits over (+right / -left)
  private menuSideV = 1.05;
  private menuRay = { dist: 0, nx: 0, ny: 0, nz: 0, id: 0, wallrun: false };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const s = this.save.data.settings;
    this.motion = motionProfile(s);
    this.input = new InputManager(canvas, this.save.data.bindings, s);
    this.gait = new Gait();
    this.rig = new CameraRig(this.renderer.camera, this.renderer.viewCamera);
    this.body = new Body(this.renderer.viewScene, this.renderer.scene);
    this.body.setMotion(this.motion);
    this.stickers = new Stickers(200);
    this.renderer.viewScene.add(this.slash.group);
    this.renderer.scene.add(this.stickers.mesh, this.sparks.points);
    this.ghost = new GhostPlayer(0xffffff);
    this.renderer.scene.add(this.ghost.group);
    // rebuilt courses: best times, medals and ghosts set on an old layout no longer apply
    this.save.layouts = Object.fromEntries(levels.map((l) => [l.meta.id, l.meta.layout ?? 1]));
    const was = Object.fromEntries(Object.entries(this.save.data.levels).map(([id, r]) => [id, r.layout]));
    for (const id of applyLayouts(this.save.data, this.save.layouts)) void deleteGhost(ghostKey(id, was[id]));
    this.save.save();
    this.body.setVisible(false);

    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onAction = (a, down) => this.onAction(a, down);
    this.renderer.onContextLost = () => {
      ui.getState().set({ contextLost: true });
      if (this.mode === 'playing') this.pause();
    };
    this.renderer.onContextRestored = () => ui.getState().set({ contextLost: false });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.mode === 'playing' && this.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (this.mode === 'playing') this.pause();
        this.audio.setMuted(true);
      } else if (this.mode !== 'paused') this.audio.setMuted(false);
    });
    window.addEventListener('beforeunload', (e) => {
      // guard against accidental tab closes (e.g. Ctrl+W while sliding) mid-run
      if (this.mode === 'playing' && this.sim?.stats.started && !this.sim.stats.finished) e.preventDefault();
    });

    this.applySettings();
    this.applyCosmetics();
    this.resize();
    ui.getState().set({ storageOk: this.save.available });
    this.loop = new FixedLoop(
      () => this.tick(),
      (alpha, dt) => this.frame(alpha, dt),
    );
    this.loop.start();
  }

  // =====================================================================================
  // settings / cosmetics
  // =====================================================================================
  get settings(): Settings {
    return this.save.data.settings;
  }

  updateSettings(patch: Partial<Settings>) {
    Object.assign(this.save.data.settings, patch);
    this.applySettings();
    this.save.save();
    ui.getState().set({ saveRev: ui.getState().saveRev + 1 });
  }

  /** Evolve / Pure from the ready card: the level is rebuilt in the chosen mode. */
  async setGameMode(mode: Settings['gameMode']) {
    if (this.settings.gameMode === mode) return;
    this.updateSettings({ gameMode: mode });
    const id = this.meta?.id;
    if (id && (this.mode === 'ready' || this.mode === 'paused')) await this.loadLevel(id);
  }

  private applySettings() {
    const s = this.settings;
    this.motion = motionProfile(s);
    this.body.setMotion(this.motion);
    this.input.settings = s;
    let tier: TierName;
    let scale = s.resolutionScale;
    if (s.preset === 'auto') {
      if (!this.auto) this.auto = new AutoQuality(guessTier(this.renderer.gl.getContext()));
      tier = this.auto.tier;
      scale = Math.min(scale, this.auto.scale);
    } else {
      this.auto = null;
      tier = s.preset;
    }
    this.renderer.configure(tier, {
      resolutionScale: scale,
      shadows: s.shadows,
      postFx: s.postFx,
      brightness: s.brightness,
    });
    this.renderer.setHazardAlt(s.colorblind);
    this.renderer.universeFx.intensity = s.shiftIntensity * (s.reduceMotion ? 0.3 : 1);
    this.renderer.universeFx.setLook(...this.renderer.screenLook);
    if (this.loop) this.loop.fpsCap = s.fpsCap;
    this.audio.applySettings(s);
    if (this.motes) this.motes.points.visible = s.particles > 0.05;
  }

  setBindings(b: Bindings) {
    this.save.data.bindings = b;
    this.input.bindings = b;
    this.save.save();
    ui.getState().set({ saveRev: ui.getState().saveRev + 1 });
  }

  equip(category: CosmeticCategory, id: string) {
    this.save.data.equipped[category] = id;
    this.applyCosmetics();
    this.save.save();
    ui.getState().set({ saveRev: ui.getState().saveRev + 1 });
  }

  private applyCosmetics() {
    const s = this.save.data;
    const suit = cosmeticFor(s, 'suit');
    this.accent.set(suit.color);
    this.slash.setAccent(this.accent);
    this.body.setAccent(suit.color);
    this.ghost.setColor(suit.color);
    this.trailStyle = cosmeticFor(s, 'trail').style ?? 0;
    const lines = cosmeticFor(s, 'lines');
    this.streak.set(lines.color || this.universeStreak || this.env.streak);
    document.documentElement.dataset.hud = cosmeticFor(s, 'hud').id;
  }

  private resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.resize(w, h);
    this.sparks.setViewportHeight(h);
    this.motes?.setViewportHeight(h);
  }

  // =====================================================================================
  // boot / menu
  // =====================================================================================
  /** Called once from the boot screen. Prepares physics and the menu backdrop. */
  async boot(onProgress: (p: number, label: string) => void) {
    onProgress(0.15, 'Starting physics');
    await initPhysics();
    onProgress(0.45, 'Building the world');
    const entry = levelById('awakening')!;
    this.menuData = (await entry.load()).build();
    onProgress(0.75, 'Compiling shaders');
    this.showMenuScene();
    await this.renderer.warm();
    onProgress(1, 'Ready');
  }

  /** First user gesture: unlock audio. */
  startAudio() {
    this.audio.init();
    this.audio.applySettings(this.settings);
    this.audio.playMusic('menu');
  }

  private clearLevel() {
    this.view?.dispose();
    this.view = null;
    this.evoView?.dispose();
    this.evoView = null;
    this.evoHudPrev = null;
    this.body.setGlow(1);
    if (this.evoTint >= 0) {
      this.evoTint = -1;
      this.body.setAccent(cosmeticFor(this.save.data, 'suit').color);
    }
    this.breaks?.dispose();
    this.breaks = null;
    this.scenery?.dispose();
    this.scenery = null;
    this.slash.clear();
    this.body.setSword(null);
    this.menuSim?.dispose();
    this.menuSim = null;
    this.menuBot = null;
    this.menuRunner.group.removeFromParent();
    this.sim?.dispose();
    this.sim = null;
    this.motes?.dispose();
    this.motes = null;
    this.data = null;
    this.meta = null;
    this.ghost.load(null);
  }

  /**
   * The multiverse: which universe is on screen and the shifts between them. Visual only; the
   * simulation never reads it.
   */
  readonly multiverse = new Director({
    ambient: (a) => this.renderer.applyAmbient(a.light, a.post),
    screen: (a, b, k) => this.renderer.setScreen(a, b, k),
    cross: (kind, def) => {
      const fx = this.renderer.universeFx;
      // each transition leaves its own mark on the lens as it passes
      fx.flash = kind === 3 ? 0.9 : kind === 2 || kind === 5 ? 0.25 : 0.6;
      if (kind === 2 || def.id === 'corrupt') fx.burst = 1;
      this.shiftKick = 1;
      this.audio.shift(kind);
    },
    arrive: (def, env, announce) => {
      this.applyFxLook(def.id, env);
      this.audio.setUniverse(def.id);
      if (announce && this.mode === 'playing') ui.getState().call('shift', def.name, def.tagline);
      document.documentElement.dataset.universe = def.id;
      this.body.setPalette(env.hands);
      this.menuRunner.setPalette(env.hands);
      this.setMotes(env);
      this.universeStreak = env.streak;
      this.applyCosmetics();
      this.applyFxLook(def.id, env);
    },
  });
  private universeStreak = 0;
  /** 1 → 0 after a front crosses the camera: drives a small FOV breath and speed-line burst. */
  private shiftKick = 0;
  /** Each universe's background architecture for the loaded level. */
  scenery: Scenery | null = null;

  private buildScenery(levelId: string, data: LevelData) {
    this.scenery?.dispose();
    this.scenery = new Scenery(levelId, data, this.env, this.renderer.tier.particles >= 1 ? 1 : 0.6);
    this.renderer.scene.add(this.scenery.group);
  }
  /** Movement feedback drawn in the current universe's style. */
  private applyFxLook(id: UniverseId, env: EnvPreset) {
    const fx = FX[id];
    if (!fx) return;
    // brush universes use the true stroke colour (black ink); the rest keep the cosmetic tint
    this.stickers.setMode(fx.sprites);
    this.dust.set(fx.dust);
    this.slideLook = fx.slide;
    this.slash.setLook(fx.trail);
    this.debrisLook = fx.debris;
    document.documentElement.style.setProperty(
      '--uni',
      '#' + env.palette.accent.toString(16).padStart(6, '0'),
    );
  }

  // ----- flow chain + near misses (feedback only; nothing here feeds the simulation) -----
  private flowCount = 0;
  private flowAt = -10;
  private flowKick = 0;
  private nearMarks = new Map<number, number>();
  private nearDeaths = 0;

  /** A movement tech just happened: chained quickly enough, it builds a flow call-out. */
  private flowMove() {
    if (this.time - this.flowAt > 1.8) this.flowCount = 0;
    this.flowAt = this.time;
    this.flowCount++;
    if (this.flowCount === 3 || this.flowCount === 5 || this.flowCount === 8 || this.flowCount === 12) {
      ui.getState().call('flow', 'Flow ×' + this.flowCount);
      this.flowKick = Math.min(1, 0.45 + this.flowCount * 0.05);
    }
  }

  // =====================================================================================
  // Evolve mode
  // =====================================================================================
  private evoView: EvoView | null = null;
  private evoHudPrev: EvoHud | null = null;
  private evoHudT = 0;
  private wispT = 0;
  /** Tests / debugging: seed for the next Evolve runs (null = a fresh random one each load). */
  evoSeed: number | null = null;

  private staminaWarned = false;
  /** Stamina for the HUD; warns once (a soft tick) each time a sprint drags it below a quarter. */
  private staminaFrac(pl: Simulation['player']) {
    const f = pl.stamina / pl.cfg.staminaMax;
    if (pl.sprinting && f < pl.cfg.staminaLow / pl.cfg.staminaMax && !this.staminaWarned) {
      this.staminaWarned = true;
      this.audio.staminaLow();
    }
    return Math.round(f * 200) / 200;
  }

  private ended = new Map<string, { row: EvoHud['effects'][number]; at: number }>();
  private lastEffects = new Map<string, EvoHud['effects'][number]>();
  /** Active effects for the HUD, with ones that just ran out kept for a moment as ended. */
  private effectRows(now: EvoHud['effects']): EvoHud['effects'] {
    const ids = new Set(now.map((e) => e.id));
    for (const [id, row] of this.lastEffects)
      if (!ids.has(id) && !this.ended.has(id) && row.max > 0) {
        // timed effects show ENDED for a moment; a state with no clock (Overdrive) simply goes
        this.ended.set(id, { row: { ...row, left: 0, ended: true }, at: this.time });
        // and only the long power-ups chime as they run out (not every hover or shield blink)
        if (row.max >= 3) this.audio.effectEnd();
      }
    this.lastEffects = new Map(now.map((e) => [e.id, e]));
    for (const [id, e] of this.ended) if (ids.has(id) || this.time - e.at > 0.9) this.ended.delete(id);
    return [
      ...now.map((e) => ({ ...e, left: e.left < 0 ? -1 : Math.round(e.left * 10) / 10 })),
      ...[...this.ended.values()].map((e) => e.row),
    ];
  }

  /** HUD snapshot for Evolve (the same object while nothing visible changed). */
  private evoHud(force: boolean): EvoHud | null {
    const evo = this.sim?.evo;
    if (!evo) return null;
    const prev = this.evoHudPrev;
    if (!force && prev && this.time - this.evoHudT < 0.08) return prev;
    const h = evo.hud();
    const lo = FLOW_TIERS[h.tier],
      hi = FLOW_TIERS[h.tier + 1] ?? 120;
    const next: EvoHud = {
      flux: Math.round(h.flux),
      tier: h.tier,
      flowFrac: Math.round(Math.min(1, Math.max(0, (h.flow - lo) / (hi - lo))) * 20) / 20,
      stage: h.stage,
      surge: Math.round(h.surge * 10) / 10,
      surgeMax: h.surgeMax,
      reflex: Math.round(h.reflex * 10) / 10,
      aegis: Math.round(h.aegis * 20) / 20,
      chain: h.chain,
      chainLeft: Math.round(h.chainLeft * 10) / 10,
      streak: h.streak,
      streakFrac: Math.round(h.streakLeft * 20) / 20,
      mult: Math.round(h.mult * 10) / 10,
      lock: h.lock > 0,
      effects: this.effectRows(h.effects),
      canSurge:
        evo.level('timeslip') > 0 &&
        (h.flux >= EVO_T.timeslipCost || (evo.level('chrono') > 0 && h.tier >= 3)),
      abilities: h.abilities,
      synergies: h.synergies.map((id) => SYNERGIES.find((s) => s.id === id)!.name),
    };
    this.evoHudT = this.time;
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
    this.evoHudPrev = next;
    return next;
  }

  /** Evolve feedback: pickups, upgrades, synergies, Surge, the shield, shockwaves, Flow tiers. */
  private wireEvo(sim: Simulation) {
    const evo = sim.evo;
    if (!evo) return;
    const pl = sim.player;
    const audio = this.audio;
    const store = () => ui.getState();
    evo.events.on('pickup', ({ index, kind }) => {
      const it = evo.items[index];
      this.lastPickup = { kind, at: this.time };
      const def = KINDS[kind];
      const rank = RARITY_RANK[def.rarity];
      audio.evoPickup(rank);
      _v.set(it.p[0], it.p[1], it.p[2]);
      const col = new THREE.Color(
        rank === 0 ? 0x7ff3ff : rank === 1 ? 0x9dff7a : rank === 2 ? 0xffb547 : 0xff5cf0,
      );
      this.glints(_v, this.count(rank === 0 ? 3 : 8 + rank * 4), 2 + rank, 0.3 + rank * 0.12, col, 1);
      if (rank > 0)
        this.stickers.spawn(_v, col, {
          sprite: Sprite.ring,
          frames: 2,
          size: 1,
          grow: 4 + rank,
          life: 0.45,
          normal: UP,
        });
      if (rank >= 2 && (kind !== 'echo' || it.order === 3))
        store().call('rare', def.name.toUpperCase(), 'Rare find');
    });
    evo.events.on('upgrade', ({ id, level, evolution }) => {
      const def = ABILITIES[id];
      audio.evoUpgrade(!!evolution);
      // say where it came from and what it now does
      const src =
        this.lastPickup && this.time - this.lastPickup.at < 0.05
          ? KINDS[this.lastPickup.kind].name
          : 'Full Flux';
      store().call(
        'evolve',
        evolution ? evolution.toUpperCase() : `${def.name.toUpperCase()} ${level}`,
        `${src} → ${def.name} ${level}: ${def.levels[level - 1]}`,
      );
      this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, evolution ? 0.35 : 0.15);
    });
    evo.events.on('synergy', ({ name, id }) => {
      audio.evoSynergy();
      store().call('synergy', name.toUpperCase(), SYNERGIES.find((s) => s.id === id)!.text);
      this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.5);
      _v.set(pl.pos.x, pl.pos.y + 1, pl.pos.z);
      this.stickers.spawn(_v, new THREE.Color(0xff5cf0), {
        sprite: Sprite.ring,
        frames: 2,
        size: 2,
        grow: 6,
        life: 0.7,
        normal: UP,
      });
    });
    evo.events.on('flowTier', ({ tier, up }) => {
      if (up && tier >= 2) store().call('flow', FLOW_NAMES[tier].toUpperCase(), `Flow tier ${tier}`);
      this.flowKick = Math.max(this.flowKick, up ? 0.4 + tier * 0.15 : 0);
    });
    evo.events.on('surge', ({ on }) => {
      audio.evoSurge(on);
      if (on) store().call('evolve', 'SURGE', 'The world slows');
    });
    evo.events.on('aegis', ({ kind }) => {
      if (kind === 'ready') return;
      audio.evoShield();
      store().call(
        'close',
        kind === 'void' ? 'CAUGHT' : 'SHIELDED',
        kind === 'void' ? 'Aegis pulled you back' : 'Aegis took the hit',
      );
      this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.45);
    });
    evo.events.on('reflex', () => store().call('close', 'REFLEX', 'Time slows'));
    evo.events.on('effect', ({ id, on }) => {
      if (id === 'overcharge' && on) {
        store().call('evolve', 'OVERCHARGE', 'Sprint costs no stamina · Flux ×1.5');
        this.audio.evoBoost(true);
      }
    });
    evo.events.on('chain', ({ node, failed }) => {
      if (failed) store().call('close', 'CHAIN LOST', 'The echo faded: start again from the first node');
      else if (node > 0 && node < 4) store().call('rare', `ECHO ${node}/4`, 'Catch the next node');
    });
    evo.events.on('phased', () =>
      store().call('close', 'PHASED', 'Reach Flow tier 3 to hold a Paradox Core'),
    );
    evo.events.on('shockwave', ({ x, y, z, r, kind }) => {
      audio.evoShock();
      _v.set(x, kind === 'crescent' ? y : y - 0.85, z);
      this.stickers.spawn(_v, this.accent, {
        sprite: Sprite.ring,
        frames: 2,
        size: 1,
        grow: r * 2,
        life: 0.4,
        normal: UP,
      });
    });
    // pushes from abilities: named on the screen only when they are the rarer, deliberate ones
    const NAMED: Partial<Record<string, string>> = {
      slingshot: 'SLINGSHOT',
      surge: 'WALL SURGE',
      dashjump: 'DASH JUMP',
      skyward: 'SKYWARD CUT',
      blink: 'BLINK',
      skim: 'SKIM',
      lantern: 'LIFT',
    };
    const BIG = new Set(['slingshot', 'surge', 'dashjump', 'skyward', 'gate', 'prism', 'streak', 'lantern']);
    evo.events.on('boost', ({ kind }) => {
      const name = NAMED[kind];
      if (name) store().call(kind === 'slingshot' ? 'evolve' : 'flow', name);
      audio.evoBoost(BIG.has(kind));
      this.flowKick = Math.max(this.flowKick, BIG.has(kind) ? 0.8 : 0.5);
    });
    evo.events.on('streak', ({ n, milestone, broken }) => {
      if (broken) return;
      audio.evoChain(n, !!milestone);
      if (milestone) {
        store().call(
          'flow',
          `${milestone.toUpperCase()}`,
          `Chain ${n} · Flux ×${evo.streakMult().toFixed(1)}`,
        );
        this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.2);
      }
    });
    evo.events.on('gate', ({ cleared, left }) => {
      if (cleared) {
        store().call('rare', 'GATE CLEARED', 'Dash charges full · speed burst');
        this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.3);
      } else if (left > 0) store().call('close', 'GATE MISSED', 'Cut every spindle in a gate within 4 s');
    });
    evo.events.on('overflow', () => {
      this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.2);
    });
  }

  private lastPickup: { kind: CollectibleKind; at: number } | null = null;
  private evoTint = -1;
  private slowFx = 0;
  /**
   * The runner's look follows the run: trims glow brighter with each evolution stage, take the
   * Flow tier's colour from tier 2, and energy wisps stream past the view with Flow. While the
   * world is slowed the screen takes a steady cool grade.
   */
  private evoVisuals(dt: number) {
    const evo = this.sim?.evo;
    const fx = this.renderer.universeFx;
    this.slowFx += ((evo && evo.worldScale < 1 ? 1 : 0) - this.slowFx) * Math.min(1, dt * 6);
    fx.slow = this.slowFx * (this.motion.screenFx ? 1 : 0.5);
    if (!evo) return;
    const pl = this.sim!.player;
    const tier = evo.flowTier,
      stage = evo.stage;
    this.body.setGlow(1 + stage * 0.6 + tier * 0.25 + (evo.surgeLeft > 0 ? 1 : 0));
    const tint = tier >= 2 ? FLOW_COLORS[tier] : -1;
    if (tint !== this.evoTint) {
      this.evoTint = tint;
      this.body.setAccent(tint >= 0 ? tint : cosmeticFor(this.save.data, 'suit').color);
    }
    this.wispT -= dt;
    if ((tier >= 1 || stage >= 2) && pl.speed > 5 && this.wispT <= 0 && this.settings.particles > 0) {
      this.wispT = 0.12 / (1 + tier * 0.6 + stage * 0.3);
      // in the first person the body is behind the eye: wisps start ahead and to the sides of
      // the view and stream back past it, so the runner sees their own energy
      const e = this.rig.eye;
      const fx0 = -Math.sin(this.input.yaw),
        fz0 = -Math.cos(this.input.yaw);
      const s = Math.sin(this.time * 37.3);
      const side = s > 0 ? 1 : -1;
      _v.set(
        e.x + fx0 * 2.2 - fz0 * side * (0.7 + Math.abs(s) * 0.6),
        e.y - 0.5 + Math.abs(Math.sin(this.time * 23.1)) * 0.9,
        e.z + fz0 * 2.2 + fx0 * side * (0.7 + Math.abs(s) * 0.6),
      );
      _w.set(pl.vel.x * 0.55, 0.3, pl.vel.z * 0.55);
      this.stickers.spawn(_v, FLOW_COLS[Math.max(1, tier)], {
        sprite: Sprite.glint,
        size: 0.1 + stage * 0.025 + tier * 0.02,
        grow: 0.2,
        life: 0.3 + tier * 0.04,
        vel: _w,
        drag: 0.5,
      });
    }
  }

  /** Brushing past something lethal at speed and living earns a call-out. */
  private watchNearMisses(sim: Simulation) {
    const pl = sim.player;
    if (sim.stats.deaths !== this.nearDeaths) {
      this.nearDeaths = sim.stats.deaths;
      this.nearMarks.clear();
      this.flowCount = 0;
      return;
    }
    if (!sim.stats.started || sim.stats.finished) return;
    const px = pl.pos.x,
      py = pl.pos.y + 0.9,
      pz = pl.pos.z;
    const ents = sim.entities as unknown as {
      p: { x: number; y: number; z: number };
      h?: { x: number; y: number; z: number };
      def: { lethal?: boolean; type?: string };
    }[];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.h || !(e.def.lethal || e.def.type === 'hazard')) continue;
      const dx = Math.max(Math.abs(px - e.p.x) - e.h.x, 0),
        dy = Math.max(Math.abs(py - e.p.y) - e.h.y - 0.45, 0),
        dz = Math.max(Math.abs(pz - e.p.z) - e.h.z, 0);
      const gap = Math.hypot(dx, dy, dz) - 0.4;
      const mark = this.nearMarks.get(i);
      if (gap < 0.8 && pl.speed > 6) {
        if (mark === undefined) this.nearMarks.set(i, this.time);
      } else if (mark !== undefined && gap > 1.7) {
        this.nearMarks.delete(i);
        if (this.time - mark < 2.5) {
          ui.getState().call('close', 'Close call');
          this.flowKick = Math.max(this.flowKick, 0.7);
          this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.3);
        }
      }
    }
  }

  /** Tests / debugging: use this seed for the next runs instead of a fresh random one. */
  mvSeed: number | null = null;
  /** Tests: leave `multiverse.enabled` alone (universes are driven by hand). */
  mvManual = false;

  /** Start (or restart) the visual run plan for the loaded level. */
  private beginMultiverse(levelId: string, checkpoints: number) {
    const seed = this.mvSeed ?? Math.floor(Math.random() * 0x7fffffff);
    const mode = this.settings.multiverse;
    if (!this.mvManual) this.multiverse.enabled = mode === 'dynamic';
    this.multiverse.begin(levelId, this.env, seed, checkpoints, mode === 'classic' ? 'anime' : undefined);
  }

  /** Debug / tests: every universe in the library. */
  universeIds() {
    return [...UNIVERSE_IDS];
  }

  /** Debug: shift to a universe from a point just ahead of the camera. */
  debugShift(to: UniverseId, transition = 0) {
    const yaw = this.input.yaw;
    _v.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return this.multiverse.shiftAhead(to, this.rig.eye, _v, transition);
  }

  private setMotes(env: EnvPreset) {
    this.motes?.dispose();
    const m = env.motes;
    const count = Math.round(m.count * this.renderer.tier.particles * Math.max(0.2, this.settings.particles));
    this.motes = new Motes(count, m.color, m.size, m.rise);
    this.motes.setViewportHeight(window.innerHeight);
    this.motes.points.visible = this.settings.particles > 0.05;
    this.renderer.scene.add(this.motes.points);
  }

  private setEnv(id: string) {
    this.env = getEnv(id);
    document.documentElement.style.setProperty(
      '--lv',
      '#' + this.env.palette.accent.toString(16).padStart(6, '0'),
    );
    this.renderer.applyEnv(this.env);
    this.body.setPalette(this.env.hands);
    this.menuRunner.setPalette(this.env.hands);
    this.universeStreak = this.env.streak;
    this.setMotes(this.env);
    this.applyCosmetics();
  }

  /** Slow fly-through of Level 1 behind the menus. */
  showMenuScene() {
    this.loadToken++;
    this.clearLevel();
    this.setEnv('awakening');
    // the menu is a window onto the multiverse: it starts in Level 1's home and keeps drifting
    this.multiverse.enabled = false;
    this.multiverse.begin(
      'awakening',
      this.env,
      1,
      0,
      this.settings.multiverse === 'classic' ? 'anime' : undefined,
    );
    this.menuShiftAt = 7;
    if (this.menuData) this.buildScenery('awakening', this.menuData);
    if (this.menuData) {
      this.menuSim = new Simulation(levelById('awakening')!.meta, this.menuData);
      this.menuBot = new Bot(this.menuSim);
      this.menuBot.autoSlash = true;
      this.menuSeeded = false;
      this.view = new LevelView(this.menuData, this.env, this.menuSim);
      this.breaks = new BreakableView(this.menuData.breakables, this.env.palette, this.menuSim);
      const br = this.breaks;
      this.menuSim.events.on('break', ({ index, by, hit }) => {
        const info = br.break(
          index,
          by,
          hit,
          _vel.set(this.menuSim!.player.vel.x, this.menuSim!.player.vel.y, this.menuSim!.player.vel.z),
          this.menuCam,
        );
        if (info) this.breakFx(info, false);
      });
      this.renderer.scene.add(this.view.group, this.breaks.group, this.menuRunner.group);
      this.menuRunner.group.visible = true;
    }
    this.body.setVisible(false);
    this.input.enabled = false;
    this.mode = 'menu';
    this.audio.silenceLoops();
    this.audio.playMusic('menu');
    ui.getState().set({ levelId: null, prompt: null, results: null });
  }

  quitToMenu() {
    this.abandonRun();
    this.input.exitLock();
    this.audio.setMuted(false);
    this.showMenuScene();
    ui.getState().set({ screen: 'menu', overlay: null });
  }

  // =====================================================================================
  // level flow
  // =====================================================================================
  /** The level "Play" continues with: the first course not yet finished. */
  nextUnfinished(): string {
    const s = this.save.data;
    const c = levels.find((l) => !l.meta.training && !(s.levels[l.meta.id]?.completions ?? 0));
    return (c ?? levels[1]).meta.id;
  }

  async loadLevel(id: string) {
    this.debugFrozen = false;
    const entry = levelById(id);
    if (!entry || !isUnlocked(this.save.data, id)) return;
    const token = ++this.loadToken;
    const set = ui.getState().set;
    this.abandonRun();
    this.mode = 'loading';
    this.input.enabled = false;
    set({
      screen: 'loading',
      overlay: null,
      loadProgress: 0.05,
      loadLabel: 'Loading ' + entry.meta.name,
      levelId: id,
      results: null,
      prompt: null,
    });
    try {
      await initPhysics();
      set({ loadProgress: 0.25 });
      const mod = await entry.load();
      if (token !== this.loadToken) return;
      set({ loadProgress: 0.45, loadLabel: 'Building geometry' });
      await nextFrame();
      const slots = await loadSlots(id);
      // the slashable world: seeded per course, the same in both modes
      const data = withSlashables(mod.build(), slots, entry.meta.seed);
      this.clearLevel();
      this.meta = entry.meta;
      this.data = data;
      this.setEnv(entry.meta.env);
      const evolve =
        this.settings.gameMode === 'evolve'
          ? { seed: this.evoSeed ?? (Math.random() * 2 ** 31) >>> 0, slots }
          : undefined;
      if (token !== this.loadToken) return;
      this.sim = new Simulation(entry.meta, data, { evolve });
      if (this.sim.evo) {
        this.evoView = new EvoView(this.sim.evo);
        this.renderer.scene.add(this.evoView.group);
      }
      this.beginMultiverse(id, data.checkpoints.length - 1);
      const owned = new Set(this.save.record(id).collectibles);
      this.view = new LevelView(data, this.env, this.sim, owned);
      this.breaks = new BreakableView(data.breakables, this.env.palette, this.sim);
      this.breaks.onCrumble = (at) => this.puffs(at, 5, 1.2, 0.45);
      this.renderer.scene.add(this.view.group, this.breaks.group);
      this.buildScenery(id, data);
      this.body.setSword(this.sim.sword);
      this.wireSim(this.sim);
      set({ loadProgress: 0.7, loadLabel: 'Compiling shaders' });
      await nextFrame();
      this.body.setVisible(true);
      this.placeCamera();
      await this.renderer.warm();
      if (token !== this.loadToken) return;
      set({ loadProgress: 0.9, loadLabel: 'Loading ghost' });
      this.ghost.load(await loadGhost(ghostKey(id, entry.meta.layout)));
      if (token !== this.loadToken) return;
      this.recorder.reset();
      this.mode = 'ready';
      this.audio.playMusic(entry.meta.music);
      set({ loadProgress: 1, screen: 'ready' });
      this.pushHud(true);
    } catch (err) {
      console.error('Level failed to load', err);
      ui.getState().toast('info', 'Could not load level', 'Returning to the menu.');
      this.quitToMenu();
    }
  }

  private placeCamera() {
    const sim = this.sim!;
    const cp = sim.data.checkpoints[sim.checkpoint] ?? { yaw: sim.meta.spawn.yaw };
    this.input.setLook(cp.yaw, 0);
    this.rig.reset(sim.player);
    this.gait.reset();
  }

  /** From the "ready" card or the pause menu: lock the pointer and (re)start play. */
  async begin() {
    if (this.mode !== 'ready' && this.mode !== 'paused') return;
    ui.getState().set({ lockHint: false });
    await this.input.requestLock();
    // browsers refuse a re-lock for a moment after Esc: stay put and ask for another click
    if (document.pointerLockElement !== this.renderer.canvas && !(window as any).__vsAllowUnlocked) {
      ui.getState().set({ lockHint: true });
      return;
    }
    this.enterPlay();
  }

  private enterPlay() {
    this.mode = 'playing';
    this.input.enabled = true;
    this.audio.setMuted(false);
    this.loop.resetClock();
    ui.getState().set({ screen: 'playing', overlay: null, lockHint: false });
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.enabled = false;
    this.input.exitLock();
    this.audio.silenceLoops();
    this.audio.setMuted(true);
    this.restartHold = -1;
    ui.getState().set({ screen: 'paused' });
  }

  private onLockChange(locked: boolean) {
    if (!locked && this.mode === 'playing') this.pause();
    else if (locked && (this.mode === 'paused' || this.mode === 'ready')) this.enterPlay();
  }

  private onAction(a: Action, down: boolean) {
    if (a === 'pause' && down) {
      if (this.mode === 'playing') this.pause();
      return;
    }
    if (a === 'restart' && this.mode === 'playing') {
      if (down) this.restartHold = 0;
      else {
        if (this.restartHold >= 0 && this.restartHold < 0.6) this.restartCheckpoint();
        this.restartHold = -1;
      }
    }
  }

  restartCheckpoint() {
    if (!this.sim || this.sim.stats.finished) return;
    this.sim.restartFromCheckpoint();
    ui.getState().fire('respawn');
  }

  restartLevel() {
    if (!this.sim) return;
    this.abandonRun();
    this.sim.restart();
    this.beginMultiverse(this.sim.meta.id, this.sim.data.checkpoints.length - 1);
    this.view?.showCollectibles();
    this.recorder.reset();
    this.finishDelay = -1;
    ui.getState().set({ results: null });
    ui.getState().fire('respawn');
    this.pushHud(true);
    if (this.mode === 'results' || this.mode === 'paused') {
      this.mode = 'paused';
      void this.begin();
    }
  }

  /** Count an unfinished run's totals (distance, deaths…) before it is discarded. */
  private abandonRun() {
    const st = this.sim?.stats;
    if (st && st.started && !st.finished && st.ticks > 120) {
      addTotals(this.save.data, st);
      this.announce(checkAchievements(this.save.data, null, null, null));
      this.save.save();
    }
  }

  private announce(list: { name: string; desc: string }[]) {
    for (const a of list) {
      ui.getState().toast('achievement', a.name, a.desc);
      this.audio.achievement();
    }
    if (list.length) ui.getState().set({ saveRev: ui.getState().saveRev + 1 });
  }

  // =====================================================================================
  // simulation events → feedback
  // =====================================================================================
  private wireSim(sim: Simulation) {
    const pl = sim.player,
      ev = pl.events,
      audio = this.audio;
    this.wireEvo(sim);
    // world events and mechanisms: a light cue and a sound so nothing changes unannounced
    sim.events.on('event', ({ name }) => {
      const vis = sim.director.dims.visual;
      if (name.startsWith('ev-')) {
        this.renderer.universeFx.flash = Math.max(this.renderer.universeFx.flash, 0.18 + 0.25 * vis);
        audio.evoShock();
        ui.getState().call('flow', 'THE WORLD MOVES', 'Hold on: it is telegraphed');
      } else if (name.startsWith('open-')) {
        audio.evoBoost(true);
        ui.getState().call('rare', 'BYPASS OPEN', 'The glass is gone: the clear lane is yours');
      } else if (name.startsWith('off-')) {
        audio.staminaEmpty();
        ui.getState().call('rare', 'GATE POWERED DOWN', 'You cut its conduit');
      }
    });
    const feet = () => _v.set(pl.pos.x, pl.pos.y + 0.04, pl.pos.z);
    // a spot on the ground a moment ahead: where a first-person player actually sees a decal
    const ahead = (t: number) => _v.set(pl.pos.x + pl.vel.x * t, pl.pos.y + 0.04, pl.pos.z + pl.vel.z * t);
    ev.on('jump', () => {
      audio.jump();
      this.rig.onJump(pl.speed);
      this.body.onJump(pl.speed);
      // take-off: a kick of dust and a quick pen ring where the feet were
      this.puffs(feet(), 3, 1.5, 0.3);
      this.stickers.spawn(feet(), this.dust, {
        sprite: Sprite.ring + 1,
        size: 0.5,
        grow: 2.2,
        life: 0.25,
        normal: UP,
        alpha: 0.9,
      });
    });
    ev.on('doubleJump', () => {
      this.flowMove();
      audio.doubleJump();
      this.rig.onDoubleJump();
      this.body.onDoubleJump();
      // an "air step": a plate of light to push off, with glints thrown down
      this.stickers.spawn(feet(), this.accent, {
        sprite: this.trailStyle === 2 ? Sprite.star : Sprite.ring,
        frames: this.trailStyle === 2 ? 4 : 2,
        size: 0.8,
        grow: 2.4,
        life: 0.38,
        normal: UP,
      });
      this.impactFx = Math.max(this.impactFx, 0.5);
      this.glints(_v, 6, 3.5, 0.24, this.accent, -1);
      this.sparks.emit(_v, DOWN, this.count(8), this.accent, {
        speed: 3,
        spread: 1.4,
        life: 0.35,
        size: 0.045,
        gravity: 6,
      });
    });
    ev.on('sprintStart', () => {
      audio.sprint();
      this.rig.onSprint();
      this.staminaWarned = false;
    });
    ev.on('staminaEmpty', () => {
      audio.staminaEmpty();
      this.input.clearSprintLatch();
      ui.getState().call('close', 'STAMINA EMPTY', 'Sprint is back once the bar refills past the mark');
    });
    ev.on('staminaBack', () => audio.staminaBack());
    ev.on('dash', () => {
      this.flowMove();
      audio.dash();
      this.rig.onDash();
      this.body.onDash();
      this.dashFx = 1;
      const fx = -Math.sin(pl.yaw),
        fz = -Math.cos(pl.yaw);
      _n.set(fx, 0, fz);
      // punch a ring through the air ahead and leave one behind
      _v.set(pl.pos.x + fx * 6, pl.pos.y + 1.2, pl.pos.z + fz * 6);
      this.stickers.spawn(_v, this.accent, {
        sprite: this.trailStyle === 2 ? Sprite.star + 2 : Sprite.ring,
        frames: 2,
        size: 1.2,
        grow: 2.6,
        life: 0.32,
        normal: _n,
      });
      _v.set(pl.pos.x + fx * 10, pl.pos.y + 1.2, pl.pos.z + fz * 10);
      this.stickers.spawn(_v, this.dust, {
        sprite: Sprite.ring + 1,
        size: 0.7,
        grow: 2.2,
        life: 0.3,
        normal: _n,
        alpha: 0.8,
      });
    });
    ev.on('land', ({ speed }) => {
      audio.land(speed);
      this.rig.onLand(speed, pl.vel.x * Math.cos(this.input.yaw) - pl.vel.z * Math.sin(this.input.yaw));
      this.body.onLand(speed);
      // universes that throw sparks throw them from a hard landing too
      if (speed > 10 && this.slideLook.rate > 0) {
        for (let i = 0; i < 3; i++) {
          this.pickSlideColor(i);
          _w.set(0, 0.9, 0);
          this.sparks.emit(this.body.contact, _w, this.count(5), this.sparkCol, {
            speed: 3 + speed * 0.18,
            spread: 2,
            life: this.slideLook.life,
            size: 0.04 * this.slideLook.size,
          });
        }
      }
      if (speed > 4) {
        const k = Math.min(1, speed / 22);
        this.impactFx = Math.max(this.impactFx, 0.35 + k * 0.65);
        this.puffs(feet(), 4 + Math.round(k * 6), 4 + k * 5, 0.4 + k * 0.35);
        this.stickers.spawn(ahead(0.24), this.dust, {
          sprite: Sprite.ring,
          frames: 2,
          size: 0.7 + k * 0.6,
          grow: 2 + k * 1.5,
          life: 0.3 + k * 0.15,
          normal: UP,
          alpha: 0.9,
        });
        // the ground answers: a ring of light runs out through nearby surfaces
        if (speed > 7 && this.settings.particles > 0.05) {
          worldUniforms.uPulse.value.set(pl.pos.x, pl.pos.y, pl.pos.z, this.time);
          worldUniforms.uPulseAmt.value = 0.35 + k * 0.65;
        }
      }
      if (speed > 13) {
        // hard landing: an impact star and action lines thrown outward along the ground
        const k = Math.min(1, speed / 26);
        this.stickers.spawn(ahead(0.26), this.accent, {
          sprite: Sprite.star,
          frames: 4,
          size: 1.1 + k,
          grow: 1.7,
          life: 0.34,
          normal: UP,
          rot: this.time * 3,
        });
        const n = 6 + Math.round(k * 4);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + this.time;
          _n.set(Math.cos(a), 0, Math.sin(a));
          _v.set(
            pl.pos.x + pl.vel.x * 0.26 + _n.x * (0.9 + k),
            pl.pos.y + 0.04,
            pl.pos.z + pl.vel.z * 0.26 + _n.z * (0.9 + k),
          );
          _w.copy(_n).multiplyScalar(5 + k * 5);
          this.stickers.spawn(_v, this.dust, {
            sprite: Sprite.tick,
            size: 0.7 + k * 0.5,
            life: 0.25,
            normal: UP,
            along: _n,
            vel: _w,
            drag: 5,
          });
        }
      }
      if (speed > 24) ui.getState().fire('impact');
    });
    ev.on('slideStart', ({ boosted }) => {
      this.flowMove();
      audio.slideStart();
      this.rig.onSlideStart(boosted);
      this.body.onSlideStart(boosted);
      // drop into the slide: a burst of dust thrown forward along the ground, and (in universes
      // that throw sparks) a fan of them in the universe's own colours
      const sp = Math.max(1, pl.speed);
      _n.set(pl.vel.x / sp, 0, pl.vel.z / sp);
      this.puffs(feet(), 4, 2.4, 0.42, _n);
      if (this.slideLook.rate > 0) {
        for (let i = 0; i < 3; i++) {
          this.pickSlideColor(i);
          _w.set(_n.x * 0.6, 0.5, _n.z * 0.6);
          this.sparks.emit(this.body.contact, _w, this.count(boosted ? 6 : 3), this.sparkCol, {
            speed: 3.5 + pl.speed * 0.2,
            spread: 1.1,
            life: this.slideLook.life,
            size: 0.035 * this.slideLook.size,
          });
        }
      }
    });
    ev.on('slideEnd', () => {
      this.input.clearSlideLatch();
      this.rig.onSlideEnd();
      this.body.onSlideEnd();
    });
    ev.on('wallRunEnd', () => this.body.onWallEnd());
    ev.on('dashEnd', () => this.body.onDashEnd());
    ev.on('wallRunStart', () => {
      this.flowMove();
      audio.wallStart();
      this.body.onWallStart(pl.wallSide);
      this.wallPoint(1.3, 0.3);
      _n.set(pl.wallNormal.x, 0, pl.wallNormal.z);
      this.stickers.spawn(_v, this.accent, {
        sprite: Sprite.star,
        frames: 4,
        size: 0.7,
        grow: 1.8,
        life: 0.28,
        normal: _n,
      });
    });
    ev.on('wallJump', () => {
      this.flowMove();
      audio.wallJump();
      this.body.onWallJump();
      // kick off: an impact star stamped on the wall and dust thrown along it
      _n.set(pl.wallNormal.x, 0, pl.wallNormal.z);
      this.wallPoint(1.1, 0.22);
      this.stickers.spawn(_v, this.accent, {
        sprite: this.trailStyle === 1 ? Sprite.ring : Sprite.star,
        frames: this.trailStyle === 1 ? 2 : 4,
        size: 1,
        grow: 2,
        life: 0.36,
        normal: _n,
      });
      this.puffs(_v, 3, 1.8, 0.32, _n);
    });
    ev.on('vault', () => {
      this.flowMove();
      audio.vault();
      this.rig.onVault();
      this.body.onVault();
      // hands slap the ledge: two small puffs and action ticks where they plant
      const fx = -Math.sin(pl.yaw),
        fz = -Math.cos(pl.yaw);
      for (const side of [-1, 1]) {
        _v.set(
          pl.pos.x + fx * 0.55 - fz * side * 0.2,
          pl.pos.y + 1.05,
          pl.pos.z + fz * 0.55 + fx * side * 0.2,
        );
        this.puffs(_v, 1, 0.8, 0.26);
      }
    });
    ev.on('bump', () => {
      audio.bump();
      this.body.onBump();
    });
    ev.on('footstep', ({ wall, speed }) => {
      audio.footstep(speed, wall);
      if (wall) {
        this.wallPoint(0.15);
        _n.set(pl.wallNormal.x, 0.4, pl.wallNormal.z);
        this.puffs(_v, 1, 1.2, 0.26, _n);
        this.sparks.emit(_v, _n, this.count(3), this.accent, {
          speed: 2.5,
          spread: 1.2,
          life: 0.3,
          size: 0.04,
        });
      } else if (speed > 9.5) {
        // sprinting kicks up a little dust behind each footfall
        _n.set(-pl.vel.x / speed, 0.3, -pl.vel.z / speed);
        this.puffs(feet(), 1, 1.4, 0.2 + Math.min(0.14, (speed - 9.5) * 0.02), _n);
      }
    });

    sim.events.on('checkpoint', ({ index, time }) => {
      audio.checkpoint();
      _n.set(-Math.sin(this.input.yaw), 0, -Math.cos(this.input.yaw));
      this.multiverse.checkpoint(index, _v.set(pl.pos.x, pl.pos.y, pl.pos.z), _n);
      // split deltas compare Pure runs only (an upgraded run is not the same race)
      const best = sim.evo ? undefined : this.save.record(sim.meta.id).splits[index];
      ui.getState().fire(
        'checkpoint',
        `CHECKPOINT ${index}/${sim.data.checkpoints.length - 1}`,
        best ? time - best : null,
      );
      _v.set(pl.pos.x, pl.pos.y + 0.05, pl.pos.z);
      this.stickers.spawn(_v, this.accent, {
        sprite: Sprite.ring,
        frames: 2,
        size: 2,
        grow: 3.4,
        life: 0.6,
        normal: UP,
      });
      _v.y += 1;
      this.glints(_v, 6, 3, 0.3, this.accent, 1);
    });
    sim.events.on('death', () => {
      audio.death();
      ui.getState().fire(
        'death',
        sim.checkpoint > 0 ? `Checkpoint ${sim.checkpoint}` : 'Start',
        null,
        sim.stats.deaths,
      );
    });
    sim.events.on('respawn', () => {
      audio.respawn();
      this.placeCamera();
    });
    sim.events.on('collect', ({ id, index }) => {
      audio.collect();
      this.view?.hideCollectible(index);
      const rec = this.save.record(sim.meta.id);
      const isNew = !rec.collectibles.includes(id);
      if (isNew) {
        rec.collectibles.push(id);
        this.save.save();
      }
      ui.getState().toast(
        'collect',
        isNew ? 'Shard found' : 'Shard',
        `${rec.collectibles.length} / ${sim.data.collectibles.length} in this level`,
      );
      _v.set(pl.pos.x, pl.pos.y + 1, pl.pos.z);
      this.sparks.emit(_v, UP, this.count(24), this.accent, {
        speed: 4,
        spread: 2,
        life: 0.7,
        size: 0.07,
        gravity: 3,
      });
    });
    sim.events.on('shortcut', ({ hidden }) => {
      if (hidden) ui.getState().toast('info', 'Hidden route', 'You found another way through.');
    });
    sim.events.on('prompt', ({ index }) => {
      const p = index >= 0 ? sim.data.prompts[index] : null;
      ui.getState().set({ prompt: p && this.settings.tutorials ? { action: p.action, text: p.text } : null });
    });
    sim.events.on('signal', ({ kind, entity }) => {
      const d = Math.hypot(entity.p.x - pl.pos.x, entity.p.y - pl.pos.y, entity.p.z - pl.pos.z);
      if (kind === 'boost') audio.boost();
      else if (kind === 'jumppad') audio.jumpPad();
      else if (kind === 'telegraph' && d < 40) audio.warn();
      else if (kind === 'hazardWarn' && d < 24) audio.hazardWarn(1 - d / 24);
      else if (kind === 'collapse' && d < 40) {
        audio.collapse();
        this.rig.shake(Math.max(0, 0.5 - d * 0.02));
      }
      // Phase G
      if (kind === 'collapse' || kind === 'fall') this.breakApart(entity, d);
      else if (kind === 'impulse') {
        audio.impulse();
        this.rig.onDash();
        this.flowMove();
        _v.set(entity.p.x, entity.p.y, entity.p.z);
        const dir = (entity.def as { dir: [number, number, number] }).dir;
        this.sparks.emit(_v, _n.set(dir[0], dir[1], dir[2]).normalize(), this.count(26), this.accent, {
          speed: 9,
          spread: 0.6,
          life: 0.5,
          size: 0.08,
          gravity: 0,
        });
      } else if (kind === 'structure' && d < 120) {
        audio.structure();
        this.rig.shake(Math.max(0, 0.35 - d * 0.004) * this.motion.shake);
      }
    });
    sim.events.on('sword', ({ action, kind, fromSheath }) => {
      if (action === 'draw') audio.swordDraw();
      else if (action === 'sheathe') audio.swordSheathe();
      else if (action === 'slash' && kind !== undefined) {
        const sw = sim.sword;
        audio.slash(kind, sw.attacking ? 0.5 + 0.5 * (kind === 1 ? 1 : kind === 3 ? 0.8 : 0.5) : 0.5);
        // the arc shows the blade's real reach (Reach, Severance, the speed lead)
        this.slash.spawn(sw.pose, sw.serial, 1 + Math.min(0.7, sw.reachAdd * 0.22));
        if (fromSheath) this.impactFx = Math.max(this.impactFx, 0.3);
      }
    });
    sim.events.on('break', ({ index, by, hit }) => {
      const info = this.breaks?.break(index, by, hit, _vel.set(pl.vel.x, pl.vel.y, pl.vel.z), this.rig.eye);
      if (!info) return;
      this.breakFx(info, true);
      if (by === 'sword') {
        audio.cut(info.mat, info.power);
        this.rig.onCut(info.power);
        if (info.bullseye) audio.bullseye();
      } else audio.smash(info.mat);
      ui.getState().fireHit(
        by === 'body' ? 'smash' : info.bullseye ? 'bullseye' : 'cut',
        sim.stats.cuts + sim.stats.smashes,
      );
    });
    sim.events.on('finish', () => {
      this.finishDelay = 0.9; // let the moment land before the results screen
      audio.finish(0);
      _v.set(pl.pos.x, pl.pos.y + 0.05, pl.pos.z);
      this.stickers.spawn(_v, this.accent, {
        sprite: Sprite.star,
        frames: 4,
        size: 3,
        grow: 3,
        life: 0.8,
        normal: UP,
      });
      _v.y += 1.2;
      this.glints(_v, 12, 5, 0.4, this.accent, 1);
    });
  }

  /** Effects for a destroyed object, by material and by how it was destroyed. */
  private breakFx(info: BreakInfo, near: boolean) {
    const c = info.centre;
    const sword = info.by === 'sword';
    const toCam = _n.copy(this.renderer.camera.position).sub(c).normalize();
    if (sword && near) {
      // the cut itself, inked across the object: a white-hot slash mark and an accent echo
      this.stickers.spawn(c, WHITE, {
        sprite: Sprite.streak,
        size: 0.8 + info.power * 0.5,
        stretch: 3.6,
        life: 0.16,
        normal: toCam,
        along: info.along,
      });
      this.stickers.spawn(c, this.accent, {
        sprite: Sprite.streak,
        size: 1.1 + info.power * 0.5,
        stretch: 3,
        life: 0.24,
        normal: toCam,
        along: info.along,
        alpha: 0.65,
      });
      this.impactFx = Math.max(this.impactFx, 0.45 + info.power * 0.3);
    }
    this.stickers.spawn(c, sword ? this.accent : this.dust, {
      sprite: Sprite.star,
      frames: 4,
      size: sword ? 0.7 : 0.6,
      grow: 1.6,
      life: 0.26,
      normal: toCam,
    });
    const along = info.along;
    switch (info.mat) {
      case 'wood':
        this.puffs(c, 5, 2.2, 0.4);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.7 + this.time;
          _w.set(along.x * 4 + Math.cos(a) * 2.5, 2.5 + (i % 3), along.z * 4 + Math.sin(a) * 2.5);
          this.stickers.spawn(c, WOOD_CHIP, {
            sprite: Sprite.tick,
            size: 0.3,
            life: 0.6,
            vel: _w,
            drag: 1.5,
            gravity: 9,
            rot: a,
          });
        }
        break;
      case 'stone':
        this.puffs(c, 5, 2.4, 0.42);
        this.glints(c, 6, 3, 0.3, this.accent, 1);
        break;
      case 'metal':
        this.sparks.emit(c, along, this.count(18), WHITE, {
          speed: 7,
          spread: 1.2,
          life: 0.4,
          size: 0.05,
          gravity: 9,
        });
        this.glints(c, 5, 3.5, 0.3, this.accent, 1);
        break;
      case 'glass':
        this.glints(c, 12, 4.5, 0.32, WHITE, 1);
        this.sparks.emit(c, along, this.count(10), this.accent, {
          speed: 5,
          spread: 1.4,
          life: 0.45,
          size: 0.04,
          gravity: 10,
        });
        break;
      case 'energy':
        // the barrier bursts: a ring of light along the cut and a spray of charge
        this.stickers.spawn(c, this.accent, {
          sprite: Sprite.ring,
          frames: 2,
          size: 2.4,
          grow: 2.4,
          life: 0.4,
          normal: toCam,
        });
        this.sparks.emit(c, along, this.count(30), this.accent, {
          speed: 8,
          spread: 2.6,
          life: 0.5,
          size: 0.06,
          gravity: 2,
        });
        this.glints(c, 10, 5, 0.4, this.accent, 1);
        break;
    }
    if (info.kind === 'relic') {
      // the relic answers the blade: a shock ring and a fountain of gold light
      this.stickers.spawn(c, this.accent, {
        sprite: Sprite.ring,
        frames: 2,
        size: 1.6,
        grow: 4,
        life: 0.6,
        normal: UP,
      });
      this.glints(c, 14, 2.2, 0.36, this.accent, 1);
    }
    if (info.bullseye) this.glints(c, 10, 3, 0.34, this.accent, 1);
  }

  /** Dust puffs thrown outward from a point (optionally biased along `dir`). */
  private puffs(at: THREE.Vector3, n: number, speed: number, size: number, dir?: THREE.Vector3) {
    n = Math.max(
      1,
      Math.round(n * Math.min(1, this.settings.particles * this.renderer.tier.particles + 0.25)),
    );
    _p0.copy(at);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time * 7.3 + i * 1.7;
      _w.set(Math.cos(a) * speed, 0.5 + (i % 3) * 0.35, Math.sin(a) * speed);
      if (dir) _w.multiplyScalar(0.45).addScaledVector(dir, speed);
      _w.x += this.carry.x;
      _w.z += this.carry.z;
      this.stickers.spawn(_p0, this.dust, {
        sprite: Sprite.puff,
        frames: 4,
        size: size * (0.75 + (i % 3) * 0.2),
        grow: 2,
        life: 0.36 + (i % 2) * 0.1,
        vel: _w,
        drag: 4,
        gravity: -0.6,
        rot: a,
      });
    }
  }

  /** Four-point glints flung from a point (`up` = 1 rising, -1 thrown down). */
  private glints(at: THREE.Vector3, n: number, speed: number, size: number, color: THREE.Color, up: number) {
    _p0.copy(at);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time * 3.1;
      _w.set(Math.cos(a) * speed + this.carry.x, up * (1.5 + (i % 3)), Math.sin(a) * speed + this.carry.z);
      this.stickers.spawn(_p0, color, {
        sprite: Sprite.glint,
        size: size * (0.7 + (i % 3) * 0.25),
        grow: 0.3,
        life: 0.4 + (i % 2) * 0.12,
        vel: _w,
        drag: 3,
        gravity: 4,
        rot: a,
      });
    }
  }

  /** Point on the wall beside the player at `height` above the feet (result in _v). */
  private wallPoint(height: number, lead = 0) {
    const pl = this.sim!.player;
    _v.set(
      pl.pos.x - pl.wallNormal.x * 0.36 + pl.vel.x * lead,
      pl.pos.y + height,
      pl.pos.z - pl.wallNormal.z * 0.36 + pl.vel.z * lead,
    );
    return _v;
  }

  private count(n: number) {
    return Math.max(1, Math.round(n * this.settings.particles * this.renderer.tier.particles));
  }

  private showResults() {
    const sim = this.sim!;
    const evo = sim.evo;
    const res = finishRun(
      this.save,
      sim.meta,
      sim.data,
      sim.stats,
      evo
        ? {
            pickups: evo.stats.pickups,
            byKind: evo.stats.byKind,
            peakTier: evo.stats.peakTier,
            peakStreak: evo.peakStreak,
            stage: evo.stage,
            abilities: evo.hud().abilities.map((a) => ({ name: a.name, level: a.level, max: a.max })),
            synergies: [...evo.synergies].map((id) => SYNERGIES.find((s) => s.id === id)!.name),
          }
        : undefined,
    );
    if (res.isRecord) {
      // the new best becomes the ghost straight away, and is stored for next time
      const run = this.recorder.toArray();
      this.ghost.load(run);
      void saveGhost(ghostKey(sim.meta.id, sim.meta.layout), run);
    }
    this.mode = 'results';
    this.input.enabled = false;
    this.input.exitLock();
    this.audio.silenceLoops();
    if (res.medal > 0) this.audio.medal(res.medal);
    ui.getState().set({ screen: 'results', results: res, prompt: null, saveRev: ui.getState().saveRev + 1 });
    for (const c of res.newCosmetics) ui.getState().toast('unlock', 'Unlocked: ' + c.name, c.how);
    this.announce(res.newAchievements);
  }

  // =====================================================================================
  // loop
  // =====================================================================================
  private tick() {
    if (this.mode !== 'playing' || !this.sim) return;
    const sim = this.sim;
    if (this.debugFrozen) return;
    let inp = this.input.sample();
    if (this.debugAuto) {
      // visual tests: the autopilot plays through the real game loop
      if (!this.dbgBot || (this.dbgBot as unknown as { sim: Simulation }).sim !== sim)
        this.dbgBot = new Bot(sim);
      this.dbgBot.autoSlash = this.debugSlash;
      inp = this.dbgBot.step();
      this.input.setLook(inp.yaw, inp.pitch);
    }
    if (this.finishDelay >= 0) {
      // run is over: let the player coast, ignore input
      inp.moveX = inp.moveZ = 0;
      inp.jumpPressed =
        inp.dashPressed =
        inp.slidePressed =
        inp.attackPressed =
        inp.swordPressed =
        inp.surgePressed =
          false;
    }
    sim.tick(inp);
    // Phase G: a gravity round trip folded its leftover turn into the look; keep the view still
    const fix = sim.gravity.takeYawFix();
    if (fix) this.input.setLook(this.input.yaw + fix, this.input.pitch);
    if (sim.stats.started && !sim.stats.finished) this.recorder.sample(sim.player);
  }

  private frame(alpha: number, dt: number) {
    if (this.debugManual && !this.inManual) return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    const playing = this.mode === 'playing';
    if (this.mode !== 'paused') this.time += dt;

    if (this.auto && playing && this.auto.sample(dt)) this.applySettings();

    if (this.sim && (playing || this.mode === 'ready' || this.mode === 'paused' || this.mode === 'results')) {
      this.frameLevel(playing ? alpha : 1, playing ? dt : 0);
    } else {
      this.frameMenu(dt);
    }
    this.stickers.update(playing ? dt : 0, this.renderer.camera);
    this.sparks.update(playing ? dt : 0);
    this.renderer.dashFx = this.motion.screenFx ? this.dashFx * Math.min(1, this.motion.intensity) : 0;
    this.renderer.render(this.time, dt, this.rig.feet);

    if (playing) {
      this.hudClock += dt;
      if (this.hudClock >= 1 / 30) {
        this.hudClock = 0;
        this.pushHud(false);
      }
      if (this.restartHold >= 0) {
        this.restartHold += dt;
        if (this.restartHold >= 0.6) {
          this.restartHold = -1;
          this.restartLevel();
        }
      }
      if (this.finishDelay >= 0) {
        this.finishDelay -= dt;
        if (this.finishDelay < 0) this.showResults();
      }
    }
  }

  private groundRay = { dist: 0, nx: 0, ny: 0, nz: 0, id: 0, wallrun: false };
  /**
   * Landing anticipation (presentation only): how soon the ground arrives for a falling player,
   * 0 (far) .. 1 (about to touch). A single read-only ray; the simulation is not involved.
   */
  private updateBrace(pl: Simulation['player']) {
    let brace = 0;
    if (!pl.grounded && !pl.framed && pl.vel.y < -4 && this.sim) {
      const p = pl.pos;
      if (this.sim.physics.raycast(p.x, p.y + 0.1, p.z, 0, -1, 0, 6, this.groundRay)) {
        const tti = Math.max(0, this.groundRay.dist - 0.1) / Math.max(1, -pl.vel.y);
        brace = clamp((0.3 - tti) / 0.26, 0, 1);
      }
    }
    this.rig.brace = brace;
    this.body.brace = brace;
  }

  /** Phase G: a collapsing piece or a falling structure breaks into this universe's debris. */
  private breakApart(entity: Entity, dist: number) {
    if (!this.view || dist > 140) return;
    const look = this.debrisLook;
    const parts =
      'parts' in entity.def
        ? (entity.def.parts as { p: [number, number, number]; s: [number, number, number] }[])
        : [
            {
              p: [0, 0, 0] as [number, number, number],
              s: (entity.def as { s: [number, number, number] }).s,
            },
          ];
    for (const part of parts) {
      _v.set(part.p[0], part.p[1], part.p[2]).applyQuaternion(
        _eq.set(entity.q.x, entity.q.y, entity.q.z, entity.q.w),
      );
      _v.add(_w.set(entity.p.x, entity.p.y, entity.p.z));
      const vol = part.s[0] * part.s[1] * part.s[2];
      const n = this.count(Math.min(40, 6 + Math.sqrt(vol) * 2) * look.amount);
      this.view.spawnDebris(_v, part.s, n, look.shape, look.push);
      this.sparks.emit(_v, UP, this.count(10), this.dust, {
        speed: 3,
        spread: 1.2,
        life: 0.9,
        size: 0.12,
        gravity: 2,
      });
    }
  }

  /** Phase G: the world turning around the player — a short FOV breath, a low rumble, a cue. */
  private turnFov = 0;
  private lastTurning = 0;
  private gravityFeedback(sim: Simulation, dt: number) {
    const turning = sim.gravity.turning;
    if (turning > 0.35 && this.lastTurning <= 0.05) {
      // a new turn starts: the view breathes out a touch, the world groans
      this.rig.shake(0.12 * this.motion.shake);
      this.audio.gravityShift(Math.min(1, turning / Math.PI));
    }
    this.lastTurning = turning;
    const target = Math.min(1, turning / 1.2) * this.motion.speedFov;
    this.turnFov = damp(this.turnFov, target, target > this.turnFov ? 10 : 3, dt);
  }

  private frameLevel(alpha: number, dt: number) {
    const sim = this.sim!,
      pl = sim.player;
    const yaw = this.input.yaw,
      pitch = this.input.pitch;
    // a front crossing the camera gives the view a short breath outward
    this.shiftKick = Math.max(0, this.shiftKick - dt * 2.4);
    const kick = this.shiftKick * this.shiftKick * (this.motion.speedLines > 0 ? 1 : 0.3);
    this.gait.update(pl, dt, yaw);
    this.updateBrace(pl);
    // the gravity frame, interpolated between ticks like everything else
    const gf = sim.gravity.prevFrame,
      cf = pl.frame;
    _gq0.set(gf.x, gf.y, gf.z, gf.w);
    _gq1.set(cf.x, cf.y, cf.z, cf.w);
    _gq0.slerp(_gq1, alpha);
    this.gravityFeedback(sim, dt);
    this.rig.update(
      pl,
      alpha,
      dt,
      yaw,
      pitch,
      this.settings.fov + kick * 4 + this.turnFov * 6,
      this.motion,
      this.gait,
      _gq0,
    );
    this.body.update(pl, this.rig.feet, this.gait, dt, yaw, pitch, this.rig.roll);
    this.view?.update(alpha, this.time, dt);
    this.breaks?.update(dt);
    this.breaks?.cull(this.rig.eye);
    this.evoView?.update(this.time);
    this.evoVisuals(dt);
    const sw = sim.sword;
    this.slash.update(dt, sw.serial, sw.phase === SwordPhase.Attack ? sw.t + alpha * SIM_DT : -1);

    const speed = pl.speed;
    this.dashFx = Math.max(0, this.dashFx - dt * 3.2);
    const cp = Math.cos(pitch);
    const fwdX = -Math.sin(yaw) * cp,
      fwdZ = -Math.cos(yaw) * cp;
    // velocity in the player's own frame, whichever way gravity points
    const lv = pl.toLocal(pl.vel, _lvel);
    const speed3 = Math.hypot(speed, lv.y);
    this.impactFx = Math.max(0, this.impactFx - dt * 4.5);
    // speed reads through a steady edge vignette (the old flickering speed lines are gone)
    this.renderer.universeFx.speed =
      clamp((Math.max(speed, speed3 * 0.9) - 11.5) / 14, 0, 1) * this.motion.speedLines;
    this.carry.set(pl.vel.x * 0.8, 0, pl.vel.z * 0.8);
    worldUniforms.uPlayer.value.set(pl.pos.x, pl.pos.y + 1, pl.pos.z);
    // visual intensity (Difficulty Director): the world's glow rises a little as the run builds
    worldUniforms.uGlow.value = this.renderer.glowBase * (0.9 + 0.3 * sim.director.dims.visual);
    this.flowKick = Math.max(0, this.flowKick - dt * 2.6);
    if (this.mode === 'playing') this.watchNearMisses(sim);
    this.multiverse.update(dt, this.rig.eye, _n.set(fwdX, 0, fwdZ));
    this.scenery?.update();
    this.ghost.update(
      sim.runTime,
      this.settings.ghost && sim.stats.started && !sim.stats.finished,
      this.rig.eye,
      dt,
    );

    // continuous contact effects
    if (dt > 0) {
      const st = pl.state;
      this.trailT -= dt;
      if (st === MoveState.Slide && speed > 4) {
        _n.set(pl.vel.x / speed, 0, pl.vel.z / speed);
        if (this.trailT <= 0) {
          this.trailT = 0.05;
          // skid lines flick past on the ground either side, and dust peels off the dragging hand
          const k = Math.sin(this.time * 83.1);
          const side = (k > 0 ? 1 : -1) * (0.55 + Math.abs(k) * 0.9);
          const lead = 0.28 + Math.abs(Math.sin(this.time * 47.3)) * 0.2;
          _v.set(
            pl.pos.x + pl.vel.x * lead - _n.z * side,
            pl.pos.y + 0.03,
            pl.pos.z + pl.vel.z * lead + _n.x * side,
          );
          this.stickers.spawn(_v, this.dust, {
            sprite: Sprite.scuff,
            size: 1.1,
            stretch: 1.6 + speed * 0.08,
            life: 0.5,
            normal: UP,
            along: _n,
            alpha: 0.8,
          });
          _w.set(pl.vel.x * 0.86 - _n.z * 0.6, 1.1, pl.vel.z * 0.86 + _n.x * 0.6);
          _p0.copy(this.body.contact).addScaledVector(_n, 0.5);
          this.stickers.spawn(_p0, this.dust, {
            sprite: Sprite.puff,
            frames: 4,
            size: 0.26,
            grow: 2.4,
            life: 0.42,
            vel: _w,
            drag: 1.2,
          });
        }
        this.slideSparkT -= dt;
        if (this.slideSparkT <= 0) {
          const sl = this.slideLook;
          this.slideSparkT = 0.045 / Math.max(0.01, sl.rate);
          if (sl.rate > 0) {
            this.pickSlideColor(0);
            _w.set(-_n.x, 0.5, -_n.z);
            this.sparks.emit(this.body.contact, _w, this.count(2), this.sparkCol, {
              speed: 3 + speed * 0.15,
              spread: 0.7,
              life: sl.life,
              size: 0.035 * sl.size,
            });
          }
        }
      } else if (st === MoveState.WallRun && this.trailT <= 0 && speed > 3) {
        this.trailT = 0.06;
        // brush streaks whip along the wall toward the dragging hand
        _n.set(pl.vel.x / speed, 0, pl.vel.z / speed);
        _w.set(pl.wallNormal.x, 0, pl.wallNormal.z);
        this.wallPoint(
          1.0 + Math.abs(Math.sin(this.time * 61.7)) * 0.9,
          0.3 + Math.abs(Math.sin(this.time * 39.1)) * 0.25,
        );
        this.stickers.spawn(_v, this.accent, {
          sprite: Sprite.streak,
          size: 0.9,
          stretch: 2 + speed * 0.08,
          life: 0.45,
          normal: _w,
          along: _n,
          alpha: 0.9,
        });
      } else if (st === MoveState.Dash && this.trailT <= 0) {
        this.trailT = 0.03;
        // a dash tears action lines out of the air behind it
        _n.set(pl.vel.x / Math.max(1, speed), 0, pl.vel.z / Math.max(1, speed));
        const side = Math.sin(this.time * 91) * 0.5;
        _v.set(pl.pos.x - _n.z * side * 3 + _n.x * 7, pl.pos.y + 0.04, pl.pos.z + _n.x * side * 3 + _n.z * 7);
        this.stickers.spawn(_v, this.accent, {
          sprite: Sprite.tick,
          size: 1.3,
          stretch: 3,
          life: 0.22,
          normal: UP,
          along: _n,
        });
      }
      const moving = this.mode === 'playing';
      this.audio.update(
        moving ? speed : 0,
        st === MoveState.Slide,
        st === MoveState.WallRun,
        !pl.grounded,
        Math.min(1, speed / 22),
      );
    }
  }

  /** Is the straight line from the runner's chest to a camera spot blocked by level geometry or an intact breakable? */
  private menuBlocked(sim: Simulation, px: number, py: number, pz: number, cam: THREE.Vector3): boolean {
    const dx = cam.x - px,
      dy = cam.y - py,
      dz = cam.z - pz;
    const len = Math.hypot(dx, dy, dz);
    if (sim.physics.raycast(px, py, pz, dx / len, dy / len, dz / len, len, this.menuRay)) return true;
    const bs = sim.data.breakables;
    for (let i = 0; i < bs.length; i++) {
      if (sim.broken[i]) continue;
      const c = breakableCentre(bs[i]);
      // closest point on the chest→camera segment to the object's centre
      const t = Math.max(0, Math.min(1, ((c.x - px) * dx + (c.y - py) * dy + (c.z - pz) * dz) / (len * len)));
      const ex = px + dx * t - c.x,
        ey = py + dy * t - c.y,
        ez = pz + dz * t - c.z;
      if (ex * ex + ey * ey + ez * ez < (c.r + 0.35) * (c.r + 0.35)) return true;
    }
    return false;
  }

  /**
   * After smoothing: the camera may never sit inside a wall or right beside an intact column.
   * Pull it in along the line to the runner if something is in the way, and nudge it off any
   * breakable it is crowding.
   */
  private keepMenuCamClear(sim: Simulation, px: number, py: number, pz: number) {
    const cam = this.menuCam;
    const bs = sim.data.breakables;
    for (let i = 0; i < bs.length; i++) {
      if (sim.broken[i]) continue;
      const c = breakableCentre(bs[i]);
      const dx = cam.x - c.x,
        dz = cam.z - c.z;
      const min = c.r + 0.7;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && Math.abs(cam.y - c.y) < c.r + 1.2) {
        const d = Math.sqrt(d2) || 0.001;
        cam.x = c.x + (dx / d) * min;
        cam.z = c.z + (dz / d) * min;
      }
    }
    const dx = cam.x - px,
      dy = cam.y - py,
      dz = cam.z - pz;
    const len = Math.hypot(dx, dy, dz) || 1;
    if (sim.physics.raycast(px, py, pz, dx / len, dy / len, dz / len, len, this.menuRay)) {
      const k = Math.max(1.6, this.menuRay.dist - 0.45) / len;
      cam.set(px + dx * k, py + dy * k, pz + dz * k);
    }
  }

  private menuShiftAt = 7;
  private menuShiftN = 0;

  /** Menu attract mode: every so often the world behind the menu shifts to another universe. */
  private menuMultiverse(dt: number) {
    const sim = this.menuSim;
    if (!sim) return;
    const pl = sim.player;
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (sp > 0.5) _n.set(pl.vel.x / sp, 0, pl.vel.z / sp);
    else _n.set(0, 0, 1);
    if (
      this.settings.multiverse !== 'classic' &&
      this.menuT > this.menuShiftAt &&
      !this.multiverse.shifting
    ) {
      this.menuShiftAt = this.menuT + 9 + (this.menuShiftN % 3) * 2;
      const ids = UNIVERSE_IDS.filter((u) => u !== this.multiverse.here.id);
      // a fixed, well-mixed tour rather than true randomness: every visit to the menu shows them all
      const to = ids[(this.menuShiftN * 7 + 3) % ids.length];
      this.multiverse.shiftAhead(to, _v.set(pl.pos.x, pl.pos.y + 1, pl.pos.z), _n, this.menuShiftN % 7);
      this.menuShiftN++;
    }
    this.multiverse.update(dt, this.renderer.camera.position, _n);
    this.scenery?.update();
  }

  private frameMenu(dt: number) {
    // attract mode: the autopilot runs the level for real; a chase camera shows the runner
    this.menuT += dt;
    this.menuMultiverse(dt);
    const cam = this.renderer.camera;
    const sim = this.menuSim,
      runner = this.menuRunner;
    if (sim && this.menuBot) {
      this.menuAcc = Math.min(this.menuAcc + dt, 0.05);
      while (this.menuAcc >= SIM_DT) {
        sim.tick(this.menuBot.step());
        this.menuAcc -= SIM_DT;
      }
      if (sim.stats.finished || this.menuBot.stuckTicks > 120 * 15 || sim.stats.deaths > 3) {
        sim.restart();
        this.menuBot = new Bot(sim);
        this.menuBot.autoSlash = true;
        this.menuSeeded = false;
      }
      const pl = sim.player;
      const a = Math.min(1, this.menuAcc / SIM_DT);
      const px = pl.prevPos.x + (pl.pos.x - pl.prevPos.x) * a,
        py = pl.prevPos.y + (pl.pos.y - pl.prevPos.y) * a,
        pz = pl.prevPos.z + (pl.pos.z - pl.prevPos.z) * a;
      // face the way it is actually moving
      if (pl.speed > 1.5) {
        let d = Math.atan2(-pl.vel.x, -pl.vel.z) - this.menuYaw;
        if (d > Math.PI) d -= Math.PI * 2;
        else if (d < -Math.PI) d += Math.PI * 2;
        this.menuYaw += d * Math.min(1, dt * 10);
      }
      runner.group.position.set(px, py, pz);
      runner.group.rotation.y = this.menuYaw;
      // the figure shows the real sword state: drawn from the back, carried, swung, sheathed
      const sw = sim.sword;
      const sp = SLASHES[sw.pose.kind];
      runner.setSword(
        sw.phase,
        sw.phase === SwordPhase.Attack
          ? Math.min(1, (sw.t + a * SIM_DT) / (sp.windup + sp.active + sp.recover))
          : -1,
        sw.pose.kind,
      );
      const st = pl.state;
      runner.update(
        dt,
        pl.speed,
        pl.grounded || st === MoveState.WallRun ? 0 : pl.vel.y,
        st === MoveState.Slide
          ? 'slide'
          : st === MoveState.WallRun
            ? pl.wallSide > 0
              ? 'wallR'
              : 'wallL'
            : 'run',
      );
      // hero camera: close behind and just off the runner's shoulder, low and looking slightly up,
      // framed so the runner fills the right-hand side of the screen and the menu owns the left.
      // It picks whichever shoulder has a clear line to the runner (walls and breakable columns
      // can be in the way) and, if neither does, pulls in closer.
      const bx = Math.sin(this.menuYaw),
        bz = Math.cos(this.menuYaw);
      const rx = bz,
        rz = -bx; // the runner's right
      const wide = cam.aspect > 1.25;
      const baseDist = wide ? 3.5 : 4.6;
      const drift = Math.sin(this.menuT * 0.13) * 0.4;
      const camAt = (side: number, dist: number) =>
        _v.set(
          px + bx * dist + rx * side,
          py + 1.3 + Math.sin(this.menuT * 0.21) * 0.15,
          pz + bz * dist + rz * side,
        );
      let want = this.menuSide;
      let dist = baseDist;
      if (this.menuBlocked(sim, px, py + 1.1, pz, camAt(want + drift * Math.sign(want), dist))) {
        const alt = -want;
        if (!this.menuBlocked(sim, px, py + 1.1, pz, camAt(alt + drift * Math.sign(alt), dist))) want = alt;
        else dist = baseDist * 0.55;
      }
      this.menuSide = want;
      this.menuSideV += (want - this.menuSideV) * Math.min(1, dt * 2.2);
      camAt(this.menuSideV + drift * Math.sign(this.menuSideV), dist);
      if (!this.menuSeeded) {
        this.menuSeeded = true;
        this.menuCam.copy(_v);
      } else this.menuCam.lerp(_v, Math.min(1, dt * 2.6));
      this.keepMenuCamClear(sim, px, py + 1.1, pz);
      cam.position.copy(this.menuCam);
      const off = wide ? 1.45 : 0;
      cam.lookAt(px - bx * 1.2 - rx * off, py + 1.05, pz - bz * 1.2 - rz * off);
      this.rig.feet.set(px, py, pz);
      worldUniforms.uPlayer.value.set(px, py + 1, pz);
    } else {
      cam.position.set(Math.sin(this.menuT * 0.05) * 30, 12, Math.cos(this.menuT * 0.05) * 30);
      cam.lookAt(0, 4, 0);
      this.rig.feet.copy(cam.position);
      worldUniforms.uPlayer.value.set(0, -9999, 0);
    }
    if (cam.fov !== 58) {
      cam.fov = 58;
      cam.updateProjectionMatrix();
    }
    this.view?.update(1, this.time, dt);
    this.renderer.universeFx.speed = 0;
  }

  private pushHud(force: boolean) {
    const sim = this.sim;
    if (!sim) return;
    const pl = sim.player;
    const prev = ui.getState().hud;
    const wall = pl.state === MoveState.WallRun ? Math.max(0, 1 - pl.wallTime / pl.wallMax) : 0;
    const time = sim.runTime;
    const sw = sim.sword;
    const swordHud = {
      phase: sw.phase,
      combo: sw.combo,
      idle: Math.round(sw.idleFrac * 20) / 20,
      cuts: sim.stats.cuts + sim.stats.smashes,
      total: sim.data.breakables.length,
    };
    const hold = this.restartHold >= 0 ? Math.min(1, this.restartHold / 0.6) : -1;
    const ps = prev.sword;
    const evo = this.evoHud(force);
    if (
      !force &&
      evo === prev.evo &&
      prev.time === time &&
      prev.speed === pl.speed &&
      prev.dash === pl.dashEnergy &&
      prev.fps === this.fps &&
      prev.restartHold === hold &&
      ps.phase === swordHud.phase &&
      ps.combo === swordHud.combo &&
      ps.idle === swordHud.idle &&
      ps.cuts === swordHud.cuts
    )
      return;
    ui.getState().set({
      hud: {
        time,
        started: sim.stats.started,
        speed: pl.speed,
        dash: pl.dashEnergy,
        doubleJump: pl.canDoubleJump,
        wall,
        sliding: pl.state === MoveState.Slide,
        fps: this.fps,
        checkpoint: sim.checkpoint,
        checkpoints: Math.max(0, sim.data.checkpoints.length - 1),
        sword: swordHud,
        restartHold: hold,
        dashMax: pl.cfg.dashCharges,
        stamina: this.staminaFrac(pl),
        sprinting: pl.sprinting,
        exhausted: pl.exhausted,
        evo,
      },
    });
    this.maybeSwordHint(sim);
  }

  /**
   * One contextual hint per session: the first time something breakable is close ahead and the
   * blade is still stowed. Never repeats once the player has swung, and respects the tutorials
   * setting. (Display only — nothing here touches the simulation.)
   */
  private swordHintShown = false;
  private maybeSwordHint(sim: Simulation) {
    if (this.swordHintShown || !this.settings.tutorials) return;
    if (sim.sword.drawn || sim.stats.slashes > 0 || !sim.stats.started) return;
    const pl = sim.player;
    const bs = sim.data.breakables;
    for (let i = 0; i < bs.length; i++) {
      if (sim.broken[i]) continue;
      const c = breakableCentre(bs[i]);
      const dx = c.x - pl.pos.x,
        dz = c.z - pl.pos.z;
      if (dx * dx + dz * dz < 14 * 14 && Math.abs(c.y - pl.pos.y) < 4) {
        this.swordHintShown = true;
        ui.getState().set({
          hint: { id: Date.now(), action: 'attack', text: 'Draw the Shift Edge and cut' },
        });
        return;
      }
    }
  }

  /** Read-only snapshot used by the end-to-end tests and the dev panel. */
  debugState() {
    const pl = this.sim?.player;
    return {
      mode: this.mode,
      level: this.meta?.id ?? null,
      pos: pl ? [pl.pos.x, pl.pos.y, pl.pos.z] : null,
      speed: pl?.speed ?? 0,
      state: pl?.state ?? -1,
      runTime: this.sim?.runTime ?? 0,
      fps: this.fps,
      render: this.renderer.stats,
      tier: this.renderer.tierName,
    };
  }

  /** Simulated time step for automated tests (no pointer lock available in headless browsers). */
  debugAdvance(
    seconds: number,
    keys: Partial<{
      moveZ: number;
      moveX: number;
      jump: boolean;
      dash: boolean;
      slide: boolean;
      attack: boolean;
      sword: boolean;
      surge: boolean;
      burst: boolean;
    }> = {},
  ) {
    if (!this.sim) return;
    const n = Math.round(seconds / SIM_DT);
    for (let i = 0; i < n; i++) {
      this.sim.tick({
        moveX: keys.moveX ?? 0,
        moveZ: keys.moveZ ?? 0,
        yaw: this.input.yaw,
        pitch: this.input.pitch,
        jumpHeld: !!keys.jump,
        jumpPressed: !!keys.jump && i === 0,
        sprint: true,
        burst: !!keys.burst,
        slideHeld: !!keys.slide,
        slidePressed: !!keys.slide && i === 0,
        dashPressed: !!keys.dash && i === 0,
        attackPressed: !!keys.attack && i === 0,
        swordPressed: !!keys.sword && i === 0,
        surgePressed: !!keys.surge && i === 0,
      });
    }
  }

  private dbgBot: Bot | null = null;
  /** Visual tests: hold the simulation still while rendering and animation keep running. */
  debugFrozen = false;
  /** Visual tests: hand the controls to the autopilot. */
  debugAuto = false;
  /** Visual tests: the autopilot swings at breakables. */
  debugSlash = false;
  /** Visual tests: the render loop pauses; debugStep() advances the game frame by frame. */
  debugManual = false;
  private inManual = false;

  /**
   * Visual tests: advance `ticks` simulation steps with the autopilot, then render one frame of
   * matching length, so frame sequences come out smooth however slow the machine is.
   * `until`: stop early once the sword is in this phase / breaks happen.
   */
  debugStep(
    ticks: number,
    keys?: Partial<{
      moveZ: number;
      moveX: number;
      jump: boolean;
      slide: boolean;
      attack: boolean;
      sword: boolean;
      surge: boolean;
      burst: boolean;
    }>,
  ) {
    const sim = this.sim;
    if (!sim) return null;
    if (!this.dbgBot || (this.dbgBot as unknown as { sim: Simulation }).sim !== sim)
      this.dbgBot = new Bot(sim);
    const bot = this.dbgBot;
    bot.autoSlash = this.debugSlash;
    for (let i = 0; i < ticks && !sim.stats.finished; i++) {
      let inp;
      if (keys) {
        // scripted input (presses on the first tick only); the look stays where it is
        inp = {
          moveX: keys.moveX ?? 0,
          moveZ: keys.moveZ ?? 0,
          yaw: this.input.yaw,
          pitch: this.input.pitch,
          jumpHeld: !!keys.jump,
          jumpPressed: !!keys.jump && i === 0,
          sprint: true,
          burst: !!keys.burst,
          slideHeld: !!keys.slide,
          slidePressed: !!keys.slide && i === 0,
          dashPressed: false,
          attackPressed: !!keys.attack && i === 0,
          swordPressed: !!keys.sword && i === 0,
          surgePressed: !!keys.surge && i === 0,
        };
      } else {
        inp = bot.step();
        this.input.setLook(inp.yaw, inp.pitch);
      }
      sim.tick(inp);
    }
    this.debugFrozen = true;
    this.inManual = true;
    this.frame(1, ticks * SIM_DT);
    this.inManual = false;
    const sw = sim.sword;
    return {
      state: moveStateNames[sim.player.state],
      sword: sw.phase,
      t: sw.t,
      cuts: sim.stats.cuts,
      smashes: sim.stats.smashes,
      pieces: this.breaks?.pieceCount ?? 0,
    };
  }
  /**
   * Automated visual tests: let the autopilot play until the player is in the named movement
   * state (held for `hold` seconds) or `maxSeconds` pass. Returns the state reached.
   */
  debugBot(until: string | null, maxSeconds = 60, hold = 0.06) {
    const sim = this.sim;
    if (!sim) return null;
    if (!this.dbgBot || (this.dbgBot as unknown as { sim: Simulation }).sim !== sim)
      this.dbgBot = new Bot(sim);
    const bot = this.dbgBot;
    bot.autoSlash = this.debugSlash;
    let held = 0;
    for (let i = 0; i < Math.round(maxSeconds / SIM_DT) && !sim.stats.finished; i++) {
      const inp = bot.step();
      this.input.setLook(inp.yaw, inp.pitch);
      sim.tick(inp);
      held = until && moveStateNames[sim.player.state] === until ? held + SIM_DT : 0;
      if (until && held >= hold) break;
    }
    this.debugFrozen = until !== null;
    return moveStateNames[sim.player.state];
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
