# Sofia Cortex — Principal Architecture, Performance & Art Direction Review (agy · Gemini 4 Argon)

**Target:** Expo SDK 58 · React Native 0.88 (Fabric) · Reanimated 4.7.1 + `react-native-worklets` 0.13.0 · RNGH 3.3.0 (v3 hook API) · Skia 2.14.0 · `expo-sqlite` (WAL + FTS5)  
**Lens:** John Carmack (frame budget, zero-allocation hot paths, worklet/JSI boundaries, 10k-node scaling) × Steve Jobs (choreography fidelity, editorial typography, physical continuity, contrast integrity)

---

## 1. Runtime & Correctness Bugs (RNGH v3 · Reanimated 4 · Worklets · Engine · Observer)

### [R1] CRITICAL — `GraphScreen` camera `pan` (`maxPointers: 2`) and `pinch` run simultaneously and overwrite `tx`/`ty` with conflicting math every frame
- **Where:** `src/screens/GraphScreen.tsx:237-267`, `src/screens/GraphScreen.tsx:321`
- **Why it breaks:** `pan` is configured with `maxPointers: 2` and composed with `pinch` via `useSimultaneousGestures(pan, pinch)`. During a two-finger pinch, both recognizers are `ACTIVE` simultaneously and share `startTx` and `startTy`. On every touch frame, `pan.onUpdate` sets `tx.value = startTx.value + ev.translationX` (ignoring scale `k`), while `pinch.onUpdate` overwrites `tx.value = fx - (fx - startTx.value) * k` (ignoring `ev.translationX`). Worse, if the user places one finger before the second, `pinch.onBegin` overwrites `startTx`/`startTy` mid-pan, and lifting one finger causes `pan` to snap the camera back to unscaled coordinates.
- **Exact fix:** Restrict `pan` to a single pointer (`maxPointers: 1`), or track incremental deltas (`ev.changeX`, `ev.changeY`, `ev.scaleChange` provided by RNGH v3's `diffCalculator`) directly on `tx`/`ty`/`sc`:
  ```tsx
  const pan = usePanGesture({
    maxPointers: 1,
    onUpdate: (ev) => {
      'worklet';
      tx.value += ev.changeX;
      ty.value += ev.changeY;
    },
  });
  const pinch = usePinchGesture({
    onUpdate: (ev) => {
      'worklet';
      const nextSc = Math.min(6, Math.max(0.08, sc.value * ev.scaleChange));
      const k = nextSc / sc.value;
      const fx = ev.focalX - width / 2;
      const fy = ev.focalY - height / 2;
      tx.value = fx - (fx - tx.value) * k;
      ty.value = fy - (fy - ty.value) * k;
      sc.value = nextSc;
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(onScale, sc.value);
    },
  });
  ```

### [R2] CRITICAL — `GraphScreen` `fitCamera(true)` on simulation sleep is 100% dead code; camera only ever fits to Frame 1's unexpanded origin cluster
- **Where:** `src/screens/GraphScreen.tsx:177-183`, `src/screens/GraphScreen.tsx:199-214`
- **Why it breaks:** On the very first frame of `loop`, `if (!fitted.current && sim.count > 0) fitCamera(false)` runs and sets `fitted.current = true` while all newly seeded nodes are still bunched near `(0, 0)` in their initial golden-angle spiral. When the Barnes-Hut simulation cools and sleeps (`sim.asleep === true` at line 178), it calls `fitCamera(true)`. Inside `fitCamera(animated)`, line 207 executes `if (animated && fitted.current) return;` — which **always** returns early because `fitted.current` was set to `true` on Frame 1. The settled graph never auto-fits.
- **Exact fix:** Track initial vs. settled fit separately (or only set `fitted.current = true` on the animated settle fit unless the user has manually interacted with the camera):
  ```tsx
  function fitCamera(animated: boolean) {
    if (fitted.current && !animated) return;
    const b = sim.bounds();
    const w = Math.max(80, b.maxX - b.minX);
    const h = Math.max(80, b.maxY - b.minY);
    const s = Math.min(2.2, Math.max(0.15, Math.min((width - 60) / w, (height - 300) / h)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    if (animated) fitted.current = true;
    scaleJS.current = s;
    sc.value = animated ? withSpring(s, spring.lens) : s;
    tx.value = animated ? withSpring(-cx * s, spring.lens) : -cx * s;
    ty.value = animated ? withSpring(-cy * s, spring.lens) : -cy * s;
  }
  ```

### [R3] CRITICAL — `Navigator` edge-swipe pop triggers a double-exit snap-back ghost and hides the underlying screen (`opacity: 0`) during the swipe
- **Where:** `src/ui/Navigator.tsx:80-87`, `src/ui/Navigator.tsx:98-103`, `src/ui/Navigator.tsx:110`, `src/ui/Navigator.tsx:124-140`
- **Why it breaks:** Two compounding bugs:
  1. At line 81, `portal` opacity is `interpolate(e, [0, 0.5], [0, 1], Extrapolation.CLAMP) * interpolate(b, [0, 1], [1, 0.0], Extrapolation.CLAMP) ** 0.25`. When a screen is covered (`depth === 1`), `behind.value` (`b`) springs to `1`, making its opacity **`0.0`**. Because `drag` is local to the top `Scene` (`depth === 0`), swiping the top screen right reveals an empty `c.bg` void instead of the previous screen until `pop()` completes.
  2. When the swipe threshold is met (line 101), `drag.value` springs to `width` and calls `scheduleOnRN(pop)` upon completion. When `pop()` unmounts the `Scene`, Reanimated runs `exiting={exitFor(kind)}` (line 110), which resets `initialValues: { opacity: 1, transform: [{ scale: 1 }] }` (wiping out `translateX: width`), snapping the dismissed screen back to the center of the viewport at full opacity for 240ms.
- **Exact fix:** Keep covered `depth === 1` scenes dimmed (`[1, 0.38]`) rather than `0.0`, guard `onDeactivate` against `e.canceled`, and skip the layout `exiting` animation when `drag.value > 0` (or pop immediately and pass gesture velocity into the exit animation):
  ```tsx
  // Line 81: keep depth=1 visible & dimmed under the portal
  opacity: interpolate(e, [0, 0.5], [0, 1], Extrapolation.CLAMP) * interpolate(b, [0, 1], [1, 0.38], Extrapolation.CLAMP),
  ```
  And in `exitFor(kind)` / `Scene`: if popped via edge-swipe (`drag.value >= width * 0.9`), return `{ initialValues: { opacity: 0 }, animations: { opacity: withTiming(0, { duration: 0 }) } }`.

### [R4] HIGH — Dragged `NodeRow` renders *underneath* lower rows in `FlatList` because `zIndex: 10` is applied inside `CellRendererComponent`
- **Where:** `src/ui/Outline.tsx:196-213`, `src/ui/Outline.tsx:319-323`
- **Why it breaks:** React Native's `FlatList` (`VirtualizedList`) wraps each `renderItem` element in its own native cell `<View>` (`CellRendererComponent`) at `zIndex: 0`. Setting `zIndex: lift.value > 0.01 ? 10 : 0` on `NodeRow`'s inner `<Animated.View>` (line 320) only orders the view inside its own cell wrapper; subsequent cells in `FlatList` have later sibling order and paint *on top* of the dragged row when dragging downward.
- **Exact fix:** Provide a `CellRendererComponent` on `FlatList` in `Outline.tsx:196` that raises `zIndex` for the active `dragging` row:
  ```tsx
  const CellRenderer = useCallback(({ item, style, children, ...rest }: any) => {
    const active = useDrag((s) => s.dragging === item?.id);
    return (
      <View {...rest} style={[style, active && { zIndex: 100, elevation: 10 }]}>
        {children}
      </View>
    );
  }, []);
  ```

### [R5] HIGH — Dropping a dragged `NodeRow` causes a 2× vertical jump (`ty.value` spring + `LinearTransition` layout animation)
- **Where:** `src/ui/Outline.tsx:245-248`, `src/ui/Outline.tsx:308-311`, `src/ui/Outline.tsx:346`
- **Why it breaks:** While dragging a row by e.g. `ty.value = +160`, `endDrag` commits `e.move(...)` and sets `isDragging = false`. `FlatList` immediately updates the row's Yoga layout position by `+160px`, while `ty.value = withSpring(0, spring.snappy)` (line 247) starts animating from `+160` to `0` *on top of* the new layout position and `layout={LinearTransition.springify()}` (line 346) simultaneously animates the layout shift. The row snaps to `newY + 160` and springs backward.
- **Exact fix:** Zero `ty.value` and `lift.value` synchronously on the UI thread in `dnd.onFinalize` when committing the drop:
  ```tsx
  onFinalize: () => {
    'worklet';
    ty.value = 0;
    lift.value = withSpring(0, spring.snappy);
    scheduleOnRN(endDrag);
  },
  ```

### [R6] HIGH — `AutopilotScreen` micro-splitter (`doSplit`) calls `onDone()`, falsely inflating `completed` task count
- **Where:** `src/screens/AutopilotScreen.tsx:75-78`, `src/screens/AutopilotScreen.tsx:237-243`
- **Why it breaks:** When the user taps `"Takıldım · İkiye böl"` (`İKİYE BÖL — İLKİYLE DEVAM EDİLİR`), `doSplit()` splits the task into two open subtasks and calls `onDone()` (`done()`), which runs `setCompleted((n) => n + 1)`. No task was completed — one task was split into two. This inflates both the top-right progress counter (`${Math.min(completed + 1, total)} / ${total}`) and the final summary (`"${completed} şey bitti"`).
- **Exact fix:** Separate `onSplit` (which only increments `tick` to refresh `queue`) from `onDone`:
  ```tsx
  // In AutopilotScreen:
  <TaskStage key={current} id={current} onDone={done} onSplit={() => setTick((t) => t + 1)} onSkip={...} />
  // In TaskStage.doSplit():
  e.split(id, a, b);
  haptic.cascade();
  setSplitting(false);
  onSplit();
  ```

### [R7] HIGH — `AutopilotScreen` hold-to-complete has a clock race (`hold.value < 0.999`) that snaps the ring open on release, and lacks a completion guard
- **Where:** `src/screens/AutopilotScreen.tsx:140-164`
- **Why it breaks:**
  1. RNGH's native `LongPress` timer (`minDuration: 650`) and Reanimated's UI-thread `withTiming(1, { duration: 650 })` run on independent clocks. When `onActivate` fires 1 frame before `hold.value` reaches `0.999` and the user lifts their finger upon feeling the haptic, `onFinalize` evaluates `hold.value < 0.999` as `true` and springs the progress ring back to `0` while `melt` is animating out.
  2. `complete()` has no idempotency guard during the 520ms `melt` animation, so tapping `"Şimdi değil"` or re-holding before `onDone` fires triggers duplicate transitions.
- **Exact fix:** Track activation with a shared boolean `doneSV` instead of `hold.value < 0.999`:
  ```tsx
  const doneSV = useSharedValue(false);
  const press = useLongPressGesture({
    minDuration: HOLD_MS,
    maxDistance: 40,
    onBegin: () => {
      'worklet';
      if (doneSV.value) return;
      hold.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.cubic) });
      scheduleOnRN(haptic.soft);
    },
    onActivate: () => {
      'worklet';
      if (doneSV.value) return;
      doneSV.value = true;
      hold.value = 1;
      scheduleOnRN(complete);
    },
    onFinalize: () => {
      'worklet';
      if (!doneSV.value) hold.value = withSpring(0, spring.snappy);
    },
  });
  ```

### [R8] HIGH — `observer.ts` 1st→3rd person morphology (`COND` and nominal predicates) fails on all vowel-stem/negative conditionals and pro-drop adjectives, while corrupting `-sam` nouns
- **Where:** `src/engine/observer.ts:55`, `src/engine/observer.ts:78`, `src/engine/observer.ts:92`
- **Why it breaks:**
  1. Line 78: `s.replace(COND, (m, stem, suf) => (/(m[ae]z|[ae]r|[ıiuü]r|d[ıiuü]|t[ıiuü])$/.test(stem) || /[^aeıioöuü]$/.test(stem) ? stem + suf[0] + suf[1] : m))`. Because `/[^aeıioöuü]$/.test(stem)` requires a trailing consonant, **every** Turkish negative conditional (`-masam`/`-mesem`, e.g. `gitmesem`, `yapmasam`, `konuşmasam`) and every vowel-stem conditional (`başlasam`, `beklesem`, `söylesem`, `okusam`) fails to convert and remains 1st-person in the dossier. Conversely, nouns ending in consonant + `sam` like `kapsam` (stem `kap`) match `/[^aeıioöuü]$/` and get corrupted into `kapsa`.
  2. Line 92: `U(/\b(o|Özne) (\p{L}+?)(ım|im|um|üm|yım|yim|yum|yüm)\b/gu)` only strips 1st-person copula suffixes when immediately preceded by `o ` or `Özne `. In natural pro-drop Turkish (or when an adverb intervenes, e.g. `"Ben çok yorgunum"`, `"Kararsızım"`, `"Emin değilim"`), the 1st-person suffix stays untransformed.
- **Exact fix:** Allow `-masam/-mesem` and vowel stems in `COND` while excluding a small stop-set (`kapsam`, `akşam`, `yaşam`, `ortam`, `susam`, `tasma`), and allow optional adverbs (`çok`, `biraz`, `artık`, `hiç`, `de/da`) or standalone common inner-state predicates (`yorgunum`, `kararsızım`, `hazırım`, `değilim`, `haklıyım`, `pişmanım`, `yalnızım`) in `toThirdPerson`.

### [R9] HIGH — RNGH v3 `onDeactivate` handlers in `Outline.tsx`, `QuickCapture.tsx`, and `Navigator.tsx` do not check `ev.canceled`
- **Where:** `src/ui/Outline.tsx:281-289`, `src/ui/QuickCapture.tsx:43-47`, `src/ui/Navigator.tsx:98-103`
- **Why it breaks:** In RNGH v3 (`eventHandler.js:21-30`), when a gesture in `State.ACTIVE` transitions to `State.FAILED` or `State.CANCELLED` (e.g., interrupted by a second finger pinch, system gesture, or scroll takeover), `onDeactivate` (`CallbackType.END`) **still runs** with `ev.canceled === true`. None of these three `onDeactivate` worklets check `if (!ev.canceled)`, causing cancelled swipes to indent/outdent/open the reminder sheet (`Outline.tsx`), focus the capture input (`QuickCapture.tsx`), or pop the navigation stack (`Navigator.tsx`).
- **Exact fix:** Guard each `onDeactivate` worklet with `if (!ev.canceled)` before firing `scheduleOnRN(...)`:
  ```tsx
  // Outline.tsx:281
  onDeactivate: (ev) => {
    'worklet';
    if (!ev.canceled) {
      const x = ev.translationX;
      if (x > SWIPE_IN) scheduleOnRN(doIndent);
      else if (x < SWIPE_BELL) scheduleOnRN(doBell);
      else if (x < SWIPE_OUT) scheduleOnRN(doOutdent);
    }
    tx.value = withSpring(0, spring.snappy);
    lastZone.value = 0;
  },
  ```

### [R10] HIGH — `CortexEngine.setTask` bypasses `assertUnlocked`, allowing users to dissolve a Plan Seal by toggling tasks into notes
- **Where:** `src/engine/CortexEngine.ts:679-687`, `src/screens/NodeScreen.tsx:177-185`
- **Why it breaks:** Law #8 states *"Structural writes inside an unfinished sealed plan throw `SealedError`"*. `CortexEngine.setTask(id, isTask)` does not call `this.assertUnlocked(id, n.parentId)`, and `NodeScreen.tsx:181` does not wrap `e.setTask` in `guard()` or disable the button when `locked`. Converting open tasks inside a sealed plan to notes (`isTask = false`) makes `hasOpenTasks` return `false` and silently unlocks the sealed plan without executing it.
- **Exact fix:** Add `this.assertUnlocked(id, n.parentId);` at the top of `setTask` in `src/engine/CortexEngine.ts:681` and wrap `e.setTask(node.id, !node.isTask)` with `guard(...)` (and `disabled={locked}`) in `src/screens/NodeScreen.tsx:180-184`.

### [R11] MEDIUM — `GraphScreen` `nodeDrag` (`activateAfterLongPress: 220`) activates on empty canvas and kills camera panning
- **Where:** `src/screens/GraphScreen.tsx:295-322`
- **Why it breaks:** `nodeDrag` is composed via `useCompetingGestures(nodeDrag, useCompetingGestures(tap, camera))`. Because `nodeDrag` is a native `PanGestureHandler` with `activateAfterLongPress: 220`, holding a finger still for 220ms on *empty background space* before panning causes `nodeDrag` to activate on the native thread and cancel `camera` (`pan`). On the JS thread, `sim.hitTest` returns `-1`, so `nodeDrag` becomes a no-op and the user's pan gesture is dead.
- **Exact fix:** Use `manualActivation: true` on `nodeDrag` (or fail the gesture via `GestureStateManager` when `sim.hitTest < 0` in `onTouchesDown`/`onBegin`) so `nodeDrag` only claims the gesture when a finger actually lands on a node.

### [R12] MEDIUM — `NodeScreen` `<TopScrim />` is rendered *before* `<OutlineList />`, making it completely invisible behind opaque `NodeRow`s
- **Where:** `src/screens/NodeScreen.tsx:35-38`
- **Why it breaks:** In `HomeScreen.tsx:69`, `ObserverScreen.tsx:151`, and `SettingsScreen.tsx:190`, `<TopScrim />` is rendered *after* the scroll container so it overlays scrolling content. In `NodeScreen.tsx:36`, `<TopScrim color={c.bg} />` is rendered *before* `<OutlineList />` with no `zIndex`. Every `NodeRow` has `backgroundColor: c.bg` (`Outline.tsx:361`), painting directly over `TopScrim` and causing scrolled rows to collide with the iOS status bar.
- **Exact fix:** Move `<TopScrim color={c.bg} />` below `<OutlineList ... />` at `src/screens/NodeScreen.tsx:37`.

### [R13] MEDIUM — `TitleEditor` and `BodyEditor` lose unsaved edits if the user navigates back within the 450–500ms debounce window
- **Where:** `src/screens/NodeScreen.tsx:132-168`, `src/screens/NodeScreen.tsx:305-365`
- **Why it breaks:** Both editors debounce `e.update(...)` by 500ms / 450ms via `timer.current = setTimeout(...)` and have no `useEffect` unmount cleanup. If the user types and immediately pops the screen (via edge-swipe or back button) before the timer fires, or if `timer.current` fires after unmount, edits can be dropped or committed out of order.
- **Exact fix:** Store the latest dirty value in a `useRef` and flush any pending `timer.current` on unmount:
  ```tsx
  const latest = useRef(node.title);
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      commit(latest.current.trim());
    }
  }, []);
  ```

### [R14] MEDIUM — `SteepCard` countdown expiry writes to `CortexEngine` (`e.update`), polluting the Undo stack, and `"Erken aç"` / `scheduleSteep` leaks the scheduled OS notification
- **Where:** `src/screens/NodeScreen.tsx:275-277`, `src/screens/NodeScreen.tsx:292-296`, `src/platform/notify.ts:47-49`
- **Why it breaks:**
  1. `scheduleSteep` (`notify.ts:47`) discards the notification ID returned by `schedule(...)`. When the user taps `"Erken aç"` (`NodeScreen.tsx:295`) or deletes the node, the scheduled notification cannot be cancelled and still fires when the 15 minutes elapse.
  2. When `SteepCard` counts down to `left === 0` while open (`NodeScreen.tsx:276`), it calls `e.update(node.id, { steepUntil: null })`, which pushes a `'Düzenle'` entry onto `undoStack`. Shaking the phone to undo then re-locks the expired note.
- **Exact fix:** No engine write is needed when `left === 0` (since `steeping` is already `node.steepUntil != null && node.steepUntil > Date.now()` and `nextActions` checks `n.steepUntil <= this.clock()`); simply call `setNow(Date.now())` in the parent or let `SteepCard` notify its parent to re-render. And store the steep notification ID (or cancel via `Notifications.cancelScheduledNotificationAsync`) when `"Erken aç"` is pressed.

### [R15] MEDIUM — `ReminderSheet` crashes if the target node is undone/removed while the sheet is open, and `CortexEngine.remove` orphans active OS notifications
- **Where:** `src/ui/ReminderSheet.tsx:48`, `src/engine/CortexEngine.ts:778-788`
- **Why it breaks:** `ReminderSheet` (`Body`) reads `const n = e.get(id)!` once without subscribing via `useNode(id)` or guarding `if (!n) return null;`. If the user triggers shake-to-undo (`App.tsx:66`) while the sheet is open for a newly created node, `e.get(id)` returns `undefined` and crashes on `n.title`. Furthermore, soft-deleting a node (`e.remove(id)`) never cancels `n.reminderId` in `expo-notifications`.
- **Exact fix:** In `ReminderSheet.tsx:48`, use `const n = useNode(id); if (!n) return null;`.

### [R16] MEDIUM — `QuickCapture` `pan` gesture remains enabled while the multiline `TextInput` is focused, hijacking vertical text scrolling, and multi-line capture inserts in reverse order across N separate undo transactions
- **Where:** `src/ui/QuickCapture.tsx:37-59`, `src/engine/CortexEngine.ts:882-889`
- **Why it breaks:**
  1. `pan = usePanGesture({ activeOffsetY: [-12, 12], ... })` stays enabled when `focused === true`, intercepting vertical scroll gestures inside the multiline `TextInput`.
  2. `submit()` loops `for (const line of ...) e.capture(line);`. Because `e.capture` runs its own `this.transact('Yakala', ...)` and inserts at `index: 0`, a 3-line dump creates 3 separate undo steps, 3 SQLite transactions, and inserts the lines into Inbox **upside-down** (`line 3, line 2, line 1`).
- **Exact fix:** Pass `enabled: !focused` to `usePanGesture` in `QuickCapture.tsx:37`, and wrap the multi-line loop in `e.transact('Yakala', () => { for (const line of lines.reverse()) e.capture(line); })`.

---

## 2. Performance & 10k-Node Scaling (John Carmack Lens)

### [P1] CRITICAL — `GraphScreen.record()` runs an $O(N \log N)$ array sort, 140 JSI `measureText` calls, ~10 JSI `Skia.Paint` allocations, and up to 64,000 `.toFixed(1)` string allocations *every single frame*
- **Where:** `src/screens/GraphScreen.tsx:77-143`
- **Why it hurts:** `record()` executes on the JS thread on every `requestAnimationFrame` tick (60–120Hz) while physics is active:
  1. **Line 132:** `const order = [...m.ids.keys()].sort((a, b) => m.degree[b] - m.degree[a]);` allocates a 10,000-element array and sorts it every frame, even though `m.degree` is 100% static for the lifetime of `model`.
  2. **Lines 138–139:** Truncates strings and invokes JSI `labelFont.measureText(label).width` up to 140 times per frame for static strings.
  3. **Lines 80–89:** Calls `.toFixed(1)` `2 * E + 4 * N` times per frame (64,000 float-to-string allocations/frame on a 10k-node / 12k-edge vault) to concatenate megabyte-scale SVG strings parsed on the JS thread.
  4. **Lines 90–135:** Allocates fresh `Skia.Paint()` and `Skia.MaskFilter.MakeBlur()` JSI HostObjects every frame instead of caching paints per palette.
- **Exact fix:**
  - Precompute `order: Uint32Array`, truncated `displayLabels: string[]`, and `labelHalfWidths: Float32Array` once inside `buildModel()` (`GraphScreen.tsx:30-65`).
  - Hoist/memoize the 8 `Skia.Paint` objects and the `Blur` `MaskFilter` per `Palette` (`useMemo(() => createGraphPaints(c), [c])`), only updating `edgePaint.setStrokeWidth(1 / Math.max(0.6, scale))` per frame.
  - Build paths using a reusable `Skia.Path.Make()` (`path.moveTo`/`lineTo`/`addCircle`) or `(x | 0)` integer coords when `scale < 1.5` to avoid 64,000 `.toFixed(1)` allocations per frame.

### [P2] HIGH — `HomeHeader` runs 3 full-vault $O(N)$ linear scans on every engine edit — even while `HomeScreen` is hidden behind `NodeScreen` in the stack
- **Where:** `src/screens/HomeScreen.tsx:78-84`, `src/engine/CortexEngine.ts:398-407`, `src/engine/CortexEngine.ts:569-595`
- **Why it hurts:** `Navigator.tsx:18` keeps all screens in the stack mounted. `HomeHeader` subscribes to `useVersion()` (`HomeScreen.tsx:78`). Every time the user types in `NodeScreen` (debounced 450ms) or toggles a task:
  1. `e.pinned()` (`HomeScreen.tsx:80`) iterates all 10,000 nodes in `this.nodes.values()`.
  2. `e.nextActions(null)` (`HomeScreen.tsx:81`) calls `this.pinned()` *again* (another 10,000-node scan) plus walks the entire tree, even though `HomeHeader` only needs the first item (`queue[0]`) and total count.
  3. `e.inbox()` (`HomeScreen.tsx:83`, outside `useMemo`) iterates `this.nodes.values()` a *third* time on every render!
- **Exact fix:** Maintain incremental `private pinnedIds = new Set<NodeId>()` and `private inboxId: NodeId | null = null` inside `CortexEngine.apply()` (`src/engine/CortexEngine.ts:195`), turning `e.pinned()` and `e.inbox()` from $O(N)$ full-vault scans into $O(1)$ lookups.

### [P3] HIGH — `OutlineList` subscribes to global `useVersion()` and re-flattens on every text edit across all mounted screens
- **Where:** `src/ui/Outline.tsx:111-112`, `src/engine/CortexEngine.ts:125-138`
- **Why it hurts:** `OutlineList` subscribes to `useVersion()` (`Outline.tsx:111`). Whenever `BodyEditor` or `TitleEditor` flushes a text edit, `_version` increments and every mounted `OutlineList` in the navigation stack re-runs `flatten(e, rootId, maxDepth)` and creates a brand-new `rows` array reference (`{ id, depth }`), forcing `FlatList` to reconcile all visible cells even though no child list or `collapsed` state changed.
- **Exact fix:** Add a `_treeVersion` counter to `CortexEngine` that only increments in `apply()` when `prevKey !== nextKey || prevLive?.sort !== nextLive?.sort || prevLive?.collapsed !== nextLive?.collapsed`, and subscribe `OutlineList` to `useTreeVersion()` instead of `useVersion()`.

### [P4] HIGH — `CommandPalette` runs `e.search(q, 30)` twice on every keystroke and sorts all 10,000 live nodes on open
- **Where:** `src/ui/CommandPalette.tsx:95`, `src/ui/CommandPalette.tsx:147`, `src/ui/CommandPalette.tsx:153`, `src/ui/CommandPalette.tsx:176-180`
- **Why it hurts:**
  1. On every keystroke, `e.search(text, 30)` runs at line 153 inside `items` `useMemo`, and then runs **a second identical FTS5 query** at line 178 (`const ms = useMemo(...)`) solely to measure elapsed `performance.now()` and discard the result!
  2. When opened with an empty query (line 147), `[...e.allLive()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)` walks the entire 10k-node tree, copies 10,000 objects, and runs an $O(N \log N)$ sort on the JS render path.
- **Exact fix:** Measure `ms` around the single `e.search(text, 30)` call inside the `items` `useMemo` (returning `{ items, ms }`), and find the top-8 recent nodes via a single $O(N)$ partial selection pass (or SQLite `SELECT id FROM nodes WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 8`).

### [P5] MEDIUM — `TrashScreen` executes a synchronous recursive SQLite CTE query (`e.subtreeSql(item.id)`) inside `FlatList.renderItem`
- **Where:** `src/screens/TrashScreen.tsx:46-48`
- **Why it hurts:** Violates Law #3 (*"No I/O, no O(n) scans on the render path"*). For every trashed row rendered while scrolling `TrashScreen`, `renderItem` runs a synchronous `WITH RECURSIVE sub ... SELECT id, depth FROM sub` SQLite query on the UI/JS render path.
- **Exact fix:** Compute trash item counts in memory inside the `items` `useMemo` (`src/screens/TrashScreen.tsx:17`) or via a single grouped query.

### [P6] MEDIUM — `ObserverScreen` animates layout property `paddingBottom: kb.height.value` on every keyboard frame instead of a GPU transform
- **Where:** `src/screens/ObserverScreen.tsx:36-37`, `src/screens/ObserverScreen.tsx:60`
- **Why it hurts:** `const lift = useAnimatedStyle(() => ({ paddingBottom: kb.height.value }));` mutates Yoga `paddingBottom` on the outer `Animated.View` at 60–120Hz while the keyboard slides up/down, triggering a full C++ Yoga layout pass of the entire `ObserverScreen` `ScrollView` and Skia sibling tree on every frame.
- **Exact fix:** Use `transform: [{ translateY: -kb.height.value }]` (matching `ReminderSheet.tsx:51` and `QuickCapture.tsx:64`) or apply `paddingBottom` only to a spacer `<Animated.View>` at the bottom of the `ScrollView`.

### [P7] MEDIUM — `NodeRow` evaluates `e.isLocked(id)` ($O(\text{depth} \times \text{subtree})$) on every row render even when `n.sealed` is `false`
- **Where:** `src/ui/Outline.tsx:254`, `src/ui/Outline.tsx:398`
- **Why it hurts:** Line 254 runs `const sealed = n ? e.isLocked(id) : false;` on every `NodeRow` render, which walks ancestors and performs a DFS `hasOpenTasks` scan, yet line 398 only renders the icon when `{sealed && n.sealed ? ... : null}`.
- **Exact fix:** Short-circuit with `const sealed = n?.sealed ? e.isLocked(id) : false;` at `src/ui/Outline.tsx:254`.

### [P8] MEDIUM — `Outline.tsx` drag-and-drop calls `scheduleOnRN(moveDrag, ev.absoluteY)` on every 120Hz touch sample
- **Where:** `src/ui/Outline.tsx:303-307`
- **Why it hurts:** During a long-press drag, `onUpdate` hops from the UI worklet runtime to the RN JS runtime on every single touch sample (120 times/sec on ProMotion) even when the finger has moved <1px and remains inside the same row zone.
- **Exact fix:** Track `lastY = useSharedValue(-1e9)` on the UI thread and only invoke `scheduleOnRN(moveDrag, ev.absoluteY)` when `Math.abs(ev.absoluteY - lastY.value) > 3`.

---

## 3. UX, Micro-Interactions, Typography & Contrast (Steve Jobs Filter)

### [U1] CRITICAL — `AutopilotScreen` completely omits `n.reminderHook` ("İLK HAREKET KOMUTU" — the Autopilot Hook)
- **Where:** `src/screens/AutopilotScreen.tsx:177-191`, `src/ui/ReminderSheet.tsx:84-98`, `src/engine/types.ts:38-39`
- **Why it breaks the vision:** A signature pillar of Sofia Cortex is the **Autopilot Hook** (`reminderHook`): in `ReminderSheet.tsx:89`, the user writes a literal first physical move for their future self (e.g., *"Masaya otur, fasikülü 25. sayfadan aç"*). When the notification fires (`notify.ts:58`), it routes straight into `AutopilotScreen` (`{ name: 'autopilot', scope: p.nodeId, startId: p.nodeId }`). Yet `TaskStage` in `AutopilotScreen.tsx:183-191` only renders `path`, `n.title`, and `plainPreview(n.body)` — **`n.reminderHook` is never rendered anywhere in `AutopilotScreen`!**
- **Exact fix:** Render `n.reminderHook` as a prominent amber command pill/banner above or below the task title in `src/screens/AutopilotScreen.tsx:189`:
  ```tsx
  {n.reminderHook ? (
    <View style={{ backgroundColor: c.amberSoft, borderColor: c.amber + '55', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 14 }}>
      <Text style={{ fontFamily: font.uiSemi, fontSize: 13, color: c.amber, letterSpacing: 0.2 }}>▶ {n.reminderHook}</Text>
    </View>
  ) : null}
  ```

### [U2] HIGH — Auto-tick cascade choreography violates the 120ms ring-first constitution and plays celebration haptics when *unchecking*
- **Where:** `src/ui/Outline.tsx:66-75`, `src/ui/Outline.tsx:372`, `src/ui/primitives.tsx:113-123`
- **Why it breaks the vision:** `ARCHITECTURE.md` §3 specifies: *"ring closes (spring) → 120 ms → parent blooms → `Success` + heavy double tap."* In the actual code:
  1. When **unchecking** a subtask of a completed parent (`r.done === false`, `r.cascaded.length > 0`), `toggleWithChoreography` still runs `setTimeout(() => haptic.cascade(), 140)` (`NotificationFeedbackType.Success` + Heavy impact), firing a victory fanfare when *re-opening* a task!
  2. When checking the final subtask (`r.done === true`, `r.cascaded.length > 0`), `if (r.cascaded.length > 0)` skips the immediate `haptic.tick()`, leaving 140ms of dead tactile silence when the finger taps the checkbox.
  3. In `ProgressRing` (`primitives.tsx:122`), `full.value` uses `spring.snappy` (`damping: 22, stiffness: 320, mass: 0.7`), which overshoots `1.0`, making `Math.sin(full.value * Math.PI)` go negative at peak and briefly shrinking the ring instead of blooming smoothly.
- **Exact fix:** In `src/ui/Outline.tsx:66-75`, always fire `r.done ? haptic.tick() : haptic.soft()` immediately on tap, and only fire the delayed `setTimeout(() => haptic.cascade(), 140)` when `r.done && r.cascaded.length > 0`:
  ```tsx
  export function toggleWithChoreography(e: CortexEngine, id: NodeId): void {
    const r = e.toggle(id);
    if (r.done) haptic.tick();
    else haptic.soft();
    if (r.cascaded.length > 0) {
      if (r.done) setTimeout(() => haptic.cascade(), 140);
      const top = e.get(r.cascaded[r.cascaded.length - 1]);
      nav().showToast(r.done ? `${top?.title || 'Görev'} tamamlandı` : `${top?.title || 'Görev'} yeniden açıldı`);
    }
  }
  ```

### [U3] HIGH — `ObserverScreen` `DropCapParagraph` sets `fontSize: 46, lineHeight: 31` on an inline `<Text>`, clipping Turkish uppercase diacritics (`Ö`, `İ`, `Ü`, `Ş`, `Ç`)
- **Where:** `src/screens/ObserverScreen.tsx:156-165`
- **Why it breaks the vision:** Because `toThirdPerson` replaces the first `"ben"` with `"Özne"`, the dossier summary frequently starts with `"Ö"` (or `"İ"`, `"Ü"`, `"Ş"`, `"Ç"`). Rendering a 46pt Newsreader glyph inside an inline `<Text>` with `lineHeight: 31` (`15pt` smaller than the font size) clips the top umlaut/dots of `"Ö"` and `"İ"` on iOS CoreText.
- **Exact fix:** Render the drop cap as a side-by-side or proper line-height block (`lineHeight: 48` on the first character or a flex row for the lead line) or set `lineHeight: 44` on the drop-cap span so Turkish diacritics never clip:
  ```tsx
  function DropCapParagraph({ text, ink }: { text: string; ink: string }) {
    const first = text.slice(0, 1);
    const rest = text.slice(1);
    return (
      <Text style={[styles.body, { color: ink, marginTop: 14 }]}>
        <Text style={{ fontFamily: font.serifSemi, fontSize: 38, lineHeight: 40 }}>{first}</Text>
        {rest}
      </Text>
    );
  }
  ```

### [U4] HIGH — `Surface` loses its constitutional 1px Dark Mode specular top highlight (`c.highlight`) on `FocusCard`, `SteepCard`, and `Synapses`
- **Where:** `src/ui/primitives.tsx:48-64`, `src/screens/HomeScreen.tsx:192`, `src/screens/NodeScreen.tsx:280`, `src/screens/NodeScreen.tsx:502`
- **Why it breaks the vision:** `tokens.ts:3` establishes: *"dark is deep obsidian with a specular 1px top highlight on raised surfaces."* `Surface` (`primitives.tsx:54-55`) sets `borderColor: c.cardBorder, borderTopColor: c.scheme === 'dark' ? c.highlight : c.cardBorder`, and then appends caller `style` at the end of the style array. When `FocusCard` (`HomeScreen.tsx:192`), `SteepCard` (`NodeScreen.tsx:280`), or `Synapses` (`NodeScreen.tsx:502`) pass `borderColor` in `style`, React Native's shorthand `borderColor` overrides the earlier `borderTopColor`, erasing the specular highlight on the app's hero cards in Dark mode. Also, in `tokens.ts:121`, Dark mode `invBg` (`#181B22`) is identical to `card` (`#181B22`), so without `borderTopColor: c.highlight`, `FocusCard` blends flatly into ordinary cards.
- **Exact fix:** In `src/ui/primitives.tsx:48-64`, apply `borderTopColor: c.scheme === 'dark' && elevated ? c.highlight : undefined` *after* `style` (or accept a `borderColor` prop on `Surface` so `borderTopColor` is preserved).

### [U5] HIGH — Severe WCAG contrast failures in `light` and `dark` palettes (`textFaint` at 2.14:1–2.66:1, Light `amber` text at 3.03:1, Light `Check` mark at 3.19:1)
- **Where:** `src/theme/tokens.ts:67, 70, 109`, `src/ui/primitives.tsx:97`, `src/screens/AutopilotScreen.tsx:93-94, 185, 222`
- **Verifiable measurements:**
  1. **Light `textFaint` (`#A8A29E`)**: **2.14:1** on `tunnelBg` (`#F1ECE4`, used in `AutopilotScreen.tsx` for the `1 / 5` counter, elapsed timer, path breadcrumb, and `"BİTİNCE BASILI TUT"` hint), **2.20:1** on `surface` (`#F3EFEA`), and **2.40:1** on `bg` (`#FBF9F5`).
  2. **Dark `textFaint` (`#5A5E6A`)**: **2.66:1** on `card` (`#181B22`) and **2.87:1** on `surface` (`#111318`).
  3. **Light `amber` (`#D97706`)**: **3.03:1** on `bg` (`#FBF9F5`) when used for 11pt–12pt text (`NodeScreen.tsx:94` `MÜHÜRLÜ` label, `Outline.tsx:402` completed progress fraction, `ReminderSheet.tsx:89` `İLK HAREKET KOMUTU`).
  4. **Light `Check` checkmark (`primitives.tsx:97`)**: uses `stroke={c.scheme === 'dark' ? c.bg : c.card}` (`#FFFFFF` on `#D97706` = **3.19:1**), whereas `HomeScreen.tsx:207` and `ReminderSheet.tsx:130` correctly use `c.onAmber` (`#1C1917` on `#D97706` = **5.49:1**).
- **Exact fix:**
  - In `src/theme/tokens.ts:67`: darken `light.textFaint` from `'#A8A29E'` to `'#8A847E'` (~3.6:1 on `bg`, ~3.2:1 on `tunnelBg`).
  - In `src/theme/tokens.ts:109`: lighten `dark.textFaint` from `'#5A5E6A'` to `'#6E7381'` (~4.2:1 on `bg`, ~3.6:1 on `card`).
  - In `src/ui/primitives.tsx:97`: use `stroke={c.onAmber}` (or keep `#FFF` only if `light.amber` is darkened to `#B45309`).

### [U6] MEDIUM — Tapping an outgoing `#tag` chip in `NodeScreen` `Synapses` opens an empty `CommandPalette` instead of filtering by that tag
- **Where:** `src/screens/NodeScreen.tsx:520-525` vs. `src/ui/richText.tsx:21-28`
- **Why it breaks:** When tapping a `#tag` inside body text (`richText.tsx:24`), `followRef` opens the palette and pre-fills the tag via `paletteQuery.set?.(text)`. When tapping the exact same `#tag` chip in the `Synapses` footer (`NodeScreen.tsx:523`), it calls `nav().openPalette({ mode: 'search' })` without calling `followRef(o.key, o.key, 'tag')` or setting `paletteQuery`, leaving the search input blank.
- **Exact fix:** Replace `NodeScreen.tsx:520-524` with `onPress={() => followRef(o.key, o.target?.title ?? o.key, o.kind)}`.

### [U7] MEDIUM — `NodeScreen` `Toolbar` squeezes 8 `ToolButton`s (`384pt` minimum width) into a single non-wrapping row, overflowing 375pt viewports
- **Where:** `src/screens/NodeScreen.tsx:170-247`, `src/screens/NodeScreen.tsx:544`, `src/ui/primitives.tsx:158`
- **Why it breaks:** `Toolbar` renders 8 `ToolButton` items (`Görev/Not`, `Dış Göz`, `Otopilot`, `Vitrin`, `Mühür`, `Hatırlat`, `Işınla`, `Sil`), each with `minWidth: 44` (`8 × 44 = 352pt`) inside `paddingHorizontal: space.l` (`2 × 16 = 32pt`), totaling `384pt` minimum width. On 375pt screens (iPhone SE / mini / zoomed display), the buttons collide and overflow the right margin.
- **Exact fix:** Wrap `Toolbar` in a horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}` and `contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: space.l, gap: 6 }}`, or reduce `minWidth` in `ToolButton` (`primitives.tsx:158`) from `44` to `40`.

### [U8] MEDIUM — `HomeScreen` `Portal` card body preview strips only `[[` and `]]`, leaking raw `Target|Alias` syntax
- **Where:** `src/screens/HomeScreen.tsx:250-252`
- **Why it breaks:** `Portal` renders `{n.body.replace(/\[\[|\]\]/g, '')}` instead of calling `plainPreview(n.body, 120)` (`src/ui/richText.tsx:10`), so aliased wikilinks like `[[Matematik|türev]]` display as `"Matematik|türev"` on the Home showcase cards.
- **Exact fix:** Replace `n.body.replace(/\[\[|\]\]/g, '')` at `src/screens/HomeScreen.tsx:251` with `plainPreview(n.body, 120)`.

### [U9] MEDIUM — Sealing a node with 0 open tasks (`NodeScreen`) shows a false `"Plan mühürlendi — şimdi yürüt"` toast while the seal immediately dissolves
- **Where:** `src/screens/NodeScreen.tsx:214-223`, `src/engine/CortexEngine.ts:532-543`
- **Why it breaks:** `CortexEngine.activeSeal(id)` only considers a seal active when `cur.sealed && this.hasOpenTasks(cur.id)`. If a user taps `"Mühür"` on a note or a project with no open tasks, `node.sealed` becomes `true` and the toast announces `"Plan mühürlendi — şimdi yürüt"`, but `locked` (`e.isLocked(node.id)`) remains `false` — no seal banner appears and nothing is locked.
- **Exact fix:** Disable the `"Mühür"` `ToolButton` when `!node.sealed && !hasTasks` (or when `e.nextActions(node.id, 1).length === 0`), matching the `"Otopilot"` button right next to it (`NodeScreen.tsx:197`).

### [U10] LOW — Haptic vocabulary inconsistencies on Undo and Seal actions
- **Where:** `App.tsx:69`, `src/ui/Toast.tsx:39`, `src/ui/CommandPalette.tsx:135`
- **Why it breaks the constitution:** `CLAUDE.md` Law #7 defines `lens` strictly as *"Observer/Autopilot switch"*. Yet `App.tsx:69` (shake-to-undo) and `Toast.tsx:39` (toast undo button) fire `haptic.lens()`, while `CommandPalette.tsx:135` (`> Geri al`) fires no haptic at all.
- **Exact fix:** Use `haptic.soft()` (or `haptic.select()`) consistently across `App.tsx:69`, `Toast.tsx:39`, and `CommandPalette.tsx:135`.

---

## Top-5 "Must Fix Before Screenshots"

1. **[U1] Render `n.reminderHook` ("İLK HAREKET KOMUTU") inside `AutopilotScreen` (`src/screens/AutopilotScreen.tsx:189`)** — Right now the Autopilot Hook feature authored in `ReminderSheet` is completely invisible on the Autopilot screen itself.
2. **[R1 + R2] Fix `GraphScreen` camera pinch/pan conflict (`maxPointers: 1` + incremental delta math) and dead `fitCamera(true)` on physics sleep (`src/screens/GraphScreen.tsx:199-267`)** — Ensures the graph auto-frames cleanly once Barnes-Hut settles and doesn't jitter during two-finger pinch-zoom.
3. **[U3 + R8] Fix `ObserverScreen` `DropCapParagraph` `lineHeight` clipping on Turkish uppercase diacritics (`Ö`, `İ`, `Ü`, `Ş`, `Ç`) and `observer.ts` conditional/predicate transforms (`src/screens/ObserverScreen.tsx:156-165`, `src/engine/observer.ts:78, 92`)** — Directly impacts the visual centerpiece of the "Dış Göz" dossier screenshot (where paragraphs begin with `"Özne"`).
4. **[R12 + U4] Move `<TopScrim />` after `<OutlineList />` in `NodeScreen.tsx:36-37` and preserve Dark Mode's 1px specular `borderTopColor: c.highlight` in `Surface` (`src/ui/primitives.tsx:55`, `src/screens/HomeScreen.tsx:192`)** — Restores the status-bar dissolve on `NodeScreen` and the constitutional top-edge specular highlight on Dark mode's hero `FocusCard`, `SteepCard`, and `Synapses`.
5. **[U5 + U8] Fix `textFaint` contrast on `AutopilotScreen` / `HomeScreen` (`src/theme/tokens.ts:67, 109`) and use `plainPreview` in `HomeScreen` `Portal` cards (`src/screens/HomeScreen.tsx:251`)** — Makes the Autopilot HUD (`1 / 5`, timer, `"BİTİNCE BASILI TUT"`) and Home metadata legible in both Light ("Kağıt") and Dark ("Karbon") screenshots.
