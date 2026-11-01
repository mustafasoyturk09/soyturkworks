# Pusula satış faturası hazırlığı

`Satış Faturası Kesme` yalnızca PUSULA çalışma alanında görünür. Diğer firmalarda
menü ve sayfa kaldırılır; merkezi sayfa yönlendiricisi de bu kısıtı uygular.
Mevcut Satış Faturaları ve Gelen E-Fatura Takip modülleri bağımsızdır.

Bu sürüm **yalnızca hazırlıktır**. Modülün JavaScript kodunda ağ isteği bulunmaz.
İzibiz taslak, gönderim ve Logo kayıt işlemleri uygulanmamıştır. Arşiv indirme ve
Logo XML düğmeleri devre dışıdır. Önizleme resmi fatura veya vergi hesabı değildir.
Yerel kontrol tamamlanması, cari veya posta kutusu doğrulaması anlamına gelmez.

## Kaynaklar ve çalışma durumu

Ekrandaki `Nasıl kullanacağım?` rehberi kaynak ekleme, satır inceleme ve önizlemeyi
anlatır. `Güncel excel listesini ekle` ve `Önceki ayın PDF'lerini ekle` kutuları
dosya seçiminin yanında sürükle-bırak da destekler. Satır ayrıntısındaki
`Seçili PDF’i aç` referansı ayrı sekmede açar; doldurulan hazırlık alanları açık kalır.

- Fatura tarihi tek dönem kaynağıdır. 2 Kasım 2026 seçimi Kasım 2026 sütununu,
  Aralık tarihi Aralık sütununu bağlar. Dönem alanı salt okunurdur. Aynı ayın
  `Bakım-Kira` sütunu tercih edilir; `LİS-Diğer` bu akışa dahil edilmez. Eksik
  veya birden fazla eşleşen sütunda işlem durur; önceki aydan tutar alınmaz.
- Renk seçimi kaldırılmıştır. Boyasız satırlar da okunur; E-Arşiv, Biruni ve
  Sentez Sağlık şirket kayıtları alınmaz. Başka tüzel kişiliğe ait bir şubenin
  adında Sentez bulunması tek başına o şirketi Sentez Sağlık yapmaz. Sıfır matrah
  dışarıda kalır. SS NO tek başına E-Fatura mükellefiyeti kanıtı değildir.
- Seçilen ayın tutarı önceki ayın aynı Bakım-Kira sütunuyla karşılaştırılır.
  Önceki ay yoksa başka ayla karşılaştırma yapılmaz. Fark varsa eski/yeni tutar
  ve fark gösterilir; ilk fark inceleme penceresinde açılır. Aynı tutara düzeltme
  veya açık fark onayı karşılaştırmayı yeşile çevirir. Bu renk İzibiz doğrulaması
  veya gönderime hazır olma anlamına gelmez. Para birimi değişiminde çevrim yapılmaz.
- Tutarlar kuruş olarak saklanır. Açıkça iki ondalıklı Excel gösterimi varsa o
  gösterim kullanılır ve ayrıntıda belirtilir. Bunun dışındaki fazladan hassasiyet
  veya sonuç değeri olmayan formül kontrol sorunu olarak kalır. Para birimi
  biçimden okunur; kullanıcı tutarı ve para birimini ayrıca onaylar.
- Kaynak PDF'ler bu tarayıcıdaki firma kapsamlı IndexedDB alanında saklanır.
  PDF içeriği otomatik cari eşleşmesi olarak kullanılmaz; kullanıcı satıra referans
  seçebilir ve dosyayı açabilir. Dosya adına dayanarak doğrulanmış müşteri üretilmez.
- Hazırlık listesi firma kapsamlı `pusula_sales_preparation_v1` anahtarındadır.
  JSON yedeği satırları içerir; PDF dosyalarını içermez. Başka cihazda PDF'ler yeniden
  eklenmelidir. Gerçek çalışma dosyaları dağıtıma veya Git deposuna dahil edilmez.
- Excel dosyası da firma kapsamlı IndexedDB içinde tutulur; yenilemeden sonra tarih
  değişince yeni ayın hücreleri tekrar okunabilir. Yeni dönem sütunu bulunamazsa
  eski tutarlar boşaltılıp işlem bekletilir. Benzersiz şube/cari/SS NO eşleşmesinde
  referans bilgileri korunur; tutar ve onaylar taşınmaz.
- Dönem değişimi matrah ve referans onaylarını sıfırlar. Tutar/para birimi değişimi
  matrah onayını, referans alanı değişimi inceleme onayını sıfırlar.
- Her satırın Sil düğmesi yalnızca o satırı Silinenler bölümüne taşır. Satırın
  kendi Geri al düğmesi geri getirir. İşlem yenileme, yeniden içe alma ve ay
  değişiminde korunur; diğer satırlar ve kaynak Excel değişmez.
- Listeyi temizleme hazırlığı sıfırlar; saklanan Excel ve referans PDF kopyalarını
  korur. JSON yedeği ham Excel/PDF dosyalarını içermez; farklı cihazda kaynaklar
  yeniden eklenmelidir. Otomatik İzibiz PDF indirme henüz bağlı değildir.

## Sonraki aşamanın koşulları

Canlı işlem ayrıca yetkilendirilmeden bağlanmamalıdır. İzibiz cari kimliği,
VKN, şube adresi, posta kutusu, satır açıklamaları ve tutarları, SS NO/sipariş
bilgileri, özel notlar ve tevkifat bilgileri doğrulanmalıdır. Çok satırlı
faturalarda yeni dönem tutar dağılımı ayrıca belirlenmelidir.

İlk gerçek deneme tek faturadır. Gönderim, sonuç sorgulama, özgün UBL/PDF arşivi
ve Logo aktarımı ayrı aşamalardır. Mevcut Logo XML modülünün varlığı, yeni
modülde aktarımın bağlandığı veya Logo'da kaydın oluştuğu anlamına gelmez.

Arayüz `src/sales-issue.html`, `src/sales-issue.css`, `src/sales-issue.js`
dosyalarındadır. HTML parçası ve taşınabilir sürüm `node scripts/sync-portable.mjs`
ile `src/app.html` içine eşitlenir. Sonra standart build/check/test çalıştırılır.
