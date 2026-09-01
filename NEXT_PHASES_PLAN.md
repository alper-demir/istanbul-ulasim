# İstanbulum — Sonraki Geliştirme Fazları

Bu belge `v0.7.0-beta.3` sonrasındaki ürün ve teknik geliştirmeleri planlar. Sefer altyapısı, Şehir Hatları ve doğrulanabilen İETT sefer snapshot'ları, arama/keşif, erişilebilirlik iyileştirmeleri ve canlı araç yumuşatma `main` dalında tamamlanmıştır. Trafik verisi, kesin varış süresi tahmini, teleferik ve raylı/vapur araçlarının canlı konumları kapsam dışındadır. Öncelik; ücretsiz ve mümkün olduğunca resmî kaynaklardan alınan bilgiyi, uygulamanın çalışma zamanı yükünü artırmadan anlaşılır biçimde sunmaktır.

## Temel kararlar

1. Sefer tarifeleri çalışma anında kurum sitelerinden çekilmeyecek. Bakım/build sırasında snapshot alınacak, doğrulanacak ve seçilen hatta ait küçük statik JSON dosyaları olarak yayımlanacak.
2. Uygulama “planlı sefer” ile “canlı araç konumu”nu ayrı kavramlar olarak gösterecek. Planlı saatten gerçek varış süresi türetilmeyecek.
3. Her veri kümesi kaynak URL’si, sağlayıcı, alınma tarihi, varsa geçerlilik aralığı ve doğrulama durumunu taşıyacak. Geçerliliği belirlenemeyen veri “bugün geçerli” diye sunulmayacak.
4. Canlı kaynak istek sayısı başlangıçta artırılmayacak. Daha akıcı araç hareketi öncelikle iki snapshot arasında istemci tarafı görsel yumuşatma ile sağlanacak.
5. Kaynak sayfasının herkese açık ve ücretsiz olması, kararlı veya taahhütlü bir API olduğu anlamına gelmez. Dokümante edilmemiş uçlar yalnız bakım aracında kullanılacak; arayüzde resmî kaynak sayfasına bağlantı verilecek.

## Kaynak matrisi

| Ağ | Birincil ücretsiz kaynak | Kullanım biçimi | Güven ve sınırlama |
| --- | --- | --- | --- |
| İETT otobüs/metrobüs | İETT hat detayları ve planlı kalkış çıktısı: `https://iett.istanbul/RouteDetail?hkod=...` | Tüm hatlar için kontrollü, düşük eşzamanlı bakım snapshot’ı; hat/yön/gün türü kalkışları statik dosyaya dönüştürme | Resmî kaynak, fakat planlı kalkış ucu yayımlanmış bir geliştirici API’si değil. HTML/parametre değişirse üretim hata vermeli. |
| İETT GTFS doğrulaması | Mevcut İBB/İETT `routes`, `trips`, `stop_times` girdileri | Hat, yön, durak dizisi ve saat kapsamını çapraz kontrol etme | Mevcut pakette `calendar.txt`/`calendar_dates.txt` yok. Bu dosyalar veya eşdeğer hizmet takvimi bulunmadan GTFS saatleri “bugünkü sefer” olarak yorumlanamaz. |
| Şehir Hatları | `https://sehirhatlari.istanbul/tr/seferler` ve her hattın resmî sefer sayfası | Mevcut vapur üreticisini gün türü, ara iskele saatleri, dipnotlar ve geçerlilik bilgisiyle genişletme | Resmî sayfalarda tablolar var. Mevsimsel tarife ve özel gün notları nedeniyle snapshot tarihi mutlaka gösterilmeli. PDF yalnız geçerlilik tarihleri açıkça eşleşiyorsa ikincil doğrulama olmalı. |
| Metro İstanbul metro/tramvay/füniküler | `https://www.metro.istanbul/SeferDurumlari/SeferDetaylari` ve resmî hat detayları | Önce kaynak uçlarını bakım sırasında keşfeden spike; sonra istasyon/tarih ve ilk-son tren verisini statik snapshot’a dönüştürme | Resmî tarife ekranı M1A–M9, T1/T3/T4/T5 ve F1/F4’ü kapsıyor. Kaynak sözleşmesi kararlı değilse yalnız işletme saatleri/ilk-son tren özeti sunulmalı. |
| Marmaray | `https://www.tcddtasimacilik.gov.tr/marmaray/tr/neredennereye` | İstasyonlar arası planlı saat/ilk-son tren verisini bakım sırasında toplama ve B1 durak kimlikleriyle eşleme | Resmî TCDD kaynağı. “Muhtemel hareket saati” olduğu ve sürenin taahhüt olmadığı kullanıcıya açıkça yazılmalı. |
| M11 | TCDD Taşımacılık Gayrettepe–Halkalı/M11 “Nereden Nereye” sayfaları | Marmaray’dan ayrı adaptör ve kaynak manifesti | İşletmeci ve kapsam Metro İstanbul tarifelerinden farklı olduğundan M11 verisi Metro İstanbul’dan varsayılmamalı. Kaynak doğrulanamazsa yalnız statik hat gösterimi korunmalı. |
| Canlı İETT aracı | Mevcut İETT `GetHatOtoKonum_json` entegrasyonu | Yalnız seçili hat; sunucu/CDN önbelleği; görünür sekmede kontrollü yenileme | Araç bulunmaması sefer olmadığı anlamına gelmeyebilir. Kaynak zamanı ve stale durumu gösterilmeye devam etmeli. |

