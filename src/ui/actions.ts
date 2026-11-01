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

/** Return on a line: a new line of the same kind right below; an empty task turns back into text. */
export function lineEnter(id: NodeId, text: string): void {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (!text.trim()) {
    if (n.isTask) {
      e.setTask(id, false);
      haptic.select();
    }
    return;
  }
  const siblings = e.children(n.parentId);
  guard(() => {
    const next = e.create(n.parentId, { isTask: n.isTask, index: siblings.indexOf(id) + 1 });
    editor().requestFocus(next, 'line');
  });
}

/** Backspace on an empty line: a task becomes text; text disappears and the caret moves up. */
export function lineBackspaceEmpty(id: NodeId): void {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (n.isTask) {
    if (guard(() => e.setTask(id, false))) haptic.select();
    return;
  }
  if (e.hasChildren(id)) return;
  const order = editor().order;
  const prev = order[order.indexOf(id) - 1];
  if (!guard(() => e.remove(id))) return;
  if (prev) editor().requestFocus(prev, 'line');
  else if (n.parentId) editor().requestFocus(n.parentId, 'body');
}

export function lineToggleKind(id: NodeId): void {
  const e = getEngine();
  const n = e.get(id);
  if (!n) return;
  if (guard(() => e.setTask(id, !n.isTask))) haptic.select();
}

export function lineIndent(id: NodeId): void {
  const e = getEngine();
  if (guard(() => e.indent(id))) {
    haptic.select();
    editor().requestFocus(id, 'line');
  }
}

export function lineOutdent(id: NodeId): void {
  const e = getEngine();
  if (guard(() => e.outdent(id))) {
    haptic.select();
    editor().requestFocus(id, 'line');
  }
}

/** Append a line to a page and focus it (tap on empty paper, or ☑ from title/body). */
export function appendLine(pageId: NodeId, isTask: boolean): void {
  const e = getEngine();
  const kids = e.children(pageId);
  const last = kids.length ? e.get(kids[kids.length - 1]) : undefined;
  if (last && !last.title.trim() && !e.hasChildren(last.id)) {
    if (last.isTask !== isTask) e.setTask(last.id, isTask);
    editor().requestFocus(last.id, 'line');
    return;
  }
  guard(() => {
    const id = e.create(pageId, { isTask });
    editor().requestFocus(id, 'line');
  });
}
