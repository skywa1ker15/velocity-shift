/**
 * Level registry. Metadata is tiny and always loaded (menus need it); the geometry builders are
 * lazy-loaded chunks. To add a level: write src/levels/data/<id>.ts and add an entry here.
 */
import type { LevelData, LevelMeta } from './types';

export interface LevelEntry {
  meta: LevelMeta;
  load: () => Promise<{ build(): LevelData }>;
}

export const levels: LevelEntry[] = [
  {
    meta: {
      id: 'training',
      index: 0,
      name: 'TRAINING',
      subtitle: 'The Gym',
      description: 'Every move, one station at a time. No pressure — the clock still runs if you want it to.',
      env: 'training',
      music: 'training',
      spawn: { p: [0, 0, -3], yaw: Math.PI },
      layout: 2, // doubled: the Evolve gym (bests reset)
      killY: -40,
      medals: { bronze: 138, silver: 95, gold: 72, platinum: 61 },
      objectives: [
        { id: 'tr-clean', kind: 'noDeath', label: 'Finish without falling' },
        { id: 'tr-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 11,
      training: true,
    },
    load: () => import('./data/training'),
  },
  {
    meta: {
      id: 'awakening',
      index: 1,
      name: 'THE AWAKENING',
      subtitle: 'Level 1',
      description: 'Dawn above the cloud sea. Marble ruins drift in gold light — learn to move through them.',
      env: 'awakening',
      music: 'awakening',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 3, // 2: doubled: the second half; 3: Phase 3, the course goes on (bests reset)
      killY: -45,
      medals: { bronze: 310, silver: 217, gold: 163, platinum: 140 },
      objectives: [
        { id: 'aw-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'aw-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'aw-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 21,
    },
    load: () => import('./data/awakening'),
  },
  {
    meta: {
      id: 'verticality',
      index: 2,
      name: 'VERTICALITY',
      subtitle: 'Level 2',
      description: 'Dusk among the spires. The only way is up — wall to wall, ledge to ledge.',
      env: 'verticality',
      music: 'verticality',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 3, // 2: doubled: the upper spires; 3: Phase 3, the course goes on (bests reset)
      killY: -50,
      medals: { bronze: 302, silver: 211, gold: 159, platinum: 136.5 },
      objectives: [
        { id: 've-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 've-wall', kind: 'wallTime', value: 12, label: 'Spend 12 seconds wall-running in one run' },
        { id: 've-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
      ],
      seed: 31,
    },
    load: () => import('./data/verticality'),
  },
  {
    meta: {
      id: 'momentum',
      index: 3,
      name: 'MOMENTUM',
      subtitle: 'Level 3',
      description: 'Night in the chrome canyon. Never slow down — and watch the canyon start to move.',
      env: 'momentum',
      music: 'momentum',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 4, // 2: the first Dynamic World act; 3: doubled with the overdrive; 4: Phase 3, the course goes on (bests reset)
      killY: -90,
      medals: { bronze: 321, silver: 225, gold: 169, platinum: 145.5 },
      objectives: [
        { id: 'mo-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'mo-dash', kind: 'maxDashes', value: 6, label: 'Finish using 6 dashes or fewer' },
        { id: 'mo-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
      ],
      seed: 41,
    },
    load: () => import('./data/momentum'),
  },
  {
    meta: {
      id: 'breakpoint',
      index: 4,
      name: 'BREAKPOINT',
      subtitle: 'Level 4',
      description:
        'Noon in the printed city. Keep your flow through the clutter, then hold on: each block bends gravity a new way.',
      env: 'breakpoint',
      music: 'awakening',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 3, // 2: rebuilt with the gravity blocks; 3: Phase 3, the course goes on (bests reset)
      killY: -45,
      medals: { bronze: 264, silver: 185, gold: 139, platinum: 119.5 },
      objectives: [
        { id: 'bp-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'bp-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'bp-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 51,
    },
    load: () => import('./data/breakpoint'),
  },
  {
    meta: {
      id: 'inkfalls',
      index: 5,
      name: 'INK FALLS',
      subtitle: 'Level 5',
      description:
        'A brush-drawn gorge that only goes down, and comes apart as you cross it: pillars fall, braces break, whole bridges drop.',
      env: 'inkfalls',
      music: 'verticality',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 4, // 2: the destruction act; 3: doubled with the lower gorge; 4: Phase 3, the course goes on (bests reset)
      killY: -90,
      medals: { bronze: 300, silver: 210, gold: 158, platinum: 136 },
      objectives: [
        { id: 'if-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'if-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'if-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 61,
    },
    load: () => import('./data/inkfalls'),
  },
  {
    meta: {
      id: 'faceted',
      index: 6,
      name: 'FACETED',
      subtitle: 'Level 6',
      description:
        'A folded-paper valley where the ground keeps moving, until the valley itself folds: left, right, and over the top.',
      env: 'faceted',
      music: 'training',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 3, // 2: rebuilt with the folds; 3: Phase 3, the course goes on (bests reset)
      killY: -40,
      bounds: [
        [-60, -40, -30],
        [60, 60, 2600],
      ],
      medals: { bronze: 241, silver: 169, gold: 127, platinum: 109 },
      objectives: [
        { id: 'fa-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'fa-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'fa-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 71,
    },
    load: () => import('./data/faceted'),
  },
  {
    meta: {
      id: 'blockfall',
      index: 7,
      name: 'BLOCKFALL',
      subtitle: 'Level 7',
      description:
        'Blocks hanging in an open sky. Precision first, then the blocks turn: up their faces, over their edges, across their ceilings.',
      env: 'blockfall',
      music: 'verticality',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 3, // 2: rebuilt with the turning blocks; 3: Phase 3, the course goes on (bests reset)
      killY: -35,
      bounds: [
        [-60, -35, -30],
        [60, 60, 2600],
      ],
      medals: { bronze: 268, silver: 188, gold: 141, platinum: 121.5 },
      objectives: [
        { id: 'bf-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'bf-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'bf-dash', kind: 'maxDashes', value: 2, label: 'Finish using 2 dashes or fewer' },
      ],
      seed: 81,
    },
    load: () => import('./data/blockfall'),
  },
  {
    meta: {
      id: 'core',
      index: 8,
      name: 'CORRUPTED CORE',
      subtitle: 'Level 8',
      description:
        'Inside a machine that is coming apart. Beams, walls and crushers, then nothing obeys the rules: gravity, structure and direction all at once.',
      env: 'core',
      music: 'momentum',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      layout: 3, // 2: rebuilt with Meltdown; 3: Phase 3, the course goes on (bests reset)
      killY: -70,
      bounds: [
        [-60, -70, -30],
        [60, 60, 2600],
      ],
      medals: { bronze: 285, silver: 200, gold: 150, platinum: 129 },
      objectives: [
        { id: 'co-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'co-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'co-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 91,
    },
    load: () => import('./data/core'),
  },
  {
    meta: {
      id: 'shiftpoint',
      index: 9,
      name: 'SHIFT POINT',
      subtitle: 'Level 9',
      description:
        'The world will not hold still. Halls turn, walls become floors, bridges fall, gravity reverses, and then it all turns over at once.',
      env: 'shiftpoint',
      music: 'momentum',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -60,
      layout: 4, // 2: the finale added; 3: doubled with the reprise; 4: Phase 3, the course goes on (bests reset)
      bounds: [
        [-70, -60, -30],
        [70, 80, 2600],
      ],
      medals: { bronze: 344, silver: 241, gold: 181, platinum: 155.5 },
      objectives: [
        { id: 'sp-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'sp-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
        { id: 'sp-gems', kind: 'allCollectibles', label: 'Collect all three shards' },
      ],
      seed: 101,
    },
    load: () => import('./data/shiftpoint'),
  },
];

export const levelById = (id: string): LevelEntry | undefined => levels.find((l) => l.meta.id === id);
export const courseLevels = () => levels.filter((l) => !l.meta.training);