Raylı sistem veya vapur için ücretsiz ve resmî canlı araç konumu kaynağı doğrulanmadığı sürece üçüncü taraf konum verisi eklenmeyecek.

## Ortak sefer veri sözleşmesi

Her işletmeci farklı tablo yayımladığı için önce tek bir uygulama sözleşmesi oluşturulacak:

```text
ScheduleDataset
  routeId
  provider
  sourceUrl
  retrievedAt
  effectiveFrom / effectiveTo / validityUnknown
  timezone = Europe/Istanbul
  dayTypes[]
  directions[]
    directionId
    servicePatterns[]
      dayTypeId
      notes[]
      journeys[]
        calls[] { stopId, time, marker? }
```

Kurallar:

- `24:xx` gibi gece yarısını aşan saatler kaybolmadan saklanacak.
- Resmî tatil, yalnız kaynağın açıkça tanımladığı gün türüne bağlanacak.
- Depar/ekspres/ring gibi işaretli seferlerde kaynak işareti ve açıklaması korunacak.
- Durak eşleşmesi kodla yapılacak; yalnız ada güvenilerek sessiz eşleştirme yapılmayacak. Ada dayalı eşleşme gerekiyorsa rapora düşecek ve manuel onay isteyecek.
- Kaynak geçerlilik aralığı bittiyse “sonraki sefer” hesabı kapatılacak; eski tablo yalnız kaynak tarihiyle görüntülenebilecek veya tamamen gizlenecek.
- Parser bilinmeyen gün başlığı, işaret veya kolon yapısı gördüğünde eksik veri üretmek yerine hata verecek.

Statik çıktı yapısı:

```text
public/schedules/manifest.json
public/schedules/routes/{routeId}.json
data/schedules/snapshots/{provider}/...
```

Ana hat kataloğu sefer saatlerini içermeyecek. `routes/{routeId}.json` yalnız kullanıcı “Seferler” bölümünü açtığında yüklenecek.

## Tamamlanan temel

`v0.7.0-beta.3` ile ortak planlı sefer sözleşmesi ve lazy loading; 30 Şehir Hatları rotasının sefer snapshot'ları; doğrulanabilen İETT sefer snapshot'ları; tarife/bilet kataloğu; yerel arama, favori, yakın duraklar ve karşılaştırma; erişilebilirlik/modal iyileştirmeleri; kompakt hat paneli; İETT canlı araçları, güncellik etiketleri ve görsel yumuşatma `main` dalına alınmıştır.

