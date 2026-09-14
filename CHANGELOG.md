# Değişiklik Günlüğü

Bu projedeki önemli değişiklikler bu dosyada belgelenir.

## 0.11.15 — Harita rota senkronizasyonu ve eksik yön durakları

- MapLibre katmanları artık stil hazırlanırken o an seçili olan rota üzerinden kuruluyor; hızlı hat değişiminde önceki hattın çizgisinin haritada kalmasına yol açan yarış durumu kapatıldı.
- Harita katmanları yeniden oluşturulduğunda rota, durak, araç, karşılaştırma ve kullanıcı konumu kaynakları güncel durumla yeniden eşitleniyor.
- İETT kaynak snapshot’ında yalnız bir yönün durak sırası bulunan 58 çift yönlü hat için boş yön, karşı yönün sırası ters çevrilerek kullanılabilir hale getirildi. Her hattın kendi resmî güzergâh geometrisi korunuyor.
- Bu yedek durak sırası kullanılan yönlerde, veri sınırını açıklayan görünür bir uyarı eklendi. EL2’nin `4.LEVENT → EMİRGAN` yönü artık 35 durakla açılıyor.

## 0.11.14 — Hat geçişinde veri tutarlılığı

- Hat değişirken önceki hat detaylarının yeni harita güzergâhıyla kısa süreli karışması engellendi.
- Yeni güzergâh ve durak verisi doğrulanana kadar panelde açık bir yüklenme durumu gösteriliyor.
- Hızlı ardışık hat ve yön değişimlerinde harita katmanları güncel seçili hat verisiyle eşleştirildi.

## 0.11.13 — Timeout sonrası yeniden kontrol düzeltmesi

- Canlı veri veya duyuru timeout durumunun sonraki başarılı polling yanıtını engellememesi sağlandı.

## 0.11.12 — Yüklenme güvenlik durumu

- İstemci sorgusu başlatılamasa veya framework sorgusu beklemede kalsa bile 12 saniye sonra canlı araç ve duyuru panelleri uyarı durumuna geçer.
- Global duyurularda eski veri görünürlüğü zaman aşımı durumunu da kapsar.

## 0.11.11 — Canlı veri zaman aşımı ve eski veri görünürlüğü

- Canlı araç, hat duyurusu, global duyuru ve kaynak sağlık istemcilerine 12 saniyelik istemci zaman aşımı eklendi.
- Dış kaynak yanıt vermezse arayüz sonsuz yüklenme durumunda kalmak yerine açık uyarı gösterir.
- Önceki geçerli duyurular ve canlı konumlar yeni istek başarısız olduğunda “eski veri” olarak işaretlenir.
- İETT canlı araç panelinde kaynak sağlık bilgisinin son başarılı canlı istek zamanı görünür hale getirildi.

## 0.11.10 — Performans ve son polish

- Performans raporu artık baseline karşılaştırması ve isteğe bağlı çıktı yolu destekliyor; JS/toplam çıktı farkını raporluyor.
- Uzun durak listesinde içerik izolasyonu ve `prefers-reduced-motion` için genel animasyon/geçiş koruması eklendi.
- Kullanıcı akışına yeni upstream isteği eklenmedi; statik sefer lazy-load davranışı korunuyor.

## 0.11.9 — Snapshot bakım ve fark raporu kapısı

- Statik sefer snapshot'ları için hat, yön, sefer özeti, kaynak ve geçerlilik metadata farkları ayrıntılı raporlanıyor.
- `npm run data:refresh -- --provider=...` varsayılan olarak dry-run çalışıyor; `--apply` ile üretilen fark manuel inceleme gerektiriyorsa etkin snapshot otomatik geri alınıyor.
- Bakım raporları JSON ve Markdown olarak `data/reports` altında tutuluyor; çalışma zamanına yeni upstream isteği eklenmiyor.

## 0.11.8 — Kalıcı E2E regresyon seti

### Eklendi

- Playwright masaüstü ve mobil akışları güncel çok kaynaklı duyuru sözleşmesine göre kalıcılaştırıldı.
- Uygulama açılışı ve arama, Escape ile modal kapatma, duraktan sefer açma, global duyuru paneli, Vapur filtresi ve TCDD kapsam uyarısı test ediliyor.
- E2E testleri canlı upstream duyurularına bağlanmadan kontrollü fixture yanıtları kullanıyor.
- Başlangıç yükleme zamanlamasına bağlı kırılgan test beklemeleri güçlendirildi.

## 0.11.7 — Marmaray/M11 tarife sınırlarının görünürleştirilmesi

### Eklendi

