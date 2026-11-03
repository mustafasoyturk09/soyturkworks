# Otomatik Fatura Takibi

Her firmanın oturumla korunan takip ekranı /workspace/FIRMA/takip/ adresindedir.
Giriş düğmesi, o firmanın Gelen E-Fatura Takip ekranında İzibiz düğmesinin
hemen solundadır. Başlık, özet, faturalar, klasörler, bildirim geçmişi ve
bütün işlemler sunucunun sayfaya verdiği tek firma bağlamını kullanır.
Ekranın içinden başka firma seçilemez; kendi çalışma alanına geri dönülür.
Eski /takip?company=FIRMA bağlantıları ilgili firma ekranına yönlenir.
Firmasız /takip firma seçimine yönlenir; toplu özet API'si veri döndürmez.
 Mevcut manuel Excel/İzibiz
modülü ayrı çalışmaya devam eder. Manuel düğmenin iki Excel koşulu otomatik
sunucu kontrolüne uygulanmaz.

## Takvim ve kapsam

- Türkiye saatiyle hafta içi 09, 11, 13, 15, 17. Cron UTC olarak 06, 08, 10,
  12, 14 çalışır. Kullanıcı ayrıca İzibiz Sistemini Başlat ile o anda elle kontrol başlatabilir.
  Bu düğme otomatik takibi açıp kapatmaz; otomatik takibin ayarı Takip durumu
  bölümündedir.
- Her etkin firma kendi kalıcı işi ve dosya alanında işlenir. Tarayıcı veya
  bilgisayarın açık kalması gerekmez. İşin adımları Durable Object alarmında
  devam eder; geçici hatalar sınırlı sayıda yeniden denenir.
- Başlangıç ayı ilk kontrol veya başlangıç Excel aktarımında firma kapsamında
  kaydedilir. Yeni sorgu en fazla 10 gün geriye gider; başlangıç ayını ve önceki
  ayın başını aşmaz. Örneğin 1 Kasım’da 22 Ekim–1 Kasım sorgulanır. Geliş ve
  belge tarihine göre iki sorgu yapılır; belge tarihi bu aralığın dışında kalan
  kayıt indirilmez. Daha önce arşivlenmiş geçerli aylar korunur.
- Geliş sorgusu son başarılı kontrolün iki gün öncesinden, en erken tarama
  aralığından başlar. Tarih, alıcı firma ve sayfalama sonuçları ayrıca doğrulanır.
- Eski sürümden geçişte başlangıç ayı, Excel aktarım/kayıt alma zamanlarından
  belirlenir; fatura tarihleri başlangıç olarak kullanılmaz. Başlangıç ayından
  önce yanlışlıkla alınmış kayıtlar ilk yenilemede listeden ve sayaçlardan
  kaldırılır; PDF/Excel dosyaları arka planda temizlenir. İşlendi işaretleri,
  başlangıç Excel numaraları ve başlangıç ayından itibaren geçerli arşiv korunur.
  Ay değişmesi geçerli geçmiş arşivi silmez.
- Ayın 17'sinde taramayı durduran bir sınır yoktur.
- ETTN firma kapsamında benzersizdir. Sayfalar, toplam sayılar, belge kimliği ve
  XML alıcı vergi numarası doğrulanır. İzibiz'e kabul/red/işlendi komutu verilmez.

## Ekran kullanımı

İlk açılış Faturalar bölümüdür; Türkiye saatine göre mevcut yıl ve ay seçilir.
Yıl seçimi, önceki/sonraki yıl düğmeleri ve Ocak–Aralık kutuları Faturalar,
Klasörler ve Takip Durumu arasında ortak çalışır. Takip Durumu’nda seçilen ayın
özet sayıları gösterilir; sayı kartları aynı ayın ilgili fatura filtresini açar.
Verisiz ve gelecek aylar da seçilebilir; bu aylarda sayılar sıfırdır. Ay kutuları fatura veya PDF sayısını gösterir.
Takip başlangıcından önceki aylar boş görünür. Bildirime dokunulunca o
bildirimdeki yeni faturaların ayı açılır. Güncel ayda yeni fatura yoksa önceki
aya geç gelen faturaların ayı seçilir.

