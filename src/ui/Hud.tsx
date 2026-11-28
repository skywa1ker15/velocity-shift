/**
 * In-game HUD. Layout rule: nothing lives in the bottom-centre "hand zone" (the first-person
 * arms and gloves fill it), so the information sits on the top rail and in the corners:
 *
 *   top-left    level · checkpoint          top-centre  timer        top-right  speed · dash · state · sword
 *   centre      crosshair, hit marker, restart-hold ring
 *   upper-mid   control prompts / hints (below the timer, above the hands)
 */
import { useEffect, useRef, useState } from 'react';
import { useUi, type Flash } from '../app/store';
import { formatTime } from '../core/math';
import { keyLabel, type Action } from '../input/bindings';
import { levelById } from '../levels/registry';
import { useGame } from './App';

// --- icons (inline, currentColor) -------------------------------------------------------
const IconJump = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3l7 8h-4.2v3H9.2v-3H5z M12 13l5.5 6h-11z" fill="currentColor" />
  </svg>
);
const IconWall = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M3 2h4v20H3z M10 17l4-9 3 1.3-2.2 4.2 5.2 1.2-.6 2.6-7.4-1.6-1 2.2z" fill="currentColor" />
    <circle cx="17.2" cy="5.2" r="2.3" fill="currentColor" />
  </svg>
);
const IconSlide = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M2 19h20v2.5H2z M5 16l9-6.5 2 2-4.5 3.2 8.5.3v2.6H6z" fill="currentColor" />
    <circle cx="17.5" cy="7" r="2.3" fill="currentColor" />
  </svg>
);
/** The Shift Edge: slim single-edged blade, forward-swept point, hex guard. */
const IconBlade = ({ drawn }: { drawn: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={drawn ? 'blade drawn' : 'blade'}>
    <path d="M20.5 2.5L9.2 14.6l-1.5-1.5L18.4 3.4z M20.5 2.5l.3 3.6-8.8 9.7-1.5-1.5z" fill="currentColor" />
    <path d="M6.2 12.9l4.9 4.9-1.6 1.6-4.9-4.9z" fill="currentColor" opacity=".85" />
    <path d="M4.9 16.6l2.5 2.5-2.9 2.9-1.9-.6-.6-1.9z" fill="currentColor" opacity=".6" />
  </svg>
);

// --- screen flashes (checkpoint banner, death wipe + caption) ---------------------------
function FlashLayer() {
  const flash = useUi((s) => s.flash);
  const [shown, setShown] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    setShown(flash);
    const t = setTimeout(
      () => setShown((cur) => (cur?.id === flash.id ? null : cur)),
      flash.kind === 'checkpoint' ? 1700 : flash.kind === 'death' ? 1250 : 420,
    );
    return () => clearTimeout(t);
  }, [flash]);
  if (!shown) return null;
  if (shown.kind === 'checkpoint') {
    const d = shown.delta;
    return (
      <div key={shown.id} className="flash checkpoint">
        <i className="sweep" />
        <div className="cp-text">
          <span>{shown.text}</span>
          {d !== null && d !== undefined && (
            <b className={d <= 0 ? 'ahead' : 'behind'}>
              {d <= 0 ? '−' : '+'}
              {Math.abs(d).toFixed(2)}
            </b>
          )}
        </div>
      </div>
    );
  }
  if (shown.kind === 'death') {
    // The wipe is instant feedback; the caption is a quiet reassurance that you are already
    // back in control. It never blocks input.
    return (
      <div key={shown.id} className="flash death">
        <i className="wipe" />
        <div className="retry-cap">
          <b>Fell</b>
          <span>
            Back at {shown.text}
            {shown.deaths ? ` · fall ${shown.deaths}` : ''}
          </span>
        </div>
      </div>
    );
  }
  return <div key={shown.id} className={'flash ' + shown.kind} />;
}