- Marmaray ve M11 planlı sefer penceresinde TCDD kayıtları ayrı bir “ilk / son hareket özeti” olarak açıkça etiketleniyor.
- Ara istasyon saatlerinin ve yolculuk süresinin tahmin edilmediği görünür uyarıyla belirtiliyor.
- B1 ve M11 snapshot’larının yalnız doğrulanmış uç istasyonlara bağlı, iki hareketlik özet olması test kapsamına alındı.

## 0.11.6 — Tarifede doğru gün türü seçimi

### Eklendi

- Planlı sefer penceresi, ilk kayıt yerine İstanbul saatine göre bugünün gün türünü otomatik seçiyor.
- Hafta içi, cumartesi ve pazar ayrımı kaynakta haftanın günleriyle tanımlıysa doğrudan eşleştiriliyor.
- Kullanıcı otomatik seçimi her zaman elle değiştirebiliyor; canlı ETA veya kesin varış tahmini eklenmedi.

## 0.11.5 — Marmaray/TCDD duyuruları

### Eklendi

- TCDD Taşımacılık’ın Marmaray son dakika duyuru listesi global duyuru endpointine eklendi.
- Raylı filtresinde Marmaray duyuruları B1 kapsamında gösteriliyor.
- Gerçek TCDD detay bağlantısı, kaynak tarihi ve “Marmaray / TCDD” sağlayıcı etiketi korunuyor.
- Marmaray kaynağı için timeout, süreç içi cache, stale fallback ve `/api/v1/source-health` runtime metrikleri eklendi.
- TCDD’nin geçerli “duyuru bulunamadı” yanıtı kaynak hatası sayılmadan operasyonel/boş sonuç olarak işleniyor.

### Sınırlar

- Duyuru tarihi kaynakta açıkça bulunmuyorsa kayıt “Tarihi belirsiz” gösterilir.
- Yolculuk planı, canlı tren konumu ve kesin sefer/varış tahmini bu faza dahil değildir.

## 0.11.4 — Şehir Hatları duyuruları

### Eklendi

- Şehir Hatları’nın resmî duyuru listesi global duyuru endpointine eklendi.
- Vapur filtresinde gerçek başlık, kısa açıklama, kaynak etiketi ve resmî detay bağlantısı gösteriliyor.
- Şehir Hatları kaynağı için timeout, süreç içi cache, stale fallback ve `/api/v1/source-health` runtime metrikleri eklendi.
- İETT, Metro İstanbul ve Şehir Hatları kaynaklarından biri geçici olarak bozulduğunda diğer kaynaklar gösterilmeye devam ediyor.

### Sınırlar

- Marmaray/TCDD duyuru adaptörü bu sürümde eklenmedi.
- Ortak Cloudflare cache/KV/DO, yol tarifi ve yolculuk planı kapsam dışıdır.

## 0.11.3 — Metro İstanbul duyuruları

### Eklendi

- Metro İstanbul’un resmî duyuru listesi global duyuru endpointine eklendi.
- Metro kayıtlarında başlık, özet, tespit edilen hat kodları ve gerçek detay sayfası bağlantısı korunuyor.
- Metro kaynağı için süreç içi cache, stale fallback, timeout ve source-health runtime metrikleri eklendi.
- İETT ve Metro kaynaklarından biri geçici olarak bozulduğunda diğer kaynak duyuruları gösterilmeye devam ediyor.
- Kaynak listesinin aşırı büyümesini önlemek için Metro en güncel 30, arayüz global paneli ilk 40 kaydı gösteriyor.

### Sınırlar

- Şehir Hatları ve Marmaray duyuruları henüz bağlanmadı; doğrulanmamış kayıt gösterilmiyor.

## 0.11.2 — İETT duyuru içeriği düzeltmesi

- İETT SOAP yanıtındaki gerçek büyük harfli alanlar (`HATKODU`, `HAT`, `TIP`, `GUNCELLEME_SAATI`, `MESAJ`) doğru eşleştirildi.
- Genel “İETT duyurusu” kartları yerine hat adı ve gerçek duyuru mesajı gösteriliyor.
- Duyuru kartlarındaki ana sayfaya yönlendiren yanıltıcı bağlantılar kaldırıldı; kaynak kapsamı panel altında açıklanıyor.
- “Hatı aç” metni “Hattı aç” olarak düzeltildi.

## 0.11.1 — Global duyuru görünürlüğü

### Eklendi

