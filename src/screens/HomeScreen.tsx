import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useChildren, useEngine, useNode, useProgress, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette, useTheme } from '../theme/ThemeProvider';
import { fadeIn } from '../theme/motion';
import { font, type } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Hairline, ProgressRing, Tap, TopBar, useBarInset } from '../ui/primitives';
import { NoteRow } from '../ui/Rows';

function greeting(h: number): string {
  if (h < 5) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  if (h < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

export function HomeScreen() {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const top = useBarInset();
  const insets = useSafeAreaInsets();
  const { setPref } = useTheme();
  const roots = useChildren(null);
  const pinned = useMemo(() => e.pinned(), [e, v]);
  const next = useMemo(() => e.nextActions(null, 1)[0], [e, v]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        {next ? <NextPill id={next} /> : null}

        {pinned.length > 0 ? (
          <View style={{ marginTop: 22 }}>
            <Text style={[type.section, styles.section, { color: c.textDim }]}>Sabitlenenler</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {pinned.map((p) => (
                <PinTile key={p.id} id={p.id} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text style={[type.section, styles.section, { color: c.textDim, marginTop: 24 }]}>Notlar</Text>
        {roots.length === 0 ? (
          <Text style={[type.body, { color: c.textDim, paddingHorizontal: 20, paddingTop: 12 }]}>Henüz not yok. ＋ ile başla.</Text>
        ) : (
          roots.map((id, i) => (
            <View key={id}>
              {i > 0 ? <View style={{ marginRight: 20 }}><Hairline inset={20} /></View> : null}
              <NoteRow id={id} />
            </View>
          ))
        )}
      </ScrollView>

      <TopBar
        left={<Text style={[type.largeTitle, { color: c.text, paddingLeft: 12 }]}>{greeting(new Date().getHours())}</Text>}
        right={
          <>
            <BarIcon icon="search" label="Ara" onPress={() => nav().openPalette({ mode: 'search' })} />
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
      <Fab />
    </View>
  );
}

function BarIcon({ icon, label, onPress, onLongPress }: { icon: 'search' | 'graph' | 'sun' | 'moon'; label: string; onPress: () => void; onLongPress?: () => void }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} onLongPress={onLongPress} hitSlop={6} accessibilityLabel={label} style={styles.barIcon}>
      <Icon name={icon} size={20} color={c.textDim} weight={1.75} />
    </Tap>
  );
}

/** One calm line: the next atomic step. Tap → Autopilot. */
function NextPill({ id }: { id: NodeId }) {
  const c = usePalette();
  const n = useNode(id);
  if (!n) return null;
  return (
    <Animated.View entering={fadeIn} style={{ paddingHorizontal: 20 }}>
      <Tap onPress={() => (haptic.lens(), nav().push({ name: 'autopilot', scope: null }))} style={[styles.pill, { backgroundColor: c.surface }]} accessibilityLabel={`Sıradaki: ${n.title}`}>
        <Text style={{ fontSize: 11, color: c.amberInk }}>▶</Text>
        <Text style={[type.small, { color: c.textDim, fontFamily: font.uiMedium }]}>Sıradaki:</Text>
        <Text numberOfLines={1} style={[type.small, { color: c.text, fontFamily: font.uiMedium, flex: 1 }]}>
          {n.title || 'Adsız görev'}
        </Text>
        <Icon name="chevron" size={15} color={c.textFaint} />
      </Tap>
    </Animated.View>
  );
}

const PinTile = memo(function PinTile({ id }: { id: NodeId }) {
  const c = usePalette();
  const n = useNode(id);
  const p = useProgress(id);
  if (!n) return null;
  return (
    <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} style={[styles.tile, { backgroundColor: c.surface }]}>
      <Text numberOfLines={2} style={[type.small, { color: c.text, fontFamily: font.uiMedium, fontSize: 14, lineHeight: 19, flex: 1 }]}>
        {n.title || 'Yeni not'}
      </Text>
      {p.done > 0 ? <ProgressRing done={p.done} total={p.total} size={14} /> : null}
    </Tap>
  );
});

function Fab() {
  const c = usePalette();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  return (
    <Tap
      onPress={() => {
        haptic.soft();
        const id = e.create(null, { title: '' });
        nav().push({ name: 'node', id });
      }}
      accessibilityLabel="Yeni not"
      style={[styles.fab, { bottom: insets.bottom + 16, backgroundColor: c.accent, shadowColor: c.shadow }]}
    >
      <Icon name="plus" size={24} color={c.card} weight={2} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 8 },
  barIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 14 },
  tile: { width: 160, height: 68, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
