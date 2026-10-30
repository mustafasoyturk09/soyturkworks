# Tek hesap ve beş firma geçişi

Bu çalışma mevcut Cloudflare Worker'a gerçek sunucu oturumu ekler. Canlı sistem
henüz bu sürüme geçirilmemelidir: ilk hesap kurulumunu mümkün kılacak e-posta
bağlantısı hazırlanmalıdır. Bu tamamlanana kadar `main` dalındaki mevcut yayını koruyun.

## Hazırlanan davranış

- Tek kullanıcı adı ve parola; ayrı kullanıcı, davet veya yetki sistemi yok.
- Parolalar scrypt ile özetlenir. Oturum çerezi HTTPS üzerinde Secure, HttpOnly ve
  SameSite=Strict kullanır. Uygulama HTML'i ve yerel kütüphaneler de oturumla korunur.
- Hesap ilk kez yalnızca kayıtlı kurtarma adresine gönderilen tek kullanımlık
  bağlantıyla oluşturulur. Herkese açık "ilk gelen hesabı sahiplenir" akışı yoktur.
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
- Finansal dosyalar ve mevcut yerel kayıtlar sunucuya yüklenmez. Bu değişiklik
  cihazlar arasında muhasebe kayıtlarını eşitleme özelliği eklemez.

## Canlıya geçiş için kalan kurulum

1. Cloudflare hesabında soyturkworks.com alanının e-posta gönderimi hazırlanmalı.
   Güncel panel: Compute → Email Service → Email Sending → Onboard Domain.
   Cloudflare'ın önerdiği DNS kayıtları gözden geçirilmeli; mevcut posta kayıtları
   körlemesine değiştirilmemeli. Gerekirse doğrulanmış tek alıcıya gönderim
   seçeneği kullanılmalı; ücretli plana izinsiz geçilmemeli.
2. Kullanıcının en son bildirdiği Gmail adresi Cloudflare'da doğrulanmalı. Gerçek
   adres GitHub'a yazılmaz. `soyturkworks` Worker → Settings → Variables and
   Secrets bölümünde `OWNER_EMAIL` adıyla Secret olarak saklanmalı.
3. `EMAIL` send_email binding'i Wrangler yapılandırmasında hazırdır. Cloudflare'da
   yalnızca doğrulanmış kurtarma alıcısına izin verecek şekilde kısıtlanabilir.
   `AUTH` SQLite Durable Object ilk migration ile oluşturulur. Mevcut Workers
   Builds belirtecinin migration için gerekli yetkisi doğrulanmalıdır; belirteç
   değerlerini okumayın veya sohbete yazmayın.
4. Giriş/firma görünümünün bilgisayarda ve iPhone'da görsel kontrolü kalmıştır.
   Bu oturumda Computer Use bağlantısı kullanılamadığı için gerçek tarayıcı
   ve ekran boyutlarında görsel doğrulama tamamlanamadı; bu sınırı raporlayın.
5. E-posta hazır olduğunda mevcut main'e normal geçiş ve mevcut GitHub/Cloudflare
   yayın akışı kullanılmalı. Build kontrolü ve canlı oturumsuz erişim denetlenmeli.
   İlk kurulum bağlantısı gerçekten alınmalı; kullanıcı kendi kullanıcı adı ve
   parolasını tarayıcıda belirlemeli. Şifre/kurulum bağlantısını sohbete istemeyin.

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
