import { BlurView } from 'expo-blur';
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CortexEngine } from '../engine/CortexEngine';
import { stripRefs } from '../engine/links';
import { tableText } from '../engine/table';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine, useNode, useProgress, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette, useTheme } from '../theme/ThemeProvider';
import { fadeIn, layout } from '../theme/motion';
import { sf, type } from '../theme/tokens';
import { deleteNode, toggleTask } from '../ui/actions';
import { Icon } from '../ui/Icon';
import { Check, Tap, TopBar, useBarInset } from '../ui/primitives';
import { Count, preview } from '../ui/Rows';
import { SwipeRow } from '../ui/SwipeRow';

const DAY = 86_400_000;

type Section = { key: string; title: string; ids: NodeId[] };

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Apple Notes grouping: Bugün · Önceki 7 Gün · Önceki 30 Gün · then month by month. */
function sections(e: CortexEngine, now: number): Section[] {
  const today = startOfDay(now);
  const pinned = e.pinned().map((n) => n.id);
  const pinnedSet = new Set(pinned);
  const notes = e
    .children(null)
    .filter((id) => !pinnedSet.has(id))
    .map((id) => ({ id, t: e.touchedAt(id) }))
    .sort((a, b) => b.t - a.t);
  const out: Section[] = [];
  const push = (key: string, title: string, id: NodeId) => {
    const last = out[out.length - 1];
    if (last?.key === key) last.ids.push(id);
    else out.push({ key, title, ids: [id] });
  };
  for (const { id, t } of notes) {
    if (t >= today) push('today', 'Bugün', id);
    else if (t >= today - 7 * DAY) push('7', 'Önceki 7 Gün', id);
    else if (t >= today - 30 * DAY) push('30', 'Önceki 30 Gün', id);
    else {
      const d = new Date(t);
      const title = d.toLocaleDateString('tr-TR', d.getFullYear() === new Date(now).getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
      push(`${d.getFullYear()}-${d.getMonth()}`, title.charAt(0).toLocaleUpperCase('tr-TR') + title.slice(1), id);
    }
  }
  return pinned.length ? [{ key: 'pinned', title: 'Sabitlenenler', ids: pinned }, ...out] : out;
}

/** 16:45 today, the weekday this week, a date before that. */
function stamp(t: number, now: number): string {
  const d = new Date(t);
  if (t >= startOfDay(now)) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (t >= startOfDay(now) - 6 * DAY) {
    const w = d.toLocaleDateString('tr-TR', { weekday: 'long' });
    return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1);
  }
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** What the note is about at a glance: its first line of text, else its first lines. */
function gist(e: CortexEngine, id: NodeId): string {
  const n = e.get(id)!;
  const first = preview(n.body);
  if (first) return first;
  const parts: string[] = [];
  for (const k of e.children(id)) {
    const x = e.get(k)!;
    const t = x.role === 'table' ? tableText(x.body) : stripRefs(x.title).trim();
    if (t) parts.push(t);
    if (parts.length >= 4) break;
  }
  return parts.join(' · ') || 'Ek metin yok';
}

export function HomeScreen() {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const top = useBarInset();
  const insets = useSafeAreaInsets();
  const { setPref } = useTheme();
  const now = Date.now();
  const groups = useMemo(() => sections(e, now), [e, v]);
  const next = useMemo(() => e.nextActions(null, 1)[0], [e, v]);
  const total = useMemo(() => e.children(null).length, [e, v]);

  const compose = () => {
    haptic.soft();
    const id = e.create(null, { title: '' });
    nav().push({ name: 'node', id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: top, paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        <Text style={[type.largeTitle, { color: c.text, paddingHorizontal: 20, marginBottom: 14 }]}>Notlar</Text>

        {next ? <NextCard id={next} /> : null}

        {groups.map((g) => (
          <Animated.View key={g.key} layout={layout} style={{ marginTop: 22 }}>
            <Text style={[type.section, { color: c.text, paddingHorizontal: 20, marginBottom: 8 }]}>{g.title}</Text>
            <View style={[styles.card, { backgroundColor: c.card }]}>
              {g.ids.map((id, i) => (
                <View key={id}>
                  {i > 0 ? <View style={[styles.sep, { backgroundColor: c.hairline }]} /> : null}
                  <HomeRow id={id} now={now} />
                </View>
              ))}
            </View>
          </Animated.View>
        ))}

        {total === 0 ? <Text style={[type.body, { color: c.textDim, textAlign: 'center', marginTop: 80 }]}>Not yok</Text> : null}
      </ScrollView>

      <TopBar
        right={
          <>
            <BarIcon icon="graph" label="Graf" onPress={() => nav().push({ name: 'graph' })} />
            <BarIcon
              icon={c.scheme === 'dark' ? 'sun' : 'moon'}
              label="Tema — basılı tut: Ayarlar"
              onPress={() => {
                haptic.select();
                setPref(c.scheme === 'dark' ? 'light' : 'dark');
              }}
              onLongPress={() => (haptic.thud(), nav().push({ name: 'settings' }))}
            />
          </>
        }
      />

      {/* Apple Notes bottom bar: a search pill and the compose button, on frosted glass. */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 6, borderTopColor: c.hairline }]}>
        <BlurView intensity={40} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.72 }]} />
        <Tap onPress={() => nav().openPalette({ mode: 'search' })} style={[styles.search, { backgroundColor: c.fill }]} accessibilityLabel="Arayın">
          <Icon name="search" size={17} color={c.textDim} weight={1.9} />
          <Text style={[type.body, { color: c.textDim }]}>Arayın</Text>
        </Tap>
        <Tap onPress={compose} hitSlop={8} style={styles.compose} accessibilityLabel="Yeni not">
          <Icon name="compose" size={27} color={c.accent} weight={1.8} />
        </Tap>
      </View>
    </View>
  );
}

