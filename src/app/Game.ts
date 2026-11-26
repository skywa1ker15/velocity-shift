/**
 * Game: owns the loop and wires every system together.
 *
 *   input → Simulation (120 Hz fixed ticks) → camera / body / effects / audio → renderer
 *                                    ↘ events → store (HUD, toasts) and progression
 *
 * The UI never calls into systems directly; it calls the small set of public methods here.
 */
import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { CameraRig } from '../camera/CameraRig';
import { Body } from '../character/Body';
import { FixedLoop, SIM_DT } from '../core/loop';
import { getEnv, type EnvPreset } from '../environment/presets';
import { Bursts, Motes, Sparks, SpeedLines } from '../fx/Fx';
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
import { loadGhost, saveGhost, SaveSystem } from '../save/SaveSystem';
import { motionProfile, type MotionProfile, type Settings } from '../settings/settings';
import { ui } from './store';

type Mode = 'idle' | 'menu' | 'loading' | 'ready' | 'playing' | 'paused' | 'results';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

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
  private lines: SpeedLines;
  private bursts = new Bursts(28);
  private sparks = new Sparks(420);
  private motes: Motes | null = null;
  private view: LevelView | null = null;
  private data: LevelData | null = null;
  private env: EnvPreset = getEnv('awakening');
  private ghost: GhostPlayer;
  private recorder = new GhostRecorder();
  private auto: AutoQuality | null = null;
  private motion: MotionProfile;
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

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const s = this.save.data.settings;
    this.motion = motionProfile(s);
    this.input = new InputManager(canvas, this.save.data.bindings, s);
    this.rig = new CameraRig(this.renderer.camera, this.renderer.viewCamera);
    this.body = new Body(this.renderer.viewScene, this.renderer.scene);
    this.lines = new SpeedLines(160);
    this.renderer.viewScene.add(this.lines.mesh);
    this.renderer.scene.add(this.bursts.group, this.sparks.points);
    this.ghost = new GhostPlayer(0xffffff);
    this.renderer.scene.add(this.ghost.group);
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

  private applySettings() {
    const s = this.settings;
    this.motion = motionProfile(s);
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
    this.body.setAccent(suit.color);
    this.ghost.setColor(suit.color);
    this.trailStyle = cosmeticFor(s, 'trail').style ?? 0;
    const lines = cosmeticFor(s, 'lines');
    this.streak.set(lines.color || this.env.streak);
    this.lines.setColor(this.streak.getHex());
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
    this.sim?.dispose();
    this.sim = null;
    this.motes?.dispose();
    this.motes = null;
    this.data = null;
    this.meta = null;
    this.ghost.load(null);
  }

  private setEnv(id: string) {
    this.env = getEnv(id);
    this.renderer.applyEnv(this.env);
    this.motes?.dispose();
    const m = this.env.motes;
    const count = Math.round(m.count * this.renderer.tier.particles * Math.max(0.2, this.settings.particles));
    this.motes = new Motes(count, m.color, m.size, m.rise);
    this.motes.setViewportHeight(window.innerHeight);
    this.motes.points.visible = this.settings.particles > 0.05;
    this.renderer.scene.add(this.motes.points);
    this.applyCosmetics();
  }

  /** Slow fly-through of Level 1 behind the menus. */
  showMenuScene() {
    this.loadToken++;
    this.clearLevel();
    this.setEnv('awakening');
    if (this.menuData) {
      this.view = new LevelView(this.menuData, this.env, null);
      this.renderer.scene.add(this.view.group);
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
      const data = mod.build();
      this.clearLevel();
      this.meta = entry.meta;
      this.data = data;
      this.setEnv(entry.meta.env);
      this.sim = new Simulation(entry.meta, data);
      const owned = new Set(this.save.record(id).collectibles);
      this.view = new LevelView(data, this.env, this.sim, owned);
      this.renderer.scene.add(this.view.group);
      this.wireSim(this.sim);
      set({ loadProgress: 0.7, loadLabel: 'Compiling shaders' });
      await nextFrame();
      this.body.setVisible(true);
      this.placeCamera();
      await this.renderer.warm();
      if (token !== this.loadToken) return;
      set({ loadProgress: 0.9, loadLabel: 'Loading ghost' });
      this.ghost.load(await loadGhost(id));
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
    const feet = () => _v.set(pl.pos.x, pl.pos.y + 0.04, pl.pos.z);
    ev.on('jump', () => {
      audio.jump();
      this.rig.onJump();
      this.body.onJump();
    });
    ev.on('doubleJump', () => {
      audio.doubleJump();
      this.rig.onDoubleJump();
      this.body.onDoubleJump();
      this.bursts.spawn(feet(), UP, this.accent, 2.6, 0.45, Math.max(1, this.trailStyle));
      this.sparks.emit(_v, UP, this.count(14), this.accent, {
        speed: 3.5,
        spread: 1.6,
        life: 0.45,
        size: 0.05,
        gravity: 6,
      });
    });
    ev.on('dash', () => {
      audio.dash();
      this.rig.onDash();
      this.body.onDash();
      this.dashFx = 1;
      const fx = -Math.sin(pl.yaw),
        fz = -Math.cos(pl.yaw);
      _n.set(fx, 0, fz);
      _v.set(pl.pos.x + fx * 1.2, pl.pos.y + 1.1, pl.pos.z + fz * 1.2);
      this.bursts.spawn(_v, _n, this.accent, 3.4, 0.4, this.trailStyle);
    });
    ev.on('land', ({ speed }) => {
      audio.land(speed);
      this.rig.onLand(speed);
      this.body.onLand(speed);
      if (speed > 7) {
        this.bursts.spawn(feet(), UP, this.streak, 1.6 + Math.min(3, speed * 0.1), 0.4, 0);
        this.sparks.emit(_v, UP, this.count(6 + Math.min(16, speed * 0.6)), this.streak, {
          speed: 2.2,
          spread: 2.4,
          life: 0.5,
          size: 0.06,
          gravity: 5,
        });
      }
      if (speed > 24) ui.getState().fire('impact');
    });
    ev.on('slideStart', () => audio.slideStart());
    ev.on('slideEnd', () => this.input.clearSlideLatch());
    ev.on('wallRunStart', () => audio.wallStart());
    ev.on('wallJump', () => {
      audio.wallJump();
      this.body.onWallJump();
      _n.set(pl.wallNormal.x, 0, pl.wallNormal.z);
      _v.set(pl.pos.x - pl.wallNormal.x * 0.4, pl.pos.y + 0.9, pl.pos.z - pl.wallNormal.z * 0.4);
      this.bursts.spawn(_v, _n, this.accent, 2.2, 0.35, this.trailStyle);
    });
    ev.on('vault', () => audio.vault());
    ev.on('bump', () => {
      audio.bump();
      this.body.onBump();
    });
    ev.on('footstep', ({ wall, speed }) => {
      audio.footstep(speed, wall);
      if (wall) {
        _v.set(pl.pos.x - pl.wallNormal.x * 0.35, pl.pos.y + 0.2, pl.pos.z - pl.wallNormal.z * 0.35);
        _n.set(pl.wallNormal.x, 0.4, pl.wallNormal.z);
        this.sparks.emit(_v, _n, this.count(5), this.accent, {
          speed: 2.5,
          spread: 1.2,
          life: 0.3,
          size: 0.04,
        });
      }
    });

    sim.events.on('checkpoint', ({ index, time }) => {
      audio.checkpoint();
      const best = this.save.record(sim.meta.id).splits[index];
      ui.getState().fire(
        'checkpoint',
        `CHECKPOINT ${index}/${sim.data.checkpoints.length - 1}`,
        best ? time - best : null,
      );
      _v.set(pl.pos.x, pl.pos.y + 1, pl.pos.z);
      this.bursts.spawn(_v, UP, this.accent, 7, 0.7, 1);
    });
    sim.events.on('death', () => {
      audio.death();
      ui.getState().fire('death');
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
      else if (kind === 'collapse' && d < 40) {
        audio.collapse();
        this.rig.shake(Math.max(0, 0.5 - d * 0.02));
      }
    });
    sim.events.on('finish', () => {
      this.finishDelay = 0.9; // let the moment land before the results screen
      audio.finish(0);
      _v.set(pl.pos.x, pl.pos.y + 1, pl.pos.z);
      this.bursts.spawn(_v, UP, this.accent, 12, 0.9, 2);
    });
  }

  private count(n: number) {
    return Math.max(1, Math.round(n * this.settings.particles * this.renderer.tier.particles));
  }

  private showResults() {
    const sim = this.sim!;
    const res = finishRun(this.save, sim.meta, sim.data, sim.stats);
    if (res.isRecord) {
      // the new best becomes the ghost straight away, and is stored for next time
      const run = this.recorder.toArray();
      this.ghost.load(run);
      void saveGhost(sim.meta.id, run);
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
    const inp = this.input.sample();
    if (this.finishDelay >= 0) {
      // run is over: let the player coast, ignore input
      inp.moveX = inp.moveZ = 0;
      inp.jumpPressed = inp.dashPressed = inp.slidePressed = false;
    }
    sim.tick(inp);
    if (sim.stats.started && !sim.stats.finished) this.recorder.sample(sim.player);
  }

  private frame(alpha: number, dt: number) {
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
    this.bursts.update(playing || this.mode === 'menu' ? dt : 0);
    this.sparks.update(playing ? dt : 0);
    this.renderer.dashFx = this.motion.screenFx ? this.dashFx : 0;
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

  private frameLevel(alpha: number, dt: number) {
    const sim = this.sim!,
      pl = sim.player;
    const yaw = this.input.yaw,
      pitch = this.input.pitch;
    this.rig.update(pl, alpha, dt, yaw, pitch, this.settings.fov, this.motion);
    this.body.update(pl, this.rig.feet, this.rig.bobPhase, dt, yaw, pitch, this.rig.roll);
    this.view?.update(alpha, this.time, dt);

    const speed = pl.speed;
    this.dashFx = Math.max(0, this.dashFx - dt * 3.2);
    this.lines.update(this.time, dt, speed, this.dashFx, this.motion.speedLines);
    this.ghost.update(
      sim.runTime,
      this.settings.ghost && sim.stats.started && !sim.stats.finished,
      this.rig.eye,
    );

    // continuous contact effects
    if (dt > 0) {
      const st = pl.state;
      if (st === MoveState.Slide && speed > 4) {
        this.slideSparkT -= dt;
        if (this.slideSparkT <= 0) {
          this.slideSparkT = 0.03;
          _n.set(-pl.vel.x / speed, 0.5, -pl.vel.z / speed);
          this.sparks.emit(this.body.contact, _n, this.count(2), this.accent, {
            speed: 3 + speed * 0.15,
            spread: 0.7,
            life: 0.35,
            size: 0.035,
          });
        }
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

  private frameMenu(dt: number) {
    // gentle fly-through along the level's main line
    this.menuT += dt;
    const pts = this.menuData?.bot;
    const cam = this.renderer.camera;
    if (pts && pts.length > 2) {
      const span = 70; // seconds for one pass
      const f = ((this.menuT % span) / span) * (pts.length - 1);
      const i = Math.floor(f),
        k = f - i;
      const a = pts[i].p,
        b = pts[Math.min(pts.length - 1, i + 1)].p;
      const c = pts[Math.min(pts.length - 1, i + 3)].p;
      const x = a[0] + (b[0] - a[0]) * k,
        y = a[1] + (b[1] - a[1]) * k,
        z = a[2] + (b[2] - a[2]) * k;
      const sway = Math.sin(this.menuT * 0.11) * 9;
      cam.position.set(x + 13 + sway, y + 8.5 + Math.sin(this.menuT * 0.17) * 2, z - 16);
      cam.lookAt(c[0], c[1] + 2.5, c[2] + 6);
    } else {
      cam.position.set(Math.sin(this.menuT * 0.05) * 30, 12, Math.cos(this.menuT * 0.05) * 30);
      cam.lookAt(0, 4, 0);
    }
    if (cam.fov !== 62) {
      cam.fov = 62;
      cam.updateProjectionMatrix();
    }
    this.rig.feet.copy(cam.position);
    this.view?.update(1, this.time, dt);
    this.lines.update(this.time, dt, 0, 0, 0);
  }

  private pushHud(force: boolean) {
    const sim = this.sim;
    if (!sim) return;
    const pl = sim.player;
    const prev = ui.getState().hud;
    const wall = pl.state === MoveState.WallRun ? Math.max(0, 1 - pl.wallTime / pl.wallMax) : 0;
    const time = sim.runTime;
    if (
      !force &&
      prev.time === time &&
      prev.speed === pl.speed &&
      prev.dash === pl.dashEnergy &&
      prev.fps === this.fps
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
      },
    });
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
    keys: Partial<{ moveZ: number; moveX: number; jump: boolean; dash: boolean; slide: boolean }> = {},
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
        slideHeld: !!keys.slide,
        slidePressed: !!keys.slide && i === 0,
        dashPressed: !!keys.dash && i === 0,
      });
    }
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
