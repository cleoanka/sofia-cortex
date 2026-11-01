import { BlurStyle, Canvas, Group, Picture, Skia, matchFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { fadeIn, fadeOut, t200 } from '../theme/motion';
import { followRef } from '../ui/richText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { CortexEngine } from '../engine/CortexEngine';
import type { NodeId } from '../engine/types';
import { ForceSim } from '../graph/physics';
import { haptic } from '../platform/haptics';
import { useEngine, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { radius, type, type Palette, sf } from '../theme/tokens';
import { BackButton, ProgressRing, Surface, Tap, TopBar } from '../ui/primitives';

type Kind = 0 | 1 | 2 | 3 | 4; // note, active task, done task, tag, blocked (sealed/has open subtasks)

interface Model {
  ids: string[];
  kinds: Uint8Array;
  radii: Float32Array;
  labels: string[];
  edges: { a: number; b: number; w: number }[];
  degree: Uint16Array;
  /** Label priority (hubs first) — computed once per model, not per frame. */
  order: number[];
  /** Truncated label + measured width cache. */
  text: { label: string; w: number }[];
}

const labelFont = matchFont({ fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }), fontSize: 11, fontWeight: '500' });

function buildModel(e: CortexEngine, focus: NodeId | null, filters: Filters): Model {
  const g = e.graph(focus ? { id: focus, depth: 2 } : undefined);
  const keep: number[] = [];
  const kindOf = (id: string): Kind => {
    if (id.startsWith('#')) return 3;
    const n = e.get(id)!;
    if (!n.isTask) return 0;
    if (n.done) return 2;
    return e.isLocked(id) || e.progress(id).total > 0 ? 4 : 1;
  };
  const kinds0 = g.ids.map(kindOf);
  g.ids.forEach((id, i) => {
    const k = kinds0[i];
    if (id === focus) return keep.push(i);
    if (k === 3 && !filters.tags) return;
    if ((k === 1 || k === 2 || k === 4) && !filters.tasks) return;
    if (k === 0 && !filters.notes) return;
    if (k === 2 && !filters.done) return;
    keep.push(i);
  });
  const remap = new Int32Array(g.ids.length).fill(-1);
  keep.forEach((old, i) => (remap[old] = i));
  const edges = g.edges.filter((ed) => remap[ed.a] >= 0 && remap[ed.b] >= 0).map((ed) => ({ a: remap[ed.a], b: remap[ed.b], w: ed.w }));
  const degree = new Uint16Array(keep.length);
  for (const ed of edges) (degree[ed.a]++, degree[ed.b]++);
  const kinds = new Uint8Array(keep.length);
  const radii = new Float32Array(keep.length);
  const labels: string[] = [];
  keep.forEach((old, i) => {
    const id = g.ids[old];
    kinds[i] = kinds0[old];
    radii[i] = kinds[i] === 3 ? 3.4 : 3.6 + Math.min(9, Math.sqrt(degree[i]) * 1.9);
    labels.push(id.startsWith('#') ? id.slice(1) : e.get(id)?.role === 'table' ? 'Tablo' : e.get(id)?.title || 'Adsız');
  });
  const order = [...labels.keys()].sort((a, b) => degree[b] - degree[a] || radii[b] - radii[a]);
  const text = labels.map((l) => {
    const raw = l.replace(/→/g, '›');
    const label = raw.length > 24 ? raw.slice(0, 23).trimEnd() + '…' : raw;
    return { label, w: labelFont.measureText(label).width };
  });
  return { ids: keep.map((o) => g.ids[o]), kinds, radii, labels, edges, degree, order, text };
}

interface Filters {
  tasks: boolean;
  notes: boolean;
  tags: boolean;
  done: boolean;
}


type Paints = ReturnType<typeof makePaints>;
const placed: number[] = [];

/** Every paint the graph uses, allocated once per palette. */
function makePaints(c: Palette) {
  const paint = (color: string, stroke = 0) => {
    const p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(color));
    if (stroke) {
      p.setStyle(1);
      p.setStrokeWidth(stroke);
    }
    return p;
  };
  const halo = paint(c.amber);
  halo.setAlphaf(0.45);
  halo.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true));
  return {
    edge: paint(c.graphEdge, 1),
    halo,
    done: paint(c.amber),
    note: paint(c.graphNode),
    activeFill: paint(c.graphBg),
    activeRing: paint(c.accent, 1.8),
    blockedFill: paint(c.accentSoft),
    blockedRing: paint(c.accent, 2.6),
    tag: paint(c.graphTag),
    select: paint(c.text, 1.5),
    label: paint(c.textDim),
    labelStrong: paint(c.text),
  };
}

