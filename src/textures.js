// Texturas PBR 100% procedurales (albedo + normal + ORM) generadas en CPU.
import * as THREE from 'three';

function hash(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// fbm teselable: u,v en [0,1); bx/by = celdas de la primera octava en cada eje
export function fbm(u, v, bx, by, oct, s) {
  let amp = 0.5, fx = bx, fy = by, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u * fx, v * fy, fx, fy, s + i * 17);
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const toSRGB = (c) => Math.round(255 * Math.pow(clamp01(c), 1 / 2.2));

function dataTex(data, N, srgb) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// fn(u, v, o) rellena o = {h, r, g, b, rough, metal, ao}
function makeSet(N, fn, normalStrength = 4) {
  const H = new Float32Array(N * N);
  const alb = new Uint8Array(N * N * 4), orm = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4);
  const o = { h: 0, r: 0, g: 0, b: 0, rough: 0.5, metal: 0, ao: 1 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      o.metal = 0; o.ao = 1; o.rough = 0.5; o.h = 0.5;
      fn(x / N, y / N, o);
      const i = y * N + x, j = i * 4;
      H[i] = o.h;
      alb[j] = toSRGB(o.r); alb[j + 1] = toSRGB(o.g); alb[j + 2] = toSRGB(o.b); alb[j + 3] = 255;
      orm[j] = Math.round(255 * clamp01(o.ao));
      orm[j + 1] = Math.round(255 * clamp01(o.rough));
      orm[j + 2] = Math.round(255 * clamp01(o.metal));
      orm[j + 3] = 255;
    }
  }
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, yc = y * N;
    for (let x = 0; x < N; x++) {
      const xm = (x - 1 + N) % N, xp = (x + 1) % N;
      const dx = (H[yc + xp] - H[yc + xm]) * 0.5 * normalStrength * (N / 64);
      const dy = (H[yp + x] - H[ym + x]) * 0.5 * normalStrength * (N / 64);
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const j = (yc + x) * 4;
      nrm[j] = Math.round((-dx * il * 0.5 + 0.5) * 255);
      nrm[j + 1] = Math.round((-dy * il * 0.5 + 0.5) * 255);
      nrm[j + 2] = Math.round((il * 0.5 + 0.5) * 255);
      nrm[j + 3] = 255;
    }
  }
  return { map: dataTex(alb, N, true), normalMap: dataTex(nrm, N, false), orm: dataTex(orm, N, false) };
}

export function pbr(set, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap,
    roughnessMap: set.orm, metalnessMap: set.orm, aoMap: set.orm,
    roughness: 1, metalness: 1, ...opts,
  });
  return m;
}

// ---------- definiciones de superficies ----------

function concreteFn(u, v, o) {
  const n1 = fbm(u, v, 4, 4, 6, 1);
  const n2 = fbm(u, v, 32, 32, 4, 7);
  const n3 = fbm(u, v, 128, 128, 3, 9);
  const streak = fbm(u, v, 28, 2, 4, 11);
  const leak = ss(0.56, 0.78, fbm(u, v, 18, 1, 3, 13)) * ss(0.35, 0.65, fbm(u, v, 3, 3, 3, 15));
  const pu = (u * 2) % 1, pv = (v * 2) % 1;
  const seam = Math.min(Math.min(pu, 1 - pu), Math.min(pv, 1 - pv));
  const groove = ss(0.011, 0.002, seam);
  const tx = Math.abs(Math.abs(pu - 0.5) - 0.34), ty = Math.abs(Math.abs(pv - 0.5) - 0.34);
  const hole = ss(0.024, 0.014, Math.hypot(tx, ty));
  const pore = Math.max(0, n3 - 0.68) * 2.2;
  let c = 0.30 + (n1 - 0.5) * 0.24 + (n2 - 0.5) * 0.13 + (n3 - 0.5) * 0.05;
  c *= 0.82 + 0.36 * streak;
  c *= 1 - 0.5 * leak;
  c *= 1 - groove * 0.4 - hole * 0.55 - pore * 0.5;
  o.r = c * 1.03; o.g = c * 1.0; o.b = c * 0.95;
  o.h = 0.5 + n1 * 0.25 + n2 * 0.22 + n3 * 0.1 - groove * 0.7 - hole * 0.9 - pore * 0.4;
  o.rough = 0.84 + (n2 - 0.5) * 0.22 - leak * 0.25;
  o.ao = 1 - groove * 0.45 - hole * 0.6 - pore * 0.3;
}

