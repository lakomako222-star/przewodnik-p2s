/**
 * C1 desktop PWA — File System Access + instalacja.
 * Na appassets / bez API: no-op; pobierzPlik spada na <a download>.
 */
(function (global) {
  'use strict';

  var P2S = global.P2S = global.P2S || {};
  var IDB_NAME = 'p2s-desktop';
  var IDB_STORE = 'kv';
  var IDB_KEY = 'folder';
  var handle = null;
  var deferredPrompt = null;
  var lastErr = '';

  function jestAppassets() {
    try {
      return !!(global.location && global.location.hostname === 'appassets.androidplatform.net');
    } catch (e) {
      return false;
    }
  }

  function maPicker() {
    return typeof global.showDirectoryPicker === 'function';
  }

  function mimeZNazwy(nazwa) {
    var n = String(nazwa || '').toLowerCase();
    if (n.endsWith('.3mf')) return 'model/3mf';
    if (n.endsWith('.txt')) return 'text/plain;charset=utf-8';
    if (n.endsWith('.json')) return 'application/json';
    return 'application/octet-stream';
  }

  function jestStandalone() {
    try {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return false;
  }

  function idb() {
    return new Promise(function (resolve) {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      var req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  function zapiszHandle(h) {
    return idb().then(function (db) {
      if (!db || !h) return;
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(h, IDB_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    });
  }

  function wczytajHandle() {
    return idb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    });
  }

  function sprawdzUprawnienie(h) {
    if (!h || typeof h.queryPermission !== 'function') {
      return Promise.resolve(!!h);
    }
    return Promise.resolve(h.queryPermission({ mode: 'readwrite' })).then(function (st) {
      if (st === 'granted') return true;
      if (st === 'denied') return false;
      if (typeof h.requestPermission === 'function') {
        return Promise.resolve(h.requestPermission({ mode: 'readwrite' })).then(function (st2) {
          return st2 === 'granted';
        });
      }
      return false;
    }).catch(function () { return false; });
  }

  function wybierzFolder() {
    if (!maPicker() || jestAppassets()) return Promise.resolve(null);
    return Promise.resolve(global.showDirectoryPicker({ id: 'p2s-export', mode: 'readwrite' })).then(function (h) {
      handle = h;
      return zapiszHandle(h).then(function () { return h; });
    });
  }

  function folder() {
    if (handle) {
      return sprawdzUprawnienie(handle).then(function (ok) { return ok ? handle : null; });
    }
    return wczytajHandle().then(function (h) {
      if (!h) return null;
      return sprawdzUprawnienie(h).then(function (ok) {
        if (ok) {
          handle = h;
          return h;
        }
        return null;
      });
    });
  }

  function pobierzDoFolderu(blob, nazwa) {
    lastErr = '';
    if (!blob || jestAppassets() || !maPicker()) return Promise.resolve(false);
    function pisz(h) {
      if (!h) return Promise.resolve(false);
      var n = String(nazwa || 'pobrany.bin');
      return h.getFileHandle(n, { create: true }).then(function (fh) {
        return fh.createWritable();
      }).then(function (w) {
        return w.write(blob).then(function () { return w.close(); });
      }).then(function () { return true; });
    }
    return folder().then(function (h) {
      if (h) return pisz(h);
      return wybierzFolder().then(function (h2) { return pisz(h2); });
    }).catch(function (e) {
      lastErr = (e && e.name) ? String(e.name) : String(e || 'err');
      return false;
    });
  }

  function ustawStat(txt) {
    var st = global.document && global.document.getElementById('deskFolderStat');
    if (st) st.textContent = txt;
  }

  function podlaczInstall(btn) {
    if (!btn) return;
    if (jestAppassets() || jestStandalone()) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var hint = global.document && global.document.getElementById('deskInstallHint');
      if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
        deferredPrompt.prompt();
        Promise.resolve(deferredPrompt.userChoice).then(function () {
          deferredPrompt = null;
          btn.hidden = true;
        }).catch(function () {});
        return;
      }
      if (hint) hint.hidden = false;
    });
    if (global.addEventListener) {
      global.addEventListener('beforeinstallprompt', function (e) {
        try { e.preventDefault(); } catch (err) {}
        deferredPrompt = e;
        btn.hidden = false;
      });
      global.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        btn.hidden = true;
      });
    }
  }

  function inicjujDesktop() {
    if (jestAppassets()) {
      var box = global.document && global.document.getElementById('deskBox');
      if (box) box.hidden = true;
      return;
    }
    podlaczInstall(global.document && global.document.getElementById('deskInstallBtn'));
    var wyb = global.document && global.document.getElementById('deskFolderBtn');
    if (wyb) {
      wyb.hidden = !maPicker();
      wyb.addEventListener('click', function () {
        wybierzFolder().then(function (h) {
          ustawStat(h
            ? ('Folder zapisu: ' + (h.name || 'wybrany') + ' (ten sam przy kolejnych eksportach).')
            : 'Nie wybrano folderu.');
        }).catch(function (e) {
          lastErr = (e && e.name) ? String(e.name) : 'err';
          ustawStat(lastErr === 'AbortError' ? 'Anulowano.' : 'Nie udało się wybrać folderu.');
        });
      });
    }
    folder().then(function (h) {
      if (h) ustawStat('Folder zapisu: ' + (h.name || 'zapamiętany') + '.');
    }).catch(function () {});
  }

  P2S.pobierzDoFolderu = pobierzDoFolderu;
  P2S.inicjujDesktop = inicjujDesktop;
  P2S._desktop = {
    maPicker: maPicker,
    jestAppassets: jestAppassets,
    mimeZNazwy: mimeZNazwy,
    lastErr: function () { return lastErr; },
    setHandle: function (h) { handle = h; },
    getHandle: function () { return handle; },
    setPrompt: function (p) { deferredPrompt = p; }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inicjujDesktop);
    } else {
      inicjujDesktop();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
