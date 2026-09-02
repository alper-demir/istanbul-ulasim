# İstanbulum

İstanbul otobüs, metrobüs, metro, tramvay, füniküler, Marmaray ve Şehir Hatları vapur hatlarını yön bazlı güzergâhlarıyla tek haritada incelemeyi sağlayan web uygulaması.

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
- T1, T3, T4, T5 tramvay; F1, F4 füniküler ve B1 Marmaray için statik güzergâh/istasyonlar
- Şehir Hatları iç hat, Boğaz ve Adalar güzergâhları için statik iskele sıraları
- Otobüs, raylı sistem ve vapur için sade ulaşım türü filtresi
- Hat detayında kaynak bağlantısı, veri tarihi ve canlı/statik veri sınırı

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

Çıktılar `public/metro` altında tutulur. Kaynak, lisans ve veri üretim zamanı her JSON’un metadata alanında yer alır. Metro için canlı araç verisi sorgulanmaz.

### Tramvay, füniküler ve Marmaray

`data/rail/lines.json` kapsamı bilinçli olarak T1, T3, T4, T5, F1, F4 ve B1 ile sınırlar. Metro İstanbul/TCDD doğrulaması ve OpenStreetMap geometrileri build sırasında statik çıktıya çevrilir:

```bash
npm run data:build-rail
```

Çıktılar `public/rail` altında tutulur. Teleferik kapsam dışıdır ve bu ağlarda canlı araç konumu sorgulanmaz.

### Şehir Hatları vapur verisi

Şehir Hatları'nın iç hat, Boğaz ve Adalar sefer sayfalarındaki hat/iskele sıraları ile resmî iskele sayfalarındaki koordinatlar statik kataloğa dönüştürülür:

```bash
npm run data:build-ferry
```

Çıktılar `public/ferry` altında tutulur. Uygulama yalnız iskele sırası doğrulanan ve İBB Açık Veri'deki yayımlanmış deniz hattı vektörüyle eşleşen rotaları sunar. Çizgiler gerçek gemi izi değildir; canlı vapur konumu henüz kullanılmaz.

Aynı üretim komutu, yayımlanan vapur rotalarının Şehir Hatları sayfalarındaki sefer tablolarını da `public/schedules/routes` altında statik snapshot'a dönüştürür. İki yön, hafta içi/Cumartesi/Pazar-tatil gün türleri, ara iskele saatleri, `*` işaretleri ve resmî açıklamalar korunur. Kaynak tablosunda hattın ilk iskelesi boş olan kısmi seferler, gerçekten hareket ettikleri ilk iskeleyle gösterilir.

Şehir Hatları sayfaları güncel tabloları yayımlamakla birlikte her sayfada açık bir başlangıç/bitiş geçerlilik aralığı vermediğinden arayüz alınma tarihini gösterir ve kaynağı kontrol etme uyarısını korur. Uygulama çalışırken Şehir Hatları'na istek göndermez.

### İstanbulkart tarife verisi

