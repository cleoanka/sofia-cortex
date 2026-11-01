import { memo, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine, useNode, useProgress, useChildren, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, space, spring, type } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { OutlineList, toggleWithChoreography } from '../ui/Outline';
import { Check, Label, ProgressRing, Surface, Tap } from '../ui/primitives';
import { QuickCapture } from '../ui/QuickCapture';

const PULL = 72;

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function greeting(h: number): string {
  if (h < 5) return 'Gece sessiz.';
  if (h < 12) return 'Günaydın.';
  if (h < 18) return 'İyi günler.';
  return 'İyi akşamlar.';
}

export function HomeScreen() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const pull = useSharedValue(0);
  const armed = useRef(false);

  const onScroll = (y: number) => {
    pull.value = Math.max(0, -y);
    if (-y > PULL && !armed.current) {
      armed.current = true;
      haptic.select();
    } else if (-y < PULL) armed.current = false;
  };
  const onEndDrag = (y: number) => {
    if (-y > PULL) {
      haptic.lens();
      nav().openPalette({ mode: 'search' });
    }
  };

  const hint = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [10, PULL], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(pull.value, [0, PULL], [-12, 8], Extrapolation.CLAMP) }, { scale: interpolate(pull.value, [PULL - 8, PULL + 4], [0.94, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Animated.View pointerEvents="none" style={[styles.pullHint, { top: insets.top + 6 }, hint]}>
        <Icon name="search" size={16} color={c.accent} />
        <Text style={[type.small, { color: c.accent, fontFamily: font.uiMedium }]}>Bırak — Komut Paleti</Text>
      </Animated.View>
      <OutlineList
        rootId={null}
        maxDepth={1}
        onScroll={onScroll}
        onScrollEndDrag={onEndDrag}
        header={<HomeHeader top={insets.top} />}
        footer={<HomeFooter />}
        contentBottom={insets.bottom + 120}
      />
      <QuickCapture />
    </View>
  );
}

function HomeHeader({ top }: { top: number }) {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const now = new Date();
  const pinned = useMemo(() => e.pinned(), [e, v]);
  const next = useMemo(() => e.nextActions(null, 1)[0], [e, v]);
  const today = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return e.allLive().filter((n) => n.isTask && n.done && (n.doneAt ?? 0) >= start).length;
  }, [e, v]);
  const inbox = e.inbox();
  const inboxCount = inbox ? e.children(inbox.id).length : 0;

  return (
    <View style={{ paddingTop: top + 10 }}>
      <View style={styles.topBar}>
        <View>
          <Label>
            {DAYS[now.getDay()]} · {now.getDate()} {MONTHS[now.getMonth()]}
          </Label>
          <Text style={[type.display, { color: c.text, marginTop: 6 }]}>{greeting(now.getHours())}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RoundButton icon="search" onPress={() => nav().openPalette({ mode: 'search' })} label="Ara" />
          <RoundButton icon="graph" onPress={() => nav().push({ name: 'graph' })} label="Graf" />
          <RoundButton icon="gear" onPress={() => nav().push({ name: 'settings' })} label="Ayarlar" />
        </View>
      </View>

      <FocusCard nextId={next} today={today} />

      {pinned.length > 0 ? (
        <>
          <SectionTitle title="Vitrin" meta={`${pinned.length}`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xl, gap: 12, paddingBottom: 6 }} decelerationRate="fast" snapToInterval={244} snapToAlignment="start">
            {pinned.map((p) => (
              <Portal key={p.id} id={p.id} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <View style={[styles.sectionRow, { marginTop: 26 }]}>
        <Text style={[type.headline, { color: c.text }]}>Cortex</Text>
        {inbox ? (
          <Tap onPress={() => nav().push({ name: 'node', id: inbox.id })} style={[styles.inboxChip, { backgroundColor: inboxCount ? c.accentSoft : c.surface }]}>
            <Icon name="inbox" size={15} color={inboxCount ? c.accent : c.textDim} weight={1.8} />
            <Text style={[type.small, { fontFamily: font.uiMedium, color: inboxCount ? c.accent : c.textDim }]}>
              Gelen Kutusu{inboxCount ? ` · ${inboxCount}` : ''}
            </Text>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

function HomeFooter() {
  const c = usePalette();
  const e = useEngine();
  const roots = useChildren(null);
  return (
    <View style={{ paddingHorizontal: space.xl, paddingTop: 10 }}>
      <Tap
        onPress={() => {
          haptic.soft();
          const id = e.create(null, { title: '' });
          nav().push({ name: 'node', id });
        }}
        style={[styles.newRoot, { borderColor: c.hairline }]}
      >
        <Icon name="plus" size={18} color={c.textDim} />
        <Text style={[type.row, { color: c.textDim }]}>Yeni evren</Text>
      </Tap>
      <Text style={[type.small, { color: c.textFaint, textAlign: 'center', marginTop: 22 }]}>
        {roots.length} evren · sağa kaydır: içeri · sola: dışarı · uzun bas: taşı · kıstır: katla
      </Text>
    </View>
  );
}

function RoundButton({ icon, onPress, label }: { icon: 'search' | 'graph' | 'gear'; onPress: () => void; label: string }) {
  const c = usePalette();
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={[styles.round, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <Icon name={icon} size={19} color={c.text} />
    </Tap>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  const c = usePalette();
  return (
    <View style={[styles.sectionRow, { marginTop: 26, marginBottom: 12 }]}>
      <Text style={[type.headline, { color: c.text }]}>{title}</Text>
      {meta ? <Text style={[type.mono, { color: c.textFaint }]}>{meta}</Text> : null}
    </View>
  );
}

/** The single most important affordance in the app: stop deciding, start doing. */
function FocusCard({ nextId, today }: { nextId?: NodeId; today: number }) {
  const c = usePalette();
  const e = useEngine();
  const next = useNode(nextId);
  const path = next ? e.path(next.id).slice(0, -1).map((n) => n.title).filter(Boolean) : [];
  const glow = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: 1 - glow.value * 0.015 }] }));
  return (
    <Animated.View style={[{ marginHorizontal: space.xl, marginTop: 22 }, s]}>
      <Tap
        scaleTo={0.98}
        onPressIn={() => (glow.value = withSpring(1, spring.snappy))}
        onPressOut={() => (glow.value = withSpring(0, spring.snappy))}
        onPress={() => {
          haptic.lens();
          nav().push({ name: 'autopilot', scope: null });
        }}
      >
        <Surface style={{ padding: 18, backgroundColor: c.invBg, borderColor: c.scheme === 'dark' ? c.cardBorder : 'transparent' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type.micro, { color: c.invAccent, textTransform: 'uppercase' }]}>Sıradaki tek şey</Text>
            <Text style={[type.mono, { color: c.invDim }]}>bugün {today} ✓</Text>
          </View>
          <Text numberOfLines={2} style={{ fontFamily: font.uiSemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.5, color: c.invText, marginTop: 10 }}>
            {next ? next.title : 'Her şey yapıldı. Nefes al.'}
          </Text>
          {path.length ? (
            <Text numberOfLines={1} style={[type.small, { color: c.invDim, marginTop: 4 }]}>
              {path.join('  ›  ')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <View style={[styles.autoBtn, { backgroundColor: c.amber }]}>
              <Icon name="tunnel" size={17} color={c.onAmber} />
              <Text style={{ fontFamily: font.uiSemi, fontSize: 14, color: c.onAmber, letterSpacing: -0.2 }}>Otopilot</Text>
            </View>
            <Text style={[type.small, { color: c.invDim, flex: 1 }]}>Beynini kapat. Sadece bunu yap.</Text>
          </View>
        </Surface>
      </Tap>
    </Animated.View>
  );
}

/** A pinned node surfaced from any depth — edits here are edits there. */
const Portal = memo(function Portal({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const p = useProgress(id);
  const kids = useChildren(id);
  if (!n) return null;
  const path = e.path(id).slice(0, -1).map((x) => x.title);
  const open = kids.filter((k) => e.get(k)?.isTask).slice(0, 3);
  return (
    <Tap scaleTo={0.975} onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))}>
      <Surface style={{ width: 232, minHeight: 156, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            {path.length ? (
              <Text numberOfLines={1} style={[type.micro, { color: c.textFaint, letterSpacing: 0.3 }]}>
                {path.join(' › ')}
              </Text>
            ) : (
              <Text style={[type.micro, { color: c.textFaint }]}>EVREN</Text>
            )}
            <Text numberOfLines={2} style={[type.headline, { color: c.text, marginTop: 6 }]}>
              {n.title}
            </Text>
          </View>
          {p.total > 0 ? <ProgressRing done={p.done} total={p.total} size={34} /> : <Icon name="pin" size={16} color={c.textFaint} />}
        </View>
        <View style={{ marginTop: 12, gap: 9 }}>
          {open.length ? (
            open.map((k) => <PortalTask key={k} id={k} />)
          ) : (
            <Text numberOfLines={3} style={[type.small, { color: c.textDim }]}>
              {n.body.replace(/\[\[|\]\]/g, '')}
            </Text>
          )}
        </View>
      </Surface>
    </Tap>
  );
});

const PortalTask = memo(function PortalTask({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  if (!n) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Check size={18} done={n.done} onPress={() => toggleWithChoreography(e, id)} />
      <Text numberOfLines={1} style={[type.small, { flex: 1, color: n.done ? c.textFaint : c.text, textDecorationLine: n.done ? 'line-through' : 'none' }]}>
        {n.title}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: space.xl },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, marginBottom: 6 },
  inboxChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 30, borderRadius: radius.pill },
  autoBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, height: 36, borderRadius: radius.pill },
  newRoot: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: radius.m, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 14 },
  pullHint: { position: 'absolute', alignSelf: 'center', zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
