# Pusula satış faturası hazırlığı

`Satış Faturası Kesme` yalnızca PUSULA çalışma alanındadır. Tek ekranda bir
fatura tarihi, bir güncel Excel alanı ve önceki ay PDF’leri için bir alan vardır.
Ayrı bir kolon eşleme, üçüncü Excel yükleme veya arşiv/gönderim adımı yoktur.
`Ne yapacağım?` rehberi ilk açılışta açıktır; kullanıcının kapatma tercihi saklanır.

## Otomatik hazırlama

- Fatura tarihi ekranda ve önizlemede GG-AA-YYYY biçimindedir (ör. 03-11-2026); içeride ISO tarih olarak saklanır. Tarih tüm satırlara ve önizlemelere uygulanır. Tarihin ay/yılına ait
  Bakım-Kira sütunu ve TİCARİ UNVAN başlığı otomatik bulunur. LİS-Diğer, E-Arşiv,
  Biruni, ay sonu Sentez ve sıfır matrah kayıtları bu akışa alınmaz. Yeni ay sütunu
  eksikse eski tutarla devam edilmez; renkli Excel hücresi gerekmez.
- Önce önceki ayın ilk günü kesilen asıl faturalar seçilir (Kasım 2026 için 01-10-2026). Daha sonraki tarihli belgeler tutarı eşleşse bile asıl faturanın yerini almaz. Eşleştirme PDF’nin SAYIN alıcı bloğundaki ticari unvanı Excel ticari unvanıyla
  karşılaştırır. Satıcının vergi numarası alıcı yerine alınmaz. Yasal unvanların
  yaygın kısaltmaları normalleştirilir; benzer veya birden fazla sonuç kullanıcıya
  öneri olarak gösterilir. Vergi numarası tek başına şube seçtirmez. Önceden doğrulanan şube adresi/SS NO hatırlanır. Hizmet notu taşıyan Excel unvanlarında ELİS/LİS gibi ekler şirket adıyla karıştırılmaz; ilgili hizmet PDF’i ayrıca ayırt edilir.
- SS NO varsa önce tam SS NO eşleşmesi aranır. Aynı unvan/VKN’de farklı adres,
  SS NO, hizmet veya matrah bulunan PDF’ler birleştirilmez. Tam unvan ve tekil Excel/PDF tutarı eşleşmesi kullanılır; güncel ve önceki Excel tutarları farklı şubelere işaret ediyorsa otomatik karar verilmez. Belirsiz sonuçta
  adres, SS NO, matrah, fatura türü ve açıklamalar gösterilir; kullanıcı bir PDF
  seçer. Aynı PDF’nin birden fazla Excel satırına bağlanması ayrıca işaretlenir.
- Alıcı unvanı, VKN/TCKN, vergi dairesi, adres, SS NO, satır açıklamaları,
  miktar/birim, KDV, senaryo, tevkifat kodu/oranı, alt notlar ve tam tevkifat sebebi
  PDF metninin konumlarından okunur. Varsayılan Ticari - Satış’tır; PDF’deki
  Temel - Satış ve Tevkifat bilgileri korunur ve değiştirilebilir.
- Yeni matrah **her zaman güncel Excel’den** gelir. Karşılaştırma önceki ayın
  Excel sütunuyla değil eşleşen PDF matrahıyla yapılır. Farklı tutar turuncu
  satırla gösterilir; `Fark doğru` veya ayrıntıyı kaydetme kontrolü tamamlar.
  Aynı tutar ve tam bilgilerde satır doğrudan `Bilgiler hazır` görünür.
- Tek hizmette Excel tutarı o hizmete uygulanır. Çok hizmetli faturada eski
  satırlar aynen korunur; toplam yeni Excel matrahına uymuyorsa kontrol bekler.
  Kullanıcı `Excel tutarını aynı oranla dağıt` seçeneğini açıkça kullanabilir
  veya hizmetleri düzenleyebilir; dağılım sessizce tahmin edilmez.
