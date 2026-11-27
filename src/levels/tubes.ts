/**
 * Rolling tubes (Levels 6 and 8): a square tube whose own gravity always pulls to its floor face, so
 * as it rolls about the course's axis the world turns round you and the floor stays your floor.
 */
import type { LevelBuilder } from './LevelBuilder';

/**
 * A square tube, 4 m inside, its floor face at height `base`, along z0..z1 with its pivot on the axis. Its local -Y face is
 * the floor (lit centre line) and its own gravity always pulls toward it. `r0`: starting roll in
 * degrees about Z; `gap`: a hole in the floor face (world z range); `wallrun`: the side faces can
 * be wall-run (and are painted so).
 */
export function tube(
  b: LevelBuilder,
  base: number,
  id: string,
  z0: number,
  z1: number,
  o: {
    r0?: number;
    steps: { t: number; rot: [number, number, number, number] }[];
    gap?: [number, number];
    wallrun?: boolean;
  },
) {
  const len = z1 - z0,
    zc = (z0 + z1) / 2;
  type Part = {
    p: [number, number, number];
    s: [number, number, number];
    mat?: 'base' | 'alt' | 'accent' | 'dark';
    wallrun?: boolean;
  };
  const parts: Part[] = [];
  const floor = (a: number, c: number) => {
    parts.push({ p: [0, -2.5, (a + c) / 2 - zc], s: [6, 1, c - a] });
    parts.push({ p: [0, -1.97, (a + c) / 2 - zc], s: [0.3, 0.06, c - a - 0.4], mat: 'accent' });
  };
  if (o.gap) {
    floor(z0, o.gap[0]);
    floor(o.gap[1], z1);
  } else floor(z0, z1);
  parts.push({ p: [2.5, 0, 0], s: [1, 4, len], mat: 'alt', wallrun: !!o.wallrun });
  parts.push({ p: [-2.5, 0, 0], s: [1, 4, len], mat: 'alt', wallrun: !!o.wallrun });
  parts.push({ p: [0, 2.5, 0], s: [6, 1, len], mat: 'base' });
  for (const x of [-1.9, 1.9]) parts.push({ p: [x, 1.9, 0], s: [0.12, 0.12, len], mat: 'accent' });
  for (let z = -len / 2 + 3; z < len / 2; z += 6)
    for (const k of [-1, 1]) {
      // ribs: thin frames round the outside of the tube
      parts.push({ p: [0, k * 3.1, z], s: [6.4, 0.2, 0.3], mat: 'dark' });
      parts.push({ p: [k * 3.1, 0, z], s: [0.2, 6.4, 0.3], mat: 'dark' });
    }
  b.entity({
    type: 'structure',
    id,
    on: id,
    p: [0, base + 2, zc],
    r: o.r0 ? [0, 0, (o.r0 * Math.PI) / 180] : undefined,
    warn: 0.75,
    steps: o.steps,
    parts,
  });
  b.entity({ type: 'field', mode: 'structure', link: id, p: [0, 0, 0], s: [4, 4, len] });
}
