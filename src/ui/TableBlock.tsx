import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { addColumn, addRow, parseTable, removeColumn, removeRow, serializeTable, type Cells } from '../engine/table';
import type { NodeId } from '../engine/types';
import { haptic } from '../platform/haptics';
import { editor, useEditor } from '../state/editor';
import { useEngine, useNode } from '../state/hooks';
import { usePalette } from '../theme/ThemeProvider';
import { fadeIn, fadeOut, layout } from '../theme/motion';
import { sf, type } from '../theme/tokens';
import { deleteNode } from './actions';
import { Icon } from './Icon';
import { nudgeCaret } from './keyboard';
import { Tap } from './primitives';

const CELL_W = 132;

const clamp = (a: { r: number; c: number }, rows: Cells) => ({ r: Math.min(a.r, rows.length - 1), c: Math.min(a.c, (rows[0]?.length ?? 1) - 1) });

/**
 * An Apple Notes table: a real grid of editable cells. ＋ on the right edge
 * adds a column, ＋ under the grid adds a row; while a cell is focused a quiet
 * row of actions offers deleting its row, its column or the whole table.
 */
export const TableBlock = memo(function TableBlock({ id, depth, locked }: { id: NodeId; depth: number; locked: boolean }) {
  const c = usePalette();
  const e = useEngine();
  const n = useNode(id);
  const [rows, setRows] = useState<Cells>(() => parseTable(n?.body ?? ''));
  const [at, setAtState] = useState<{ r: number; c: number } | null>(null);
  const atRef = useRef<{ r: number; c: number } | null>(null);
  const setAt = (v: { r: number; c: number } | null) => {
    atRef.current = v;
    setAtState(v);
  };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(rows);
  latest.current = rows;
  const firstCell = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Undo / redo arrive from the engine; take them unless a keystroke is still waiting to be saved.
  useEffect(() => {
    if (!timer.current && n) {
      const next = parseTable(n.body);
      setRows(next);
      latest.current = next;
      if (atRef.current) atRef.current = clamp(atRef.current, next);
    }
  }, [n?.body]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = serializeTable(latest.current);
    if (e.get(id) && e.get(id)!.body !== body) e.update(id, { body });
  };
  useEffect(
    () => () => {
      flush();
      const f = editor().focused;
      if (f && f.id === id && f.kind === 'cell') editor().setFocused(null);
    },
    [],
  );

  // ⊞ asks the new table's first cell to take focus.
  const pending = useEditor((s) => s.pending?.id === id && s.pending.kind === 'cell');
  useEffect(() => {
    if (pending && editor().takePending(id, 'cell')) requestAnimationFrame(() => firstCell.current?.focus());
  }, [pending]);

  const commit = (next: Cells, now = false) => {
    setRows(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (now) flush();
    else timer.current = setTimeout(flush, 350);
  };

  // After a row/column goes, the focused coordinates must still point inside the grid.
  const shrink = (next: Cells) => {
    commit(next, true);
    if (atRef.current) setAt(clamp(atRef.current, next));
  };

  const edit = (r: number, col: number, text: string) => {
    commit(latest.current.map((row, i) => (i === r ? row.map((x, j) => (j === col ? text : x)) : row)));
    nudgeCaret();
  };

  // Hopping between cells blurs one and focuses the next, in either order.
  const active = useRef<string | null>(null);
  const focus = (r: number, col: number) => {
    active.current = `${r}:${col}`;
    setAt({ r, c: col });
    editor().setFocused({
      kind: 'cell',
      id,
      insert: (t) => {
        const a = atRef.current;
        if (a) edit(a.r, a.c, (latest.current[a.r]?.[a.c] ?? '') + t);
      },
      completeLink: () => {},
    });
    setTimeout(nudgeCaret, 60);
  };
  const blur = (r: number, col: number) => {
    flush();
    if (active.current !== `${r}:${col}`) return;
    active.current = null;
    setAt(null);
    const f = editor().focused;
    if (f && f.id === id && f.kind === 'cell') editor().setFocused(null);
  };

  if (!n) return null;
  const cols = rows[0]?.length ?? 1;
  return (
    <Animated.View entering={fadeIn} layout={layout} style={{ paddingLeft: 20 + depth * 26, paddingRight: 14, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }}>
          <View style={[styles.grid, { borderColor: c.hairline }]}>
            {rows.map((row, r) => (
              <View key={r} style={[styles.row, r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }]}>
                {row.map((cell, col) => (
                  <View key={col} style={[styles.cell, col > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.hairline }, r === 0 && { backgroundColor: c.fill }]}>
                    <TextInput
                      ref={r === 0 && col === 0 ? firstCell : undefined}
                      value={cell}
                      onChangeText={(t) => edit(r, col, t)}
                      onFocus={() => focus(r, col)}
                      onBlur={() => blur(r, col)}
                      editable={!locked}
                      multiline
                      scrollEnabled={false}
                      selectionColor={c.accent}
                      style={[type.body, styles.input, { color: c.text }, r === 0 && sf.uiSemi]}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        {!locked ? (
          <Tap onPress={() => (haptic.select(), commit(addColumn(latest.current), true))} style={[styles.addCol, { backgroundColor: c.fill }]} accessibilityLabel="Sütun ekle">
            <Icon name="plus" size={14} color={c.textDim} weight={2} />
          </Tap>
        ) : null}
      </View>
      {!locked ? (
        <Tap onPress={() => (haptic.select(), commit(addRow(latest.current), true))} style={[styles.addRow, { backgroundColor: c.fill, width: Math.min(cols * CELL_W, 9999) }]} accessibilityLabel="Satır ekle">
          <Icon name="plus" size={14} color={c.textDim} weight={2} />
        </Tap>
      ) : null}
      {at && !locked ? (
        <Animated.View entering={fadeIn} exiting={fadeOut} style={styles.actions}>
          <Action label="Satırı sil" disabled={rows.length < 2} onPress={() => shrink(removeRow(latest.current, at.r))} />
          <Action label="Sütunu sil" disabled={cols < 2} onPress={() => shrink(removeColumn(latest.current, at.c))} />
          <Action label="Tabloyu sil" danger onPress={() => deleteNode(id)} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

function Action({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const c = usePalette();
  return (
    <Tap onPress={disabled ? undefined : () => (haptic.select(), onPress())} hitSlop={6} style={[styles.action, { backgroundColor: c.fill }, disabled && { opacity: 0.35 }]}>
      <Text style={[type.small, sf.uiMedium, { color: danger ? c.danger : c.text, fontSize: 14 }]}>{label}</Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  grid: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { width: CELL_W, minHeight: 40 },
  input: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 9, fontSize: 16, lineHeight: 21 },
  addCol: { width: 22, marginLeft: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  addRow: { height: 22, marginTop: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center' },
});
