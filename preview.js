/**
 * Podgląd 2D — cztery rzuty, malarz, bez three.js.
 * strokeStyle MUSI być identyczny z fillStyle, inaczej widać przekątne triangulacji.
 */
export const WIDOKI = {
  izo: { az: -35, el: 25, etykieta: 'izo' },
  przod: { az: 0, el: 0, etykieta: 'przód' },
  bok: { az: 90, el: 0, etykieta: 'bok' },
  gora: { az: 0, el: 90, etykieta: 'góra' }
};

export function rzutuj(mesh, widok, W, H, pad = 14) {
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
}

export function etykietaGabarytu(widokKlucz, bbox) {
  const x = bbox.x.toFixed(0), y = bbox.y.toFixed(0), z = bbox.z.toFixed(0);
  if (widokKlucz === 'gora') return `${x} × ${y} mm`;
  if (widokKlucz === 'przod') return `${x} × ${z} mm`;
  if (widokKlucz === 'bok') return `${y} × ${z} mm`;
  return `${x} × ${y} × ${z} mm`;
}