- Uygulama başlığından global aktif kesinti ve duyuru paneli açılabilir.
- Duyurular ulaşım türüne göre filtrelenebilir; hat kapsamı ve kaynak alınma zamanı gösterilir.
- Kaynak hatası, stale yanıt ve boş sonuç durumları kullanıcıya açıkça bildirilir.
- Mevcut doğrulanmış kapsamın İETT olduğu, Metro/Marmaray/vapur duyurularının henüz kapsanmadığı arayüzde belirtilir.

### Sınırlar

- Yeni upstream sağlayıcı eklenmedi; panel mevcut İETT duyuru endpointini global görünümde kullanır.
- Ortak cache/KV/DO, yol tarifi ve yolculuk planı bu sürümde kapsam dışıdır.

## 0.11.0 — Durak merkezli sefer akışı

### Eklendi

- Durak detayındaki her hat/yön için “Hatı aç” ve “Seferleri gör” eylemleri ayrıştırıldı.
- Kullanıcı, duraktan geçen hat listesinden doğrudan ilgili statik planlı sefer panelini açabilir.
- Durak merkezli akışta hat, yön ve durak bağlamı korunur; canlı araç görünürlüğü seçilen hatta devam eder.

### Sınırlar

- Planlı saatler hâlâ statik snapshot’tır; canlı ETA, gecikme veya yolculuk planı üretilmez.

## 0.10.0 — Bir sonraki araç görünürlüğü

### Eklendi

- Durak detayında seçili yön için canlı araç sayısı ve yaklaşan araç sayısı birlikte gösterilir.
- Araç durumu ETA üretmeden “durağa yaklaşıyor”, “durağa çok yakın”, “durağı geçmiş olabilir” veya “konum doğrulanamadı” olarak ayrıştırılır.
- Eski canlı konum, güzergâh dışı konum ve yönü doğrulanamayan araçlar kullanıcıya belirsizlik mesajıyla bildirilir.
- Her araçta son veri yaşı görünür tutulur; planlı sefer kartında canlı konumun tarife bilgisi olmadığı açıkça belirtilir.

### Sınırlar

- Dakika cinsinden varış tahmini, tarihsel veri modeli veya ortak cache eklenmedi.
- “Geçmiş olabilir” durumu güzergâh projeksiyonudur; özellikle eski veride kesin geçiş bilgisi değildir.

## 0.9.0 — Kaynak sağlığı ve canlı veri görünürlüğü

### Eklendi

- Canlı İETT araç ve duyuru kaynakları için upstream istek, hata, timeout, cache/stale fallback, son başarılı/başarısız istek ve ortalama yanıt süresi sayaçları.
- Ham hata metni veya kullanıcı verisi taşımayan sınıflandırılmış hata türleri: timeout, HTTP, yanıt, kota veya ağ sorunu.
- `/api/v1/source-health` içinde kaynak başına sade çalışma durumu ve admin/izleme araçlarının okuyabileceği runtime metrikleri.
- `/api/v1/source-health?monitor=1` çağrısında son kaynak sonucu başarısızsa `503`; harici uptime/alert aracı bu endpointi izleyebilir.
- İETT hat detayında kullanıcıya yönelik “Canlı kaynak durumu” açıklaması ve kaynak kesintisinde statik güzergâh/durakların çalışmaya devam ettiğini belirten erişilebilir durum mesajı.

### Sınırlar

- Bu sürüm Cloudflare KV, Durable Object veya ortak distributed cache eklemez. Sayaçlar Worker/Node örneği yaşam süresi boyunca tutulur; kalıcı SLA veya çoklu instance toplamı değildir.
- Harici alarm sağlayıcısı bağlanmadı; endpoint, seçilecek izleme aracının kullanacağı kararlı sözleşmeyi sağlar.

## 0.8.0 — Kaynaklı sefer kapsamı ve sağlamlaştırma

### Eklendi

- M7’nin Metro İstanbul kaynağındaki dört kısa işletme bölümü ayrı `segment` olarak yayımlandı.
- B1 Marmaray ve M11 için TCDD Taşımacılık API’sinden ilk/son kalkış snapshot’ları eklendi; ara saat tahmini yapılmaz.
- İETT duyuruları için sunucu cache, stale fallback, single-flight, rate limit, güvenli HTML temizleme ve hat eşleme katmanı eklendi.
- Snapshot yenileme/fark raporu, manuel `--apply` akışı ve bakım workflow’u eklendi.
- Playwright Chromium masaüstü/mobil E2E ve build sonrası performans raporu eklendi.

### Doğrulama

- 45 test, masaüstü 2/2 E2E, mobil 2/2 E2E, typecheck, lint, production build ve audit başarılı.
- Bilinmeyen kaynak yapısı, yön, istasyon veya saat snapshot üretimini durdurur.

