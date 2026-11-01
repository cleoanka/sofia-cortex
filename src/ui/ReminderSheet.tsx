import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../platform/haptics';
import { setReminder } from '../platform/notify';
import { useNode } from '../state/hooks';
import { nav } from '../state/nav';
import { useSheet } from '../state/sheet';
import { usePalette } from '../theme/ThemeProvider';
import { ease } from '../theme/motion';
import { font, type } from '../theme/tokens';
import { Icon } from './Icon';
import { useKeyboardHeight } from './keyboard';
import { Hairline, Tap } from './primitives';

const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x.getTime();
};

function presets(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const evening = at(now, 20);
  return [
    { key: '1h', label: '1 saat sonra', t: now.getTime() + 60 * 60_000 },
    ...(evening > now.getTime() + 30 * 60_000 ? [{ key: 'eve', label: 'Bu akşam 20:00', t: evening }] : []),
    { key: 'tom', label: 'Yarın 09:00', t: at(tomorrow, 9) },
  ];
}

const fmt = (t: number) => new Date(t).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Reminder drawer: when, and whether the notification opens straight into Autopilot. */
export function ReminderSheet() {
  const sheet = useSheet((s) => s.sheet);
  if (sheet?.kind !== 'reminder') return null;
  return <Body key={sheet.id} id={sheet.id} />;
}

function Body({ id }: { id: string }) {
  const live = useNode(id);
  const gone = !live;
  // The note can vanish (undo, delete) while the drawer is open.
  useEffect(() => {
    if (gone) useSheet.getState().close();
  }, [gone]);
  return gone ? null : <BodyFor id={id} />;
}

function BodyFor({ id }: { id: string }) {
  const c = usePalette();
  const n = useNode(id)!;
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  // While typing the first move, the drawer sits on the keyboard and folds the time pickers away.
  const typing = kb > 0;
  const opts = useMemo(() => presets(), []);
  const [t, setT] = useState<number>(n.reminderAt && n.reminderAt > Date.now() ? n.reminderAt : opts[opts.length - 1].t);
  const [hook, setHook] = useState(!!n.reminderHook);
  const [first, setFirst] = useState(n.reminderHook ?? '');
  const close = () => {
    Keyboard.dismiss();
    useSheet.getState().close();
  };
  const apply = async () => {
    haptic.select();
    await setReminder(id, t, hook ? first.trim() || n.title : null);
    close();
    nav().showToast('Hatırlatıcı kuruldu', false);
  };
  const clear = async () => {
    haptic.soft();
    await setReminder(id, null, null);
    close();
  };
  return (
    <>
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, zIndex: 60 }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Kapat" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(220).easing(ease)}
        exiting={SlideOutDown.duration(180).easing(ease)}
        style={[styles.sheet, { backgroundColor: c.card, bottom: kb, paddingBottom: typing ? 16 : insets.bottom + 16 }]}
      >
        <Text style={[type.barTitle, { color: c.text }]}>Hatırlatıcı</Text>
        <Text numberOfLines={1} style={[type.small, { color: c.textDim, marginTop: 2 }]}>
          {n.title || 'Adsız not'}
        </Text>

        {typing ? (
          <Text style={[type.small, { color: c.text, marginTop: 12, fontFamily: font.uiMedium }]}>{fmt(t)}</Text>
        ) : (
          <>
            <View style={{ marginTop: 16 }}>
              {opts.map((o, i) => (
                <View key={o.key}>
                  {i > 0 ? <Hairline /> : null}
                  <Tap onPress={() => (haptic.select(), setT(o.t))} style={styles.opt}>
                    <Text style={[type.row, { color: c.text, flex: 1 }]}>{o.label}</Text>
                    {Math.abs(o.t - t) < 60_000 ? <Icon name="check" size={18} color={c.accent} weight={2} /> : null}
                  </Tap>
                </View>
              ))}
            </View>

            <View style={styles.stepper}>
              <Tap
                onPress={() => (haptic.select(), setT((x) => Math.max(Date.now() + 60_000, x - 15 * 60_000)))}
                style={[styles.step, { backgroundColor: c.surface }]}
              >
                <Text style={[type.row, { color: c.text }]}>−15 dk</Text>
              </Tap>
              <Text style={[type.small, { color: c.text, flex: 1, textAlign: 'center', fontFamily: font.uiMedium }]}>{fmt(t)}</Text>
              <Tap onPress={() => (haptic.select(), setT((x) => x + 15 * 60_000))} style={[styles.step, { backgroundColor: c.surface }]}>
                <Text style={[type.row, { color: c.text }]}>+15 dk</Text>
              </Tap>
            </View>
          </>
        )}

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.row, { color: c.text }]}>Otopilot’ta aç</Text>
            <Text style={[type.small, { color: c.textDim }]}>Bildirime dokununca doğrudan tek görev ekranı açılır</Text>
          </View>
          <Switch value={hook} onValueChange={(v) => (haptic.select(), setHook(v))} trackColor={{ true: c.accent, false: c.ring }} />
        </View>
        {hook ? (
          <TextInput
            value={first}
            onChangeText={setFirst}
            placeholder="İlk hareketin (ör. masaya otur, kitabı aç)"
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            style={[type.row, styles.hookInput, { color: c.text, borderBottomColor: c.hairline }]}
          />
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          {n.reminderAt ? (
            <Tap onPress={clear} style={[styles.btn, { backgroundColor: c.surface, flex: 1 }]}>
              <Text style={[styles.btnText, { color: c.danger }]}>Kaldır</Text>
            </Tap>
          ) : null}
          <Tap onPress={apply} style={[styles.btn, { backgroundColor: c.accent, flex: 2 }]}>
            <Text style={[styles.btnText, { color: c.card }]}>Kur</Text>
          </Tap>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 61, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  opt: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  step: { paddingHorizontal: 12, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  hookInput: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: font.uiSemi, fontSize: 16 },
});
