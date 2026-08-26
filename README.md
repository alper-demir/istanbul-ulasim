# İstanbulum

İstanbul otobüs hatlarını, yön bazlı güzergâhlarını ve duraklarını tek haritada incelemeyi sağlayan web uygulaması.

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
- Canlı araç verisi bulunmadığında açıklayıcı boş durum

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

## Paylaşılabilir bağlantılar

Hat, yön ve isteğe bağlı durak seçimi sorgu parametreleriyle saklanır:

```text
/?route=41ST&direction=return&stop=iett-stop:123456
```

Desteklenen yön değerleri `outbound` ve `return` değerleridir. Tarayıcının geri/ileri hareketleri de seçimi günceller.

## Güzergâh renkleri

Renkler işletmeci tarafından sağlanan resmî hat renkleri değildir. Hat kodundan deterministik olarak seçilen sabit bir palet kullanılır; böylece aynı hat her açılışta aynı renkte görünür. Metrobüs hatları ayrıca turuncu renkle ayrılır.

## Veri kapsamı

Güzergâh ve duraklar statik açık veri çıktılarıdır. Canlı araç konumu henüz bağlı değildir. `public/iett` üretim çıktıları dağıtıma dahil edilmeden yapılan yeni bir kurulumda hat verileri görüntülenmez.

## Sürüm

Güncel MVP sürümü: `0.4.0`

## Sürümleme yaklaşımı

Proje `0.x.y` biçimini kullanır. Küçük düzeltmeler ve sınırlı özellik eklemeleri son haneyi yükseltir (`0.3.1` → `0.3.2`). Daha geniş kullanıcı akışları veya mimari değişiklikler orta haneyi yükseltir (`0.3.x` → `0.4.0`). Her sürüm, Git etiketi ve değişiklik günlüğüyle birlikte kaydedilir.

Ayrıntılar için [CHANGELOG.md](CHANGELOG.md) dosyasına bakın.