function floorFn(u, v, o) {
  const n1 = fbm(u, v, 3, 3, 6, 31);
  const n2 = fbm(u, v, 48, 48, 4, 37);
  const n3 = fbm(u, v, 160, 160, 2, 39);
  const pud = fbm(u, v, 4, 4, 4, 41);
  const stain = ss(0.5, 0.75, fbm(u, v, 6, 6, 4, 43));
  const tire = ss(0.62, 0.74, fbm(u, v, 40, 2, 3, 47)) * ss(0.4, 0.6, fbm(u, v, 2, 2, 2, 49));
  const wet = ss(0.5, 0.6, pud + (n1 - 0.5) * 0.2);
  const damp = ss(0.4, 0.56, pud + (n1 - 0.5) * 0.2);
  const pu = (u * 2) % 1, pv = (v * 2) % 1;
  const seam = Math.min(Math.min(pu, 1 - pu), Math.min(pv, 1 - pv));
  const groove = ss(0.006, 0.001, seam);
  let c = 0.25 + (n1 - 0.5) * 0.12 + (n2 - 0.5) * 0.09 + (n3 - 0.5) * 0.04;
  c *= 1 - 0.3 * stain - 0.35 * tire;
  c *= 1 - 0.45 * damp;
  c *= 1 - 0.5 * groove;
  o.r = c * 1.02; o.g = c; o.b = c * 0.97;
  o.h = 0.5 + ((n1 - 0.5) * 0.2 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.12) * (1 - wet) - groove * 0.6 * (1 - wet);
  const dry = 0.62 + (n2 - 0.5) * 0.3 - stain * 0.15;
  o.rough = mix(mix(dry, 0.3, damp), 0.03, wet);
  o.ao = 1 - groove * 0.4;
}

function paintedFn(col, seed, { ribs = 0, panels = 0, wear = 1 } = {}) {
  return (u, v, o) => {
    const n = fbm(u, v, 5, 5, 5, seed);
    const fine = fbm(u, v, 64, 64, 3, seed + 3);
    const scr = fbm(u, v, 3, 140, 2, seed + 5);
    const scratch = ss(0.68, 0.76, scr) * ss(0.4, 0.6, fbm(u, v, 6, 6, 2, seed + 9));
    let chip = ss(0.69 - 0.07 * wear, 0.74 - 0.07 * wear, n * 0.72 + fine * 0.42);
    chip = Math.max(chip, scratch * 0.85);
    const rustM = ss(0.45, 0.65, fbm(u, v, 7, 7, 4, seed + 11));
    const dirt = fbm(u, v, 3, 3, 4, seed + 13);
    const drip = fbm(u, v, 36, 2, 3, seed + 15);
    let h = 0.5 + fine * 0.05 - chip * 0.1;
    let ao = 1;
    if (ribs) {
      const w = (u * ribs) % 1;
      const tr = ss(0.08, 0.28, w) - ss(0.58, 0.78, w);
      h += tr * 0.9; ao = 0.6 + 0.4 * tr;
    }
    if (panels) {
      const pu = (u * panels) % 1, pv = (v * panels) % 1;
      const seam = Math.min(Math.min(pu, 1 - pu), Math.min(pv, 1 - pv));
      const g = ss(0.02, 0.006, seam);
      h -= g * 0.6; ao *= 1 - g * 0.5;
      const rx = Math.abs(Math.abs(pu - 0.5) - 0.42), ry = Math.abs(Math.abs(pv - 0.5) - 0.42);
      const riv = ss(0.03, 0.018, Math.hypot(rx, ry));
      h += riv * 0.5;
    }
    const sh = (0.62 + 0.55 * dirt) * (0.8 + 0.3 * drip) * (0.75 + 0.25 * ao);
    const br = mix(0.33, 0.24, rustM), bg = mix(0.33, 0.1, rustM), bb = mix(0.35, 0.04, rustM);
    o.r = mix(col[0] * sh, br, chip); o.g = mix(col[1] * sh, bg, chip); o.b = mix(col[2] * sh, bb, chip);
    o.metal = chip * (1 - rustM);
    o.rough = mix(0.42 + fine * 0.3, mix(0.3, 0.92, rustM), chip);
    o.h = h; o.ao = ao;
  };
}


