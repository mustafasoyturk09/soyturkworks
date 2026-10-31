# İzibiz gelen fatura bağlantısı

Gelen E-Fatura Takip modülündeki İzibiz düğmesi seçili firmaya bağlıdır. Her
firma ilk kullanımda bir kez bağlanır ve kayıt klasörü seçilir. Daha sonra eski
Excel yüklenip İzibiz'e basıldığında ayar ekranı açılmadan indirme başlar. Küçük
ayar düğmesi bağlantıyı, klasörü veya tarih aralığını değiştirmek için kullanılır.
İlk kullanımda eski Excel zorunlu değildir; eski dosya yoksa reddedilmemiş ve
işlenmiş olarak işaretlenmemiş faturalar yeni sayılır. Varsayılan sorgu dönemin
ilk gününden bugüne kadardır; son faturanın tarihinde kesilmez. Ayarlarda elle
seçilen tarih aralığı indirme düğmesine basıldığında korunur.

## İndirme düzeni

- Yalnızca seçilen klasöre doğrudan yazılır; ZIP ve tek tek tarayıcı indirmeleri yok.
- Örnek klasör: `İndirilenler/Pusula - Gelen E-Faturalar/`.
- Yeni PDF'ler ve bir karşılaştırılmış Excel doğrudan bu klasördedir. PDF/XML,
  tarih/saat veya başka ara klasörler oluşturulmaz.
- PDF adı: `GÖNDEREN FİRMANIN TAM UNVANI A.Ş. - FATURA_NO.pdf`. Unvan, doğrulanmış
  fatura XML'indeki ticari unvandan alınır. A.Ş., LTD. ŞTİ. ve diğer yasal unvan
  bölümleri korunur. Dosya sisteminin izin vermediği karakterler temizlenir.
- Excel adı: `Pusula - Gelen Faturalar (30.10.2026).xlsx`. Tarih, indirme işleminin
  yapıldığı günün İstanbul tarihidir; fatura döneminden alınmaz. Aynı kural bütün
  firmalar için geçerlidir.
- Excel iç başlığında firma adı Türkçe kurallarla büyük harflidir: `PUSULA`.
- Önceki dosyaların üzerine yazılmaz. Aynı PDF içeriği mevcutsa yeniden yazılmaz;
  aynı adlı farklı dosyalara `(2)`, `(3)` eklenir.
- XML yalnızca fatura numarası, ETTN, alıcı VKN/TCKN ve tam gönderen unvanını
  doğrulamak için bellekte işlenir; ayrıca XML dosyası indirilmez.

Klasör seçimi ve yazma izni firma bazlı tarayıcı veritabanında saklanır. Tarayıcı
izni yenilemek isterse bir kez sorabilir. Doğrudan klasör kaydı desteklenmeyen
Safari/telefon tarayıcılarında bilgisayardaki Chrome veya Edge kullanılması
istenir; ZIP'e veya çoklu indirme istemlerine geçilmez.

## Excel karşılaştırması ve yanıtlar

### Aylık toplam

Son kutu, aktif firmanın yeni Excel veya İzibiz listelerinden yüklenen benzersiz
fatura numaralarını fatura tarihindeki aya yazar. “İşlendi” işaretini beklemez;
reddedilmiş faturalar dahil yüklenen listedeki her fatura bir kez sayılır. Eski
karşılaştırma Excel'ini tek başına yüklemek bu sayacı artırmaz. Tekrar yükleme
ve İzibiz yenilemesi mükerrer sayı oluşturmaz.

Kutu varsayılan olarak İstanbul takvimindeki güncel ayı gösterir; ay ve yıl
geçişleri otomatik güncellenir. Kasım'da yüklenen Ekim tarihli yeni bir fatura
Ekim toplamına eklenir. Önceki aylar son kutunun dönem seçiminden görülebilir;
“Bu ay” seçeneği otomatik güncel ay görünümüne döner. Tarihi okunamayan kayıtlar
aylık toplama eklenmez ve kutuda adetleri belirtilir; aynı fatura daha sonra
geçerli tarihle yüklendiğinde ait olduğu aya eklenir.

“Temizle” geçici dosyaları, ilk üç kutunun değerlerini ve İzibiz durum mesajını
siler; aylık toplamı korur. Sayılar şirketlere ayrılmış tarayıcı kaydında tutulur;
aynı tarayıcıda sayfayı yenilemek veya firma değiştirmek toplamları silmez.
Taşınabilir ayarlı kopyanın verilerine yalnızca aktif firmanın aylık kayıtları
eklenir. Bu kayıt sunucuya veya farklı tarayıcılara otomatik eşitlenmez.

Güncel İzibiz listesi tüm sayfalarıyla alınır ve eski Excel'deki fatura numaraları
ile karşılaştırılır. Önceden yüklenen ham listedeki elle işlenmiş işaretleri
korunur. Yalnızca yeni, reddedilmemiş faturaların PDF'leri alınır. Tüm PDF'ler
başarıyla kaydedildikten sonra karşılaştırılmış Excel aynı klasöre yazılır.
İndirme yarıda kalırsa arayüz kaydedilen adetle birlikte tamamlanmadığını belirtir.
Yeni fatura bulunmadığında bu sonuç açıkça yazılır; PDF'ler tekrarlanmaz ve güncel
Excel yine kaydedilir. Seçilen dönemde hiç fatura bulunmaması ayrıca belirtilir.

