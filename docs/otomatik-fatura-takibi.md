# Otomatik Fatura Takibi

/takip oturumla korunan otomatik takip ekranıdır. Mevcut manuel Excel/İzibiz
modülü ayrı çalışmaya devam eder. Manuel düğmenin iki Excel koşulu otomatik
sunucu kontrolüne uygulanmaz.

## Takvim ve kapsam

- Türkiye saatiyle hafta içi 09, 11, 13, 15, 17. Cron UTC olarak 06, 08, 10,
  12, 14 çalışır. Kullanıcı ayrıca Şimdi kontrol et ile kontrol başlatabilir.
- Her etkin firma kendi kalıcı işi ve dosya alanında işlenir. Tarayıcı veya
  bilgisayarın açık kalması gerekmez. İşin adımları Durable Object alarmında
  devam eder; geçici hatalar sınırlı sayıda yeniden denenir.
- İlk taramada önceki ay başından başlanır. Her kontrolde geliş tarihi
  sorgusu ile önceki/güncel ayın belge tarihi sorgusu birlikte kullanılır.
  Geliş sorgusu son başarılı kontrolün iki gün öncesinden tekrar taranır.
  Bu sayede sonraki aya geç gelen, hatta daha eski tarihli faturalar yakalanır.
- Ayın 17'sinde taramayı durduran bir sınır yoktur.
- ETTN firma kapsamında benzersizdir. Sayfalar, toplam sayılar, belge kimliği ve
  XML alıcı vergi numarası doğrulanır. İzibiz'e kabul/red/işlendi komutu verilmez.

## İşlem durumu

Yeni faturalar kullanıcı işaretleyene kadar YENİ GELEN olarak kalır.
Zaman geçmesi bunları BEKLENİYOR veya İŞLENDİ yapmaz. İşlendi işareti geri
alınabilir. Kayıt sürümü telefon/bilgisayar arasında eski bir ekranın yeni
işaretlemeyi ezmesini engeller. Son 100 işaretleme grubu işlem geçmişinde tutulur.
İzibiz yanıtı ayrı alandır; muhasebe işareti kabul/red anlamına gelmez.

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

Excel otomatik üretilmez. Kullanıcı klasörde Excel'i hazırla dediğinde o andaki
işaretlerle Excel oluşturulur ve aynı özel klasöre eklenir. Sonraki işaretlemeler
önceden üretilmiş Excel'i eski sürüm olarak gösterir; yeniden hazırlanabilir.
Excel adı baş harfli, iç başlığı Türkçe büyük harflidir. Son sütun işlem
durumudur; İzibiz yanıtı ayrı korunur.

Klasörü dışa aktar, PDF'leri ve varsa son Excel'i klasör adı altında ZIP olarak
verir. Dışa aktarma kullanıcının isteğiyle gerçekleşir.

Klasörü sil dosyaları kaldırır. Yeniden aynı faturaları indirmemek için ETTN,
fatura bilgileri, silinme bilgisi ve işlem durumu kalır. Otomatik süreli silme yoktur.

## Telefon bildirimleri

Standart Web Push, gerçek VAPID imzası ve aes128gcm şifrelemesi kullanılır.
Üçüncü taraf bildirim aboneliği hizmeti veya Apple geliştirici üyeliği gerekmez.
Bildirim aboneliği yalnızca oturum açmış sahibin kullanıcı hareketiyle eklenir.
VAPID özel anahtarı sunucuda tutulur. Bilinen HTTPS push sağlayıcıları dışındaki
abonelik adresleri kabul edilmez.

iPhone'da kullanıcı Safari Paylaş → Ana Ekrana Ekle adımını tamamlar; simgeden
açılan uygulamada Bildirimler bölümünden izni verir. Bu adım telefon üzerinde
kullanıcının işlemini gerektirir. Deneme bildirimi düğmesi gerçek push gönderir.

Bildirim firma, hazır yeni PDF sayısı ve işlem bekleyen toplamı belirtir;
dokununca firma listesi açılır. Sessiz arka plan mesajı yerine görünür bildirim
gösterilir. Fatura içeriği ve tutarlar kilit ekranına gönderilmez.
Yeni fatura yoksa tekrar bildirim yoktur. Olaylar benzersiz kimlikle sıraya alınır;
geçersiz abonelikler temizlenir. Parola kurtarma/değiştirme eski cihaz
aboneliklerinin yeni bildirim almasını engeller; cihaz yeniden bağlanabilir.
Otomatik gönderimler hafta içi 09–18 ile sınırlıdır; deneme kullanıcı isteğidir.
Telefonun interneti, Odak modu ve işletim sisteminin bildirim ayarları teslim
zamanını ve görünümü etkiler.

## Doğrulama

npm run build, npm run check, npm test.
Otomasyon testleri ay/yıl geçişi, eski aya geç gelen fatura, PDF doğrulama,
mükerrer tarama, ilk referans aktarımı, işaretleme/geri alma, eski kayıt
çatışması, Excel sürümü, klasör silme ve gerçek şifreli push isteğini kapsar.
Kimlik doğrulama testi arşiv/API/manifest/service worker erişimlerini de sınar.
