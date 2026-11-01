import { describe, expect, test } from 'bun:test';
import { CortexEngine, SealedError } from '../src/engine/CortexEngine';
import {
  extractLinks,
  migrateLegacySyntax,
  openLinkQuery,
  parseRefs,
  renameRefs,
  snippetAround,
  stripRefs,
  titleKey,
  unlinkRefs,
} from '../src/engine/links';
import { memoryDriver } from './bunDriver';

function mk(opts: { clock?: () => number; initialTime?: number } = {}) {
  let t = opts.initialTime ?? 1_000;
  let i = 0;
  const db = memoryDriver();
  const clock = opts.clock ?? (() => ++t);
  const e = new CortexEngine(
    db,
    clock,
    () => 'n' + String(++i).padStart(5, '0'),
  );
  return {
    e,
    db,
    getTime: () => t,
    setTime: (val: number) => {
      t = val;
    },
  };
}

function seedLegacyRow(
  db: ReturnType<typeof memoryDriver>,
  id: string,
  parentId: string | null,
  title: string,
  deletedAt: number | null,
  body = '',
) {
  db.run(
    `INSERT INTO nodes (id, parent_id, sort, title, body, is_task, done, done_at, pinned, pin_order,
      sealed, collapsed, steep_until, reminder_at, reminder_hook, reminder_id, role, created_at, updated_at, deleted_at)
     VALUES (?, ?, 1, ?, ?, 0, 0, NULL, 0, 0, 0, 0, NULL, NULL, NULL, NULL, NULL, 1000, 1000, ?)`,
    [id, parentId, title, body, deletedAt],
  );
}

describe('links.ts — parsing & tokenization edge cases', () => {
  test('single link syntax &Title& parses visible text, normalized key, and offsets', () => {
    const refs = parseRefs('See &Target Page& for details');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      kind: 'wiki',
      text: 'Target Page',
      key: 'target page',
      start: 4,
      end: 17,
    });
  });

  test('whitespace inside & Target & is trimmed and key normalized', () => {
    const refs = parseRefs('See &   Multi   Space   Target   & here');
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe('Multi   Space   Target');
    expect(refs[0].key).toBe('multi space target');
  });

  test('empty ampersands &&, whitespace only &   &, and single & are ignored', () => {
    expect(parseRefs('See && alone')).toEqual([]);
    expect(parseRefs('See &   & alone')).toEqual([]);
    expect(parseRefs('See & alone')).toEqual([]);
  });

  test('consecutive references &A&&B& both parse correctly', () => {
    const refs = parseRefs('Check &A&&B& now');
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe('A');
    expect(refs[1].text).toBe('B');
  });

  test('unclosed ampersand and ampersands split across newlines are ignored', () => {
    expect(parseRefs('Unclosed &link without end')).toEqual([]);
    expect(parseRefs('link with &multi\nline& ampersand')).toEqual([]);
  });

  test('legacy [[wiki]], #tags, and @mentions are not parsed as references', () => {
    const body = 'Check [[Legacy Link]] and #legacyTag plus @legacyUser and &Valid Link&';
    const refs = parseRefs(body);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe('Valid Link');
    expect(refs[0].kind).toBe('wiki');
  });

  test('Turkish İ/ı case folding in titleKey maps dotted and dotless pairs identically', () => {
    expect(titleKey('İSTANBUL')).toBe('istanbul');
    expect(titleKey('istanbul')).toBe('istanbul');
    expect(titleKey('IĞDIR')).toBe('ığdır');
    expect(titleKey('ığdır')).toBe('ığdır');
    expect(titleKey('  İlke   ve   Işık  ')).toBe('ilke ve ışık');
  });

  test('&refs& at line start, in parens, and after newlines parse with accurate offsets', () => {
    const body = '&alice& leading mention\n&bob& second line (&charlie& in parens)';
    const refs = parseRefs(body);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toEqual({ kind: 'wiki', text: 'alice', key: 'alice', start: 0, end: 7 });
    expect(refs[1]).toEqual({ kind: 'wiki', text: 'bob', key: 'bob', start: 24, end: 29 });
    expect(refs[2]).toEqual({ kind: 'wiki', text: 'charlie', key: 'charlie', start: 43, end: 52 });
    for (const r of refs) {
      expect(body.slice(r.start, r.end)).toBe(`&${r.text}&`);
    }
  });

  test('URLs with query ampersands or paths do not parse as links unless closed with &', () => {
    const body = 'Check https://example.com/page?a=1&b=2 and https://x.com/test';
    const refs = parseRefs(body);
    expect(refs).toEqual([]);
  });

  test('renameRefs updates &Old& to &New& case-insensitively and preserves other text', () => {
    const body = 'See &Old Title& and &old title& and &Other& here';
    const renamed = renameRefs(body, 'Old Title', 'New Title');
    expect(renamed).toBe('See &New Title& and &New Title& and &Other& here');
  });

  test('stripRefs removes ampersands leaving clean text for display', () => {
    const body = 'Check &Task A& and &Task B& for details';
    expect(stripRefs(body)).toBe('Check Task A and Task B for details');
  });

  test('openLinkQuery caret boundary cases: cursor at &, query prefix, closed link, and newline', () => {
    expect(openLinkQuery('start &', 7)).toEqual({ query: '', start: 6 });
    expect(openLinkQuery('start &doc', 10)).toEqual({ query: 'doc', start: 6 });
    expect(openLinkQuery('start &doc& end', 15)).toBeNull();
    expect(openLinkQuery('start &doc& end', 10)).toEqual({ query: 'doc', start: 6 });
    expect(openLinkQuery('start &\nquery', 13)).toBeNull();
    expect(openLinkQuery('start &' + 'a'.repeat(61), 68)).toBeNull();
    expect(openLinkQuery('plain text', 5)).toBeNull();
    expect(openLinkQuery('', 0)).toBeNull();
  });

  test('snippetAround adds ellipsis only when text extends beyond search radius', () => {
    const longPrefix = 'a'.repeat(60);
    const longSuffix = 'b'.repeat(60);
    const body = `${longPrefix}&Target&${longSuffix}`;

    const midSnip = snippetAround(body, 'target', 10);
    expect(midSnip.startsWith('…')).toBe(true);
    expect(midSnip.endsWith('…')).toBe(true);

    const startBody = '&Target&' + 'b'.repeat(60);
    const startSnip = snippetAround(startBody, 'target', 10);
    expect(startSnip.startsWith('…')).toBe(false);
    expect(startSnip.endsWith('…')).toBe(true);

    const endBody = 'a'.repeat(60) + '&Target&';
    const endSnip = snippetAround(endBody, 'target', 10);
    expect(endSnip.startsWith('…')).toBe(true);
    expect(endSnip.endsWith('…')).toBe(false);

    const shortBody = 'Notes about &Target& today';
    const shortSnip = snippetAround(shortBody, 'target', 50);
    expect(shortSnip).toBe('Notes about Target today');
  });
});

