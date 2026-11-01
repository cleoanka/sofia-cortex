import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItem, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Extrapolation,
  FadeIn,
  LinearTransition,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { SealedError, type CortexEngine } from '../engine/CortexEngine';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine, useNode, useProgress, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { useSheet } from '../state/sheet';
import { usePalette } from '../theme/ThemeProvider';
import { font, spring, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Check, ProgressRing } from './primitives';
import { plainPreview } from './richText';
import { CASCADE_DELAY, markCascade } from './choreo';

export const INDENT = 22;
const SWIPE_IN = 64;
const SWIPE_OUT = -64;
const SWIPE_BELL = -150;

type Row = { id: NodeId; depth: number };

// ───────────────────────────── drag state ─────────────────────────────

type DropTarget = { id: NodeId; zone: 'inside' | 'before' | 'after' } | null;
const useDrag = create<{ dragging: NodeId | null; target: DropTarget }>(() => ({ dragging: null, target: null }));

interface DragApi {
  register: (id: NodeId, v: RowRef | null) => void;
  start: (id: NodeId) => void;
  move: (pageY: number) => void;
  /** true when the row was re-parented/re-ordered (layout animation takes over). */
  end: () => boolean;
}
const DragCtx = createContext<DragApi | null>(null);
type RowRef = React.ComponentRef<typeof View>;

/** Shows an inline undo hint for cascades, and a gentle warning when a seal blocks a change. */
export function guard(fn: () => void, sealedText = 'Plan mühürlü — önce yürüt'): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof SealedError) {
      haptic.warn();
      nav().showToast(sealedText, false);
      return false;
    }
    throw e;
  }
}

export function toggleWithChoreography(e: CortexEngine, id: NodeId): void {
  const ancestors = e.path(id).slice(0, -1).map((n) => n.id).reverse();
  // Mark before the write so ancestors' checks already know to wait.
  markCascade(ancestors);
  const r = e.toggle(id);
  const top = e.get(r.cascaded[r.cascaded.length - 1]);
  if (r.cascaded.length > 0 && r.done) {
    haptic.tick();
    // Ring closes first (≈120ms), then the parent celebrates.
    setTimeout(() => haptic.cascade(), CASCADE_DELAY * r.cascaded.length);
    nav().showToast(`${top?.title || 'Görev'} tamamlandı`);
  } else if (r.cascaded.length > 0) {
    haptic.soft();
    nav().showToast(`${top?.title || 'Görev'} yeniden açıldı`);
  } else if (r.done) haptic.tick();
  else haptic.soft();
}

