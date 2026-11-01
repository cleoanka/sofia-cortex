import React, { memo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { parseRefs, titleKey } from '../engine/links';
import { haptic } from '../platform/haptics';
import { getEngine } from '../platform/db';
import { nav } from '../state/nav';
import { usePalette } from '../theme/ThemeProvider';

/** One calm line for list previews: links lose their brackets, whitespace collapses. */
export function plainPreview(body: string, max = 96): string {
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return '';
  const flat = line.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_a, t: string, alias: string) => alias || t);
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat;
}

/** Follow a reference: open the target, or create it (Obsidian semantics) if it does not exist yet. */
export function followRef(key: string, text: string, kind: 'wiki' | 'mention' | 'tag'): void {
  const e = getEngine();
  haptic.select();
  if (kind === 'tag') {
    nav().openPalette({ mode: 'search' });
    setTimeout(() => paletteQuery.set?.(text), 0);
    return;
  }
  const target = e.resolve(key);
  if (target) return nav().push({ name: 'node', id: target.id });
  const id = e.create(null, { title: text });
  nav().push({ name: 'node', id });
}

/** Bridge so a tag tap can pre-fill the command palette. */
export const paletteQuery: { set?: (q: string) => void } = {};

/** Body text with live, tappable synapses. */
export const RichBody = memo(function RichBody({ body, style, onPressText }: { body: string; style?: StyleProp<TextStyle>; onPressText?: () => void }) {
  const c = usePalette();
  const refs = parseRefs(body);
  const parts: React.ReactNode[] = [];
  let at = 0;
  refs.forEach((r, i) => {
    if (r.start > at) parts.push(body.slice(at, r.start));
    const exists = r.kind === 'tag' || !!getEngine().resolve(r.key);
    parts.push(
      <Text
        key={i}
        suppressHighlighting
        onPress={() => followRef(r.key, r.kind === 'wiki' ? r.text : r.text.replace(/^[@#]/, ''), r.kind)}
        style={
          r.kind === 'tag'
            ? { color: c.tag }
            : {
                color: exists ? c.link : c.textDim,
                textDecorationLine: 'underline',
                textDecorationStyle: exists ? 'solid' : 'dotted',
                textDecorationColor: exists ? c.accent + '55' : c.textFaint,
              }
        }
      >
        {r.text}
      </Text>,
    );
    at = r.end;
  });
  if (at < body.length) parts.push(body.slice(at));
  return (
    <Text style={style} onPress={onPressText} suppressHighlighting>
      {parts}
    </Text>
  );
});

export { titleKey };