// pared de galería: yeso blanco agrietado con zonas desprendidas que dejan ver el ladrillo
function wallFn(brickAmt, seed) {
  return (u, v, o) => {
    const rows = 48, cols = 18;
    const r = Math.floor(v * rows), off = (r % 2) * 0.5;
    const bx = u * cols + off, bu = bx - Math.floor(bx), bv = v * rows - r;
    const mort = Math.max(ss(0.07, 0.02, Math.min(bu, 1 - bu) * 2.2), ss(0.16, 0.05, Math.min(bv, 1 - bv)));
    const bh = hash(((Math.floor(bx) % cols) + cols) % cols, r, seed);
    const n1 = fbm(u, v, 3, 3, 5, seed + 1), n2 = fbm(u, v, 24, 24, 4, seed + 3), n3 = fbm(u, v, 96, 96, 3, seed + 5);
    const m = n1 * 0.8 + n2 * 0.2 + (n3 - 0.5) * 0.05;
    const th = 0.74 - brickAmt * 0.22;
    const bare = ss(th, th + 0.012, m);                  // 1 = ladrillo visto
    const lip = ss(th - 0.05, th, m) * (1 - bare);
    const crack = ss(0.012, 0.0, Math.abs(fbm(u, v, 5, 5, 4, seed + 7) - 0.5)) * ss(0.35, 0.6, fbm(u, v, 2, 2, 2, seed + 9));
    const streak = fbm(u, v, 26, 2, 4, seed + 11), stain = ss(0.5, 0.8, fbm(u, v, 5, 3, 4, seed + 13));
    const bt = 0.65 + 0.7 * bh;
    const br = mix(0.36 * bt, 0.4, mort) * (0.8 + n3 * 0.4), bg = mix(0.13 * bt, 0.37, mort) * (0.8 + n3 * 0.4), bb = mix(0.085 * bt, 0.33, mort) * (0.8 + n3 * 0.4);
    let p = 0.66 + (n2 - 0.5) * 0.1 + (n3 - 0.5) * 0.06;
    p *= (0.86 + 0.28 * streak) * (1 - 0.3 * stain) * (1 - 0.6 * crack) * (1 - 0.25 * lip);
    o.r = mix(p * 1.0, br, bare); o.g = mix(p * 0.98, bg, bare); o.b = mix(p * 0.93, bb, bare);
    o.h = mix(0.85 + n2 * 0.06 + n3 * 0.04 - crack * 0.4, 0.3 + (1 - mort) * 0.25 + n3 * 0.08, bare);
    o.rough = mix(0.9 - stain * 0.1, 0.82, bare); o.ao = 1 - bare * mort * 0.4 - crack * 0.4;
  };
}

function gunmetalFn(u, v, o) {
  const n = fbm(u, v, 8, 8, 4, 71), fine = fbm(u, v, 96, 96, 2, 73);
  const scr = ss(0.7, 0.8, fbm(u, v, 4, 120, 2, 75));
  o.r = o.g = o.b = 0.82 + (n - 0.5) * 0.25 + scr * 0.25;
  o.metal = 1;
  o.rough = 0.36 + (n - 0.5) * 0.3 + (fine - 0.5) * 0.15 - scr * 0.15;
  o.h = 0.5 + fine * 0.06 - scr * 0.05;
}