## Fazlar

### Tamamlandı — Sefer altyapısı ve kaynak denetimi

Tamamlanan dal: `feature/schedule-foundation` (artık `main`de)

- Ortak veri tipleri, kaynak manifesti, gün türleri ve saat yardımcıları.
- Kaynak yaşı/geçerlilik kontrolü ve üretimi durduran doğrulamalar.
- Fixture tabanlı parser test altyapısı; CI sırasında kurum sitelerine istek gönderilmemesi.
- Hat detayında başlangıçta kapalı, sade bir “Seferler” alanı ve yükleniyor/boş/eski veri durumları.
- Arayüz metni: “Planlı saatlerdir; gecikme, iptal ve özel gün değişikliği olabilir.”
- Mevcut kaynak açıklamalarını gerçek veri davranışıyla eşitleme; yayımlanmış vapur vektörlerini “şematik düz bağlantı” diye tanımlayan eski arayüz metnini düzeltme.

Kabul: Veri bulunmadığında mevcut harita ve canlı araç deneyimi değişmeden çalışmalı; sefer dosyası yalnız kullanıcı açınca yüklenmeli.

### Tamamlandı — Şehir Hatları seferleri

Tamamlanan dal: `feature/ferry-schedules` (artık `main`de)

- Mevcut `build-ferry-static-data.mjs` içindeki resmî sayfa ayrıştırmasını sefer tablolarıyla genişletme.
- İki yön, ara iskele saatleri, hafta içi/cumartesi/pazar-tatil ayrımı ve dipnotları koruma.
- Şehir Hatları kataloğu ile uygulamadaki hat sayısını karşılaştıran kapsam raporu; mevcut snapshot’taki 30 rota ile kaynak kataloğundaki farkı açıklamadan yeni sefer verisi yayımlamama ve tablo bulunamayan hattı sessizce boş bırakmama.
- Hat ayrıntısında yön ve gün türüne göre yaklaşan birkaç planlı kalkış; tam tablo isteğe bağlı açılır.

Kabul: Her gösterilen saatin resmî sayfadaki aynı yön/iskeleden geldiği fixture ve örneklem denetimiyle kanıtlanmalı.

### Tamamlandı — İETT planlı kalkışları

Tamamlanan dal: `feature/iett-schedules` (artık `main`de)

- İETT hat sayfasının planlı kalkış çıktısını düşük eşzamanlılık, zaman aşımı ve yeniden deneme sınırıyla snapshot alma.
- 801 statik hat kodunun kaynak kapsamını raporlama; geçici/kapalı/sonuçsuz hatları ayrı sınıflandırma.
- Gidiş/dönüş, gün türü, depar işaretleri ve frekans aralıklarını koruma.
- Mevcut `trips/stop_times` verisini saat ve yön için ikincil tutarlılık denetiminde kullanma; hizmet takvimi yoksa GTFS’den gün seçmeme.

Kabul: Kaynak hat sayfası değiştiğinde bakım betiği açık hata vermeli; çalışma anında İETT sefer kaynağına hiçbir yeni istek eklenmemeli.

### Faz 3 — Metro, tramvay ve füniküler tarifeleri

Dal: `feature/metro-schedules`

- Önce küçük bir teknik spike ile Metro İstanbul tarife ekranının istek sözleşmesini ve tarih davranışını doğrulama.
- M1A–M9, T1/T3/T4/T5 ve F1/F4 için ilk/son tren ve mümkünse istasyon bazlı planlı saat snapshot’ı.
- Gece Metrosu ve hat bazlı işletme saati notlarını ayrı gün türü/uyarı olarak taşıma.
- Eksik hatlarda tahmini saat üretmek yerine resmî kaynak bağlantısı ve işletme saati özeti gösterme.

