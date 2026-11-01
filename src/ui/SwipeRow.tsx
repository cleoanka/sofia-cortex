import React, { useCallback } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '../platform/haptics';
import { usePalette } from '../theme/ThemeProvider';
import { t200 } from '../theme/motion';
import { sf } from '../theme/tokens';
import { Icon } from './Icon';

const OUTDENT_AT = -64;
const INDENT_AT = 84;

/**
 * Mail-style swipe. Right nests the row under the one above it (“İçeri al”).
 * Left on a nested row first offers “Dışarı al” (a short pull steps out one
 * level); a long pull — or any left pull on a top-level row — is red “Sil”.
 * Vertical scroll always wins until the finger clearly moves sideways.
 */
export function SwipeRow({
  children,
  onDelete,
  onIndent,
  onOutdent,
  enabled = true,
  bg,
}: {
  children: React.ReactNode;
  onDelete?: () => void;
  onIndent?: () => void;
  onOutdent?: () => void;
  enabled?: boolean;
  /** Background of the sliding row (cards on Home use the card colour). */
  bg?: string;
}) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const zone = useSharedValue(0);
  const deleteAt = onOutdent ? -170 : -96;
  // Plain flags for the worklets — never the JS callbacks themselves.
  const hasIndent = !!onIndent;
  const hasDelete = !!onDelete;
  const hasOutdent = !!onOutdent;

  const del = useCallback(() => onDelete?.(), [onDelete]);
  const ind = useCallback(() => onIndent?.(), [onIndent]);
  const out = useCallback(() => onOutdent?.(), [onOutdent]);

  const pan = usePanGesture({
    enabled,
    activeOffsetX: [-18, 18],
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      'worklet';
      const dx = e.translationX;
      x.value = dx > 0 ? (hasIndent ? Math.min(dx, 140) : dx * 0.15) : hasDelete || hasOutdent ? Math.max(dx, hasDelete ? -width : -120) : dx * 0.15;
      const z = dx < deleteAt && hasDelete ? -1 : dx < OUTDENT_AT && hasOutdent ? -2 : dx > INDENT_AT && hasIndent ? 1 : 0;
      if (z !== zone.value) {
        zone.value = z;
        if (z !== 0) scheduleOnRN(haptic.select);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const z = e.canceled ? 0 : zone.value;
      zone.value = 0;
      if (z === -1) {
        x.value = withTiming(-width, t200, (fin) => {
          if (fin) scheduleOnRN(del);
        });
        return;
      }
      if (z === -2) scheduleOnRN(out);
      if (z === 1) scheduleOnRN(ind);
      x.value = withTiming(0, t200);
    },
  });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const outLayer = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-12, -40], [0, 1], Extrapolation.CLAMP) }));
  // On a nested row red takes over only once the pull passes the delete line.
  const delLayer = useAnimatedStyle(() => ({
    opacity: hasOutdent ? interpolate(x.value, [deleteAt + 30, deleteAt], [0, 1], Extrapolation.CLAMP) : interpolate(x.value, [-12, -40], [0, 1], Extrapolation.CLAMP),
  }));
  const right = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [12, 40], [0, 1], Extrapolation.CLAMP) }));

  return (
    <View>
      {onOutdent ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: c.surface, justifyContent: 'flex-end' }, outLayer]}>
          <Icon name="outdent" size={18} color={c.text} weight={1.8} />
          <Text style={[styles.label, { color: c.text }]}>Dışarı al</Text>
        </Animated.View>
      ) : null}
      {onDelete ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: c.danger, justifyContent: 'flex-end' }, delLayer]}>
          <Icon name="trash" size={18} color={c.onAmber} weight={1.8} />
          <Text style={[styles.label, { color: c.onAmber }]}>Sil</Text>
        </Animated.View>
      ) : null}
      {onIndent ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: c.amber }, right]}>
          <Icon name="indent" size={18} color={c.onAmber} weight={1.8} />
          <Text style={[styles.label, { color: c.onAmber }]}>İçeri al</Text>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: bg ?? c.bg }, row]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  under: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22 },
  label: { ...sf.uiSemi, fontSize: 15 },
});
