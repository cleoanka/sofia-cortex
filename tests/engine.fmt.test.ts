import { describe, expect, test } from 'bun:test';
import { CortexEngine, SealedError } from '../src/engine/CortexEngine';
import { memoryDriver } from './bunDriver';
import {
  addColumn,
  addRow,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  tableMarkdown,
} from '../src/engine/table';

function mk(db = memoryDriver()) {
  let t = 1_000;
  let i = 0;
  const e = new CortexEngine(
    db,
    () => ++t,
    () => 'd' + String(++i).padStart(5, '0'),
  );
  return { e, db };
}

describe('biçimlendirme (fmt) anahtar yönetimi', () => {
  test('setFmt satır ve gövde anahtarlarını birleştirir (merge)', () => {
    const { e } = mk();
    const id = e.create(null, { title: 'Başlık' });
    expect(e.get(id)!.fmt).toBeNull();

    // Satır biçimi ilk anahtar
    e.setFmt(id, { b: true });
    expect(e.get(id)!.fmt).toEqual({ b: true });

    // Satır biçimi yeni anahtarlarla birleşir
    e.setFmt(id, { i: true, s: 'heading' });
    expect(e.get(id)!.fmt).toEqual({ b: true, i: true, s: 'heading' });

    // Gövde biçimi ilk anahtar
    e.setFmt(id, { u: true }, 'body');
    expect(e.get(id)!.fmt).toEqual({
      b: true,
      i: true,
      s: 'heading',
      bd: { u: true },
    });

    // Gövde biçimi yeni anahtarlarla birleşir
    e.setFmt(id, { x: true, f: 'mono' }, 'body');
    expect(e.get(id)!.fmt).toEqual({
      b: true,
      i: true,
      s: 'heading',
      bd: { u: true, x: true, f: 'mono' },
    });
  });

  test('null veya false ile temizleme anahtarları kaldırır', () => {
    const { e } = mk();
    const id = e.create(null, { title: 'Not' });
    e.setFmt(id, { b: true, i: true, u: true, s: 'title' });
    e.setFmt(id, { b: true, i: true }, 'body');

    // Satırda false ve null ile anahtarları kaldırma
    e.setFmt(id, { b: false, i: null as unknown as undefined });
    expect(e.get(id)!.fmt).toEqual({
      u: true,
      s: 'title',
      bd: { b: true, i: true },
    });

    // Gövdede false ve null ile anahtarları kaldırma
    e.setFmt(id, { b: false, i: null as unknown as undefined }, 'body');
    // bd boşaldığı için compact() bd'yi siler
    expect(e.get(id)!.fmt).toEqual({
      u: true,
      s: 'title',
    });
  });

  test('setFmt(id, null) satır biçimini siler ama gövde biçimini (bd) korur', () => {
    const { e } = mk();
    const id = e.create(null, { title: 'Not' });
    e.setFmt(id, { b: true, s: 'subheading' });
    e.setFmt(id, { i: true, h: 'yellow' }, 'body');

    expect(e.get(id)!.fmt).toEqual({
      b: true,
      s: 'subheading',
      bd: { i: true, h: 'yellow' },
    });

    // Satır biçimini null ile temizle
    e.setFmt(id, null);
    expect(e.get(id)!.fmt).toEqual({
      bd: { i: true, h: 'yellow' },
    });
  });

  test('tüm anahtarlar temizlendiğinde biçim null olur', () => {
    const { e } = mk();
    const id = e.create(null, { title: 'Not' });

    // Satır biçimi ekle ve null ile temizle
    e.setFmt(id, { b: true });
    expect(e.get(id)!.fmt).toEqual({ b: true });
    e.setFmt(id, null);
    expect(e.get(id)!.fmt).toBeNull();

    // False / null patch ile tüm satır anahtarlarını temizle
    e.setFmt(id, { i: true });
    e.setFmt(id, { i: false });
    expect(e.get(id)!.fmt).toBeNull();

    // Hem satır hem gövde varken her ikisini de temizle
    e.setFmt(id, { b: true });
    e.setFmt(id, { u: true }, 'body');
    e.setFmt(id, null);
    expect(e.get(id)!.fmt).toEqual({ bd: { u: true } });
    e.setFmt(id, null, 'body');
    expect(e.get(id)!.fmt).toBeNull();
  });
});

