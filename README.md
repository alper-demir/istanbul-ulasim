# İstanbulum

İstanbul otobüs, metrobüs ve metro hatlarını; yön bazlı güzergâhlarıyla durak/istasyonlarını tek haritada incelemeyi sağlayan web uygulaması.

## MVP özellikleri

- İETT hat kodu, hat adı, durak adı veya durak bölgesine göre arama
- Gidiş ve dönüş yönleri için ayrı güzergâh çizgileri ve durak sıraları
- Harita üzerindeki durakları seçme, durağa ve tüm güzergâha odaklanma
- Durak adı, bölgesi, güzergâhtaki sırası ve koordinat bilgileri
- Seçilen duraktan geçen hatları görme ve ilgili hat/yöne geçme
- Konum izniyle en yakın 12 durağı mesafe sırasıyla gösterme
- Tarayıcının bildirdiği yaklaşık konum doğruluğunu gösterme
- Tarayıcı konumu hatalıysa haritadan elle konum seçme
- Haritadan seçilen konumu isteğe bağlı olarak bu cihazda hatırlama
- Hat ve durakları tarayıcıda favorilere kaydetme; son bakılanlara hızlı dönüş
- Seçilen hat, yön ve durağı URL üzerinden paylaşma
- Güzergâh başlangıç/bitiş işaretleri ve en fazla üç hatla harita karşılaştırması
- Açık/koyu tema ve mobil uyumlu arayüz
- Seçili hattın yön bazlı canlı araç konumları ve açıklayıcı hata/boş durumları
- M1A, M1B, M2–M9 ve M11 için statik metro güzergâhı ve istasyonları

## Teknoloji

- React 19 ve Next.js 16 API'leri
- Vinext / Vite
- TypeScript ve Tailwind CSS
- MapLibre GL ve OpenStreetMap

## Yerel geliştirme

Node.js 22.13 veya daha yeni bir sürüm gereklidir.

