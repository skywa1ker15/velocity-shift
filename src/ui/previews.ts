/**
 * Level preview art: real renders from the game (see scripts/capture-previews note in
 * docs/ART_DIRECTION.md), one per level. Missing files just fall back to the CSS sky gradient.
 */
const files = import.meta.glob('./art/preview-*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const previewFor = (levelId: string): string | null => files[`./art/preview-${levelId}.webp`] ?? null;