describe('biçimlendirmenin yeniden yüklemede (reload) korunması', () => {
  test('fmt aynı memoryDriver üzerinde yeni CortexEngine açıldığında eşit kalır', () => {
    const { e: e1, db } = mk();
    const page = e1.create(null, { title: 'Sayfa' });
    e1.setFmt(page, { b: true, s: 'heading', f: 'serif' });
    e1.setFmt(page, { i: true, h: 'green' }, 'body');
    const expectedFmt = e1.get(page)!.fmt;
    expect(expectedFmt).toEqual({
      b: true,
      s: 'heading',
      f: 'serif',
      bd: { i: true, h: 'green' },
    });

    // Aynı sürücü üzerinde ikinci bir motor örneği oluştur
    const e2 = new CortexEngine(db);
    expect(e2.get(page)!.fmt).toEqual(expectedFmt);

    // Yalnızca gövde biçimi kaldığında da yeniden yükleme doğrulanır
    e1.setFmt(page, null);
    const bodyOnlyFmt = e1.get(page)!.fmt;
    expect(bodyOnlyFmt).toEqual({ bd: { i: true, h: 'green' } });

    const e3 = new CortexEngine(db);
    expect(e3.get(page)!.fmt).toEqual(bodyOnlyFmt);

    // Tamamen temizlendiğinde null olarak yüklenir
    e1.setFmt(page, null, 'body');
    expect(e1.get(page)!.fmt).toBeNull();

    const e4 = new CortexEngine(db);
    expect(e4.get(page)!.fmt).toBeNull();
  });
});

describe('mühürlü planda biçimlendirme ve kilit kuralları', () => {
  test('mühürlü planda setFmt serbesttir, create SealedError fırlatır', () => {
    const { e } = mk();
    const plan = e.create(null, { title: 'Mühürlü Plan' });
    const task1 = e.create(plan, { title: 'İlk iş', isTask: true });
    e.setSealed(plan, true);

    expect(e.isLocked(plan)).toBe(true);
    expect(e.isLocked(task1)).toBe(true);

    // create() mühürlü planda SealedError fırlatmalı
    expect(() => e.create(plan, { title: 'Yeni iş' })).toThrow(SealedError);
    expect(() => e.create(task1, { title: 'Alt iş', isTask: true })).toThrow(SealedError);

    // setFmt mühürlü planda serbesttir ve hata fırlatmaz
    expect(() => e.setFmt(plan, { s: 'title', b: true })).not.toThrow();
    expect(e.get(plan)!.fmt).toEqual({ s: 'title', b: true });

    expect(() => e.setFmt(task1, { i: true })).not.toThrow();
    expect(e.get(task1)!.fmt).toEqual({ i: true });

    expect(() => e.setFmt(task1, { u: true }, 'body')).not.toThrow();
    expect(e.get(task1)!.fmt).toEqual({ i: true, bd: { u: true } });
  });
});

describe('geri alma (undo) ve biçimlendirme geçmişi', () => {
  test('undo() önceki satır ve gövde biçimlendirmesini geri yükler', () => {
    const { e } = mk();
    const id = e.create(null, { title: 'Geri Alma Notu' });
    expect(e.get(id)!.fmt).toBeNull();

    e.setFmt(id, { b: true });
    expect(e.get(id)!.fmt).toEqual({ b: true });

    // İlk biçimlendirmeyi geri al -> null
    expect(e.undo()).toBe('Biçim');
    expect(e.get(id)!.fmt).toBeNull();

    // Tekrar yap (redo) -> { b: true }
    expect(e.redo()).toBe('Biçim');
    expect(e.get(id)!.fmt).toEqual({ b: true });

    // Satır biçimini güncelle
    e.setFmt(id, { s: 'heading' });
    expect(e.get(id)!.fmt).toEqual({ b: true, s: 'heading' });

    // Gövde biçimi ekle
    e.setFmt(id, { i: true }, 'body');
    expect(e.get(id)!.fmt).toEqual({ b: true, s: 'heading', bd: { i: true } });

    // Gövde biçimini geri al
    e.undo();
    expect(e.get(id)!.fmt).toEqual({ b: true, s: 'heading' });

    // Satır biçimi güncellemesini geri al
    e.undo();
    expect(e.get(id)!.fmt).toEqual({ b: true });

    // Biçimi null ile temizle
    e.setFmt(id, null);
    expect(e.get(id)!.fmt).toBeNull();

    // Temizlemeyi geri al -> { b: true } geri gelir
    e.undo();
    expect(e.get(id)!.fmt).toEqual({ b: true });
  });
});

