import { mapCells, parseTable, serializeTable } from './table';
import { ANCESTORS_CTE, SUBTREE_CTE, UPSERT_SQL, migrate, nodeParams, rowToNode, type NodeRow } from './schema';
import { extractLinks, migrateLegacySyntax, renameRefs, snippetAround, titleKey, unlinkRefs } from './links';
import type { Backlink, CortexNode, Fmt, LinkKind, NodeId, Progress, SearchHit, SqlDriver } from './types';

type Listener = () => void;
type GlobalListener = (changed: ReadonlySet<NodeId>) => void;

interface UndoEntry {
  label: string;
  at: number;
  before: Map<NodeId, CortexNode | undefined>;
  after: Map<NodeId, CortexNode | undefined>;
}

export interface CreateInput {
  title?: string;
  body?: string;
  isTask?: boolean;
  /** Insert at this sibling index; defaults to the end. */
  index?: number;
  role?: CortexNode['role'];
  fmt?: Fmt | null;
}

/** A formatting change; `null`/`undefined`/`false` clears a key. */
export type FmtPatch = { [K in keyof Fmt]?: Fmt[K] | null };

/** Drop cleared keys; an empty object becomes undefined. */
function compact<T extends object>(o: { [K in keyof T]?: T[K] | null }): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false)) as T;
  return Object.keys(out).length ? out : undefined;
}

export interface ToggleResult {
  done: boolean;
  /** Ancestors whose state flipped because of this toggle, nearest first. */
  cascaded: NodeId[];
}

export class SealedError extends Error {
  constructor(readonly sealId: NodeId) {
    super('Plan is sealed');
  }
}

const ROOT = '\u0000root';
const UNDO_LIMIT = 120;

/** Time-sortable, collision-resistant id. */
export function newId(): NodeId {
  const t = Date.now().toString(36).padStart(9, '0');
  let r = '';
  for (let i = 0; i < 8; i++) r += ((Math.random() * 36) | 0).toString(36);
  return t + r;
}

/**
 * The fractal engine. SQLite (WAL) is the source of truth on disk; an in-memory
 * mirror with incremental indexes answers every UI read synchronously, so no
 * frame ever waits on I/O. Every mutation runs inside `transact`, which
 * snapshots before/after states — undo/redo is just re-applying a snapshot.
 */
export class CortexEngine {
  private nodes = new Map<NodeId, CortexNode>();
  private kids = new Map<string, NodeId[]>();
  private titles = new Map<string, Set<NodeId>>();
  private outLinks = new Map<NodeId, { key: string; kind: LinkKind }[]>();
  private inLinks = new Map<string, Set<NodeId>>();

