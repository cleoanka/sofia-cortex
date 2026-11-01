import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ease } from '../theme/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CortexEngine } from '../engine/CortexEngine';
import { titleKey } from '../engine/links';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine } from '../state/hooks';
import { nav, useNav } from '../state/nav';
import { usePalette, useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { guard } from './actions';
import { useKeyboardHeight } from './keyboard';
import { Tap } from './primitives';
import { paletteQuery } from './richText';

interface Item {
  key: string;
  icon: IconName;
  title: string;
  sub?: string;
  run: () => void;
  tone?: 'accent' | 'amber';
}

/** `> Matematik altına görev: Deneme çöz` · `> Matematik: Deneme çöz` */
function parseAdd(q: string): { parent: string; title: string; task: boolean } | null {
  const m = q.match(/^>\s*(.+?)\s+(?:altına|içine)\s+(görev|not)?\s*(?:ekle)?\s*:\s*(.+)$/iu) ?? q.match(/^>\s*(.+?)\s*:\s*(.+)$/u);
  if (!m) return null;
  if (m.length === 4) return { parent: m[1].trim(), title: m[3].trim(), task: (m[2] ?? 'görev').toLocaleLowerCase('tr-TR') !== 'not' };
  return { parent: m[1].trim(), title: m[2].trim(), task: true };
}

function findParent(e: CortexEngine, name: string) {
  return e.resolve(titleKey(name)) ?? e.suggestTitles(name, 1)[0];
}

function highlight(snippet: string, c: { text: string; accent: string; textDim: string }) {
  const parts = snippet.split(/(\u0001[^\u0002]*\u0002)/);
  return parts.map((p, i) =>
    p.startsWith('\u0001') ? (
      <Text key={i} style={{ color: c.accent, fontFamily: font.uiSemi }}>
        {p.slice(1, -1)}
      </Text>
    ) : (
      p
    ),
  );
}

export function CommandPalette() {
  const palette = useNav((s) => s.palette);
  if (!palette) return null;
  return <PaletteBody key={palette.mode + ('id' in palette ? palette.id : '')} mode={palette.mode} moveId={'id' in palette ? palette.id : undefined} />;
}

function PaletteBody({ mode, moveId }: { mode: 'search' | 'move'; moveId?: NodeId }) {
  const c = usePalette();
  const { setPref } = useTheme();
  const e = useEngine();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [q, setQ] = useState('');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const close = () => {
    Keyboard.dismiss();
    nav().openPalette(null);
  };
  useEffect(() => {
    paletteQuery.set = setQ;
    return () => {
      paletteQuery.set = undefined;
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const go = (id: NodeId) => () => {
      close();
      haptic.soft();
      nav().push({ name: 'node', id });
    };
    if (mode === 'move' && moveId) {
      const moving = e.get(moveId);
      const moveTo = (target: NodeId | null) => () => {
        if (target && (target === moveId || e.isDescendant(target, moveId))) return haptic.warn();
        if (guard(() => e.move(moveId, target))) {
          haptic.thud();
          close();
          nav().showToast(`Taşındı → ${target ? e.get(target)?.title : 'Ana sayfa'}`);
        }
      };
      out.push({ key: 'root', icon: 'globe', title: 'Ana sayfa', sub: 'En üstte, kendi başına', run: moveTo(null), tone: 'accent' });
      const pool = q.trim()
        ? e.suggestTitles(q, 30)
        : e
            .allLive()
            .filter((n) => e.hasChildren(n.id))
            .slice(0, 40);
      for (const n of pool) {
        if (n.id === moveId || e.isDescendant(n.id, moveId) || n.id === moving?.parentId) continue;
        out.push({
          key: n.id,
          icon: 'move',
          title: n.title || 'Adsız',
          sub:
            e
              .path(n.id)
              .slice(0, -1)
              .map((p) => p.title)
              .join(' › ') || 'Ana sayfa',
          run: moveTo(n.id),
        });
      }
      return out;
    }

    const text = q.trim();
    if (text.startsWith('>')) {
      const add = parseAdd(text);
      if (add) {
        const parent = findParent(e, add.parent);
        out.push({
          key: 'add',
          icon: add.task ? 'task' : 'note',
          title: parent ? `“${add.title}” → ${parent.title}` : `“${add.parent}” bulunamadı`,
          sub: parent
            ? `${add.task ? 'Görev' : 'Not'} olarak ekle · ${e
                .path(parent.id)
                .map((p) => p.title)
                .join(' › ')}`
            : 'Önce o düğümü oluştur',
          tone: 'accent',
          run: () => {
            if (!parent) return haptic.warn();
            if (guard(() => e.create(parent.id, { title: add.title, isTask: add.task }))) {
              haptic.tick();
              close();
              nav().showToast(`Eklendi → ${parent.title}`);
            }
          },
        });
      }
      const cmd = text.slice(1).trim().toLocaleLowerCase('tr-TR');
      const commands: Item[] = [
        {
          key: 'auto',
          icon: 'tunnel',
          title: 'Otopilot',
          sub: 'Sıradaki tek görev',
          run: () => (close(), haptic.lens(), nav().push({ name: 'autopilot', scope: null })),
        },
        { key: 'graph', icon: 'graph', title: 'Graf', sub: 'Beynini gör', run: () => (close(), nav().push({ name: 'graph' })) },
        {
          key: 'new',
          icon: 'plus',
          title: `Yeni not${cmd.startsWith('yeni ') ? `: ${text.slice(1).trim().slice(5)}` : ''}`,
          sub: '> yeni Başlık',
          run: () => {
            const title = cmd.startsWith('yeni ') ? text.slice(1).trim().slice(5) : '';
            const id = e.create(null, { title });
            close();
            nav().push({ name: 'node', id });
          },
        },
        {
          key: 'undo',
          icon: 'undo',
          title: `Geri al${e.undoLabel ? ` · ${e.undoLabel}` : ''}`,
          run: () => {
            const l = e.undo();
            close();
            if (l) nav().showToast(`Geri alındı · ${l}`, false);
          },
        },
        { key: 'dark', icon: 'moon', title: 'Koyu tema', run: () => (setPref('dark'), close()) },
        { key: 'light', icon: 'sun', title: 'Açık tema', run: () => (setPref('light'), close()) },
        { key: 'settings', icon: 'gear', title: 'Ayarlar', run: () => (close(), nav().push({ name: 'settings' })) },
      ];
      const tokens = cmd.split(/\s+/).filter(Boolean);
      for (const k of commands)
        if (!add && (!tokens.length || tokens.every((t) => k.title.toLocaleLowerCase('tr-TR').includes(t) || k.key.includes(t)))) out.push(k);
      return out;
    }

    if (!text) {
      const recent = [...e.allLive()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
      for (const n of recent)
        out.push({
          key: n.id,
          icon: n.isTask ? 'task' : 'note',
          title: n.title || 'Adsız',
          sub:
            e
              .path(n.id)
              .slice(0, -1)
              .map((p) => p.title)
              .join(' › ') || 'Ana sayfa',
          run: go(n.id),
        });
      return out;
    }

    const hits = e.search(text, 30);
    for (const h of hits) {
      const n = e.get(h.id);
      // Links read as prose in results; a title-only hit shows where it lives instead of repeating itself.
      const snip = h.snippet
        .replace(/&/g, '')
        .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_m, t: string, al: string) => al || t)
        .replace(/\[\[|\]\]/g, '');
      const plain = snip.replace(/[\u0001\u0002]/g, '');
      const path =
        e
          .path(h.id)
          .slice(0, -1)
          .map((p) => p.title)
          .join(' › ') || 'Ana sayfa';
      out.push({ key: h.id, icon: n?.isTask ? 'task' : 'note', title: h.title || 'Adsız', sub: plain.trim() === h.title.trim() ? path : snip, run: go(h.id) });
    }
    // `&etiket&` — every note that carries it, even when no note has that name.
    const tag = text.match(/^&([^&]+)&?$/);
    if (tag)
      for (const id of e.tagged(tag[1]))
        if (!hits.some((h) => h.id === id)) out.unshift({ key: id, icon: 'note', title: e.get(id)?.title || 'Adsız', sub: `&${tag[1]}&`, run: go(id) });
    out.push({
      key: 'create',
      icon: 'plus',
      title: `Yeni not: “${text.replace(/&/g, '')}”`,
      tone: 'accent',
      run: () => {
        const id = e.create(null, { title: text.replace(/&/g, '').trim() });
        haptic.soft();
        close();
        nav().push({ name: 'node', id });
      },
    });
    return out;
  }, [q, mode, moveId, e]);

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, zIndex: 50 }]}
      >
        <Tap style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Paleti kapat" />
      </Animated.View>
      <Animated.View
        entering={FadeIn.duration(180).easing(ease)}
        exiting={FadeOut.duration(150).easing(ease)}
        style={[styles.sheet, { paddingTop: insets.top + 8, zIndex: 51 }]}
      >
        <BlurView intensity={50} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={[styles.card, { borderColor: c.cardBorder }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.card, opacity: 0.86 }]} />
          <View style={styles.inputRow}>
            <Icon name={mode === 'move' ? 'move' : q.startsWith('>') ? 'chevron' : 'search'} size={19} color={c.accent} />
            <TextInput
              ref={input}
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder={mode === 'move' ? 'Hangi notun içine?' : 'Notlarda ara'}
              placeholderTextColor={c.textFaint}
              selectionColor={c.accent}
              returnKeyType="go"
              autoCorrect={false}
              onSubmitEditing={() => items[0]?.run()}
              style={[type.row, { flex: 1, color: c.text, fontSize: 17 }]}
            />
            <Tap onPress={close} hitSlop={10} accessibilityLabel="Kapat">
              <Icon name="close" size={17} color={c.textDim} />
            </Tap>
          </View>
          <View style={[styles.sep, { backgroundColor: c.hairline }]} />
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            keyboardShouldPersistTaps="handled"
            // Results end above the keyboard, never under it.
            style={{ maxHeight: Math.max(120, Math.min(440, Dimensions.get('window').height - kb - insets.top - 8 - 58 - 20)) }}
            renderItem={({ item, index }) => (
              <Tap onPress={item.run} style={[styles.item, index === 0 && q ? { backgroundColor: c.accentSoft } : null]}>
                <View style={[styles.itemIcon, { backgroundColor: item.tone === 'amber' ? c.amberSoft : item.tone === 'accent' ? c.accentSoft : c.surface }]}>
                  <Icon name={item.icon} size={16} color={item.tone === 'amber' ? c.amber : item.tone === 'accent' ? c.accent : c.textDim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.row, { color: c.text, fontSize: 15.5 }]}>
                    {item.title}
                  </Text>
                  {item.sub ? (
                    <Text numberOfLines={1} style={[type.small, { color: c.textDim, marginTop: 1 }]}>
                      {highlight(item.sub, c)}
                    </Text>
                  ) : null}
                </View>
              </Tap>
            )}
          />
        </BlurView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 10, right: 10, top: 0 },
  card: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, height: 58 },
  sep: { height: StyleSheet.hairlineWidth },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 6, borderRadius: radius.m },
  itemIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
