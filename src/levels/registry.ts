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
      description: 'Night in the chrome canyon. Never slow down — the path will not wait for you.',
      env: 'momentum',
      music: 'momentum',
      spawn: { p: [0, 0, -4], yaw: Math.PI },
      killY: -90,
      medals: { bronze: 90, silver: 63, gold: 47.5, platinum: 40 },
      objectives: [
        { id: 'mo-clean', kind: 'noDeath', label: 'Finish without dying' },
        { id: 'mo-dash', kind: 'maxDashes', value: 6, label: 'Finish using 6 dashes or fewer' },
        { id: 'mo-hidden', kind: 'hiddenRoute', label: 'Find the hidden route' },
      ],
      seed: 41,
    },
    load: () => import('./data/momentum'),
  },
];

export const levelById = (id: string): LevelEntry | undefined => levels.find((l) => l.meta.id === id);
export const courseLevels = () => levels.filter((l) => !l.meta.training);