function polymerFn(u, v, o) {
  const fine = fbm(u, v, 128, 128, 2, 81), n = fbm(u, v, 6, 6, 3, 83);
  o.r = o.g = o.b = 0.8 + (n - 0.5) * 0.2;
  o.metal = 0; o.rough = 0.55 + (fine - 0.5) * 0.25 + (n - 0.5) * 0.15;
  o.h = 0.5 + fine * 0.2;
}

function hazardFn(u, v, o) {
  const d = ((u + v) * 4) % 1;
  const stripe = ss(0.47, 0.5, d) - ss(0.97, 1.0, d);
  const n = fbm(u, v, 6, 6, 5, 91), fine = fbm(u, v, 64, 64, 3, 93);
  const chip = ss(0.6, 0.67, n * 0.7 + fine * 0.45);
  const dirt = 0.6 + 0.5 * fbm(u, v, 3, 3, 3, 95);
  const yr = 0.78, yg = 0.5, yb = 0.03;
  const r = mix(0.025, yr, stripe) * dirt, g = mix(0.025, yg, stripe) * dirt, b = mix(0.025, yb, stripe) * dirt;
  o.r = mix(r, 0.2, chip); o.g = mix(g, 0.19, chip); o.b = mix(b, 0.17, chip);
  o.rough = mix(0.5 + fine * 0.2, 0.85, chip); o.metal = 0;
  o.h = 0.5 - chip * 0.3 + fine * 0.05;
}

// ---------- texturas de canvas ----------

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function softDot() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}

function smokeTex() {
  return canvasTex(256, 256, (g) => {
    for (let i = 0; i < 40; i++) {
      const x = 128 + (Math.random() - 0.5) * 110, y = 128 + (Math.random() - 0.5) * 110, r = 30 + Math.random() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.11)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
  });
}

function flashTex() {
  return canvasTex(256, 256, (g) => {
    g.translate(128, 128);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 70);
    core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.3, 'rgba(255,220,150,0.8)'); core.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = core; g.fillRect(-128, -128, 256, 256);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      g.save(); g.rotate((i / 9) * Math.PI * 2 + Math.random() * 0.5);
      const len = 70 + Math.random() * 55, wd = 7 + Math.random() * 12;
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,140,30,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -wd); g.lineTo(len, 0); g.lineTo(0, wd); g.closePath(); g.fill();
      g.restore();
    }
  });
}

function holeTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.16, 'rgba(4,4,4,0.98)');
    gr.addColorStop(0.24, 'rgba(60,58,54,0.75)'); gr.addColorStop(0.36, 'rgba(18,17,16,0.5)'); gr.addColorStop(1, 'rgba(10,10,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.28, l = 18 + Math.random() * 30;
      g.beginPath(); g.moveTo(64 + Math.cos(a) * 9, 64 + Math.sin(a) * 9);
      g.lineTo(64 + Math.cos(a + 0.2) * l, 64 + Math.sin(a + 0.2) * l); g.stroke();
    }
  });
}

