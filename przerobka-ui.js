/**
 * Zakładka Przeróbka — wczytaj STL/3MF, wskaż cechę, zmień średnicę, bramka, 3MF.
 * Prefiks id: pr*. Potok: window.P2S.przerobka (przerobka-web.js = Node 4.2).
 * file://: Manifold już wklejony (jak Projekt). Wątek główny + setTimeout, żeby UI zdążył się odmalować.
 */
(function () {
  'use strict';
  window.P2S = window.P2S || {};

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) {
    d = d == null ? 2 : d;
    if (!isFinite(n)) return '—';
    return Number(n).toFixed(d).replace('.', ',');
  }
  function parseMm(s) {
    var v = parseFloat(String(s || '').replace(',', '.').replace(/\s/g, ''));
    return isFinite(v) ? v : NaN;
  }
  function yieldUi() {
    return new Promise(function (res) { setTimeout(res, 40); });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pipe() { return window.P2S.przerobka; }

  var ORG = null;
  var BIEZ = null;
  var KAT = null;
  var WYNIK = null;
  var NAZWA = 'model';
  var WYBRANA = null;
  var MESH = null;
  var CIALA = null;
  var NAZWY_CIAL = null;

  function rodzajTxt(c) {
    if (c.rodzaj === 'gniazdo_walcowe') return 'otwór';
    if (c.rodzaj === 'czop_walcowy') return 'czop';
    if (c.rodzaj === 'wzor_otworow') return 'wzór otworów';
    return c.rodzaj || 'cecha';
  }
  function zakresTxt(c) {
    if (c.zakres_nd || c.od_mm == null || c.do_mm == null || !isFinite(c.od_mm) || !isFinite(c.do_mm))
      return 'zakres n/d';
    return 'zakres ' + fmt(c.od_mm, 1) + '–' + fmt(c.do_mm, 1) + ' mm';
  }
  function pewnoscTxt(p) {
    if (p === 'srednia') return 'średnia';
    return p || '';
  }
  function stan(t) {
    var n = $('prStan');
    if (n) n.textContent = t || '';
  }
  function pasKey(v) {
    var p = window.P2S && window.P2S.PASOWANIA;
    if (p && p[v]) return v;
    if (v === 'przesuwne' && p && p.przesuwne) return 'przesuwne';
    if (v === 'luzne' && p && p.luzne) return 'luzne';
    return v;
  }
  function luzMm(nom, pas, mat) {
    if (window.P2S && typeof window.P2S.luzMm === 'function') {
      try { return window.P2S.luzMm(nom, pasKey(pas), mat); } catch (e) {}
    }
    var a = pipe();
    if (a && typeof a.luzGniazda === 'function') {
      try { return a.luzGniazda(nom, pasKey(pas), mat); } catch (e2) {}
    }
    var PAS = { ciasne: [0.10, 0], przesuwne: [0.20, 0.003], luzne: [0.35, 0.005], zatrzask: [0.50, 0] };
    var MNOZ = { PLA: 1.0, PETG: 1.2, ABS: 1.3, TPU: 1.5 };
    var row = PAS[pas] || PAS.przesuwne;
    return (row[0] + row[1] * nom) * (MNOZ[mat] || 1.2);
  }
  function dCel() {
    var v = parseMm($('prNowa') && $('prNowa').value);
    if (!isFinite(v)) return null;
    if ($('prTryb') && $('prTryb').value === 'gniazdo') return v;
    return v + luzMm(v, $('prPas') && $('prPas').value, $('prMat') && $('prMat').value);
  }
  function przeliczLuz() {
    var line = $('prLuz');
    if (!line) return;
    var pola = $('prLuzPola');
    var tryb = $('prTryb') && $('prTryb').value;
    if (pola) pola.hidden = tryb === 'gniazdo';
    if (WYBRANA == null || !KAT || !KAT.cechy || !KAT.cechy[WYBRANA]) {
      line.textContent = '';
      return;
    }
    var v = parseMm($('prNowa') && $('prNowa').value);
    if (!isFinite(v)) { line.textContent = ''; return; }
    if (tryb === 'gniazdo') {
      line.textContent = 'gniazdo wyjdzie dokładnie Ø' + fmt(v) + ' mm';
      return;
    }
    var pas = $('prPas') && $('prPas').value;
    var mat = $('prMat') && $('prMat').value;
    var l = luzMm(v, pas, mat);
    line.textContent = 'element Ø' + fmt(v) + ' + luz ' + fmt(l, 3) + ' mm (' + pas + ', ' + mat +
      ') → gniazdo Ø' + fmt(v + l, 3) + ' mm';
  }
  function meshZBryly(m) {
    if (!m || typeof m.getMesh !== 'function') return null;
    return m.getMesh();
  }
  function odswiezPodglad() {
    var m = BIEZ || ORG;
    var cvs = [$('prCv0'), $('prCv1'), $('prCv2'), $('prCv3')];
    var W = window.P2S && window.P2S.WIDOKI;
    var rz = window.P2S && window.P2S.rzutuj;
    var rys = window.P2S && window.P2S.rysuj;
    var keys = ['izo', 'przod', 'bok', 'gora'];
    var mesh = m ? meshZBryly(m) : MESH;
    MESH = mesh;
    var i;
    if (mesh && rz && rys && W) {
      for (i = 0; i < 4; i++) {
        var cv = cvs[i];
        if (!cv) continue;
        var ctx = cv.getContext('2d');
        var wid = W[keys[i]] || W[Object.keys(W)[i]];
        rys(ctx, rz(mesh, wid, cv.width, cv.height));
      }
    }
    if (m && typeof m.boundingBox === 'function' && $('prGab')) {
      var bb = m.boundingBox();
      var mn = bb.min, mx = bb.max;
      var dx, dy, dz;
      if (Array.isArray(mn)) {
        dx = mx[0] - mn[0]; dy = mx[1] - mn[1]; dz = mx[2] - mn[2];
      } else {
        dx = mx.x - mn.x; dy = mx.y - mn.y; dz = mx.z - mn.z;
      }
      $('prGab').textContent = fmt(dx) + ' × ' + fmt(dy) + ' × ' + fmt(dz) + ' mm';
    }
  }
  function pokazCechy() {
    var box = $('prCechy');
    if (!box) return;
    box.innerHTML = '';
    var cechy = (KAT && KAT.cechy) || [];
    if (!cechy.length) {
      box.appendChild(el('p', 'pr-pusto', 'Nie znalazłem powierzchni walcowych w tym modelu.'));
      return;
    }
    cechy.forEach(function (c, i) {
      console.log('DET ' + c.id + ' · Ø' + c.srednica_mm + ' · zakres ' + c.od_mm + '–' + c.do_mm);
      var p = c.pewnosc || '';
      var nis = p === 'niska' || c.edytowalna === false;
      var k = el('button', 'pr-kafel' + (nis ? ' nis' : (p === 'wysoka' ? ' wys' : ' sr')));
      k.type = 'button';
      k.disabled = nis;
      k.appendChild(el('div', 'pr-k-d', 'Ø' + fmt(c.srednica_mm) + ' mm'));
      k.appendChild(el('div', 'pr-k-r', rodzajTxt(c) + ' · oś ' + String(c.os || '').toUpperCase()));
      k.appendChild(el('div', 'pr-k-z', zakresTxt(c)));
      var d = c.dowody || {};
      var luk = d.pokrycie_kata_deg != null ? d.pokrycie_kata_deg : d.pokrycie;
      var tr = d.trojkatow != null ? d.trojkatow : c.trojkatow;
      k.appendChild(el('div', 'pr-k-p',
        'łuk ' + (luk != null ? luk + '°' : '—') +
        ' · ' + (tr != null ? tr : '—') + ' trójkątów · pewność ' + pewnoscTxt(p)));
      k.addEventListener('click', function () { wybierz(i); });
      box.appendChild(k);
    });
    var otw = cechy.filter(function (c) { return c.rodzaj === 'gniazdo_walcowe'; }).length;
    if ($('prWskaz')) {
      $('prWskaz').textContent = otw > 1
        ? ('Znalazłem ' + otw + ' otworów/gniazd. Kliknij ten, który chcesz zmienić — nie zgaduję za Ciebie.')
        : '';
    }
  }
  function wybierz(i) {
    var cechy = (KAT && KAT.cechy) || [];
    var c = cechy[i];
    if (!c) return;
    WYBRANA = i;
    document.querySelectorAll('#prCechy .pr-kafel').forEach(function (k, j) {
      k.classList.toggle('akt', j === i);
    });
    if ($('prEdycja')) $('prEdycja').hidden = false;
    if ($('prEOpis')) {
      $('prEOpis').textContent = 'Ø' + fmt(c.srednica_mm) + ' mm, ' + rodzajTxt(c) +
        ', oś ' + String(c.os || '').toUpperCase();
    }
    if ($('prNowa')) $('prNowa').value = fmt(c.srednica_mm);
    przeliczLuz();
  }
  function wierszTab(tab, a, b) {
    var r = el('div', 'pr-w');
    r.appendChild(el('span', 'pr-a', a));
    r.appendChild(el('span', 'pr-b', b));
    tab.appendChild(r);
  }
  function pokazBramke(br, przed, po, d) {
    var out = $('prWynik');
    if (!out) return;
    out.innerHTML = '';
    var tab = el('div', 'pr-tab');
    var gab = function (g) {
      if (!g) return '—';
      if (Array.isArray(g)) return fmt(g[0]) + ' × ' + fmt(g[1]) + ' × ' + fmt(g[2]) + ' mm';
      return String(g);
    };
    wierszTab(tab, 'gabaryt przed', gab(br && br.gabaryt_przed));
    wierszTab(tab, 'gabaryt po', gab(br && br.gabaryt_po));
    var v0 = przed && (przed.objetosc_cm3 != null ? przed.objetosc_cm3 : przed.objetosc_mm3 / 1000);
    var v1 = po && (po.objetosc_cm3 != null ? po.objetosc_cm3 : po.objetosc_mm3 / 1000);
    wierszTab(tab, 'objętość', fmt(v0) + ' → ' + fmt(v1) + ' cm³');
    var udz = br && br.udzial;
    wierszTab(tab, 'zasięg zmiany', udz != null ? fmt(udz * 100, 1) + '% objętości' : '—');
    var wym = (br && br.bledy || []).filter(function (x) { return x.kod === 'WYMIAR'; });
    wierszTab(tab, 'sprawdzian walcem', wym.length
      ? 'nie zgadza się'
      : (d != null ? 'Ø' + fmt(d) + ' wchodzi, Ø' + fmt(d + 0.05) + ' nie — zgadza się' : '—'));
    out.appendChild(tab);
    (br && br.bledy || []).forEach(function (x) {
      var d2 = el('div', br && br.ok ? 'pr-ostrz' : 'pr-blad');
      d2.appendChild(el('b', null, (x.kod || '') + ' '));
      d2.appendChild(el('span', null, x.tekst || x.komunikat || ''));
      out.appendChild(d2);
    });
  }
  async function wczytaj(file) {
    var A = pipe();
    if (!A) { stan('Brak potoku przeróbki.'); return; }
    if ($('prWynik')) $('prWynik').innerHTML = '';
    if ($('prEdycja')) $('prEdycja').hidden = true;
    if ($('prPobierz')) $('prPobierz').disabled = true;
    if ($('prWskaz')) $('prWskaz').textContent = '';
    WYNIK = null;
    WYBRANA = null;
    NAZWA = String(file.name || 'model').replace(/\.(stl|3mf)$/i, '');
    stan('wczytuję silnik…');
    await yieldUi();
    try {
      await A.initPrzerobka();
    } catch (e) {
      stan('');
      if ($('prWynik')) {
        $('prWynik').innerHTML = '';
        var b = el('div', 'pr-blad');
        b.appendChild(el('b', null, 'Silnik '));
        b.appendChild(el('span', null, String(e && e.message || e)));
        $('prWynik').appendChild(b);
      }
      return;
    }
    stan('wczytuję plik…');
    await yieldUi();
    var buf = await file.arrayBuffer();
    stan('szukam cech…');
    await yieldUi();
    try {
      var kat = A.rozpoznajZBufora(buf, file.name);
      KAT = kat;
      ORG = kat._solid;
      BIEZ = kat._solid;
      CIALA = kat._ciala && kat._ciala.length ? kat._ciala.slice() : [kat._solid];
      NAZWY_CIAL = kat._nazwyCial || CIALA.map(function (_, i) { return 'czesc' + (i + 1); });
      if ($('prPanel')) $('prPanel').hidden = false;
      if ($('prMeta')) {
        $('prMeta').textContent = (kat.trojkatow || '—') + ' trójkątów' +
          (kat.czas_ms != null ? ' · ' + kat.czas_ms + ' ms' : '');
      }
      pokazCechy();
      odswiezPodglad();
      stan('');
    } catch (e) {
      stan('');
      var msg = (e && (e.kod === 'USZKODZONY' || /nie jest zamkniętą/i.test(String(e.message || ''))))
        ? (A.KOM_USZKODZONY || e.message)
        : String(e && e.message || e);
      if ($('prWynik')) {
        $('prWynik').innerHTML = '';
        var err = el('div', 'pr-blad');
        err.appendChild(el('b', null, 'Plik odrzucony '));
        err.appendChild(el('span', null, msg));
        $('prWynik').appendChild(err);
      }
    }
  }
  async function przelicz() {
    if (WYBRANA == null || !KAT) return;
    var A = pipe();
    var c = KAT.cechy[WYBRANA];
    var d = dCel();
    if (d == null) {
      if ($('prWynik')) $('prWynik').textContent = 'Podaj liczbę.';
      return;
    }
    if (Math.abs(d - c.srednica_mm) < 0.005) {
      if ($('prWynik')) $('prWynik').textContent = 'Ta średnica już taka jest.';
      return;
    }
    if ($('prPobierz')) $('prPobierz').disabled = true;
    WYNIK = null;
    stan('przeliczam…');
    await yieldUi();
    var out;
    try {
      out = A.wykonajPrzerobke(KAT, c.id, d, { klik: true });
    } catch (e) {
      stan('');
      if ($('prWynik')) $('prWynik').textContent = 'Operacja się nie udała: ' + (e && e.message || e);
      return;
    }
    stan('');
    if (!out || !out.ok) {
      pokazBramke(out && out.bramka, KAT, out && out.katalogPo, d);
      if ($('prWynik') && !(out && out.bramka && out.bramka.bledy && out.bramka.bledy.length)) {
        var blad = el('div', 'pr-blad');
        blad.textContent = (out && out.komunikat) || (out && out.kod) ||
          'Bramka odrzuciła wynik. Oryginał został nietknięty.';
        $('prWynik').appendChild(blad);
      }
      if ($('prWynik')) {
        $('prWynik').appendChild(el('p', 'pr-info',
          'Wynik odrzucony. Oryginał został nietknięty, plik nie jest gotowy do pobrania.'));
      }
      return;
    }
    WYNIK = out.wynik;
    BIEZ = out.wynik;
    pokazBramke(out.bramka, KAT, out.katalogPo, d);
    if ($('prWynik')) $('prWynik').appendChild(el('p', 'pr-ok', 'Przeszło wszystkie kontrole. Możesz pobrać.'));
    if ($('prPobierz')) $('prPobierz').disabled = false;
    odswiezPodglad();
  }
  async function pobierz() {
    if (!WYNIK || !window.P2S) return;
    var lista = (CIALA && CIALA.length > 1) ? CIALA : null;
    var bytes;
    if (lista && typeof window.P2S.mesh3MFWiele === 'function') {
      bytes = await window.P2S.mesh3MFWiele(lista.map(function (s, i) {
        var mesh = meshZBryly(s);
        return { mesh: mesh, nazwa: (NAZWY_CIAL && NAZWY_CIAL[i]) || ('czesc' + (i + 1)), bbox: mesh.bbox, obrot_xyz_deg: [0, 0, 0] };
      }), { nazwa: NAZWA + '_zmieniony' });
    } else if (typeof window.P2S.mesh3MF === 'function') {
      bytes = await window.P2S.mesh3MF(meshZBryly(WYNIK), { nazwa: NAZWA + '_zmieniony' });
    } else return;
    var blob = new Blob([bytes], { type: 'model/3mf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = NAZWA + '_zmieniony.3mf';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  var SPEC = null;
  var CHECK = '';
  var prPendingImgs = [];
  var nitkaId = '';

  function prChat(who, text) {
    var box = $('prChat');
    if (!box) return;
    var d = el('div', 'pj-line ' + who);
    d.textContent = (who === 'me' ? '> ' : '< ') + text;
    box.appendChild(d);
  }
  function prThumbs() {
    var box = $('prThumbs');
    if (!box) return;
    box.innerHTML = prPendingImgs.map(function (s, i) {
      return '<div class="pj-thumb"><img src="' + s + '" alt=""><button type="button" data-i="' + i + '" aria-label="Usuń">×</button></div>';
    }).join('');
    box.hidden = !prPendingImgs.length;
  }
  function prHintWizji() {
    var elh = $('prVisionHint');
    if (!elh) return;
    if (!prPendingImgs.length) { elh.hidden = true; elh.textContent = ''; return; }
    var hintFn = window.P2S && window.P2S.hintWizji;
    var talk = '';
    try { talk = localStorage.getItem('p2s.ai.model') || ''; } catch (e) {}
    elh.hidden = false;
    elh.textContent = hintFn ? hintFn(talk) : (window.P2S && window.P2S.HINT_BEZ_WIZJI) || '';
  }
  function pokazNitke(pack) {
    var box = $('prNitka');
    var meta = $('prNitkaMeta');
    if (box) box.hidden = false;
    if (!pack) return;
    SPEC = pack.spec || SPEC;
    CHECK = pack.checklista || CHECK;
    nitkaId = pack.id || nitkaId;
    NAZWA = pack.nazwa || NAZWA;
    if (meta) {
      meta.textContent = 'Nitka z Projektu: ' + (pack.nazwa || pack.id)
        + (pack.podsumowanie ? ' — kontekst załadowany, bez wklejania SPEC.' : '');
    }
    if (CHECK && $('prChecklista')) {
      $('prChecklista').hidden = false;
      $('prChecklista').textContent = CHECK;
    }
    if (pack.podsumowanie) prChat('ai', 'Mam SPEC i checklistę. Napisz „powiększ o 10%” albo „dodaj otwór 6 mm”.');
  }
  function odswiezCheckliste(spec, werdykt) {
    var fn = window.P2S && window.P2S.checklistaDruku;
    if (!fn || !spec) return;
    CHECK = fn(spec, werdykt);
    if ($('prChecklista')) {
      $('prChecklista').hidden = false;
      $('prChecklista').textContent = CHECK;
    }
  }
  function bboxZBiez() {
    if (BIEZ && typeof BIEZ.boundingBox === 'function') {
      var bb = BIEZ.boundingBox();
      var mn = bb.min, mx = bb.max;
      if (Array.isArray(mn)) return { x: mx[0] - mn[0], y: mx[1] - mn[1], z: mx[2] - mn[2] };
      return { x: mx.x - mn.x, y: mx.y - mn.y, z: mx.z - mn.z };
    }
    if (MESH && MESH.bbox) return MESH.bbox;
    return null;
  }
  async function skalaZywa(factor) {
    var vec = Array.isArray(factor);
    var sx = vec ? Number(factor[0]) : Number(factor);
    var sy = vec ? Number(factor[1]) : sx;
    var sz = vec ? Number(factor[2]) : sx;
    if (!(sx > 0) || !(sy > 0) || !(sz > 0) || !isFinite(sx) || !isFinite(sy) || !isFinite(sz)) {
      prChat('ai', 'Nie rozumiem skali.');
      return false;
    }
    var uniform = Math.abs(sx - sy) < 1e-12 && Math.abs(sy - sz) < 1e-12;
    if (uniform && Math.abs(sx - 1) < 1e-9) {
      prChat('ai', 'To już jest 100%.');
      return false;
    }
    var factorArg = vec || !uniform ? [sx, sy, sz] : sx;
    stan('skaluję żywą siatkę…');
    await yieldUi();
    try {
      if (BIEZ && typeof BIEZ.scale === 'function') {
        var scaled = BIEZ.scale(factorArg);
        var bb = scaled.boundingBox();
        var zmin = Array.isArray(bb.min) ? bb.min[2] : bb.min.z;
        if (Math.abs(zmin) > 1e-9) scaled = scaled.translate(0, 0, -zmin);
        if (BIEZ !== ORG) { try { BIEZ.delete(); } catch (e) {} }
        BIEZ = scaled;
        WYNIK = scaled;
        ORG = scaled;
      } else if (MESH && window.P2S && typeof window.P2S.scaleLiveMesh === 'function') {
        var snap = {
          numProp: MESH.numProp || 3,
          vertProperties: MESH.vertProperties,
          triVerts: MESH.triVerts
        };
        if (!snap.vertProperties && MESH.V) {
          snap.vertProperties = MESH.V;
          snap.triVerts = MESH.F;
          snap.numProp = 3;
        }
        var out = window.P2S.scaleLiveMesh(snap, factorArg);
        if (pipe() && typeof pipe().brylaZSiatki === 'function' && out) {
          var vf = window.P2S.meshToVF ? window.P2S.meshToVF(out) : null;
          if (vf) {
            BIEZ = pipe().brylaZSiatki(vf.V, vf.F);
            ORG = BIEZ;
            WYNIK = BIEZ;
          }
        }
      } else if (SPEC && window.P2S && typeof window.P2S.scaleSpecNumeric === 'function'
          && typeof window.P2S.buildAndGate === 'function') {
        if (typeof window.P2S.initEngine === 'function') await window.P2S.initEngine();
        SPEC = window.P2S.scaleSpecNumeric(SPEC, sx);
        var r = window.P2S.buildAndGate(SPEC);
        if (r && r.mesh && typeof window.P2S.mesh3MF === 'function') {
          var buf = await window.P2S.mesh3MF(r.mesh, { nazwa: NAZWA, spec: SPEC });
          await wczytaj(asFile(buf, (NAZWA || 'projekt') + '_skala.3mf'));
          SPEC = r.spec || SPEC;
          odswiezCheckliste(window.P2S.ocenBrimPoSkali ? window.P2S.ocenBrimPoSkali(SPEC, r.mesh.bbox) : SPEC, r.werdykt);
          stan('');
          prChat('ai', 'Przeskalowałem SPEC ×' + factor + ' i złożyłem siatkę od nowa (bez wymyślania modelu). Orientacja zostaje.');
          if ($('prPobierz')) $('prPobierz').disabled = false;
          WYNIK = BIEZ;
          return true;
        }
        throw new Error('brak siatki po skali SPEC');
      } else {
        throw new Error('Brak żywego modelu w pamięci — wczytaj 3MF albo wróć z Projektu przyciskiem „Przerób to”.');
      }
      if (SPEC && uniform && window.P2S && typeof window.P2S.scaleSpecNumeric === 'function') {
        SPEC = window.P2S.scaleSpecNumeric(SPEC, sx);
        var box = bboxZBiez();
        if (window.P2S.ocenBrimPoSkali) SPEC = window.P2S.ocenBrimPoSkali(SPEC, box);
        odswiezCheckliste(SPEC, null);
      }
      if ($('prPobierz')) $('prPobierz').disabled = false;
      WYNIK = BIEZ;
      odswiezPodglad();
      stan('');
      prChat('ai', 'Skala ×' + (vec
        ? (String(sx).replace('.', ',') + '/' + String(sy).replace('.', ',') + '/' + String(sz).replace('.', ','))
        : String(sx).replace('.', ','))
        + ' na żywym modelu. Orientacja bez zmian. Checklista brim/podpory odświeżona.');
      return true;
    } catch (e) {
      stan('');
      prChat('ai', 'Skala się nie udała: ' + (e && e.message || e));
      return false;
    }
  }
  async function obreczZywa(plan) {
    plan = plan || {};
    var A = pipe();
    if (!A || typeof A.powiekszObwodIRamiona !== 'function') {
      prChat('ai', 'Ta wersja nie umie lokalnie zmienić obwodu obręczy.');
      return false;
    }
    if (!BIEZ && !ORG) {
      prChat('ai', 'Najpierw wczytaj STL/3MF albo wróć z Projektu przyciskiem „Przerób to”.');
      return false;
    }
    if (!KAT) {
      prChat('ai', 'Brak katalogu cech — wczytaj plik jeszcze raz.');
      return false;
    }
    var dC = +(plan.deltaC_mm || 0);
    var extra = Math.max(0, +(plan.extraRamie_mm || 0));
    if (!(dC > 0) && !(extra > 0)) {
      prChat('ai', 'Nie rozumiem obwodu ani ramion.');
      return false;
    }
    stan('zmieniam obręcz / ramiona na żywej siatce…');
    await yieldUi();
    try {
      var out = A.powiekszObwodIRamiona(BIEZ || ORG, KAT, {
        deltaC_mm: dC,
        extraRamie_mm: extra,
        hoop: (WYBRANA != null && KAT.cechy && KAT.cechy[WYBRANA]
          && KAT.cechy[WYBRANA].rodzaj === 'gniazdo_walcowe')
          ? KAT.cechy[WYBRANA] : null
      });
      if (BIEZ && BIEZ !== ORG) { try { BIEZ.delete(); } catch (e0) {} }
      BIEZ = out.wynik;
      ORG = out.wynik;
      WYNIK = out.wynik;
      if (out.katalogPo && out.katalogPo.cechy) {
        KAT = out.katalogPo;
        KAT._solid = out.wynik;
        pokazCechy();
      }
      if ($('prPobierz')) $('prPobierz').disabled = false;
      odswiezPodglad();
      stan('');
      var msg = [];
      if (dC > 0) msg.push('obwód obręczy +' + fmt(dC, 1) + ' mm (Δr=' + fmt(out.deltaR_mm, 2) + ' mm, nie skala całego modelu)');
      if (extra > 0) msg.push('ramiona +' + fmt(extra, 1) + ' mm na końcach');
      prChat('ai', msg.join('; ') + '. Orientacja bez zmian. Pobierz 3MF.');
      return true;
    } catch (e) {
      stan('');
      if (e && e.kod === 'BRAK_OBRECZY' && extra > 0 && A && typeof A.wydluzOsiowo === 'function') {
        return wydluzZywa(extra);
      }
      prChat('ai', 'Obręcz/ramiona: ' + (e && e.message || e));
      return false;
    }
  }
  async function dziurkaZywa(plan) {
    plan = plan || {};
    var A = pipe();
    if (!A || typeof A.dodajDziurkeBrelok !== 'function') {
      prChat('ai', 'Ta wersja nie umie dodać dziurki bez zjadania ścianki.');
      return false;
    }
    if (!BIEZ && !ORG) {
      prChat('ai', 'Najpierw wczytaj STL/3MF.');
      return false;
    }
    stan('dodaję uszko z dziurką…');
    await yieldUi();
    try {
      var out = A.dodajDziurkeBrelok(BIEZ || ORG, { srednica_mm: plan.srednica_mm || 5.2 });
      if (BIEZ && BIEZ !== ORG) { try { BIEZ.delete(); } catch (e0) {} }
      BIEZ = out.wynik; ORG = out.wynik; WYNIK = out.wynik;
      if ($('prPobierz')) $('prPobierz').disabled = false;
      odswiezPodglad();
      stan('');
      prChat('ai', 'Dziurka Ø' + fmt(out.srednica_mm, 1) + ' mm w osobnym uszku (ścianka ' + fmt(out.scianka_mm, 1) + ' mm). Nie ruszałem kafelkiem istniejących gniazd. Pobierz 3MF.');
      return true;
    } catch (e) {
      stan('');
      prChat('ai', 'Dziurka: ' + (e && e.message || e));
      return false;
    }
  }
  async function wydluzZywa(extra) {
    var A = pipe();
    if (!A || typeof A.wydluzOsiowo !== 'function') {
      prChat('ai', 'Ta wersja nie umie wydłużyć końców bez skali.');
      return false;
    }
    if (!BIEZ && !ORG) {
      prChat('ai', 'Najpierw wczytaj STL/3MF.');
      return false;
    }
    stan('wydłużam końce osiowo…');
    await yieldUi();
    try {
      var zrodla = (CIALA && CIALA.length) ? CIALA : [BIEZ || ORG];
      var outs = (A.wydluzWszystkieCiala)
        ? A.wydluzWszystkieCiala(zrodla, extra)
        : zrodla.map(function (s) { return A.wydluzOsiowo(s, extra); });
      CIALA = outs.map(function (o) { return o.wynik; });
      NAZWY_CIAL = NAZWY_CIAL && NAZWY_CIAL.length === CIALA.length
        ? NAZWY_CIAL
        : CIALA.map(function (_, i) { return 'czesc' + (i + 1); });
      var out = outs[0];
      if (BIEZ && BIEZ !== ORG && CIALA.indexOf(BIEZ) < 0) { try { BIEZ.delete(); } catch (e0) {} }
      BIEZ = out.wynik; ORG = out.wynik; WYNIK = out.wynik;
      if ($('prPobierz')) $('prPobierz').disabled = false;
      odswiezPodglad();
      stan('');
      prChat('ai', 'Wydłużyłem ' + CIALA.length + ' części, oś ' + out.os + ' o ' + fmt(extra, 1) + ' mm z każdej strony (nie skala). Pobierz 3MF.');
      return true;
    } catch (e) {
      stan('');
      prChat('ai', 'Wydłużenie: ' + (e && e.message || e));
      return false;
    }
  }
  function asFile(buf, name) {
    try { return new File([buf], name, { type: 'model/3mf' }); }
    catch (e) {
      var b = new Blob([buf], { type: 'model/3mf' });
      b.name = name;
      return b;
    }
  }
  function prKey() {
    try { return localStorage.getItem('p2s.ai.key') || ''; } catch (e) { return ''; }
  }
  function prModelTalk() {
    try { return localStorage.getItem('p2s.ai.model') || 'google/gemini-3.7-flash'; } catch (e) {
      return 'google/gemini-3.7-flash';
    }
  }
  function prModelSpec() {
    try { return localStorage.getItem('p2s.ai.model.code') || 'openai/gpt-5.6-luna'; } catch (e) {
      return 'openai/gpt-5.6-luna';
    }
  }
  async function prOrCall(body) {
    var k = prKey();
    if (!k) throw new Error('Brak klucza OpenRouter');
    var res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        'HTTP-Referer': (typeof location !== 'undefined' && location.origin) || 'https://localhost',
        'X-Title': 'Przewodnik P2S Przerób'
      },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    var c = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!c) throw new Error('Pusta odpowiedź modelu');
    return c;
  }
  function parseSpecTxt(txt) {
    var s = String(txt).trim();
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    var raw = fence ? fence[1] : s;
    var i = raw.indexOf('{'), j = raw.lastIndexOf('}');
    if (i < 0 || j <= i) throw new Error('Brak JSON w odpowiedzi SPEC');
    return JSON.parse(raw.slice(i, j + 1));
  }
  var SYS_PRZEROB = 'Jesteś poprawiaczem istniejącego modelu (zakładka Przerób, Bambu Lab P2S). Po polsku, na „ty”.\n'
    + 'Gdy w wiadomości jest AKTUALNY SPEC — jest załadowany: NIE zaczynaj od nowa i NIE proś o wklejenie JSON.\n'
    + 'Drop STL/3MF: siatka jest w pamięci nawet BEZ SPEC. Wtedy wolno [[SKALA]] / [[SKALA_XYZ]] / [[OBRECZ]] / [[RAMIONA]] / [[OTWOR]] / [[WYDLUZ]]. NIE proś o JSON.\n'
    + 'Gdy człowiek mówi powiększ/zmniejsz o X%, napisz krótko potwierdzenie i [[SKALA]] 1.10 (czynnik, nie procent). 90% to [[SKALA]] 0.90. Aplikacja sama przeskaluje żywą siatkę. Orientacja zostaje; brim może się zmienić.\n'
    + 'Gdy XY i Z mają być inne (doniczka Ø15 cm przy wys. 10 cm): [[SKALA_XYZ]] sx sy sz (trzy czynniki). NIE jednolita skala, jeśli zepsuje wysokość albo Ø.\n'
    + 'Gdy mówi większy/zwiększ OBWÓD obręczy o X cm lub X mm — to ΔC, nie skala całego modelu. 5 cm = 50 mm (NIE 5 mm). Napisz [[OBRECZ]] 50 (delta obwodu w mm). Aplikacja zrobi przesunięcie promieniowe wokół osi obręczy (ścianki zostają).\n'
    + 'Gdy dłuższe ramiona bez liczby — [[RAMIONA]] 10 (mm na końcach nawisu). Z liczbą — ta liczba w mm. Możesz dać oba: [[OBRECZ]] 50 i [[RAMIONA]] 10.\n'
    + 'Gdy dłuższe UCHWYTY/ramiona a to NIE obręcz: [[WYDLUZ]] 12 (mm na KAŻDYM końcu najdłuższej osi XY). NIE [[SKALA]].\n'
    + 'NIE wolno [[SKALA]] zamiast [[OBRECZ]], gdy proszą o obwód obręczy. NIE wolno [[SKALA]] przy zmianie lokalnej (ramiona, jeden otwór, dziurka).\n'
    + 'Gdy dziurka na klucz/brelok BEZ SPEC: [[OTWOR]] 5.2 (Ø mm). Aplikacja DODA uszko z otworem — nie powiększa kafelkiem istniejących gniazd (to zjada ściankę).\n'
    + 'Gdy dodaje otwór/kieszeń/żąbro i JEST SPEC — na końcu [[SPEC]] i CAŁY SPEC JSON ze zmianą. Zmień wyłącznie to, o co proszono.\n'
    + 'Zdjęcie: pytaj KTÓRE mm zmierzyć suwmiarką. Nie podawaj Ø z fotki bez słowa „szacunek, nie pomiar”. Nie udawaj, że widzisz drzwi, gdy dostałeś tylko opis z Flash.\n'
    + 'Jeden zestaw znaczników na końcu: [[SKALA]] czynnik  ALBO [[SKALA_XYZ]] sx sy sz  ALBO [[OBRECZ]] ΔC_mm (opcjonalnie [[RAMIONA]] mm)  ALBO [[WYDLUZ]] mm  ALBO [[OTWOR]] Ø  ALBO [[SPEC]]  ALBO [[CZEKAM]].';
  async function prAgent(text, imgs) {
    var photos = imgs || [];
    var talkId = prModelTalk();
    var user = text + (SPEC ? ('\n\nAKTUALNY SPEC (nie zgaduj od zera):\n' + JSON.stringify(SPEC).slice(0, 12000)) : '')
      + (CHECK ? ('\n\nOstatnia checklista:\n' + CHECK.slice(0, 1500)) : '');
    var czyta = window.P2S && window.P2S.modelCzytaObraz && window.P2S.modelCzytaObraz(talkId);
    if (photos.length && !czyta) {
      prChat('ai', (window.P2S && window.P2S.HINT_BEZ_WIZJI) || 'To zdjęcie opisze model z obrazem (Flash), potem Projekt/Przerób.');
      try {
        var opisFn = window.P2S && window.P2S.pjOpisZdjeciaFlash;
        var opis = opisFn ? await opisFn(photos, prOrCall) : '';
        if (!opis && window.P2S && window.P2S.mockOpisZdjecia) {
          var mk = window.P2S.mockOpisZdjecia(photos[0]);
          opis = mk && mk.opis;
        }
        if (opis) user = 'Opis zdjęcia (Flash, szacunek kształtu, NIE mm):\n' + opis + '\n\n' + user;
      } catch (ve) {
        prChat('ai', 'Nie odczytałem zdjęcia. Opisz słowami i podaj mm.');
      }
      photos = [];
    }
    var content = user;
    if (photos.length && window.P2S && window.P2S.trescZZdjeciami) {
      content = window.P2S.trescZZdjeciami(user, photos);
    }
    var talk = await prOrCall({
      model: talkId,
      messages: [
        { role: 'system', content: SYS_PRZEROB },
        { role: 'user', content: content }
      ]
    });
    prChat('ai', String(talk).replace(/\s*\[\[(SKALA_XYZ|SKALA|SPEC|CZEKAM|OBRECZ|RAMIONA|OTWOR|WYDLUZ)\]\][^\n]*/gi, '\n').trim());
    var xyz = String(talk).match(/\[\[\s*SKALA_XYZ\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)/i);
    if (xyz) {
      await skalaZywa([
        parseFloat(xyz[1].replace(',', '.')),
        parseFloat(xyz[2].replace(',', '.')),
        parseFloat(xyz[3].replace(',', '.'))
      ]);
      return;
    }
    var ot = String(talk).match(/\[\[\s*OTWOR\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (ot) {
      await dziurkaZywa({ srednica_mm: parseFloat(ot[1].replace(',', '.')) });
      return;
    }
    var wy = String(talk).match(/\[\[\s*WYDLUZ\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (wy) {
      await wydluzZywa(parseFloat(wy[1].replace(',', '.')));
      return;
    }
    var ob = String(talk).match(/\[\[\s*OBRECZ\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)/i);
    var ram = String(talk).match(/\[\[\s*RAMIONA\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (ob || ram) {
      await obreczZywa({
        deltaC_mm: ob ? parseFloat(ob[1].replace(',', '.')) : 0,
        extraRamie_mm: ram ? parseFloat(ram[1].replace(',', '.')) : 0
      });
      return;
    }
    var sk = String(talk).match(/\[\[\s*SKALA\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (sk) {
      await skalaZywa(parseFloat(sk[1].replace(',', '.')));
      return;
    }
    if (/\[\[\s*SPEC\s*\]\]/i.test(talk) && SPEC) {
      var spec = parseSpecTxt(talk);
      if (typeof window.P2S.initEngine === 'function') await window.P2S.initEngine();
      var r = window.P2S.buildAndGate(spec);
      if (r && r.mesh && typeof window.P2S.mesh3MF === 'function') {
        var buf = await window.P2S.mesh3MF(r.mesh, { nazwa: spec.nazwa || NAZWA, spec: spec });
        await wczytaj(asFile(buf, (spec.nazwa || NAZWA || 'projekt') + '_przerob.3mf'));
        SPEC = r.spec || spec;
        odswiezCheckliste(SPEC, r.werdykt);
        WYNIK = BIEZ;
        if ($('prPobierz')) $('prPobierz').disabled = false;
        prChat('ai', 'Wgrałem zmianę w SPEC na żywym modelu — nie zaczynałem od nowa.');
      }
    } else if (/\[\[\s*SPEC\s*\]\]/i.test(talk) && !SPEC) {
      prChat('ai', 'Ten plik z dysku nie ma SPEC. Skala %, obręcz/ramiona, [[WYDLUZ]], dziurka [[OTWOR]] albo kafelek Ø. Nie wklejaj JSON.');
    }
  }
  async function prWyslij() {
    var raw = (($('prIn') && $('prIn').value) || '').trim();
    var pole = $('prSkala') && $('prSkala').value;
    var parse = window.P2S && window.P2S.parseScalePercent;
    var factor = parse ? parse(raw, pole) : null;
    var imgs = prPendingImgs.slice();
    if (!raw && !imgs.length && !(factor && factor !== 1) && !(pole && String(pole).trim())) return;
    if ($('prIn')) $('prIn').value = '';
    prPendingImgs = [];
    prThumbs();
    if ($('prVisionHint')) $('prVisionHint').hidden = true;
    if (raw || imgs.length) prChat('me', (raw || 'zdjęcie') + (imgs.length ? ' [zdjęcie]' : ''));
    var otw = window.P2S && window.P2S.parseOtworBrelok ? window.P2S.parseOtworBrelok(raw) : null;
    if (otw) {
      await dziurkaZywa(otw);
      return;
    }
    var xyz = window.P2S && window.P2S.parseSkalaXyz ? window.P2S.parseSkalaXyz(raw) : null;
    if (xyz) {
      await skalaZywa(xyz);
      if ($('prSkala')) $('prSkala').value = '';
      return;
    }
    if (factor && factor !== 1) {
      await skalaZywa(factor);
      if ($('prSkala')) $('prSkala').value = '';
      return;
    }
    var obwod = window.P2S && window.P2S.parseObwodRamiona
      ? window.P2S.parseObwodRamiona(raw) : null;
    if (obwod && (obwod.hoop || obwod.arms)) {
      await obreczZywa({
        deltaC_mm: obwod.deltaC_mm || 0,
        extraRamie_mm: obwod.extraRamie_mm || 0
      });
      return;
    }
    var wyd = window.P2S && window.P2S.parseWydluz ? window.P2S.parseWydluz(raw) : null;
    if (wyd) {
      await wydluzZywa(wyd.extra_mm);
      return;
    }
    if (!prKey()) {
      prChat('ai', 'Bez klucza: skala %, obwód obręczy / ramiona, wydłuż uchwyty, dziurka na klucz, albo kafelek Ø. Drop nie wymaga wklejania SPEC.');
      return;
    }
    try {
      await prAgent(raw || 'jak na zdjęciu', imgs);
    } catch (e) {
      prChat('ai', e && e.message ? e.message : String(e));
    }
  }
  async function wczytajNitkeDoPrzerobu(id) {
    var w = window.P2S && window.P2S.wczytajNitke;
    var pack = w ? w(id) : null;
    if (!pack) {
      prChat('ai', 'Brak nitki z Projektu. Złóż 3MF i kliknij „Przerób to”, albo upuść plik.');
      return;
    }
    pokazNitke(pack);
    if (pack.blob) {
      await wczytaj(asFile(pack.blob, (pack.nazwa || 'projekt') + '.3mf'));
    }
  }
  function bind() {
    var dz = $('prDrop');
    var pl = $('prPlik');
    if (!dz || !pl) return;
    dz.addEventListener('click', function () { pl.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('nad'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('nad'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('nad');
      if (e.dataTransfer.files[0]) wczytaj(e.dataTransfer.files[0]);
    });
    pl.addEventListener('change', function (e) {
      if (e.target.files[0]) wczytaj(e.target.files[0]);
    });
    if ($('prZrob')) $('prZrob').addEventListener('click', przelicz);
    if ($('prPobierz')) $('prPobierz').addEventListener('click', pobierz);
    if ($('prWyslij')) $('prWyslij').addEventListener('click', prWyslij);
    var prIn = $('prIn');
    if (prIn) prIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); prWyslij(); }
    });
    var prFoto = $('prFoto');
    var prFotoIn = $('prFotoIn');
    if (prFoto && prFotoIn) {
      prFoto.addEventListener('click', function () { prFotoIn.click(); });
      prFotoIn.addEventListener('change', function () {
        var f = prFotoIn.files && prFotoIn.files[0];
        if (!f) return;
        var kompr = window.P2S && window.P2S.kompresujZdjecie;
        Promise.resolve(kompr ? kompr(f) : null).then(function (url) {
          if (url) {
            prPendingImgs.push(url);
            while (prPendingImgs.length > 3) prPendingImgs.shift();
            prThumbs();
            prHintWizji();
          }
        });
        prFotoIn.value = '';
      });
    }
    var prTh = $('prThumbs');
    if (prTh) prTh.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (!b) return;
      prPendingImgs.splice(+b.getAttribute('data-i'), 1);
      prThumbs();
      prHintWizji();
    });
    window.__p2sPrzerobWczytajNitke = wczytajNitkeDoPrzerobu;
    ['prNowa', 'prTryb', 'prPas', 'prMat'].forEach(function (id) {
      var n = $(id);
      if (!n) return;
      n.addEventListener('input', przeliczLuz);
      n.addEventListener('change', przeliczLuz);
    });
    var tabs = document.getElementById('tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('.tab');
        if (b && b.dataset.v === 'przerobka') {
          setTimeout(odswiezPodglad, 50);
          if (!BIEZ && window.P2S && typeof window.P2S.wczytajNitke === 'function') {
            var pack = window.P2S.wczytajNitke();
            if (pack && pack.spec) wczytajNitkeDoPrzerobu(pack.id);
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.__P2S_PRZEROBKA_UI = true;
})();
