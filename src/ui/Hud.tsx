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
    const t = setTimeout(() => setShown((cur) => (cur?.id === flash.id ? null : cur)), flash.kind === 'checkpoint' ? 1700 : 420);
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
    <div className={'hud' + (frozen ? ' frozen' : '')} style={{ ['--hud-scale' as any]: s.hudScale, opacity: s.hudOpacity }}>
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
              ▲▲
            </span>
            <span className={'ind wall' + (hud.wall > 0 ? ' on' : '')} title="Wall-run">
              <i style={{ transform: `scaleX(${hud.wall})` }} />
              WALL
            </span>
            <span className={'ind' + (hud.sliding ? ' on' : '')} title="Slide">
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
