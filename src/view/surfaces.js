import * as THREE from 'three';

// Procedural surface detail for the map's flat-coloured materials. The merged level meshes have no
// UVs, so a grey detail texture is projected from the three world axes (triplanar) and multiplies
// the material's colour; its second channel is a height used as a bump and to vary roughness.
// Textures are drawn once on canvases, by material name (blender/pirates/port.py names them P_*).

const SIZE = 512;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// tileable value noise: `cells` lattice cells across the texture, smooth interpolation
function noiseField(cells, seed) {
  const rand = rng(seed);
  const lat = new Float32Array(cells * cells).map(() => rand());
  const at = (x, y) => lat[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    let fx = x - x0, fy = y - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// fractal noise from a few octaves, 0..1
function fbm(octaves, base, seed) {
  const fields = Array.from({ length: octaves }, (_, i) => noiseField(base << i, seed + i * 101));
  return (u, v) => {
    let s = 0, a = 0.5, n = 0;
    for (const f of fields) { s += f(u, v) * a; n += a; a *= 0.5; }
    return s / n;
  };
}

// paints a texture from a function (u, v) -> [albedo 0..1 around 0.5, height 0..1]
function paint(fn) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const [a, h] = fn(x / SIZE, y / SIZE);
      const i = (y * SIZE + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, a * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, h * 255));
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; // data, not colour
  t.anisotropy = 8;
  return t;
}

// boards running along u, `rows` per tile, with seams, staggered joints, grain and a few nails
function boards(rows, seed, { seam = 0.06, contrast = 0.35, tar = 0.25 } = {}) {
  const rand = rng(seed);
  const tone = Array.from({ length: rows }, () => 0.8 + rand() * 0.4);
  const joint = Array.from({ length: rows }, () => rand());
  const grain = fbm(4, 4, seed + 7);
  const fine = noiseField(64, seed + 9);
  return (u, v) => {
    const r = Math.floor(v * rows), fv = v * rows - r;
    const fu = (u + joint[r]) % 1;
    // grain: noise stretched along the board
    const gr = grain(fu * 0.25 + r * 0.37, fv * 0.3 + r * 0.11);
    const lines = Math.sin((fv * 9 + gr * 7) * Math.PI) * 0.5 + 0.5;
    let a = tone[r] * (0.5 + (lines - 0.5) * contrast * 0.5 + (fine(u * 4, v) - 0.5) * 0.15);
    let h = 0.6 + lines * 0.15;
    const edge = Math.min(fv, 1 - fv), end = Math.min(fu, 1 - fu) * 8 / rows;
    if (edge < seam || end < seam * 0.4) { a *= tar; h = 0.1; }
    // nails near the joints
    if (end < 0.06 && Math.abs(fv - 0.5) < 0.18 && Math.abs(fv - 0.5) > 0.12) { a *= 0.4; h = 0.9; }
    return [a, h];
  };
}

const PAINTERS = {
  planks: () => boards(8, 3),
  hull: () => boards(10, 5, { seam: 0.08, contrast: 0.25, tar: 0.15 }),
  wood: () => {
    const grain = fbm(4, 4, 11), knots = noiseField(6, 13);
    return (u, v) => {
      const g = grain(u * 0.3, v * 2);
      const k = Math.max(0, knots(u, v) - 0.75) * 4;
      const lines = Math.sin((u * 24 + g * 6 + k * 3) * Math.PI) * 0.5 + 0.5;
      return [0.42 + lines * 0.16 - k * 0.15 + (g - 0.5) * 0.2, 0.5 + lines * 0.2 - k * 0.2];
    };
  },
  rock: () => {
    const n = fbm(6, 4, 21), cr = fbm(4, 6, 23);
    return (u, v) => {
      const h = n(u, v);
      const crack = Math.abs(cr(u, v) - 0.5) < 0.012 ? 0.55 : 1;
      return [(0.32 + h * 0.4) * crack, h * crack];
    };
  },
  plaster: () => {
    const n = fbm(5, 4, 31), patch = fbm(4, 3, 33), fine = noiseField(128, 35);
    return (u, v) => {
      const p = patch(u, v);
      // plaster fallen off in patches shows the stones behind it
      if (p > 0.6) {
        const row = Math.floor(v * 10), fu = (u * 5 + (row % 2) * 0.5) % 1, fv = v * 10 - row;
        const mortar = Math.min(fu, 1 - fu) < 0.05 || Math.min(fv, 1 - fv) < 0.09;
        return mortar ? [0.25, 0.15] : [0.4 + n(u * 3, v * 3) * 0.25, 0.55];
      }
      const stain = n(u, v);
      return [0.42 + stain * 0.2 + (fine(u, v) - 0.5) * 0.08, 0.7 + (fine(u, v) - 0.5) * 0.1];
    };
  },
  thatch: () => {
    const n = fbm(4, 8, 41), straw = noiseField(256, 43);
    return (u, v) => {
      const s = straw(u * 0.05 + n(u, v) * 0.1, v);
      const layer = (v * 6) % 1;
      return [0.3 + s * 0.4 + layer * 0.1, 0.3 + s * 0.4 + layer * 0.3];
    };
  },
  canvas: () => {
    const n = fbm(4, 4, 51);
    return (u, v) => {
      const weave = (Math.sin(u * SIZE * 0.8) * Math.sin(v * SIZE * 0.8)) * 0.05;
      return [0.45 + (n(u, v) - 0.5) * 0.35 + weave, 0.5 + weave * 4];
    };
  },
  iron: () => {
    const n = fbm(5, 6, 61);
    return (u, v) => { const h = n(u, v); return [0.4 + h * 0.3, h]; };
  },
};

