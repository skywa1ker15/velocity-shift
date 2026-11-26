/**
 * Every tunable movement value lives here (metres, seconds, radians).
 * The dev tuning panel edits this object live; nothing in the controller is hard-coded.
 * See docs/MOVEMENT.md for the reasoning behind each value.
 */
export const movementConfig = {
  // Body
  radius: 0.35,
  standHeight: 1.8,
  slideHeight: 0.9,
  eyeOffset: 0.16, // eyes sit this far below the top of the capsule

  // Ground
  runSpeed: 7,
  sprintSpeed: 11,
  crouchSpeed: 3.5,
  runAccel: 60, // to run speed
  sprintAccel: 7, // run → sprint ramp (~0.6 s)
  groundSteer: 70, // how fast velocity re-aims toward input (m/s²)
  groundDecel: 48, // stop from run in ~0.15 s
  overspeedDecay: 5.5, // m/s² lost while above top speed on the ground (momentum is kept briefly)
  stepHeight: 0.35,
  maxSlopeDeg: 50,
  snapDistance: 0.3,

  // Air
  gravity: 28,
  fallMultiplier: 1.6,
  terminalVelocity: 55,
  jumpVelocity: 9,
  jumpCutMultiplier: 0.5,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  airAccel: 14,
  airWishSpeed: 7,
  doubleJumpVelocity: 8.5,
  doubleJumpRedirect: 0.6,

  // Slide
  slideMinEnterSpeed: 4.5,
  slideExitSpeed: 3,
  slideBoost: 2.5,
  slideBoostCooldown: 0.8,
  slideFriction: 8.6,
  slideSlopeGain: 1.4,
  slideSteer: 1.4, // rad/s

  // Dash
  dashSpeed: 26,
  dashDuration: 0.15,
  dashExitSpeed: 13,
  dashCharges: 2,
  dashRecharge: 1.2,
  dashMinInterval: 0.3,
  dashMaxPitchDeg: 25,

  // Wall-run
  wallMinSpeed: 5.5,
  wallRunSpeedFloor: 9,
  wallCheckDistance: 0.5,
  wallMaxAngleDeg: 60,
  wallDurationBase: 0.8,
  wallDurationPerSpeed: 0.06,
  wallDurationMax: 2.0,
  wallGravityScale: 0.55,
  wallStartLift: 2.6,
  wallDashBonus: 1.5,
  wallMinGroundClearance: 0.6,
  wallJumpOut: 7,
  wallJumpUp: 8.5,
  wallCoyote: 0.14,

  // Vault
  vaultMinHeight: 0.4,
  vaultMaxHeight: 1.3,
  vaultMinSpeed: 4,
  vaultDuration: 0.25,
  vaultSpeedKeep: 0.95,
  vaultReach: 0.55,

  // Limits
  softSpeedCap: 35,
  softCapDrag: 1.5,
};

export type MovementConfig = typeof movementConfig;
export const defaultMovementConfig: MovementConfig = { ...movementConfig };