### Bilinen uyarılar

- `iett-BA-2.json` ve `iett-97.json` ham 100 KB bütçesini aşıyor; veri kaybı riski nedeniyle değiştirilmedi.
- MapLibre client chunk’ı için 500 KB üstü build uyarısı devam ediyor.

## 0.7.2 — Durak ayrıntıları ve favori geri bildirimi

### Düzeltildi

- Durak ayrıntı panelindeki aç/kapat metni ve görsel durum göstergesi tutarlı hâle getirildi.
- Durak favoriye ekleme/çıkarma işlemlerinde toast bildirimi gösterildi.

## 0.7.1 — UX ve performans polish

### Eklendi
- Arama alanında `/` odak kısayolu, Enter ile ilk sonucu açma ve Esc ile kapatma.
- Favori, karşılaştırma ve bağlantı kopyalama eylemleri için erişilebilir Türkçe toast bildirimleri.
- Şehir ölçeğinde durak marker’ları ertelenerek harita çizim yükünün azaltılması; yaklaşıldığında durakların yeniden gösterilmesi.
- Statik sefer manifestleri için eklenen/silinen rotaları ve kaynak/geçerlilik değişikliklerini raporlayan bakım komutu.

### Doğrulama

- Test, typecheck, lint ve production build kontrolleri temiz geçti.

## 0.7.0-beta.3 — Planlı seferler ve kompakt hat paneli

### Eklendi

- Planlı sefer modalında statik snapshot alınma tarihi, geçerlilik bilgisi ve güncellik uyarıları görünür hâle getirildi.
- Canlı araç kartlarında veri tazeliği etiketleri ve açıklama tooltip’leri eklendi.
- Hat ayrıntı panelinde bölüm hızlı geçişleri ve tüm durakların açık görünümü düzenlendi.

## Yayımlanmamış — Sonraki fazlar

### Eklendi

- M1A, M1B, M2–M6, M8, M9, T1, T3, T4, T5, F1 ve F4'ün doğrulanmış yönleri için Metro İstanbul kaynağından alınan sade ilk/son hareket snapshot'ları.
- İlk/son hareket özetini uzun tarife tablosundan ayıran iki kutulu sefer paneli sunumu.
- Metro İstanbul sayfasındaki hat/yön/istasyon ve kısa ömürlü istek kodu sözleşmesini denetleyen parser ve fixture testleri.

- İşletmeciden bağımsız planlı sefer veri sözleşmesi; kaynak, alınma/geçerlilik tarihi, gün türü, yön, sefer ve durak saatlerini doğrular.
- Gece yarısını aşan `24:xx` saatlerini koruyan, geriye giden saatleri ve bilinmeyen gün türlerini reddeden sözleşme testleri.
- Sefer manifesti ve yalnız kullanıcı isteğiyle yüklenen hat bazlı sefer dosyası yapısı.
- Hat ayrıntısında planlı seferler için yükleniyor, kullanılamıyor, hata, eski/gelecek ve geçerliliği bilinmiyor durumlarını destekleyen sade panel.
- Şehir Hatları'nın resmî hat sayfalarından iki yönü, gün türlerini, ara iskele saatlerini, işaretli seferleri ve açıklama notlarını çıkaran statik üretim adımı.
- Vektör geometrisiyle yayımlanan 30 vapur hattının tamamı için 84 yön/gün deseni, 1.257 sefer ve 3.629 iskele saatinden oluşan kaynaklı snapshot.
- Ara iskeleden başlayan kısmi vapur seferlerinde gerçek ilk hareket iskelesini gösteren, kalkışları kronolojik sıralayan panel davranışı.
- İETT resmî hareket saatleri tablosunu yön, gün türü ve ÖHO işaretiyle ortak statik sefer sözleşmesine çeviren bakım betiği; varsayılan toplu istek yerine açık hat kapsamı veya `--all` onayı zorunluluğu.
- Türkçe karakterleri ve ayraçları normalleştiren; tam hat kodu, kod öneki ve token bazlı hat/durak aramasını önceliklendiren yerel keşif sıralaması.
- Seçili hattın planlı saatlerini ana ayrıntı panelini büyütmeden, yön ve gün türü seçimi içeren ayrı pencerede gösteren sefer saatleri akışı.

### Performans

- Sefer paneli açılmadan manifest isteği, seçili hatta ait dosya bulunmadan da sefer dosyası isteği gönderilmez.
- Kurum kaynakları çalışma anında çağrılmaz; sonraki işletmeci entegrasyonları doğrulanmış statik snapshot üretecek şekilde sınırlandırıldı.
- Vapur sefer dosyaları hat seçilene ve panel açılana kadar indirilmez; en büyük çıktı 100 KB bütçesinin altında kalır.

