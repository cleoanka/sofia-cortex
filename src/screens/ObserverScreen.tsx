import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { titleKey } from '../engine/links';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useChildren, useEngine, useNode } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, layout } from '../theme/motion';
import { font, sf } from '../theme/tokens';
import { toggleTask } from '../ui/actions';
import { KeyboardScrollView, nudgeCaret } from '../ui/keyboard';
import { BackButton, Check, TopBar, useBarInset } from '../ui/primitives';

/**
 * Dış Göz. The same words — not one changed — set as a quiet book page, so you
 * read your own note the way you would read someone else's. Then one question,
 * and a place to answer it with steps that become real tasks.
 */
export function ObserverScreen({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const kids = useChildren(id);
  const top = useBarInset();
  const [draft, setDraft] = useState('');
  if (!n) return null;
  const steps = kids.map((k) => e.get(k)!).filter((k) => k.isTask && !e.isDraft(k.id));
  // Links read as plain words; bare tags are bookkeeping, not prose — they drop out.
  const body = n.body
    .replace(/&([^&\n]{1,80}?)&/g, (_m, t: string) => (e.resolve(titleKey(t)) ? t.trim() : ''))
    .replace(/[ \t]+$/gm, '')
    .trim();

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    e.addProtocol(id, [t]);
    haptic.tick();
    setDraft('');
    // The new step pushes the input down; follow it.
    setTimeout(nudgeCaret, 220);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.obsPaper }}>
      <KeyboardScrollView
        margin={90}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: top + 18, paddingBottom: 80, paddingHorizontal: 28 }}
      >
        <Text style={[styles.title, { color: c.obsInk }]}>{n.title || 'Adsız not'}</Text>
        {body ? (
          body.split(/\n{2,}/).map((para, i) => (
            <Text key={i} style={[styles.body, { color: c.obsInk }]}>
              {para}
            </Text>
          ))
        ) : (
          <Text style={[styles.body, { color: c.obsInkDim, fontFamily: font.serifItalic }]}>Bu not henüz boş.</Text>
        )}

        <View style={[styles.rule, { backgroundColor: c.obsRule }]} />
        <Text style={[styles.prompt, { color: c.obsInkDim }]}>Şu an atılabilecek en küçük, somut adım ne?</Text>

        <View style={{ marginTop: 14 }}>
          {steps.map((s) => (
            <Animated.View key={s.id} entering={fadeIn} layout={layout} style={styles.step}>
              <Check id={s.id} size={20} done={s.done} onPress={() => toggleTask(e, s.id)} />
              <Text style={[styles.stepText, { color: s.done ? c.obsInkDim : c.obsInk }, s.done && { textDecorationLine: 'line-through' }]}>{s.title}</Text>
            </Animated.View>
          ))}
          <View style={[styles.step, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.obsRule }]}>
            <Text style={[styles.plus, { color: c.accent }]}>＋</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onFocus={() => setTimeout(nudgeCaret, 60)}
              onSubmitEditing={add}
              submitBehavior="submit"
              returnKeyType="next"
              placeholder="Eylem adımı ekle"
              placeholderTextColor={c.obsInkDim}
              selectionColor={c.accent}
              style={[styles.stepText, { color: c.obsInk, flex: 1, paddingVertical: 12 }]}
            />
          </View>
        </View>
      </KeyboardScrollView>
      <TopBar tint={c.obsPaper} left={<BackButton label="Nota dön" onPress={() => nav().pop()} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.serifMedium, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, marginBottom: 20 },
  body: { fontFamily: font.serif, fontSize: 19, lineHeight: 30, letterSpacing: -0.05, marginBottom: 16 },
  rule: { width: 48, height: 1, marginTop: 16, marginBottom: 24 },
  prompt: { fontFamily: font.serifItalic, fontSize: 18, lineHeight: 26 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  stepText: { ...sf.ui, fontSize: 16, lineHeight: 22, flex: 1 },
  plus: { width: 20, textAlign: 'center', fontSize: 18 },
});