// material name -> painter, metres per tile, bump strength, grime near the ground
const LOOKS = {
  P_Plank: { tex: 'planks', scale: 2.4, bump: 1.2 },
  P_Hull: { tex: 'hull', scale: 3.0, bump: 1.0 },
  P_Wood: { tex: 'wood', scale: 1.6, bump: 0.6 },
  P_Keg: { tex: 'wood', scale: 1.2, bump: 0.6 },
  P_Rock: { tex: 'rock', scale: 5, bump: 2.0, grime: true },
  P_Moss: { tex: 'rock', scale: 4, bump: 1.5 },
  P_Plaster: { tex: 'plaster', scale: 4, bump: 1.0, grime: true },
  P_Thatch: { tex: 'thatch', scale: 2.0, bump: 1.5 },
  P_Canvas: { tex: 'canvas', scale: 2.5, bump: 0.3 },
  P_Iron: { tex: 'iron', scale: 1.5, bump: 0.4 },
  P_Stone: { tex: 'rock', scale: 1.2, bump: 1.5, grime: true },
  P_Shutter: { tex: 'planks', scale: 1.2, bump: 0.8 },
  P_Char: { tex: 'wood', scale: 1.0, bump: 1.0 },
};

const cache = new Map();
function texture(name) {
  if (!cache.has(name)) cache.set(name, paint(PAINTERS[name]()));
  return cache.get(name);
}

// adds the triplanar detail to a MeshStandardMaterial whose name has a look; returns whether it did
export function dressMaterial(material) {
  const look = LOOKS[material.name.replace(/\.\d+$|\d{3}$/, '')];
  if (!look || !material.isMeshStandardMaterial) return false;
  const uniforms = {
    triMap: { value: texture(look.tex) },
    triScale: { value: 1 / look.scale },
    triBump: { value: look.bump },
  };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vTriPos;\nvarying vec3 vTriNormal;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vTriNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = `uniform sampler2D triMap;\nuniform float triScale;\nuniform float triBump;\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;
      // bump from a height's screen derivatives (three's perturbNormalArb, which needs USE_BUMPMAP)
      vec3 triBumpNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
        vec3 vSigmaX = normalize(dFdx(surfPos.xyz));
        vec3 vSigmaY = normalize(dFdy(surfPos.xyz));
        vec3 vN = surfNorm;
        vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
        float fDet = dot(vSigmaX, R1) * faceDirection;
        vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
        return normalize(abs(fDet) * surfNorm - vGrad);
      }\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 triW = pow(abs(normalize(vTriNormal)), vec3(4.0));
        triW /= triW.x + triW.y + triW.z;
        vec3 tp = vTriPos * triScale;
        vec2 triT = texture2D(triMap, tp.zy).rg * triW.x + texture2D(triMap, tp.xz).rg * triW.y + texture2D(triMap, tp.xy).rg * triW.z;
        diffuseColor.rgb *= triT.r * 2.0;
        ${look.grime ? 'diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 1.3, vTriPos.y));' : ''}
        float triH = triT.g;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.15, 0.8, triH), 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = triBumpNormal(-vViewPosition, normal, vec2(dFdx(triH), dFdy(triH)) * triBump, faceDirection);`);
  };
  material.customProgramCacheKey = () => 'tri-' + look.tex + (look.grime ? 'g' : '');
  material.needsUpdate = true;
  return true;
}

// wet, darker sand along the sea: the ground material of a world with a sea
export function wetSand(material, shore) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.shore = { value: shore };
    sh.vertexShader = 'varying vec3 vSandPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vSandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = 'uniform float shore;\nvarying vec3 vSandPos;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wet = smoothstep(shore - 7.0, shore - 0.5, vSandPos.z);
        diffuseColor.rgb *= mix(1.0, 0.55, wet);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.35, wet);`);
  };
  material.customProgramCacheKey = () => 'wetsand';
  material.needsUpdate = true;
}
