import type { CortexNode, Fmt, SqlDriver } from './types';

export const SCHEMA_VERSION = 1;

/**
 * One table for every thought. Links are stored by normalised target key so a
 * reference can exist before its target does (Obsidian semantics); FTS5 mirrors
 * title/body through triggers so search never drifts from the source of truth.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT,
  sort          REAL    NOT NULL DEFAULT 0,
  title         TEXT    NOT NULL DEFAULT '',
  body          TEXT    NOT NULL DEFAULT '',
  is_task       INTEGER NOT NULL DEFAULT 0,
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       INTEGER,
  pinned        INTEGER NOT NULL DEFAULT 0,
  pin_order     REAL    NOT NULL DEFAULT 0,
  sealed        INTEGER NOT NULL DEFAULT 0,
  collapsed     INTEGER NOT NULL DEFAULT 0,
  steep_until   INTEGER,
  reminder_at   INTEGER,
  reminder_hook TEXT,
  reminder_id   TEXT,
  role          TEXT,
  fmt           TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent_id, sort);
CREATE INDEX IF NOT EXISTS nodes_pinned ON nodes(pinned) WHERE pinned = 1;

CREATE TABLE IF NOT EXISTS links (
  src  TEXT NOT NULL,
  key  TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (src, key, kind)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS links_key ON links(key);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  title, body,
  content='nodes', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE OF title, body ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO nodes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID;
`;

export const PRAGMAS_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA foreign_keys = OFF;
`;

/** Every descendant of a node (inclusive) — used by export and purge. */
export const SUBTREE_CTE = `
WITH RECURSIVE sub(id, depth) AS (
  SELECT id, 0 FROM nodes WHERE id = ?
  UNION ALL
  SELECT n.id, sub.depth + 1 FROM nodes n JOIN sub ON n.parent_id = sub.id
)`;

/** Root-to-node path. */
export const ANCESTORS_CTE = `
WITH RECURSIVE anc(id, parent_id, depth) AS (
  SELECT id, parent_id, 0 FROM nodes WHERE id = ?
  UNION ALL
  SELECT n.id, n.parent_id, anc.depth + 1 FROM nodes n JOIN anc ON n.id = anc.parent_id
)`;

export interface NodeRow {
  id: string;
  parent_id: string | null;
  sort: number;
  title: string;
  body: string;
  is_task: number;
  done: number;
  done_at: number | null;
  pinned: number;
  pin_order: number;
  sealed: number;
  collapsed: number;
  steep_until: number | null;
  reminder_at: number | null;
  reminder_hook: string | null;
  reminder_id: string | null;
  role: string | null;
  fmt: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function rowToNode(r: NodeRow): CortexNode {
  return {
    id: r.id,
    parentId: r.parent_id,
    sort: r.sort,
    title: r.title,
    body: r.body,
    isTask: r.is_task === 1,
    done: r.done === 1,
    doneAt: r.done_at,
    pinned: r.pinned === 1,
    pinOrder: r.pin_order,
    sealed: r.sealed === 1,
    collapsed: r.collapsed === 1,
    steepUntil: r.steep_until,
    reminderAt: r.reminder_at,
    reminderHook: r.reminder_hook,
    reminderId: r.reminder_id,
    role: r.role === 'inbox' || r.role === 'table' ? r.role : null,
    fmt: parseFmt(r.fmt),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function parseFmt(raw: string | null | undefined): Fmt | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && Object.keys(v).length ? (v as Fmt) : null;
  } catch {
    return null;
  }
}

export const UPSERT_SQL = `
INSERT INTO nodes (id, parent_id, sort, title, body, is_task, done, done_at, pinned, pin_order,
  sealed, collapsed, steep_until, reminder_at, reminder_hook, reminder_id, role, fmt, created_at, updated_at, deleted_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  parent_id=excluded.parent_id, sort=excluded.sort, title=excluded.title, body=excluded.body,
  is_task=excluded.is_task, done=excluded.done, done_at=excluded.done_at, pinned=excluded.pinned,
  pin_order=excluded.pin_order, sealed=excluded.sealed, collapsed=excluded.collapsed,
  steep_until=excluded.steep_until, reminder_at=excluded.reminder_at, reminder_hook=excluded.reminder_hook,
  reminder_id=excluded.reminder_id, role=excluded.role, fmt=excluded.fmt, updated_at=excluded.updated_at,
  deleted_at=excluded.deleted_at`;

export function nodeParams(n: CortexNode): unknown[] {
  return [
    n.id, n.parentId, n.sort, n.title, n.body, n.isTask ? 1 : 0, n.done ? 1 : 0, n.doneAt,
    n.pinned ? 1 : 0, n.pinOrder, n.sealed ? 1 : 0, n.collapsed ? 1 : 0, n.steepUntil,
    n.reminderAt, n.reminderHook, n.reminderId, n.role, n.fmt && Object.keys(n.fmt).length ? JSON.stringify(n.fmt) : null, n.createdAt, n.updatedAt, n.deletedAt,
  ];
}

export function migrate(db: SqlDriver): void {
  db.exec(PRAGMAS_SQL);
  db.exec(SCHEMA_SQL);
  // v2: line formatting. Older databases gain the column in place.
  if (!db.all<{ name: string }>('PRAGMA table_info(nodes)').some((c) => c.name === 'fmt')) db.exec('ALTER TABLE nodes ADD COLUMN fmt TEXT');
  db.run(`INSERT OR IGNORE INTO meta(k, v) VALUES ('schema', ?)`, [String(SCHEMA_VERSION)]);
}
