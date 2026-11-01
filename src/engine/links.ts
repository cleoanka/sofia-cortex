import type { LinkKind } from './types';

/**
 * One link syntax, easy on a phone keyboard: `&Başlık&`.
 * If a note with that title exists it is a link; otherwise it acts as a tag.
 */

/** Locale-aware key: Turkish İ/ı fold correctly, whitespace collapses. */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export interface ParsedRef {
  kind: LinkKind;
  /** Visible text without the ampersands. */
  text: string;
  key: string;
  start: number;
  end: number;
}

const REF = /&([^&\n]{1,80}?)&/g;

/** Every reference in a body, ordered by position. */
export function parseRefs(body: string): ParsedRef[] {
  const out: ParsedRef[] = [];
  for (const m of body.matchAll(REF)) {
    const text = m[1].trim();
    if (!text) continue;
    out.push({ kind: 'wiki', text, key: titleKey(text), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Unique (key, kind) pairs for the links table. */
export function extractLinks(body: string): { key: string; kind: LinkKind }[] {
  const seen = new Set<string>();
  const out: { key: string; kind: LinkKind }[] = [];
  for (const r of parseRefs(body)) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.push({ key: r.key, kind: r.kind });
  }
  return out;
}

/** Rewrites `&Old&` to the new title. */
export function renameRefs(body: string, oldTitle: string, newTitle: string): string {
  const oldKey = titleKey(oldTitle);
  return body.replace(REF, (all, t: string) => (titleKey(t) === oldKey ? `&${newTitle}&` : all));
}

/** A deleted note leaves plain words behind, never a dangling link. */
export function unlinkRefs(body: string, title: string): string {
  const key = titleKey(title);
  return body.replace(REF, (all, t: string) => (titleKey(t) === key ? t.trim() : all));
}

/** Text with the ampersands removed — for reading views and previews. */
export function stripRefs(body: string): string {
  return body.replace(REF, (_a, t: string) => t.trim());
}

/** Short context around the first reference to `key` in `body`. */
export function snippetAround(body: string, key: string, radius = 48): string {
  const ref = parseRefs(body).find((r) => r.key === key);
  const flat = (s: string) => stripRefs(s).replace(/\s+/g, ' ').trim();
  if (!ref) return flat(body).slice(0, radius * 2);
  const a = Math.max(0, ref.start - radius);
  const b = Math.min(body.length, ref.end + radius);
  return (a > 0 ? '…' : '') + flat(body.slice(a, b)) + (b < body.length ? '…' : '');
}

/**
 * An unfinished `&query` right before the caret (odd number of `&` on the
 * line so far), for autocomplete. Returns the query and the index of its `&`.
 */
export function openLinkQuery(text: string, caret: number): { query: string; start: number } | null {
  const head = text.slice(0, caret);
  const lineStart = head.lastIndexOf('\n') + 1;
  const line = head.slice(lineStart);
  const amps = [...line].filter((ch) => ch === '&').length;
  if (amps % 2 === 0) return null;
  const at = head.lastIndexOf('&');
  const query = head.slice(at + 1);
  if (query.length > 60) return null;
  return { query, start: at };
}

/** One-time migration from the old `[[x|y]]`, `#tag`, `@mention` syntax. */
export function migrateLegacySyntax(body: string): string {
  return body
    .replace(/\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g, (_a, t: string) => `&${t.trim()}&`)
    .replace(/(^|[\s(])[#@]([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu, (_a, pre: string, t: string) => `${pre}&${t}&`);
}