Üst durum alanı otomatik takibin açık/kapalı durumunu, çalışan işi, son ve
sonraki kontrolü ve bağlı cihaz sayısını gösterir. Takip durumu bölümünde
otomatik takip açılıp kapatılır; sayı kartları ilgili fatura filtresini açar.
Fatura numarası, tarih, firma, tip, tutar ve birim aynı puntoda ve ortalıdır;
başlıklar daha büyük, büyük harfli ve ortalıdır. Dar ekranlarda sütunlar
etiketli kartlara dönüşür.

Faturalar bölümündeki **Tümünü Temizle**, onaydan sonra yalnızca ilgili
firmanın tüm aylardaki fatura listesi ve arşiv dosyalarını, reddedilmiş ve
dosyası olmayan kayıtlar dahil, kaldırır. Devam eden alma işi iptal edilir;
eski bir isteğin sonradan dönmesi kayıtları geri getirmez. İzibiz bağlantısı,
başlangıç ayı, otomatik takip ayarı, bildirim cihazları ve işlenmiş fatura
referansı ve görülmüş fatura kimlikleri korunur. Yeniden alınan eski kayıtlar
tekrar yeni sayılmaz; işlenmemiş kayıtlar Bekleniyor olarak geri gelir. İzibiz Sistemini Başlat ile geçerli tarama döneminin faturaları yeniden
alınabilir. Otomatik takip açıksa sonraki planlı kontrol de tekrar alır;
geçerli dönemden eski arşiv otomatik olarak yeniden indirilmez.

## İşlem durumu

Geliş durumu ile muhasebe durumu ayrıdır:
- **YENİ GELEN:** En fazla 10 gün geriye tarihli, ilk kez görülmüş ve PDF’i
  doğrulanmış, son yeni gruptaki işlenmemiş fatura.
- **BEKLENİYOR:** Önceden görülmüş fakat işlenmemiş fatura. Aynı ayda başka
  yeni faturalar bulunduğunda önceki yeniler buraya geçer. Yeni fatura olmayan
  kontrol bu geçişi yapmaz. Belge tarihi 10 günlük sınırın dışında kalan bir
  yeni kayıt da artık Yeni gelen olarak gösterilmez.
- **İŞLENDİ:** İlk Excel’de numarası eşleşen veya kullanıcının sonradan
  işaretlediği fatura. Yeni grubun gelmesi bunu otomatik değiştirmez.
- **REDDEDİLDİ:** İzibiz’in reddedilmiş kaydı; muhasebe işareti değildir.

