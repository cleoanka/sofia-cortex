/**
 * Sofia Cortex — the universal fractal node.
 *
 * There are no folders, notes, tasks or subtasks. There is only CortexNode.
 * Identity is fluid: a node becomes a task by flipping `isTask`, a page by
 * zooming into it, a folder by giving it children. Depth is unbounded.
 */

export type NodeId = string;

export type NodeRole = 'inbox' | null;

export interface CortexNode {
  id: NodeId;
  /** null → lives on the Home surface (top level). */
  parentId: NodeId | null;
  /** Fractional index among siblings. */
  sort: number;
  title: string;
  body: string;

  isTask: boolean;
  done: boolean;
  doneAt: number | null;

  /** Surfaced on Home as a first-class portal without leaving its place in the tree. */
  pinned: boolean;
  pinOrder: number;

  /** Plan Seal: structure frozen until every task inside is executed. */
  sealed: boolean;
  collapsed: boolean;

  /** Observer mode "steep": locked until this epoch ms, then re-opened as a case file. */
  steepUntil: number | null;
  /** Chrono-trigger. */
  reminderAt: number | null;
  /** Autopilot hook — the literal first move the user leaves for their future self. */
  reminderHook: string | null;
  reminderId: string | null;

  role: NodeRole;
  createdAt: number;
  updatedAt: number;
  /** Soft delete (trash). Set on the deleted subtree root and every descendant. */
  deletedAt: number | null;
}

export interface Progress {
  /** Direct task children that are done. */
  done: number;
  /** Direct task children (live). */
  total: number;
}

export type LinkKind = 'wiki' | 'mention' | 'tag';

export interface Link {
  src: NodeId;
  /** Normalised target key: lower-cased title for wiki/mention, `#tag` for tags. */
  key: string;
  kind: LinkKind;
}

export interface Backlink {
  src: NodeId;
  kind: LinkKind;
  /** ~80 chars of the source body around the reference. */
  snippet: string;
}

export interface SearchHit {
  id: NodeId;
  title: string;
  /** Snippet with \u0001 … \u0002 marking matched spans. */
  snippet: string;
}

/** Minimal synchronous SQL surface — expo-sqlite on device, bun:sqlite in tests. */
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: readonly unknown[]): void;
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): T[];
  transaction(fn: () => void): void;
}

/** Future seam: a local or cloud model can be plugged in through one adapter. */
export interface CortexAIProvider {
  readonly name: string;
  /** Suggest atomic next steps for a node. Must be side-effect free. */
  suggestSteps?(node: CortexNode, context: CortexNode[]): Promise<string[]>;
  /** Re-voice a note as a neutral third-person case summary. */
  reframe?(text: string): Promise<string>;
}
