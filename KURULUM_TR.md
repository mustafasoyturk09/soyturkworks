# Soyturk Works 180 — özel web yayını

Bu paket, Soyturk Works 176 temelinden, 177–179 hazırlıkları ve 180 son kontrolleriyle üretilmiştir. Satış düzeltmesi, SOYTURK hesap makinesi adı ve entegratör eşleştirme düzenleme düzeltmesi hem yerel 180 HTML'de hem bu pakette vardır. Hiçbir site yayınlanmadı; alan adı, sunucu ve gerçek kullanıcı şifreleri henüz tanımlanmadı.

## Kullanım sınırı

Yalnızca siz ve yetki verdiğiniz kişiler erişeceksiniz. Sunucu, HTML dahil bütün uygulama dosyalarını kullanıcı adı/şifre arkasında tutar. HTML içine yazılmış bir giriş ekranına güvenilmez; erişim Caddy sunucusunda denetlenir.

PDF, Excel ve muhasebe işlemleri tarayıcıda gerçekleşir. Bu pakette dosya yükleme API'si, ortak veritabanı, kullanıcılar arasında dosya paylaşımı veya otomatik bulut yedeği yoktur. Notlar, kayıtlar ve ayarlar tarayıcı profilinde saklanır. Aynı tarayıcı profilini farklı kişiler kullanırsa aynı yerel verilere erişirler; kişilere ayrı işletim sistemi/tarayıcı profili verin. Kullanıcı değiştirmek sunucudaki Basic Auth hesabını değiştirir, yerel verileri ayırmaz. Ortak, eşzamanlı çalışma istenirse ayrıca kullanıcıya bağlı veri katmanı tasarlanmalıdır.

Yerel HTML'den yeni alan adına tarayıcı kayıtları kendiliğinden taşınmaz. Mevcut uygulamanın ilgili modüllerinden yedek alıp yeni sitede yükleyin. Eski HTML ve yedekleri koruyun. Eşleşme hafızası başlangıç ayarları korunmuştur; rapor geçmişi ve gelen fatura çalışma listeleri boş başlar. Fatura indirildi/işlendi durumları otomatik değiştirilmez. İzibiz bağlantısı yoktur.

## Pakette ne var?

| Yol | İçerik |
|---|---|
| `src/app.html` | Web için düzenlenmiş, tam uygulama kaynak kodu ve mevcut gömülü OCR/görseller |
| `src/runtime.js` | Yükleme, bağlantı, kaynak hatası ve depolama uyarıları |
| `src/pdf-loader.mjs` | PDF.js 4.10.38 ve aynı sunucudan çalışan PDF worker |
| `vendor/` | İndirilen gerçek kütüphaneler, yazı tipleri, kaynak adresleri ve SHA-256 kayıtları |
| `scripts/build.mjs` | Ağ gerektirmeyen dağıtım üretimi ve dosya bütünlük kontrolü |
| `scripts/check.mjs` | Kaynak, yol, yapılandırma ve veri kontrolü |
| `scripts/preview.mjs` | Yalnızca kendi bilgisayarınızda kullanılacak önizleme |
| `test/http.test.mjs` | Kök/alt dizin, 404, yöntem ve yol güvenliği testleri |
| `dist/` | Hazır yayın dosyaları; sunucunun belge kökü yalnızca bu dizindir |
| `Caddyfile`, `users.caddy`, `compose.yaml` | HTTPS, sunucu tarafında giriş ve Docker yayını |
| `.env.example` | Tanımlamanız gereken sunucu ayarlarının adları |
| `DENETIM_TR.md` | Bulgular, düzeltmeler ve doğrulamanın sınırları |
| `release-manifest.json` | Dağıtım dosyalarının SHA-256 değerleri |

Kaynak dosyalar tamdır; şablon fonksiyon veya TODO bırakılmamıştır. Çalıştırma için npm kütüphanesi indirmek gerekmez. Eski uygulama sürümleri, özel test Excel'leri/PDF'leri ve Windows hatırlatıcı erişim anahtarı web paketine dahil değildir.

## 1. İndirme ve yerel kontrol

1. `Soyturk_Works_Web_180.zip` dosyasını İndirilenler'de ayrı bir klasöre **Tümünü ayıkla** ile açın. Chrome uzantısı yüklenmez. Silinen eski `soyturkworks` klasörünü kullanmayın.
2. Terminali paketin `package.json` bulunan klasöründe açın. Node.js 22 veya üzeri gerekir.
3. Aşağıdaki komutları çalıştırın:

