/** Settings (applied live) and the key rebinding screen. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUi } from '../app/store';
import {
  actionLabels,
  actionOrder,
  defaultBindings,
  findConflicts,
  keyLabel,
  usesCtrl,
  type Action,
} from '../input/bindings';
import { defaultSettings, type Settings } from '../settings/settings';
import { Btn, Panel, useGame } from './App';

type Tab = 'Graphics' | 'Display' | 'Controls' | 'Comfort' | 'Audio' | 'Gameplay' | 'Data';
const tabs: Tab[] = ['Graphics', 'Display', 'Controls', 'Comfort', 'Audio', 'Gameplay', 'Data'];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="set-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="set-ctl">{children}</div>
    </label>
  );
}

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const game = useGame();
  useUi((s) => s.saveRev);
  const [tab, setTab] = useState<Tab>('Graphics');
  const [confirmReset, setConfirmReset] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const s = game.settings;
  const set = (patch: Partial<Settings>) => game.updateSettings(patch);

  const slider = (
    key: keyof Settings,
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string = (v) => v.toFixed(2),
  ) => (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={s[key] as number}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Settings>)}
      />
      <output className="mono-num">{fmt(s[key] as number)}</output>
    </>
  );
  const toggle = (key: keyof Settings) => (
    <button
      type="button"
      role="switch"
      aria-checked={!!s[key]}
      className={'switch' + (s[key] ? ' on' : '')}
      onClick={() => set({ [key]: !s[key] } as Partial<Settings>)}
    >
      <i />
    </button>
  );
  const select = <K extends keyof Settings>(key: K, options: [Settings[K], string][]) => (
    <select
      value={String(s[key])}
      onChange={(e) =>
        set({ [key]: options.find((o) => String(o[0]) === e.target.value)![0] } as Partial<Settings>)
      }
    >
      {options.map(([v, l]) => (
        <option key={String(v)} value={String(v)}>
          {l}
        </option>
      ))}
    </select>
  );
  const pct = (v: number) => Math.round(v * 100) + '%';

  const exportSave = () => {
    const blob = new Blob([game.save.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'velocity-shift-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNote('Save exported.');
  };
  const importSave = async (file: File | undefined) => {
    if (!file) return;
    const ok = game.save.importJson(await file.text());
    if (ok) {
      game.input.bindings = game.save.data.bindings;
      game.updateSettings({});
    }
    setNote(ok ? 'Save imported.' : 'That file is not a valid save.');
  };

  return (
    <Panel title="Settings" kicker="Changes apply immediately" wide onBack={onBack}>
      <div className="tabs">
        {tabs.map((t) => (
          <Btn key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </Btn>
        ))}
      </div>
      <div className="settings">
        {tab === 'Graphics' && (
          <>
            <Row
              label="Quality preset"
              hint={s.preset === 'auto' ? `Auto is currently using: ${game.renderer.tierName}` : undefined}
            >
              {select('preset', [
                ['auto', 'Auto (adapts to your machine)'],
                ['low', 'Low'],
                ['medium', 'Medium'],
                ['high', 'High'],
                ['ultra', 'Ultra'],
              ])}
            </Row>
            <Row label="Resolution scale">{slider('resolutionScale', 0.5, 1, 0.05, pct)}</Row>
            <Row label="Shadows">{toggle('shadows')}</Row>
            <Row label="Post-processing" hint="Bloom, vignette, dash distortion">
              {toggle('postFx')}
            </Row>
            <Row label="Particle density">{slider('particles', 0, 1, 0.05, pct)}</Row>
            <Row label="Frame-rate cap">
              {select('fpsCap', [
                [0, 'Unlimited'],
                [60, '60'],
                [90, '90'],
                [120, '120'],
                [144, '144'],
                [240, '240'],
              ])}
            </Row>
            <Row label="Show FPS counter">{toggle('showFps')}</Row>
          </>
        )}
        {tab === 'Display' && (
          <>
            <Row label="Field of view" hint="Horizontal, measured at 16:9">
              {slider('fov', 80, 120, 1, (v) => v.toFixed(0) + '°')}
            </Row>
            <Row label="Speed FOV" hint="How much the view widens as you go faster">
              {slider('speedFov', 0, 1, 0.05, pct)}
            </Row>
            <Row label="Brightness">{slider('brightness', 0.6, 1.4, 0.02, pct)}</Row>
          </>
        )}
        {tab === 'Controls' && (
          <>
            <Row label="Mouse sensitivity">
              {slider('sensitivity', 0.1, 5, 0.05)}
              <input
                className="num"
                type="number"
                min={0.1}
                max={5}
                step={0.05}
                value={s.sensitivity}
                onChange={(e) => set({ sensitivity: Number(e.target.value) || 1 })}
                aria-label="Sensitivity value"
              />
            </Row>
            <Row label="Invert vertical look">{toggle('invertY')}</Row>
            <Row label="Sprint" hint="Auto: always sprint when moving forward">
              {select('sprintMode', [
                ['auto', 'Auto-sprint'],
                ['hold', 'Hold to sprint'],
                ['toggle', 'Toggle'],
              ])}
            </Row>
            <Row label="Slide">
              {select('slideMode', [
                ['hold', 'Hold to slide'],
                ['toggle', 'Toggle'],
              ])}
            </Row>
            <Row label="Key bindings">
              <Btn onClick={() => useUi.getState().set({ overlay: 'controls' })}>Rebind keys…</Btn>
            </Row>
          </>
        )}
        {tab === 'Comfort' && (
          <>
            <Row
              label="Reduce motion"
              hint="Turns off head bob, shake and screen distortion; softens roll, FOV changes and speed lines"
            >
              {toggle('reduceMotion')}
            </Row>
            <Row
              label="Motion intensity"
              hint="Master scale for camera bob, roll and shake, arm and body sway, landings and speed effects. The sliders below fine-tune each one."
            >
              {slider('motionIntensity', 0, 1.5, 0.05, pct)}
            </Row>
            <Row label="Head bob">{slider('headBob', 0, 1, 0.05, pct)}</Row>
            <Row label="Arm and body sway" hint="Arm lag when you look around, weight shifts and breathing">
              {slider('armSway', 0, 1, 0.05, pct)}
            </Row>
            <Row label="Camera roll" hint="Wall-run and slide tilt">
              {slider('cameraRoll', 0, 1, 0.05, pct)}
            </Row>
            <Row label="Camera shake">{slider('cameraShake', 0, 1, 0.05, pct)}</Row>
            <Row label="Speed lines">{slider('speedLines', 0, 1, 0.05, pct)}</Row>
            <Row
              label="High-contrast hazards"
              hint="Stronger stripe pattern on lethal surfaces (colour-blind friendly)"
            >
              {toggle('colorblind')}
            </Row>
            <Row label="Tutorial prompts">{toggle('tutorials')}</Row>
            <Row
              label="Shift intensity"
              hint="Strength of flashes, glitches, colour fringes and hue drift when the world shifts"
            >
              {slider('shiftIntensity', 0, 1, 0.05, pct)}
            </Row>
          </>
        )}
        {tab === 'Audio' && (
          <>
            <Row label="Master">{slider('volMaster', 0, 1, 0.02, pct)}</Row>
            <Row label="Music">{slider('volMusic', 0, 1, 0.02, pct)}</Row>
            <Row label="Effects">{slider('volSfx', 0, 1, 0.02, pct)}</Row>
            <Row label="Ambience and wind">{slider('volAmbience', 0, 1, 0.02, pct)}</Row>
            <Row label="Interface">{slider('volUi', 0, 1, 0.02, pct)}</Row>
          </>
        )}
        {tab === 'Gameplay' && (
          <>
            <Row
              label="Multiverse"
              hint="Shifting: the world changes universe as you run, differently every run. Home: each level keeps one universe. Classic: the original hand-drawn look. Takes effect on the next run."
            >
              {select('multiverse', [
                ['dynamic', 'Shifting'],
                ['home', 'Home universe'],
                ['classic', 'Classic look'],
              ])}
            </Row>
            <Row label="Show personal-best ghost">{toggle('ghost')}</Row>
            <Row label="Speedometer">{toggle('showSpeed')}</Row>
            <Row label="Movement indicators" hint="Double jump, wall-run timer, slide">
              {toggle('showIndicators')}
            </Row>
            <Row label="Crosshair">
              {select('crosshair', [
                ['dot', 'Dot'],
                ['ring', 'Ring'],
                ['off', 'Off'],
              ])}
            </Row>
            <Row label="HUD size">{slider('hudScale', 0.7, 1.4, 0.05, pct)}</Row>
            <Row label="HUD opacity">{slider('hudOpacity', 0.2, 1, 0.05, pct)}</Row>
            <Row label="Hide HUD">{toggle('hideHud')}</Row>
            <Row label="Unlock all levels">{toggle('unlockAll')}</Row>
          </>
        )}
        {tab === 'Data' && (
          <>
            <Row label="Export save" hint="Download your progress as a file">
              <Btn onClick={exportSave}>Export</Btn>
            </Row>
            <Row label="Import save" hint="Replaces the current progress">
              <Btn onClick={() => fileRef.current?.click()}>Import…</Btn>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => void importSave(e.target.files?.[0])}
              />
            </Row>
            <Row label="Reset settings" hint="Back to defaults; progress is kept">
              <Btn
                onClick={() => {
                  set({ ...defaultSettings });
                  setNote('Settings reset.');
                }}
              >
                Reset settings
              </Btn>
            </Row>
            <Row label="Reset progress" hint="Deletes records, medals, shards and achievements">
              {!confirmReset ? (
                <Btn className="danger" onClick={() => setConfirmReset(true)}>
                  Reset progress…
                </Btn>
              ) : (
                <>
                  <Btn
                    className="danger"
                    onClick={() => {
                      game.save.reset(true);
                      game.updateSettings({});
                      setConfirmReset(false);
                      setNote('Progress reset.');
                    }}
                  >
                    Yes, delete everything
                  </Btn>
                  <Btn onClick={() => setConfirmReset(false)}>Cancel</Btn>
                </>
              )}
            </Row>
            {note && <p className="fine">{note}</p>}
            {!game.save.available && (
              <p className="fine warn">Storage is unavailable in this browser mode — nothing can be saved.</p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

export function ControlsPanel({ onBack }: { onBack: () => void }) {
  const game = useGame();
  useUi((s) => s.saveRev);
  const [capturing, setCapturing] = useState<{ action: Action; slot: number } | null>(null);
  const [warning, setWarning] = useState('');
  const b = game.save.data.bindings;

  useEffect(() => () => game.input.cancelCapture(), [game]);

  const rebind = async (action: Action, slot: number) => {
    setCapturing({ action, slot });
    setWarning('');
    (document.activeElement as HTMLElement | null)?.blur(); // so Space/Enter cannot re-trigger the button
    const code = await game.input.captureNext();
    setCapturing(null);
    if (code === 'Escape') return; // Esc cancels (it is reserved for pause)
    const next = structuredClone(b);
    const conflicts = findConflicts(next, code, action);
    for (const c of conflicts) next[c] = next[c].filter((x) => x !== code);
    next[action][slot] = code;
    next[action] = next[action].filter((x, i, arr) => x && arr.indexOf(x) === i);
    game.setBindings(next);
    const notes: string[] = [];
    if (conflicts.length)
      notes.push(`${keyLabel(code)} was removed from: ${conflicts.map((c) => actionLabels[c]).join(', ')}.`);
    if (usesCtrl(next))
      notes.push(
        'Ctrl + W closes browser tabs. Play in fullscreen (F11) in Chrome or Edge so the game can block that shortcut.',
      );
    setWarning(notes.join(' '));
  };

  return (
    <Panel
      title="Controls"
      kicker="Click a key to rebind · Esc cancels"
      wide
      onBack={capturing ? undefined : onBack}
    >
      <div className="binds">
        {actionOrder.map((a) => (
          <div className="bind-row" key={a}>
            <span>{actionLabels[a]}</span>
            {[0, 1].map((slot) => {
              const active = capturing?.action === a && capturing.slot === slot;
              return (
                <Btn
                  key={slot}
                  className={'key' + (active ? ' capturing' : '')}
                  onClick={() => void rebind(a, slot)}
                >
                  {active ? 'Press a key…' : keyLabel(b[a][slot])}
                </Btn>
              );
            })}
          </div>
        ))}
        <div className="bind-row fixed">
          <span>Look</span>
          <em>Mouse</em>
          <em />
        </div>
        <div className="bind-row fixed">
          <span>Pause / release mouse</span>
          <em>ESC</em>
          <em />
        </div>
      </div>
      {warning && <p className="fine warn">{warning}</p>}
      <div className="row">
        <Btn
          onClick={() => {
            game.setBindings(structuredClone(defaultBindings));
            setWarning('');
          }}
        >
          Reset to defaults
        </Btn>
      </div>
      <p className="fine">
        Wall-running and vaulting are automatic: jump alongside a lit wall while moving forward to run on it,
        and run straight at waist-high obstacles to vault them.
      </p>
    </Panel>
  );
}
