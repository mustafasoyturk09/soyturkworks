# Soyturk Works çalışma kuralları

- Kullanıcıyla Türkçe ve sade bir dille çalış.
- Ana uygulama kaynağı `src/app.html`; üretilen web uygulaması `dist/` içindedir.
- Kullanıcı uygulamada değişiklik istediğinde, aksi belirtilmedikçe değişikliği tamamla, `npm run build`, `npm run check`, `npm test` çalıştır ve üretilen `dist/` dosyalarını da commit'e ekle.
- Kullanıcı bu uygulama için kaydetme, çalıştırma ve mevcut GitHub deposuna gönderip yayınlama iş akışını yetkilendirmiştir. Yerel çalışma veya yayınlamama talimatı varsa onu öncelikle uygula.
- Mevcut depo `mustafasoyturk09/soyturkworks`, üretim dalı `main`, Cloudflare Worker adı `soyturkworks`, canlı adres `https://soyturkworks.com`.
- GitHub'a gönderimden sonra ilgili Cloudflare Workers Builds kontrolünü ve canlı dosyaları doğrula. Yalnızca gönderim başarılı oldu diye yayın tamamlandı deme.
- Yeni depo oluşturma, force push yapma veya mevcut DNS, alan adı, erişim kuralları ve tarayıcı kayıtlarını gereksiz yere değiştirme.
- Şifreleri, anahtarları, `.env` dosyasını ve gerçek fatura/kişisel çalışma dosyalarını depoya veya sohbete koyma.
- Cloudflare yayını yalnızca `dist/` dosyalarını sunar. Tek dosya boyutu 25 MiB sınırını aşmamalıdır. OCR dosyaları build sırasında ayrılır; taşınabilir HTML kaydetme işlevi korunmalıdır.
