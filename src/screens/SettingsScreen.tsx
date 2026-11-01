import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { seedShowcase } from '../engine/seed';
import { haptic } from '../platform/haptics';
import { exportJSON, exportMarkdownZip, importJSON } from '../platform/vault';
import { useEngine } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette, useTheme, type ThemePref } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { BackButton, Hairline, Tap, TopBar, useBarInset } from '../ui/primitives';

export function SettingsScreen() {
  const c = usePalette();
  const { pref, setPref } = useTheme();
  const e = useEngine();
  const top = useBarInset();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    haptic.select();
    setBusy(key);
    try {
      const r = await fn();
      if (typeof r === 'number') nav().showToast(`${r} not içe aktarıldı`);
    } catch (err) {
      haptic.warn();
      nav().showToast(err instanceof Error ? err.message : 'İşlem başarısız', false);
    } finally {
      setBusy(null);
    }
  };

  const themes: { key: ThemePref; label: string }[] = [
    { key: 'system', label: 'Sistemle aynı' },
    { key: 'light', label: 'Açık' },
    { key: 'dark', label: 'Koyu' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 60 }}>
        <Section title="Görünüm">
          {themes.map((t, i) => (
            <Row key={t.key} first={i === 0} label={t.label} checked={pref === t.key} onPress={() => (haptic.select(), setPref(t.key))} />
          ))}
        </Section>

        <Section title="Veriler" note="Her şey bu telefonda. Dilediğin an tamamını dışa aktarabilirsin.">
          <Row first label={busy === 'md' ? 'Hazırlanıyor…' : 'Markdown olarak dışa aktar (.zip)'} onPress={run('md', exportMarkdownZip)} />
          <Row label={busy === 'json' ? 'Hazırlanıyor…' : 'JSON yedeği al'} onPress={run('json', exportJSON)} />
          <Row label={busy === 'imp' ? 'Okunuyor…' : 'JSON yedeğinden geri yükle'} onPress={run('imp', () => importJSON('merge'))} />
        </Section>

        <Section title="Notlar">
          <Row first label="Örnek notları ekle" onPress={() => (haptic.select(), seedShowcase(e), nav().showToast('Örnek notlar eklendi'))} />
          <Row
            label="Bütün notları sil"
            danger
            onPress={() => {
              haptic.thud();
              e.removeAll();
              nav().showToast('Bütün notlar silindi');
            }}
          />
        </Section>
      </ScrollView>
      <TopBar left={<BackButton onPress={() => nav().pop()} />} center={<Text style={[type.barTitle, { color: c.text }]}>Ayarlar</Text>} />
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[type.section, { color: c.textDim, marginHorizontal: 20, marginBottom: 6 }]}>{title}</Text>
      <View style={{ backgroundColor: c.surface, marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' }}>{children}</View>
      {note ? <Text style={[type.small, { color: c.textDim, marginHorizontal: 20, marginTop: 8 }]}>{note}</Text> : null}
    </View>
  );
}

function Row({ label, onPress, checked, first, danger }: { label: string; onPress: () => void; checked?: boolean; first?: boolean; danger?: boolean }) {
  const c = usePalette();
  return (
    <>
      {first ? null : <Hairline inset={16} />}
      <Tap onPress={onPress} style={styles.row}>
        <Text style={[type.row, { color: danger ? c.danger : c.text, flex: 1 }]}>{label}</Text>
        {checked ? <Icon name="check" size={18} color={c.accent} weight={2} /> : null}
      </Tap>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 46 },
});
