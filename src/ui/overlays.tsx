/** Pause menu and the end-of-run results screen. */
import { useCallback, useEffect, useState } from 'react';
import { useUi } from '../app/store';
import { formatTime } from '../core/math';
import { getEnv } from '../environment/presets';
import { keyLabel } from '../input/bindings';
import { levelById } from '../levels/registry';
import { isUnlocked, MEDAL_LABELS, nextTarget } from '../progression/Progression';
import { Btn, useGame, useMenuNav } from './App';
import { Stat } from './menus';
import { Arrow, MedalIcon } from './parts';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function Pause() {
  const game = useGame();
  const set = useUi((s) => s.set);
  const lockHint = useUi((s) => s.lockHint);
  const [confirm, setConfirm] = useState(false);
  const resume = useCallback(() => void game.begin(), [game]);
  const ref = useMenuNav(resume);
  const meta = game.meta;
  return (
    <div className="screen dim pause">
      <div className="panel narrow" ref={ref}>
        <header>
          <span className="kicker">{meta?.name}</span>
          <h2>Paused</h2>
        </header>
        <nav>
          <Btn className="primary" data-autofocus onClick={resume}>
            Resume
          </Btn>
          <Btn
            onClick={() => {
              game.restartCheckpoint();
              resume();
            }}
          >
            Restart Checkpoint
          </Btn>
          <Btn onClick={() => game.restartLevel()}>Restart Level</Btn>
          <Btn onClick={() => set({ overlay: 'settings' })}>Settings</Btn>
          <Btn onClick={() => set({ overlay: 'controls' })}>Controls</Btn>
          {!confirm ? (
            <Btn onClick={() => setConfirm(true)}>Return to Main Menu</Btn>
          ) : (
            <div className="confirm">
              <span>Leave this run?</span>
              <Btn className="danger" onClick={() => game.quitToMenu()}>
                Yes, leave
              </Btn>
              <Btn onClick={() => setConfirm(false)}>Stay</Btn>
            </div>
          )}
        </nav>
        {lockHint && (
          <p className="fine warn">
            The browser needs a moment before it can capture the mouse again — click Resume once more.
          </p>
        )}
      </div>
    </div>
  );
}

/** +/- seconds against a reference time, coloured good (ahead) / bad (behind). */
function Delta({ a, b }: { a: number; b: number | null | undefined }) {
  if (b === null || b === undefined) return null;
  const d = a - b;
  return (
    <span className={'delta mono-num ' + (d <= 0 ? 'ahead' : 'behind')}>
      {d <= 0 ? '−' : '+'}
      {Math.abs(d).toFixed(2)}
    </span>
  );
}

const TIER_KEYS = ['bronze', 'silver', 'gold', 'platinum'] as const;

