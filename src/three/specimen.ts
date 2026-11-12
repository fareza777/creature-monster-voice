/**
 * The Specimen: a sculpted monster bust (modelled procedurally in Blender, tools/blender/
 * build_specimen.py, with its skin detail baked into a normal map and a neutral detail map)
 * rendered with physically based materials in a light studio, lip-synced to the voice engine
 * and dressed by its DNA.
 *
 *  - Face: morph targets jawOpen / mouthWide / mouthRound / snarl / browDown follow the engine's
 *    jaw, lip aperture, spreading and protrusion telemetry (and the output level for sounds with
 *    no articulation, like SFX and recordings); the tongue rides the jaw and follows the tongue
 *    body; the slit-pupil eyes track your finger and blink.
 *  - DNA: the detail map is tinted with a blend of five looks (green hide, iridescent alien,
 *    chrome robot, human, fur tones); horns + tusks, antennae, visor + bolts, animal ears and a
 *    collar grow with their strand.
 *  - Breath: the bust breathes and leans into loud sounds; the pedestal's ring glows with the
 *    voice.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { F } from "../engine/lab.ts";
import { HEAD, headUrl, type HeadKind } from "./heads.ts";

/** The parts of the specimen a tap can name. */
export type Organ = "skull" | "eyes" | "teeth" | "tongue" | "horns";

export const ORGAN_INFO: Record<Organ, { name: string; text: string }> = {
  skull: { name: "Specimen", text: "Its hide follows the DNA: green for monster, iridescent for alien, chrome for robot, fur tones for animal. Every wrinkle and scale moves with the voice." },
  eyes: { name: "Eyes", text: "Slit pupils that follow your finger. Their glow takes the colour of the dominant strand and flares when it roars." },
  teeth: { name: "Fangs", text: "The edges where s, sh and f get their hiss. The jaw drops with every open vowel." },
  tongue: { name: "Tongue", text: "Rides the jaw and lifts with the tongue body the engine simulates for every vowel." },
  horns: { name: "DNA Growths", text: "Horns and tusks for monster, antennae for alien, a visor for robot, ears for animal: each grows with its strand." },
};

export interface Shares { m: number; a: number; r: number; h: number; n: number }

const LOOKS = {
  m: { color: new THREE.Color(0.035, 0.27, 0.09), rough: 0.62, metal: 0.0, sheen: 0.12, irid: 0, coat: 0.2, iris: new THREE.Color(1, 0.42, 0.02) },
  a: { color: new THREE.Color(0.4, 0.24, 1.0), rough: 0.32, metal: 0.05, sheen: 0.0, irid: 1, coat: 0.8, iris: new THREE.Color(0.2, 1, 0.75) },
  r: { color: new THREE.Color(0.9, 0.91, 0.94), rough: 0.2, metal: 0.95, sheen: 0.0, irid: 0, coat: 0.6, iris: new THREE.Color(1, 0.15, 0.1) },
  h: { color: new THREE.Color(0.95, 0.56, 0.4), rough: 0.55, metal: 0.0, sheen: 0.35, irid: 0, coat: 0.12, iris: new THREE.Color(0.25, 0.55, 1) },
  n: { color: new THREE.Color(0.46, 0.25, 0.1), rough: 0.85, metal: 0.0, sheen: 1.0, irid: 0, coat: 0.0, iris: new THREE.Color(1, 0.8, 0.1) },
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** A soft contact shadow (radial gradient), no shadow maps needed. */
function shadowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(40,30,70,0.42)");
  grad.addColorStop(0.5, "rgba(40,30,70,0.16)");
  grad.addColorStop(1, "rgba(40,30,70,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Cosmetic { mesh: THREE.Object3D; amount: number; key: keyof Shares | "mn" | "any" }

/** A glTF node as its meshes: multi-material meshes load as a group of primitives. */
function meshesOf(o: THREE.Object3D | undefined): THREE.Mesh[] {
  if (!o) return [];
  const out: THREE.Mesh[] = [];
  o.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh);
  });
  return out;
}

