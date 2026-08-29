# İstanbulum — Proje Bağlamı ve Yol Haritası

Bu belge, yeni bir geliştirme oturumunda projenin mevcut durumunu hızlıca anlamak için tutulur. Ayrıntılı sürüm geçmişi için `CHANGELOG.md`, kullanım ve kurulum için `README.md` kullanılır.

## Mevcut durum

- Çalışma dalı: `main`
- Kararlı sürüm: `0.5.0`
- Canlı araç özellikleri ve performans iyileştirmeleri `feature/live-vehicles` dalında geliştirilip bu sürümde `main`e birleştirildi.
- Dağıtım: Henüz yapılmadı. Yerel uygulama `http://localhost:3000` üzerinden çalışır.
- GitHub: `alper-demir/istanbul-ulasim`. Özellik dalındaki yeni commit ve etiketler, kullanıcı özellikle istemedikçe GitHub’a pushlanmaz.

Uygulama, İstanbul otobüs/metrobüs ve metro hatlarını, yön bazlı durak/istasyonlarıyla haritada incelemek için bir keşif aracıdır. Yolculuk planlama, resmî sefer yönetimi veya kesin varış zamanı tahmini değildir.

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
| Altlık haritası | OpenStreetMap | Sadece görsel harita katmanıdır; hat/durak doğruluğu için kaynak değildir. |

Canlı konumlar bilgilendirme amaçlıdır. Güncellik, doğruluk, eksik kayıt ve konum sapması veri sağlayıcılarına bağlıdır; kesin sefer veya varış bilgisi olarak kullanılmamalıdır.

## Canlı veri performans tasarımı

- İstemci yalnız seçili hattı sorgular; sayfa arka plandayken yenileme yapılmaz.
- İstemci 30 saniyede bir kontrol eder; aynı hattın taze sunucu yanıtı 60 saniye kullanılır.
- Aynı hat için eşzamanlı istekler tek İETT isteğinde birleştirilir.
- Farklı hat istekleri, en fazla iki eşzamanlı istek ve istekler arasında kısa aralıkla çalışan süreç içi bir kuyruğa alınır.
- Son başarılı yanıt 10 dakika boyunca geri dönüş verisi olarak tutulur. Bir kaynağın hatası sonrasında aynı hat 15 saniye yeniden zorlanmaz.
- Bellek içi önbellek sınırlıdır; uzun çalışan süreçte büyümesi kontrol edilir.

Bu korumalar tek Node/Worker süreci içindir. Çoklu örnekli canlı dağıtım öncesinde ortak edge önbelleği ve kota katmanı kurulmalıdır: Cloudflare Cache/KV + Durable Object veya Redis uygundur. İETT’nin herkese açık, taahhütlü yüksek hacim kotası varsayılmamalıdır.

## Teknik yapı

- React 19, Next.js API’leri, Vinext/Vite, TypeScript, Tailwind CSS
- Harita: MapLibre GL + OpenStreetMap raster altlığı
- Statik İETT üretim betiği: `scripts/build-iett-static-data.mjs`
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
```

Canlı veri değişikliğinde en az birkaç farklı hat için `/api/v1/live-vehicles?route=HATKODU` yanıtı ve önbellek başlığı kontrol edilir. Harita/arayüz değişikliğinde yerel uygulama tarayıcıda açılarak ilgili akış sınanır.

## Sonraki mantıklı aşamalar

1. **Canlı dağıtım altyapısı:** Cloudflare üzerinde ortak cache/KV, küresel hız limiti, kuyruk/yeniden deneme görünürlüğü ve hata metrikleri.
2. **İETT servis anlaşması:** Yayımlanmış kota yoksa İETT’den yüksek hacimli erişim koşulu veya resmî API anahtarı hakkında bilgi alma.
3. **Dağıtım hattı:** `main`e birleşince otomatik Cloudflare deploy, önizleme dağıtımları ve temel sağlık kontrolü.
4. **Veri yenileme süreci:** Statik İBB/GTFS kaynaklarını düzenli indirip doğrulayan ve yeni veri tarihini yayımlayan kontrollü iş akışı.
5. **Gözlemlenebilirlik:** Canlı kaynak gecikmesi, kuyruk uzunluğu, önbellek isabet oranı, hata oranı ve kaynak son güncelleme yaşını ölçme.
6. **Ürün iyileştirmeleri:** Erişilebilirlik denetimi, klavye gezinimi, küçük ekranlarda kapsamlı kullanım testi ve kullanıcı geri bildirimi sonrası önceliklendirme.

Sıradaki özellik başlamadan önce bu listedeki madde, kullanıcı önceliği ve veri kaynağının izin/kota durumu birlikte değerlendirilmelidir.
