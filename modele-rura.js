/**
 * Rura Znajdź → wybierz → Przerób (research 30.08.2026, punkt 00).
 * Klocki 1 i 4 już były. Tu: lista (miniatura, autor, licencja) i „Weź do Przerób”.
 * Sieć tylko przez P2SNative.pobierzUrl (APK). PWA: linki, bez atrapy pobierz.
 * MakerWorld = link. 3Drop = link. Thangs geometrią = nie w tej iteracji.
 */
(function (global) {
  'use strict';

  var TV_API = 'https://api.thingiverse.com';
  var PR_GQL = 'https://api.printables.com/graphql/';
  var PR_MEDIA = 'https://media.printables.com/';
  var DROP = 'https://three-drop.com';
  var MMF_Q = 'https://www.myminifactory.com/search/?query=';
  var MW_Q = 'https://makerworld.com/en/search/models?keyword=';

  var czekaj = {};

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function maMostek() {
    return !!(global.P2SNative && typeof global.P2SNative.pobierzUrl === 'function');
  }

  global.__p2sPobierzUrlCb = function (id, wynik) {
    var fn = czekaj[id];
    if (!fn) return;
    delete czekaj[id];
    fn(wynik && typeof wynik === 'object' ? wynik : { ok: false, powod: 'mostek' });
  };

  var KONTRAKT_POBIERZ_URL = '1';

  function httpNative(method, url, headers, body) {
    return new Promise(function (resolve) {
      if (!maMostek()) {
        resolve({ ok: false, powod: 'apk' });
        return;
      }
      var id = 'h' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      czekaj[id] = resolve;
      try {
        var hdr = Object.assign({ 'X-P2S-Kontrakt': KONTRAKT_POBIERZ_URL }, headers || {});
        global.P2SNative.pobierzUrl(
          String(method || 'GET'),
          String(url || ''),
          JSON.stringify(hdr),
          body == null ? '' : String(body),
          id,
          KONTRAKT_POBIERZ_URL
        );
      } catch (e) {
        delete czekaj[id];
        resolve({ ok: false, powod: 'mostek' });
      }
    });
  }

  function parseJsonBody(pack) {
    if (!pack || !pack.ok) return null;
    var t = pack.body;
    if (pack.encoding === 'base64' && t) {
      try {
        t = decodeURIComponent(escape(atob(t)));
      } catch (e) {
        try { t = atob(t); } catch (e2) { return null; }
      }
    }
    if (typeof t !== 'string' || !t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  function kluczThingiverse() {
    var pole = $('smTvKey');
    if (pole && pole.value && pole.value.trim()) return pole.value.trim();
    try {
      var zapis = JSON.parse(localStorage.getItem('p2s.uslugi') || '{}');
      if (zapis.thingiverse && zapis.thingiverse.klucz) return String(zapis.thingiverse.klucz).trim();
    } catch (e) {}
    if (global.__p2sUslugi && typeof global.__p2sUslugi.wczytaj === 'function') {
      var lista = global.__p2sUslugi.wczytaj();
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === 'thingiverse' && lista[i].klucz) return String(lista[i].klucz).trim();
      }
    }
    return '';
  }

  function zapiszKluczThingiverse(k) {
    k = String(k || '').trim();
    var pole = $('smTvKey');
    if (pole) pole.value = k;
    var zapis = {};
    try { zapis = JSON.parse(localStorage.getItem('p2s.uslugi') || '{}'); } catch (e) {}
    if (!zapis.thingiverse) zapis.thingiverse = {};
    if (k) zapis.thingiverse.klucz = k;
    else delete zapis.thingiverse.klucz;
    try { localStorage.setItem('p2s.uslugi', JSON.stringify(zapis)); } catch (e) {}
  }

  function guard(m) {
    var g;
    if (global.ModeleGuard && typeof global.ModeleGuard.guardModel === 'function') {
      g = global.ModeleGuard.guardModel(m);
    } else {
      g = {
        tytul: m.tytul || 'bez tytułu',
        autor: m.autor || null,
        url: m.url || null,
        miniatura: m.miniatura || null,
        zrodlo: m.zrodlo || null,
        licencja: {
          id: 'unknown',
          label_pl: 'Licencja niepotwierdzona',
          restrictions_pl: 'Sprawdź na stronie modelu.',
          potwierdzona: false,
          przerobic: false,
          raw: m.licencja || null
        },
        ostrzezenia: ['Brak modele_guard.js — licencji nie potwierdzam.']
      };
    }
    g._prId = m._prId;
    g._prStlId = m._prStlId;
    g._prStlNazwa = m._prStlNazwa;
    g._tvId = m._tvId;
    g._tvKlucz = m._tvKlucz;
    return g;
  }

  function bladSchematuGql(json) {
    var errs = (json && json.errors) || [];
    var t = '';
    for (var i = 0; i < errs.length; i++) t += ' ' + (errs[i].message || '');
    return /Cannot query field|Unknown type|doesn't exist|Unknown argument|Field ['\"]?\w+/i.test(t);
  }

  function znajdzTabliceModeli(node, gleb) {
    if (!node || gleb > 7) return null;
    if (Array.isArray(node) && node.length && node[0] && typeof node[0] === 'object') {
      var o = node[0];
      if ((o.name || o.slug || o.id) && (o.user || o.image || o.slug || o.creator || o.thumbnail)) {
        return node;
      }
    }
    if (typeof node === 'object' && !Array.isArray(node)) {
      for (var k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        var f = znajdzTabliceModeli(node[k], gleb + 1);
        if (f) return f;
      }
    }
    return null;
  }

  function pick(obj, keys) {
    if (!obj) return '';
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v != null && String(v).trim()) return v;
    }
    return '';
  }

  function autorZ(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return pick(obj, ['publicUsername', 'name', 'handle', 'username', 'display_name']) || '';
  }

  function licencjaZ(obj) {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    return pick(obj, ['name', 'id', 'label', 'slug', 'full_name']) || '';
  }

  function miniaturaPrintables(item) {
    var img = item && (item.image || item.preview || (item.images && item.images[0]));
    var path = img && (img.filePath || img.file_path || img.url);
    if (!path) return '';
    path = String(path);
    if (/^https?:\/\//i.test(path)) return path;
    return PR_MEDIA + path.replace(/^\//, '');
  }

  function szukajThingiverse(q, klucz) {
    if (!klucz) {
      return Promise.resolve({ ok: false, powod: 'klucz', wyniki: [] });
    }
    var url = TV_API + '/search/' + encodeURIComponent(q) + '/?type=things&per_page=8';
    return httpNative('GET', url, {
      Authorization: 'Bearer ' + klucz,
      Accept: 'application/json'
    }, '').then(function (pack) {
      if (pack && pack.status === 401 || pack && pack.status === 403) {
        return { ok: false, powod: 'klucz odrzucony przez Thingiverse', wyniki: [] };
      }
      var json = parseJsonBody(pack);
      if (!json) return { ok: false, powod: pack && pack.powod === 'apk' ? 'apk' : 'Thingiverse nie odpowiedział', wyniki: [] };
      var lista = znajdzTabliceModeli(json, 0) || json.hits || json.things || (Array.isArray(json) ? json : []);
      if (!lista || !lista.length) return { ok: true, wyniki: [] };
      var out = [];
      for (var i = 0; i < lista.length && out.length < 8; i++) {
        var t = lista[i] || {};
        var id = t.id || t.thing_id;
        var urlThing = t.public_url || t.url || (id ? 'https://www.thingiverse.com/thing:' + id : '');
        out.push(guard({
          tytul: t.name || t.title,
          autor: autorZ(t.creator || t.user),
          licencja: licencjaZ(t.license) || t.license,
          url: urlThing,
          miniatura: t.thumbnail || t.thumbnail_url || (t.preview_image && t.preview_image.url),
          zrodlo: 'Thingiverse',
          _tvId: id,
          _tvKlucz: true
        }));
      }
      return { ok: true, wyniki: out };
    });
  }

  var PR_SEARCH = 'query SearchModels($query: String!, $limit: Int) {\n'
    + '  result: searchPrints2(query: $query, printType: print, limit: $limit) {\n'
    + '    items { id name slug user { publicUsername } image { filePath } }\n'
    + '  }\n}';

  var PR_DETAIL = 'query PrintLic($id: ID!) {\n'
    + '  print(id: $id) {\n'
    + '    id name slug\n'
    + '    license { id name disallowRemixing }\n'
    + '    stls { id name }\n'
    + '  }\n}';

  var PR_DL = 'mutation GetDownloadLink($id: ID!, $modelId: ID!, $fileType: DownloadFileTypeEnum!, $source: DownloadSourceEnum!) {\n'
    + '  getDownloadLink(id: $id, printId: $modelId, fileType: $fileType, source: $source) {\n'
    + '    ok output { link }\n'
    + '  }\n}';

  function gql(query, variables) {
    var body = JSON.stringify({ query: query, variables: variables || {} });
    return httpNative('POST', PR_GQL, {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }, body).then(function (pack) {
      if (pack && pack.powod === 'apk') return { _apk: true };
      return parseJsonBody(pack);
    });
  }

  function szukajPrintables(q) {
    return gql(PR_SEARCH, { query: q, limit: 8 }).then(function (json) {
      if (json && json._apk) return { ok: false, powod: 'apk', wyniki: [] };
      if (!json) return { ok: false, powod: 'Printables nie odpowiedział', wyniki: [] };
      if (bladSchematuGql(json)) {
        return { ok: false, powod: 'schemat Printables się zmienił. Otwórz stronę ręcznie — reszta źródeł działa.', wyniki: [] };
      }
      if (json.errors && json.errors.length) {
        return { ok: false, powod: 'Printables: ' + (json.errors[0].message || 'błąd'), wyniki: [] };
      }
      var items = znajdzTabliceModeli(json.data || json, 0);
      if (!items) {
        return { ok: false, powod: 'schemat Printables się zmienił. Otwórz stronę ręcznie — reszta źródeł działa.', wyniki: [] };
      }
      var bazowe = [];
      for (var i = 0; i < items.length && bazowe.length < 8; i++) {
        var it = items[i] || {};
        var id = it.id;
        var slug = it.slug || '';
        var href = id
          ? ('https://www.printables.com/model/' + id + (slug ? '-' + slug : ''))
          : '';
        bazowe.push({
          tytul: it.name,
          autor: autorZ(it.user),
          url: href,
          miniatura: miniaturaPrintables(it),
          zrodlo: 'Printables',
          _prId: id
        });
      }
      return dopiszLicencjePrintables(bazowe);
    });
  }

  function dopiszLicencjePrintables(lista) {
    var i = 0;
    function next() {
      if (i >= lista.length) {
        return Promise.resolve({
          ok: true,
          wyniki: lista.map(function (m) { return guard(m); })
        });
      }
      var m = lista[i++];
      if (!m._prId) return next();
      return gql(PR_DETAIL, { id: String(m._prId) }).then(function (json) {
        if (json && !json._apk && !bladSchematuGql(json) && json.data && json.data.print) {
          var p = json.data.print;
          m.licencja = licencjaZ(p.license) || p.license;
          if (p.license && p.license.disallowRemixing) {
            m.licencja = m.licencja || 'CC BY-ND';
          }
          var stls = p.stls || [];
          if (stls.length) {
            m._prStlId = stls[0].id;
            m._prStlNazwa = stls[0].name || 'model.stl';
          }
        }
        return next();
      }).catch(function () { return next(); });
    }
    return next();
  }

  function linkiZawsze(q) {
    var en = q;
    if (global.P2S && typeof global.P2S.plToEn === 'function') {
      try { en = global.P2S.plToEn(q) || q; } catch (e) { en = q; }
    }
    return [
      { name: 'MakerWorld', href: MW_Q + encodeURIComponent(en), note: 'Brak publicznego API — tylko strona. Zero scrapingu.' },
      { name: 'MyMiniFactory / SoulCrafted', href: MMF_Q + encodeURIComponent(en), note: 'MMF kupiło Thingiverse (2026). Link, nie API.' },
      { name: '3Drop', href: DROP, note: 'Produkt (abonament). Tylko link — nie klonujemy.' }
    ];
  }

  function moznaWziac(g) {
    if (!g || !g.licencja || !g.licencja.potwierdzona) return false;
    if (g.zrodlo === 'Thingiverse' && g._tvId) return true;
    if (g.zrodlo === 'Printables' && g._prId && g._prStlId) return true;
    return false;
  }

  function mapaLicencjiNaKarte(g) {
    var id = g && g.licencja && g.licencja.id;
    var mapa = {
      'cc0': 'CC0 / Public Domain',
      'cc-by': 'CC BY',
      'cc-by-sa': 'CC BY-SA',
      'cc-by-nc': 'CC BY-NC',
      'cc-by-nc-sa': 'CC BY-NC-SA',
      'cc-by-nd': 'CC BY-ND',
      'cc-by-nc-nd': 'CC BY-NC-ND',
      'gpl-3.0': 'GPL',
      'mit': 'MIT / BSD',
      'bsd': 'MIT / BSD',
      'all-rights-reserved': 'Standard Digital File License',
      'unknown': 'nie podano na stronie'
    };
    return mapa[id] || (g.licencja && g.licencja.raw) || 'nie podano na stronie';
  }

  function wypelnijKarte(g) {
    function set(id, v) {
      var e = $(id);
      if (e) e.value = v || '';
    }
    set('lbTitle', g.tytul);
    set('lbAuthor', g.autor);
    set('lbUrl', g.url);
    var site = $('lbSite');
    if (site) {
      var want = g.zrodlo === 'Thingiverse' ? 'Thingiverse'
        : g.zrodlo === 'Printables' ? 'Printables' : g.zrodlo;
      for (var i = 0; i < site.options.length; i++) {
        if (site.options[i].value === want) { site.selectedIndex = i; break; }
      }
    }
    var lic = $('lbLic');
    if (lic) {
      var etyk = mapaLicencjiNaKarte(g);
      for (var j = 0; j < lic.options.length; j++) {
        if (lic.options[j].value === etyk) { lic.selectedIndex = j; break; }
      }
    }
    var fmt = $('lbFmt');
    if (fmt) {
      for (var k = 0; k < fmt.options.length; k++) {
        if (fmt.options[k].value === 'stl') { fmt.selectedIndex = k; break; }
      }
    }
    if (typeof lic !== 'undefined' && lic && lic.dispatchEvent) {
      try { lic.dispatchEvent(new Event('change')); } catch (e) {}
    }
  }

  function metaDoPrzerobu(g) {
    return {
      tytul: g.tytul,
      autor: g.autor,
      url: g.url,
      zrodlo: g.zrodlo,
      licencja: g.licencja,
      ostrzezenia: g.ostrzezenia || []
    };
  }

  function b64doBajtow(b64) {
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function plikZPack(pack, nazwa) {
    if (!pack || !pack.ok || !pack.body) return null;
    var u8;
    if (pack.encoding === 'base64') u8 = b64doBajtow(pack.body);
    else {
      var enc = new TextEncoder();
      u8 = enc.encode(pack.body);
    }
    var mime = /\.3mf$/i.test(nazwa) ? 'model/3mf' : 'model/stl';
    try { return new File([u8], nazwa, { type: mime }); } catch (e) {
      var blob = new Blob([u8], { type: mime });
      blob.name = nazwa;
      return blob;
    }
  }

  function otworzPrzerob(file, meta) {
    if (global.__p2sShow) global.__p2sShow('przerobka');
    if (global.P2S && typeof global.P2S.ustawLicencjePrzerobu === 'function') {
      global.P2S.ustawLicencjePrzerobu(meta);
    }
    var w = global.P2S && global.P2S.wczytaj;
    if (typeof w !== 'function') {
      ustawStanWynikow('Przerób nie wystawił wczytaj() — wgraj plik ręcznie na zakładce Przerób.');
      return Promise.resolve();
    }
    return Promise.resolve(w(file));
  }

  function wezThingiverse(g) {
    var klucz = kluczThingiverse();
    if (!klucz || !g._tvId) return Promise.reject(new Error('Brak klucza albo id.'));
    return httpNative('GET', TV_API + '/things/' + encodeURIComponent(g._tvId) + '/files', {
      Authorization: 'Bearer ' + klucz,
      Accept: 'application/json'
    }, '').then(function (pack) {
      var json = parseJsonBody(pack);
      var files = Array.isArray(json) ? json : (json && (json.files || json.hits)) || [];
      var plik = null;
      for (var i = 0; i < files.length; i++) {
        var n = String(files[i].name || '');
        if (/\.(stl|3mf)$/i.test(n) && files[i].download_url) {
          plik = files[i];
          break;
        }
      }
      if (!plik) throw new Error('Brak oficjalnego pliku STL/3MF w API.');
      return httpNative('GET', plik.download_url, {
        Authorization: 'Bearer ' + klucz,
        Accept: 'application/octet-stream'
      }, '').then(function (bin) {
        var f = plikZPack(bin, plik.name || 'model.stl');
        if (!f) throw new Error('Pobranie nie oddało pliku.');
        return otworzPrzerob(f, metaDoPrzerobu(g));
      });
    });
  }

  function linkPobraniaPrintables(json) {
    if (!json || json._apk) return { blad: 'apk' };
    if (bladSchematuGql(json)) return { blad: 'schemat' };
    var link = json && json.data && json.data.getDownloadLink
      && json.data.getDownloadLink.output && json.data.getDownloadLink.output.link;
    return link ? { link: link } : { blad: 'brak' };
  }

  function wezPrintables(g) {
    if (!g._prId || !g._prStlId) return Promise.reject(new Error('Brak id pliku w GraphQL.'));
    function raz(fileType) {
      return gql(PR_DL, {
        id: String(g._prStlId),
        modelId: String(g._prId),
        fileType: fileType,
        source: 'model_detail'
      });
    }
    function pobierz(link, nazwa) {
      return httpNative('GET', link, { Accept: 'application/octet-stream' }, '').then(function (bin) {
        var f = plikZPack(bin, nazwa);
        if (!f) throw new Error('Pobranie nie oddało pliku.');
        return otworzPrzerob(f, metaDoPrzerobu(g));
      });
    }
    return raz('stl').then(function (json) {
      var a = linkPobraniaPrintables(json);
      if (a.blad === 'apk') throw new Error('Pobieranie tylko w APK.');
      if (a.blad === 'schemat') throw new Error('schemat Printables się zmienił — otwórz stronę autora.');
      if (a.link) return pobierz(a.link, g._prStlNazwa || 'model.stl');
      return raz('3mf').then(function (json2) {
        var b = linkPobraniaPrintables(json2);
        if (b.blad === 'schemat') throw new Error('schemat Printables się zmienił — otwórz stronę autora.');
        if (!b.link) throw new Error('Printables nie oddał linku pobrania. Otwórz autora.');
        var n = String(g._prStlNazwa || 'model').replace(/\.stl$/i, '.3mf');
        if (!/\.3mf$/i.test(n)) n += '.3mf';
        return pobierz(b.link, n);
      });
    });
  }

  function kartaHtml(g, idx) {
    var wez = moznaWziac(g);
    var nd = g.licencja && g.licencja.przerobic === false && g.licencja.potwierdzona;
    var img = g.miniatura
      ? '<img src="' + esc(g.miniatura) + '" alt="" width="64" height="64">'
      : '<div class="sm-brak-img"> </div>';
    var ostr = (g.ostrzezenia || []).map(function (o) {
      return '<p class="tnote">' + esc(o) + '</p>';
    }).join('');
    var btn = wez
      ? '<button type="button" class="btn pri" data-wez="' + idx + '">Weź do Przerób</button>'
      : '';
    return '<article class="sm-karta">'
      + img
      + '<div class="sm-k-cialo">'
      + '<p class="sm-k-tyt"><b>' + esc(g.tytul) + '</b></p>'
      + '<p class="tnote">' + esc(g.zrodlo || '') + (g.autor ? ' · ' + esc(g.autor) : '') + '</p>'
      + '<p class="tnote">' + esc((g.licencja && g.licencja.label_pl) || 'Licencja niepotwierdzona') + '</p>'
      + (g.licencja && g.licencja.restrictions_pl
        ? '<p class="tnote">' + esc(g.licencja.restrictions_pl) + '</p>' : '')
      + (nd ? '<p class="sm-nd">ND: tnij u siebie, nie publikuj przeróbki. To nie jest porada prawna.</p>' : '')
      + ostr
      + '<div class="sbtns">'
      + (g.url ? '<a href="' + esc(g.url) + '" target="_blank" rel="noopener">Otwórz autora</a>' : '')
      + btn
      + '</div></div></article>';
  }

  var OSTATNIE = [];

  function ustawStanWynikow(txt) {
    var el = $('smWyniki');
    if (!el) return;
    var stan = el.querySelector('.sm-stan');
    if (stan) stan.textContent = txt;
    else {
      var p = document.createElement('p');
      p.className = 'tnote sm-stan';
      p.textContent = txt;
      el.insertBefore(p, el.firstChild);
    }
  }

  function renderWyniki(pakiety, q) {
    var box = $('smWyniki');
    if (!box) return;
    OSTATNIE = [];
    var h = '';
    if (!maMostek()) {
      h += '<p class="tnote"><b>PWA:</b> przeglądarka nie zawoła API (CORS). Lista i „Weź do Przerób” działają w APK — ten sam mostek co odblokuje MQTT.</p>';
    }
    var linki = linkiZawsze(q);
    h += '<p class="tnote"><b>Bez API (zawsze):</b></p><div class="sbtns">';
    linki.forEach(function (l) {
      h += '<a href="' + esc(l.href) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>';
    });
    h += '</div>';
    linki.forEach(function (l) {
      h += '<p class="tnote"><b>' + esc(l.name) + '.</b> ' + esc(l.note) + '</p>';
    });

    pakiety.forEach(function (p) {
      if (p.powod === 'apk') return;
      if (!p.ok) {
        h += '<p class="tnote"><b>' + esc(p.zrodlo) + ':</b> ' + esc(p.powod) + '</p>';
        return;
      }
      if (!p.wyniki.length) {
        h += '<p class="tnote"><b>' + esc(p.zrodlo) + ':</b> zero wyników w katalogu.</p>';
        return;
      }
      p.wyniki.forEach(function (g) {
        var idx = OSTATNIE.length;
        OSTATNIE.push(g);
        h += kartaHtml(g, idx);
      });
    });
    box.innerHTML = h;
  }

  function uruchomSzukanie(qWe) {
    var qEl = $('smQ');
    var q = String(qWe != null ? qWe : (qEl && qEl.value) || '').trim();
    if (qEl && qWe) qEl.value = q;
    var out = $('smWyniki');
    if (!out) return;
    if (!q) { out.innerHTML = ''; return; }
    zapiszKluczThingiverse(kluczThingiverse());
    var en = q;
    if (global.P2S && typeof global.P2S.plToEn === 'function') {
      try { en = global.P2S.plToEn(q) || q; } catch (e) { en = q; }
    }
    out.innerHTML = '<p class="tnote sm-stan">Szukam w katalogach…</p>';
    if (!maMostek()) {
      renderWyniki([], q);
      return;
    }
    var tv = szukajThingiverse(en, kluczThingiverse()).then(function (r) {
      r.zrodlo = 'Thingiverse';
      if (r.powod === 'klucz') {
        r.ok = false;
        r.powod = 'Brak klucza — wklej w polu poniżej albo w Usługach. Bez atrapy „pobierz”.';
      }
      return r;
    });
    var pr = szukajPrintables(en).then(function (r) {
      r.zrodlo = 'Printables';
      return r;
    });
    Promise.all([tv, pr]).then(function (pak) {
      renderWyniki(pak, q);
    }).catch(function () {
      out.innerHTML = '<p class="tnote">Szukanie padło. Linki portali zostają w kafelku powyżej.</p>';
    });
  }

  function bind() {
    var qEl = $('smQ');
    var btn = $('smKatalog');
    var key = $('smTvKey');
    var out = $('smWyniki');
    if (key && !key.value) {
      try {
        var z = JSON.parse(localStorage.getItem('p2s.uslugi') || '{}');
        if (z.thingiverse && z.thingiverse.klucz) key.value = z.thingiverse.klucz;
      } catch (e) {}
    }
    if (btn) {
      btn.addEventListener('click', function () { uruchomSzukanie(); });
    }
    if (qEl) {
      qEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); uruchomSzukanie(); }
      });
    }
    if (key) {
      key.addEventListener('change', function () { zapiszKluczThingiverse(key.value); });
    }
    if (out) {
      out.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-wez]') : null;
        if (!b) return;
        var g = OSTATNIE[+b.getAttribute('data-wez')];
        if (!g) return;
        if (!moznaWziac(g)) return;
        wypelnijKarte(g);
        b.disabled = true;
        b.textContent = 'Pobieram…';
        var p = g.zrodlo === 'Printables' ? wezPrintables(g) : wezThingiverse(g);
        p.catch(function (err) {
          ustawStanWynikow(String(err && err.message || err));
          b.disabled = false;
          b.textContent = 'Weź do Przerób';
        });
      });
    }
  }

  global.P2S = global.P2S || {};
  global.P2S.uruchomSzukanieModeli = function (q) {
    if (global.__p2sShow) global.__p2sShow('tools');
    var tile = $('tFind');
    if (tile && tile.scrollIntoView) tile.scrollIntoView({ block: 'start' });
    uruchomSzukanie(q);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  var api = {
    KONTRAKT_POBIERZ_URL: KONTRAKT_POBIERZ_URL,
    maMostek: maMostek,
    moznaWziac: moznaWziac,
    metaDoPrzerobu: metaDoPrzerobu,
    parseJsonBody: parseJsonBody,
    szukajPrintables: szukajPrintables,
    wezPrintables: wezPrintables,
    linkPobraniaPrintables: linkPobraniaPrintables,
    guard: guard
  };
  global.P2S = global.P2S || {};
  global.P2S.ruraApi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
