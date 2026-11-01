import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useSceneDepth } from './scene';
import { CortexEngine } from '../engine/CortexEngine';
import type { CortexNode, NodeId, Progress } from '../engine/types';
import { getEngine } from '../platform/db';

export const useEngine = (): CortexEngine => getEngine();

/** Re-renders only when this node (or its child list) changes. */
export function useNode(id: NodeId | null | undefined): CortexNode | undefined {
  const e = getEngine();
  const sub = useCallback((fn: () => void) => (id ? e.subscribe(id, fn) : () => {}), [e, id]);
  return useSyncExternalStore(sub, () => e.get(id));
}

export function useChildren(parentId: NodeId | null): readonly NodeId[] {
  const e = getEngine();
  const ch = parentId ?? CortexEngine.ROOT_CHANNEL;
  const sub = useCallback((fn: () => void) => e.subscribe(ch, fn), [e, ch]);
  return useSyncExternalStore(sub, () => e.children(parentId));
}

const progressCache = new Map<NodeId, Progress>();
export function useProgress(id: NodeId): Progress {
  const e = getEngine();
  const sub = useCallback((fn: () => void) => e.subscribe(id, fn), [e, id]);
  return useSyncExternalStore(sub, () => {
    const p = e.progress(id);
    const prev = progressCache.get(id);
    if (prev && prev.done === p.done && prev.total === p.total) return prev;
    progressCache.set(id, p);
    return p;
  });
}

/**
 * Coarse global version — for derived views (pinned, search, graph, queue).
 * Frozen while the screen is covered by another: hidden screens do zero work,
 * and catch up in one render when they surface again.
 */
export function useVersion(): number {
  const e = getEngine();
  const visible = useSceneDepth() === 0;
  const frozen = useRef(e.version);
  if (visible) frozen.current = e.version;
  const sub = useCallback((fn: () => void) => (visible ? e.subscribeAll(fn) : () => {}), [e, visible]);
  return useSyncExternalStore(sub, () => (visible ? e.version : frozen.current));
}