export class SpecimenScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private root = new THREE.Group();
  private bust = new THREE.Group();
  private head: THREE.Mesh | null = null;
  /** every primitive of the head (skin, mouth): they share the morph targets */
  private headParts: THREE.Mesh[] = [];
  private teeth: THREE.Mesh | null = null;
  private tongue: THREE.Mesh | null = null;
  private tongueBase = new THREE.Vector3();
  private eyes: THREE.Object3D[] = [];
  private eyeScale = new THREE.Vector3(1, 1, 1);
  private blinkAt = 2;
  private blink = 0;
  private skin: THREE.MeshPhysicalMaterial | null = null;
  private iris: THREE.MeshPhysicalMaterial | null = null;
  private ring: THREE.MeshStandardMaterial | null = null;
  private cosmetics: Cosmetic[] = [];
  private pivot = new THREE.Vector3(0, 0.86, -0.05);
  private jawAngle = 0.5;
  private s = new Float32Array(64);
  private shares: Shares = { m: 0, a: 0, r: 0, h: 1, n: 0 };
  private yaw = -0.42;
  private targetYaw = -0.42;
  private pitch = 0.1;
  private dist = 9.2;
  private gaze = new THREE.Vector2(0, 0);
  private raf = 0;
  private running = false;
  private visible = true;
  private lastT = performance.now();
  private pointers = new Map<number, { x: number; y: number }>();
  private downAt = { x: 0, y: 0, t: 0 };
  private pinch0 = 0;
  private dist0 = 0;
  private raycaster = new THREE.Raycaster();
  private pickCb: ((o: Organ | null) => void) | null = null;
  private resizeObs: ResizeObserver;
  private visObs: IntersectionObserver;
  private loaded = false;
  private model: THREE.Object3D | null = null;
  private kind: HeadKind | null = null;
  private loadToken = 0;
  /** the head swap: the old head sinks and the new one rises (0 hidden … 1 in place) */
  private reveal = 1;
  onReady: (() => void) | null = null;

  constructor(private host: HTMLElement, private frameSource: () => Float32Array | null) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    this.renderer = r;
    host.appendChild(r.domElement);
    r.domElement.style.touchAction = "none";

    // studio lighting: a generated room environment (offline) + key, rim and fill
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
    key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight(0xb9a6ff, 2.4);
    rim.position.set(3, 3, -4);
    const rim2 = new THREE.DirectionalLight(0x9ff3d1, 1.2);
    rim2.position.set(-4, 2, -3);
    const fill = new THREE.HemisphereLight(0xffffff, 0xe9e2f5, 0.4);
    this.scene.add(key, rim, rim2, fill);

    this.scene.add(this.root);
    this.root.add(this.bust);
    this.bust.scale.setScalar(0.82);
    this.buildPedestal();

    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.visObs = new IntersectionObserver((e) => {
      this.visible = e.some((x) => x.isIntersecting);
      if (this.visible) this.start();
    });
    this.visObs.observe(host);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
    this.start();
  }

  /** A ceramic plinth with gold trims and a ring that glows with the voice. */
  private buildPedestal(): void {
    const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf7f5fb, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x1d1830, roughness: 0.4, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xd8b26a, metalness: 1, roughness: 0.28 });
    this.ring = new THREE.MeshStandardMaterial({ color: 0x0d0b14, emissive: 0x7cff6b, emissiveIntensity: 0.6, roughness: 0.4 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.08, 64), ceramic);
    top.position.y = 0.025;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.016, 8, 96), gold);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = -0.045;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.62, 64), dark);
    column.position.y = -0.36;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.665, 0.014, 8, 96), this.ring);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -0.2;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.94, 0.12, 64), ceramic);
    foot.position.y = -0.73;
    const trim2 = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.018, 8, 96), gold);
    trim2.rotation.x = Math.PI / 2;
    trim2.position.y = -0.665;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.795;
    this.root.add(top, trim, column, glow, foot, trim2, shadow);
    this.root.position.y = 0.2;
  }

  /** Wear another head (loads its GLB; the current one stays until the new one is ready). */
  setHead(kind: HeadKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    const token = ++this.loadToken;
    this.load(kind, token).catch((e) => console.error("specimen model:", e));
  }

  private disposeModel(o: THREE.Object3D): void {
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const t = mat as THREE.MeshStandardMaterial;
        t.map?.dispose();
        t.normalMap?.dispose();
        mat.dispose();
      }
    });
  }

  private async load(kind: HeadKind, token: number): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(headUrl(kind));
    if (token !== this.loadToken) {
      this.disposeModel(gltf.scene);
      return;
    }
    if (this.model) {
      this.bust.remove(this.model);
      this.disposeModel(this.model);
    }
    this.headParts = [];
    this.eyes = [];
    this.cosmetics = [];
    this.teeth = this.tongue = this.head = null;
    this.skin = null;
    this.reveal = 0;
    const node = (n: string) => gltf.scene.getObjectByName(n);
    const byName = (n: string) => meshesOf(node(n))[0];
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        if (sm.emissive && sm.emissiveIntensity) sm.emissiveIntensity = Math.min(sm.emissiveIntensity, 2.5);
      }
    });
    const headNode = node("Head");
    const parts = meshesOf(headNode);
    const head = parts.find((m) => m.morphTargetDictionary?.jawOpen !== undefined) ?? parts[0];
    if (!head || !headNode) throw new Error("specimen model has no Head");
    this.headParts = parts;
    const extras = { ...(headNode.userData ?? {}), ...(head.userData ?? {}) } as { pivot?: number[]; jawAngle?: number };
    if (extras.pivot) this.pivot.set(extras.pivot[0], extras.pivot[1], extras.pivot[2]);
    if (extras.jawAngle) this.jawAngle = extras.jawAngle;
    // premium skin: a physical material over the baked detail and normal maps, tinted by the DNA
    let skin: THREE.MeshPhysicalMaterial | null = null;
    for (const p of parts) {
      const orig = p.material as THREE.MeshStandardMaterial;
      p.userData.organ = "skull";
      if (orig.name !== "Skin") continue;
      if (!skin) {
        skin = new THREE.MeshPhysicalMaterial({
          map: orig.map,
          normalMap: orig.normalMap,
          normalScale: orig.normalScale.clone().multiplyScalar(1.15),
          vertexColors: false,
          color: LOOKS.m.color.clone(),
          roughness: 0.6,
          clearcoat: 0.2,
          clearcoatRoughness: 0.5,
          sheen: 0.25,
          sheenRoughness: 0.6,
          sheenColor: new THREE.Color(0.55, 0.75, 0.6),
          iridescenceIOR: 1.6,
        });
        if (skin.map) skin.map.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      }
      p.material = skin;
      orig.dispose();
    }
    this.skin = skin;
    this.head = head;
    this.teeth = byName("Teeth") ?? null;
    this.tongue = byName("Tongue") ?? null;
    if (this.tongue) this.tongueBase.copy(this.tongue.position);
    this.iris = new THREE.MeshPhysicalMaterial({ color: 0xff8a00, emissive: 0xff6a00, emissiveIntensity: 0.9, roughness: 0.2, clearcoat: 1 });
    for (const n of ["EyeL", "EyeR"]) {
      const e = node(n);
      if (!e) continue;
      for (const m of meshesOf(e)) {
        m.userData.organ = "eyes";
        if ((m.material as THREE.Material).name === "Iris") m.material = this.iris;
      }
      this.eyes.push(e);
    }
    if (this.eyes[0]) this.eyeScale.copy(this.eyes[0].scale);
    if (this.teeth) this.teeth.userData.organ = "teeth";
    if (this.tongue) this.tongue.userData.organ = "tongue";
    const allowed = new Set(HEAD[kind].cosmetics);
    const cos: [string, Cosmetic["key"]][] = [["Horns", "m"], ["Tusks", "mn"], ["Antennae", "a"], ["Visor", "r"], ["AnimalEars", "n"], ["Collar", "r"]];
    for (const [n, k] of cos) {
      const mesh = node(n);
      if (!mesh) continue;
      if (!allowed.has(n)) {
        mesh.visible = false;
        continue;
      }
      // grow from the base of the part
      const bb = new THREE.Box3();
      for (const m of meshesOf(mesh)) {
        m.geometry.computeBoundingBox();
        bb.union(m.geometry.boundingBox!);
      }
      const pivot = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
      for (const m of meshesOf(mesh)) {
        m.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
        m.userData.organ = n === "Visor" || n === "Collar" ? "skull" : "horns";
      }
      mesh.position.add(pivot);
      mesh.scale.setScalar(0.001);
      this.cosmetics.push({ mesh, amount: 0, key: k });
    }
    const extraNode = node("Extras");
    if (extraNode) for (const m of meshesOf(extraNode)) m.userData.organ = "horns";
    this.bust.add(gltf.scene);
    this.model = gltf.scene;
    this.kindSkin = HEAD[kind].skin ? new THREE.Color(HEAD[kind].skin!) : null;
    this.loaded = true;
    this.onReady?.();
  }

  private kindSkin: THREE.Color | null = null;

  setShares(s: Shares): void {
    this.shares = s;
  }

  private skinOverride: THREE.Color | null = null;

  /** A fixed skin colour (CSS hex), or null to follow the DNA. */
  setSkin(hex: string | null | undefined): void {
    this.skinOverride = hex ? new THREE.Color(hex) : null;
  }

  onPick(cb: (o: Organ | null) => void): void {
    this.pickCb = cb;
  }

  resetView(): void {
    this.targetYaw = -0.42;
    this.pitch = 0.1;
    this.dist = 9.2;
  }

  // ---------------------------------------------------------------- input

  private onVisibility = () => {
    if (!document.hidden) this.start();
  };

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        this.dist0 = this.dist;
      }
    });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      this.gaze.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.targetYaw += dx * 0.009;
        this.pitch = Math.max(-0.35, Math.min(0.6, this.pitch + dy * 0.004));
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch0 > 0) this.dist = Math.max(3.5, Math.min(16, (this.dist0 * this.pinch0) / Math.max(10, d)));
      }
    });
    const up = (e: PointerEvent) => {
      const tap = performance.now() - this.downAt.t < 280 && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 10 && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (tap) this.pick(e.clientX, e.clientY);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", (e) => this.pointers.delete(e.pointerId));
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.dist = Math.max(3.5, Math.min(16, this.dist * (1 + e.deltaY * 0.001)));
    }, { passive: false });
  }

  private pick(cx: number, cy: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hits = this.raycaster.intersectObject(this.bust, true).filter((h) => h.object.userData.organ && h.object.visible);
    this.pickCb?.((hits[0]?.object.userData.organ as Organ | undefined) ?? null);
  }

  // ---------------------------------------------------------------- loop

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 34 : 27;
    this.camera.updateProjectionMatrix();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const tick = () => {
      if (!this.visible || document.hidden) {
        this.running = false;
        return;
      }
      this.raf = requestAnimationFrame(tick);
      this.frame();
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const time = now / 1000;
    const f = this.frameSource();
    const s = this.s;
    const k = 1 - Math.exp(-dt * 24);
    if (f) for (let i = 0; i < 24; i++) s[i] += k * (f[i] - s[i]);
    else {
      const br = 0.5 + 0.5 * Math.sin(time * 1.2);
      const idle = [0.12, 2.8, 7.4, 5.9, 8.6, 0.05, 0, 0.4, 0, 0, 0, 0, 2 * br, 0, 0, 0.12 + 0.05 * br];
      for (let i = 0; i < idle.length; i++) s[i] += k * 0.3 * (idle[i] - s[i]);
    }
    const level = clamp01(s[F.LEVEL] * 2.2);
    const sh = this.shares;

    if (this.loaded && this.head) {
      // ---- the face
      // the mouth follows the jaw while the voice is active and rests closed in silence (the
      // engine's resting posture keeps the jaw part-open)
      const activity = clamp01(level * 3 + clamp01(s[F.GATE]) * 0.6);
      const jaw = clamp01((s[F.JAW] - 0.08) * 1.25 + Math.max(0, s[F.LIP_AP]) * 0.18) * (0.08 + 0.92 * activity);
      const open = Math.max(jaw, level * (f && s[F.JAW] < 0.05 ? 0.9 : 0.15));
      const dict = this.head.morphTargetDictionary ?? {};
      const inf = this.head.morphTargetInfluences ?? [];
      const set = (name: string, v: number) => {
        const i = dict[name];
        if (i === undefined) return;
        inf[i] += (v - inf[i]) * Math.min(1, dt * 18);
        for (const p of this.headParts) if (p !== this.head && p.morphTargetInfluences) p.morphTargetInfluences[i] = inf[i];
      };
      set("jawOpen", open);
      set("mouthWide", clamp01((s[F.LIP_WIDTH] - 0.35) * 1.6) * (1 - clamp01(s[F.LIP_PROT])));
      set("mouthRound", clamp01(s[F.LIP_PROT] * 1.2));
      set("snarl", clamp01(sh.m * (0.2 + level * 1.4) + sh.n * level * 0.6));
      set("browDown", clamp01(0.1 + sh.m * 0.6 + sh.r * 0.3 - sh.h * 0.2 + level * 0.35));
      if (this.teeth?.morphTargetDictionary) {
        const ti = this.teeth.morphTargetDictionary.jawOpen;
        if (ti !== undefined) this.teeth.morphTargetInfluences![ti] = inf[dict.jawOpen ?? 0] ?? open;
      }
      const jawNow = inf[dict.jawOpen ?? 0] ?? 0;
      if (this.tongue) {
        // ride the jaw (rotate about the hinge), lift with the tongue body
        const a = this.jawAngle * jawNow;
        const p = this.tongueBase.clone().sub(this.pivot).applyAxisAngle(new THREE.Vector3(1, 0, 0), a).add(this.pivot);
        p.y += (s[F.TB_Y] - 7.4) * 0.03;
        p.z += (s[F.TT_X] - 5.9) * 0.02;
        this.tongue.position.copy(p);
        this.tongue.rotation.x = a;
      }
      // ---- eyes follow the finger, with small saccades and a blink now and then
      const sx = this.gaze.x * 0.35 + Math.sin(time * 0.7) * 0.05, sy = this.gaze.y * 0.25 + Math.sin(time * 1.1) * 0.03;
      if (time > this.blinkAt) {
        this.blink = 1;
        this.blinkAt = time + 2.5 + Math.random() * 4;
      }
      this.blink = Math.max(0, this.blink - dt * 7);
      const lid = 1 - 0.85 * Math.sin(Math.PI * this.blink);
      for (const e of this.eyes) {
        e.rotation.y += (sx - e.rotation.y) * Math.min(1, dt * 8);
        e.rotation.x += (-sy - e.rotation.x) * Math.min(1, dt * 8);
        e.scale.set(this.eyeScale.x, this.eyeScale.y * lid, this.eyeScale.z);
      }
      // ---- skin from the DNA
      if (this.skin) {
        const c = new THREE.Color(0, 0, 0);
        let rough = 0, metal = 0, sheen = 0, irid = 0, coat = 0;
        // hue from the leading creature strand, nudged toward the runner-up; the human share
        // softens it toward skin (a plain weighted mix of complementary hues turns to mud)
        const wild = (["m", "a", "r", "n"] as const).slice().sort((x, y) => sh[y] - sh[x]);
        const [w1, w2] = [sh[wild[0]], sh[wild[1]]];
        if (this.skinOverride) c.copy(this.skinOverride);
        else if (this.kindSkin) c.copy(this.kindSkin);
        else if (w1 > 0.001) c.copy(LOOKS[wild[0]].color).lerp(LOOKS[wild[1]].color, w2 > 0 ? (w2 / (w1 + w2)) * 0.45 : 0);
        else c.copy(LOOKS.h.color);
        if (!this.skinOverride && !this.kindSkin) c.lerp(LOOKS.h.color, sh.h * 0.3);
        // the eyes glow in the dominant strand's colour (a blend of eye colours is just grey)
        const dom = (["m", "a", "r", "h", "n"] as const).reduce((a, b) => (sh[b] > sh[a] ? b : a), "h");
        const iris = LOOKS[dom === "h" && sh.m > 0.15 ? "m" : dom].iris.clone();
        for (const key of ["m", "a", "r", "h", "n"] as const) {
          const w = sh[key], L = LOOKS[key];
          rough += L.rough * w;
          metal += L.metal * w;
          sheen += L.sheen * w;
          irid += L.irid * w;
          coat += L.coat * w;
        }
        const m = this.skin;
        const kk = Math.min(1, dt * 4);
        m.color.lerp(c, kk);
        m.roughness += (rough - m.roughness) * kk;
        m.metalness += (metal - m.metalness) * kk;
        m.sheen += (sheen - m.sheen) * kk;
        m.iridescence += (irid - m.iridescence) * kk;
        m.clearcoat += (coat - m.clearcoat) * kk;
        if (this.iris) {
          this.iris.color.lerp(iris, kk);
          this.iris.emissive.lerp(iris.clone().multiplyScalar(0.6), kk);
          this.iris.emissiveIntensity = 0.7 + level * 1.8;
        }
        if (this.ring) {
          this.ring.emissive.lerp(iris, kk);
          this.ring.emissiveIntensity = 0.35 + level * 2.2;
        }
      }
      for (const cmo of this.cosmetics) {
        const w = cmo.key === "mn" ? Math.max(sh.m, sh.n * 0.8) : cmo.key === "any" ? 1 : sh[cmo.key as keyof Shares];
        const target = ease((w - 0.12) * 2.4);
        cmo.amount += (target - cmo.amount) * Math.min(1, dt * 5);
        const sc = Math.max(0.001, cmo.amount);
        cmo.mesh.scale.setScalar(sc);
        cmo.mesh.visible = sc > 0.01;
      }
    }

    // breathing and presence: the bust rises with each breath and leans into loud sounds; a new
    // head rises out of the pedestal
    this.reveal = Math.min(1, this.reveal + dt * 2.5);
    const rise = ease(this.reveal);
    const breath = Math.sin(time * 1.2);
    this.bust.position.y = breath * 0.012 + level * 0.02 - (1 - rise) * 0.6;
    this.bust.scale.setScalar(0.82 * (1 + breath * 0.004) * (0.6 + 0.4 * rise));
    this.bust.rotation.z = Math.sin(time * 0.6) * 0.012;
    this.bust.rotation.x = -level * 0.06;

    // camera
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 8);
    const target = new THREE.Vector3(0, 0.95, 0);
    this.camera.position.set(target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, target.y + Math.sin(this.pitch) * this.dist, target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.visible = false;
    this.resizeObs.disconnect();
    this.visObs.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      const all = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const x of all) {
        const t = x as THREE.MeshStandardMaterial;
        t.map?.dispose();
        t.normalMap?.dispose();
        x.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