/** Records one frame as a single SkPicture: five paths, one blur, ≤140 labels. Nothing else allocates. */
function record(m: Model, sim: ForceSim, P: Paints, selected: number, scale: number): SkPicture {
  const xs = sim.xs;
  const ys = sim.ys;
  let edges = '';
  for (const ed of m.edges) edges += `M${xs[ed.a].toFixed(1)} ${ys[ed.a].toFixed(1)}L${xs[ed.b].toFixed(1)} ${ys[ed.b].toFixed(1)}`;
  const buckets = ['', '', '', '', ''];
  for (let i = 0; i < m.ids.length; i++) {
    const r = m.radii[i];
    const x = xs[i];
    const y = ys[i];
    if (m.kinds[i] === 3) buckets[3] += `M${(x - r).toFixed(1)} ${y.toFixed(1)}l${r} ${-r}l${r} ${r}l${-r} ${r}Z`;
    else buckets[m.kinds[i]] += `M${(x + r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;
  }
  const rec = Skia.PictureRecorder();
  const cv = rec.beginRecording(Skia.XYWHRect(-1e5, -1e5, 2e5, 2e5));
  const ep = Skia.Path.MakeFromSVGString(edges);
  if (ep) {
    P.edge.setStrokeWidth(1 / Math.max(0.6, scale));
    cv.drawPath(ep, P.edge);
  }
  const p2 = buckets[2] && Skia.Path.MakeFromSVGString(buckets[2]);
  if (p2) {
    cv.drawPath(p2, P.halo);
    cv.drawPath(p2, P.done);
  }
  const p0 = buckets[0] && Skia.Path.MakeFromSVGString(buckets[0]);
  if (p0) cv.drawPath(p0, P.note);
  const p1 = buckets[1] && Skia.Path.MakeFromSVGString(buckets[1]);
  if (p1) {
    cv.drawPath(p1, P.activeFill);
    cv.drawPath(p1, P.activeRing);
  }
  const p4 = buckets[4] && Skia.Path.MakeFromSVGString(buckets[4]);
  if (p4) {
    cv.drawPath(p4, P.blockedFill);
    cv.drawPath(p4, P.blockedRing);
  }
  const p3 = buckets[3] && Skia.Path.MakeFromSVGString(buckets[3]);
  if (p3) cv.drawPath(p3, P.tag);

  if (selected >= 0) cv.drawCircle(xs[selected], ys[selected], m.radii[selected] + 6, P.select);

  // Labels: hubs first, then greedy collision culling — a label that would
  // overlap one already placed is skipped, so text never piles up.
  const budget = scale > 1.2 ? 140 : scale > 0.7 ? 70 : 40;
  placed.length = 0;
  const pad = 3 / Math.max(0.5, scale);
  let drawn = 0;
  for (let k = -1; k < m.order.length && drawn < budget; k++) {
    const i = k < 0 ? selected : m.order[k];
    if (i < 0 || (k >= 0 && i === selected)) continue;
    const { label, w } = m.text[i];
    const x0 = xs[i] - w / 2 - pad;
    const y0 = ys[i] + m.radii[i] + 2;
    const x1 = x0 + w + pad * 2;
    const y1 = y0 + 14 + pad;
    let hit = false;
    for (let q = 0; q < placed.length && !hit; q += 4) hit = x0 < placed[q + 2] && x1 > placed[q] && y0 < placed[q + 3] && y1 > placed[q + 1];
    if (hit && i !== selected) continue;
    placed.push(x0, y0, x1, y1);
    drawn++;
    cv.drawText(label, xs[i] - w / 2, ys[i] + m.radii[i] + 13, i === selected || m.degree[i] > 3 ? P.labelStrong : P.label, labelFont);
  }
  return rec.finishRecordingAsPicture();
}

/** Skia's Picture node rejects null; the first frame draws an empty recording. */
function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

export function GraphScreen({ focus: initialFocus }: { focus?: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [focus, setFocus] = useState<NodeId | null>(initialFocus ?? null);
  const [filters] = useState<Filters>({ tasks: true, notes: true, tags: true, done: true });
  const [selected, setSelected] = useState(-1);
  const model = useMemo(() => buildModel(e, focus, filters), [e, focus, filters, v]);
  const paints = useMemo(() => makePaints(c), [c]);
  const sim = useRef(new ForceSim({ springLength: 54, sleepEnergy: 0.04 })).current;
  const pic = useSharedValue<SkPicture>(emptyPicture());
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const scaleJS = useRef(1);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const selRef = useRef(-1);
  const fitted = useRef(false);
  const userMoved = useRef(false);
  const frame = useRef(0);

  const draw = useCallback(() => {
    pic.value = record(model, sim, paints, selRef.current, scaleJS.current);
  }, [model, paints]);

  const loop = useCallback(
    (t: number) => {
      const dt = last.current ? t - last.current : 16.7;
      last.current = t;
      sim.step(dt);
      draw();
      if (!fitted.current && sim.count > 0) fitCamera(false);
      // While settling, the camera breathes with the graph (until the user takes over).
      else if (!userMoved.current && ++frame.current % 12 === 0) fitCamera(true);
      if (sim.asleep) {
        raf.current = null;
        last.current = 0;
        if (!userMoved.current) fitCamera(true);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    },
    [draw],
  );

  const wake = useCallback(
    (alpha?: number) => {
      sim.wake(alpha);
      if (raf.current == null) raf.current = requestAnimationFrame(loop);
    },
    [loop],
  );

  function fitCamera(animated: boolean) {
    const b = sim.bounds();
    // Pad for labels; frame inside the visible band between the controls and the legend.
    const w = Math.max(80, b.maxX - b.minX + 150);
    const h = Math.max(80, b.maxY - b.minY + 40);
    const top = insets.top + 64;
    const bottom = insets.bottom + 24;
    const s = Math.min(1.6, Math.max(0.12, Math.min((width - 24) / w, (height - top - bottom) / h)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2 + 12;
    const bandCenter = (top - bottom) / 2;
    fitted.current = true;
    scaleJS.current = s;
    sc.value = animated ? withTiming(s, t200) : s;
    tx.value = animated ? withTiming(-cx * s, t200) : -cx * s;
    ty.value = animated ? withTiming(-cy * s + bandCenter, t200) : -cy * s + bandCenter;
  }

  useEffect(() => {
    sim.setGraph(model.ids, Array.from(model.radii), model.edges);
    // Pre-warm off-screen within an 80ms budget: the user sees only the last,
    // graceful part of the settle — never the chaotic first second.
    const t0 = performance.now();
    for (let k = 0; k < 820 && !sim.asleep && performance.now() - t0 < 80; k++) sim.step(16.7);
    fitted.current = false;
    userMoved.current = false;
    selRef.current = -1;
    setSelected(-1);
    wake(1);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [model]);

  useEffect(() => {
    selRef.current = selected;
    draw();
  }, [selected, draw]);

  // ─── gestures: camera on the UI thread; node dragging + taps on JS ───
  const markMoved = useCallback(() => {
    userMoved.current = true;
  }, []);
  const onScale = useCallback(
    (s: number) => {
      scaleJS.current = s;
      draw();
    },
    [draw],
  );
  // Incremental camera math: pan and pinch compose instead of fighting over a shared origin.
  const pan = usePanGesture({
    maxPointers: 1,
    onActivate: () => {
      'worklet';
      scheduleOnRN(markMoved);
    },
    onUpdate: (ev) => {
      'worklet';
      tx.value += ev.changeX;
      ty.value += ev.changeY;
    },
  });
  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      scheduleOnRN(markMoved);
    },
    onUpdate: (ev) => {
      'worklet';
      const s = Math.min(6, Math.max(0.08, sc.value * ev.scaleChange));
      const k = s / sc.value;
      const fx = ev.focalX - width / 2;
      const fy = ev.focalY - height / 2;
      tx.value = fx - (fx - tx.value) * k;
      ty.value = fy - (fy - ty.value) * k;
      sc.value = s;
    },
    onDeactivate: () => {
      'worklet';
      // Label density follows zoom; one JS hop per pinch, not per frame.
      scheduleOnRN(onScale, sc.value);
    },
  });

  const toWorld = (sx: number, sy: number) => ({ x: (sx - width / 2 - tx.value) / sc.value, y: (sy - height / 2 - ty.value) / sc.value });

  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (ev) => {
      const w = toWorld(ev.x, ev.y);
      const i = sim.hitTest(w.x, w.y, 22 / sc.value);
      haptic.select();
      setSelected(i);
    },
  });

  const dragIndex = useRef(-1);
  const nodeDrag = usePanGesture({
    runOnJS: true,
    activateAfterLongPress: 220,
    onActivate: (ev) => {
      const w = toWorld(ev.x, ev.y);
      const i = sim.hitTest(w.x, w.y, 26 / sc.value);
      dragIndex.current = i;
      if (i >= 0) {
        haptic.thud();
        setSelected(i);
        sim.pin(i, w.x, w.y);
        wake(0.4);
      }
    },
    onUpdate: (ev) => {
      if (dragIndex.current < 0) {
        // Long-press landed on empty canvas: behave like a normal camera pan.
        tx.value += ev.changeX;
        ty.value += ev.changeY;
        return;
      }
      const w = toWorld(ev.x, ev.y);
      sim.pin(dragIndex.current, w.x, w.y);
      if (raf.current == null) wake(0.3);
    },
    onFinalize: () => {
      if (dragIndex.current >= 0) sim.unpin(dragIndex.current);
      dragIndex.current = -1;
    },
  });

  const camera = useSimultaneousGestures(pan, pinch);
  const gesture = useCompetingGestures(nodeDrag, useCompetingGestures(tap, camera));

  const transform = useDerivedValue(() => [{ translateX: width / 2 + tx.value }, { translateY: height / 2 + ty.value }, { scale: sc.value }]);

  const sel = selected >= 0 ? model.ids[selected] : null;
  const selNode = sel && !sel.startsWith('#') ? e.get(sel) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.graphBg }}>
      <GestureDetector gesture={gesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={transform}>
            <Picture picture={pic} />
          </Group>
        </Canvas>
      </GestureDetector>

      <TopBar
        tint={c.graphBg}
        left={<BackButton onPress={() => nav().pop()} />}
        right={
          <View style={[styles.segment, { backgroundColor: c.surface }]}>
            <Seg label="Tümü" active={!focus} onPress={() => (haptic.select(), setFocus(null))} />
            <Seg
              label="Odak"
              active={!!focus}
              onPress={() => {
                haptic.select();
                const target = sel && !sel.startsWith('#') ? sel : (focus ?? e.pinned()[0]?.id ?? e.children(null)[0]);
                if (target) setFocus(target);
              }}
            />
          </View>
        }
      />

      {sel ? (
        <Animated.View key={sel} entering={fadeIn} exiting={fadeOut} style={[styles.preview, { bottom: insets.bottom + 16 }]}>
          <Surface style={{ padding: 16 }}>
            {selNode ? (
              <NodePreview id={selNode.id} onFocus={() => setFocus(selNode.id)} />
            ) : (
              <Tap onPress={() => followRef(sel.slice(1))}>
                <Text style={[type.headline, { color: c.text }]}>&{sel.slice(1)}&</Text>
                <Text style={[type.small, { color: c.textDim, marginTop: 2 }]}>Bu etiketi taşıyan notları göster</Text>
              </Tap>
            )}
          </Surface>
        </Animated.View>
      ) : null}
    </View>
  );
}

function NodePreview({ id, onFocus }: { id: NodeId; onFocus: () => void }) {
  const c = usePalette();
  const e = useEngine();
  const n = e.get(id)!;
  const p = e.progress(id);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text numberOfLines={2} style={[type.headline, { color: c.text, flex: 1 }]}>
          {n.title || 'Adsız'}
        </Text>
        {p.total ? <ProgressRing done={p.done} total={p.total} size={18} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} style={[styles.action, { backgroundColor: c.accent }]}>
          <Text style={[type.small, { ...sf.uiSemi, color: c.card }]}>Notu aç</Text>
        </Tap>
        <Tap onPress={() => (haptic.select(), onFocus())} style={[styles.action, { backgroundColor: c.surface }]}>
          <Text style={[type.small, { ...sf.uiSemi, color: c.text }]}>Merkeze al</Text>
        </Tap>
      </View>
    </View>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} style={[styles.seg, active && { backgroundColor: c.card }]}>
      <Text style={[type.small, { ...sf.uiMedium, color: active ? c.text : c.textDim }]}>{label}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  segment: { flexDirection: 'row', padding: 2, borderRadius: radius.pill, marginRight: 8 },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32, borderRadius: radius.pill },
  filters: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { paddingHorizontal: 11, height: 28, borderRadius: radius.pill, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  preview: { position: 'absolute', left: 14, right: 14 },
  legend: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
});