describe('tablo düğümleri ve yardımcıları (table)', () => {
  test('createTable role table düğümü oluşturur ve gövdesi 2x2 boş ayrıştırılır', () => {
    const { e } = mk();
    const parent = e.create(null, { title: 'Belge' });
    const tblId = e.createTable(parent);
    const tbl = e.get(tblId)!;

    expect(tbl.role).toBe('table');
    expect(tbl.parentId).toBe(parent);

    const cells = parseTable(tbl.body);
    expect(cells).toEqual([
      ['', ''],
      ['', ''],
    ]);
  });

  test('satır ve sütun ekleme/çıkarma dikdörtgenliği korur ve 1x1 altına inmez', () => {
    let cells = [
      ['A', 'B'],
      ['C', 'D'],
    ];

    // Satır ekle -> 3x2 dikdörtgen
    cells = addRow(cells);
    expect(cells).toHaveLength(3);
    expect(cells.every((r) => r.length === 2)).toBe(true);
    expect(cells[2]).toEqual(['', '']);

    // Araya satır ekle
    cells = addRow(cells, 1);
    expect(cells).toHaveLength(4);
    expect(cells.every((r) => r.length === 2)).toBe(true);

    // Sütun ekle -> 4x3 dikdörtgen
    cells = addColumn(cells);
    expect(cells).toHaveLength(4);
    expect(cells.every((r) => r.length === 3)).toBe(true);

    // Araya sütun ekle
    cells = addColumn(cells, 1);
    expect(cells).toHaveLength(4);
    expect(cells.every((r) => r.length === 4)).toBe(true);

    // Satır çıkar
    cells = removeRow(cells, 1);
    expect(cells).toHaveLength(3);
    expect(cells.every((r) => r.length === 4)).toBe(true);

    // Sütun çıkar
    cells = removeColumn(cells, 1);
    expect(cells).toHaveLength(3);
    expect(cells.every((r) => r.length === 3)).toBe(true);

    // 1x1 sınırına kadar küçült
    cells = removeRow(cells, 2);
    cells = removeRow(cells, 1);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveLength(3);

    cells = removeColumn(cells, 2);
    cells = removeColumn(cells, 1);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveLength(1);
    expect(cells).toEqual([['A']]);

    // 1x1 altına asla inmez
    cells = removeRow(cells, 0);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveLength(1);

    cells = removeColumn(cells, 0);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveLength(1);
    expect(cells).toEqual([['A']]);
  });

  test('parseTable bozuk veya geçersiz içeriklerde 2x2 boş tablo döndürür', () => {
    const empty2x2 = [
      ['', ''],
      ['', ''],
    ];

    expect(parseTable('')).toEqual(empty2x2);
    expect(parseTable('çöp metin')).toEqual(empty2x2);
    expect(parseTable('{ invalid json')).toEqual(empty2x2);
    expect(parseTable('{"rows": []}')).toEqual(empty2x2);
    expect(parseTable('{"rows": "hatalı tip"}')).toEqual(empty2x2);
    expect(parseTable('{"notRows": [["1"]]}')).toEqual(empty2x2);
    expect(parseTable('null')).toEqual(empty2x2);
    expect(parseTable('12345')).toEqual(empty2x2);
  });

  test('tableMarkdown başlık ayırıcı çizgisi (| --- |) içerir', () => {
    const tableBody = serializeTable([
      ['Başlık A', 'Başlık B'],
      ['Veri 1', 'Veri 2'],
    ]);
    const md = tableMarkdown(tableBody);
    const lines = md.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('| Başlık A | Başlık B |');
    expect(lines[1]).toBe('| --- | --- |');
    expect(lines[2]).toBe('| Veri 1 | Veri 2 |');
    expect(md).toContain('| --- | --- |');
  });
});