```bash
npm install
npm run dev
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde açılır.

Kalite kontrolleri:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Veri üretimi

Uygulama, çalışma zamanında `public/iett` altındaki statik JSON dosyalarını okur. Bu dosyalar kaynak veri büyüklüğü nedeniyle repoya eklenmez ve aşağıdaki yerel dosyalardan üretilir:

- `data/iett-hat-guzergahlari.geojson`
- `data/routes.txt` veya `data/routes.csv`
- `data/trips.txt` veya `data/trips.csv`
- `data/stops.txt` veya `data/stops.csv`
- `data/stop_times.txt` veya `data/stop_times.csv`

Kaynaklar yerleştirildikten sonra:

```bash
npm run data:build-iett
```

`stop_times` verisi Excel satır sınırına takılabildiği için mümkünse portalın özgün `stop_times.txt` dosyası kullanılmalıdır. Üretim betiği eksik sefer kapsamını kontrol eder ve hatalı veriyle devam etmez.

Betik, hat detaylarına ek olarak birleşik aramada kullanılan `stop-index.json` dosyasını da üretir. Bu ters indeks her durağı, o duraktan geçen hat ve yönlerle ilişkilendirir; uygulama böylece yüzlerce hat dosyasını ayrı ayrı indirmeden durak arayabilir.

### Metro verisi

Metro hatları çalışma zamanında dış kaynağa bağlanmaz. `data/metro/lines.json` içindeki resmî hat manifesti ve OpenStreetMap ilişki snapshot’ı kullanılarak küçük statik JSON dosyaları üretilir:

```bash
npm run data:build-metro
```

Çıktılar `public/metro` altında tutulur. Kaynak, lisans ve veri üretim zamanı her JSON’un metadata alanında yer alır. Metro için canlı araç verisi sorgulanmaz. Aynı statik katalog yaklaşımı ileride vapur ve minibüs ağları için de kullanılacaktır.

## Paylaşılabilir bağlantılar

Hat, yön ve isteğe bağlı durak seçimi sorgu parametreleriyle saklanır:

```text
/?route=41ST&direction=return&stop=iett-stop:123456
```

Desteklenen yön değerleri `outbound` ve `return` değerleridir. Tarayıcının geri/ileri hareketleri de seçimi günceller.

## Güzergâh renkleri

Renkler işletmeci tarafından sağlanan resmî hat renkleri değildir. Hat kodundan deterministik olarak seçilen sabit bir palet kullanılır; böylece aynı hat her açılışta aynı renkte görünür. Metrobüs hatları ayrıca turuncu renkle ayrılır.

## Veri kapsamı

Güzergâh ve duraklar statik açık veri çıktılarıdır. Seçili resmî hattın canlı araçları, hat kodundan bağımsız olarak İETT `GetHatOtoKonum_json` servisi üzerinden sunucu tarafında alınır; tarayıcı kaynak servise doğrudan bağlanmaz. Statik ağdaki 801 hat kodunun tamamı canlı sorgu doğrulamasından geçer. Bununla birlikte servis, o anda aktif aracı veya konum kaydı bulunmayan bir hat için boş liste döndürebilir. Uygulama yalnız seçili hattı sorgular, yanıtları kısa süre önbelleğe alır ve canlı kaynak kesilse bile statik güzergâh/durak deneyimini korur. `public/iett` üretim çıktıları dağıtıma dahil edilmeden yapılan yeni bir kurulumda hat verileri görüntülenmez.

Canlı veri katmanı aynı hat için eşzamanlı istekleri birleştirir; böylece aynı hattı inceleyen kullanıcılar tek upstream çağrısını paylaşır. Taze yanıtlar varsayılan olarak 45 saniye, son geçerli yanıtlar en fazla 10 dakika saklanır. Üst kaynağın yayımlanmış kotası olmadığı için uygulama varsayılan olarak saatte en fazla 360 kaynak isteği yapar; limit, kaynak sağlığı ölçüldükten sonra hosting ortamından değiştirilebilir. Başarısız kaynak 15 saniye boyunca tekrar zorlanmaz ve 1 MB’ı aşan yanıtlar işlenmez. Canlı API, kullanıcı başına dakikada 12 istekle sınırlıdır; CDN yanıtı 30 saniye saklayarak farklı Worker örneklerinden gelen aynı hat isteklerini birleştirmelidir.

## Canlıya çıkış kontrol listesi

1. Hosting ortamında `NEXT_PUBLIC_SITE_URL` gerçek HTTPS adresiyle ayarlanır; İETT kimlik bilgileri varsa yalnızca hosting secret olarak eklenir.
2. `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` ve bağımlılık taraması temiz geçer.
3. Preview URL’de `/api/v1/health` 200 döndürür; temel harita, arama, mobil görünüm ve canlı kaynak kesintisi akışları sınanır.
4. Cloudflare CDN’de canlı araç endpointi için `s-maxage=30` ve `stale-if-error=600` davranışı doğrulanır; ilk haftada kaynak hata oranı ve üst kaynak isteği izlenir.
5. Özel bir alan adı kullanılacaksa HTTPS etkinleştirilir. Uygulamanın gönderdiği CSP, HSTS, tıklama çerçevesi ve izin politikası başlıkları HTTP yanıtından kontrol edilir.

Uygulama ücretsiz Cloudflare Workers/CDN kotası içinde küçük bir kamu demosu için tasarlanmıştır. İETT kaynağının resmî yüksek hacim sözleşmesi olmadan saatlik kaynak bütçesi yükseltilmemelidir.

Durak detay kartı, seçili hat ve yöndeki canlı araçları yön geometrisi üzerine izdüşürür; durağı henüz geçmemiş en yakın üç aracı yaklaşık güzergâh mesafesine göre sıralar. Bu değer bir varış süresi tahmini değildir. Başka hatlar otomatik olarak sorgulanmaz; duraktan geçen başka bir hat seçildiğinde canlı sorgu o hatta geçirilir.

## Sürüm

Yayın adayı: `0.6.0-rc.1`

Canlı araçlar ve performans iyileştirmeleri `main` dalına birleştirildi.

## Sürümleme yaklaşımı

Proje `0.x.y` biçimini kullanır. Küçük düzeltmeler ve sınırlı özellik eklemeleri son haneyi yükseltir (`0.3.1` → `0.3.2`). Daha geniş kullanıcı akışları veya mimari değişiklikler orta haneyi yükseltir (`0.3.x` → `0.4.0`). Her sürüm, Git etiketi ve değişiklik günlüğüyle birlikte kaydedilir.

Kararlı sürüm `main` dalında tutulur. Yeni kullanıcı özellikleri `feature/*` dallarında geliştirilir; beta sürüm doğrulandıktan sonra `main`e birleştirilir ve kararlı sürüm etiketi oluşturulur.

Ayrıntılar için [CHANGELOG.md](CHANGELOG.md) dosyasına bakın.

Yeni bir geliştirme oturumunda mevcut özellikler, mimari kararlar ve sonraki adımlar için [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) belgesine bakın.
