<p align="center">
  <img src="assets/icon.png" width="104" alt="Sofia Cortex" />
</p>

<h1 align="center">Sofia Cortex</h1>

<p align="center">
  Apple Notlar sadeliğinde bir not ve görev uygulaması.<br/>
  Yaz, biçimlendir, içine gir, böl, tikle — ve iş yapma zamanı geldiğinde tek bir şeye odaklan.
</p>

<p align="center">
  <img src="assets/screenshots/01-home-light.png" width="24%" />
  <img src="assets/screenshots/03-note.png" width="24%" />
  <img src="assets/screenshots/13-format-panel.png" width="24%" />
  <img src="assets/screenshots/14-table.png" width="24%" />
</p>

---

## Fikir

Her şey bir not. Bir not görev olabilir; içine girdiğinde kendi sayfası olur, içine yeni notlar ve
görevler eklersin — derinlik sınırsız. Alt görevlerin hepsi bitince üstteki görev kendiliğinden
tiklenir; biri geri açılırsa o da açılır.

İki küçük alışkanlık işi kolaylaştırır:

- **Dış Göz** — notunu, bir kitap sayfası gibi dizilmiş hâlde, başkasının yazısını okur gibi
  okursun. Altında tek bir soru: *“Şu an atılabilecek en küçük, somut adım ne?”* Yazdığın her adım
  o notun altına görev olarak eklenir.
- **Otopilot** — ekranda yalnızca sıradaki tek görev kalır. *Tamamlandı*'ya basarsın, sıradaki
  kendiliğinden gelir. Büyük geldiyse *İkiye böl*.

Yapay zekâ yok, hesap yok, sunucu yok. Her şey telefonda, SQLite'ta.

## Ekranlar

<table>
<tr>
<td width="33%"><img src="assets/screenshots/01-home-light.png"/><br/><sub><b>Ana sayfa.</b> Sabitlenenler, Bugün, Önceki 7 Gün… kutucuklar halinde. Her satırda başlık, görev sayacı, saat ve içinden bir önizleme. Altta arama ve yeni not kalemi.</sub></td>
<td width="33%"><img src="assets/screenshots/02-home-dark.png"/><br/><sub><b>Koyu tema.</b> Saf siyah zemin, #1C1C1E kutucuklar. Sağ üstteki ay/güneş; basılı tutunca Ayarlar.</sub></td>
<td width="33%"><img src="assets/screenshots/03-note.png"/><br/><sub><b>Not.</b> Düz satırların yanında hiçbir işaret yok; yalnızca görevlerde daire, listelerde madde/numara.</sub></td>
</tr>
<tr>
<td><img src="assets/screenshots/04-keyboard.png"/><br/><sub><b>Yazarken.</b> Klavyenin üstünde kaydırılabilir araçlar: Aa · ☑ · • · 1. · ⊞ · İçeri al · Dışarı çık · Bağla, sağda sabit Bitti.</sub></td>
<td><img src="assets/screenshots/13-format-panel.png"/><br/><sub><b>Aa.</b> Başlık, Alt Başlık, Büyük Gövde, Normal Metin, Kod; Modern / Klasik / Yuvarlak / Daktilo; B I U S ve dört renk vurgu kalemi.</sub></td>
<td><img src="assets/screenshots/14-table.png"/><br/><sub><b>Tablo.</b> ⊞ ile eklenir; hücreler yerinde yazılır, ＋ ile satır/sütun eklenir, odaktayken satır/sütun/tablo silinir.</sub></td>
</tr>
<tr>
<td><img src="assets/screenshots/05-observer.png"/><br/><sub><b>Dış Göz.</b> Kendi notun, dokunulmadan, kitap sayfası gibi. Altında tek soru ve eylem adımları.</sub></td>
<td><img src="assets/screenshots/06-autopilot.png"/><br/><sub><b>Otopilot.</b> Tek görev. Tamamlandı · İkiye böl · Atla.</sub></td>
<td><img src="assets/screenshots/07-graph.png"/><br/><sub><b>Graf.</b> Notlar ve aralarındaki bağlantılar. Dengeye oturunca fizik durur.</sub></td>
</tr>
<tr>
<td><img src="assets/screenshots/08-menu-dark.png"/><br/><sub><b>••• menüsü.</b> Sabitle, taşı, hatırlatıcı, görev/not, planı kilitle. Numaralı liste kendini sayar.</sub></td>
<td><img src="assets/screenshots/09-search-dark.png"/><br/><sub><b>Arama.</b> Aksan-duyarsız: “tur” yazınca “Türev” de bulunur.</sub></td>
<td></td>
</tr>
</table>

## Kullanım