function flatten(e: CortexEngine, rootId: NodeId | null, maxDepth: number): Row[] {
  const out: Row[] = [];
  const walk = (pid: NodeId | null, depth: number) => {
    for (const id of e.children(pid)) {
      const n = e.get(id)!;
      if (pid === null && n.role === 'inbox') continue;
      out.push({ id, depth });
      if (!n.collapsed && depth < maxDepth) walk(id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}

// ───────────────────────────── list ─────────────────────────────

export function OutlineList({
  rootId,
  header,
  footer,
  maxDepth = 2,
  onScroll,
  onScrollEndDrag,
  contentBottom = 140,
}: {
  rootId: NodeId | null;
  header?: React.ReactElement;
  footer?: React.ReactElement;
  maxDepth?: number;
  onScroll?: (y: number) => void;
  onScrollEndDrag?: (y: number) => void;
  contentBottom?: number;
}) {
  const e = useEngine();
  const version = useVersion();
  const rows = useMemo(() => flatten(e, rootId, maxDepth), [e, rootId, maxDepth, version]);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const refs = useRef(new Map<NodeId, RowRef>());
  const frames = useRef(new Map<NodeId, { y: number; h: number }>());

  const api = useMemo<DragApi>(
    () => ({
      register: (id, v) => {
        if (v) refs.current.set(id, v);
        else refs.current.delete(id);
      },
      start: (id) => {
        haptic.thud();
        setScrollEnabled(false);
        useDrag.setState({ dragging: id, target: null });
        frames.current.clear();
        for (const [rid, v] of refs.current) v.measureInWindow((_x: number, y: number, _w: number, h: number) => frames.current.set(rid, { y, h }));
      },
      move: (pageY) => {
        const dragging = useDrag.getState().dragging;
        if (!dragging) return;
        let next: DropTarget = null;
        for (const [rid, f] of frames.current) {
          if (rid === dragging || pageY < f.y || pageY > f.y + f.h) continue;
          if (e.isDescendant(rid, dragging)) break;
          const t = (pageY - f.y) / f.h;
          next = { id: rid, zone: t < 0.28 ? 'before' : t > 0.72 ? 'after' : 'inside' };
          break;
        }
        const cur = useDrag.getState().target;
        if (cur?.id !== next?.id || cur?.zone !== next?.zone) {
          if (next) haptic.select();
          useDrag.setState({ target: next });
        }
      },
      end: () => {
        const { dragging, target } = useDrag.getState();
        useDrag.setState({ dragging: null, target: null });
        setScrollEnabled(true);
        if (!dragging || !target) return false;
        const t = e.get(target.id)!;
        guard(() => {
          if (target.zone === 'inside') {
            e.move(dragging, target.id);
            if (t.collapsed) e.setCollapsed(target.id, false);
            haptic.thud();
            nav().showToast(`“${e.get(dragging)?.title}” → ${t.title || 'Adsız'}`);
          } else {
            const sibs = e.children(t.parentId).filter((x) => x !== dragging);
            const i = sibs.indexOf(target.id) + (target.zone === 'after' ? 1 : 0);
            e.move(dragging, t.parentId, i);
            haptic.soft();
          }
        });
        return true;
      },
    }),
    [e],
  );

  // Pinch: fingers apart → expand all, together → collapse all.
  const pinched = useRef(false);
  const pinch = usePinchGesture({
    runOnJS: true,
    onActivate: () => {
      pinched.current = false;
    },
    onUpdate: (ev) => {
      if (pinched.current) return;
      if (ev.scale < 0.78 || ev.scale > 1.28) {
        pinched.current = true;
        const collapse = ev.scale < 1;
        e.setCollapsedDeep(rootId, collapse);
        haptic.lens();
        nav().showToast(collapse ? 'Tümü katlandı' : 'Tümü açıldı', false);
      }
    },
  });

  const renderItem = useCallback<ListRenderItem<Row>>(({ item }) => <NodeRow id={item.id} depth={item.depth} maxDepth={maxDepth} />, [maxDepth]);

  return (
    <DragCtx.Provider value={api}>
      <GestureDetector gesture={pinch}>
        <View style={{ flex: 1 }}>
          <FlatList
            data={rows}
            keyExtractor={keyOf}
            renderItem={renderItem}
            CellRendererComponent={LiftableCell}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            contentContainerStyle={{ paddingBottom: contentBottom }}
            scrollEnabled={scrollEnabled}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            initialNumToRender={18}
            windowSize={9}
            removeClippedSubviews={false}
            scrollEventThrottle={16}
            onScroll={onScroll ? (ev) => onScroll(ev.nativeEvent.contentOffset.y) : undefined}
            onScrollEndDrag={onScrollEndDrag ? (ev) => onScrollEndDrag(ev.nativeEvent.contentOffset.y) : undefined}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </GestureDetector>
    </DragCtx.Provider>
  );
}

const keyOf = (r: Row) => r.id;

/** FlatList cells are siblings; zIndex must live on the cell for a dragged row to float above the rest. */
function LiftableCell({ item, style, children, ...rest }: { item: Row; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const lifted = useDrag((s) => s.dragging === item.id);
  return (
    <View {...rest} style={[style, lifted && { zIndex: 999, elevation: 12 }]}>
      {children}
    </View>
  );
}

// ───────────────────────────── row ─────────────────────────────

export const NodeRow = memo(function NodeRow({ id, depth, maxDepth = 2, standalone }: { id: NodeId; depth: number; maxDepth?: number; standalone?: boolean }) {
  const e = useEngine();
  const n = useNode(id);
  const prog = useProgress(id);
  const c = usePalette();
  const drag = useContext(DragCtx);
  const ref = useRef<RowRef>(null);
  const isDragging = useDrag((s) => s.dragging === id);
  const zone = useDrag((s) => (s.target?.id === id ? s.target.zone : null));

  useEffect(() => {
    drag?.register(id, ref.current);
    return () => drag?.register(id, null);
  }, [drag, id]);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lift = useSharedValue(0);
  const lastZone = useSharedValue(0);
  const pulse = useSharedValue(0);
  const lastHopY = useSharedValue(-1000);

  useEffect(() => {
    lift.value = withSpring(isDragging ? 1 : 0, spring.snappy);
  }, [isDragging]);
  useEffect(() => {
    pulse.value = zone === 'inside' ? withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.35, { duration: 420 })), -1, true) : withSpring(0);
  }, [zone]);

  const hasKids = e.hasChildren(id);
  const sealed = n?.sealed ? e.isLocked(id) : false;

  const doIndent = useCallback(() => {
    if (guard(() => e.indent(id))) haptic.select();
  }, [e, id]);
  const doOutdent = useCallback(() => {
    if (guard(() => e.outdent(id))) haptic.select();
  }, [e, id]);
  const doBell = useCallback(() => {
    haptic.lens();
    useSheet.getState().open({ kind: 'reminder', id });
  }, [id]);

  const swipe = usePanGesture({
    enabled: !standalone,
    activeOffsetX: [-16, 16],
    failOffsetY: [-10, 10],
    onUpdate: (ev) => {
      'worklet';
      const x = ev.translationX;
      tx.value = x > 0 ? Math.min(x, 120) * 0.85 : Math.max(x, -210) * 0.85;
      const z = x > SWIPE_IN ? 1 : x < SWIPE_BELL ? -2 : x < SWIPE_OUT ? -1 : 0;
      if (z !== lastZone.value) {
        lastZone.value = z;
        if (z !== 0) scheduleOnRN(haptic.select);
      }
    },
    onDeactivate: (ev) => {
      'worklet';
      const x = ev.canceled ? 0 : ev.translationX;
      if (x > SWIPE_IN) scheduleOnRN(doIndent);
      else if (x < SWIPE_BELL) scheduleOnRN(doBell);
      else if (x < SWIPE_OUT) scheduleOnRN(doOutdent);
      tx.value = withSpring(0, spring.snappy);
      lastZone.value = 0;
    },
  });

  const startDrag = useCallback(() => drag?.start(id), [drag, id]);
  const moveDrag = useCallback((y: number) => drag?.move(y), [drag]);
  const endDrag = useCallback(() => {
    const moved = drag?.end() ?? false;
    // A real move: the layout transition carries the row to its new slot, so the
    // finger offset is dropped at once. A cancelled drag springs back home.
    ty.value = moved ? 0 : withSpring(0, spring.snappy);
  }, [drag]);

  const dnd = usePanGesture({
    enabled: !standalone && !!drag,
    activateAfterLongPress: 320,
    onActivate: () => {
      'worklet';
      scheduleOnRN(startDrag);
    },
    onUpdate: (ev) => {
      'worklet';
      ty.value = ev.translationY;
      // Hit-testing lives on JS; only hop when the finger moved meaningfully.
      if (Math.abs(ev.absoluteY - lastHopY.value) > 6) {
        lastHopY.value = ev.absoluteY;
        scheduleOnRN(moveDrag, ev.absoluteY);
      }
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(endDrag);
    },
  });

  const gesture = useCompetingGestures(dnd, swipe);

  const content = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  const shell = useAnimatedStyle(() => ({
    zIndex: lift.value > 0.01 ? 10 : 0,
    shadowOpacity: lift.value * 0.9,
    transform: [{ translateY: ty.value }, { scale: 1 + lift.value * 0.025 }],
  }));
  const reveal = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(tx.value), [8, 50], [0, 1], Extrapolation.CLAMP),
  }));
  const inside = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.012 }],
  }));

  if (!n) return null;
  const preview = plainPreview(n.body);
  const open = () => {
    haptic.soft();
    nav().push({ name: 'node', id });
  };
  const expanded = hasKids && !n.collapsed && depth < maxDepth;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={ref}
        collapsable={false}
        entering={FadeIn.springify().damping(20)}
        layout={LinearTransition.springify().damping(24).stiffness(260)}
        style={[{ shadowColor: c.shadow, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }, shell]}
      >
        {/* swipe affordances — revealed under the row */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.reveal, reveal]} pointerEvents="none">
          <View style={styles.revealSide}>
            <Icon name="chevron" size={16} color={c.accent} />
            <Text style={[styles.revealText, { color: c.accent }]}>İçeri</Text>
          </View>
          <View style={[styles.revealSide, { justifyContent: 'flex-end' }]}>
            <Text style={[styles.revealText, { color: c.textDim }]}>Dışarı · Hatırlat</Text>
            <Icon name="bell" size={15} color={c.textDim} />
          </View>
        </Animated.View>

        <Animated.View style={[{ backgroundColor: c.bg }, content]}>
          {zone === 'inside' ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.insideGlow, { backgroundColor: c.accentSoft, borderColor: c.accent }, inside]} /> : null}
          {zone === 'before' ? <View style={[styles.insertLine, { top: 0, backgroundColor: c.accent, left: 20 + depth * INDENT }]} /> : null}
          {zone === 'after' ? <View style={[styles.insertLine, { bottom: 0, backgroundColor: c.accent, left: 20 + depth * INDENT }]} /> : null}

          <View style={[styles.row, { paddingLeft: 20 + depth * INDENT }]}>
            {Array.from({ length: depth }).map((_, i) => (
              <View key={i} style={[styles.guide, { left: 20 + i * INDENT + 10, backgroundColor: c.hairline }]} />
            ))}
            <View style={styles.lead}>
              {n.isTask ? (
                <Check id={id} done={n.done} onPress={() => toggleWithChoreography(e, id)} />
              ) : (
                <View style={[styles.bullet, { backgroundColor: hasKids ? 'transparent' : c.textFaint, borderColor: hasKids ? c.textDim : 'transparent' }]} />
              )}
            </View>
            <View style={{ flex: 1, paddingVertical: 11 }}>
              <Text
                onPress={open}
                suppressHighlighting
                style={[
                  type.row,
                  depth === 0 && !n.isTask ? { fontFamily: font.uiSemi, letterSpacing: -0.35 } : null,
                  { color: n.done ? c.textFaint : c.text },
                  n.done && { textDecorationLine: 'line-through', textDecorationColor: c.textFaint },
                ]}
              >
                {n.title || <Text style={{ color: c.textFaint }}>Adsız</Text>}
              </Text>
              {preview && !n.done ? (
                <Text onPress={open} suppressHighlighting numberOfLines={1} style={[type.small, { color: c.textDim, marginTop: 2 }]}>
                  {preview}
                </Text>
              ) : null}
            </View>
            <View style={styles.trail}>
              {n.pinned && !standalone ? <Icon name="pin" size={13} color={c.textFaint} /> : null}
              {sealed && n.sealed ? <Icon name="seal" size={15} color={c.amber} /> : null}
              {n.reminderAt && n.reminderAt > Date.now() ? <Icon name="bell" size={13} color={c.accent} /> : null}
              {prog.total > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[type.mono, { color: prog.done === prog.total ? c.amberInk : c.textDim }]}>
                    {prog.done}/{prog.total}
                  </Text>
                  <ProgressRing done={prog.done} total={prog.total} size={18} stroke={2.2} label={false} />
                </View>
              ) : null}
              {hasKids ? (
                <Disclosure
                  open={expanded}
                  disabled={depth >= maxDepth}
                  onPress={() => {
                    if (depth >= maxDepth) return open();
                    haptic.select();
                    e.setCollapsed(id, !n.collapsed);
                  }}
                />
              ) : null}
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});

function Disclosure({ open, onPress, disabled }: { open: boolean; onPress: () => void; disabled?: boolean }) {
  const c = usePalette();
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    r.value = withSpring(open ? 1 : 0, spring.snappy);
  }, [open]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 90}deg` }] }));
  return (
    <Pressable onPress={onPress} hitSlop={14} accessibilityRole="button" accessibilityLabel={open ? 'Katla' : 'Aç'}>
      <Animated.View style={[{ padding: 2 }, s]}>
        <Icon name="chevron" size={16} color={disabled ? c.textFaint : c.textDim} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 16, minHeight: 48 },
  lead: { width: 34, paddingTop: 12, alignItems: 'flex-start' },
  bullet: { width: 7, height: 7, borderRadius: 4, marginTop: 8, marginLeft: 7, borderWidth: 1.5 },
  trail: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 13, paddingLeft: 10 },
  guide: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  reveal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  revealSide: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  revealText: { fontFamily: font.uiMedium, fontSize: 12.5 },
  insideGlow: { borderRadius: 12, borderWidth: 1, marginHorizontal: 10 },
  insertLine: { position: 'absolute', right: 18, height: 2, borderRadius: 1 },
});

export { useDrag };
