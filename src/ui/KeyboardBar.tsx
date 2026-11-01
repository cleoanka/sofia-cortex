import { useMemo } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { getEngine } from '../platform/db';
import { haptic } from '../platform/haptics';
import { useEditor } from '../state/editor';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, fadeOut } from '../theme/motion';
import { font, type } from '../theme/tokens';
import { appendLine, lineIndent, lineOutdent, lineToggleKind } from './actions';
import { Icon, type IconName } from './Icon';
import { Tap } from './primitives';

/**
 * The thin bar that rides on top of the keyboard. Five verbs, always the same
 * place, and a definite way out: “Bitti”.
 */
export function KeyboardBar({ pageId }: { pageId: string }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const kbVisible = useKeyboardState((s) => s.isVisible);
  const focused = useEditor((s) => s.focused);
  const query = useEditor((s) => s.linkQuery);
  const isLine = focused?.kind === 'line';
  const lineIsTask = isLine && getEngine().get(focused.id)?.isTask;

  const suggestions = useMemo(() => {
    if (query === null || !focused) return [];
    const self = focused.kind === 'line' ? focused.id : pageId;
    return getEngine().suggestTitles(query, 8, self).filter((n) => n.title.trim());
  }, [query, focused?.id]);

  // Tied to focus, not to the software keyboard: with a hardware keyboard the bar docks at the bottom.
  // Only for fields on this page (a covered page keeps its own bar out of sight).
  const onPage = !!focused && (focused.id === pageId || getEngine().isDescendant(focused.id, pageId));
  if (!focused || focused.kind === 'action' || !onPage) return null;
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.sticky}>
      {query !== null ? (
        <Animated.View entering={fadeIn} exiting={fadeOut} style={[styles.suggest, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}>
            {suggestions.map((n) => (
              <Tap key={n.id} onPress={() => (haptic.select(), setTimeout(() => focused.completeLink(n.title), 80))} style={[styles.chip, { backgroundColor: c.card, borderColor: c.hairline }]}>
                <Text numberOfLines={1} style={[type.small, { color: c.text, fontFamily: font.uiMedium }]}>
                  {n.title}
                </Text>
              </Tap>
            ))}
            {query.trim() ? (
              <Tap onPress={() => (haptic.select(), setTimeout(() => focused.completeLink(query.trim()), 80))} style={[styles.chip, { backgroundColor: c.accentSoft, borderColor: 'transparent' }]}>
                <Text numberOfLines={1} style={[type.small, { color: c.accent, fontFamily: font.uiMedium }]}>
                  &{query.trim()}& etiketi
                </Text>
              </Tap>
            ) : suggestions.length === 0 ? (
              <Text style={[type.small, { color: c.textDim }]}>Bir not adı yaz…</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : null}
      <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.hairline, height: 46 + (kbVisible ? 0 : insets.bottom), paddingBottom: kbVisible ? 0 : insets.bottom }]}>
        <Key
          icon="task"
          label="Görev"
          active={!!lineIsTask}
          onPress={() => {
            if (isLine) lineToggleKind(focused.id);
            else appendLine(pageId, true);
          }}
        />
        <Key icon="indent" label="Altına al" disabled={!isLine} onPress={() => isLine && lineIndent(focused.id)} />
        <Key icon="outdent" label="Üste çıkar" disabled={!isLine} onPress={() => isLine && lineOutdent(focused.id)} />
        {/* iOS commits a pending autocorrection when the bar is tapped; insert after it lands. */}
        <Key icon="link" label="Bağla" onPress={() => setTimeout(() => focused.insert('&'), 80)} />
        <View style={{ flex: 1 }} />
        <Tap onPress={() => Keyboard.dismiss()} hitSlop={8} style={styles.done} accessibilityLabel="Klavyeyi kapat">
          <Text style={[type.barTitle, { color: c.accent }]}>Bitti</Text>
          <Icon name="down" size={16} color={c.accent} weight={2} />
        </Tap>
      </View>
    </KeyboardStickyView>
  );
}

function Key({ icon, label, onPress, disabled, active }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const c = usePalette();
  return (
    <Tap
      onPress={disabled ? undefined : () => (haptic.select(), onPress())}
      hitSlop={4}
      accessibilityLabel={label}
      style={[styles.key, active && { backgroundColor: c.accentSoft }, disabled && { opacity: 0.3 }]}
    >
      <Icon name={icon} size={20} color={active ? c.accent : c.text} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30 },
  suggest: { height: 44, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, maxWidth: 220 },
  bar: { height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  key: { width: 44, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36 },
});
