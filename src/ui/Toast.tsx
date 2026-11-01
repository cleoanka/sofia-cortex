import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../platform/haptics';
import { useEngine } from '../state/hooks';
import { useNav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, fadeOut } from '../theme/motion';
import { font } from '../theme/tokens';
import { Tap } from './primitives';

/** A quiet status line with “Geri al”. Fades, never bounces. */
export function Toast() {
  const toast = useNav((s) => s.toast);
  const hide = useNav((s) => s.hideToast);
  const c = usePalette();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, toast.undo ? 3500 : 2200);
    return () => clearTimeout(t);
  }, [toast?.key]);
  if (!toast) return null;
  return (
    <Animated.View key={toast.key} entering={fadeIn} exiting={fadeOut} style={[styles.wrap, { bottom: insets.bottom + 84 }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: c.invBg, shadowColor: c.shadow }]}>
        <Text numberOfLines={1} style={[styles.text, { color: c.invText }]}>
          {toast.text}
        </Text>
        {toast.undo && e.canUndo ? (
          <Tap
            onPress={() => {
              e.undo();
              haptic.select();
              hide();
            }}
            hitSlop={8}
            accessibilityLabel="Geri al"
          >
            <Text style={[styles.text, { color: c.invAccent, fontFamily: font.uiSemi, flex: 0 }]}>Geri al</Text>
          </Tap>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, zIndex: 50 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16, height: 44, borderRadius: 12, paddingHorizontal: 16, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  text: { fontFamily: font.ui, fontSize: 14, flex: 1 },
});