- YALNIZ bölümündeki eski yazıyla tutar ayrı tutulur. Yeni yazıyla tutar yeni
  hizmet toplamı, PDF’deki KDV ve varsa tevkifat oranından hesaplanır. Yanındaki
  ek metinler ve diğer alt notlar ayrı düzenlenebilir satırlardır. Her notta
  Sil / Geri al bulunur. Banka alanı yalnızca soldaki özgün PDF’de bulunur; yeni önizlemeye kopyalanmaz. İzibiz’in kendi banka bilgileri bu modülde değiştirilmez.
- PDF’den okunamayan alanlar ve görüntü olarak taranmış PDF’ler açıkça
  işaretlenir; veri veya vergi numarası uydurulmaz. Kaynak metnin tamamı ve
  özgün PDF ayrıntıda açılabilir. Otomatik OCR bu modülde bağlı değildir.

## Yan yana PDF önizlemesi

Her satırın `Önizle` düğmesi aynı pencerede solda özgün önceki ay PDF’ini,
sağda yeni tarih/Excel tutarıyla oluşturulan gerçek bir PDF önizlemesini gösterir.
Telefonlarda iki belge arasında geçiş, tüm ekranlarda yakınlaştırma vardır.
Belgeler ayrı kaydırılabilir; tüm sayfalar gösterilir. Eşleşmiş belgede özgün PDF’nin sayfa görüntüsü, logosu, sağ bilgi çerçevesi, tablo çizgileri ve boş satırları korunur. Değişen tarih, numara, tutarlar ve notlar aynı alanlara yazılır. Türkçe font kullanılır; alana sığmayan metin atlanmaz, ek açıklama sayfasına alınır.

Yeni PDF belirgin `KONTROL ÖNİZLEMESİ / GÖNDERİLMEDİ` işaretlidir. Numara `XXX2026…` biçiminde örnek bir yer tutucudur; gerçek seri tahsisi yapılmaz. Eski faturanın QR ve ETTN’si yeni önizlemede kullanılmaz; resmi gönderim sonucu üretilmez. Düzenleme alanları önizlemenin
altındaki açılır bölümde yer alır. Değişiklik önizlemeye otomatik yansır.

## Kayıt ve izolasyon

Hazırlık eski `pusula_sales_preparation_v1` anahtarında, kaynak Excel ve PDF’ler
eski firma kapsamlı IndexedDB alanında saklanır. Mevcut kayıtlar silinmez.
Eski JSON yedekleri okunur; yeni yedeklerde hizmetler, not silme tercihleri,
referans bilgileri ve şube seçimleri korunur. Yedek ham Excel/PDF içermez.
Başka cihazda bulunmayan kaynak dosyalar yeniden eklenmelidir.

Silme sonrasında hemen görünen Geri al düğmesi ve sayılı Silinenler filtresi bulunur. Her fatura satırının Sil / Geri al işlemi yalnızca o satırı etkiler; yenileme,
yeniden içe alma ve dönem değişiminde korunur. Listeyi temizleme kaynak PDF/Excel
kopyalarını ve diğer modülleri silmez. Gerçek çalışma dosyaları dağıtıma ve
Git’e dahil edilmez. Dosyalar yalnızca kullanıcının tarayıcısında işlenir.

## Gönderim kapalı

Modül İzibiz taslak/gönderim, müşteri/posta kutusu doğrulama veya Logo kaydı
servislerini çağırmaz. `Bilgiler hazır` yalnızca yerel hazırlık kontrolüdür.
PDF önizlemesi resmi fatura değildir. Canlı işlem ayrı bir kullanıcı talebi
olmadan bağlanmamalıdır. Gelen E-Fatura bağlantıları ve telefon bildirim
abonelikleri bu modülün dışında kalır; güncellemeyle sıfırlanmaz.

HTML/CSS/JS kaynakları `src/sales-issue.*` içindedir. Taşınabilir şablon
`node scripts/sync-portable.mjs` ile eşitlenir; build/check/test ve tarayıcı
kontrolleri sonrasında `dist/` birlikte yayınlanır.
