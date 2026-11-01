import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openWikiQuery } from '../engine/links';
import type { CortexNode, NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { useEngine, useNode, useProgress, useVersion } from '../state/hooks';
import { nav, useNav } from '../state/nav';
import { useSheet } from '../state/sheet';
import { usePalette } from '../theme/ThemeProvider';
import { font, radius, space, type } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { guard, OutlineList } from '../ui/Outline';
import { Check, Label, ProgressRing, Surface, Tap, ToolButton } from '../ui/primitives';
import { RichBody } from '../ui/richText';
import { toggleWithChoreography } from '../ui/Outline';

export function NodeScreen({ id }: { id: NodeId }) {
  const c = usePalette();
  const n = useNode(id);
  const insets = useSafeAreaInsets();
  if (!n || n.deletedAt != null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <Text style={[type.body, { color: c.textDim }]}>Bu düğüm artık yok.</Text>
        <Tap onPress={() => nav().pop()} style={{ marginTop: 16 }}>
          <Text style={[type.headline, { color: c.accent }]}>Geri dön</Text>
        </Tap>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OutlineList rootId={id} maxDepth={2} header={<NodeHeader node={n} top={insets.top} />} footer={<NodeFooter node={n} />} contentBottom={insets.bottom + 80} />
    </View>
  );
}

function Breadcrumbs({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const path = e.path(node.id).slice(0, -1);
  const goTo = (target: NodeId | null) => {
    haptic.select();
    const stack = useNav.getState().stack;
    const i = stack.findIndex((r) => (target === null ? r.name === 'home' : r.name === 'node' && r.id === target));
    if (i >= 0) useNav.setState({ stack: stack.slice(0, i + 1) });
    else if (target) nav().replace({ name: 'node', id: target });
  };
  return (
    <View style={styles.crumbBar}>
      <Tap onPress={() => nav().pop()} style={[styles.back, { backgroundColor: c.surface, borderColor: c.hairline }]} accessibilityLabel="Geri">
        <Icon name="back" size={19} color={c.text} />
      </Tap>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingRight: 20 }}>
        <Text onPress={() => goTo(null)} suppressHighlighting style={[type.small, styles.crumb, { color: c.textDim }]}>
          Cortex
        </Text>
        {path.map((p) => (
          <React.Fragment key={p.id}>
            <Text style={[type.small, { color: c.textFaint, marginHorizontal: 2 }]}>›</Text>
            <Text onPress={() => goTo(p.id)} suppressHighlighting numberOfLines={1} style={[type.small, styles.crumb, { color: c.textDim, maxWidth: 140 }]}>
              {p.title || 'Adsız'}
            </Text>
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

function NodeHeader({ node, top }: { node: CortexNode; top: number }) {
  const c = usePalette();
  const e = useEngine();
  const p = useProgress(node.id);
  const locked = e.isLocked(node.id);
  const steeping = node.steepUntil != null && node.steepUntil > Date.now();
  const depth = e.depth(node.id);

  const meta = [
    node.role === 'inbox' ? 'GELEN KUTUSU' : node.isTask ? (node.done ? 'TAMAMLANDI' : 'GÖREV') : 'NOT',
    p.total ? `${p.done}/${p.total} ALT GÖREV` : null,
    depth > 0 ? `${depth}. KATMAN` : 'EVREN',
    locked ? 'MÜHÜRLÜ' : null,
  ].filter(Boolean);

  return (
    <View style={{ paddingTop: top + 6 }}>
      <Breadcrumbs node={node} />
      <View style={{ paddingHorizontal: space.xl, marginTop: 18 }}>
        <Label style={{ color: locked ? c.amber : c.textDim }}>{meta.join('  ·  ')}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
          {node.isTask ? (
            <View style={{ paddingTop: 6 }}>
              <Check size={26} done={node.done} onPress={() => toggleWithChoreography(e, node.id)} />
            </View>
          ) : null}
          <TitleEditor node={node} />
          {p.total > 0 ? <ProgressRing done={p.done} total={p.total} size={42} /> : null}
        </View>
      </View>

      <Toolbar node={node} />

      {node.reminderAt && node.reminderAt > Date.now() ? <ReminderBadge node={node} /> : null}

      {steeping ? <SteepCard node={node} /> : <BodyEditor node={node} />}

      {locked ? (
        <Animated.View entering={FadeInDown.springify()} style={[styles.sealBanner, { backgroundColor: c.amberSoft }]}>
          <Icon name="seal" size={18} color={c.amber} />
          <Text style={[type.small, { color: c.text, flex: 1 }]}>
            <Text style={{ fontFamily: font.uiSemi }}>Mühürlü plan. </Text>
            Yapı kilitli — sadece yürüt. Son görev bittiğinde mühür kendiliğinden çözülür.
          </Text>
        </Animated.View>
      ) : null}

      {p.total > 0 || e.hasChildren(node.id) ? (
        <View style={[styles.sectionRow, { marginTop: 22 }]}>
          <Text style={[type.headline, { color: c.text }]}>İçindekiler</Text>
          {p.total > 0 ? <Text style={[type.mono, { color: c.textFaint }]}>{Math.round((p.done / p.total) * 100)}%</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function TitleEditor({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const [v, setV] = useState(node.title);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!focused.current) setV(node.title);
  }, [node.title]);
  const commit = (t: string) => {
    if (t !== e.get(node.id)?.title) e.update(node.id, { title: t });
  };
  return (
    <TextInput
      value={v}
      autoFocus={!node.title}
      onChangeText={(t) => {
        setV(t);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(t), 500);
      }}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (timer.current) clearTimeout(timer.current);
        commit(v.trim());
      }}
      placeholder="Adsız düşünce"
      placeholderTextColor={c.textFaint}
      multiline
      scrollEnabled={false}
      submitBehavior="blurAndSubmit"
      selectionColor={c.accent}
      style={[type.display, { flex: 1, color: node.done ? c.textDim : c.text, padding: 0 }]}
    />
  );
}

function Toolbar({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const locked = e.isLocked(node.id);
  const hasTasks = e.progress(node.id).total > 0 || node.isTask;
  return (
    <View style={styles.toolbar}>
      <ToolButton
        icon={node.isTask ? 'task' : 'note'}
        label={node.isTask ? 'Görev' : 'Not'}
        active={node.isTask}
        onPress={() => {
          haptic.select();
          e.setTask(node.id, !node.isTask);
        }}
      />
      <ToolButton
        icon="lens"
        label="Dış Göz"
        onPress={() => {
          haptic.lens();
          nav().push({ name: 'observer', id: node.id });
        }}
      />
      <ToolButton
        icon="tunnel"
        label="Otopilot"
        disabled={!hasTasks}
        onPress={() => {
          haptic.lens();
          nav().push({ name: 'autopilot', scope: node.id });
        }}
      />
      <ToolButton
        icon="pin"
        label="Vitrin"
        active={node.pinned}
        onPress={() => {
          haptic.select();
          e.setPinned(node.id, !node.pinned);
          nav().showToast(node.pinned ? 'Vitrinden kaldırıldı' : 'Ana Sayfa’ya çıkarıldı');
        }}
      />
      <ToolButton
        icon="seal"
        label="Mühür"
        active={node.sealed}
        tint={c.amber}
        onPress={() => {
          haptic.thud();
          e.setSealed(node.id, !node.sealed);
          nav().showToast(node.sealed ? 'Mühür kaldırıldı' : 'Plan mühürlendi — şimdi yürüt');
        }}
      />
      <ToolButton
        icon="bell"
        label="Hatırlat"
        active={!!node.reminderAt && node.reminderAt > Date.now()}
        onPress={() => {
          haptic.select();
          useSheet.getState().open({ kind: 'reminder', id: node.id });
        }}
      />
      <ToolButton icon="teleport" label="Işınla" disabled={locked} onPress={() => nav().openPalette({ mode: 'move', id: node.id })} />
      <ToolButton
        icon="trash"
        label="Sil"
        disabled={locked || node.role === 'inbox'}
        onPress={() => {
          if (!guard(() => e.remove(node.id))) return;
          haptic.thud();
          nav().pop();
          nav().showToast(`“${node.title || 'Adsız'}” çöpe gitti`);
        }}
      />
    </View>
  );
}

function ReminderBadge({ node }: { node: CortexNode }) {
  const c = usePalette();
  const d = new Date(node.reminderAt!);
  const when = d.toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  return (
    <Tap onPress={() => useSheet.getState().open({ kind: 'reminder', id: node.id })} style={[styles.reminder, { backgroundColor: c.accentSoft }]}>
      <Icon name={node.reminderHook ? 'tunnel' : 'bell'} size={16} color={c.accent} />
      <Text style={[type.small, { color: c.accent, fontFamily: font.uiMedium, flex: 1 }]} numberOfLines={1}>
        {when}
        {node.reminderHook ? ` · Otopilot kancası: “${node.reminderHook}”` : ''}
      </Text>
    </Tap>
  );
}

function SteepCard({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, node.steepUntil! - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  useEffect(() => {
    if (left === 0) e.update(node.id, { steepUntil: null });
  }, [left === 0]);
  return (
    <Animated.View entering={FadeIn} style={{ marginHorizontal: space.xl, marginTop: 18 }}>
      <Surface style={{ padding: 18, backgroundColor: c.obsPaper, borderColor: c.obsRule }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="steep" size={20} color={c.obsStamp} />
          <Text style={{ fontFamily: font.serifSemi, fontSize: 17, color: c.obsInk }}>Demleniyor</Text>
          <Text style={[type.mono, { color: c.obsInkDim, marginLeft: 'auto', fontSize: 15 }]}>
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </Text>
        </View>
        <Text style={{ fontFamily: font.serifItalic, fontSize: 16, lineHeight: 23, color: c.obsInkDim, marginTop: 10 }}>
          Bu kayıt mühürlü bir zarfta. Zihnin başka bir ritimdeyken, bir vaka dosyası olarak geri gelecek.
        </Text>
        <Tap
          onPress={() => {
            haptic.lens();
            e.update(node.id, { steepUntil: null });
          }}
          style={{ marginTop: 14, alignSelf: 'flex-start' }}
        >
          <Text style={[type.small, { color: c.obsInkDim, textDecorationLine: 'underline' }]}>Erken aç</Text>
        </Tap>
      </Surface>
    </Animated.View>
  );
}

function BodyEditor({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(node.body);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [forced, setForced] = useState<{ start: number; end: number } | undefined>(undefined);

  useEffect(() => {
    if (!editing) setV(node.body);
  }, [node.body, editing]);

  const commit = (t: string) => {
    if (t !== e.get(node.id)?.body) e.update(node.id, { body: t });
  };
  const change = (t: string) => {
    setV(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(t), 450);
  };

  const q = editing ? openWikiQuery(v, sel.start) : null;
  const suggestions = useMemo(() => (q ? e.suggestTitles(q.query, 5, node.id) : []), [q?.query, q?.start]);

  const insert = (title: string) => {
    if (!q) return;
    const next = v.slice(0, q.start) + `[[${title}]]` + v.slice(sel.start).replace(/^[^\]\n]*\]\]/, '');
    haptic.select();
    change(next);
    const caret = q.start + title.length + 4;
    setForced({ start: caret, end: caret });
  };

  return (
    <View style={{ paddingHorizontal: space.xl, marginTop: 18 }}>
      {editing ? (
        <>
          <TextInput
            ref={input}
            value={v}
            onChangeText={change}
            selection={forced}
            onSelectionChange={(ev) => {
              setSel(ev.nativeEvent.selection);
              if (forced) setForced(undefined);
            }}
            autoFocus
            multiline
            scrollEnabled={false}
            onBlur={() => {
              if (timer.current) clearTimeout(timer.current);
              commit(v);
              setEditing(false);
            }}
            placeholder="Düşün, dök, bağla… [[ ile başka bir nota köprü kur, # ile etiketle"
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            style={[type.body, { color: c.text, padding: 0, minHeight: 72 }]}
          />
          {suggestions.length ? (
            <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut} layout={LinearTransition} style={{ marginTop: 10 }}>
              <Surface style={{ paddingVertical: 6 }}>
                <Text style={[type.micro, { color: c.textFaint, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 }]}>SİNAPS KUR</Text>
                {suggestions.map((s) => (
                  <Tap key={s.id} onPress={() => insert(s.title)} style={styles.suggestion}>
                    <Icon name="link" size={16} color={c.accent} />
                    <Text style={[type.row, { color: c.text, flex: 1 }]} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text style={[type.small, { color: c.textFaint }]} numberOfLines={1}>
                      {e.path(s.id).slice(0, -1).map((x) => x.title).slice(-1)[0] ?? 'Cortex'}
                    </Text>
                  </Tap>
                ))}
                {q && q.query.trim() && !suggestions.some((s) => s.title.toLocaleLowerCase('tr-TR') === q.query.trim().toLocaleLowerCase('tr-TR')) ? (
                  <Tap onPress={() => insert(q.query.trim())} style={styles.suggestion}>
                    <Icon name="plus" size={16} color={c.textDim} />
                    <Text style={[type.row, { color: c.textDim, flex: 1 }]} numberOfLines={1}>
                      “{q.query.trim()}” — henüz yok, bağla
                    </Text>
                  </Tap>
                ) : null}
              </Surface>
            </Animated.View>
          ) : null}
        </>
      ) : (
        <Tap scaleTo={0.995} onPress={() => setEditing(true)}>
          {node.body ? (
            <RichBody body={node.body} onPressText={() => setEditing(true)} style={[type.body, { color: c.text }]} />
          ) : (
            <Text style={[type.body, { color: c.textFaint }]}>Not ekle…</Text>
          )}
        </Tap>
      )}
    </View>
  );
}

function NodeFooter({ node }: { node: CortexNode }) {
  const e = useEngine();
  const locked = e.isLocked(node.id);
  return (
    <View style={{ paddingTop: 4 }}>
      {!locked ? <AddRow parent={node} /> : null}
      <Synapses node={node} />
    </View>
  );
}

function AddRow({ parent }: { parent: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const kids = e.children(parent.id);
  const taskish = parent.isTask || kids.filter((k) => e.get(k)?.isTask).length * 2 >= kids.length;
  const [asTask, setAsTask] = useState(taskish && kids.length > 0 ? true : parent.isTask);
  const [v, setV] = useState('');
  const add = () => {
    const lines = v.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    e.transact('Ekle', () => {
      for (const l of lines) {
        const task = asTask || /^\[\s?\]\s*/.test(l);
        e.create(parent.id, { title: l.replace(/^\[\s?\]\s*/, ''), isTask: task });
      }
    });
    haptic.tick();
    setV('');
  };
  return (
    <View style={[styles.addRow, { paddingLeft: 20 }]}>
      <Tap
        onPress={() => {
          haptic.select();
          setAsTask(!asTask);
        }}
        style={{ width: 34, alignItems: 'flex-start' }}
        accessibilityLabel={asTask ? 'Görev olarak ekle' : 'Not olarak ekle'}
      >
        {asTask ? <View style={[styles.ghostCheck, { borderColor: c.accent }]} /> : <Icon name="plus" size={20} color={c.textDim} />}
      </Tap>
      <TextInput
        value={v}
        onChangeText={setV}
        onSubmitEditing={add}
        submitBehavior="submit"
        returnKeyType="next"
        placeholder={asTask ? 'Yeni alt görev…' : 'Yeni satır…'}
        placeholderTextColor={c.textFaint}
        selectionColor={c.accent}
        style={[type.row, { flex: 1, color: c.text, paddingVertical: 12 }]}
      />
      {v.trim() ? (
        <Tap onPress={add} style={[styles.addBtn, { backgroundColor: c.accent }]}>
          <Icon name="send" size={16} color={c.card} weight={2} />
        </Tap>
      ) : null}
    </View>
  );
}

/** Backlinks: who points here, with context. Collapsible, never hidden. */
const Synapses = memo(function Synapses({ node }: { node: CortexNode }) {
  const c = usePalette();
  const e = useEngine();
  const v = useVersion();
  const links = useMemo(() => e.backlinks(node.id), [e, node.id, node.title, v]);
  const out = useMemo(() => e.outgoing(node.id).filter((o) => o.target || o.kind === 'tag'), [e, node.id, node.body, v]);
  const [open, setOpen] = useState(true);
  if (!links.length && !out.length) return null;
  return (
    <Animated.View layout={LinearTransition.springify()} style={{ marginHorizontal: space.xl, marginTop: 26 }}>
      <Tap
        scaleTo={0.99}
        onPress={() => {
          haptic.select();
          setOpen(!open);
        }}
        style={styles.synHead}
      >
        <Icon name="link" size={17} color={c.accent} />
        <Text style={[type.headline, { color: c.text }]}>Sinapslar</Text>
        <Text style={[type.mono, { color: c.textFaint }]}>
          {links.length} gelen · {out.length} giden
        </Text>
        <View style={{ marginLeft: 'auto' }}>
          <Icon name={open ? 'up' : 'down'} size={16} color={c.textDim} />
        </View>
      </Tap>
      {open ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 10, marginTop: 12 }}>
          {links.map((b) => {
            const src = e.get(b.src)!;
            return (
              <Tap key={b.src} onPress={() => (haptic.soft(), nav().push({ name: 'node', id: b.src }))}>
                <Surface elevated={false} style={{ padding: 14, backgroundColor: c.surface, borderColor: c.hairline }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[type.small, { color: c.textFaint }]}>←</Text>
                    <Text style={[type.headline, { color: c.text, fontSize: 15, flex: 1 }]} numberOfLines={1}>
                      {src.title}
                    </Text>
                    <Text style={[type.micro, { color: c.textFaint }]}>{b.kind === 'mention' ? '@' : '[[ ]]'}</Text>
                  </View>
                  <RichBody body={b.snippet} style={[type.small, { color: c.textDim, marginTop: 6 }]} />
                </Surface>
              </Tap>
            );
          })}
          {out.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: links.length ? 4 : 0 }}>
              {out.map((o) => (
                <Tap
                  key={o.kind + o.key}
                  onPress={() => {
                    haptic.select();
                    if (o.target) nav().push({ name: 'node', id: o.target.id });
                    else nav().openPalette({ mode: 'search' });
                  }}
                  style={[styles.outChip, { backgroundColor: o.kind === 'tag' ? c.amberSoft : c.accentSoft }]}
                >
                  <Text style={[type.small, { fontFamily: font.uiMedium, color: o.kind === 'tag' ? c.tag : c.link }]}>
                    {o.kind === 'tag' ? o.key : `→ ${o.target!.title}`}
                  </Text>
                </Tap>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  crumbBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: space.l },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  crumb: { paddingVertical: 8, paddingHorizontal: 4 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.l, marginTop: 22 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, marginBottom: 4 },
  sealBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: space.xl, marginTop: 18, padding: 14, borderRadius: radius.m },
  reminder: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.xl, marginTop: 16, paddingHorizontal: 12, height: 36, borderRadius: radius.pill },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  ghostCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.6, borderStyle: 'dashed', marginLeft: 1 },
  addBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  synHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outChip: { paddingHorizontal: 11, height: 30, borderRadius: radius.pill, justifyContent: 'center' },
});