| | |
|---|---|
| Yeni not | Ana sayfanın sağ altındaki kalem. Başlık yazılmaya hazır gelir; Return gövdeye geçer. Boş bırakılan not kendiliğinden silinir. |
| Görev | Klavye çubuğunda ☑. Daire yalnızca o zaman çıkar; tekrar ☑ dersen tamamen kaybolur ve satır düz metne döner. |
| Liste | • (madde) ve 1. (numaralı). Return aynı türden yeni satır açar. |
| Biçim | Aa: paragraf stili, yazı tipi, kalın/italik/altı çizili/üstü çizili, vurgu kalemi. Biçim tüm satıra uygulanır. |
| Tablo | ⊞. Hücreye dokun, yaz; sağdaki ＋ sütun, alttaki ＋ satır ekler. |
| İçeri / dışarı | Satırı sağa kaydır ya da ↳: içeri al. **Boş satırda Return** veya **satır başında ⌫**: bir dış seviyeye çık. Sola kısa kaydırma ya da ↰ da dışarı alır. |
| Silmek | Satırı sola uzun kaydır ya da üst bardaki çöp kutusu. Hemen çıkan *Geri al* ile tek dokunuşla geri gelir. |
| Bağlantı | Klavye çubuğunda *Bağla* ya da `&` yaz: `&Fizik&`. Böyle bir not varsa bağlantıdır, yoksa etiket olur. |
| Sabitlemek, taşımak, hatırlatıcı | Notun üst barındaki •••. Hatırlatıcı istenirse bildirime dokununca doğrudan Otopilot'ta açılır. |
| Planı kilitlemek | ••• → Planı kilitle. Görevler bitene kadar sıralama ve yapı değişmez, sadece tiklenir (biçim serbest). |

## Mimari

```
Expo SDK 58 · React Native 0.88 (New Architecture) · TypeScript strict
expo-sqlite (WAL + FTS5) · @shopify/react-native-skia (graf) · San Francisco (sistem fontu)
Reanimated 4 · Gesture Handler 3 · react-native-keyboard-controller
```

Motor (`src/engine`) saf TypeScript'tir; React ya da Expo içermez, depolamaya dört metotluk bir
arayüzle erişir — telefonda expo-sqlite, testlerde `bun:sqlite`. SQLite asıl kaynaktır; ekranlar her
şeyi bellekteki bir kopyadan senkron okur, bu yüzden hiçbir kare diski beklemez. Her değişiklik tek
bir işlem olarak kaydedilir; geri al / yinele bu sayede tek adımdır.

Ayrıntılar: [`ARCHITECTURE.md`](ARCHITECTURE.md) · çalışma kuralları: [`CLAUDE.md`](CLAUDE.md) ·
tasarım yönü: [`docs/design-direction.md`](docs/design-direction.md)

**Ölçülen performans (10 000 not):** açılışta yükleme ~15 ms · tikleme ve yukarı yayılma ~0.07 ms ·
arama ~0.9 ms · graf fizik adımı ~6 ms. `bun test` → 115 test.

## Kurulum

Gereksinimler: macOS, Xcode, Node ≥ 20, CocoaPods, [bun](https://bun.sh) (testler için).

```bash
git clone https://github.com/cleoanka/sofia-cortex.git
cd sofia-cortex
npm install
bun test
npx expo run:ios                     # simülatör
```

### iPhone'a kurmak

1. iPhone'u USB ile bağla, *Bu bilgisayara güven* de; **Ayarlar → Gizlilik ve Güvenlik →
   Geliştirici Modu**'nu aç.
2. `app.json` → `expo.ios.appleTeamId` alanına kendi Team ID'ni yaz, `bundleIdentifier`'ı benzersiz
   yap. Ücretsiz Apple hesabı da olur: uygulama yalnızca yerel bildirim kullanır ve
   `plugins/withLocalNotificationsOnly.js` push yetkisini kaldırır.
3. Derle ve kur:
   ```bash
   npx expo prebuild --platform ios
   cd ios && xcodebuild -workspace SofiaCortex.xcworkspace -scheme SofiaCortex \
     -configuration Release -destination "id=<UDID>" -allowProvisioningUpdates build
   xcrun devicectl device install app --device <UDID> build/Build/Products/Release-iphoneos/SofiaCortex.app
   ```
4. İlk açılışta **Ayarlar → Genel → VPN ve Cihaz Yönetimi** altında geliştirici sertifikana güven.

## Nasıl yapıldı

Claude Opus 5.5 uygulamayı yazdı ve her ekranı simülatörde (gerçek ekran klavyesiyle) ekran
görüntüsüyle kontrol etti. `agy` üzerinden **Gemini 4 Argon** her büyük değişikliği hata avı için
inceledi (bulduğu sorunlar düzeltildi), fizik motorunu, bir mimari/performans incelemesini
([`docs/design-review-2026-11-01.md`](docs/design-review-2026-11-01.md)) ve sade tasarım yönünü
([`docs/design-direction.md`](docs/design-direction.md)) üretti; **Gemini 3.8 Flash** sınır durumu ve
biçim/tablo testlerini yazdı.

## Lisans

MIT
