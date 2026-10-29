# Soyturk Works 180 — kaynak ve dağıtım denetimi

Başlangıç kaynağı: `Soyturk_Works_176.html`. Satış ve web hazırlıkları 177–179 ara sürümlerinde yapıldı; bu sürümler korunmuştur. Son değişikliğin doğrudan kaynağı 179, yeni teslim sürümü `Soyturk_Works_180.html` dosyasıdır. Önceki HTML sürümlerine ve dokunulmaz 78'e değişiklik yapılmadı. Canlı alan adına dağıtım yapılmadı.

## Düzeltilenler

| Bulgu | Uygulanan değişiklik |
|---|---|
| Hesap makinesinde CASIO adı vardı | Görünen ad SOYTURK yapıldı. Mevcut 15,5 px, 800 kalınlık ve italik stil korunur; CSS değiştirilmedi. |
| Gelen E-Fatura entegratör düzenleyicisi yanlış DOM elemanını okuyordu | Üç elemanlı seçicinin hatalı dizi ataması düzeltildi. İsim ve alan adı düzenleme/kaydetme yeniden çalışır. Bu, mevcut manuel Excel modülüdür; İzibiz otomasyonu değildir. |
| Satış XML açıklaması her caride hesap kodu ve hizmet metni içeriyordu | Yalnızca İstanbul Medipol Üniversitesi VKN'sinde şube adı; Medipolitan/Memorial ve diğerleri boş. Beş mevcut şube kuralı kullanılır. Belirsiz şube aktarımı engeller. |
| Cari kodu kontrolü yalnızca ekran kontrollerine dayanıyordu | XML üretiminde de cari ve ilgili müşteri muhasebe kodu 120 kontrolü. 320 otomatik 120'ye çevrilmez; hatalı aktarım durdurulur. Hizmet ve KDV hesapları değiştirilmez. |
| Not modülü sabit yerel Windows adresi ve gömülü erişim anahtarı kullanıyordu | Web kaynağında ve taşınabilir web şablonunda adres/anahtar kaldırıldı. Yalnızca açık sayfada tarayıcı hatırlatması; kapalı tarayıcıda çalışacağı iddiası kaldırıldı. |
| Excel/PDF kütüphaneleri CDN erişimine bağımlıydı | Dağıtımda aynı sunucudan, sürümü sabitlenmiş yerel dosyalar. SHA-256 manifestiyle build doğrulaması. |
| SheetJS 0.18.5 ve PDF.js 3.11.174 kullanılıyordu | Webde SheetJS 0.20.3, ExcelJS 4.4.0, PDF.js 4.10.38. PDF worker aynı sürüm/aynı origin. `isEvalSupported:false` ayrıca açıkça uygulanır. |
| Google Fonts dış isteği vardı | Yazı tipi dosyaları ve CSS pakette yerel sunulur. |
| Dosya adı ve bazı Excel/PDF metinleri doğrudan innerHTML'e yazılıyordu | Dosya adları, yeni fatura özeti, karşı taraf adları ve hata metinleri kaçışlanır. Satış/satınalma HTML kaçış fonksiyonlarına tırnak kaçışı eklenir. Not tablosu style niteliği kaçışlanır. |
| OCR ham fatura metni konsola basılıyordu | Web kaynağındaki console.log çıktıları kaldırıldı; hata bildirimleri korunur. |
| Statik kaynak herkes tarafından indirilebilirdi | Caddy Basic Auth HTML, JS, fontlar ve worker dahil her isteğin önünde. Şifre özeti yalnızca sunucu ayarında. |
| Web için boş ve bozuk kaynaklarda kullanıcı yönlendirmesi yoktu | Yükleme sırasında dosya işlemlerini bekletme; eksik kütüphane, çevrimdışı olma, kalıcı depolama hatası ve reddedilen Promise için görünür uyarı. Otomatik sayfa yenileme yok. |
| Üretim yapılandırması yoktu | Caddy/Docker Compose, HTTPS, no-store, noindex, frame engeli, MIME koruması, özel dosyaları 404 ile reddetme, GET/HEAD sınırı. |

## Korunanlar

Muhasebe hesap planları, firma ayrımı, XML sıralaması, vergi hesapları, merkezi `showPage()` ve mevcut modül tasarımları korunur. Yerel 180 satış açıklaması/kod kontrolü, hesap makinesi adı, entegratör düzenleme düzeltmesi ve metin kaçış/PDF değerlendirme güvenliği değişikliklerini içerir. Windows hatırlatıcısı dahil eski yerel işlevler korunur. Sunucu, yerel web kütüphaneleri ve web yükleme yönetimi ayrı web paketindedir. İzibiz eklentisi/bağlantısı geri eklenmedi.