function BarIcon({ icon, label, onPress, onLongPress }: { icon: 'graph' | 'sun' | 'moon'; label: string; onPress: () => void; onLongPress?: () => void }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} onLongPress={onLongPress} hitSlop={6} accessibilityLabel={label} style={styles.barIcon}>
      <Icon name={icon} size={21} color={c.accent} weight={1.8} />
    </Tap>
  );
}

/** The next atomic step, as one card. Tap → Autopilot. */
function NextCard({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  if (!n) return null;
  const where = e.get(n.parentId)?.title;
  return (
    <Animated.View entering={fadeIn}>
      <Tap onPress={() => (haptic.lens(), nav().push({ name: 'autopilot', scope: null }))} style={[styles.card, styles.next, { backgroundColor: c.card }]} accessibilityLabel={`Sıradaki: ${n.title}`}>
        <View style={[styles.play, { backgroundColor: c.accent }]}>
          <Text style={{ color: c.onAmber, fontSize: 12, marginLeft: 2 }}>▶</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: c.textDim }]}>Sıradaki</Text>
          <Text numberOfLines={1} style={[type.row, sf.uiSemi, { color: c.text }]}>
            {n.title}
          </Text>
        </View>
        {where ? (
          <Text numberOfLines={1} style={[type.small, { color: c.textDim, maxWidth: 110 }]}>
            {where}
          </Text>
        ) : null}
        <Icon name="chevron" size={16} color={c.textFaint} />
      </Tap>
    </Animated.View>
  );
}

/** Two rich lines: bold title (+ task count), then time and a preview of what is inside. */
const HomeRow = memo(function HomeRow({ id, now }: { id: NodeId; now: number }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const p = useProgress(id);
  useVersion();
  if (!n) return null;
  return (
    <SwipeRow onDelete={() => deleteNode(id)} bg={c.card}>
      <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} style={styles.row}>
        {n.isTask ? (
          <View style={{ marginRight: 12 }}>
            <Check id={id} done={n.done} onPress={() => toggleTask(e, id)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <View style={styles.titleLine}>
            <Text numberOfLines={1} style={[type.row, sf.uiSemi, { color: n.done ? c.textDim : c.text, flex: 1 }]}>
              {n.title || 'Yeni not'}
            </Text>
            {p.total > 0 ? <Count done={p.done} total={p.total} /> : null}
          </View>
          <Text numberOfLines={1} style={[type.preview, { color: c.textDim, marginTop: 2 }]}>
            <Text style={[sf.uiMedium, { color: c.text, opacity: 0.75 }]}>{stamp(e.touchedAt(id), now)}</Text>
            {'  '}
            {gist(e, id)}
          </Text>
        </View>
      </Tap>
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, minHeight: 64 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  play: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  barIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  search: { flex: 1, height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  compose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
