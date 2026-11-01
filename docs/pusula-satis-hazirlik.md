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

- XLS/XLSX dosyası tarayıcıda okunur. Sayfa ve sütun eşleştirmesi görünürdür;
  `2025-2026` sayfası varsa önerilir. En son dolu dönem sütunu önerilir, yeni dönem
  tutarları olarak onaylanmaz. Excel satır sırası ve hücre adresleri korunur.
- Varsayılan seçim sarı matrah hücrelerini ve kırmızı ay sonu kayıtlarını kapsar.
  E-Arşiv ve sıfır matrahlar hariç tutulur. SS NO alanı tek başına E-Fatura
  mükellefiyetini kanıtlamaz. Aynı unvana sahip şubeler birleştirilmez.
- Kırmızı kaynak rengi ay sonu grubuna alınır; kullanıcı satır ayrıntısından
  grubu düzeltebilir. Ortak tarih ay başı içindir; ay sonuna kopyalanmaz.
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
- Dönem değişimi matrah ve referans onaylarını sıfırlar. Tutar/para birimi değişimi
  matrah onayını, referans alanı değişimi inceleme onayını sıfırlar.
- Listeyi temizleme yalnızca bu modülün hazırlığını ve yerel PDF kopyalarını siler.

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