## 0.7.0-beta.2 — Tarifeler ve canlı veri güncelliği

### Eklendi

- İBB TUHİM’in 20 Temmuz 2026’dan itibaren geçerli İstanbulkart tarifesini kaynak/karar/son doğrulama metadata’sıyla saklayan sürümlü veri sözleşmesi.
- Genel tarife, Metrobüs, Marmaray, M11 ve desteklenen Şehir Hatları profilleri; 500T ve seçili vapur hatları için doğrulanmış hat eşleştirmeleri.
- `data:build-fares` komutu, statik tarife çıktısı ve tarife profil/eşleştirme sözleşme testleri.
- Hat detayındaki kompakt tarife kartı; istekle açılan kart türü ücretleri, mesafe bantları, limitler, kaynak bağlantısı ve geçerlilik bilgisini gösterir.
- `Uygulama hakkında → Tarifeler` penceresi; genel İstanbulkart fiyatlarını, 1–12 geçişlik sınırlı biletleri, resmî kaynak bağlantısını ve hat bazlı ücret uyarılarını sade bir görünümde sunar.
- Mavi Kart aylık abonmanları; kart türüne göre fiyat ve resmî aylık geçiş limitiyle tarife kataloğuna eklendi.

### Güvenilirlik

- İETT hatlarında resmî hat detayından doğrulanmamış özel biletli tarife sınıfı varsayılan olarak atanmaz; genel tarife durumu ayrı işaretlenir.
- E-3 hattı resmî İETT hat detayı ve TUHİM tarife satırıyla üç biletli, tüm kart türlerinde aynı ücretli profil olarak doğrulandı; kart türü açıklama ipuçları eklendi.
- Tüm 801 statik İETT hattı resmî hat detayındaki tarife sınıfıyla denetlendi; doğrulanmış sınıflar statik snapshot/rule eşleştirmesiyle yayımlanıyor. Kaynak sınıf döndürmeyen hatlar artık genel ücret varsaymak yerine `Tarife doğrulanıyor` durumunu gösterir.
- Seçili İETT hattının canlı araç yenilemesi ve sunucu taze önbelleği 30 saniyede eşitlendi; sekmeye dönüşte ve bağlantı yeniden kurulduğunda güvenli bir kontrol eklenirken üst kaynak kotası korunur.
- Hat ayrıntısı artık canlı konumun yeni kaynak yanıtı, taze önbellek veya önceki/fallback yanıt olduğunu açıkça belirtir.
- Canlı kaynağın ağ isteği iptalini uygulamadığı durumlarda paylaşılan hat sorgusunun süresiz beklemesini önleyen kesin 10 saniyelik timeout ve regresyon testi eklendi.
- Yerel/Cloudflare çalışma yapılandırmasındaki canlı taze önbellek varsayılanı, uygulama ve dokümantasyonla tutarlı biçimde 30 saniyeye indirildi.

## 0.7.0-beta.1 — Genişletilmiş statik ulaşım ağı

### Eklendi

- T1, T3, T4, T5 tramvay; F1, F4 füniküler ve B1 Marmaray hatları için kaynaklı statik güzergâh/istasyon paketleri.
- Şehir Hatları iç hat, Boğaz ve Adalar kapsamındaki 31 güzergâh ile 44 iskeleyi üreten statik veri hattı.
- Tümü/Otobüs/Raylı/Vapur filtresi; hat detayında kaynak bağlantısı, veri tarihi ve canlı/statik veri sınırı.
- Raylı sistem ve vapur paketlerinin kapsamını, koordinatlarını ve kaynak metadata'sını doğrulayan sözleşme testleri.

### Değiştirildi

- Vapur güzergâhları gerçek gemi iziyle karıştırılmaması için şematik geometri olarak etiketlendi.
- Uygulama açıklamaları yalnız İETT araçlarının canlı olduğunu; diğer ağların statik sunulduğunu açıkça belirtecek şekilde güncellendi.

## 0.6.0-rc.3 — Hosted harita düzeltmesi

### Düzeltildi

- MapLibre işçisinin bağımlı ortak modülü de yayın paketine eklendi; hosted preview’da güzergâh, durak ve istasyon katmanlarının çizilmesini engelleyen 404 giderildi.

## 0.6.0-rc.2 — Preview düzeltmesi

### Düzeltildi