describe('tree structure & move operations', () => {
  test('move cycle prevention at depth and self-move throw Cycle error', () => {
    const { e } = mk();
    const l0 = e.create(null, { title: 'L0' });
    const l1 = e.create(l0, { title: 'L1' });
    const l2 = e.create(l1, { title: 'L2' });
    const l3 = e.create(l2, { title: 'L3' });
    const l4 = e.create(l3, { title: 'L4' });

    expect(() => e.move(l0, l0)).toThrow('Cycle');
    expect(() => e.move(l0, l1)).toThrow('Cycle');
    expect(() => e.move(l0, l4)).toThrow('Cycle');
    expect(() => e.move(l1, l3)).toThrow('Cycle');
  });

  test('move between parents re-propagates BOTH old and new parent', () => {
    const { e } = mk();
    const oldP = e.create(null, { title: 'OldParent', isTask: true });
    const c1 = e.create(oldP, { title: 'Child1', isTask: true });
    const c2 = e.create(oldP, { title: 'Child2', isTask: true });
    e.toggle(c1);
    expect(e.get(oldP)!.done).toBe(false);

    const newP = e.create(null, { title: 'NewParent', isTask: true });
    const c3 = e.create(newP, { title: 'Child3', isTask: true });
    e.toggle(c3);
    expect(e.get(newP)!.done).toBe(true);

    e.move(c2, newP);

    expect(e.get(oldP)!.done).toBe(true);
    expect(e.progress(oldP)).toEqual({ done: 1, total: 1 });

    expect(e.get(newP)!.done).toBe(false);
    expect(e.progress(newP)).toEqual({ done: 1, total: 2 });
  });

  test('sort-key renumber after 200 inserts at index 0 keeps strict reverse order', () => {
    const { e } = mk();
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) {
      ids.push(e.create(null, { title: 'Item ' + i, index: 0 }));
    }
    const children = e.children(null);
    expect(children).toHaveLength(200);
    const expected = [...ids].reverse();
    expect(children).toEqual(expected);

    for (let i = 1; i < children.length; i++) {
      expect(e.get(children[i])!.sort).toBeGreaterThan(e.get(children[i - 1])!.sort);
    }
  });

  test('sort-key renumber after repeated fractional inserts between siblings keeps order', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'A' });
    const b = e.create(null, { title: 'B' });
    const mids: string[] = [];
    for (let i = 0; i < 70; i++) {
      mids.push(e.create(null, { title: 'M' + i, index: 1 }));
    }
    const children = e.children(null);
    expect(children).toHaveLength(72);
    expect(children[0]).toBe(a);
    expect(children[children.length - 1]).toBe(b);
    expect(children).toEqual([a, ...[...mids].reverse(), b]);
  });

  test('children() array identity changes only when list changes (copy-on-write)', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'P' });
    const c1 = e.create(p, { title: 'C1' });
    const listInitial = e.children(p);
    expect(e.children(p)).toBe(listInitial);

    e.update(c1, { title: 'C1 updated' });
    expect(e.children(p)).toBe(listInitial);

    e.setPinned(c1, true);
    expect(e.children(p)).toBe(listInitial);

    const c2 = e.create(p, { title: 'C2' });
    const listAfterAdd = e.children(p);
    expect(listAfterAdd).not.toBe(listInitial);
    expect(listAfterAdd).toHaveLength(2);

    e.remove(c2);
    const listAfterRemove = e.children(p);
    expect(listAfterRemove).not.toBe(listAfterAdd);
    expect(listAfterRemove).toHaveLength(1);
  });

  test('ancestorsSql equals path() across shallow, deep (depth 5), and non-existent nodes', () => {
    const { e } = mk();
    let parent: string | null = null;
    const ids: string[] = [];
    for (let depth = 0; depth < 5; depth++) {
      ids.push((parent = e.create(parent, { title: 'Level ' + depth })));
    }

    const deep = ids[4];
    const pathIds = e.path(deep).map((n) => n.id);
    const sqlIds = e.ancestorsSql(deep);
    expect(sqlIds).toEqual(pathIds);
    expect(sqlIds).toEqual(ids);

    const rootId = ids[0];
    expect(e.ancestorsSql(rootId)).toEqual([rootId]);
    expect(e.path(rootId).map((n) => n.id)).toEqual([rootId]);

    expect(e.ancestorsSql('non-existent')).toEqual([]);
    expect(e.path('non-existent')).toEqual([]);
  });

  test('reorder clamps to valid index bounds and indent/outdent boundaries behave cleanly', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'A' });
    const b = e.create(null, { title: 'B' });
    const c = e.create(null, { title: 'C' });

    e.reorder(c, 0);
    expect(e.children(null)).toEqual([c, a, b]);

    e.reorder(c, 9999);
    expect(e.children(null)).toEqual([a, b, c]);

    expect(e.indent(a)).toBe(false);
    expect(e.outdent(a)).toBe(false);
  });
});

