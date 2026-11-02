
/* =====================================================================
   MODÜL — SATINALMA FATURALARI (v73 — sunucusuz / tek dosya / file://)
   Kapalı kapsamlı IIFE: yalnızca sf- önekli id/class'larla ve kendi
   sfState'iyle çalışır; mevcut hiçbir modüle (Gelen E-Fatura, Yurt Dışı
   Yevmiye, Cari Mutabakat) dokunmaz. Yalnızca üç GENEL (salt okunur)
   yardımcı yeniden kullanılır: toast(), formatMoney() (varsa) — state
   PAYLAŞILMAZ.

   MİMARİ NOT (v73): Önceki sürüm (v72) gerçek bir yerel Node/Express
   sunucusu gerektiriyordu; kullanıcı bunu AÇIKÇA REDDETTİ ve "tek HTML
   dosyası, file://, kurulum yok" şartını kesinleştirdi. Bu sürümde:
     - OCR tamamen bu dosyanın İÇİNE gömülü çalışır (Tesseract WASM
       motoru + Türkçe dil verisi base64 olarak bu dosyada saklanır,
       ana iş parçacığında/worker'sız çalıştırılır — bkz. SF_OCR bloğu
       ve bunun altındaki mühendislik notu).
     - Telefon→bilgisayar QR ile DOSYA TRANSFERİ YOKTUR (bu, sunucu
       gerektirir ve kullanıcı tarafından açıkça reddedilmiştir).
       Bunun yerine: çoklu dosya seçici, sürükle-bırak ve (mobil
       tarayıcılarda) kamera doğrudan input[capture] ile açılır.
     - "QR" kelimesi bu modülde yalnızca FİŞİN ÜZERİNDEKİ QR/karekodu
       seçilen fotoğraftan OKUMA anlamında kullanılır (jsQR ile,
       tamamen yerel) — telefon eşleştirme QR'ı DEĞİLDİR.
     - Veri tarayıcıda saklanır: yapısal veri + ayarlar localStorage'da,
       fiş görselleri IndexedDB'de (daha büyük kapasite). IndexedDB
       kullanılamazsa (bazı tarayıcı/mod kombinasyonlarında olabilir)
       küçültülmüş görseller localStorage'a düşürülür ve kullanıcıya
       açık bir uyarı gösterilir — asla sessizce veri kaybedilmez.

   HESAPLAMA/XML MANTIĞI: lib/pusulaAccounting.js ve lib/sfXml.js
   (Node) ile BİREBİR AYNI mantık burada da TEK doğruluk kaynağı
   olarak tutulur (SF_ACC, SF_XML) — önizleme ve XML üretimi aynı
   fonksiyonları çağırır.
   ===================================================================== */
