/**
 * Observer — deterministic defamiliarisation. No model, no network: a small,
 * conservative set of Turkish morphology rules re-voices first person as a
 * third-person case summary, and a lexicon of rumination markers surfaces the
 * patterns a detached strategist would notice. When a rule is not confident it
 * leaves the word alone — a wrong transform breaks the spell worse than none.
 */

/** Unicode-aware word boundary — JS `\b` is ASCII-only and breaks on ç, ğ, ı, ö, ş, ü. */
const WB = '(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))';
function U(re: RegExp): RegExp {
  return new RegExp(re.source.replace(/\\b/g, WB), re.flags.includes('u') ? re.flags : re.flags + 'u');
}

export interface Pattern {
  key: 'oscillation' | 'catastrophe' | 'social' | 'deadline' | 'obligation' | 'absolute' | 'feeling' | 'stall';
  label: string;
  note: string;
  hits: string[];
}

export interface CaseFile {
  number: string;
  summary: string;
  pullQuote: string | null;
  patterns: Pattern[];
  words: number;
  sentences: number;
  /** 0–100: share of sentences carrying uncertainty/feeling markers vs. facts. */
  fog: number;
}

const PRONOUNS: [RegExp, string][] = [
  [U(/\bben\b/giu), 'o'],
  [U(/\bbenim\b/giu), 'onun'],
  [U(/\bbana\b/giu), 'ona'],
  [U(/\bbeni\b/giu), 'onu'],
  [U(/\bbende\b/giu), 'onda'],
  [U(/\bbenden\b/giu), 'ondan'],
  [U(/\bkendim\b/giu), 'kendisi'],
  [U(/\bkendimi\b/giu), 'kendini'],
  [U(/\bkendime\b/giu), 'kendine'],
];

// High-frequency 1sg possessives of the inner world → 3sg.
const POSSESSIVE: Record<string, string> = {
  kafam: 'kafası', kafamda: 'kafasında', kafamı: 'kafasını', aklım: 'aklı', aklımda: 'aklında', aklımı: 'aklını',
  içimde: 'içinde', içim: 'içi', canım: 'canı', hayatım: 'hayatı', hayatımı: 'hayatını', ailem: 'ailesi', ailemi: 'ailesini',
  annem: 'annesi', babam: 'babası', arkadaşlarım: 'arkadaşları', hocam: 'hocası', işim: 'işi', işimi: 'işini',
  planım: 'planı', kararım: 'kararı', kararımı: 'kararını', zamanım: 'zamanı', enerjim: 'enerjisi', gücüm: 'gücü',
};

// Verb person endings, 1sg → 3sg. Applied longest-first below.
const YOR = U(/(\p{L}{2,}?)(ı|i|u|ü)?yorum\b/gu);
const FUT = U(/(\p{L}{2,}?)(acağım|eceğim)\b/gu);
const COND = U(/(\p{L}{3,}?)(sam|sem)\b/gu);
const NEG_AOR = U(/(\p{L}{2,}?)(amam|emem)\b/gu);
const NEC = U(/(\p{L}{2,}?)(malıyım|meliyim)\b/gu);
const PAST = U(/(\p{L}{2,}?)(dım|dim|dum|düm|tım|tim|tum|tüm)\b/gu);
const MISTIM = U(/(\p{L}{2,}?)(mıştım|miştim|muştum|müştüm)\b/gu);
const INF_LAZIM = U(/(\p{L}{2,}?)(mam|mem) (lazım|gerek|gerekiyor)\b/gu);

const STOP_PAST = new Set(['adım', 'kadım', 'odum', 'tadım', 'yardım', 'kendim', 'sadım', 'katım', 'artım', 'satım']);

function keepCase(src: string, out: string): string {
  return src[0] === src[0].toLocaleUpperCase('tr-TR') ? out[0].toLocaleUpperCase('tr-TR') + out.slice(1) : out;
}

/** First person → third person, conservatively. "Özne" names the subject once. */
export function toThirdPerson(text: string): string {
  let s = text;
  s = s.replace(INF_LAZIM, (_m, stem: string, suf: string, w: string) => `${stem}${suf === 'mam' ? 'ması' : 'mesi'} ${w}`);
  s = s.replace(NEC, (_m, stem: string, suf: string) => stem + (suf === 'malıyım' ? 'malı' : 'meli'));
  s = s.replace(FUT, (_m, stem: string, suf: string) => stem + (suf === 'acağım' ? 'acak' : 'ecek'));
  s = s.replace(MISTIM, (_m, stem: string, suf: string) => stem + suf.slice(0, -1));
  s = s.replace(YOR, (_m, stem: string, v?: string) => `${stem}${v ?? ''}yor`);
  s = s.replace(NEG_AOR, (_m, stem: string, suf: string) => stem + (suf === 'amam' ? 'amaz' : 'emez'));
  s = s.replace(COND, (m, stem: string, suf: string) => (/(m[ae]z|[ae]r|[ıiuü]r|d[ıiuü]|t[ıiuü])$/.test(stem) || /[^aeıioöuü]$/.test(stem) ? stem + suf[0] + suf[1] : m));
  s = s.replace(PAST, (m, stem: string, suf: string) => (STOP_PAST.has(m.toLocaleLowerCase('tr-TR')) ? m : stem + suf.slice(0, 2)));
  s = s.replace(/\p{L}+/gu, (w) => {
    const to = POSSESSIVE[w.toLocaleLowerCase('tr-TR')];
    return to ? keepCase(w, to) : w;
  });
  let named = false;
  // The first "ben" names the subject; later ones become plain "o".
  s = s.replace(U(/\bben\b/giu), (m) => {
    if (named) return keepCase(m, 'o');
    named = true;
    return 'Özne';
  });
  for (const [re, to] of PRONOUNS) s = s.replace(re, (m) => keepCase(m, to));
  s = s.replace(U(/\b(o|Özne) (\p{L}+?)(ım|im|um|üm|yım|yim|yum|yüm)\b/gu), (_m, o: string, adj: string) => `${o} ${adj}`);
  return s;
}

