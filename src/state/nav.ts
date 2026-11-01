import { create } from 'zustand';
import type { NodeId } from '../engine/types';

export type Route =
  | { name: 'home' }
  | { name: 'node'; id: NodeId }
  | { name: 'graph'; focus?: NodeId }
  | { name: 'observer'; id: NodeId }
  | { name: 'autopilot'; scope: NodeId | null; startId?: NodeId }
  | { name: 'settings' }
  | { name: 'trash' };

export type Keyed = Route & { key: string };

export interface Toast {
  key: number;
  text: string;
  undo: boolean;
}

interface NavState {
  stack: Keyed[];
  palette: null | { mode: 'search' } | { mode: 'move'; id: NodeId };
  toast: Toast | null;
  push: (r: Route) => void;
  pop: () => void;
  replace: (r: Route) => void;
  reset: (r: Route[]) => void;
  openPalette: (p: NavState['palette']) => void;
  showToast: (text: string, undo?: boolean) => void;
  hideToast: () => void;
}

let seq = 0;
const k = (r: Route): Keyed => ({ ...r, key: r.name + ':' + ++seq });

export const useNav = create<NavState>((set) => ({
  stack: [k({ name: 'home' })],
  palette: null,
  toast: null,
  push: (r) => set((s) => ({ stack: [...s.stack, k(r)] })),
  pop: () => set((s) => (s.stack.length > 1 ? { stack: s.stack.slice(0, -1) } : s)),
  replace: (r) => set((s) => ({ stack: [...s.stack.slice(0, -1), k(r)] })),
  reset: (rs) => set({ stack: rs.map(k) }),
  openPalette: (palette) => set({ palette }),
  showToast: (text, undo = true) => set({ toast: { key: ++seq, text, undo } }),
  hideToast: () => set({ toast: null }),
}));

export const nav = () => useNav.getState();
