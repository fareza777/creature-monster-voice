/**
 * The voice anatomy the specimen's X-ray reveals, in the engine's template centimetres (x forward,
 * y up, glottis at the origin): the airway tube rebuilt every frame from the area function, the
 * nasal branch, velum, vocal folds and larynx, the trachea and the lungs, and air particles.
 * Materials use normal blending so they read on the light theme.
 */
import * as THREE from "three";
import { F } from "../engine/lab.ts";

export type Organ = "lungs" | "trachea" | "larynx" | "folds" | "pharynx" | "velum" | "nasal" | "tongue" | "jaw" | "lips" | "teeth" | "skull" | "eyes";

const RINGS = 32;
const RADIAL = 14;
const PARTICLES = 90;

const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

const vert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying float vHeat;
  attribute float heat;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vHeat = heat;
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform vec3 color; uniform vec3 hot; uniform float opacity; uniform float time;
  varying vec3 vN; varying vec3 vV; varying float vHeat;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    vec3 c = mix(color, hot, clamp(vHeat, 0.0, 1.0));
    float a = (0.28 + 0.72 * f) * opacity;
    gl_FragColor = vec4(c * (0.75 + 0.5 * f), a);
  }`;

export function glass(color: THREE.ColorRepresentation, hot?: THREE.ColorRepresentation, opacity = 0.85): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { color: { value: new THREE.Color(color) }, hot: { value: new THREE.Color(hot ?? color) }, opacity: { value: opacity }, time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function heat(g: THREE.BufferGeometry, value = 0): THREE.BufferGeometry {
  g.setAttribute("heat", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count).fill(value), 1));
  return g;
}

/** A tube whose ring radii are rewritten every frame. */
class FlexTube {
  readonly geo = new THREE.BufferGeometry();
  private normals: THREE.Vector3[];
  constructor(private centers: THREE.Vector3[]) {
    const side = new THREE.Vector3(0, 0, 1);
    this.normals = centers.map((_p, i) => {
      const a = centers[Math.max(0, i - 1)], b = centers[Math.min(centers.length - 1, i + 1)];
      return new THREE.Vector3().crossVectors(side, b.clone().sub(a).normalize()).normalize();
    });
    const n = centers.length;
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j, b = a + RADIAL + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    this.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * (RADIAL + 1) * 3), 3));
    this.geo.setIndex(idx);
    heat(this.geo);
    this.update(new Array(n).fill(0.8), new Array(n).fill(0));
  }
  update(radii: ArrayLike<number>, h: ArrayLike<number>): void {
    const pos = this.geo.getAttribute("position") as THREE.BufferAttribute;
    const ha = this.geo.getAttribute("heat") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array, harr = ha.array as Float32Array;
    let k = 0;
    for (let i = 0; i < this.centers.length; i++) {
      const c = this.centers[i], nrm = this.normals[i], r = radii[i];
      for (let j = 0; j <= RADIAL; j++) {
        const th = (j / RADIAL) * Math.PI * 2;
        const cn = Math.cos(th) * r, sn = Math.sin(th) * r * 1.35;
        arr[k * 3] = c.x + nrm.x * cn;
        arr[k * 3 + 1] = c.y + nrm.y * cn;
        arr[k * 3 + 2] = c.z + sn;
        harr[k++] = h[i];
      }
    }
    pos.needsUpdate = true;
    ha.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

const tag = <T extends THREE.Object3D>(o: T, organ: Organ): T => ((o.userData.organ = organ), o);

export class XRay {
  /** inside the head: tract, nose, velum, larynx (template cm) */
  readonly head = new THREE.Group();
  /** in the pedestal: trachea stub and lungs */
  readonly chest = new THREE.Group();
  private tract: FlexTube;
  private nasal: THREE.Mesh;
  private nasalMat: THREE.ShaderMaterial;
  private velum: THREE.Mesh;
  private foldL: THREE.Mesh;
  private foldR: THREE.Mesh;
  private larynx = new THREE.Group();
  readonly lungs: THREE.Mesh[] = [];
  private particles: THREE.Points;
  private path = new THREE.CurvePath<THREE.Vector3>();
  private pu = new Float32Array(PARTICLES);
  private radii = new Float32Array(RINGS);
  private heats = new Float32Array(RINGS);
  readonly mats: THREE.ShaderMaterial[] = [];

  constructor() {
    const ph = new THREE.CatmullRomCurve3([v(0, 0), v(-0.45, 3), v(-0.5, 6), v(-0.1, 8.5), v(0.9, 9.6)]);
    const or = new THREE.CatmullRomCurve3([v(0.9, 9.6), v(2.6, 10.2), v(4.5, 10.1), v(6.1, 9.5), v(7.0, 8.9), v(7.8, 8.5)]);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) pts.push(ph.getPointAt(i / 16));
    for (let i = 0; i < 16; i++) pts.push(or.getPointAt(i / 15));
    this.tract = new FlexTube(pts);
    const m = (c: number, hot?: number, o = 0.85) => {
      const x = glass(c, hot, o);
      this.mats.push(x);
      return x;
    };
    this.head.add(tag(new THREE.Mesh(this.tract.geo, m(0x0ea5e9, 0xff3b6b, 0.9)), "pharynx"));
    this.nasalMat = m(0x8b5cf6, undefined, 0.5);
    this.nasal = tag(new THREE.Mesh(heat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0.9, 9.9), v(2.5, 11.4), v(4.6, 12), v(6.6, 11.8), v(7.6, 11)]), 20, 0.55, 10)), this.nasalMat), "nasal");
    this.head.add(this.nasal);
    const vg = new THREE.SphereGeometry(1, 20, 14);
    vg.scale(1.6, 0.35, 1.4);
    this.velum = tag(new THREE.Mesh(heat(vg), m(0x8b5cf6)), "velum");
    this.head.add(this.velum);
    const lm = m(0x10b981, undefined, 0.75);
    const ring = new THREE.Mesh(heat(new THREE.TorusGeometry(1.5, 0.22, 8, 24)), lm);
    ring.rotation.x = Math.PI / 2;
    this.larynx.add(tag(ring, "larynx"), tag(new THREE.Mesh(heat(new THREE.CylinderGeometry(1.8, 1.4, 2.6, 20, 1, true)), lm), "larynx"));
    const fm = m(0xf59e0b, undefined, 1);
    this.foldL = tag(new THREE.Mesh(heat(new THREE.BoxGeometry(1.8, 0.35, 0.5)), fm), "folds");
    this.foldR = tag(new THREE.Mesh(heat(new THREE.BoxGeometry(1.8, 0.35, 0.5)), fm), "folds");
    this.larynx.add(this.foldL, this.foldR);
    this.head.add(this.larynx);
    this.head.add(tag(new THREE.Mesh(heat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0, 0), v(0.1, -3), v(0.2, -6)]), 10, 0.9, 12)), m(0x0ea5e9, undefined, 0.6)), "trachea"));

    // the pedestal's lungs (their own coordinates: units of the specimen model)
    const lungMat = m(0x10b981, 0xf43f5e, 0.85);
    for (const x of [-0.32, 0.32]) {
      const g = new THREE.IcosahedronGeometry(1, 3);
      g.scale(0.26, 0.4, 0.22);
      const lung = tag(new THREE.Mesh(heat(g), lungMat), "lungs");
      lung.position.set(x, 0, 0);
      this.lungs.push(lung);
      this.chest.add(lung);
    }
    const tm = m(0x0ea5e9, undefined, 0.7);
    this.chest.add(tag(new THREE.Mesh(heat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0, 0.75), v(0, 0.4), v(0, 0.25)]), 8, 0.06, 8)), tm), "trachea"));
    for (const x of [-1, 1]) this.chest.add(tag(new THREE.Mesh(heat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0, 0.25), v(0.12 * x, 0.2), v(0.28 * x, 0.12)]), 8, 0.04, 8)), tm), "trachea"));

    // air particles through the tract and out of the lips
    this.path.add(ph);
    this.path.add(or);
    this.path.add(new THREE.LineCurve3(v(7.8, 8.5), v(12, 8.2)));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
    for (let i = 0; i < PARTICLES; i++) this.pu[i] = Math.random();
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x0ea5e9, size: 0.035, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true }));
    this.head.add(this.particles);
  }

  /** Animate from a (smoothed) telemetry frame. */
  update(s: Float32Array, dt: number, time: number, level: number, opacity: number): void {
    for (let i = 0; i < RINGS; i++) {
      const a = Math.max(0.02, s[F.AREAS + i]);
      this.radii[i] = Math.min(2.6, Math.sqrt(a / Math.PI) * 1.05 + 0.08);
      this.heats[i] = Math.max(0, Math.min(1, 0.45 / (a + 0.25) - 0.15)) * (0.4 + level);
    }
    this.tract.update(this.radii, this.heats);
    const port = Math.max(0, Math.min(1, s[F.VELUM_PORT] * 2.5));
    this.nasalMat.uniforms.opacity.value = (0.15 + 0.7 * port) * opacity;
    this.velum.position.set(1.4, 9.9 - port * 0.8, 0);
    this.velum.rotation.z = -0.5 - port * 0.6;
    this.larynx.position.y = s[F.LARYNX] * 1.2;
    const voicing = Math.max(0, Math.min(1, s[F.VOICING]));
    const gap = 0.12 + Math.min(1.2, s[F.GLOTTIS] * 4) + voicing * 0.18 * Math.abs(Math.sin(time * 70));
    this.foldL.position.set(0, 0, -0.27 - gap * 0.5);
    this.foldR.position.set(0, 0, 0.27 + gap * 0.5);
    const breath = 1 + Math.min(0.18, Math.max(0, s[F.P_LUNG]) / 70) + 0.04 * Math.sin(time * 1.4);
    for (const l of this.lungs) l.scale.setScalar(breath);
    const pos = this.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const speed = 0.05 + level * 0.9;
    for (let i = 0; i < PARTICLES; i++) {
      this.pu[i] = (this.pu[i] + dt * speed * (0.25 + (i % 7) * 0.05)) % 1;
      this.path.getPointAt(this.pu[i], p);
      pos.setXYZ(i, p.x, p.y, Math.cos(i * 4.1 + time) * 0.5);
    }
    pos.needsUpdate = true;
    (this.particles.material as THREE.PointsMaterial).opacity = (0.2 + 0.8 * level) * opacity;
    for (const m of this.mats) if (m !== this.nasalMat) m.uniforms.opacity.value = (m.userData.base ?? (m.userData.base = m.uniforms.opacity.value)) * opacity;
  }
}

export const ORGAN_INFO: Record<Organ, { name: string; text: string }> = {
  lungs: { name: "Lungs", text: "The bellows in the pedestal. Lung pressure drives air up through the folds; higher pressure means louder, harsher specimens." },
  trachea: { name: "Trachea", text: "The windpipe from the lungs to the larynx." },
  larynx: { name: "Larynx", text: "The voice box. It rises for brighter voices and drops for darker, bigger ones." },
  folds: { name: "Vocal Folds", text: "Two folds that slap together 50–900 times a second. Their gap is the glottal area the engine simulates." },
  pharynx: { name: "Airway Tube", text: "The simulated vocal tract. Each ring is one cross-section of the area function; red rings are constrictions." },
  velum: { name: "Velum", text: "The soft palate. Lowering it opens the nose for m, n and ŋ." },
  nasal: { name: "Nasal Cavity", text: "Fills with colour when the velum port opens and air resonates through the nose." },
  tongue: { name: "Tongue", text: "Body and tip move independently to shape every vowel and most consonants." },
  jaw: { name: "Jaw", text: "Hinged at the joint below the ear; open vowels drop it, closed vowels lift it." },
  lips: { name: "Lips", text: "Part, round and spread. Rounding lengthens the tract and darkens the sound." },
  teeth: { name: "Teeth & Fangs", text: "The edges where s, sh and f get their hiss." },
  skull: { name: "Specimen", text: "Its skin follows the DNA: green hide for monster, iridescent for alien, chrome for robot, fur tones for animal. Horns, antennae, visor and ears grow with each strand." },
  eyes: { name: "Eyes", text: "Slit pupils that follow your finger. Their glow takes the colour of the dominant strand." },
};
