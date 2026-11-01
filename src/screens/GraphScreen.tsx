import { BlurStyle, Canvas, Group, Picture, Skia, matchFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOut, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { CortexEngine } from '../engine/CortexEngine';
import type { NodeId } from '../engine/types';
import { ForceSim } from '../graph/physics';
import { haptic } from '../platform/haptics';
import { useEngine, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, spring, type, type Palette } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { ProgressRing, Surface, Tap } from '../ui/primitives';

type Kind = 0 | 1 | 2 | 3 | 4; // note, active task, done task, tag, blocked (sealed/has open subtasks)

interface Model {
  ids: string[];
  kinds: Uint8Array;
  radii: Float32Array;
  labels: string[];
  edges: { a: number; b: number; w: number }[];
  degree: Uint16Array;
}

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
    labels.push(id.startsWith('#') ? id : e.get(id)?.title || 'Adsız');
  });
  return { ids: keep.map((o) => g.ids[o]), kinds, radii, labels, edges, degree };
}

interface Filters {
  tasks: boolean;
  notes: boolean;
  tags: boolean;
  done: boolean;
}

const labelFont = matchFont({ fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }), fontSize: 11, fontWeight: '500' });

/** Records one frame as a single SkPicture: five paths, one blur, ≤80 labels. */
function record(m: Model, sim: ForceSim, c: Palette, selected: number, scale: number): SkPicture {
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
  const ep = Skia.Path.MakeFromSVGString(edges);
  if (ep) cv.drawPath(ep, paint(c.graphEdge, 1 / Math.max(0.6, scale)));
  const p2 = buckets[2] && Skia.Path.MakeFromSVGString(buckets[2]);
  if (p2) {
    const halo = paint(c.amber);
    halo.setAlphaf(0.45);
    halo.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true));
    cv.drawPath(p2, halo);
    cv.drawPath(p2, paint(c.amber));
  }
  const p0 = buckets[0] && Skia.Path.MakeFromSVGString(buckets[0]);
  if (p0) cv.drawPath(p0, paint(c.graphNode));
  const p1 = buckets[1] && Skia.Path.MakeFromSVGString(buckets[1]);
  if (p1) {
    cv.drawPath(p1, paint(c.graphBg));
    cv.drawPath(p1, paint(c.accent, 1.8));
  }
  const p4 = buckets[4] && Skia.Path.MakeFromSVGString(buckets[4]);
  if (p4) {
    cv.drawPath(p4, paint(c.accentSoft));
    cv.drawPath(p4, paint(c.accent, 2.6));
  }
  const p3 = buckets[3] && Skia.Path.MakeFromSVGString(buckets[3]);
  if (p3) cv.drawPath(p3, paint(c.graphTag));

  if (selected >= 0) {
    const r = m.radii[selected] + 6;
    cv.drawCircle(xs[selected], ys[selected], r, paint(c.text, 1.5));
  }
  // Labels: hubs always, everything once zoomed in.
  const order = [...m.ids.keys()].sort((a, b) => m.degree[b] - m.degree[a]);
  const budget = scale > 1.5 ? 140 : scale > 0.9 ? 60 : 18;
  const tp = paint(c.textDim);
  const tpStrong = paint(c.text);
  for (let k = 0; k < Math.min(budget, order.length); k++) {
    const i = order[k];
    const label = m.labels[i].length > 26 ? m.labels[i].slice(0, 25) + '…' : m.labels[i];
    const w = labelFont.measureText(label).width;
    cv.drawText(label, xs[i] - w / 2, ys[i] + m.radii[i] + 13, i === selected || m.degree[i] > 4 ? tpStrong : tp, labelFont);
  }
  return rec.finishRecordingAsPicture();
}

