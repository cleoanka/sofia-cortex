import { describe, expect, test } from 'bun:test';
import { CortexEngine } from '../src/engine/CortexEngine';
import { memoryDriver } from './bunDriver';

function mk() {
  let t = 1_000;
  let i = 0;
  const db = memoryDriver();
  const e = new CortexEngine(db, () => ++t, () => 'n' + String(++i).padStart(5, '0'));
  return { e, db };
}

describe('Dersler senaryosu — bottom-up auto-tick', () => {
  test('5/5 alt görev ebeveyni otomatik tikler, biri açılınca 4/5 geri döner', () => {
    const { e } = mk();
    const dersler = e.create(null, { title: 'Dersler' });
    const mat = e.create(dersler, { title: 'Matematik', isTask: true });
    e.create(dersler, { title: 'Fizik' });
    const subs = ['Türev fasikülü', '100 soru çöz', 'Limit tekrarı', 'Deneme', 'Formül kartı'].map((t) =>
      e.create(mat, { title: t, isTask: true }),
    );
    for (const s of subs.slice(0, 4)) expect(e.toggle(s).cascaded).toEqual([]);
    expect(e.progress(mat)).toEqual({ done: 4, total: 5 });
    expect(e.get(mat)!.done).toBe(false);
    const r = e.toggle(subs[4]);
    expect(r.cascaded).toEqual([mat]);
    expect(e.get(mat)!.done).toBe(true);
    e.toggle(subs[2]);
    expect(e.get(mat)!.done).toBe(false);
    expect(e.progress(mat)).toEqual({ done: 4, total: 5 });
  });

  test('derin zincir yukarı kadar dalgalanır, not ebeveynde durur', () => {
    const { e } = mk();
    const note = e.create(null, { title: 'Proje' });
    const a = e.create(note, { title: 'A', isTask: true });
    const b = e.create(a, { title: 'B', isTask: true });
    const c = e.create(b, { title: 'C', isTask: true });
    const r = e.toggle(c);
    expect(r.cascaded).toEqual([b, a]);
    expect(e.get(note)!.done).toBe(false);
    expect(e.progress(note)).toEqual({ done: 1, total: 1 });
  });

  test('ebeveyni tiklemek tüm alt ağacı tikler', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'P', isTask: true });
    const k = [1, 2, 3].map((n) => e.create(p, { title: 'k' + n, isTask: true }));
    const g = e.create(k[0], { title: 'g', isTask: true });
    e.toggle(p);
    expect([...k, g].every((x) => e.get(x)!.done)).toBe(true);
    e.toggle(p);
    expect([...k, g].some((x) => e.get(x)!.done)).toBe(false);
  });

  test('tamamlanmış ebeveyne yeni görev eklenince ebeveyn yeniden açılır', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'P', isTask: true });
    const a = e.create(p, { title: 'a', isTask: true });
    e.toggle(a);
    expect(e.get(p)!.done).toBe(true);
    e.create(p, { title: 'b', isTask: true });
    expect(e.get(p)!.done).toBe(false);
  });

  test('undo/redo tek adımda tüm dalgayı geri alır ve SQLite ile tutarlı kalır', () => {
    const { e, db } = mk();
    const p = e.create(null, { title: 'P', isTask: true });
    const a = e.create(p, { title: 'a', isTask: true });
    e.toggle(a);
    expect(e.get(p)!.done).toBe(true);
    e.undo();
    expect(e.get(p)!.done).toBe(false);
    expect(e.get(a)!.done).toBe(false);
    expect(db.all<{ done: number }>('SELECT done FROM nodes WHERE id=?', [p])[0].done).toBe(0);
    e.redo();
    expect(e.get(p)!.done).toBe(true);
    const reopened = new CortexEngine(db);
    expect(reopened.get(p)!.done).toBe(true);
    expect(reopened.children(p)).toEqual([a]);
  });
});

