# İzibiz gelen fatura bağlantısı

Gelen E-Fatura Takip modülündeki İzibiz düğmesi seçili firmaya bağlıdır. İlk
bağlantıda mevcut İzibiz kullanıcı adı, şifresi ve alıcı firmanın VKN/TCKN bilgisi
uygulamanın bağlantı ekranında girilir. Bunları sohbete veya Git'e koymayın.
Chrome'daki parola kaydı başka alan adındaki uygulamaya otomatik aktarılmaz.
İlk gerçek bağlantının ve hesap yetkisinin kontrolü bu ekranda yapılır.

Sunucu yalnızca `https://api.izibiz.com.tr` adresindeki resmî REST servislerine
erişir. Oturum, firma kimliği ve gelen fatura okuma izni doğrulanmadan bağlantı
kaydedilmez. Şifreler Durable Object içinde AES-256-GCM ile firma bağlamına bağlı
şifrelenir. Anahtar bağlantılardan ayrı, özel bir Durable Object içinde otomatik
oluşturulur (32 rastgele bayt, base64url). Bu nesne yalnızca Worker'ın iç
bağlantısıyla erişilir; herkese açık URL veya API yolu yoktur. İstenirse dağıtımdan
önce `IZIBIZ_ENCRYPTION_KEY` Worker secret'ı kullanılabilir. Kullanım başladıktan
sonra anahtarı veya anahtar kaynağını değiştirmeyin: önceki bağlantılar açılamaz.
Anahtarı, API token'larını veya şifreleri yazdırmayın.
API token'ları yalnızca bellekte tutulur ve süreleri dolduğunda bir kez yenilenir.
İzibiz'e ulaşılamazsa ya da yetki verilmezse işlem hata gösterir.

## Kullanım

1. Seçili firmada eski işlenmiş Excel'i yükleyin. İstenirse mevcut yeni ham
   Excel de yüklenebilir; o satırlardaki elle işlenmiş işaretleri korunur.
2. İzibiz düğmesinden bağlantıyı bir kez doğrulayın. Her firma ayrı bağlanır.
3. Fatura tarihi aralığını seçin. Varsayılan, yüklü ham Excel'deki tarih aralığı;
   ham Excel yoksa İstanbul tarihine göre bu ayın başından bugüne kadardır.
4. Chrome/Edge masaüstünde İndirilenler klasörünü seçebilirsiniz. Klasör izni
   firma bazlı tarayıcı veritabanında saklanır; gerekirse tarayıcı yeniden sorar.
   Diğer tarayıcılarda firma klasörü içeren ZIP indirilir. ZIP içeriği 200 MB ile
   sınırlıdır; daha büyük işlemlerde doğrudan klasör veya dar tarih aralığı seçin.
5. “İzibiz’den al ve kaydet” tüm sayfaları alır, eski fatura numaralarıyla
   karşılaştırır, mevcut Excel biçimlendiricisini kullanır ve yalnızca yeni,
   reddedilmemiş faturaların PDF/XML çiftlerini kaydeder. XML fatura numarası,
   ETTN ve alıcı VKN/TCKN bilgisi de doğrulanır.

Klasör: `Firma/Gelen E-Faturalar/tarih_saat_oturum/`. İçerik: güncel ham liste,
biçimlenmiş Excel, `PDF/`, `XML/`, `Durum.txt`. Aynı isimli önceki indirmelerin
üzerine yazılmaz. Her çalıştırmada ayrı klasör kullanılır. İndirme geçmişi
“işlendi” sayılmaz; muhasebe karşılaştırmasının kaynağı yüklenen eski Excel'dir.

Eksik sayfa, değişen liste, tekrar eden numara veya başka firmaya ait belge
tespit edilirse tamamlandı denmez. Klasöre doğrudan yazarken yarım kalan dosyalar
kalabilir; `Durum.txt` bunu açıkça belirtir. Tamamlanmayan ZIP indirilmez.
Manuel liste alma firma başına beş dakikayla sınırlıdır. Tek sorgu en fazla bir
yıl ve 20.000 fatura kapsar. Fatura kabul/red, gönderme, silme veya okundu
işaretleme işlemleri yapılmaz. Faturalar ve Excel'ler sunucuda saklanmaz.

Taşınabilir HTML'de düğme bulunur; otomatik servis bağlantısı için canlı sitedeki
firma oturumu gerekir. Taşınabilir dosyada şifre veya API token'ı yoktur.

## Doğrulama ve sınır

Pusula hesabıyla 30 Ekim 2026'da yerel önizlemeden gerçek API oturumu, firma
kimliği, gelen fatura listesi ve örnek faturanın PDF/XML indirmesi doğrulandı.
XML'in fatura numarası, ETTN ve alıcı VKN bilgisi eşleşti. Gerçek belgeler test
sırasında yalnızca bellekte işlendi; depoya veya test çıktısına konmadı.
Gerçek servis `/customers/me` yanıtında `vknTckno` / `commercialName`, belge
indirme yanıtında `{filename, content}` Base64 yapısı kullanıyor; bunlar desteklenir.
Diğer firmaların API yetkisi henüz sınanmadı. Yerel önizleme bağlantısı canlı
sunucuya kendiliğinden taşınmaz; canlı sitede firma bir kez bağlanmalıdır.

Masaüstü ve 390 × 844 telefon görünümü Safari'de açıldı. Telefon için tarih
alanları tek sütuna geçirildi; yatay telefon için kısa, kaydırılabilir pencere
kuralları eklendi. Son tablet/yatay görsel doğrulaması tamamlanamadı.

Kaynaklar:
- https://dev.izibiz.com.tr/endpoint/authentication-api/auth-token
- https://dev.izibiz.com.tr/endpoint/customer-api/customers-me
- https://dev.izibiz.com.tr/endpoint/einvoice-v1-api/incoming-invoice-list
- https://dev.izibiz.com.tr/endpoint/einvoice-v1-api/incoming-invoice-download
