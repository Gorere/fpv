import * as THREE from "three";
import type { WarheadId } from "./types";

/* ------------------------------------------------------------------ */
/*  Materials & procedural textures                                    */
/* ------------------------------------------------------------------ */

const std = (color: number, roughness = 0.6, metalness = 0.15) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/* ------------------------------------------------------------------ */
/*  Desert camouflage textile & pixelated heads                        */
/* ------------------------------------------------------------------ */

/** Sand / khaki blotch palettes, one per soldier variant. */
const DESERT_CAMO: string[][] = [
  ["#c3b189", "#ab9569", "#8a7450", "#6d5c41", "#d6c69f"],
  ["#bda87c", "#a48d61", "#826d4a", "#65553c", "#cfbd93"],
  ["#c8b58c", "#b0986c", "#8f7a54", "#705f45", "#dccca6"],
  ["#b6a377", "#9c8659", "#7b6847", "#5e4f37", "#c9b88d"],
  ["#c0ac82", "#a68f63", "#856f4c", "#6a5940", "#d2c199"],
];

const camoCache = new Map<number, THREE.CanvasTexture>();

function desertCamoTexture(variant: number): THREE.CanvasTexture {
  const cacheKey = variant % DESERT_CAMO.length;
  const cached = camoCache.get(cacheKey);
  if (cached) return cached;
  const palette = DESERT_CAMO[cacheKey];
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);

  // deterministic blotches
  let seed = 91 + cacheKey * 37;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  // wrap-aware blob so the texture tiles seamlessly
  const blob = (x: number, y: number, rx: number, ry: number, rot: number, fill: string) => {
    ctx.fillStyle = fill;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  for (let i = 0; i < 54; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rx = 6 + rnd() * 17;
    const ry = 5 + rnd() * 14;
    const color = palette[1 + Math.floor(rnd() * (palette.length - 1))];
    blob(x, y, rx, ry, rnd() * Math.PI, color);
  }
  // fine speckle / weave
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,245,220,0.10)" : "rgba(40,30,15,0.10)";
    ctx.fillRect(rnd() * size, rnd() * size, 1.6, 1.6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  camoCache.set(cacheKey, texture);
  return texture;
}

/* 2/2-twill carbon weave tile, like real carbon fabric (see reference photo). */
let carbonTile: HTMLCanvasElement | null = null;

