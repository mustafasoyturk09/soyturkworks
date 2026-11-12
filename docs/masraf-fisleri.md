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
- Her masraf satırında yemek (unlu mamuller dahil), araç yıkama, yakıt, otopark, uçak bileti, ulaşım,
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

## Logo aktarımı

Koyu arayüzde fiş ekleme, belge kontrolü ve XML indirme adımları bulunur.
Menü bağlantısı Gelen E-Fatura Takip ile Satış Faturaları arasındadır.
Kart seçimi kullanıcıya aittir; OCR kartı otomatik seçmez. Seçenekler:
`309.07 (9190 KK)` ve `309.03 (3915 KK)`. Seçim kayıt sürümüyle birlikte saklanır.

Kullanıcının yerel XML örneklerinden türetilen `PURCHASE_INVOICES / INVOICE TYPE=4`
adaptörü TL hizmet faturası üretir. Pusula için yemek, otopark, yıkama ve ulaşım
hizmet/gider/merkez kodları örneklerden gelir; diğer firmalara taşınmaz. KDV oranı
belgeden alınır. %1 unlu mamul yemek olarak kalır; bu oran için KDV hesabı ayarlardan
tanımlanmalıdır. Uçak bileti aktarımı desteklenir; dövizli belgelerin aktarımı henüz açık değildir.
Kaynak görseller, tarihler, belge numaraları ve satıcı kimlikleri depoya eklenmez.

XML öncesinde belge onayı, kart seçimi, toplamlar, mükerrerlik ve hesap eşleştirmeleri
denetlenir. Satır toplamları belge toplamına tam eşit olmalıdır; en fazla iki kuruşluk
KDV yuvarlama farkı son KDV'li satıra dağıtılarak basılı belge toplamı korunur.
Yeni kayıtlar `DBOP=INS` ile, eski Logo iç referansları ve muhasebeleştirme bayrakları
kopyalanmadan hazırlanır. XML biçimi ve hesaplar otomatik testlerle kontrol edilir;
Logo masaüstü uygulamasında gerçek içeri alma işlemi ayrıca doğrulanmalıdır.

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
düzenleme, kaynak bütünlüğü, boyut sınırları ve örnek temelli XML üretimi.
`test/auth.test.mjs`: gerçek yerel Worker üzerinde oturum, firma, kaynak dosya
erişimi ve siteler arası yazma koruması.

Sentetik net fiş görseli gerçek OCR motoruyla tarayıcıda okundu. Kamera donanımı,
gerçek buruşuk/soluk fişler, uçak bileti biçimleri ve fiziksel iPhone/Android
cihazları bu aşamada doğrulanmış sayılmaz; kullanıcı örnekleriyle kalibrasyon gerekir.

## Kalıcı işlem notları — 12 Kasım 2026

- Kullanıcı yakıt ve otoparkın aynı şekilde işlenmesini istedi. Pusula varsayılanları
  aynı hizmet, gider, KDV ve KKEG hesaplarını kullanır; kaydedilmiş firma ayarları korunur.
- Yerel otopark/yıkama örnekleri KDV dahil (`VAT_INCLUDED=1`), miktar 1, birim ADET
  olarak düzenlenmiştir. Belge üzerindeki KDV oranı ve tutarı ayrıca doğrulanır;
  kategori tek başına KDV oranı belirlemez. Kod içindeki `gross` daima KDV dahil tutardır.
- GİB'in 12.11.2026 tarihinde kontrol edilen açıklamasında, ilgili istisnalar hariç
  binek otomobil giderlerinin en fazla %70'i indirilebilir. Bu oran yıllık kira ve
  amortisman parasal sınırlarından ayrıdır. 2027'de değiştiği varsayılmaz;
  belge yılına ilişkin resmî kaynak yeniden kontrol edilir.
- Otopark/yıkama örnek XML'lerinde matrah ve KDV tam tutardır; KKEG gider ve KDV
  hesap kodları vardır, açık bir %70/%30 oran alanı yoktur. `DEDUCTIONPART1=2` ve
  `DEDUCTIONPART2=3` alanları %70 kuralı olarak yorumlanamaz. XML'e tahmini oran
  eklenmez, tutarlardan ikinci kez %30 düşülmez. Logo hizmet kartı / muhasebeleştirme
  tanımının %70 gider ve ilişkili KKEG uygulaması ayrıca doğrulanmalıdır.
- Pusula yakıt, otopark ve yıkama XML'i için 2026 dışındaki belge yılları, mevzuat
  ve Logo tanımları doğrulanana kadar dışa aktarılamaz; kayıt/düzenleme korunur.
- Uçak bileti için kullanıcının belirttiği hesap: KDV tutarı × 100 / doğrulanmış
  KDV oranı = vergiye tabi matrah; matrah + KDV = KDV'li brüt;
  belge genel toplamı − KDV'li brüt = KDV'siz kısım. Toplamdan yalnızca matrah
  çıkarılmaz. Negatif kalan veya toplam uyuşmazlığı varsa aktarım durmalıdır.
  %20 her belge ve yıl için koşulsuz sabitlenmez. Uçak bileti XML'i 12.11.2026 tarihinde okundu: iki satırda `770.02.014` hizmet/gider, KDV'li satırda `191.01.004`; masraf merkezi ve KKEG alanı yok. Fiyatlar KDV hariç (`VAT_INCLUDED=0`), `TOTAL_SERVICES` net satır toplamıdır. Düzenlemede Uçak bileti seçilir, KDV oranı elle doğrulanır ve tutarlar ayır düğmesiyle iki satıra bölünür. Ödeme kartını kullanıcı seçer.

Resmî kaynak:
https://www.gib.gov.tr/vergi-konulari/2_isletme_ve_girisimci/18_binek_otomobillerde_gider_ve_amortismanlarin_vergi_matrahindan_indirimi/18

## Satırda KDV dahil/hariç ve açıklama düzeltme

Her satırda KDV Dahil/Hariç seçimi saklanır ve Logo `VAT_INCLUDED` alanına yazılır.
Eski fiş satırları Dahil açılır. Hariç seçiliyse girilen tutar KDV hariç fiyat,
Dahil seçiliyse KDV dahil fiyattır. KDV, satır toplamı ve belge toplamı seçime göre
yeniden karşılaştırılır. Örnek uçak bileti bölme işleminde iki satır da Hariç açılır.
`Logo satır açıklaması` alanındaki metin kullanıcının düzenlediği biçimiyle XML
`DESCRIPTION` alanına yazılır. OCR taslağında fiş numarası ve satıcı önerilir;
sonraki kullanıcı düzenlemesine otomatik önek eklenmez.
