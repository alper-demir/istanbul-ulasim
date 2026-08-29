# Değişiklik Günlüğü

Bu projedeki önemli değişiklikler bu dosyada belgelenir.

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