```sh
npm run build
npm run check
npm test
npm run preview
```

4. Terminalin yazdığı önizleme adresini açın. Bu sunucu yalnızca `127.0.0.1` üzerinde dinler, giriş koruması yoktur; internete açmak için kullanılmaz.
5. Önizleme portu gerekirse `PORT` ortam değişkeniyle değişir. Alt dizin testi için `BASE_PATH=/works/` kullanılır. Örneğin PowerShell:

```powershell
$env:PORT='4174'
$env:BASE_PATH='/works/'
npm run preview
```

Önizlemeyi Ctrl+C ile kapatabilirsiniz. Normal kullanım için yerel `Soyturk_Works_180.html` dosyası ayrıca teslim edilir; web paketindeki `dist/index.html` dosyasını çift tıklamak yerine HTTP önizlemesini kullanın, çünkü PDF bileşeni ES modülüdür.

## 2. Alan adı ve sunucu

1. `.com` alan adınızı alın. Alan adı tek başına uygulamayı barındırmaz; Docker Compose çalıştırabilen bir Linux sunucu da gerekir.
2. Muhasebe uygulaması için `app.` alt alan adını kullanabilirsiniz. Caddy'ye kök alan adı veya bu alt alan adının hangisi verildiyse DNS onun için ayarlanmalıdır.
3. DNS A kaydını sunucunun IPv4 adresine yönlendirin. AAAA kaydı koyarsanız IPv6 adresinin de gerçekten çalıştığını doğrulayın.
4. Sunucuda TCP 80 ve 443, HTTP/3 kullanılacaksa UDP 443 portunu açın. Docker ve Docker Compose kurulu olmalıdır.
5. Paketin tüm klasörünü özel bir sunucu dizinine aktarın. Yalnızca `dist/` Caddy tarafından sunulur. Proje kökünü başka bir statik sunucuya açık olarak yüklemeyin; aksi halde koruma yapılandırması devre dışı kalır.

## 3. Ortam değişkenleri ve giriş hesabı

Linux sunucuda paket dizinindeyken:

```sh
cp .env.example .env
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
```

Komut güçlü bir şifreyi gizli olarak ister ve bcrypt özetini verir. Şifreyi komut satırına veya HTML dosyasına yazmayın. `.env` dosyasını bir metin editöründe açıp şunları doldurun:

| Değişken | Girilecek değer |
|---|---|
| `SITE_DOMAIN` | Satın aldığınız gerçek alan adı veya `app.` alt alan adı; `https://` ve yol yazmayın |
| `ADMIN_USER` | Girişte kullanacağınız kullanıcı adı |
| `ADMIN_PASSWORD_HASH` | Caddy komutunun verdiği bcrypt özeti; `.env` içinde tek tırnak arasında tutun |

`.env.example` bilerek boş değerlerle gelir; varsayılan veya ortak şifre yoktur. Değerler eksikse Compose yayını başlatmaz. `.env` ve kullanıcı özetlerini Git'e, e-postaya veya `dist/` içine koymayın.

```sh
chmod 600 .env
docker compose config --quiet
docker compose run --rm --no-deps web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d
docker compose logs --tail=50 web
```

Doğru DNS ve açık portlarla Caddy HTTPS sertifikasını otomatik alır ve yeniler. Gerçek alan adınızı tarayıcıda açınca sunucunun kullanıcı adı/şifre penceresi gelir. Bu pencereye `.env` içindeki kullanıcı adını ve hash oluştururken kullandığınız **asıl şifreyi** girin; hash'i girmeyin.

**Build komutu:** `npm run build`  
**Yayın dizini:** `dist`  
**Üretimde başlatma:** `docker compose up -d` veya `npm start`  
**API anahtarı:** Yok. Ön yüz ortam değişkeni veya `VITE_...` sırrı yok.

## 4. Başka kişiye erişim verme / kaldırma

Her kişiye ayrı kullanıcı adı ve şifre verin. Yukarıdaki `caddy hash-password` komutuyla her kişi için ayrı özet üretin. `users.caddy` dosyasının ilk satırını koruyun; altına yeni kullanıcının adını ve üretilen özetini boşlukla ayırarak yazın. Kullanıcı adında boşluk kullanmayın. Şifreyi değil yalnızca özeti bu özel dosyada saklayın.

