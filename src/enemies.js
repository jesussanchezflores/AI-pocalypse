// Drones de seguridad hostiles: IA de vuelo, disparo de proyectiles de plasma y destrucción.
import * as THREE from 'three';
import { pbr } from './textures.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tq = new THREE.Quaternion(), tm = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class Drones {
  constructor(scene, T, fx, audio, level) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.fx = fx; this.audio = audio; this.level = level; this.list = [];
    this.mBody = pbr(T.gunmetal, { color: 0x1c1f23 });
    this.mArmor = pbr(T.white);
    this.mDark = pbr(T.polymer, { color: 0x09090a, metalness: 0 });
    this.mSteel = pbr(T.gunmetal, { color: 0x50545a });
    this.mThr = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.5, 5, 9) });
    this.g = {
      body: new THREE.SphereGeometry(0.29, 36, 24),
      top: new THREE.SphereGeometry(0.325, 36, 12, 0, Math.PI * 2, 0, Math.PI * 0.4),
      bot: new THREE.SphereGeometry(0.315, 36, 8, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.2),
      ring: new THREE.TorusGeometry(0.305, 0.022, 10, 48),
      eyeH: new THREE.CylinderGeometry(0.125, 0.15, 0.1, 28).rotateX(Math.PI / 2),
      eyeR: new THREE.TorusGeometry(0.105, 0.014, 8, 32),
      eye: new THREE.SphereGeometry(0.085, 20, 14),
      pod: new THREE.CylinderGeometry(0.075, 0.06, 0.3, 20).rotateX(Math.PI / 2),
      podC: new THREE.CircleGeometry(0.052, 20),
      strut: new THREE.BoxGeometry(0.2, 0.04, 0.09),
      gun: new THREE.CylinderGeometry(0.022, 0.026, 0.24, 12).rotateX(Math.PI / 2),
      ant: new THREE.CylinderGeometry(0.004, 0.006, 0.28, 6),
    };
    // proyectiles
    this.shots = [];
    const sg = new THREE.SphereGeometry(0.07, 12, 8); sg.scale(1, 1, 3.5);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(10, 2.6, 0.5) }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: new THREE.Color().setRGB(3, 0.8, 0.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      halo.scale.setScalar(0.7); m.add(halo);
      m.visible = false; fx.root.add(m); this.shots.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.ray = new THREE.Ray();
  }

  get alive() { return this.list.length; }

  spawn(pos) {
    const g = this.g, d = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; d.add(m); return m; };
    add(g.body, this.mBody); add(g.top, this.mArmor); add(g.bot, this.mArmor);
    add(g.ring, this.mDark).rotation.x = Math.PI / 2;
    add(g.eyeH, this.mDark, 0, 0, 0.24); add(g.eyeR, this.mSteel, 0, 0, 0.295);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 0.5, 0.3) });
    const eye = add(g.eye, eyeMat, 0, 0, 0.255); eye.castShadow = false;
    for (const s of [-1, 1]) {
      add(g.pod, this.mBody, s * 0.47, -0.02, -0.02); add(g.strut, this.mDark, s * 0.35, -0.02, -0.02);
      const c = add(g.podC, this.mThr, s * 0.47, -0.02, -0.172); c.rotation.y = Math.PI; c.castShadow = false;
    }
    add(g.gun, this.mSteel, 0, -0.23, 0.2); add(g.ant, this.mSteel, -0.1, 0.42, -0.08);
    d.position.copy(pos); d.scale.setScalar(0.01);
    this.group.add(d);
    const drone = {
      obj: d, eyeMat, hp: 100, vel: new THREE.Vector3(0, -1.5, 0), target: pos.clone(), retarget: 0, cool: 1.6 + Math.random() * 2,
      charge: 0, age: 0, flash: 0, ph: Math.random() * 10, hum: this.audio.droneHum(), wob: new THREE.Vector3(),
    };
    d.userData.drone = drone; this.list.push(drone);
    this.fx.sparks(pos, tmp.set(0, -1, 0), 20, { speed: 3, color: [9, 1, 0.5], life: 0.5 });
    return drone;
  }

  find(obj) { while (obj) { if (obj.userData.drone) return obj.userData.drone; obj = obj.parent; } return null; }

  damage(drone, dmg, point, dir) {
    if (drone.hp <= 0) return false;
    drone.hp -= dmg; drone.flash = 1; drone.vel.addScaledVector(dir, 2.2);
    drone.wob.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.fx.sparks(point, tmp.copy(dir).negate(), 16, { speed: 5, life: 0.4 });
    this.audio.metal(point);
    if (drone.hp <= 0) { this.kill(drone); return true; }
    return false;
  }

  kill(drone) {
    const p = drone.obj.position;
    this.fx.explosion(p); this.audio.explosion(p);
    if (drone.hum) drone.hum.stop();
    this.group.remove(drone.obj); drone.eyeMat.dispose();
    this.list.splice(this.list.indexOf(drone), 1);
  }

  clear() {
    for (const d of this.list) { if (d.hum) d.hum.stop(); this.group.remove(d.obj); }
    this.list.length = 0; for (const s of this.shots) { s.life = 0; s.m.visible = false; }
  }

  _los(from, to) {
    tmp.copy(to).sub(from); const dist = tmp.length(); tmp.divideScalar(dist);
    this.ray.set(from, tmp);
    for (const b of this.level.colliders) { const h = this.ray.intersectBox(b, tmp2); if (h && h.distanceTo(from) < dist) return false; }
    return true;
  }

  update(dt, time, player, onHitPlayer) {
    const B = this.level.bounds, head = tmp2.set(player.pos.x, player.pos.y + 1.45, player.pos.z).clone();
    for (const d of this.list) {
      const o = d.obj, p = o.position;
      d.age += dt;
      const sc = Math.min(1, d.age / 0.5); o.scale.setScalar(sc * sc * (3 - 2 * sc));
      d.retarget -= dt;
      if (d.retarget <= 0) {
        d.retarget = 1.6 + Math.random() * 2;
        const a = Math.random() * 6.28, r = 6 + Math.random() * 8;
        d.target.set(
          THREE.MathUtils.clamp(player.pos.x + Math.cos(a) * r, -B.x + 1.5, B.x - 1.5),
          3.0 + Math.random() * 1.6,
          THREE.MathUtils.clamp(player.pos.z + Math.sin(a) * r, -B.z + 1.5, B.z - 1.5));
      }
      const des = tmp.copy(d.target).sub(p); const dl = des.length();
      if (dl > 0.001) des.multiplyScalar(Math.min(4.6, dl * 1.5) / dl);
      d.vel.lerp(des, 1 - Math.exp(-1.6 * dt));
      // evitar obstáculos
      for (const b of this.level.colliders) {
        const m = 0.65;
        if (p.x > b.min.x - m && p.x < b.max.x + m && p.z > b.min.z - m && p.z < b.max.z + m && p.y < b.max.y + m && p.y > b.min.y - m) {
          const px = Math.min(p.x - (b.min.x - m), (b.max.x + m) - p.x), pz = Math.min(p.z - (b.min.z - m), (b.max.z + m) - p.z), py = (b.max.y + m) - p.y;
          if (py < px && py < pz && b.max.y < 5) d.vel.y += 14 * dt;
          else if (px < pz) d.vel.x += (p.x > (b.min.x + b.max.x) / 2 ? 1 : -1) * 16 * dt;
          else d.vel.z += (p.z > (b.min.z + b.max.z) / 2 ? 1 : -1) * 16 * dt;
        }
      }
      for (const e of this.list) {
        if (e === d) continue;
        const dx = p.x - e.obj.position.x, dy = p.y - e.obj.position.y, dz = p.z - e.obj.position.z, q = dx * dx + dy * dy + dz * dz;
        if (q < 2.2 && q > 0.0001) { const f = 5 * dt / Math.sqrt(q); d.vel.x += dx * f; d.vel.y += dy * f; d.vel.z += dz * f; }
      }
      p.addScaledVector(d.vel, dt);
      p.y = THREE.MathUtils.clamp(p.y + Math.sin(time * 2.1 + d.ph) * 0.12 * dt, 1.2, B.h - 0.7);
      p.x = THREE.MathUtils.clamp(p.x, -B.x + 0.6, B.x - 0.6); p.z = THREE.MathUtils.clamp(p.z, -B.z + 0.6, B.z - 0.6);
      // orientación hacia el jugador con inclinación por velocidad
      tm.lookAt(head, p, UP); tq.setFromRotationMatrix(tm);
      o.quaternion.slerp(tq, 1 - Math.exp(-6 * dt));
      d.wob.multiplyScalar(Math.exp(-5 * dt));
      o.rotateX(d.wob.x * dt); o.rotateY(d.wob.y * dt); o.rotateZ(d.wob.z * dt - d.vel.x * 0.0 * dt);
      if (d.hum) d.hum.set(p);

      // disparo
      d.cool -= dt; d.flash = Math.max(0, d.flash - dt * 5);
      if (d.charge > 0) {
        d.charge -= dt;
        if (d.charge <= 0) this._shoot(d, player, head);
      } else if (d.cool <= 0 && d.age > 1.2) {
        if (this._los(p, head)) { d.charge = 0.62; d.cool = 2.0 + Math.random() * 1.8; this.audio.droneCharge(p); }
        else d.cool = 0.4;
      }
      const c = d.charge > 0 ? 1 - d.charge / 0.62 : 0, pulse = 0.85 + 0.15 * Math.sin(time * 6 + d.ph);
      d.eyeMat.color.setRGB((6 + c * 26) * pulse + d.flash * 20, (0.5 + c * 9) * pulse + d.flash * 20, (0.3 + c * 3) * pulse + d.flash * 20);
    }

    // proyectiles
    for (const s of this.shots) {
      if (s.life <= 0) continue;
      s.life -= dt; const m = s.m;
      m.position.addScaledVector(s.v, dt);
      const p = m.position; let hit = s.life <= 0 || p.y < 0.03 || Math.abs(p.x) > B.x || Math.abs(p.z) > B.z || p.y > B.h;
      const cy = THREE.MathUtils.clamp(p.y, player.pos.y + 0.15, player.pos.y + 1.75);
      const dx = p.x - player.pos.x, dy = p.y - cy, dz = p.z - player.pos.z;
      if (dx * dx + dy * dy + dz * dz < 0.2) { hit = true; onHitPlayer(11, s.v); }
      if (!hit) for (const b of this.level.colliders) if (b.containsPoint(p)) { hit = true; break; }
      if (hit) {
        s.life = 0; m.visible = false;
        tmp.copy(s.v).normalize().negate();
        this.fx.sparks(p, tmp, 14, { speed: 4, color: [10, 3, 0.6], life: 0.45 });
        this.fx.flash(p, 0xff5a20, 40, 0.15); this.audio.impact(p);
      }
    }
  }

  _shoot(d, player, head) {
    const s = this.shots.find((x) => x.life <= 0); if (!s) return;
    const o = d.obj, from = tmp.set(0, -0.23, 0.36).applyMatrix4(o.matrixWorld).clone();
    const speed = 17, dist = from.distanceTo(head);
    const aim = head.clone().addScaledVector(player.vel, (dist / speed) * 0.55);
    aim.x += (Math.random() - 0.5) * 0.5; aim.y += (Math.random() - 0.5) * 0.4 - 0.15; aim.z += (Math.random() - 0.5) * 0.5;
    s.v.copy(aim).sub(from).normalize().multiplyScalar(speed);
    s.m.position.copy(from); s.m.lookAt(aim); s.m.visible = true; s.life = 4;
    this.fx.flash(from, 0xff5a20, 60, 0.12); this.audio.droneShot(from);
  }
}
