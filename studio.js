/**
 * Powłoka studio 4.2.33 — VisualViewport, czytnik, przestrzenie.
 * Nie rusza silnika intencji, detektora, eksportu. ID zostają.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var body = document.body;
  var startH = window.innerHeight;
  var currentView = 'guide';
  var dockedEl = null;

  function isField(el) {
    if (!el || !el.tagName) return false;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
    var t = el.type;
    return t !== 'checkbox' && t !== 'file' && t !== 'button' && t !== 'radio' && t !== 'hidden';
  }

  function readSat() {
    var sat = 0;
    try {
      var p = document.createElement('div');
      p.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)';
      body.appendChild(p);
      sat = parseFloat(window.getComputedStyle(p).paddingTop) || 0;
      body.removeChild(p);
    } catch (e) {}
    root.style.setProperty('--sat', sat + 'px');
    return sat;
  }

  function syncHead() {
    if (body.classList.contains('kb-open') || body.classList.contains('studio-home')) return;
    var header = document.querySelector('header');
    if (!header) return;
    var ht = Math.round(header.getBoundingClientRect().height);
    if (ht > 40) root.style.setProperty('--head-stack', ht + 'px');
  }

  function undock() {
    if (!dockedEl) return;
    dockedEl.classList.remove('ime-dock');
    dockedEl.style.bottom = '';
    dockedEl.style.left = '';
    dockedEl.style.right = '';
    dockedEl.style.width = '';
    dockedEl.style.position = '';
    dockedEl.style.zIndex = '';
    dockedEl = null;
  }

  function composeFor(el) {
    if (!el) return null;
    if (el.id === 'q') return document.querySelector('header');
    if (el.id === 'intentIn' || el.id === 'intentIdz') return $('intentBar');
    if (el.id === 'aiIn' || el.id === 'aiPhoto' || el.id === 'aiSend') return $('composer');
    if (el.id === 'pjIn' || el.id === 'pjPytanieIn' || el.id === 'pjZrob' || el.id === 'pjFoto' || el.id === 'pjPytanieOk') {
      return $('pjComposeDock') || el.closest('.pj-compose');
    }
    if (el.id === 'prIn' || el.id === 'prSkala' || el.id === 'prWyslij' || el.id === 'prFoto') return $('prNitka');
    if (el.closest && el.closest('#composer')) return $('composer');
    if (el.closest && el.closest('#pjComposeDock')) return $('pjComposeDock');
    if (el.closest && el.closest('#prNitka')) return $('prNitka');
    return null;
  }

  function dockIme(el, inset) {
    if (!el) return;
    if (dockedEl && dockedEl !== el) undock();
    dockedEl = el;
    el.classList.add('ime-dock');
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.right = '0';
    el.style.width = 'auto';
    el.style.bottom = inset + 'px';
    el.style.zIndex = '55';
  }

  function kbOpen() {
    var vv = window.visualViewport;
    var focused = document.activeElement;
    var field = isField(focused);
    var inset = 0;
    if (vv) {
      inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--vv-h', vv.height + 'px');
      root.style.setProperty('--vv-off', vv.offsetTop + 'px');
    } else {
      root.style.setProperty('--vv-h', window.innerHeight + 'px');
      root.style.setProperty('--vv-off', '0px');
    }
    if (inset < 48) {
      var shrunk = vv && vv.height < startH * 0.78;
      if (shrunk) inset = Math.max(inset, startH - vv.height);
      else if (!vv && window.innerHeight < startH * 0.78) {
        inset = Math.max(inset, startH - window.innerHeight);
      }
    }
    root.style.setProperty('--kb-inset', inset + 'px');
    var open = inset > 80 || (field && ((vv && vv.height < startH * 0.82) || window.innerHeight < startH * 0.82));
    body.classList.toggle('kb-open', !!open);
    body.classList.toggle('kb-q', !!(open && focused && focused.id === 'q'));
    if (!open) {
      undock();
      startH = Math.max(startH, window.innerHeight);
      syncHead();
      return inset;
    }
    var dock = field ? composeFor(focused) : null;
    if (dock && dock.tagName !== 'HEADER') dockIme(dock, inset);
    else if (!(focused && focused.id === 'q')) undock();
    return inset;
  }

  function bindViewport() {
    var fire = function () { kbOpen(); };
    window.addEventListener('resize', function () {
      if (!body.classList.contains('kb-open')) startH = window.innerHeight;
      fire();
      syncHead();
    });
    window.addEventListener('orientationchange', function () {
      startH = window.innerHeight;
      fire();
      syncHead();
    });
    document.addEventListener('focusin', fire);
    document.addEventListener('focusout', function () { setTimeout(fire, 80); });
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', fire);
      vv.addEventListener('scroll', fire);
    }
    readSat();
    fire();
    syncHead();
  }

  /* ---------- Centrum ---------- */
  function openHome() {
    var home = $('studioHome');
    if (!home) return;
    home.hidden = false;
    body.classList.add('studio-home');
    body.setAttribute('data-view', 'home');
    document.querySelectorAll('#tabs .tab').forEach(function (b) {
      b.classList.remove('on');
      b.removeAttribute('aria-current');
    });
    var pin = $('intentIn');
    if (pin) setTimeout(function () { try { pin.focus(); } catch (e) {} }, 80);
  }

  function closeHome() {
    var home = $('studioHome');
    if (home) home.hidden = true;
    body.classList.remove('studio-home');
  }

  function moveIntentToHome() {
    var home = $('studioHome');
    var bar = $('intentBar');
    var karta = $('intentKarta');
    var pole = home && home.querySelector('.studio-home-pole');
    var slot = home && home.querySelector('.studio-home-karta');
    if (pole && bar) pole.appendChild(bar);
    if (slot && karta) slot.appendChild(karta);
  }

  /* ---------- Czytnik ---------- */
  var chapters = [];
  var chIdx = 0;

  function collectChapters() {
    chapters = Array.prototype.slice.call(document.querySelectorAll('main > section.ch'));
  }

  function fillMapa() {
    var mapa = $('czytnikMapa');
    if (!mapa) return;
    mapa.innerHTML = '';
    chapters.forEach(function (sec, i) {
      var h = sec.querySelector('h1');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-ch', String(i));
      b.textContent = (h && h.textContent) || ('Rozdział ' + (i + 1));
      if (i === chIdx) b.className = 'on';
      mapa.appendChild(b);
    });
  }

  function showChapter(i, anchorId) {
    if (!chapters.length) collectChapters();
    if (!chapters.length) return;
    i = Math.max(0, Math.min(chapters.length - 1, i | 0));
    chIdx = i;
    root.classList.add('czytnik-on');
    chapters.forEach(function (sec, n) {
      sec.classList.toggle('is-open', n === i);
    });
    var tyt = $('czytnikTytul');
    var h = chapters[i] && chapters[i].querySelector('h1');
    if (tyt) tyt.textContent = (h && h.textContent) || '';
    fillMapa();
    var prev = $('czytnikPrev');
    var next = $('czytnikNext');
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i >= chapters.length - 1;
    if (anchorId) {
      var el = document.getElementById(anchorId);
      if (el) setTimeout(function () {
        el.scrollIntoView({ block: 'start' });
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
      }, 40);
    } else {
      window.scrollTo(0, 0);
    }
  }

  function chapterIndexForId(id) {
    if (!id) return -1;
    var el = document.getElementById(id);
    if (!el) return -1;
    var sec = el.classList.contains('ch') ? el : el.closest('section.ch');
    if (!sec) return -1;
    return chapters.indexOf(sec);
  }

  function openChapterById(id) {
    if (!chapters.length) collectChapters();
    var i = chapterIndexForId(id);
    if (i < 0) return false;
    showChapter(i, id);
    return true;
  }

  window.__p2sOpenChapter = openChapterById;

  function bindCzytnik() {
    collectChapters();
    var mapa = $('czytnikMapa');
    var liste = $('czytnikListe');
    if (liste && mapa) {
      liste.addEventListener('click', function () {
        var otw = mapa.hasAttribute('hidden');
        if (otw) mapa.removeAttribute('hidden');
        else mapa.setAttribute('hidden', '');
        liste.setAttribute('aria-expanded', otw ? 'true' : 'false');
      });
      mapa.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ch]');
        if (!b) return;
        showChapter(parseInt(b.getAttribute('data-ch'), 10));
        if (window.matchMedia('(max-width:959px)').matches) {
          mapa.setAttribute('hidden', '');
          liste.setAttribute('aria-expanded', 'false');
        }
      });
    }
    var prev = $('czytnikPrev');
    var next = $('czytnikNext');
    if (prev) prev.addEventListener('click', function () { showChapter(chIdx - 1); });
    if (next) next.addEventListener('click', function () { showChapter(chIdx + 1); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      if (!id || id.indexOf('r-') !== 0) return;
      openChapterById(id);
    }, true);
    window.addEventListener('hashchange', function () {
      var id = (location.hash || '').replace(/^#/, '');
      if (id) openChapterById(id);
    });
  }

  /* ---------- Projekt przestrzenie + jeden rzut ---------- */
  var PJ_SELF_HIDDEN = {
    pjPytanieWrap: 1, pjOffline: 1, pjEngineMsg: 1, pjFileOrigin: 1,
    pjResearch: 1, pjThumbs: 1, pjVisionHint: 1, pjModele: 1
  };
  function setPjEtap(nazwa) {
    document.querySelectorAll('#pjPrzestrzenie [data-pj-etap]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-pj-etap') === nazwa);
    });
    document.querySelectorAll('#view-projekt [data-pj-panel]').forEach(function (p) {
      var mine = p.getAttribute('data-pj-panel') === nazwa;
      if (!mine) { p.hidden = true; return; }
      if (PJ_SELF_HIDDEN[p.id]) return;
      p.hidden = false;
    });
  }

  function wrapPjPanels() {
    var view = $('view-projekt');
    if (!view || view.getAttribute('data-studio-pj') === '1') return;
    view.setAttribute('data-studio-pj', '1');
    var groups = {
      brief: ['pjWyt', 'pjNInfo', 'pjComposeDock', 'pjSpecWrap', 'pjThumbs', 'pjVisionHint', 'pjResearch', 'pjPytanieWrap', 'pjEngineMsg', 'pjFileOrigin', 'pjOffline'],
      warianty: ['pjChatWrap'],
      model: ['pjLayoutWrap'],
      weryfikacja: ['pjWarn', 'pjDrukLista', 'pjDiff', 'pjAkcje', 'pjStudioHint'],
      ekspert: ['pjOpusLinia', 'pjEkspertHint', 'pjModele', 'pjEkspertExtra']
    };
    var chat = $('pjChat');
    if (chat && !$('pjChatWrap')) {
      var w = document.createElement('div');
      w.id = 'pjChatWrap';
      var h = chat.previousElementSibling;
      chat.parentNode.insertBefore(w, h && h.tagName === 'H3' ? h : chat);
      if (h && h.tagName === 'H3') w.appendChild(h);
      w.appendChild(chat);
    }
    var compose = view.querySelector('.pj-compose');
    if (compose && !compose.id) {
      compose.id = 'pjComposeDock';
    }
    var layout = view.querySelector('.pj-layout');
    if (layout && !layout.id) layout.id = 'pjLayoutWrap';
    var btnrow = view.querySelector('.btnrow');
    if (btnrow && btnrow.querySelector('#pjDl3mf') && !btnrow.id) btnrow.id = 'pjAkcje';
    var foot = view.querySelector('.pj-footlic');
    if (foot || $('pjHist')) {
      var extra = $('pjEkspertExtra');
      if (!extra) {
        extra = document.createElement('div');
        extra.id = 'pjEkspertExtra';
        extra.setAttribute('data-pj-panel', 'ekspert');
        view.appendChild(extra);
      }
      if ($('pjHist')) extra.appendChild($('pjHist'));
      var mimoIn = $('pjMimo');
      var mimo = mimoIn && mimoIn.closest('label');
      if (mimo) extra.appendChild(mimo);
      if (foot) extra.appendChild(foot);
    }
    Object.keys(groups).forEach(function (key) {
      groups[key].forEach(function (id) {
        var el = $(id);
        if (!el) return;
        el.setAttribute('data-pj-panel', key);
      });
    });
    setPjEtap('brief');
    var nav = $('pjPrzestrzenie');
    if (nav) nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pj-etap]');
      if (b) setPjEtap(b.getAttribute('data-pj-etap'));
    });
    var zrob = $('pjZrob');
    if (zrob) zrob.addEventListener('click', function () { setPjEtap('brief'); });
    var bb = $('pjBbox');
    if (bb && window.MutationObserver) {
      new MutationObserver(function () {
        if (bb.textContent && bb.textContent.trim() && body.getAttribute('data-view') === 'projekt') {
          var on = document.querySelector('#pjPrzestrzenie [data-pj-etap].on');
          if (on && on.getAttribute('data-pj-etap') === 'brief') setPjEtap('model');
        }
      }).observe(bb, { childList: true, characterData: true, subtree: true });
    }
    bindHero('#view-projekt .pj-cell', 'is-hero');
  }

  function bindHero(sel, cls) {
    var nodes = document.querySelectorAll(sel);
    if (!nodes.length) return;
    nodes[0].classList.add(cls);
    nodes.forEach(function (n) {
      n.addEventListener('click', function () {
        nodes.forEach(function (x) { x.classList.remove(cls); });
        n.classList.add(cls);
      });
    });
  }

  /* ---------- ReForm ---------- */
  function wrapReform() {
    var view = $('view-przerobka');
    if (!view || view.getAttribute('data-studio-pr') === '1') return;
    view.setAttribute('data-studio-pr', '1');
    var nitka = $('prNitka');
    if (nitka) nitka.classList.add('reform-sheet');
    var cechy = $('prCechy');
    var panel = $('prPanel');
    if (cechy && panel && !$('prOverlayCechy')) {
      var wrap = document.createElement('div');
      wrap.id = 'prOverlayCechy';
      wrap.hidden = true;
      cechy.parentNode.insertBefore(wrap, cechy);
      wrap.appendChild(cechy);
    }
    bindHero('#view-przerobka .pr-cv', 'is-hero');
    if (cechy && window.MutationObserver) {
      new MutationObserver(function () {
        var box = $('prOverlayCechy');
        if (box) box.hidden = !cechy.children.length;
      }).observe(cechy, { childList: true });
    }
  }

  /* ---------- Asystent klucz ---------- */
  function hasAiKey() {
    try { return !!(localStorage.getItem('p2s.ai.key') || '').trim(); } catch (e) { return false; }
  }

  function syncAiGate() {
    var locked = currentView === 'ai' && !hasAiKey();
    body.classList.toggle('ai-locked', locked);
    var gate = $('aiGate');
    if (gate) gate.hidden = !locked;
  }

  function bindAiGate() {
    var btn = $('aiGateOtworz');
    var cog = $('aiCog');
    if (btn && cog) btn.addEventListener('click', function () { cog.click(); });
    ['setSave', 'setWipe'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('click', function () { setTimeout(syncAiGate, 80); });
    });
  }

  function syncAiTryb() {
    var pasek = $('aiTrybPasek');
    var el = $('aiTrybEtykieta');
    if (!el) return;
    var s = null;
    try {
      if (window.P2S && typeof window.P2S.stanBramkiOceny === 'function') {
        s = window.P2S.stanBramkiOceny();
      }
    } catch (e) { s = null; }
    var tryb = (s && s.tryb) || 'chmura';
    var txt;
    if (s && s.odpala_klasyfikator && tryb === 'lokalnie') {
      txt = s.etykieta || 'lokalna pierwsza ocena';
    } else {
      txt = (s && s.etykieta) || 'lokalnie niedostępne — chmura';
    }
    el.textContent = txt;
    if (pasek) pasek.setAttribute('data-tryb', tryb);
  }

  function bindAiTryb() {
    syncAiTryb();
    [400, 1500, 4000].forEach(function (ms) { setTimeout(syncAiTryb, ms); });
    var chk = $('setOcenaLok');
    if (chk && chk.getAttribute('data-tryb-bound') !== '1') {
      chk.setAttribute('data-tryb-bound', '1');
      chk.addEventListener('change', function () { setTimeout(syncAiTryb, 40); });
    }
    var save = $('setSave');
    if (save && save.getAttribute('data-tryb-save') !== '1') {
      save.setAttribute('data-tryb-save', '1');
      save.addEventListener('click', function () { setTimeout(syncAiTryb, 80); });
    }
  }

  /* ---------- Doradca ---------- */
  var advSnaps = [];
  function enhanceAdvisor() {
    var box = $('adv-body');
    if (!box || box.getAttribute('data-studio-adv') === '1') return;
    box.setAttribute('data-studio-adv', '1');
    function chrome() {
      if ($('advWstecz')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'advWstecz';
      b.textContent = 'Wstecz';
      var p = document.createElement('p');
      p.id = 'advPostep';
      box.parentNode.insertBefore(p, box);
      box.parentNode.insertBefore(b, box);
      b.addEventListener('click', function () {
        if (!advSnaps.length) return;
        box.innerHTML = advSnaps.pop();
      });
    }
    chrome();
    box.addEventListener('click', function (e) {
      if (e.target.closest('#advWstecz')) return;
      var b = e.target.closest('button');
      if (!b) return;
      advSnaps.push(box.innerHTML);
    }, true);
    function afterRender() {
      var post = $('advPostep');
      var wst = $('advWstecz');
      var title = box.querySelector('.aq');
      var isMenu = !!box.querySelector('.agrp');
      if (wst) wst.hidden = isMenu;
      if (post) {
        if (isMenu) post.textContent = 'Wybierz jeden objaw.';
        else if (title) post.textContent = title.textContent;
      }
    }
    if (window.MutationObserver) {
      new MutationObserver(afterRender).observe(box, { childList: true });
    }
    afterRender();
  }

  /* ---------- Narzędzia ---------- */
  var TOOL_CATS = [
    { id: 'calc', label: 'Kalkulatory', heads: ['Zmiana filamentu', 'Koszt wydruku', 'Grubość powłoki', 'Skala a materiał', 'Dobierz luz', 'Jeden pomiar', 'Deklaracja', 'Okrąg a liczba'] },
    { id: 'modele', label: 'Modele', heads: ['Szukanie modeli', 'Licencja', 'Karta modelu', 'Kreator briefu'] },
    { id: 'analiza', label: 'Analiza', heads: ['Analiza modelu'] },
    { id: 'uslugi', label: 'Usługi', heads: ['Usługi zewnętrzne', 'Odczyt LAN'] },
    { id: 'warsztat', label: 'Warsztat', heads: ['T-0 start wydruku', 'Kolejność kalibracji', 'Szpule KALIBROWANE', 'Dekoder HMS', 'Katalog wzorców', 'Nauka z wzorców', 'Ocena nauki agenta'] }
  ];

  function bindTools() {
    var view = $('view-tools');
    var koty = $('toolsKoty');
    if (!view || !koty || koty.getAttribute('data-bound') === '1') return;
    koty.setAttribute('data-bound', '1');
    var tools = Array.prototype.slice.call(view.querySelectorAll('.tool'));
    tools.forEach(function (t) {
      var h = t.querySelector('h3');
      var title = (h && h.textContent) || '';
      var cat = 'calc';
      TOOL_CATS.forEach(function (c) {
        c.heads.forEach(function (frag) {
          if (title.indexOf(frag) === 0 || title.indexOf(frag) >= 0) cat = c.id;
        });
      });
      t.setAttribute('data-tool-cat', cat);
    });
    tools.forEach(function (t, i) {
      if (!t.getAttribute('data-tool-i')) t.setAttribute('data-tool-i', t.id || ('t-' + i));
    });
    var lista = $('toolsLista');
    if (!lista) {
      lista = document.createElement('div');
      lista.id = 'toolsLista';
      lista.className = 'studio-etapy';
      koty.insertAdjacentElement('afterend', lista);
    }
    function openTool(el) {
      tools.forEach(function (t) { t.hidden = t !== el; });
      lista.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-tool-i') === el.getAttribute('data-tool-i'));
      });
    }
    function showCat(id) {
      koty.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-tool-cat') === id);
      });
      var mine = tools.filter(function (t) { return t.getAttribute('data-tool-cat') === id; });
      lista.innerHTML = '';
      mine.forEach(function (t, i) {
        if (!t.getAttribute('data-tool-i')) t.setAttribute('data-tool-i', id + '-' + i);
        var h = t.querySelector('h3');
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-tool-i', t.getAttribute('data-tool-i'));
        b.textContent = (h && h.textContent) || ('Narzędzie ' + (i + 1));
        b.addEventListener('click', function () { openTool(t); });
        lista.appendChild(b);
      });
      if (mine[0]) openTool(mine[0]);
      else tools.forEach(function (t) { t.hidden = true; });
    }
    koty.innerHTML = TOOL_CATS.map(function (c, i) {
      return '<button type="button" data-tool-cat="' + c.id + '"' + (i === 0 ? ' class="on"' : '') + '>' + c.label + '</button>';
    }).join('');
    koty.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tool-cat]');
      if (b) showCat(b.getAttribute('data-tool-cat'));
    });
    showCat('calc');
    toolsCtl.showCat = showCat;
    toolsCtl.openTool = openTool;
  }

  var KALIB_KEY = 'p2s.kalib.kolejnosc';
  function bindKalibKolejnosc() {
    var root = $('tKalibKolejnosc');
    if (!root || root.getAttribute('data-kalib-bound') === '1') return;
    root.setAttribute('data-kalib-bound', '1');
    var stan = {};
    try { stan = JSON.parse(localStorage.getItem(KALIB_KEY) || '{}') || {}; }
    catch (e) { stan = {}; }
    root.querySelectorAll('input[data-kalib]').forEach(function (inp) {
      inp.checked = !!stan[inp.getAttribute('data-kalib')];
    });
    root.addEventListener('change', function (e) {
      var inp = e.target.closest('input[data-kalib]');
      if (!inp) return;
      var st = {};
      try { st = JSON.parse(localStorage.getItem(KALIB_KEY) || '{}') || {}; }
      catch (e2) { st = {}; }
      if (inp.checked) st[inp.getAttribute('data-kalib')] = 1;
      else delete st[inp.getAttribute('data-kalib')];
      try { localStorage.setItem(KALIB_KEY, JSON.stringify(st)); } catch (e3) {}
    });
  }

  var toolsCtl = { showCat: function () {}, openTool: function () {} };

  function openToolById(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    closeHome();
    if (window.__p2sShow) window.__p2sShow('tools');
    var cat = el.getAttribute('data-tool-cat') || 'warsztat';
    toolsCtl.showCat(cat);
    toolsCtl.openTool(el);
    return true;
  }

  function bindHomeSkroty() {
    var root = document.getElementById('t0HomeSkroty') || document.getElementById('studioHome');
    if (!root || root.getAttribute('data-home-skroty') === '1') return;
    root.setAttribute('data-home-skroty', '1');
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-home-tool]');
      if (!b) return;
      openToolById(b.getAttribute('data-home-tool'));
    });
  }

  /* ---------- Aktualizuj ---------- */
  function bindSync() {
    var view = $('view-sync');
    var koty = $('syncKoty');
    if (!view || !koty || koty.getAttribute('data-bound') === '1') return;
    koty.setAttribute('data-bound', '1');
    var tools = Array.prototype.slice.call(view.querySelectorAll('.tool'));
    if (tools[0]) tools[0].setAttribute('data-sync-panel', 'sync');
    if (tools[1]) tools[1].setAttribute('data-sync-panel', 'apka');
    var tresc = $('syncTrescBox');
    if (tresc) tresc.setAttribute('data-sync-panel', 'tresc');
    function showP(id) {
      koty.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-sync') === id);
      });
      view.querySelectorAll('[data-sync-panel]').forEach(function (p) {
        p.hidden = p.getAttribute('data-sync-panel') !== id;
      });
    }
    koty.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sync]');
      if (b) showP(b.getAttribute('data-sync'));
    });
    var hint = $('syncTrescHint');
    if (hint) {
      var tresc = '';
      try { tresc = window.__P2S_TRESJ_JSON || ''; } catch (eT) {}
      if (!tresc) {
        try { tresc = (window.__P2S_META && window.__P2S_META.wersja) || ''; } catch (eM) {}
      }
      if (!tresc) tresc = window.P2S_VER_NAME || '?';
      var shell = window.P2S_SHELL_NAME || '';
      try {
        if (window.P2SNative && typeof window.P2SNative.versionName === 'function') {
          var nv = window.P2SNative.versionName();
          if (nv) shell = nv;
        }
      } catch (eN) {}
      if (!shell) shell = '?';
      hint.textContent = 'OTA GitHub 4.0.14 · shell (version.properties) ' + shell + ' · treść (wersja.json) ' + tresc + '.';
    }
    showP('apka');
  }

  /* ---------- afterShow ---------- */
  function afterShow(v) {
    currentView = v || currentView;
    if (v && v !== 'home') closeHome();
    if (v) body.setAttribute('data-view', v);
    if (v === 'guide') {
      if (!root.classList.contains('czytnik-on') || !document.querySelector('main > section.ch.is-open')) {
        var hash = (location.hash || '').replace(/^#/, '');
        if (hash && openChapterById(hash)) { /* ok */ }
        else showChapter(chIdx || 0);
      }
    }
    syncAiGate();
    kbOpen();
    syncHead();
    if (v === 'ai') syncAiTryb();
    if (v === 'projekt') wrapPjPanels();
    if (v === 'przerobka') wrapReform();
  }

  window.__p2sAfterShow = afterShow;

  function wrapShow() {
    var prev = window.__p2sShow;
    if (typeof prev === 'function' && !prev.__studio) {
      var wrapped = function (v) {
        prev(v);
        afterShow(v);
      };
      wrapped.__studio = true;
      window.__p2sShow = wrapped;
    }
    var tabs = $('tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('.tab');
        if (b) setTimeout(function () { afterShow(b.getAttribute('data-v')); }, 0);
      });
    }
    var go = window.__goGuide;
    if (typeof go === 'function' && !go.__studio) {
      window.__goGuide = function (anchor) {
        go(anchor);
        openChapterById(anchor);
      };
      window.__goGuide.__studio = true;
    }
  }

  function bindHomeBtn() {
    var btn = $('studioHomeBtn');
    if (btn) btn.addEventListener('click', function () { openHome(); });
  }

  function start() {
    root.classList.add('studio');
    bindViewport();
    moveIntentToHome();
    bindCzytnik();
    wrapPjPanels();
    wrapReform();
    bindAiGate();
    bindAiTryb();
    enhanceAdvisor();
    bindTools();
    bindKalibKolejnosc();
    if (window.P2S_t0 && typeof window.P2S_t0.mount === 'function') window.P2S_t0.mount();
    if (window.P2S_szpule && typeof window.P2S_szpule.mount === 'function') window.P2S_szpule.mount();
    if (window.P2S_hms && typeof window.P2S_hms.mount === 'function') window.P2S_hms.mount();
    bindHomeSkroty();
    bindSync();
    wrapShow();
    bindHomeBtn();
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash && hash.indexOf('r-') === 0) {
      closeHome();
      if (window.__p2sShow) window.__p2sShow('guide');
      openChapterById(hash);
    } else {
      openHome();
    }
    syncAiGate();
    syncAiTryb();
    readSat();
    syncHead();
    window.__p2sStudio = {
      openHome: openHome,
      showChapter: showChapter,
      openChapterById: openChapterById,
      openToolById: openToolById,
      kb: kbOpen
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