Gömülü alıcı eşleştirmeleri ve hizmet hafızası, mevcut muhasebe kuralları olarak web kaynağında korunur. Bunlar gizli anahtar değildir ama işletme bilgisidir; bu nedenle paketin kendisi ve bütün kaynak dosyaları yetkisiz kişilere dağıtılmamalıdır. Yetkili kullanıcılar indirilen JavaScript içindeki eşleştirmeleri görebilir. Rapor geçmişi ve undo geçmişi web başlangıcında boşaltılmıştır; eski sürüm kayıtları silinmez. Gelen E-Fatura modülü yüklenmiş çalışma listesi olmadan başlar.

## Yapılan kontroller

- Canlı ve taşınabilir yerel HTML JavaScript sözdizimi; 180 değişikliklerinin geri alınmasıyla 179 kaynağıyla birebir eşitlik ve CSS bloklarının değişmemesi.
- Chrome'da SOYTURK yazısının boyut/kalınlık/konum kontrolü; toplama, bölme, vergi ve hafıza işlemleri. Entegratör adı/alan adı düzenlemesi, özel karakterler ve sayfa yenilemesinde kayıtların korunması.
- Pusula ve KİB için beş üniversite şubesi; yanlış eski açıklama, belirsiz şube, Medipolitan, Memorial ve diğer cari açıklamalarının gerçek XML üretim fonksiyonunda kontrolü; 320 reddi.
- Chrome'da web sürümünün altı modülü, alt dizin ve sayfa yenilemesi.
- Kayıtlı gerçek Excel satırları kullanılarak yeniden oluşturulan XLSX/XLS dosyalarıyla eski/yeni karşılaştırması: 65 eski, 66 yeni satır; yalnızca bir yeni fatura. Orijinal Excel ikili dosyaları bu ortamda bulunmadığından saklı satır verisi kullanıldı.
- Chrome'da PDF.js worker başlatma, metin okuma, sayfa çizme ve satış PDF yükleme.
- Dış ağa çalışma zamanı isteği olmaması; eksik kütüphane için hata ve yeniden deneme durumu.
- Yerel HTTP kökü ve alt dizin, eksik dosya, özel dosya/yol denemeleri ve POST reddi.
- Resmi SHA-512 ile doğrulanmış Caddy 2.10.2 üzerinde gerçek sunucu kontrolü: şifresiz HTML/JS 401, doğru şifre 200, özel/olmayan dosya 404, POST 405; CSP altında PDF işlemi; zararlı dosya adı/Excel metninin HTML çalıştırmaması.

## Kalan sınırlar

Bu kontrol bir penetrasyon testi veya tüm bağımlılıkların güvenlik sertifikası değildir. Bütün muhasebe senaryolarının ve her PDF sağlayıcısının uçtan uca doğrulandığı iddia edilmez. Gerçek Logo importu, gerçek alan adı DNS/TLS, Linux Docker çalışması ve gerçek kullanıcı hesapları bu ortamda doğrulanmadı; kurulum kılavuzundaki yayın kontrolü bunları kapsar.

Mevcut tek HTML uygulaması inline olay işleyicileri, dinamik stiller ve gömülü eski OCR motoru kullanır. Uyumluluk için CSP `script-src` içinde `unsafe-inline` ve `unsafe-eval` içerir. Kaynaklar aynı origin ile sınırlandırılmış ve belirlenen kaçış açıkları düzeltilmiştir; fakat nonce/hash tabanlı tam sıkı CSP'ye geçilmiş gibi gösterilmez. Bu kalan risk özellikle bilinmeyen kişilerden gelen dosyalarda önemlidir. OCR motorunu değiştirip tüm inline olayları kaldırmak ayrıca regresyon testi gerektirir.

Sunucu Basic Auth kullanır; MFA, kullanıcı yönetim ekranı, hesap bazlı bulut depolama, e-posta ile davet ve gelişmiş giriş hız sınırlaması yoktur. İnternete açılan sunucu ayrıca işletim sistemi güncellemeleri, güçlü benzersiz şifreler ve erişim denetimiyle işletilmelidir. Çok kullanıcılı muhasebe SaaS'ı olarak sunulmaz.

Webden indirilen “Ayarlarımla Birlikte Kaydet” çıktısı mevcut tek dosyalı taşınabilir biçimi korur; bu çıktı CDN kütüphanelerine ihtiyaç duyar ve ayarlarınızı içerir. Dağıtılacak web kaynağı olarak bu kişisel çıktıyı değil paket içindeki `dist/` dizinini kullanın.
