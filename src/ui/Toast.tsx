import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../platform/haptics';
import { useEngine } from '../state/hooks';
import { useNav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius } from '../theme/tokens';
import { Icon } from './Icon';
import { Tap } from './primitives';

/** The glass capsule of time travel: every consequential act can be taken back. */
export function Toast() {
  const toast = useNav((s) => s.toast);
  const hide = useNav((s) => s.hideToast);
  const c = usePalette();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, toast.undo ? 4200 : 2400);
    return () => clearTimeout(t);
  }, [toast?.key]);
  if (!toast) return null;
  return (
    <Animated.View key={toast.key} entering={ZoomIn.springify().damping(16).stiffness(260)} exiting={FadeOut.duration(180)} style={[styles.wrap, { bottom: insets.bottom + 92 }]} pointerEvents="box-none">
      <View style={[styles.shadow, { shadowColor: c.shadow }]}>
        <BlurView intensity={40} tint={c.scheme === 'dark' ? 'light' : 'dark'} style={styles.capsule}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.invBg, opacity: 0.9 }]} />
          <Text numberOfLines={1} style={[styles.text, { color: c.invText }]}>
            {toast.text}
          </Text>
          {toast.undo && e.canUndo ? (
            <Tap
              onPress={() => {
                const l = e.undo();
                haptic.lens();
                hide();
                if (l) useNav.getState().showToast(`Geri alındı · ${l}`, false);
              }}
              style={styles.undo}
              accessibilityLabel="Geri al"
            >
              <Icon name="undo" size={15} color={c.invAccent} weight={2} />
              <Text style={[styles.text, { color: c.invAccent, fontFamily: font.uiSemi }]}>Geri al</Text>
            </Tap>
          ) : null}
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  shadow: { shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, borderRadius: radius.pill },
  capsule: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 18, paddingRight: 8, height: 44, borderRadius: radius.pill, overflow: 'hidden', maxWidth: 360 },
  text: { fontFamily: font.uiMedium, fontSize: 14, letterSpacing: -0.1, flexShrink: 1 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
});