- Ayrı yüklenen MapLibre worker dosyası Vite asset’i olarak açıkça paketlendi; hosted preview’da haritanın boş kalmasına ve rota/durak/istasyonların görünmemesine neden olan 404 giderildi.

## 0.6.0-rc.1 — Yayın öncesi sağlamlaştırma

### Eklendi

- M1A, M1B, M2–M9 ve M11 için yön bazlı statik güzergâh ve istasyon katalogları.
- Hat listesindeki sade `Tümü / Otobüs / Metro` filtresi, metro istasyon araması ve paylaşılabilir `metro:` hat bağlantıları.
- Metro İstanbul kaynak manifesti ve OpenStreetMap snapshot’ından statik çıktı üreten `data:build-metro` komutu.

### Değiştirildi

- Statik ulaşım veri sözleşmesi; gelecekte vapur ve minibüs ağlarını canlı veri zorunluluğu olmadan ekleyebilecek şekilde genişletildi.
- Metro detaylarında canlı araç bölümü yerine statik hat/istasyon bilgisi gösterilir.

### Güvenlik ve kalite

- Uygulama genelinde Content Security Policy, HSTS, anti-framing, içerik türü, referrer ve izin politikaları eklendi.
- Canlı araç API’sine kullanıcı başına dakikada 12 istek sınırı, üst kaynağa varsayılan saatlik istek bütçesi, daha uzun hata geri çekilmesi ve yanıt boyutu sınırı eklendi.
- CDN için canlı veri cache sözleşmesi `s-maxage`, stale-while-revalidate ve stale-if-error direktifleriyle netleştirildi.
- Vitest ile canlı veri normalizasyonu, güvenlik başlıkları ve hız limiti testleri eklendi.
- Cloudflare/Vite/Vinext ve React server bileşen bağımlılıkları güvenlik güncellemeleriyle yükseltildi; tam `npm audit` sonucu temizdir.
- MapLibre harita motoru, ilk uygulama kabuğunu hızlandırmak için ayrı yüklenen bir pakete taşındı.

## 0.5.0 - 2026-08-29

### Kararlı sürüm

- Yön bazlı canlı araç konumları, araç/durak odaklama, durak odaklı canlı bilgi ve kaynak güvenilirliği açıklamaları kararlı sürüme alındı.
- Canlı veri isteği için önbellek, aynı hat isteklerini birleştirme, kuyruk, hata sonrası geri çekilme ve eski veriye dönüş korumaları eklendi.
- Uygulama hakkında penceresi, kullanıcı bağlam belgeleri ve arayüz tutarlılığı iyileştirmeleri tamamlandı.

## 0.5.0-beta.14 - 2026-08-29

### Dokümantasyon

- Özellikler, veri kaynakları/sınırları, canlı veri performans yaklaşımı, sürüm düzeni ve sonraki aşamaları toplayan `PROJECT_CONTEXT.md` eklendi.

## 0.5.0-beta.13 - 2026-08-29

### Düzeltildi

- Uygulamadaki etkin düğmeler, bağlantılar ve düğme rollü etkileşimler için `pointer` imleci standartlaştırıldı.

## 0.5.0-beta.12 - 2026-08-29

### Eklendi

- Ana haritadan bağımsız açılan “Uygulama hakkında” penceresi
- Uygulamanın amacı, statik İBB açık veri kapsamı, canlı İETT kaynağı ve veri güvenilirliği sınırlarının tek yerde açıklanması

## 0.5.0-beta.11 - 2026-08-29

### Değiştirildi

- Canlı konum bilgisinin yalnız bilgilendirme amaçlı olduğu; güncellik, doğruluk ve olası konum sapmasının İETT kaynağına bağlı bulunduğu açıkça belirtildi.

## 0.5.0-beta.10 - 2026-08-29

### Performans

- Farklı hatlardan gelen canlı konum istekleri için sınırlı eşzamanlılıklı ortak yenileme kuyruğu eklendi.
- Aynı hattın bekleyen yenileme isteği paylaşılmaya devam ederken, kuyruk yoğunluğunda arayüz artık anlaşılır bir “sırada” durumu gösteriyor.
- Son başarılı canlı yanıt 10 dakika boyunca güvenli geri dönüş verisi olarak tutuluyor; başarısız bir hat 15 saniye boyunca tekrar kaynak isteği üretmiyor.
- Bellek içi canlı veri önbelleğine süre ve adet sınırı eklendi; uzun süre çalışan sunucuda kontrolsüz büyüme engellendi.

### Notlar

- Bu koruma katmanı tek uygulama sürecinde etkilidir. Çoklu örnekli üretim dağıtımı için Cloudflare KV/Cache, Durable Object veya Redis ile ortak önbellek ve hız limiti kurulmalıdır.

