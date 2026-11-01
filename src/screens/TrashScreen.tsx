import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../platform/haptics';
import { useEngine, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, space, type } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Label, Tap } from '../ui/primitives';

export function TrashScreen() {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const insets = useSafeAreaInsets();
  const items = useMemo(() => e.trash().map((n) => ({ ...n, size: e.subtreeSql(n.id).length })), [e, v]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 6 }}>
      <View style={{ paddingHorizontal: space.l, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tap onPress={() => nav().pop()} style={[styles.back, { backgroundColor: c.surface, borderColor: c.hairline }]} accessibilityLabel="Geri">
          <Icon name="back" size={19} color={c.text} />
        </Tap>
        {items.length ? (
          <Tap
            onPress={() => {
              haptic.thud();
              const n = e.purgeTrash(0);
              nav().showToast(`${n} düğüm kalıcı olarak silindi`, false);
            }}
            style={[styles.empty, { borderColor: c.hairline }]}
          >
            <Text style={[type.small, { fontFamily: font.uiSemi, color: c.danger }]}>Çöpü boşalt</Text>
          </Tap>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: space.xl, marginTop: 14, marginBottom: 10 }}>
        <Label>30 GÜN SAKLANIR</Label>
        <Text style={[type.display, { color: c.text, marginTop: 6 }]}>Çöp kutusu</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={<Text style={[type.body, { color: c.textFaint, paddingHorizontal: space.xl, marginTop: 20 }]}>Boş. Hiçbir şey kaybolmadı.</Text>}
        renderItem={({ item }) => {
          const size = item.size;
          return (
            <View style={[styles.row, { borderBottomColor: c.hairline }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.row, { color: c.text }]} numberOfLines={1}>
                  {item.title || 'Adsız'}
                </Text>
                <Text style={[type.small, { color: c.textDim }]}>
                  {new Date(item.deletedAt!).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {size > 1 ? ` · ${size - 1} alt düğümle` : ''}
                </Text>
              </View>
              <Tap
                onPress={() => {
                  haptic.tick();
                  e.restore(item.id);
                  nav().showToast(`“${item.title || 'Adsız'}” geri yüklendi`);
                }}
                style={[styles.restore, { backgroundColor: c.accentSoft }]}
              >
                <Icon name="restore" size={15} color={c.accent} />
                <Text style={[type.small, { fontFamily: font.uiSemi, color: c.accent }]}>Geri yükle</Text>
              </Tap>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  empty: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.xl, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  restore: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
});