// --- prompts and hints ------------------------------------------------------------------
function keyFor(game: ReturnType<typeof useGame>, action: string) {
  const codes = game.save.data.bindings[action as Action] ?? [];
  if (action === 'forward') return 'W A S D';
  // prefer a keyboard key over a mouse button for the label when both are bound
  const kb = codes.find((c) => !c.startsWith('Mouse')) ?? codes[0];
  return keyLabel(kb);
}

function Prompt() {
  const prompt = useUi((s) => s.prompt);
  const hint = useUi((s) => s.hint);
  const game = useGame();
  const [hintOn, setHintOn] = useState(false);
  useEffect(() => {
    if (!hint) return;
    setHintOn(true);
    const t = setTimeout(() => setHintOn(false), 6500);
    return () => clearTimeout(t);
  }, [hint]);
  // the blade being drawn answers the hint
  const drawn = useUi((s) => s.hud.sword.phase !== 0);
  useEffect(() => {
    if (drawn) setHintOn(false);
  }, [drawn]);
  const p = prompt ?? (hintOn && hint ? hint : null);
  if (!p) return null;
  const mouse = (game.save.data.bindings[p.action as Action] ?? []).includes('Mouse0');
  return (
    <div className={'prompt' + (prompt ? '' : ' hint')} key={p.text} role="status">
      <kbd>{keyFor(game, p.action)}</kbd>
      {mouse && p.action === 'attack' && <span className="or">or</span>}
      {mouse && p.action === 'attack' && <kbd>LMB</kbd>}
      <span>{p.text}</span>
    </div>
  );
}

// --- sword feedback ---------------------------------------------------------------------
let drawsThisSession = 0;

/** Stowed / drawn state, auto-sheathe ring, 3-step combo pips and the level's break tally. */
function SwordChip() {
  const game = useGame();
  const sw = useUi((s) => s.hud.sword);
  const prev = useRef(sw.phase);
  if (prev.current === 0 && sw.phase !== 0) drawsThisSession++;
  prev.current = sw.phase;
  const drawn = sw.phase !== 0;
  const attacking = sw.phase === 3;
  const pips = sw.combo % 3 === 0 ? (sw.combo > 0 ? 3 : 0) : sw.combo % 3;
  // controls are spelled out until you have used the sword a few times, then they get out of the way
  const teach = drawsThisSession < 3;
  const R = 9;
  const C = 2 * Math.PI * R;
  const label = sw.phase === 1 ? 'DRAWING' : sw.phase === 4 ? 'SHEATHING' : drawn ? 'DRAWN' : 'STOWED';
  return (
    <div
      className={'sword-chip' + (drawn ? ' drawn' : '') + (attacking ? ' attacking' : '')}
      aria-label={`Sword ${label.toLowerCase()}`}
    >
      <span className="sw-ico">
        <svg viewBox="0 0 24 24" aria-hidden className="ring">
          <circle cx="12" cy="12" r={R} className="track" />
          <circle
            cx="12"
            cy="12"
            r={R}
            className="prog"
            strokeDasharray={C}
            strokeDashoffset={C * sw.idle}
            transform="rotate(-90 12 12)"
          />
        </svg>
        <IconBlade drawn={drawn} />
      </span>
      <span className="sw-main">
        <b>{label}</b>
        {drawn ? (
          <span className="pips" aria-label={`Combo ${pips} of 3`}>
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < pips ? 'on' : ''} />
            ))}
          </span>
        ) : (
          teach && (
            <span className="keys">
              <kbd>{keyFor(game, 'attack')}</kbd>
              <kbd>LMB</kbd>
            </span>
          )
        )}
      </span>
      {sw.total > 0 && (
        <span className="tally" title="Objects broken this run">
          <b>{sw.cuts}</b>
          <i>/{sw.total}</i>
        </span>
      )}
    </div>
  );
}

const HIT_TEXT = { cut: 'CUT', smash: 'SMASH', bullseye: 'BULLSEYE' } as const;

