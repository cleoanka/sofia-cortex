import { describe, expect, test } from 'bun:test';
import { CortexEngine, SealedError } from '../src/engine/CortexEngine';
import {
  extractLinks,
  openWikiQuery,
  parseRefs,
  renameRefs,
  snippetAround,
  titleKey,
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

describe('links.ts — parsing & tokenization edge cases', () => {
  test('aliases [[A|b]] parse target, custom label and normalized key', () => {
    const refs = parseRefs('See [[Target Page|Custom Label]] for details');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      kind: 'wiki',
      text: 'Custom Label',
      key: 'target page',
      start: 4,
      end: 32,
    });
  });

  test('whitespace inside wiki links and aliases [[ Target | Label ]] is trimmed and collapsed', () => {
    const refs = parseRefs('See [[   Multi   Space   Target   |   Display   Name   ]]');
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe('Display   Name');
    expect(refs[0].key).toBe('multi space target');
  });

  test('dangling pipe [[Target|]], empty target [[|Alias]], and empty brackets [[]] are ignored', () => {
    const refs = parseRefs('See [[Target|]] and [[|Alias]] and [[]] and [[   ]]');
    expect(refs).toEqual([]);
  });

  test('alias with whitespace [[Target| ]] parses target and trims alias to empty text', () => {
    const refs = parseRefs('See [[Target| ]]');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      kind: 'wiki',
      text: '',
      key: 'target',
      start: 4,
      end: 16,
    });
  });

  test('unclosed brackets and brackets split across newlines are ignored', () => {
    const body = 'Unclosed [[link without end and [[multi\nline]] brackets';
    const refs = parseRefs(body);
    expect(refs).toEqual([]);
  });

  test('tags and mentions inside wiki links or aliases are suppressed', () => {
    const body = 'Check [[Target #tagInside @mentionInside]] and [[Page|Alias #subTag @aliasMention]] plus #realTag @realUser';
    const refs = parseRefs(body);
    expect(refs).toHaveLength(4);
    expect(refs.map((r) => r.kind)).toEqual(['wiki', 'wiki', 'tag', 'mention']);
    expect(refs[2].text).toBe('#realTag');
    expect(refs[3].text).toBe('@realUser');
  });

  test('Turkish İ/ı case folding in titleKey maps dotted and dotless pairs identically', () => {
    expect(titleKey('İSTANBUL')).toBe('istanbul');
    expect(titleKey('istanbul')).toBe('istanbul');
    expect(titleKey('IĞDIR')).toBe('ığdır');
    expect(titleKey('ığdır')).toBe('ığdır');
    expect(titleKey('  İlke   ve   Işık  ')).toBe('ilke ve ışık');
  });

  test('mentions at line start and after newlines parse with accurate offsets', () => {
    const body = '@alice leading mention\n@bob second line (@charlie in parens)';
    const refs = parseRefs(body);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toEqual({ kind: 'mention', text: '@alice', key: 'alice', start: 0, end: 6 });
    expect(refs[1]).toEqual({ kind: 'mention', text: '@bob', key: 'bob', start: 23, end: 27 });
    expect(refs[2]).toEqual({ kind: 'mention', text: '@charlie', key: 'charlie', start: 41, end: 49 });
    for (const r of refs) {
      expect(body.slice(r.start, r.end)).toBe(r.text);
    }
  });

  test('URLs with #fragment or /#frag or /@handle are not parsed as tags or mentions', () => {
    const body = 'Check https://example.com/page#section and http://site.org/#intro and https://x.com/@devUser';
    const refs = parseRefs(body);
    expect(refs).toEqual([]);
  });

  test('renameRefs updates targets while preserving aliases and plain links', () => {
    const body = 'See [[Old Title|Custom Alias]] and [[Old Title]] here';
    const renamed = renameRefs(body, 'Old Title', 'New Title');
    expect(renamed).toBe('See [[New Title|Custom Alias]] and [[New Title]] here');
  });

  test('renameRefs updates @mentions only when new title contains no whitespace', () => {
    const body = 'Contact @alice and [[alice]]';
    const renamedSingle = renameRefs(body, 'alice', 'bob');
    expect(renamedSingle).toBe('Contact @bob and [[bob]]');

    const renamedSpaced = renameRefs(body, 'alice', 'Bob Smith');
    expect(renamedSpaced).toBe('Contact @alice and [[Bob Smith]]');
  });

  test('openWikiQuery caret boundary cases: cursor at [[, query prefix, closed link, and newline', () => {
    expect(openWikiQuery('start [[', 8)).toEqual({ query: '', start: 6 });
    expect(openWikiQuery('start [[doc', 11)).toEqual({ query: 'doc', start: 6 });
    expect(openWikiQuery('start [[doc]] end', 17)).toBeNull();
    expect(openWikiQuery('start [[doc]] end', 11)).toEqual({ query: 'doc', start: 6 });
    expect(openWikiQuery('start [[\nquery', 14)).toBeNull();
    expect(openWikiQuery('start [[' + 'a'.repeat(61), 69)).toBeNull();
    expect(openWikiQuery('plain text', 5)).toBeNull();
    expect(openWikiQuery('', 0)).toBeNull();
  });

  test('snippetAround adds ellipsis only when text extends beyond search radius', () => {
    const longPrefix = 'a'.repeat(60);
    const longSuffix = 'b'.repeat(60);
    const body = `${longPrefix}[[Target]]${longSuffix}`;

    const midSnip = snippetAround(body, 'target', 10);
    expect(midSnip.startsWith('…')).toBe(true);
    expect(midSnip.endsWith('…')).toBe(true);

    const startBody = '[[Target]]' + 'b'.repeat(60);
    const startSnip = snippetAround(startBody, 'target', 10);
    expect(startSnip.startsWith('…')).toBe(false);
    expect(startSnip.endsWith('…')).toBe(true);

    const endBody = 'a'.repeat(60) + '[[Target]]';
    const endSnip = snippetAround(endBody, 'target', 10);
    expect(endSnip.startsWith('…')).toBe(true);
    expect(endSnip.endsWith('…')).toBe(false);

    const shortBody = 'Notes about [[Target]] today';
    const shortSnip = snippetAround(shortBody, 'target', 50);
    expect(shortSnip).toBe('Notes about [[Target]] today');
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
  test('restore when parent was hard-purged reparents node to root', () => {
    let time = 1_000;
    const { e } = mk({ clock: () => time });

    const p = e.create(null, { title: 'Parent' });
    time = 1_000;
    e.remove(p);

    time = 2_000;
    const c = e.create(p, { title: 'Child' }, { force: true });
    e.remove(c);

    time = 3_000;
    const purged = e.purgeTrash(1_500);
    expect(purged).toBe(1);
    expect(e.get(p)).toBeUndefined();
    expect(e.get(c)!.deletedAt).toBe(2_000);

    e.restore(c);
    expect(e.get(c)!.parentId).toBeNull();
    expect(e.get(c)!.deletedAt).toBeNull();
    expect(e.children(null)).toContain(c);
  });

  test('restore when parent is in trash reparents node to root', () => {
    let time = 1_000;
    const { e } = mk({ clock: () => time });
    const p = e.create(null, { title: 'Parent' });
    const c = e.create(p, { title: 'Child' });

    time = 2_000;
    e.remove(c);
    time = 3_000;
    e.remove(p);

    e.restore(c);
    expect(e.get(c)!.parentId).toBeNull();
    expect(e.children(null)).toContain(c);
  });

  test('purgeTrash is not undoable and removes entry from undo stack', () => {
    const { e, db } = mk();
    const a = e.create(null, { title: 'A' });
    e.remove(a);
    expect(e.undoLabel).toBe('Sil');

    e.purgeTrash();
    expect(e.undoLabel).not.toBe('Çöpü boşalt');
    expect(e.trash()).toHaveLength(0);
    expect(db.all('SELECT * FROM nodes WHERE id = ?', [a])).toHaveLength(0);
  });

  test('undo of remove restores full subtree, link indexes, and FTS search results', () => {
    const { e, db } = mk();
    const target = e.create(null, { title: 'Target' });
    const parent = e.create(null, {
      title: 'Parent',
      body: 'Links to [[Target]] with #myTag and secretFtsKeyword',
    });
    const child = e.create(parent, {
      title: 'Child',
      body: 'Child keyword nestedFtsWord',
    });

    expect(e.backlinks(target)).toHaveLength(1);
    expect(e.tagged('#myTag')).toEqual([parent]);
    expect(e.search('secretFtsKeyword')).toHaveLength(1);
    expect(e.search('nestedFtsWord')).toHaveLength(1);

    e.remove(parent);
    expect(e.backlinks(target)).toHaveLength(0);
    expect(e.tagged('#myTag')).toHaveLength(0);
    expect(e.search('secretFtsKeyword')).toHaveLength(0);
    expect(e.search('nestedFtsWord')).toHaveLength(0);
    expect(e.children(null)).toHaveLength(1);

    e.undo();
    expect(e.backlinks(target)).toHaveLength(1);
    expect(e.tagged('#myTag')).toEqual([parent]);
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
    const a = e.create(null, { title: 'Node A', body: 'Links to [[Node B]] and #myHubTag' });
    const b = e.create(null, { title: 'Node B', body: 'Links to [[Node C]]' });
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
    const r1 = e1.create(null, { title: 'Root 1', body: 'Has #tag1 and [[Root 2]]', isTask: true });
    const r2 = e1.create(null, { title: 'Root 2', body: 'Body 2' });
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
    const reader = e.create(null, { title: 'Reader', body: 'Mentions [[Duplicate]]' });

    e.update(p1, { title: 'Renamed Duplicate' });
    expect(e.get(reader)!.body).toBe('Mentions [[Duplicate]]');
  });

  test('backlinks excludes self references and multiple links in one body produce one backlink', () => {
    const { e } = mk();
    const target = e.create(null, { title: 'Target Note', body: 'Self link [[Target Note]]' });
    expect(e.backlinks(target)).toEqual([]);

    const other = e.create(null, {
      title: 'Other Note',
      body: 'First link [[Target Note]] and second link [[Target Note|Alias]]',
    });
    const backs = e.backlinks(target);
    expect(backs).toHaveLength(1);
    expect(backs[0].src).toBe(other);
  });
});
