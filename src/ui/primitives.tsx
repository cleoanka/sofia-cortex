import { BlurView } from 'expo-blur';
import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, interpolateColor, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { usePalette } from '../theme/ThemeProvider';
import { t150, t200 } from '../theme/motion';
import { font, type } from '../theme/tokens';
import { takeCascadeDelay } from './choreo';
import { Icon, type IconName } from './Icon';

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

/** Turkish-correct capitals: RN's textTransform is locale-blind (i → I, not İ). */
export const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

/** Pressable with quiet opacity feedback — nothing grows, nothing bounces. */
export function Tap({ style, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return (
    <Pressable {...rest} style={({ pressed }) => [style, pressed && { opacity: 0.55 }]}>
      {children}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, size = 22, disabled }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number; disabled?: boolean }) {
  const c = usePalette();
  return (
    <Tap onPress={disabled ? undefined : onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconBtn, disabled && { opacity: 0.35 }]}>
      <Icon name={icon} size={size} color={color ?? c.text} />
    </Tap>
  );
}

export const BAR_HEIGHT = 52;

/**
 * Sticky top bar. Content scrolls underneath a blurred, nearly opaque surface,
 * so text never collides with the clock or the battery.
 */
export function TopBar({ left, right, center, tint }: { left?: React.ReactNode; right?: React.ReactNode; center?: React.ReactNode; tint?: string }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const bg = tint ?? c.bg;
  return (
    <View style={[styles.bar, { height: insets.top + BAR_HEIGHT, paddingTop: insets.top, borderBottomColor: c.hairline }]} pointerEvents="box-none">
      <BlurView intensity={30} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bg, opacity: 0.9 }]} />
      <View style={styles.barRow} pointerEvents="box-none">
        <View style={styles.barCenter} pointerEvents="box-none">
          {center}
        </View>
        <View style={styles.barSide}>{left}</View>
        <View style={[styles.barSide, { justifyContent: 'flex-end' }]}>{right}</View>
      </View>
    </View>
  );
}

export function useBarInset(): number {
  return useSafeAreaInsets().top + BAR_HEIGHT;
}

export function BackButton({ onPress, label = 'Geri' }: { onPress: () => void; label?: string }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} hitSlop={8} style={styles.back} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name="back" size={22} color={c.accent} weight={2} />
      <Text style={[type.barTitle, { color: c.accent, fontFamily: font.ui }]}>{label}</Text>
    </Tap>
  );
}

/**
 * The check. Ring → amber disc with a drawn mark, 150 ms. An auto-completed
 * ancestor waits for its child's ring to close first (cascade choreography).
 */
export const Check = memo(function Check({ id, done, size = 22, onPress }: { id?: string; done: boolean; size?: number; onPress?: () => void }) {
  const c = usePalette();
  const p = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    const wait = done ? takeCascadeDelay(id) : 0;
    p.value = withDelay(wait, withTiming(done ? 1 : 0, t150));
  }, [done]);
  const disc = useAnimatedProps(() => ({ r: interpolate(p.value, [0, 1], [0, 10]), opacity: p.value }));
  const ring = useAnimatedProps(() => ({ stroke: interpolateColor(p.value, [0, 1], [c.textFaint, c.amber]) as string }));
  const mark = useAnimatedProps(() => ({ strokeDashoffset: interpolate(p.value, [0.3, 1], [16, 0], 'clamp') }));
  return (
    <Pressable hitSlop={12} onPress={onPress} style={{ width: size, height: size }} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <ACircle cx="12" cy="12" r="10" fill="none" strokeWidth={1.5} animatedProps={ring} />
        <ACircle cx="12" cy="12" fill={c.amber} animatedProps={disc} />
        <APath d="m7.6 12.4 3 3 5.8-6" fill="none" stroke={c.scheme === 'dark' ? c.bg : c.card} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" animatedProps={mark} />
      </Svg>
    </Pressable>
  );
});

/** A plain line's marker: a faint circle that turns the line into a task. */
export function LineDot({ onPress }: { onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable hitSlop={12} onPress={onPress} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Göreve çevir">
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.textFaint, opacity: 0.35 }} />
    </Pressable>
  );
}

/** Tiny progress ring — a quiet hint, never a number. */
export const ProgressRing = memo(function ProgressRing({ done, total, size = 16, stroke = 2 }: { done: number; total: number; size?: number; stroke?: number }) {
  const c = usePalette();
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : done / total;
  const v = useSharedValue(frac);
  useEffect(() => {
    v.value = withTiming(frac, t200);
  }, [frac]);
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: C * (1 - Math.min(1, Math.max(0, v.value))),
    stroke: (v.value >= 0.999 ? c.amber : c.accent) as string,
  }));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.ring} strokeWidth={stroke} fill="none" />
      <ACircle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${C} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} animatedProps={arc} />
    </Svg>
  );
});

export function Hairline({ inset = 0 }: { inset?: number }) {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: inset }} />;
}

/** Raised surface — used sparingly (menus, sheets). */
export function Surface({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const c = usePalette();
  return (
    <View
      style={[
        { backgroundColor: c.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.cardBorder, shadowColor: c.shadow, shadowOpacity: 1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
        style,
        c.scheme === 'dark' && { borderTopColor: c.highlight },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  barRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  barSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  barCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 40 },
});
