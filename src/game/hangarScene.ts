import * as THREE from "three";
import { createDrone, DRONE_FOOT_CLEARANCE } from "./models";
import type { WarheadId } from "./types";

/* ------------------------------------------------------------------ */
/*  Procedural textures                                               */
/* ------------------------------------------------------------------ */

function woodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#a07c56";
  ctx.fillRect(0, 0, 1024, 1024);
  const plankH = 1024 / 5;
  const shades = ["#ab8760", "#9c7a55", "#b28d66", "#a2805a", "#ae8a62"];
  for (let p = 0; p < 5; p++) {
    const y = p * plankH;
    ctx.fillStyle = shades[p];
    ctx.fillRect(0, y, 1024, plankH);
    // grain
    for (let i = 0; i < 130; i++) {
      const gy = y + Math.random() * plankH;
      const amp = 2 + Math.random() * 7;
      ctx.strokeStyle = `rgba(${40 + Math.random() * 30}, ${28 + Math.random() * 22}, ${16 + Math.random() * 14}, ${0.06 + Math.random() * 0.13})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= 1024; x += 64) {
        ctx.lineTo(x, gy + Math.sin(x * 0.013 + p * 2.1) * amp + (Math.random() - 0.5) * 2);
      }
      ctx.stroke();
    }
    // knots
    if (p % 2 === 0) {
      const kx = 160 + Math.random() * 700;
      const ky = y + plankH * (0.3 + Math.random() * 0.4);
      for (let r = 16; r > 1; r -= 3) {
        ctx.strokeStyle = `rgba(52, 35, 20, ${0.05 + (16 - r) * 0.012})`;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // plank seam
    ctx.fillStyle = "rgba(28, 20, 13, 0.8)";
    ctx.fillRect(0, y, 1024, 3);
    ctx.fillStyle = "rgba(255, 228, 190, 0.05)";
    ctx.fillRect(0, y + 4, 1024, 1);
  }
  // scratches & wear
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? "230,220,205" : "35,28,20"}, ${0.04 + Math.random() * 0.07})`;
    ctx.lineWidth = 0.5 + Math.random();
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 22);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 1.5);
  tex.anisotropy = 4;
  return tex;
}

