/**
 * Cascade choreography. Ancestors that auto-complete are marked here for a
 * moment so their Check waits for the child's ring to close first (120 ms).
 */
const pending = new Map<string, number>();

export const CASCADE_DELAY = 140;

export function markCascade(ids: string[]): void {
  const t = Date.now();
  ids.forEach((id, i) => pending.set(id, t + CASCADE_DELAY * (i + 1)));
}

/** Delay (ms) this node's check animation should wait, consumed once. */
export function takeCascadeDelay(id: string | undefined): number {
  if (!id) return 0;
  const at = pending.get(id);
  if (at === undefined) return 0;
  pending.delete(id);
  return Math.max(0, at - Date.now());
}
