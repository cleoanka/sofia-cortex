import { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../platform/haptics';
import { setReminder } from '../platform/notify';
import { useEngine } from '../state/hooks';
import { nav } from '../state/nav';
import { useSheet } from '../state/sheet';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Surface, Tap } from './primitives';

const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x.getTime();
};

function presets(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  const evening = at(now, 20);
  return [
    { key: '20m', label: '20 dakika sonra', t: now.getTime() + 20 * 60_000 },
    { key: '1h', label: '1 saat sonra', t: now.getTime() + 60 * 60_000 },
    ...(evening > now.getTime() + 30 * 60_000 ? [{ key: 'eve', label: 'Bu akşam 20:00', t: evening }] : []),
    { key: 'tom', label: 'Yarın 09:00', t: at(tomorrow, 9) },
    { key: 'mon', label: 'Pazartesi 09:00', t: at(monday, 9) },
  ];
}

const fmt = (t: number) => new Date(t).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Chrono-trigger drawer. Every option visible; the chosen one is ticked. */
export function ReminderSheet() {
  const sheet = useSheet((s) => s.sheet);
  if (sheet?.kind !== 'reminder') return null;
  return <Body key={sheet.id} id={sheet.id} />;
}

function Body({ id }: { id: string }) {
  const c = usePalette();
  const e = useEngine();
  const n = e.get(id)!;
  const insets = useSafeAreaInsets();
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -kb.height.value }] }));
  const opts = useMemo(() => presets(), []);
  const [t, setT] = useState<number>(n.reminderAt && n.reminderAt > Date.now() ? n.reminderAt : opts[opts.length - 2].t);
  const [hookMode, setHookMode] = useState(!!n.reminderHook || n.isTask);
  const [hook, setHook] = useState(n.reminderHook ?? '');
  const close = () => {
    Keyboard.dismiss();
    useSheet.getState().close();
  };
  const apply = async () => {
    haptic.thud();
    await setReminder(id, t, hookMode ? hook.trim() || n.title : null);
    close();
    nav().showToast(hookMode ? 'Otopilot kancası kuruldu' : 'Hatırlatma kuruldu', false);
  };
  const clear = async () => {
    haptic.soft();
    await setReminder(id, null, null);
    close();
  };
  return (
    <>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}>
        <Tap scaleTo={1} style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(22).stiffness(240)} exiting={SlideOutDown.springify().damping(24)} style={[styles.sheet, lift]}>
        <Surface style={{ padding: 20, paddingBottom: insets.bottom + 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderRadius: radius.xl }}>
          <View style={[styles.grabber, { backgroundColor: c.textFaint }]} />
          <Text style={[type.micro, { color: c.textDim }]}>GELECEKTEKİ KENDİNE</Text>
          <Text numberOfLines={1} style={[type.title, { color: c.text, marginTop: 6 }]}>{n.title || 'Adsız'}</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <ModeCard active={!hookMode} icon="bell" title="Hatırlatma" sub="Notu açar" onPress={() => (haptic.select(), setHookMode(false))} />
            <ModeCard active={hookMode} icon="tunnel" title="Otopilot kancası" sub="Doğrudan tek görev" onPress={() => (haptic.select(), setHookMode(true))} />
          </View>

          {hookMode ? (
            <Animated.View entering={FadeIn} style={[styles.hookBox, { backgroundColor: c.amberSoft }]}>
              <Text style={[type.micro, { color: c.amber }]}>İLK HAREKET KOMUTU</Text>
              <TextInput
                value={hook}
                onChangeText={setHook}
                placeholder="Örn. Masaya otur, fasikülü 25. sayfadan aç"
                placeholderTextColor={c.textFaint}
                selectionColor={c.amber}
                style={[type.row, { color: c.text, marginTop: 6, paddingVertical: 4 }]}
              />
            </Animated.View>
          ) : null}

          <View style={{ marginTop: 16 }}>
            {opts.map((o) => {
              const on = Math.abs(o.t - t) < 60_000;
              return (
                <Tap key={o.key} scaleTo={0.985} onPress={() => (haptic.select(), setT(o.t))} style={[styles.opt, { borderBottomColor: c.hairline }]}>
                  <Text style={[type.row, { color: c.text, flex: 1 }]}>{o.label}</Text>
                  {on ? <Icon name="check" size={18} color={c.accent} weight={2} /> : null}
                </Tap>
              );
            })}
          </View>

          <View style={styles.stepper}>
            <Tap onPress={() => (haptic.select(), setT((x) => Math.max(Date.now() + 60_000, x - 15 * 60_000)))} style={[styles.step, { backgroundColor: c.surface }]}>
              <Text style={[type.headline, { color: c.text }]}>−15</Text>
            </Tap>
            <Text style={[type.headline, { color: c.text, flex: 1, textAlign: 'center' }]}>{fmt(t)}</Text>
            <Tap onPress={() => (haptic.select(), setT((x) => x + 15 * 60_000))} style={[styles.step, { backgroundColor: c.surface }]}>
              <Text style={[type.headline, { color: c.text }]}>+15</Text>
            </Tap>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            {n.reminderAt ? (
              <Tap onPress={clear} style={[styles.btn, { backgroundColor: c.surface, flex: 1 }]}>
                <Text style={[styles.btnText, { color: c.danger }]}>Kaldır</Text>
              </Tap>
            ) : null}
            <Tap onPress={apply} style={[styles.btn, { backgroundColor: hookMode ? c.amber : c.accent, flex: 2 }]}>
              <Text style={[styles.btnText, { color: hookMode ? c.onAmber : c.card }]}>{hookMode ? 'Kancayı kur' : 'Hatırlat'}</Text>
            </Tap>
          </View>
        </Surface>
      </Animated.View>
    </>
  );
}

function ModeCard({ active, icon, title, sub, onPress }: { active: boolean; icon: 'bell' | 'tunnel'; title: string; sub: string; onPress: () => void }) {
  const c = usePalette();
  const tint = icon === 'tunnel' ? c.amber : c.accent;
  return (
    <Tap onPress={onPress} style={[styles.mode, { borderColor: active ? tint : c.hairline, backgroundColor: active ? (icon === 'tunnel' ? c.amberSoft : c.accentSoft) : 'transparent' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon name={icon} size={19} color={active ? tint : c.textDim} />
        {active ? <Icon name="check" size={16} color={tint} weight={2.2} /> : null}
      </View>
      <Text style={[type.headline, { color: c.text, marginTop: 10, fontSize: 15 }]}>{title}</Text>
      <Text style={[type.small, { color: c.textDim }]}>{sub}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, opacity: 0.4, marginBottom: 14, marginTop: -6 },
  mode: { flex: 1, borderRadius: radius.m, borderWidth: 1, padding: 14 },
  hookBox: { marginTop: 12, borderRadius: radius.m, padding: 14 },
  opt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  step: { width: 54, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 50, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: font.uiSemi, fontSize: 16, letterSpacing: -0.2 },
});