Kabul: Seçilen tarihe ait kaynak verisi doğrulanmadan “bugün” filtresi açılmamalı.

### Faz 4 — Marmaray ve M11 tarifeleri

Dal: `feature/tcdd-schedules`

- TCDD “Nereden Nereye” çıktısı için ayrı adaptör.
- B1 ve M11 istasyon kimliklerini mevcut statik duraklarla açık eşleme dosyasında tutma.
- İlk/son tren, planlı/muhtemel hareket saati ve resmî kaynağın taahhüt uyarısını gösterme.
- Kaynak yalnız nokta-nokta sorguya izin veriyorsa bakım sırasında çağrı sayısını istasyon çifti karesi kadar büyütmemek: uçtan uca ve ardışık istasyon örneklerinden hat tablosu üretilebildiği kanıtlanmalı; aksi halde yalnız seçili başlangıç için sınırlı snapshot ya da ilk/son tren özeti kullanılmalı.

Kabul: TCDD kaynağına çalışma anı bağımlılığı ve sınırsız kombinasyon sorgusu eklenmemeli.

### Tamamlandı — Arama, yakın duraklar ve favoriler

Tamamlanan dal: `feature/discovery-ux` (artık `main`de)

- Aramayı ardışık metin eşleşmesinden Türkçe karakter duyarlı, token bazlı AND eşleşmesine geçirmek. Örneğin `Kadıköy Beşiktaş`, ayraçtan bağımsız sonuç bulmalı.
- Sıralama: tam hat kodu, kod öneki, hat adı, durak adı ve bölge öncelikleri.
- Sınırlı eş anlamlı/alias sözlüğü; yazım hatalarını kontrolsüz fuzzy eşleşmeyle yanlış hatta yönlendirmemek.
- Yakın duraklarda gerçek mesafe, ulaşım türleri ve geçen hat sayısını sade göstermek; yalnız görünür sonuçları çizmek.
- Favorileri cihazda tutmaya devam etmek; tüm favoriler için arka planda canlı sorgu başlatmamak.

Kabul: Arama ve yakın durak özellikleri tamamen yerel statik indekslerle çalışmalı; ağ isteği sayısı artmamalı.

### Faz 6 — Canlı araçların daha akıcı görünmesi — tamamlandı (`feature/live-vehicles-ux`)

Tamamlanan dal: `feature/live-vehicles-ux` (artık `main`de)

- İki başarılı konum snapshot’ı arasında aynı araç için istemci tarafı hareket yumuşatma.
- Araç geometriden aşırı uzaksa, çok büyük sıçrama yaptıysa, veri eskiyse veya sekme görünmüyorsa interpolasyonu kapatma.
- `prefers-reduced-motion` kullanıcılarında animasyonu kapatma.
- Kaynak noktasını “son alınan konum”, animasyonu ise görsel yumuşatma olarak ayırma; sahte hassasiyet veya dakika ETA üretmeme.
- İlk sürümde 30 saniyelik kaynak sorgu aralığını düşürmeme. Sonraki ölçümde değişmeyen/boş sonuçlarda 60–90 saniyeye çıkan adaptif geri çekilme değerlendirilebilir.

Kabul: Üst kaynak istek sayısı mevcut sürümden fazla olmamalı; marker hareketi rota dışına taşmamalı.

Uygulama notu: 20 saniyelik istemci tarafı görsel geçiş yalnız ardışık, taze ve makul mesafedeki aynı araç konumlarında uygulanır. Başlangıç/bitiş noktaları seçili rota geometrisine projekte edilir; eski, büyük sıçramalı veya rotadan uzak veri kaynak koordinatı olarak kalır ve animasyon yapılmaz. Bu davranış reduced-motion tercihinde ya da sekme görünmezken kapalıdır.

### Faz 5 — Kalıcı E2E testleri