function studioGradient(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#4a4238");
  grad.addColorStop(0.32, "#2c2824");
  grad.addColorStop(0.7, "#17181a");
  grad.addColorStop(1, "#0b0c0d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function matTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#17181a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4200; i++) {
    const grey = 18 + Math.random() * 18;
    ctx.fillStyle = `rgba(${grey}, ${grey + 1}, ${grey + 2}, ${0.3 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.4, 1.4);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 512; g += 64) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, 512);
    ctx.moveTo(0, g);
    ctx.lineTo(512, g);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Workbench props                                                   */
/* ------------------------------------------------------------------ */

const std = (color: number, roughness = 0.6, metalness = 0.1) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function buildTapeRoll(): THREE.Group {
  const g = new THREE.Group();
  const tape = std(0x111214, 0.42, 0.18);
  const core = std(0x6b5a45, 0.9, 0.02);

  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.07, 40), tape);
  outer.castShadow = true;
  outer.receiveShadow = true;
  g.add(outer);
  // concentric top-face tapes
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.05 + i * 0.012, 0.052 + i * 0.012, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1b1d20,
        roughness: 0.35,
        metalness: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.0355;
    g.add(ring);
  }
  const topFace = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.112, 48), std(0x191b1e, 0.36, 0.2));
  topFace.rotation.x = -Math.PI / 2;
  topFace.position.y = 0.0352;
  g.add(topFace);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.072, 28, 1, true), core);
  inner.position.y = 0;
  g.add(inner);
  const coreRing = new THREE.Mesh(new THREE.RingGeometry(0.046, 0.052, 32), std(0x9c8a70, 0.9, 0.02));
  coreRing.rotation.x = -Math.PI / 2;
  coreRing.position.y = 0.0365;
  g.add(coreRing);
  return g;
}

function buildZipTie(color: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04, side: THREE.DoubleSide });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.004, 0),
    new THREE.Vector3(0.03, 0.005, 0.075),
    new THREE.Vector3(0.11, 0.005, 0.12),
    new THREE.Vector3(0.2, 0.005, 0.1),
    new THREE.Vector3(0.24, 0.005, 0.02),
    new THREE.Vector3(0.2, 0.005, -0.055),
  ]);
  const tie = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.0055, 5, false), mat);
  tie.scale.y = 0.55;
  tie.castShadow = true;
  g.add(tie);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.02), mat);
  head.position.set(0, 0.006, 0.004);
  head.rotation.y = 0.3;
  head.castShadow = true;
  g.add(head);
  g.rotation.y = rot;
  return g;
}

function buildKnife(): THREE.Group {
  const g = new THREE.Group();
  const handleMat = std(0x26292d, 0.5, 0.45);
  const gripMat = std(0x15171a, 0.72, 0.2);
  const steel = new THREE.MeshStandardMaterial({ color: 0xc6ccd2, roughness: 0.22, metalness: 0.95 });

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.17), handleMat);
  handle.position.set(0, 0.016, 0.045);
  handle.castShadow = true;
  handle.receiveShadow = true;
  g.add(handle);
  for (let i = 0; i < 4; i++) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.012), gripMat);
    grip.position.set(0, 0.016, -0.01 + i * 0.034);
    g.add(grip);
  }
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.03), std(0x585f66, 0.35, 0.8));
  collar.position.set(0, 0.016, -0.055);
  collar.castShadow = true;
  g.add(collar);

  const shape = new THREE.Shape();
  shape.moveTo(-0.011, 0);
  shape.lineTo(0.011, 0);
  shape.lineTo(0.012, -0.055);
  shape.lineTo(0.0, -0.165);
  shape.lineTo(-0.012, -0.055);
  shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.0035, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 1 });
  const blade = new THREE.Mesh(bladeGeo, steel);
  blade.rotation.x = Math.PI / 2;
  blade.position.set(0, 0.012, -0.062);
  blade.castShadow = true;
  g.add(blade);
  return g;
}

function buildKnifeSharpenerOrParts(): THREE.Group {
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.18), std(0x1b1d20, 0.55, 0.35));
  tray.position.y = 0.009;
  tray.castShadow = true;
  tray.receiveShadow = true;
  g.add(tray);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.008, 0.19), std(0x2c3035, 0.45, 0.5));
  rim.position.y = 0.019;
  g.add(rim);
  const parts = [
    { r: 0.02, h: 0.045, c: 0x2e3338, x: -0.08, z: 0.02 },
    { r: 0.012, h: 0.032, c: 0x7b6a4f, x: 0.01, z: -0.03 },
    { r: 0.009, h: 0.024, c: 0x3d4349, x: 0.07, z: 0.04 },
    { r: 0.014, h: 0.02, c: 0x1f2326, x: 0.1, z: -0.02 },
  ];
  for (const p of parts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.h, 16), std(p.c, 0.45, 0.35));
    m.position.set(p.x, 0.03 + p.h / 2, p.z);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

function buildScrews(count: number, spread: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let a = seed;
  const rnd = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.32, metalness: 0.9 });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 8), metal);
    mesh.position.set((rnd() - 0.5) * spread, 0.006, (rnd() - 0.5) * spread);
    mesh.rotation.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Cylinder spanning exactly from point a to point b (no gaps at joints). */
function rodBetween(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 14), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function hinge(parent: THREE.Object3D, p: THREE.Vector3, radius: number, width: number, mat: THREE.Material) {
  // joint barrel with axis along local Z + two knurled caps
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), mat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.copy(p);
  barrel.castShadow = true;
  parent.add(barrel);
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 0.008, 14), std(0x9aa0a6, 0.3, 0.85));
    cap.rotation.x = Math.PI / 2;
    cap.position.set(p.x, p.y, p.z + side * (width / 2 + 0.004));
    parent.add(cap);
  }
}

function buildLamp(): { group: THREE.Group; light: THREE.PointLight } {
  // Architect desk lamp: weighted base -> lower arm -> elbow -> upper arm -> head.
  // Built in a local frame where the lamp reaches along +X; every part shares joint points.
  const g = new THREE.Group();
  const body = std(0x2a2d31, 0.38, 0.72);
  const bodyDark = std(0x1b1d20, 0.45, 0.6);
  const chrome = std(0xb9bfc5, 0.22, 0.92);

  // weighted base with rubber ring and swivel turret
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.026, 40), body);
  base.position.y = 0.013;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.126, 0.006, 40), bodyDark);
  baseRing.position.y = 0.003;
  g.add(baseRing);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.04, 20), body);
  turret.position.y = 0.046;
  turret.castShadow = true;
  g.add(turret);
  // switch on the base
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.018), bodyDark);
  sw.position.set(-0.07, 0.031, 0.03);
  g.add(sw);

  // joint points (shared by the parts that meet there)
  const P0 = new THREE.Vector3(0, 0.074, 0); // shoulder (top of turret)
  const P1 = new THREE.Vector3(-0.07, 0.44, 0); // elbow
  const P2 = new THREE.Vector3(0.3, 0.55, 0); // wrist

  // shoulder yoke: two cheek plates hugging the hinge, sitting on the turret
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.006), body);
    cheek.position.set(0, 0.066 + 0.0, side * 0.019);
    cheek.castShadow = true;
    g.add(cheek);
  }
  hinge(g, P0, 0.016, 0.03, bodyDark);

  // lower arm: twin parallel rods (like a real balanced-arm lamp)
  for (const side of [-1, 1]) {
    const off = new THREE.Vector3(0, 0, side * 0.011);
    rodBetween(g, P0.clone().add(off), P1.clone().add(off), 0.0065, chrome);
  }
  // tension spring running alongside the lower arm
  const springA = P0.clone().lerp(P1, 0.12).add(new THREE.Vector3(0.022, 0, 0));
  const springB = P0.clone().lerp(P1, 0.72).add(new THREE.Vector3(0.022, 0, 0));
  const springDir = new THREE.Vector3().subVectors(springB, springA);
  const coils = 26;
  const springPts: THREE.Vector3[] = [];
  const axis = springDir.clone().normalize();
  const perpA = new THREE.Vector3(0, 0, 1);
  const perpB = new THREE.Vector3().crossVectors(axis, perpA).normalize();
  for (let i = 0; i <= coils * 8; i++) {
    const t = i / (coils * 8);
    const ang = t * coils * Math.PI * 2;
    springPts.push(
      springA
        .clone()
        .addScaledVector(springDir, t)
        .addScaledVector(perpA, Math.cos(ang) * 0.006)
        .addScaledVector(perpB, Math.sin(ang) * 0.006),
    );
  }
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPts), coils * 8, 0.0012, 4, false),
    chrome,
  );
  spring.castShadow = true;
  g.add(spring);
  rodBetween(g, P0.clone().lerp(P1, 0.06), springA, 0.0018, chrome);
  rodBetween(g, springB, P0.clone().lerp(P1, 0.78), 0.0018, chrome);

  // elbow hinge with adjustment knob
  hinge(g, P1, 0.017, 0.034, bodyDark);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 16), body);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(P1.x, P1.y, P1.z + 0.03);
  g.add(knob);

  // upper arm: twin rods from elbow to wrist
  for (const side of [-1, 1]) {
    const off = new THREE.Vector3(0, 0, side * 0.011);
    rodBetween(g, P1.clone().add(off), P2.clone().add(off), 0.0058, chrome);
  }
  hinge(g, P2, 0.015, 0.03, bodyDark);

  // head: neck from the wrist into a closed shade; tilted toward the bench
  const head = new THREE.Group();
  head.position.copy(P2);
  head.rotation.z = 0.95; // shade opening faces down & forward (+X)
  g.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 14), body);
  neck.position.set(0, -0.025, 0);
  neck.castShadow = true;
  head.add(neck);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), body);
  capTop.position.set(0, -0.05, 0);
  capTop.castShadow = true;
  head.add(capTop);
  // outer shade (closed back, open mouth) + lighter reflector inside
  const shadeOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.1, 0.12, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.38, metalness: 0.72, side: THREE.DoubleSide }),
  );
  shadeOuter.position.set(0, -0.11, 0);
  shadeOuter.castShadow = true;
  head.add(shadeOuter);
  const reflector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.039, 0.096, 0.116, 32, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xf2e6d2,
      roughness: 0.35,
      metalness: 0.3,
      emissive: 0xffc98e,
      emissiveIntensity: 0.35,
      side: THREE.BackSide,
    }),
  );
  reflector.position.set(0, -0.11, 0);
  head.add(reflector);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.004, 8, 40), chrome);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, -0.17, 0);
  head.add(rim);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 14), bodyDark);
  socket.position.set(0, -0.075, 0);
  head.add(socket);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 18, 14), new THREE.MeshBasicMaterial({ color: 0xffe2b8 }));
  bulb.position.set(0, -0.11, 0);
  head.add(bulb);
  const light = new THREE.PointLight(0xffc98e, 8, 4.5, 2);
  light.position.set(0, -0.15, 0);
  head.add(light);

  // power cord from the back of the base down off the bench edge
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, 0.012, 0),
    new THREE.Vector3(-0.2, 0.006, 0.02),
    new THREE.Vector3(-0.3, 0.006, 0.08),
  ]);
  const cordMesh = new THREE.Mesh(new THREE.TubeGeometry(cord, 20, 0.005, 6, false), bodyDark);
  cordMesh.castShadow = true;
  g.add(cordMesh);

  return { group: g, light };
}

/* ------------------------------------------------------------------ */
/*  Hangar scene                                                      */
/* ------------------------------------------------------------------ */

export class HangarScene {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private drone: THREE.Group;
  private warheadId: WarheadId;
  private raf = 0;
  private disposed = false;
  private last = performance.now();
  private elapsed = 0;

  // orbit state — the drone never moves; the camera circles it
  private azimuth = 2.5;
  private polar = 1.1;
  private distance = 2.55;
  private target = new THREE.Vector3(0, 0.46, 0.02);
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, warheadId: WarheadId) {
    this.canvas = canvas;
    this.warheadId = warheadId;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);

    // soft studio gradient dome (all-around)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(24, 24, 16),
      new THREE.MeshBasicMaterial({ map: studioGradient(), side: THREE.BackSide }),
    );
    this.scene.add(dome);

    // dark floor beneath the bench
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.92, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.79;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.buildBench();
    this.buildProps();

    // lights: warm soft key + gentle cool fill + warm rim
    this.scene.add(new THREE.HemisphereLight(0xfff3e4, 0x241d16, 1.0));
    this.scene.add(new THREE.AmbientLight(0x8b8378, 0.6));

    const key = new THREE.DirectionalLight(0xffdcae, 5.6);
    key.position.set(3.1, 4.4, 2.7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2.6;
    key.shadow.camera.right = 2.6;
    key.shadow.camera.top = 2.6;
    key.shadow.camera.bottom = -2.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xbfcedd, 1.1);
    fill.position.set(-3.4, 2.4, 1.2);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xffb782, 9, 7, 2);
    rim.position.set(-1.9, 1.35, -2.2);
    this.scene.add(rim);

    const frontFill = new THREE.PointLight(0xfff1de, 22, 7, 2);
    frontFill.position.set(0.7, 1.5, -2.1);
    this.scene.add(frontFill);
    const topFill = new THREE.PointLight(0xffe9cc, 14, 6, 2);
    topFill.position.set(-1.2, 2.0, -1.0);
    this.scene.add(topFill);

    this.drone = this.createPresentationDrone(warheadId);
    this.scene.add(this.drone);

    // interactive orbit
    this.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("dblclick", this.onReset);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    (window as unknown as { __HANGAR__?: HangarScene }).__HANGAR__ = this;
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------------ scene ------------------------------ */

  private buildBench() {
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xffffff, roughness: 0.76, metalness: 0.03 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.42, metalness: 0.65 });
    const mat = new THREE.MeshStandardMaterial({ map: matTexture(), color: 0x9fa4a9, roughness: 0.94, metalness: 0.02 });

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.1, 2.0), wood);
    top.position.y = -0.05;
    top.castShadow = true;
    top.receiveShadow = true;
    this.scene.add(top);

    // protective metal edging
    for (const z of [-1.0, 1.0]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.028, 0.03), darkMetal);
      band.position.set(0, -0.006, z);
      this.scene.add(band);
    }
    for (const x of [-1.55, 1.55]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 2.0), darkMetal);
      band.position.set(x, -0.006, 0);
      this.scene.add(band);
    }

    // ESD mat
    const matFrame = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.014, 1.36), new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.7, metalness: 0.25 }));
    matFrame.position.set(0, 0.005, 0.06);
    matFrame.receiveShadow = true;
    this.scene.add(matFrame);
    const esd = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.014, 1.3), mat);
    esd.position.set(0, 0.014, 0.06);
    esd.receiveShadow = true;
    this.scene.add(esd);

    // assembly marking circle
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.612, 72),
      new THREE.MeshBasicMaterial({ color: 0xb9bec4, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.0225, 0.04);
    this.scene.add(ring);
    const cross = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.036, 20),
      new THREE.MeshBasicMaterial({ color: 0xb9bec4, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    );
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(0, 0.0225, 0.04);
    this.scene.add(cross);

    // legs + stretchers
    for (const x of [-1.38, 1.38]) {
      for (const z of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), darkMetal);
        leg.position.set(x, -0.46, z);
        leg.castShadow = true;
        this.scene.add(leg);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), std(0x141618, 0.8, 0.2));
        foot.position.set(x, -0.83, z);
        this.scene.add(foot);
      }
    }
    for (const z of [-0.82, 0.82]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.055, 0.055), darkMetal);
      rail.position.set(0, -0.62, z);
      this.scene.add(rail);
    }
    for (const x of [-1.38, 1.38]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.52), darkMetal);
      rail.position.set(x, -0.62, 0);
      this.scene.add(rail);
    }

    // shallow drawer under the top
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.5), std(0x2a2d31, 0.5, 0.45));
    drawer.position.set(0.85, -0.19, -0.6);
    drawer.castShadow = true;
    this.scene.add(drawer);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.012), std(0x8f969d, 0.35, 0.8));
    handle.position.set(0.85, -0.19, -0.86);
    this.scene.add(handle);
  }

  private buildProps() {
    const lamp = buildLamp();
    lamp.group.position.set(-1.22, 0, -0.55);
    lamp.group.rotation.y = -0.42;
    this.scene.add(lamp.group);

    const tape = buildTapeRoll();
    tape.position.set(-0.98, 0.056, 0.06);
    tape.rotation.y = 0.5;
    this.scene.add(tape);

    const tie1 = buildZipTie(0xdfe3e7, 0.5);
    tie1.position.set(0.58, 0.021, 0.34);
    this.scene.add(tie1);
    const tie2 = buildZipTie(0x101214, -0.9);
    tie2.position.set(0.5, 0.021, 0.48);
    tie2.rotation.z = 0.03;
    this.scene.add(tie2);

    const knife = buildKnife();
    knife.position.set(0.94, 0.021, -0.18);
    knife.rotation.y = -0.62;
    this.scene.add(knife);

    const tray = buildKnifeSharpenerOrParts();
    tray.position.set(-0.58, 0.021, -0.5);
    tray.rotation.y = 0.22;
    this.scene.add(tray);

    const screws = buildScrews(6, 0.22, 97);
    screws.position.set(0.2, 0.014, -0.58);
    this.scene.add(screws);
    const screws2 = buildScrews(4, 0.16, 41);
    screws2.position.set(-0.78, 0.014, 0.36);
    this.scene.add(screws2);

    // small roll of solder wire
    const solder = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 10, 30), std(0x8d949b, 0.3, 0.9));
    solder.rotation.x = -Math.PI / 2;
    solder.position.set(-0.82, 0.04, -0.28);
    solder.castShadow = true;
    this.scene.add(solder);
  }

  private createPresentationDrone(warheadId: WarheadId): THREE.Group {
    const rig = createDrone(warheadId);
    const group = rig.group;
    group.position.set(0, 0.021 + DRONE_FOOT_CLEARANCE, 0.02);
    group.rotation.y = 0.42;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    // bench article: LEDs powered down, props still
    rig.ledMaterials.forEach((m) => {
      m.emissiveIntensity = 0.35;
    });
    return group;
  }

  /* ---------------------------- interaction ---------------------------- */

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.canvas.style.cursor = "grabbing";
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.azimuth -= dx * 0.0062;
    this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.0045, 0.62, 1.4);
  };

  private onUp = () => {
    this.dragging = false;
    this.canvas.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + e.deltaY * 0.0012), 1.15, 5.0);
  };

  private onReset = () => {
    this.azimuth = 2.5;
    this.polar = 1.1;
    this.distance = 2.55;
  };

  /* ------------------------------ loop ------------------------------ */

  updateWarhead(id: WarheadId) {
    if (id === this.warheadId) return;
    this.warheadId = id;
    this.scene.remove(this.drone);
    this.drone = this.createPresentationDrone(id);
    this.scene.add(this.drone);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.elapsed += dt;

    if (!this.dragging) this.azimuth += dt * 0.085;

    const sinP = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * sinP * this.distance,
      this.target.y + Math.cos(this.polar) * this.distance,
      this.target.z + Math.cos(this.azimuth) * sinP * this.distance,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
    void this.elapsed;
  };

  private resize = () => {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || 300;
    const h = parent?.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("dblclick", this.onReset);
    this.resizeObserver.disconnect();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m instanceof THREE.Material) {
            for (const value of Object.values(m)) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            m.dispose();
          }
        });
      }
    });
    this.renderer.dispose();
  }
}
