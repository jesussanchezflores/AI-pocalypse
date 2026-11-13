// Reflexión planar para el suelo mojado (plano y = 0), inyectada en un MeshStandardMaterial.
import * as THREE from 'three';

export class PlanarReflection {
  constructor(w, h) {
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.rt.texture.generateMipmaps = true;
    this.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.cam = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.hide = [];
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._rot = new THREE.Matrix4();
    this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this._n = new THREE.Vector3(0, 1, 0); this._o = new THREE.Vector3();
  }

  setSize(w, h) { this.rt.setSize(w, h); }

  patch(material) {
    const self = this;
    material.onBeforeCompile = (sh) => {
      sh.uniforms.tRefl = { value: self.rt.texture };
      sh.uniforms.reflMatrix = { value: self.matrix };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 reflMatrix;\nvarying vec4 vReflUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReflUv = reflMatrix * modelMatrix * vec4(position, 1.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl;\nvarying vec4 vReflUv;')
        .replace('#include <opaque_fragment>', `
          {
            vec3 vdir = normalize(vViewPosition);
            float ndv = saturate(dot(normal, vdir));
            vec2 rUv = vReflUv.xy / vReflUv.w + normal.xy * 0.035 * (0.3 + roughnessFactor);
            float gloss = 1.0 - roughnessFactor;
            vec3 refl = texture2D(tRefl, rUv, roughnessFactor * 7.0).rgb;
            float fres = 0.05 + 0.95 * pow(1.0 - ndv, 4.0);
            outgoingLight += refl * fres * gloss * gloss * 1.15;
          }
          #include <opaque_fragment>`);
    };
  }

  render(renderer, scene, camera) {
    const p = this._p.setFromMatrixPosition(camera.matrixWorld);
    if (p.y <= 0.01) return;
    const v = this.cam;
    this._rot.extractRotation(camera.matrixWorld);
    const l = this._l.set(0, 0, -1).applyMatrix4(this._rot).add(p);
    v.position.set(p.x, -p.y, p.z);
    v.up.set(0, 1, 0).applyMatrix4(this._rot); v.up.y *= -1;
    v.lookAt(l.x, -l.y, l.z);
    v.near = camera.near; v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);

    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);

    // plano de recorte oblicuo
    const plane = this._plane.setFromNormalAndCoplanarPoint(this._n, this._o).applyMatrix4(v.matrixWorldInverse);
    const clip = this._clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = v.projectionMatrix, q = this._q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;

    const vis = this.hide.map((o) => o.visible);
    this.hide.forEach((o) => (o.visible = false));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, v);
    renderer.setRenderTarget(prev);
    this.hide.forEach((o, i) => (o.visible = vis[i]));
  }
}