export function stencilTex(text, { w = 1024, h = 512, color = '#d8d4c8', font = '900 380px "Arial Narrow", "Helvetica Neue", Arial, sans-serif', sub = '' } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = '700 64px "Helvetica Neue", Arial, sans-serif'; g.fillText(sub, w / 2, h * 0.86); }
    // desgaste: borrar motas
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = Math.random() * Math.random() * 9;
      g.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.7})`;
      g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h);
    }
  });
}


// cuadros abstractos generados
export function artTex(R) {
  const t = canvasTex(512, 512, (g, w, h) => {
    const hue = R() * 360, style = Math.floor(R() * 3);
    g.fillStyle = `hsl(${hue},${20 + R() * 40}%,${style === 1 ? 86 : 16 + R() * 28}%)`; g.fillRect(0, 0, w, h);
    if (style === 0) {
      for (let i = 0; i < 3; i++) {
        const y = h * (0.07 + i * 0.31), hh = h * (0.2 + R() * 0.08), c = `${hue + 30 + R() * 140},${50 + R() * 40}%,${30 + R() * 35}%`;
        for (let k = 0; k < 14; k++) { g.fillStyle = `hsla(${c},0.16)`; g.fillRect(w * 0.07 - k * 1.5 + R() * 6, y - k * 1.5 + R() * 6, w * 0.86 + k * 3, hh + k * 3); }
      }
    } else if (style === 1) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsl(${hue + R() * 220},${60 + R() * 30}%,${25 + R() * 40}%)`;
        if (R() < 0.5) g.fillRect(R() * w * 0.8, R() * h * 0.8, w * (0.1 + R() * 0.4), h * (0.1 + R() * 0.4));
        else { g.beginPath(); g.arc(R() * w, R() * h, w * (0.08 + R() * 0.2), 0, 6.28); g.fill(); }
      }
      g.strokeStyle = '#111'; g.lineWidth = 7; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(R() * w, R() * h); g.lineTo(R() * w, R() * h); g.stroke(); }
    } else {
      g.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `hsla(${hue + R() * 110 - 55},${50 + R() * 50}%,${35 + R() * 45}%,${0.5 + R() * 0.5})`; g.lineWidth = 3 + R() * 28;
        const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y);
        g.bezierCurveTo(x + (R() - 0.5) * 300, y + (R() - 0.5) * 300, x + (R() - 0.5) * 300, y + (R() - 0.5) * 300, x + (R() - 0.5) * 400, y + (R() - 0.5) * 400); g.stroke();
      }
    }
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(40,30,20,${R() * 0.13})`; g.beginPath(); g.arc(R() * w, R() * h, R() * 14, 0, 6.28); g.fill(); }
  });
  return t;
}

// fachadas del skyline: mapa de color + mapa emisivo de ventanas encendidas
export function facadeTex(R, base) {
  const lit = []; for (let i = 0; i < 24; i++) lit.push(R() < 0.13 ? 0.5 + R() * 0.5 : 0);
  const mk = (em) => { const t = canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = em ? '#000' : base; g.fillRect(0, 0, w, h);
    const cw = w / 4, ch = h / 6;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      const l = lit[r * 4 + c];
      if (em) { if (!l) continue; g.fillStyle = `rgba(255,${Math.round(150 + l * 60)},${Math.round(70 + l * 50)},${l})`; }
      else g.fillStyle = l ? '#b98f55' : '#0c1016';
      g.fillRect(c * cw + cw * 0.24, r * ch + ch * 0.2, cw * 0.52, ch * 0.58);
      if (!em) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(c * cw + cw * 0.2, r * ch + ch * 0.8, cw * 0.6, ch * 0.05); }
    }
  }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  return { map: mk(false), emissiveMap: mk(true) };
}

function noiseTex() {
  const N = 128, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = Math.round(255 * fbm(x / N, y / N, 4, 4, 4, 101));
    const j = (y * N + x) * 4; d[j] = d[j + 1] = d[j + 2] = n; d[j + 3] = 255;
  }
  const t = dataTex(d, N, false); return t;
}

export function buildTextures() {
  const T = {};
  T.concrete = makeSet(1024, concreteFn, 1.5);
  T.floor = makeSet(1024, floorFn, 0.9);
  T.wall = makeSet(1024, wallFn(1, 400), 2.2);
  T.plaster = makeSet(512, wallFn(-3, 420), 1.6);
  T.olive = makeSet(512, paintedFn([0.14, 0.16, 0.085], 260, { panels: 1, wear: 1.1 }), 2.5);
  T.grey = makeSet(512, paintedFn([0.27, 0.29, 0.3], 280, { panels: 2 }), 2.5);
  T.white = makeSet(512, paintedFn([0.55, 0.56, 0.55], 360, { wear: 0.8 }), 2);
  T.gunmetal = makeSet(256, gunmetalFn, 0.6);
  T.polymer = makeSet(256, polymerFn, 1.2);
  T.dot = softDot(); T.smoke = smokeTex(); T.flash = flashTex(); T.hole = holeTex(); T.noise = noiseTex();
  return T;
}
