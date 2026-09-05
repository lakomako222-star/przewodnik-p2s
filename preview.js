/**
 * Podgląd 2D — cztery rzuty, malarz, bez three.js.
 * strokeStyle MUSI być identyczny z fillStyle, inaczej widać przekątne triangulacji.
 * Obrót 360: przycisk „obrót” kręci azymut izo; przeciągnięcie palcem/myszą na pjIzo/prCv0 kręci az+el.
 */
export const WIDOKI = {
  izo: { az: -35, el: 25, etykieta: 'izo' },
  przod: { az: 0, el: 0, etykieta: 'przód' },
  bok: { az: 90, el: 0, etykieta: 'bok' },
  gora: { az: 0, el: 90, etykieta: 'góra' }
};
const IZO_AZ0 = -35, IZO_EL0 = 25;
const ORBIT_DEG = 0.4;
const ORBIT_DRAG_PX = 6;
const ORBIT_EL_MIN = -85, ORBIT_EL_MAX = 85;
const meshIzoByCanvas = Object.create(null);
let pendingIzoMesh = null;
const obrotStan = { on: false, raf: 0, last: 0 };
const orbitStan = { active: false, id: null, x: 0, y: 0, dragged: false, blokujClickDo: 0 };

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrapAz(az) {
  return ((az % 360) + 360) % 360;
}

export function rzutuj(mesh, widok, W, H, pad = 14) {
  if (mesh && widok === WIDOKI.izo) pendingIzoMesh = mesh;
  const az = widok.az * Math.PI / 180, el = widok.el * Math.PI / 180;
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const r = [ca, -sa, 0], u = [sa * se, ca * se, ce], f = [sa * ce, ca * ce, -se];
  const dot = (a, x, y, z) => a[0] * x + a[1] * y + a[2] * z;

  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
  const n = vp.length / np;
  const X = new Float64Array(n), Y = new Float64Array(n), D = new Float64Array(n);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    const x = vp[i * np], y = vp[i * np + 1], z = vp[i * np + 2];
    const a = dot(r, x, y, z), b = dot(u, x, y, z);
    X[i] = a; Y[i] = b; D[i] = dot(f, x, y, z);
    if (a < minX) minX = a; if (a > maxX) maxX = a;
    if (b < minY) minY = b; if (b > maxY) maxY = b;
  }
  const s = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-6),
                     (H - 2 * pad) / Math.max(maxY - minY, 1e-6));
  const ox = pad - minX * s + ((W - 2 * pad) - (maxX - minX) * s) / 2;
  const oy = H - pad + minY * s - ((H - 2 * pad) - (maxY - minY) * s) / 2;

  const L = [-0.42, -0.35, 0.84];
  const tris = [];
  for (let i = 0; i < tv.length; i += 3) {
    const a = tv[i], b = tv[i + 1], c = tv[i + 2];
    const A = [vp[a * np], vp[a * np + 1], vp[a * np + 2]];
    const B = [vp[b * np], vp[b * np + 1], vp[b * np + 2]];
    const C = [vp[c * np], vp[c * np + 1], vp[c * np + 2]];
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const ln = Math.hypot(nx, ny, nz); if (ln < 1e-12) continue;
    const nv = [dot(r, nx, ny, nz) / ln, dot(u, nx, ny, nz) / ln, dot(f, nx, ny, nz) / ln];
    if (nv[2] > -1e-9) continue;
    const lam = Math.max(0, nv[0] * L[0] + nv[1] * L[1] + nv[2] * (-L[2]));
    tris.push({
      p: [X[a] * s + ox, oy - Y[a] * s, X[b] * s + ox, oy - Y[b] * s, X[c] * s + ox, oy - Y[c] * s],
      d: (D[a] + D[b] + D[c]) / 3,
      sh: 0.22 + 0.78 * lam
    });
  }
  tris.sort((p, q) => q.d - p.d);
  return tris;
}

