import { expect, test } from 'bun:test';
import { analyse, toThirdPerson } from '../src/engine/observer';

test('1. tekil → 3. şahıs (muhafazakâr)', () => {
  expect(toThirdPerson('Yaz okuluna gitmezsem bir dönem kaybedeceğim gibi hissediyorum.')).toBe('Yaz okuluna gitmezse bir dönem kaybedecek gibi hissediyor.');
  expect(toThirdPerson('Ama ben yorgunum ve yazın dinlenmezsem güz dönemini kaldıramam diye korkuyorum.')).toBe('Ama Özne yorgun ve yazın dinlenmezse güz dönemini kaldıramaz diye korkuyor.');
  expect(toThirdPerson('Cuma gününe kadar cevap vermem lazım ve hiçbir şey yapmadan bekliyorum.')).toBe('Cuma gününe kadar cevap vermesi lazım ve hiçbir şey yapmadan bekliyor.');
  expect(toThirdPerson('Kafamda dönüp duruyor.')).toBe('Kafasında dönüp duruyor.');
  expect(toThirdPerson('Dün geldim, bana söylediler.')).toBe('Dün geldi, ona söylediler.');
  expect(toThirdPerson('Yardım istedim ama tamam dedim.')).toBe('Yardım istedi ama tamam dedi.');
  expect(toThirdPerson('Bunu yapmalıyım.')).toBe('Bunu yapmalı.');
});

test('vaka dosyası örüntüleri', () => {
  const f = analyse('x', 'Staj', 'Staj teklifi geldi, ama gitmezsem kaybedeceğim. Herkes stajın değerli olduğunu söylüyor. Cuma gününe kadar cevap vermem lazım ve bekliyorum. Asla böyle bir şans gelmez.');
  const keys = f.patterns.map((p) => p.key);
  for (const k of ['oscillation', 'catastrophe', 'social', 'deadline', 'obligation', 'absolute', 'stall']) expect(keys).toContain(k as never);
  expect(f.number).toMatch(/^\d{4}$/);
  expect(f.fog).toBeGreaterThan(0);
  expect(f.summary).toContain('kaybedecek');
});