Dal: güncel `main`den açılacak `feature/persistent-e2e`

Mevcut temel: Sefer, tarife ve bilgi akışlarında Escape ile kapanma; ana modallarda açılış odağı, Tab odağı döngüsü ve kapanınca açan kontrole odak dönüşü; `npm run test:smoke` ile uygulama, sağlık, kaynak, dört statik ağ indeksi ve hatalı canlı istek sözleşmesi kontrolü. Bunlar kalıcı tarayıcı tabanlı E2E setinin başlangıç noktasıdır.

- Klavye dolaşımı, odak tuzağı/geri dönüşü, Escape davranışı, filtrelerin seçili durumu ve ekran okuyucu adları.
- Haritaya alternatif hat/durak listesi; renk tek bilgi taşıyıcısı olmamalı.
- Hareket azaltma, kontrast ve mobil dokunma hedefi kontrolleri.
- Playwright tabanlı temel E2E akışları: uygulama açılışı, token arama, her ulaşım türü, sefer paneli, canlı kaynak hatası, mobil görünüm.
- Parser fixture testleri, gece yarısı saatleri, resmî tatil ve stale veri senaryoları.
- Build paket ve statik JSON boyut raporu; değişiklik öncesi/sonrası karşılaştırması.
- Örneklenmiş hata logları ve canlı endpoint için cache niteliği/kaynak süresi sayaçları; araç başına veya her poll için gürültülü log tutmama.

Kabul: `test`, `typecheck`, `lint`, `build`, bağımlılık denetimi ve E2E smoke temiz; ana kullanıcı akışlarında erişilebilirlik açısından kritik hata yok.

### Faz 6 — Snapshot bakım ve fark raporu sistemi

Dal: güncel `main`den açılacak `feature/snapshot-maintenance`

- Resmî kaynaklardan alınan her statik snapshot için tekrar üretilebilir bakım akışı kurmak.
- Önceki snapshot ile eklenen/silinen hat, yön, sefer ve geçerlilik değişikliklerini raporlamak.
- Büyük veya beklenmeyen farkları yayın öncesinde manuel onaya bağlamak.

Kabul: Kaynak yenilemeleri çalışma zamanına dış istek eklemeden, fark raporu ve açık onay akışıyla yürütülmeli.

### Faz 7 — Çoklu kullanıcı için ortak edge cache ve kota katmanı

Dal: güncel `main`den açılacak `feature/shared-edge-cache`

- Cloudflare Cache/KV ve gerekli ise Durable Object ile Worker örnekleri arasında canlı araç cache ve kota bilgisini paylaşmak.
- Cache tazeliği, stale fallback ve kullanıcı başı hız limiti davranışını çoklu örnekte test etmek.
- İETT upstream bütçesini merkezi olarak görünür ve ölçülebilir kılmak.

Kabul: Aynı hat için farklı Worker örneklerinden gelen eşzamanlı istekler gereksiz upstream çağrı üretmemeli.

### Faz 8 — Performans ve son polish

Dal: güncel `main`den açılacak `feature/performance-polish`

- Build paketleri ve statik JSON boyutları için önce/sonra fark raporu üretmek.
- Ana kullanıcı akışlarındaki gereksiz istemci yükü ve arayüz pürüzlerini gidermek.
- Erişilebilirlik, odak yönetimi, kontrast ve mobil dokunma hedeflerinde regresyon bırakmamak.

Kabul: Kalıcı E2E seti ve kalite kapısı temiz geçmeli; kritik erişilebilirlik veya performans gerilemesi kalmamalı.

## Performans ve yük bütçesi

