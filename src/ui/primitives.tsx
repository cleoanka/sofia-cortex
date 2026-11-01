import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, spring, type } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

const APressable = Animated.createAnimatedComponent(Pressable);
const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

/** Pressable with a physical spring press. */
export function Tap({ style, children, scaleTo = 0.965, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children?: React.ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        s.value = withSpring(scaleTo, spring.snappy);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, spring.bouncy);
        rest.onPressOut?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </APressable>
  );
}

/** Raised card: hairline border, layered soft shadow, specular top edge in dark. */
export function Surface({ style, children, elevated = true }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; elevated?: boolean }) {
  const c = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: radius.l,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.cardBorder,
          borderTopColor: c.scheme === 'dark' ? c.highlight : c.cardBorder,
        },
        elevated && {
          shadowColor: c.shadow,
          shadowOpacity: 1,
          shadowRadius: c.scheme === 'dark' ? 18 : 14,
          shadowOffset: { width: 0, height: c.scheme === 'dark' ? 8 : 6 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The check. Empty ring → amber disc with a drawn checkmark. The stroke draws
 * on (dash offset) while the disc springs, so completion has a physical "give".
 */
export const Check = memo(function Check({ done, size = 22, onPress, dim }: { done: boolean; size?: number; onPress?: () => void; dim?: boolean }) {
  const c = usePalette();
  const p = useSharedValue(done ? 1 : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    p.value = withSpring(done ? 1 : 0, spring.snappy);
    if (done) pop.value = withSequence(withSpring(1.18, { damping: 9, stiffness: 520, mass: 0.5 }), withSpring(1, spring.bouncy));
  }, [done]);
  const disc = useAnimatedProps(() => ({
    r: interpolate(p.value, [0, 1], [0, 9.2]),
    opacity: p.value,
  }));
  const ring = useAnimatedProps(() => ({
    stroke: interpolateColor(p.value, [0, 1], [dim ? c.textFaint : c.textDim, c.amber]) as string,
  }));
  const mark = useAnimatedProps(() => ({ strokeDashoffset: interpolate(p.value, [0.35, 1], [16, 0], 'clamp') }));
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <APressable hitSlop={12} onPress={onPress} style={[{ width: size, height: size }, s]} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <ACircle cx="12" cy="12" r="9.2" fill="none" strokeWidth={1.6} animatedProps={ring} />
        <ACircle cx="12" cy="12" fill={c.amber} animatedProps={disc} />
        <APath d="m7.6 12.4 3 3 5.8-6" fill="none" stroke={c.scheme === 'dark' ? c.bg : c.card} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" animatedProps={mark} />
      </Svg>
    </APressable>
  );
});

/**
 * Progress ring. Closes with a spring; on reaching 100% it waits a beat
 * (120ms, the constitution's cascade delay) and blooms amber.
 */
export const ProgressRing = memo(function ProgressRing({ done, total, size = 26, label = true, stroke = 2.2 }: { done: number; total: number; size?: number; label?: boolean; stroke?: number }) {
  const c = usePalette();
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : done / total;
  const v = useSharedValue(frac);
  const full = useSharedValue(frac >= 1 ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(frac, spring.gentle);
    full.value = frac >= 1 ? withDelay(120, withSpring(1, spring.snappy)) : withSpring(0, spring.snappy);
  }, [frac]);
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: C * (1 - Math.min(1, Math.max(0, v.value))),
    stroke: interpolateColor(full.value, [0, 1], [c.accent, c.amber]) as string,
  }));
  const bloom = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * Math.sin(full.value * Math.PI) }] }));
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, bloom]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.ring} strokeWidth={stroke} fill="none" />
        <ACircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          animatedProps={arc}
        />
      </Svg>
      {label && size >= 30 ? (
        <Text style={{ fontFamily: font.uiSemi, fontSize: size * 0.27, color: frac >= 1 ? c.amber : c.textDim, fontVariant: ['tabular-nums'] }}>
          {done}/{total}
        </Text>
      ) : null}
    </Animated.View>
  );
});

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = usePalette();
  return <Text style={[type.micro, { color: c.textDim, textTransform: 'uppercase' }, style]}>{children}</Text>;
}

/** Icon button with an always-visible caption — no hidden menus, ever. */
export function ToolButton({ icon, label, onPress, active, tint, disabled }: { icon: IconName; label: string; onPress: () => void; active?: boolean; tint?: string; disabled?: boolean }) {
  const c = usePalette();
  const color = disabled ? c.textFaint : active ? tint ?? c.accent : c.textDim;
  return (
    <Tap onPress={disabled ? undefined : onPress} style={{ alignItems: 'center', minWidth: 44, gap: 5, opacity: disabled ? 0.55 : 1 }} accessibilityLabel={label}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? (tint ? tint + '1F' : c.accentSoft) : c.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? 'transparent' : c.hairline,
        }}
      >
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: font.uiMedium, fontSize: 10.5, letterSpacing: 0.1, color: active ? color : c.textDim }}>
        {label}
      </Text>
    </Tap>
  );
}

export function Pill({ icon, label, onPress, tone = 'neutral' }: { icon?: IconName; label: string; onPress?: () => void; tone?: 'neutral' | 'accent' | 'amber' }) {
  const c = usePalette();
  const fg = tone === 'accent' ? c.accent : tone === 'amber' ? c.amber : c.textDim;
  const bg = tone === 'accent' ? c.accentSoft : tone === 'amber' ? c.amberSoft : c.surface;
  return (
    <Tap onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 30, borderRadius: radius.pill, backgroundColor: bg }}>
      {icon ? <Icon name={icon} size={15} color={fg} weight={1.8} /> : null}
      <Text style={{ fontFamily: font.uiMedium, fontSize: 13, color: fg, letterSpacing: -0.1 }}>{label}</Text>
    </Tap>
  );
}
