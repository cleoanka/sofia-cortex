import type { TextStyle as RNTextStyle } from 'react-native';
import type { FontFace, Highlight, LineFmt, TextStyle } from '../engine/types';
import type { Palette } from '../theme/tokens';

/** The “Aa” vocabulary, in the order the panel shows it. */
export const STYLES: { key: TextStyle; label: string }[] = [
  { key: 'title', label: 'Başlık' },
  { key: 'heading', label: 'Alt Başlık' },
  { key: 'large', label: 'Büyük Gövde' },
  { key: 'body', label: 'Normal Metin' },
  { key: 'mono', label: 'Kod' },
];

export const FACES: { key: FontFace; label: string }[] = [
  { key: 'sans', label: 'Modern' },
  { key: 'serif', label: 'Klasik' },
  { key: 'rounded', label: 'Yuvarlak' },
  { key: 'mono', label: 'Daktilo' },
];

export const HIGHLIGHTS: Highlight[] = ['yellow', 'green', 'blue', 'pink'];

/** iOS system font designs (SF, New York, SF Rounded, SF Mono). */
export const FAMILY: Record<FontFace, string> = { sans: 'System', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' };

const SIZE: Record<TextStyle, { fontSize: number; lineHeight: number; weight: RNTextStyle['fontWeight']; letterSpacing: number }> = {
  title: { fontSize: 28, lineHeight: 34, weight: '700', letterSpacing: 0.36 },
  heading: { fontSize: 22, lineHeight: 28, weight: '700', letterSpacing: 0.35 },
  large: { fontSize: 20, lineHeight: 26, weight: '400', letterSpacing: 0.38 },
  body: { fontSize: 17, lineHeight: 22, weight: '400', letterSpacing: -0.41 },
  mono: { fontSize: 15, lineHeight: 21, weight: '400', letterSpacing: 0 },
};

export const highlightColor = (h: Highlight, c: Palette): string =>
  h === 'yellow' ? c.hlYellow : h === 'green' ? c.hlGreen : h === 'blue' ? c.hlBlue : c.hlPink;

/** A whole line's look from its formatting. `struck` adds the done-task line-through. Highlight: see `markerOf`. */
export function fmtStyle(f: LineFmt | null | undefined, _c: Palette, struck = false): RNTextStyle {
  const s = SIZE[f?.s ?? 'body'];
  const face: FontFace = f?.s === 'mono' && !f?.f ? 'mono' : (f?.f ?? 'sans');
  const deco = [f?.u ? 'underline' : '', f?.x || struck ? 'line-through' : ''].filter(Boolean).join(' ');
  return {
    fontFamily: FAMILY[face],
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: face === 'mono' ? 0 : s.letterSpacing,
    fontWeight: f?.b ? '700' : s.weight,
    fontStyle: f?.i ? 'italic' : 'normal',
    textDecorationLine: (deco || 'none') as RNTextStyle['textDecorationLine'],
  };
}

/** The marker colour behind the glyphs (rendered as a span inside the input, not as a box). */
export const markerOf = (f: LineFmt | null | undefined, c: Palette): string | undefined => (f?.h ? highlightColor(f.h, c) : undefined);