describe('task states & reactive auto-tick propagation', () => {
  test('setTask on a parent whose children are all done auto-ticks parent to true', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Parent Note' });
    const c1 = e.create(p, { title: 'C1', isTask: true });
    const c2 = e.create(p, { title: 'C2', isTask: true });
    e.toggle(c1);
    e.toggle(c2);

    expect(e.get(p)!.done).toBe(false);
    expect(e.get(p)!.isTask).toBe(false);

    e.setTask(p, true);
    expect(e.get(p)!.isTask).toBe(true);
    expect(e.get(p)!.done).toBe(true);
    expect(e.get(p)!.doneAt).not.toBeNull();
  });

  test('setTask on a parent with incomplete task children stays false', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Parent Note' });
    const c1 = e.create(p, { title: 'C1', isTask: true });
    e.create(p, { title: 'C2', isTask: true });
    e.toggle(c1);

    e.setTask(p, true);
    expect(e.get(p)!.isTask).toBe(true);
    expect(e.get(p)!.done).toBe(false);
  });

  test('toggle on a non-task converts it to task and auto-ticks done', () => {
    const { e } = mk();
    const note = e.create(null, { title: 'Just a note' });
    expect(e.get(note)!.isTask).toBe(false);
    expect(e.get(note)!.done).toBe(false);

    const r = e.toggle(note);
    expect(r.done).toBe(true);
    expect(e.get(note)!.isTask).toBe(true);
    expect(e.get(note)!.done).toBe(true);

    e.toggle(note, false);
    expect(e.get(note)!.isTask).toBe(true);
    expect(e.get(note)!.done).toBe(false);
  });

  test('remove last open child completes the parent when other children are done', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Parent', isTask: true });
    const cDone = e.create(p, { title: 'Done Child', isTask: true });
    const cOpen = e.create(p, { title: 'Open Child', isTask: true });
    e.toggle(cDone);

    expect(e.get(p)!.done).toBe(false);
    e.remove(cOpen);

    expect(e.get(p)!.done).toBe(true);
    expect(e.progress(p)).toEqual({ done: 1, total: 1 });
  });

  test('remove only open child leaves 0 task children and does not auto-complete parent', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Parent', isTask: true });
    const cOpen = e.create(p, { title: 'Open Child', isTask: true });
    expect(e.get(p)!.done).toBe(false);

    e.remove(cOpen);
    expect(e.get(p)!.done).toBe(false);
    expect(e.progress(p)).toEqual({ done: 0, total: 0 });
  });

  test('remove a done child maintains parent completion if remaining children are done or none left', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Parent', isTask: true });
    const c1 = e.create(p, { title: 'C1', isTask: true });
    const c2 = e.create(p, { title: 'C2', isTask: true });
    e.toggle(c1);
    e.toggle(c2);
    expect(e.get(p)!.done).toBe(true);

    e.remove(c1);
    expect(e.get(p)!.done).toBe(true);

    e.remove(c2);
    expect(e.get(p)!.done).toBe(true);
  });

  test('remove a done child keeps parent open if open children remain', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Parent', isTask: true });
    const cDone = e.create(p, { title: 'Done', isTask: true });
    const cOpen = e.create(p, { title: 'Open', isTask: true });
    e.toggle(cDone);
    expect(e.get(p)!.done).toBe(false);

    e.remove(cDone);
    expect(e.get(p)!.done).toBe(false);
  });

  test('nextActions skips steeped nodes with steepUntil in the future and unlocks them later', () => {
    let now = 10_000;
    const { e } = mk({ clock: () => ++now });

    const open1 = e.create(null, { title: 'Task 1', isTask: true });
    const steeped = e.create(null, { title: 'Steeped Task', isTask: true });
    e.update(steeped, { steepUntil: 20_000 });
    const open2 = e.create(null, { title: 'Task 2', isTask: true });

    expect(e.nextActions()).toEqual([open1, open2]);

    now = 25_000;
    expect(e.nextActions()).toEqual([open1, steeped, open2]);
  });

  test('nextActions skips completed subtrees entirely and prioritizes pinned atomic tasks', () => {
    const { e } = mk();
    const root = e.create(null, { title: 'Root' });
    const p1 = e.create(root, { title: 'Plan 1', isTask: true });
    const c1 = e.create(p1, { title: 'Done 1', isTask: true });
    e.toggle(c1);

    const p2 = e.create(root, { title: 'Plan 2', isTask: true });
    const c2 = e.create(p2, { title: 'Active 2', isTask: true });

    const urgent = e.create(null, { title: 'Urgent Global', isTask: true });
    e.setPinned(urgent, true);

    expect(e.nextActions()).toEqual([urgent, c2]);
  });
});

