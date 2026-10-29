# Soyturk Works

Mevcut uygulamanın 180 web sürümü. Kaynak `src/app.html`, yerel kütüphaneler `vendor/`, yayın dosyaları `dist/` içindedir. Node.js 22 veya üzeri gerekir.

```sh
npm ci
npm run build
npm run check
npm test
npm run preview
```

Yerel adres: http://127.0.0.1:4173/

## Mevcut web yayını

`main` dalına gönderilen commit'ler mevcut Cloudflare Workers Builds bağlantısıyla `soyturkworks` Worker'ına yayınlanır. Canlı adres https://soyturkworks.com. `wrangler.jsonc` yalnızca `dist/` dizinini sunar; alan adı yönlendirmeleri panelde yönetilir. `dist/`, panelde build komutu tanımlı olmasa da yayın çalışabilsin diye Git'te tutulur. Kaynak değişikliklerinden sonra build, check ve test çalıştırılarak kaynak ve dağıtım birlikte gönderilmelidir.

Cloudflare'ın tek dosya sınırı için gömülü OCR verileri build sırasında ayrı, aynı sunucudan yüklenen dosyalara dönüştürülür. Asıl HTML kaynağı ve taşınabilir kopya için gereken OCR verileri korunur.

`KURULUM_TR.md` ve `DENETIM_TR.md`, ZIP'in hazırlandığı tarihteki Caddy/Docker paketini anlatır. Mevcut Cloudflare yayını Caddy kullanmaz ve bu dosyalardaki Basic Auth korumasını otomatik sağlamaz. Mevcut sitenin erişim ayarları korunur.

Notlar, faturalar ve ayarlar tarayıcıda saklanır; sunucuya otomatik yedeklenmez. Site adresi ve tarayıcı profili değişirse kayıtlar kendiliğinden taşınmaz.