/** Movement call-outs under the timer: flow chains, near misses, the universe just entered. */
function CalloutLine() {
  const c = useUi((s) => s.callout);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!c) return;
    setShown(c.id);
    const ms = { shift: 2400, synergy: 2400, evolve: 1700, rare: 1500, flow: 1100, close: 1100 }[c.tone];
    const t = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(t);
  }, [c]);
  if (!c || shown !== c.id) return null;
  return (
    <div className={'callout ' + c.tone} key={c.id} aria-live="polite">
      <b>{c.text}</b>
      {c.sub && <span>{c.sub}</span>}
    </div>
  );
}

/** Four ticks around the crosshair, plus a short call-out under it. */
function HitMarker() {
  const hit = useUi((s) => s.hit);
  const total = useUi((s) => s.hud.sword.total);
  if (!hit) return null;
  return (
    <div className={'hitmark ' + hit.kind} key={hit.id} aria-hidden>
      <i className="t1" />
      <i className="t2" />
      <i className="t3" />
      <i className="t4" />
      <span className="call">
        {HIT_TEXT[hit.kind]}
        {total > 0 && (
          <em>
            {hit.n}/{total}
          </em>
        )}
      </span>
    </div>
  );
}

// --- Evolve: ability rail (left edge), Flux and Flow (top-right), timers ---------------------
const CAT_CLASS: Record<string, string> = {
  movement: 'mv',
  combat: 'cb',
  survival: 'sv',
  special: 'sp',
  mythic: 'my',
};

