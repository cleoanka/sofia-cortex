# Sofia Cortex — working rules

Read `ARCHITECTURE.md` first. This file is the short list of laws.

## Stack
Expo SDK 58 · React Native 0.88 (New Architecture) · TypeScript strict · expo-sqlite (WAL, FTS5) ·
@shopify/react-native-skia 2 · Reanimated 4 + react-native-worklets 0.13 · Gesture Handler 3
(**hook API**: `usePanGesture`, `useCompetingGestures`… — events are flat: `e.translationX`) ·
expo-haptics · expo-notifications · zustand.

* Worklet → JS: `scheduleOnRN(fn, ...args)` from `react-native-worklets` (not `runOnJS`).
* Gestures that only do JS work: pass `runOnJS: true` in the gesture config.
* Navigation is the custom zoom-portal `Navigator` — deliberately **not** Expo Router (see ARCHITECTURE §5).

## Commands
```bash
bun test                    # engine, links, physics, edge cases (115 tests)
npx tsc --noEmit            # strict, noUnusedLocals
npx expo run:ios            # simulator dev build
npx expo run:ios --device   # physical iPhone (USB/Wi-Fi)
```

## Laws
1. **Engine purity.** `src/engine/**` and `src/graph/**` import nothing from React/Expo. Every
   storage access goes through `SqlDriver`. New behaviour → test in `tests/` with `bun:sqlite`.
2. **All writes through `transact`.** Never mutate a `CortexNode` in place; `put({...n, x})`.
   Labels are Turkish, user-facing (they show in the undo capsule).
3. **No I/O, no O(n) scans on the render path.** Components subscribe per id
   (`useNode/useChildren/useProgress`); `useVersion` only for derived views.
4. **Design tokens only.** Every colour, font, spacing and radius comes from
   `src/theme/tokens.ts`; motion from `src/theme/motion.ts`. Never raw `#FFFFFF`/`#000000`.
5. **Calm motion.** `withTiming` 150–220 ms `Easing.out(cubic)` only. No springs, no scale, no bounce.
6. **Apple Notes is the bar.** No uppercase meta labels, no invented words (Işınla, Mühür,
   Vitrin…). Plain lines have no marker — only tasks (☑) and lists (•, 1.) do. UI font is SF
   (`sf.*` in tokens), never a bundled font. The note top bar is: ‹ Geri · Otopilot · Dış Göz · Sil · ••• (pin, move,
   reminder, task/note, lock plan). Links are `&Başlık&` only.
7. **Haptic vocabulary** (`platform/haptics.ts`): tick = subtask, cascade = auto-complete,
   lens = Observer/Autopilot switch, select = structure change, thud = commit/drop, warn = blocked.
8. **Locked plan is law.** Structural writes inside an unfinished sealed plan throw `SealedError`;
   UI wraps them in `guard()` (`src/ui/actions.ts`). Delete is a hard delete with one-step undo.
9. **Keyboard never covers a field.** Scrolling screens with inputs use `KeyboardScrollView`;
   anything else reads `useKeyboardHeight()`. New editable fields call `nudgeCaret()` on focus.
10. **Empty is not work.** Draft tasks (`isDraft`) never count, never enter Autopilot.
11. **Turkish text** — `toLocaleLowerCase('tr-TR')`; in regexes never trust `\b` (ASCII-only).

## Design tokens (summary)
Light: bg `#F2F2F7`, cards/paper `#FFFFFF`, hairline `#DCDCE0`, text `#1C1C1E`/`#8A8A8E`, accent amber `#E59A00`.
Dark: bg/paper `#000000`, cards `#1C1C1E`, hairline `#38383A`, text `#FFFFFF`/`#8D8D93`, accent `#F0A500`.
Highlighter: `hlYellow/hlGreen/hlBlue/hlPink`. Reading view (Dış Göz): `obs*` tokens + Newsreader serif.
