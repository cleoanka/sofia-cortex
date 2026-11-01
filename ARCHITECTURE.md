# Sofia Cortex — Architecture

> One atom, unbounded depth, zero waiting on I/O.

## 1. Layers

```
┌───────────────────────────── UI (React Native, Fabric) ─────────────────────────────┐
│ Navigator (zoom-portal stack) · Home · Node · Graph (Skia) · Observer · Autopilot     │
│ Outline (gesture choreography) · CommandPalette · QuickCapture · ReminderSheet · Toast │
├──────────────────── state ────────────────────┬────────────── platform ──────────────┤
│ useNode / useChildren / useProgress /         │ db.ts (expo-sqlite driver, WAL)      │
│ useVersion  (useSyncExternalStore, per-id)    │ notify.ts (chrono-triggers, routing) │
│ nav.ts / sheet.ts (zustand)                   │ haptics.ts · shake.ts · vault.ts     │
├───────────────────────────────── engine (pure TS) ───────────────────────────────────┤
│ CortexEngine — in-memory mirror + incremental indexes + transactional undo/redo       │
│ schema.ts (SQLite + FTS5 + recursive CTEs) · links.ts · observer.ts · vault.ts · seed │
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
      reminder_at, reminder_hook, reminder_id, role, created_at, updated_at, deleted_at)
links(src, key, kind)            -- WITHOUT ROWID; key = normalised title or '#tag'
nodes_fts USING fts5(title, body, content='nodes', tokenize='unicode61 remove_diacritics 2')
meta(k, v)
```

* **Fractional `sort`** — inserts never rewrite siblings; renumbering happens only when a gap
  collapses below 1e-9.
* **Links by key, not id** — `[[Not]]` may exist before its target (Obsidian semantics).
  Renaming a node rewrites `[[Old]]`/`@Old` in every backlinker inside the same transaction.
* **FTS5 via triggers** — the index can never drift from the source of truth.
  `remove_diacritics 2` makes `tur` find `Türev`.
* **Recursive CTEs** (`SUBTREE_CTE`, `ANCESTORS_CTE`) are the canonical subtree/path queries
  for export and purge; tests assert they agree with the in-memory walk.

## 3. The engine

`CortexEngine` keeps a `Map<id, CortexNode>` plus four incremental indexes:

| index | purpose |
|---|---|
| `kids: Map<parent, id[]>` | ordered live children; **copy-on-write**, so array identity changes exactly when contents change → perfect `useSyncExternalStore` snapshots |
| `titles: Map<key, Set<id>>` | `[[link]]` resolution, `[[` autocomplete |
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
choreograph: ring closes (spring) → 120 ms → parent blooms → `Success` + heavy double tap.

### Plan Seal

`activeSeal(id)` walks up to the nearest sealed node *that still has open tasks*. Structural
mutations (`create/move/remove/indent/outdent/reorder`) throw `SealedError`; `toggle` is always
allowed; `split` and `addProtocol` pass `force` because micro-splitting is execution, not
re-planning. The seal dissolves by itself when the plan is done.

### Autopilot queue

`nextActions(scope)` = open tasks with no open task children, in document order, pinned
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

## 5. Navigation — zoom portals

A custom stack (`src/ui/Navigator.tsx`) instead of Expo Router: entering a node is *falling
into it* — the new page grows out of the old one while the old page recedes and dims; the
Observer enters with a 3-D lens turn; Autopilot fades through darkness. All screens stay
mounted (scroll and editor state survive); only the top two are composited, deeper ones are
`display: none`. Edge-swipe pops with the finger. Deep links (`sofia://node/<title>`,
`sofia://observer/<title>`, `sofia://autopilot`, `sofia://graph`) and notification taps
rebuild the stack deterministically.

## 6. Observer — deterministic defamiliarisation

`engine/observer.ts` (no model, no network):

* **1st → 3rd person** with conservative Turkish morphology rules (`-yorum→-yor`,
  `-eceğim→-ecek`, `-sem→-se`, `-amam→-amaz`, `-mem lazım→-mesi lazım`, past tense, inner-world
  possessives, pronouns; the first "ben" becomes **Özne**). When unsure, a word is left alone.
* **Rumination lexicon** → *Gözlemlenen Örüntüler*: oscillation (ama/fakat), catastrophising,
  social proof, deadline, obligation language, all-or-nothing, feeling-as-fact, stall.
* **Fog index** — share of sentences carrying feeling/catastrophe/oscillation markers.
* JS `\b` is ASCII-only and silently breaks on ç ğ ı ö ş ü; every pattern is rebuilt with a
  Unicode-aware boundary.

## 7. AI seam

`CortexAIProvider` (`engine/types.ts`) — `suggestSteps(node, context)` and `reframe(text)`.
Nothing calls it today; a local or cloud model plugs in behind one adapter without touching
the engine.
