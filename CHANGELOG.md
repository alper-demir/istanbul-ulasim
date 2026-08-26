# Değişiklik Günlüğü

Bu projedeki önemli değişiklikler bu dosyada belgelenir.

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