```sh
docker compose exec web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec web caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Erişimi kaldırmak için ilgili kişinin satırını silip aynı iki komutu çalıştırın. Her istek tekrar sunucuda doğrulandığından artık yeni dosya isteyemez. Daha önce yetkiliyken indirdiği dosyalar geri alınamaz. Basic Auth girişini tarayıcı önbelleğe alabilir; ortak bilgisayarda ayrı özel oturum kullanıp iş bitince oturumu kapatın.

## 5. Güncelleme ve geri dönüş

1. Önce uygulama içindeki modül yedeklerini indirin. Sunucunun yedeği tarayıcıdaki not ve faturaları içermez.
2. Çalışan paketi ayrı sürüm klasörü olarak koruyun. `.env`, `users.caddy` ve Caddy sertifika birimlerini koruyun.
3. Yeni pakette `npm run build`, `npm run check`, `npm test` çalıştırın. Yeni `dist` içindeki sürümü test edin.
4. Yeni dağıtımı sunucuda ayrı klasöre hazırlayıp Compose hizmetini o sürümle başlatın. Eski `dist` üzerine tek tek dosya kopyalayarak yarım sürüm sunmayın.
5. Sorun olursa önceki paketle hizmeti yeniden başlatın. Tarayıcı verilerini otomatik silmeyin.

## 6. Sayfa yönlendirme ve CORS

Uygulama `showPage()` ile aynı HTML içindeki modülleri gösterir; `/satis` gibi geçmiş tabanlı SPA rotası yoktur. Bu nedenle her bilinmeyen URL'yi `index.html`e çeviren bir rewrite eklenmedi. Var olmayan JS dosyaları gerçekten 404 döner; böylece bozuk dosyalar HTML cevabıyla gizlenmez. Yenileme ana adreste çalışır.

Varlık yolları `./assets/` ve `./app/` biçimindedir. Ayrı bir sunucuda alt klasör kullanılacaksa klasör URL'si `/works/` gibi sondaki eğik çizgiyle açılmalı ve sunucu aynı dağıtımı bu önek altında sunmalıdır. Varsayılan Caddy paketi uygulamayı seçilen alan adının kökünde sunar. `/works/` isteyen yönetici `file_server` satırını `handle_path /works/* { file_server }` bloğuna alıp `/works` için `/works/` yönlendirmesi eklemeli; `basic_auth` her iki yoldan önce korunmalıdır.

Fatura API'si bulunmadığından `Access-Control-Allow-Origin: *` eklenmedi. Dosyalar ve worker aynı origin'den yüklenir. Sunucu GET/HEAD dışındaki istekleri reddeder; fatura verileri başka bir servise gönderilmez.

## 7. Yayına geçmeden son kontrol

- Giriş yapmadan ana sayfa ve JS dosyasına erişim 401 olmalı.
- Yanlış şifreyle erişim reddedilmeli; izin verilen her kişi kendi hesabıyla girebilmeli.
- `.env`, `users.caddy`, kaynak ve test dosyaları dışarıdan açılmamalı.
- HTTPS sertifikası geçerli olmalı; HTTP HTTPS'e yönlenmeli.
- Eski ve yeni Excel örneğinizle yeni fatura sayısını tekrar kontrol edin.
- Üniversite şubesi içeren satış XML'ini Logo test ortamına alın; SEFAKÖY/SUAM DİŞ gibi yalnızca şube adı görünmeli. Medipolitan ve diğerlerinde açıklama boş olmalı.
- PDF önizleme, XML ve Excel indirme, not yedekleme/geri yükleme kendi bilgisayarınızda denenmeli.
- Not hatırlatmaları web sayfası kapalıyken çalışmaz. Bunun için ileride ayrı bildirim servisi gerekir; bu pakette böyle bir servis varmış gibi gösterilmez.

Resmi kaynaklar: [Caddy HTTPS](https://caddyserver.com/docs/automatic-https), [Caddy giriş koruması](https://caddyserver.com/docs/caddyfile/directives/basic_auth), [SheetJS yerel dosya dağıtımı](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), [PDF.js güvenlik duyurusu](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq).
