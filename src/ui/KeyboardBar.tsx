import { useMemo } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import type { Fmt, LineFmt } from '../engine/types';
import { getEngine } from '../platform/db';
import { haptic } from '../platform/haptics';
import { editor, useEditor } from '../state/editor';
import { useNode } from '../state/hooks';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, fadeOut } from '../theme/motion';
import { sf, type } from '../theme/tokens';
import { appendLine, canOutdent, insertTable, lineIndent, lineOutdent, lineToggleKind, lineToggleList } from './actions';
import { FACES, FAMILY, HIGHLIGHTS, STYLES, highlightColor } from './format';
import { Icon, type IconName } from './Icon';
import { Tap } from './primitives';

export const BAR_H = 46;
export const PANEL_H = 168;

/**
 * The bar that rides on the keyboard, Apple Notes style: a row of tools you
 * can swipe sideways — Aa · ☑ · • · 1. · ⊞ · ↳ · ↰ · & — and a “Bitti” that
 * never scrolls away. Aa opens the formatting panel right above it.
 */
export function KeyboardBar({ pageId }: { pageId: string }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const kbVisible = useKeyboardState((s) => s.isVisible);
  const focused = useEditor((s) => s.focused);
  const query = useEditor((s) => s.linkQuery);
  const panel = useEditor((s) => s.panel);
  const line = useNode(focused?.kind === 'line' ? focused.id : null);
  const isLine = focused?.kind === 'line' && !!line;

  const suggestions = useMemo(() => {
    if (query === null || !focused) return [];
    const self = focused.kind === 'line' ? focused.id : pageId;
    return getEngine().suggestTitles(query, 8, self).filter((n) => n.title.trim());
  }, [query, focused?.id]);

  // Tied to focus, not to the software keyboard: with a hardware keyboard the bar docks at the bottom.
  // Only for fields on this page (a covered page keeps its own bar out of sight).
  const onPage = !!focused && (focused.id === pageId || getEngine().isDescendant(focused.id, pageId));
  if (!focused || focused.kind === 'action' || !onPage) return null;
  const formattable = focused.kind === 'line' || focused.kind === 'body';
  const afterId = focused.kind === 'line' || focused.kind === 'cell' ? focused.id : undefined;

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.sticky}>
      {query !== null ? (
        <Animated.View entering={fadeIn} exiting={fadeOut} style={[styles.suggest, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}>
            {suggestions.map((n) => (
              <Tap key={n.id} onPress={() => (haptic.select(), setTimeout(() => focused.completeLink(n.title), 80))} style={[styles.chip, { backgroundColor: c.card, borderColor: c.hairline }]}>
                <Text numberOfLines={1} style={[type.small, { color: c.text, ...sf.uiMedium }]}>
                  {n.title}
                </Text>
              </Tap>
            ))}
            {query.trim() ? (
              <Tap onPress={() => (haptic.select(), setTimeout(() => focused.completeLink(query.trim()), 80))} style={[styles.chip, { backgroundColor: c.accentSoft, borderColor: 'transparent' }]}>
                <Text numberOfLines={1} style={[type.small, { color: c.link, ...sf.uiMedium }]}>
                  &{query.trim()}& etiketi
                </Text>
              </Tap>
            ) : suggestions.length === 0 ? (
              <Text style={[type.small, { color: c.textDim }]}>Bir not adı yaz…</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : null}
      {panel && formattable ? <FormatPanel target={focused.kind === 'body' ? 'body' : 'line'} id={focused.id} /> : null}
      <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.hairline, height: BAR_H + (kbVisible ? 0 : insets.bottom), paddingBottom: kbVisible ? 0 : insets.bottom }]}>
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keys} style={{ flex: 1 }}>
          <Key icon="textformat" label="Biçim" active={panel} disabled={!formattable} onPress={() => editor().setPanel(!panel)} />
          <Key
            icon="task"
            label="Görev"
            active={isLine && line.isTask}
            onPress={() => {
              if (isLine) lineToggleKind(line.id);
              else appendLine(pageId, true);
            }}
          />
          <Key icon="bullets" label="Madde işaretli liste" active={isLine && line.fmt?.l === 'bullet'} onPress={() => (isLine ? lineToggleList(line.id, 'bullet') : appendLine(pageId, false, 'bullet'))} />
          <Key icon="numbers" label="Numaralı liste" active={isLine && line.fmt?.l === 'number'} onPress={() => (isLine ? lineToggleList(line.id, 'number') : appendLine(pageId, false, 'number'))} />
          <Key icon="table" label="Tablo" onPress={() => insertTable(pageId, afterId)} />
          <Key icon="indent" label="İçeri al" disabled={!isLine} onPress={() => isLine && lineIndent(line.id)} />
          <Key icon="outdent" label="Dışarı çık" disabled={!isLine || !canOutdent(line.id)} onPress={() => isLine && lineOutdent(line.id)} />
          {/* iOS commits a pending autocorrection when the bar is tapped; insert after it lands. */}
          <Key icon="link" label="Bağla" disabled={focused.kind === 'cell'} onPress={() => setTimeout(() => focused.insert('&'), 80)} />
        </ScrollView>
        <View style={[styles.doneWrap, { borderLeftColor: c.hairline }]}>
          <Tap onPress={() => (editor().setPanel(false), Keyboard.dismiss())} hitSlop={8} style={styles.done} accessibilityLabel="Klavyeyi kapat">
            <Text style={[type.barTitle, { color: c.accent }]}>Bitti</Text>
            <Icon name="down" size={16} color={c.accent} weight={2} />
          </Tap>
        </View>
      </View>
    </KeyboardStickyView>
  );
}

