import { BlurView } from 'expo-blur';
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '../platform/haptics';
import { useEngine } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, spring, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Tap } from './primitives';

/**
 * Cortex Dump. The cost of "where does this go?" kills ideas, so nothing is
 * asked: type, release, it lands in the inbox. Pull the bar up from anywhere
 * on Home to start typing; prefix `[] ` to make it a task.
 */
export function QuickCapture() {
  const c = usePalette();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  const kb = useAnimatedKeyboard();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const pull = useSharedValue(0);
  const sent = useSharedValue(0);

  const focus = () => {
    haptic.select();
    input.current?.focus();
  };

  const pan = usePanGesture({
    // While typing, vertical drags belong to the text, not to the pull gesture.
    enabled: !focused,
    activeOffsetY: [-12, 12],
    onUpdate: (ev) => {
      'worklet';
      pull.value = Math.max(-60, Math.min(0, ev.translationY)) * 0.6;
    },
    onDeactivate: (ev) => {
      'worklet';
      if (ev.translationY < -26) scheduleOnRN(focus);
      pull.value = withSpring(0, spring.bouncy);
    },
  });

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
    // capture() files at the top of the inbox; feed in reverse so order is preserved, as one undo step.
    e.transact('Yakala', () => {
      for (const line of [...lines].reverse()) e.capture(line);
    });
    setText('');
    haptic.soft();
    sent.value = 1;
    sent.value = withSpring(0, spring.gentle);
    nav().showToast('Gelen Kutusu’na düştü');
  };

  const lift = useAnimatedStyle(() => {
    const k = kb.height.value;
    return {
      transform: [{ translateY: -Math.max(0, k - insets.bottom) + pull.value }, { scale: 1 - sent.value * 0.02 }],
    };
  });

  return (
    <Animated.View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }, lift]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={[styles.shadow, { shadowColor: c.shadow }]}>
          <BlurView intensity={c.scheme === 'dark' ? 40 : 60} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={[styles.bar, { borderColor: c.cardBorder, borderTopColor: c.scheme === 'dark' ? c.highlight : c.cardBorder }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.card, opacity: c.scheme === 'dark' ? 0.72 : 0.78 }]} />
            {!focused ? <View style={[styles.handle, { backgroundColor: c.textFaint }]} /> : null}
            <View style={styles.row}>
              <Icon name="inbox" size={19} color={focused ? c.accent : c.textDim} />
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Aklındakini dök…"
                placeholderTextColor={c.textFaint}
                multiline={focused}
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={submit}
                selectionColor={c.accent}
                style={[type.row, { flex: 1, color: c.text, maxHeight: 120, paddingVertical: 0 }]}
              />
              {text.trim() ? (
                <Tap onPress={submit} style={[styles.send, { backgroundColor: c.accent }]} accessibilityLabel="Yakala">
                  <Icon name="send" size={18} color={c.card} weight={2} />
                </Tap>
              ) : null}
            </View>
            {focused ? (
              <Text style={[type.small, { color: c.textFaint, marginTop: 8, fontFamily: font.ui }]}>
                Satır başına bir düşünce · “[] ” ile görev · nereye gideceğini sonra düşün
              </Text>
            ) : null}
          </BlurView>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  shadow: { shadowOpacity: 1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, borderRadius: radius.xl },
  bar: { borderRadius: radius.xl, overflow: 'hidden', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  handle: { position: 'absolute', top: 5, alignSelf: 'center', width: 30, height: 3.5, borderRadius: 2, opacity: 0.45 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
