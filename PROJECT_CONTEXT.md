# İstanbulum — Proje Bağlamı ve Yol Haritası

Bu belge, yeni bir geliştirme oturumunda projenin mevcut durumunu hızlıca anlamak için tutulur. Ayrıntılı sürüm geçmişi için `CHANGELOG.md`, kullanım ve kurulum için `README.md` kullanılır.

## Mevcut durum

- Güncel yayımlanmış sürüm: `0.7.0-beta.2`; vapur/raylı ağlar, tarife kataloğu ve canlı araç sağlamlaştırmaları `main` dalında birleşiktir.
- Aktif entegrasyon dalı: `feature/next-transit-experience`; ilk geliştirme dalı `feature/schedule-foundation`.
- Dağıtım: Uygulama canlı ortamda çalışıyor. Yeni özellikler kullanıcı onayı olmadan `main` dalına birleştirilmeyecek veya dağıtılmayacak.
- GitHub: `alper-demir/istanbul-ulasim`. Özellik dalındaki yeni commit ve etiketler, kullanıcı özellikle istemedikçe GitHub’a pushlanmaz.

Uygulama; İstanbul otobüs/metrobüs, metro, tramvay, füniküler, Marmaray ve vapur hatlarını yön bazlı durak/istasyon/iskeleleriyle haritada incelemek için bir keşif aracıdır. Yolculuk planlama, resmî sefer yönetimi veya kesin varış zamanı tahmini değildir.

## Kullanıcıya sunulan özellikler

- 801 resmî hat içinde hat kodu/adı arama ve durak adı/bölgesi arama
- Her hattın başlangıç → bitiş yönleri için ayrı güzergâhı ve durak sırası
- Harita üzerinde güzergâh çizgisi, duraklar, belirgin başlangıç/bitiş işaretleri ve durak odaklama
- Tarayıcı konumuyla veya haritadan elle konum seçerek yakındaki durakları bulma
- Hat ve durak favorileri; son incelenen hat ve duraklar
- Seçili hat/yön/durağı içeren paylaşılabilir bağlantılar
- En fazla üç hattı aynı haritada karşılaştırma ve bunları tek eylemle temizleme
- Açık/koyu tema, masaüstü ve mobil yerleşim
- M1A, M1B, M2–M9 ve M11 için statik güzergâh/istasyon gösterimi; metroda canlı araç sorgusu yok
- T1, T3, T4, T5, F1, F4 ve B1 Marmaray için kaynaklı statik güzergâh/istasyon gösterimi
- 30 Şehir Hatları güzergâhı ve 44 iskele; yayımlanmış İBB deniz hattı vektörleri kullanılır, ancak çizgiler gerçek gemi izi değildir ve canlı gemi konumu yoktur
- 30 vapur hattı için Şehir Hatları kaynaklı, iki yön ve gün türü ayrımlı planlı sefer saatleri; ara iskele ve işaretli sefer notları korunur
- Tümü/Otobüs/Raylı/Vapur filtresi ve hat detayında kaynak bağlantısı/veri tarihi
- Seçili resmî hat için yön bazlı canlı araç konumları; araçtan haritada odaklanma
- Durak detayında, seçili hat/yönde durağa yaklaşan en fazla üç canlı aracı yaklaşık güzergâh mesafesiyle gösterme
- Canlı araçlar ve durakları görsel olarak farklı işaretleme; seçili aracın güçlü harita vurgusu
- Uygulamanın amacı, kaynakları ve veri sınırlarını açıklayan üst çubuktaki “Uygulama hakkında” penceresi
- Etkin tıklanabilir kontrollerde `pointer` imleci

## Veri kaynakları ve sınırlar

