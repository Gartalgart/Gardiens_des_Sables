import * as THREE from 'three';

const MAX = 1500;

// Pooled additive point particles + short-lived tracer lines.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.next = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 300.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor * vAlpha * (1.0 - d * 1.8), 1.0);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.tracers = [];
    this.tracerPool = [];
    this.density = 1; // particle budget scale, set from the graphics quality
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  emit(p, v, color, size, life, grav = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
  }

  burst(point, normal, { count: rawCount = 10, color = new THREE.Color(1, 0.7, 0.3), speed = 5, size = 0.08, life = 0.4, grav = 9, spread = 1 } = {}) {
    const v = new THREE.Vector3();
    const count = Math.max(1, Math.round(rawCount * this.density));
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(spread);
      if (normal) v.add(normal);
      v.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.emit(point, v, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav);
    }
  }

  impactWall(point, normal) {
    this.burst(point, normal, { count: 8, color: new THREE.Color(1, 0.75, 0.35), speed: 6, size: 0.06, life: 0.25 });
    this.burst(point, normal, { count: 5, color: new THREE.Color(0.25, 0.2, 0.15), speed: 1.2, size: 0.35, life: 0.7, grav: -0.5 });
  }

  impactEnemy(point, normal, color) {
    this.burst(point, normal, { count: 10, color, speed: 4, size: 0.1, life: 0.35, grav: 6 });
  }

  tracer(from, to) {
    let line = this.tracerPool.pop();
    if (!line) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      line = new THREE.Line(g, this.tracerMat.clone());
      line.frustumCulled = false;
    }
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    line.userData.life = 0.07;
    this.scene.add(line);
    this.tracers.push(line);
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; }
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    for (const name of ['position', 'color', 'size', 'alpha']) this.geo.attributes[name].needsUpdate = true;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.07);
      if (t.userData.life <= 0) {
        this.scene.remove(t);
        this.tracerPool.push(t);
        this.tracers.splice(i, 1);
      }
    }
  }
}
