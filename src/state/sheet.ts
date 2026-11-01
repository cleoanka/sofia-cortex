import { create } from 'zustand';
import type { NodeId } from '../engine/types';

export type Sheet = { kind: 'reminder'; id: NodeId } | { kind: 'capture' } | null;

/** Inline drawers that rise over any screen. Never a hidden menu. */
export const useSheet = create<{ sheet: Sheet; open: (s: Sheet) => void; close: () => void }>((set) => ({
  sheet: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
}));
