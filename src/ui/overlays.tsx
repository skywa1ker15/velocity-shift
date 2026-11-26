/** Pause menu and the end-of-run results screen. */
import { useCallback, useEffect, useState } from 'react';
import { useUi } from '../app/store';
import { formatTime } from '../core/math';
import { levelById } from '../levels/registry';
import { isUnlocked, MEDAL_LABELS, nextTarget } from '../progression/Progression';
import { Btn, useGame, useMenuNav } from './App';
import { Stat } from './menus';

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

function delta(a: number, b: number | null | undefined) {
  if (b === null || b === undefined) return null;
  const d = a - b;
  return (
    <span className={d <= 0 ? 'ahead' : 'behind'}>
      {d <= 0 ? '−' : '+'}
      {Math.abs(d).toFixed(2)}
    </span>
  );
}

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
  const st = r.stats;
  const best = r.isRecord ? r.time : (r.previousBest ?? r.time);
  const target = nextTarget(Math.max(r.medal, r.previousMedal), entry.meta.medals);
  const nextOpen = r.nextLevelId && isUnlocked(game.save.data, r.nextLevelId);
  const avg = st.speedSum / Math.max(1, st.ticks);
  return (
    <div className="screen dim results">
      <div className="panel wide results-panel" ref={ref}>
        <header>
          <span className="kicker">{entry.meta.name} · complete</span>
          <div className="time-row">
            <div className="big-time mono-num">{formatTime(r.time)}</div>
            {r.isRecord ? (
              <div className="record">{r.previousBest === null ? 'FIRST CLEAR' : 'NEW RECORD'}</div>
            ) : (
              <div className="vs">{delta(r.time, r.previousBest)} vs best</div>
            )}
          </div>
          <div className={'medal-reveal m' + r.medal + (stage >= 1 ? ' show' : '')}>
            <i aria-hidden />
            <div>
              <strong>{r.medal ? MEDAL_LABELS[r.medal] + ' MEDAL' : 'NO MEDAL YET'}</strong>
              <span>
                Best {formatTime(best)}
                {target && (target.tier < 4 || Math.max(r.medal, r.previousMedal) >= 3)
                  ? ` · next: ${MEDAL_LABELS[target.tier]} at ${formatTime(target.time)}`
                  : ''}
              </span>
            </div>
          </div>
        </header>

        <div className={'results-body' + (stage >= 2 ? ' show' : '')}>
          <section>
            <h3>Splits</h3>
            <table className="splits">
              <tbody>
                {r.splits.map((t, i) =>
                  t === undefined || t === null ? null : (
                    <tr key={i}>
                      <td>Checkpoint {i}</td>
                      <td className="mono-num">{formatTime(t)}</td>
                      <td className="mono-num">{delta(t, r.bestSplits[i])}</td>
                    </tr>
                  ),
                )}
                <tr className="total">
                  <td>Finish</td>
                  <td className="mono-num">{formatTime(r.time)}</td>
                  <td className="mono-num">{delta(r.time, r.previousBest)}</td>
                </tr>
              </tbody>
            </table>
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
              <Stat label="Deaths" value={String(st.deaths)} />
            </div>
          </section>
        </div>

        <footer>
          <Btn className="primary" data-autofocus onClick={retry}>
            Retry
          </Btn>
          {r.nextLevelId && (
            <Btn disabled={!nextOpen} onClick={() => void game.loadLevel(r.nextLevelId!)}>
              Next Level
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
