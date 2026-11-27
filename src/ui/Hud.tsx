/** In-game HUD: timer, speed, dash charges, checkpoint feedback, prompts and screen flashes. */
import { useEffect, useState } from 'react';
import { useUi, type Flash } from '../app/store';
import { formatTime } from '../core/math';
import { keyLabel, type Action } from '../input/bindings';
import { useGame } from './App';

function FlashLayer() {
  const flash = useUi((s) => s.flash);
  const [shown, setShown] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    setShown(flash);
    const t = setTimeout(
      () => setShown((cur) => (cur?.id === flash.id ? null : cur)),
      flash.kind === 'checkpoint' ? 1700 : 420,
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
  return <div key={shown.id} className={'flash ' + shown.kind} />;
}

function Prompt() {
  const prompt = useUi((s) => s.prompt);
  const game = useGame();
  if (!prompt) return null;
  const codes = game.save.data.bindings[prompt.action as Action] ?? [];
  const label = prompt.action === 'forward' ? 'W A S D' : keyLabel(codes[0]);
  return (
    <div className="prompt" key={prompt.text}>
      <kbd>{label}</kbd>
      <span>{prompt.text}</span>
    </div>
  );
}

export function Hud({ frozen }: { frozen?: boolean }) {
  const hud = useUi((s) => s.hud);
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
  const speed = hud.speed;
  const charges = [0, 1].map((i) => Math.min(1, Math.max(0, hud.dash - i)));
  const fast = speed > 18;
  return (
    <div
      className={'hud' + (frozen ? ' frozen' : '')}
      style={{ ['--hud-scale' as any]: s.hudScale, opacity: s.hudOpacity }}
    >
      <div className="hud-top">
        <div className={'timer mono-num' + (hud.started ? '' : ' idle')}>{formatTime(hud.time)}</div>
        {hud.checkpoints > 0 && (
          <div className="cp-dots" aria-hidden>
            {Array.from({ length: hud.checkpoints }, (_, i) => (
              <i key={i} className={i < hud.checkpoint ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>

      {s.crosshair !== 'off' && <div className={'crosshair ' + s.crosshair} aria-hidden />}

      <div className="hud-bottom">
        <div className="dash" aria-label="Dash charges">
          {charges.map((c, i) => (
            <div key={i} className={'pip' + (c >= 1 ? ' full' : '')}>
              <i style={{ transform: `scaleX(${c})` }} />
            </div>
          ))}
          <span>DASH</span>
        </div>
        {s.showSpeed && (
          <div className={'speed' + (fast ? ' fast' : '')}>
            <div className="gear" aria-hidden>
              {[8, 12, 17, 23].map((t) => (
                <i key={t} className={speed >= t ? 'on' : ''} />
              ))}
            </div>
            <b className="mono-num">{speed.toFixed(1)}</b>
            <span>m/s</span>
            <div className="speed-bar">
              <i style={{ transform: `scaleX(${Math.min(1, speed / 35)})` }} />
            </div>
          </div>
        )}
        {s.showIndicators && (
          <div className="indicators">
            <span className={'ind' + (hud.doubleJump ? ' on' : '')} title="Double jump">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M12 3l7 8h-4.2v3H9.2v-3H5z M12 13l5.5 6h-11z" fill="currentColor" />
              </svg>
            </span>
            <span className={'ind wall' + (hud.wall > 0 ? ' on' : '')} title="Wall-run">
              <i style={{ transform: `scaleX(${hud.wall})` }} />
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M3 2h4v20H3z M10 17l4-9 3 1.3-2.2 4.2 5.2 1.2-.6 2.6-7.4-1.6-1 2.2z"
                  fill="currentColor"
                />
                <circle cx="17.2" cy="5.2" r="2.3" fill="currentColor" />
              </svg>
              <b>WALL</b>
            </span>
            <span className={'ind' + (hud.sliding ? ' on' : '')} title="Slide">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M2 19h20v2.5H2z M5 16l9-6.5 2 2-4.5 3.2 8.5.3v2.6H6z" fill="currentColor" />
                <circle cx="17.5" cy="7" r="2.3" fill="currentColor" />
              </svg>
              SLIDE
            </span>
          </div>
        )}
      </div>

      {s.showFps && <div className="fps mono-num">{hud.fps} FPS</div>}
      {!frozen && <Prompt />}
      <FlashLayer />
    </div>
  );
}