export function rysuj(ctx, tris, tlo = '#12151a') {
  if (ctx && ctx.canvas && pendingIzoMesh) {
    const id = ctx.canvas.id;
    if (id === 'pjIzo' || id === 'prCv0') meshIzoByCanvas[id] = pendingIzoMesh;
  }
  ctx.fillStyle = tlo; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const t of tris) {
    const g = Math.round(38 + 205 * t.sh);
    const kolor = `rgb(${g},${g},${Math.min(255, g + 18)})`;
    ctx.fillStyle = kolor;
    ctx.strokeStyle = kolor;
    ctx.lineWidth = 0.6; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(t.p[0], t.p[1]); ctx.lineTo(t.p[2], t.p[3]); ctx.lineTo(t.p[4], t.p[5]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (ctx && ctx.canvas && ctx.canvas.id === 'pjIzo') podpisIzo(obrotStan.on);
}

export function etykietaGabarytu(widokKlucz, bbox) {
  const x = bbox.x.toFixed(0), y = bbox.y.toFixed(0), z = bbox.z.toFixed(0);
  if (widokKlucz === 'gora') return `${x} × ${y} mm`;
  if (widokKlucz === 'przod') return `${x} × ${z} mm`;
  if (widokKlucz === 'bok') return `${y} × ${z} mm`;
  return `${x} × ${y} × ${z} mm`;
}

function woliMniejRuchu() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function widokPodgladuWidoczny() {
  const pj = document.getElementById('view-projekt');
  const pr = document.getElementById('view-przerobka');
  function vis(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  return vis(pj) || vis(pr);
}

function podpisIzo(on) {
  const lb = document.getElementById('pjLabIzo');
  if (!lb) return;
  const mesh = meshIzoByCanvas.pjIzo;
  const bb = mesh && mesh.bbox;
  const az = Math.round(WIDOKI.izo.az);
  const el = Math.round(WIDOKI.izo.el);
  const ruszone = Math.abs(WIDOKI.izo.az - IZO_AZ0) > 0.5 || Math.abs(WIDOKI.izo.el - IZO_EL0) > 0.5;
  const head = (on || ruszone)
    ? ('obrót · az ' + az + '° el ' + el + '°')
    : 'izo';
  lb.textContent = bb ? (head + ' · ' + etykietaGabarytu('izo', bb)) : head;
}

function rysujIzoCanvasy() {
  ['pjIzo', 'prCv0'].forEach(function (id) {
    const mesh = meshIzoByCanvas[id];
    const c = document.getElementById(id);
    if (!mesh || !c) return;
    rysuj(c.getContext('2d'), rzutuj(mesh, WIDOKI.izo, c.width, c.height));
  });
  podpisIzo(obrotStan.on);
}

function klatkaObrotu(ts) {
  if (!obrotStan.on) return;
  if (document.hidden || !widokPodgladuWidoczny()) {
    obrotStan.raf = 0;
    return;
  }
  if (!obrotStan.last) obrotStan.last = ts;
  const dt = Math.min(80, ts - obrotStan.last);
  obrotStan.last = ts;
  if (dt >= 16) {
    WIDOKI.izo.az = wrapAz(WIDOKI.izo.az + dt * 0.036);
    rysujIzoCanvasy();
  }
  obrotStan.raf = requestAnimationFrame(klatkaObrotu);
}

function syncPrzyciskiObrotu() {
  ['pjObrot', 'prObrot'].forEach(function (id) {
    const b = document.getElementById(id);
    if (!b) return;
    b.setAttribute('aria-pressed', obrotStan.on ? 'true' : 'false');
  });
}

function ustawObrot(on, resetKat) {
  obrotStan.on = !!on;
  syncPrzyciskiObrotu();
  cancelAnimationFrame(obrotStan.raf);
  obrotStan.raf = 0;
  if (!obrotStan.on) {
    if (resetKat !== false) {
      WIDOKI.izo.az = IZO_AZ0;
      WIDOKI.izo.el = IZO_EL0;
    }
    rysujIzoCanvasy();
    return;
  }
  if (woliMniejRuchu()) {
    WIDOKI.izo.az = wrapAz(WIDOKI.izo.az + 45);
    rysujIzoCanvasy();
    obrotStan.on = false;
    syncPrzyciskiObrotu();
    return;
  }
  obrotStan.last = 0;
  obrotStan.raf = requestAnimationFrame(klatkaObrotu);
}

function podlaczObrot() {
  if (typeof document === 'undefined') return;
  ['pjObrot', 'prObrot'].forEach(function (id) {
    const b = document.getElementById(id);
    if (!b || b.getAttribute('data-p2s-obrot') === '1') return;
    b.setAttribute('data-p2s-obrot', '1');
    b.addEventListener('click', function () {
      ustawObrot(!obrotStan.on);
    });
  });
  const tabs = document.getElementById('tabs');
  if (tabs && !tabs.getAttribute('data-p2s-obrot-tab')) {
    tabs.setAttribute('data-p2s-obrot-tab', '1');
    tabs.addEventListener('click', function () {
      setTimeout(function () {
        if (!obrotStan.on) return;
        if (widokPodgladuWidoczny() && !obrotStan.raf) {
          obrotStan.last = 0;
          obrotStan.raf = requestAnimationFrame(klatkaObrotu);
        }
      }, 0);
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(obrotStan.raf);
      obrotStan.raf = 0;
    } else if (obrotStan.on && !obrotStan.raf) {
      obrotStan.last = 0;
      obrotStan.raf = requestAnimationFrame(klatkaObrotu);
    }
  });
}

function podlaczOrbit() {
  if (typeof document === 'undefined') return;
  ['pjIzo', 'prCv0'].forEach(function (id) {
    const c = document.getElementById(id);
    if (!c || c.getAttribute('data-p2s-orbit') === '1') return;
    c.setAttribute('data-p2s-orbit', '1');
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      orbitStan.active = true;
      orbitStan.id = e.pointerId;
      orbitStan.x = e.clientX;
      orbitStan.y = e.clientY;
      orbitStan.dragged = false;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* stary silnik */ }
    });
    c.addEventListener('pointermove', function (e) {
      if (!orbitStan.active || e.pointerId !== orbitStan.id) return;
      const dx = e.clientX - orbitStan.x;
      const dy = e.clientY - orbitStan.y;
      if (!orbitStan.dragged && Math.hypot(dx, dy) < ORBIT_DRAG_PX) return;
      if (!orbitStan.dragged) {
        orbitStan.dragged = true;
        if (obrotStan.on) ustawObrot(false, false);
      }
      orbitStan.x = e.clientX;
      orbitStan.y = e.clientY;
      WIDOKI.izo.az = wrapAz(WIDOKI.izo.az + dx * ORBIT_DEG);
      WIDOKI.izo.el = clamp(WIDOKI.izo.el + dy * ORBIT_DEG, ORBIT_EL_MIN, ORBIT_EL_MAX);
      rysujIzoCanvasy();
    });
    function koniec(e) {
      if (!orbitStan.active || (e && e.pointerId !== orbitStan.id)) return;
      if (orbitStan.dragged) orbitStan.blokujClickDo = Date.now() + 300;
      orbitStan.active = false;
      orbitStan.id = null;
      orbitStan.dragged = false;
    }
    c.addEventListener('pointerup', koniec);
    c.addEventListener('pointercancel', koniec);
    c.addEventListener('click', function (e) {
      if (Date.now() < orbitStan.blokujClickDo || e.detail > 1) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
    c.addEventListener('dblclick', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (obrotStan.on) ustawObrot(false, false);
      WIDOKI.izo.az = IZO_AZ0;
      WIDOKI.izo.el = IZO_EL0;
      rysujIzoCanvasy();
    });
  });
}
podlaczObrot();
podlaczOrbit();
