# Masraf Fişleri — ilk altyapı

Firma çalışma alanının menüsündeki **Masraf Fişleri**, `/workspace/<FIRMA>/masraf/`
adresini açar. Telefonda aynı hesapla giriş yapmak yeterlidir; bildirim aboneliği
veya yeni bir cihaz eşleştirmesi gerekmez. Kamera düğmesi telefonun sistem kamera /
dosya seçicisini kullanır. Sürekli kamera akışı veya otomatik deklanşör bu sürümde yoktur.

## Kullanım

- Tek fotoğrafta tek fiş; bir seçimde en fazla 20 JPEG/PNG/PDF, dosya başına 8 MiB.
  HEIC dosyası okunmazsa JPEG olarak paylaşılmalıdır. PDF en fazla 8 sayfa okunur;
  aynı PDF içinde farklı fişleri birleştirmeyin.
- Kaynak dosya önce etkin firmanın sunucu arşivine kaydedilir. SHA-256 özeti aynı
  dosyanın tekrar eklenmesini engeller. Aynı belgenin farklı fotoğrafları vergi no,
  belge no ve tarih üzerinden olası mükerrer olarak işaretlenir.
- Okuma cihazda, Web Worker içinde mevcut Türkçe/İngilizce Tesseract motoruyla
  çalışır. Görselin iki okuma denemesi karşılaştırılır; sonuçlar farklıysa uyarılır.
  Motor/dil dosyaları uygulamada bulunur; belgeler harici OCR servisine gönderilmez.
- PDF metin katmanı kullanılır; yeterli metin yoksa sayfa görüntüsü okunur.
  Tarayıcı destekliyorsa BarcodeDetector ek bilgi olarak barkod/karekod okur.
  Kod içindeki adresler açılmaz ve doğrulanmamış değerler muhasebe alanlarına yazılmaz.
- Her masraf satırında yemek, unlu mamul, yakıt, otopark, uçak bileti, ulaşım,
  diğer seçenekleri vardır. Kategori hiçbir vergi oranını veya hesap kodunu varsaymaz.
  Karma KDV satırları ayrıdır. Satır toplamı ve KDV, belge toplamlarıyla karşılaştırılır.
- Belirsiz tarih, toplam, belge no veya KDV alanı boş bırakılır. OCR güven puanı
  doğruluk garantisi değildir. Her belge kaynakla karşılaştırılarak onaylanır.
- Aynı firmadaki diğer cihazlar listeyi 15 saniyede bir yeniler. Açık düzenleme
  otomatik yenilenmez. Kaydetme sürüm kontrollüdür; başka cihazın değişikliği ezilmez.
  Çakışma durumunda açık düzenleme JSON olarak indirilebilir.
- Arşive alma yalnızca görünürlüğü değiştirir; dosya ve satırlar silinmez.
- Çalışma yedeği alanları ve eşleştirmeleri içerir; kaynak görseller dahil değildir.
  Yedekten otomatik geri yükleme bu sürümün kapsamında değildir. Kaynak dosyalar
  özgün belge bağlantısından ayrıca alınabilir.

## Logo eşleştirmeleri ve sonraki adım

Her firma / kategori için hizmet-stok kodu, gider hesap kodu, masraf merkezi taslak
olarak saklanır. Bu alanlar tek başına Logo satın alma XML şemasını doğrulamaz.
**XML oluştur ve indir** düğmesi henüz kapalıdır. Bir profile `verified` değeri
ekleyerek bu kısıt aşılamaz; henüz doğrulanmış bir çıktı adaptörü yoktur.

Her masraf türü için aynı belgenin net görüntüsü ve Logo’ya doğru şekilde işlenmiş
XML çıktısı gerekir. Örnekler üzerinde başlık alanları, belge türü, cari/hizmet kodu,
satır miktar/birim/tutarları, KDV, masraf merkezi, yuvarlama, uçak bileti özel
alanları ve çok satırlı belgeler karşılaştırılacak. Sonrasında doğrulanmış adaptör
ve örneklerden türetilmiş testlerle XML aktarımı açılacak. Gerçek örnek dosyalar
Git deposuna konmayacak.

## Depolama ve sınırlar

Yeni kayıtlar mevcut `AUTH` binding'i üzerinden ayrı `expense-receipts-v1:<firma>`
Durable Object'lerinde tutulur. Mevcut faturalar, bildirimler veya eski satın alma
verileri taşınmaz. Dosyalar 96 KiB parçalarla atomik kaydedilir. Firma başına
500 kaynak belge / 250 MiB sınırı vardır; sınırda yeni yükleme reddedilir,
var olan belge silinmez. İleride daha büyük arşiv için R2 ve sayfalama eklenebilir.

API giriş oturumu ve etkin firma kontrolünden geçer; yazma istekleri aynı origin
ile sınırlıdır. Dosya imzası, gerçek gövde uzunluğu ve SHA-256 denetlenir. Kaynak
görüntüler ve API yanıtları önbelleğe alınmaz. Uygulamanın genel kamera politikası
değiştirilmez; bu sürüm `getUserMedia` kullanmaz.

## Doğrulama

`test/expenses.test.mjs`: metin alanları, kuruş hassasiyeti, belirsiz alanlar,
karma KDV, kategori tahmini, mükerrerlik, firma ayrımı, atomik kayıt, eşzamanlı
düzenleme, kaynak bütünlüğü, boyut sınırları ve XML çıkış kilidi.
`test/auth.test.mjs`: gerçek yerel Worker üzerinde oturum, firma, kaynak dosya
erişimi ve siteler arası yazma koruması.

Sentetik net fiş görseli gerçek OCR motoruyla tarayıcıda okundu. Kamera donanımı,
gerçek buruşuk/soluk fişler, uçak bileti biçimleri ve fiziksel iPhone/Android
cihazları bu aşamada doğrulanmış sayılmaz; kullanıcı örnekleriyle kalibrasyon gerekir.
