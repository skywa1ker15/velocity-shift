/** Title gate, main menu, level select, collection, credits, loading and the level intro card. */
import { useCallback, useEffect, useState } from 'react';
import { useUi } from '../app/store';
import { formatTime } from '../core/math';
import { getEnv } from '../environment/presets';
import { keyLabel } from '../input/bindings';
import { levelById, levels } from '../levels/registry';
import {
  achievements,
  cosmetics,
  isUnlocked,
  MEDAL_LABELS,
  nextTarget,
  type CosmeticCategory,
} from '../progression/Progression';
import { Btn, Panel, useGame, useMenuNav } from './App';
import { Arrow, LockIcon, MedalIcon } from './parts';
import { previewFor } from './previews';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function Logo({ small, stack }: { small?: boolean; stack?: boolean }) {
  return (
    <h1 className={'logo' + (small ? ' small' : '') + (stack ? ' stack' : '')} aria-label="Velocity: Shift">
      <span className="logo-a">VELOCITY</span>
      <span className="logo-sep" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="logo-b">SHIFT</span>
    </h1>
  );
}

export function Title() {
  const game = useGame();
  const set = useUi((s) => s.set);
  const go = useCallback(() => {
    game.startAudio();
    set({ screen: 'menu' });
  }, [game, set]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && go();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go]);
  return (
    <div className="screen title" onClick={go} role="button" tabIndex={0} aria-label="Click to start">
      <Logo />
      <p className="tagline">A first-person movement game</p>
      <p className="pulse">CLICK TO START</p>
      <p className="fine">Keyboard and mouse · headphones recommended</p>
    </div>
  );
}

export function MainMenu() {
  const game = useGame();
  const set = useUi((s) => s.set);
  useUi((s) => s.saveRev);
  const ref = useMenuNav();
  const next = levelById(game.nextUnfinished())!;
  const rec = game.save.data.levels[next.meta.id];
  const anyProgress = Object.keys(game.save.data.levels).length > 0;
  const total = achievements.length;
  const got = achievements.filter((a) => game.save.data.achievements[a.id]).length;
  return (
    <div className="screen menu">
      <i className="streaks" aria-hidden />
      <div className="menu-col" ref={ref}>
        <Logo stack />
        <p className="menu-tag">A first-person movement game</p>
        <nav aria-label="Main menu">
          <Btn className="play" data-autofocus onClick={() => void game.loadLevel(next.meta.id)}>
            <span className="play-top">{anyProgress ? 'Continue' : 'Play'}</span>
            <span className="play-sub">
              {next.meta.name}
              {rec?.best ? <em className="mono-num">Best {formatTime(rec.best)}</em> : null}
            </span>
            <Arrow />
          </Btn>
          <div className="menu-list">
            <Btn onClick={() => set({ screen: 'levels' })}>Level Select</Btn>
            <Btn onClick={() => void game.loadLevel('training')}>Training</Btn>
            <Btn onClick={() => set({ screen: 'collection' })}>
              Achievements{' '}
              <em>
                {got}/{total}
              </em>
            </Btn>
            <Btn onClick={() => set({ overlay: 'settings' })}>Settings</Btn>
            <Btn onClick={() => set({ overlay: 'controls' })}>Controls</Btn>
            <Btn onClick={() => set({ screen: 'credits' })}>Credits</Btn>
          </div>
        </nav>
      </div>
      <p className="version">v1.0 · progress saves in this browser</p>
    </div>
  );
}

