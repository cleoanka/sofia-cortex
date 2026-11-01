import { useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stripRefs } from '../engine/links';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine, useNode } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, fadeOut } from '../theme/motion';
import { font } from '../theme/tokens';
import { markCascade } from '../ui/choreo';
import { useKeyboardHeight } from '../ui/keyboard';
import { IconButton, Tap, TopBar, useBarInset } from '../ui/primitives';

/**
 * Beyni kapat. One task, nothing else on the screen. Done → the next one
 * arrives by itself. Too big → split it in two and start with the first half.
 */
export function AutopilotScreen({ scope, startId }: { scope: NodeId | null; startId?: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  const [skipped, setSkipped] = useState<Set<NodeId>>(new Set());
  const [tick, setTick] = useState(0);

  const queue = useMemo(() => {
    let q = e.nextActions(scope).filter((id) => !skipped.has(id));
    if (startId) {
      const first = e.nextActions(startId)[0];
      if (first) q = [first, ...q.filter((x) => x !== first)];
    }
    return q;
  }, [e, scope, startId, skipped, tick]);
  const current = queue[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {current ? (
        <Stage
          key={current}
          id={current}
          onDone={() => setTick((t) => t + 1)}
          onSkip={() => {
            haptic.soft();
            setSkipped((s) => new Set(s).add(current));
          }}
        />
      ) : (
        <Animated.View entering={fadeIn} style={styles.empty}>
          <Text style={[styles.title, { color: c.text, textAlign: 'center' }]}>Hepsi bitti.</Text>
          <Text style={[styles.sub, { color: c.textDim, textAlign: 'center', marginTop: 8 }]}>Burada yapılacak bir şey kalmadı.</Text>
          <Tap onPress={() => nav().pop()} style={[styles.primary, { backgroundColor: c.surface, marginTop: 32, alignSelf: 'stretch' }]}>
            <Text style={[styles.primaryText, { color: c.text }]}>Kapat</Text>
          </Tap>
        </Animated.View>
      )}
      <View style={{ height: insets.bottom }} />
      <TopBar left={<IconButton icon="close" label="Kapat" color={c.textDim} size={20} onPress={() => nav().pop()} />} />
    </View>
  );
}

function Stage({ id, onDone, onSkip }: { id: NodeId; onDone: () => void; onSkip: () => void }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const [splitting, setSplitting] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const kb = useKeyboardHeight();
  const second = useRef<React.ComponentRef<typeof TextInput>>(null);
  const top = useBarInset();
  if (!n) return null;
  const parent = e.get(n.parentId);
  const body = stripRefs(n.body).trim();

  const complete = () => {
    if (e.get(id)?.done) return;
    markCascade(
      e
        .path(id)
        .slice(0, -1)
        .map((x) => x.id)
        .reverse(),
    );
    const r = e.toggle(id, true);
    if (r.cascaded.length) haptic.cascade();
    else haptic.tick();
    onDone();
  };

  const split = () => {
    if (!a.trim() || !b.trim()) return haptic.warn();
    e.split(id, a, b);
    Keyboard.dismiss();
    haptic.select();
    setSplitting(false);
    onDone();
  };

  // While splitting, everything moves to the top of the screen — the task,
  // then the two inputs right under it — so the keyboard can never reach them.
  return (
    <Animated.View
      entering={fadeIn}
      exiting={fadeOut}
      style={[styles.stage, splitting && { justifyContent: 'flex-start', paddingTop: top + 16, paddingBottom: kb + 24 }]}
    >
      <View style={splitting ? null : styles.center}>
        {parent ? (
          <Text numberOfLines={1} style={[styles.sub, { color: c.textDim, marginBottom: 10 }]}>
            {parent.title}
          </Text>
        ) : null}
        <Text numberOfLines={splitting ? 2 : undefined} style={[styles.title, { color: c.text }]}>
          {n.title}
        </Text>
        {!splitting && n.reminderHook ? <Text style={[styles.sub, { color: c.amberInk, marginTop: 14 }]}>İlk hareket: {n.reminderHook}</Text> : null}
        {!splitting && body ? (
          <Text numberOfLines={3} style={[styles.sub, { color: c.textDim, marginTop: 12 }]}>
            {body}
          </Text>
        ) : null}
      </View>

      {splitting ? (
        <Animated.View entering={fadeIn} style={{ gap: 4, marginTop: 20 }}>
          <TextInput
            value={a}
            onChangeText={setA}
            autoFocus
            placeholder="İlk adım"
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            style={[styles.input, { color: c.text, borderBottomColor: c.hairline }]}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => second.current?.focus()}
          />
          <TextInput
            ref={second}
            value={b}
            onChangeText={setB}
            onSubmitEditing={split}
            placeholder="Sonraki adım"
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            style={[styles.input, { color: c.text, borderBottomColor: c.hairline }]}
            returnKeyType="done"
          />
          <View style={[styles.secondaryRow, { marginTop: 14 }]}>
            <Tap onPress={() => (Keyboard.dismiss(), setSplitting(false))} style={styles.secondary}>
              <Text style={[styles.secondaryText, { color: c.textDim }]}>Vazgeç</Text>
            </Tap>
            <Tap onPress={split} style={styles.secondary}>
              <Text style={[styles.secondaryText, { color: c.accent }]}>Böl ve başla</Text>
            </Tap>
          </View>
        </Animated.View>
      ) : (
        <View>
          <Tap onPress={complete} style={[styles.primary, { backgroundColor: c.amber }]} accessibilityLabel="Tamamlandı">
            <Text style={[styles.primaryText, { color: c.onAmber }]}>✓ Tamamlandı</Text>
          </Tap>
          <View style={styles.secondaryRow}>
            <Tap onPress={() => (haptic.select(), setA(''), setB(''), setSplitting(true))} style={styles.secondary}>
              <Text style={[styles.secondaryText, { color: c.textDim }]}>İkiye böl</Text>
            </Tap>
            <Tap onPress={onSkip} style={styles.secondary}>
              <Text style={[styles.secondaryText, { color: c.textDim }]}>Atla</Text>
            </Tap>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: 28, paddingBottom: 12, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: font.uiSemi, fontSize: 28, lineHeight: 35, letterSpacing: -0.7 },
  sub: { fontFamily: font.ui, fontSize: 15, lineHeight: 22 },
  primary: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: font.uiSemi, fontSize: 16, letterSpacing: -0.2 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 12 },
  secondary: { height: 40, paddingHorizontal: 8, justifyContent: 'center' },
  secondaryText: { fontFamily: font.uiMedium, fontSize: 14 },
  input: { fontFamily: font.ui, fontSize: 17, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
});