describe('trash, purge, restore & undo/redo safety', () => {
  test('restore when parent was hard-purged reparents node to root (legacy soft-deleted rows)', () => {
    let time = 3_000;
    const { db } = mk();
    seedLegacyRow(db, 'p', null, 'Parent', 1_000);
    seedLegacyRow(db, 'c', 'p', 'Child', 2_000);
    const e = new CortexEngine(db, () => time);

    expect(e.trash()).toHaveLength(2);
    const purged = e.purgeTrash(1_500);
    expect(purged).toBe(1);
    expect(e.get('p')).toBeUndefined();
    expect(e.get('c')!.deletedAt).toBe(2_000);

    e.restore('c');
    expect(e.get('c')!.parentId).toBeNull();
    expect(e.get('c')!.deletedAt).toBeNull();
    expect(e.children(null)).toContain('c');
  });

  test('restore when parent is in trash reparents node to root (legacy soft-deleted rows)', () => {
    const { db } = mk();
    seedLegacyRow(db, 'p', null, 'Parent', 3_000);
    seedLegacyRow(db, 'c', 'p', 'Child', 2_000);
    const e = new CortexEngine(db);

    e.restore('c');
    expect(e.get('c')!.parentId).toBeNull();
    expect(e.get('c')!.deletedAt).toBeNull();
    expect(e.children(null)).toContain('c');
  });

  test('purgeTrash permanently deletes legacy soft-deleted rows and is not undoable', () => {
    const { db } = mk();
    seedLegacyRow(db, 'legacy', null, 'Legacy Trashed', 1_000);
    const e = new CortexEngine(db);
    expect(e.trash()).toHaveLength(1);

    e.create(null, { title: 'A' });
    expect(e.undoLabel).toBe('Oluştur');

    const purged = e.purgeTrash(0);
    expect(purged).toBe(1);
    expect(e.undoLabel).toBe('Oluştur');
    expect(e.trash()).toHaveLength(0);
    expect(db.all('SELECT * FROM nodes WHERE id = ?', ['legacy'])).toHaveLength(0);
  });

  test('undo of remove restores full subtree, link indexes, and FTS search results', () => {
    const { e, db } = mk();
    const target = e.create(null, { title: 'Target' });
    const parent = e.create(null, {
      title: 'Parent',
      body: 'Links to &Target& with &myTag& and secretFtsKeyword',
    });
    const child = e.create(parent, {
      title: 'Child',
      body: 'Child keyword nestedFtsWord',
    });

    expect(e.backlinks(target)).toHaveLength(1);
    expect(e.tagged('myTag')).toEqual([parent]);
    expect(e.search('secretFtsKeyword')).toHaveLength(1);
    expect(e.search('nestedFtsWord')).toHaveLength(1);

    e.remove(parent);
    expect(e.get(parent)).toBeUndefined();
    expect(e.get(child)).toBeUndefined();
    expect(e.backlinks(target)).toHaveLength(0);
    expect(e.tagged('myTag')).toHaveLength(0);
    expect(e.search('secretFtsKeyword')).toHaveLength(0);
    expect(e.search('nestedFtsWord')).toHaveLength(0);
    expect(e.children(null)).toHaveLength(1);
    expect(db.all('SELECT * FROM nodes WHERE id = ?', [parent])).toHaveLength(0);

    e.undo();
    expect(e.get(parent)).toBeDefined();
    expect(e.get(child)).toBeDefined();
    expect(e.backlinks(target)).toHaveLength(1);
    expect(e.tagged('myTag')).toEqual([parent]);
    expect(e.search('secretFtsKeyword')).toHaveLength(1);
    expect(e.search('nestedFtsWord')).toHaveLength(1);
    expect(e.children(parent)).toEqual([child]);
    expect(db.all<{ deleted_at: number | null }>('SELECT deleted_at FROM nodes WHERE id = ?', [parent])[0].deleted_at).toBeNull();
  });

  test('redo stack is cleared immediately after a new mutation', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'A' });
    e.create(null, { title: 'B' });
    expect(e.canUndo).toBe(true);

    e.undo();
    expect(e.canRedo).toBe(true);

    e.create(null, { title: 'C' });
    expect(e.canRedo).toBe(false);
    expect(e.redo()).toBeNull();
    expect(e.get(a)).toBeDefined();
  });

  test('undo limit caps stack at 120 entries, dropping the oldest operations', () => {
    const { e } = mk();
    for (let i = 0; i < 130; i++) {
      e.create(null, { title: 'Node ' + i });
    }
    expect(e.size).toBe(130);

    let undoCount = 0;
    while (e.undo() !== null) {
      undoCount++;
    }
    expect(undoCount).toBe(120);
    expect(e.size).toBe(10);
  });

  test('transact rollback on thrown error leaves memory and SQLite completely unchanged', () => {
    const { e, db } = mk();
    const a = e.create(null, { title: 'Original A' });
    const countBefore = db.all<{ c: number }>('SELECT count(*) as c FROM nodes')[0].c;

    expect(() => {
      e.transact('Exploding Tx', () => {
        e.update(a, { title: 'Mutated in Mem' });
        e.create(null, { title: 'Will Be Rolled Back' });
        throw new Error('Transaction failure');
      });
    }).toThrow('Transaction failure');

    const countAfter = db.all<{ c: number }>('SELECT count(*) as c FROM nodes')[0].c;
    expect(countAfter).toBe(countBefore);
    expect(e.get(a)!.title).toBe('Original A');
    expect(e.undoLabel).toBe('Oluştur');
  });

  test('nested transact executes as one unified undo step', () => {
    const { e } = mk();
    let n1: string, n2: string;
    e.transact('Outer Batch', () => {
      n1 = e.create(null, { title: 'N1' });
      n2 = e.create(null, { title: 'N2' });
      e.update(n1, { title: 'N1 Updated' });
    });

    expect(e.size).toBe(2);
    expect(e.undoLabel).toBe('Outer Batch');

    e.undo();
    expect(e.size).toBe(0);
    expect(e.canUndo).toBe(false);
  });

  test('no-op update with identical values does not create an undo entry', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'Stable Title' });
    const labelBefore = e.undoLabel;

    e.update(a, { title: 'Stable Title' });
    expect(e.undoLabel).toBe(labelBefore);

    e.update(a, { collapsed: false });
    expect(e.undoLabel).toBe(labelBefore);
  });
});

describe('events, subscriptions & notifications', () => {
  test('subscribe/subscribeAll notifications fire for node + old/new parents on move', () => {
    const { e } = mk();
    const p1 = e.create(null, { title: 'P1' });
    const p2 = e.create(null, { title: 'P2' });
    const c = e.create(p1, { title: 'C' });

    let p1Calls = 0;
    let p2Calls = 0;
    let cCalls = 0;
    let globalCalls = 0;
    let changedSet: ReadonlySet<string> | null = null;

    e.subscribe(p1, () => p1Calls++);
    e.subscribe(p2, () => p2Calls++);
    e.subscribe(c, () => cCalls++);
    e.subscribeAll((changed) => {
      globalCalls++;
      changedSet = changed;
    });

    e.move(c, p2);

    expect(cCalls).toBe(1);
    expect(p1Calls).toBe(1);
    expect(p2Calls).toBe(1);
    expect(globalCalls).toBe(1);
    expect(changedSet!.has(c)).toBe(true);
  });

  test('unsubscribe cleanly detaches listeners and prevents future callbacks', () => {
    const { e } = mk();
    const node = e.create(null, { title: 'Node' });
    let calls = 0;

    const unsub = e.subscribe(node, () => calls++);
    e.update(node, { title: 'First update' });
    expect(calls).toBe(1);

    unsub();
    e.update(node, { title: 'Second update' });
    expect(calls).toBe(1);
  });
});