export function LevelSelect() {
  const game = useGame();
  const set = useUi((s) => s.set);
  useUi((s) => s.saveRev);
  const back = useCallback(() => set({ screen: 'menu' }), [set]);
  const save = game.save.data;
  return (
    <Panel title="Level Select" kicker="Choose a course" wide grid onBack={back}>
      <div className="lv-grid">
        {levels.map((l, i) => {
          const m = l.meta;
          const rec = save.levels[m.id];
          const open = isUnlocked(save, m.id);
          const env = getEnv(m.env);
          const medal = rec?.medal ?? 0;
          const target = nextTarget(medal, m.medals);
          const prev = i > 0 ? levels[i - 1].meta : null;
          const img = previewFor(m.id);
          const objDone = rec?.objectives.length ?? 0;
          return (
            <Btn
              key={m.id}
              className={'lv-card' + (open ? '' : ' locked') + (medal >= 4 ? ' mastered' : '')}
              disabled={!open}
              onClick={() => void game.loadLevel(m.id)}
              aria-label={`${m.name}${open ? '' : ', locked'}`}
              style={{
                ['--c1' as any]: hex(env.sky.top),
                ['--c2' as any]: hex(env.sky.horizon),
                ['--lv' as any]: hex(env.palette.accent),
                ['--c4' as any]: hex(env.palette.base),
              }}
            >
              <div className="lv-art" aria-hidden>
                {img && <img src={img} alt="" loading="lazy" draggable={false} />}
                <span className="num">{m.training ? 'T' : String(m.index).padStart(2, '0')}</span>
                {!open && (
                  <span className="lock">
                    <LockIcon />
                  </span>
                )}
              </div>
              <div className="lv-info">
                <span className="kicker">{m.subtitle}</span>
                <strong>{m.name}</strong>
                <p>{open ? m.description : prev ? `Finish ${prev.name} to unlock.` : ''}</p>
                <div className="lv-best">
                  <div>
                    <span>Best</span>
                    <b className="mono-num">{rec?.best ? formatTime(rec.best) : '--:--.---'}</b>
                  </div>
                  <div className={'lv-medal m' + medal}>
                    <MedalIcon tier={medal} />
                    <span>{medal ? MEDAL_LABELS[medal] : 'No medal'}</span>
                  </div>
                </div>
                <div className="lv-meta">
                  <span>
                    Shards <b>{rec?.collectibles.length ?? 0}/3</b>
                  </span>
                  <span>
                    Objectives{' '}
                    <b>
                      {objDone}/{m.objectives.length}
                    </b>
                  </span>
                </div>
                {open && target && (
                  <div className="lv-next">
                    <span>
                      Next medal · <b>{MEDAL_LABELS[target.tier]}</b>
                    </span>
                    <b className="mono-num">{formatTime(target.time)}</b>
                  </div>
                )}
              </div>
            </Btn>
          );
        })}
      </div>
    </Panel>
  );
}

const categoryNames: Record<CosmeticCategory, string> = {
  suit: 'Suit accent',
  trail: 'Burst style',
  lines: 'Action lines',
  hud: 'HUD theme',
};