## 0.5.0-beta.9 - 2026-08-29

### Eklendi

- Durak detayında seçili hat ve yönde durağa yaklaşan en yakın üç canlı araç
- Araçların yaklaşık güzergâh mesafesine göre sıralanması ve tek tıkla haritada seçilmesi
- Canlı araç bulunmadığında yükleme, kaynak hatası ve boş durum açıklamaları

### Değiştirildi

- Duraktan geçen hatların göreceli “Gidiş/Dönüş” etiketleri başlangıç ve bitiş yönleriyle değiştirildi.
- Durak ve araç seçimleri birbirini kapatacak şekilde ayrıştırıldı; harita kartlarının üst üste gelmesi engellendi.

## 0.5.0-beta.8 - 2026-08-29

### Düzeltildi

- Kaydırılmış durak listesinin işaretçileri artık sabit hat başlığının üzerinde görünmüyor.
- Dar panel başlığındaki kaynak etiketi kompaktlaştırıldı; hat kodu ve başlık için daha fazla alan bırakıldı.

## 0.5.0-beta.7 - 2026-08-29

### Eklendi

- Seçili canlı aracın haritada daha büyük simge, dış halka ve güçlendirilmiş vurgu ile gösterimi

## 0.5.0-beta.6 - 2026-08-29

### Düzeltildi

- Statik İBB ağ verisi açıklamasındaki “anlık görüntüsü” ifadesi kaldırıldı.

## 0.5.0-beta.5 - 2026-08-29

### Değiştirildi

- Hat listesinin altındaki İBB açık veri özetine, statik anlık görüntünün veri tarihi eklendi.

## 0.5.0-beta.4 - 2026-08-29

### Eklendi

- Güzergâh veri setinin tarihi ve canlı konum servisinin son kayıt zamanı
- İETT kaynaklı verilerde gecikme veya tutarsızlık olabileceğini belirten kompakt veri notu

### Değiştirildi

- Teknik “güzergâh statik” ifadesi, arayüzde daha anlaşılır “resmî güzergâh” kaynak etiketiyle değiştirildi.

## 0.5.0-beta.3 - 2026-08-29

### Değiştirildi

- Göreceli “Gidiş/Dönüş” araç etiketleri yerine doğrudan “Başlangıç → Bitiş” yön adları gösteriliyor.
- Başlangıç ve bitiş durakları haritada renkli vurgu ve etiket, durak listesinde belirgin rozet kazandı.
- Statik güzergâh ile canlı araç verisinin farklı kaynak niteliği arayüzde daha açık ifade ediliyor.

### Doğrulandı

- Statik ağdaki 801 resmî hat kodunun tamamı canlı API doğrulama kuralıyla uyumlu.
- Sayısal, harfli, Türkçe karakterli, tireli ve metrobüs hat kodları canlı kaynakla denetlendi.

## 0.5.0-beta.2 - 2026-08-29

### Eklendi

- Canlı araç listesinde ve araç detay kartında belirgin “Gidiş/Dönüş” etiketi
- Duraklardan görsel olarak ayrılan otobüs piktogramlı canlı araç işaretçisi

### Düzeltildi

- Listedeki veya haritadaki canlı araca basıldığında haritanın araç konumuna odaklanması
- Canlı veri adaptörünün farklı biçimlerdeki tüm resmî hat kodlarıyla dinamik çalıştığının doğrulanması

## 0.5.0-beta.1 - 2026-08-29

### Eklendi

- Resmî İETT hat bazlı araç konum servisi için sunucu adaptörü
- Seçili hattın gidiş ve dönüş yönlerini ayrı gösteren canlı araç katmanı
- Araç kapı numarası, yönü, yakınındaki durak ve son konum yaşı bilgileri
- Kaynak kesintisinde son başarılı görüntüyü kullanabilen kısa süreli önbellek
- Eski konumları haritada soluk ve listede “ESKİ” etiketiyle ayırma

### Performans

- Yalnızca seçili hat sorgulanır; arka plandaki sekmelerde yenileme durur.
- İstemci 30 saniyede kontrol eder, sunucu aynı hat yanıtını 60 saniye önbelleğe alır.
- Eşzamanlı aynı hat istekleri tek upstream çağrısında birleştirilir.
- Resmî servisin saatlik sınırını korumak için süreç başına 90 çağrılık bütçe uygulanır.

## 0.4.2 - 2026-08-27

### Düzeltildi

