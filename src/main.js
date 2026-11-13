import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { buildTextures } from './textures.js';
import { PlanarReflection } from './reflection.js';
import { buildLevel } from './level.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Weapon } from './weapon.js';
import { Drones } from './enemies.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.has('shot');
const $ = (id) => document.getElementById(id);
const NEAR_WORLD = 0.14, NEAR_GUN = 0.02;

class WeaponPass extends Pass {
  constructor(scene, camera) { super(); this.scene = scene; this.camera = camera; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer); renderer.clearDepth();
    const c = this.camera, f = c.fov; c.layers.set(1); c.near = NEAR_GUN; c.fov = f * 0.78; c.updateProjectionMatrix();
    renderer.render(this.scene, c);
    c.layers.set(0); c.near = NEAR_WORLD; c.fov = f; c.updateProjectionMatrix();
    renderer.autoClear = ac;
  }
}

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 }, low: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, damage, low; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * 0.008;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(-0.012, 0.002, 0.016) * (1.0 - smoothstep(0.0, 0.45, l));      // sombras frías
      col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), smoothstep(0.4, 1.0, l));      // luces cálidas
      col = mix(vec3(l), col, 1.0 - low * 0.55);
      float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.9)) * 1.25);
      col *= mix(0.42, 1.0, vig);
      float edge = smoothstep(0.3, 0.78, length(c));
      col = mix(col, vec3(0.5, 0.02, 0.0), clamp(damage, 0.0, 1.0) * edge * 0.6);
      float n = fract(sin(dot(gl_FragCoord.xy + fract(time) * 917.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.03;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const PR = Math.min(window.devicePixelRatio || 1, Number(Q.get('pr')) || 1.5);
  renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
  renderer.setClearColor(0x000000, 1);
  document.body.prepend(renderer.domElement);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.3, 0.2, 0.15), 0.004);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, NEAR_WORLD, 400);
  camera.rotation.order = 'YXZ'; scene.add(camera);

  const T = buildTextures();
  const reflection = new PlanarReflection(Math.floor(innerWidth * PR * 0.6), Math.floor(innerHeight * PR * 0.6));
  const level = buildLevel(scene, T, reflection);
  const fx = new FX(scene, T);
  const audio = new AudioSys();
  const weapon = new Weapon(camera, T);
  const drones = new Drones(scene, T, fx, audio, level);
  const noAO = [...level.noAO, fx.root];

  // ---------- iluminación indirecta: sonda cúbica capturada del propio nivel ----------
  {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.1, 80, cubeRT); cubeCam.position.set(0, 2.8, 1);
    const pm = new THREE.PMREMGenerator(renderer);
    level.fxOnly.forEach((o) => (o.visible = false));
    renderer.shadowMap.needsUpdate = true; cubeCam.update(renderer, scene);
    const e1 = pm.fromCubemap(cubeRT.texture); scene.environment = e1.texture; scene.environmentIntensity = 0.5;
    cubeCam.update(renderer, scene);
    const e2 = pm.fromCubemap(cubeRT.texture); scene.environment = e2.texture; e1.dispose();
    level.fxOnly.forEach((o) => (o.visible = true));
    pm.dispose();
  }

  // ---------- post-procesado ----------
  const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, innerWidth * PR, innerHeight * PR);
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 12 });
  gtao.blendIntensity = 1.0;
  { const r0 = gtao.render.bind(gtao); gtao.render = (...a) => { const v = noAO.map((o) => o.visible); noAO.forEach((o) => (o.visible = false)); r0(...a); noAO.forEach((o, i) => (o.visible = v[i])); }; }
  if (!Q.has('noao')) composer.addPass(gtao);
  if (!Q.has('nogun')) composer.addPass(new WeaponPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.7, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader); composer.addPass(final);

  addEventListener('resize', () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setSize(w * PR, h * PR); reflection.setSize(Math.floor(w * PR * 0.6), Math.floor(h * PR * 0.6));
  });

  // ---------- estado ----------
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, hp: 100, lastHurt: -99, bob: 0, recP: 0, recY: 0, stepAcc: 0, stepOff: 0 };
  const game = { state: 'menu', wave: 0, queue: [], spawnT: 0, nextWaveT: 0, time: 0, damageFx: 0, spread: 0, kills: 0 };
  const keys = new Set(); const mouse = { dx: 0, dy: 0, l: false, r: false };
  const WAVES = [3, 5, 7];

  function resetGame() {
    player.pos.set(0, 0, 15.5); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = 0; player.hp = 100; player.recP = player.recY = 0;
    weapon.reset(); drones.clear(); fx.reset();
    game.wave = 0; game.queue.length = 0; game.nextWaveT = 2.5; game.kills = 0; game.damageFx = 0; game.armed = false; game.shield = false; $('explore').classList.add('on'); audio.setMusic(0);
    hud.wave(1); hud.sync(true);
  }

  // ---------- HUD ----------
  const hud = (() => {
    const el = { ammoN: $('ammoN'), ammoR: $('ammoR'), hpnum: $('hpnum'), hpfill: $('hpfill'), left: $('left'), waveN: $('waveN'), cross: $('cross'), hitm: $('hitm'), hint: $('hint'), banner: $('banner'), banBig: $('banBig'), banSmall: $('banSmall') };
    const lines = { t: el.cross.querySelector('.t'), b: el.cross.querySelector('.b'), l: el.cross.querySelector('.l'), r: el.cross.querySelector('.r') };
    let last = {}, hitT = 0, banT = 0;
    return {
      sync(force) {
        const a = weapon.ammo, r = weapon.reserve, hp = Math.max(0, Math.ceil(player.hp)), n = drones.alive + game.queue.length;
        if (force || a !== last.a) { el.ammoN.textContent = a; el.ammoN.classList.toggle('low', a <= 8); last.a = a; }
        if (force || r !== last.r) { el.ammoR.textContent = isFinite(r) ? r : '∞'; last.r = r; }
        if (force || hp !== last.hp) { el.hpnum.textContent = hp; el.hpfill.style.transform = `scaleX(${hp / 100})`; el.hpfill.style.background = hp < 35 ? '#ff5a44' : '#fff'; last.hp = hp; }
        if (force || n !== last.n) { el.left.textContent = n; last.n = n; }
        const hint = (a <= 8 && !weapon.reloading && r > 0) ? 1 : 0;
        if (hint !== last.hint) { el.hint.classList.toggle('on', !!hint); last.hint = hint; }
      },
      wave(n) { el.waveN.textContent = n; },
      cross(gap, alpha) {
        const g = gap.toFixed(1);
        lines.t.style.top = `${-gap - 9}px`; lines.b.style.top = `${g}px`; lines.l.style.left = `${-gap - 9}px`; lines.r.style.left = `${g}px`;
        el.cross.style.opacity = alpha;
      },
      hit(kill) { hitT = kill ? 0.3 : 0.14; el.hitm.classList.toggle('kill', !!kill); el.hitm.style.opacity = 1; },
      banner(big, small, dur = 3) { el.banBig.textContent = big; el.banSmall.textContent = small; el.banner.classList.add('on'); banT = dur; },
      update(dt) {
        if (hitT > 0) { hitT -= dt; if (hitT <= 0) el.hitm.style.opacity = 0; }
        if (banT > 0) { banT -= dt; if (banT <= 0) el.banner.classList.remove('on'); }
      },
    };
  })();

  // ---------- entrada ----------
  const canvas = renderer.domElement;
  const overlay = $('overlay');
  function showOverlay(kick, title, sub, go) { $('ovKick').textContent = kick; $('ovTitle').textContent = title; $('ovSub').textContent = sub; $('ovGo').textContent = go; overlay.classList.remove('off'); $('hud').classList.remove('on'); }
  overlay.addEventListener('click', () => {
    audio.init();
    if (game.state === 'dead' || game.state === 'won') resetGame();
    canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      if (game.state === 'menu') resetGame();
      game.state = 'playing'; overlay.classList.add('off'); $('hud').classList.add('on'); audio.init();
    } else if (game.state === 'playing') {
      game.state = 'paused'; mouse.l = mouse.r = false; keys.clear();
      showOverlay('EN PAUSA', 'PAUSA', 'TOMA AIRE. LOS DRONES ESPERAN.', 'CLIC PARA CONTINUAR'); audio.suspend();
    }
  });
  document.addEventListener('mousemove', (e) => { if (game.state === 'playing') { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (game.state !== 'playing') return;
    keys.add(e.code);
    if (e.code === 'KeyR' && weapon.startReload()) audio.reload();
    // truco oculto: beber el escudo (F3 o B) = invencible hasta reiniciar la partida
    if ((e.code === 'F3' || e.code === 'KeyB') && !game.shield) { game.shield = true; player.hp = 100; audio.drink(); weapon.drink(); hud.banner('ESCUDO ACTIVO', 'INTEGRIDAD BLINDADA', 2.2); hud.sync(); }
    if (e.code === 'F3') e.preventDefault();
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !game.armed) { game.armed = true; game.nextWaveT = 1.5; $('explore').classList.remove('on'); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  // ---------- jugador ----------
  const PR_ = 0.35, PH = 1.8, EYE = 1.66;
  function collides(p) {
    for (const b of level.colliders) {
      if (p.x + PR_ > b.min.x && p.x - PR_ < b.max.x && p.z + PR_ > b.min.z && p.z - PR_ < b.max.z && p.y + PH > b.min.y && p.y + 0.02 < b.max.y) return b;
    }
    return null;
  }
  const wish = new THREE.Vector3(), fwd = new THREE.Vector3(), v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), v3c = new THREE.Vector3();
  let strafe = 0, sprinting = false;
  function updatePlayer(dt) {
    const ads = mouse.r && !weapon.reloading;
    const sens = 0.0021 * (ads ? 0.62 : 1);
    player.yaw -= mouse.dx * sens; player.pitch = THREE.MathUtils.clamp(player.pitch - mouse.dy * sens, -1.5, 1.5);
    const K = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
    const f = K('KeyW', 'ArrowUp') - K('KeyS', 'ArrowDown'), s = K('KeyD', 'ArrowRight') - K('KeyA', 'ArrowLeft');
    strafe += (s - strafe) * (1 - Math.exp(-8 * dt));
    sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && f > 0 && !ads && player.onGround && !mouse.l;
    const speed = sprinting ? 6.6 : ads ? 2.5 : 4.3;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    wish.set(-sy * f + cy * s, 0, -cy * f - sy * s); if (wish.lengthSq() > 1) wish.normalize();
    const acc = 1 - Math.exp(-(player.onGround ? 11 : 2.2) * dt);
    player.vel.x += (wish.x * speed - player.vel.x) * acc; player.vel.z += (wish.z * speed - player.vel.z) * acc;
    player.vel.y -= 19 * dt;
    if (keys.has('Space') && player.onGround) { player.vel.y = 6.4; player.onGround = false; }
    const p = player.pos;
    // los obstáculos de hasta medio metro se suben solos (escalón) en vez de frenar en seco
    const stepUp = (b) => {
      const dy = b.max.y - p.y;
      if (!player.onGround || dy <= 0 || dy > 0.52) return false;
      const oy = p.y; p.y = b.max.y + 0.001;
      if (collides(p)) { p.y = oy; return false; }
      player.stepOff -= dy; return true;
    };
    let hit;
    p.x += player.vel.x * dt; if ((hit = collides(p)) && !stepUp(hit)) { p.x -= player.vel.x * dt; player.vel.x = 0; }
    p.z += player.vel.z * dt; if ((hit = collides(p)) && !stepUp(hit)) { p.z -= player.vel.z * dt; player.vel.z = 0; }
    player.stepOff += (0 - player.stepOff) * (1 - Math.exp(-14 * dt));
    const wasAir = !player.onGround, vy = player.vel.y;
    p.y += player.vel.y * dt; player.onGround = false;
    p.y -= 0.03; const b = collides(p); p.y += 0.03;      // margen para apoyarse de forma estable sobre objetos
    if (b) { if (player.vel.y <= 0) { p.y = b.max.y; player.onGround = true; } else p.y = b.min.y - PH - 0.001; player.vel.y = 0; }
    if (p.y <= 0) { p.y = 0; player.vel.y = 0; player.onGround = true; }
    if (wasAir && player.onGround && vy < -4) { weapon.landT = Math.min(1, -vy / 9); audio.land(); }
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround && hs > 0.8) {
      player.bob += dt * hs * 1.75; player.stepAcc += dt * hs;
      if (player.stepAcc > 2.3) { player.stepAcc = 0; audio.step(); }
    }
    // retroceso de cámara
    player.recP += (0 - player.recP) * (1 - Math.exp(-9 * dt)); player.recY += (0 - player.recY) * (1 - Math.exp(-9 * dt));
    const bobA = player.onGround ? Math.min(1, hs / 4.3) * (ads ? 0.25 : 1) : 0;
    camera.position.set(p.x, p.y + EYE + player.stepOff + Math.abs(Math.sin(player.bob)) * 0.035 * bobA - weapon.landT * 0.06, p.z);
    camera.rotation.set(player.pitch + player.recP, player.yaw + player.recY, -strafe * 0.012 + Math.cos(player.bob) * 0.003 * bobA);
    const targetFov = 68 - weapon.adsT * 20 + (sprinting ? 5 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.02) { camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-12 * dt)); camera.updateProjectionMatrix(); }

    const done = weapon.update(dt, { ads, sprint: sprinting, speed: hs, onGround: player.onGround, mdx: mouse.dx / Math.max(dt, 0.004) * 0.016, mdy: mouse.dy / Math.max(dt, 0.004) * 0.016, time: game.time, strafe, vy: player.vel.y });
    if (done) hud.sync();
    mouse.dx = mouse.dy = 0;

    // disparo
    game.spread += (0 - game.spread) * (1 - Math.exp(-6 * dt));
    if (mouse.l) {
      if (weapon.canFire()) shoot(ads);
      else if (weapon.ammo === 0 && !weapon.reloading && weapon.cool <= 0) { if (weapon.startReload()) audio.reload(); else { audio.dry(); weapon.cool = 0.25; } }
    }
    const moveSp = Math.min(1, hs / 5) * 10 + (player.onGround ? 0 : 12);
    hud.cross(5 + moveSp + game.spread * 420, weapon.adsT > 0.5 || weapon.reloading || sprinting ? 0 : 1);
    // regeneración
    if (game.time - player.lastHurt > 4.5 && player.hp < 100) player.hp = Math.min(100, player.hp + 11 * dt);
  }

  const raycaster = new THREE.Raycaster(); raycaster.far = 80;
  const rayTargets = [...level.rayMeshes, drones.group];
  function shoot(ads) {
    weapon.fire(); audio.shot();
    camera.updateMatrixWorld();
    const hs = Math.hypot(player.vel.x, player.vel.z);
    const spread = (ads ? 0.0012 : 0.007) + game.spread * (ads ? 0.35 : 1) + (ads ? 0.002 : 0.012) * Math.min(1, hs / 5) + (player.onGround ? 0 : 0.03);
    camera.getWorldDirection(fwd);
    v3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * spread);
    fwd.add(v3).normalize();
    raycaster.set(camera.getWorldPosition(v3b), fwd);
    const hits = raycaster.intersectObjects(rayTargets, true);
    const end = v3c.copy(v3b).addScaledVector(fwd, 70);
    if (hits.length) {
      const h = hits[0]; end.copy(h.point);
      const d = drones.find(h.object);
      if (d) { const killed = drones.damage(d, 34, h.point, fwd); hud.hit(killed); if (killed) { audio.kill(); game.kills++; } else audio.hit(); }
      else if (h.face) { const n = v3.copy(h.face.normal).transformDirection(h.object.matrixWorld); if (n.dot(fwd) > 0) n.negate(); fx.impact(h.point, n); audio.impact(h.point); }
    }
    weapon.root.updateWorldMatrix(true, true);
    const mz = weapon.muzzleWorld(new THREE.Vector3());
    fx.tracer(mz, end); fx.flash(mz, 0xffb060, 55, 0.06);
    fx.sparks(mz, fwd, 3, { speed: 7, spread: 0.25, life: 0.12 });
    const ej = weapon.ejectWorld(new THREE.Vector3());
    const right = v3.set(1, 0, 0).applyQuaternion(camera.quaternion);
    fx.shell(ej, right.multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3(0, 1.8 + Math.random(), 0)).addScaledVector(player.vel, 1).addScaledVector(fwd, -0.4 + Math.random() * 0.5));
    player.recP += (ads ? 0.0085 : 0.013); player.pitch += (ads ? 0.0022 : 0.0035); player.recY += (Math.random() - 0.5) * (ads ? 0.007 : 0.012);
    game.spread = Math.min(0.035, game.spread + 0.006);
    hud.sync();
  }

  function hurt(dmg) {
    if (game.state !== 'playing' || game.shield) return;
    player.hp -= dmg; player.lastHurt = game.time; game.damageFx = Math.min(1.2, game.damageFx + 0.6); audio.hurt();
    player.recP += 0.03; player.recY += (Math.random() - 0.5) * 0.06; hud.sync();
    if (player.hp <= 0) {
      game.state = 'dead'; document.exitPointerLock(); audio.setMusic(0);
      showOverlay('SEÑAL PERDIDA', 'HAS CAÍDO', `DRONES DESTRUIDOS: ${game.kills}`, 'CLIC PARA REINTENTAR');
    }
  }

  function updateWaves(dt) {
    if (!game.armed) return;
    if (game.queue.length) {
      game.spawnT -= dt;
      if (game.spawnT <= 0) { const s = level.spawns[game.queue.shift()]; drones.spawn(v3.set(s.x + (Math.random() - 0.5), s.y, s.z + (Math.random() - 0.5))); game.spawnT = 0.9; hud.sync(); }
    } else if (drones.alive === 0) {
      if (game.nextWaveT <= 0) {
        if (game.wave >= WAVES.length) {
          game.state = 'won'; document.exitPointerLock(); audio.setMusic(0);
          showOverlay('SECTOR ASEGURADO', 'GALERÍA LIMPIA', `DRONES DESTRUIDOS: ${game.kills}`, 'CLIC PARA JUGAR DE NUEVO'); return;
        }
        game.nextWaveT = game.wave === 0 ? 2.5 : 4.5;
        if (game.wave > 0) hud.banner('DESPEJADO', 'RECARGA · SIGUIENTE OLEADA EN CAMINO', 3);
      }
      game.nextWaveT -= dt;
      if (game.nextWaveT <= 0) {
        const n = WAVES[game.wave]; game.wave++;
        for (let i = 0; i < n; i++) game.queue.push((i + game.wave) % level.spawns.length);
        game.spawnT = 0.2; hud.wave(game.wave); hud.banner(`OLEADA ${game.wave}`, `${n} HOSTILES DETECTADOS`, 3); audio.alarm(); audio.setMusic(game.wave); hud.sync();
      }
    }
  }

  // ---------- bucle ----------
  const clock = new THREE.Clock(); let fpsT = 0, fpsN = 0;
  const menuCam = () => {
    const t = game.time * 0.05;
    camera.position.set(Math.sin(t) * 2.2, 1.55 + Math.sin(t * 1.7) * 0.1, 14.5);
    camera.rotation.set(0.04, Math.sin(t) * 0.14, 0);
  };
  function frame() {
    requestAnimationFrame(frame);                       // se programa primero: un error puntual no congela el juego
    const dt = Math.min(clock.getDelta(), 0.05);
    if (game.state !== 'paused') {
      game.time += dt;
      level.update(dt, game.time);
      if (game.state === 'playing') {
        updatePlayer(dt); updateWaves(dt);
        drones.update(dt, game.time, player, hurt);
        hud.sync();
      } else if (game.state === 'menu') {
        if (!SHOT) menuCam();
        weapon.update(dt, { ads: Q.has('ads'), sprint: false, speed: 0, onGround: true, mdx: 0, mdy: 0, time: game.time, strafe: 0, vy: 0 });
      } else {
        if (SHOT) weapon.update(dt, { ads: false, sprint: false, speed: 0, onGround: true, mdx: 0, mdy: 0, time: game.time, strafe: 0, vy: 0 });
        drones.update(dt, game.time, player, () => {});
      }
      fx.update(dt, (p) => audio.shellTink(p));
      hud.update(dt);
      game.damageFx = Math.max(0, game.damageFx - dt * 1.1);
      final.uniforms.time.value = game.time;
      final.uniforms.damage.value = game.damageFx + (player.hp < 35 && game.state === 'playing' ? (0.25 + 0.12 * Math.sin(game.time * 5)) : 0);
      final.uniforms.low.value = game.state === 'dead' ? 1 : 0;
      camera.updateMatrixWorld();
      camera.getWorldDirection(fwd); audio.listener(camera.position, fwd);
    }
    renderer.shadowMap.needsUpdate = true;
    reflection.render(renderer, scene, camera);
    composer.render(dt);
    fpsN++; fpsT += dt; if (fpsT > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }
  }

  resetGame(); game.nextWaveT = 2.5;
  if (SHOT) {
    // modo captura: ?shot&p=x,y,z&r=pitch,yaw[&ads][&drones][&hud]
    const p = (Q.get('p') || '0,1.66,15.5').split(',').map(Number), r = (Q.get('r') || '0,0').split(',').map(Number);
    camera.position.set(p[0], p[1], p[2]); camera.rotation.set(r[0], r[1], 0);
    overlay.classList.add('off'); if (Q.has('hud')) $('hud').classList.add('on');
    if (Q.has('drones')) { drones.spawn(new THREE.Vector3(-1.5, 2.6, 8)).age = 1; drones.spawn(new THREE.Vector3(2.5, 3.2, 4)).age = 1; game.state = 'frozen'; player.pos.set(p[0], p[1] - 1.66, p[2]); }
    if (Q.has('boom')) setTimeout(() => { fx.explosion(new THREE.Vector3(0, 2, 8)); fx.impact(new THREE.Vector3(-2, 0.001, 10), new THREE.Vector3(0, 1, 0)); }, 600);
  }
  { const dbg = { fx: fx.root, decal: fx.decalRoot, rays: level.fxOnly[0], dust: level.fxOnly[1], drones: drones.group, level: level.group }; (Q.get('hide') || '').split(',').forEach((k) => dbg[k] && (dbg[k].visible = false)); if (Q.has('nobloom')) bloom.enabled = false; if (Q.has('norefl')) reflection.render = () => {}; }
  if (Q.has('autoplay')) { game.state = 'playing'; overlay.classList.add('off'); $('hud').classList.add('on'); game.nextWaveT = 0.3; if (!Q.has('explore')) { game.armed = true; $('explore').classList.remove('on'); } window.__dbg = { player, game, drones, weapon, mouse, keys, audio }; }
  $('load').classList.add('off');
  window.__ready = true;
  frame();
}

main().catch((e) => { console.error(e); document.getElementById('load').firstElementChild.textContent = 'ERROR: ' + e.message; });