| Veri | Kaynak | Uygulamadaki davranış |
| --- | --- | --- |
| Hat, güzergâh, durak | İBB Açık Veri / İETT kaynak çıktıları | Ham kaynak yerelde işlenir; uygulama çalışma anında `public/iett` altındaki küçük JSON dosyalarını okur. Veri tarihi arayüzde gösterilir. |
| Canlı araç konumu | İETT `GetHatOtoKonum_json` servisi | Tarayıcı doğrudan bağlanmaz; sadece seçili hat sunucu rotası üzerinden sorgulanır. Araç olmayabilir, kayıt gecikebilir veya konum sapabilir. |
| Metro hat/istasyon | Metro İstanbul hat sayfaları + OpenStreetMap snapshot | Geliştirme sırasında doğrulanıp `public/metro` altında sürümlü statik çıktıya dönüştürülür; çalışma anında canlı kaynak çağrısı yapılmaz. |
| Tramvay/füniküler | Metro İstanbul + OpenStreetMap | Seçili T1/T3/T4/T5 ve F1/F4 hatları `public/rail` altında statik sunulur. |
| Marmaray | TCDD Taşımacılık/Marmaray + OpenStreetMap | B1 Halkalı–Gebze hattı statiktir; canlı tren konumu sorgulanmaz. |
| Vapur | Şehir Hatları sefer/iskele sayfaları + İBB Açık Veri deniz ulaşım vektörleri | 30 güzergâh `public/ferry`, planlı sefer snapshot'ları `public/schedules` altında statiktir; çalışma anında dış çağrı yapılmaz. Çizgiler gerçek gemi izi değildir. |
| Tarife/bilet limiti | İBB TUHİM İstanbulkart ücret tarifesi + İETT/Şehir Hatları çapraz doğrulaması | `data/fares` altında sürümlü ve statik tutulur; çalışma anında tarife kaynağı sorgulanmaz. Hat bazında doğrulanmamış özel bilet sınıfı kesin bilgi gibi gösterilmez. |
| Altlık haritası | OpenStreetMap | Sadece görsel harita katmanıdır; hat/durak doğruluğu için kaynak değildir. |

Canlı konumlar bilgilendirme amaçlıdır. Güncellik, doğruluk, eksik kayıt ve konum sapması veri sağlayıcılarına bağlıdır; kesin sefer veya varış bilgisi olarak kullanılmamalıdır.

## Canlı veri performans tasarımı

- İstemci yalnız seçili hattı sorgular; sayfa arka plandayken yenileme yapılmaz.
- İstemci 30 saniyede bir kontrol eder; aynı hattın taze sunucu yanıtı varsayılan olarak 30 saniye kullanılır ve `IETT_LIVE_*` ortam ayarlarıyla değiştirilebilir.
- Aynı hat için eşzamanlı istekler tek İETT isteğinde birleştirilir.
- Üst İETT kaynağı için varsayılan küresel süreç bütçesi saatte 360 istektir; üst kaynak yanıtı 1 MB ile sınırlıdır.
- Son başarılı yanıt 10 dakika boyunca geri dönüş verisi olarak tutulur. Bir kaynağın hatası sonrasında aynı hat 15 saniye yeniden zorlanmaz.
- Bellek içi önbellek sınırlıdır; uzun çalışan süreçte büyümesi kontrol edilir.
- Her istemci, canlı araç API’sine dakikada en fazla 12 istek gönderebilir. CDN yanıtı 30 saniye saklamalı, 10 dakikaya kadar eski veriyi hata durumunda sunabilmelidir.

Bu korumalar tek Node/Worker süreci içindir. Çoklu örnekli canlı dağıtım öncesinde ortak edge önbelleği ve kota katmanı kurulmalıdır: Cloudflare Cache/KV + Durable Object veya Redis uygundur. İETT’nin herkese açık, taahhütlü yüksek hacim kotası varsayılmamalıdır.

## Yayın öncesi sağlamlaştırma

