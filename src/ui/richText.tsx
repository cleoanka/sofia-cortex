import { haptic } from '../platform/haptics';
import { nav } from '../state/nav';

/**
 * Follow an unresolved `&reference&`: it is a tag, so show every note that
 * carries it. Never creates a note — a dead link must not resurrect a deleted one.
 */
export function followRef(key: string): void {
  haptic.select();
  nav().openPalette({ mode: 'search' });
  setTimeout(() => paletteQuery.set?.(`&${key}&`), 0);
}

/** Bridge so a tag tap can pre-fill the command palette. */
export const paletteQuery: { set?: (q: string) => void } = {};
