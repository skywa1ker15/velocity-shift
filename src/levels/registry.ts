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
      killY: -40,
      medals: { bronze: 70, silver: 48, gold: 36.5, platinum: 31 },
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
      killY: -45,
      medals: { bronze: 78, silver: 54, gold: 41, platinum: 34.5 },
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
      killY: -50,
      medals: { bronze: 85, silver: 59, gold: 44.5, platinum: 37.5 },
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
      layout: 2, // rebuilt with the first Dynamic World act (bests reset)
      killY: -90,
      medals: { bronze: 117, silver: 82.5, gold: 62, platinum: 52.5 },
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
      description: 'Noon in the printed city. Crates, bars and beams: keep your flow through the clutter.',
      env: 'breakpoint',
      music: 'awakening',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -45,
      medals: { bronze: 58, silver: 41, gold: 31.5, platinum: 27.5 },
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
        'A brush-drawn gorge that only goes down. Bridges give way and the walls run over the void.',
      env: 'inkfalls',
      music: 'verticality',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -60,
      medals: { bronze: 67, silver: 47.5, gold: 36.5, platinum: 31.5 },
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
      description: 'A folded-paper valley where the ground keeps moving. A course about timing, not speed.',
      env: 'faceted',
      music: 'training',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -40,
      medals: { bronze: 54, silver: 38.5, gold: 29.5, platinum: 25.5 },
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
      description: 'Blocks hanging in an open sky. Precision over speed: every landing counts.',
      env: 'blockfall',
      music: 'verticality',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -35,
      medals: { bronze: 46, silver: 32.5, gold: 25, platinum: 21.5 },
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
      description: 'Inside a machine that is coming apart. The finale: beams, walls, crushers, all at once.',
      env: 'core',
      music: 'momentum',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -40,
      medals: { bronze: 51, silver: 36, gold: 27.5, platinum: 23.5 },
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
        'The world will not hold still. Halls turn, walls become floors, bridges fall and gravity reverses.',
      env: 'shiftpoint',
      music: 'momentum',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -60,
      bounds: [
        [-70, -60, -30],
        [70, 80, 560],
      ],
      medals: { bronze: 82, silver: 59, gold: 46, platinum: 40 },
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
