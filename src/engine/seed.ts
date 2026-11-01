import type { CortexEngine } from './CortexEngine';
import type { NodeId } from './types';

type Spec = {
  t: string;
  b?: string;
  task?: boolean;
  done?: boolean;
  pin?: boolean;
  seal?: boolean;
  collapsed?: boolean;
  role?: 'inbox';
  c?: Spec[];
};

/**
 * Living Seed: the first launch is never an empty screen. Every pillar of the
 * product is demonstrable within ten seconds, and all of it can be deleted.
 */
const VAULT: Spec[] = [
  {
    t: 'Hoş geldin',
    b: 'Sofia’da her şey bir not. Bir satırın solundaki daireye dokununca görev olur; içine girdiğin her not kendi sayfasıdır. Aşağıdakileri dene — hepsi gerçek görev.',
    c: [
      { t: 'Sağ alttaki ＋ ile yeni bir not aç', task: true },
      { t: 'Bir satırı sola kaydır: sil', task: true },
      { t: 'Bir satırı sağa kaydır: üstündekinin altına al', task: true },
      { t: 'Bir notta Dış Göz’e dokun', task: true },
      { t: 'Ana sayfada “Sıradaki”ye dokun', task: true },
    ],
  },
  {
    t: 'Staj mı, yaz okulu mu?',
    pin: true,
    b:
      'Kafamda dönüp duruyor. Staj teklifi geldi ama yaz okuluna gitmezsem bir dönem kaybedeceğim gibi hissediyorum. ' +
      'Herkes stajın daha değerli olduğunu söylüyor ama yorgunum; yazın dinlenmezsem güz dönemini kaldıramam diye korkuyorum. ' +
      'Cuma gününe kadar cevap vermem lazım ve hiçbir şey yapmadan bekliyorum. &karar&',
  },
  {
    t: 'Dersler',
    b: 'Dönem sonuna 6 hafta var. Her ders kendi sayfası.',
    c: [
      {
        t: 'Matematik',
        task: true,
        b: 'Final: türev ve integral ağırlıklı. &Fizik& de türev istiyor. &sınav&',
        c: [
          {
            t: 'Türev fasikülü',
            task: true,
            b: 'Zincir kuralında takılıyorum; zor soruları ayrı bir listeye aldım.',
            c: [
              { t: 'Temel kurallar (s. 1–24)', task: true, done: true },
              { t: 'Zincir kuralı (s. 25–40)', task: true, done: true },
              {
                t: 'Zor sorular',
                task: true,
                pin: true,
                b: 'Ana sayfaya sabitledim; orada tiklediğim her şey burada da tiklenir.',
                c: [
                  { t: 'Soru 14 — zincir içinde zincir', task: true, done: true },
                  { t: 'Soru 22 — kapalı türev', task: true },
                  { t: 'Soru 31 — logaritmik türev', task: true },
                ],
              },
            ],
          },
          { t: '100 soru çöz', task: true, done: true },
          { t: 'İntegral giriş videosu', task: true, done: true },
          { t: 'Limit tekrar kartları', task: true },
          { t: 'Deneme sınavı', task: true },
        ],
      },
      {
        t: 'Fizik',
        task: true,
        b: 'Hareket ve kuvvet. Türev bilgisi şart: &Matematik&. Formüller &Formül kartları& içinde.',
        c: [
          { t: 'Newton yasaları özeti', task: true, done: true },
          { t: 'Eğik atış — 20 soru', task: true },
          { t: 'Laboratuvar raporu', task: true },
        ],
      },
      {
        t: 'Türkçe',
        task: true,
        b: 'Paragraf hızım düşük. Her gün 20 paragraf, süre tutarak. &sınav&',
        c: [
          { t: 'Paragraf — 20 soru, süreli', task: true },
          { t: 'Anlatım bozuklukları tekrarı', task: true },
        ],
      },
      { t: 'Formül kartları', b: 'v = dx/dt\na = dv/dt\nF = m·a\n\nKart başına tek formül, arkasına bir örnek. &Fizik& &Matematik&' },
    ],
  },
  {
    t: 'Kişisel web sitesi',
    b: 'Mükemmel olmasın, yayında olsun. &odak&',
    c: [
      { t: 'Alan adını al', task: true, done: true },
      { t: 'Tek sayfa taslak — sadece metin', task: true },
      { t: 'Üç proje kartı yaz', task: true },
      { t: 'Yayınla', task: true },
    ],
  },
  {
    t: 'Çalışma ritmi',
    b: 'Aynı anda tek iş. Takılırsam ikiye bölerim: büyük görünen her şey iki küçük adımın kılık değiştirmiş hâli. &odak&',
    c: [{ t: 'Sabah: telefonsuz ilk 30 dakika' }, { t: 'Öğle: yürüyüş, sonra tek iş' }],
  },
];

export function seedShowcase(e: CortexEngine): void {
  e.transact('Başlangıç Cortex’i', () => {
    const doneLater: NodeId[] = [];
    const pinLater: NodeId[] = [];
    const sealLater: NodeId[] = [];
    const walk = (parent: NodeId | null, specs: Spec[]) => {
      for (const s of specs) {
        // Never two inboxes: re-seeding pours into the existing one.
        const existingInbox = s.role === 'inbox' ? e.inbox() : undefined;
        const id = existingInbox?.id ?? e.create(parent, { title: s.t, body: s.b ?? '', isTask: !!s.task, role: s.role ?? null }, { force: true });
        if (s.done) doneLater.push(id);
        if (s.pin) pinLater.push(id);
        if (s.seal) sealLater.push(id);
        if (s.collapsed) e.setCollapsed(id, true);
        if (s.c) walk(id, s.c);
      }
    };
    walk(null, VAULT);
    for (const id of doneLater) e.toggle(id, true);
    for (const id of pinLater) e.setPinned(id, true);
    for (const id of sealLater) e.setSealed(id, true);
  });
}