Tarife verisi uygulama çalışma anında dış kaynaktan çekilmez. [İBB TUHİM İstanbulkart ücret tarifesi](https://tuhim.ibb.gov.tr/media/27491/%C4%B0stanbulkart.pdf) kontrollü olarak `data/fares/istanbulkart-2026-07-20.json` dosyasına dönüştürülür; kaynak, karar, geçerlilik ve doğrulama tarihleri veriyle birlikte taşınır:

```bash
npm run data:build-fares
```

Çıktı `public/fares/current.json` altında yayımlanır. Genel tarife, Metrobüs/Marmaray/M11 mesafe bantları ve desteklenen vapur profilleri ayrı tutulur. İETT hatlarında resmî hat detayı hangi tarife sınıfını bildiriyorsa yalnız o sınıf gösterilir; kaynak sınıf döndürmeyen hatta genel ücret varsayılmaz.

İETT hat tarifeleri için `npm run data:audit-iett-fares` komutu, tüm statik İETT hatlarının resmî hat detayındaki tarife sınıfını tek seferlik snapshot olarak `data/fares/snapshots/iett-route-tariffs.json` dosyasına alır. Bu bakım işlemi uygulama çalışırken tetiklenmez. Sınıf kuralları `data/fares/iett-route-tariff-rules.json` içinde sürümlenmiştir; yeni veya eşleştirilmemiş bir resmî sınıf, tarife çıktısı üretilirken hata verir.

Hat detayındaki ücret kartı başlangıçta yalnız kısa tarife özetini gösterir. Kullanıcı `Tarifeyi gör` seçeneğini açtığında kart türlerine göre tutarlar veya mesafe bantları, abonman/sınırlı bilet limiti, kaynak bağlantısı ve geçerlilik tarihi görünür. Karttaki bilgi simgeleri, resmî tarifedeki `İndirimli 2` ve `30+ İndirimli Öğrenci` gruplarını açıklar. Bu bilgi kesin yolculuk ücreti hesaplayıcısı değildir; aktarma, mesafe, iade ve saat kuralları uygulanabilir.

`Uygulama hakkında → Tarifeler` penceresi genel İstanbulkart kart türlerini, Mavi Kart aylık abonmanlarını ve 1–12 geçişlik sınırlı biletleri tek yerde gösterir. Bu ekran da aynı statik çıktıdan beslenir; uygulama açılırken TUHİM’e istek göndermez. Mesafe, iskele, aktarma ve iade kuralları içeren hatlarda kesin ücret için ilgili hat ayrıntısı kullanılmalıdır.

### Planlı sefer veri altyapısı

Planlı hareket saatleri canlı araç konumundan ayrı bir veri sözleşmesiyle ele alınır. Ortak sözleşme; işletmeci, resmî kaynak bağlantısı, snapshot alınma zamanı, varsa geçerlilik aralığı, gün türleri, yönler, seferler ve ara durak/iskele saatlerini taşır. `24:15` gibi gece yarısını aşan toplu ulaşım saatleri korunur; bilinmeyen gün türü, ters geçerlilik aralığı veya geriye giden durak saatleri yayımlanmaz.

Sefer kataloğu `public/schedules/manifest.json`, hat dosyaları `public/schedules/routes` altında tutulur. Hat ayrıntısındaki `Seferleri gör` alanı açılmadan manifest yüklenmez; manifestte seçili hat yoksa başka dosya isteği yapılmaz. Çalışma anında İETT, Şehir Hatları, Metro İstanbul veya TCDD tarife sayfalarına bağlanılmaz. İlk gerçek veri paketi Şehir Hatları'nın yayımlanan 30 vapur hattını kapsar. İETT planlı kalkışları için aynı sözleşmeyi kullanan bakım betiği `data:build-iett-schedules` komutudur; kaynağa yük vermemek için açık hat kapsamı ister, örneğin `node scripts/build-iett-schedule-data.mjs --codes=500T`. Tüm katalog yalnız `--all` ile ve manuel bakım sırasında alınabilir.

Metro İstanbul için ilk kullanıcı odaklı dilim, resmî tarife yönleri statik rota yönleriyle doğrulanabilen M1A, M1B, M2–M6, M8, M9, T1, T3, T4, T5, F1 ve F4 hatlarının ilk/son hareket özetidir. Bu özet yalnız bakım sırasında resmî sayfada seçilen gün için alınır; kaynak geçerlilik aralığı yayımlamadığından uygulama bunu "bugün kesin geçerli" diye sunmaz. M7'nin kaynakta yayımlanan kısa işletme parçaları statik tam hat yönleriyle eşleşmediği için; M11 ve B1 ise bu Metro İstanbul tarife kaynağında yer almadığı için kapsam dışındadır.

```bash
npm run data:build-metro-schedules
```

Komut varsayılan olarak 15 doğrulanmış hat için 33 kontrollü kaynak sorgusu yapar. Tam istasyon bazlı saatler, durak eşlemeleri ayrıca doğrulanana kadar bu çıktıya eklenmez. Tek bir statik hat yenilemek gerektiğinde `npm run data:build-metro -- --codes=M2` veya `npm run data:build-rail -- --codes=T3` kullanılabilir; bu, ilgili ağın hat/istasyon genel indekslerini değiştirmez.

Arayüzde gösterilen saatler planlı bilgidir; gecikme, iptal, özel gün ve işletme değişikliği olabilir. Kaynağın geçerlilik tarihi bilinmiyorsa uygulama saati “bugün kesin geçerli” olarak nitelemez.

## Paylaşılabilir bağlantılar

Hat, yön ve isteğe bağlı durak seçimi sorgu parametreleriyle saklanır:

```text
/?route=41ST&direction=return&stop=iett-stop:123456
```

Desteklenen yön değerleri `outbound` ve `return` değerleridir. Tarayıcının geri/ileri hareketleri de seçimi günceller.

## Güzergâh renkleri

Renkler işletmeci tarafından sağlanan resmî hat renkleri değildir. Hat kodundan deterministik olarak seçilen sabit bir palet kullanılır; böylece aynı hat her açılışta aynı renkte görünür. Metrobüs hatları ayrıca turuncu renkle ayrılır.

## Veri kapsamı

Güzergâh ve duraklar, lisansı/attribution bilgisi metadata’da tutulan statik çıktılardır. Sefer snapshot kapsamı 1 Eylül 2026 itibarıyla 30/30 Şehir Hatları, 102/801 İETT hattı ve 15 Metro İstanbul hattının doğrulanmış yönlerinde ilk/son hareket özetidir. Metro İstanbul özeti kaynak geçerlilik aralığı yayımlamadığından tam tarife veya kesin günlük geçerlilik olarak yorumlanmaz. İETT’nin resmî RouteDetail sayfası her hat için aynı şekilde tablo üretmediğinden, tablo alınamayan hatlarda saat uydurulmaz ve modal açıkça kaynak bulunamadığını bildirir. Seçili resmî hattın canlı araçları, hat kodundan bağımsız olarak İETT `GetHatOtoKonum_json` servisi üzerinden sunucu tarafında alınır; tarayıcı kaynak servise doğrudan bağlanmaz. Bu canlı servis herkese açık bir geliştirici API’si/taahhütlü yüksek hacim kotası olarak belgelenmemiştir; bu nedenle credential varsa hosting secret olarak kullanılır, çalışma zamanı istekleri önbellek ve kota korumalarıyla sınırlıdır. Uygulama yalnız seçili hattı sorgular, yanıtları kısa süre önbelleğe alır ve canlı kaynak kesilse bile statik güzergâh/durak deneyimini korur. `public/iett` üretim çıktıları dağıtıma dahil edilmeden yapılan yeni bir kurulumda hat verileri görüntülenmez.

Canlı veri katmanı aynı hat için eşzamanlı istekleri birleştirir; böylece aynı hattı inceleyen kullanıcılar tek upstream çağrısını paylaşır. Seçili İETT hattı görünür sekmede 30 saniyede bir kontrol edilir ve sunucu taze yanıtı varsayılan olarak 30 saniye saklar; sekmeye geri dönülmesi veya bağlantının yeniden kurulması da güvenli bir kontrol tetikler. Son geçerli yanıtlar en fazla 10 dakika saklanır. Üst kaynağın yayımlanmış kotası olmadığı için uygulama varsayılan olarak saatte en fazla 360 kaynak isteği yapar; limit, kaynak sağlığı ölçüldükten sonra hosting ortamından değiştirilebilir. Başarısız kaynak 15 saniye boyunca tekrar zorlanmaz ve 1 MB’ı aşan yanıtlar işlenmez. Canlı API, kullanıcı başına dakikada 12 istekle sınırlıdır; CDN yanıtı 30 saniye saklayarak farklı Worker örneklerinden gelen aynı hat isteklerini birleştirmelidir.

Üst kaynak isteği varsayılan olarak 10 saniyede kesin biçimde sonlandırılır. Bu koruma, çalışma ortamının ağ isteği iptalini geciktirdiği durumda da paylaşılan hat isteğini serbest bırakır; kullanıcıya hata veya varsa son geçerli snapshot döner ve sonraki hat sorguları kilitlenmez.

Hat ayrıntısında yer alan canlı veri bilgisi, konum zamanını ve yanıtın niteliğini açıkça ayırır: `yeni kaynak yanıtı`, 30 saniyelik süre içindeki `taze önbellek` veya kaynak hatasında gösterilen `önceki yanıt`. Bu ifadeler araçların kesin varış zamanı ya da sefer garantisi anlamına gelmez.

## Canlıya çıkış kontrol listesi

1. Hosting ortamında `NEXT_PUBLIC_SITE_URL` gerçek HTTPS adresiyle ayarlanır; İETT kimlik bilgileri varsa yalnızca hosting secret olarak eklenir.
2. `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` ve bağımlılık taraması temiz geçer.
3. Preview URL’de `/api/v1/health` 200 döndürür; temel harita, arama, mobil görünüm ve canlı kaynak kesintisi akışları sınanır.
4. Cloudflare CDN’de canlı araç endpointi için `s-maxage=30` ve `stale-if-error=600` davranışı doğrulanır; ilk haftada kaynak hata oranı ve üst kaynak isteği izlenir.
5. Özel bir alan adı kullanılacaksa HTTPS etkinleştirilir. Uygulamanın gönderdiği CSP, HSTS, tıklama çerçevesi ve izin politikası başlıkları HTTP yanıtından kontrol edilir.

Uygulama ücretsiz Cloudflare Workers/CDN kotası içinde küçük bir kamu demosu için tasarlanmıştır. İETT kaynağının resmî yüksek hacim sözleşmesi olmadan saatlik kaynak bütçesi yükseltilmemelidir.

Durak detay kartı, seçili hat ve yöndeki canlı araçları yön geometrisi üzerine izdüşürür; durağı henüz geçmemiş en yakın üç aracı yaklaşık güzergâh mesafesine göre sıralar. Bu değer bir varış süresi tahmini değildir. Başka hatlar otomatik olarak sorgulanmaz; duraktan geçen başka bir hat seçildiğinde canlı sorgu o hatta geçirilir.

## Sürüm

Güncel sürüm: `0.7.1`. Planlı sefer altyapısı, UX geri bildirimleri, marker performans iyileştirmesi, kaynaklı tarife kataloğu ve canlı araç güncelliği bu sürümde yayımlanır.

## Sürümleme yaklaşımı

Proje `0.x.y` biçimini kullanır. Küçük düzeltmeler ve sınırlı özellik eklemeleri son haneyi yükseltir (`0.3.1` → `0.3.2`). Daha geniş kullanıcı akışları veya mimari değişiklikler orta haneyi yükseltir (`0.3.x` → `0.4.0`). Her sürüm, Git etiketi ve değişiklik günlüğüyle birlikte kaydedilir.

Kararlı sürüm `main` dalında tutulur. Yeni kullanıcı özellikleri `feature/*` dallarında geliştirilir; beta sürüm doğrulandıktan sonra `main`e birleştirilir ve kararlı sürüm etiketi oluşturulur.

Ayrıntılar için [CHANGELOG.md](CHANGELOG.md) dosyasına bakın.

Yeni bir geliştirme oturumunda mevcut özellikler, mimari kararlar ve sonraki adımlar için [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) belgesine bakın.
