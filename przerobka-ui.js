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
    if (!WYNIK || !window.P2S || typeof window.P2S.mesh3MF !== 'function') return;
    var mesh = meshZBryly(WYNIK);
    var bytes = await window.P2S.mesh3MF(mesh, { nazwa: NAZWA + '_zmieniony' });
    var blob = new Blob([bytes], { type: 'model/3mf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = NAZWA + '_zmieniony.3mf';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
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
        if (b && b.dataset.v === 'przerobka') setTimeout(odswiezPodglad, 50);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.__P2S_PRZEROBKA_UI = true;
})();