const LEX: { key: Pattern['key']; label: string; note: string; re: RegExp }[] = [
  { key: 'oscillation', label: 'Salınım', note: 'İki seçenek arasında gidip geliyor; her “ama” bir öncekini iptal ediyor.', re: U(/\b(ama|fakat|ancak|öte yandan|bir yandan|yine de)\b/giu) },
  { key: 'catastrophe', label: 'Felaketleştirme', note: 'Olası kayıp, kesinleşmiş gibi anlatılıyor.', re: U(/\b\p{L}*(kaybed|kaldıramam|mahvol|bitti|asla|berbat|rezil|batır)\p{L}*/giu) },
  { key: 'social', label: 'Toplumsal kanıt', note: 'Karar ölçütü başkalarının görüşüne devredilmiş.', re: U(/\b(herkes|kimse|insanlar|millet|ailem|arkadaşlarım|hocam)\b/giu) },
  { key: 'deadline', label: 'Zaman baskısı', note: 'Somut bir son tarih var — bu iyi: belirsizlik değil, takvim sorunu.', re: U(/\b(bugün|yarın|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|bu hafta|haftaya|\d{1,2}[./]\d{1,2})\b/giu) },
  { key: 'obligation', label: 'Zorunluluk dili', note: '“Lazım/gerek/-meli” — seçim, görev kılığına girmiş.', re: U(/\b(\p{L}+(malıyım|meliyim|malı|meli)|lazım|gerek(iyor)?|zorundayım|şart)\b/giu) },
  { key: 'absolute', label: 'Ya hep ya hiç', note: 'Mutlak kelimeler ara seçenekleri görünmez kılıyor.', re: U(/\b(hiç|her zaman|hep|asla|hiçbir|tamamen|bir daha)\b/giu) },
  { key: 'feeling', label: 'His → olgu', note: 'Duygu, gerçeklik raporu gibi sunuluyor.', re: U(/\b(hissediyorum|korkuyorum|endişe\p{L}*|yorgunum|bunaldım|gibi geliyor|sanki)\b/giu) },
  { key: 'stall', label: 'Donma', note: 'Eylemsizlik bizzat yazılmış — ilk adım küçültülmeli.', re: U(/\b(bekliyorum|hiçbir şey yapma\p{L}*|erteliyorum|takıldım|başlayamıyorum|dönüp duruyor)\b/giu) },
];

export function caseNumber(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return String((h >>> 0) % 9000 + 1000);
}

export function analyse(id: string, title: string, body: string): CaseFile {
  const text = body.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_a, t: string, al: string) => al || t).replace(/#[\p{L}\p{N}_/-]+/gu, '').trim();
  const sentences = text.split(/(?<=[.!?…])\s+/u).map((s) => s.trim()).filter((s) => s.length > 1);
  const patterns: Pattern[] = [];
  for (const l of LEX) {
    const hits = [...text.matchAll(l.re)].map((m) => m[0].toLocaleLowerCase('tr-TR'));
    if (hits.length) patterns.push({ key: l.key, label: l.label, note: l.note, hits: [...new Set(hits)] });
  }
  const foggy = sentences.filter((s) => LEX.some((l) => (l.key === 'feeling' || l.key === 'catastrophe' || l.key === 'oscillation') && new RegExp(l.re.source, 'iu').test(s)));
  const fog = sentences.length ? Math.round((foggy.length / sentences.length) * 100) : 0;
  const quoteSrc = foggy.sort((a, b) => b.length - a.length)[0] ?? null;
  const pull = quoteSrc && quoteSrc.length < 220 ? toThirdPerson(quoteSrc) : null;
  void title;
  return {
    number: caseNumber(id),
    summary: toThirdPerson(sentences.slice(0, 12).join(' ')),
    pullQuote: pull,
    patterns,
    words: text.split(/\s+/).filter(Boolean).length,
    sentences: sentences.length,
    fog,
  };
}
