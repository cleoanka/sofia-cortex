# Sofia Cortex — Architecture

> One atom, unbounded depth, zero waiting on I/O.

## 1. Layers

```
┌───────────────────────────── UI (React Native, Fabric) ─────────────────────────────┐
│ Navigator · Home · Node editor · Graph (Skia) · Dış Göz (reading view) · Autopilot    │
│ Rows + SwipeRow · KeyboardBar · CommandPalette · ReminderSheet · Toast · TopBar        │
├──────────────────── state ────────────────────┬────────────── platform ──────────────┤
│ useNode / useChildren / useProgress /         │ db.ts (expo-sqlite driver, WAL)      │
│ useVersion  (useSyncExternalStore, per-id)    │ notify.ts (chrono-triggers, routing) │
│ nav.ts / sheet.ts (zustand)                   │ haptics.ts · shake.ts · vault.ts     │
├───────────────────────────────── engine (pure TS) ───────────────────────────────────┤
│ CortexEngine — in-memory mirror + incremental indexes + transactional undo/redo       │
│ schema.ts (SQLite + FTS5 + recursive CTEs) · links.ts · vault.ts · seed               │
│ graph/physics.ts — Barnes-Hut force simulation, typed arrays, auto-sleep              │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

The engine has **no React and no Expo imports**. It talks to storage through a four-method
`SqlDriver` (`exec / run / all / transaction`), implemented by expo-sqlite on device and by
`bun:sqlite` in tests — the same code is exercised in both.

## 2. Data model — the universal fractal node

```sql
nodes(id PK, parent_id, sort REAL, title, body, is_task, done, done_at,
      pinned, pin_order, sealed, collapsed, steep_until,
      reminder_at, reminder_hook, reminder_id, role, fmt, created_at, updated_at, deleted_at)
links(src, key, kind)            -- WITHOUT ROWID; key = normalised title or '#tag'
nodes_fts USING fts5(title, body, content='nodes', tokenize='unicode61 remove_diacritics 2')
meta(k, v)
```

* **Formatting (`fmt`, JSON)** — whole-line Apple Notes styles: paragraph style (title / heading /
  large / body / mono), typeface (SF, New York, SF Rounded, SF Mono via `ui-*` families), B I U S,
  a highlighter colour, a list marker (bullet / number), and `bd` for the page's body block.
  Formatting is allowed inside a locked plan. Old databases gain the column in place (`migrate`).
* **Tables** — a node with `role = 'table'`; cells live as `{"rows":[[…]]}` in `body`
  (`engine/table.ts`). Link renames rewrite cells, never the JSON. Exported as Markdown tables.
* **Fractional `sort`** — inserts never rewrite siblings; renumbering happens only when a gap
  collapses below 1e-9.
* **One link syntax: `&Başlık&`** — easy on a phone keyboard. If a note answers to the title it
  is a link, otherwise it behaves as a tag. Links are stored by key, so a reference may exist
  before its target. Renaming rewrites `&Old&` in every backlinker in the same transaction.
  Legacy `[[x]]` / `#tag` / `@x` bodies are migrated once at boot (`migrateSyntax`, not undoable).
* **Delete is real.** `remove()` hard-deletes the subtree and turns `&Title&` into plain words in
  every other note — one undo step restores everything, nothing else can. Following an
  unresolved reference only searches; it never creates a note (no "ghost" resurrections).
* **FTS5 via triggers** — the index can never drift from the source of truth.
  `remove_diacritics 2` makes `tur` find `Türev`.
* **Recursive CTEs** (`SUBTREE_CTE`, `ANCESTORS_CTE`) are the canonical subtree/path queries
  for export and purge; tests assert they agree with the in-memory walk.

## 3. The engine

`CortexEngine` keeps a `Map<id, CortexNode>` plus four incremental indexes:

| index | purpose |
|---|---|
| `kids: Map<parent, id[]>` | ordered live children; **copy-on-write**, so array identity changes exactly when contents change → perfect `useSyncExternalStore` snapshots |
| `titles: Map<key, Set<id>>` | `&link&` resolution, autocomplete in the keyboard bar |
| `outLinks / inLinks` | backlinks + graph edges, O(1) per lookup |

Every write goes through `apply(id, next)` — the single choke point that keeps every index
coherent — and every mutation runs inside `transact(label, fn)`:

1. first write to an id snapshots its *before* state,
2. on commit, no-op writes are dropped, the changed rows are persisted in **one SQLite
   transaction**, an undo entry `{before, after}` is pushed, listeners fire once,
3. on throw, memory is rolled back from the snapshots; SQLite was never touched.

Undo/redo is therefore just "apply snapshot". Consecutive title/body edits to the same node
within 4 s coalesce into one entry — typing is one thought, not a hundred.

### Bottom-up reactive propagation (auto-tick)

```
toggle(leaf) → put(leaf.done) → propagate(parent):
  while parent is a task with ≥1 task child:
     should = all task children done
     if parent.done == should: stop          ← O(depth), early exit
     put(parent.done = should); parent = parent.parent
```

Toggling a parent that has task children drives its whole subtree first, then ripples up.
Creating a new open task under a completed parent re-opens it. The whole cascade is one
undo step and one SQLite transaction. `toggle()` returns the flipped ancestors so the UI can
choreograph: the child's check closes (150 ms timing) → the ancestor's check waits ~140 ms → `Success` + heavy tap.

### Plan Seal

`activeSeal(id)` walks up to the nearest sealed node *that still has open tasks*. Structural
mutations (`create/move/remove/indent/outdent/reorder`) throw `SealedError`; `toggle` is always
allowed; `split` and `addProtocol` pass `force` because micro-splitting is execution, not
re-planning. The seal dissolves by itself when the plan is done.