- İşlevsel olmayan ana güzergâh sıfırlama eylemi kaldırıldı.
- Masaüstü harita kontrolünde “Haritadan seç” konum seçme eylemi geri getirildi.
- Hat karşılaştırma kartı tekil hale getirildi; karşılaştırma hatlarını temizleme eylemi korundu.

## 0.4.1 - 2026-08-27

### Eklendi

- Karşılaştırmaya eklenmiş tüm hatları tek eylemle temizleme
- Haritadaki durak ve araç seçimini kapatıp ana güzergâha yeniden odaklanan “Güzergâhı sıfırla” eylemi

## 0.4.0 - 2026-08-26

### Eklendi

- Tarayıcıda saklanan son bakılan hat ve duraklar
- Durak favorileri ve seçili durak kartından favoriye alma eylemi
- Haritadan seçilen konumu isteğe bağlı olarak bu cihazda hatırlama
- Tarayıcı konumu kullanıldığında bildirilen yaklaşık konum doğruluğu
- Durak seçimini de içeren paylaşılabilir bağlantılar
- Arama panelinde resmî veri kaynağı, hat ve durak kapsamı bilgisi
- Güzergâhların başlangıç ve bitişini gösteren harita işaretleri
- Aynı haritada en fazla üç hattı tutarak güzergâh karşılaştırma

### Gizlilik

- Favoriler, son bakılanlar ve isteğe bağlı manuel konum yalnızca tarayıcının yerel depolamasında tutulur.
- Konum veya tercih verisi uygulama tarafından sunucuya gönderilmez.

## 0.3.3 - 2026-08-26

### Eklendi

- Yakındaki duraklar panelinde “Haritadan seç” seçeneği
- Harita üzerinde tıklanan noktayı kullanıcı konumu olarak kabul eden seçim modu
- Manuel seçim sırasında yönlendirici açıklama ve iptal eylemi

### Değiştirildi

- Tarayıcı konumu yanlış olduğunda kullanıcı manuel konumla yakın durak sonuçlarını düzeltebilir

## 0.3.2 - 2026-08-26

### Eklendi

- Başlıktaki ve masaüstü harita kontrollerindeki “Yakındaki duraklar” eylemi
- Tarayıcı konumuyla mesafe hesaplanarak sıralanan en yakın 12 durak
- Haritada kullanıcının konumunu gösteren işaret
- Konum izni, konum hizmeti ve durak verisi hataları için açıklayıcı tekrar-dene durumları

### Gizlilik

- Konum bilgisi yalnızca tarayıcı belleğinde tutulur ve en yakın durakları hesaplamak için kullanılır; uygulama tarafından sunucuya kaydedilmez veya gönderilmez.

## 0.3.1 - 2026-08-26

### Eklendi

- Başlıktaki İstanbulum markasının yanında görünür sürüm rozeti

## 0.3.0 - 2026-08-26

### Eklendi

- Hat ve durakları aynı alanda arayan birleşik arama deneyimi
- Türkçe karakterlerden bağımsız durak adı ve bölge araması
- Her durak için o duraktan geçen hat ve yönleri üreten statik ters indeks
- Durak detay kartında geçen hatların yön ve durak sırası bilgileri
- Durak kartından başka bir hattın doğru yönüne doğrudan geçiş

### Değiştirildi

- Arama sonucu paneli hat ve durak sonuçlarını ayrı başlıklarla gösterecek şekilde genişletildi
- Arama performansı için durak sonuçları ilk 20 kayıtla sınırlandırıldı
- Veri üretim özeti oluşturulan aranabilir durak sayısını da raporlayacak şekilde güncellendi

## 0.2.0 - 2026-08-26

### Eklendi

- Hat ve yön seçimini koruyan paylaşılabilir URL desteği
- Tarayıcıda saklanan favori hatlar bölümü
- Seçilen durağın bölge, sıra, yön ve koordinat bilgilerini gösteren detay kartı
- Durağa ve güzergâhın tamamına odaklanan harita kontrolleri
- Hat aramasında boş sonuç ve canlı araç verisinde boş durum bileşenleri

### Değiştirildi

- Arama yalnızca MVP kapsamındaki hat kodu ve hat adına göre çalışacak şekilde netleştirildi
- Türkçe karakterlerden bağımsız hat araması iyileştirildi
- Masaüstü ve mobil harita etkileşimleri sadeleştirildi

### Korundu

- Gidiş ve dönüş yönlerinin ayrı geometri ve durak sıralarıyla gösterilmesi
- Mevcut MapLibre tabanlı harita, tema ve görsel tasarım

## 0.1.0

- İETT otobüs hatları için yön bazlı güzergâh ve durak gösterimini içeren ilk MVP