function getCarbonTile(): HTMLCanvasElement {
  if (carbonTile) return carbonTile;
  const size = 200;
  const tows = 10;
  const tow = size / tows;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let j = 0; j < tows; j++) {
    for (let i = 0; i < tows; i++) {
      // 2/2 twill interlacing: diagonal pattern
      const v = (((i - j) % 4) + 4) % 4;
      const vertical = v < 2;
      const x = i * tow;
      const y = j * tow;
      const bright = 0.85 + rnd() * 0.3;
      const grad = vertical
        ? ctx.createLinearGradient(x, 0, x + tow, 0)
        : ctx.createLinearGradient(0, y, 0, y + tow);
      const c = (k: number) => {
        const g = Math.round(30 * k * bright);
        return `rgb(${g},${g + 1},${g + 3})`;
      };
      grad.addColorStop(0, c(0.5));
      grad.addColorStop(0.18, c(1.1));
      grad.addColorStop(0.38, c(2.0));
      grad.addColorStop(0.5, c(2.4));
      grad.addColorStop(0.62, c(2.0));
      grad.addColorStop(0.82, c(1.1));
      grad.addColorStop(1, c(0.5));
      ctx.fillStyle = grad;
      ctx.beginPath();
      (ctx as unknown as { roundRect: (...a: number[]) => void }).roundRect(
        x + 0.4, y + 0.4, tow - 0.8, tow - 0.8, 3,
      );
      ctx.fill();
      // specular thread highlight along the tow
      ctx.strokeStyle = `rgba(150,152,158,${0.1 + rnd() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (vertical) {
        const lx = x + tow * (0.32 + rnd() * 0.1);
        ctx.moveTo(lx, y + 1.5);
        ctx.lineTo(lx, y + tow - 1.5);
      } else {
        const ly = y + tow * (0.32 + rnd() * 0.1);
        ctx.moveTo(x + 1.5, ly);
        ctx.lineTo(x + tow - 1.5, ly);
      }
      ctx.stroke();
    }
  }
  carbonTile = canvas;
  return canvas;
}

/**
 * Carbon-fibre material with a real-world tow scale.
 * repeat values are texture tiles; pick them so tows read ~3 mm on the part.
 */
function carbonMat(repX: number, repY: number): THREE.MeshStandardMaterial {
  const tex = new THREE.CanvasTexture(getCarbonTile());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.34, metalness: 0.5 });
}

export const PALETTE = {
  carbon: () => carbonMat(7, 7),
  carbonPlate: () => carbonMat(5, 5),
  anodizedPurple: () => std(0x5a2d6d, 0.32, 0.85),
  anodizedRed: () => std(0x7c2222, 0.35, 0.82),
  metal: () => std(0xa2a8a2, 0.28, 0.88),
  darkMetal: () => std(0x323533, 0.38, 0.78),
  brass: () => std(0xbfa454, 0.32, 0.82),
  copperWire: () =>
    new THREE.MeshStandardMaterial({
      color: 0xc87b48,
      roughness: 0.24,
      metalness: 0.92,
    }),
  rubber: () => std(0x141615, 0.92, 0.02),
  oliveWarhead: () => std(0x566042, 0.65, 0.12),
  oliveDark: () => std(0x353a2b, 0.82, 0.08),
  tanUniform: () => std(0x766d54, 0.88, 0.02),
  camoGreen: () => std(0x485238, 0.9, 0.02),
  camoBrown: () => std(0x5a4f3b, 0.9, 0.02),
  concrete: () => std(0xa4a294, 0.96, 0.02),
  concreteDark: () => std(0x6e6c60, 0.96, 0.02),
  glass: () =>
    new THREE.MeshStandardMaterial({
      color: 0x1d2827,
      roughness: 0.12,
      metalness: 0.75,
      transparent: true,
      opacity: 0.78,
    }),
  lensOptic: () =>
    new THREE.MeshStandardMaterial({
      color: 0x081710,
      roughness: 0.06,
      metalness: 0.95,
      emissive: 0x0f3622,
      emissiveIntensity: 0.6,
    }),
  black: () => std(0x121413, 0.75, 0.1),
};

const box = (
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/** Box with slightly rounded edges (extruded rounded-rect profile + bevel). */
const roundedBox = (
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  r: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
) => {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw * 0.9, hh * 0.9);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  const bev = Math.min(cr * 0.5, d / 4);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.004, d - bev * 2),
    bevelEnabled: bev > 0.0005,
    bevelThickness: bev,
    bevelSize: Math.min(cr * 0.5, 0.003),
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -Math.max(0.004, d - bev * 2) / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

const cyl = (
  parent: THREE.Object3D,
  rt: number,
  rb: number,
  h: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  seg = 16,
) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/* ------------------------------------------------------------------ */
/*  Warheads                                                           */
/* ------------------------------------------------------------------ */

export interface WarheadModel {
  group: THREE.Group;
  tipZ: number;
  radius: number;
}

/**
 * Contact fuze made of thick copper wire вЂ” a hand-bent bundle of loops that
 * spring forward from an insulating collar, exactly like the improvised
 * contact fuzes seen on real FPV warheads. The loops read clearly in the
 * FPV view and they are the actual contact element of the fuze.
 */
function copperContactFuze(
  parent: THREE.Object3D,
  collarZ: number,
  collarR: number,
  length: number,
): number {
  const copper = new THREE.MeshStandardMaterial({ color: 0xd68f57, roughness: 0.22, metalness: 0.96 });
  const copperDark = new THREE.MeshStandardMaterial({ color: 0x9d5f31, roughness: 0.34, metalness: 0.9 });
  const copperBright = new THREE.MeshStandardMaterial({ color: 0xe8ab74, roughness: 0.18, metalness: 0.98 });

  // crimp collar the wires are pressed into
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(collarR, collarR * 1.2, 0.03, 18), PALETTE.black());
  collar.rotation.x = Math.PI / 2;
  collar.position.z = collarZ;
  collar.castShadow = true;
  parent.add(collar);
  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(collarR * 1.08, 0.004, 8, 20), copperDark);
  collarRing.position.z = collarZ - 0.014;
  parent.add(collarRing);

  let seed = 4241;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const wires = 7;
  let maxTip = collarZ;
  for (let i = 0; i < wires; i++) {
    const a = (i / wires) * Math.PI * 2 + rnd() * 0.45;
    const bow = collarR * (1.45 + rnd() * 0.95); // how far the loop flares out
    const len = length * (0.8 + rnd() * 0.4); // hand-made: varied lengths
    const skew = (rnd() - 0.5) * 0.028;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const at = (r: number, z: number, sk = 0) =>
      new THREE.Vector3(ca * r - sa * sk, sa * r + ca * sk, z);
    const pts = [
      at(collarR * 0.92, collarZ - 0.012),
      at(collarR * 1.18, collarZ - len * 0.2),
      at(bow, collarZ - len * 0.56, skew),
      at(bow * 0.7, collarZ - len * 0.83, skew * 1.6),
      at(bow * 0.42, collarZ - len, skew * 2.1),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
    const mat = i % 3 === 0 ? copperBright : i % 2 === 0 ? copper : copperDark;
    const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, 34, 0.0038, 7, false), mat);
    strand.castShadow = true;
    parent.add(strand);
    maxTip = Math.min(maxTip, collarZ - len);
  }
  return maxTip;
}

export function buildWarhead(id: WarheadId): WarheadModel {
  // Shell-only projectiles (no tail tubes): main body + nose + contact probe.
  const group = new THREE.Group();
  const body = PALETTE.oliveWarhead();
  const bodyDark = std(0x49523a, 0.68, 0.12);
  const metal = PALETTE.darkMetal();
  const aluminum = PALETTE.metal();
  const yellowBand = std(0xd0b44b, 0.55, 0.2);
  const redBand = std(0xb33827, 0.6, 0.15);
  const stencil = std(0xd6cfae, 0.8, 0.05);
  const nozzleMat = std(0x17181a, 0.6, 0.4);

  const band = (r: number, tube: number, z: number, mat: THREE.Material) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 26), mat);
    ring.position.z = z;
    ring.castShadow = true;
    group.add(ring);
  };
  const stencilPlate = (r: number, z: number, w = 0.034, h = 0.02) => {
    for (const sx of [-1, 1]) box(group, 0.004, h, w, stencil, sx * (r + 0.001), 0, z);
  };

  if (id === "pg7vl") {
    // PG-7VL: slim 93mm shaped-charge shell
    cyl(group, 0.048, 0.054, 0.03, bodyDark, 0, 0, -0.035, Math.PI / 2, 0, 0, 20);
    cyl(group, 0.02, 0.02, 0.012, nozzleMat, 0, 0, -0.022, Math.PI / 2, 0, 0, 12);
    cyl(group, 0.054, 0.054, 0.36, body, 0, 0, -0.22, Math.PI / 2, 0, 0, 20);
    band(0.055, 0.004, -0.22, yellowBand);
    band(0.0545, 0.0025, -0.395, bodyDark);
    stencilPlate(0.054, -0.3);
    cyl(group, 0.054, 0.036, 0.22, body, 0, 0, -0.51, Math.PI / 2, 0, 0, 20);
    band(0.037, 0.0025, -0.615, bodyDark);
    const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.2, 20), aluminum);
    tipCone.rotation.x = -Math.PI / 2;
    tipCone.position.z = -0.72;
    tipCone.castShadow = true;
    group.add(tipCone);
    // Two-stage piezo fuse tip recessed into the nose cone
    cyl(group, 0.016, 0.013, 0.024, metal, 0, 0, -0.795, Math.PI / 2, 0, 0, 10);
    cyl(group, 0.013, 0.009, 0.032, metal, 0, 0, -0.822, Math.PI / 2, 0, 0, 10);
    return { group, tipZ: -0.84, radius: 0.06 };
  }

  if (id === "pg7vr") {
    // PG-7VR: heavy tandem shell вЂ” main charge + precursor on a standoff neck
    cyl(group, 0.058, 0.064, 0.03, bodyDark, 0, 0, -0.025, Math.PI / 2, 0, 0, 22);
    cyl(group, 0.022, 0.022, 0.012, nozzleMat, 0, 0, -0.012, Math.PI / 2, 0, 0, 12);
    cyl(group, 0.064, 0.064, 0.34, body, 0, 0, -0.21, Math.PI / 2, 0, 0, 22);
    band(0.065, 0.0045, -0.16, yellowBand);
    band(0.065, 0.0045, -0.3, yellowBand);
    stencilPlate(0.064, -0.23);
    cyl(group, 0.064, 0.032, 0.16, body, 0, 0, -0.46, Math.PI / 2, 0, 0, 20);
    band(0.033, 0.0025, -0.535, bodyDark);
    cyl(group, 0.02, 0.02, 0.24, bodyDark, 0, 0, -0.66, Math.PI / 2, 0, 0, 14);
    cyl(group, 0.036, 0.036, 0.14, body, 0, 0, -0.85, Math.PI / 2, 0, 0, 18);
    band(0.037, 0.003, -0.85, yellowBand);
    const preCone = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.15, 18), aluminum);
    preCone.rotation.x = -Math.PI / 2;
    preCone.position.z = -0.995;
    preCone.castShadow = true;
    group.add(preCone);
    // Two-stage piezo fuse tip recessed into the precursor nose
    cyl(group, 0.015, 0.012, 0.024, metal, 0, 0, -1.055, Math.PI / 2, 0, 0, 10);
    cyl(group, 0.012, 0.009, 0.026, metal, 0, 0, -1.08, Math.PI / 2, 0, 0, 10);
    return { group, tipZ: -1.095, radius: 0.07 };
  }

  // TBG-7V: fat thermobaric shell with blunt nose
  cyl(group, 0.06, 0.066, 0.03, bodyDark, 0, 0, -0.025, Math.PI / 2, 0, 0, 24);
  cyl(group, 0.022, 0.022, 0.012, nozzleMat, 0, 0, -0.012, Math.PI / 2, 0, 0, 12);
  cyl(group, 0.066, 0.066, 0.46, body, 0, 0, -0.27, Math.PI / 2, 0, 0, 24);
  band(0.067, 0.0055, -0.18, redBand);
  band(0.067, 0.004, -0.42, yellowBand);
  band(0.0665, 0.0025, -0.3, bodyDark);
  stencilPlate(0.066, -0.33);
  const blunt = new THREE.Mesh(
    new THREE.SphereGeometry(0.066, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    body,
  );
  blunt.rotation.x = -Math.PI / 2;
  blunt.position.z = -0.51;
  blunt.castShadow = true;
  group.add(blunt);
  // Short aluminium fuse base, then the copper wire contact connector
  cyl(group, 0.026, 0.03, 0.045, aluminum, 0, 0, -0.585, Math.PI / 2, 0, 0, 16);
  const wireTip = copperContactFuze(group, -0.615, 0.03, 0.15);
  return { group, tipZ: wireTip, radius: 0.07 };
}

/* ------------------------------------------------------------------ */
/*  FPV Kamikaze Drone                                                 */
/* ------------------------------------------------------------------ */

export interface DroneRig {
  group: THREE.Group;
  propellers: THREE.Object3D[];
  cameraMount: THREE.Object3D;
  noseLocal: THREE.Vector3;
  skidPoints: THREE.Vector3[];
  ledMaterials: THREE.MeshStandardMaterial[];
}

/** Distance from the drone origin down to the bottom of the rubber feet. */
export const DRONE_FOOT_CLEARANCE = 0.19;

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let cachedBladeGeo: THREE.BufferGeometry | null = null;

/**
 * Realistic FPV propeller blade: tapered + swept planform with a twisted,
 * cambered airfoil section вЂ” like a real HQProp-style blade.
 * Leading edge is at -Z (all motors spin the same way, thrust points +Y).
 */
function bladeGeometry(): THREE.BufferGeometry {
  if (cachedBladeGeo) return cachedBladeGeo;
  const rootR = 0.02;
  const span = 0.25;
  const nS = 18;
  const nC = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  const vid = (i: number, j: number, top: number) => (i * (nC + 1) + j) * 2 + top;
  for (let i = 0; i <= nS; i++) {
    const t = i / nS;
    const r = rootR + t * span;
    let chord = 0.052 + (0.026 - 0.052) * Math.pow(t, 0.8);
    chord *= 1 - 0.55 * smooth01(0.8, 1, t); // rounded tip taper
    const pitch = 0.32 + (0.15 - 0.32) * t; // blade twist, root -> tip
    const camber = chord * (0.09 + (0.05 - 0.09) * t);
    const thick = 0.0044 + (0.002 - 0.0044) * t;
    const sweep = 0.03 * t * t; // tip swept back from the leading edge
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    for (let j = 0; j <= nC; j++) {
      const f = j / nC - 0.5; // -0.5 leading edge .. +0.5 trailing edge
      const along = f * chord;
      const yMid = -along * sp + Math.sin((f + 0.5) * Math.PI) * camber;
      const zc = sweep + along * cp;
      positions.push(r, yMid + thick / 2, zc, r, yMid - thick / 2, zc);
    }
  }
  for (let i = 0; i < nS; i++) {
    for (let j = 0; j < nC; j++) {
      indices.push(vid(i, j, 0), vid(i, j + 1, 0), vid(i + 1, j, 0));
      indices.push(vid(i, j + 1, 0), vid(i + 1, j + 1, 0), vid(i + 1, j, 0));
      indices.push(vid(i, j, 1), vid(i + 1, j, 1), vid(i, j + 1, 1));
      indices.push(vid(i, j + 1, 1), vid(i + 1, j, 1), vid(i + 1, j + 1, 1));
    }
  }
  for (let j = 0; j < nC; j++) {
    indices.push(vid(0, j, 0), vid(0, j, 1), vid(0, j + 1, 0));
    indices.push(vid(0, j + 1, 0), vid(0, j, 1), vid(0, j + 1, 1));
    indices.push(vid(nS, j, 0), vid(nS, j + 1, 0), vid(nS, j, 1));
    indices.push(vid(nS, j + 1, 0), vid(nS, j + 1, 1), vid(nS, j, 1));
  }
  for (let i = 0; i < nS; i++) {
    indices.push(vid(i + 1, 0, 0), vid(i + 1, 0, 1), vid(i, 0, 1));
    indices.push(vid(i + 1, 0, 0), vid(i, 0, 1), vid(i, 0, 0));
    indices.push(vid(i + 1, nC, 0), vid(i, nC, 0), vid(i + 1, nC, 1));
    indices.push(vid(i, nC, 0), vid(i, nC, 1), vid(i + 1, nC, 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  cachedBladeGeo = geo;
  return geo;
}

/** Flexible wire / cable following a smooth path through the given points. */
function wire(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  radius: number,
  mat: THREE.Material,
  segments = 48,
) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.35);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), mat);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createDrone(warheadId: WarheadId): DroneRig {
  const group = new THREE.Group();
  group.name = "fpv-kamikaze-drone";

  // Carbon weave with a true ~3 mm tow scale per part size
  const frameMat = carbonMat(7, 12); // main plates
  const armMat = carbonMat(16, 2); // long arms
  const padMat = carbonMat(3, 3); // motor pads, brackets
  const trimMat = carbonMat(2, 6); // landing legs
  const darkMetal = PALETTE.darkMetal();
  const metal = PALETTE.metal();
  const copper = std(0xa2643a, 0.35, 0.85);
  const copperDark = std(0x7c4a2a, 0.45, 0.7);
  const liion = std(0x2f5cb4, 0.38, 0.3);
  const rubber = PALETTE.rubber();
  const tieMat = std(0x0c0d0e, 0.6, 0.12);
  const redWire = std(0xb8261f, 0.55, 0.05);
  const blueWire = std(0x1f4fb8, 0.55, 0.05);
  const blackWire = std(0x131313, 0.6, 0.05);

  /* ---------- Frame plates: top and bottom are identical ---------- */
  const plateW = 0.21;
  const plateL = 0.36;
  const plateT = 0.0105; // 1.5x thicker frame stock
  const botY = 0; // bottom plate centre
  const topY = 0.078; // top plate centre
  const botTop = botY + plateT / 2;
  const topBottom = topY - plateT / 2;
  const topTop = topY + plateT / 2;
  box(group, plateW, plateT, plateL, frameMat, 0, botY, 0);
  box(group, plateW, plateT, plateL, frameMat, 0, topY, 0);

  // Aluminium standoffs placed clear of the diagonal arms
  const standoffPos: [number, number][] = [
    [-0.094, -0.165], [0.094, -0.165], [-0.094, 0.165], [0.094, 0.165],
    [-0.094, -0.02], [0.094, -0.02], [-0.094, 0.02], [0.094, 0.02],
  ];
  const standH = topBottom - botTop;
  for (const [sx, sz] of standoffPos) {
    cyl(group, 0.0055, 0.0055, standH, PALETTE.anodizedPurple(), sx, botTop + standH / 2, sz, 0, 0, 0, 8);
    cyl(group, 0.0042, 0.0042, 0.003, metal, sx, topTop + 0.0015, sz, 0, 0, 0, 8); // top screw head
    cyl(group, 0.0042, 0.0042, 0.003, metal, sx, botY - plateT / 2 - 0.0015, sz, 0, 0, 0, 8); // bottom screw head
  }

  /* ---------- Arms: clamped on top of the bottom plate ---------- */
  const armT = 0.012; // 1.5x thicker frame stock
  const armY = botTop + armT / 2;
  const armTop = armY + armT / 2;
  const motorPos = [
    { x: 0.34, z: -0.34 },
    { x: -0.34, z: -0.34 },
    { x: 0.34, z: 0.34 },
    { x: -0.34, z: 0.34 },
  ];
  const motorR = Math.hypot(0.34, 0.34);
  const propellers: THREE.Object3D[] = [];

  for (const m of motorPos) {
    const angle = Math.atan2(m.z, m.x);
    const ux = m.x / motorR;
    const uz = m.z / motorR;
    // perpendicular (horizontal) to the arm
    const px = -uz;
    const pz = ux;
    const along = (r: number, off = 0, y = 0) => new THREE.Vector3(ux * r + px * off, y, uz * r + pz * off);

    // Arm beam from the frame centre to just past the motor
    const armLen = 0.5;
    const arm = box(group, armLen, armT, 0.054, armMat, ux * armLen / 2, armY, uz * armLen / 2);
    arm.rotation.y = -angle;

    // Motor mount pad вЂ” long axis strictly along the arm, resting on it
    const padY = armTop + 0.0045;
    const pad = box(group, 0.13, 0.009, 0.058, padMat, m.x, padY, m.z);
    pad.rotation.y = -angle;
    // Four mount bolts through the pad into the motor
    for (const a of [-0.042, 0.042]) {
      for (const b of [-0.017, 0.017]) {
        const bp = along(motorR + a, b, padY + 0.0045);
        cyl(group, 0.003, 0.003, 0.004, darkMetal, bp.x, bp.y, bp.z, 0, 0, 0, 6);
      }
    }

    // Arm screws along the centreline
    for (const r of [0.29, 0.405]) {
      const sp = along(r, 0, armTop + 0.0015);
      cyl(group, 0.0034, 0.0034, 0.003, metal, sp.x, sp.y, sp.z, 0, 0, 0, 6);
    }

    // Motor: stator on the pad, copper bell, shaft + lock nut
    const motorBase = padY + 0.0045;
    cyl(group, 0.033, 0.036, 0.02, darkMetal, m.x, motorBase + 0.01, m.z, 0, 0, 0, 18);
    cyl(group, 0.0365, 0.0365, 0.026, copper, m.x, motorBase + 0.033, m.z, 0, 0, 0, 18);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.0028, 6, 20), copperDark);
    ring.position.set(m.x, motorBase + 0.04, m.z);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    cyl(group, 0.008, 0.008, 0.014, metal, m.x, motorBase + 0.053, m.z, 0, 0, 0, 6);

    // Propeller: 3 realistic twisted blades + spinner, same pitch on all motors
    const prop = new THREE.Group();
    prop.position.set(m.x, motorBase + 0.066, m.z);
    cyl(prop, 0.017, 0.02, 0.016, darkMetal, 0, 0, 0, 0, 0, 0, 12);
    const bladeMat = std(0x1e2124, 0.42, 0.35);
    const bladeGeo = bladeGeometry();
    for (let b = 0; b < 3; b++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = (b / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.castShadow = true;
      bladePivot.add(blade);
      prop.add(bladePivot);
    }
    const spinner = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      darkMetal,
    );
    spinner.position.y = 0.008;
    spinner.castShadow = true;
    prop.add(spinner);
    prop.userData.spin = 1;
    prop.userData.fpvHidden = true;
    group.add(prop);
    propellers.push(prop);

    // Landing leg bolted to the underside of the arm + rubber foot
    const legR = motorR * 0.86;
    const legTop = botTop; // underside of the arm
    const footH = 0.018;
    const legBottom = -DRONE_FOOT_CLEARANCE + footH;
    const legH = legTop - legBottom;
    const lp = along(legR);
    const leg = box(group, 0.018, legH, 0.018, trimMat, lp.x, legBottom + legH / 2, lp.z);
    leg.userData.fpvHidden = true;
    const legPlate = box(group, 0.036, 0.006, 0.036, padMat, lp.x, legTop - 0.003, lp.z);
    legPlate.rotation.y = -angle;
    legPlate.userData.fpvHidden = true;
    const foot = cyl(group, 0.026, 0.026, footH, rubber, lp.x, -DRONE_FOOT_CLEARANCE + footH / 2, lp.z, 0, 0, 0, 12);
    foot.userData.fpvHidden = true;

    // Motor phase wires (red + blue) from the flight board to the motor
    const wireY = armTop + 0.0032;
    for (const [off, mat] of [
      [0.0062, redWire],
      [-0.0062, blueWire],
    ] as const) {
      wire(
        group,
        [
          along(0.062, off * 0.5, 0.033),
          along(0.085, off, 0.024),
          along(0.115, off, wireY),
          along(0.3, off, wireY),
          along(0.415, off, wireY),
          along(0.44, off, motorBase + 0.006),
        ],
        0.0027,
        mat,
      );
    }
    // Two black zip ties holding the wire pair to the arm
    for (const r of [0.235, 0.36]) {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0028, 6, 22), tieMat);
      const tp = along(r, 0, armY + 0.003);
      tie.position.copy(tp);
      tie.rotation.y = Math.PI / 2 - angle;
      tie.scale.set(1, 0.4, 1);
      tie.castShadow = true;
      group.add(tie);
      const head = box(group, 0.008, 0.007, 0.01, tieMat, 0, 0, 0);
      const hp = along(r, 0.031, armY + 0.003);
      head.position.copy(hp);
      head.rotation.y = -angle;
    }
  }

  /* ---------- Green flight-controller board between the plates ---------- */
  const pcbY = 0.03;
  const pcb = box(group, 0.09, 0.005, 0.09, std(0x1f6b3a, 0.45, 0.2), 0, pcbY, 0);
  pcb.castShadow = true;
  // nylon standoffs resting on the crossing arms
  for (const sx of [-0.038, 0.038]) {
    for (const sz of [-0.038, 0.038]) {
      const h = pcbY - 0.0025 - armTop;
      cyl(group, 0.0035, 0.0035, h, std(0xe9e6dc, 0.7, 0.02), sx, armTop + h / 2, sz, 0, 0, 0, 8);
    }
  }
  // gold contact pads along every edge
  const gold = std(0xd9b04a, 0.3, 0.9);
  for (let i = 0; i < 6; i++) {
    const t = -0.035 + i * 0.014;
    box(group, 0.006, 0.002, 0.004, gold, t, pcbY + 0.0035, -0.042);
    box(group, 0.006, 0.002, 0.004, gold, t, pcbY + 0.0035, 0.042);
    box(group, 0.004, 0.002, 0.006, gold, -0.042, pcbY + 0.0035, t);
    box(group, 0.004, 0.002, 0.006, gold, 0.042, pcbY + 0.0035, t);
  }
  // corner motor pads (where the phase wires are soldered)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(group, 0.012, 0.0025, 0.012, gold, sx * 0.04, pcbY + 0.0037, sz * 0.04);
  }
  // MCU, gyro, regulator, capacitor
  box(group, 0.022, 0.004, 0.022, std(0x111214, 0.4, 0.3), 0, pcbY + 0.0045, 0);
  box(group, 0.009, 0.003, 0.009, std(0x16181a, 0.4, 0.3), 0.022, pcbY + 0.004, -0.018);
  box(group, 0.012, 0.004, 0.007, std(0x16181a, 0.4, 0.3), -0.022, pcbY + 0.0045, 0.02);
  cyl(group, 0.006, 0.006, 0.014, std(0x2a2c30, 0.4, 0.4), -0.024, pcbY + 0.0095, -0.02, 0, 0, 0, 10);
  const statusLed = new THREE.MeshStandardMaterial({ color: 0x8aff4d, emissive: 0x62ff20, emissiveIntensity: 1.6 });
  box(group, 0.004, 0.002, 0.003, statusLed, 0.028, pcbY + 0.0035, 0.024);

  /* ---------- Battery brick standing on its edge ---------- */
  const brickW = 0.168;
  const brickH = 0.24;
  const brickL = 0.34;
  const brickBaseY = topTop;
  const brickY = brickBaseY + brickH / 2;
  const brickTop = brickBaseY + brickH;
  const brick = roundedBox(group, brickW, brickH, brickL, 0.012, liion, 0, brickY, 0.0);
  brick.castShadow = true;
  const seamMat = std(0x24406e, 0.5, 0.3);
  for (let i = 1; i < 6; i++) {
    box(group, brickW + 0.002, 0.004, brickL * 0.99, seamMat, 0, brickBaseY + (i / 6) * brickH, 0.0);
  }
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0x1d4fb0, roughness: 0.28, metalness: 0.15 });
  for (const sy of [brickBaseY + 0.07, brickBaseY + 0.17]) {
    roundedBox(group, brickW + 0.004, 0.04, brickL + 0.004, 0.008, tapeMat, 0, sy, 0.0);
  }
  roundedBox(group, brickW + 0.002, 0.012, brickL + 0.002, 0.005, PALETTE.black(), 0, brickTop + 0.005, 0.0);
  box(group, 0.03, 0.004, 0.01, std(0xc22e2e, 0.5, 0.2), 0, brickTop + 0.012, 0.1);
  box(group, 0.01, 0.004, 0.03, std(0xc22e2e, 0.5, 0.2), 0, brickTop + 0.012, 0.1);
  box(group, 0.1, 0.1, 0.004, std(0xd8b62c, 0.55, 0.1), 0, brickBaseY + 0.12, -brickL / 2 - 0.001);

  // Two black straps looping around the battery and the top plate
  const strapX = brickW / 2 + 0.006;
  const strapBottom = topBottom - 0.004;
  const strapTopY = brickTop + 0.013;
  for (const sz of [-0.095, 0.095]) {
    const sideH = strapTopY - strapBottom;
    for (const sx of [-strapX, strapX]) {
      box(group, 0.004, sideH, 0.022, tieMat, sx, strapBottom + sideH / 2, sz);
    }
    box(group, brickW + 0.016, 0.004, 0.022, tieMat, 0, strapTopY, sz);
    box(group, brickW + 0.016, 0.004, 0.022, tieMat, 0, strapBottom, sz);
    box(group, 0.006, 0.024, 0.03, std(0x2b2e32, 0.4, 0.6), strapX + 0.003, brickBaseY + 0.2, sz); // buckle
  }

  // Main power lead: battery rear face -> XT60 -> down past the plate edge -> board
  const rearZ = brickL / 2;
  for (const [ox, mat] of [
    [0.044, redWire],
    [0.058, blackWire],
  ] as const) {
    wire(
      group,
      [
        new THREE.Vector3(ox, brickBaseY + 0.1, rearZ),
        new THREE.Vector3(ox, brickBaseY + 0.1, rearZ + 0.022),
        new THREE.Vector3(ox, brickBaseY + 0.045, rearZ + 0.032),
        new THREE.Vector3(ox, topY, plateL / 2 + 0.018),
        new THREE.Vector3(ox, 0.05, plateL / 2 + 0.012),
        new THREE.Vector3(ox * 0.9, 0.04, plateL / 2 - 0.03),
        new THREE.Vector3(ox * 0.6, pcbY + 0.006, 0.06),
        new THREE.Vector3(ox * 0.5, pcbY + 0.005, 0.042),
      ],
      0.0038,
      mat,
      64,
    );
  }
  // XT60 connector sitting on the lead, just behind the battery
  const xt = box(group, 0.03, 0.018, 0.022, std(0xd9a13a, 0.4, 0.15), 0.051, brickBaseY + 0.072, rearZ + 0.03);
  xt.rotation.x = 0.5;
  // Balance lead plug tucked against the rear face
  box(group, 0.024, 0.016, 0.01, PALETTE.black(), -0.04, brickBaseY + 0.06, rearZ + 0.006);

  /* ---------- FPV camera module at the front, between the plates ---------- */
  const camBody = box(group, 0.052, 0.044, 0.044, std(0x1a1c1b, 0.5, 0.35), 0, 0.04, -0.19, -0.18);
  camBody.userData.fpvHidden = true;
  const camLens = cyl(group, 0.014, 0.014, 0.012, PALETTE.lensOptic(), 0, 0.034, -0.217, Math.PI / 2 - 0.18, 0, 0, 12);
  camLens.userData.fpvHidden = true;
  const camRing = cyl(group, 0.017, 0.017, 0.008, darkMetal, 0, 0.035, -0.213, Math.PI / 2 - 0.18, 0, 0, 12);
  camRing.userData.fpvHidden = true;
  for (const sx of [-0.031, 0.031]) box(group, 0.006, 0.06, 0.03, padMat, sx, 0.04, -0.178);

  /* ---------- Rear VTX + antenna (between the plates) ---------- */
  box(group, 0.034, 0.02, 0.04, std(0x22241f, 0.6, 0.2), -0.01, 0.045, 0.13);
  const antStem = cyl(group, 0.004, 0.004, 0.11, darkMetal, -0.03, 0.06, 0.2, 0.6, 0, 0, 6);
  antStem.castShadow = false;
  cyl(group, 0.013, 0.013, 0.018, std(0x8e2f2f, 0.5, 0.2), -0.03, 0.1, 0.245, 0.6, 0, 0, 10);
  wire(group, [new THREE.Vector3(-0.01, 0.045, 0.11), new THREE.Vector3(-0.02, 0.04, 0.07), new THREE.Vector3(-0.03, pcbY + 0.004, 0.044)], 0.0016, blackWire, 16);

  /* ---------- Status LEDs (rear edge, between the plates) ---------- */
  const ledGreen = new THREE.MeshStandardMaterial({ color: 0x8aff4d, emissive: 0x62ff20, emissiveIntensity: 2.8 });
  const ledRed = new THREE.MeshStandardMaterial({ color: 0xff3b24, emissive: 0xff1e06, emissiveIntensity: 2.8 });
  const ledA = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), ledGreen);
  ledA.position.set(0.07, 0.012, 0.172);
  group.add(ledA);
  const ledB = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), ledRed);
  ledB.position.set(-0.07, 0.012, 0.172);
  group.add(ledB);

  /* ---------- Warhead: slung fully below the bottom plate ---------- */
  const payload = buildWarhead(warheadId);
  const payloadScale = 1.12;
  const shellR = payload.radius * payloadScale; // outer shell radius incl. bands
  const payloadY = botY - plateT / 2 - shellR - 0.004;
  payload.group.scale.set(payloadScale, payloadScale, 1.0);
  payload.group.position.set(0, payloadY, 0.12);
  group.add(payload.group);

  // Two black straps wrapping the shell up against the bottom plate
  for (const sz of [0.03, -0.17]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(shellR + 0.004, 0.0075, 8, 26), tieMat);
    ring.position.set(0, payloadY, sz);
    ring.castShadow = true;
    group.add(ring);
    // strap tabs bolted through the bottom plate
    box(group, 0.05, 0.006, 0.024, tieMat, 0, botY - plateT / 2 - 0.003, sz);
    box(group, 0.014, 0.022, 0.026, tieMat, shellR + 0.01, payloadY + shellR * 0.35, sz);
  }
  // Igniter cable: board -> out past the plate edge -> down onto the shell
  wire(
    group,
    [
      new THREE.Vector3(0.042, pcbY + 0.003, -0.03),
      new THREE.Vector3(0.09, 0.022, -0.06),
      new THREE.Vector3(plateW / 2 + 0.012, 0.0, -0.08),
      new THREE.Vector3(plateW / 2 + 0.006, payloadY + shellR * 0.5, -0.095),
      new THREE.Vector3(shellR * 0.72, payloadY + shellR * 0.72, -0.11),
    ],
    0.0024,
    std(0xb06a35, 0.4, 0.7),
    40,
  );

  /* ---------- Camera vantage point (FPV) ---------- */
  const cameraMount = new THREE.Object3D();
  cameraMount.position.set(0, 0.17, -0.28);
  cameraMount.rotation.x = -0.045;
  group.add(cameraMount);

  const skidR = motorR * 0.86 / Math.SQRT2;
  return {
    group,
    propellers,
    cameraMount,
    noseLocal: new THREE.Vector3(0, payloadY, payload.tipZ + 0.12),
    skidPoints: [
      new THREE.Vector3(skidR, -DRONE_FOOT_CLEARANCE, -skidR),
      new THREE.Vector3(-skidR, -DRONE_FOOT_CLEARANCE, -skidR),
      new THREE.Vector3(skidR, -DRONE_FOOT_CLEARANCE, skidR),
      new THREE.Vector3(-skidR, -DRONE_FOOT_CLEARANCE, skidR),
    ],
    ledMaterials: [ledGreen, ledRed],
  };
}

/* ------------------------------------------------------------------ */
/*  Soldier Rig & Animations                                           */
/* ------------------------------------------------------------------ */

export type SoldierPose = "idle" | "alert" | "run" | "fire" | "dead";

export interface SoldierRig {
  group: THREE.Group;
  /** pivot at the soles; tilts the whole body when the soldier falls */
  fall: THREE.Object3D;
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  rifle: THREE.Object3D;
  muzzle: THREE.Object3D;
  phase: number;
  pose: SoldierPose;
  deadTime: number;
  /** target elevation of the rifle in radians, set by the AI */
  aimPitch: number;
  /** 0..1 recoil impulse, decays in the animator */
  recoil: number;
  /** ground height captured at the moment of death (fall pivot stays put) */
  deathBaseY: number;
  /** which side the body rolls towards while falling (-1 | 1) */
  deathSide: number;
  /** accumulated walk-cycle phase (so cadence can change without snapping) */
  stridePhase: number;
  /** current cadence in rad/s, eased towards the speed-appropriate value */
  strideRate: number;
  /** ground speed in m/s, drives stride cadence and amplitude */
  moveSpeed: number;
  /** 0.4..1 stride amplitude (walk vs sprint) */
  moveAmp: number;
}

/**
 * Infantryman with a proper joint hierarchy (hip -> knee, shoulder -> elbow)
 * so the run cycle and firing stance are articulated rather than a rigid
 * silhouette. ~1.8 m tall; front faces -Z. The soles sit exactly on y = 0 of
 * the group, so placing the group on the ground never sinks the boots.
 */
export function createSoldier(variant: number): SoldierRig {
  const group = new THREE.Group();

  // ------------------------------- palette -------------------------------
  // Desert camouflage: sand/khaki blotches over the whole uniform, with
  // webbing, boots and helmet in matching arid tones.
  const camo = desertCamoTexture(variant);
  const uniform = new THREE.MeshStandardMaterial({
    map: camo,
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
  });
  const uniformDark = new THREE.MeshStandardMaterial({
    map: camo,
    color: 0xb4a78e,
    roughness: 0.97,
    metalness: 0,
  });
  const vest = std([0x9a8a68, 0x8f8060, 0xa2936f][variant % 3], 0.94, 0.02);
  const vestEdge = std(0x6f6047, 0.95, 0.02);
  const skin = std([0xb08a6c, 0xa17c5e, 0xbd9678][variant % 3], 0.85, 0.0);
  const boot = std(0x6b5a43, 0.92, 0.03);
  const metal = PALETTE.darkMetal();
  const gunPoly = std(0x23251f, 0.78, 0.08);
  const gunSteel = std(0x4c5150, 0.42, 0.75);
  const strapMat = std(0x705f45, 0.94, 0.02);
  const glove = std(0x7b6a4e, 0.92, 0.02);
  const helmetMat = std(variant % 2 === 0 ? 0xb1a077 : 0xa8966d, 0.9, 0.03);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x1b2426, roughness: 0.15, metalness: 0.8 });

  const boxD = (...args: Parameters<typeof box>) => {
    const m = box(...args);
    m.userData.detail = true;
    return m;
  };
  const cylD = (...args: Parameters<typeof cyl>) => {
    const m = cyl(...args);
    m.userData.detail = true;
    return m;
  };
  const markDetail = (mesh: THREE.Mesh) => {
    mesh.userData.detail = true;
    return mesh;
  };

  // ------------------------------- skeleton ------------------------------
  // fall pivot: the group origin is at the feet, the body tilts around it
  const fall = new THREE.Group();
  group.add(fall);

  const hips = new THREE.Group();
  hips.position.y = 0.94;
  fall.add(hips);

  // pelvis + belt with pouches
  box(hips, 0.3, 0.15, 0.21, uniform, 0, 0, 0);
  box(hips, 0.33, 0.07, 0.23, strapMat, 0, 0.055, 0);
  boxD(hips, 0.09, 0.1, 0.07, vestEdge, -0.17, 0.03, 0.02); // canteen
  boxD(hips, 0.1, 0.11, 0.06, vestEdge, 0.16, 0.03, 0.05); // IFAK
  boxD(hips, 0.08, 0.08, 0.05, vestEdge, 0.1, 0.03, -0.12); // grenade pouch

  const buildLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, -0.02, 0);
    hips.add(hip);
    // thigh: tapered, with cargo pocket
    cyl(hip, 0.082, 0.07, 0.44, uniform, 0, -0.22, 0, 0, 0, 0, 12);
    boxD(hip, 0.038, 0.14, 0.09, uniformDark, side * 0.075, -0.21, 0);
    // knee joint
    const knee = new THREE.Group();
    knee.position.set(0, -0.45, 0);
    hip.add(knee);
    box(knee, 0.105, 0.09, 0.115, uniform, 0, -0.02, 0);
    boxD(knee, 0.11, 0.115, 0.05, vestEdge, 0, -0.03, -0.075); // knee pad
    // shin
    cyl(knee, 0.068, 0.056, 0.36, uniform, 0, -0.19, 0, 0, 0, 0, 12);
    // combat boot: shaft, toe box, sole вЂ” bottom lands on y = -0.47 (the floor)
    box(knee, 0.105, 0.2, 0.12, boot, 0, -0.37, 0);
    box(knee, 0.115, 0.08, 0.27, boot, 0, -0.43, -0.06);
    boxD(knee, 0.12, 0.03, 0.28, std(0x101211, 0.95, 0.02), 0, -0.455, -0.06);
    boxD(knee, 0.05, 0.05, 0.02, std(0x141616, 0.9, 0.05), 0, -0.44, 0.062); // heel
    for (let i = 0; i < 3; i++) {
      boxD(knee, 0.075, 0.008, 0.008, std(0x3f423a, 0.9, 0.02), 0, -0.35 + i * 0.028, 0.062);
    }
    return { hip, knee };
  };
  const leftLegRig = buildLeg(-1);
  const rightLegRig = buildLeg(1);

  // ------------------------------- torso --------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);
  // torso undershirt / field jacket
  cyl(torso, 0.155, 0.17, 0.42, uniform, 0, 0.24, 0, 0, 0, 0, 12);
  box(torso, 0.31, 0.18, 0.2, uniform, 0, 0.44, 0);
  // shoulders
  box(torso, 0.4, 0.1, 0.2, uniform, 0, 0.46, 0);
  // ballistic vest: front, back, side straps, shoulder straps
  box(torso, 0.33, 0.34, 0.09, vest, 0, 0.31, -0.12);
  box(torso, 0.33, 0.34, 0.09, vest, 0, 0.31, 0.12);
  box(torso, 0.31, 0.34, 0.17, vestEdge, 0, 0.31, 0);
  for (const sx of [-0.12, 0, 0.12]) {
    boxD(torso, 0.09, 0.055, 0.03, vestEdge, sx, 0.2, -0.168); // belt pouches
  }
  for (const sx of [-0.11, 0.11]) {
    boxD(torso, 0.07, 0.12, 0.05, vestEdge, sx, 0.37, -0.17); // mag pouches
    boxD(torso, 0.065, 0.025, 0.045, std(0x8a5a25, 0.85, 0.03), sx, 0.44, -0.17);
  }
  for (const sx of [-0.16, 0.16]) {
    boxD(torso, 0.06, 0.3, 0.03, vestEdge, sx, 0.31, -0.14); // cummerbund
  }
  boxD(torso, 0.035, 0.32, 0.02, strapMat, -0.1, 0.32, -0.172); // chest strap
  boxD(torso, 0.035, 0.32, 0.02, strapMat, 0.1, 0.32, -0.172);
  // radio on the back-left with antenna
  boxD(torso, 0.075, 0.14, 0.05, vestEdge, -0.12, 0.36, 0.18);
  cylD(torso, 0.0025, 0.0025, 0.32, PALETTE.black(), -0.14, 0.58, 0.18, 0, 0, 0.1, 4);
  // hydration / rucksack
  box(torso, 0.26, 0.3, 0.115, vest, 0, 0.29, 0.21);
  boxD(torso, 0.26, 0.04, 0.12, vestEdge, 0, 0.15, 0.21);
  // collar
  cylD(torso, 0.085, 0.09, 0.05, uniformDark, 0, 0.49, 0.0, 0, 0, 0, 10);

  // ------------------------------- arms ---------------------------------
  const buildArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.225, 0.44, 0);
    torso.add(shoulder);
    // deltoid + upper arm
    cyl(shoulder, 0.058, 0.05, 0.32, uniform, 0, -0.16, 0, 0, 0, 0, 10);
    boxD(shoulder, 0.02, 0.075, 0.075, vestEdge, side * 0.05, -0.1, 0); // shoulder patch
    // elbow joint
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.32, 0);
    shoulder.add(elbow);
    cyl(elbow, 0.049, 0.043, 0.28, uniform, 0, -0.14, 0, 0, 0, 0, 10);
    boxD(elbow, 0.05, 0.06, 0.05, vestEdge, 0, -0.02, -0.045); // elbow pad
    boxD(elbow, 0.075, 0.055, 0.085, uniformDark, 0, -0.24, 0); // rolled cuff
    // glove
    box(elbow, 0.08, 0.1, 0.095, glove, 0, -0.33, -0.01);
    return { shoulder, elbow };
  };
  const leftArmRig = buildArm(-1);
  const rightArmRig = buildArm(1);

  // ------------------------------- head ---------------------------------
  const head = new THREE.Group();
  head.position.set(0, 0.53, 0);
  torso.add(head);
  cyl(head, 0.06, 0.068, 0.1, skin, 0, 0.02, 0, 0, 0, 0, 10);
  // balaclava-covered head
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), std(0x5b4c39, 0.95, 0));
  skull.position.y = 0.125;
  skull.scale.set(0.88, 1.06, 0.94);
  head.add(skull);
  box(head, 0.115, 0.05, 0.025, skin, 0, 0.13, -0.083); // exposed eye band
  // ballistic helmet: shell + rim + chin strap
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.133, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.75),
    helmetMat,
  );
  helmet.position.set(0, 0.155, -0.004);
  helmet.scale.set(1.02, 0.95, 1.1);
  helmet.castShadow = true;
  head.add(helmet);
  const helmetRim = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.011, 6, 22), helmetMat);
  helmetRim.rotation.x = Math.PI / 2;
  helmetRim.position.y = 0.152;
  head.add(markDetail(helmetRim));
  boxD(head, 0.035, 0.03, 0.02, metal, 0, 0.215, -0.12); // NVG shroud
  boxD(head, 0.014, 0.03, 0.06, metal, -0.128, 0.17, -0.01); // ARC rail L
  boxD(head, 0.014, 0.03, 0.06, metal, 0.128, 0.17, -0.01); // ARC rail R
  for (const sx of [-1, 1]) {
    cylD(head, 0.03, 0.03, 0.02, PALETTE.black(), sx * 0.115, 0.11, 0.0, 0, 0, Math.PI / 2, 10);
  }
  boxD(head, 0.15, 0.04, 0.04, std(0x1c2222, 0.4, 0.3), 0, 0.15, -0.092); // goggles frame
  boxD(head, 0.12, 0.026, 0.008, lensMat, 0, 0.15, -0.112); // goggle lens
  boxD(head, 0.018, 0.16, 0.01, strapMat, 0.115, 0.105, -0.02); // chin strap

  // Head anonymisation is handled in screen space by the camera post pass
  // (see video.ts), so the soldier keeps a real modelled head and helmet вЂ”
  // the blur patch tracks the head from any angle instead of being a box.

  // ------------------------------- rifle --------------------------------
  const rifle = new THREE.Group();
  rifle.position.set(0.06, 0.23, -0.26);
  torso.add(rifle);
  // receiver, dust cover, stock, grip, magazine, handguard, barrel
  box(rifle, 0.048, 0.075, 0.4, gunSteel, 0, 0, 0);
  box(rifle, 0.042, 0.03, 0.3, gunPoly, 0, 0.05, 0.02);
  box(rifle, 0.04, 0.075, 0.26, gunPoly, 0, 0.005, 0.32); // stock
  boxD(rifle, 0.042, 0.05, 0.03, std(0x141614, 0.9, 0.02), 0, 0.01, 0.46); // butt pad
  box(rifle, 0.038, 0.1, 0.05, gunPoly, 0, -0.075, 0.14, -0.32); // grip
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.185, 0.062), std(0x9a5a25, 0.8, 0.05));
  mag.position.set(0, -0.115, -0.05);
  mag.rotation.x = 0.3;
  rifle.add(mag);
  boxD(rifle, 0.036, 0.04, 0.12, gunPoly, 0, -0.02, -0.22); // magwell
  box(rifle, 0.042, 0.048, 0.24, gunPoly, 0, 0.012, -0.34); // handguard
  boxD(rifle, 0.03, 0.02, 0.2, gunSteel, 0, -0.012, -0.34); // lower rail
  cyl(rifle, 0.01, 0.01, 0.42, gunSteel, 0, 0.022, -0.62, Math.PI / 2, 0, 0, 10); // barrel
  cylD(rifle, 0.015, 0.015, 0.075, gunSteel, 0, 0.022, -0.83, Math.PI / 2, 0, 0, 10); // brake
  boxD(rifle, 0.014, 0.055, 0.02, gunSteel, 0, 0.062, -0.69); // front sight
  boxD(rifle, 0.02, 0.028, 0.1, gunSteel, 0, 0.07, -0.02); // optic rail
  const optic = new THREE.Group();
  optic.position.set(0, 0.088, -0.02);
  optic.rotation.x = 0.03;
  rifle.add(optic);
  cyl(optic, 0.021, 0.021, 0.085, gunPoly, 0, 0, 0, Math.PI / 2, 0, 0, 12);
  cylD(optic, 0.026, 0.026, 0.012, gunSteel, 0, 0, -0.048, Math.PI / 2, 0, 0, 12);
  cylD(optic, 0.026, 0.026, 0.012, gunSteel, 0, 0, 0.048, Math.PI / 2, 0, 0, 12);
  const sling = boxD(rifle, 0.018, 0.16, 0.012, strapMat, 0.03, -0.03, 0.2);
  sling.rotation.z = 0.35;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.022, -0.87);
  rifle.add(muzzle);

  group.scale.setScalar(1.02);
  return {
    group,
    fall,
    hips,
    torso,
    head,
    leftLeg: leftLegRig.hip,
    rightLeg: rightLegRig.hip,
    leftKnee: leftLegRig.knee,
    rightKnee: rightLegRig.knee,
    leftArm: leftArmRig.shoulder,
    rightArm: rightArmRig.shoulder,
    leftElbow: leftArmRig.elbow,
    rightElbow: rightArmRig.elbow,
    rifle,
    muzzle,
    phase: variant * 1.9,
    pose: "idle",
    deadTime: 0,
    aimPitch: 0,
    recoil: 0,
    deathBaseY: 0,
    deathSide: 1,
    stridePhase: variant * 1.7,
    strideRate: 0,
    moveSpeed: 0,
    moveAmp: 1,
  };
}

/**
 * Articulated animator: run cycle (hips + knees + arms + elbows), a shouldered
 * firing stance that actually points the rifle at the drone, breathing, recoil
 * and a forward death collapse. Every joint is eased towards its target so
 * pose changes blend instead of snapping.
 */
export function animateSoldier(rig: SoldierRig, dt: number, t: number, moving: boolean, aiming: boolean) {
  const phase = rig.phase;
  const k = Math.min(1, dt * 16);
  const ease = (o: THREE.Object3D, x: number, y: number, z: number) => {
    o.rotation.x += (x - o.rotation.x) * k;
    o.rotation.y += (y - o.rotation.y) * k;
    o.rotation.z += (z - o.rotation.z) * k;
  };
  const place = (o: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.x += (x - o.position.x) * k;
    o.position.y += (y - o.position.y) * k;
    o.position.z += (z - o.position.z) * k;
  };

  if (rig.pose === "dead") {
    rig.deadTime = Math.min(1, rig.deadTime + dt * 1.9);
    const f = 1 - Math.pow(1 - rig.deadTime, 2.6);
    // knees buckle first, then the body pitches forward over the boots
    const buckle = Math.min(1, rig.deadTime * 5);
    rig.fall.rotation.x = -1.52 * f;
    rig.fall.rotation.z = rig.deathSide * 0.22 * f;
    rig.fall.position.y = 0.13 * f;
    rig.group.position.y = rig.deathBaseY + 0.015 * f;
    rig.hips.position.y = 0.94 - 0.1 * buckle * (1 - f * 0.5);
    rig.leftLeg.rotation.x = -0.15 * f;
    rig.rightLeg.rotation.x = 0.12 * f;
    rig.leftKnee.rotation.x = -0.85 * buckle * (1 - 0.4 * f);
    rig.rightKnee.rotation.x = -0.55 * buckle * (1 - 0.4 * f);
    rig.leftArm.rotation.set(-0.2 * f, 0, -1.1 * f);
    rig.rightArm.rotation.set(-0.3 * f, 0, 0.95 * f);
    rig.leftElbow.rotation.x = 0.4 * f;
    rig.rightElbow.rotation.x = 0.5 * f;
    rig.torso.rotation.x = 0.1 * f;
    rig.head.rotation.set(0.2 * f, 0, 0.25 * f);
    return;
  }

  // recoil impulse decays quickly
  rig.recoil = Math.max(0, rig.recoil - dt * 5.5);
  const kick = rig.recoil * rig.recoil;
  const aim = rig.aimPitch;

  if (moving) {
    // -------------------------------------------------------------------
    // Run cycle: hips swing В±0.62 rad, the swing leg's knee folds while it
    // travels forward, shoulders counter-rotate, torso leans into the run.
    // Cadence and amplitude follow the actual ground speed, so a patrolling
    // soldier walks with short strides and a sprinting one flies.
    // -------------------------------------------------------------------
    const targetRate = rig.moveSpeed < 2.4 ? 5.4 : 9.2;
    rig.strideRate += (targetRate - rig.strideRate) * Math.min(1, dt * 5);
    rig.stridePhase += dt * rig.strideRate;
    rig.moveAmp +=
      (THREE.MathUtils.clamp(rig.moveSpeed / 3.9, 0.42, 1) - rig.moveAmp) * Math.min(1, dt * 5);
    const amp = rig.moveAmp;
    const stride = rig.stridePhase + phase;
    const swing = Math.sin(stride);
    const liftL = Math.max(0, Math.cos(stride));
    const liftR = Math.max(0, -Math.cos(stride));
    const bob = Math.abs(Math.cos(stride));

    rig.hips.position.y += (0.94 - 0.035 * amp + bob * 0.035 * amp - rig.hips.position.y) * k;
    ease(rig.leftLeg, swing * 0.62 * amp, 0.05, 0.02);
    ease(rig.rightLeg, -swing * 0.62 * amp, -0.05, -0.02);
    ease(rig.leftKnee, -(0.1 + liftL * 1.05 * amp), 0, 0);
    ease(rig.rightKnee, -(0.1 + liftR * 1.05 * amp), 0, 0);
    ease(rig.torso, -0.13 * amp - bob * 0.02, -swing * 0.12 * amp, swing * 0.02);
    ease(rig.head, 0.1 * amp, swing * 0.05, 0);
    ease(rig.leftArm, 0.42 - swing * 0.42 * amp, 0, 0.3);
    ease(rig.rightArm, 0.34 + swing * 0.42 * amp, 0, -0.28);
    ease(rig.leftElbow, 1.0 + Math.max(0, -swing) * 0.25, 0, 0.1);
    ease(rig.rightElbow, 1.15 + Math.max(0, swing) * 0.25, 0, -0.1);
    ease(rig.rifle, -0.62 + kick * 0.2, 0.12, 0.05);
    place(rig.rifle, 0.07, 0.21, -0.27);
  } else if (aiming) {
    // -------------------------------------------------------------------
    // Firing stance: bladed feet, butt in the shoulder, cheek on the stock.
    // The rifle pitch follows the target elevation set by the AI, the head
    // tilts with it, recoil pushes straight back through the body.
    // -------------------------------------------------------------------
    const settle = Math.sin(t * 1.7 + phase) * 0.015;
    rig.hips.position.y += (0.93 + settle * 0.5 - rig.hips.position.y) * k;
    ease(rig.leftLeg, -0.16, 0.2, 0.04);
    ease(rig.rightLeg, 0.14, -0.14, -0.04);
    ease(rig.leftKnee, -0.24, 0, 0);
    ease(rig.rightKnee, -0.19, 0, 0);

    ease(rig.torso, -0.05 - kick * 0.05, -0.16 + settle, 0);
    ease(rig.head, aim * 0.8 - 0.03 - kick * 0.08, -0.14, 0.05);

    // rifle points at the target elevation (positive aim = drone above)
    ease(rig.rifle, aim + kick * 0.18, 0.16, 0.02);
    place(rig.rifle, 0.085 + kick * 0.02, 0.3 - kick * 0.01, -0.2 + kick * 0.04);

    // support hand under the handguard, trigger hand at the grip
    ease(rig.leftArm, 1.0 + aim * 0.5 + kick * 0.1, 0, 0.4);
    ease(rig.leftElbow, 0.55, 0, 0.14);
    ease(rig.rightArm, 0.5 + aim * 0.3 + kick * 0.12, 0.05, -0.42);
    ease(rig.rightElbow, 1.35, 0, -0.16);
  } else {
    // -------------------------------------------------------------------
    // Idle / patrol: breathing, weight shift, rifle at low ready.
    // -------------------------------------------------------------------
    const breathe = Math.sin(t * 1.6 + phase) * 0.02;
    rig.hips.position.y += (0.935 + breathe * 0.4 - rig.hips.position.y) * k;
    ease(rig.leftLeg, Math.sin(t * 0.7 + phase) * 0.05, 0.05, 0.01);
    ease(rig.rightLeg, -Math.sin(t * 0.7 + phase) * 0.05, -0.05, -0.01);
    ease(rig.leftKnee, -0.07, 0, 0);
    ease(rig.rightKnee, -0.07, 0, 0);
    ease(rig.torso, 0.01 + breathe, 0.05 * Math.sin(t * 0.45 + phase), 0);
    ease(rig.head, 0.01, 0.2 * Math.sin(t * 0.35 + phase * 0.7), 0);
    ease(rig.leftArm, 0.5, 0, 0.33);
    ease(rig.leftElbow, 0.9, 0, 0.12);
    ease(rig.rightArm, 0.42, 0, -0.3);
    ease(rig.rightElbow, 1.05, 0, -0.12);
    ease(rig.rifle, -0.5, 0.1, 0.05);
    place(rig.rifle, 0.065, 0.2, -0.26);
  }
}

/* ------------------------------------------------------------------ */
/*  Military Vehicles                                                  */
/* ------------------------------------------------------------------ */

export interface WheelRig {
  /** steering pivot: front wheels yaw around it */
  steer: THREE.Group;
  /** rolling pivot: the tyre spins around its X axis */
  spin: THREE.Group;
  front: boolean;
  radius: number;
  side: number;
}

export interface VehicleRig {
  group: THREE.Group;
  paint: THREE.MeshStandardMaterial[];
  wheels: WheelRig[];
  turret: THREE.Object3D | null;
  barrel: THREE.Object3D | null;
  muzzle: THREE.Object3D | null;
  kind: "truck" | "armor";
}

function wheel(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  width: number,
  front: boolean,
): WheelRig {
  const steer = new THREE.Group();
  steer.position.set(x, y, z);
  parent.add(steer);
  const spin = new THREE.Group();
  steer.add(spin);

  const rubber = PALETTE.rubber();
  const rimMat = PALETTE.metal();
  const darkMetal = PALETTE.darkMetal();

  // Carcass + shoulder rings
  cyl(spin, radius, radius, width, rubber, 0, 0, 0, 0, 0, Math.PI / 2, 22);
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, radius * 0.05, 6, 22), rubber);
    ring.position.x = sx * (width / 2 - radius * 0.03);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    ring.receiveShadow = true;
    spin.add(ring);
  }
  // Chunky off-road tread blocks around the circumference
  const blocks = 14;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2 + 0.12;
    box(
      spin,
      width * 0.94,
      radius * 0.11,
      radius * 0.24,
      rubber,
      0,
      Math.cos(a) * radius * 0.985,
      Math.sin(a) * radius * 0.985,
      a,
    );
  }
  // Steel rim, dished faces and hub with lug nuts
  cyl(spin, radius * 0.56, radius * 0.56, width * 0.92, darkMetal, 0, 0, 0, 0, 0, Math.PI / 2, 18);
  for (const sx of [-1, 1]) {
    cyl(spin, radius * 0.5, radius * 0.5, 0.02, rimMat, sx * width * 0.46, 0, 0, 0, 0, Math.PI / 2, 18);
    cyl(spin, radius * 0.62, radius * 0.62, 0.012, darkMetal, sx * width * 0.45, 0, 0, 0, 0, Math.PI / 2, 18);
  }
  cyl(spin, radius * 0.2, radius * 0.2, width + 0.06, rimMat, 0, 0, 0, 0, 0, Math.PI / 2, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cyl(
      spin,
      radius * 0.028,
      radius * 0.028,
      width + 0.075,
      rimMat,
      0,
      Math.cos(a) * radius * 0.34,
      Math.sin(a) * radius * 0.34,
      0,
      0,
      Math.PI / 2,
      6,
    );
  }
  return { steer, spin, front, radius, side: Math.sign(x) };
}

export function createTruck(variant: number): VehicleRig {
  // 6x6 military cargo truck (ZIL-131 class). Front faces -Z.
  const group = new THREE.Group();
  const paintColors = [0x4a5238, 0x565a3c, 0x424a32, 0x5e5a44];
  const paint = std(paintColors[variant % paintColors.length], 0.78, 0.12);
  const paintDark = std(0x333927, 0.84, 0.08);
  const dark = PALETTE.darkMetal();
  const glass = PALETTE.glass();
  const tireM = PALETTE.rubber();
  const strapMat = std(0x2b2f25, 0.95, 0.02);
  const paints = [paint, paintDark];

  // Ladder frame: two rails + cross members (offset to avoid coplanar faces)
  for (const sx of [-0.55, 0.55]) box(group, 0.16, 0.24, 5.4, dark, sx, 0.66, 0.1);
  for (const cz of [-1.6, -0.2, 1.2, 2.4]) box(group, 1.24, 0.12, 0.12, dark, 0, 0.66, cz);

  // Hood + fenders + grille (front clip)
  box(group, 1.86, 0.52, 1.25, paint, 0, 1.12, -2.28);
  box(group, 1.9, 0.07, 1.3, paintDark, 0, 1.41, -2.28); // hood top panel
  for (const sx of [-1, 1]) box(group, 0.42, 0.1, 1.5, paint, sx * 0.86, 1.02, -2.2); // fenders
  box(group, 1.52, 0.4, 0.08, PALETTE.black(), 0, 1.04, -2.93); // grille recess
  for (let i = 0; i < 5; i++) box(group, 0.08, 0.32, 0.03, dark, -0.6 + i * 0.3, 1.04, -2.97); // grille bars
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xe8e2c4, roughness: 0.25, metalness: 0.3, emissive: 0x4a4630, emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) {
    cyl(group, 0.11, 0.11, 0.1, dark, sx * 0.78, 1.04, -2.93, Math.PI / 2, 0, 0, 14); // bucket
    cyl(group, 0.095, 0.095, 0.02, lampMat, sx * 0.78, 1.04, -2.99, Math.PI / 2, 0, 0, 14); // lens
    box(group, 0.1, 0.07, 0.03, std(0xb06a28, 0.5, 0.2), sx * 0.78, 0.88, -2.96); // turn signal
  }
  box(group, 2.1, 0.16, 0.2, dark, 0, 0.62, -2.98); // bumper
  for (const sx of [-0.3, 0.3]) box(group, 0.08, 0.12, 0.16, dark, sx, 0.5, -2.98); // tow hooks

  // Cab with proper window band
  box(group, 2.0, 0.62, 1.45, paint, 0, 1.06, -1.32); // lower cab
  box(group, 2.0, 0.5, 1.45, paint, 0, 1.78, -1.32); // cab roof band
  box(group, 2.02, 0.07, 1.5, paintDark, 0, 2.06, -1.32); // roof
  // Windshield: two slanted panes with center divider
  for (const sx of [-0.46, 0.46]) {
    const ws = box(group, 0.86, 0.52, 0.04, glass, sx, 1.52, -2.02, 0.18, 0, 0);
    ws.castShadow = false;
  }
  box(group, 0.06, 0.54, 0.05, paintDark, 0, 1.52, -2.02, 0.18, 0, 0); // divider
  // Side windows + doors + handles + steps + mirrors
  for (const sx of [-1, 1]) {
    const sw = box(group, 0.04, 0.44, 0.95, glass, sx * 1.0, 1.56, -1.35);
    sw.castShadow = false;
    box(group, 0.03, 0.62, 1.3, paint, sx * 1.0, 1.06, -1.32); // door skin
    box(group, 0.04, 0.05, 0.22, dark, sx * 1.02, 1.28, -1.0); // handle
    box(group, 0.3, 0.06, 0.5, dark, sx * 0.95, 0.62, -1.3); // step
    box(group, 0.03, 0.03, 0.3, dark, sx * 1.08, 1.72, -1.95); // mirror arm
    box(group, 0.04, 0.22, 0.14, dark, sx * 1.1, 1.62, -2.06); // mirror
  }

  // Fuel tank + exhaust stack + air filter behind cab
  cyl(group, 0.26, 0.26, 0.9, paintDark, -0.85, 0.72, -0.35, 0, 0, Math.PI / 2, 14);
  cyl(group, 0.055, 0.055, 1.7, dark, 0.92, 1.35, -0.5, 0, 0, 0, 10); // stack
  cyl(group, 0.075, 0.075, 0.5, dark, 0.92, 0.85, -0.5, 0, 0, 0, 10); // muffler
  cyl(group, 0.12, 0.12, 0.3, paintDark, -0.92, 1.5, -0.55, 0, 0, 0, 12); // air filter

  // Cargo bed: floor + stake walls + tailgate
  box(group, 2.0, 0.12, 3.3, paintDark, 0, 0.86, 0.95);
  for (const sx of [-1, 1]) {
    box(group, 0.07, 0.85, 3.3, paint, sx * 0.985, 1.34, 0.95); // side boards
    for (let i = 0; i < 4; i++) box(group, 0.1, 0.9, 0.09, paintDark, sx * 0.985, 1.35, -0.4 + i * 0.9); // stakes
  }
  box(group, 2.0, 0.85, 0.07, paint, 0, 1.34, 2.57); // tailgate
  box(group, 2.0, 0.85, 0.07, paint, 0, 1.34, -0.67); // headboard
  // Canvas hoop cover: baked half-cylinder, axis along Z, dome up
  const hoopGeo = new THREE.CylinderGeometry(0.98, 0.98, 3.3, 18, 1, false, Math.PI / 2, Math.PI);
  hoopGeo.rotateX(Math.PI / 2);
  const hoopMat = std(0x59603f, 0.95, 0.02);
  const canvas = new THREE.Mesh(hoopGeo, hoopMat);
  canvas.position.set(0, 1.76, 0.95);
  canvas.scale.set(1, 0.72, 1);
  canvas.castShadow = true;
  group.add(canvas);
  paints.push(hoopMat);
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.022, 6, 14, Math.PI), paintDark);
    rib.position.set(0, 1.76, -0.55 + i * 0.62);
    rib.scale.y = 0.72;
    group.add(rib);
    // webbing strap laced over the canvas
    const strap = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.012, 4, 14, Math.PI), strapMat);
    strap.position.set(0, 1.755, -0.55 + i * 0.62 + 0.3);
    strap.scale.y = 0.725;
    group.add(strap);
  }
  // canvas hem lacing along both sides
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      box(group, 0.02, 0.035, 0.05, strapMat, sx * 0.99, 1.72, -0.5 + i * 0.4);
    }
  }

  // Rear: lights, bumperettes, mudflaps, tow pintle
  for (const sx of [-1, 1]) {
    box(group, 0.12, 0.16, 0.05, std(0x8e2418, 0.4, 0.3), sx * 0.8, 0.78, 2.62); // taillight
    box(group, 0.3, 0.14, 0.18, dark, sx * 0.8, 0.6, 2.6); // bumperette
    box(group, 0.42, 0.4, 0.03, tireM, sx * 1.0, 0.42, 2.42); // mudflap
  }
  box(group, 0.14, 0.12, 0.2, dark, 0, 0.55, 2.66); // pintle

  // sloped hood panel (front dips toward the grille) + centre crease
  const hood = box(group, 1.9, 0.05, 1.3, paint, 0, 1.42, -2.26, -0.05, 0, 0);
  hood.castShadow = true;
  box(group, 0.06, 0.02, 1.24, paintDark, 0, 1.45, -2.26, -0.05, 0, 0);
  // radiator cap, wipers, mirrors, number plate
  cyl(group, 0.05, 0.05, 0.05, dark, -0.55, 1.46, -2.7, 0, 0, 0, 10);
  for (const sx of [-0.44, 0.44]) {
    box(group, 0.5, 0.014, 0.02, PALETTE.black(), sx, 1.44, -2.02, -0.5, 0.1, 0);
  }
  box(group, 0.42, 0.13, 0.02, std(0xe8e6d8, 0.8, 0.05), 0, 0.82, -3.02);
  box(group, 0.44, 0.03, 0.025, PALETTE.black(), 0, 0.82, -3.01);
  for (const sx of [-1, 1]) {
    // mirror on a bracket
    box(group, 0.02, 0.28, 0.02, dark, sx * 1.02, 1.62, -2.05);
    box(group, 0.05, 0.24, 0.17, dark, sx * 1.05, 1.74, -2.12);
    box(group, 0.01, 0.2, 0.14, PALETTE.glass(), sx * 1.03, 1.74, -2.13);
    // side marker + step lamp
    box(group, 0.05, 0.05, 0.03, std(0xc98a32, 0.5, 0.3), sx * 0.98, 1.28, -2.55);
  }
  // spare wheel on the headboard
  const spare = cyl(group, 0.46, 0.46, 0.22, PALETTE.rubber(), 0, 1.55, -0.62, 0, 0, 0, 18);
  spare.rotation.x = Math.PI / 2;
  cyl(group, 0.22, 0.22, 0.24, PALETTE.darkMetal(), 0, 1.55, -0.62, 0, 0, 0, 12).rotation.x = Math.PI / 2;
  // cargo: crates, fuel drums, lashed canvas
  for (const [cx, cy, cz, s] of [
    [-0.6, 1.1, 0.3, 1],
    [0.55, 1.05, 0.45, 0.9],
    [0.15, 1.15, 1.7, 1.1],
  ] as const) {
    box(group, 0.55 * s, 0.42 * s, 0.6 * s, std(0x5c5a3a, 0.9, 0.05), cx, cy, cz);
  }
  for (const sx of [-0.62, 0.62]) {
    cyl(group, 0.24, 0.24, 0.62, std(0x4a5038, 0.75, 0.3), sx, 1.04, 1.55, 0, 0, 0, 14);
  }
  // rear tailgate details
  box(group, 2.0, 0.05, 0.02, paintDark, 0, 1.72, 2.6);
  for (const sx of [-0.8, 0.8]) box(group, 0.16, 0.1, 0.02, PALETTE.black(), sx, 1.3, 2.6);
  box(group, 0.5, 0.12, 0.02, std(0xe8e6d8, 0.8, 0.05), 0, 0.95, 2.65);

  // 6 all-terrain wheels (front axle + rear bogie), each with its own
  // steering and rolling pivot so they can animate without breaking the merge
  const wheels: WheelRig[] = [];
  for (const sx of [-1, 1]) {
    for (const wz of [-2.05, 1.15, 2.15]) {
      // wheel arch following the tyre
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 6, 16, Math.PI), paintDark);
      arch.position.set(sx * 1.02, 0.5, wz);
      arch.rotation.set(0, Math.PI / 2, 0);
      arch.castShadow = true;
      group.add(arch);
      // inner mud shield
      box(group, 0.06, 0.5, 1.15, paintDark, sx * 0.95, 0.78, wz);
      wheels.push(wheel(group, sx * 1.0, 0.5, wz, 0.5, 0.34, wz === -2.05));
    }
    // side step under the cab door
    box(group, 0.12, 0.06, 0.9, dark, sx * 1.02, 0.5, -1.2);
    box(group, 0.06, 0.3, 0.06, dark, sx * 1.02, 0.62, -0.85);
    box(group, 0.06, 0.3, 0.06, dark, sx * 1.02, 0.62, -1.55);
  }
  // rear mudflaps hang behind the bogie
  for (const sx of [-1, 1]) box(group, 0.38, 0.36, 0.03, tireM, sx * 1.0, 0.33, 2.68);

  group.rotation.order = "YXZ";
  return { group, paint: paints, wheels, turret: null, barrel: null, muzzle: null, kind: "truck" };
}

export function createArmor(variant: number): VehicleRig {
  // 8x8 amphibious APC (BTR-80 class). Front faces -Z.
  const group = new THREE.Group();
  const paint = std(variant % 2 === 0 ? 0x4a5238 : 0x3f4632, 0.82, 0.16);
  const paintDark = std(0x313726, 0.86, 0.12);
  const dark = PALETTE.darkMetal();
  const steel = std(0x6c7270, 0.4, 0.75);
  const rubber = PALETTE.rubber();
  const strapMat = std(0x2b2f25, 0.95, 0.02);
  const paints = [paint, paintDark];

  // ----------------------------- hull ---------------------------------
  // boat-shaped lower tub
  box(group, 2.46, 0.62, 5.4, paintDark, 0, 0.74, 0.1);
  // upper hull sides with sponsons
  box(group, 2.28, 0.56, 4.5, paint, 0, 1.28, 0.25);
  // front glacis: sloped DOWN toward the nose (rotation.x negative raises
  // the rear edge, not the front one вЂ” this is what was inverted before)
  const glacis = box(group, 2.3, 0.09, 1.66, paint, 0, 1.24, -2.32, -0.62, 0, 0);
  glacis.castShadow = true;
  // bevelled nose plate under the glacis
  box(group, 2.16, 0.42, 0.46, paintDark, 0, 0.86, -2.82, -0.2, 0, 0);
  // front bumper bar with tow shackles
  box(group, 2.3, 0.16, 0.16, paintDark, 0, 0.68, -2.92);
  for (const sx of [-0.55, 0.55]) {
    box(group, 0.16, 0.2, 0.2, dark, sx, 0.6, -2.95);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 14), steel);
    shackle.position.set(sx, 0.5, -2.98);
    shackle.rotation.y = Math.PI / 2;
    group.add(shackle);
  }
  // trim vane (wave deflector) folded flat on the glacis
  box(group, 1.94, 0.06, 0.92, paintDark, 0, 1.5, -2.52, -1.05, 0, 0);
  for (const sx of [-0.6, 0, 0.6]) {
    box(group, 0.06, 0.05, 0.86, steel, sx, 1.53, -2.52, -1.05, 0, 0);
  }
  // rear stern plate slopes the other way and the transom is vertical
  box(group, 2.3, 0.52, 0.14, paint, 0, 1.02, 2.72, 0.16, 0, 0);
  box(group, 2.0, 0.3, 0.1, paintDark, 0, 0.7, 2.8);
  // rear bumperettes + water-jet shrouds
  for (const sx of [-0.85, 0.85]) {
    box(group, 0.34, 0.18, 0.28, dark, sx, 0.62, 2.86);
    box(group, 0.3, 0.22, 0.12, paintDark, sx, 0.95, 2.82);
  }

  // driver / commander hatches and periscopes
  for (const sx of [-0.52, 0.52]) {
    cyl(group, 0.2, 0.2, 0.07, paintDark, sx, 1.58, -1.55, 0, 0, 0, 16);
    const lid = box(group, 0.3, 0.05, 0.34, paint, sx, 1.6, -1.72);
    lid.rotation.x = -0.35;
    for (let k = -1; k <= 1; k++) {
      box(group, 0.11, 0.07, 0.06, PALETTE.glass(), sx + k * 0.12, 1.5, -1.9);
    }
  }
  // engine deck: louvres, hatch and exhaust
  box(group, 1.7, 0.06, 1.5, paintDark, 0, 1.56, 1.45);
  for (let i = 0; i < 7; i++) {
    box(group, 1.5, 0.025, 0.07, steel, 0, 1.6, 0.95 + i * 0.16);
  }
  box(group, 0.55, 0.06, 0.55, paint, 0, 1.6, 2.15);
  cyl(group, 0.09, 0.09, 0.5, steel, 0.9, 1.42, 2.2, Math.PI / 2, 0, 0, 10);
  // stowage boxes on the sponsons
  for (const sx of [-1, 1]) {
    box(group, 0.16, 0.24, 1.15, paintDark, sx * 1.16, 1.28, 1.35);
    box(group, 0.02, 0.05, 0.4, dark, sx * 1.25, 1.28, 1.35);
  }

  // headlights in armoured housings with brush guards (front = -Z)
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xdcd6b4, roughness: 0.28, metalness: 0.35, emissive: 0x3a3626, emissiveIntensity: 0.55,
  });
  for (const sx of [-0.78, 0.78]) {
    box(group, 0.24, 0.22, 0.14, paintDark, sx, 1.16, -2.78);
    box(group, 0.17, 0.15, 0.03, lampMat, sx, 1.16, -2.86);
    for (let b = -1; b <= 1; b++) box(group, 0.03, 0.2, 0.03, dark, sx + b * 0.06, 1.16, -2.88);
    // small IR lamp next to each headlight
    cyl(group, 0.05, 0.05, 0.08, PALETTE.glass(), sx * 1.15, 1.12, -2.8, Math.PI / 2, 0, 0, 10);
  }

  // side shell: troop doors, firing ports, grab rails, mud guards
  for (const sx of [-1, 1]) {
    box(group, 1.2, 0.8, 0.05, paintDark, sx * 1.15, 1.12, 0.85);
    box(group, 0.05, 0.07, 0.24, dark, sx * 1.2, 1.3, 0.95);
    for (const pz of [-1.2, -0.35, 1.9]) {
      cyl(group, 0.05, 0.05, 0.08, PALETTE.black(), sx * 1.16, 1.34, pz, 0, 0, Math.PI / 2, 10);
      box(group, 0.06, 0.02, 0.14, steel, sx * 1.14, 1.42, pz);
    }
    box(group, 0.05, 0.08, 4.55, dark, sx * 1.19, 0.99, 0.2); // rub rail
    for (const gz of [-1.3, 0.9]) {
      box(group, 0.03, 0.03, 0.5, steel, sx * 1.22, 1.5, gz); // grab rail
    }
    box(group, 0.02, 0.28, 0.02, dark, sx * 1.2, 1.68, -2.3); // mirror arm
    box(group, 0.04, 0.2, 0.14, dark, sx * 1.23, 1.8, -2.32); // mirror
  }

  // ----------------------------- turret --------------------------------
  const turret = new THREE.Group();
  turret.position.set(0, 1.62, -0.55);
  group.add(turret);
  cyl(turret, 0.56, 0.78, 0.4, paint, 0, 0.16, 0, 0, 0, 0, 20);
  cyl(turret, 0.6, 0.6, 0.07, paintDark, 0, 0.4, 0, 0, 0, 0, 20);
  // vision blocks around the cupola
  for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) {
    box(turret, 0.11, 0.08, 0.07, PALETTE.glass(), Math.sin(a) * 0.5, 0.33, -Math.cos(a) * 0.5);
  }
  // commander hatch
  cyl(turret, 0.19, 0.19, 0.055, paintDark, 0.16, 0.44, 0.16, 0, 0, 0, 16);
  const hatchLid = box(turret, 0.28, 0.04, 0.3, paint, 0.16, 0.47, 0.02);
  hatchLid.rotation.x = -0.5;
  // sight housing + armoured glass
  box(turret, 0.18, 0.2, 0.26, paintDark, -0.4, 0.34, -0.28);
  box(turret, 0.12, 0.12, 0.02, PALETTE.glass(), -0.4, 0.36, -0.42);
  // KPVT mantlet
  box(turret, 0.36, 0.3, 0.34, paintDark, 0, 0.24, -0.6);
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.24, -0.76);
  turret.add(barrel);
  // barrel with cooling jacket and muzzle brake
  cyl(barrel, 0.048, 0.058, 1.85, steel, 0, 0, -0.95, Math.PI / 2, 0, 0, 12);
  for (let i = 0; i < 5; i++) cyl(barrel, 0.062, 0.062, 0.05, dark, 0, 0, -0.28 - i * 0.15, Math.PI / 2, 0, 0, 12);
  cyl(barrel, 0.072, 0.072, 0.26, dark, 0, 0, -1.95, Math.PI / 2, 0, 0, 12);
  cyl(barrel, 0.026, 0.026, 1.05, steel, 0.13, -0.06, -0.55, Math.PI / 2, 0, 0, 8); // coax PKT
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -2.18);
  barrel.add(muzzle);
  // 902B Tucha smoke dischargers
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      cyl(turret, 0.036, 0.036, 0.16, dark, sx * 0.58, 0.3, 0.02 + i * 0.14, 0.8, 0, sx * -0.4, 8);
    }
  }
  // whip antennas on the hull, not the turret
  cyl(group, 0.008, 0.011, 1.65, PALETTE.black(), 0.86, 2.3, 0.55, 0, 0, 0.05, 6);
  cyl(group, 0.008, 0.011, 1.35, PALETTE.black(), -0.82, 2.14, 1.15, 0, 0, -0.06, 6);

  // extra stowage and fittings that make the hull read as a real BTR
  for (const sx of [-1, 1]) {
    // tow cable coiled along the upper hull
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 12), steel);
    coil.position.set(sx * 1.12, 1.52, 1.9);
    coil.rotation.set(Math.PI / 2, 0, 0);
    group.add(coil);
    // jerry can rack behind the side door
    box(group, 0.12, 0.4, 0.34, paintDark, sx * 1.2, 1.3, -1.9);
    box(group, 0.09, 0.34, 0.28, std(0x51573c, 0.85, 0.2), sx * 1.26, 1.3, -1.9);
  }
  // rolled tarpaulin on the engine deck
  cyl(group, 0.16, 0.16, 1.9, std(0x5e6244, 0.96, 0.02), 0, 1.68, 1.05, 0, 0, Math.PI / 2, 12);
  for (const sx of [-0.7, 0.7]) box(group, 0.06, 0.1, 1.9, strapMat, sx, 1.78, 1.05);
  // armoured searchlight beside the turret ring
  const searchlight = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.2, 12), paintDark);
  searchlight.position.set(-0.66, 1.72, -1.1);
  searchlight.rotation.x = Math.PI / 2 - 0.55;
  group.add(searchlight);
  cyl(group, 0.115, 0.115, 0.02, PALETTE.glass(), -0.66, 1.81, -1.2, Math.PI / 2 - 0.55, 0, 0, 12);
  // rear water-jet ports
  for (const sx of [-0.55, 0.55]) {
    cyl(group, 0.16, 0.16, 0.1, steel, sx, 0.9, 2.86, Math.PI / 2, 0, 0, 12);
  }
  // front towing eyes with shackles
  for (const sx of [-0.85, 0.85]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 12), steel);
    eye.position.set(sx, 0.62, -2.98);
    group.add(eye);
  }

  // ----------------------------- wheels --------------------------------
  const wheels: WheelRig[] = [];
  for (const sx of [-1, 1]) {
    for (const wz of [-1.95, -0.65, 0.75, 2.05]) {
      // wheel arch
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.055, 6, 14, Math.PI), paintDark);
      arch.position.set(sx * 1.2, 0.62, wz);
      arch.rotation.set(0, Math.PI / 2, 0);
      group.add(arch);
      box(group, 0.06, 0.32, 1.15, paintDark, sx * 1.23, 0.86, wz);
      wheels.push(wheel(group, sx * 1.18, 0.54, wz, 0.54, 0.36, wz < 0));
    }
  }
  void rubber;

  group.rotation.order = "YXZ";
  return { group, paint: paints, wheels, turret, barrel, muzzle, kind: "armor" };
}

/* ------------------------------------------------------------------ */
/*  Tactical Field Props                                               */
/* ------------------------------------------------------------------ */

// Shared prop materials so hundreds of bags/crates/barrels can merge
// into a couple of draw calls by the scene optimiser.
const bagMatA = std(0x8a7f5f, 0.98, 0.02);
const bagMatB = std(0x746a4e, 0.98, 0.02);
const crateMat = std(0x565538, 0.9, 0.05);
const crateBandMat = PALETTE.oliveDark();
const barrelMat = std(0x454b35, 0.7, 0.35);

export function createSandbag(x: number, y: number, z: number, rot: number, len = 6): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rot;
  const bagMat1 = bagMatA;
  const bagMat2 = bagMatB;
  for (let row = 0; row < 3; row++) {
    const count = len - row;
    for (let i = 0; i < count; i++) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), i % 2 === 0 ? bagMat1 : bagMat2);
      bag.scale.set(1.15, 0.52, 0.7);
      bag.position.set((i - count / 2 + 0.5) * 0.62, 0.16 + row * 0.28, (row % 2) * 0.05);
      bag.castShadow = true;
      bag.receiveShadow = true;
      group.add(bag);
    }
  }
  return group;
}

export function createCrate(x: number, y: number, z: number, rot: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rot;
  const mat = crateMat;
  box(group, 0.7, 0.5, 0.55, mat, 0, 0.25, 0);
  box(group, 0.72, 0.05, 0.57, crateBandMat, 0, 0.42, 0);
  return group;
}

export function createBarrel(x: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  cyl(group, 0.3, 0.3, 0.9, barrelMat, 0, 0.45, 0, 0, 0, 0, 16);
  return group;
}
