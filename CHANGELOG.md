# Değişiklik Günlüğü

Bu projedeki önemli değişiklikler bu dosyada belgelenir.

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
