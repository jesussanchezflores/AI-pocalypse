// Fusil de asalto modelado proceduralmente + animación en primera persona.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr } from './textures.js';

class Parts {
  constructor() { this.b = new Map(); }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.b.has(mat)) this.b.set(mat, []);
    this.b.get(mat).push(g);
  }
  build(parent) {
    for (const [mat, list] of this.b) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.layers.set(1); m.frustumCulled = false; m.receiveShadow = true; parent.add(m);
    }
  }
}
const rb = (w, h, d, r = 0.003) => new RoundedBoxGeometry(w, h, d, 2, r);
const cz = (r, len, seg = 20, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2);
const cx = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);

const ease01 = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

export const SIGHT_Y = 0.079;
export const MUZZLE_Z = -0.66;

export class Weapon {
  constructor(camera, T) {
    this.root = new THREE.Group(); camera.add(this.root);
    this.gun = new THREE.Group(); this.root.add(this.gun);

    const metal = pbr(T.gunmetal, { color: 0x25282c, envMapIntensity: 2.2 });
    const steel = pbr(T.gunmetal, { color: 0x4a4e54, envMapIntensity: 2.2 });
    const poly = pbr(T.polymer, { color: 0x1a1a1c, metalness: 0, envMapIntensity: 2 });
    const tan = pbr(T.polymer, { color: 0x2a2620, metalness: 0 });
    const black = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.9 });

    const P = new Parts();
    // cajón de mecanismos
    P.add(metal, rb(0.044, 0.05, 0.25, 0.006), 0, 0.0, -0.02);
    P.add(metal, rb(0.04, 0.046, 0.18, 0.005), 0, -0.04, 0.005);
    P.add(metal, rb(0.038, 0.062, 0.072, 0.004), 0, -0.066, -0.062);
    P.add(black, new THREE.BoxGeometry(0.002, 0.018, 0.058), 0.0222, 0.006, -0.035);       // ventana de expulsión
    P.add(steel, rb(0.003, 0.016, 0.05, 0.001), 0.0235, 0.006, 0.03);                        // guardapolvo
    P.add(steel, cx(0.0045, 0.047), 0, -0.03, -0.085); P.add(steel, cx(0.0045, 0.047), 0, -0.035, 0.06); // pasadores
    P.add(steel, cx(0.006, 0.05), 0, -0.012, 0.075);
    P.add(metal, cz(0.008, 0.02, 12), 0.027, 0.004, 0.06, 0, 0.5, 0);                        // forward assist
    P.add(metal, rb(0.032, 0.011, 0.034, 0.003), 0, 0.024, 0.105);                           // palanca de carga
    P.add(steel, rb(0.014, 0.008, 0.012, 0.002), -0.021, 0.024, 0.11);
    // empuñadura, gatillo
    P.add(poly, rb(0.033, 0.11, 0.046, 0.009), 0, -0.105, 0.078, -0.32);
    P.add(metal, new THREE.BoxGeometry(0.007, 0.005, 0.066), 0, -0.088, 0.02);
    P.add(metal, new THREE.BoxGeometry(0.007, 0.03, 0.005), 0, -0.074, -0.012);
    P.add(steel, rb(0.006, 0.024, 0.008, 0.002), 0, -0.07, 0.026, 0.3);
    // culata
    P.add(metal, cz(0.0155, 0.2, 16), 0, -0.002, 0.2);
    P.add(poly, rb(0.042, 0.062, 0.17, 0.008), 0, -0.012, 0.29);
    P.add(poly, rb(0.04, 0.12, 0.035, 0.008), 0, -0.04, 0.385);
    P.add(poly, rb(0.036, 0.05, 0.1, 0.006), 0, -0.065, 0.32, 0.35);
    // guardamanos
    P.add(metal, rb(0.047, 0.052, 0.31, 0.01), 0, 0.001, -0.3);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      P.add(black, rb(0.002, 0.011, 0.034, 0.0008), s * 0.0238, 0.004, -0.185 - i * 0.045);
      P.add(black, rb(0.002, 0.011, 0.034, 0.0008), s * 0.0195, -0.02, -0.185 - i * 0.045, 0, 0, s * -0.7);
    }
    for (let i = 0; i < 5; i++) P.add(black, rb(0.012, 0.002, 0.034, 0.0008), 0, -0.0255, -0.2 - i * 0.05);
    // raíl superior picatinny
    P.add(metal, new THREE.BoxGeometry(0.021, 0.006, 0.565), 0, 0.027, -0.17);
    for (let i = 0; i < 44; i++) P.add(metal, rb(0.0215, 0.0055, 0.0062, 0.0008), 0, 0.0325, 0.105 - i * 0.0128);
    // cañón y freno de boca
    P.add(steel, cz(0.0092, 0.17, 20), 0, 0.001, -0.535);
    P.add(metal, cz(0.0145, 0.03, 20), 0, 0.001, -0.475);
    P.add(metal, cz(0.0135, 0.07, 20), 0, 0.001, -0.625);
    P.add(metal, cz(0.0158, 0.009, 20), 0, 0.001, -0.598);
    P.add(metal, cz(0.0158, 0.009, 20), 0, 0.001, -0.653);
    for (const z of [-0.615, -0.632]) P.add(black, new THREE.BoxGeometry(0.03, 0.007, 0.008), 0, 0.001, z);
    P.add(black, cz(0.006, 0.004, 12), 0, 0.001, MUZZLE_Z);
    // empuñadura vertical
    P.add(poly, rb(0.029, 0.085, 0.031, 0.009), 0, -0.07, -0.3, 0.08);
    P.add(metal, rb(0.03, 0.012, 0.05, 0.003), 0, -0.03, -0.3);
    // linterna/láser lateral
    P.add(metal, rb(0.012, 0.02, 0.04, 0.003), 0.028, 0.004, -0.38);
    P.add(metal, cz(0.0125, 0.075, 18), 0.042, 0.004, -0.385);
    P.add(metal, cz(0.0155, 0.022, 18), 0.042, 0.004, -0.43);
    // miras abatibles
    P.add(metal, rb(0.02, 0.01, 0.03, 0.002), 0, 0.04, -0.43); P.add(metal, rb(0.02, 0.01, 0.03, 0.002), 0, 0.04, 0.085);
    // visor holográfico
    P.add(metal, rb(0.032, 0.014, 0.07, 0.003), 0, 0.042, -0.035);
    P.add(steel, cx(0.006, 0.042), 0, 0.04, -0.035);
    P.add(metal, rb(0.004, 0.044, 0.05, 0.0015), 0.0205, 0.071, -0.035); P.add(metal, rb(0.004, 0.044, 0.05, 0.0015), -0.0205, 0.071, -0.035);
    P.add(metal, rb(0.045, 0.004, 0.05, 0.0015), 0, 0.0945, -0.035);
    P.add(metal, rb(0.04, 0.02, 0.035, 0.004), 0, 0.058, 0.012);
    P.add(tan, rb(0.012, 0.008, 0.014, 0.002), 0.024, 0.056, 0.012);
    P.build(this.gun);

    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.037, 0.04), new THREE.MeshStandardMaterial({ color: 0x7fb0d0, transparent: true, opacity: 0.13, roughness: 0.03, metalness: 1, depthWrite: false }));
    lens.position.set(0, 0.072, -0.035); lens.layers.set(1); this.gun.add(lens);
    const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.0075, 0.0075), new THREE.MeshBasicMaterial({ map: T.dot, color: new THREE.Color().setRGB(9, 0.5, 0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    dot.position.set(0, SIGHT_Y, -0.036); dot.layers.set(1); dot.renderOrder = 5; this.gun.add(dot); this.dot = dot;
    const torch = new THREE.Mesh(new THREE.CircleGeometry(0.011, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.5, 0.6, 0.7) }));
    torch.position.set(0.042, 0.004, -0.4415); torch.rotation.y = Math.PI; torch.layers.set(1); this.gun.add(torch);

    // cargador (animable)
    this.mag = new THREE.Group(); this.gun.add(this.mag);
    const PM = new Parts();
    PM.add(poly, rb(0.027, 0.175, 0.058, 0.005), 0, -0.165, -0.07, 0.2);
    for (let i = 0; i < 4; i++) PM.add(poly, rb(0.0285, 0.006, 0.05, 0.002), 0, -0.13 - i * 0.03, -0.063 - i * 0.006, 0.2);
    PM.add(poly, rb(0.03, 0.012, 0.064, 0.004), 0, -0.25, -0.088, 0.2);
    PM.build(this.mag);

    // fogonazo
    this.flash = new THREE.Group(); this.flash.position.set(0, 0.001, MUZZLE_Z - 0.02); this.gun.add(this.flash);
    const fm = new THREE.MeshBasicMaterial({ map: T.flash, color: new THREE.Color().setRGB(7, 4.5, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flashMat = fm;
    const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), fm); this.flash.add(f1);
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), fm); f2.rotation.y = Math.PI / 2; f2.position.z = -0.12; this.flash.add(f2);
    const f3 = f2.clone(); f3.rotation.set(Math.PI / 2, 0, Math.PI / 2); this.flash.add(f3);
    this.flash.traverse((o) => { o.layers.set(1); o.frustumCulled = false; });
    this.flash.visible = false; this.flashT = 0;

    // ---------- mano enguantada + frasco (truco del escudo) ----------
    {
      const hand = this.hand = new THREE.Group(); camera.add(hand); hand.visible = false;
      const hm = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); hand.add(m); return m; };
      const glove = pbr(T.polymer, { color: 0x1d1e21, metalness: 0, envMapIntensity: 1.6 });
      const padM = pbr(T.polymer, { color: 0x3b3d42, metalness: 0, envMapIntensity: 1.6 });
      const sleeve = pbr(T.polymer, { color: 0x2f3426, metalness: 0 });
      const glass = new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.38, roughness: 0.03, metalness: 1, depthWrite: false, side: THREE.DoubleSide });
      const FR = 0.027, GR = FR + 0.0105, rad = Math.PI / 180;
      // frasco de vidrio con líquido luminoso
      const liqGeo = new THREE.CylinderGeometry(FR - 0.003, FR - 0.003, 0.1, 24); liqGeo.translate(0, 0.05, 0);
      this.liquid = hm(liqGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.22, 1.5, 3.4) }), 0, -0.052, 0);
      hm(new THREE.CylinderGeometry(FR, FR, 0.112, 32, 1, true), glass).renderOrder = 2;
      hm(new THREE.CylinderGeometry(FR, FR * 0.96, 0.007, 32), steel, 0, -0.058, 0);
      hm(new THREE.CylinderGeometry(0.014, FR, 0.014, 32, 1, true), glass, 0, 0.063, 0).renderOrder = 2;
      hm(new THREE.CylinderGeometry(0.014, 0.014, 0.016, 20, 1, true), steel, 0, 0.078, 0);
      hm(new THREE.TorusGeometry(0.0145, 0.003, 8, 24), steel, 0, 0.087, 0).rotation.x = Math.PI / 2;
      hm(new THREE.TorusGeometry(FR + 0.001, 0.0025, 8, 32), steel, 0, 0.052, 0).rotation.x = Math.PI / 2;
      // dedos rodeando el frasco
      const arc = (a0, a1, y0, y1, r, R = GR) => {
        const pts = []; for (let i = 0; i <= 8; i++) { const f = i / 8, a = (a0 + (a1 - a0) * f) * rad; pts.push(new THREE.Vector3(Math.cos(a) * R, y0 + (y1 - y0) * f, Math.sin(a) * R)); }
        hm(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 10), glove);
        const e = pts[8]; hm(new THREE.SphereGeometry(r, 10, 8), glove, e.x, e.y, e.z);
        const k = pts[2]; hm(new THREE.SphereGeometry(r * 1.12, 10, 8), padM, k.x * 1.04, k.y, k.z * 1.04);
      };
      for (let k = 0; k < 4; k++) arc(196, 352 - k * 9 - (k === 3 ? 14 : 0), -0.036 + k * 0.0215, -0.04 + k * 0.0215, k === 3 ? 0.0088 : 0.0098);
      arc(158, 62, 0.012, 0.04, 0.0112);
      hm(new RoundedBoxGeometry(0.032, 0.094, 0.078, 3, 0.012), glove, -(GR + 0.01), -0.006, 0.004);
      hm(new RoundedBoxGeometry(0.01, 0.06, 0.05, 2, 0.004), padM, -(GR + 0.027), -0.002, 0.0);
      // muñeca y antebrazo
      const dir = new THREE.Vector3(-0.42, -0.74, 0.52).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      const base = new THREE.Vector3(-(GR + 0.012), -0.04, 0.01);
      const cuff = hm(new THREE.CylinderGeometry(0.031, 0.036, 0.07, 20), glove); cuff.position.copy(base).addScaledVector(dir, 0.04); cuff.quaternion.copy(q);
      const band = hm(new THREE.CylinderGeometry(0.038, 0.038, 0.018, 20), padM); band.position.copy(base).addScaledVector(dir, 0.075); band.quaternion.copy(q);
      const arm = hm(new THREE.CylinderGeometry(0.037, 0.05, 0.5, 20), sleeve); arm.position.copy(base).addScaledVector(dir, 0.33); arm.quaternion.copy(q);
      hand.traverse((o) => { o.layers.set(1); o.frustumCulled = false; if (o.isMesh) o.receiveShadow = true; });
    }

    // luces de relleno solo para el arma (capa 1)
    const key = new THREE.PointLight(0xcfe0ff, 0.5, 3, 2); key.position.set(-0.35, 0.3, -0.25); key.layers.set(1); camera.add(key);
    const rim = new THREE.PointLight(0xffc890, 0.35, 3, 2); rim.position.set(0.45, 0.1, -0.75); rim.layers.set(1); camera.add(rim);
    this.hip = new THREE.Vector3(0.1, -0.118, -0.44);
    this.adsPos = new THREE.Vector3(0, -SIGHT_Y, -0.3);
    this.magSize = 30; this.reset();
    this.sway = new THREE.Vector2(); this.kick = 0; this.kickRot = 0; this.bob = 0; this.adsT = 0; this.sprintT = 0; this.landT = 0;
    this._v = new THREE.Vector3();
  }

  reset() { this.ammo = this.magSize; this.reserve = Infinity; this.reloadT = 0; this.cool = 0; this.drinkT = 0; if (this.hand) { this.hand.visible = false; this.liquid.scale.y = 1; } }
  drink() { this.drinkT = 2.1; this.liquid.scale.y = 1; }
  get reloading() { return this.reloadT > 0; }

  canFire() { return this.cool <= 0 && !this.reloading && this.ammo > 0 && this.sprintT < 0.35 && this.drinkT <= 0; }
  fire() {
    this.ammo--; this.cool = 0.092;
    this.kick = Math.min(this.kick + 0.022, 0.05); this.kickRot = Math.min(this.kickRot + 0.03, 0.07);
    this.flash.visible = true; this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * 6.28; this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
  }
  startReload() {
    if (this.reloading || this.ammo === this.magSize || this.reserve <= 0) return false;
    this.reloadT = 2.0; return true;
  }
  muzzleWorld(out) { return this.flash.getWorldPosition(out); }
  ejectWorld(out) { return this.gun.localToWorld(out.set(0.03, 0.01, -0.035)); }

  update(dt, s) {
    this.cool -= dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    const k = (r) => 1 - Math.exp(-r * dt);
    const wantAds = s.ads && !this.reloading && !s.sprint;
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * k(14);
    this.sprintT += ((s.sprint && !this.reloading ? 1 : 0) - this.sprintT) * k(8);
    this.kick += (0 - this.kick) * k(16); this.kickRot += (0 - this.kickRot) * k(13);
    this.sway.x += (THREE.MathUtils.clamp(-s.mdx * 0.00045, -0.03, 0.03) - this.sway.x) * k(9);
    this.sway.y += (THREE.MathUtils.clamp(s.mdy * 0.00045, -0.03, 0.03) - this.sway.y) * k(9);
    this.landT += (0 - this.landT) * k(7);
    this.bob += dt * s.speed * 1.75;
    const a = this.adsT, bobAmt = (s.onGround ? Math.min(1, s.speed / 4) : 0) * (1 - a * 0.88);
    const bx = Math.sin(this.bob) * 0.0075 * bobAmt, by = -Math.abs(Math.cos(this.bob)) * 0.006 * bobAmt;
    const idle = Math.sin(s.time * 1.3) * 0.0015 * (1 - a * 0.7);

    const g = this.root;
    g.position.lerpVectors(this.hip, this.adsPos, a);
    g.position.x += bx + this.sway.x * (1 - a * 0.6);
    g.position.y += by + idle + this.sway.y * (1 - a * 0.6) - this.landT * 0.03 - s.vy * 0.0025 * (1 - a);
    g.position.z += this.kick * (1 - a * 0.35);
    g.rotation.set(this.kickRot * (1 - a * 0.6) + this.sway.y * 1.2 - this.landT * 0.08, (1 - a) * 0.035 + this.sway.x * 1.6, this.sway.x * -1.4 + s.strafe * -0.035 * (1 - a));
    // sprint: arma cruzada
    const sp = this.sprintT;
    g.position.x -= sp * 0.05; g.position.y -= sp * 0.035; g.rotation.y += sp * 0.75; g.rotation.x -= sp * 0.25; g.rotation.z += sp * 0.2;

    // recarga
    let done = false;
    if (this.reloadT > 0) {
      const prev = this.reloadT; this.reloadT -= dt;
      const t = 2.0 - this.reloadT;
      const ease = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      const tilt = ease(t / 0.3) - ease((t - 1.65) / 0.35);
      g.rotation.z += tilt * 0.55; g.rotation.x += tilt * 0.22; g.position.y -= tilt * 0.035; g.position.x -= tilt * 0.02;
      const out = ease((t - 0.25) / 0.2), back = ease((t - 0.95) / 0.22);
      const mOff = out - back;
      this.mag.position.set(0, -mOff * 0.3, mOff * 0.05); this.mag.rotation.x = mOff * 0.3;
      this.mag.visible = !(t > 0.5 && t < 0.9);
      const bump = Math.max(0, 1 - Math.abs(t - 1.17) / 0.08); g.position.y += bump * 0.012;
      const slap = Math.max(0, 1 - Math.abs(t - 1.66) / 0.07); g.position.z += slap * 0.015; g.rotation.y -= slap * 0.04;
      if (prev > 0 && this.reloadT <= 0) {
        const need = this.magSize - this.ammo, take = Math.min(need, this.reserve);
        this.ammo += take;                                  // munición de reserva infinita this.reloadT = 0; done = true;
        this.mag.position.set(0, 0, 0); this.mag.rotation.x = 0; this.mag.visible = true;
      }
    }
    // beber el frasco
    if (this.drinkT > 0) {
      this.drinkT -= dt;
      const t = 2.1 - this.drinkT, mixv = (a, b, f) => a + (b - a) * f;
      const up = ease01(t / 0.4) - ease01((t - 1.6) / 0.5), tip = ease01((t - 0.4) / 0.25) - ease01((t - 1.35) / 0.25);
      const gulp = tip * Math.max(0, Math.sin((t - 0.62) * Math.PI * 2 / 0.22)) * 0.006;
      const h = this.hand; h.visible = this.drinkT > 0;
      h.position.set(mixv(-0.3, -0.06, up) + tip * 0.045, mixv(-0.52, -0.14, up) + tip * 0.05 + gulp, mixv(-0.3, -0.38, up) + tip * 0.13);
      h.rotation.set(tip * 1.0, 0.45 - tip * 0.15, -0.3 * (1 - up) + tip * 0.08);
      this.liquid.scale.y = Math.max(0.03, 1 - ease01((t - 0.62) / 0.7));
      g.position.y -= up * 0.1; g.position.x += up * 0.03; g.rotation.x -= up * 0.32; g.rotation.z -= up * 0.15;
    }
    this.dot.visible = true;
    return done;
  }
}
