import type { LinkKind } from './types';

/** Locale-aware key: Turkish İ/ı fold correctly, whitespace collapses. */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export interface ParsedRef {
  kind: LinkKind;
  /** Visible text without brackets / sigils. */
  text: string;
  key: string;
  start: number;
  end: number;
}

// [[Title]] or [[Title|alias]]
const WIKI = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
// #tag — must start a word; letters, digits, _ - /
const TAG = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
// @Mention — single word target
const MENTION = /(^|[\s(])@([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;

/** Every reference in a body, ordered by position. */
export function parseRefs(body: string): ParsedRef[] {
  const out: ParsedRef[] = [];
  for (const m of body.matchAll(WIKI)) {
    const target = m[1].trim();
    if (!target) continue;
    out.push({ kind: 'wiki', text: (m[2] ?? m[1]).trim(), key: titleKey(target), start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of body.matchAll(TAG)) {
    const start = m.index! + m[1].length;
    out.push({ kind: 'tag', text: '#' + m[2], key: '#' + m[2].toLocaleLowerCase('tr-TR'), start, end: start + m[2].length + 1 });
  }
  for (const m of body.matchAll(MENTION)) {
    const start = m.index! + m[1].length;
    out.push({ kind: 'mention', text: '@' + m[2], key: titleKey(m[2]), start, end: start + m[2].length + 1 });
  }
  // Drop tags/mentions that fall inside a wiki link.
  const wiki = out.filter((r) => r.kind === 'wiki');
  return out
    .filter((r) => r.kind === 'wiki' || !wiki.some((w) => r.start >= w.start && r.end <= w.end))
    .sort((a, b) => a.start - b.start);
}

/** Unique (key, kind) pairs for the links table. */
export function extractLinks(body: string): { key: string; kind: LinkKind }[] {
  const seen = new Set<string>();
  const out: { key: string; kind: LinkKind }[] = [];
  for (const r of parseRefs(body)) {
    const k = r.kind + '\u0000' + r.key;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key: r.key, kind: r.kind });
  }
  return out;
}

/** Rewrites [[Old]] / [[Old|alias]] / @Old to the new title, preserving aliases. */
export function renameRefs(body: string, oldTitle: string, newTitle: string): string {
  const oldKey = titleKey(oldTitle);
  let next = body.replace(WIKI, (all, target: string, alias?: string) =>
    titleKey(target) === oldKey ? `[[${newTitle}${alias ? '|' + alias : ''}]]` : all,
  );
  if (!/\s/.test(newTitle)) {
    next = next.replace(MENTION, (all, pre: string, word: string) =>
      titleKey(word) === oldKey ? `${pre}@${newTitle}` : all,
    );
  }
  return next;
}

/** Short context around the first reference to `key` in `body`. */
export function snippetAround(body: string, key: string, radius = 48): string {
  const ref = parseRefs(body).find((r) => r.key === key);
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (!ref) return flat(body).slice(0, radius * 2);
  const a = Math.max(0, ref.start - radius);
  const b = Math.min(body.length, ref.end + radius);
  return (a > 0 ? '…' : '') + flat(body.slice(a, b)) + (b < body.length ? '…' : '');
}

/**
 * Detects an unfinished `[[query` immediately before the caret, for autocomplete.
 * Returns the query and where it begins (index of the first `[`).
 */
export function openWikiQuery(text: string, caret: number): { query: string; start: number } | null {
  const head = text.slice(0, caret);
  const open = head.lastIndexOf('[[');
  if (open < 0) return null;
  const tail = head.slice(open + 2);
  if (tail.includes(']]') || tail.includes('\n') || tail.length > 60) return null;
  return { query: tail, start: open };
}