(function(){
  'use strict';
  if(!document.getElementById('page-satinalma')) return;

  /* ================================================================
     SF_ISO — ISO-8859-9 (Latin-5/Türkçe) byte kodlama + indirme.
     Yevmiye modülündeki lxToISO88599Bytes/lxDownload ile AYNI mantık
     (o modül kendi IIFE'sinde kapalı olduğu için burada ayrıca, kendi
     sf- önekiyle tanımlanır — state paylaşılmaz, yalnızca algoritma
     aynıdır).
     ================================================================ */
  var SF_ENC_MAP = {0x011E:0xD0, 0x0130:0xDD, 0x015E:0xDE, 0x011F:0xF0, 0x0131:0xFD, 0x015F:0xFE};
  var SF_DEC_MAP = {0xD0:0x011E, 0xDD:0x0130, 0xDE:0x015E, 0xF0:0x011F, 0xFD:0x0131, 0xFE:0x015F};
  function sfToISO88599Bytes(str){
    str = String(str==null?'':str);
    var bytes = new Uint8Array(str.length);
    var lost = false;
    for(var i=0;i<str.length;i++){
      var cp = str.charCodeAt(i);
      if(SF_ENC_MAP[cp] !== undefined) bytes[i] = SF_ENC_MAP[cp];
      else if(cp <= 0xFF) bytes[i] = cp;
      else { bytes[i] = 0x3F; lost = true; }
    }
    return {bytes:bytes, lost:lost};
  }
  function sfXmlEscape(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function sfUUID(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID().toUpperCase();
    var hex = '0123456789ABCDEF';
    function seg(n){ var s=''; for(var i=0;i<n;i++) s+=hex[Math.floor(Math.random()*16)]; return s; }
    return seg(8)+'-'+seg(4)+'-'+seg(4)+'-'+seg(4)+'-'+seg(12);
  }
  function sfDownloadXml(filename, str){
    var enc = sfToISO88599Bytes(str);
    var blob = new Blob([enc.bytes], {type:'application/xml'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    // Kendi ürettiğimiz XML'i tekrar decode edip geri okuyarak Türkçe
    // karakterlerin bozulmadığını doğrula (round-trip kontrolü).
    var roundTrip = '';
    for(var i=0;i<enc.bytes.length;i++){
      var b = enc.bytes[i];
      roundTrip += String.fromCharCode(SF_DEC_MAP[b]!==undefined ? SF_DEC_MAP[b] : b);
    }
    var ok = (roundTrip === str) || enc.lost; // enc.lost ise zaten '?' ile bilerek değişmiştir
    return { lost: enc.lost, roundTripOk: (roundTrip === str) };
  }

  /* ================================================================
     SF_ACC — Pusula muhasebe kuralları (lib/pusulaAccounting.js ile
     BİREBİR AYNI mantık — yalnızca Node module.exports kaldırılmıştır).
     ================================================================ */
  var SF_ACC = (function(){
    function round2(n) {
      if (!isFinite(n)) return 0;
      var sign = n >= 0 ? 1 : -1;
      return Math.round((Math.abs(n) + 1e-9) * 100) / 100 * sign;
    }
    function money(n) { return round2(n).toFixed(2); }

    var VAT_RATE_ACCOUNT_MAP = {
      1:  { code: '191.01.003', label: '%1 İndirilecek Kdv' },
      10: { code: '191.01.005', label: '%10 İndirilecek Kdv' },
      20: { code: '191.01.004', label: '%20 İndirilecek Kdv' }
    };

    var CATEGORIES = {
      YAKIT: {
        key: 'YAKIT', label: 'Taşıt Yakıt Giderleri', expenseAccount: '770.03.004',
        kkegSplit: true, kkegExpenseAccount: '689.03.012', kkegExpenseLabel: 'Binek Araç Giderleri (KKEG)',
        kkegVatAccount: '689.03.003', kkegVatLabel: 'Kanunen Kabul Edilmeyen Kdv',
        masrafMerkezi: 'DB.01'
      },
      OTOPARK: {
        key: 'OTOPARK', label: 'Otopark (Park Vallet)', expenseAccount: '770.11.004',
        kkegSplit: true, kkegExpenseAccount: '689.03.012', kkegExpenseLabel: 'Binek Araç Giderleri (KKEG)',
        kkegVatAccount: '689.03.003', kkegVatLabel: 'Kanunen Kabul Edilmeyen Kdv',
        masrafMerkezi: 'DB.01'
      },
      YEMEK_PERSONEL: {
        key: 'YEMEK_PERSONEL', label: 'Personel Yemek Giderleri', expenseAccount: '770.02.013',
        kkegSplit: false, masrafMerkezi: 'DB.01'
      },
      YEMEK_OFIS: {
        key: 'YEMEK_OFIS', label: 'Ofis Yiyecek ve İçecek Giderleri', expenseAccount: '770.02.005',
        kkegSplit: false, masrafMerkezi: 'DB.01'
      },
      TEMSIL_AGIRLAMA: {
        key: 'TEMSIL_AGIRLAMA', label: 'Temsil ve Ağırlama Giderleri', expenseAccount: '770.10.001',
        kkegSplit: false, masrafMerkezi: 'DB.01'
      },
      DIGER_CESITLI: {
        key: 'DIGER_CESITLI', label: 'Diğer Çeşitli Giderler', expenseAccount: '770.15.006',
        kkegSplit: false, masrafMerkezi: 'DB.01'
      },
      DIGER: {
        key: 'DIGER', label: 'Diğer (elle seçilecek)', expenseAccount: '', kkegSplit: false, masrafMerkezi: 'DB.01'
      }
    };

    function splitVat(kdvDahilTutar, kdvOraniPercent) {
      var toplam = round2(kdvDahilTutar);
      var oran = Number(kdvOraniPercent) || 0;
      var matrahRaw = toplam / (1 + oran / 100);
      var matrah = round2(matrahRaw);
      var kdv = round2(toplam - matrah);
      return { matrah: matrah, kdv: kdv, toplam: toplam };
    }
    function split7030(tutar) {
      var t = round2(tutar);
      var yetmis = round2(t * 0.7);
      var otuz = round2(t - yetmis);
      return { yetmis: yetmis, otuz: otuz };
    }
    function computeLine(input) {
      var cat = CATEGORIES[input.category] || CATEGORIES.DIGER;
      var oran = Number(input.kdvOraniPercent);
      var vatAcc = VAT_RATE_ACCOUNT_MAP[oran];
      if (!vatAcc) {
        return { ok: false, error: 'unknown_vat_rate', message: '%' + input.kdvOraniPercent + ' KDV oranı için tanımlı bir indirilecek KDV hesabı yok (%1/%10/%20 dışında). Hesabı elle seçin.' };
      }
      if (!cat.expenseAccount) {
        return { ok: false, error: 'no_expense_account', message: 'Bu gider kategorisi için hesap kodu henüz seçilmedi.' };
      }
      var matrah, kdv, toplam;
      if (input.kdvTutariOverride != null && isFinite(input.kdvTutariOverride)) {
        // Kullanıcı KDV tutarını elle değiştirdi: toplam sabit kalır, matrah
        // farkla türetilir — böylece borç=alacak mutabakatı HER ZAMAN korunur.
        toplam = round2(input.kdvDahilTutar);
        kdv = round2(input.kdvTutariOverride);
        matrah = round2(toplam - kdv);
      } else {
        var s = splitVat(input.kdvDahilTutar, oran);
        matrah = s.matrah; kdv = s.kdv; toplam = s.toplam;
      }
      var masrafMerkezi = input.masrafMerkezi || cat.masrafMerkezi || 'DB.01';
      var lines = [];
      var totalBorc = 0;
      if (cat.kkegSplit) {
        var exp = split7030(matrah);
        var vat = split7030(kdv);
        lines.push({ code: cat.expenseAccount, label: cat.label, masrafMerkezi: masrafMerkezi, tutar: exp.yetmis, taraf: 'borc' });
        lines.push({ code: vatAcc.code, label: vatAcc.label, masrafMerkezi: '', tutar: vat.yetmis, taraf: 'borc' });
        lines.push({ code: cat.kkegExpenseAccount, label: cat.kkegExpenseLabel, masrafMerkezi: masrafMerkezi, tutar: exp.otuz, taraf: 'borc' });
        lines.push({ code: cat.kkegVatAccount, label: cat.kkegVatLabel, masrafMerkezi: masrafMerkezi, tutar: vat.otuz, taraf: 'borc' });
        totalBorc = round2(exp.yetmis + vat.yetmis + exp.otuz + vat.otuz);
      } else {
        lines.push({ code: cat.expenseAccount, label: cat.label, masrafMerkezi: masrafMerkezi, tutar: matrah, taraf: 'borc' });
        lines.push({ code: vatAcc.code, label: vatAcc.label, masrafMerkezi: '', tutar: kdv, taraf: 'borc' });
        totalBorc = round2(matrah + kdv);
      }
      return {
        ok: true, category: cat.key, matrah: matrah, kdv: kdv, toplam: toplam,
        lines: lines, totalBorc: totalBorc,
        reconciles: Math.abs(totalBorc - toplam) < 0.005,
        kkegApplied: !!cat.kkegSplit,
        vatAccount: vatAcc.code
      };
    }
    function computeReceipt(rows) {
      var results = rows.map(computeLine);
      var anyError = null;
      for(var i=0;i<results.length;i++){ if(!results[i].ok){ anyError = results[i]; break; } }
      if (anyError) return { ok: false, error: anyError.error, message: anyError.message, rows: results };
      var totalBorc = round2(results.reduce(function(s,r){ return s + r.totalBorc; }, 0));
      var grandToplam = round2(results.reduce(function(s,r){ return s + r.toplam; }, 0));
      return {
        ok: true, rows: results, totalBorc: totalBorc, grandToplam: grandToplam,
        reconciles: Math.abs(totalBorc - grandToplam) < 0.005
      };
    }
    function guessCategory(rawText) {
      var t = (rawText || '').toLocaleUpperCase('tr-TR');
      function has(arr){ return arr.some(function(k){ return t.indexOf(k) !== -1; }); }
      if (has(['LT X', ' LT ', 'DIESEL', 'DİZEL', 'BENZİN', 'BENZIN', 'LPG', 'MOTORIN', 'MOTORİN', 'AKARYAKIT', 'PETROL'])) {
        return { category: 'YAKIT', confidence: 'high', reason: 'Akaryakıt istasyonu / yakıt ürünü ifadeleri tespit edildi.' };
      }
      if (has(['OTOPARK', 'VALE', 'PARK VALLET', 'PARKING'])) {
        return { category: 'OTOPARK', confidence: 'high', reason: '"Otopark/Vale" ifadesi tespit edildi.' };
      }
      if (has(['MARKET', 'GIDA', 'GIDA SAN'])) {
        return { category: 'YEMEK_OFIS', confidence: 'low', reason: 'Market/gıda toptan alışverişi olabilir — ofis yiyecek/içecek olarak öneriliyor, kontrol edin.' };
      }
      if (has(['RESTORAN', 'RESTAURANT', 'LOKANTA', 'KÖFTE', 'KOFTE', 'KEBAP', 'CAFE', 'KAFE', 'PASTA', 'BÜFE', 'BUFE', 'YEMEK', ' ET ', 'BALIK', 'PİDE', 'PIDE'])) {
        return { category: 'YEMEK_PERSONEL', confidence: 'low', reason: 'Yemek/içecek fişi tespit edildi — varsayılan olarak "Personel Yemek" öneriliyor, gerekirse "Ofis" veya "Temsil-Ağırlama" olarak değiştirin.' };
      }
      return { category: 'DIGER_CESITLI', confidence: 'low', reason: 'Fiş içeriğinden gider kategorisi güvenle tahmin edilemedi — kontrol edin. "Diğer Çeşitli Giderler" (770.15.006) öneriliyor, gerekirse değiştirin.' };
    }
    return { round2: round2, money: money, VAT_RATE_ACCOUNT_MAP: VAT_RATE_ACCOUNT_MAP, CATEGORIES: CATEGORIES,
      splitVat: splitVat, split7030: split7030, computeLine: computeLine, computeReceipt: computeReceipt, guessCategory: guessCategory };
  })();

  /* ================================================================
     SF_OCREXTRACT — OCR ham metninden fiş alanı çıkarımı
     (lib/ocrExtract.js ile birebir aynı mantık).
     ================================================================ */
  var SF_OCREXTRACT = (function(){
    function trNum(s) {
      if (s == null) return null;
      var t = String(s).trim().replace(/^\*/, '');
      if (/,\d{1,2}$/.test(t)) { t = t.replace(/\./g, '').replace(',', '.'); }
      else { t = t.replace(/,/g, ''); }
      var n = parseFloat(t);
      return isFinite(n) ? n : null;
    }
    // Gün/ay/yıl doğrulaması — hem OCR alan çıkarımında hem de arayüzdeki
    // canlı Tarih biçimlendirmesinde (sfNormalizeDateField) TEK doğruluk
    // kaynağı olarak kullanılır; bu yüzden modül dışına export edilir.
    function validDmy(d, m, y){
      d = Number(d); m = Number(m); y = Number(y);
      if (!isFinite(d) || !isFinite(m) || !isFinite(y)) return false;
      if (!(y >= 1900 && y <= 2100)) return false;
      if (!(m >= 1 && m <= 12)) return false;
      var daysInMonth = [31, ((y%4===0 && y%100!==0) || y%400===0) ? 29 : 28, 31,30,31,30,31,31,30,31,30,31];
      if (!(d >= 1 && d <= daysInMonth[m-1])) return false;
      return true;
    }
    // Bir eşleşmenin SAAT (ss:dd veya ss.dd) olma ihtimalini elemek için:
    // metinde eşleşen konumun hemen öncesinde/sonrasında "SAAT" kelimesi ya
    // da bir ':' varsa (saat biçimi çoğunlukla ':' kullanır, tarih değil),
    // bu adayı tarih olarak KABUL ETME.
    function looksLikeTimeContext(text, matchIndex, matchLen){
      var before = text.slice(Math.max(0, matchIndex - 8), matchIndex);
      var after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 3);
      if (/SAAT/i.test(before)) return true;
      if (/^\s*:/.test(after)) return true;
      return false;
    }
    function extractFields(rawText) {
      var text = String(rawText || '');
      var lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);

      var out = {
        tarih: '', tarihConfidence: 'low',
        belgeNo: '', belgeNoConfidence: 'low',
        unvan: '', unvanConfidence: 'low',
        sahisAdi: '',
        vergiDairesi: '', vknTckn: '',
        urunAciklama: '',
        kdvDahilTutar: null, kdvOrani: null, kdvTutari: null, kdvMatrah: null, tutarConfidence: 'low',
        odemeSekli: '',
        warnings: []
      };

      // Ayraçlı biçimler (06-02-2024 / 06.02.2024 / 06/02/2024): metindeki
      // TÜM adaylar taranır, SAAT bağlamında görünen (önünde "SAAT" ya da
      // ardından ':' olan) adaylar elenir, geçerli gün/ay/yıl olan İLK aday
      // kullanılır.
      var dateRe = /\b(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})\b/g;
      var dm;
      while ((dm = dateRe.exec(text))) {
        if (looksLikeTimeContext(text, dm.index, dm[0].length)) continue;
        if (!validDmy(dm[1], dm[2], dm[3])) continue;
        out.tarih = dm[1].padStart(2, '0') + '.' + dm[2].padStart(2, '0') + '.' + dm[3];
        out.tarihConfidence = 'high';
        break;
      }
      if (!out.tarih) {
        // Ayraçsız biçim: 06022024 gibi 8 haneli bir blok (saat/VKN gibi başka
        // rakam gruplarıyla karışmaması için \b ile sınırlı, gün/ay/yıl
        // doğrulaması yapılır; SAAT bağlamındaki adaylar yine elenir).
        var d8Re = /\b(\d{2})(\d{2})(\d{4})\b/g;
        var d8;
        while ((d8 = d8Re.exec(text))) {
          if (looksLikeTimeContext(text, d8.index, d8[0].length)) continue;
          if (!validDmy(d8[1], d8[2], d8[3])) continue;
          out.tarih = d8[1] + '.' + d8[2] + '.' + d8[3];
          out.tarihConfidence = 'high';
          break;
        }
      }
      if (!out.tarih) out.warnings.push('Tarih fiş üzerinde bulunamadı — mutlaka kontrol edin, bugünün tarihi OTOMATİK OLARAK kullanılmaz.');

      // FİŞ NO / FIS NO / FİŞNO / FIS NO: gibi yazım çeşitleri — EKÜ NO ve
      // Z NO ile KESİNLİKLE karıştırılmaz (bunlar farklı sayaçlardır, fiş no
      // için asla yedek/fallback olarak kullanılmaz).
      var fisNoMatch = text.match(/F[İI][ŞS]\s*NO\.?\s*:?\s*#?\s*(\d{1,10})/i);
      if (fisNoMatch) {
        out.belgeNo = fisNoMatch[1];
        out.belgeNoConfidence = 'high';
      } else {
        out.warnings.push('Fiş/Belge No bulunamadı — elle girin (EKÜ No veya Z No fiş no olarak kullanılmaz).');
      }

      // ---- ünvan + şahıs adı: yasal unvan sonekine kadar oku, ardından
      // ayrı bir satırda şahıs adı soyadı varsa onu da yakala ----------
      var stopWordRe = /^(FİŞ|FIS|TARİH|SAAT|KDV|TOP|TOPLAM|NAKİT|NAKIT|EKÜ|EKU|Z\s*NO|VKN|TCKN|V\.D|VERGİ|MERSİS|EPDK|TEL|POMPA|TAB\.?\s*NO)/i;
      var addressWordRe = /(MAH\.?|MAHALLES[İI]|CAD\.?|CADDES[İI]|SOK\.?|SOKAK|APT\.?|BLV\.?|BULVAR|NO\s*[:.]?\s*\d|\/[A-ZÇĞİÖŞÜ]{2,}|V\.?D\.?\b)/i;
      var legalSuffixRe = /(LTD\.?\s*Ş[Tİ]İ?\.?|L[İI]M[İI]TED\s+Ş[İI]RKET[İI]|A\.?\s*Ş\.?\b|ANON[İI]M\s+Ş[İI]RKET[İI]|SAN\.?\s*(VE)?\s*T[İI]C\.?(\s*LTD\.?\s*ŞT[İI]\.?)?|T[İI]C\.?\s*A\.?\s*Ş\.?)/i;
      var personNameRe = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]*(\s+[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]*){1,3}$/;

      var candidateLines = [];
      for (var li=0; li<lines.length; li++) {
        var l = lines[li];
        if (stopWordRe.test(l)) break;
        if (/^\d+([.,]\d+)?\s*(LT|KG|ADET)?\s*[Xx*]/i.test(l)) break;
        candidateLines.push(l);
        if (candidateLines.length >= 4) break;
      }
      if (candidateLines.length) {
        var unvanParts = [candidateLines[0]];
        var consumedUpTo = 0; // candidateLines index son tüketilen unvan satırı
        var accumulatedHasSuffix = legalSuffixRe.test(candidateLines[0]);
        while (!accumulatedHasSuffix && consumedUpTo < 2 && candidateLines[consumedUpTo+1] &&
               !personNameRe.test(candidateLines[consumedUpTo+1]) && !addressWordRe.test(candidateLines[consumedUpTo+1])) {
          // Yasal unvan sonu henüz görülmedi, ve sonraki satır bir şahıs adı ya
          // da adres gibi görünmüyor — unvan muhtemelen bu satıra taşıyor (çok
          // satırlı ticari unvan), onu da ekle (en fazla 3 satır).
          consumedUpTo += 1;
          unvanParts.push(candidateLines[consumedUpTo]);
          accumulatedHasSuffix = legalSuffixRe.test(unvanParts.join(' '));
        }
        out.unvan = unvanParts.join(' ').replace(/\s+/g, ' ').trim();
        out.unvanConfidence = 'high';
        var nextIdx = consumedUpTo + 1;
        var nextLine = candidateLines[nextIdx];
        if (nextLine && personNameRe.test(nextLine) && !addressWordRe.test(nextLine) && !/\d/.test(nextLine)) {
          out.sahisAdi = nextLine;
        }
      } else {
        out.warnings.push('Satıcı ünvanı okunamadı — elle girin.');
      }

      var vdMatch = text.match(/([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s*V\.?D\.?\b/i) || text.match(/VERGİ\s*DA[İI]RES[İI]\s*:?\s*([A-ZÇĞİÖŞÜ]+)/i);
      if (vdMatch) out.vergiDairesi = vdMatch[1].trim();

      var vknMatch = text.match(/VKN\s*\/?\s*TCKN\s*:?\s*(\d{10,11})/i) || text.match(/\b(\d{10,11})\b/);
      if (vknMatch) out.vknTckn = vknMatch[1];

      function lastNumberOnLine(rawLine) {
        var line = rawLine.replace(/(\d)[.,]\s+(\d{2})\b/g, '$1.$2');
        var nums = line.match(/[\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g);
        if (!nums || !nums.length) return null;
        var best = null;
        for (var ni=0; ni<nums.length; ni++) {
          var cand = nums[ni];
          if (best == null) { best = cand; continue; }
          var candHasDec = /[.,]\d{1,2}$/.test(cand);
          var bestHasDec = /[.,]\d{1,2}$/.test(best);
          if (candHasDec && !bestHasDec) best = cand;
          else if (candHasDec === bestHasDec && cand.length >= best.length) best = cand;
        }
        return trNum(best);
      }
      var topCandidates = lines.filter(function(l){ return /\bTOP(?!KDV)[A-ZİŞĞÜÖÇ]{0,6}\b/i.test(l); });
      for (var ti=0; ti<topCandidates.length; ti++) {
        var n = lastNumberOnLine(topCandidates[ti]);
        if (n != null) { out.kdvDahilTutar = n; out.tutarConfidence = 'high'; break; }
      }
      if (out.kdvDahilTutar == null) {
        // "TOP" satırı OCR gürültüsü yüzünden okunamamış olabilir (ör. "TOP"
        // yerine "op", "T0P" gibi bozuk çıkmış). İki yedek yöntem dene:
        // 1) "NAKİT/NAKIT" (ödenen tutar) satırı genelde toplam ile aynıdır.
        // 2) Fişte AYNI parasal değer birden fazla kez geçiyorsa (ör. ürün
        //    fiyatı = toplam = nakit, tek kalemli fişlerde tipik), en sık
        //    tekrar eden değeri düşük güvenle aday olarak al.
        var nakitLine = lines.find(function(l){ return /\bNAK[İI]T\b/i.test(l); });
        var nakitAmount = nakitLine ? lastNumberOnLine(nakitLine) : null;
        if (nakitAmount != null) {
          out.kdvDahilTutar = nakitAmount;
          out.tutarConfidence = 'low';
          out.warnings.push('KDV dahil toplam "TOP" satırından değil, "NAKİT" satırından tahmin edildi — kontrol edin.');
        } else {
          // Son çare: fişteki EN YÜKSEK parasal değeri toplam adayı olarak al
          // (bir fişte toplam tutar neredeyse her zaman tek tek kalem
          // tutarlarından ve KDV tutarından büyük ya da eşittir) — düşük
          // güvenle işaretlenir, kullanıcı mutlaka kontrol etmelidir.
          var allNums = (text.match(/[\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/g) || []).map(trNum).filter(function(v){ return v != null && v > 0; });
          if (allNums.length) {
            var maxVal = Math.max.apply(null, allNums);
            out.kdvDahilTutar = maxVal;
            out.tutarConfidence = 'low';
            out.warnings.push('KDV dahil toplam net okunamadı, fişteki en yüksek tutardan (' + maxVal.toFixed(2).replace('.', ',') + ') tahmin edildi — mutlaka kontrol edin.');
          }
        }
      }
      if (out.kdvDahilTutar == null) {
        out.warnings.push('KDV dahil toplam tutar bulunamadı — elle girin.');
      }

      var validRates = [1, 8, 10, 18, 20];
      var rateMatch = text.match(/%\s*(\d{1,2})\b/);
      var kdvOraniFound = rateMatch ? Number(rateMatch[1]) : null;
      if (kdvOraniFound == null) {
        var xMatch = text.match(/\b[Xx]\s*(\d{1,2})\b/);
        if (xMatch && validRates.indexOf(Number(xMatch[1])) !== -1) kdvOraniFound = Number(xMatch[1]);
      }
      if (kdvOraniFound != null) out.kdvOrani = kdvOraniFound;
      else out.warnings.push('KDV oranı fişte net okunamadı — elle seçin.');

      var kdvLine = lines.find(function(l){ return /\bTOPKDV\b/i.test(l); }) ||
        lines.find(function(l){ return /\bK[VD]V\b(?!\s*ORAN)/i.test(l) && !/^ARATOPLAM/i.test(l); });
      if (kdvLine) {
        var n2 = lastNumberOnLine(kdvLine);
        if (n2 != null) out.kdvTutari = n2;
      }

      if (out.kdvDahilTutar != null && out.kdvOrani != null) {
        var split = SF_ACC.splitVat(out.kdvDahilTutar, out.kdvOrani);
        out.kdvMatrah = split.matrah;
        if (out.kdvTutari != null && Math.abs(out.kdvTutari - split.kdv) > 0.5) {
          out.warnings.push('Fişteki KDV tutarı (' + out.kdvTutari + ') ile hesaplanan (' + split.kdv.toFixed(2) + ') uyuşmuyor — kontrol edin.');
        }
        out.kdvTutari = split.kdv;
      }

      if (/\bNAK[İI]T\b/i.test(text)) out.odemeSekli = 'Nakit';
      else if (/KRED[İI]\s*KART/i.test(text)) out.odemeSekli = 'Kredi Kartı';

      out.urunAciklama = lines.slice(0, 12).join(' ');

      var guess = SF_ACC.guessCategory(out.unvan + ' ' + out.urunAciklama);

      return { fields: out, categoryGuess: guess };
    }
    return { extractFields: extractFields, trNum: trNum, validDmy: validDmy };
  })();

  /* ================================================================
     SF_XML — Logo Tiger PURCHASE_INVOICES XML üretimi
     (lib/sfXml.js ile birebir aynı mantık).
     ================================================================ */
  var SF_XML = (function(){
    function tag(name, val) { return '    <' + name + '>' + sfXmlEscape(val) + '</' + name + '>'; }
    function tag6(name, val) { return '        <' + name + '>' + sfXmlEscape(val) + '</' + name + '>'; }
    function monthYear(trDate) {
      var parts = String(trDate || '').split('.');
      return { month: parts[1] ? String(Number(parts[1])) : '', year: parts[2] || '' };
    }
    function lineDescription(line) {
      var fisNo = line.fisNo || '';
      var unvan = line.unvanSatir || '';
      return ('FİŞ NO:' + fisNo + ' ' + unvan).trim();
    }
    function buildInvoiceFragment(receipt) {
      if (!receipt.odeme || !receipt.odeme.kodu) {
        return { ok: false, error: 'no_payment_account', message: 'Ödeme/cari hesabı seçilmedi.' };
      }
      if (!receipt.odeme.glCode) {
        return { ok: false, error: 'no_payment_gl_code', message: 'Seçilen ödeme hesabının (' + receipt.odeme.kodu + ') karşı muhasebe kodu tanımlı değil — ayarlardan tamamlayın.' };
      }
      if (!receipt.lines || !receipt.lines.length) {
        return { ok: false, error: 'no_lines', message: 'Fişte hesaplanacak satır yok.' };
      }
      var computed = [];
      for (var i=0;i<receipt.lines.length;i++) {
        var line = receipt.lines[i];
        var cat = SF_ACC.CATEGORIES[line.category] || SF_ACC.CATEGORIES.DIGER;
        if (!cat.expenseAccount) return { ok: false, error: 'no_expense_account', message: 'Gider hesabı seçilmedi.' };
        var vatAcc = SF_ACC.VAT_RATE_ACCOUNT_MAP[Number(line.kdvOraniPercent)];
        if (!vatAcc) return { ok: false, error: 'unknown_vat_rate', message: '%' + line.kdvOraniPercent + ' KDV oranı için hesap tanımlı değil.' };
        var sp = SF_ACC.splitVat(line.kdvDahilTutar, line.kdvOraniPercent);
        computed.push({ line: line, cat: cat, vatAcc: vatAcc, matrah: sp.matrah, kdv: sp.kdv, toplam: sp.toplam });
      }
      var totalDiscounted = SF_ACC.round2(computed.reduce(function(s,c){ return s + c.matrah; }, 0));
      var totalVat = SF_ACC.round2(computed.reduce(function(s,c){ return s + c.kdv; }, 0));
      var totalGross = totalDiscounted;
      var totalNet = SF_ACC.round2(computed.reduce(function(s,c){ return s + c.toplam; }, 0));
      var dominant = computed.slice().sort(function(a,b){ return b.toplam - a.toplam; })[0];

      var rows = [];
      rows.push('  <INVOICE DBOP="INS" >');
      rows.push(tag('TYPE', '4'));
      rows.push(tag('NUMBER', ''));
      rows.push(tag('DATE', receipt.tarih));
      rows.push(tag('DOC_NUMBER', receipt.belgeNo || ''));
      rows.push(tag('ARP_CODE', receipt.odeme.kodu));
      rows.push(tag('GL_CODE', receipt.odeme.glCode));
      rows.push(tag('VAT_RATE', String(dominant.line.kdvOraniPercent)));
      rows.push(tag('TOTAL_DISCOUNTED', totalDiscounted.toFixed(2)));
      rows.push(tag('TOTAL_VAT', totalVat.toFixed(2)));
      rows.push(tag('TOTAL_GROSS', totalGross.toFixed(2)));
      rows.push(tag('TOTAL_NET', totalNet.toFixed(2)));
      rows.push(tag('TC_NET', totalNet.toFixed(2)));
      rows.push(tag('CURRSEL_TOTALS', '1'));
      rows.push('    <DISPATCHES>\n    </DISPATCHES>');
      rows.push('    <TRANSACTIONS>');
      computed.forEach(function(c){
        var my = monthYear(receipt.tarih);
        rows.push('      <TRANSACTION>');
        rows.push(tag6('TYPE', '4'));
        rows.push(tag6('MASTER_CODE', c.cat.expenseAccount));
        rows.push(tag6('OHP_CODE1', c.line.masrafMerkezi || c.cat.masrafMerkezi || 'DB.01'));
        rows.push(tag6('GL_CODE1', c.cat.expenseAccount));
        rows.push(tag6('GL_CODE2', c.vatAcc.code));
        rows.push(tag6('QUANTITY', '1'));
        rows.push(tag6('PRICE', c.toplam.toFixed(2)));
        rows.push(tag6('TOTAL', c.toplam.toFixed(2)));
        rows.push(tag6('DESCRIPTION', lineDescription(c.line)));
        rows.push(tag6('UNIT_CODE', 'ADET'));
        rows.push(tag6('UNIT_CONV1', '1'));
        rows.push(tag6('UNIT_CONV2', '1'));
        rows.push(tag6('VAT_INCLUDED', '1'));
        rows.push(tag6('VAT_RATE', String(c.line.kdvOraniPercent)));
        rows.push(tag6('VAT_AMOUNT', c.kdv.toFixed(2)));
        rows.push(tag6('VAT_BASE', c.matrah.toFixed(2)));
        rows.push(tag6('BILLED', '1'));
        rows.push(tag6('TOTAL_NET', c.matrah.toFixed(2)));
        rows.push(tag6('DIST_ORD_REFERENCE', '0'));
        rows.push(tag6('MULTI_ADD_TAX', '0'));
        rows.push(tag6('EDT_CURR', '1'));
        rows.push(tag6('MONTH', my.month));
        rows.push(tag6('YEAR', my.year));
        rows.push(tag6('ADD_TAX_EFFECT_KDV', '1'));
        rows.push(tag6('GUID', sfUUID()));
        rows.push(tag6('MASTER_DEF', c.cat.label));
        rows.push(tag6('FOREIGN_TRADE_TYPE', '0'));
        rows.push(tag6('DISTRIBUTION_TYPE_WHS', '0'));
        rows.push(tag6('DISTRIBUTION_TYPE_FNO', '0'));
        rows.push(tag6('FUTURE_MONTH_BEGDATE', receipt.tarih));
        if (c.cat.kkegSplit) {
          rows.push(tag6('KKEG_GL_CODE', c.cat.kkegExpenseAccount));
          rows.push(tag6('KKEG_OHP_CODE', c.line.masrafMerkezi || c.cat.masrafMerkezi || 'DB.01'));
          rows.push(tag6('KKEG_VAT_GL_CODE', c.cat.kkegVatAccount));
          rows.push(tag6('KKEG_VAT_OHP_CODE', c.line.masrafMerkezi || c.cat.masrafMerkezi || 'DB.01'));
        }
        rows.push('      </TRANSACTION>');
      });
      rows.push('    </TRANSACTIONS>');
      rows.push('    <PAYMENT_LIST>');
      rows.push('      <PAYMENT>');
      rows.push('        <INTERNAL_REFERENCE>0</INTERNAL_REFERENCE>');
      rows.push(tag6('DATE', receipt.tarih));
      rows.push('        <MODULENR>4</MODULENR>');
      rows.push('        <SIGN>1</SIGN>');
      rows.push('        <TRCODE>4</TRCODE>');
      rows.push(tag6('TOTAL', totalNet.toFixed(2)));
      rows.push(tag6('PROCDATE', receipt.tarih));
      rows.push('        <DATA_REFERENCE>0</DATA_REFERENCE>');
      rows.push(tag6('DISCOUNT_DUEDATE', receipt.tarih));
      rows.push('        <PAY_NO>1</PAY_NO>');
      rows.push('        <DISCTRLIST>\n        </DISCTRLIST>');
      rows.push('        <DISCTRDELLIST>0</DISCTRDELLIST>');
      rows.push('      </PAYMENT>');
      rows.push('    </PAYMENT_LIST>');
      rows.push(tag('GRPFIRMTRANS', '1'));
      rows.push(tag('AFFECT_RISK', '0'));
      rows.push(tag('DOC_DATE', receipt.tarih));
      rows.push(tag('GUID', sfUUID()));
      rows.push(tag('ESTATUS', '12'));
      rows.push(tag('EDURATION_TYPE', '0'));
      rows.push(tag('TOTAL_SERVICES', totalNet.toFixed(2)));
      rows.push(tag('EXIMVAT', '0'));
      rows.push(tag('EBOOK_DOCTYPE', '99'));
      rows.push('  </INVOICE>');
      return { ok: true, xmlFragment: rows.join('\n'), totalNet: totalNet, totalVat: totalVat, totalGross: totalDiscounted };
    }
    function buildBatchXml(receipts) {
      var fragments = [];
      var perReceipt = [];
      for (var i=0;i<receipts.length;i++) {
        var r = receipts[i];
        var res = buildInvoiceFragment(r);
        perReceipt.push({ id: r.id, ok: res.ok, error: res.error, message: res.message });
        if (!res.ok) return { ok: false, error: res.error, message: res.message, receiptId: r.id, perReceipt: perReceipt };
        fragments.push(res.xmlFragment);
      }
      var xml = '<?xml version="1.0" encoding="ISO-8859-9"?>\n<PURCHASE_INVOICES>\n' + fragments.join('\n') + '\n</PURCHASE_INVOICES>\n';
      return { ok: true, xml: xml, perReceipt: perReceipt };
    }
    return { buildInvoiceFragment: buildInvoiceFragment, buildBatchXml: buildBatchXml, lineDescription: lineDescription };
  })();

/* __SF_MODULE_PART1_END__ */


  /* ================================================================
     SF_STORE — yerel depolama. Yapısal veri (fiş alanları, ayarlar)
     localStorage'da; fiş görselleri (daha büyük olduğu için) IndexedDB'de
     saklanır. IndexedDB açılamazsa (bazı tarayıcı/mod kombinasyonlarında
     olabilir), küçük bir uyarı gösterilip görseller localStorage'a
     (küçültülmüş halde) düşürülür — ASLA sessizce veri kaybedilmez.
     "Yedek Al" tek bir JSON dosyasında yapısal veri + görselleri
     (base64) birlikte indirir; bu, IndexedDB/localStorage'dan bağımsız
     kalıcı bir yedektir.
     ================================================================ */
  var SF_LS_RECEIPTS = 'sf_receipts_v1';
  var SF_LS_SETTINGS = 'sf_settings_v1';
  var SF_LS_IMG_FALLBACK = 'sf_img_fallback_v1';

  var SF_STORE = (function(){
    var db = null;
    var idbFailed = false;
    var idbReady = new Promise(function(resolve){
      try{
        if(!window.indexedDB){ idbFailed = true; resolve(false); return; }
        var req = indexedDB.open(window.SWWorkspace.databaseName('FaturaCanavariSatinalma'), 1);
        req.onupgradeneeded = function(){ req.result.createObjectStore('images'); };
        req.onsuccess = function(){ db = req.result; resolve(true); };
        req.onerror = function(){ idbFailed = true; resolve(false); };
        // Bazı ortamlarda open() ne başarı ne hata verip asılı kalabilir —
        // 2 sn içinde açılmazsa localStorage yedeğine düş.
        setTimeout(function(){ if(!db && !idbFailed){ idbFailed = true; resolve(false); } }, 2000);
      }catch(e){ idbFailed = true; resolve(false); }
    });

    function loadReceipts(){
      try{ return JSON.parse(window.SWWorkspace.storage.getItem(SF_LS_RECEIPTS) || '[]'); }
      catch(e){ return []; }
    }
    function saveReceipts(list){
      try{ window.SWWorkspace.storage.setItem(SF_LS_RECEIPTS, JSON.stringify(list)); return true; }
      catch(e){ console.error('sf: fiş listesi kaydedilemedi (localStorage doldu olabilir):', e); return false; }
    }
    function loadSettings(){
      try{ return JSON.parse(window.SWWorkspace.storage.getItem(SF_LS_SETTINGS) || '{}'); }
      catch(e){ return {}; }
    }
    function saveSettings(s){
      try{ window.SWWorkspace.storage.setItem(SF_LS_SETTINGS, JSON.stringify(s)); }catch(e){}
    }
    function loadImgFallback(){
      try{ return JSON.parse(window.SWWorkspace.storage.getItem(SF_LS_IMG_FALLBACK) || '{}'); }
      catch(e){ return {}; }
    }
    function saveImgFallback(map){
      try{ window.SWWorkspace.storage.setItem(SF_LS_IMG_FALLBACK, JSON.stringify(map)); return true; }
      catch(e){ return false; }
    }

    function putImage(id, blob){
      return idbReady.then(function(ok){
        if(ok && db){
          return new Promise(function(resolve){
            try{
              var tx = db.transaction('images','readwrite');
              tx.objectStore('images').put(blob, id);
              tx.oncomplete = function(){ resolve(true); };
              tx.onerror = function(){ resolve(false); };
            }catch(e){ resolve(false); }
          });
        }
        return false;
      });
    }
    function getImage(id){
      return idbReady.then(function(ok){
        if(ok && db){
          return new Promise(function(resolve){
            try{
              var tx = db.transaction('images','readonly');
              var req = tx.objectStore('images').get(id);
              req.onsuccess = function(){ resolve(req.result || null); };
              req.onerror = function(){ resolve(null); };
            }catch(e){ resolve(null); }
          });
        }
        return null;
      });
    }
    function deleteImage(id){
      return idbReady.then(function(ok){
        if(ok && db){
          try{
            var tx = db.transaction('images','readwrite');
            tx.objectStore('images')['delete'](id);
          }catch(e){}
        }
        var fb = loadImgFallback();
        if(fb[id]){ delete fb[id]; saveImgFallback(fb); }
      });
    }
    function clearAllImages(){
      return idbReady.then(function(ok){
        if(ok && db){
          try{
            var tx = db.transaction('images','readwrite');
            tx.objectStore('images').clear();
          }catch(e){}
        }
        saveImgFallback({});
      });
    }

    return {
      idbReady: idbReady,
      isIdbAvailable: function(){ return !idbFailed; },
      loadReceipts: loadReceipts, saveReceipts: saveReceipts,
      loadSettings: loadSettings, saveSettings: saveSettings,
      loadImgFallback: loadImgFallback, saveImgFallback: saveImgFallback,
      putImage: putImage, getImage: getImage, deleteImage: deleteImage, clearAllImages: clearAllImages
    };
  })();

  /* ================================================================
     Görsel sıkıştırma (canvas ile) — OCR + saklama için makul boyuta
     küçültme. EXIF döndürme uygulanmaz (tarayıcılar <img> ile JPEG EXIF
     yönünü zaten çoğunlukla otomatik uygular); kullanıcı yanlış yönü
     görürse fiş yine de OCR ile okunabilir, sorun yalnızca görsel
     önizlemenin yönüdür.
     ================================================================ */
  function sfDownscaleImage(file, maxDim, quality){
    return new Promise(function(resolve, reject){
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function(){
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob(function(blob){
          if(!blob){ reject(new Error('Görsel işlenemedi.')); return; }
          resolve({ blob: blob, width: cw, height: ch, canvas: canvas, ctx: ctx });
        }, 'image/jpeg', quality);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Görsel okunamadı — dosya bozuk olabilir.')); };
      img.src = url;
    });
  }

  function sfBlobToBase64(blob){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  function sfBase64ToBlob(b64, mime){
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], {type: mime || 'image/jpeg'});
  }

/* __SF_MODULE_PART2_END__ */


  /* ================================================================
     SF_OCR — Tesseract WASM motoru, TAMAMEN BU DOSYANIN İÇİNE GÖMÜLÜ
     (base64), ağ isteği YOK, tamamen offline. Motor kodu ve Türkçe dil
     verisi ayrı <script type="application/octet-stream"> etiketlerinde
     base64 olarak saklanır (aşağıda, bu <script> bloğundan SONRA) —
     tek bir dev metin literaline gömmek yerine ayrı script tag'leri
     kullanılmasının nedeni, tarayıcının JS parse'ını yormamaktır.

     MÜHENDİSLİK NOTU: tesseract.js'in normal Worker+Blob mimarisi
     file:// üzerinde ÇALIŞMAZ — Chromium, file:// sayfalarına "null"
     (opak) bir origin verir ve bu origin'de oluşturulan bir Blob URL,
     o origin'den türeyen bir Worker'ın İÇİNDEN erişilemez hale gelir
     ("Failed to execute 'importScripts'... failed to load" hatası).
     Bu, gerçek bir tarayıcıda (Chrome/Edge, headless Chromium ile
     doğrulandı) test edilip doğrulanmış bir kısıtlamadır. Bu yüzden bu
     modül Tesseract'ı bir Worker İÇİNDE DEĞİL, ana iş parçacığında,
     tesseract.js-core motorunu (Emscripten/WASM) DOĞRUDAN çağırarak
     çalıştırır (aynı temel motor, yalnızca postMessage katmanı
     atlanmıştır). Bunun tek dezavantajı: bir fişi OCR'larken sayfa o
     birkaç saniye boyunca tepkisiz kalır — bu yüzden her zaman önce bir
     "OCR çalışıyor" göstergesi gösterilir ve fişler TEK TEK işlenir.
     ================================================================ */
  var SF_OCR = (function(){
    var TessModulePromise = null;
    var apiInstance = null;

    function b64ToBytes(b64){
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    function getTessModule(){
      if(TessModulePromise) return TessModulePromise;
      TessModulePromise = new Promise(function(resolve, reject){
        try{
          var coreEl = document.getElementById('sfOcrCoreData');
          if(!coreEl) throw new Error('OCR motoru bu dosyada bulunamadı (sfOcrCoreData eksik).');
          var coreText = new TextDecoder('utf-8').decode(b64ToBytes(coreEl.textContent.trim()));
          var s = document.createElement('script');
          s.textContent = coreText;
          document.head.appendChild(s);
          if(typeof TesseractCore === 'undefined'){ throw new Error('OCR motoru başlatılamadı (TesseractCore tanımsız).'); }
          TesseractCore().then(function(mod){ resolve(mod); }).catch(reject);
        }catch(e){ reject(e); }
      });
      return TessModulePromise;
    }

    // Türkçe dil verisi HER ZAMAN yazılır. İngilizce dil verisi de bu dosyaya
    // gömülüyse ('sfOcrLangDataEng' script bloğu varsa) 'tur+eng' ile
    // başlatılır (Latin harfli yabancı marka adları / ürün adları için);
    // eng verisi yoksa veya Init 'tur+eng' ile başarısız olursa sessizce
    // yalnızca 'tur' ile devam edilir.
    function getApi(){
      return getTessModule().then(function(TessModule){
        if(apiInstance) return apiInstance;
        var turEl = document.getElementById('sfOcrLangData');
        if(!turEl) throw new Error('Türkçe dil verisi bu dosyada bulunamadı (sfOcrLangData eksik).');
        var turBytes = b64ToBytes(turEl.textContent.trim());
        TessModule.FS.writeFile('tur.traineddata', turBytes);
        var langs = 'tur';
        var engEl = document.getElementById('sfOcrLangDataEng');
        if(engEl){
          try{
            var engBytes = b64ToBytes(engEl.textContent.trim());
            TessModule.FS.writeFile('eng.traineddata', engBytes);
            langs = 'tur+eng';
          }catch(e){ /* İngilizce veri yazılamazsa yalnızca Türkçe ile devam edilir. */ }
        }
        var api = new TessModule.TessBaseAPI();
        var initStatus = api.Init(null, langs, 1); // OEM.LSTM_ONLY = 1
        if(initStatus === -1 && langs !== 'tur'){
          initStatus = api.Init(null, 'tur', 1);
          langs = 'tur';
        }
        if(initStatus === -1) throw new Error('OCR motoru başlatılamadı (api.Init başarısız).');
        try{
          // PSM 6 = "tek biçimli metin bloğu" (uniform block of text).
          // Fiş görüntülerinde satır içi etiket/tutar arasındaki geniş boşluk,
          // varsayılan (tam otomatik) sayfa bölütleme modunda Tesseract'ın
          // bunu ayrı sütun/blok sanıp o boşlukta var olmayan "hayalet"
          // karakterler üretmesine yol açabiliyor; PSM 6 bunu satır satır
          // düz metin olarak okumaya zorlayarak azaltır.
          api.SetPageSegMode(6);
          if(window.__sfDebugCapture) void 0;
        }catch(ePsm){ if(window.__sfDebugCapture) void 0; }
        apiInstance = { TessModule: TessModule, api: api, langs: langs };
        if(window.__sfDebugCapture){
          try{
            var names = [];
            for(var k in api){ names.push(k); }
            var proto = Object.getPrototypeOf(api);
            while(proto){ Object.getOwnPropertyNames(proto).forEach(function(n){ if(names.indexOf(n)===-1) names.push(n); }); proto = Object.getPrototypeOf(proto); }
            void 0;
          }catch(eDbg){ void 0; }
        }
        return apiInstance;
      });
    }

    /* ---- görsel ön işleme (canvas) ------------------------------------
       Amaç: tek bir ham OCR denemesi yerine, farklı ön işleme uygulanmış
       birkaç varyant üretip HEPSİNİ Tesseract'a vermek, sonra
       TessBaseAPI.MeanTextConf() (0-100 güven puanı) en yüksek olan
       sonucu seçmek. Gerçek perspektif düzeltme ve eğiklik (deskew)
       düzeltmesi bu ortamda (harici kütüphane/OpenCV olmadan, tek dosya
       içinde) güvenilir şekilde uygulanamadığı için BİLEREK KAPSAM DIŞI
       bırakıldı — bu, teslim raporunda açıkça belirtilir. ------------- */
    function sfLoadBitmap(imageBytes){
      var blob = new Blob([imageBytes], {type:'image/jpeg'});
      if(typeof createImageBitmap === 'function'){
        return createImageBitmap(blob)['catch'](function(){
          return sfLoadBitmapViaImg(blob);
        });
      }
      return sfLoadBitmapViaImg(blob);
    }
    function sfLoadBitmapViaImg(blob){
      return new Promise(function(resolve, reject){
        var img = new Image();
        var url = URL.createObjectURL(blob);
        img.onload = function(){ URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Görsel yüklenemedi — dosya bozuk olabilir.')); };
        img.src = url;
      });
    }
    // Kaynağı (ImageBitmap ya da <img>) bir canvas'a çizer; hedef en uzun
    // kenar targetDim olacak şekilde KÜÇÜLTÜR ya da (görsel küçükse, düşük
    // çözünürlüklü fişlerde karakter tanımayı iyileştirmek için) BÜYÜTÜR.
    function sfCanvasFromSource(src, targetDim){
      var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
      var longEdge = Math.max(w, h) || 1;
      var scale = targetDim / longEdge;
      if (scale > 2.5) scale = 2.5; // aşırı büyütme performansı çok yorar, sınırla
      var cw = Math.max(1, Math.round(w*scale)), ch = Math.max(1, Math.round(h*scale));
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(src, 0, 0, cw, ch);
      return canvas;
    }
    // NOT (dürüstlük notu): Bu sürümde otomatik EĞİKLİK (deskew) ve
    // PERSPEKTİF düzeltmesi DENENDİ ve gerçek fişlerle test edildi, ancak
    // güvenilir çıkmadı — kenar-eğimi tahmini ve metin-satırı izdüşüm
    // profili yöntemlerinin ikisi de bazı fotoğraflarda fişi DÜZELTMEK
    // yerine daha da EĞMEYE sebep oldu (döndürme yönü/açısı güvenilir
    // biçimde belirlenemedi). Yanlış bir "düzeltme" hiç düzeltmemekten
    // daha kötü sonuç verdiği için bu adım BİLEREK KAPSAM DIŞI bırakıldı;
    // yalnızca kırpma + gri tonlama/kontrast/eşikleme/keskinleştirme gibi
    // fişi DÖNDÜRMEYEN, güvenli iyileştirmeler uygulanır. Bu sınır teslim
    // raporunda açıkça belirtilir.
    // Fiş bölgesine kabaca kırpma: fotoğrafın köşelerinden arka plan
    // parlaklığını tahmin eder, arka plandan belirgin şekilde farklı olan
    // (yani muhtemelen fişin kendisi olan) bölgenin sınır kutusunu bulur.
    // Sonuç güvenilir görünmüyorsa (çok küçük bir alan bulunduysa) ORİJİNAL
    // görseli değiştirmeden döndürür — yanlışlıkla fişin bir kısmını
    // kesmemek için.
    function sfAutoCropToContent(canvas){
      try{
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        if (w < 20 || h < 20) return canvas;
        var img = ctx.getImageData(0, 0, w, h);
        var d = img.data;
        function lum(x, y){ var i = (y*w+x)*4; return 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; }
        var bg = (lum(2,2) + lum(w-3,2) + lum(2,h-3) + lum(w-3,h-3)) / 4;
        var threshold = 26;
        function rowDiff(y){
          var sum=0, step=Math.max(1, Math.floor(w/220)), n=0;
          for(var x=0;x<w;x+=step){ sum += Math.abs(lum(x,y)-bg); n++; }
          return sum/n;
        }
        function colDiff(x){
          var sum=0, step=Math.max(1, Math.floor(h/220)), n=0;
          for(var y=0;y<h;y+=step){ sum += Math.abs(lum(x,y)-bg); n++; }
          return sum/n;
        }
        var top=0, bottom=h-1, left=0, right=w-1;
        while (top < h*0.4 && rowDiff(top) < threshold) top++;
        while (bottom > h*0.6 && rowDiff(bottom) < threshold) bottom--;
        while (left < w*0.4 && colDiff(left) < threshold) left++;
        while (right > w*0.6 && colDiff(right) < threshold) right--;
        var cw = right-left, ch = bottom-top;
        if (cw < w*0.5 || ch < h*0.5) return canvas; // güvenli değil, kırpma
        var pad = Math.round(Math.min(cw,ch)*0.02);
        left = Math.max(0, left-pad); top = Math.max(0, top-pad);
        right = Math.min(w-1, right+pad); bottom = Math.min(h-1, bottom+pad);
        var out = document.createElement('canvas');
        out.width = right-left; out.height = bottom-top;
        out.getContext('2d').drawImage(canvas, left, top, right-left, bottom-top, 0, 0, right-left, bottom-top);
        return out;
      }catch(e){ return canvas; }
    }
    // Gri tonlama + histogram gerdirme (kontrast artırma).
    function sfGrayscaleContrast(canvas, contrastFactor){
      var out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      var octx = out.getContext('2d');
      octx.drawImage(canvas, 0, 0);
      var img = octx.getImageData(0, 0, out.width, out.height);
      var d = img.data;
      var min=255, max=0;
      for(var i=0;i<d.length;i+=4){
        var g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        d[i]=d[i+1]=d[i+2]=g;
        if(g<min) min=g; if(g>max) max=g;
      }
      var range = Math.max(1, max-min);
      for(var j=0;j<d.length;j+=4){
        var v = (d[j]-min) * 255/range;
        v = 128 + (v-128)*contrastFactor;
        v = v<0?0:(v>255?255:v);
        d[j]=d[j+1]=d[j+2]=v;
      }
      octx.putImageData(img, 0, 0);
      return out;
    }
    // Hafif 3x3 kutu bulanıklaştırma — eşiklemeden önce JPEG gürültüsünü azaltır.
    function sfDenoiseBox3(canvas){
      var out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      var octx = out.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var src = canvas.getContext('2d').getImageData(0, 0, w, h);
      var dst = octx.createImageData(w, h);
      var sd = src.data, dd = dst.data;
      for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
          var idx = (y*w+x)*4;
          if(x===0||y===0||x===w-1||y===h-1){ dd[idx]=sd[idx]; dd[idx+1]=sd[idx+1]; dd[idx+2]=sd[idx+2]; dd[idx+3]=255; continue; }
          var sum=0;
          for(var ky=-1;ky<=1;ky++) for(var kx=-1;kx<=1;kx++){ sum += sd[((y+ky)*w+(x+kx))*4]; }
          var v = sum/9;
          dd[idx]=dd[idx+1]=dd[idx+2]=v; dd[idx+3]=255;
        }
      }
      octx.putImageData(dst, 0, 0);
      return out;
    }
    // Otsu yöntemiyle otomatik ikili (siyah/beyaz) eşik değeri hesaplar.
    function sfOtsuThreshold(canvas){
      var w = canvas.width, h = canvas.height;
      var d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      var hist = new Array(256).fill(0);
      for(var i=0;i<d.length;i+=4){ hist[d[i]|0]++; }
      var total = w*h, sum=0;
      for(var t=0;t<256;t++) sum += t*hist[t];
      var sumB=0, wB=0, wF=0, maxVar=0, threshold=127;
      for(var t2=0;t2<256;t2++){
        wB += hist[t2]; if(wB===0) continue;
        wF = total-wB; if(wF===0) break;
        sumB += t2*hist[t2];
        var mB = sumB/wB, mF = (sum-sumB)/wF;
        var v = wB*wF*(mB-mF)*(mB-mF);
        if(v>maxVar){ maxVar=v; threshold=t2; }
      }
      return threshold;
    }
    function sfBinarize(canvas, threshold){
      var out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      var octx = out.getContext('2d');
      octx.drawImage(canvas, 0, 0);
      var img = octx.getImageData(0, 0, out.width, out.height);
      var d = img.data;
      for(var i=0;i<d.length;i+=4){
        var v = d[i] > threshold ? 255 : 0;
        d[i]=d[i+1]=d[i+2]=v;
      }
      octx.putImageData(img, 0, 0);
      return out;
    }
    // Basit 3x3 keskinleştirme (unsharp benzeri) — hafif bulanık fotoğraflarda yardımcı olur.
    function sfSharpen(canvas){
      var out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      var octx = out.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var sd = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      var dst = octx.createImageData(w, h);
      var dd = dst.data;
      var k = [0,-1,0, -1,5,-1, 0,-1,0];
      for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
          var idx = (y*w+x)*4;
          if(x===0||y===0||x===w-1||y===h-1){ dd[idx]=sd[idx]; dd[idx+1]=sd[idx+1]; dd[idx+2]=sd[idx+2]; dd[idx+3]=255; continue; }
          var sum=0, ki=0;
          for(var ky=-1;ky<=1;ky++) for(var kx=-1;kx<=1;kx++){ sum += sd[((y+ky)*w+(x+kx))*4]*k[ki++]; }
          var v = sum<0?0:(sum>255?255:sum);
          dd[idx]=dd[idx+1]=dd[idx+2]=v; dd[idx+3]=255;
        }
      }
      octx.putImageData(dst, 0, 0);
      return out;
    }
    function sfCanvasToPngBytes(canvas){
      var dataUrl = canvas.toDataURL('image/png');
      var b64 = dataUrl.split(',')[1];
      return b64ToBytes(b64);
    }
    // Kırpılmış temel görselden birden fazla ön işleme varyantı üretir:
    // gri tonlama+kontrast, gürültü azaltma+Otsu eşikleme (koyu), daha
    // açık bir eşikleme alternatifi, ve keskinleştirme.
    function sfBuildOcrVariants(baseCanvas){
      var grayContrast = sfGrayscaleContrast(baseCanvas, 1.35);
      var denoised = sfDenoiseBox3(grayContrast);
      var otsu = sfOtsuThreshold(denoised);
      var acikEsik = Math.max(0, Math.min(255, Math.round(otsu*1.18)));
      var list = [
        { label: 'gri-kontrast', canvas: grayContrast },
        { label: 'esik-koyu-otsu', canvas: sfBinarize(denoised, otsu) },
        { label: 'esik-acik', canvas: sfBinarize(denoised, acikEsik) },
        { label: 'keskinlestir', canvas: sfSharpen(grayContrast) }
      ];
      if (window.__sfDebugCapture) {
        window.__sfDebugBase = baseCanvas.toDataURL('image/png');
        window.__sfDebugVariants = list.map(function(v){ return { label: v.label, dataUrl: v.canvas.toDataURL('image/png') }; });
      }
      return list;
    }

    // imageBytes: Uint8Array (JPEG/PNG). Döner: Promise<{text, confidence, variant, variants}>.
    // Birden fazla ön işleme varyantı Tesseract'a ayrı ayrı verilir; her
    // birinin MeanTextConf() (0-100) güven puanı karşılaştırılır ve en
    // yüksek puanlı sonuç seçilir (kullanıcının açık isteği: "en iyi
    // sonucu güven puanına göre seç").
    function recognize(imageBytes){
      return getApi().then(function(inst){
        return sfLoadBitmap(imageBytes).then(function(src){
          var baseCanvas = sfCanvasFromSource(src, 2000);
          baseCanvas = sfAutoCropToContent(baseCanvas);
          var variants = sfBuildOcrVariants(baseCanvas);
          var TessModule = inst.TessModule, api = inst.api;
          var best = null;
          var allResults = [];
          // "En iyi" varyantı seçerken YALNIZCA Tesseract'ın genel metin
          // güven puanına (MeanTextConf) değil, ÖNCELİKLE bu fiş
          // çıkarımının asıl önemsediği ALANLARIN (tarih, fiş no, KDV
          // oranı/tutarı, unvan) kaç tanesinin başarıyla ayrıştırıldığına
          // bakıyoruz — genel metin güveni yüksek ama önemli bir rakamı
          // (ör. "%1" ya da "TOP" satırı) kaçıran bir varyant, düşük genel
          // güvenli ama doğru rakamları yakalayan bir varyanttan daha
          // "iyi" sayılmamalı. Eşitlik durumunda MeanTextConf belirleyici olur.
          function fieldScoreOf(text){
            try{
              var probe = SF_OCREXTRACT.extractFields(text);
              var f = probe.fields, s = 0;
              if (f.tarih) s++;
              if (f.belgeNo) s++;
              if (f.kdvDahilTutar != null) s++;
              if (f.kdvOrani != null) s++;
              if (f.kdvTutari != null) s++;
              if (f.unvan) s++;
              return s;
            }catch(eProbe){ return 0; }
          }
          for(var i=0;i<variants.length;i++){
            var v = variants[i];
            try{
              var bytes = sfCanvasToPngBytes(v.canvas);
              TessModule.FS.writeFile('/input', bytes);
              var setRes = api.SetImageFile(1, 0);
              if(setRes === 1) continue;
              api.Recognize(null);
              var text = api.GetUTF8Text();
              var conf = 0;
              try{ conf = api.MeanTextConf(); }catch(e2){ conf = 0; }
              var fieldScore = fieldScoreOf(text);
              allResults.push({ label: v.label, confidence: conf, textLength: (text||'').trim().length, fieldScore: fieldScore });
              if(window.__sfDebugCapture) void 0;
              var better = !best || fieldScore > best.fieldScore || (fieldScore === best.fieldScore && conf > best.confidence);
              if(better){ best = { text: text, confidence: conf, variant: v.label, fieldScore: fieldScore }; }
            }catch(eVariant){ /* bu varyant başarısız oldu, diğerine geç */ }
          }
          if(!best) throw new Error('Görsel okunamadı (hiçbir ön işleme varyantı başarılı olmadı).');
          return { text: best.text, confidence: best.confidence, variant: best.variant, variants: allResults, langs: inst.langs };
        });
      });
    }

    return { recognize: recognize, preload: getApi };
  })();

  /* ================================================================
     SF_QR — fişin ÜZERİNDEKİ QR/karekodu seçilen fotoğraftan okuma
     (jsQR, tamamen yerel). Bu, telefon eşleştirme QR'ı DEĞİLDİR.
     ================================================================ */
  function sfDecodeQrFromCanvas(ctx, w, h){
    try{
      if(typeof jsQR !== 'function') return null;
      var imgData = ctx.getImageData(0, 0, w, h);
      var res = jsQR(imgData.data, w, h);
      return res ? res.data : null;
    }catch(e){ return null; }
  }

/* __SF_MODULE_PART3_END__ */


  /* ================================================================
     ARAYÜZ — tablo, filtreler, önizleme modalı, yükleme, XML üretimi,
     yedekleme. Veri katmanı artık fetch() DEĞİL, doğrudan SF_STORE +
     SF_OCR + SF_ACC + SF_XML çağırır.
     ================================================================ */
  var CATEGORY_LABELS = {
    YAKIT: 'Taşıt Yakıt Giderleri',
    OTOPARK: 'Otopark (Park Vallet)',
    YEMEK_PERSONEL: 'Personel Yemek Giderleri',
    YEMEK_OFIS: 'Ofis Yiyecek ve İçecek Giderleri',
    TEMSIL_AGIRLAMA: 'Temsil ve Ağırlama Giderleri',
    DIGER_CESITLI: '770.15.006 — Diğer Çeşitli Giderler',
    DIGER: 'Diğer (elle seçilecek)'
  };
  var STATUS_LABELS = {
    okunuyor: 'Okunuyor…', kontrol_gerekli: 'Kontrol gerekli', onayli: 'Onaylı', hatali: 'Hatalı'
  };
  var PAYMENT_PRESETS = {
    '309.03': { kodu:'309.03', glCode:'309.01.001', label:'309.03 — Kredi Kartı (3915)' },
    '309.07': { kodu:'309.07', glCode:'', label:'309.07 — Kredi Kartı (9190)' }
  };

  var sf = {
    company: 'PUSULA',
    receipts: [],
    settings: {},
    filter: 'all',
    imgUrlCache: {},
    ocrBusy: false,
    ocrQueue: [],
    usingFallbackStorage: false
  };

  function sfEsc(s){
    var d = document.createElement('div'); d.textContent = (s==null?'':String(s)); return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function sfMoney(n){
    n = Number(n)||0;
    return n.toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function sfParseMoney(s){
    return Number(String(s==null?'':s).replace(/\./g,'').replace(',','.')) || 0;
  }
  function sfToast(msg){ if(typeof toast === 'function') toast(msg); else alert(msg); }
  function sfSaveReceipts(){ SF_STORE.saveReceipts(sf.receipts); }
  // Sabit satır açıklaması kuralı: FİŞ NO:{no} {tam ticari unvan} {varsa şahıs adı}.
  // Kullanıcı bu metni her zaman elle değiştirebilir (bkz. tbody 'input' olayı).
  function sfBuildLineDescription(fisNo, unvan, sahisAdi){
    var parts = [];
    if(fisNo) parts.push('FİŞ NO:' + fisNo);
    if(unvan) parts.push(unvan);
    if(sahisAdi) parts.push(sahisAdi);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function sfComputePreview(r){
    var rows = (r.lines||[]).map(function(l){
      return { category: l.category, kdvDahilTutar: l.kdvDahilTutar, kdvOraniPercent: l.kdvOraniPercent,
        masrafMerkezi: l.masrafMerkezi, kdvTutariOverride: (l.kdvTutariOverride!=null ? l.kdvTutariOverride : null) };
    });
    if(!rows.length){ r.preview = { ok:false, error:'no_lines', message:'Satır yok.' }; return; }
    r.preview = SF_ACC.computeReceipt(rows);
  }

  // ---- satır tutar mantığı: Adet × Birim Fiyat -> Toplam (KDV dahil), ve
  // tersi (Toplam elle girilirse Birim Fiyat geriye türetilir). Dahil/Hariç
  // anahtarı yalnızca "Birim Fiyat"ın ANLAMINI değiştirir (KDV dahil mi
  // hariç mi), rakamı kendiliğinden ölçeklendirmez. ------------------------
  function sfDefaultLineExtras(line){
    if(line.adet == null) line.adet = 1;
    if(!line.birim) line.birim = 'ADET';
    if(line.birimFiyat == null) line.birimFiyat = Number(line.kdvDahilTutar)||0;
    if(line.kdvDahil == null) line.kdvDahil = true;
  }
  function sfRecalcFromBirimFiyat(line){
    sfDefaultLineExtras(line);
    var adet = Number(line.adet)||0;
    var fiyat = Number(line.birimFiyat)||0;
    var raw = SF_ACC.round2(fiyat * adet);
    var oran = Number(line.kdvOraniPercent)||0;
    line.kdvDahilTutar = (line.kdvDahil!==false) ? raw : SF_ACC.round2(raw * (1 + oran/100));
    line.kdvTutariOverride = null;
  }
  function sfRecalcFromToplam(line, typedGross){
    sfDefaultLineExtras(line);
    var adet = Number(line.adet)||0;
    var oran = Number(line.kdvOraniPercent)||0;
    line.kdvDahilTutar = SF_ACC.round2(typedGross);
    var base = (line.kdvDahil!==false) ? line.kdvDahilTutar : SF_ACC.round2(line.kdvDahilTutar/(1+oran/100));
    line.birimFiyat = adet ? SF_ACC.round2(base/adet) : base;
    line.kdvTutariOverride = null;
  }

  // Odaktaki alana ASLA dokunmadan, aynı satırdaki diğer hücreleri (Toplam,
  // KDV Tutarı, Adet, Birim Fiyat, uyarı renkleri vb.) tazeler — böylece
  // örn. Birim Fiyat'a yazarken klavye odağı kaybolmaz. tbody üzerindeki
  // olaylar delege (event delegation) olduğu için hücre içeriğini innerHTML
  // ile değiştirmek dinleyicileri bozmaz.
  function sfRenderTableSoft(activeInput){
    var tr = activeInput.closest('tr');
    if(!tr) return;
    var id = tr.dataset.id, lineId = tr.dataset.line;
    var r = sfFindReceipt(id);
    if(!r) return;
    var lines = (r.lines && r.lines.length) ? r.lines : [];
    var idx = -1;
    for(var i=0;i<lines.length;i++){ if(lines[i].id === lineId){ idx = i; break; } }
    if(idx === -1) return;
    var line = lines[idx];
    var newRowHtml = sfRowHtml(r, line, idx === 0, lines.length);
    var tmp = document.createElement('table');
    tmp.innerHTML = '<tbody>' + newRowHtml + '</tbody>';
    var newTr = tmp.querySelector('tr');
    if(!newTr) return;
    var oldTds = tr.children, newTds = newTr.children;
    for(var c=0; c<oldTds.length && c<newTds.length; c++){
      var oldTd = oldTds[c], newTd = newTds[c];
      if(oldTd.contains(activeInput)) continue; // odaktaki hücreyi hiç değiştirme
      oldTd.className = newTd.className;
      oldTd.innerHTML = newTd.innerHTML;
    }
  }

  // ---- Tarih alanı: canlı biçimlendirme + doğrulama --------------------
  function sfShowDateError(t, msg){
    t.classList.add('sf-field-error');
    var wrap = t.parentElement;
    var err = wrap && wrap.querySelector('.sf-inline-err');
    if(!err && wrap){ err = document.createElement('div'); err.className = 'sf-inline-err'; wrap.appendChild(err); }
    if(err) err.textContent = msg;
  }
  function sfClearDateError(t){
    t.classList.remove('sf-field-error');
    var wrap = t.parentElement;
    var err = wrap && wrap.querySelector('.sf-inline-err');
    if(err) err.remove();
  }
  function sfNormalizeDateField(t){
    var raw = String(t.value == null ? '' : t.value).trim();
    if(!raw){ sfClearDateError(t); return; }
    var d = null, mo = null, y = null;
    var m = raw.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
    if(m){ d = m[1]; mo = m[2]; y = m[3]; }
    else {
      var m2 = raw.match(/^(\d{8})$/);
      if(m2){ d = raw.slice(0,2); mo = raw.slice(2,4); y = raw.slice(4,8); }
    }
    if(d == null){
      sfShowDateError(t, 'Geçersiz tarih biçimi. gg.aa.yyyy olarak girin (ör. 30.06.'+new Date().getFullYear()+').');
      return;
    }
    d = d.padStart(2,'0'); mo = mo.padStart(2,'0');
    if(!SF_OCREXTRACT.validDmy(d, mo, y)){
      sfShowDateError(t, 'Geçersiz tarih: gün, ay veya yıl hatalı olabilir (ör. 31.02 yok, yıl 4 haneli olmalı).');
      return;
    }
    sfClearDateError(t);
    t.value = d + '.' + mo + '.' + y;
    var id = t.dataset.id, r = sfFindReceipt(id);
    if(r){
      r.fields = r.fields || {};
      r.fields.tarih = t.value;
      r.fields.tarihConfidence = 'user';
      sfSaveReceipts();
    }
  }

  // ---- Enter ile bir sonraki alana geç ----------------------------------
  function sfFocusNextField(t){
    var tbody = document.getElementById('sfTbody');
    if(!tbody) return;
    var focusables = Array.prototype.slice.call(tbody.querySelectorAll('input, select'));
    var idx = focusables.indexOf(t);
    if(idx === -1) return;
    for(var i=idx+1;i<focusables.length;i++){
      var el = focusables[i];
      if(el.disabled) continue;
      el.focus();
      if(el.select && (el.tagName === 'INPUT')) { try{ el.select(); }catch(e){} }
      return;
    }
  }

  function sfDeriveStatus(r){
    if(r.status === 'onayli') return; // onay elle verilir, otomatik geri alınmaz
    if(r.ocrError){ r.status = 'hatali'; return; }
    if(r.ocrPending){ r.status = 'okunuyor'; return; }
    r.status = 'kontrol_gerekli';
  }

  // -------------------------------------------------------- firma seçimi --
  function sfWireCompanySelect(){
    document.querySelectorAll('.sf-company-card').forEach(function(card){
      card.addEventListener('click', function(){
        document.querySelectorAll('.sf-company-card').forEach(function(c){ c.classList.remove('active'); });
        card.classList.add('active');
        sf.company = card.dataset.company;
        var isPusula = sf.company === 'PUSULA';
        document.querySelectorAll('.sf-top-actions .sf-btn, .sf-drop, #sfFilters, .sf-table-wrap').forEach(function(el){
          el.style.opacity = isPusula ? '' : '.4';
          el.style.pointerEvents = isPusula ? '' : 'none';
        });
        if(!isPusula){
          sfToast('Bu firmanın muhasebe kodları henüz tanımlanmadı.');
        }
      });
    });
  }

  // ------------------------------------------------------------ render --
  function sfCounts(){
    var total = sf.receipts.length;
    var bekleyen = sf.receipts.filter(function(r){ return r.status === 'okunuyor'; }).length;
    var kontrol = sf.receipts.filter(function(r){ return r.status === 'kontrol_gerekli'; }).length;
    var onayli = sf.receipts.filter(function(r){ return r.status === 'onayli'; }).length;
    var toplam = sf.receipts.reduce(function(s,r){ return s + ((r.preview && r.preview.ok) ? r.preview.grandToplam : 0); }, 0);
    return { total:total, bekleyen:bekleyen, kontrol:kontrol, onayli:onayli, toplam:toplam };
  }
  function sfRenderCounts(){
    var c = sfCounts();
    document.getElementById('sfCounts').innerHTML = [
      ['Toplam Fiş', c.total], ['Bekleyen', c.bekleyen], ['Kontrol Gerekli', c.kontrol],
      ['Onaylı', c.onayli], ['Toplam Tutar', sfMoney(c.toplam) + ' ₺'], ['XML\'e Hazır', c.onayli]
    ].map(function(p){
      return '<div class="sf-count"><div class="v">' + sfEsc(p[1]) + '</div><div class="k">' + sfEsc(p[0]) + '</div></div>';
    }).join('');
  }
  function sfMatchesFilter(r){
    if(sf.filter === 'all') return true;
    if(sf.filter === 'kontrol_gerekli') return r.status === 'kontrol_gerekli';
    if(sf.filter === 'onayli') return r.status === 'onayli';
    if(sf.filter === 'hatali') return r.status === 'hatali';
    if(sf.filter === 'cat:YEMEK'){
      return (r.lines||[]).some(function(l){ return l.category === 'YEMEK_PERSONEL' || l.category === 'YEMEK_OFIS'; });
    }
    if(sf.filter.indexOf('cat:') === 0){
      var cat = sf.filter.slice(4);
      return (r.lines||[]).some(function(l){ return l.category === cat; });
    }
    return true;
  }
  function sfPaymentSelectHtml(receiptId, odeme){
    odeme = odeme || {};
    var opts = ['<option value="">Seçin…</option>'];
    ['309.03','309.07'].forEach(function(k){
      var sel = odeme.kodu === k ? ' selected' : '';
      opts.push('<option value="' + k + '"' + sel + '>' + sfEsc(PAYMENT_PRESETS[k].label) + '</option>');
    });
    var isCustomish = odeme.kodu && !PAYMENT_PRESETS[odeme.kodu];
    opts.push('<option value="__custom"' + (isCustomish ? ' selected' : '') + '>195.xxx / özel kod gir…</option>');
    var html = '<select data-role="odeme-tip" data-id="' + receiptId + '">' + opts.join('') + '</select>';
    if(isCustomish || (odeme.kodu === '309.07' && !odeme.glCode)){
      html += '<div style="display:flex;gap:3px;margin-top:3px;">';
      if(isCustomish){
        html += '<input type="text" placeholder="Kodu (ör. 195.001.002)" data-role="odeme-kodu" data-id="' + receiptId + '" value="' + sfEsc(odeme.kodu||'') + '" style="min-width:74px;">';
      }
      html += '<input type="text" placeholder="Karşı GL kodu" data-role="odeme-glcode" data-id="' + receiptId + '" value="' + sfEsc(odeme.glCode||'') + '">';
      html += '</div>';
    }
    return html;
  }
  function sfCategorySelectHtml(receiptId, lineId, category, lowConf){
    var opts = Object.keys(CATEGORY_LABELS).map(function(k){
      var sel = k === category ? ' selected' : '';
      return '<option value="' + k + '"' + sel + '>' + sfEsc(CATEGORY_LABELS[k]) + '</option>';
    }).join('');
    return '<select data-role="category" data-id="' + receiptId + '" data-line="' + lineId + '"' +
      (lowConf ? ' title="Sistem emin değil, kontrol edin"' : '') + '>' + opts + '</select>';
  }
  function sfRowHtml(r, line, isFirstLine, lineCount){
    sfDefaultLineExtras(line);
    var f = r.fields || {};
    var tarihWarn = !f.tarih || (f.tarihConfidence && f.tarihConfidence !== 'high' && f.tarihConfidence !== 'user');
    var belgeWarn = !line.fisNo;
    var catWarn = r.giderHesabiConfidence === 'low' && !r.giderHesabiUserEdited;
    var vatRateOk = [1,10,20].indexOf(Number(line.kdvOraniPercent)) !== -1;
    var toplamWarn = !line.kdvDahilTutar || Number(line.kdvDahilTutar) <= 0;
    var img = (isFirstLine && sf.imgUrlCache[r.id]) ? '<img class="sf-thumb" data-role="thumb" data-id="' + r.id + '" src="' + sf.imgUrlCache[r.id] + '">' : (isFirstLine ? '<div class="sf-thumb" style="display:flex;align-items:center;justify-content:center;font-size:16px;">🧾</div>' : '');
    var lineKdv = null;
    if(r.preview && r.preview.ok){
      var idx = (r.lines||[]).indexOf(line);
      var comp = r.preview.rows[idx];
      if(comp){ lineKdv = comp.kdv; }
    }
    var kdvTutariShown = (line.kdvTutariOverride != null) ? line.kdvTutariOverride : lineKdv;
    var statusCell = '<span class="sf-badge sf-badge-' + (r.status||'okunuyor').replace('kontrol_gerekli','kontrol') + '">' + sfEsc(STATUS_LABELS[r.status] || r.status) + (r.status==='okunuyor' ? ' <span class="sf-spin">⏳</span>' : '') + '</span>';

    return '<tr data-id="' + r.id + '" data-line="' + line.id + '">' +
      '<td>' + (isFirstLine ? img : '') + '</td>' +
      '<td class="' + (tarihWarn?'sf-cell-warn':'') + '"><input type="text" placeholder="gg.aa.yyyy" data-role="tarih" data-id="' + r.id + '" value="' + sfEsc(f.tarih||'') + '"></td>' +
      '<td class="' + (belgeWarn?'sf-cell-warn':'') + '"><input type="text" data-role="fisNo" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfEsc(line.fisNo||'') + '"></td>' +
      '<td class="' + (catWarn?'sf-cell-warn':'') + '">' + sfCategorySelectHtml(r.id, line.id, line.category, catWarn) + '</td>' +
      '<td><input type="text" data-role="aciklama" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfEsc(line.unvanSatir||'') + '" style="min-width:180px;"></td>' +
      '<td><input type="number" min="0.01" step="0.01" data-role="adet" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfEsc(line.adet) + '" style="width:52px;"></td>' +
      '<td><input type="text" data-role="birim" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfEsc(line.birim) + '" style="width:56px;"></td>' +
      '<td><input type="text" data-role="birimFiyat" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfMoney(line.birimFiyat) + '" style="width:80px;"></td>' +
      '<td class="' + (vatRateOk?'':'sf-cell-error') + '"><input type="number" min="0" max="100" data-role="kdvOrani" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfEsc(line.kdvOraniPercent) + '" style="width:52px;"></td>' +
      '<td><div class="sf-seg" data-role="dahil" data-id="' + r.id + '" data-line="' + line.id + '" style="display:inline-flex;border:1px solid var(--rule);border-radius:6px;overflow:hidden;">' +
        '<button type="button" data-v="1" class="' + (line.kdvDahil!==false?'active':'') + '" style="font-size:10px;padding:4px 6px;border:none;background:' + (line.kdvDahil!==false?'#b8862e;color:#fff':'#fff') + ';cursor:pointer;">Dahil</button>' +
        '<button type="button" data-v="0" class="' + (line.kdvDahil===false?'active':'') + '" style="font-size:10px;padding:4px 6px;border:none;border-left:1px solid var(--rule);background:' + (line.kdvDahil===false?'#b8862e;color:#fff':'#fff') + ';cursor:pointer;">Hariç</button>' +
      '</div></td>' +
      '<td><input type="text" data-role="kdvTutari" data-id="' + r.id + '" data-line="' + line.id + '" value="' + (kdvTutariShown!=null ? sfMoney(kdvTutariShown) : '') + '" style="width:76px;font-family:\'IBM Plex Mono\',monospace;' + (line.kdvTutariOverride!=null?'background:#fff6e4;':'') + '" title="Boş bırakılırsa Toplam ve KDV oranından otomatik hesaplanır"></td>' +
      '<td class="' + (toplamWarn?'sf-cell-error':'') + '"><input type="text" data-role="toplam" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfMoney(line.kdvDahilTutar) + '" style="width:80px;"></td>' +
      '<td>' + (isFirstLine ? sfPaymentSelectHtml(r.id, r.odeme) : '') + '</td>' +
      '<td><input type="text" data-role="masrafMerkezi" data-id="' + r.id + '" data-line="' + line.id + '" value="' + sfEsc(line.masrafMerkezi||'DB.01') + '" style="width:64px;"></td>' +
      '<td>' + (isFirstLine ? statusCell : '') + '</td>' +
      '<td><div class="sf-row-actions">' +
        (isFirstLine ? '<button class="sf-icon-btn" data-act="preview" data-id="' + r.id + '" title="Muhasebe önizleme">🔍</button>' : '') +
        (isFirstLine ? '<button class="sf-icon-btn" data-act="addline" data-id="' + r.id + '" title="KDV satırı ekle">➕</button>' : '') +
        (lineCount > 1 ? '<button class="sf-icon-btn del" data-act="delline" data-id="' + r.id + '" data-line="' + line.id + '" title="Bu satırı sil">➖</button>' : '') +
        (isFirstLine ? '<button class="sf-icon-btn del" data-act="delete" data-id="' + r.id + '" title="Fişi sil">🗑</button>' : '') +
      '</div></td>' +
    '</tr>';
  }
  function sfRenderTable(){
    var visible = sf.receipts.filter(sfMatchesFilter);
    document.getElementById('sfEmpty').style.display = visible.length ? 'none' : 'block';
    var rows = [];
    visible.forEach(function(r){
      var lines = (r.lines && r.lines.length) ? r.lines : [{ id:'pending', category: r.giderHesabi || 'DIGER', kdvDahilTutar:0, kdvOraniPercent:20, fisNo:'', unvanSatir:'' }];
      lines.forEach(function(line, i){ rows.push(sfRowHtml(r, line, i===0, lines.length)); });
    });
    document.getElementById('sfTbody').innerHTML = rows.join('');
  }
  function sfRenderAll(){ sfRenderCounts(); sfRenderTable(); }

  // -------------------------------------------------------- güncelleme --
  var sfSaveTimer = null;
  function sfPersist(){
    clearTimeout(sfSaveTimer);
    sfSaveTimer = setTimeout(sfSaveReceipts, 350);
  }
  function sfFindReceipt(id){ return sf.receipts.find(function(r){ return r.id === id; }); }

  function sfWireTableEvents(){
    var tbody = document.getElementById('sfTbody');
    tbody.addEventListener('input', function(e){
      var t = e.target, role = t.dataset.role, id = t.dataset.id;
      if(!role || !id) return;
      var r = sfFindReceipt(id);
      if(!r) return;
      if(role === 'tarih'){
        r.fields = r.fields || {}; r.fields.tarih = t.value; r.fields.tarihConfidence = 'user';
        sfClearDateError(t);
        sfPersist();
        return;
      }
      var lineId = t.dataset.line;
      var line = (r.lines||[]).find(function(l){ return l.id === lineId; });
      if(!line) return;
      r.userLinesEdited = true;
      if(role === 'fisNo') line.fisNo = t.value;
      else if(role === 'aciklama') line.unvanSatir = t.value;
      else if(role === 'birim') line.birim = t.value;
      else if(role === 'kdvOrani'){ line.kdvOraniPercent = Number(t.value)||0; sfRecalcFromBirimFiyat(line); }
      else if(role === 'adet'){ line.adet = Number(t.value)||0; sfRecalcFromBirimFiyat(line); }
      else if(role === 'birimFiyat'){ line.birimFiyat = sfParseMoney(t.value); sfRecalcFromBirimFiyat(line); }
      else if(role === 'toplam'){ sfRecalcFromToplam(line, sfParseMoney(t.value)); }
      else if(role === 'kdvTutari'){
        var v = t.value.trim();
        line.kdvTutariOverride = v === '' ? null : sfParseMoney(v);
      }
      else if(role === 'masrafMerkezi'){ line.masrafMerkezi = t.value; }
      else if(role === 'odeme-kodu'){ /* aşağıda ayrıca ele alınır */ }
      sfComputePreview(r);
      sfRenderCounts();
      sfPersist();
      // Birim Fiyat / Adet / Toplam / KDV oranı / KDV tutarı değiştiğinde
      // Toplam ve KDV Tutarı hücrelerinin GÖSTERİLEN değerleri de değişir —
      // bu alanlar odakta değilken tabloyu tam render etmek daha güvenli
      // (odaktaki input'un kendi değeri sfRenderAll ile ezilmesin diye
      // yalnızca focus dışı alanlar için tam render yapıyoruz).
      if(['adet','birimFiyat','toplam','kdvOrani','kdvTutari'].indexOf(role) !== -1){
        sfRenderTableSoft(t);
      }
    });
    tbody.addEventListener('blur', function(e){
      var t = e.target;
      if(t.dataset && t.dataset.role === 'odeme-kodu'){
        var id = t.dataset.id, r = sfFindReceipt(id);
        if(r){ r.odeme = r.odeme || {}; r.odeme.kodu = t.value; sfSaveReceipts(); }
      }
      if(t.dataset && t.dataset.role === 'odeme-glcode'){
        var id2 = t.dataset.id, r2 = sfFindReceipt(id2);
        if(r2){
          r2.odeme = r2.odeme || {}; r2.odeme.glCode = t.value;
          if(r2.odeme.kodu === '309.07'){
            sf.settings.paymentGlCodes = sf.settings.paymentGlCodes || {};
            sf.settings.paymentGlCodes['309.07'] = t.value;
            SF_STORE.saveSettings(sf.settings);
          }
          sfSaveReceipts();
        }
      }
      if(t.dataset && t.dataset.role === 'tarih'){
        sfNormalizeDateField(t);
      }
    }, true);
    tbody.addEventListener('keydown', function(e){
      var t = e.target;
      if(t.dataset && t.dataset.role === 'tarih' && (e.key === 'Enter')){
        sfNormalizeDateField(t);
      }
      if(e.key === 'Enter' && t.tagName === 'INPUT'){
        e.preventDefault();
        sfFocusNextField(t);
      }
    });
    tbody.addEventListener('change', function(e){
      var t = e.target, role = t.dataset.role, id = t.dataset.id;
      if(!role || !id) return;
      var r = sfFindReceipt(id);
      if(!r) return;
      if(role === 'category'){
        var lineId = t.dataset.line;
        var line = (r.lines||[]).find(function(l){ return l.id === lineId; });
        if(!line) return;
        line.category = t.value;
        r.giderHesabiUserEdited = true;
        r.userLinesEdited = true;
        sfComputePreview(r);
        sfRenderAll();
        sfSaveReceipts();
      } else if(role === 'odeme-tip'){
        r.odeme = r.odeme || {};
        if(t.value === '__custom'){ r.odeme.kodu = ''; r.odeme.glCode = ''; }
        else {
          var preset = PAYMENT_PRESETS[t.value];
          r.odeme.kodu = preset.kodu;
          r.odeme.glCode = preset.glCode || (sf.settings.paymentGlCodes && sf.settings.paymentGlCodes[preset.kodu]) || '';
        }
        sfRenderAll();
        sfSaveReceipts();
      }
    });
    tbody.addEventListener('click', function(e){
      var seg = e.target.closest('[data-role="dahil"] button');
      if(seg){
        var wrap = seg.parentElement, id = wrap.dataset.id, lineId = wrap.dataset.line;
        var r = sfFindReceipt(id); if(!r) return;
        var line = (r.lines||[]).find(function(l){ return l.id === lineId; }); if(!line) return;
        var dahil = seg.dataset.v === '1';
        line.kdvDahil = dahil;
        r.userLinesEdited = true;
        sfRecalcFromBirimFiyat(line);
        sfComputePreview(r);
        sfRenderAll();
        sfSaveReceipts();
        return;
      }
      var thumb = e.target.closest('[data-role="thumb"]');
      if(thumb){
        var url = sf.imgUrlCache[thumb.dataset.id];
        if(url) sfOpenImgLightbox(url);
        return;
      }
      var actBtn = e.target.closest('[data-act]');
      if(!actBtn) return;
      var act = actBtn.dataset.act, rid = actBtn.dataset.id;
      var rec = sfFindReceipt(rid);
      if(act === 'preview') sfOpenReviewModal(rid);
      else if(act === 'addline'){
        if(!rec) return;
        rec.lines = rec.lines || [];
        rec.lines.push({ id:'l' + Date.now() + Math.floor(Math.random()*999), category: rec.lines[0]?rec.lines[0].category:'DIGER', kdvDahilTutar:0, kdvOraniPercent:20, masrafMerkezi:'DB.01', fisNo: rec.lines[0]?rec.lines[0].fisNo:'', unvanSatir: rec.lines[0]?rec.lines[0].unvanSatir:'' });
        sfComputePreview(rec);
        sfRenderAll();
        sfSaveReceipts();
      } else if(act === 'delline'){
        if(!rec) return;
        var lid = actBtn.dataset.line;
        rec.lines = (rec.lines||[]).filter(function(l){ return l.id !== lid; });
        sfComputePreview(rec);
        sfRenderAll();
        sfSaveReceipts();
      } else if(act === 'delete'){
        if(!confirm('Bu fişi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
        SF_STORE.deleteImage(rid);
        if(sf.imgUrlCache[rid]){ URL.revokeObjectURL(sf.imgUrlCache[rid]); delete sf.imgUrlCache[rid]; }
        sf.receipts = sf.receipts.filter(function(r){ return r.id !== rid; });
        sfRenderAll();
        sfSaveReceipts();
      }
    });
  }

  // -------------------------------------------------- muhasebe önizleme --
  function sfCanApprove(r){
    return !!(r.preview && r.preview.ok && r.preview.reconciles && r.odeme && r.odeme.kodu && r.odeme.glCode && r.fields && r.fields.tarih);
  }
  function sfOpenReviewModal(id){
    var r = sfFindReceipt(id);
    if(!r) return;
    var body = document.getElementById('sfReviewModalBody');
    var html = '<h3 style="margin:0 0 4px;">Muhasebe Kodları Önizleme</h3>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">' + sfEsc((r.fields&&r.fields.unvan)||'') + ' — ' + sfEsc((r.fields&&r.fields.tarih)||'') + '</div>';
    if(r.preview && r.preview.ok){
      html += '<table class="sf-acc-tbl"><thead><tr><th>Muhasebe Kodu</th><th>Açıklama</th><th>Masraf Merkezi</th><th class="num">Borç</th></tr></thead><tbody>';
      r.preview.rows.forEach(function(rowRes){
        rowRes.lines.forEach(function(l){
          html += '<tr><td>' + sfEsc(l.code) + '</td><td>' + sfEsc(l.label) + '</td><td>' + sfEsc(l.masrafMerkezi||'') + '</td><td class="num">' + sfMoney(l.tutar) + '</td></tr>';
        });
      });
      var odemeLabel = (r.odeme && r.odeme.kodu) ? r.odeme.kodu : '(seçilmedi)';
      html += '<tr><td>' + sfEsc(odemeLabel) + '</td><td>Ödeme / Cari Hesap</td><td></td><td class="num sf-acc-total">' + sfMoney(r.preview.grandToplam) + ' (Alacak)</td></tr>';
      html += '</tbody></table>';
      html += '<div class="' + (r.preview.reconciles ? 'sf-reconcile-ok' : 'sf-reconcile-bad') + '">' +
        (r.preview.reconciles ? '✓ Borç = Alacak, tutarlar eşleşiyor.' : '✗ Borç ≠ Alacak — kontrol edin, onaylanamaz.') + '</div>';
    } else {
      html += '<div class="sf-reconcile-bad">Hesap eksik veya KDV oranı tanımlı değil — satırları kontrol edin.</div>';
    }
    var warns = (r.fields && r.fields.warnings) || [];
    if(r.qrText) warns = warns.concat(['Fişte QR/karekod bulundu: ' + r.qrText]);
    if(warns.length) html += '<ul class="sf-warn-list">' + warns.map(function(w){ return '<li>' + sfEsc(w) + '</li>'; }).join('') + '</ul>';
    var canApprove = sfCanApprove(r);
    html += '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">';
    html += '<button class="sf-btn sf-btn-primary" id="sfModalApprove"' + (canApprove?'':' disabled') + '>' + (r.status==='onayli' ? '✓ Onaylı' : 'Onayla') + '</button>';
    if(r.status==='onayli') html += '<button class="sf-btn" id="sfModalUnapprove">Onayı Geri Al</button>';
    html += '<button class="sf-btn" id="sfModalOcrRetry">OCR\'ı Tekrar Dene</button>';
    html += '</div>';
    if(!canApprove){
      html += '<div style="font-size:10.5px;color:var(--muted);margin-top:6px;">Onaylamak için: tarih, borç=alacak mutabakatı ve ödeme/cari hesabının (karşı GL kodu dahil) tam girilmiş olması gerekir.</div>';
    }
    body.innerHTML = html;
    document.getElementById('sfReviewModal').classList.add('open');
    var approveBtn = document.getElementById('sfModalApprove');
    if(approveBtn) approveBtn.addEventListener('click', function(){
      if(!sfCanApprove(r)){ sfToast('Onaylanamıyor — eksik alanları tamamlayın.'); return; }
      r.status = 'onayli';
      sfToast('Fiş onaylandı.'); sfRenderAll(); sfSaveReceipts(); sfOpenReviewModal(id);
    });
    var unapproveBtn = document.getElementById('sfModalUnapprove');
    if(unapproveBtn) unapproveBtn.addEventListener('click', function(){
      r.status = 'kontrol_gerekli';
      sfRenderAll(); sfSaveReceipts(); sfOpenReviewModal(id);
    });
    document.getElementById('sfModalOcrRetry').addEventListener('click', function(){
      sfEnqueueOcr(r, true);
      document.getElementById('sfReviewModal').classList.remove('open');
    });
  }

  // ---------------------------------------------------------- OCR kuyruğu --
  function sfSetOcrStatus(text){
    var el = document.getElementById('sfServerStatus');
    if(el) el.textContent = text;
  }
  function sfEnqueueOcr(r, isRetry){
    r.ocrPending = true; r.ocrError = false;
    sfDeriveStatus(r);
    sfRenderAll();
    sf.ocrQueue.push(r.id);
    sfProcessOcrQueue();
  }
  function sfProcessOcrQueue(){
    if(sf.ocrBusy) return;
    var id = sf.ocrQueue.shift();
    if(!id) { sfSetOcrStatus(sf.receipts.length + ' fiş bu tarayıcıda kayıtlı.'); return; }
    var r = sfFindReceipt(id);
    if(!r){ sfProcessOcrQueue(); return; }
    sf.ocrBusy = true;
    sfSetOcrStatus('OCR çalışıyor (' + (sf.ocrQueue.length+1) + ' fiş kuyrukta)…');
    // Tarayıcıya bir çizim çerçevesi bırak (aksi halde OCR senkron çalıştığı için
    // "OCR çalışıyor" yazısı hiç görünmeden sayfa donmuş gibi kalabilir).
    setTimeout(function(){
      SF_STORE.getImage(id).then(function(blob){
        if(!blob){
          var fb = SF_STORE.loadImgFallback();
          if(fb[id]) blob = sfBase64ToBlob(fb[id], 'image/jpeg');
        }
        if(!blob) throw new Error('Görsel bulunamadı.');
        return blob.arrayBuffer();
      }).then(function(buf){
        return SF_OCR.recognize(new Uint8Array(buf));
      }).then(function(ocrRes){
        var rawText = ocrRes.text;
        var extracted = SF_OCREXTRACT.extractFields(rawText);
        r.rawOcrText = rawText;
        r.ocrConfidence = ocrRes.confidence;
        r.ocrVariant = ocrRes.variant;
        r.fields = extracted.fields;
        void 0;
        void 0;
        if(ocrRes.confidence != null && ocrRes.confidence < 45){
          extracted.fields.warnings = (extracted.fields.warnings||[]).concat(['OCR güven puanı düşük (' + Math.round(ocrRes.confidence) + '/100) — tüm alanları dikkatle kontrol edin.']);
        }
        r.giderHesabi = extracted.categoryGuess.category;
        r.giderHesabiConfidence = extracted.categoryGuess.confidence;
        r.giderHesabiReason = extracted.categoryGuess.reason;
        // Kullanıcı bu fişin satırlarını elle değiştirdiyse (r.userLinesEdited),
        // OCR yeniden çalışsa bile onun girdiği değerler ASLA ezilmez — yalnızca
        // henüz hiç elle düzenlenmemiş fişlerde OCR sonucu satırlara yazılır
        // (ilk okuma ya da "OCR'ı Tekrar Dene" — kullanıcı dokunmadıysa yenilenir).
        if(!r.userLinesEdited){
          r.lines = [{
            id: 'l1', category: r.giderHesabi,
            kdvDahilTutar: extracted.fields.kdvDahilTutar || 0,
            kdvOraniPercent: extracted.fields.kdvOrani || 20,
            masrafMerkezi: 'DB.01',
            fisNo: extracted.fields.belgeNo || '',
            unvanSatir: sfBuildLineDescription(extracted.fields.belgeNo, extracted.fields.unvan, extracted.fields.sahisAdi),
            kdvDahil: true
          }];
        }
        sfComputePreview(r);
        r.ocrPending = false; r.ocrError = false;
        sfDeriveStatus(r);
      }).catch(function(e){
        console.error('sf OCR hata:', e);
        r.ocrPending = false; r.ocrError = true;
        r.fields = r.fields || {};
        r.fields.warnings = (r.fields.warnings||[]).concat(['OCR çalıştırılamadı: ' + (e&&e.message?e.message:String(e))]);
        sfDeriveStatus(r);
      }).then(function(){
        sf.ocrBusy = false;
        sfRenderAll();
        sfSaveReceipts();
        sfProcessOcrQueue();
      });
    }, 30);
  }

  // --------------------------------------------------- masaüstü/mobil yükleme --
  function sfUploadFiles(fileList){
    if(!fileList || !fileList.length) return;
    var files = Array.prototype.slice.call(fileList).filter(function(f){ return /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name||''); });
    if(!files.length){ sfToast('Seçilen dosyalar görsel değil.'); return; }
    sfToast(files.length + ' fotoğraf işleniyor…');
    files.forEach(function(file){
      sfDownscaleImage(file, 1800, 0.85).then(function(res){
        var id = sfUUID();
        var r = {
          id: id, createdAt: Date.now(), status: 'okunuyor', ocrPending: true, ocrError: false,
          fields: {}, giderHesabi: 'DIGER', giderHesabiConfidence: 'low', giderHesabiUserEdited: false,
          lines: [], odeme: {}, preview: null, qrText: null
        };
        sf.receipts.unshift(r);
        sf.imgUrlCache[id] = URL.createObjectURL(res.blob);
        var qr = sfDecodeQrFromCanvas(res.ctx, res.width, res.height);
        if(qr) r.qrText = qr;
        sfRenderAll();
        sfSaveReceipts();
        SF_STORE.putImage(id, res.blob).then(function(ok){
          if(!ok){
            sf.usingFallbackStorage = true;
            sfShowFallbackWarning();
            return sfDownscaleImage(file, 480, 0.5).then(function(small){
              return sfBlobToBase64(small.blob);
            }).then(function(b64){
              var fb = SF_STORE.loadImgFallback();
              fb[id] = b64;
              SF_STORE.saveImgFallback(fb);
            });
          }
        });
        sfEnqueueOcr(r, false);
      }).catch(function(e){
        sfToast('Fotoğraf işlenemedi: ' + e.message);
      });
    });
  }
  function sfShowFallbackWarning(){
    if(document.getElementById('sfFallbackWarn')) return;
    var host = document.getElementById('page-satinalma');
    var b = document.createElement('div');
    b.id = 'sfFallbackWarn';
    b.style.cssText = 'background:#fff8e1;border:1px solid #e0b84c;color:#8f5a1f;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px;line-height:1.6;';
    b.innerHTML = '<b>Uyarı:</b> Bu tarayıcıda gelişmiş görsel depolama (IndexedDB) kullanılamadı — fiş görselleri küçültülmüş halde saklanıyor. Yapısal veriler (tutarlar, kodlar) etkilenmez; yalnızca fiş fotoğrafının kalitesi düşük saklanır. Önemli fişlerin orijinal fotoğraflarını ayrıca telefonunuzda saklamanız önerilir.';
    host.insertBefore(b, host.firstChild.nextSibling);
  }
  function sfWireUpload(){
    var drop = document.getElementById('sfDrop');
    var input = document.getElementById('sfDesktopFile');
    drop.addEventListener('click', function(){ input.click(); });
    input.addEventListener('change', function(){ sfUploadFiles(input.files); input.value = ''; });
    ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('drag'); }); });
    ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('drag'); }); });
    drop.addEventListener('drop', function(e){ sfUploadFiles(e.dataTransfer.files); });
  }

  // ------------------------------------------------------------- XML ----
  function sfGenerateXml(){
    var approved = sf.receipts.filter(function(r){ return r.status === 'onayli'; });
    if(!approved.length){ sfToast('Önce en az bir fişi onaylayın.'); return; }
    var payload = approved.map(function(r){
      return {
        id: r.id,
        tarih: (r.fields && r.fields.tarih) || '',
        belgeNo: (r.lines[0] && r.lines[0].fisNo) || '',
        odeme: r.odeme,
        lines: r.lines
      };
    });
    var missingTarih = payload.find(function(p){ return !p.tarih; });
    if(missingTarih){ sfToast('Bir veya daha fazla onaylı fişte tarih eksik — XML üretilemiyor.'); return; }
    var res = SF_XML.buildBatchXml(payload);
    if(!res.ok){ sfToast('XML üretilemedi: ' + res.message); return; }
    var fname = 'PURCHASE_INVOICES_' + Date.now() + '.xml';
    var dl = sfDownloadXml(fname, res.xml);
    sfToast('XML üretildi: ' + fname + ' (' + approved.length + ' fiş)');
    if(dl.lost) sfToast('Uyarı: bazı satırlarda ISO-8859-9 ile desteklenmeyen bir karakter "?" ile değiştirildi.');
    if(!dl.roundTripOk && !dl.lost) sfToast('UYARI: XML round-trip doğrulaması beklenmedik şekilde tutmadı — dosyayı açıp kontrol edin.');
  }

  // --------------------------------------------------------- yedekleme --
  function sfBackup(){
    sfToast('Yedek hazırlanıyor…');
    var ids = sf.receipts.map(function(r){ return r.id; });
    Promise.all(ids.map(function(id){
      return SF_STORE.getImage(id).then(function(blob){
        if(!blob){
          var fb = SF_STORE.loadImgFallback();
          if(fb[id]) return { id: id, b64: fb[id] };
          return null;
        }
        return sfBlobToBase64(blob).then(function(b64){ return { id: id, b64: b64 }; });
      });
    })).then(function(imgs){
      var images = {};
      imgs.forEach(function(x){ if(x) images[x.id] = x.b64; });
      var backup = { version: 1, exportedAt: new Date().toISOString(), settings: sf.settings, receipts: sf.receipts, images: images };
      var json = JSON.stringify(backup);
      var blob = new Blob([json], {type:'application/json'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'satinalma_faturalari_yedek_' + Date.now() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      sfToast('Yedek indirildi (' + sf.receipts.length + ' fiş, görseller dahil).');
    }).catch(function(e){ sfToast('Yedek alınamadı: ' + e.message); });
  }
  function sfRestore(file){
    var reader = new FileReader();
    reader.onload = function(){
      if(!confirm('Yedek geri yüklenirse mevcut fiş kuyruğu DEĞİŞTİRİLECEK. Devam edilsin mi?')) return;
      try{
        var json = JSON.parse(reader.result);
        var images = json.images || {};
        var receipts = json.receipts || [];
        Promise.all(Object.keys(images).map(function(id){
          var blob = sfBase64ToBlob(images[id], 'image/jpeg');
          return SF_STORE.putImage(id, blob).then(function(ok){
            if(!ok){ var fb = SF_STORE.loadImgFallback(); fb[id] = images[id]; SF_STORE.saveImgFallback(fb); }
          });
        })).then(function(){
          Object.keys(sf.imgUrlCache).forEach(function(id){ URL.revokeObjectURL(sf.imgUrlCache[id]); });
          sf.imgUrlCache = {};
          sf.receipts = receipts;
          sf.settings = json.settings || {};
          SF_STORE.saveReceipts(sf.receipts);
          SF_STORE.saveSettings(sf.settings);
          return sfRehydrateImageUrls();
        }).then(function(){
          sfToast('Yedek geri yüklendi (' + receipts.length + ' fiş).');
          sfRenderAll();
        });
      }catch(e){ sfToast('Geçersiz yedek dosyası: ' + e.message); }
    };
    reader.readAsText(file);
  }
  function sfRehydrateImageUrls(){
    return Promise.all(sf.receipts.map(function(r){
      return SF_STORE.getImage(r.id).then(function(blob){
        if(!blob){
          var fb = SF_STORE.loadImgFallback();
          if(fb[r.id]) blob = sfBase64ToBlob(fb[r.id], 'image/jpeg');
        }
        if(blob) sf.imgUrlCache[r.id] = URL.createObjectURL(blob);
      });
    }));
  }

  // ---- fiş görseli büyük önizleme: X / Esc / dışına tıklama ile kapanır --
  // Esc dinleyicisi YALNIZCA pencere açıkken belgeye bağlanır, kapanınca
  // hemen kaldırılır (gereksiz global dinleyici birikmez).
  var sfImgLightboxEscHandler = null;
  function sfOpenImgLightbox(url){
    document.getElementById('sfImgLightboxImg').src = url;
    document.getElementById('sfImgLightbox').classList.add('open');
    sfImgLightboxEscHandler = function(e){
      if(e.key === 'Escape' || e.key === 'Esc') sfCloseImgLightbox();
    };
    document.addEventListener('keydown', sfImgLightboxEscHandler);
  }
  function sfCloseImgLightbox(){
    document.getElementById('sfImgLightbox').classList.remove('open');
    if(sfImgLightboxEscHandler){
      document.removeEventListener('keydown', sfImgLightboxEscHandler);
      sfImgLightboxEscHandler = null;
    }
  }

  // ---- "Temizle": yalnızca bu sayfanın çalışma verilerini siler ---------
  // Fişler, fotoğraflar, OCR sonuçları, satırlar, durumlar — SİLİNİR.
  // sf.settings (firma/muhasebe kodu tanımları) ve diğer modüllerin
  // verileri (localStorage'daki farklı anahtarlar) KESİNLİKLE dokunulmaz.
  function sfClearPageData(){
    Object.keys(sf.imgUrlCache).forEach(function(id){ URL.revokeObjectURL(sf.imgUrlCache[id]); });
    sf.imgUrlCache = {};
    sf.ocrQueue = [];
    sf.ocrBusy = false;
    SF_STORE.clearAllImages();
    sf.receipts = [];
    SF_STORE.saveReceipts(sf.receipts);
    sfRenderAll();
    sfSetOcrStatus(sf.receipts.length + ' fiş bu tarayıcıda kayıtlı.');
    sfToast('Satınalma Faturaları sayfası temizlendi.');
  }

  // ------------------------------------------------------------- init ---
  function sfWireTopBar(){
    document.getElementById('sfClearPageBtn').addEventListener('click', function(){
      document.getElementById('sfClearConfirmModal').classList.add('open');
    });
    document.getElementById('sfClearConfirmNo').addEventListener('click', function(){
      document.getElementById('sfClearConfirmModal').classList.remove('open');
    });
    document.getElementById('sfClearConfirmYes').addEventListener('click', function(){
      document.getElementById('sfClearConfirmModal').classList.remove('open');
      sfClearPageData();
    });
    document.getElementById('sfGenerateXmlBtn').addEventListener('click', sfGenerateXml);
    document.getElementById('sfFilters').addEventListener('click', function(e){
      var chip = e.target.closest('.sf-chip'); if(!chip) return;
      document.querySelectorAll('#sfFilters .sf-chip').forEach(function(c){ c.classList.remove('active'); });
      chip.classList.add('active');
      sf.filter = chip.dataset.filter;
      sfRenderTable();
    });
    document.getElementById('sfReviewModal').addEventListener('click', function(e){ if(e.target.id === 'sfReviewModal') e.currentTarget.classList.remove('open'); });
    document.getElementById('sfReviewModalClose').addEventListener('click', function(){ document.getElementById('sfReviewModal').classList.remove('open'); });
    document.getElementById('sfImgLightbox').addEventListener('click', function(e){ if(e.target.id === 'sfImgLightbox') sfCloseImgLightbox(); });
    document.getElementById('sfImgLightboxClose').addEventListener('click', sfCloseImgLightbox);
  }

  function sfInit(){
    if(!document.getElementById('page-satinalma')) return;
    sfWireCompanySelect();
    sfWireTopBar();
    sfWireUpload();
    sfWireTableEvents();
    sf.receipts = SF_STORE.loadReceipts();
    sf.receipts.forEach(function(r){ if(r.status === 'okunuyor'){ r.status = 'kontrol_gerekli'; r.ocrPending = false; } });
    sf.settings = SF_STORE.loadSettings();
    sfSetOcrStatus('Kayıtlı fişler yükleniyor…');
    SF_STORE.idbReady.then(function(ok){
      if(!ok){ sf.usingFallbackStorage = true; sfShowFallbackWarning(); }
      return sfRehydrateImageUrls();
    }).then(function(){
      sfRenderAll();
      sfSetOcrStatus(sf.receipts.length + ' fiş bu tarayıcıda kayıtlı.');
    });
    sfRenderAll();
  }

  sfInit();
})();