describe('vitrin, bağlantı, arama', () => {
  test('5 katman derindeki düğüm vitrinde, değişiklik yerinde', () => {
    const { e } = mk();
    let parent: string | null = null;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((parent = e.create(parent, { title: 'L' + i, isTask: i > 0 })));
    const deep = ids[4];
    e.setPinned(deep, true);
    expect(e.pinned().map((n) => n.id)).toEqual([deep]);
    e.toggle(deep);
    expect(e.get(deep)!.done).toBe(true);
    expect(e.get(ids[3])!.done).toBe(true);
    expect(e.path(deep).map((n) => n.title)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
  });

  test('&bağlantı& backlink + yeniden adlandırma referansları günceller', () => {
    const { e } = mk();
    const mat = e.create(null, { title: 'Matematik' });
    const fiz = e.create(null, { title: 'Fizik', body: 'Hareket konusu &Matematik& türevine dayanıyor &sınav&' });
    expect(e.backlinks(mat).map((b) => b.src)).toEqual([fiz]);
    expect(e.backlinks(mat)[0].snippet).toContain('Matematik');
    e.update(mat, { title: 'Analiz' });
    expect(e.get(fiz)!.body).toContain('&Analiz&');
    expect(e.backlinks(mat).map((b) => b.src)).toEqual([fiz]);
    expect(e.tagged('sınav')).toEqual([fiz]);
    expect(e.allTags().map((t) => t.tag)).toEqual(['sınav']);
  });

  test('silinen not hortlamaz: alt ağaç + referanslar kalıcı gider, tek undo hepsini geri getirir', () => {
    const { e } = mk();
    const mat = e.create(null, { title: 'Matematik' });
    const kid = e.create(mat, { title: 'Türev', isTask: true });
    const fiz = e.create(null, { title: 'Fizik', body: 'Bkz. &Matematik& ve &Türev&.' });
    e.remove(mat);
    expect(e.get(mat)).toBeUndefined();
    expect(e.get(kid)).toBeUndefined();
    expect(e.get(fiz)!.body).toBe('Bkz. Matematik ve Türev.');
    expect(e.resolve('matematik')).toBeUndefined();
    expect(e.search('türev').map((h) => h.id)).toEqual([fiz]);
    e.undo();
    expect(e.get(kid)!.parentId).toBe(mat);
    expect(e.get(fiz)!.body).toBe('Bkz. &Matematik& ve &Türev&.');
  });

  test('eski [[x]] / #etiket / @x sözdizimi tek seferde &x& olur', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'A', body: 'bkz [[Fizik|fiz]] ve #sınav, @Ali' });
    e.clearHistory();
    expect(e.migrateSyntax()).toBe(1);
    expect(e.get(a)!.body).toBe('bkz &Fizik& ve &sınav&, &Ali&');
    expect(e.canUndo).toBe(false);
  });

  test('FTS5 Türkçe aksan-duyarsız önek araması', () => {
    const { e } = mk();
    e.create(null, { title: 'Türev fasikülü', body: 'zincir kuralı' });
    e.create(null, { title: 'Fizik', body: 'Newton yasaları' });
    expect(e.search('tur').map((h) => h.title)).toEqual(['Türev fasikülü']);
    expect(e.search('zinc')[0].title).toBe('Türev fasikülü');
    expect(e.search('newt yas')[0].title).toBe('Fizik');
  });
});

describe('mühür, otopilot, bölme', () => {
  test('mühürlü planda yapı kilitli, tikleme serbest; bitince mühür çözülür', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Plan' });
    const a = e.create(p, { title: 'a', isTask: true });
    const b = e.create(p, { title: 'b', isTask: true });
    e.setSealed(p, true);
    expect(() => e.reorder(b, 0)).toThrow();
    expect(() => e.create(p, { title: 'c' })).toThrow();
    expect(() => e.remove(a)).toThrow();
    e.toggle(a);
    e.toggle(b);
    expect(e.isLocked(p)).toBe(false);
    e.reorder(b, 0);
    expect(e.children(p)).toEqual([b, a]);
  });

  test('otopilot sırası: vitrin önce, sadece atomik açık görevler; ikiye böl', () => {
    const { e } = mk();
    const d = e.create(null, { title: 'Dersler' });
    const m = e.create(d, { title: 'Matematik', isTask: true });
    const t1 = e.create(m, { title: 'Türev', isTask: true });
    const t2 = e.create(m, { title: 'Limit', isTask: true });
    const x = e.create(null, { title: 'Faturayı öde', isTask: true });
    e.setPinned(x, true);
    expect(e.nextActions()).toEqual([x, t1, t2]);
    const [s1, s2] = e.split(t1, 'İlk 15 soru', 'Kalan 15 soru');
    expect(e.nextActions()).toEqual([x, s1, s2, t2]);
    e.toggle(s1);
    e.toggle(s2);
    expect(e.get(t1)!.done).toBe(true);
    expect(e.nextActions(m)).toEqual([t2]);
  });

  test('girinti/çıkıntı ve döngü koruması', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'a' });
    const b = e.create(null, { title: 'b' });
    expect(e.indent(b)).toBe(true);
    expect(e.get(b)!.parentId).toBe(a);
    expect(() => e.move(a, b)).toThrow('Cycle');
    expect(e.outdent(b)).toBe(true);
    expect(e.children(null)).toEqual([a, b]);
  });

  test('silinen ebeveyn alt görevini de götürür; ebeveyn görevi yeniden hesaplanır', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'p', isTask: true });
    const a = e.create(p, { title: 'a', isTask: true });
    const b = e.create(p, { title: 'b', isTask: true });
    e.toggle(a);
    expect(e.get(p)!.done).toBe(false);
    e.remove(b);
    expect(e.get(p)!.done).toBe(true);
    expect(e.subtreeSql(p).map((r) => r.id)).toEqual([p, a]);
  });
});

