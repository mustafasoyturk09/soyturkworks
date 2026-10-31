# Tek hesap ve beş firma geçişi

Bu çalışma mevcut Cloudflare Worker'a gerçek sunucu oturumu ekler. Hesap sahibi
Cloudflare kontrol bağlantısının çalışmaması nedeniyle ilk hesabı, kendi
bilgisayarındaki özel kurulum bağlantısıyla oluşturur. Düzenli giriş tüm
bilgisayar, telefon ve tarayıcılarda soyturkworks.com üzerinden yapılır.

## Hazırlanan davranış

- Tek kullanıcı adı ve parola; ayrı kullanıcı, davet veya yetki sistemi yok.
- Parolalar scrypt ile özetlenir. Oturum çerezi HTTPS üzerinde Secure, HttpOnly ve
  SameSite=Strict kullanır. Uygulama HTML'i ve yerel kütüphaneler de oturumla korunur.
- Hesap ilk kez yalnızca sahibinin bilgisayarında tutulan özel bağlantıyla veya
  doğrulanmış kurtarma adresine gönderilen tek kullanımlık bağlantıyla oluşturulur. Herkese açık "ilk gelen hesabı sahiplenir" akışı yoktur.
- Yenileme bağlantısı 15 dakika geçerlidir; kullanıldığında diğer bağlantılar,
  oturumlar ve kayıtlı geçiş anahtarları iptal edilir. Parola sohbette belirlenmez.
- WebAuthn geçiş anahtarları gerçek sunucu doğrulaması kullanır. İlk cihaz kaydı,
  parola ile girişten sonra Hesabım ekranında kullanıcı tarafından tamamlanır.
  Parmak izi/Face ID/PIN seçimini cihaz ve tarayıcı belirler.
- Pusula, Comed, Kendine İyi Bak, Dijital Garaj ve KİB Dijital Tek kartları geniş
  ekranda 3+2, telefonda dar ekrana uygun düzende gösterilir.
- Firma değişikliği tam sayfa geçişidir. Bellekteki dosyalar diğer firmaya taşınmaz.
  Yerel kayıtlar, tercihler ve görsel veritabanları firma bazında ayrılır.
- Firması belli eski satış kayıtları yalnızca kendi firmalarına kopyalanır. Eski
  kaynaklar silinmez. Firması belirtilmemiş not/satın alma kayıtları, yan menüdeki
  "Eski yerel kayıtları aktar" ekranında kullanıcı firmayı doğruladığında kopyalanır.
- Kaldırma geri alınabilir; finansal kayıtlar silinmez. Pasif firmaya giriş sunucuda
  da engellenir. Mevcut ana sayfa kaldırılmıştır.
- Eksik hesap planlarına başka firmanın kodu atanmaz. Doğrulanmış mevcut Pusula ve
  Kendine İyi Bak kodları korunur. Diğer firmaların muhasebe çıktıları için kendi
  hesap planları ve gerekli kaşeleri sağlanmalıdır.
- Eski manuel çalışma alanının yerel kayıtları otomatik taşınmaz. Yeni /takip
  ekranında kullanıcı isteğiyle kurulan otomasyon, PDF ve isteğe bağlı Excel
  dosyalarını firma bazlı özel sunucu arşivinde saklar; işlem işaretleri cihazlar
  arasında eşitlenir. Ayrıntılar docs/otomatik-fatura-takibi.md içindedir.

## Yayın ve ilk hesap kurulumu

Cloudflare Email Routing alan adı kayıtları kullanıcı tarafından eklendi; herkese
 açık MX ve SPF sorgularında doğrulandı. Kullanıcının istediği kurtarma adresi iki
"k" içerir. Adres ve özel kurulum anahtarı yalnızca `.secrets/owner-setup.json`
içinde tutulur; bu dosyayı okumayın, yazdırmayın veya Git'e eklemeyin.

`node scripts/owner-setup.mjs prepare` özel bağlantıyı oluşturur. Kurtarma adresi
`SW_RECOVERY_EMAIL` ortam değişkeninden alınır. Wrangler'a yalnızca rastgele 256
bit anahtarın SHA-256 özeti ve 24 saatlik geçerlilik süresi yazılır. Ham anahtar
sunucu yapılandırmasına veya GitHub'a gönderilmez. Hesap oluşturulduğunda bağlantı
artık kullanılamaz; başka kişilerin yeni hesap oluşturması engellenir.

1. build/check/test sonrası mevcut main dalına normal geçişle yayınlayın. Workers
   Builds sonucunu ve canlı oturumsuz erişim korumasını kontrol edin.
2. `node scripts/owner-setup.mjs check-mail`, özel sahiplik kanıtını kullanarak
   kayıtlı kurtarma adresine ilk kurulum e-postasının gönderimini test eder.
   Gmail parolasına veya panelde OWNER_EMAIL değişkenine ihtiyaç yoktur.
3. `node scripts/owner-setup.mjs serve` yalnızca 127.0.0.1:4181'de özel bağlantıyı
   sunar. Kullanıcı bu yerel adresi Mac'inde açar; doğrudan canlı sitede kullanıcı
   adı ve parolasını belirler. Link fragment'i hemen adres çubuğundan kaldırılır;
   sunucu URL günlüklerine gönderilmez. Şifreyi veya özel bağlantıyı sohbete istemeyin.
4. Kurtarma adresi ilk hesap oluşturulurken özel Durable Object kaydına alınır;
   sonraki parola yenilemeleri yalnızca bu adrese gönderilir. İstemciden gelen
   başka e-posta adresleri mevcut hesabın kurtarma hedefini değiştiremez.
5. Hesap oluşturulduktan sonra OWNER_SETUP_SHA256 / OWNER_SETUP_EXPIRES değerleri
   ilerleyen yayında kaldırılabilir. Mevcut hesap varken bağlantı zaten geçersizdir.

Computer Use bağlantısı bu oturumda çalışmadığı için gerçek tarayıcı ve ekran
boyutlarında görsel doğrulama tamamlanamadı. Bu sınırı raporlayın. Yeni şirketlerin
hesap planlarını ve kaşelerini tahmin etmeyin; eksik muhasebe çıktılarını ilgili
firma için yapılandırma sağlanana kadar engelleyin.

Resmî kaynaklar:
- https://developers.cloudflare.com/email-service/get-started/send-emails/
- https://developers.cloudflare.com/email-service/configuration/send-bindings/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://simplewebauthn.dev/docs/packages/server

## Yerel geliştirme

`npm run build`, `npm run check`, `npm test` ve `npm run preview` kullanılır.
Önizleme yalnızca 127.0.0.1:4180 üzerinde dinler. Gerçek e-posta göndermez; yerel
test bağlantısını arayüzde sunar. Yerel hesap canlı hesaptan bağımsızdır.
`LOCAL_MAILBOX` yalnızca localhost APP_ORIGIN ile çalışır; canlıya eklenmemelidir.

`src/workspace.js`, `src/workspace.css` veya `src/mobile.js` değişirse
`node scripts/sync-portable.mjs` çalıştırıp taşınabilir HTML şablonunu güncelleyin.
Ardından build/check/test çalıştırın. Testler kaynak ve taşınabilir sürümün
eşliğini, firma ayrımını, sunucu korumasını, parola yenilemeyi ve imzalı gerçek
WebAuthn kayıt/giriş mesajlarını doğrular.