  private tx: Map<NodeId, CortexNode | undefined> | null = null;
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];

  private listeners = new Map<NodeId, Set<Listener>>();
  private globals = new Set<GlobalListener>();
  private _version = 0;

  constructor(
    private db: SqlDriver,
    private clock: () => number = Date.now,
    private makeId: () => NodeId = newId,
  ) {
    migrate(db);
    this.load();
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  private load(): void {
    this.nodes.clear();
    this.kids.clear();
    this.titles.clear();
    this.outLinks.clear();
    this.inLinks.clear();
    const rows = this.db.all<NodeRow>('SELECT * FROM nodes');
    for (const r of rows) this.nodes.set(r.id, rowToNode(r));
    // Bulk index build: one sort per sibling list instead of N sorted inserts.
    for (const n of this.nodes.values()) {
      if (n.deletedAt != null) continue;
      const k = n.parentId ?? ROOT;
      let list = this.kids.get(k);
      if (!list) this.kids.set(k, (list = []));
      list.push(n.id);
      this.indexTitle(n.id, undefined, n);
      this.indexLinks(n.id, undefined, n);
    }
    for (const list of this.kids.values()) list.sort((a, b) => this.nodes.get(a)!.sort - this.nodes.get(b)!.sort);
  }

  get version(): number {
    return this._version;
  }

  get size(): number {
    return this.nodes.size;
  }

  // ───────────────────────────── subscriptions ─────────────────────────────

  subscribe(id: NodeId, fn: Listener): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(id);
    };
  }

  subscribeAll(fn: GlobalListener): () => void {
    this.globals.add(fn);
    return () => this.globals.delete(fn);
  }

  private emit(changed: Set<NodeId>, before: Map<NodeId, CortexNode | undefined>): void {
    this._version++;
    const touched = new Set<NodeId>(changed);
    // Parents (old and new) own the child list + progress ring of a changed node.
    for (const id of changed) {
      const now = this.nodes.get(id);
      const was = before.get(id);
      if (now?.parentId) touched.add(now.parentId);
      if (was?.parentId) touched.add(was.parentId);
    }
    touched.add(ROOT);
    for (const id of touched) this.listeners.get(id)?.forEach((fn) => fn());
    for (const fn of this.globals) fn(changed);
  }

  /** Channel for the Home top-level list. */
  static readonly ROOT_CHANNEL = ROOT;

  // ───────────────────────────── transactions ─────────────────────────────

  transact<T>(label: string, fn: () => T, opts: { history?: boolean } = {}): T {
    if (this.tx) return fn();
    this.tx = new Map();
    let result: T;
    try {
      result = fn();
    } catch (e) {
      const snap = this.tx;
      this.tx = null;
      for (const [id, prev] of snap) this.apply(id, prev);
      throw e;
    }
    const before = this.tx;
    this.tx = null;
    if (before.size === 0) return result;
    const after = new Map<NodeId, CortexNode | undefined>();
    for (const id of before.keys()) after.set(id, this.nodes.get(id));
    // No-op writes (same state) are dropped from history.
    for (const [id, prev] of before) if (sameNode(prev, after.get(id))) (before.delete(id), after.delete(id));
    if (before.size === 0) return result;
    this.persist(before.keys());
    // System bookkeeping (timers expiring, notification ids) never enters the user's history.
    if (opts.history === false) {
      this.emit(new Set(before.keys()), before);
      return result;
    }
    const top = this.undoStack.at(-1);
    const t = this.clock();
    // Typing is one thought, not a hundred: consecutive edits to the same node coalesce.
    if (label === 'Düzenle' && top && top.label === label && t - top.at < 4000 && sameKeys(top.after, after) && this.redoStack.length === 0) {
      top.after = after;
      top.at = t;
      this.emit(new Set(before.keys()), before);
      return result;
    }
    this.undoStack.push({ label, before, after, at: t });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.emit(new Set(before.keys()), before);
    return result;
  }

  private put(n: CortexNode): void {
    if (!this.tx) throw new Error('put outside transaction');
    if (!this.tx.has(n.id)) this.tx.set(n.id, this.nodes.get(n.id));
    this.apply(n.id, n);
  }

  private hardRemove(id: NodeId): void {
    if (!this.tx) throw new Error('remove outside transaction');
    if (!this.tx.has(id)) this.tx.set(id, this.nodes.get(id));
    this.apply(id, undefined);
  }

  /** Single choke point that keeps every index coherent. */
  private apply(id: NodeId, next: CortexNode | undefined): void {
    const prev = this.nodes.get(id);
    const prevLive = prev && prev.deletedAt == null ? prev : undefined;
    const nextLive = next && next.deletedAt == null ? next : undefined;

    if (next) this.nodes.set(id, next);
    else this.nodes.delete(id);

    const prevKey = prevLive ? (prevLive.parentId ?? ROOT) : null;
    const nextKey = nextLive ? (nextLive.parentId ?? ROOT) : null;
    if (prevKey !== null && (prevKey !== nextKey || prevLive!.sort !== nextLive!.sort)) {
      const list = this.kids.get(prevKey);
      if (list) {
        const i = list.indexOf(id);
        // Copy-on-write: list identity changes exactly when its contents do.
        if (i >= 0) this.kids.set(prevKey, list.slice(0, i).concat(list.slice(i + 1)));
      }
    }
    if (nextKey !== null && (prevKey !== nextKey || prevLive!.sort !== nextLive!.sort)) {
      const list = (this.kids.get(nextKey) ?? []).slice();
      // Binary insert by sort.
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.nodes.get(list[mid])!.sort <= nextLive!.sort) lo = mid + 1;
        else hi = mid;
      }
      list.splice(lo, 0, id);
      this.kids.set(nextKey, list);
    }
    this.indexTitle(id, prevLive, nextLive);
    this.indexLinks(id, prevLive, nextLive);
  }

  private indexTitle(id: NodeId, prev: CortexNode | undefined, next: CortexNode | undefined): void {
    const a = prev ? titleKey(prev.title) : null;
    const b = next ? titleKey(next.title) : null;
    if (a === b) return;
    if (a !== null) {
      const s = this.titles.get(a);
      s?.delete(id);
      if (s && s.size === 0) this.titles.delete(a);
    }
    if (b) {
      let s = this.titles.get(b);
      if (!s) this.titles.set(b, (s = new Set()));
      s.add(id);
    }
  }

  private indexLinks(id: NodeId, prev: CortexNode | undefined, next: CortexNode | undefined): void {
    if (prev && next && prev.body === next.body) return;
    for (const l of this.outLinks.get(id) ?? []) {
      const s = this.inLinks.get(l.key);
      s?.delete(id);
      if (s && s.size === 0) this.inLinks.delete(l.key);
    }
    this.outLinks.delete(id);
    if (!next) return;
    const links = extractLinks(next.body);
    if (links.length === 0) return;
    this.outLinks.set(id, links);
    for (const l of links) {
      let s = this.inLinks.get(l.key);
      if (!s) this.inLinks.set(l.key, (s = new Set()));
      s.add(id);
    }
  }

  private persist(ids: Iterable<NodeId>): void {
    const list = [...ids];
    this.db.transaction(() => {
      for (const id of list) {
        const n = this.nodes.get(id);
        this.db.run('DELETE FROM links WHERE src = ?', [id]);
        if (!n) {
          this.db.run('DELETE FROM nodes WHERE id = ?', [id]);
          continue;
        }
        this.db.run(UPSERT_SQL, nodeParams(n));
        if (n.deletedAt == null) {
          for (const l of this.outLinks.get(id) ?? []) {
            this.db.run('INSERT OR IGNORE INTO links(src, key, kind) VALUES (?,?,?)', [id, l.key, l.kind]);
          }
        }
      }
    });
  }

  // ───────────────────────────── history ─────────────────────────────

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  clearHistory(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  undo(): string | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.restoreSnapshot(e.before, e.after);
    this.redoStack.push(e);
    return e.label;
  }

  redo(): string | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.restoreSnapshot(e.after, e.before);
    this.undoStack.push(e);
    return e.label;
  }

  private restoreSnapshot(target: Map<NodeId, CortexNode | undefined>, current: Map<NodeId, CortexNode | undefined>): void {
    // Removals first so re-inserted parents exist before children are re-attached.
    for (const [id, n] of target) if (!n) this.apply(id, undefined);
    for (const [id, n] of target) if (n) this.apply(id, n);
    this.persist(target.keys());
    this.emit(new Set(target.keys()), current);
  }

  // ───────────────────────────── reads ─────────────────────────────

  get(id: NodeId | null | undefined): CortexNode | undefined {
    return id ? this.nodes.get(id) : undefined;
  }

  /** Live children in order. Returns a stable array reference until the list changes. */
  children(parentId: NodeId | null): readonly NodeId[] {
    return this.kids.get(parentId ?? ROOT) ?? EMPTY;
  }

  hasChildren(id: NodeId): boolean {
    return (this.kids.get(id)?.length ?? 0) > 0;
  }

  /**
   * A task line that was opened but never written — the empty `◯ Görev` waiting
   * at the bottom of a page. It is a placeholder, not work: it never counts in
   * progress, never drives propagation and never enters the Autopilot queue.
   */
  isDraft(id: NodeId): boolean {
    const n = this.nodes.get(id);
    return !!n && n.isTask && n.role !== 'table' && !n.title.trim() && !n.body.trim() && (this.kids.get(id) ?? EMPTY).every((c) => this.isDraft(c));
  }

  /** A task that counts: real tasks, never drafts. */
  private isWork(id: NodeId): boolean {
    return this.nodes.get(id)!.isTask && !this.isDraft(id);
  }

  progress(id: NodeId): Progress {
    let done = 0;
    let total = 0;
    for (const c of this.kids.get(id) ?? EMPTY) {
      const n = this.nodes.get(c)!;
      if (!this.isWork(c)) continue;
      total++;
      if (n.done) done++;
    }
    return { done, total };
  }

  /** When anything in this subtree last changed — what “edited” means for a note. */
  touchedAt(id: NodeId): number {
    let t = this.nodes.get(id)?.updatedAt ?? 0;
    const stack = [...(this.kids.get(id) ?? EMPTY)];
    while (stack.length) {
      const c = stack.pop()!;
      t = Math.max(t, this.nodes.get(c)!.updatedAt);
      const k = this.kids.get(c);
      if (k) stack.push(...k);
    }
    return t;
  }

  /** Deep progress across the whole subtree (leaf tasks only). */
  deepProgress(id: NodeId): Progress {
    let done = 0;
    let total = 0;
    const stack = [...(this.kids.get(id) ?? EMPTY)];
    while (stack.length) {
      const c = stack.pop()!;
      const n = this.nodes.get(c)!;
      const k = this.kids.get(c);
      const hasTaskKids = k?.some((x) => this.isWork(x)) ?? false;
      if (this.isWork(c) && !hasTaskKids) {
        total++;
        if (n.done) done++;
      }
      if (k) stack.push(...k);
    }
    return { done, total };
  }

  /** Root → node (inclusive). */
  path(id: NodeId): CortexNode[] {
    const out: CortexNode[] = [];
    let cur = this.nodes.get(id);
    const guard = new Set<NodeId>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      out.push(cur);
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return out.reverse();
  }

  depth(id: NodeId): number {
    return this.path(id).length - 1;
  }

  isDescendant(id: NodeId, ancestorId: NodeId): boolean {
    let cur = this.nodes.get(id);
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = this.nodes.get(cur.parentId);
    }
    return false;
  }

  pinned(): CortexNode[] {
    const out: CortexNode[] = [];
    for (const n of this.nodes.values()) if (n.pinned && n.deletedAt == null) out.push(n);
    return out.sort((a, b) => a.pinOrder - b.pinOrder);
  }

  inbox(): CortexNode | undefined {
    for (const n of this.nodes.values()) if (n.role === 'inbox' && n.deletedAt == null) return n;
    return undefined;
  }

  /** Resolve a link key to the earliest-created live node with that title. */
  resolve(key: string): CortexNode | undefined {
    const ids = this.titles.get(key);
    if (!ids) return undefined;
    let best: CortexNode | undefined;
    for (const id of ids) {
      const n = this.nodes.get(id)!;
      if (!best || n.createdAt < best.createdAt) best = n;
    }
    return best;
  }

  backlinks(id: NodeId): Backlink[] {
    const n = this.nodes.get(id);
    if (!n) return [];
    const key = titleKey(n.title);
    const srcs = this.inLinks.get(key);
    if (!srcs) return [];
    const out: Backlink[] = [];
    for (const src of srcs) {
      if (src === id) continue;
      const s = this.nodes.get(src)!;
      const kind = this.outLinks.get(src)!.find((l) => l.key === key)!.kind;
      out.push({ src, kind, snippet: snippetAround(s.body, key) });
    }
    return out.sort((a, b) => this.nodes.get(b.src)!.updatedAt - this.nodes.get(a.src)!.updatedAt);
  }

  outgoing(id: NodeId): { key: string; kind: LinkKind; target?: CortexNode }[] {
    return (this.outLinks.get(id) ?? []).map((l) => ({ ...l, target: this.resolve(l.key) }));
  }

  /** Notes that mention `&tag&` (any reference key, resolved or not). */
  tagged(tag: string): NodeId[] {
    return [...(this.inLinks.get(titleKey(tag.replace(/^[&#]|&$/g, ''))) ?? [])];
  }

  /** References that no note answers to — they behave as tags. */
  allTags(): { tag: string; count: number }[] {
    const out: { tag: string; count: number }[] = [];
    for (const [k, s] of this.inLinks) if (!this.titles.get(k)?.size) out.push({ tag: k, count: s.size });
    return out.sort((a, b) => b.count - a.count);
  }

  /** Title completions for `[[` — prefix matches first, then substring. */
  suggestTitles(query: string, limit = 6, exclude?: NodeId): CortexNode[] {
    const q = titleKey(query);
    const pre: CortexNode[] = [];
    const mid: CortexNode[] = [];
    for (const [key, ids] of this.titles) {
      const at = q ? key.indexOf(q) : 0;
      if (at < 0) continue;
      for (const id of ids) {
        if (id === exclude) continue;
        (at === 0 ? pre : mid).push(this.nodes.get(id)!);
      }
    }
    const byRecent = (a: CortexNode, b: CortexNode) => b.updatedAt - a.updatedAt;
    return [...pre.sort(byRecent), ...mid.sort(byRecent)].slice(0, limit);
  }

  /** FTS5 full-text search with prefix matching on every token. */
  search(query: string, limit = 24): SearchHit[] {
    const tokens = query
      .toLocaleLowerCase('tr-TR')
      .split(/[^\p{L}\p{N}_]+/u)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '')}"*`);
    if (tokens.length === 0) return [];
    const rows = this.db.all<{ id: string; title: string; snip: string }>(
      `SELECT n.id, n.title, snippet(nodes_fts, -1, char(1), char(2), '…', 12) AS snip
         FROM nodes_fts JOIN nodes n ON n.rowid = nodes_fts.rowid
        WHERE nodes_fts MATCH ? AND n.deleted_at IS NULL
        ORDER BY bm25(nodes_fts, 4.0, 1.0)
        LIMIT ?`,
      [tokens.join(' '), limit],
    );
    return rows.map((r) => ({ id: r.id, title: r.title, snippet: r.snip }));
  }

  /** Descendant ids (inclusive) via recursive CTE — canonical for export/purge. */
  subtreeSql(id: NodeId): { id: NodeId; depth: number }[] {
    return this.db.all(`${SUBTREE_CTE} SELECT id, depth FROM sub ORDER BY depth`, [id]);
  }

  ancestorsSql(id: NodeId): NodeId[] {
    return this.db.all<{ id: string }>(`${ANCESTORS_CTE} SELECT id FROM anc ORDER BY depth DESC`, [id]).map((r) => r.id);
  }

  /** Live subtree ids in document order (inclusive). */
  subtree(id: NodeId): NodeId[] {
    const out: NodeId[] = [];
    const walk = (x: NodeId) => {
      out.push(x);
      for (const c of this.kids.get(x) ?? EMPTY) walk(c);
    };
    walk(id);
    return out;
  }

  /** Every live node in document order. */
  allLive(): CortexNode[] {
    const out: CortexNode[] = [];
    const walk = (k: string) => {
      for (const c of this.kids.get(k) ?? EMPTY) {
        out.push(this.nodes.get(c)!);
        walk(c);
      }
    };
    walk(ROOT);
    return out;
  }

  trash(): CortexNode[] {
    const out: CortexNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.deletedAt == null) continue;
      const p = n.parentId ? this.nodes.get(n.parentId) : undefined;
      if (!p || p.deletedAt == null || p.deletedAt !== n.deletedAt) out.push(n);
    }
    return out.sort((a, b) => b.deletedAt! - a.deletedAt!);
  }

  /** The nearest sealed node on the path, if its plan is still unfinished. */
  activeSeal(id: NodeId | null): CortexNode | undefined {
    let cur = id ? this.nodes.get(id) : undefined;
    while (cur) {
      if (cur.sealed && this.hasOpenTasks(cur.id)) return cur;
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return undefined;
  }

  isLocked(id: NodeId | null): boolean {
    return this.activeSeal(id) !== undefined;
  }

  private hasOpenTasks(id: NodeId): boolean {
    const stack = [...(this.kids.get(id) ?? EMPTY)];
    while (stack.length) {
      const c = stack.pop()!;
      const n = this.nodes.get(c)!;
      if (n.isTask && !n.done && !this.isDraft(c)) return true;
      const k = this.kids.get(c);
      if (k) stack.push(...k);
    }
    return false;
  }

  private assertUnlocked(...ids: (NodeId | null)[]): void {
    for (const id of ids) {
      const s = this.activeSeal(id);
      if (s) throw new SealedError(s.id);
    }
  }

  /**
   * Autopilot queue: the atomic next actions — open tasks with no open task
   * children — in document order. Pinned surfaces go first (they are what the
   * user declared important), then the rest of the tree.
   */
  nextActions(scopeId: NodeId | null = null, limit = Infinity): NodeId[] {
    const out: NodeId[] = [];
    const seen = new Set<NodeId>();
    const visit = (id: NodeId): void => {
      if (out.length >= limit || seen.has(id)) return;
      seen.add(id);
      const n = this.nodes.get(id)!;
      if ((n.isTask && n.done) || this.isDraft(id)) return;
      const k = this.kids.get(id) ?? EMPTY;
      const openTaskKids = k.some((c) => {
        const x = this.nodes.get(c)!;
        return x.isTask && !x.done && !this.isDraft(c);
      });
      if (n.isTask && !openTaskKids) {
        if (n.steepUntil == null || n.steepUntil <= this.clock()) out.push(id);
        return;
      }
      for (const c of k) visit(c);
    };
    if (scopeId) {
      visit(scopeId);
      return out;
    }
    for (const p of this.pinned()) visit(p.id);
    // Unprocessed captures come last: planned work first, the inbox after.
    const roots = this.kids.get(ROOT) ?? EMPTY;
    for (const c of roots) if (this.nodes.get(c)!.role !== 'inbox') visit(c);
    for (const c of roots) visit(c);
    return out;
  }

  // ───────────────────────────── writes ─────────────────────────────

  private sortAt(parentId: NodeId | null, index: number, excluding?: NodeId): number {
    const list = (this.kids.get(parentId ?? ROOT) ?? EMPTY).filter((x) => x !== excluding);
    const i = Math.max(0, Math.min(index, list.length));
    const before = i > 0 ? this.nodes.get(list[i - 1])!.sort : null;
    const after = i < list.length ? this.nodes.get(list[i])!.sort : null;
    if (before === null && after === null) return 1;
    if (before === null) return after! - 1;
    if (after === null) return before + 1;
    const mid = (before + after) / 2;
    if (mid === before || mid === after || after - before < 1e-9) {
      this.renumber(parentId, list);
      return this.sortAt(parentId, index, excluding);
    }
    return mid;
  }

  private renumber(parentId: NodeId | null, list: readonly NodeId[]): void {
    list.forEach((id, i) => {
      const n = this.nodes.get(id)!;
      this.put({ ...n, sort: i + 1 });
    });
    void parentId;
  }

  create(parentId: NodeId | null, input: CreateInput = {}, opts: { force?: boolean } = {}): NodeId {
    return this.transact('Oluştur', () => {
      if (!opts.force) this.assertUnlocked(parentId);
      if (parentId && !this.nodes.get(parentId)) throw new Error('Unknown parent');
      const t = this.clock();
      const id = this.makeId();
      const count = this.children(parentId).length;
      const node: CortexNode = {
        id,
        parentId,
        sort: this.sortAt(parentId, input.index ?? count),
        title: input.title ?? '',
        body: input.body ?? '',
        isTask: input.isTask ?? false,
        done: false,
        doneAt: null,
        pinned: false,
        pinOrder: 0,
        sealed: false,
        collapsed: false,
        steepUntil: null,
        reminderAt: null,
        reminderHook: null,
        reminderId: null,
        role: input.role ?? null,
        fmt: input.fmt && Object.keys(input.fmt).length ? input.fmt : null,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      };
      this.put(node);
      if (node.isTask) this.propagate(parentId);
      return id;
    });
  }

  update(
    id: NodeId,
    patch: Partial<Pick<CortexNode, 'title' | 'body' | 'collapsed' | 'steepUntil' | 'reminderAt' | 'reminderHook' | 'reminderId'>>,
    opts: { history?: boolean } = {},
  ): void {
    this.transact(
      'Düzenle',
      () => {
        const n = this.must(id);
        const next = { ...n, ...patch, updatedAt: this.clock() };
        if (patch.title !== undefined && titleKey(patch.title) !== titleKey(n.title) && n.title.trim()) {
          const oldKey = titleKey(n.title);
          const others = [...(this.titles.get(oldKey) ?? [])].filter((x) => x !== id);
          // Only rewrite references when this node is their sole target.
          if (others.length === 0 && patch.title.trim()) {
            for (const src of [...(this.inLinks.get(oldKey) ?? [])]) {
              if (src === id) continue;
              const s = this.nodes.get(src)!;
              const rename = (x: string) => renameRefs(x, n.title, patch.title!.trim());
              const body = s.role === 'table' ? mapCells(s.body, rename) : rename(s.body);
              if (body !== s.body) this.put({ ...s, body, updatedAt: this.clock() });
            }
          }
        }
        const wasDraft = this.isDraft(id);
        this.put(next);
        // Writing the first word into a draft task makes it count (and vice versa).
        if (n.isTask && wasDraft !== this.isDraft(id)) this.propagate(n.parentId);
      },
      opts,
    );
  }

  setTask(id: NodeId, isTask: boolean): void {
    this.transact(isTask ? 'Göreve çevir' : 'Nota çevir', () => {
      const n = this.must(id);
      // Turning a task into a note would silently dissolve a seal — that is re-planning.
      if (n.isTask && !isTask) this.assertUnlocked(n.parentId, id);
      const p = this.progress(id);
      const done = isTask && p.total > 0 ? p.done === p.total : isTask ? n.done : false;
      this.put({ ...n, isTask, done, doneAt: done ? (n.doneAt ?? this.clock()) : null, updatedAt: this.clock() });
      this.propagate(n.parentId);
    });
  }

  /**
   * Formatting is how a line reads, not what the plan is — so it is allowed
   * inside a locked plan. `target: 'body'` formats the page's body block.
   * A key set to `undefined` (or `null`) returns to the default.
   */
  setFmt(id: NodeId, patch: FmtPatch | null, target: 'line' | 'body' = 'line'): void {
    this.transact('Biçim', () => {
      const n = this.must(id);
      const cur: Fmt = { ...(n.fmt ?? {}) };
      let next: Fmt | undefined;
      if (target === 'body') next = compact({ ...cur, bd: patch === null ? undefined : compact({ ...(cur.bd ?? {}), ...patch }) });
      else next = compact(patch === null ? { bd: cur.bd } : { ...cur, ...patch });
      this.put({ ...n, fmt: next ?? null, updatedAt: this.clock() });
    });
  }

  /** A 2×2 table right after `index` (or at the end). */
  createTable(parentId: NodeId, index?: number): NodeId {
    return this.create(parentId, { role: 'table', body: serializeTable(parseTable('')), index });
  }

  /**
   * Check / uncheck. A parent with task children drives its whole subtree;
   * afterwards the change ripples bottom-up so ancestors auto-complete or
   * gracefully re-open.
   */
  toggle(id: NodeId, value?: boolean): ToggleResult {
    return this.transact('İşaretle', () => {
      const n = this.must(id);
      const target = value ?? !n.done;
      const t = this.clock();
      if (!n.isTask) this.put({ ...n, isTask: true, updatedAt: t });
      if (this.progress(id).total > 0) {
        for (const d of this.subtree(id)) {
          if (d === id) continue;
          const x = this.nodes.get(d)!;
          if (x.isTask && x.done !== target && !this.isDraft(d)) this.put({ ...x, done: target, doneAt: target ? t : null, updatedAt: t });
        }
      }
      const cur = this.nodes.get(id)!;
      this.put({ ...cur, done: target, doneAt: target ? t : null, updatedAt: t });
      return { done: target, cascaded: this.propagate(cur.parentId) };
    });
  }

  /** Bottom-up reactive propagation. Returns ancestors whose done flipped. */
  private propagate(parentId: NodeId | null): NodeId[] {
    const flipped: NodeId[] = [];
    let pid = parentId;
    const t = this.clock();
    while (pid) {
      const p = this.nodes.get(pid);
      if (!p || !p.isTask || p.deletedAt != null) break;
      const { done, total } = this.progress(pid);
      const should = done === total;
      // No flip here can still matter above: a draft that just gained (or lost) real
      // children starts (or stops) counting for its own parent. Walk on — O(depth).
      if (total > 0 && p.done !== should) {
        this.put({ ...p, done: should, doneAt: should ? t : null, updatedAt: t });
        flipped.push(pid);
      }
      pid = p.parentId;
    }
    return flipped;
  }

  move(id: NodeId, newParentId: NodeId | null, index?: number): void {
    this.transact('Taşı', () => {
      const n = this.must(id);
      if (newParentId === id || (newParentId && this.isDescendant(newParentId, id))) throw new Error('Cycle');
      if (newParentId && !this.nodes.get(newParentId)) throw new Error('Unknown parent');
      this.assertUnlocked(n.parentId, newParentId);
      const siblings = this.children(newParentId).filter((x) => x !== id);
      const sort = this.sortAt(newParentId, index ?? siblings.length, id);
      const cur = this.nodes.get(id)!;
      this.put({ ...cur, parentId: newParentId, sort, updatedAt: this.clock() });
      this.propagate(n.parentId);
      this.propagate(newParentId);
    });
  }

  /** Become the last child of the previous sibling. */
  indent(id: NodeId): boolean {
    const n = this.must(id);
    const sib = this.children(n.parentId);
    const i = sib.indexOf(id);
    if (i <= 0) return false;
    const target = sib[i - 1];
    if (this.nodes.get(target)!.role === 'table') return false; // a table holds cells, not lines
    this.transact('İçeri al', () => {
      this.move(id, target);
      const t = this.nodes.get(target)!;
      if (t.collapsed) this.put({ ...t, collapsed: false });
    });
    return true;
  }

  /** Become the sibling right after the current parent. */
  outdent(id: NodeId): boolean {
    const n = this.must(id);
    if (!n.parentId) return false;
    const parent = this.must(n.parentId);
    const idx = this.children(parent.parentId).indexOf(parent.id);
    this.transact('Dışarı al', () => this.move(id, parent.parentId, idx + 1));
    return true;
  }

  reorder(id: NodeId, index: number): void {
    const n = this.must(id);
    this.move(id, n.parentId, index);
  }

  /**
   * Delete for real: the node, its whole subtree and every reference to it in
   * other notes (`&Başlık&` becomes plain words). One undo step brings it all back;
   * nothing else ever can — a dead link never resurrects a deleted note.
   */
  remove(id: NodeId): void {
    this.transact('Sil', () => {
      const n = this.must(id);
      this.assertUnlocked(n.parentId);
      const ids = this.subtree(id);
      const gone = new Set(ids);
      const titles = ids.map((d) => this.nodes.get(d)!.title).filter((t) => t.trim());
      for (const d of [...ids].reverse()) this.hardRemove(d);
      for (const t of titles) {
        const key = titleKey(t);
        if (this.titles.get(key)?.size) continue; // another live note still answers to this name
        for (const src of [...(this.inLinks.get(key) ?? [])]) {
          if (gone.has(src)) continue;
          const s = this.nodes.get(src)!;
          const body = s.role === 'table' ? mapCells(s.body, (x) => unlinkRefs(x, t)) : unlinkRefs(s.body, t);
          if (body !== s.body) this.put({ ...s, body, updatedAt: this.clock() });
        }
      }
      this.propagate(n.parentId);
    });
  }

  /** Delete every note (undoable). */
  removeAll(): void {
    this.transact('Hepsini sil', () => {
      for (const id of [...this.nodes.keys()]) this.hardRemove(id);
    });
  }

  /** One-time conversion of `[[x]]`, `#tag`, `@x` bodies to `&x&`. Not part of history. */
  migrateSyntax(): number {
    let changed = 0;
    this.transact(
      'Sözdizimi',
      () => {
        for (const n of [...this.nodes.values()]) {
          const body = migrateLegacySyntax(n.body);
          if (body !== n.body) {
            this.put({ ...n, body });
            changed++;
          }
        }
      },
      { history: false },
    );
    return changed;
  }

  restore(id: NodeId): void {
    this.transact('Geri yükle', () => {
      const n = this.must(id);
      if (n.deletedAt == null) return;
      const stamp = n.deletedAt;
      const parentGone = n.parentId && (!this.nodes.get(n.parentId) || this.nodes.get(n.parentId)!.deletedAt != null);
      const all = [...this.nodes.values()];
      const restoreTree = (x: NodeId) => {
        const node = this.nodes.get(x)!;
        this.put({ ...node, deletedAt: null, parentId: x === id && parentGone ? null : node.parentId });
        for (const c of all) if (c.parentId === x && c.deletedAt === stamp) restoreTree(c.id);
      };
      restoreTree(id);
      this.propagate(this.nodes.get(id)!.parentId);
    });
  }

  /** Permanently remove trashed nodes older than `olderThanMs` (0 → all). */
  purgeTrash(olderThanMs = 0): number {
    const cutoff = this.clock() - olderThanMs;
    const victims = [...this.nodes.values()].filter((n) => n.deletedAt != null && n.deletedAt <= cutoff);
    if (victims.length === 0) return 0;
    this.transact('Çöpü boşalt', () => {
      for (const v of victims) this.hardRemove(v.id);
    });
    // Purge is not undoable by design.
    this.undoStack.pop();
    return victims.length;
  }

  setPinned(id: NodeId, pinned: boolean): void {
    this.transact(pinned ? 'Vitrine çıkar' : 'Vitrinden kaldır', () => {
      const n = this.must(id);
      const max = this.pinned().reduce((m, p) => Math.max(m, p.pinOrder), 0);
      this.put({ ...n, pinned, pinOrder: pinned ? max + 1 : 0, updatedAt: this.clock() });
    });
  }

  setSealed(id: NodeId, sealed: boolean): void {
    this.transact(sealed ? 'Planı mühürle' : 'Mührü kaldır', () => {
      const n = this.must(id);
      this.put({ ...n, sealed, updatedAt: this.clock() });
    });
  }

  setCollapsed(id: NodeId, collapsed: boolean): void {
    const n = this.must(id);
    if (n.collapsed === collapsed) return;
    this.transact(collapsed ? 'Katla' : 'Aç', () => this.put({ ...n, collapsed }));
  }

  /** Collapse / expand every node that has children inside a scope (pinch). */
  setCollapsedDeep(scopeId: NodeId | null, collapsed: boolean): void {
    this.transact(collapsed ? 'Tümünü katla' : 'Tümünü aç', () => {
      const roots = scopeId ? this.children(scopeId) : this.children(null);
      for (const r of roots)
        for (const id of this.subtree(r)) {
          const n = this.nodes.get(id)!;
          if (this.hasChildren(id) && n.collapsed !== collapsed) this.put({ ...n, collapsed });
        }
    });
  }

  /**
   * Micro-splitter: break a task that feels too big into two atomic steps.
   * Allowed inside a sealed plan — it is execution, not re-planning.
   */
  split(id: NodeId, first: string, second: string): [NodeId, NodeId] {
    return this.transact('İkiye böl', () => {
      const n = this.must(id);
      if (!n.isTask) this.put({ ...n, isTask: true });
      const a = this.create(id, { title: first.trim(), isTask: true }, { force: true });
      const b = this.create(id, { title: second.trim(), isTask: true }, { force: true });
      this.propagate(id);
      return [a, b];
    });
  }

  /** Observer mode's Action Protocol: each line becomes a checkable child. */
  addProtocol(id: NodeId, lines: string[]): NodeId[] {
    return this.transact('Eylem protokolü', () => {
      const clean = lines.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      const ids = clean.map((title) => this.create(id, { title, isTask: true }, { force: true }));
      this.propagate(id);
      return ids;
    });
  }

  /** Quick Capture: zero decisions, straight into the inbox. */
  capture(text: string): NodeId {
    return this.transact('Yakala', () => {
      const inbox = this.inbox() ?? this.nodes.get(this.create(null, { title: 'Gelen Kutusu', role: 'inbox' }))!;
      const isTask = /^\s*(?:\[\s?\]|-\s\[\s?\]|>|☐)\s*/.test(text);
      const title = text.replace(/^\s*(?:\[\s?\]|-\s\[\s?\]|>|☐)\s*/, '').trim();
      return this.create(inbox.id, { title, isTask, index: 0 }, { force: true });
    });
  }

  private must(id: NodeId): CortexNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`Unknown node ${id}`);
    return n;
  }

  // ───────────────────────────── graph ─────────────────────────────

  /**
   * Graph projection: tree edges + resolved wiki/mention edges + tag hubs.
   * `focus` limits to the 1st/2nd-degree neighbourhood (local lens).
   */
  graph(focus?: { id: NodeId; depth: number }): { ids: string[]; edges: { a: number; b: number; w: number }[]; tags: Set<string> } {
    const adj = new Map<string, Map<string, number>>();
    const link = (a: string, b: string, w: number) => {
      if (a === b) return;
      let m = adj.get(a);
      if (!m) adj.set(a, (m = new Map()));
      m.set(b, Math.max(m.get(b) ?? 0, w));
      let r = adj.get(b);
      if (!r) adj.set(b, (r = new Map()));
      r.set(a, Math.max(r.get(a) ?? 0, w));
    };
    const tags = new Set<string>();
    const live = this.allLive();
    for (const n of live) {
      if (!adj.has(n.id)) adj.set(n.id, new Map());
      if (n.parentId) link(n.parentId, n.id, 1);
      for (const l of this.outLinks.get(n.id) ?? []) {
        const t = this.resolve(l.key);
        if (t) link(n.id, t.id, 0.8);
        else {
          tags.add('#' + l.key);
          link(n.id, '#' + l.key, 0.6);
        }
      }
    }
    let keep: Set<string>;
    if (focus && adj.has(focus.id)) {
      keep = new Set([focus.id]);
      let frontier = [focus.id];
      for (let d = 0; d < focus.depth; d++) {
        const next: string[] = [];
        for (const f of frontier)
          for (const nb of adj.get(f)?.keys() ?? [])
            if (!keep.has(nb)) {
              keep.add(nb);
              next.push(nb);
            }
        frontier = next;
      }
    } else keep = new Set(adj.keys());
    const ids = [...keep];
    const index = new Map(ids.map((id, i) => [id, i]));
    const edges: { a: number; b: number; w: number }[] = [];
    for (const [a, m] of adj) {
      const ia = index.get(a);
      if (ia === undefined) continue;
      for (const [b, w] of m) {
        const ib = index.get(b);
        if (ib !== undefined && ia < ib) edges.push({ a: ia, b: ib, w });
      }
    }
    return { ids, edges, tags };
  }

  // ───────────────────────────── vault ─────────────────────────────

  exportJSON(): { app: 'sofia-cortex'; version: number; exportedAt: number; nodes: CortexNode[] } {
    return { app: 'sofia-cortex', version: 1, exportedAt: this.clock(), nodes: [...this.nodes.values()].filter((n) => n.deletedAt == null) };
  }

  /** Replace or merge the vault from an export. Undoable. */
  importJSON(data: { nodes: CortexNode[] }, mode: 'merge' | 'replace' = 'merge'): number {
    if (!data || !Array.isArray(data.nodes)) throw new Error('Geçersiz arşiv');
    return this.transact('İçe aktar', () => {
      if (mode === 'replace') for (const id of [...this.nodes.keys()]) this.hardRemove(id);
      let n = 0;
      for (const raw of data.nodes) {
        if (typeof raw?.id !== 'string') continue;
        const t = this.clock();
        this.put({
          id: raw.id,
          parentId: raw.parentId ?? null,
          sort: Number(raw.sort) || 0,
          title: String(raw.title ?? ''),
          body: String(raw.body ?? ''),
          isTask: !!raw.isTask,
          done: !!raw.done,
          doneAt: raw.doneAt ?? null,
          pinned: !!raw.pinned,
          pinOrder: Number(raw.pinOrder) || 0,
          sealed: !!raw.sealed,
          collapsed: !!raw.collapsed,
          steepUntil: raw.steepUntil ?? null,
          reminderAt: null,
          reminderHook: raw.reminderHook ?? null,
          reminderId: null,
          role: raw.role === 'inbox' || raw.role === 'table' ? raw.role : null,
          fmt: raw.fmt && typeof raw.fmt === 'object' ? raw.fmt : null,
          createdAt: raw.createdAt ?? t,
          updatedAt: raw.updatedAt ?? t,
          deletedAt: null,
        });
        n++;
      }
      // Orphans (parent missing) surface on Home rather than vanish.
      for (const node of [...this.nodes.values()]) if (node.parentId && !this.nodes.get(node.parentId)) this.put({ ...node, parentId: null });
      return n;
    });
  }

  meta(key: string): string | null {
    return this.db.all<{ v: string }>('SELECT v FROM meta WHERE k = ?', [key])[0]?.v ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.run('INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', [key, value]);
  }
}

const EMPTY: readonly NodeId[] = Object.freeze([]);

function sameKeys(a: Map<NodeId, unknown>, b: Map<NodeId, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

/** Equal in every field except the updatedAt stamp. */
function sameNode(a: CortexNode | undefined, b: CortexNode | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k in a) {
    if (k === 'updatedAt') continue;
    if (k === 'fmt' ? JSON.stringify(a.fmt) !== JSON.stringify(b.fmt) : (a as never)[k] !== (b as never)[k]) return false;
  }
  return true;
}