export function Results() {
  const game = useGame();
  const r = useUi((s) => s.results);
  const retry = useCallback(() => game.restartLevel(), [game]);
  const menu = useCallback(() => game.quitToMenu(), [game]);
  const ref = useMenuNav(menu);
  const [stage, setStage] = useState(0);

  // staged reveal: time → medal → details. Any key skips straight to the end.
  useEffect(() => {
    const t1 = setTimeout(() => setStage((s) => Math.max(s, 1)), 450);
    const t2 = setTimeout(() => setStage((s) => Math.max(s, 2)), 1000);
    const skip = () => setStage(2);
    window.addEventListener('keydown', skip);
    window.addEventListener('mousedown', skip);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('mousedown', skip);
    };
  }, []);
  // R retries instantly
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (game.save.data.bindings.restart.includes(e.code)) retry();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [game, retry]);

  if (!r) return null;
  const entry = levelById(r.levelId)!;
  const m = entry.meta;
  const st = r.stats;
  const best = r.isRecord ? r.time : (r.previousBest ?? r.time);
  const top = Math.max(r.medal, r.previousMedal);
  const target = nextTarget(top, m.medals);
  const nextOpen = r.nextLevelId && isUnlocked(game.save.data, r.nextLevelId);
  const nextName = r.nextLevelId ? levelById(r.nextLevelId)?.meta.name : null;
  const avg = st.speedSum / Math.max(1, st.ticks);
  const splits = r.splits
    .map((t, i) => ({ t, i }))
    .filter((x): x is { t: number; i: number } => x.t !== undefined && x.t !== null);
  const fresh = r.newAchievements.length + r.newCosmetics.length;
  const medalNew = r.medal > r.previousMedal;
  const shiftHidden = top < 3;
  return (
    <div className="screen dim results" style={{ ['--lv' as any]: hex(getEnv(m.env).palette.accent) }}>
      <div className="res-card" ref={ref}>
        <header className="res-head">
          <div className="res-id">
            <span className="kicker">
              {m.subtitle} · {m.name}
            </span>
            <h2>Complete</h2>
          </div>
          <div className="res-time">
            <div className="big-time mono-num">{formatTime(r.time)}</div>
            {r.isRecord ? (
              <div className="record">{r.previousBest === null ? 'FIRST CLEAR' : 'NEW RECORD'}</div>
            ) : (
              <div className="vs">
                <Delta a={r.time} b={r.previousBest} /> <span>vs best</span>
              </div>
            )}
            <div className="pb-line">
              {r.isRecord && r.previousBest !== null && (
                <span>
                  Previous best <b className="mono-num">{formatTime(r.previousBest)}</b>
                </span>
              )}
              <span>
                Personal best <b className="mono-num">{formatTime(best)}</b>
              </span>
            </div>
          </div>
          <div className={'res-medal' + (stage >= 1 ? ' show' : '')}>
            <div className={'badge m' + r.medal}>
              <MedalIcon tier={r.medal} />
              <div>
                <strong>{r.medal ? MEDAL_LABELS[r.medal] + ' medal' : 'No medal yet'}</strong>
                {medalNew && <em>New</em>}
              </div>
            </div>
            <ol className="ladder" aria-label="Medal times">
              {TIER_KEYS.map((k, i) => {
                const tier = i + 1;
                const got = top >= tier;
                const hide = tier === 4 && shiftHidden;
                return (
                  <li key={k} className={'m' + tier + (got ? ' got' : '') + (r.medal === tier ? ' now' : '')}>
                    <MedalIcon tier={got ? tier : 0} />
                    <span>{MEDAL_LABELS[tier]}</span>
                    <b className="mono-num">{hide ? '??:??.???' : formatTime(m.medals[k])}</b>
                  </li>
                );
              })}
            </ol>
            {target && (target.tier < 4 || top >= 3) && (
              <p className="next-medal">
                Next: <b>{MEDAL_LABELS[target.tier]}</b> at{' '}
                <span className="mono-num">{formatTime(target.time)}</span>
                {r.time > target.time && (
                  <span className="mono-num behind"> · {(r.time - target.time).toFixed(2)} s off</span>
                )}
              </p>
            )}
          </div>
        </header>

        <div className={'res-body' + (stage >= 2 ? ' show' : '')}>
          <section>
            <h3>Splits</h3>
            <table className="splits">
              <tbody>
                {splits.map(({ t, i }) => (
                  <tr key={i}>
                    <td>Checkpoint {i}</td>
                    <td className="mono-num">{formatTime(t)}</td>
                    <td>
                      <Delta a={t} b={r.bestSplits[i]} />
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Finish</td>
                  <td className="mono-num">{formatTime(r.time)}</td>
                  <td>
                    <Delta a={r.time} b={r.previousBest} />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
          <section>
            <h3>Movement</h3>
            <div className="stats-grid">
              <Stat label="Top speed" value={st.topSpeed.toFixed(1) + ' m/s'} />
              <Stat label="Average speed" value={avg.toFixed(1) + ' m/s'} />
              <Stat label="Distance" value={Math.round(st.distance) + ' m'} />
              <Stat label="Airborne" value={st.airTime.toFixed(1) + ' s'} />
              <Stat label="Dashes" value={String(st.dashes)} />
              <Stat label="Wall-runs" value={`${st.wallRuns} · ${st.wallTime.toFixed(1)} s`} />
              <Stat label="Slides" value={`${st.slides} · ${Math.round(st.slideDistance)} m`} />
              <Stat label="Double jumps" value={String(st.doubleJumps)} />
              <Stat label="Sword cuts" value={`${st.cuts ?? 0} · ${st.slashes ?? 0} swings`} />
              <Stat label="Deaths" value={String(st.deaths)} />
            </div>
          </section>
          <section>
            <h3>Objectives</h3>
            <ul className="objectives">
              {r.objectives.map((o) => (
                <li key={o.label} className={o.done ? 'done' : o.ever ? 'ever' : ''}>
                  {o.label}
                  {o.newly && <em> new</em>}
                </li>
              ))}
              <li className={r.collectiblesOwned >= r.collectiblesTotal ? 'done' : ''}>
                Shards {r.collectiblesOwned} / {r.collectiblesTotal}
              </li>
            </ul>
            {fresh > 0 && (
              <div className="fresh">
                <h3>New this run</h3>
                {r.newAchievements.map((a) => (
                  <div key={a.id} className="fresh-item ach">
                    <i aria-hidden>★</i>
                    <div>
                      <strong>{a.name}</strong>
                      <span>{a.desc}</span>
                    </div>
                  </div>
                ))}
                {r.newCosmetics.map((c) => (
                  <div key={c.id} className="fresh-item cos">
                    <i aria-hidden>◆</i>
                    <div>
                      <strong>Unlocked: {c.name}</strong>
                      <span>{c.how}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="res-foot">
          <Btn className="primary" data-autofocus onClick={retry}>
            Retry <kbd>{keyLabel(game.save.data.bindings.restart[0])}</kbd>
          </Btn>
          {r.nextLevelId && (
            <Btn
              className={nextOpen ? 'next' : ''}
              disabled={!nextOpen}
              onClick={() => void game.loadLevel(r.nextLevelId!)}
            >
              Next · {nextName}
              <Arrow />
            </Btn>
          )}
          <Btn
            onClick={() => {
              game.quitToMenu();
              useUi.getState().set({ screen: 'levels' });
            }}
          >
            Level Select
          </Btn>
          <Btn className="ghost" onClick={menu}>
            Main Menu
          </Btn>
        </footer>
      </div>
    </div>
  );
}