- `proxy.ts`, tüm uygulama yanıtlarına CSP, HSTS, no-sniff, frame koruması, referrer ve izin politikası ekler; MapLibre ve OpenStreetMap tile kaynağı CSP’de açıkça tanımlıdır.
- Canlı araç endpointi, IP kimliğine göre sabit pencereli hız limitine sahiptir; Cloudflare’nin `CF-Connecting-IP` başlığı önceliklidir.
- Birim testleri, İETT SOAP/JSON normalizasyonu, güvenlik başlıkları ve hız limiti davranışını kapsar. Kalite kapısı `test`, `typecheck`, `lint`, `build` ve `npm audit` adımlarından oluşur.
- Bağımlılıklar, yayın öncesi bilinen yüksek riskli geliştirme ve React server bileşen açıklarını kapatan sürümlere yükseltildi.
- MapLibre ayrı dinamik pakete taşındı; ana kontrol paneli istemci paketi yaklaşık 1,05 MB’dan 108 KB’a indi.
- Worker paketi hosted asset olarak açıkça tanımlandı; preview’daki 404 nedeniyle boş kalan harita düzeltildi.

## Teknik yapı

- React 19, Next.js API’leri, Vinext/Vite, TypeScript, Tailwind CSS
- Harita: MapLibre GL + OpenStreetMap raster altlığı
- Statik İETT üretim betiği: `scripts/build-iett-static-data.mjs`
- Statik raylı sistem üretimi: `scripts/build-osm-static-network.mjs`
- Statik vapur üretimi: `scripts/build-ferry-static-data.mjs`
- Tarife statik üretimi: `scripts/build-fare-static-data.mjs`
- Canlı İETT adaptörü: `lib/data-sources/iett-live-vehicles.ts`
- Canlı API rotası: `app/api/v1/live-vehicles/route.ts`
- Ana arayüz: `components/transit-dashboard.tsx`

## Sürüm ve Git çalışma biçimi

- Biçim: `0.x.y`; küçük düzeltme/iyileştirmeler son haneyi artırır.
- Yeni kullanıcı özellikleri `feature/*` dallarında geliştirilir; kararlı sürümler `main` dalında tutulur.
- Her sürümde `package.json`, `lib/app-version.ts`, `CHANGELOG.md` ve bu belge güncellenir; ardından yerel Git commit’i ve annotated etiket oluşturulur.
- Kullanıcı istemedikçe `push`, `merge` veya `main`e alma yapılmaz.
- Geri dönüş için etiket örneği: `git switch --detach v0.5.0`. Yeni bir deneme dalı için: `git switch -c deneme v0.5.0`.

## Doğrulama

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

Canlı veri değişikliğinde en az birkaç farklı hat için `/api/v1/live-vehicles?route=HATKODU` yanıtı ve önbellek başlığı kontrol edilir. Harita/arayüz değişikliğinde yerel uygulama tarayıcıda açılarak ilgili akış sınanır.

## Sonraki mantıklı aşamalar

Ayrıntılı kaynak, faz, branch, performans ve kabul kriterleri [NEXT_PHASES_PLAN.md](NEXT_PHASES_PLAN.md) belgesindedir. Önerilen sıra; ortak sefer altyapısı ve Şehir Hatları, İETT planlı kalkışları, keşif/arama deneyimi, raylı sistem tarifeleri, yük artırmayan canlı araç yumuşatma ve son kalite fazıdır.

Ortak sefer sözleşmesi ve lazy-loaded panel `feature/schedule-foundation`, 30 vapur hattının resmî planlı sefer snapshot'ları `feature/ferry-schedules` dalında hazırlanmıştır. İETT planlı kalkışları için resmî `RouteDetail`/`GetScheduledDepartureTimes` uçlarını yalnız bakım anında kullanan ve açık kapsam olmadan toplu istek atmayan üretici `feature/iett-schedules` dalında başlatılmıştır. Sefer ayrıntıları, kullanıcı seçili hattaki `Sefer saatlerini gör` eylemine bastığında modal içinde açılır; manifest ve yalnız o hattın dosyası lazy-load edilir. `feature/discovery-ux` dalı, yerel statik indekslerde Türkçe karakter ve token bazlı arama sıralamasını geliştirir; canlı veri isteği eklemez.

Trafik ve teleferik kapsam dışıdır. Raylı/vapur canlı konumu yalnız ücretsiz, resmî ve sürdürülebilir bir kaynak doğrulanırsa ayrı spike ile değerlendirilir.
