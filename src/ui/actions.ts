import { SealedError, type CortexEngine } from '../engine/CortexEngine';
import type { NodeId } from '../engine/types';
import { getEngine } from '../platform/db';
import { haptic } from '../platform/haptics';
import { cancelTriggers } from '../platform/notify';
import { editor } from '../state/editor';
import { nav } from '../state/nav';
import { CASCADE_DELAY, markCascade } from './choreo';

/** Runs a structural change; a locked plan answers with a gentle warning instead of an error. */
export function guard(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof SealedError) {
      haptic.warn();
      nav().showToast('Plan kilitli — önce görevleri bitir', false);
      return false;
    }
    throw e;
  }
}

export function toggleTask(e: CortexEngine, id: NodeId): void {
  const ancestors = e.path(id).slice(0, -1).map((n) => n.id).reverse();
  markCascade(ancestors);
  const r = e.toggle(id);
  if (r.cascaded.length > 0 && r.done) {
    haptic.tick();
    setTimeout(() => haptic.cascade(), CASCADE_DELAY * r.cascaded.length);
    const top = e.get(r.cascaded[r.cascaded.length - 1]);
    nav().showToast(`${top?.title || 'Görev'} tamamlandı`);
  } else if (r.done) haptic.tick();
  else haptic.soft();
}

/** Delete for real (subtree + references), with an undo capsule and no lingering alarms. */
export function deleteNode(id: NodeId): boolean {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return false;
  const subtree = e.subtree(id);
  if (!guard(() => e.remove(id))) return false;
  cancelTriggers(subtree);
  haptic.thud();
  nav().showToast(`“${n.title || 'Adsız'}” silindi`);
  return true;
}

// ───────────────────────── line editing ─────────────────────────

/** Deepest level a page shows inline (0-based); deeper lines open as their own page. */
export const MAX_DEPTH = 3;

/** How deep a line sits on the current page (0 = directly on it). */
function depthOnPage(id: NodeId): number {
  const path = getEngine().path(id);
  const at = path.findIndex((n) => n.id === editor().page);
  return at < 0 ? 0 : path.length - at - 2;
}

/** Can this line move one level in without disappearing from the page? */
export function canIndent(id: NodeId): boolean {
  if (depthOnPage(id) < MAX_DEPTH) return true;
  haptic.warn();
  nav().showToast('Daha derini için satırı › ile aç', false);
  return false;
}

/** Is this line nested inside another line on the current page (so it can step out)? */
export function canOutdent(id: NodeId): boolean {
  const n = getEngine().get(id);
  const page = editor().page;
  return !!n && !!n.parentId && n.parentId !== page;
}

/**
 * Return on a line. With text: a new line of the same kind right below (task
 * stays task, list stays list). Empty and nested: step out one level, keeping
 * the kind. Empty at the top: drop the checkbox / list marker — Apple Notes.
 */
export function lineEnter(id: NodeId, text: string): void {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (!text.trim()) {
    if (canOutdent(id)) return lineOutdent(id);
    if (n.isTask) {
      if (guard(() => e.setTask(id, false))) haptic.select();
      return;
    }
    if (n.fmt?.l) {
      e.setFmt(id, { l: null });
      haptic.select();
      return;
    }
  }
  const siblings = e.children(n.parentId);
  guard(() => {
    const next = e.create(n.parentId, { isTask: n.isTask, index: siblings.indexOf(id) + 1, fmt: n.fmt?.l ? { l: n.fmt.l } : null });
    editor().requestFocus(next, 'line');
  });
}

/**
 * Backspace at the very start of a line: a nested line steps out a level;
 * at the top the checkbox or list marker goes; an empty plain line
 * disappears and the caret moves up.
 */
export function lineBackspaceAtStart(id: NodeId, empty: boolean): boolean {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return false;
  if (canOutdent(id)) {
    lineOutdent(id);
    return true;
  }
  if (n.isTask) {
    if (guard(() => e.setTask(id, false))) haptic.select();
    return true;
  }
  if (n.fmt?.l) {
    e.setFmt(id, { l: null });
    haptic.select();
    return true;
  }
  if (!empty || e.hasChildren(id)) return false;
  const order = editor().order;
  const prev = order[order.indexOf(id) - 1];
  if (!guard(() => e.remove(id))) return false;
  if (prev && e.get(prev)?.role !== 'table') editor().requestFocus(prev, 'line');
  else if (n.parentId) editor().requestFocus(n.parentId, 'body');
  return true;
}

/** ☑ — a checkbox appears; pressed again it disappears completely. */
export function lineToggleKind(id: NodeId): void {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (guard(() => e.setTask(id, !n.isTask))) {
    if (!n.isTask && n.fmt?.l) e.setFmt(id, { l: null });
    haptic.select();
  }
}

/** • / 1. — toggle a list marker (a task line becomes a list line). */
export function lineToggleList(id: NodeId, kind: 'bullet' | 'number'): void {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (n.isTask && !guard(() => e.setTask(id, false))) return;
  e.setFmt(id, { l: n.fmt?.l === kind ? null : kind });
  haptic.select();
}

export function lineIndent(id: NodeId): void {
  const e = getEngine();
  if (canIndent(id) && guard(() => e.indent(id))) {
    haptic.select();
    editor().requestFocus(id, 'line');
  }
}

export function lineOutdent(id: NodeId): void {
  const e = getEngine();
  if (!canOutdent(id)) return;
  if (guard(() => e.outdent(id))) {
    haptic.select();
    editor().requestFocus(id, 'line');
  }
}

/** Append a line to a page and focus it (tap on empty paper, or ☑ / • from title/body). */
export function appendLine(pageId: NodeId, isTask: boolean, list?: 'bullet' | 'number'): void {
  const e = getEngine();
  const kids = e.children(pageId);
  const last = kids.length ? e.get(kids[kids.length - 1]) : undefined;
  if (last && last.role !== 'table' && !last.title.trim() && !e.hasChildren(last.id)) {
    if (last.isTask !== isTask) e.setTask(last.id, isTask);
    if ((last.fmt?.l ?? undefined) !== list) e.setFmt(last.id, { l: list ?? null });
    editor().requestFocus(last.id, 'line');
    return;
  }
  guard(() => {
    const id = e.create(pageId, { isTask, fmt: list ? { l: list } : null });
    editor().requestFocus(id, 'line');
  });
}

/** ⊞ — a 2×2 table right below the focused line (or at the end of the page); its first cell takes focus. */
export function insertTable(pageId: NodeId, afterId?: NodeId): void {
  const e = getEngine();
  const after = afterId ? e.get(afterId) : undefined;
  const parent = after?.parentId ?? pageId;
  const index = after ? e.children(parent).indexOf(after.id) + 1 : undefined;
  guard(() => {
    const id = e.createTable(parent, index);
    haptic.select();
    editor().requestFocus(id, 'cell');
  });
}
