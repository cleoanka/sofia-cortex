import { Canvas, Circle, RadialGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useLongPressGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine, useNode } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, spring } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Tap } from '../ui/primitives';
import { plainPreview } from '../ui/richText';

const HOLD_MS = 650;
const RING = 104;
const ASvgCircle = Animated.createAnimatedComponent(SvgCircle);

/**
 * Beyni Kapat. Everything else falls into darkness: one atomic task, a slow
 * breathing light, and a single place to press. Hold → it melts → the next
 * one arrives by itself. No list, no tree, no choice.
 */
export function AutopilotScreen({ scope, startId }: { scope: NodeId | null; startId?: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [skipped, setSkipped] = useState<Set<NodeId>>(new Set());
  const [tick, setTick] = useState(0);
  const [completed, setCompleted] = useState(0);
  const startedAt = useRef(Date.now()).current;

  const queue = useMemo(() => {
    let q = e.nextActions(scope).filter((id) => !skipped.has(id));
    if (startId) {
      const first = e.nextActions(startId)[0];
      if (first) q = [first, ...q.filter((x) => x !== first)];
    }
    return q;
  }, [e, scope, startId, skipped, tick]);
  const current = queue[0];
  const total = completed + queue.length;

  // Breathing: 5s in, 6s out — slower than resting rate, it pulls the user down with it.
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = withRepeat(
      withSequence(withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 6000, easing: Easing.inOut(Easing.sin) })),
      -1,
    );
    return () => cancelAnimation(breath);
  }, []);
  const glowR = useDerivedValue(() => width * (0.55 + breath.value * 0.22));
  const glowO = useDerivedValue(() => 0.55 + breath.value * 0.45);

  const done = () => {
    setCompleted((n) => n + 1);
    setTick((t) => t + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.tunnelBg }}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle cx={width / 2} cy={height * 0.44} r={glowR} opacity={glowO}>
          <RadialGradient c={vec(width / 2, height * 0.44)} r={width * 0.8} colors={[c.tunnelGlow, 'transparent']} />
        </Circle>
      </Canvas>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Tap onPress={() => (haptic.lens(), nav().pop())} style={[styles.exit, { borderColor: c.hairline }]} accessibilityLabel="Otopilottan çık">
          <Icon name="close" size={16} color={c.textDim} />
        </Tap>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.mono, { color: c.textFaint }]}>{total ? `${Math.min(completed + 1, total)} / ${total}` : ''}</Text>
          <Elapsed since={startedAt} color={c.textFaint} />
        </View>
      </View>

      {current ? (
        <TaskStage key={current} id={current} onDone={done} onSkip={() => (haptic.soft(), setSkipped((s) => new Set(s).add(current)))} />
      ) : (
        <Animated.View entering={FadeIn.duration(900)} style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Tünel boş.</Text>
          <Text style={[styles.emptySub, { color: c.textDim }]}>{completed ? `${completed} şey bitti. Bugün yeterli — nefes al.` : 'Burada yapılacak bir şey kalmadı.'}</Text>
          <Tap onPress={() => nav().pop()} style={[styles.secondary, { borderColor: c.hairline, marginTop: 34 }]}>
            <Text style={[styles.secondaryText, { color: c.text }]}>Işığa dön</Text>
          </Tap>
        </Animated.View>
      )}
      <View style={{ height: insets.bottom + 10 }} />
    </View>
  );
}

function Elapsed({ since, color }: { since: number; color: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - since) / 1000);
  return <Text style={[styles.mono, { color, marginTop: 2 }]}>{`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`}</Text>;
}