export function GraphScreen({ focus: initialFocus }: { focus?: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [focus, setFocus] = useState<NodeId | null>(initialFocus ?? null);
  const [filters, setFilters] = useState<Filters>({ tasks: true, notes: true, tags: true, done: true });
  const [selected, setSelected] = useState(-1);
  const [asleep, setAsleep] = useState(false);
  const model = useMemo(() => buildModel(e, focus, filters), [e, focus, filters, v]);
  const sim = useRef(new ForceSim({ springLength: 54, repulsion: 700 })).current;
  const pic = useSharedValue<SkPicture | null>(null);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const scaleJS = useRef(1);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const selRef = useRef(-1);
  const fitted = useRef(false);

  const draw = useCallback(() => {
    pic.value = record(model, sim, c, selRef.current, scaleJS.current);
  }, [model, c]);

  const loop = useCallback(
    (t: number) => {
      const dt = last.current ? t - last.current : 16.7;
      last.current = t;
      sim.step(dt);
      draw();
      if (!fitted.current && sim.count > 0) fitCamera(false);
      if (sim.asleep) {
        raf.current = null;
        last.current = 0;
        setAsleep(true);
        fitCamera(true);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    },
    [draw],
  );

  const wake = useCallback(
    (alpha?: number) => {
      sim.wake(alpha);
      setAsleep(false);
      if (raf.current == null) raf.current = requestAnimationFrame(loop);
    },
    [loop],
  );

  function fitCamera(animated: boolean) {
    const b = sim.bounds();
    const w = Math.max(80, b.maxX - b.minX);
    const h = Math.max(80, b.maxY - b.minY);
    const s = Math.min(2.2, Math.max(0.15, Math.min((width - 60) / w, (height - 300) / h)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    if (!fitted.current || animated) {
      if (animated && fitted.current) return;
      fitted.current = true;
      scaleJS.current = s;
      sc.value = animated ? withSpring(s, spring.lens) : s;
      tx.value = animated ? withSpring(-cx * s, spring.lens) : -cx * s;
      ty.value = animated ? withSpring(-cy * s, spring.lens) : -cy * s;
    }
  }

  useEffect(() => {
    sim.setGraph(model.ids, Array.from(model.radii), model.edges);
    fitted.current = false;
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
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startSc = useSharedValue(1);
  const pan = usePanGesture({
    maxPointers: 2,
    onBegin: () => {
      'worklet';
      startTx.value = tx.value;
      startTy.value = ty.value;
    },
    onUpdate: (ev) => {
      'worklet';
      tx.value = startTx.value + ev.translationX;
      ty.value = startTy.value + ev.translationY;
    },
  });
  const pinch = usePinchGesture({
    onBegin: (ev) => {
      'worklet';
      startSc.value = sc.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      void ev;
    },
    onUpdate: (ev) => {
      'worklet';
      const s = Math.min(6, Math.max(0.08, startSc.value * ev.scale));
      const fx = ev.focalX - width / 2;
      const fy = ev.focalY - height / 2;
      const k = s / startSc.value;
      tx.value = fx - (fx - startTx.value) * k;
      ty.value = fy - (fy - startTy.value) * k;
      sc.value = s;
    },
    onDeactivate: () => {
      'worklet';
      // Label density follows zoom; one JS hop per pinch, not per frame.
      scheduleOnRN(onScale, sc.value);
    },
  });
  const onScale = useCallback(
    (s: number) => {
      scaleJS.current = s;
      draw();
    },
    [draw],
  );

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
      if (dragIndex.current < 0) return;
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
  const stats = useMemo(() => {
    let done = 0;
    let open = 0;
    for (const k of model.kinds) k === 2 ? done++ : k === 1 || k === 4 ? open++ : 0;
    return { done, open };
  }, [model]);

  return (
    <View style={{ flex: 1, backgroundColor: c.graphBg }}>
      <GestureDetector gesture={gesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={transform}>
            <Picture picture={pic as never} />
          </Group>
        </Canvas>
      </GestureDetector>

      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Tap onPress={() => nav().pop()} style={[styles.round, { backgroundColor: c.surface, borderColor: c.hairline }]} accessibilityLabel="Geri">
          <Icon name="back" size={19} color={c.text} />
        </Tap>
        <View style={[styles.segment, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Seg label="Küresel" icon="globe" active={!focus} onPress={() => (haptic.lens(), setFocus(null))} />
          <Seg
            label="Odak"
            icon="focus"
            active={!!focus}
            onPress={() => {
              haptic.lens();
              const target = sel && !sel.startsWith('#') ? sel : (focus ?? e.pinned()[0]?.id ?? e.children(null)[0]);
              if (target) setFocus(target);
            }}
          />
        </View>
      </View>

      <View style={[styles.filters, { top: insets.top + 58 }]} pointerEvents="box-none">
        {(
          [
            ['tasks', 'Görevler'],
            ['done', 'Tamamlanan'],
            ['notes', 'Notlar'],
            ['tags', 'Etiketler'],
          ] as const
        ).map(([k, label]) => (
          <Tap
            key={k}
            onPress={() => {
              haptic.select();
              setFilters((f) => ({ ...f, [k]: !f[k] }));
            }}
            style={[styles.filter, { backgroundColor: filters[k] ? c.accentSoft : 'transparent', borderColor: filters[k] ? 'transparent' : c.hairline }]}
          >
            <Text style={[type.small, { fontFamily: font.uiMedium, color: filters[k] ? c.accent : c.textDim }]}>{label}</Text>
          </Tap>
        ))}
      </View>

      {selNode || sel ? (
        <Animated.View key={sel!} entering={FadeInDown.springify().damping(18)} exiting={FadeOut} style={[styles.preview, { bottom: insets.bottom + 16 }]}>
          <Surface style={{ padding: 16 }}>
            {selNode ? <NodePreview id={selNode.id} onFocus={() => setFocus(selNode.id)} /> : <Text style={[type.headline, { color: c.tag }]}>{sel}</Text>}
          </Surface>
        </Animated.View>
      ) : (
        <View style={[styles.legend, { bottom: insets.bottom + 16 }]} pointerEvents="none">
          <Legend color={c.amber} label={`${stats.done} tamamlandı`} filled />
          <Legend color={c.accent} label={`${stats.open} aktif`} />
          <Legend color={c.graphNode} label={`${model.ids.length} düğüm · ${model.edges.length} sinaps`} filled />
          <Text style={[type.micro, { color: c.textFaint, marginLeft: 'auto' }]}>{asleep ? 'FİZİK UYKUDA · 0% CPU' : 'FİZİK AKTİF'}</Text>
        </View>
      )}
    </View>
  );
}

function NodePreview({ id, onFocus }: { id: NodeId; onFocus: () => void }) {
  const c = usePalette();
  const e = useEngine();
  const n = e.get(id)!;
  const p = e.progress(id);
  const path = e.path(id).slice(0, -1).map((x) => x.title);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[type.micro, { color: c.textFaint }]}>
            {path.length ? path.join(' › ') : 'EVREN'}
          </Text>
          <Text numberOfLines={2} style={[type.headline, { color: c.text, marginTop: 4 }]}>
            {n.title || 'Adsız'}
          </Text>
        </View>
        {p.total ? <ProgressRing done={p.done} total={p.total} size={38} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} style={[styles.action, { backgroundColor: c.accent }]}>
          <Text style={[type.small, { fontFamily: font.uiSemi, color: c.card }]}>Aç</Text>
        </Tap>
        <Tap onPress={() => (haptic.lens(), onFocus())} style={[styles.action, { backgroundColor: c.surface }]}>
          <Icon name="focus" size={15} color={c.text} />
          <Text style={[type.small, { fontFamily: font.uiSemi, color: c.text }]}>Odak grafı</Text>
        </Tap>
        {e.nextActions(id, 1).length ? (
          <Tap onPress={() => (haptic.lens(), nav().push({ name: 'autopilot', scope: id }))} style={[styles.action, { backgroundColor: c.surface }]}>
            <Icon name="tunnel" size={15} color={c.text} />
            <Text style={[type.small, { fontFamily: font.uiSemi, color: c.text }]}>Otopilot</Text>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

function Seg({ label, icon, active, onPress }: { label: string; icon: 'globe' | 'focus'; active: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} style={[styles.seg, active && { backgroundColor: c.card, shadowColor: c.shadow, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }]}>
      <Icon name={icon} size={15} color={active ? c.text : c.textDim} />
      <Text style={[type.small, { fontFamily: font.uiSemi, color: active ? c.text : c.textDim }]}>{label}</Text>
    </Tap>
  );
}

function Legend({ color, label, filled }: { color: string; label: string; filled?: boolean }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: filled ? color : 'transparent', borderWidth: filled ? 0 : 1.6, borderColor: color }} />
      <Text style={[type.small, { color: c.textDim, fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32, borderRadius: radius.pill },
  filters: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { paddingHorizontal: 11, height: 28, borderRadius: radius.pill, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  preview: { position: 'absolute', left: 14, right: 14 },
  legend: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
});