describe('plan seal & special operations', () => {
  test('sealed plan: split and addProtocol allowed (force) while create/move/remove throw SealedError', () => {
    const { e } = mk();
    const plan = e.create(null, { title: 'Plan' });
    const t1 = e.create(plan, { title: 'Task 1', isTask: true });
    const t2 = e.create(plan, { title: 'Task 2', isTask: true });
    e.setSealed(plan, true);

    expect(() => e.create(plan, { title: 'Task 3' })).toThrow(SealedError);
    expect(() => e.move(t2, null)).toThrow(SealedError);
    expect(() => e.remove(t2)).toThrow(SealedError);

    const [s1, s2] = e.split(t1, 'Sub 1', 'Sub 2');
    expect(e.children(t1)).toEqual([s1, s2]);

    const protoIds = e.addProtocol(t2, ['- Sub A', '- Sub B']);
    expect(e.children(t2)).toEqual(protoIds);
  });

  test('plan seal automatically releases when all nested tasks are completed', () => {
    const { e } = mk();
    const plan = e.create(null, { title: 'Plan' });
    const t1 = e.create(plan, { title: 'T1', isTask: true });
    const t2 = e.create(plan, { title: 'T2', isTask: true });
    e.setSealed(plan, true);

    expect(e.isLocked(plan)).toBe(true);

    e.toggle(t1);
    expect(e.isLocked(plan)).toBe(true);

    e.toggle(t2);
    expect(e.isLocked(plan)).toBe(false);

    const postTask = e.create(plan, { title: 'T3' });
    expect(e.children(plan)).toContain(postTask);
  });

  test('addProtocol strips bullets "- ", "1) ", "• ", "* ", "2. " and filters blanks', () => {
    const { e } = mk();
    const root = e.create(null, { title: 'Root Task', isTask: true });
    const ids = e.addProtocol(root, [
      '- Dash bullet',
      '1) Number parenthesis',
      '• Dot bullet',
      '* Asterisk bullet',
      '2. Number period',
      '   - Indented dash bullet',
      'Plain line without bullet',
      '   ',
      '- ',
    ]);

    expect(ids).toHaveLength(7);
    const titles = ids.map((id) => e.get(id)!.title);
    expect(titles).toEqual([
      'Dash bullet',
      'Number parenthesis',
      'Dot bullet',
      'Asterisk bullet',
      'Number period',
      'Indented dash bullet',
      'Plain line without bullet',
    ]);
  });

  test('capture() creates inbox exactly once and detects various task prefixes', () => {
    const { e } = mk();
    const c1 = e.capture('[ ] Bracket task');
    const c2 = e.capture('[] Compact bracket task');
    const c3 = e.capture('- [ ] Markdown checkbox task');
    const c4 = e.capture('> Arrow task');
    const c5 = e.capture('☐ Ballot task');
    const c6 = e.capture('Just an idea note');

    const inboxes = e.allLive().filter((n) => n.role === 'inbox');
    expect(inboxes).toHaveLength(1);
    const inbox = inboxes[0];

    expect(e.get(c1)!.isTask).toBe(true);
    expect(e.get(c1)!.title).toBe('Bracket task');

    expect(e.get(c2)!.isTask).toBe(true);
    expect(e.get(c2)!.title).toBe('Compact bracket task');

    expect(e.get(c3)!.isTask).toBe(true);
    expect(e.get(c3)!.title).toBe('Markdown checkbox task');

    expect(e.get(c4)!.isTask).toBe(true);
    expect(e.get(c4)!.title).toBe('Arrow task');

    expect(e.get(c5)!.isTask).toBe(true);
    expect(e.get(c5)!.title).toBe('Ballot task');

    expect(e.get(c6)!.isTask).toBe(false);
    expect(e.get(c6)!.title).toBe('Just an idea note');

    expect(e.children(inbox.id)).toEqual([c6, c5, c4, c3, c2, c1]);
  });
});

