import * as THREE from 'three';

// The sea (pirate port): a wide sheet from the shore to the horizon. The swell moves its vertices;
// the fragment shader adds finer waves as normals, reflects the night sky, the moon and the nearest
// lanterns (Fresnel), lightens the shallows where the sand shows through, and draws foam along the
// shore and around everything standing in the water (piers' posts, rocks, the galleon's hull),
// from a mask painted once from the level's collision boxes.
const MAX_LIGHTS = 8;

export class Sea {
  // sea: the universe's { level, shore, color }; look: its ambiance (sky, moon); level: src/sim/level.js
  constructor(scene, sea, look, level) {
    this.uniforms = {
      time: { value: 0 },
      shore: { value: sea.shore },
      seaLevel: { value: sea.level },
      deep: { value: new THREE.Color(sea.color).multiplyScalar(0.16) },
      shallow: { value: new THREE.Color(sea.color).multiplyScalar(0.5) },
      zenith: { value: new THREE.Vector3(...look.sky.zenith) },
      horizon: { value: new THREE.Vector3(...look.sky.horizon) },
      moonDir: { value: new THREE.Vector3(...look.moon.dir).normalize() },
      moonColor: { value: new THREE.Color(look.moon.light).multiplyScalar(look.moon.intensity) },
      fireColor: { value: new THREE.Color(look.fire.light) },
      lightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
      lightPower: { value: new Array(MAX_LIGHTS).fill(0) },
      foamMap: { value: null },
      foamRect: { value: new THREE.Vector4() },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    };
    this.#paintFoam(sea, level);

    const geo = new THREE.PlaneGeometry(600, 420, 200, 140).rotateX(-Math.PI / 2).translate(0, sea.level, sea.shore + 210);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      fog: true,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: { MAX_LIGHTS },
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1; // after the opaque map, so the sand shows through
    scene.add(this.mesh);
  }

  // Foam mask over the shore strip: white where something stands in the water, blurred outwards.
  #paintFoam(sea, level) {
    const minX = -70, maxX = 70, minZ = sea.shore - 2, maxZ = sea.shore + 40, ppm = 6;
    const w = (maxX - minX) * ppm, h = (maxZ - minZ) * ppm;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.filter = 'blur(5px)';
    // the shoreline itself
    g.fillRect(0, 0, w, 2 * ppm + 2);
    for (const b of level.boxes) {
      if (b.min.y > sea.level + 0.3 || b.max.y < sea.level - 0.2) continue;
      if (b.max.z < minZ || b.min.z > maxZ) continue;
      // the invisible barrier along the deep water is no rock: no foam there
      if (b.max.z - b.min.z <= 1.01 && b.max.x - b.min.x > 10) continue;
      // thin posts get a ring of foam as wide as a rock's
      const pad = 0.3;
      g.fillRect((b.min.x - pad - minX) * ppm, (b.min.z - pad - minZ) * ppm, (b.max.x - b.min.x + 2 * pad) * ppm, (b.max.z - b.min.z + 2 * pad) * ppm);
    }
    // a second, wider pass so the foam fades over a metre or two
    g.filter = 'blur(10px)';
    g.globalAlpha = 0.6;
    g.drawImage(c, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.flipY = false; // canvas rows run with Z
    this.uniforms.foamMap.value = t;
    this.uniforms.foamRect.value.set(minX, minZ, maxX - minX, maxZ - minZ);
  }

  // t: seconds; lights: the world's fire point lights (their positions and current intensities)
  update(t, lights) {
    this.uniforms.time.value = t;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i];
      this.uniforms.lightPower.value[i] = l ? l.intensity : 0;
      if (l) this.uniforms.lightPos.value[i].copy(l.position);
    }
  }
}