export function Collection() {
  const game = useGame();
  const set = useUi((s) => s.set);
  useUi((s) => s.saveRev);
  const [tab, setTab] = useState<'ach' | 'cos' | 'stats'>('ach');
  const back = useCallback(() => set({ screen: 'menu' }), [set]);
  const save = game.save.data;
  const got = achievements.filter((a) => save.achievements[a.id]).length;
  const t = save.totals;
  return (
    <Panel
      title="Achievements & Collection"
      kicker={`${got} / ${achievements.length} achievements`}
      wide
      onBack={back}
    >
      <div className="tabs">
        <Btn className={tab === 'ach' ? 'on' : ''} onClick={() => setTab('ach')}>
          Achievements
        </Btn>
        <Btn className={tab === 'cos' ? 'on' : ''} onClick={() => setTab('cos')}>
          Cosmetics
        </Btn>
        <Btn className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
          Career
        </Btn>
      </div>
      {tab === 'ach' && (
        <div className="grid ach">
          {achievements.map((a) => (
            <div key={a.id} className={'ach-item' + (save.achievements[a.id] ? ' got' : '')}>
              <i aria-hidden />
              <div>
                <strong>{a.name}</strong>
                <span>{a.desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'cos' &&
        (Object.keys(categoryNames) as CosmeticCategory[]).map((cat) => (
          <section key={cat} className="cos-section">
            <h3>{categoryNames[cat]}</h3>
            <div className="cos-row">
              {cosmetics
                .filter((c) => c.category === cat)
                .map((c) => {
                  const open = c.unlocked(save);
                  const on = save.equipped[cat] === c.id;
                  return (
                    <Btn
                      key={c.id}
                      className={'cos' + (on ? ' on' : '') + (open ? '' : ' locked')}
                      disabled={!open}
                      onClick={() => game.equip(cat, c.id)}
                    >
                      <i
                        style={{
                          background: c.color ? hex(c.color) : 'linear-gradient(135deg,#fff,#7fd8ff)',
                        }}
                        data-style={c.style ?? 0}
                      />
                      <strong>{c.name}</strong>
                      <span>{open ? (on ? 'Equipped' : 'Equip') : c.how}</span>
                    </Btn>
                  );
                })}
            </div>
          </section>
        ))}
      {tab === 'stats' && (
        <div className="stats-grid career">
          <Stat label="Runs" value={String(t.runs)} />
          <Stat label="Distance" value={(t.distance / 1000).toFixed(2) + ' km'} />
          <Stat label="Time played" value={formatTime(t.playTime)} />
          <Stat label="Top speed" value={t.topSpeed.toFixed(1) + ' m/s'} />
          <Stat label="Dashes" value={String(t.dashes)} />
          <Stat label="Wall-run time" value={t.wallTime.toFixed(1) + ' s'} />
          <Stat label="Slide distance" value={Math.round(t.slideDistance) + ' m'} />
          <Stat label="Longest wall chain" value={String(t.longestWallChain)} />
          <Stat label="Falls" value={String(t.deaths)} />
        </div>
      )}
    </Panel>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className="mono-num">{value}</strong>
    </div>
  );
}

export function Credits() {
  const set = useUi((s) => s.set);
  const back = useCallback(() => set({ screen: 'menu' }), [set]);
  return (
    <Panel title="Credits" kicker="Velocity: Shift" onBack={back}>
      <div className="credits">
        <p>
          <strong>Design, code, art, animation and audio</strong>
          <br />
          Built end-to-end with Claude (Anthropic) from a brief by the project owner.
        </p>
        <p>
          <strong>Technology</strong>
          <br />
          three.js (MIT) · Rapier physics (Apache-2.0) · postprocessing (Zlib) · React (MIT) · Zustand (MIT) ·
          Vite (MIT)
        </p>
        <p>
          <strong>Typefaces</strong>
          <br />
          Unbounded, Chakra Petch and JetBrains Mono — SIL Open Font License 1.1
        </p>
        <p>
          <strong>Art and sound</strong>
          <br />
          Every model, material, animation, sound effect and piece of music is generated in code at runtime.
          No third-party art or audio assets are used.
        </p>
        <p className="fine">See ASSETS_LICENSES.md in the repository for the full list.</p>
      </div>
    </Panel>
  );
}

export function Loading() {
  const p = useUi((s) => s.loadProgress);
  const label = useUi((s) => s.loadLabel);
  const id = useUi((s) => s.levelId);
  const meta = id ? levelById(id)?.meta : null;
  const env = meta ? getEnv(meta.env) : null;
  return (
    <div
      className="screen loading"
      style={
        env
          ? {
              ['--lv' as any]: hex(env.palette.accent),
              ['--c1' as any]: hex(env.sky.top),
              ['--c2' as any]: hex(env.sky.horizon),
            }
          : undefined
      }
    >
      <div className="loading-card">
        {meta && <span className="kicker">{meta.subtitle}</span>}
        <h2>{meta?.name ?? 'Loading'}</h2>
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={Math.round(p * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
        <p>{label}</p>
      </div>
    </div>
  );
}

/** Level intro card: shown once the level is loaded; the click is the gesture that locks the pointer. */
export function Ready() {
  const game = useGame();
  const id = useUi((s) => s.levelId);
  const lockHint = useUi((s) => s.lockHint);
  const entry = id ? levelById(id) : null;
  const begin = useCallback(() => void game.begin(), [game]);
  const back = useCallback(() => game.quitToMenu(), [game]);
  const ref = useMenuNav(back);
  if (!entry) return null;
  const m = entry.meta;
  const rec = game.save.data.levels[m.id];
  const b = game.save.data.bindings;
  const medal = rec?.medal ?? 0;
  const atk = (b.attack ?? []).find((c) => !c.startsWith('Mouse')) ?? b.attack?.[0];
  const tiers = [
    { t: 1, label: 'BRONZE', time: m.medals.bronze },
    { t: 2, label: 'SILVER', time: m.medals.silver },
    { t: 3, label: 'GOLD', time: m.medals.gold },
    { t: 4, label: 'SHIFT', time: m.medals.platinum },
  ];
  return (
    <div className="screen ready" style={{ ['--lv' as any]: hex(getEnv(m.env).palette.accent) }}>
      <div className="ready-card" ref={ref}>
        <span className="kicker">{m.subtitle}</span>
        <h2>{m.name}</h2>
        <p className="desc">{m.description}</p>
        <div className="targets" aria-label="Medal times">
          {tiers.map((x) => (
            <div key={x.t} className={'t m' + x.t + (medal >= x.t ? ' got' : '')}>
              <MedalIcon tier={x.t} />
              <span>{x.label}</span>
              <b className="mono-num">{x.t === 4 && medal < 3 ? '??:??.???' : formatTime(x.time)}</b>
            </div>
          ))}
        </div>
        <div className="mode-pick" role="radiogroup" aria-label="Game mode">
          {(
            [
              ['evolve', 'Evolve', 'Collectibles and upgrades during the run'],
              ['pure', 'Pure', 'The course alone · medals, ghost and best time'],
            ] as const
          ).map(([k, label, sub]) => (
            <Btn
              key={k}
              role="radio"
              aria-checked={game.settings.gameMode === k}
              className={'mode' + (game.settings.gameMode === k ? ' on' : '')}
              onClick={() => void game.setGameMode(k)}
            >
              <b>{label}</b>
              <span>{sub}</span>
            </Btn>
          ))}
        </div>
        <ul className="objectives">
          {m.objectives.map((o) => (
            <li key={o.id} className={rec?.objectives.includes(o.id) ? 'done' : ''}>
              {o.label}
            </li>
          ))}
        </ul>
        <div className="keys" aria-label="Controls">
          <span>
            <kbd>{keyLabel(b.jump[0])}</kbd> jump
          </span>
          <span>
            <kbd>{keyLabel(b.slide[0])}</kbd> slide
          </span>
          <span>
            <kbd>{keyLabel(b.dash[0])}</kbd> dash
          </span>
          <span className="sw">
            <kbd>{keyLabel(atk)}</kbd>
            <kbd>LMB</kbd> sword
          </span>
          {game.settings.gameMode === 'evolve' && (
            <span>
              <kbd>{keyLabel(b.surge[0])}</kbd> surge
            </span>
          )}
          <span>
            <kbd>{keyLabel(b.restart[0])}</kbd> restart
          </span>
          <span>
            <kbd>ESC</kbd> pause
          </span>
        </div>
        <div className="row">
          <Btn className="primary" data-autofocus onClick={begin}>
            {game.settings.gameMode === 'evolve'
              ? rec?.evolveBest
                ? `Start · Evolve best ${formatTime(rec.evolveBest)}`
                : 'Start · Evolve'
              : rec?.best
                ? `Start · best ${formatTime(rec.best)}`
                : 'Start'}
          </Btn>
          <Btn className="ghost" onClick={back}>
            Back
          </Btn>
        </div>
        {lockHint && <p className="fine warn">The browser did not capture the mouse — click Start again.</p>}
        <p className="fine">
          The timer starts when you first move. Sword is optional — cutting never changes your run.
        </p>
      </div>
    </div>
  );
}

export function Unsupported() {
  return (
    <div className="screen notice">
      <Logo small />
      <h2>This browser can’t run the game</h2>
      <p>
        VELOCITY: SHIFT needs WebGL 2, which is missing or switched off here. It runs in current versions of
        Chrome, Edge and Firefox on a desktop or laptop. If you are already using one of those, check that
        hardware acceleration is enabled in the browser settings.
      </p>
    </div>
  );
}

export function TouchNotice() {
  return (
    <div className="screen notice">
      <Logo small />
      <h2>Keyboard and mouse required</h2>
      <p>
        VELOCITY: SHIFT is a fast first-person game built for a keyboard and mouse. Open this page on a
        desktop or laptop to play.
      </p>
    </div>
  );
}