/** Apple Notes “Aa”: paragraph style, typeface, B I U S and a highlighter. */
function FormatPanel({ id, target }: { id: string; target: 'line' | 'body' }) {
  const c = usePalette();
  const n = useNode(id);
  const f: LineFmt = (target === 'body' ? n?.fmt?.bd : (n?.fmt as Fmt | null)) ?? {};
  const set = (patch: Partial<Record<keyof LineFmt, LineFmt[keyof LineFmt] | null>>) => {
    haptic.select();
    getEngine().setFmt(id, patch as never, target);
  };
  const style = f.s ?? 'body';
  const face = f.f ?? (f.s === 'mono' ? 'mono' : 'sans');
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={[styles.panel, { backgroundColor: c.card, borderTopColor: c.hairline }]}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.panelRow}>
        {STYLES.map((s) => (
          <Chip key={s.key} on={style === s.key} onPress={() => set({ s: s.key === 'body' ? null : s.key })}>
            <Text style={[{ color: style === s.key ? c.onAmber : c.text }, s.key === 'title' || s.key === 'heading' ? sf.uiBold : s.key === 'mono' ? { fontFamily: FAMILY.mono } : sf.ui, { fontSize: s.key === 'title' ? 17 : s.key === 'heading' ? 15 : 14 }]}>
              {s.label}
            </Text>
          </Chip>
        ))}
      </ScrollView>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.panelRow}>
        {FACES.map((x) => (
          <Chip key={x.key} on={face === x.key} onPress={() => set({ f: x.key === 'sans' && f.s !== 'mono' ? null : x.key })}>
            <Text style={{ fontFamily: FAMILY[x.key], fontSize: 15, color: face === x.key ? c.onAmber : c.text }}>{x.label}</Text>
          </Chip>
        ))}
      </ScrollView>
      <View style={[styles.panelRow, { justifyContent: 'space-between' }]}>
        <View style={[styles.seg, { backgroundColor: c.fill }]}>
          <Seg on={!!f.b} label="Kalın" onPress={() => set({ b: !f.b })}>
            <Text style={[styles.segText, sf.uiBold, { color: c.text }]}>B</Text>
          </Seg>
          <Seg on={!!f.i} label="İtalik" onPress={() => set({ i: !f.i })}>
            <Text style={[styles.segText, { color: c.text, fontStyle: 'italic', fontFamily: 'ui-serif' }]}>I</Text>
          </Seg>
          <Seg on={!!f.u} label="Altı çizili" onPress={() => set({ u: !f.u })}>
            <Text style={[styles.segText, { color: c.text, textDecorationLine: 'underline' }]}>U</Text>
          </Seg>
          <Seg on={!!f.x} label="Üstü çizili" onPress={() => set({ x: !f.x })}>
            <Text style={[styles.segText, { color: c.text, textDecorationLine: 'line-through' }]}>S</Text>
          </Seg>
        </View>
        <View style={styles.dots}>
          {HIGHLIGHTS.map((h) => (
            <Tap key={h} onPress={() => set({ h: f.h === h ? null : h })} hitSlop={4} accessibilityLabel={`Vurgu ${h}`} style={[styles.dot, { backgroundColor: highlightColor(h, c), borderColor: f.h === h ? c.accent : 'transparent' }]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function Chip({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} style={[styles.chipBig, { backgroundColor: on ? c.accent : c.fill }]}>
      {children}
    </Tap>
  );
}

function Seg({ on, onPress, label, children }: { on: boolean; onPress: () => void; label: string; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected: on }} style={[styles.segBtn, on && { backgroundColor: c.accentSoft }]}>
      {children}
    </Tap>
  );
}

function Key({ icon, label, onPress, disabled, active }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const c = usePalette();
  return (
    <Tap
      onPress={disabled ? undefined : () => (haptic.select(), onPress())}
      hitSlop={4}
      accessibilityLabel={label}
      style={[styles.key, active && { backgroundColor: c.accentSoft }, disabled && { opacity: 0.3 }]}
    >
      <Icon name={icon} size={21} color={active ? c.accent : c.text} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30 },
  suggest: { height: 44, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, maxWidth: 220 },
  bar: { height: BAR_H, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  keys: { paddingHorizontal: 6, gap: 2, alignItems: 'center' },
  key: { width: 44, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  doneWrap: { borderLeftWidth: StyleSheet.hairlineWidth, height: 28, justifyContent: 'center', paddingLeft: 4 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36 },
  panel: { height: PANEL_H, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 10, gap: 8 },
  panelRow: { paddingHorizontal: 14, gap: 8, alignItems: 'center', flexDirection: 'row' },
  chipBig: { height: 38, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  segBtn: { width: 46, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 18 },
  dots: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
});
