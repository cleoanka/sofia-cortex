import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import type { CortexEngine } from '../engine/CortexEngine';
import type { CortexNode, NodeId } from '../engine/types';
import { getEngine } from '../platform/db';
import { haptic } from '../platform/haptics';
import { editor } from '../state/editor';
import { useEngine, useNode, useVersion } from '../state/hooks';
import { nav } from '../state/nav';
import { useSheet } from '../state/sheet';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, fadeOut } from '../theme/motion';
import { font, type } from '../theme/tokens';
import { appendLine, deleteNode, guard, toggleTask } from '../ui/actions';
import { Icon, type IconName } from '../ui/Icon';
import { KeyboardBar } from '../ui/KeyboardBar';
import { BackButton, Check, Hairline, IconButton, Surface, Tap, TopBar, useBarInset } from '../ui/primitives';
import { followRef } from '../ui/richText';
import { LineRow } from '../ui/Rows';
import { useField } from '../ui/useField';

type Line = { id: NodeId; depth: number };

function flatten(e: CortexEngine, rootId: NodeId, maxDepth: number): Line[] {
  const out: Line[] = [];
  const walk = (pid: NodeId, depth: number) => {
    for (const id of e.children(pid)) {
      out.push({ id, depth });
      if (depth < maxDepth && !e.get(id)!.collapsed) walk(id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}

export function NodeScreen({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const v = useVersion();
  const top = useBarInset();
  const [menu, setMenu] = useState(false);
  const lines = useMemo(() => (n ? flatten(e, id, 1) : []), [e, id, v, !!n]);
  const locked = useMemo(() => (n ? e.isLocked(id) : false), [e, id, v]);

  useEffect(() => {
    editor().setOrder(lines.map((l) => l.id));
  }, [lines]);

  // A note left completely empty disappears quietly, like Apple Notes.
  useEffect(
    () => () => {
      const eng = getEngine();
      const cur = eng.get(id);
      if (cur && !cur.title.trim() && !cur.body.trim() && !eng.hasChildren(id)) eng.transact('Boş not', () => eng.remove(id), { history: false });
    },
    [id],
  );

  if (!n) {
    return (
      <View style={[styles.gone, { backgroundColor: c.bg }]}>
        <Text style={[type.body, { color: c.textDim }]}>Bu not artık yok.</Text>
        <Tap onPress={() => nav().pop()} style={{ marginTop: 14 }}>
          <Text style={[type.barTitle, { color: c.accent }]}>Geri dön</Text>
        </Tap>
      </View>
    );
  }

  const kids = e.children(id);
  const taskish = n.isTask || (kids.length > 0 && kids.filter((k) => e.get(k)?.isTask).length * 2 >= kids.length);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAwareScrollView
        bottomOffset={96}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 10, paddingBottom: 40 }}
      >
        {locked ? (
          <View style={styles.lockedNote}>
            <Icon name="lock" size={14} color={c.textDim} />
            <Text style={[type.small, { color: c.textDim }]}>Plan kilitli — görevler bitene kadar yalnızca tiklenebilir.</Text>
          </View>
        ) : null}
        <TitleField node={n} />
        <BodyField node={n} />
        <Links node={n} />
        <View style={{ height: 6 }} />
        {lines.map((l) => (
          <LineRow key={l.id} id={l.id} depth={l.depth} locked={locked} />
        ))}
        {/* Empty paper: a tap here starts a new line. */}
        <Pressable onPress={() => !locked && appendLine(id, taskish)} style={{ minHeight: 180 }} accessibilityLabel="Yeni satır" />
        <Backlinks node={n} />
      </KeyboardAwareScrollView>

      <TopBar
        left={<BackButton onPress={() => nav().pop()} />}
        right={
          <>
            {e.nextActions(id, 1).length > 0 ? <BarPill label="Otopilot" onPress={() => (haptic.lens(), nav().push({ name: 'autopilot', scope: id }))} /> : null}
            <BarPill label="Dış Göz" onPress={() => (haptic.lens(), nav().push({ name: 'observer', id }))} />
            <IconButton icon="trash" label="Sil" disabled={locked} onPress={() => deleteNode(id) && nav().pop()} />
            <IconButton icon="more" label="Diğer" onPress={() => (haptic.select(), setMenu(true))} />
          </>
        }
      />
      <KeyboardBar pageId={id} />
      {menu ? <NodeMenu node={n} locked={locked} onClose={() => setMenu(false)} /> : null}
    </View>
  );
}

function BarPill({ label, onPress }: { label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Tap onPress={onPress} hitSlop={4} style={[styles.pill, { backgroundColor: c.surface }]} accessibilityLabel={label}>
      <Text style={[type.small, { color: c.text, fontFamily: font.uiMedium }]}>{label}</Text>
    </Tap>
  );
}

function TitleField({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const fresh = !node.title && !node.body && !e.hasChildren(node.id);
  const f = useField(node.id, 'title', node.title, (t) => {
    const cur = e.get(node.id);
    if (cur && cur.title !== t.trim()) e.update(node.id, { title: t.trim() });
  });
  return (
    <View style={styles.titleRow}>
      {node.isTask ? (
        <View style={{ paddingTop: 6, marginRight: 12 }}>
          <Check id={node.id} size={24} done={node.done} onPress={() => toggleTask(e, node.id)} />
        </View>
      ) : null}
      <TextInput
        {...f.props}
        autoFocus={fresh}
        multiline
        scrollEnabled={false}
        submitBehavior="submit"
        onSubmitEditing={() => {
          f.flush();
          editor().requestFocus(node.id, 'body');
        }}
        placeholder="Başlık"
        placeholderTextColor={c.textFaint}
        selectionColor={c.accent}
        style={[type.noteTitle, styles.titleInput, { color: node.done ? c.textDim : c.text }]}
      />
    </View>
  );
}

function BodyField({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const f = useField(node.id, 'body', node.body, (t) => {
    const cur = e.get(node.id);
    if (cur && cur.body !== t) e.update(node.id, { body: t });
  });
  return (
    <TextInput
      {...f.props}
      multiline
      scrollEnabled={false}
      placeholder="Not"
      placeholderTextColor={c.textFaint}
      selectionColor={c.accent}
      style={[type.body, styles.body, { color: c.text }]}
    />
  );
}

/** `&references&` in this note, as quiet tappable words. */
function Links({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const out = useMemo(() => e.outgoing(node.id), [e, node.body, v]);
  if (!out.length) return null;
  return (
    <View style={styles.links}>
      {out.map((o) => (
        <Tap
          key={o.key}
          onPress={() => (o.target ? (haptic.soft(), nav().push({ name: 'node', id: o.target.id })) : followRef(o.key))}
          style={[styles.link, { backgroundColor: o.target ? c.accentSoft : c.surface }]}
        >
          <Text style={[type.small, { color: o.target ? c.link : c.textDim, fontFamily: font.uiMedium }]}>{o.target ? o.target.title : `&${o.key}`}</Text>
        </Tap>
      ))}
    </View>
  );
}

function Backlinks({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const links = useMemo(() => e.backlinks(node.id), [e, node.id, node.title, v]);
  if (!links.length) return null;
  return (
    <View style={{ paddingTop: 8, paddingBottom: 24 }}>
      <Text style={[type.section, { color: c.textDim, marginHorizontal: 20, marginBottom: 6 }]}>Bu nottan bahsedenler</Text>
      {links.map((b, i) => (
        <View key={b.src}>
          {i > 0 ? <Hairline inset={20} /> : null}
          <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id: b.src }))} style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text numberOfLines={1} style={[type.row, { color: c.text, fontSize: 16 }]}>
              {e.get(b.src)?.title || 'Adsız'}
            </Text>
            <Text numberOfLines={2} style={[type.preview, { color: c.textDim, marginTop: 2 }]}>
              {b.snippet}
            </Text>
          </Tap>
        </View>
      ))}
    </View>
  );
}

function NodeMenu({ node, locked, onClose }: { node: CortexNode; locked: boolean; onClose: () => void }) {
  const c = usePalette();
  const e = useEngine();
  const top = useBarInset();
  const run = (fn: () => void) => () => {
    onClose();
    haptic.select();
    fn();
  };
  const items: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }[] = [
    { icon: 'pin', label: node.pinned ? 'Sabitlemeyi kaldır' : 'Ana sayfaya sabitle', onPress: run(() => e.setPinned(node.id, !node.pinned)) },
    { icon: 'move', label: 'Başka nota taşı', disabled: locked, onPress: run(() => nav().openPalette({ mode: 'move', id: node.id })) },
    {
      icon: 'bell',
      label: node.reminderAt && node.reminderAt > Date.now() ? 'Hatırlatıcıyı düzenle' : 'Hatırlatıcı kur',
      onPress: run(() => useSheet.getState().open({ kind: 'reminder', id: node.id })),
    },
    { icon: 'task', label: node.isTask ? 'Nota çevir' : 'Göreve çevir', onPress: run(() => guard(() => e.setTask(node.id, !node.isTask))) },
    {
      icon: 'lock',
      label: node.sealed ? 'Plan kilidini aç' : 'Planı kilitle',
      onPress: run(() => {
        if (!node.sealed && e.nextActions(node.id).length === 0) return nav().showToast('Kilitlenecek açık görev yok', false);
        e.setSealed(node.id, !node.sealed);
        nav().showToast(node.sealed ? 'Kilit açıldı' : 'Plan kilitlendi — şimdi yürüt', false);
      }),
    },
  ];
  return (
    <>
      <Pressable style={[StyleSheet.absoluteFill, { zIndex: 39 }]} onPress={onClose} accessibilityLabel="Menüyü kapat" />
      <Animated.View entering={fadeIn} exiting={fadeOut} style={[styles.menu, { top: top - 4 }]}>
        <Surface style={{ paddingVertical: 4, minWidth: 240 }}>
          {items.map((it, i) => (
            <View key={it.label}>
              {i > 0 ? <Hairline /> : null}
              <Tap onPress={it.disabled ? undefined : it.onPress} style={[styles.menuItem, it.disabled && { opacity: 0.35 }]}>
                <Text style={[type.row, { color: c.text, flex: 1, fontSize: 16 }]}>{it.label}</Text>
                <Icon name={it.icon} size={19} color={c.text} />
              </Tap>
            </View>
          ))}
        </Surface>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20, marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20 },
  titleInput: { flex: 1, padding: 0, paddingTop: 4 },
  body: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, minHeight: 34 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 6 },
  link: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  menu: { position: 'absolute', right: 10, zIndex: 40 },
  pill: { height: 30, paddingHorizontal: 11, borderRadius: 15, justifyContent: 'center', marginHorizontal: 3 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 46 },
});
