import { describe, expect, test } from 'bun:test';
import { CortexEngine } from '../src/engine/CortexEngine';
import { memoryDriver } from './bunDriver';

function mk() {
  let t = 1_000;
  let i = 0;
  const e = new CortexEngine(
    memoryDriver(),
    () => ++t,
    () => 'd' + String(++i).padStart(5, '0'),
  );
  return e;
}

describe('boş görev satırı (taslak) iş sayılmaz', () => {
  test('Otopilot kuyruğuna ve Sıradaki’ye girmez', () => {
    const e = mk();
    const page = e.create(null, { title: 'Sayfa' });
    const real = e.create(page, { title: 'Gerçek iş', isTask: true });
    const draft = e.create(page, { isTask: true });
    e.create(page, { title: '   ', isTask: true });
    expect(e.isDraft(draft)).toBe(true);
    expect(e.nextActions(page)).toEqual([real]);
    expect(e.nextActions(null)).toEqual([real]);
    e.toggle(real);
    expect(e.nextActions(null)).toEqual([]);
  });

  test('sayaçta görünmez, ebeveyni açık tutmaz', () => {
    const e = mk();
    const parent = e.create(null, { title: 'Ne yap onu bul', isTask: true });
    const a = e.create(parent, { title: 'Deneme', isTask: true });
    const b = e.create(parent, { title: 'Alooo', isTask: true });
    e.create(parent, { isTask: true });
    expect(e.progress(parent)).toEqual({ done: 0, total: 2 });
    e.toggle(a);
    expect(e.toggle(b).cascaded).toEqual([parent]);
    expect(e.get(parent)!.done).toBe(true);
    expect(e.progress(parent)).toEqual({ done: 2, total: 2 });
    expect(e.deepProgress(parent)).toEqual({ done: 2, total: 2 });
  });

  test('tamamlanmış görevin altına açılan boş satır onu geri açmaz; yazı yazılınca açar', () => {
    const e = mk();
    const parent = e.create(null, { title: 'Bitmiş', isTask: true });
    const a = e.create(parent, { title: 'A', isTask: true });
    e.toggle(a);
    expect(e.get(parent)!.done).toBe(true);
    const line = e.create(parent, { isTask: true });
    expect(e.get(parent)!.done).toBe(true);
    e.update(line, { title: 'Yeni iş' });
    expect(e.isDraft(line)).toBe(false);
    expect(e.get(parent)!.done).toBe(false);
    expect(e.nextActions(null)).toEqual([line]);
    // Metni silmek onu yeniden taslağa çevirir ve ebeveyn tekrar biter.
    e.update(line, { title: '' });
    expect(e.get(parent)!.done).toBe(true);
  });

  test('ebeveyni tiklemek taslağı tiklemez', () => {
    const e = mk();
    const parent = e.create(null, { title: 'Üst', isTask: true });
    e.create(parent, { title: 'A', isTask: true });
    const draft = e.create(parent, { isTask: true });
    e.toggle(parent);
    expect(e.get(draft)!.done).toBe(false);
  });

  test('düz metin boş satır ve gövdesi olan görev taslak değildir', () => {
    const e = mk();
    const page = e.create(null, { title: 'Sayfa' });
    const text = e.create(page, {});
    const withBody = e.create(page, { isTask: true, body: 'not' });
    expect(e.isDraft(text)).toBe(false);
    expect(e.isDraft(withBody)).toBe(false);
  });
});

describe('taslak sınırları', () => {
  test('alt öğeleri de boş olan başlıksız görev kuyruğa girmez', () => {
    const e = mk();
    const page = e.create(null, { title: 'Sayfa' });
    const empty = e.create(page, { isTask: true });
    e.create(empty, { isTask: true });
    expect(e.isDraft(empty)).toBe(true);
    expect(e.nextActions(null)).toEqual([]);
  });

  test('taslağın altına gerçek görev gelince büyük ebeveyn yeniden açılır', () => {
    const e = mk();
    const top = e.create(null, { title: 'Üst', isTask: true });
    const a = e.create(top, { title: 'A', isTask: true });
    e.toggle(a);
    const draft = e.create(top, { isTask: true });
    expect(e.get(top)!.done).toBe(true);
    e.create(draft, { title: 'Gerçek', isTask: true });
    expect(e.isDraft(draft)).toBe(false);
    expect(e.get(top)!.done).toBe(false);
  });

  test('notun altındaki görev zinciri notta durur, yukarı taşmaz', () => {
    const e = mk();
    const outer = e.create(null, { title: 'Dış', isTask: true });
    const note = e.create(outer, { title: 'Not' });
    const t = e.create(note, { title: 'İş', isTask: true });
    expect(e.toggle(t).cascaded).toEqual([]);
    expect(e.get(outer)!.done).toBe(false);
  });
});
