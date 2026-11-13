// Nivel: galería de arte del SoHo (Nueva York) semiderruida, a cielo abierto en gran parte, al atardecer.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pbr, stencilTex, artTex, facadeTex } from './textures.js';

const W = 24, D = 36, H = 7;

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function buildLevel(scene, T, reflection) {
  const group = new THREE.Group(); scene.add(group);
  const colliders = [], rayMeshes = [], noAO = [], lights = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const R = rng(11);
  const SUN = V(-0.4, 0.62, -0.68).normalize();      // dirección hacia el sol
  const dl = SUN.clone().negate();                    // dirección en la que viaja la luz

  // ---------- materiales ----------
  const M = {
    concrete: pbr(T.concrete), floor: pbr(T.floor, { envMapIntensity: 0.3 }),
    wall: pbr(T.wall), plaster: pbr(T.plaster),
    olive: pbr(T.olive), grey: pbr(T.grey),
    steel: pbr(T.gunmetal, { color: 0x2a2d31 }), dark: pbr(T.gunmetal, { color: 0x0e0f11 }),
    iron: pbr(T.gunmetal, { color: 0x1c2420 }), galv: pbr(T.gunmetal, { color: 0x8d9296 }),
    rustM: pbr(T.gunmetal, { color: 0x5a2c16, metalness: 0.4 }),
    bronze: pbr(T.gunmetal, { color: 0xb47a38 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.2 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.07 }),
    frame: pbr(T.polymer, { color: 0x1b140e, metalness: 0 }),
    gold: pbr(T.gunmetal, { color: 0xc9a045 }),
  };
  const tiles = { concrete: 4, wall: 4, plaster: 3, olive: 1.2, grey: 2, steel: 1, dark: 1, iron: 1, galv: 1.2 };
  for (const k in tiles) M[k].userData.tile = tiles[k];
  reflection.patch(M.floor);
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b) });

  // ---------- helpers ----------
  function scaleBoxUV(geo, w, h, d, tile) {
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
  }
  function reg(m, w, h, d, o) {
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    (o.parent || group).add(m);
    if (o.collide !== false) colliders.push(new THREE.Box3().setFromCenterAndSize(m.position, V(w, h, d)));
    if (o.ray !== false) rayMeshes.push(m);
    return m;
  }
  function box(w, h, d, x, y, z, mat, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(g, w, h, d, mat.userData.tile || 1);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z);
    return reg(m, w, h, d, o);
  }
  function rbox(w, h, d, x, y, z, mat, r = 0.04, o = {}) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat); m.position.set(x, y, z);
    return reg(m, w, h, d, o);
  }
  function cyl(r, len, x, y, z, mat, axis = 'y', o = {}) {
    const g = new THREE.CylinderGeometry(o.r2 || r, r, len, o.seg || 20);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z);
    m.castShadow = o.cast !== false; m.receiveShadow = true; group.add(m);
    return m;
  }
  const solid = (x0, y0, z0, x1, y1, z1) => colliders.push(new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1)));
  function addLight(l) { l.layers.enable(1); group.add(l); lights.push(l); return l; }
  const NC = { collide: false }, DECO = { collide: false, ray: false };

  // ---------- cielo ----------
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN }, tNoise: { value: T.noise }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sunDir; uniform sampler2D tNoise; uniform float uTime; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 zen = vec3(0.06, 0.15, 0.42), mid = vec3(0.36, 0.36, 0.52), hor = vec3(1.2, 0.58, 0.26);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h)); col = mix(col, zen, smoothstep(0.12, 0.75, h));
        float sd = max(dot(d, sunDir), 0.0);
        col += vec3(1.3, 0.62, 0.25) * pow(sd, 6.0) * 0.55 + vec3(1.6, 0.95, 0.5) * pow(sd, 48.0) * 1.3;
        vec2 uv = d.xz / (d.y + 0.28) * 0.3 + uTime * 0.0015;
        float c = texture2D(tNoise, uv).r * 0.62 + texture2D(tNoise, uv * 2.7 + 0.3).r * 0.38;
        c = smoothstep(0.47, 0.72, c) * smoothstep(0.02, 0.25, d.y);
        vec3 cc = mix(vec3(0.42, 0.34, 0.42), vec3(1.5, 0.8, 0.42), clamp(pow(sd, 2.0) * 0.85 + 0.12, 0.0, 1.0));
        col = mix(col, cc, c * 0.8);
        col += vec3(60.0, 38.0, 20.0) * smoothstep(0.9992, 0.9997, sd) * (1.0 - c * 0.7);
        col = mix(col, vec3(0.1, 0.08, 0.08), smoothstep(0.0, -0.04, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(330, 48, 24), skyMat); sky.frustumCulled = false; group.add(sky); noAO.push(sky);

  const sun = addLight(new THREE.DirectionalLight(0xffb87a, 15));
  sun.position.copy(SUN).multiplyScalar(48).add(V(0, 2, 0)); sun.target.position.set(0, 2, 0); group.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 5, far: 95 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2.5;

  // ---------- suelo y calle ----------
  const floorGeo = new THREE.PlaneGeometry(W, D); floorGeo.rotateX(-Math.PI / 2);
  { const uv = floorGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 6, uv.getY(i) * D / 6); }
  const floor = new THREE.Mesh(floorGeo, M.floor); floor.receiveShadow = true; group.add(floor); rayMeshes.push(floor);
  reflection.hide.push(floor);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b1a1a, roughness: 0.92 }));
  street.position.y = -0.04; group.add(street);

  // ---------- muros ----------
  box(0.5, H, D + 1, W / 2 + 0.25, H / 2, 0, M.wall);                          // derecha (ciega)
  box(W, H, 0.5, 0, H / 2, D / 2 + 0.25, M.wall);                               // frontal
  // izquierda con ventanales
  const WZ = [-12, -4, 4, 12], WH = 1.3, WY0 = 1.0, WY1 = 5.6, xl = -W / 2 - 0.25;
  { let z0 = -D / 2 - 0.5;
    for (const c of [...WZ, null]) {
      const z1 = c === null ? D / 2 + 0.5 : c - WH;
      box(0.5, H, z1 - z0, xl, H / 2, (z0 + z1) / 2, M.wall, NC);
      if (c === null) break;
      box(0.5, WY0, WH * 2, xl, WY0 / 2, c, M.wall, NC);
      box(0.5, H - WY1, WH * 2, xl, (H + WY1) / 2, c, M.wall, NC);
      box(0.72, 0.09, WH * 2 + 0.2, xl + 0.06, WY0 + 0.045, c, M.concrete, DECO);
      for (const dz of [-0.43, 0.43]) box(0.05, WY1 - WY0, 0.05, xl, (WY0 + WY1) / 2, c + dz, M.iron, DECO);
      for (const y of [2.15, 3.3, 4.45]) box(0.05, 0.05, WH * 2, xl, y, c, M.iron, DECO);
      z0 = c + WH;
    }
    solid(-W / 2 - 0.5, 0, -D / 2 - 0.5, -W / 2, H, D / 2 + 0.5);
  }
  // trasera con gran brecha (x -5..3)
  const zb = -D / 2 - 0.25, BX0 = -5, BX1 = 3;
  box(BX0 + W / 2, H, 0.5, (BX0 - W / 2) / 2, H / 2, zb, M.wall, NC);
  box(W / 2 - BX1, H, 0.5, (BX1 + W / 2) / 2, H / 2, zb, M.wall, NC);
  for (let x = BX0; x < BX1; x += 0.8) {
    const t = ((x + 0.4) - (BX0 + BX1) / 2) / ((BX1 - BX0) / 2);
    const h = 0.35 + R() * 1.1 + 4.2 * Math.pow(Math.abs(t), 3.5) + (Math.abs(t) > 0.8 ? R() * 1.2 : 0);
    box(0.8, h, 0.5, x + 0.4, h / 2, zb, M.wall, NC);
  }
  solid(-W / 2, 0, -D / 2 - 0.5, W / 2, H, -D / 2);

  // ---------- cubierta parcialmente derrumbada ----------
  const OPEN = new Set(['1,0', '2,0', '1,1', '2,1', '3,1', '0,2', '1,2', '2,3', '1,4', '3,5']);
  const SKYL = new Set(['2,3', '1,4']);
  const isOpen = (i, j) => OPEN.has(i + ',' + j);
  const rebar = [], shafts = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
    const cx = -9 + i * 6, cz = -15 + j * 6;
    if (!isOpen(i, j)) { box(6, 0.3, 6, cx, H + 0.15, cz, M.concrete); continue; }
    shafts.push({ o: V(cx - 3, H, cz - 3), u: V(6, 0, 0), v: V(0, 0, 6), L: H / -dl.y + 0.3 });
    if (SKYL.has(i + ',' + j)) {
      for (let k = 1; k < 6; k++) { box(6, 0.06, 0.06, cx, H + 0.05, cz - 3 + k, M.iron, DECO); box(0.06, 0.06, 6, cx - 3 + k, H + 0.05, cz, M.iron, DECO); }
      continue;
    }
    // bordes rotos: trozos de losa que sobresalen + armaduras colgando
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && ni < 4 && nj >= 0 && nj < 6 && isOpen(ni, nj)) continue;
      const n = 3 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const along = -3 + (k + 0.5) * (6 / n) + (R() - 0.5) * 0.6, wd = 0.7 + R() * 1.5, dp = 0.25 + R() * R() * 1.5;
        const ex = cx + di * (3 - dp / 2) + (di ? 0 : along), ez = cz + dj * (3 - dp / 2) + (dj ? 0 : along);
        box(di ? dp : wd, 0.3, dj ? dp : wd, ex, H + 0.15, ez, M.concrete, DECO);
        for (let q = 0; q < 2; q++) {
          const len = 0.4 + R() * 0.9, m4 = new THREE.Matrix4();
          const px = cx + di * (3 - dp) + (di ? 0 : along + (R() - 0.5) * wd), pz = cz + dj * (3 - dp) + (dj ? 0 : along + (R() - 0.5) * wd);
          const droop = 0.3 + R() * 1.1, e = new THREE.Euler(dj * (Math.PI / 2 - droop) * -1 + (R() - 0.5) * 0.4, 0, di * (Math.PI / 2 - droop) + (R() - 0.5) * 0.4);
          const q4 = new THREE.Quaternion().setFromEuler(e), dir = V(0, -1, 0).applyQuaternion(q4);
          m4.compose(V(px, H + 0.12, pz).addScaledVector(dir, len / 2), q4, V(1, len, 1)); rebar.push(m4);
        }
      }
    }
  }
  { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), M.rustM, rebar.length);
    rebar.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.frustumCulled = false; group.add(im); }
  // vigas de acero (siguen cruzando los huecos)
  for (const z of [-12, -6, 0, 6, 12]) { box(W, 0.4, 0.16, 0, H - 0.2, z, M.steel, NC); box(W, 0.05, 0.4, 0, H - 0.425, z, M.steel, DECO); }
  for (const x of [-6, 0, 6]) { box(0.16, 0.36, D, x, H - 0.18, 0, M.steel, NC); box(0.36, 0.05, D, x, H - 0.385, 0, M.steel, DECO); }
  // cables colgando
  for (let k = 0; k < 9; k++) { const len = 0.8 + R() * 2.6; cyl(0.008, len, -10 + R() * 20, H - len / 2, -16 + R() * 30, M.dark, 'y', { seg: 5 }); }

  // ---------- columnas de hierro fundido ----------
  for (const x of [-6, 6]) for (const z of [-10, 0, 10]) {
    const c = cyl(0.14, H - 0.4, x, (H - 0.4) / 2, z, M.iron, 'y', { seg: 24, r2: 0.12 }); rayMeshes.push(c);
    cyl(0.25, 0.28, x, 0.14, z, M.iron, 'y', { seg: 24, r2: 0.19 }); cyl(0.17, 0.1, x, 0.33, z, M.iron, 'y', { seg: 24 });
    cyl(0.14, 0.3, x, H - 0.75, z, M.iron, 'y', { seg: 24, r2: 0.26 }); box(0.6, 0.08, 0.6, x, H - 0.48, z, M.iron, DECO);
    solid(x - 0.2, 0, z - 0.2, x + 0.2, H, z + 0.2);
  }

  // ---------- tabiques de exposición ----------
  box(0.3, 3.2, 6, -7, 1.6, -6.5, M.plaster);
  box(0.3, 3.2, 6, 8, 1.6, 6, M.plaster);
  box(6, 3.2, 0.3, 6, 1.6, -14.5, M.plaster);

  // ---------- cuadros ----------
  function painting(w, h, x, y, z, ry, { tilt = 0, lean = 0, gold = false } = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const inner = new THREE.Group(); inner.rotation.set(lean, 0, tilt); g.add(inner);
    const fr = new THREE.Mesh(new RoundedBoxGeometry(w + 0.14, h + 0.14, 0.06, 2, 0.012), gold ? M.gold : M.frame);
    fr.castShadow = fr.receiveShadow = true; inner.add(fr); rayMeshes.push(fr);
    const cv = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTex(R), roughness: 0.72 }));
    cv.position.z = 0.032; cv.receiveShadow = true; inner.add(cv);
    group.add(g);
  }
  const xr = W / 2 - 0.04, PI = Math.PI;
  painting(2.4, 1.6, xr, 2.6, -13, -PI / 2);
  painting(1.4, 1.9, xr, 2.7, -7.5, -PI / 2, { tilt: 0.12 });
  painting(2.8, 1.8, xr, 2.7, -1.5, -PI / 2, { gold: true });
  painting(1.2, 1.2, xr, 2.2, 3.6, -PI / 2, { tilt: -0.34 });
  painting(2.2, 2.6, xr, 2.9, 9.5, -PI / 2);
  painting(1.5, 1.1, xr - 0.32, 0.6, 13.2, -PI / 2, { lean: -0.3, gold: true });
  painting(2.0, 2.4, -8, 2.7, D / 2 - 0.04, PI);
  painting(2.6, 1.7, 8, 2.7, D / 2 - 0.04, PI, { tilt: 0.07, gold: true });
  painting(2.2, 1.5, -6.81, 1.9, -6.5, PI / 2);
  painting(1.8, 2.2, -7.19, 1.8, -5.6, -PI / 2, { tilt: -0.06 });
  painting(1.8, 2.2, 7.81, 1.8, 6, -PI / 2, { tilt: -0.1 });
  painting(1.6, 1.6, 8.19, 1.9, 6.8, PI / 2);
  painting(3.0, 1.6, 6, 1.9, -14.31, 0, { gold: true });
  painting(2.0, 2.0, 8, 2.8, -D / 2 + 0.04, 0);
  painting(1.3, 1.7, -1.2, 0.86, D / 2 - 0.36, PI, { lean: -0.3 });

  // ---------- peanas y esculturas ----------
  function plinth(x, z, h = 1.05) { rbox(0.7, h, 0.7, x, h / 2, z, M.plaster, 0.012); return h; }
  function sculpt(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); rayMeshes.push(m); return m; }
  sculpt(new THREE.TorusKnotGeometry(0.26, 0.085, 180, 24), M.bronze, -9.5, plinth(-9.5, 12) + 0.44, 12);
  sculpt(new THREE.SphereGeometry(0.34, 48, 32), M.chrome, 9.3, plinth(9.3, -3.5) + 0.34, -3.5);
  sculpt(new THREE.IcosahedronGeometry(0.4, 0), M.marble, -3.2, plinth(-3.2, 3.3) + 0.36, 3.3).rotation.set(0.4, 0.7, 0.2);
  { const h = plinth(3.8, 11.5); for (let k = 0; k < 3; k++) sculpt(new RoundedBoxGeometry(0.34 - k * 0.06, 0.26, 0.34 - k * 0.06, 2, 0.01), M.gloss, 3.8, h + 0.13 + k * 0.26, 11.5).rotation.y = k * 0.5; }
  // peana volcada
  { const m = rbox(1.05, 0.7, 0.7, 2.6, 0.35, -4.6, M.plaster, 0.012); m.rotation.y = 0.4; sculpt(new THREE.SphereGeometry(0.3, 40, 28), M.marble, 3.95, 0.3, -5.4); }
  // pieza central: gran nudo de bronce pulido bajo un haz de sol
  rbox(2.2, 0.4, 2.2, 0, 0.2, -3, M.plaster, 0.015);
  const hero = sculpt(new THREE.TorusKnotGeometry(0.95, 0.27, 260, 36, 2, 3), new THREE.MeshStandardMaterial({ color: 0xc58a45, metalness: 1, roughness: 0.16 }), 0, 2.15, -3);
  solid(-0.9, 0.4, -3.9, 0.9, 3.6, -2.1);

  // ---------- cajas de transporte ----------
  function crate(x, y, z, s = 1.1, mat = M.olive, rot = 0) {
    const m = rbox(s, s, s, x, y + s / 2, z, mat, 0.035);
    m.rotation.y = rot;
    const b1 = new THREE.Mesh(new RoundedBoxGeometry(s + 0.03, 0.09, s + 0.03, 2, 0.01), M.dark);
    b1.position.y = s * 0.3; m.add(b1); const b2 = b1.clone(); b2.position.y = -s * 0.3; m.add(b2);
    b1.castShadow = b2.castShadow = true; b1.receiveShadow = b2.receiveShadow = true;
    if (rot) colliders[colliders.length - 1].expandByScalar(0.08);
  }
  crate(-2.2, 0, 8.6); crate(-3.4, 0, 8.9, 1.1, M.grey, 0.14); crate(-2.8, 1.1, 8.7, 1.0, M.olive, -0.2);
  crate(9.8, 0, -9.2, 1.3, M.grey); crate(-9.6, 0, -14.2, 1.3, M.olive, 0.1); crate(-9.4, 0, 1.2, 1.1, M.grey, -0.12);

  // ---------- escombros ----------
  { const piles = [[-3, -13, 3.2, 46], [2.5, -8.5, 2.6, 36], [-8.5, -3, 2.6, 34], [-2.5, -4.5, 1.6, 16], [4.5, 3.5, 1.8, 22], [-3, 9.5, 1.8, 20], [9.5, 15, 1.6, 18], [-1, -16.6, 3.4, 50], [5.5, -8, 2, 18]];
    const mats = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const [px, pz, r, n] of piles) for (let k = 0; k < n; k++) {
      const a = R() * 6.28, dd = Math.sqrt(-2 * Math.log(1 - R() * 0.98)) * r * 0.42, s = 0.08 + R() * R() * 0.55;
      const sy = s * (0.3 + R() * 0.5), lift = Math.max(0, 1 - dd / r) * 0.55 * R();
      e.set(R() * 0.8 - 0.4, R() * 6.28, R() * 0.8 - 0.4); q.setFromEuler(e);
      const x = THREE.MathUtils.clamp(px + Math.cos(a) * dd, -11.6, 11.6), z = THREE.MathUtils.clamp(pz + Math.sin(a) * dd, -17.6, 17.6);
      m4.compose(V(x, sy * 0.45 + lift, z), q, V(s * (0.6 + R()), sy, s * (0.6 + R()))); mats.push(m4.clone());
    }
    const g = new THREE.BoxGeometry(1, 1, 1); scaleBoxUV(g, 0.6, 0.6, 0.6, 4);
    const im = new THREE.InstancedMesh(g, M.concrete, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; group.add(im);
  }
  // grandes losas caídas
  for (const [w, d, x, y, z, rx, ry, rz] of [[3.2, 2.4, -3.6, 0.5, -12.6, 0.24, 0.4, 0.08], [2.6, 2.2, 2.6, 0.42, -8.8, -0.2, -0.3, 0.06], [2.2, 1.8, -8.6, 0.36, -3.2, 0.16, 1.1, -0.1], [2.8, 1.6, -0.6, 0.55, -16.4, -0.3, 0.2, 0.1]]) {
    const m = box(w, 0.3, d, x, y, z, M.concrete, NC); m.rotation.set(rx, ry, rz);
    solid(x - w * 0.4, 0, z - d * 0.4, x + w * 0.4, 0.45, z + d * 0.4);
  }

  // ---------- puerta de entrada ----------
  const zf = D / 2;
  box(5.6, 0.5, 0.3, 0, 4.55, zf - 0.15, M.steel, NC);
  for (const s of [-1, 1]) {
    box(0.45, 4.3, 0.3, s * 2.6, 2.15, zf - 0.15, M.steel, NC);
    box(2.35, 4.25, 0.16, s * 1.19, 2.15, zf - 0.1, M.grey, NC);
    for (const y of [1.5, 2.6, 3.7]) box(2.2, 0.1, 0.2, s * 1.19, y, zf - 0.1, M.steel, DECO);
  }
  const exitBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.08), glow(7, 0.35, 0.2)); exitBox.position.set(0, 5.05, zf - 0.06); group.add(exitBox);
  const redL = addLight(new THREE.PointLight(0xff2a14, 8, 8, 2)); redL.position.set(0, 4.8, zf - 0.8);

  // ---------- rótulos ----------
  function stencil(tex, w, h, x, y, z, ry, opacity = 0.85) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; group.add(m); return m;
  }
  stencil(stencilTex('RUINS', { sub: 'AFTER THE FALL — GROUP EXHIBITION', color: '#141312', font: '900 300px "Helvetica Neue", Arial, sans-serif' }), 4.6, 2.3, -W / 2 + 0.01, 3.4, 0, PI / 2);
  stencil(stencilTex('GALLERY 07', { sub: '112 GREENE ST · NEW YORK', color: '#141312', font: '800 170px "Helvetica Neue", Arial, sans-serif' }), 4.4, 2.2, W / 2 - 0.01, 5.3, 4, -PI / 2);
  stencil(stencilTex('EXIT', { font: '900 300px "Helvetica Neue", Arial, sans-serif', color: '#200' }), 0.8, 0.4, 0, 5.05, zf - 0.105, PI, 0.9);

  // ---------- tubos fluorescentes ----------
  const tubeMat = glow(5, 6.6, 8), tubeFlick = glow(5, 6.6, 8);
  let flickLight = null;
  [[15.2, false], [-15.6, true]].forEach(([z, flick]) => {
    const x = W / 2 - 0.09;
    box(0.12, 0.12, 1.5, x, 5.9, z, M.dark, DECO);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.32, 10).rotateX(Math.PI / 2), flick ? tubeFlick : tubeMat);
    t.position.set(x - 0.085, 5.9, z); group.add(t);
    const l = addLight(new THREE.PointLight(0xbcdcff, 16, 10, 2)); l.position.set(x - 0.5, 5.9, z);
    if (flick) flickLight = l;
  });

  // ---------- lámparas colgantes (zonas aún cubiertas) ----------
  const coneMat = (color, intensity) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalMatrix * normal; vV = -mv.xyz; vH = uv.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); f = f * f;
        float h = clamp(vH, 0.0, 1.0); float a = f * h * h * smoothstep(0.0, 0.12, h) * uI; gl_FragColor = vec4(uColor * a, 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const shadeGeo = new THREE.LatheGeometry([new THREE.Vector2(0.04, 0.3), new THREE.Vector2(0.07, 0.27), new THREE.Vector2(0.1, 0.2), new THREE.Vector2(0.36, 0.03), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.43, -0.02)], 36);
  const shadeMat = pbr(T.grey, { side: THREE.DoubleSide, color: 0x555555 });
  const lampCone = coneMat(0xffb070, 0.07);
  function lamp(x, z, shadow) {
    const y = 5.2;
    cyl(0.012, H - y - 0.3, x, (H + y + 0.3) / 2, z, M.dark, 'y', { cast: false, seg: 6 });
    const sh = new THREE.Mesh(shadeGeo, shadeMat); sh.position.set(x, y, z); group.add(sh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), glow(14, 8, 3.5)); bulb.position.set(x, y + 0.04, z); group.add(bulb);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.33, 28), glow(2.2, 1.3, 0.6)); disc.rotation.x = Math.PI / 2; disc.position.set(x, y + 0.06, z); group.add(disc);
    const l = addLight(new THREE.SpotLight(0xffc084, 380, 14, 1.05, 0.8, 2));
    l.position.set(x, y - 0.03, z); l.target.position.set(x, 0, z); group.add(l.target);
    if (shadow) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.camera.near = 0.3; l.shadow.camera.far = 13; l.shadow.bias = -0.0006; l.shadow.normalBias = 0.03; l.shadow.radius = 4; }
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 4.2, y, 40, 1, true), lampCone); cone.position.set(x, y / 2, z); group.add(cone); noAO.push(cone);
  }
  lamp(-3, 14.6, true); lamp(9.4, -16, true); lamp(-9, 15, false);

  // ---------- skyline de Manhattan ----------
  { const fac = ['#3a2a22', '#2c2a2b', '#45382c', '#23262b', '#4a3026'].map((c) => { const t = facadeTex(R, c); const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.85 }); m.userData.tile = 1; return m; });
    const sunAz = Math.atan2(SUN.z, SUN.x);
    const tower = (x, y, z, s) => {
      const wood = M.rustM, g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); group.add(g);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 2.8, 16), wood); tank.position.y = 3.6; g.add(tank);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.1, 16), M.dark); roof.position.y = 5.55; g.add(roof);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.14), M.dark); leg.position.set(a, 1.15, b); g.add(leg); }
    };
    const bld = (x, z, w, d, h, k) => {
      const mat = fac[k % fac.length], geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv, dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const q = f * 4 + i; uv.setXY(q, uv.getX(q) * Math.max(1, Math.round(dims[f][0] / 11)), uv.getY(q) * Math.max(1, Math.round(dims[f][1] / 19))); }
      const m = new THREE.Mesh(geo, mat); m.position.set(x, h / 2 - 0.05, z); group.add(m);
      box(w + 0.6, 0.5, d + 0.6, x, h + 0.2, z, M.dark, { collide: false, ray: false, cast: false });
      if (R() < 0.45) tower(x + (R() - 0.5) * w * 0.4, h + 0.4, z + (R() - 0.5) * d * 0.4, 0.9 + R() * 0.5);
    };
    // acera de enfrente (visible por los ventanales) y manzanas alrededor
    let k = 0;
    for (let z = -44; z < 50; ) { const d = 12 + R() * 9, h = 13 + R() * 12; bld(-36 - R() * 3, z + d / 2, 16, d, z < -22 ? Math.min(h, 12) : h, k++); z += d + 0.4; }
    for (let x = -26; x < 44; ) { const w = 12 + R() * 10; bld(x + w / 2, -50 - R() * 6, w, 16, 10 + R() * 14, k++); x += w + 0.6; }
    for (let n = 0; n < 46; n++) {
      const a = R() * 6.28, r = 78 + R() * 150, w = 16 + R() * 20;
      let h = 28 + R() * R() * 150;
      let da = Math.abs(a - sunAz); if (da > Math.PI) da = 6.283 - da;
      if (da < 0.5) h = Math.min(h, r * 0.42);
      bld(Math.cos(a) * r, Math.sin(a) * r, w, w * (0.7 + R() * 0.6), h, k++);
    }
  }

  // ---------- haces de sol volumétricos ----------
  for (const c of WZ) shafts.push({ o: V(-W / 2, WY0, c - WH), u: V(0, 0, WH * 2), v: V(0, WY1 - WY0, 0), L: WY1 / -dl.y });
  shafts.push({ o: V(BX0 + 0.6, 1.4, -D / 2), u: V(BX1 - BX0 - 1.2, 0, 0), v: V(0, H - 1.4, 0), L: H / -dl.y });
  const rp = [], ruv = [], rw = [], ri = []; let rn = 0;
  const quad = (p, e, L, wt) => {
    const b = p.clone().add(e), c = b.clone().addScaledVector(dl, L), d = p.clone().addScaledVector(dl, L);
    rp.push(p.x, p.y, p.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z); ruv.push(0, 0, 0, 1, 1, 1, 1, 0); rw.push(wt, wt, wt, wt);
    ri.push(rn, rn + 1, rn + 2, rn, rn + 2, rn + 3); rn += 4;
  };
  for (const s of shafts) { const N = 5; for (let i = 0; i < N; i++) { const f = (i + 0.5) / N, wt = 0.55 + 0.45 * Math.sin(f * PI);
    quad(s.o.clone().addScaledVector(s.v, f), s.u, s.L, wt); quad(s.o.clone().addScaledVector(s.u, f), s.v, s.L, wt); } }
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rayGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rayGeo.setAttribute('aW', new THREE.Float32BufferAttribute(rw, 1)); rayGeo.setIndex(ri);
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color().setRGB(1.0, 0.66, 0.36) }, uI: { value: 0.028 }, uTime: { value: 0 }, tNoise: { value: T.noise } },
    vertexShader: `attribute float aW; varying vec2 vUv; varying float vW; varying vec3 vWp;
      void main(){ vUv = uv; vW = aW; vWp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uTime; uniform sampler2D tNoise; varying vec2 vUv; varying float vW; varying vec3 vWp;
      void main(){ float ux = clamp(vUv.x, 0.0, 1.0);
        float a = max(vW, 0.0) * max(sin(3.14159 * clamp(vUv.y, 0.0, 1.0)), 0.0) * smoothstep(0.0, 0.04, ux) * (1.0 - ux * 0.55);
        float n = texture2D(tNoise, vWp.xz * 0.11 + vec2(uTime * 0.012, vWp.y * 0.09 - uTime * 0.02)).r;
        a *= 0.3 + 1.4 * n; gl_FragColor = vec4(uColor * a * uI, 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const rays = new THREE.Mesh(rayGeo, rayMat); rays.frustumCulled = false; group.add(rays); noAO.push(rays);

  // polvo en suspensión dentro de los haces
  const ND = 1100, dustBase = new Float32Array(ND * 3), dustPos = new Float32Array(ND * 3), dustPh = new Float32Array(ND);
  const tmp = V(0, 0, 0);
  for (let i = 0; i < ND; i++) {
    const s = shafts[Math.floor(Math.random() * shafts.length)];
    tmp.copy(s.o).addScaledVector(s.u, Math.random()).addScaledVector(s.v, Math.random()).addScaledVector(dl, Math.random() * s.L);
    if (tmp.y < 0.08) tmp.y = 0.08 + Math.random() * 0.6;
    tmp.x = THREE.MathUtils.clamp(tmp.x, -11.8, 11.8); tmp.z = THREE.MathUtils.clamp(tmp.z, -17.8, 17.8);
    dustBase.set([tmp.x, tmp.y, tmp.z], i * 3); dustPh[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.03, map: T.dot, color: new THREE.Color().setRGB(2.2, 1.6, 1.0), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  dust.frustumCulled = false; group.add(dust);

  // los drones entran por los huecos del techo
  const spawns = [V(-3, 9, -15), V(3, 9, -9), V(-9, 9, -3), V(3, 9, 3), V(-3, 9, 9)];

  function update(dt, time) {
    rayMat.uniforms.uTime.value = time; skyMat.uniforms.uTime.value = time;
    hero.rotation.y = time * 0.12;
    for (let i = 0; i < ND; i++) {
      const ph = dustPh[i], j = i * 3;
      dustPos[j] = dustBase[j] + Math.sin(time * 0.21 + ph) * 0.25;
      dustPos[j + 1] = dustBase[j + 1] + Math.sin(time * 0.13 + ph * 1.7) * 0.18;
      dustPos[j + 2] = dustBase[j + 2] + Math.cos(time * 0.17 + ph * 0.6) * 0.25;
    }
    dustGeo.attributes.position.needsUpdate = true;
    const f = (Math.sin(time * 31) > 0.82 || Math.sin(time * 7.3 + Math.sin(time * 1.7) * 4) > 0.93) ? 0.12 : 1;
    tubeFlick.color.setRGB(5 * f, 6.6 * f, 8 * f); if (flickLight) flickLight.intensity = 16 * f;
  }
  update(0, 0);

  return { group, colliders, rayMeshes, noAO, lights, spawns, update, bounds: { x: W / 2, z: D / 2, h: 10 }, fxOnly: [rays, dust] };
}
