import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedShowcase } from '../engine/seed';
import { haptic } from '../platform/haptics';
import { exportJSON, exportMarkdownZip, importJSON } from '../platform/vault';
import { useEngine, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette, useTheme, type ThemePref } from '../theme/ThemeProvider';
import { font, radius, space, type } from '../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { Label, Surface, Tap } from '../ui/primitives';

export function SettingsScreen() {
  const c = usePalette();
  const { pref, setPref } = useTheme();
  const e = useEngine();
  const v = useVersion();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const stats = useMemo(() => {
    const live = e.allLive();
    return { nodes: live.length, tasks: live.filter((n) => n.isTask).length, done: live.filter((n) => n.done).length, links: live.reduce((s, n) => s + e.outgoing(n.id).length, 0), trash: e.trash().length };
  }, [e, v]);

  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    haptic.select();
    setBusy(key);
    try {
      const r = await fn();
      if (typeof r === 'number') nav().showToast(`${r} düğüm içe aktarıldı`);
    } catch (err) {
      haptic.warn();
      nav().showToast(err instanceof Error ? err.message : 'İşlem başarısız', false);
    } finally {
      setBusy(null);
    }
  };

  const themes: { key: ThemePref; label: string; sub: string; icon: IconName }[] = [
    { key: 'system', label: 'Sistemle uyumlu', sub: 'Gün ışığını takip eder', icon: 'auto' },
    { key: 'light', label: 'Kağıt', sub: 'Sıcak alabaster', icon: 'sun' },
    { key: 'dark', label: 'Karbon', sub: 'Derin obsidyen', icon: 'moon' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40 }}>
      <View style={styles.top}>
        <Tap onPress={() => nav().pop()} style={[styles.back, { backgroundColor: c.surface, borderColor: c.hairline }]} accessibilityLabel="Geri">
          <Icon name="back" size={19} color={c.text} />
        </Tap>
      </View>
      <View style={{ paddingHorizontal: space.xl, marginTop: 14 }}>
        <Label>SOFIA CORTEX</Label>
        <Text style={[type.display, { color: c.text, marginTop: 6 }]}>Ayarlar</Text>
        <Text style={[type.small, { color: c.textDim, marginTop: 6 }]}>
          {stats.nodes} düğüm · {stats.tasks} görev · {stats.done} tamamlandı · {stats.links} sinaps
        </Text>
      </View>

      <Section title="Görünüm">
        {themes.map((t, i) => (
          <Row key={t.key} icon={t.icon} title={t.label} sub={t.sub} last={i === themes.length - 1} checked={pref === t.key} onPress={() => (haptic.select(), setPref(t.key))} />
        ))}
      </Section>

      <Section title="Veri egemenliği" note="Her şey bu cihazda, SQLite’ta. Sunucu yok, hesap yok. Dilediğin an tamamını götür.">
        <Row icon="export" title="Markdown kasası (.zip)" sub="Klasör ağacı · checklist · [[wikilink]] — Obsidian’da açılır" busy={busy === 'md'} onPress={run('md', exportMarkdownZip)} />
        <Row icon="export" title="JSON arşivi" sub="Kayıpsız tam yedek" busy={busy === 'json'} onPress={run('json', exportJSON)} />
        <Row icon="import" title="JSON içe aktar · birleştir" sub="Mevcut Cortex korunur" busy={busy === 'imp'} onPress={run('imp', () => importJSON('merge'))} />
        <Row icon="import" title="JSON içe aktar · değiştir" sub="Tamamen yerine koyar (geri alınabilir)" busy={busy === 'rep'} last onPress={run('rep', () => importJSON('replace'))} />
      </Section>

      <Section title="Bakım">
        <Row icon="trash" title="Çöp kutusu" sub={stats.trash ? `${stats.trash} öğe · 30 gün sonra kendiliğinden silinir` : 'Boş'} onPress={() => nav().push({ name: 'trash' })} />
        <Row
          icon="restore"
          title="Başlangıç Cortex’ini ekle"
          sub="Dersler, Dış Göz örneği, mühürlü plan — tekrar keşfet"
          last
          onPress={() => {
            haptic.thud();
            seedShowcase(e);
            nav().showToast('Başlangıç Cortex’i eklendi', false);
          }}
        />
      </Section>

      <View style={{ paddingHorizontal: space.xl, marginTop: 34 }}>
        <Text style={{ fontFamily: font.serifItalic, fontSize: 17, lineHeight: 25, color: c.textDim }}>
          “Başkasına akıl vermek kolaydır.” Sofia, kendi düşüncene bir yabancının gözüyle bakabilmen ve iş yapma zamanı geldiğinde beynini kapatabilmen için var.
        </Text>
        <Text style={[type.small, { color: c.textFaint, marginTop: 14 }]}>Sürüm 1.0 · yerel · çevrimdışı · yapay zekâ yok — yalnızca algoritma ve tasarım.</Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ marginTop: 28, paddingHorizontal: space.l }}>
      <Text style={[type.micro, { color: c.textDim, marginLeft: 6, marginBottom: 8 }]}>{title.toLocaleUpperCase('tr-TR')}</Text>
      <Surface elevated={false} style={{ borderRadius: radius.l, overflow: 'hidden' }}>
        {children}
      </Surface>
      {note ? <Text style={[type.small, { color: c.textFaint, marginTop: 8, marginHorizontal: 6 }]}>{note}</Text> : null}
    </View>
  );
}

function Row({ icon, title, sub, onPress, checked, last, busy }: { icon: IconName; title: string; sub?: string; onPress: () => void; checked?: boolean; last?: boolean; busy?: boolean }) {
  const c = usePalette();
  return (
    <Tap scaleTo={0.99} onPress={onPress} style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline }]}>
      <View style={[styles.icon, { backgroundColor: checked ? c.accentSoft : c.surface }]}>
        <Icon name={icon} size={17} color={checked ? c.accent : c.textDim} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.row, { color: c.text }]}>{title}</Text>
        {sub ? <Text style={[type.small, { color: c.textDim, marginTop: 1 }]}>{busy ? 'Hazırlanıyor…' : sub}</Text> : null}
      </View>
      {checked ? <Icon name="check" size={18} color={c.accent} weight={2.2} /> : checked === undefined ? <Icon name="chevron" size={16} color={c.textFaint} /> : null}
    </Tap>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.l },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
