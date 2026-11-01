import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { openLinkQuery } from '../engine/links';
import type { NodeId } from '../engine/types';
import { editor, useEditor, type FieldKind } from '../state/editor';

type InputRef = React.ComponentRef<typeof TextInput>;

/**
 * One editable text field bound to the engine: local state while typing,
 * debounced commits (coalesced into one undo step by the engine), a flush on
 * blur/unmount so nothing is ever lost, focus requests from the editor store,
 * and `&link&` completion at the caret.
 */
export function useField(id: NodeId, kind: FieldKind, source: string, commit: (text: string) => void) {
  const [value, setValue] = useState(source);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const caret = useRef(source.length);
  const focused = useRef(false);
  const latest = useRef(source);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<InputRef>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // External changes (undo, rename rewrites) flow in when not typing.
  useEffect(() => {
    if (!focused.current) {
      setValue(source);
      latest.current = source;
    }
  }, [source]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dirty.current) {
      dirty.current = false;
      commitRef.current(latest.current);
    }
  }, []);

  useEffect(
    () => () => {
      flush();
      // Leaving the page must not leave a stale focused field behind (it would keep the keyboard bar alive).
      const f = editor().focused;
      if (f && f.id === id && f.kind === kind) editor().setFocused(null);
    },
    [flush],
  );

  // Focus requests (Enter on the line above, tap on empty paper…).
  const pending = useEditor((s) => s.pending?.id === id && s.pending.kind === kind);
  useEffect(() => {
    if (pending && editor().takePending(id, kind)) requestAnimationFrame(() => ref.current?.focus());
  }, [pending]);

  const reportQuery = (text: string, at: number) => {
    const q = openLinkQuery(text, at);
    editor().setLinkQuery(q ? q.query : null);
  };

  const onChangeText = (t: string) => {
    setValue(t);
    latest.current = t;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 350);
  };

  const replaceAt = (start: number, end: number, text: string) => {
    const v = latest.current;
    const next = v.slice(0, start) + text + v.slice(end);
    onChangeText(next);
    const at = start + text.length;
    caret.current = at;
    setSelection({ start: at, end: at });
    reportQuery(next, at);
  };

  const onFocus = () => {
    focused.current = true;
    editor().setFocused({
      kind,
      id,
      insert: (text) => replaceAt(caret.current, caret.current, text),
      completeLink: (title) => {
        const q = openLinkQuery(latest.current, caret.current);
        if (q) replaceAt(q.start, caret.current, `&${title}& `);
        else replaceAt(caret.current, caret.current, `&${title}& `);
      },
    });
  };

  const onBlur = () => {
    focused.current = false;
    flush();
    const f = editor().focused;
    if (f && f.id === id && f.kind === kind) editor().setFocused(null);
  };

  const onSelectionChange = (e: { nativeEvent: { selection: { start: number; end: number } } }) => {
    caret.current = e.nativeEvent.selection.end;
    if (selection) setSelection(undefined);
    if (focused.current) reportQuery(latest.current, caret.current);
  };

  return { ref, value, latest, flush, props: { ref, value, onChangeText, onFocus, onBlur, onSelectionChange, selection } };
}