Eski Excel'in bütün çalışma sayfalarında fatura başlığı aranır; üstteki başlık ve
boş satırlar ile `Fatura Numarası` gibi etiketler kabul edilir. Okuma hatası,
tablo veya başka dosya yeniden çizildiğinde kaybolmaz. Okunamayan eski dosya
düzeltilene ya da Temizle ile kaldırılana kadar İzibiz indirmesi başlatılmaz;
okunamayan dosya yanlışlıkla boş referans sayılmaz. OneDrive dosyalarının yerel
kopyası indirilmemişse önce “Her zaman bu cihazda tut” seçilmelidir.

Uygulama ekranında portalın yanıt durumu korunur:
`Yanıt bekliyor`, `Yanıt gerekmiyor`, `Kanunen kabul`, `Kabul edildi`, `Reddedildi`.
API'nin `responseDescription` alanı serbest yanıt açıklamasıdır, teslim durumunun
`Alındı` etiketi de yanıt değildir; bu ikisi Yanıt sütununa taşınmaz.
İndirilen Excel'in G (Yanıt) sütununda yalnızca yeni, reddedilmemiş faturaların
turuncu hücrelerine `YENİ GELEN` yazılır. Önceden işlenmiş ve reddedilmiş
faturaların kaynak yanıt metni korunur. Bu çıktı kuralı manuel Excel indirmesi,
İzibiz'in firma klasörüne kaydetmesi ve taşınabilir HTML için bütün firmalarda
aynıdır.

## Bağlantı ve gizlilik

Mevcut İzibiz kullanıcı adı, şifre ve firma VKN/TCKN bilgisi yalnızca uygulamanın
bağlantı ekranında girilir. Sohbete veya Git'e konmaz. Chrome parola kaydı başka
alan adındaki uygulamaya otomatik aktarılmaz.

Sunucu yalnızca `https://api.izibiz.com.tr` adresindeki resmî REST servislerine
bağlanır. Oturum, firma kimliği ve okuma izni doğrulanmadan bağlantı kaydedilmez.
Şifreler Durable Object içinde AES-256-GCM ile firma bağlamına bağlı şifrelenir.
Anahtar bağlantılardan ayrı özel bir Durable Object içinde otomatik oluşturulur.
Bu nesnenin herkese açık URL veya API yolu yoktur. Dağıtımdan önce isteğe bağlı
`IZIBIZ_ENCRYPTION_KEY` Worker secret'ı da kullanılabilir; kullanım başladıktan
sonra anahtarı veya anahtar kaynağını değiştirmeyin.

Token'lar yalnızca bellekte tutulur ve süre dolduğunda bir kez yenilenir. Excel
ve faturalar sunucuda saklanmaz. Kabul/red, gönderme, silme veya okundu işaretleme
yapılmaz. Manuel liste alma firma başına beş dakikayla sınırlıdır. Tek sorgu en
fazla bir yıl ve 20.000 fatura kapsar. Taşınabilir HTML şifre/token içermez;
otomatik bağlantı için canlı firma oturumu gerekir.

## Doğrulama

30 Ekim 2026'da Pusula hesabıyla gerçek API oturumu, firma kimliği, listeleme ve
örnek PDF/XML indirmesi doğrulandı. Örnek XML'in fatura numarası, ETTN ve alıcı
VKN bilgisi eşleşti. Belgeler yalnızca bellekte işlendi. Gerçek servis firma
bilgisinde `vknTckno`/`commercialName`, indirmede `{filename, content}` Base64
yapısı kullanır. Diğer firmalar ilk bağlantıda kendi hesaplarıyla doğrulanır.

Kaynak yanıtların Excel hücrelerinde korunması, tam A.Ş./LTD. ŞTİ. dosya adları,
tek klasör, eski dosyaların korunması, kayıtlı ayarlarla ekransız çalışma ve
İstanbul'da gece yarısından sonra indirme tarihi otomatik testlerle doğrulanır.
Safari önizlemesinde masaüstü, 390 × 844 telefon, 844 × 390 yatay telefon ve
768 × 1024 tablet görünümü kontrol edildi. Klasöre gerçek yazma Chrome/Edge
masaüstündeki File System Access iznini gerektirir.

Kaynaklar:
- https://dev.izibiz.com.tr/endpoint/authentication-api/auth-token
- https://dev.izibiz.com.tr/endpoint/customer-api/customers-me
- https://dev.izibiz.com.tr/endpoint/einvoice-v1-api/incoming-invoice-list
- https://dev.izibiz.com.tr/endpoint/einvoice-v1-api/incoming-invoice-lookup-statuses
- https://dev.izibiz.com.tr/endpoint/einvoice-v1-api/incoming-invoice-download