describe('graph, search & vault export/import', () => {
  test('graph() local lens depth 1 vs depth 2 and tag hubs', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'Node A', body: 'Links to &Node B& and &myHubTag&' });
    const b = e.create(null, { title: 'Node B', body: 'Links to &Node C&' });
    const c = e.create(null, { title: 'Node C', body: '' });

    const fullGraph = e.graph();
    expect(fullGraph.tags.has('#myhubtag')).toBe(true);
    expect(fullGraph.ids).toContain('#myhubtag');

    const lens1 = e.graph({ id: a, depth: 1 });
    expect(lens1.ids).toContain(a);
    expect(lens1.ids).toContain(b);
    expect(lens1.ids).toContain('#myhubtag');
    expect(lens1.ids).not.toContain(c);

    const lens2 = e.graph({ id: a, depth: 2 });
    expect(lens2.ids).toContain(a);
    expect(lens2.ids).toContain(b);
    expect(lens2.ids).toContain(c);
    expect(lens2.ids).toContain('#myhubtag');
  });

  test('exportJSON → importJSON(replace) round-trip maintains complete structural and attribute equality', () => {
    const { e: e1 } = mk();
    const r1 = e1.create(null, { title: 'Root 1', body: 'Has &tag1& and &Root 2&', isTask: true });
    e1.create(null, { title: 'Root 2', body: 'Body 2' });
    const c1 = e1.create(r1, { title: 'Child 1', isTask: true });
    e1.setPinned(r1, true);
    e1.setSealed(r1, true);
    e1.setCollapsed(r1, true);
    e1.update(c1, { steepUntil: 50_000, reminderHook: 'Hook' });
    e1.toggle(c1);

    const exported = e1.exportJSON();
    expect(exported.app).toBe('sofia-cortex');
    expect(exported.nodes).toHaveLength(3);

    const { e: e2 } = mk();
    e2.importJSON(exported, 'replace');

    expect(e2.size).toBe(e1.size);
    for (const node1 of e1.allLive()) {
      const node2 = e2.get(node1.id);
      expect(node2).toBeDefined();
      expect(node2).toEqual(node1);
    }
    expect(e2.children(null)).toEqual(e1.children(null));
    expect(e2.children(r1)).toEqual(e1.children(r1));
  });

  test('importJSON reparents orphan nodes to root when parent does not exist', () => {
    const { e } = mk();
    const data = {
      app: 'sofia-cortex' as const,
      version: 1,
      exportedAt: Date.now(),
      nodes: [
        {
          id: 'orphanNode',
          parentId: 'missingParentId',
          sort: 1,
          title: 'Orphaned',
          body: '',
          isTask: false,
          done: false,
          doneAt: null,
          pinned: false,
          pinOrder: 0,
          sealed: false,
          collapsed: false,
          steepUntil: null,
          reminderAt: null,
          reminderHook: null,
          reminderId: null,
          role: null,
          createdAt: 1_000,
          updatedAt: 1_000,
          deletedAt: null,
        },
      ],
    };

    e.importJSON(data);
    expect(e.get('orphanNode')!.parentId).toBeNull();
    expect(e.children(null)).toContain('orphanNode');
  });

  test('importJSON rejects garbage payloads and ignores invalid entries', () => {
    const { e } = mk();
    expect(() => e.importJSON(null as never)).toThrow('Geçersiz arşiv');
    expect(() => e.importJSON({} as never)).toThrow('Geçersiz arşiv');
    expect(() => e.importJSON({ nodes: 'not-array' } as never)).toThrow('Geçersiz arşiv');

    const mixed = {
      nodes: [
        null,
        123,
        'string',
        {},
        { id: 123 },
        { id: 'validNode', title: 'Valid' },
      ],
    };
    const importedCount = e.importJSON(mixed as never);
    expect(importedCount).toBe(1);
    expect(e.get('validNode')!.title).toBe('Valid');
  });

  test('search excludes deleted nodes', () => {
    const { e } = mk();
    const n = e.create(null, { title: 'TopSecret Document', body: 'Classified text' });
    expect(e.search('TopSecret')).toHaveLength(1);

    e.remove(n);
    expect(e.search('TopSecret')).toHaveLength(0);
  });

  test('search with quotes and special characters does not throw SQLite syntax errors', () => {
    const { e } = mk();
    e.create(null, { title: 'Special Characters Test', body: 'Content with punctuation!' });

    const dangerousQueries = [
      '"',
      '"""',
      'AND OR NOT',
      '***',
      '&ampersand&',
      '[[wiki]]',
      '#hashtag',
      "'single-quotes'",
      '\\\\',
      '??!!',
      '   ',
      'Special "Characters"',
      '(open paren)',
      'AND (OR) NOT MATCH',
    ];

    for (const q of dangerousQueries) {
      expect(() => e.search(q)).not.toThrow();
    }
  });

  test('update only rewrites wiki references when target title is unique', () => {
    const { e } = mk();
    const p1 = e.create(null, { title: 'Duplicate' });
    e.create(null, { title: 'Duplicate' });
    const reader = e.create(null, { title: 'Reader', body: 'Mentions &Duplicate&' });

    e.update(p1, { title: 'Renamed Duplicate' });
    expect(e.get(reader)!.body).toBe('Mentions &Duplicate&');
  });

  test('backlinks excludes self references and multiple links in one body produce one backlink', () => {
    const { e } = mk();
    const target = e.create(null, { title: 'Target Note', body: 'Self link &Target Note&' });
    expect(e.backlinks(target)).toEqual([]);

    const other = e.create(null, {
      title: 'Other Note',
      body: 'First link &Target Note& and second link &Target Note&',
    });
    const backs = e.backlinks(target);
    expect(backs).toHaveLength(1);
    expect(backs[0].src).toBe(other);
  });
});

