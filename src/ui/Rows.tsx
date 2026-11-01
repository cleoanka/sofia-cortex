import { memo, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { titleKey } from '../engine/links';
import { getEngine } from '../platform/db';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { editor } from '../state/editor';
import { useEngine, useNode, useProgress } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, layout } from '../theme/motion';
import { type } from '../theme/tokens';
import { deleteNode, guard, lineBackspaceEmpty, lineEnter, lineToggleKind, toggleTask } from './actions';
import { Icon } from './Icon';
import { Check, LineDot, Tap } from './primitives';
import { SwipeRow } from './SwipeRow';
import { useField } from './useField';

export const INDENT = 26;

/**
 * A line left without a single word is not kept: once focus has really moved
 * on (not just hopped to the same line after an indent), it quietly goes away.
 */
function dropIfEmpty(id: NodeId) {
  setTimeout(() => {
    const e = getEngine();
    const n = e.get(id);
    if (!n || n.title.trim() || n.body.trim() || e.hasChildren(id) || editor().focused?.id === id || editor().pending?.id === id) return;
    try {
      e.transact('Boş satır', () => e.remove(id), { history: false });
    } catch {
      // Inside a locked plan the line simply stays; drafts never count anyway.
    }
  }, 300);
}

/** First calm line of a body: links read as words, whitespace collapses. */
export function preview(body: string, max = 90): string {
  const e = getEngine();
  const line = body
    .replace(/&([^&\n]{1,80}?)&/g, (_m, t: string) => (e.resolve(titleKey(t)) ? t.trim() : ''))
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line;
}

/** Quiet `2/5` — the row's checkbox already speaks for its own state, so no second circle. */
export function Count({ done, total }: { done: number; total: number }) {
  const c = usePalette();
  return <Text style={[type.small, { color: done === total ? c.textFaint : c.textDim, fontVariant: ['tabular-nums'] }]}>{`${done}/${total}`}</Text>;
}

function Trailing({ id }: { id: NodeId }) {
  const c = usePalette();
  const e = useEngine();
  const p = useProgress(id);
  if (!e.hasChildren(id)) return null;
  return (
    <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} hitSlop={10} style={styles.trailing} accessibilityLabel="Aç">
      {p.total > 0 ? <Count done={p.done} total={p.total} /> : null}
      <Icon name="chevron" size={17} color={c.textFaint} />
    </Tap>
  );
}

/**
 * An editable line on a page. Text is edited in place; the faint circle turns
 * it into a task; Return makes the next line; an empty Backspace undoes the
 * line's kind, then the line itself. Lines with children open as pages.
 */
export const LineRow = memo(function LineRow({ id, depth, locked }: { id: NodeId; depth: number; locked: boolean }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const field = useField(id, 'line', n?.title ?? '', (t) => {
    const cur = e.get(id);
    if (cur && cur.title !== t) e.update(id, { title: t });
  });
  // Leaving the page with an empty line focused never fires blur; clean up here too.
  useEffect(() => () => dropIfEmpty(id), [id]);
  if (!n) return null;
  return (
    <Animated.View entering={fadeIn} layout={layout}>
      <SwipeRow onDelete={locked ? undefined : () => deleteNode(id)} onIndent={locked ? undefined : () => guard(() => e.indent(id))}>
        <View style={[styles.line, { paddingLeft: 20 + depth * INDENT }]}>
          <View style={styles.marker}>
            {n.isTask ? <Check id={id} done={n.done} onPress={() => toggleTask(e, id)} /> : <LineDot onPress={() => lineToggleKind(id)} />}
          </View>
          <TextInput
            {...field.props}
            onBlur={() => {
              field.props.onBlur();
              dropIfEmpty(id);
            }}
            multiline
            scrollEnabled={false}
            submitBehavior="submit"
            onSubmitEditing={() => {
              field.flush();
              lineEnter(id, field.latest.current);
            }}
            onKeyPress={(ev) => {
              if (ev.nativeEvent.key === 'Backspace' && field.latest.current === '') lineBackspaceEmpty(id);
            }}
            placeholder={n.isTask ? 'Görev' : ''}
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            style={[
              type.row,
              styles.input,
              { color: n.done ? c.textFaint : c.text },
              n.done && { textDecorationLine: 'line-through', textDecorationColor: c.textFaint },
            ]}
          />
          <Trailing id={id} />
        </View>
      </SwipeRow>
    </Animated.View>
  );
});

/** A note in a list (Home, pinned). Tap opens; the check toggles in place. */
export const NoteRow = memo(function NoteRow({ id, showPath }: { id: NodeId; showPath?: boolean }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const p = useProgress(id);
  if (!n) return null;
  const sub = showPath
    ? e
        .path(id)
        .slice(0, -1)
        .map((x) => x.title)
        .join(' › ')
    : preview(n.body);
  return (
    <Animated.View entering={fadeIn} layout={layout}>
      <SwipeRow onDelete={() => deleteNode(id)} onIndent={showPath ? undefined : () => guard(() => e.indent(id))}>
        <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} style={styles.note}>
          {n.isTask ? (
            <View style={styles.marker}>
              <Check id={id} done={n.done} onPress={() => toggleTask(e, id)} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[type.row, { color: n.done ? c.textFaint : c.text, fontFamily: 'Inter_500Medium' }]}>
              {n.title || 'Yeni not'}
            </Text>
            {sub ? (
              <Text numberOfLines={1} style={[type.preview, { color: c.textDim, marginTop: 2 }]}>
                {sub}
              </Text>
            ) : null}
          </View>
          {p.total > 0 ? <Count done={p.done} total={p.total} /> : null}
        </Tap>
      </SwipeRow>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 14, minHeight: 44 },
  marker: { width: 34, paddingTop: 11 },
  input: { flex: 1, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 0 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 13, paddingLeft: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingHorizontal: 20, paddingVertical: 12, minHeight: 56 },
});
