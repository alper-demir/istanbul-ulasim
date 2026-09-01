# Değişiklik Günlüğü

Bu projedeki önemli değişiklikler bu dosyada belgelenir.

## Yayımlanmamış — Planlı sefer altyapısı

### Eklendi

- İşletmeciden bağımsız planlı sefer veri sözleşmesi; kaynak, alınma/geçerlilik tarihi, gün türü, yön, sefer ve durak saatlerini doğrular.
- Gece yarısını aşan `24:xx` saatlerini koruyan, geriye giden saatleri ve bilinmeyen gün türlerini reddeden sözleşme testleri.
- Sefer manifesti ve yalnız kullanıcı isteğiyle yüklenen hat bazlı sefer dosyası yapısı.
- Hat ayrıntısında planlı seferler için yükleniyor, kullanılamıyor, hata, eski/gelecek ve geçerliliği bilinmiyor durumlarını destekleyen sade panel.
- Şehir Hatları'nın resmî hat sayfalarından iki yönü, gün türlerini, ara iskele saatlerini, işaretli seferleri ve açıklama notlarını çıkaran statik üretim adımı.
- Vektör geometrisiyle yayımlanan 30 vapur hattının tamamı için 84 yön/gün deseni, 1.257 sefer ve 3.629 iskele saatinden oluşan kaynaklı snapshot.
- Ara iskeleden başlayan kısmi vapur seferlerinde gerçek ilk hareket iskelesini gösteren, kalkışları kronolojik sıralayan panel davranışı.
- İETT resmî hareket saatleri tablosunu yön, gün türü ve ÖHO işaretiyle ortak statik sefer sözleşmesine çeviren bakım betiği; varsayılan toplu istek yerine açık hat kapsamı veya `--all` onayı zorunluluğu.
- Türkçe karakterleri ve ayraçları normalleştiren; tam hat kodu, kod öneki ve token bazlı hat/durak aramasını önceliklendiren yerel keşif sıralaması.

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
