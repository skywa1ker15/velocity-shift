/**
 * Dev-only live tuning panel (open the dev server with ?dev). Every movement value can be edited
 * while playing; "copy" puts the current config on the clipboard to paste into movementConfig.ts.
 * This module is only imported behind import.meta.env.DEV, so it is not in production builds.
 */
import GUI from 'lil-gui';
import type { Game } from '../app/Game';
import { defaultMovementConfig, movementConfig } from '../movement/movementConfig';

export function mountTuningPanel(game: Game) {
  const gui = new GUI({ title: 'Movement tuning', width: 320 });
  gui.domElement.style.zIndex = '1000';
  const groups: Record<string, string[]> = {
    Ground: ['runSpeed', 'sprintSpeed', 'runAccel', 'sprintAccel', 'groundSteer', 'groundDecel', 'overspeedDecay'],
    Air: ['gravity', 'fallMultiplier', 'jumpVelocity', 'jumpCutMultiplier', 'coyoteTime', 'jumpBuffer', 'airAccel', 'airWishSpeed', 'doubleJumpVelocity', 'doubleJumpRedirect'],
    Slide: ['slideBoost', 'slideBoostCooldown', 'slideFriction', 'slideSlopeGain', 'slideSteer', 'slideExitSpeed'],
    Dash: ['dashSpeed', 'dashDuration', 'dashExitSpeed', 'dashRecharge', 'dashMinInterval'],
    Wall: ['wallMinSpeed', 'wallRunSpeedFloor', 'wallDurationBase', 'wallDurationPerSpeed', 'wallDurationMax', 'wallGravityScale', 'wallStartLift', 'wallJumpOut', 'wallJumpUp'],
    Vault: ['vaultMinHeight', 'vaultMaxHeight', 'vaultDuration', 'vaultSpeedKeep'],
    Limits: ['softSpeedCap', 'softCapDrag'],
  };
  const cfg = movementConfig as unknown as Record<string, number>;
  for (const [name, keys] of Object.entries(groups)) {
    const f = gui.addFolder(name);
    for (const k of keys) f.add(cfg, k, 0, Math.max(1, (defaultMovementConfig as any)[k] * 3));
    f.close();
  }
  const actions = {
    reset: () => {
      Object.assign(movementConfig, defaultMovementConfig);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
    copy: () => void navigator.clipboard?.writeText(JSON.stringify(movementConfig, null, 2)),
    state: () => console.log(game.debugState()),
  };
  gui.add(actions, 'reset').name('Reset to defaults');
  gui.add(actions, 'copy').name('Copy config as JSON');
  gui.add(actions, 'state').name('Log game state');
}
