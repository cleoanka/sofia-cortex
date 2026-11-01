import { memo, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { titleKey } from '../engine/links';
import { getEngine } from '../platform/db';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { editor } from '../state/editor';
import { useChildren, useEngine, useNode, useProgress } from '../state/hooks';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, layout } from '../theme/motion';
import { type } from '../theme/tokens';
import { canIndent, deleteNode, guard, lineBackspaceAtStart, lineEnter, lineOutdent, toggleTask } from './actions';
import { fmtStyle, markerOf } from './format';
import { Icon } from './Icon';
import { Check, Tap } from './primitives';
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

/** › opens a line as its own page — whenever there is more inside it (lines or text). */
function Trailing({ id }: { id: NodeId }) {
  const c = usePalette();
  const n = useNode(id);
  const kids = useChildren(id);
  const p = useProgress(id);
  if (!kids.length && !n?.body.trim()) return null;
  return (
    <Tap onPress={() => (haptic.soft(), nav().push({ name: 'node', id }))} hitSlop={10} style={styles.trailing} accessibilityLabel="Aç">
      {p.total > 0 ? <Count done={p.done} total={p.total} /> : null}
      <Icon name="chevron" size={17} color={c.textFaint} />
    </Tap>
  );
}

/**
 * An editable line on a page, Apple Notes style: plain text has no marker at
 * all; a task shows its checkbox, a list its bullet or number. Return makes
 * the next line of the same kind; on an empty line Return / Backspace first
 * drops the kind, then steps out a level. Lines with children open as pages.
 */
export const LineRow = memo(function LineRow({ id, depth, locked, num }: { id: NodeId; depth: number; locked: boolean; num?: number }) {
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
  const look = fmtStyle(n.fmt, c, n.done);
  const marker = markerOf(n.fmt, c);
  // A highlighted line renders its text as a span so the marker sits behind the glyphs only.
  const { value, ...inputProps } = field.props;
  // Center the marker on the first line of text whatever its size.
  const markTop = 9 + ((look.lineHeight ?? 22) - 22) / 2;
  const list = n.fmt?.l;
  return (
    <Animated.View entering={fadeIn} layout={layout}>
      <SwipeRow
        onDelete={locked ? undefined : () => deleteNode(id)}
        onIndent={locked ? undefined : () => canIndent(id) && guard(() => e.indent(id))}
        onOutdent={locked || depth === 0 ? undefined : () => lineOutdent(id)}
        bg={c.paper}
      >
        <View style={[styles.line, { paddingLeft: 20 + depth * INDENT }]}>
          {n.isTask ? (
            <View style={[styles.marker, { paddingTop: markTop }]}>
              <Check id={id} done={n.done} onPress={() => toggleTask(e, id)} />
            </View>
          ) : list ? (
            <View style={[styles.marker, { width: list === 'number' ? 30 : 24 }]}>
              <Text style={[look, styles.bullet, { color: c.text, textDecorationLine: 'none', fontStyle: 'normal' }]}>{list === 'number' ? `${num ?? 1}.` : '•'}</Text>
            </View>
          ) : null}
          <TextInput
            {...inputProps}
            value={marker ? undefined : value}
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
              if (ev.nativeEvent.key !== 'Backspace') return;
              const atStart = field.sel.current.start === 0 && field.sel.current.end === 0;
              if (field.latest.current === '' || atStart) lineBackspaceAtStart(id, field.latest.current === '');
            }}
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            style={[look, styles.input, { color: n.done ? c.textFaint : c.text }, n.done && { textDecorationColor: c.textFaint }]}
          >
            {marker ? <Text style={{ backgroundColor: marker }}>{value}</Text> : null}
          </TextInput>
          <Trailing id={id} />
        </View>
      </SwipeRow>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 14, minHeight: 44 },
  marker: { width: 34, alignItems: 'flex-start' },
  bullet: { paddingTop: 9 },
  input: { flex: 1, paddingTop: 9, paddingBottom: 9, paddingHorizontal: 0 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 13, paddingLeft: 8 },
});
