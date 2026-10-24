import * as THREE from 'three';

// Fake volumetric light: an open cone drawn additively, bright along its axis and fading toward its
// silhouette and its far end, so it reads as light in the haze rather than as a solid shape.
// The cone starts at its origin and runs down -Y over `length` (turn it to aim it).

const vertexShader = `
  varying float vAlong; varying vec3 vN; varying vec3 vV;
  void main() {
    vAlong = 1.0 - uv.y; // 0 at the source, 1 at the far end
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const fragmentShader = `
  uniform vec3 color; uniform float strength; uniform float falloff;
  varying float vAlong; varying vec3 vN; varying vec3 vV;
  void main() {
    float core = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 2.5);
    float a = strength * core * pow(clamp(1.0 - vAlong, 0.0, 1.0), falloff) * smoothstep(0.0, 0.04, vAlong);
    gl_FragColor = vec4(color * a, 1.0);
  }`;

// strength: brightness at the source; falloff: how fast it fades along its length
export function beamMaterial(color, strength = 0.3, falloff = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, falloff: { value: falloff } },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

export function beamGeometry(radiusAtSource, radiusAtEnd, length) {
  return new THREE.CylinderGeometry(radiusAtSource, radiusAtEnd, length, 24, 1, true).translate(0, -length / 2, 0);
}

// a beam mesh from `from` along `dir` (normalized)
export function makeBeam(material, radiusAtSource, radiusAtEnd, length, from, dir) {
  const m = new THREE.Mesh(beamGeometry(radiusAtSource, radiusAtEnd, length), material);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  m.renderOrder = 2;
  return m;
}