describe('performans (iPhone 12 bütçesi için JSC/bun vekili)', () => {
  test('10.000 düğüm: yükleme, tikleme dalgası, arama, otopilot', () => {
    const { db } = mk();
    const e = new CortexEngine(db);
    const t0 = performance.now();
    e.transact('seed', () => {
      for (let r = 0; r < 100; r++) {
        const root = e.create(null, { title: 'Kök ' + r, isTask: true });
        for (let i = 0; i < 9; i++) {
          const mid = e.create(root, { title: `Konu ${r}.${i}`, isTask: true, body: `&Kök ${(r + 1) % 100}& &etiket${i}&` });
          for (let j = 0; j < 10; j++) e.create(mid, { title: `Görev ${r}.${i}.${j} türev integral`, isTask: true });
        }
      }
    });
    const seedMs = performance.now() - t0;
    expect(e.size).toBe(10_000);

    const t1 = performance.now();
    const fresh = new CortexEngine(db);
    const loadMs = performance.now() - t1;
    expect(fresh.size).toBe(10_000);

    const leaf = fresh.children(fresh.children(fresh.children(null)[0])[0]);
    const t2 = performance.now();
    for (const l of leaf) fresh.toggle(l);
    const toggleMs = (performance.now() - t2) / leaf.length;

    const t3 = performance.now();
    const hits = fresh.search('görev 42 türev');
    const searchMs = performance.now() - t3;
    expect(hits.length).toBeGreaterThan(0);

    const t4 = performance.now();
    const q = fresh.nextActions(null, 50);
    const queueMs = performance.now() - t4;
    expect(q.length).toBe(50);

    const t5 = performance.now();
    const g = fresh.graph();
    const graphMs = performance.now() - t5;
    expect(g.ids.length).toBeGreaterThan(10_000);

    console.log(JSON.stringify({ seedMs: +seedMs.toFixed(1), loadMs: +loadMs.toFixed(1), toggleMs: +toggleMs.toFixed(3), searchMs: +searchMs.toFixed(3), queueMs: +queueMs.toFixed(3), graphMs: +graphMs.toFixed(1) }));
    expect(loadMs).toBeLessThan(250);
    expect(toggleMs).toBeLessThan(5);
    expect(searchMs).toBeLessThan(10);
  });
});

describe('başlangıç cortex’i', () => {
  test('seed tutarlı: derin vitrin, mühür, gelen kutusu, bağlantılar', async () => {
    const { seedShowcase } = await import('../src/engine/seed');
    const { e } = mk();
    seedShowcase(e);
    e.clearHistory();
    expect(e.canUndo).toBe(false);

    const pinned = e.pinned().map((n) => n.title);
    expect(pinned).toContain('Zor sorular');
    const zor = e.pinned().find((n) => n.title === 'Zor sorular')!;
    expect(e.depth(zor.id)).toBe(3);
    expect(e.progress(zor.id)).toEqual({ done: 1, total: 3 });
    const mat = e.resolve('matematik')!;
    expect(e.progress(mat.id)).toEqual({ done: 2, total: 5 });
    expect(e.backlinks(mat.id).length).toBeGreaterThanOrEqual(2);
    expect(e.nextActions().length).toBeGreaterThan(5);
    expect(e.allTags().map((t) => t.tag).sort()).toEqual(['karar', 'odak', 'sınav']);
  });
});

describe('veri egemenliği', () => {
  test('markdown ağacı: klasör/dosya, checklist, wikilink', async () => {
    const { seedShowcase } = await import('../src/engine/seed');
    const { toMarkdownTree } = await import('../src/engine/vault');
    const { e } = mk();
    seedShowcase(e);
    const files = toMarkdownTree(e);
    const paths = Object.keys(files);
    expect(paths).toContain('Sofia Cortex/Dersler/Matematik/Matematik.md');
    expect(files['Sofia Cortex/Dersler/Matematik/Matematik.md']).toContain('- [x] [[100 soru çöz]]');
    expect(paths.some((p) => p.endsWith('Zor sorular/Zor sorular.md'))).toBe(true);
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(paths.length);
  });
});

describe('inceleme bulguları', () => {
  test('R10: mühürlü planda görev nota çevrilemez', () => {
    const { e } = mk();
    const p = e.create(null, { title: 'Plan' });
    const a = e.create(p, { title: 'a', isTask: true });
    e.setSealed(p, true);
    expect(() => e.setTask(a, false)).toThrow();
    expect(e.isLocked(p)).toBe(true);
  });
  test('R14: sistem güncellemesi geri-al geçmişine girmez', () => {
    const { e } = mk();
    const a = e.create(null, { title: 'a' });
    e.clearHistory();
    e.update(a, { steepUntil: null, reminderId: 'x' }, { history: false });
    expect(e.canUndo).toBe(false);
    expect(e.get(a)!.reminderId).toBe('x');
  });
});