function TaskStage({ id, onDone, onSkip }: { id: NodeId; onDone: () => void; onSkip: () => void }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const [splitting, setSplitting] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const hold = useSharedValue(0);
  const melt = useSharedValue(0);
  const enter = useSharedValue(0);
  const C = 2 * Math.PI * (RING / 2 - 4);

  useEffect(() => {
    enter.value = withSpring(1, spring.melt);
  }, []);

  const complete = () => {
    const r = e.toggle(id, true);
    if (r.cascaded.length) haptic.cascade();
    else haptic.thud();
    melt.value = withTiming(1, { duration: 520, easing: Easing.bezier(0.4, 0, 0.2, 1) }, (fin) => {
      if (fin) scheduleOnRN(onDone);
    });
  };

  const press = useLongPressGesture({
    minDuration: HOLD_MS,
    maxDistance: 40,
    onBegin: () => {
      'worklet';
      hold.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.cubic) });
      scheduleOnRN(haptic.soft);
    },
    onActivate: () => {
      'worklet';
      scheduleOnRN(complete);
    },
    onFinalize: (ev) => {
      'worklet';
      if (ev.canceled || hold.value < 0.999) hold.value = withSpring(0, spring.snappy);
    },
  });

  const card = useAnimatedStyle(() => ({
    opacity: enter.value * (1 - melt.value),
    transform: [
      { translateY: (1 - enter.value) * 40 - melt.value * 30 },
      { scale: (0.96 + enter.value * 0.04) * (1 - melt.value * 0.06) },
    ],
  }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - hold.value) }));
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 1 - hold.value * 0.08 + melt.value * 0.25 }], opacity: 1 - melt.value }));

  if (!n) return null;
  const path = e.path(id).slice(0, -1).map((p) => p.title).filter(Boolean);
  const preview = plainPreview(n.body, 140);

  return (
    <Animated.View style={[styles.stage, card]}>
      <View style={styles.center}>
        {path.length ? (
          <Text numberOfLines={1} style={[styles.path, { color: c.textFaint }]}>
            {path.slice(-2).join('  ›  ')}
          </Text>
        ) : null}
        <Text style={[styles.title, { color: c.text }]}>{n.title || 'Adsız görev'}</Text>
        {preview ? <Text style={[styles.preview, { color: c.textDim }]}>{preview}</Text> : null}
      </View>

      {splitting ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut} style={[styles.split, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={[styles.splitLabel, { color: c.textDim }]}>İKİYE BÖL — İLKİYLE DEVAM EDİLİR</Text>
          <TextInput value={a} onChangeText={setA} autoFocus placeholder="İlk küçük adım" placeholderTextColor={c.textFaint} selectionColor={c.accent} style={[styles.splitInput, { color: c.text, borderBottomColor: c.hairline }]} returnKeyType="next" />
          <TextInput value={b} onChangeText={setB} placeholder="Sonrası" placeholderTextColor={c.textFaint} selectionColor={c.accent} style={[styles.splitInput, { color: c.text, borderBottomColor: c.hairline }]} returnKeyType="done"
            onSubmitEditing={() => doSplit()} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Tap onPress={() => setSplitting(false)} style={[styles.secondary, { borderColor: c.hairline, flex: 1 }]}>
              <Text style={[styles.secondaryText, { color: c.textDim }]}>Vazgeç</Text>
            </Tap>
            <Tap onPress={() => doSplit()} style={[styles.secondary, { backgroundColor: c.accent, borderColor: c.accent, flex: 1.4 }]}>
              <Text style={[styles.secondaryText, { color: c.card }]}>Böl ve başla</Text>
            </Tap>
          </View>
        </Animated.View>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <GestureDetector gesture={press}>
            <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Tamamlamak için basılı tut"
              accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={complete}>
              <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
                <SvgCircle cx={RING / 2} cy={RING / 2} r={RING / 2 - 4} stroke={c.hairline} strokeWidth={2} fill="none" />
                <ASvgCircle cx={RING / 2} cy={RING / 2} r={RING / 2 - 4} stroke={c.amber} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} animatedProps={ringProps} />
              </Svg>
              <Animated.View style={[styles.core, { backgroundColor: c.amberSoft, borderColor: c.amber + '55' }, core]}>
                <Icon name="check" size={30} color={c.amber} weight={2} />
              </Animated.View>
            </View>
          </GestureDetector>
          <Text style={[styles.hint, { color: c.textFaint }]}>Bitince basılı tut</Text>
          <View style={styles.actions}>
            <Tap onPress={() => (haptic.select(), setA(''), setB(''), setSplitting(true))} style={[styles.secondary, { borderColor: c.hairline }]}>
              <Icon name="split" size={17} color={c.text} />
              <Text style={[styles.secondaryText, { color: c.text }]}>Takıldım · İkiye böl</Text>
            </Tap>
            <Tap onPress={onSkip} style={[styles.ghost]}>
              <Text style={[styles.secondaryText, { color: c.textDim }]}>Şimdi değil</Text>
            </Tap>
          </View>
        </View>
      )}
    </Animated.View>
  );

  function doSplit() {
    if (!a.trim() || !b.trim()) return haptic.warn();
    e.split(id, a, b);
    haptic.cascade();
    setSplitting(false);
    onDone();
  }
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 22 },
  exit: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  mono: { fontFamily: font.uiMedium, fontSize: 12, letterSpacing: 1.2, fontVariant: ['tabular-nums'] },
  stage: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 30, paddingBottom: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  path: { fontFamily: font.uiMedium, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 18 },
  title: { fontFamily: font.uiSemi, fontSize: 34, lineHeight: 41, letterSpacing: -1.1, textAlign: 'center' },
  preview: { fontFamily: font.ui, fontSize: 15.5, lineHeight: 22, textAlign: 'center', marginTop: 16, maxWidth: 320 },
  core: { width: RING - 22, height: RING - 22, borderRadius: (RING - 22) / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  hint: { fontFamily: font.uiMedium, fontSize: 12, letterSpacing: 0.8, marginTop: 14, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 30, alignItems: 'center' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  ghost: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  secondaryText: { fontFamily: font.uiSemi, fontSize: 14, letterSpacing: -0.1 },
  split: { borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  splitLabel: { fontFamily: font.uiSemi, fontSize: 10.5, letterSpacing: 1.8, marginBottom: 6 },
  splitInput: { fontFamily: font.ui, fontSize: 17, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontFamily: font.uiSemi, fontSize: 30, letterSpacing: -0.9 },
  emptySub: { fontFamily: font.ui, fontSize: 16, lineHeight: 23, marginTop: 10, textAlign: 'center' },
});
