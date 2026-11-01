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
    t: 'Gelen Kutusu',
    role: 'inbox',
    b: 'Hızlı Döküm buraya düşer. Karar verme — sadece yakala. Sonra uzun basıp istediğin yere ışınla.',
    c: [
      { t: 'Kütüphane kartını yenile', task: true },
      { t: 'Annemi ara — pazar planı', task: true },
      { t: 'Fikir: ders notlarını sesli özetle #fikir' },
    ],
  },
  {
    t: 'Dersler',
    b: 'Dönem sonuna 6 hafta. Her ders kendi evreni; içine gir, böl, tikle. Bağlantılar: [[Çalışma Ritmi]] · #sınav',
    c: [
      {
        t: 'Matematik',
        task: true,
        b: 'Final: türev + integral ağırlıklı. [[Fizik]] hareket konusu da türev istiyor. #sınav',
        c: [
          {
            t: 'Türev fasikülü',
            task: true,
            b: 'Zincir kuralında takılıyorum. Zor soruları ayrı listeye aldım ve vitrine çıkardım.',
            c: [
              { t: 'Temel kurallar (s. 1–24)', task: true, done: true },
              { t: 'Zincir kuralı (s. 25–40)', task: true, done: true },
              {
                t: 'Zor Sorular Listesi',
                task: true,
                pin: true,
                b: 'Dört katman derinde yaşıyor ama Ana Sayfa’da duruyor. Burada tiklediğin her şey asıl yerinde de tiklenir.',
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
          { t: 'Deneme sınavı #1', task: true },
        ],
      },
      {
        t: 'Fizik',
        task: true,
        b: 'Hareket ve kuvvet. Türev bilgisi şart → [[Matematik]]. Formülleri [[Formül Kartları]]na topluyorum.',
        c: [
          { t: 'Newton yasaları özeti', task: true, done: true },
          { t: 'Eğik atış — 20 soru', task: true },
          { t: 'Laboratuvar raporu', task: true },
        ],
      },
      {
        t: 'Türkçe',
        task: true,
        b: 'Paragraf hızı düşük. Her gün 20 paragraf, süre tutarak. #sınav',
        c: [
          { t: 'Paragraf — 20 soru (süreli)', task: true },
          { t: 'Anlatım bozuklukları tekrarı', task: true },
        ],
      },
      { t: 'Formül Kartları', b: 'v = dx/dt\na = dv/dt\nF = m·a\n\nKart başına tek formül. Arka yüzüne bir örnek. Bağlı: [[Fizik]], [[Matematik]]' },
    ],
  },
  {
    t: 'Staj mı, yaz okulu mu?',
    pin: true,
    b:
      'Kafamda dönüp duruyor. Staj teklifi geldi, ama yaz okuluna gitmezsem bir dönem kaybedeceğim gibi hissediyorum. ' +
      'Herkes stajın daha değerli olduğunu söylüyor ama ben yorgunum ve yazın dinlenmezsem güz dönemini kaldıramam diye korkuyorum. ' +
      'Bir yandan da teklifi reddedersem bir daha böyle bir şans gelmez diye düşünüyorum. Cuma gününe kadar cevap vermem lazım ve hiçbir şey yapmadan bekliyorum.\n\n' +
      'Bunu kartı çevirip Dış Göz ile oku. Sonra kıdemli bir stratejist gibi reçeteyi yaz. #karar',
  },
  {
    t: 'Proje: Kişisel Web Sitesi',
    seal: true,
    b: 'Planı mühürledim. Sıralamayı değiştirmek yok — sadece yürütmek. Bitince mühür kendiliğinden çözülür. [[Çalışma Ritmi]]',
    c: [
      { t: 'Alan adını al', task: true, done: true },
      { t: 'Tek sayfa taslak — sadece metin', task: true },
      { t: 'Üç proje kartı yaz', task: true },
      { t: 'Yayınla, mükemmel olmasın', task: true },
    ],
  },
  {
    t: 'Çalışma Ritmi',
    b:
      'Kural: aynı anda tek görev. Otopilot sadece sıradakini gösterir; gerisi karanlıkta bekler.\n\n' +
      'Takılırsan "İkiye Böl". Büyük görünen her şey iki küçük adımın kılık değiştirmiş hâlidir. #odak\n\n' +
      'İlgili: [[Dersler]] · [[Proje: Kişisel Web Sitesi]]',
    c: [
      { t: 'Sabah: telefonsuz ilk 30 dakika', b: '#odak' },
      { t: 'Öğle: yürüyüş, sonra tek görev', b: '#odak' },
    ],
  },
  {
    t: 'Sofia’ya Hoş Geldin',
    collapsed: false,
    b:
      'Burada her şey tek bir şey: düğüm. Not olabilir, göreve dönüşebilir, içine girdiğinde koca bir sayfa olur. ' +
      'Aşağıdakileri dene — hepsi gerçek görev, tikledikçe bu kart kendini tamamlar.',
    c: [
      { t: 'Bir satırı sağa kaydır → içeri al', task: true },
      { t: 'Ana sayfayı aşağı çek → komut paleti', task: true },
      { t: 'Bir notta mercek tuşu → Dış Göz', task: true },
      { t: 'Otopilot’u başlat → tek görev', task: true },
      { t: 'Grafı aç → beynini gör', task: true },
    ],
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
