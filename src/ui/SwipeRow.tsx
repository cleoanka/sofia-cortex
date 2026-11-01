import React, { useCallback } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '../platform/haptics';
import { usePalette } from '../theme/ThemeProvider';
import { t200 } from '../theme/motion';
import { font } from '../theme/tokens';
import { Icon } from './Icon';

const DELETE_AT = -96;
const INDENT_AT = 84;

/**
 * Mail-style swipe. Left reveals a red “Sil”; past the threshold the row slides
 * out and is deleted. Right reveals “Alt görev yap” and nests the row under the
 * one above it. Vertical scroll always wins until the finger clearly moves sideways.
 */
export function SwipeRow({ children, onDelete, onIndent, enabled = true }: { children: React.ReactNode; onDelete?: () => void; onIndent?: () => void; enabled?: boolean }) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const zone = useSharedValue(0);

  const del = useCallback(() => onDelete?.(), [onDelete]);
  const ind = useCallback(() => onIndent?.(), [onIndent]);

  const pan = usePanGesture({
    enabled,
    activeOffsetX: [-18, 18],
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      'worklet';
      const dx = e.translationX;
      x.value = dx > 0 ? (onIndent ? Math.min(dx, 140) : dx * 0.15) : onDelete ? Math.max(dx, -width) : dx * 0.15;
      const z = dx < DELETE_AT ? -1 : dx > INDENT_AT ? 1 : 0;
      if (z !== zone.value) {
        zone.value = z;
        if (z !== 0) scheduleOnRN(haptic.select);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const dx = e.canceled ? 0 : e.translationX;
      zone.value = 0;
      if (dx < DELETE_AT && onDelete) {
        x.value = withTiming(-width, t200, (fin) => {
          if (fin) scheduleOnRN(del);
        });
        return;
      }
      if (dx > INDENT_AT && onIndent) scheduleOnRN(ind);
      x.value = withTiming(0, t200);
    },
  });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const left = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-12, -40], [0, 1], Extrapolation.CLAMP) }));
  const right = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [12, 40], [0, 1], Extrapolation.CLAMP) }));

  return (
    <View>
      {onDelete ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: c.danger, justifyContent: 'flex-end' }, left]}>
          <Icon name="trash" size={18} color={c.card} weight={1.8} />
          <Text style={[styles.label, { color: c.card }]}>Sil</Text>
        </Animated.View>
      ) : null}
      {onIndent ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: c.accent }, right]}>
          <Icon name="chevron" size={18} color={c.card} weight={1.8} />
          <Text style={[styles.label, { color: c.card }]}>Alt görev yap</Text>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: c.bg }, row]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  under: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22 },
  label: { fontFamily: font.uiSemi, fontSize: 15 },
});