/** Compact rail of owned abilities with level pips, then active synergies. Left edge, mid-height. */
function EvoRail() {
  const evo = useUi((s) => s.hud.evo);
  if (!evo || (!evo.abilities.length && !evo.synergies.length)) return null;
  return (
    <div className={'evo-rail stage-' + evo.stage} aria-label="Abilities">
      {evo.abilities.map((a) => (
        <div
          key={a.id}
          className={'ab ' + (CAT_CLASS[a.category] ?? '') + (a.stageName ? ' evolved' : '')}
          title={`${a.name} ${a.level}/${a.max}${a.stageName ? ' · ' + a.stageName : ''}`}
        >
          <b>{a.glyph}</b>
          <span className="lv" aria-label={`${a.name} level ${a.level} of ${a.max}`}>
            {Array.from({ length: a.max }, (_, i) => (
              <i key={i} className={(i < a.level ? 'on' : '') + (a.evoAt.includes(i + 1) ? ' ev' : '')} />
            ))}
          </span>
          {a.stageName && <em className="stage">{a.stageName}</em>}
        </div>
      ))}
      {evo.synergies.length > 0 && (
        <div className="syns">
          {evo.synergies.map((s) => (
            <span key={s} className="syn">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sprint stamina: drains while sprinting, refills after a pause. Low (under a quarter) turns it
 * amber; running dry turns it red and says so until it is back to the restart mark.
 */
function StaminaBar({ hud }: { hud: { stamina: number; sprinting: boolean; exhausted: boolean } }) {
  const low = hud.stamina < 0.25;
  const cls = 'stamina' + (hud.exhausted ? ' empty' : low ? ' low' : '') + (hud.sprinting ? ' on' : '');
  return (
    <div
      className={cls}
      aria-label={`Stamina ${Math.round(hud.stamina * 100)}%${hud.exhausted ? ', empty' : ''}`}
    >
      <span>{hud.exhausted ? 'EMPTY' : 'STAMINA'}</span>
      <div className="bar">
        <i style={{ transform: `scaleX(${hud.stamina})` }} />
        <u style={{ left: '30%' }} />
      </div>
    </div>
  );
}

const EFFECT_GLYPH: Record<string, string> = {
  surge: 'Su',
  reflex: 'Rf',
  overcharge: 'Oc',
  lock: 'Lk',
  shield: 'Sh',
  hover: 'Hv',
  overdrive: 'Od',
};

/**
 * Active effects: every temporary effect running now, its name, what it does and how long is left
 * (a bar and seconds). Effects without a clock (Overdrive) say ACTIVE. Under 30% left the row warns
 * (steady colour, no blinking); an effect that runs out shows ENDED for a moment, then leaves.
 */
function EffectsPanel() {
  const fx = useUi((s) => s.hud.evo?.effects);
  if (!fx || !fx.length) return null;
  return (
    <div className="effects" aria-label="Active effects">
      {fx.map((e) => {
        const frac = e.max > 0 ? Math.max(0, Math.min(1, e.left / e.max)) : 1;
        const low = !e.ended && e.max > 0 && frac < 0.3;
        return (
          <div key={e.id} className={'fx-row fx-' + e.id + (low ? ' low' : '') + (e.ended ? ' ended' : '')}>
            <b className="fx-icon">{EFFECT_GLYPH[e.id] ?? e.name.slice(0, 2)}</b>
            <div className="fx-text">
              <span className="fx-name">{e.name}</span>
              <span className="fx-desc">{e.desc}</span>
              {e.max > 0 && (
                <div className="fx-bar">
                  <i style={{ transform: `scaleX(${frac})` }} />
                </div>
              )}
            </div>
            <span className="fx-time mono-num">
              {e.ended ? 'ENDED' : e.left < 0 ? 'ACTIVE' : e.left.toFixed(1) + 's'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Flux meter (with the Surge cost marked), Flow gauge and any running timers. */
function EvoMeters() {
  const evo = useUi((s) => s.hud.evo);
  const game = useGame();
  if (!evo) return null;
  const cost = 30;
  return (
    <div className="evo-meters">
      <div className={'flux' + (evo.canSurge ? ' ready' : '')} aria-label={`Flux ${evo.flux} of 100`}>
        <span>FLUX</span>
        <div className="bar">
          <i style={{ transform: `scaleX(${evo.flux / 100})` }} />
          <u style={{ left: `${cost}%` }} />
        </div>
        {evo.canSurge && (
          <kbd className="surge-key" title="Surge">
            {keyFor(game, 'surge')}
          </kbd>
        )}
      </div>
      <div className={'flow t' + evo.tier} aria-label={`Flow tier ${evo.tier}`}>
        <span>FLOW</span>
        <div className="segs">
          {[1, 2, 3, 4].map((t) => (
            <i key={t} className={t <= evo.tier ? 'on' : t === evo.tier + 1 ? 'next' : ''}>
              {t === evo.tier + 1 && <em style={{ transform: `scaleX(${evo.flowFrac})` }} />}
            </i>
          ))}
        </div>
      </div>
      <div className={'streak' + (evo.streak > 0 ? ' on' : '')} aria-label={`Kinetic chain ${evo.streak}`}>
        <span>CHAIN</span>
        <b className="mono-num">{evo.streak}</b>
        <em className="mono-num">×{evo.mult.toFixed(1)}</em>
        <div className="bar">
          <i style={{ transform: `scaleX(${evo.streakFrac})` }} />
        </div>
      </div>
      <div className="timers">
        {evo.aegis >= 0 && (
          <span className={'tm aegis' + (evo.aegis >= 1 ? ' ready' : '')} title="Aegis">
            AEGIS {evo.aegis >= 1 ? '●' : <b className="mono-num">{Math.round(evo.aegis * 100)}%</b>}
          </span>
        )}
        {evo.chain > 0 && evo.chain < 4 && (
          <span className="tm chain">
            ECHO {evo.chain}/4 <b className="mono-num">{evo.chainLeft.toFixed(1)}</b>
          </span>
        )}
      </div>
    </div>
  );
}

function RestartRing() {
  const hold = useUi((s) => s.hud.restartHold);
  const game = useGame();
  if (hold < 0.12) return null;
  const R = 15;
  const C = 2 * Math.PI * R;
  return (
    <div className="restart-ring" aria-hidden>
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={R} className="track" />
        <circle
          cx="20"
          cy="20"
          r={R}
          className="prog"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - hold)}
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span>
        <kbd>{keyFor(game, 'restart')}</kbd> restart level
      </span>
    </div>
  );
}

// --- the HUD ----------------------------------------------------------------------------
export function Hud({ frozen }: { frozen?: boolean }) {
  const hud = useUi((s) => s.hud);
  const levelId = useUi((s) => s.levelId);
  const game = useGame();
  useUi((s) => s.saveRev);
  const s = game.settings;
  if (s.hideHud && !frozen) {
    return (
      <div className="hud">
        <FlashLayer />
      </div>
    );
  }
  const meta = levelId ? levelById(levelId)?.meta : null;
  const rec = levelId ? game.save.data.levels[levelId] : undefined;
  const speed = hud.speed;
  const charges = Array.from({ length: hud.dashMax }, (_, i) => Math.min(1, Math.max(0, hud.dash - i)));
  const fast = speed > 18;
  const cpNow = Math.min(hud.checkpoint, hud.checkpoints);
  return (
    <div
      className={'hud' + (frozen ? ' frozen' : '')}
      style={{ ['--hud-scale' as any]: s.hudScale, opacity: s.hudOpacity }}
    >
      <div className="hud-tl">
        {meta && (
          <div className="lvl">
            <span>{meta.training ? 'Training' : `Level ${meta.index}`}</span>
            <b>{meta.name}</b>
          </div>
        )}
        {hud.checkpoints > 0 && (
          <div className="cp" aria-label={`Checkpoint ${cpNow} of ${hud.checkpoints}`}>
            <span className="cp-label">
              CHECKPOINT <b>{cpNow}</b>/{hud.checkpoints}
            </span>
            <span className="cp-dots" aria-hidden>
              {Array.from({ length: hud.checkpoints }, (_, i) => (
                <i key={i} className={i < hud.checkpoint ? 'on' : ''} />
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="hud-tc">
        <div className={'timer mono-num' + (hud.started ? '' : ' idle')}>{formatTime(hud.time)}</div>
        {hud.evo ? (
          rec?.evolveBest ? (
            <div className="pb mono-num">EVOLVE PB {formatTime(rec.evolveBest)}</div>
          ) : (
            <div className="pb mono-num">EVOLVE</div>
          )
        ) : rec?.best ? (
          <div className="pb mono-num">PB {formatTime(rec.best)}</div>
        ) : null}
      </div>

      <div className="hud-tr">
        {s.showSpeed && (
          <div className={'speed' + (fast ? ' fast' : '')}>
            <div className="num">
              <b className="mono-num">{speed.toFixed(1)}</b>
              <span>m/s</span>
            </div>
            <div className="speed-bar" aria-hidden>
              {[8, 12, 17, 23].map((t) => (
                <u key={t} style={{ left: `${(t / 35) * 100}%` }} className={speed >= t ? 'on' : ''} />
              ))}
              <i style={{ transform: `scaleX(${Math.min(1, speed / 35)})` }} />
            </div>
          </div>
        )}
        <div className="dash" aria-label="Dash charges">
          {charges.map((c, i) => (
            <div key={i} className={'pip' + (c >= 1 ? ' full' : '')}>
              <i style={{ transform: `scaleX(${c})` }} />
            </div>
          ))}
          <span>DASH</span>
        </div>
        <StaminaBar hud={hud} />
        {s.showIndicators && (
          <>
            <div className="indicators">
              <span className={'ind' + (hud.doubleJump ? ' on' : '')} title="Double jump">
                <IconJump />
              </span>
              <span className={'ind wall' + (hud.wall > 0 ? ' on' : '')} title="Wall-run">
                <i style={{ transform: `scaleX(${hud.wall})` }} />
                <IconWall />
              </span>
              <span className={'ind' + (hud.sliding ? ' on' : '')} title="Slide">
                <IconSlide />
              </span>
            </div>
            <SwordChip />
          </>
        )}
        <EvoMeters />
        <EffectsPanel />
      </div>
      <EvoRail />

      {s.crosshair !== 'off' && <div className={'crosshair ' + s.crosshair} aria-hidden />}
      {!frozen && <HitMarker />}
      {!frozen && <CalloutLine />}
      {!frozen && <RestartRing />}

      {s.showFps && <div className="fps mono-num">{hud.fps} FPS</div>}
      {!frozen && <Prompt />}
      <FlashLayer />
    </div>
  );
}
