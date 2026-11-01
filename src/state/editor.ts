import { create } from 'zustand';
import type { NodeId } from '../engine/types';

export type FieldKind = 'title' | 'body' | 'line' | 'cell' | 'action';

export interface FocusedField {
  kind: FieldKind;
  /** Node being edited (for title/body: the page; for line: the line node). */
  id: NodeId;
  /** Insert text at the caret (used by "& Bağla" and link suggestions). */
  insert: (text: string) => void;
  /** Replace the unfinished `&query` before the caret with a full `&Title&`. */
  completeLink: (title: string) => void;
}

interface EditorState {
  focused: FocusedField | null;
  /** Unfinished `&query` in the focused field, if any. */
  linkQuery: string | null;
  /** A row that should take focus as soon as it mounts / re-renders. */
  pending: { id: NodeId; kind: FieldKind } | null;
  /** Visible line order on the current page — for "focus previous line". */
  order: NodeId[];
  /** The page being edited: lines directly under it cannot be outdented further. */
  page: NodeId | null;
  /** The “Aa” formatting panel above the keyboard. */
  panel: boolean;
  setPage: (id: NodeId | null) => void;
  setPanel: (open: boolean) => void;
  setFocused: (f: FocusedField | null) => void;
  setLinkQuery: (q: string | null) => void;
  requestFocus: (id: NodeId, kind?: FieldKind) => void;
  takePending: (id: NodeId, kind: FieldKind) => boolean;
  setOrder: (o: NodeId[]) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  focused: null,
  linkQuery: null,
  pending: null,
  order: [],
  page: null,
  panel: false,
  setPage: (page) => set({ page }),
  setPanel: (panel) => set({ panel }),
  setFocused: (focused) => set(focused ? { focused } : { focused: null, linkQuery: null, panel: false }),
  setLinkQuery: (linkQuery) => set({ linkQuery }),
  requestFocus: (id, kind = 'line') => set({ pending: { id, kind } }),
  takePending: (id, kind) => {
    const p = get().pending;
    if (p && p.id === id && p.kind === kind) {
      set({ pending: null });
      return true;
    }
    return false;
  },
  setOrder: (order) => set({ order }),
}));

export const editor = () => useEditor.getState();
