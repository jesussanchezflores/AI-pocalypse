// Efectos: chispas, humo, impactos, trazadoras, casquillos, explosiones y luces de destello (todo con pools).
import * as THREE from 'three';

const G = 12;

export class FX {
  constructor(scene, T) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.decalRoot = new THREE.Group(); scene.add(this.decalRoot);

    // chispas
    const N = this.N = 700;
    this.sp = new Float32Array(N * 3).fill(-999); this.sc = new Float32Array(N * 3);
    this.sv = new Float32Array(N * 3); this.sl = new Float32Array(N); this.sm = new Float32Array(N); this.sb = new Float32Array(N * 3);
    this.si = 0;
    const g = this.sparkGeo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.sc, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, map: T.dot, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    pts.frustumCulled = false; this.root.add(pts);

    // humo
    this.smokes = [];
    for (let i = 0; i < 28; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, color: 0x8a8a8a, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; this.root.add(s); this.smokes.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1, op: 0.3 });
    }
    this.smI = 0;
    // bolas de fuego
    this.fires = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, color: new THREE.Color().setRGB(6, 3, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false; this.root.add(s); this.fires.push({ s, life: 0, max: 0.2, size: 1 });
    }
    this.fiI = 0;

    // marcas de bala
    this.decals = []; this.dI = 0;
    const dMat = new THREE.MeshStandardMaterial({ map: T.hole, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 });
    const dGeo = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(dGeo, dMat); m.visible = false; this.decalRoot.add(m); this.decals.push(m); }

    // trazadoras
    this.tracers = []; this.tI = 0;
    const tGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    const tMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(7, 4.5, 1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(tGeo, tMat); m.visible = false; m.frustumCulled = false; this.root.add(m); this.tracers.push({ m, a: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, on: false }); }

    // casquillos
    this.shells = []; this.shI = 0;
    const sGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.024, 8);
    const sMat = new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 1, roughness: 0.28 });
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(sGeo, sMat); m.visible = false; m.castShadow = true; this.root.add(m); this.shells.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 }); }

    // escombros
    this.debris = []; this.dbI = 0;
    const bMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.9, roughness: 0.45 });
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06 + Math.random() * 0.12, 0.03 + Math.random() * 0.06, 0.06 + Math.random() * 0.14), bMat);
      m.visible = false; m.castShadow = true; this.root.add(m); this.debris.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 });
    }

    // luces de destello (número fijo para no recompilar shaders)
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 2); l.layers.enable(1); scene.add(l); this.lights.push({ l, life: 0, max: 1, peak: 0 }); }
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1);
  }

  flash(pos, color, intensity, dur) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.life <= 0) { best = L; break; } else if (L.life / L.max < best.life / best.max) best = L;
    best.l.position.copy(pos); best.l.color.set(color); best.peak = intensity; best.max = best.life = dur; best.l.intensity = intensity;
  }

  sparks(pos, dir, count, { speed = 5, spread = 0.7, color = [9, 5, 1.5], life = 0.5 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.si = (this.si + 1) % this.N, j = i * 3;
      const sp = speed * (0.3 + Math.random());
      this.sp[j] = pos.x; this.sp[j + 1] = pos.y; this.sp[j + 2] = pos.z;
      this.sv[j] = (dir.x + (Math.random() - 0.5) * 2 * spread) * sp;
      this.sv[j + 1] = (dir.y + (Math.random() - 0.5) * 2 * spread) * sp;
      this.sv[j + 2] = (dir.z + (Math.random() - 0.5) * 2 * spread) * sp;
      this.sb[j] = color[0]; this.sb[j + 1] = color[1]; this.sb[j + 2] = color[2];
      this.sl[i] = this.sm[i] = life * (0.4 + Math.random() * 0.9);
    }
  }

  smoke(pos, { size = 0.3, grow = 1.2, life = 1.4, op = 0.22, vel = null, color = 0x8a8a8a } = {}) {
    const p = this.smokes[this.smI = (this.smI + 1) % this.smokes.length];
    p.s.position.copy(pos); p.s.scale.setScalar(size); p.s.material.rotation = Math.random() * 6.28; p.s.material.color.set(color);
    p.life = p.max = life; p.grow = grow; p.op = op; p.s.visible = true;
    if (vel) p.vel.copy(vel); else p.vel.set((Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
  }

  fireball(pos, size, dur) {
    const f = this.fires[this.fiI = (this.fiI + 1) % this.fires.length];
    f.s.position.copy(pos); f.size = size; f.life = f.max = dur; f.s.visible = true; f.s.material.rotation = Math.random() * 6.28;
  }

  impact(pos, normal) {
    const d = this.decals[this.dI = (this.dI + 1) % this.decals.length];
    d.position.copy(pos).addScaledVector(normal, 0.004);
    d.quaternion.setFromUnitVectors(this._z, normal);
    d.rotateZ(Math.random() * 6.28); d.scale.setScalar(0.7 + Math.random() * 0.6); d.visible = true;
    this.sparks(pos, normal, 10, { speed: 4.5, spread: 0.8, life: 0.35 });
    this._v.copy(pos).addScaledVector(normal, 0.08);
    this.smoke(this._v, { size: 0.14, grow: 0.7, life: 0.8, op: 0.2, vel: this._v.clone().copy(normal).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.15, 0)) });
  }

  tracer(from, to) {
    const t = this.tracers[this.tI = (this.tI + 1) % this.tracers.length];
    t.a.copy(from); t.dir.copy(to).sub(from); t.len = t.dir.length(); t.dir.divideScalar(t.len || 1); t.t = 0; t.on = true;
    t.m.quaternion.setFromUnitVectors(this._z, t.dir);
  }

  shell(pos, vel) {
    const s = this.shells[this.shI = (this.shI + 1) % this.shells.length];
    s.m.position.copy(pos); s.v.copy(vel); s.w.set(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
    s.life = 4; s.m.visible = true;
  }

  explosion(pos) {
    this.flash(pos, 0xff8a3a, 900, 0.45);
    this.fireball(pos, 2.6, 0.22); this.fireball(pos, 1.6, 0.32);
    this.sparks(pos, this._v.set(0, 0.4, 0), 90, { speed: 9, spread: 1.0, life: 1.0, color: [10, 5, 1.2] });
    this.sparks(pos, this._v.set(0, 0.2, 0), 40, { speed: 4, spread: 1.0, life: 0.6, color: [3, 6, 10] });
    for (let i = 0; i < 5; i++) {
      this.smoke(this._v.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5)), { size: 0.7, grow: 1.6, life: 2.2, op: 0.3, color: 0x2c2c2c });
    }
    for (let i = 0; i < 9; i++) {
      const d = this.debris[this.dbI = (this.dbI + 1) % this.debris.length];
      d.m.position.copy(pos); d.v.set((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9);
      d.w.set(Math.random() * 16 - 8, Math.random() * 16 - 8, Math.random() * 16 - 8); d.life = 6; d.m.visible = true; d.m.scale.setScalar(1);
    }
  }

  _phys(o, dt, floorY) {
    o.v.y -= G * dt; o.m.position.addScaledVector(o.v, dt);
    o.m.rotation.x += o.w.x * dt; o.m.rotation.y += o.w.y * dt; o.m.rotation.z += o.w.z * dt;
    if (o.m.position.y < floorY) {
      o.m.position.y = floorY;
      if (Math.abs(o.v.y) > 0.6) { o.v.y *= -0.38; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.5); }
      else { o.v.set(0, 0, 0); o.w.set(0, 0, 0); o.m.rotation.x = Math.PI / 2; o.m.rotation.y = 0; }
      return true;
    }
    return false;
  }

  update(dt, onShellBounce) {
    // chispas
    const { sp, sv, sc, sl, sm, sb } = this;
    for (let i = 0; i < this.N; i++) {
      if (sl[i] <= 0) continue;
      const j = i * 3;
      sl[i] -= dt;
      if (sl[i] <= 0) { sp[j + 1] = -999; sc[j] = sc[j + 1] = sc[j + 2] = 0; continue; }
      sv[j + 1] -= G * dt; const dr = 1 - 1.2 * dt; sv[j] *= dr; sv[j + 2] *= dr;
      sp[j] += sv[j] * dt; sp[j + 1] += sv[j + 1] * dt; sp[j + 2] += sv[j + 2] * dt;
      if (sp[j + 1] < 0.02 && sv[j + 1] < 0) { sp[j + 1] = 0.02; sv[j + 1] *= -0.4; }
      const k = sl[i] / sm[i], f = k * k;
      sc[j] = sb[j] * f; sc[j + 1] = sb[j + 1] * f * k; sc[j + 2] = sb[j + 2] * f * k;
    }
    this.sparkGeo.attributes.position.needsUpdate = true; this.sparkGeo.attributes.color.needsUpdate = true;

    for (const p of this.smokes) {
      if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.s.position.addScaledVector(p.vel, dt); p.s.scale.addScalar(p.grow * dt);
      p.s.material.opacity = p.op * Math.min(1, k * 1.6) * Math.min(1, (1 - k) * 8);
    }
    for (const f of this.fires) {
      if (f.life <= 0) continue;
      f.life -= dt; if (f.life <= 0) { f.s.visible = false; continue; }
      const k = f.life / f.max; f.s.scale.setScalar(f.size * (1.2 - k * 0.8)); f.s.material.opacity = k;
    }
    for (const t of this.tracers) {
      if (!t.on) continue;
      t.t += dt * 220;
      const head = Math.min(t.t, t.len), tail = Math.max(0, t.t - 5);
      if (tail >= t.len) { t.on = false; t.m.visible = false; continue; }
      t.m.visible = head - tail > 0.05;
      t.m.position.copy(t.a).addScaledVector(t.dir, (head + tail) / 2); t.m.scale.z = Math.max(0.05, head - tail);
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt; if (s.life <= 0) { s.m.visible = false; continue; }
      if (s.v.lengthSq() > 0 || s.m.position.y > 0.006) { if (this._phys(s, dt, 0.005) && onShellBounce && Math.abs(s.v.y) > 0.3) onShellBounce(s.m.position); }
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt; if (d.life <= 0) { d.m.visible = false; continue; }
      if (d.life < 1) d.m.scale.setScalar(d.life);
      if (d.v.lengthSq() > 0 || d.m.position.y > 0.04) this._phys(d, dt, 0.03);
    }
    for (const L of this.lights) {
      if (L.life <= 0) continue;
      L.life -= dt; const k = Math.max(0, L.life / L.max); L.l.intensity = L.peak * k * k;
    }
  }

  reset() {
    this.decals.forEach((d) => (d.visible = false));
    this.debris.forEach((d) => { d.life = 0; d.m.visible = false; });
    this.shells.forEach((d) => { d.life = 0; d.m.visible = false; });
  }
}
