import type { CortexEngine } from './CortexEngine';
import type { CortexNode } from './types';

const safe = (s: string) => (s.trim() || 'Adsız').replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').slice(0, 80);

/**
 * Markdown vault: a node with children becomes a folder holding its own
 * `Title.md`; a leaf becomes `Title.md`. Tasks are GitHub checklists, links
 * stay `[[wiki]]` — opens cleanly in Obsidian.
 */
export function toMarkdownTree(e: CortexEngine): Record<string, string> {
  const files: Record<string, string> = {};
  const used = new Set<string>();
  const unique = (p: string) => {
    let q = p;
    let i = 2;
    while (used.has(q.toLocaleLowerCase('tr-TR'))) q = p.replace(/(\.md)?$/, ` ${i++}$1`);
    used.add(q.toLocaleLowerCase('tr-TR'));
    return q;
  };
  const doc = (n: CortexNode): string => {
    const lines: string[] = ['---', `id: ${n.id}`, `task: ${n.isTask}`, `done: ${n.done}`];
    if (n.pinned) lines.push('pinned: true');
    if (n.sealed) lines.push('sealed: true');
    lines.push(`created: ${new Date(n.createdAt).toISOString()}`, '---', '', `# ${n.isTask ? (n.done ? '☑ ' : '☐ ') : ''}${n.title || 'Adsız'}`, '');
    // `&x&` becomes Obsidian's `[[x]]` so the vault opens with live links.
    if (n.body.trim()) lines.push(n.body.trim().replace(/&([^&\n]{1,80}?)&/g, '[[$1]]'), '');
    const kids = e.children(n.id).map((k) => e.get(k)!);
    if (kids.length) {
      lines.push('## İçindekiler', '');
      for (const k of kids) lines.push(`${k.isTask ? `- [${k.done ? 'x' : ' '}]` : '-'} [[${k.title || 'Adsız'}]]`);
      lines.push('');
    }
    return lines.join('\n');
  };
  const walk = (parentId: string | null, dir: string) => {
    for (const id of e.children(parentId)) {
      const n = e.get(id)!;
      const name = safe(n.title);
      if (e.hasChildren(id)) {
        const folder = unique(`${dir}${name}`);
        files[`${folder}/${name}.md`] = doc(n);
        walk(id, `${folder}/`);
      } else files[unique(`${dir}${name}.md`)] = doc(n);
    }
  };
  walk(null, 'Sofia Cortex/');
  return files;
}