const VERTEX = /* glsl */ `
  uniform float time;
  uniform float shore;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec3 transformed = position;
    // calmer against the shore, longer swell out at sea
    float swell = mix(0.35, 1.0, smoothstep(shore, shore + 25.0, position.z));
    transformed.y += swell * (sin(position.x * 0.31 + time * 1.1) * 0.09 + sin(position.z * 0.47 - time * 1.6) * 0.07)
      + sin((position.x + position.z) * 0.93 + time * 2.4) * 0.025;
    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float shore;
  uniform float seaLevel;
  uniform vec3 deep;
  uniform vec3 shallow;
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 moonDir;
  uniform vec3 moonColor;
  uniform vec3 fireColor;
  uniform vec3 lightPos[MAX_LIGHTS];
  uniform float lightPower[MAX_LIGHTS];
  uniform sampler2D foamMap;
  uniform vec4 foamRect;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  // slope of the summed waves at p: a set of directional sines (choppy) plus drifting noise ripples
  vec2 slope(vec2 p, float fade) {
    vec2 g = vec2(0.0);
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      float a = fi * 2.399 + 0.6;
      vec2 d = vec2(cos(a), sin(a));
      float k = 0.35 * pow(1.38, fi);       // wavenumber
      float amp = 0.2 / pow(1.42, fi);     // steeper long waves, small ripples
      float w = sqrt(9.8 * k);              // deep-water dispersion
      float lod = i > 5 ? fade : 1.0;       // high frequencies fade with distance (no shimmer)
      g += d * k * amp * cos(dot(d, p) * k + time * w) * lod;
    }
    vec2 q = p * 1.7 + vec2(time * 0.35, time * 0.21);
    float e = 0.05;
    float n0 = noise(q), nx = noise(q + vec2(e, 0.0)), nz = noise(q + vec2(0.0, e));
    g += vec2(nx - n0, nz - n0) / e * 0.04 * fade;
    return g;
  }

  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 V = toEye / dist;
    float fade = 1.0 - smoothstep(25.0, 90.0, dist);
    vec2 g = slope(vWorld.xz, fade);
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

    // how deep: shallows near the shore, open sea further out
    float depth = smoothstep(shore, shore + 13.0, vWorld.z);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);

    // reflected sky: the gradient of the sky dome, the moon's halo and disc
    vec3 R = reflect(-V, n);
    float up = max(R.y, 0.0);
    vec3 sky = mix(horizon, zenith, pow(up, 0.45)) * 1.6;
    float m = max(dot(R, moonDir), 0.0);
    sky += moonColor * (pow(m, 250.0) * 0.5 + pow(m, 2500.0) * 8.0);

    // the water itself: lit faintly by the moon, brighter on the crests facing it
    vec3 body = mix(shallow, deep, depth);
    float crest = clamp(dot(n, normalize(moonDir * vec3(1.0, 0.3, 1.0))) * 0.5 + 0.5, 0.0, 1.0);
    body *= 0.55 + 0.6 * crest;

    vec3 col = mix(body, sky, fresnel);

    // lanterns: a warm streak on the water under each lit one
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (lightPower[i] <= 0.0) continue;
      vec3 L = lightPos[i] - vWorld;
      float d2 = dot(L, L);
      vec3 Ld = L * inversesqrt(d2);
      float spec = pow(max(dot(R, Ld), 0.0), 120.0) * 6.0 + pow(max(dot(R, Ld), 0.0), 12.0) * 0.25;
      col += fireColor * lightPower[i] * 0.02 * (spec + 0.15 * max(dot(n, Ld), 0.0)) / (1.0 + d2 * 0.06);
    }

    // foam: along the shore and around what stands in the water, broken up and drifting
    vec2 fuv = (vWorld.xz - foamRect.xy) / foamRect.zw;
    float near = (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) ? texture2D(foamMap, fuv).r : 0.0;
    float pattern = noise(vWorld.xz * 2.3 + vec2(time * 0.2, -time * 0.15)) * 0.6 + noise(vWorld.xz * 6.0 - time * 0.3) * 0.4;
    float bands = 0.5 + 0.5 * sin(near * 14.0 - time * 1.8);
    float foam = smoothstep(0.45, 0.8, near * (0.6 + 0.5 * bands) + pattern * 0.65 - 0.2) * sqrt(near);
    // whitecaps out at sea, on the steepest slopes
    foam += smoothstep(0.16, 0.3, length(g)) * pattern * 0.35 * depth * fade;
    col = mix(col, vec3(0.45, 0.55, 0.52), clamp(foam, 0.0, 1.0) * 0.85);

    // the sand shows through the shallows; the sea goes opaque with depth and at grazing angles
    float alpha = mix(0.72, 0.96, depth);
    alpha = max(alpha, fresnel);
    alpha = max(alpha, clamp(foam, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }`;
