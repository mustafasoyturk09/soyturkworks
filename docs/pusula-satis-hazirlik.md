# Pusula satış faturası hazırlığı

`Satış Faturası Kesme` yalnızca PUSULA çalışma alanındadır. Önce önceki ayın
XML faturaları topluca sürüklenir. Okuma Excel veya tarih beklemeden başlar.
Ardından güncel Excel sürüklenir ve kesilecek tarih seçilir. Dosyalar hangi
sırayla eklenirse eklensin bilgiler yeniden eşleştirilir.

## XML esaslı hazırlama

- Her dosyada tek UBL Invoice okunur. XML ad alanı önekleri sabit değildir.
  UTF-8, UTF-16 ve tarayıcının desteklediği beyan edilmiş kodlamalar çözülür.
  Bozuk XML ve DTD/ENTITY reddedilir. Zarf içinde birden fazla fatura varsa
  ayrı XML dosyaları istenir. Eski PDF içe aktarma da korunur.
- Alıcı ve satıcı ayrı okunur: unvan, VKN/TCKN, adres, vergi dairesi, SS NO,
  senaryo, tür, para birimi, hizmet adı/açıklaması/satır notları, miktar/birim,
  fiyat ve fiyat baz miktarı, matrah, KDV ve tevkifat bilgileri alınır.
- XML’in bütün metin alanları ve nitelikleri kaynak alan yollarıyla ayrıntıda
  gösterilir. Gömülü eklerin dosya adı/türü ve boyut bilgisi gösterilir;
  özgün ekler değiştirilmeyen XML’de korunur. Gömülü XSLT çalıştırılmaz.
  `Özgün XML’i indir` kaynak dosyayı geri verir.
- Ticari unvan, SS NO, doğrulanmış şube ve tutar eşleştirmesi kullanılır.
  Aynı vergi numarasındaki şubeler birleştirilmez. Önceki ayın ilk günü kesilen
  asıl fatura önceliklidir; başka günün XML’i de tekil eşleşmeyle kullanılabilir.
  Aynı faturanın XML’i ve PDF’i varsa XML tercih edilir. Belirsizlik görünür kalır.
- Yeni matrah güncel Excel’in kesilecek tarihe ait Bakım-Kira sütunundan gelir.
  Önceki matrah kaynak faturadan gelir. Bir hizmet varsa yeni matrah ona
  uygulanır; çok hizmet varsa dağılım tahmin edilmez. Farklar kontrol bekler.
  LİS-Diğer, E-Arşiv, Biruni, ay sonu Sentez ve sıfır matrah dışarıda kalır.
- Açıklama ve notlardaki kaynak ay adı seçilen fatura ayına çevrilir. Büyük/küçük
  harf korunur; ayın yanındaki yıl da Aralık/Ocak geçişinde yenilenir. SS NO
  değerleri korunur. Kaynak XML değişmez. Yazıyla tutar yeniden hesaplanır;
  eski YALNIZ tutarı ile yanındaki özel not birbirinden ayrılır.
- XML resmi toplamları satır hesaplarıyla karşılaştırılır. İskonto/masraf,
  ek vergi, desteklenmeyen fatura türü veya birden fazla tevkifat uygulaması
  hazır sayılmaz; kontrol nedeni gösterilir. Bu altyapı bu türlerin yeni ay
  hesaplarını sessizce tahmin etmez.

## PDF karşılaştırması

`Önizle` solda önceki XML’den üretilen PDF görünümünü, sağda yeni tarih ve Excel
matrahıyla hazırlanan PDF’i açar. XML’den görünüm ortak bir şablon kullanır;
entegratörün özgün tasarımı çalıştırılmaz. Önceki PDF’nin ek sayfalarında tüm
XML alanları bulunur; yeni PDF’de taşınan ek bilgiler ayrıca gösterilir.
Dosyalar ayrı ayrı PDF indirilebilir. Eski PDF kaynaklarda özgün düzeni koruyan
önizleme çalışmaya devam eder. Telefonlarda belge geçişi, diğer ekranlarda yan
yana görünüm ve yakınlaştırma vardır.

Yeni PDF `KONTROL ÖNİZLEMESİ / GÖNDERİLMEDİ` işaretlidir. Örnek numara kullanır;
eski QR/ETTN yeni faturaya aktarılmaz. İzibiz taslak/gönderim veya Logo kaydı
yapılmaz. Gerçek gönderim bu değişikliğin kapsamında değildir.

## Kayıt ve temizleme

Hazırlık firma kapsamlı yerel kayıtta, kaynak dosyalar aynı modülün IndexedDB
alanında saklanır. Kaynak dosyalar sunucuya gönderilmez. JSON yedeği hazırlığı
ve kontrol nedenlerini korur; kaynak XML/PDF/Excel dosyalarını içermez.

Tarihin solundaki `Tümünü Temizle`, ekrandaki kısa onaydan sonra bu modülün
Excel ve XML/PDF dosyalarını, hazırlık satırlarını, silinenleri, aramayı ve tarihi
sıfırlar. Yenilemede dosyalar geri gelmez. Diğer modüllere dokunmaz. Satırdaki
`Sil / Geri al` ise tek satırı etkiler.

Gerçek çalışma dosyaları Git’e/dağıtıma alınmaz; testler uydurma XML’lerle yapılır.
Kaynaklar `src/sales-issue.*`, mobil düzen `src/mobile.css` içindedir. Taşınabilir
şablon `node scripts/sync-portable.mjs` ile eşitlenir; `npm run build`,
`npm run check`, `npm test` ve tarayıcı kontrolleri sonrasında `dist/` birlikte
kaydedilir.
