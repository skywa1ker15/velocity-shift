/** Graphics quality tiers and the adaptive "Auto" governor. */

export type TierName = 'low' | 'medium' | 'high' | 'ultra';

export interface Tier {
  maxPixelRatio: number;
  shadowSize: number; // 0 = off
  shadowRange: number;
  bloom: boolean;
  bloomLevels: number;
  bloomScale: number;
  chroma: boolean;
  smaa: 0 | 1 | 2;
  particles: number; // density multiplier
  speedLines: number; // instance count
}

export const tiers: Record<TierName, Tier> = {
  low: {
    maxPixelRatio: 0.85,
    shadowSize: 0,
    shadowRange: 40,
    bloom: false,
    bloomLevels: 4,
    bloomScale: 0,
    chroma: false,
    smaa: 0,
    particles: 0.35,
    speedLines: 40,
  },
  medium: {
    maxPixelRatio: 1,
    shadowSize: 1024,
    shadowRange: 46,
    bloom: true,
    bloomLevels: 5,
    bloomScale: 0.9,
    chroma: false,
    smaa: 0,
    particles: 0.6,
    speedLines: 70,
  },
  high: {
    maxPixelRatio: 1.25,
    shadowSize: 2048,
    shadowRange: 56,
    bloom: true,
    bloomLevels: 6,
    bloomScale: 1,
    chroma: true,
    smaa: 1,
    particles: 1,
    speedLines: 110,
  },
  ultra: {
    maxPixelRatio: 2,
    shadowSize: 4096,
    shadowRange: 70,
    bloom: true,
    bloomLevels: 7,
    bloomScale: 1.05,
    chroma: true,
    smaa: 2,
    particles: 1.5,
    speedLines: 150,
  },
};

const order: TierName[] = ['low', 'medium', 'high', 'ultra'];

/**
 * Auto quality: watches a rolling average frame time. If the game runs slow it first lowers the
 * resolution scale, then drops a tier; it never raises quality mid-run (no visual popping).
 */
export class AutoQuality {
  tier: TierName = 'high';
  scale = 1;
  private acc = 0;
  private frames = 0;
  private slowWindows = 0;

  constructor(start: TierName = 'high') {
    this.tier = start;
  }

  /** Returns true when tier or scale changed. */
  sample(dt: number): boolean {
    if (dt > 0.2) return false; // ignore hitches (tab switch, level load)
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return false;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (fps < 50) this.slowWindows++;
    else this.slowWindows = 0;
    if (this.slowWindows < 2) return false;
    this.slowWindows = 0;
    if (this.scale > 0.76) {
      this.scale = Math.max(0.75, this.scale - 0.125);
      return true;
    }
    const i = order.indexOf(this.tier);
    if (i > 0) {
      this.tier = order[i - 1];
      this.scale = 1;
      return true;
    }
    if (this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale - 0.125);
      return true;
    }
    return false;
  }
}

/** Pick a sensible starting tier from what the browser reports about the GPU. */
export function guessTier(gl: WebGL2RenderingContext | WebGLRenderingContext): TierName {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/swiftshader|llvmpipe|software|basic render/.test(name)) return 'low';
    if (/rtx|radeon rx|geforce gtx 1[06-9]|arc|apple m[1-9]|apple gpu/.test(name)) return 'high';
    if (/intel|iris|uhd|hd graphics|mali|adreno/.test(name)) return 'medium';
  } catch {
    /* fall through */
  }
  return 'high';
}