- Statik sefer kaynaklarına kullanıcı isteği başına çağrı: **0**.
- Canlı üst kaynak çağrısı: yalnız seçili İETT hattı; mevcut 30 saniyelik tavan korunur veya azaltılır.
- Sefer dosyası: yalnız seçili hat için lazy load; rota başına sıkıştırılmamış boyut için başlangıç üst sınırı 100 KB, aşımda build raporu ve gerekirse gün/yön parçalama.
- Ana katalog ve durak indeksleri: sefer dizilerini taşımayacak.
- Harita marker animasyonu: görünmeyen sekmede ve reduced-motion durumunda çalışmayacak.
- Kaynak bakım işlemleri: seri veya düşük eşzamanlı (öneri 2–4), zaman aşımı ve kontrollü retry; kurum sitelerine ani trafik oluşturmayacak.
- CI: gerçek kaynak çekmeyecek. Kaynak yenileme ayrı manuel bakım komutu olacak; daha sonra haftalık denetim yalnız değişiklik raporu/PR üretmek üzere değerlendirilecek, doğrudan canlıya çıkmayacak.
- Yeni özellik dalında mevcut ilk yük JS ve statik veri boyutu ölçülecek; açıklanamayan gerileme kabul edilmeyecek.

## Veri yenileme ve güvenilirlik akışı

1. Bakım komutu resmî kaynağı indirir ve ham snapshot’ı tarihli olarak saklar.
2. Parser şemayı, hat/durak kapsamını, saat biçimini, gün türlerini ve bilinmeyen işaretleri doğrular.
3. Önceki snapshot ile fark raporu üretilir: eklenen/silinen hat, yön, sefer ve geçerlilik değişikliği.
4. Büyük veya beklenmeyen fark manuel onay olmadan yayımlanmaz.
5. Küçük statik çıktılar üretilir; kaynak metadata’sı arayüze taşınır.
6. Fixture testleri, kalite kapısı ve örnek tarayıcı kontrolleri tamamlanır.
7. Feature dalı, kullanıcı onayından sonra `main`e birleştirilir; onay olmadan merge, push veya canlı dağıtım yapılmaz.

Arayüzde kaynak etiketi üç düzeyde olmalı:

- **Resmî planlı veri** — sağlayıcı ve kaynak bağlantısı.
- **Alınma/geçerlilik tarihi** — ikisi farklı alanlar olarak.
- **Sınır** — planlıdır, iptal/gecikme olabilir; canlı konumsa sağlayıcının son kaydıdır.

## Branch ve birleştirme stratejisi

Aktif bir entegrasyon dalı yoktur. Her yeni faz, güncel `main`den ayrı bir `feature/*` dalında açılmalı ve küçük, anlamlı commitlerle ilerlemelidir. Kullanıcı onayı olmadan hiçbir dal `main`e birleştirilemez, GitHub'a pushlanamaz veya canlıya gönderilemez.

Önerilen commit ayrımı:

1. veri sözleşmesi ve fixture’lar,
2. bakım/parser betiği,
3. statik çıktı adaptörü,
4. arayüz,
5. test ve dokümantasyon.

Her faz sonunda `README.md`, `PROJECT_CONTEXT.md` ve gerekiyorsa `CHANGELOG.md` güncellenir. Son fazda sürüm numarası tek kez yükseltilir; ayrı feature commitlerinde sürüm etiketi oluşturulmaz.

## Öncelik önerisi

Uygulama değerini hızla artırıp riski düşük tutan sıra şöyledir:

1. Faz 3: metro, tramvay ve füniküler tarifeleri,
2. Faz 4: Marmaray ve M11 tarifeleri,
3. Snapshot bakım ve fark raporu sistemi,
4. Çoklu kullanıcı için ortak edge cache/kota katmanı,
5. Faz 5: kalıcı E2E testleri,
6. Performans ve son polish.

Bu sıra, en iyi yapılandırılmış resmî sefer sayfalarından başlayıp daha değişken TCDD/Metro kaynaklarına geçer. Canlı sorgu sıklığını artırma işi, gözlem verisi ve gerçek ihtiyaç ortaya çıkana kadar ertelenir.
