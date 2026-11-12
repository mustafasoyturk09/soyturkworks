# Soyturk Works çalışma kuralları

- Kullanıcıyla Türkçe ve sade bir dille çalış.
- Ana uygulama kaynağı `src/app.html`; üretilen web uygulaması `dist/` içindedir.
- Her değişiklik telefon, tablet ve masaüstü için uyarlanmalı; dar ekran ve yatay telefon görünümü ayrıca kontrol edilmelidir. Kullanıcının bunu her seferinde tekrar söylemesi gerekmez. Mobil düzen dosyaları `src/mobile.css` ve `src/mobile.js` içindedir.
- SW ambleminin özgün metalik renklerini, halka biçimini ve dış şeffaflığını koru. Kullanıcı açıkça istemedikçe kare/dikdörtgen zemin ekleme veya amblemi yeniden tasarlama.
- Kullanıcı uygulamada değişiklik istediğinde, aksi belirtilmedikçe değişikliği tamamla, `npm run build`, `npm run check`, `npm test` çalıştır ve üretilen `dist/` dosyalarını da commit'e ekle.
- Kullanıcı bu uygulama için kaydetme, çalıştırma ve mevcut GitHub deposuna gönderip yayınlama iş akışını yetkilendirmiştir. Yerel çalışma veya yayınlamama talimatı varsa onu öncelikle uygula.
- Mevcut depo `mustafasoyturk09/soyturkworks`, üretim dalı `main`, Cloudflare Worker adı `soyturkworks`, canlı adres `https://soyturkworks.com`.
- GitHub'a gönderimden sonra ilgili Cloudflare Workers Builds kontrolünü ve canlı dosyaları doğrula. Yalnızca gönderim başarılı oldu diye yayın tamamlandı deme.
- Yeni depo oluşturma, force push yapma veya mevcut DNS, alan adı, erişim kuralları ve tarayıcı kayıtlarını gereksiz yere değiştirme.
- Şifreleri, anahtarları, `.env` dosyasını ve gerçek fatura/kişisel çalışma dosyalarını depoya veya sohbete koyma.
- Cloudflare yayını yalnızca `dist/` dosyalarını sunar. Tek dosya boyutu 25 MiB sınırını aşmamalıdır. OCR dosyaları build sırasında ayrılır; taşınabilir HTML kaydetme işlevi korunmalıdır.
- Tek hesap / firma ayrımı geçişi `docs/giris-firma-gecisi.md` içindedir. İlk hesap için yalnızca sahibinin bilgisayarında tutulan tek kullanımlık kurulum bağlantısı kullanılır; herkese açık ilk-hesap sahiplenme yolu eklemeyin. Kurtarma adresi özel sunucu kaydında tutulur. `.secrets/owner-setup.json` içeriğini veya özel bağlantıyı araç çıktısına, sohbete ya da Git'e koymayın; kurulum betiğinin kullanımı bu kuralın kapsamı dışındadır.

## Kalıcı Codex çalışma talimatı

Bu kurallar SoyturkWorks projesindeki bundan sonraki bütün Codex çalışmalarında uygulanır.

### 1. Yalnızca ilgili modülle çalış

- Kullanıcı hangi modülün geliştirilmesini isterse yalnızca o modülün dosyalarını ve doğrudan bağımlılıklarını incele.
- Her görevde projeyi baştan sona tarama.
- Diğer modülleri gereksiz yere açma, analiz etme veya değiştirme.
- Projenin mevcut mimarisini koru.

### 2. Token tüketimini en aza indir

- Aynı dosyaları ve aynı kodları tekrar tekrar okuma.
- Gereksiz uzun analizler, kapsam dışı araştırmalar ve tekrar eden işlemler yapma.
- Önce değiştirilecek dosyaları belirle, ardından doğrudan geliştirmeye geç.
- Küçük bir değişiklik için bütün projeyi yeniden analiz etme.
- Gereksiz uzun açıklamalar ve raporlar oluşturma.

### 3. Testleri akıllıca çalıştır

- Öncelikle yalnızca değiştirilen modülün ilgili testlerini çalıştır.
- Her küçük değişiklikte yüzlerce testi tekrar tekrar çalıştırma.
- Ortak altyapı, veri güvenliği veya başka modüller etkileniyorsa gerekli kapsamlı testleri mutlaka yap.
- Hatalı testleri düzeltirken kapsam dışına çıkma.

### 4. Mevcut sistemi koru

- Çalışan diğer modülleri bozma.
- Gereksiz kod düzenlemeleri veya mimari değişiklikler yapma.
- Kullanıcı istemedikçe yeni özellik ekleme.
- Kritik bir değişiklik gerekiyorsa önce gerekçesini açıkla.

### 5. Geliştirmeyi tamamla

- Görevi yarım bırakma.
- Gerekli kontrolleri yap.
- Yapılan değişiklikleri ve test sonuçlarını kısa şekilde bildir.
- Güvenlik, doğruluk ve veri kaybını önleyen kontrollerden token tasarrufu amacıyla vazgeçme.