### Drafts

A task with no title, no body and no children is a *draft* — the empty `◯ Görev` waiting at the
bottom of a page. `isDraft()` keeps it out of `progress`, `deepProgress`, propagation, cascades and
`nextActions`; writing its first word makes it count (and re-runs propagation). An empty line is
also dropped (outside history) once focus has really left it.

### Autopilot queue

`nextActions(scope)` = open, non-draft tasks with no open task children, in document order, pinned
surfaces first, steeping nodes excluded. O(n) over the scope, ~0.2 ms for 10k nodes.

## 4. Performance budget (iPhone 12, A14, 60 Hz)

Measured in `tests/engine.core.test.ts` (bun/JSC — a conservative proxy for Hermes):

| operation | 10 000 nodes |
|---|---|
| cold load SQLite → memory + indexes | **~15 ms** |
| toggle with full cascade + persist | **~0.07 ms** |
| FTS5 prefix search (3 tokens) | **~0.9 ms** |
| Autopilot queue (first 50) | **~0.2 ms** |
| graph projection (tree + links + tags) | **~6 ms** |
| Barnes-Hut step, 10k nodes / 12k edges | **~6 ms** |

Rules that keep it there:

* **No I/O on the render path.** Reads are synchronous from memory; SQLite is write-through.
* **Per-id subscriptions.** A row re-renders only when *its* node or its child list changes.
* **Gestures and camera on the UI thread** (worklets); only commit points hop to JS
  (`scheduleOnRN`).
* **Graph = one Skia `Picture` per frame**: five category paths (built as SVG strings and
  parsed natively in one call each), one blur mask for the "done" glow, ≤140 labels.
  Pan/zoom is a `Group` transform driven by shared values — no JS per camera frame.
* **Physics sleeps.** When average kinetic energy stays under threshold for 24 frames the
  `requestAnimationFrame` loop stops entirely (0 % CPU). Dragging a node or changing a filter
  wakes it.
* `CADisableMinimumFrameDurationOnPhone` lets ProMotion devices run at 120 Hz.

## 5. Interface law

Apple Notes (iOS 18) is the bar: system grouped colours (#F2F2F7 + white inset cards / black +
#1C1C1E), San Francisco, a warm amber accent. Home groups notes by when anything inside them last
changed (`touchedAt`): Sabitlenenler · Bugün · Önceki 7 Gün · Önceki 30 Gün · months; each row is
a bold title (+ `0/4`) over time + preview; a frosted bottom bar holds search and compose.
Whitespace and typography do the framing. No uppercase meta
labels, no boxes in boxes, no invented words. Motion is `withTiming` 150–220 ms
`Easing.out(cubic)` (`theme/motion.ts`) — no springs, no scale, no bounce.

* **TopBar** — every screen has a sticky, blurred bar under the status bar; content scrolls
  beneath it, never over the clock.
* **Node editor** — title, body and lines are edited in place (`useField`: local state, 350 ms
  debounced commit coalesced into one undo step, flush on blur/unmount). A plain line has **no
  marker**; ☑ adds a checkbox, • / 1. a list marker. Return makes the next line of the same kind.
  On an empty nested line Return — or Backspace at the start of any nested line — steps out one
  level; at the top level they drop the checkbox / marker. The page shows three levels inline;
  deeper lines open as pages (›). A highlighted line renders its text as a span inside the
  `TextInput` so the marker sits behind the glyphs only. Tap on empty paper starts a new line.
* **Keyboard** — no focused input may ever sit under the keyboard. `useKeyboardHeight()`
  (`ui/keyboard.tsx`) reads the real height from `keyboardWillShow/WillHide`. `KeyboardScrollView`
  (note page, Dış Göz) adds `keyboard + 100` of room and, on keyboard show and on every caret
  report from a field (`nudgeCaret()` on focus / typing / content-size change), measures
  `TextInput.State.currentlyFocusedInput()` in window coordinates and scrolls it above
  `screen − keyboard − margin`. Autopilot's split inputs open directly under the task title; the
  reminder drawer sits on the keyboard and folds its time pickers away; search results end above
  the keyboard. `KeyboardBar` (horizontally scrollable Aa · ☑ · • · 1. · ⊞ · ↳ · ↰ · &, with a fixed Bitti;
  Aa opens the formatting panel above it) rides on top of it and is tied to focus, so it also docks at the bottom with a hardware
  keyboard. iOS commits a pending autocorrection when the bar is tapped, so inserts are deferred
  one frame.
* **Swipe** — right: *İçeri al* (indent). Left on a nested line: a short pull is *Dışarı al*
  (outdent), a long pull is red *Sil*; on a top-level line left is *Sil* (hard delete + undo toast).
* **Navigation** — a small custom stack: pages slide 28 pt and fade (200 ms); the reading view and
  Autopilot fade in place. Covered screens stay mounted but freeze their derived views
  (`SceneDepth` + `useVersion`). Deep links: `sofia://node/<title>`, `sofia://observer/<title>`,
  `sofia://autopilot`, `sofia://graph`.

## 6. Dış Göz — the reading view

No analysis, no rewriting. The note's own words are set as a quiet serif book page (Newsreader)
so you read them the way you would read someone else's, followed by one question — *“Şu an
atılabilecek en küçük, somut adım ne?”* — and an input whose every line becomes a real task.

## 7. AI seam

`CortexAIProvider` (`engine/types.ts`) — `suggestSteps(node, context)` and `reframe(text)`.
Nothing calls it today; a local or cloud model plugs in behind one adapter without touching
the engine.