describe('engine semantics v2 — new edge cases', () => {
  test('openLinkQuery edge cases: odd ampersands, multiple pairs on one line, and caret at boundaries', () => {
    // 1 ampersand -> odd -> returns query
    expect(openLinkQuery('hello &world', 12)).toEqual({ query: 'world', start: 6 });
    // Caret right after ampersand
    expect(openLinkQuery('hello &', 7)).toEqual({ query: '', start: 6 });
    // Caret before ampersand
    expect(openLinkQuery('hello &world', 6)).toBeNull();

    // 2 ampersands on the line -> even -> null
    expect(openLinkQuery('&one& text', 10)).toBeNull();
    expect(openLinkQuery('&one&', 5)).toBeNull();

    // 3 ampersands on the line -> odd -> refers to last ampersand
    expect(openLinkQuery('&first& &second', 15)).toEqual({ query: 'second', start: 8 });

    // 4 ampersands on the line -> even -> null
    expect(openLinkQuery('&first& &second&', 16)).toBeNull();

    // 5 ampersands on the line -> odd -> refers to last ampersand
    expect(openLinkQuery('&a& &b& &third', 14)).toEqual({ query: 'third', start: 8 });

    // Caret inside a previous reference before its closing ampersand
    expect(openLinkQuery('&first& &second', 4)).toEqual({ query: 'fir', start: 0 });
    expect(openLinkQuery('&first& &second', 5)).toEqual({ query: 'firs', start: 0 });
  });

  test('openLinkQuery multiline behavior resets ampersand parity per line and enforces 60-char limit', () => {
    // Previous line had odd ampersands, but current line has 0 ampersands
    const text1 = 'Line 1 &unclosed\nLine 2 has no ampersand';
    expect(openLinkQuery(text1, text1.length)).toBeNull();

    // Previous line was closed, current line has 1 ampersand
    const text2 = 'Line 1 &closed&\nLine 2 &activeQuery';
    expect(openLinkQuery(text2, text2.length)).toEqual({ query: 'activeQuery', start: 23 });

    // Query of exactly 60 characters is allowed
    const maxQuery = 'a'.repeat(60);
    expect(openLinkQuery('&' + maxQuery, 61)).toEqual({ query: maxQuery, start: 0 });

    // Query of 61 characters is rejected
    const overQuery = 'a'.repeat(61);
    expect(openLinkQuery('&' + overQuery, 62)).toBeNull();
  });

  test('single ampersand in normal text like "A & B" never creates a link or tag', () => {
    const { e } = mk();
    expect(parseRefs('Tom & Jerry')).toEqual([]);
    expect(parseRefs('A & B')).toEqual([]);
    expect(extractLinks('A & B')).toEqual([]);

    const note = e.create(null, {
      title: 'Business Proposal',
      body: 'Partnership between Company A & Company B.\nFocusing on R & D.\nTerms of M & A deal.',
    });

    expect(e.outgoing(note)).toEqual([]);
    expect(e.tagged('A')).toEqual([]);
    expect(e.tagged('B')).toEqual([]);
    expect(e.tagged('Company A')).toEqual([]);
    expect(e.tagged('Company B')).toEqual([]);
    expect(e.tagged('R')).toEqual([]);
    expect(e.tagged('D')).toEqual([]);
    expect(e.allTags()).toEqual([]);

    const graph = e.graph();
    expect(graph.tags.size).toBe(0);
  });

  test('unlinkRefs removes only matching refs and leaves all other refs intact', () => {
    const body = 'Prefix &Keep One& middle &Delete Me& and &Keep Two& end &Delete Me& finish.';
    const unlinked = unlinkRefs(body, 'Delete Me');
    expect(unlinked).toBe('Prefix &Keep One& middle Delete Me and &Keep Two& end Delete Me finish.');

    // Non-matching title leaves body untouched
    expect(unlinkRefs(unlinked, 'NonExistent')).toBe(unlinked);
  });

  test('unlinkRefs Turkish case-folding removes refs regardless of İ/ı casing', () => {
    const body = 'Seyahat: &İSTANBUL&, &IĞDIR&, &ANKARA&.';
    const unlinked1 = unlinkRefs(body, 'istanbul');
    expect(unlinked1).toBe('Seyahat: İSTANBUL, &IĞDIR&, &ANKARA&.');

    const unlinked2 = unlinkRefs(unlinked1, 'ığdır');
    expect(unlinked2).toBe('Seyahat: İSTANBUL, IĞDIR, &ANKARA&.');
  });

  test('removing a node whose title is shared by another live node keeps the links in other notes', () => {
    const { e } = mk();
    const nodeA = e.create(null, { title: 'Shared Guide' });
    const nodeB = e.create(null, { title: 'Shared Guide' });
    const reader = e.create(null, {
      title: 'Reader Note',
      body: 'Please consult the &Shared Guide& for instructions.',
    });

    expect(e.backlinks(nodeA).map((b) => b.src)).toEqual([reader]);
    expect(e.get(reader)!.body).toBe('Please consult the &Shared Guide& for instructions.');

    // Remove first node sharing title: second node is still live, so links are kept
    e.remove(nodeA);
    expect(e.get(nodeA)).toBeUndefined();
    expect(e.get(nodeB)).toBeDefined();
    expect(e.get(reader)!.body).toBe('Please consult the &Shared Guide& for instructions.');
    expect(e.resolve('shared guide')?.id).toBe(nodeB);
    expect(e.backlinks(nodeB).map((b) => b.src)).toEqual([reader]);

    // Remove the remaining node: now no live note answers to the title, so links are unlinked
    e.remove(nodeB);
    expect(e.get(nodeB)).toBeUndefined();
    expect(e.get(reader)!.body).toBe('Please consult the Shared Guide for instructions.');
    expect(e.resolve('shared guide')).toBeUndefined();
  });

  test('remove + undo restores bodies byte-for-byte across multiple referencing notes', () => {
    const { e } = mk();
    const target = e.create(null, { title: 'Quantum Computing' });
    const n1 = e.create(null, {
      title: 'Note 1',
      body: 'Intro to &Quantum Computing&.\nSection A on &Quantum Computing& fundamentals.',
    });
    const n2 = e.create(null, {
      title: 'Note 2',
      body: 'Also references &Quantum Computing& here.',
    });

    const orig1 = e.get(n1)!.body;
    const orig2 = e.get(n2)!.body;

    e.remove(target);
    expect(e.get(target)).toBeUndefined();
    expect(e.get(n1)!.body).toBe('Intro to Quantum Computing.\nSection A on Quantum Computing fundamentals.');
    expect(e.get(n2)!.body).toBe('Also references Quantum Computing here.');

    e.undo();
    expect(e.get(target)).toBeDefined();
    expect(e.get(target)!.title).toBe('Quantum Computing');
    expect(e.get(n1)!.body).toBe(orig1);
    expect(e.get(n2)!.body).toBe(orig2);
    expect(e.backlinks(target).map((b) => b.src).sort()).toEqual([n1, n2].sort());
  });

  test('removeAll purges the entire tree and undo restores all nodes, links, and hierarchy', () => {
    const { e, db } = mk();
    const root1 = e.create(null, { title: 'Root 1' });
    const child1 = e.create(root1, { title: 'Child 1', isTask: true });
    e.create(root1, { title: 'Child 2', isTask: true });
    e.toggle(child1);

    const root2 = e.create(null, {
      title: 'Root 2',
      body: 'See &Root 1& and tag &general&',
    });
    e.setPinned(root2, true);

    const originalCount = e.size;
    expect(originalCount).toBe(4);
    expect(e.pinned()).toHaveLength(1);
    expect(e.allTags().map((t) => t.tag)).toEqual(['general']);

    e.removeAll();
    expect(e.size).toBe(0);
    expect(e.allLive()).toHaveLength(0);
    expect(e.children(null)).toEqual([]);
    expect(e.pinned()).toHaveLength(0);
    expect(e.allTags()).toEqual([]);
    expect(e.undoLabel).toBe('Hepsini sil');
    expect(db.all('SELECT * FROM nodes')).toHaveLength(0);
    expect(db.all('SELECT * FROM links')).toHaveLength(0);

    e.undo();
    expect(e.size).toBe(originalCount);
    expect(e.children(null)).toEqual([root1, root2]);
    expect(e.children(root1)).toHaveLength(2);
    expect(e.get(child1)!.done).toBe(true);
    expect(e.pinned().map((n) => n.id)).toEqual([root2]);
    expect(e.allTags().map((t) => t.tag)).toEqual(['general']);
    expect(e.backlinks(root1).map((b) => b.src)).toEqual([root2]);
  });

  test('migrateLegacySyntax is strictly idempotent across wiki links, tags, and mentions', () => {
    const body =
      'Header text [[Main Target|Custom Alias]] with #first_tag and @alice-99.\n' +
      'Also [[Simple Target]] and (#parenthesized) plus @bob_user on #dev/project/sub.\n' +
      'Already &existingLink& preserved.';

    const pass1 = migrateLegacySyntax(body);
    expect(pass1).toBe(
      'Header text &Main Target& with &first_tag& and &alice-99&.\n' +
        'Also &Simple Target& and (&parenthesized&) plus &bob_user& on &dev/project/sub&.\n' +
        'Already &existingLink& preserved.',
    );

    const pass2 = migrateLegacySyntax(pass1);
    expect(pass2).toBe(pass1);

    const pass3 = migrateLegacySyntax(pass2);
    expect(pass3).toBe(pass1);
  });

  test('history: false in update does not enter undoStack and preserves redoStack', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'Node A' });
    const b = e.create(null, { title: 'Node B' });
    expect(e.canUndo).toBe(true);

    e.undo(); // B is undone
    expect(e.canRedo).toBe(true);

    const labelBefore = e.undoLabel;
    e.update(a, { body: 'Updated in background' }, { history: false });

    expect(e.get(a)!.body).toBe('Updated in background');
    expect(e.undoLabel).toBe(labelBefore);
    expect(e.canRedo).toBe(true); // Redo stack was NOT cleared!

    e.redo(); // Restores B
    expect(e.get(b)).toBeDefined();
    expect(e.get(a)!.body).toBe('Updated in background');
  });

  test('history: false in transact executes without creating an undo entry', () => {
    const { e } = mk();
    e.clearHistory();
    expect(e.canUndo).toBe(false);

    const n = e.transact(
      'Background Task',
      () => {
        return e.create(null, { title: 'Auto Generated' });
      },
      { history: false },
    );

    expect(e.get(n)).toBeDefined();
    expect(e.canUndo).toBe(false);
    expect(e.undo()).toBeNull();
  });

  test('migrateSyntax converts existing notes with history: false without polluting undo history', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'A', body: 'See [[B]] and #urgent' });
    const b = e.create(null, { title: 'B', body: 'Contact @lead on #work' });
    const labelBefore = e.undoLabel;

    const changed = e.migrateSyntax();
    expect(changed).toBe(2);
    expect(e.get(a)!.body).toBe('See &B& and &urgent&');
    expect(e.get(b)!.body).toBe('Contact &lead& on &work&');
    expect(e.undoLabel).toBe(labelBefore);

    const secondRun = e.migrateSyntax();
    expect(secondRun).toBe(0);
  });

  test('graph() creates tag hubs prefixed with "#" for unresolved refs and upgrades to direct link when resolved', () => {
    const { e } = mk();
    const doc = e.create(null, { title: 'Doc', body: 'Mentions &editor& and &urgent&' });
    const g1 = e.graph();

    expect(g1.tags.has('#editor')).toBe(true);
    expect(g1.tags.has('#urgent')).toBe(true);
    expect(g1.ids).toContain('#editor');
    expect(g1.ids).toContain('#urgent');

    const editorHubIndex = g1.ids.indexOf('#editor');
    const docIndex1 = g1.ids.indexOf(doc);
    const hubEdge = g1.edges.find(
      (edge) =>
        (edge.a === docIndex1 && edge.b === editorHubIndex) ||
        (edge.a === editorHubIndex && edge.b === docIndex1),
    );
    expect(hubEdge).toBeDefined();
    expect(hubEdge!.w).toBe(0.6);

    // Resolve "editor" by creating a live note with that title
    const editorNode = e.create(null, { title: 'Editor' });
    const g2 = e.graph();

    expect(g2.tags.has('#editor')).toBe(false);
    expect(g2.ids).not.toContain('#editor');
    expect(g2.tags.has('#urgent')).toBe(true);

    const editorNodeIndex = g2.ids.indexOf(editorNode);
    const docIndex2 = g2.ids.indexOf(doc);
    const directEdge = g2.edges.find(
      (edge) =>
        (edge.a === docIndex2 && edge.b === editorNodeIndex) ||
        (edge.a === editorNodeIndex && edge.b === docIndex2),
    );
    expect(directEdge).toBeDefined();
    expect(directEdge!.w).toBe(0.8);
  });

  test('setTask(id, false) inside an unfinished sealed plan throws SealedError', () => {
    const { e } = mk();
    const plan = e.create(null, { title: 'Sprint Plan' });
    const t1 = e.create(plan, { title: 'Task 1', isTask: true });
    e.create(plan, { title: 'Task 2', isTask: true });
    e.setSealed(plan, true);

    expect(e.isLocked(plan)).toBe(true);
    expect(() => e.setTask(t1, false)).toThrow(SealedError);
    expect(e.get(t1)!.isTask).toBe(true);

    // setTask(t1, true) is allowed inside sealed plan
    expect(() => e.setTask(t1, true)).not.toThrow();
  });

  test('setTask(id, false) succeeds once sealed plan is finished or unsealed', () => {
    const { e } = mk();
    const plan = e.create(null, { title: 'Sprint Plan' });
    const t1 = e.create(plan, { title: 'Task 1', isTask: true });
    e.setSealed(plan, true);

    e.toggle(t1); // Plan completed!
    expect(e.isLocked(plan)).toBe(false);

    // Now converting back to note succeeds
    expect(() => e.setTask(t1, false)).not.toThrow();
    expect(e.get(t1)!.isTask).toBe(false);
  });

  test('unresolved refs act as tags in allTags() and tagged() and resolve() returns undefined', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'A', body: 'Has &alpha& and &beta&' });
    const b = e.create(null, { title: 'B', body: 'Also has &alpha&' });

    expect(e.resolve('alpha')).toBeUndefined();
    expect(e.tagged('alpha')).toEqual([a, b]);
    expect(e.tagged('&alpha&')).toEqual([a, b]);
    expect(e.tagged('#alpha')).toEqual([a, b]);

    const tags = e.allTags();
    expect(tags).toEqual([
      { tag: 'alpha', count: 2 },
      { tag: 'beta', count: 1 },
    ]);

    const alphaNode = e.create(null, { title: 'Alpha' });
    expect(e.resolve('alpha')?.id).toBe(alphaNode);
    expect(e.allTags()).toEqual([{ tag: 'beta', count: 1 }]);
  });
});
