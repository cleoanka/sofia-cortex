import { Canvas, Fill, FractalNoise, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyse } from '../engine/observer';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { scheduleSteep } from '../platform/notify';
import { useEngine, useNode, useChildren } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Tap } from '../ui/primitives';
import { TopScrim } from '../ui/TopScrim';

const STEEP_MIN = 15;

/**
 * Dış Göz. The same words, re-set as somebody else's file. The UI chrome
 * vanishes, the light cools, the sans becomes an editorial serif, first person
 * becomes "Özne", and the page offers the one thing a detached strategist
 * would write: a protocol. Each protocol line becomes a real subtask.
 */
export function ObserverScreen({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const kids = useChildren(id);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const file = useMemo(() => (n ? analyse(n.id, n.title, n.body) : null), [n?.id, n?.title, n?.body]);
  const [showOriginal, setShowOriginal] = useState(false);
  const opened = useRef(new Date()).current;

  if (!n || !file) return null;
  const created = new Date(n.createdAt);
  const stamp = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const protocol = kids.map((k) => e.get(k)!).filter((k) => k.isTask);
  const ink = c.obsInk;
  const dim = c.obsInkDim;
  const empty = !n.body.trim();

  return (
    <View style={{ flex: 1, backgroundColor: c.obsBg }}>
      {/* Paper: fractal grain + a cooler light falling from above. Drawn once, GPU-side. */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[c.obsPaper, c.obsBg]} />
        </Rect>
        <Fill opacity={c.scheme === 'dark' ? 0.07 : 0.11} blendMode="multiply">
          <FractalNoise freqX={0.9} freqY={0.9} octaves={3} />
        </Fill>
      </Canvas>

      <Animated.View style={{ flex: 1 }}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 60, paddingHorizontal: 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Tap onPress={() => (haptic.lens(), nav().pop())} style={[styles.close, { borderColor: c.obsRule }]} accessibilityLabel="Dış Göz’ü kapat">
              <Icon name="close" size={16} color={dim} />
            </Tap>
            <Animated.View entering={FadeIn.delay(380).springify()} style={[styles.stamp, { borderColor: c.obsStamp, transform: [{ rotate: '-4deg' }] }]}>
              <Text style={[styles.stampText, { color: c.obsStamp }]}>VAKA № {file.number}</Text>
            </Animated.View>
          </View>

          <View style={[styles.rule, { backgroundColor: ink, marginTop: 22 }]} />
          <View style={[styles.rule, { backgroundColor: ink, marginTop: 3, height: StyleSheet.hairlineWidth }]} />
          <View style={styles.mast}>
            <Text style={[styles.caps, { color: dim }]}>GÖZLEM KAYDI</Text>
            <Text style={[styles.caps, { color: dim }]}>{stamp(created)}</Text>
          </View>

          <Animated.Text entering={FadeInDown.delay(120).springify().damping(18)} style={[styles.headline, { color: ink }]}>
            {n.title || 'Adsız kayıt'}
          </Animated.Text>
          <Text style={[styles.deck, { color: dim }]}>
            Bir öznenin kendi kaleminden, {file.words} kelime, {file.sentences} cümle. Sis endeksi %{file.fog}. Aşağıdaki aktarım üçüncü şahısla yeniden dizilmiştir; hüküm yoktur, yalnızca gözlem.
          </Text>

          <View style={[styles.thin, { backgroundColor: c.obsRule }]} />

          {empty ? (
            <Text style={[styles.body, { color: dim, fontFamily: font.serifItalic }]}>Dosya boş. Önce nota düşünceni dök; sonra kartı çevirip buraya dön.</Text>
          ) : (
            <Animated.View entering={FadeInDown.delay(220).springify().damping(20)}>
              <Text style={[styles.label, { color: dim }]}>ÖZNENİN BEYANI — AKTARIM</Text>
              <DropCapParagraph text={file.summary} ink={ink} />
              <Tap scaleTo={0.99} onPress={() => (haptic.select(), setShowOriginal((s) => !s))} style={{ marginTop: 10 }}>
                <Text style={[styles.small, { color: dim, textDecorationLine: 'underline' }]}>{showOriginal ? 'Orijinal ifadeyi gizle' : 'Orijinal ifadeyi göster'}</Text>
              </Tap>
              {showOriginal ? (
                <Animated.View entering={FadeIn} style={[styles.original, { borderLeftColor: c.obsRule }]}>
                  <Text style={[styles.small, { color: dim, fontFamily: font.serifItalic, fontSize: 15, lineHeight: 22 }]}>“{n.body.trim()}”</Text>
                </Animated.View>
              ) : null}
            </Animated.View>
          )}

          {file.pullQuote ? (
            <Animated.View entering={FadeIn.delay(420)} style={[styles.pull, { borderColor: c.obsRule }]}>
              <Text style={[styles.pullText, { color: ink }]}>“{file.pullQuote}”</Text>
            </Animated.View>
          ) : null}

          {file.patterns.length ? (
            <View style={{ marginTop: 30 }}>
              <Text style={[styles.label, { color: dim }]}>GÖZLEMLENEN ÖRÜNTÜLER</Text>
              {file.patterns.map((p, i) => (
                <Animated.View key={p.key} entering={FadeInDown.delay(300 + i * 70).springify().damping(20)} style={[styles.pattern, { borderTopColor: c.obsRule }]}>
                  <Text style={[styles.patNum, { color: c.obsStamp }]}>{String(i + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.patTitle, { color: ink }]}>{p.label}</Text>
                    <Text style={[styles.small, { color: dim, marginTop: 3 }]}>{p.note}</Text>
                    <Text style={[styles.hits, { color: dim }]}>{p.hits.slice(0, 4).map((h) => `“${h}”`).join('  ')}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          ) : null}

          <Protocol nodeId={id} existing={protocol.map((p) => ({ id: p.id, title: p.title, done: p.done }))} />

          {!empty ? (
            <Tap
              onPress={async () => {
                haptic.thud();
                const until = Date.now() + STEEP_MIN * 60_000;
                e.update(id, { steepUntil: until });
                await scheduleSteep(id, n.title, until);
                nav().pop();
                nav().showToast(`${STEEP_MIN} dakika demleniyor — sonra vaka olarak dönecek`, false);
              }}
              style={[styles.steep, { borderColor: ink }]}
            >
              <Icon name="steep" size={19} color={ink} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.patTitle, { color: ink, fontSize: 17 }]}>{STEEP_MIN} dakika demlemeye bırak</Text>
                <Text style={[styles.small, { color: dim }]}>Kayıt kilitlenir. Zihnin başka ritimdeyken bildirimle bu dosya olarak açılır.</Text>
              </View>
            </Tap>
          ) : null}

          <Text style={[styles.colophon, { color: dim }]}>Dosya açıldı {stamp(opened)} · Sofia Cortex · Dış Göz</Text>
        </ScrollView>
      </Animated.View>
      <TopScrim color={c.obsPaper} />
    </View>
  );
}

/** Editorial lead-in: the opening words set in spaced capitals, the rest in roman. */
function DropCapParagraph({ text, ink }: { text: string; ink: string }) {
  const words = text.split(' ');
  const n = Math.min(3, Math.max(1, words.findIndex((w) => /[.,;:!?]$/.test(w)) + 1 || 3));
  const lead = words.slice(0, n).join(' ');
  const rest = words.slice(n).join(' ');
  return (
    <Text style={[styles.body, { color: ink }]}>
      <Text style={{ fontFamily: font.serifSemi, letterSpacing: 1.6, fontSize: 17 }}>{lead.toLocaleUpperCase('tr-TR')}</Text>
      {rest ? ' ' + rest : ''}
    </Text>
  );
}

/** Reçete: the strategist's numbered protocol. Each line lands as a real subtask. */
function Protocol({ nodeId, existing }: { nodeId: NodeId; existing: { id: NodeId; title: string; done: boolean }[] }) {
  const c = usePalette();
  const e = useEngine();
  const [lines, setLines] = useState<string[]>(['']);
  const refs = useRef<(React.ComponentRef<typeof TextInput> | null)[]>([]);
  const filled = lines.filter((l) => l.trim());
  const apply = () => {
    if (!filled.length) return;
    e.addProtocol(nodeId, filled);
    haptic.cascade();
    setLines(['']);
    nav().showToast(`${filled.length} eylem alt görev olarak eklendi`);
  };
  return (
    <Animated.View layout={LinearTransition.springify()} style={[styles.protocol, { backgroundColor: c.obsPaper, borderColor: c.obsRule }]}>
      <Text style={[styles.label, { color: c.obsStamp, marginBottom: 2 }]}>REÇETE · EYLEM PROTOKOLÜ</Text>
      <Text style={[styles.small, { color: c.obsInkDim, fontFamily: font.serifItalic, fontSize: 15, lineHeight: 21 }]}>
        Bu dosyayı inceleyen kıdemli stratejist sensin. Özne için yalnızca net, küçük, fiziksel adımlar yaz.
      </Text>
      {existing.length ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          {existing.map((x, i) => (
            <View key={x.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline' }}>
              <Text style={[styles.patNum, { color: x.done ? c.obsInkDim : c.obsStamp, width: 22 }]}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={[styles.protoLine, { color: x.done ? c.obsInkDim : c.obsInk, textDecorationLine: x.done ? 'line-through' : 'none' }]}>{x.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 14, gap: 4 }}>
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.obsRule }}>
            <Text style={[styles.patNum, { color: c.obsInkDim, width: 22 }]}>{String(existing.length + i + 1).padStart(2, '0')}</Text>
            <TextInput
              ref={(r) => {
                refs.current[i] = r;
              }}
              value={l}
              onChangeText={(t) => setLines((ls) => ls.map((x, j) => (j === i ? t : x)))}
              onSubmitEditing={() => {
                if (!l.trim()) return apply();
                haptic.select();
                setLines((ls) => [...ls.slice(0, i + 1), '', ...ls.slice(i + 1)]);
                setTimeout(() => refs.current[i + 1]?.focus(), 30);
              }}
              submitBehavior="submit"
              returnKeyType="next"
              placeholder={i === 0 ? 'Örn. 17:00’de İK’ya iki soru yaz' : 'Sonraki adım…'}
              placeholderTextColor={c.obsInkDim + '99'}
              selectionColor={c.obsStamp}
              style={[styles.protoLine, { color: c.obsInk, flex: 1, paddingVertical: 10 }]}
            />
          </View>
        ))}
      </View>
      <Tap onPress={apply} disabled={!filled.length} style={[styles.applyBtn, { backgroundColor: filled.length ? c.obsInk : 'transparent', borderColor: c.obsInk, opacity: filled.length ? 1 : 0.4 }]}>
        <Text style={{ fontFamily: font.uiSemi, fontSize: 14, color: filled.length ? c.obsPaper : c.obsInk, letterSpacing: 0.2 }}>Protokolü uygula · {filled.length} adım</Text>
      </Tap>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  stamp: { borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 3 },
  stampText: { fontFamily: font.uiBold, fontSize: 11.5, letterSpacing: 2.2 },
  rule: { height: 2 },
  thin: { height: StyleSheet.hairlineWidth, marginVertical: 22 },
  mast: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  caps: { fontFamily: font.uiMedium, fontSize: 10.5, letterSpacing: 2.4 },
  headline: { fontFamily: font.serifMedium, fontSize: 38, lineHeight: 42, letterSpacing: -0.8, marginTop: 24 },
  deck: { fontFamily: font.serifItalic, fontSize: 17, lineHeight: 25, marginTop: 14 },
  label: { fontFamily: font.uiSemi, fontSize: 10.5, letterSpacing: 2.2, marginBottom: 12 },
  body: { fontFamily: font.serif, fontSize: 19.5, lineHeight: 31, letterSpacing: -0.1 },
  small: { fontFamily: font.ui, fontSize: 13.5, lineHeight: 19 },
  original: { borderLeftWidth: 2, paddingLeft: 14, marginTop: 12 },
  pull: { marginTop: 30, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 20 },
  pullText: { fontFamily: font.serifItalic, fontSize: 24, lineHeight: 32, letterSpacing: -0.3, textAlign: 'center' },
  pattern: { flexDirection: 'row', gap: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  patNum: { fontFamily: font.uiSemi, fontSize: 12, letterSpacing: 1, fontVariant: ['tabular-nums'], paddingTop: 3 },
  patTitle: { fontFamily: font.serifSemi, fontSize: 19, lineHeight: 24 },
  hits: { fontFamily: font.serifItalic, fontSize: 14, marginTop: 6 },
  protocol: { marginTop: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.s, padding: 20 },
  protoLine: { fontFamily: font.serif, fontSize: 17, lineHeight: 23 },
  applyBtn: { marginTop: 18, height: 46, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  steep: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22, borderWidth: 1, borderRadius: radius.s, padding: 16 },
  colophon: { fontFamily: font.serifItalic, fontSize: 12.5, textAlign: 'center', marginTop: 34 },
});