İlk Excel firma kapsamında kalıcı numara referansıdır. Sonraki kontrollerde
ETTN ve bu referans karşılaştırılır; aynı faturanın tekrar görünmesi yeni geliş
sayılmaz. Aylar belge tarihine göre ayrıdır. Ekim’deki yeni grup Kasım listesini
karıştırmaz. İlk geçişte eski işlenmemiş kayıtlar Bekleniyor’a geçirilir; ilk
Excel’de eşleşen ama eski denemelerde işareti kaldırılmış kayıtlar İşlendi
olarak düzeltilir. Mevcut manuel İşlendi kayıtları korunur. İşlendi işareti geri
alınabilir. Her durum değişikliğinden sonra listenin üstünde süreyle kaybolmayan
Geri al çubuğu görünür; fatura etkin filtreden çıksa da son işlem geri alınabilir. Eski bir faturanın
işlendi işaretini kaldırmak onu otomatik olarak Yeni gelen yapmaz.
İşlenmiş faturaların altında ayrıca belirgin Geri al düğmesi vardır. Kutucuk
seçimi Seçimi kaldır ile kaldırılır; seçim tek başına işlem durumunu değiştirmez.
Son işlemi geri alma, değişen kayıtların önceki durumunu ve güncel kayıt sürümünü
kullanır; başka cihazdan yapılan daha yeni bir değişikliği ezmez. Kayıt sürümü telefon/bilgisayar arasında eski bir ekranın yeni
işaretlemeyi ezmesini engeller. Son 100 işaretleme grubu işlem geçmişinde tutulur.
İzibiz yanıtı ayrı alandır; muhasebe işareti kabul/red anlamına gelmez.
Reddedilmiş faturalar ayrı REDDEDİLDİ durumunda ve filtresinde gösterilir;
İŞLENDİ sayısına katılmaz ve dosyası yoksa PDF hazırlanıyor denmez.
Fatura listesi, filtreler ve devam sayfaları fatura tarihine göre eskiden yeniye
sıralanır. Aynı tarihli faturalar geliş sırasını korur; sonradan gelen en alta eklenir.
FATURA TİPİ sütunu senaryo ve tipi birlikte gösterir: Temel - Satış, Ticari -
Satış, Ticari - İade gibi. Senaryo, [İzibiz liste yanıtındaki profile alanından](https://dev.izibiz.com.tr/endpoint/einvoice-v1-api/incoming-invoice-list?lang=tr)
alınır; eksikse Temel/Ticari tahmini yapılmaz. Eski kayıtların senaryosu sayfa
yenilendiğinde yalnızca liste okunarak tamamlanır; PDF’ler yeniden indirilmez,
işlendi işaretleri değişmez ve yeni fatura bildirimi gönderilmez. Ayın Excel’i
de aynı birleşik tipi kullanır; senaryo güncellemesi de aylık Excel’i otomatik günceller.

Başlangıç için son işlenmiş Excel isteğe bağlı bir kez aktarılabilir. Tarayıcı
dosyayı okur; sunucuya yalnızca numaralar gider. Geçmiş faturaların işlenmiş
olduğu otomatik varsayılmaz.

## Özel dosyalar

Örnek: Pusula Ekim 2026 Gelen E-Faturalar (17.11.2026).
Belge ayı ve siteye alınma tarihi ayrıdır. Aynı günde alınan farklı aylara ait
belgeler ayrı klasörlerdedir. Aynı PDF tekrar kaydedilmez. Kullanıcıya PDF'ler
otomatik olarak bilgisayar indirmesi başlatılmadan sunucuda hazırlanır.

Dosyalar mevcut özel Durable Object bağlaması içinde firma başına ayrı nesnede,
512 KiB parçalar halinde tutulur. Firma başına 512 MiB uygulama sınırı ve kullanım
göstergesi vardır. Hiçbir fatura Git'e, dist'e veya herkese açık statik dosyalara
yazılmaz. Arşiv dosyaları oturumla korunan API'den sunulur. ZIP dışa aktarma
parça parça akıtılır; klasörün tamamı sunucu belleğine yüklenmez.

Her ayın Excel’i otomatik üretilir. Yeni fatura grubu tamamlandığında,
işaretleme/geri alma, başlangıç referans eşleşmesi veya senaryo değişikliği
olduğunda o ayın tüm silinmemiş faturalarıyla aynı aylık dosya güncellenir.
Eski işlenmemiş faturalar Bekleniyor, en son gruptakiler Yeni gelen, işlenmişler
İşlendi olarak yer alır. Her ayın ayrı dosyası vardır; önceki ayın bekleyenleri
sonraki ayın Excel’ine taşınmaz. Kullanıcıya bildirim gönderilmeden önce yeni
PDF’ler ve güncel Excel hazırlanır. Yeni fatura olmayan tekrarda dosya gereksiz
yeniden üretilmez.

Faturalar başlığının yanındaki **Excel’i indir** doğrudan seçili ayın güncel
Excel’ini verir. Aynı bağlantı klasör kartında ve içindedir. Hazırla/Güncelle
adımı gerekmez. PDF’ler ve aylık Excel sunucuda özel arşivdedir; bilgisayarda
otomatik indirme başlatılmaz. Excel adı baş harfli, iç başlığı Türkçe büyük
harflidir. Son sütun işlem durumudur; İzibiz yanıtı ayrı korunur. Dosyanın satır
anlık görüntüsü ve sürümü aynı işlemde doğrulanır; geç dönen eski iş yeni
Excel’i veya temizlenmiş arşivi geri getiremez.

Klasörü dışa aktar, PDF'leri ve varsa son Excel'i klasör adı altında ZIP olarak
verir. Dışa aktarma kullanıcının isteğiyle gerçekleşir.

Klasör kartları seçili ayda alınma tarihine göre PDF sayısını, Excel durumunu,
Dosyaları aç ve ZIP indir işlemlerini gösterir. Klasör içindeki Klasörü sil
dosyaları kaldırır. Yeniden aynı faturaları indirmemek için ETTN,
fatura bilgileri, silinme bilgisi ve işlem durumu kalır. Otomatik süreli silme yoktur.

## Telefon bildirimleri

Standart Web Push, gerçek VAPID imzası ve aes128gcm şifrelemesi kullanılır.
Üçüncü taraf bildirim aboneliği hizmeti veya Apple geliştirici üyeliği gerekmez.
Bildirim aboneliği yalnızca oturum açmış sahibin ilk kullanıcı hareketiyle eklenir.
Bir cihaz hesaba bir kez bağlanır ve etkin bütün firmaların bildirimlerini alır.
Firma firma izin verme veya deneme gönderme adımı yoktur. Önceden firma kapsamında
kaydedilmiş cihazlar VAPID veya telefon aboneliği sıfırlanmadan otomatik olarak
hesap kapsamına geçirilir. Cihazı kaldırmak bütün firmaların bildirimini kapatır.
Bildirim ekranındaki tek test özeti yalnızca açık telefona gönderilir; firma firma
deneme kaydı veya firma başına kurulum oluşturmaz.
VAPID özel anahtarı sunucuda tutulur. Bilinen HTTPS push sağlayıcıları dışındaki
abonelik adresleri kabul edilmez.

iPhone'da kullanıcı Safari Paylaş → Ana Ekrana Ekle adımını tamamlar; simgeden
açılan uygulamada Bildirimler bölümünden izni bir kez verir. Bu ilk adım tarayıcı
güvenlik kuralı gereği telefon üzerinde kullanıcı işlemi ister. Sonraki firma ve
oturum yenilemeleri mevcut abonelikten otomatik onarılır. Bağlantı durumu gerçek
abonelikten alınır; firma başına deneme kaydı oluşturulmaz.

Her firma tamamlandığında ayrı sonuç bildirimi üretir. Yeni fatura yoksa da o
firmanın kontrol sonucu ve aylık toplamları gelir. Bir firmanın yavaşlığı diğer
firmaları bekletmez. Bağlantısı olmayan, takibi kapalı veya hata veren firma
sessizce özetten çıkarılmaz. İki dakika süren iş için bekleme bilgisi gönderilir;
iş tamamlandığında aynı firmanın bildirimi güncellenir. Sekiz dakika dolunca
sonuçları silen eski toplu özet davranışı kaldırılmıştır. İşler 24 saat takip
edilir; tamamlanamayan iş açık hata sonucu ile kapatılır.

**Tüm Firmaları Güncelle**, bütün bağlı firmaları sunucuda kalıcı bir döngüye
kaydeder ve otomatik takibini açar. Bir firmanın ekranına girilmesi yeterlidir.
Süren işe yeni kontrol isteği eklenir; firma iki kez indirilmez. Beş dakika içinde
başarıyla tamamlanan iş için yeniden indirmek yerine son sonuç gönderilir.
İlk yeni sürüm döngüsü de bağlı firmaların otomatik takibini bir kez açar;
sonradan kullanıcı tarafından kapatılan takip sonraki planlı döngülerde korunur.
Eksik İzibiz bağlantısı veya başarısız başlatma ekranda firma adıyla gösterilir.
Bağlantı testi otomatik olarak gönderilmez; gerçek sonuç bildirimi kullanılır.

**Faturalar Anlık Durum**, yeniden İzibiz indirmesi başlatmadan bütün etkin
firmaların sunucudaki son kayıtlarını, tüm arşiv aylarının gelen sayılarını ve
son kontrol zamanını bağlı telefonlara gönderir. Örnek: Pusula — Gelen: Ekim
22 Adet · Kasım 2 Adet. Bunlar yeni bulunan fatura sayısı değil, silinmemiş ve
reddedilmemiş gelen faturaların aylık toplamıdır; işlenmiş faturalar dahildir.
Uzun arşivler altışar aylık ayrı bildirimlere bölünür; aylar kesilmez. Aynı özet
ekranda da kalır. Bağlı cihaz yoksa gönderilmiş gibi gösterilmez. Devam eden veya
başarısız son kontrol açıkça belirtilir; eski kayıtlar anlık İzibiz sorgusu gibi
sunulmaz.

Cron ile birlikte sahibin Durable Object alarmı da sıradaki Türkiye saati
09, 11, 13, 15, 17 kontrolünü saklar. İkisi aynı saat için çalışırsa aynı kalıcı
döngü kullanılır; kaydedilmiş sonuçlar sıfırlanmaz. Alarm ayrıca başlatılamayan
işleri ve bildirim kuyruğunu sürdürür. Geçici push hataları 24 saat boyunca
artan aralıklarla yeniden denenir; beş deneme sonrasında sessizce atılmaz.
Telefon başına bekleyen işler diğer telefonları engellemez. Bildirim olayını
kaydetme ve cihaz kuyruklarına ekleme tek depolama işlemiyle tamamlanır.
Geçersiz abonelikler temizlenir. Parola kurtarma/değiştirme eski cihazların yeni
bildirim almasını engeller; uygulama aynı telefonda açılınca abonelik yenilenir.

İşletim sistemi bildirim kaynağı olarak kurulu web uygulamasının adını gösterebilir;
bildirimin uygulama tarafından belirlenen başlık ve metninde Soyturk Works yazmaz.
Telefonun interneti, Odak modu ve işletim sisteminin bildirim ayarları teslim
zamanını ve görünümü etkiler.

## Doğrulama

npm run build, npm run check, npm test.
Otomasyon testleri ilk ay sınırı, ay/yıl geçişi, önceki aya geç gelen fatura,
başlangıçtan eski kayıtların temizliği ve yeniden alınmaması, PDF doğrulama,
mükerrer tarama ve sıfırlama sonrası tekrarın yeni sayılmaması, Yeni gelen–
Bekleniyor geçişi, aylara ayrı Excel, ilk referans aktarımı, işaretleme/geri alma, eski kayıt
çatışması, Excel sürümü, klasör silme, tüm arşivi temizleme ve yeniden alma, temizleme
sırasında devam eden liste/PDF/metadata işlerinin iptali ve gerçek şifreli push
isteğini kapsar.
Kimlik doğrulama testi arşiv/API/manifest/service worker erişimlerini de sınar.

## 3 Kasım 2026 doğrulama kapsamı

Yeni testler beş firmanın tek istekle başlamasını, sıfır yeni fatura sonucunu,
sekiz dakikadan geç gelen sonuçları, aynı saat için çift tetiklemeyi, bağlantı
hatalarını, eşzamanlı firma sonuçlarını, tüm ayların parçalara bölünmesini,
cron olmadan sunucu alarmını ve beş denemeden uzun push tekrarını kapsar.
Gerçek telefonun kilit ekranına teslim bu testlerden çıkarılamaz. Bu oturumda
Windows tarayıcı adresini doğrulayamayan Computer Use güvenlik kontrolü görsel
incelemeyi durdurdu; telefon/tablet/masaüstü görsel QA tamamlanmış sayılmadı.
