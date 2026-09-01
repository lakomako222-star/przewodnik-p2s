/**
 * T-39 — karty szpul KALIBROWANE. Flow z liścia profilu, nie zgadywany.
 * Presetów KALIBROWANE w Studio nie nadpisujemy. Offline. Zero sieci.
 */
(function (global) {
  'use strict';

  var ID = 'T-39';
  var SZPULE = [
    {
      id: 'pla_plus',
      slot: 'A2',
      nazwa_studio: 'KALIBROWANE SUNLU PLA+ CUSTOM @BBL P2S',
      nazwa_karty: 'KALIBROWANE SUNLU PLA+ CUSTOM Frostbite',
      material: 'PLA+',
      flow: '0.8645',
      k: '0.020',
      dysza_mm: '0.4',
      dysze_profilu: ['0.4', '0.6', '0.8'],
      stol_frostbite_C: [40, 40],
      stol_profil_hot_plate_C: 65,
      plyta: 'Frostbite',
      plyta_nie: 'czapa',
      nozzle_C_lisc: null,
      dowod_flow: 'ODCZYTANE'
    },
    {
      id: 'classic',
      slot: 'A3',
      nazwa_studio: 'KALIBROWANE SUNLU PLA Classic Słoneczny @BBL P2S',
      nazwa_karty: 'KALIBROWANE SUNLU PLA Classic Słoneczny Frostbite',
      material: 'PLA Classic',
      flow: '0.99813',
      k: '0.022',
      dysza_mm: '0.4',
      dysze_profilu: ['0.4', '0.6', '0.8'],
      stol_frostbite_C: [40, 40],
      stol_profil_hot_plate_C: 55,
      plyta: 'Frostbite',
      plyta_nie: 'czapa',
      nozzle_C_lisc: [220, 210],
      dowod_flow: 'ODCZYTANE'
    },
    {
      id: 'petg',
      slot: 'A4',
      nazwa_studio: 'KALIBROWANE SUNLU PETG @BBL P2S',
      nazwa_karty: 'KALIBROWANE SUNLU PETG Frostbite',
      material: 'PETG',
      flow: '0.967575',
      k: '0.035',
      dysza_mm: '0.4',
      dysze_profilu: ['0.4', '0.6', '0.8'],
      stol_frostbite_C: [60, 60],
      stol_profil_hot_plate_C: null,
      plyta: 'Frostbite',
      plyta_nie: 'czapa',
      nozzle_C_lisc: null,
      dowod_flow: 'ODCZYTANE'
    }
  ];
  var NADPIS_STUDIO = false;

  function wczytajPaczke(p) {
    if (!p || p.id !== ID) return false;
    if (Array.isArray(p.szpule) && p.szpule.length) SZPULE = p.szpule.slice();
    if (p.nadpis_studio === true) return false;
    NADPIS_STUDIO = false;
    return true;
  }

  function szpula(id) {
    var i;
    for (i = 0; i < SZPULE.length; i++) {
      if (SZPULE[i].id === id) return SZPULE[i];
    }
    return null;
  }

  function flowSzpuli(id) {
    var s = szpula(id);
    return s ? String(s.flow) : null;
  }

  function etykietaC(v) {
    if (v == null || v === '') return null;
    if (Array.isArray(v)) return v.join('/') + '°C';
    return String(v) + '°C';
  }

  function kartaHtml(s) {
    var nozzle = s.nozzle_C_lisc == null
      ? '<li>Dysza w liściu profilu: brak — nie zgaduję. Dzienna 0,4 mm (profil dopuszcza '
        + (s.dysze_profilu || []).join('/') + ' mm).</li>'
      : '<li>Dysza z liścia: ' + etykietaC(s.nozzle_C_lisc) + ' <span class="dowod">[ODCZYTANE]</span>. Dzienna '
        + s.dysza_mm + ' mm.</li>';
    var hot = s.stol_profil_hot_plate_C == null
      ? '<li>hot_plate w profilu: brak w liściu — nie zgaduję.</li>'
      : '<li>hot_plate w profilu: ' + s.stol_profil_hot_plate_C
        + '°C <span class="dowod">[ODCZYTANE · pułapka vs Frostbite]</span></li>';
    return '<article class="szpula-karta" data-szpula="' + s.id + '">'
      + '<h4>' + s.nazwa_karty + '</h4>'
      + '<p class="szpula-slot">Slot ' + s.slot + ' · ' + s.material + ' · płyta ' + s.plyta
      + ', nie ' + s.plyta_nie + '</p>'
      + '<ul>'
      + '<li>Flow ' + String(s.flow).replace('.', ',') + ' <span class="dowod">[' + s.dowod_flow + ' · liść profilu]</span></li>'
      + '<li>K ' + s.k + ' <span class="dowod">[ODCZYTANE]</span></li>'
      + '<li>Stół Frostbite ' + etykietaC(s.stol_frostbite_C) + ' <span class="dowod">[przewodnik 7.3]</span></li>'
      + hot
      + nozzle
      + '</ul>'
      + '<p class="szpula-uwaga">To karta w apce. Presetu KALIBROWANE w Studio nie nadpisujemy.</p>'
      + '</article>';
  }

  function listaHtml() {
    return '<p class="t0-hint">Dane z profili KALIBROWANE. Flow nie jest zgadywany. Offline.</p>'
      + SZPULE.map(kartaHtml).join('');
  }

  function mount() {
    if (typeof document === 'undefined') return;
    var box = document.getElementById('tSzpuleLista');
    if (!box || box.getAttribute('data-szpule-filled') === '1') return;
    box.setAttribute('data-szpule-filled', '1');
    box.innerHTML = listaHtml();
  }

  var api = {
    ID: ID,
    wczytajPaczke: wczytajPaczke,
    szpule: function () { return SZPULE.slice(); },
    szpula: szpula,
    flowSzpuli: flowSzpuli,
    nadpisStudio: function () { return NADPIS_STUDIO; },
    mount: mount
  };
  global.P2S_szpule = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