describe('tablo düğümlerinin taslak ve otopilot davranışları', () => {
  test('tablo düğümü asla taslak sayılmaz ve nextActions kuyruğuna girmez', () => {
    const { e } = mk();
    const page = e.create(null, { title: 'Sayfa' });
    const tblId = e.createTable(page);

    // Başlıksız veya boş hücreli olsa dahi tablo düğümü asla taslak değildir
    expect(e.isDraft(tblId)).toBe(false);

    // Otopilot kuyruğunda (nextActions) asla yer almaz
    expect(e.nextActions(page)).not.toContain(tblId);
    expect(e.nextActions(null)).not.toContain(tblId);

    // Sayfaya taslak ve gerçek görevler eklendiğinde
    const draft = e.create(page, { isTask: true });
    const realTask = e.create(page, { title: 'Gerçek Görev', isTask: true });

    expect(e.isDraft(draft)).toBe(true);
    expect(e.isDraft(tblId)).toBe(false);

    // nextActions sadece gerçek görevi döndürür; taslak ve tablo yer almaz
    expect(e.nextActions(page)).toEqual([realTask]);
    expect(e.nextActions(null)).toEqual([realTask]);
    expect(e.nextActions(page)).not.toContain(tblId);
    expect(e.nextActions(page)).not.toContain(draft);
  });
});

describe('veritabanı şema göçü (migrate)', () => {
  test('migrate() fmt kolonu olmayan eski veritabanına kolonu ekler ve setFmt kalıcı olur', () => {
    const db = memoryDriver();

    // src/engine/schema.ts içindeki sütunların fmt hariç haliyle eski nodes tablosunu oluştur
    db.exec(`
CREATE TABLE nodes (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT,
  sort          REAL    NOT NULL DEFAULT 0,
  title         TEXT    NOT NULL DEFAULT '',
  body          TEXT    NOT NULL DEFAULT '',
  is_task       INTEGER NOT NULL DEFAULT 0,
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       INTEGER,
  pinned        INTEGER NOT NULL DEFAULT 0,
  pin_order     REAL    NOT NULL DEFAULT 0,
  sealed        INTEGER NOT NULL DEFAULT 0,
  collapsed     INTEGER NOT NULL DEFAULT 0,
  steep_until   INTEGER,
  reminder_at   INTEGER,
  reminder_hook TEXT,
  reminder_id   TEXT,
  role          TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
`);

    // Başlangıçta fmt kolonu olmamalı
    const colsBefore = db.all<{ name: string }>('PRAGMA table_info(nodes)');
    expect(colsBefore.some((c) => c.name === 'fmt')).toBe(false);

    // CortexEngine oluşturulduğunda migrate(db) çalışarak fmt kolonunu eklemeli
    let t = 2_000;
    let i = 0;
    const e = new CortexEngine(
      db,
      () => ++t,
      () => 'm' + String(++i).padStart(5, '0'),
    );

    // fmt kolonu başarıyla eklenmiş olmalı
    const colsAfter = db.all<{ name: string }>('PRAGMA table_info(nodes)');
    expect(colsAfter.some((c) => c.name === 'fmt')).toBe(true);

    // setFmt ile biçimlendirme uygulanıp kalıcılığı doğrulanmalı
    const node = e.create(null, { title: 'Eski veritabanı düğümü' });
    e.setFmt(node, { b: true, s: 'heading' });
    e.setFmt(node, { i: true }, 'body');

    expect(e.get(node)!.fmt).toEqual({
      b: true,
      s: 'heading',
      bd: { i: true },
    });

    // Doğrudan veritabanı satırından kontrol
    const row = db.all<{ fmt: string }>('SELECT fmt FROM nodes WHERE id = ?', [node])[0];
    expect(row.fmt).toBeTruthy();
    expect(JSON.parse(row.fmt)).toEqual({
      b: true,
      s: 'heading',
      bd: { i: true },
    });

    // Aynı veritabanı ile yeni bir CortexEngine açıldığında fmt okunabilmeli
    const reloaded = new CortexEngine(db);
    expect(reloaded.get(node)!.fmt).toEqual({
      b: true,
      s: 'heading',
      bd: { i: true },
    });
  });
});
