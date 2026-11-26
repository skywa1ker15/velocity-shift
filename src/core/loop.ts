/**
 * Fixed-timestep loop with an accumulator.
 *
 * The simulation always advances in exact 1/120 s ticks, so movement is identical at any
 * display refresh rate. Rendering receives `alpha` (0..1) to interpolate between the last
 * two simulation states.
 */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
const MAX_FRAME = 0.25; // clamp long frames: avoids spiral-of-death after tab switches or hitches

export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  /** When > 0 the render callback is throttled to this FPS. */
  fpsCap = 0;
  private lastRender = 0;

  constructor(
    private tick: () => void,
    private render: (alpha: number, frameDt: number) => void,
    private preFrame?: (frameDt: number) => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      if (this.fpsCap > 0 && now - this.lastRender < 1000 / this.fpsCap - 0.5) return;
      this.lastRender = now;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      if (dt < 0) dt = 0;
      this.preFrame?.(dt);
      this.acc += dt;
      while (this.acc >= SIM_DT) {
        this.tick();
        this.acc -= SIM_DT;
      }
      this.render(this.acc / SIM_DT, dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Drop accumulated time (after pause/resume) so the sim does not fast-forward. */
  resetClock() {
    this.acc = 0;
    this.last = performance.now();
  }
}

/** Pure helper used by tests: how many ticks a sequence of frame times produces. */
export function simulateAccumulator(frameTimes: number[]): number {
  let acc = 0;
  let ticks = 0;
  for (let dt of frameTimes) {
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    acc += dt;
    while (acc >= SIM_DT) {
      ticks++;
      acc -= SIM_DT;
    }
  }
  return ticks;
}
