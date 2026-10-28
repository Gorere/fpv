import * as THREE from "three";
import { PALETTE, createBarrel, createCrate, createSandbag } from "./models";
import { mergeStaticScene } from "./optimize";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BoxCollider {
  box: THREE.Box3;
  label: string;
}

export interface TreeCollider {
  x: number;
  z: number;
  r: number;
  top: number;
  label: string;
}

export interface SoldierSpawn {
  x: number;
  z: number;
  y?: number;
  rot: number;
  variant: number;
  squad: string;
}

export interface VehicleSpawn {
  x: number;
  z: number;
  rot: number;
  variant: number;
  kind: "truck" | "armor";
  label: string;
  /** travel direction along the road (+1 east, -1 west) */
  dir?: number;
  /** cruising speed in m/s */
  speed?: number;
  /** index into VEHICLE_ROUTES */
  route?: number;
}

export interface WorldData {
  colliders: BoxCollider[];
  trees: TreeCollider[];
  soldierSpawns: SoldierSpawn[];
  vehicleSpawns: VehicleSpawn[];
  base: THREE.Vector3;
  tag: THREE.Group;
  /** shared clock for wind animation on instanced grass */
  wind: { value: number };
}

/* ------------------------------------------------------------------ */
/*  Deterministic noise & terrain                                      */
/* ------------------------------------------------------------------ */

const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const smoothNoise = (x: number, z: number) => {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

const flatten = (h: number, d: number, radius: number, target: number) => {
  if (d > radius) return h;
  const t = 1 - d / radius;
  const k = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(h, target, k * 0.94);
};

export const BUILDING = { x: 34, z: -24, rot: -0.22, w: 26, d: 15, floorH: 3.3 };
export const BASE_POS = { x: -96, z: 82 };
export const TRENCH = { x1: -46, z1: 10, x2: -32, z2: 10, halfW: 2.0, feather: 3.2, depth: 0.55 };
export const HOUSES = [
  { x: -72, z: 62, rot: 0.35, variant: 0 },
  { x: -58, z: 74, rot: -0.25, variant: 1 },
];

/* ------------------------------------------------------------------ */
/*  Vehicle routes                                                     */
/* ------------------------------------------------------------------ */

export interface VehicleRoute {
  /** closed loop of [x, z] control points */
  points: Array<[number, number]>;
  kind: "truck" | "armor";
  variant: number;
  label: string;
  /** cruising speed in m/s */
  speed: number;
  /** normalised start offset along the loop */
  start?: number;
}

/**
 * Every vehicle owns a separate closed loop and the loops never touch, so a
 * wreck can never sit on somebody else's path. The loops deliberately leave
 * the asphalt: patrols cut across fields, forest clearings and the southern
 * steppe instead of queuing on one road.
 */
export const VEHICLE_ROUTES: VehicleRoute[] = [
  {
    // west field, south of the highway
    points: [
      [-215, -55],
      [-160, -70],
      [-115, -45],
      [-125, 5],
      [-175, 25],
      [-220, 10],
    ],
    kind: "truck",
    variant: 0,
    label: "ГРУЗОВИК · КУНГ",
    speed: 5.4,
    start: 0.05,
  },
  {
    // south-west pasture behind the base
    points: [
      [-170, 112],
      [-140, 155],
      [-90, 175],
      [-35, 155],
      [-30, 118],
      [-90, 112],
      [-145, 110],
    ],
    kind: "truck",
    variant: 1,
    label: "ГРУЗОВИК · ШТАБ",
    speed: 5.9,
    start: 0.32,
  },
  {
    // wide loop around the garrison building
    points: [
      [85, -70],
      [115, -30],
      [95, 10],
      [45, 20],
      [0, -5],
      [15, -55],
      [55, -82],
    ],
    kind: "armor",
    variant: 0,
    label: "БТР-80 · ОХРАНА",
    speed: 6.8,
    start: 0.18,
  },
  {
    // northern field track
    points: [
      [-20, 100],
      [40, 130],
      [110, 120],
      [150, 85],
      [100, 65],
      [30, 70],
      [-30, 80],
    ],
    kind: "truck",
    variant: 2,
    label: "ГРУЗОВИК · СНАРЯЖЕНИЕ",
    speed: 5.6,
    start: 0.55,
  },
  {
    // far east loop, south of the road
    points: [
      [170, -90],
      [225, -55],
      [220, -5],
      [180, 5],
      [145, -25],
      [145, -70],
    ],
    kind: "armor",
    variant: 1,
    label: "БТР-80 · ПОДДЕРЖКА",
    speed: 7.2,
    start: 0.7,
  },
  {
    // southern steppe
    points: [
      [20, 185],
      [95, 215],
      [165, 190],
      [150, 155],
      [80, 158],
      [30, 172],
    ],
    kind: "truck",
    variant: 3,
    label: "ГРУЗОВИК · ТОПЛИВО",
    speed: 5.2,
    start: 0.12,
  },
  {
    // deep south-west corner
    points: [
      [-230, 190],
      [-195, 228],
      [-140, 235],
      [-110, 205],
      [-150, 182],
      [-205, 180],
    ],
    kind: "truck",
    variant: 1,
    label: "ГРУЗОВИК · УАЗ",
    speed: 5.7,
    start: 0.42,
  },
  {
    // southern forest belt clearing
    points: [
      [-45, -125],
      [20, -160],
      [90, -140],
      [85, -112],
      [15, -102],
      [-48, -112],
    ],
    kind: "armor",
    variant: 0,
    label: "БТР-80 · РЕЗЕРВ",
    speed: 6.4,
    start: 0.6,
  },
];

const routeCurveCache = new WeakMap<VehicleRoute, THREE.CatmullRomCurve3>();

/** Smooth closed path for a route (cached). */
export function vehicleRouteCurve(route: VehicleRoute): THREE.CatmullRomCurve3 {
  let curve = routeCurveCache.get(route);
  if (!curve) {
    curve = new THREE.CatmullRomCurve3(
      route.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "catmullrom",
      0.5,
    );
    routeCurveCache.set(route, curve);
  }
  return curve;
}

/* Spatial grid of route samples — used to keep trees and grass off the
   tracks without an O(n²) scan over the whole map. */
let routeGrid: Map<number, Array<[number, number]>> | null = null;
const ROUTE_CELL = 10;
const routeCellKey = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);

function ensureRouteGrid() {
  if (routeGrid) return routeGrid;
  const grid = new Map<number, Array<[number, number]>>();
  for (const route of VEHICLE_ROUTES) {
    const curve = vehicleRouteCurve(route);
    const samples = curve.getSpacedPoints(Math.max(64, Math.round(curve.getLength() / 3)));
    for (const p of samples) {
      const key = routeCellKey(Math.floor(p.x / ROUTE_CELL), Math.floor(p.z / ROUTE_CELL));
      const bucket = grid.get(key);
      if (bucket) bucket.push([p.x, p.z]);
      else grid.set(key, [[p.x, p.z]]);
    }
  }
  routeGrid = grid;
  return grid;
}

/** Is (x, z) within `pad` metres of any vehicle route? */
export function nearVehicleRoute(x: number, z: number, pad: number) {
  const grid = ensureRouteGrid();
  const cx = Math.floor(x / ROUTE_CELL);
  const cz = Math.floor(z / ROUTE_CELL);
  const span = Math.ceil(pad / ROUTE_CELL);
  const pad2 = pad * pad;
  for (let ix = -span; ix <= span; ix++) {
    for (let iz = -span; iz <= span; iz++) {
      const bucket = grid.get(routeCellKey(cx + ix, cz + iz));
      if (!bucket) continue;
      for (const [px, pz] of bucket) {
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz <= pad2) return true;
      }
    }
  }
  return false;
}


const segDist = (x: number, z: number, x1: number, z1: number, x2: number, z2: number) => {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  let t = lenSq > 0 ? ((x - x1) * dx + (z - z1) * dz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
};

function baseHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.0165) * Math.cos(z * 0.019) * 3.1 +
    Math.sin((x + z) * 0.043) * 1.15 +
    Math.cos(x * 0.0071 - z * 0.0093) * 2.3 +
    (smoothNoise(x * 0.035, z * 0.035) - 0.5) * 1.1
  );
}

// Cached trench pad height (flat pad the trench is carved into)
let trenchBase: number | null = null;
const getTrenchBase = () => {
  if (trenchBase === null) trenchBase = baseHeight((TRENCH.x1 + TRENCH.x2) / 2, (TRENCH.z1 + TRENCH.z2) / 2);
  return trenchBase;
};

export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z);

  // road corridor conforms to the smooth centerline profile — the ribbon
  // can never clip through terrain bumps between its edges
  const roadZ = 40 - Math.sin(x * 0.006) * 14;
  const roadD = Math.abs(z - roadZ);
  if (roadD < 13 && Math.abs(x) < 310) {
    const t = 1 - roadD / 13;
    const k = t * t * (3 - 2 * t);
    h = THREE.MathUtils.lerp(h, baseHeight(x, roadZ), k * 0.94);
  }
  h = flatten(h, Math.hypot(x - BUILDING.x, z - BUILDING.z), 30, 1.65);
  h = flatten(h, Math.hypot(x - BASE_POS.x, z - BASE_POS.z), 27, 1.35);
  for (const house of HOUSES) {
    h = flatten(h, Math.hypot(x - house.x, z - house.z), 14, baseHeight(house.x, house.z));
  }
  // trench pad + carved fighting trench
  const midX = (TRENCH.x1 + TRENCH.x2) / 2;
  const midZ = (TRENCH.z1 + TRENCH.z2) / 2;
  h = flatten(h, Math.hypot(x - midX, z - midZ), 17, getTrenchBase());
  const td = segDist(x, z, TRENCH.x1, TRENCH.z1, TRENCH.x2, TRENCH.z2);
  const outer = TRENCH.halfW + TRENCH.feather;
  if (td < outer) {
    if (td <= TRENCH.halfW) {
      h -= TRENCH.depth;
    } else {
      const t = (outer - td) / TRENCH.feather;
      const k = t * t * (3 - 2 * t);
      h -= TRENCH.depth * k;
    }
  }
  return h;
}

export const roadBaseZ = (x: number) => 40 - Math.sin(x * 0.006) * 14;

/* ------------------------------------------------------------------ */
/*  Texture helpers                                                    */
/* ------------------------------------------------------------------ */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function surfaceTexture(base: string, speck: string, grime: string, density = 1200, streaks = 18) {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < density; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 0.4 + Math.random() * 2.3;
      ctx.fillStyle = speck
        .replace("ALPHA", String(0.04 + Math.random() * 0.16))
        .replace("HUE", String(Math.floor(Math.random() * 12)));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < streaks; i++) {
      const x = Math.random() * 512;
      const w = 2 + Math.random() * 16;
      const h = 40 + Math.random() * 300;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, grime.replace("ALPHA", "0.18"));
      grad.addColorStop(1, grime.replace("ALPHA", "0"));
      ctx.fillStyle = grad;
      ctx.fillRect(x, Math.random() * 380, w, h);
    }
    ctx.strokeStyle = grime.replace("ALPHA", "0.1");
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      const x = Math.random() * 512;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, 512);
      ctx.stroke();
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Terrain                                                            */
/* ------------------------------------------------------------------ */

function buildTerrain(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(660, 660, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const grassLow = new THREE.Color(0x687750);
  const grassDry = new THREE.Color(0x9a9166);
  const grassHigh = new THREE.Color(0x7b8654);
  const dirt = new THREE.Color(0x8d7f63);
  const forestFloor = new THREE.Color(0x4e5c3b);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = smoothNoise(x * 0.08 + 12, z * 0.08 - 4);
    const n2 = smoothNoise(x * 0.24, z * 0.24);
    tmp.copy(grassLow).lerp(grassDry, THREE.MathUtils.clamp(n * 1.25 - 0.05, 0, 1));
    tmp.lerp(grassHigh, THREE.MathUtils.clamp((h - 3) / 7, 0, 1) * 0.55);
    const roadD = Math.abs(z - roadBaseZ(x));
    if (roadD < 13 && Math.abs(x) < 300) tmp.lerp(dirt, (1 - roadD / 13) * 0.78);
    if (z < -52) tmp.lerp(forestFloor, THREE.MathUtils.clamp((-52 - z) / 40, 0, 1) * 0.72);
    if (n2 > 0.66) tmp.lerp(dirt, (n2 - 0.66) * 1.35);
    if (n > 0.78) tmp.lerp(new THREE.Color(0x69754a), 0.35);
    const shade = 0.85 + n2 * 0.3;
    colors.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const detail = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#d4d1c0';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2800; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 1 + Math.random() * 5;
      const shade = Math.random();
      ctx.fillStyle = shade > 0.62 ? `rgba(232,226,198,${0.2 + Math.random() * 0.28})` : `rgba(94,106,72,${0.12 + Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (1 + Math.random()), r, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(100,108,72,${0.12 + Math.random() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 22);
      ctx.stroke();
    }
  });
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.repeat.set(110, 110);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0, map: detail });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  return terrain;
}

function buildRoad(scene: THREE.Scene, width: number, yOffset: number, color: number) {
  const points: THREE.Vector3[] = [];
  for (let x = -300; x <= 300; x += 8) {
    const z = roadBaseZ(x);
    points.push(new THREE.Vector3(x, terrainHeight(x, z) + yOffset, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const sampled = curve.getPoints(260);
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  for (let i = 0; i < sampled.length; i++) {
    const p = sampled[i];
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const left = p.clone().addScaledVector(side, half);
    const right = p.clone().addScaledVector(side, -half);
    left.y = terrainHeight(left.x, left.z) + yOffset;
    right.y = terrainHeight(right.x, right.z) + yOffset;
    const mid = p.clone();
    mid.y = terrainHeight(mid.x, mid.z) + yOffset;
    verts.push(left.x, left.y, left.z, mid.x, mid.y, mid.z, right.x, right.y, right.z);
    uvs.push(0, i * 0.12, 0.5, i * 0.12, 1, i * 0.12);
    if (i < sampled.length - 1) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const roadMap = surfaceTexture("#8c8977", "rgba(60,58,48,ALPHA)", "rgba(36,38,30,ALPHA)", 2000, 10);
  roadMap.wrapS = roadMap.wrapT = THREE.RepeatWrapping;
  roadMap.repeat.set(width > 10 ? 1 : 1.4, 4);
  const wide = width > 10;
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: roadMap,
    roughness: 0.97,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: wide ? -1 : -3,
    polygonOffsetUnits: wide ? -1 : -3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = wide ? 1 : 2;
  scene.add(mesh);
  return { curve, sampled };
}

function buildRoadMarkings(scene: THREE.Scene, sampled: THREE.Vector3[]) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x98957b, roughness: 0.95 });
  const geo = new THREE.BoxGeometry(2.6, 0.02, 0.16);
  const inst = new THREE.InstancedMesh(geo, mat, 24);
  let count = 0;
  const dummy = new THREE.Object3D();
  for (let i = 6; i < sampled.length - 6 && count < 24; i += 10) {
    const p = sampled[i];
    const prev = sampled[i - 1];
    const direction = new THREE.Vector3().subVectors(p, prev);
    dummy.position.set(p.x, terrainHeight(p.x, p.z) + 0.205, p.z);
    dummy.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI / 2;
    dummy.updateMatrix();
    inst.setMatrixAt(count++, dummy.matrix);
  }
  inst.count = count;
  scene.add(inst);
}

function buildGrass(scene: THREE.Scene, wind: { value: number }) {
  const blade = new THREE.PlaneGeometry(0.4, 0.52);
  blade.translate(0, 0.26, 0);
  const geo = blade.clone();
  const second = blade.clone();
  second.rotateY(Math.PI / 2);
  const merged = new THREE.BufferGeometry();
  const pos1 = geo.attributes.position.array as Float32Array;
  const pos2 = second.attributes.position.array as Float32Array;
  const uv1 = geo.attributes.uv.array as Float32Array;
  const uv2 = second.attributes.uv.array as Float32Array;
  const idx1 = geo.index!.array as Uint16Array;
  const idx2 = second.index!.array as Uint16Array;
  const verts = new Float32Array([...pos1, ...pos2]);
  const uvs = new Float32Array([...uv1, ...uv2]);
  const idx: number[] = [...idx1];
  const offset = pos1.length / 3;
  for (const i of idx2) idx.push(i + offset);
  merged.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(idx);

  const tuftTexture = canvasTexture(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      const x = 10 + Math.random() * 108;
      const h = 48 + Math.random() * 70;
      const lean = (Math.random() - 0.5) * 38;
      ctx.strokeStyle = `rgba(${112 + Math.floor(Math.random() * 36)},${124 + Math.floor(Math.random() * 32)},${62 + Math.floor(Math.random() * 24)},${0.5 + Math.random() * 0.35})`;
      ctx.lineWidth = 1.4 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.quadraticCurveTo(x + lean * 0.35, 128 - h * 0.55, x + lean, 128 - h);
      ctx.stroke();
    }
  });
  const mat = new THREE.MeshStandardMaterial({
    map: tuftTexture,
    alphaTest: 0.22,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 1,
    color: 0xa9b37e,
    emissive: 0x252d1a,
    emissiveIntensity: 0.5,
  });
  // gentle wind sway: bend the tips of every tuft in the vertex shader
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = `uniform float uWind;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float windPhase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float gust = sin(uWind * 1.7 + windPhase) + 0.4 * sin(uWind * 3.3 + windPhase * 1.7);
        transformed.x += gust * 0.05 * max(transformed.y, 0.0);
        transformed.z += gust * 0.02 * max(transformed.y, 0.0);
      #endif`,
    );
  };
  const count = 8500;
  const inst = new THREE.InstancedMesh(merged, mat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const random = mulberry32(91);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * 265;
    const z = (random() - 0.5) * 255 + 10;
    const y = terrainHeight(x, z);
    let skip = y < -1;
    if (!skip && Math.abs(z - roadBaseZ(x)) < 7.4) skip = true;
    if (!skip && segDist(x, z, TRENCH.x1, TRENCH.z1, TRENCH.x2, TRENCH.z2) < 3.4) skip = true;
    // keep the wagon tracks clear of tall grass
    if (!skip && nearVehicleRoute(x, z, 5.4)) skip = true;
    if (!skip) {
      for (const house of HOUSES) {
        if (Math.hypot(x - house.x, z - house.z) < 10.5) {
          skip = true;
          break;
        }
      }
    }
    if (skip) {
      inst.setMatrixAt(i, hidden);
      continue;
    }
    placed++;
    dummy.position.set(x, y, z);
    dummy.rotation.y = random() * Math.PI * 2;
    const s = 0.55 + random() * 0.7;
    dummy.scale.set(s * 1.5, s * (0.65 + random() * 0.5), s * 1.5);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.19 + random() * 0.06, 0.3 + random() * 0.18, 0.5 + random() * 0.16);
    inst.setColorAt(i, color);
  }
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  void placed;
  scene.add(inst);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { mulberry32 };

/* ------------------------------------------------------------------ */
/*  Forest belt                                                        */
/* ------------------------------------------------------------------ */

function buildForest(scene: THREE.Scene, trees: TreeCollider[]) {
  const random = mulberry32(19);
  const positions: { x: number; z: number; s: number; rot: number }[] = [];
  for (let row = 0; row < 7; row++) {
    for (let i = 0; i < 34; i++) {
      const x = -200 + i * 12 + (random() - 0.5) * 8 + row * 1.8;
      const z = -82 - row * 8 + (random() - 0.5) * 6;
      if (random() > 0.92) continue;
      // leave the vehicle tracks clear of trunks
      if (nearVehicleRoute(x, z, 7)) continue;
      positions.push({ x, z, s: 0.95 + random() * 0.8, rot: random() * Math.PI });
    }
  }
  // scatter clusters elsewhere
  for (let i = 0; i < 26; i++) {
    const x = (random() - 0.5) * 290;
    const z = -20 + random() * 150;
    if (Math.hypot(x - BUILDING.x, z - BUILDING.z) < 34 || Math.hypot(x - BASE_POS.x, z - BASE_POS.z) < 24) continue;
    if (HOUSES.some((house) => Math.hypot(x - house.x, z - house.z) < 15)) continue;
    const nearRoad = Math.abs(z - roadBaseZ(x)) < 14;
    if (nearRoad) continue;
    if (nearVehicleRoute(x, z, 8)) continue;
    positions.push({ x, z, s: 0.7 + random() * 0.6, rot: random() * Math.PI });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 4.2, 7);
  trunkGeo.translate(0, 2.1, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4c3d2c, roughness: 0.98 });
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const layerGeos = [
    new THREE.ConeGeometry(2.0, 3.4, 8),
    new THREE.ConeGeometry(1.6, 3.0, 8),
    new THREE.ConeGeometry(1.15, 2.5, 8),
  ];
  const layerY = [3.9, 5.5, 7.0];
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const layers = layerGeos.map((g, i) => {
    const mesh = new THREE.InstancedMesh(g, foliageMat, positions.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.layer = i;
    return mesh;
  });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  positions.forEach((p, i) => {
    const y = terrainHeight(p.x, p.z);
    dummy.position.set(p.x, y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    layers.forEach((layer, li) => {
      dummy.position.set(p.x, y + layerY[li] * p.s, p.z);
      dummy.rotation.set(0, p.rot + li * 0.7, 0);
      dummy.scale.setScalar(p.s * (1 - li * 0.06));
      dummy.updateMatrix();
      layer.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.26 + random() * 0.04, 0.26 + random() * 0.1, 0.19 + random() * 0.08 - li * 0.008);
      layer.setColorAt(i, color);
    });
    trees.push({ x: p.x, z: p.z, r: 0.34 * p.s + 0.24, top: y + 10 * p.s, label: "СТВОЛ · СОСНА" });
  });
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  layers.forEach((layer) => { if (layer.instanceColor) layer.instanceColor.needsUpdate = true; });
  scene.add(trunk, ...layers);

  // Shrub clusters & deciduous undergrowth
  const shrubGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, 300);
  const shrubDummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < 300; i++) {
    let x = (random() - 0.5) * 320;
    let z = (random() - 0.5) * 300 + 10;
    if (Math.abs(z - roadBaseZ(x)) < 9) z += 18;
    if (Math.hypot(x - BUILDING.x, z - BUILDING.z) < 24) x += 30;
    if (nearVehicleRoute(x, z, 5)) {
      shrubs.setMatrixAt(i, zero);
      continue;
    }
    const y = terrainHeight(x, z);
    shrubDummy.position.set(x, y + 0.25, z);
    shrubDummy.rotation.set(random() * 0.4, random() * Math.PI, random() * 0.4);
    const ss = 0.35 + random() * 0.65;
    shrubDummy.scale.set(ss * 1.3, ss * (0.5 + random() * 0.4), ss * 1.2);
    shrubDummy.updateMatrix();
    shrubs.setMatrixAt(i, shrubDummy.matrix);
    color.setHSL(0.22 + random() * 0.05, 0.24 + random() * 0.12, 0.16 + random() * 0.08);
    shrubs.setColorAt(i, color);
  }
  if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
  shrubs.castShadow = false;
  scene.add(shrubs);

  // Fallen logs / stumps for detail
  for (let i = 0; i < 8; i++) {
    const x = -100 + random() * 200;
    const z = -70 + random() * 30;
    const y = terrainHeight(x, z);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3 + random() * 2, 7), trunkMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = random() * Math.PI;
    log.position.set(x, y + 0.26, z);
    log.castShadow = true;
    scene.add(log);
  }
}

/* ------------------------------------------------------------------ */
/*  Abandoned building                                                 */
/* ------------------------------------------------------------------ */


function boxMesh(
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
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylMesh(
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
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBreakerWall(
  group: THREE.Group,
  colliders: BoxCollider[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  label: string,
  rotateY = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotateY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.updateWorldMatrix(true, true);
  colliders.push({ box: new THREE.Box3().setFromObject(mesh), label });
  return mesh;
}

function buildBuilding(scene: THREE.Scene, colliders: BoxCollider[]) {
  const group = new THREE.Group();
  const groundY = terrainHeight(BUILDING.x, BUILDING.z);
  group.position.set(BUILDING.x, groundY, BUILDING.z);
  group.rotation.y = BUILDING.rot;
  scene.add(group);

  const concreteMap = surfaceTexture("#c2bfb0", "rgba(HUE,HUE,HUE,ALPHA)", "rgba(58,60,50,ALPHA)", 1800, 20);
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  concreteMap.repeat.set(4, 3);
  const concreteDarkMap = surfaceTexture("#8e8d80", "rgba(HUE,HUE,HUE,ALPHA)", "rgba(42,46,38,ALPHA)", 1500, 24);
  concreteDarkMap.wrapS = concreteDarkMap.wrapT = THREE.RepeatWrapping;
  concreteDarkMap.repeat.set(4, 3);

  const concrete = new THREE.MeshStandardMaterial({ map: concreteMap, color: 0xdedbc9, roughness: 0.94, metalness: 0 });
  const concreteDark = new THREE.MeshStandardMaterial({ map: concreteDarkMap, color: 0xb5b2a0, roughness: 0.96, metalness: 0 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x6e462d, roughness: 0.88, metalness: 0.35 });
  const metalMat = PALETTE.darkMetal();
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x222620, roughness: 1 });

  const W = BUILDING.w; // 26m
  const D = BUILDING.d; // 15m
  const H = BUILDING.floorH; // 3.3m
  const floors = 3;

  // 1. Solid Foundation Plinth
  addBreakerWall(group, colliders, 0, 0.2, 0, W + 1.2, 0.4, D + 1.2, concreteDark, "ФУНДАМЕНТ");
  // Entrance apron / steps
  addBreakerWall(group, colliders, 0, 0.12, -D / 2 - 1.4, 6.0, 0.24, 2.8, concreteDark, "КРЫЛЬЦО");

  // 2. Structural Column Grid (Pillars)
  const colsX = [-W / 2 + 1.5, -W / 6, W / 6, W / 2 - 1.5];
  const colsZ = [-D / 2 + 0.6, 0, D / 2 - 0.6];
  for (const cx of colsX) {
    for (const cz of colsZ) {
      // Skip damaged corner pillar on upper floor
      addBreakerWall(group, colliders, cx, (floors * H) / 2, cz, 0.55, floors * H, 0.55, concreteDark, "НЕСУЩАЯ КОЛОННА");
    }
  }

  // 3. Monolithic Concrete Floor Slabs (Ground, Floor 2, Floor 3, Roof)
  for (let f = 1; f < floors; f++) {
    const y = f * H;
    // Main continuous floor slab with stairwell opening
    addBreakerWall(group, colliders, -W * 0.22, y, 0, W * 0.52, 0.28, D - 0.8, concrete, `ПЕРЕКРЫТИЕ ЭТАЖ ${f + 1}`);
    addBreakerWall(group, colliders, W * 0.26, y, 0, W * 0.44, 0.28, D - 0.8, concrete, `ПЕРЕКРЫТИЕ ЭТАЖ ${f + 1}`);
  }

  // 4. Roof Slab (with damaged / breached corner)
  const roofY = floors * H;
  // Intact 75% of roof
  addBreakerWall(group, colliders, -W * 0.16, roofY, 0, W * 0.64, 0.32, D - 0.6, concrete, "ПЕРЕКРЫТИЕ КРЫША");
  // Partial intact piece on the undamaged side
  addBreakerWall(group, colliders, W * 0.32, roofY, D * 0.2, W * 0.32, 0.32, D * 0.55, concrete, "ПЕРЕКРЫТИЕ КРЫША");

  // 5. Modular Facade Walls with Clean Window Openings
  const bayW = 4.2;
  const numBays = Math.floor(W / bayW); // 6 bays
  const winW = 2.4;
  const winH = 1.6;

  for (let f = 0; f < floors; f++) {
    const y = f * H;
    for (const side of [-1, 1]) {
      const z = (side * D) / 2;
      for (let b = 0; b < numBays; b++) {
        const cx = -W / 2 + bayW / 2 + b * bayW;

        // Breached corner on top floor (skip wall panels here)
        if (f === 2 && side === 1 && b >= numBays - 2) continue;

        // Ground floor central entrance on front (side === -1, b === 2 or 3)
        const isDoor = f === 0 && side === -1 && (b === 2 || b === 3);
        if (isDoor) {
          if (b === 2) {
            // Doorway portal
            addBreakerWall(group, colliders, cx, y + 2.7, z, bayW * 2, 0.6, 0.35, concreteDark, "ПОРТАЛ ВХОДА");
            // Entrance canopy slab
            const canopy = new THREE.Mesh(new THREE.BoxGeometry(bayW * 2.2, 0.25, 2.6), concrete);
            canopy.position.set(cx + bayW / 2, y + 3.1, z - 1.2);
            canopy.castShadow = true;
            group.add(canopy);
            colliders.push({ box: new THREE.Box3().setFromObject(canopy), label: "КОЗЫРЁК ВХОДА" });
          }
          continue;
        }

        // Clean parapet/spandrel wall below window
        addBreakerWall(group, colliders, cx, y + 0.45, z, bayW, 0.9, 0.32, concrete, "ПОДОКОННАЯ ПАНЕЛЬ");
        // Wall piers to the left and right of window opening
        const pierW = (bayW - winW) / 2;
        addBreakerWall(group, colliders, cx - bayW / 2 + pierW / 2, y + 1.65, z, pierW, winH, 0.32, concrete, "ПРОСТЕНОК");
        addBreakerWall(group, colliders, cx + bayW / 2 - pierW / 2, y + 1.65, z, pierW, winH, 0.32, concrete, "ПРОСТЕНОК");
        // Clean lintel beam above window
        addBreakerWall(group, colliders, cx, y + 2.85, z, bayW, 0.8, 0.32, concreteDark, "ПЕРЕМЫЧКА");

        // Clean concrete window sill
        const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.15, 0.08, 0.44), concreteDark);
        sill.position.set(cx, y + 0.92, z);
        group.add(sill);

        // Thin dark window reveal / interior backing
        const glassBacking = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.04), interiorMat);
        glassBacking.position.set(cx, y + 1.72, z - side * 0.08);
        group.add(glassBacking);
      }
    }

    // End walls (East and West solid gable facades)
    for (const sx of [-1, 1]) {
      const x = (sx * W) / 2;
      if (f === 2 && sx === 1) {
        // Damaged end wall on top floor
        addBreakerWall(group, colliders, x, y + 1.2, 2.0, 0.35, 2.4, D * 0.45, concrete, "ТОРЦЕВАЯ СТЕНА");
      } else {
        // Full solid end wall with panel joint lines
        addBreakerWall(group, colliders, x, y + H / 2, 0, 0.35, H, D, concrete, "ТОРЦЕВАЯ СТЕНА");
      }
    }
  }

  // 6. Authentic Concrete Staircase Core Connecting All Floors
  const stairX = 4.2;
  const stairZ = -1.5;
  for (let f = 0; f < floors; f++) {
    const yBase = f * H;
    // Intermediate landing
    addBreakerWall(group, colliders, stairX, yBase + H * 0.5, stairZ + 2.8, 2.8, 0.22, 1.8, concreteDark, "ПЛОЩАДКА ЛЕСТНИЦЫ");
    // Flight 1: from floor to landing
    for (let st = 0; st < 6; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.42), concrete);
      step.position.set(stairX - 0.7, yBase + 0.15 + st * 0.26, stairZ + 0.2 + st * 0.42);
      step.castShadow = true;
      group.add(step);
    }
    // Flight 2: from landing to next floor
    for (let st = 0; st < 6; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.42), concrete);
      step.position.set(stairX + 0.7, yBase + H * 0.5 + 0.15 + st * 0.26, stairZ + 2.4 - st * 0.42);
      step.castShadow = true;
      group.add(step);
    }
  }

  // 7. Rooftop Architecture: Penthouse, Parapet, Vents, Antenna
  // Elevator / Stairwell Mechanical Penthouse
  addBreakerWall(group, colliders, stairX, roofY + 1.4, stairZ + 1.0, 4.6, 2.8, 5.2, concreteDark, "МАШИННОЕ ОТДЕЛЕНИЕ");
  // Steel penthouse service door
  boxMesh(group, 1.1, 2.1, 0.06, metalMat, stairX - 2.32, roofY + 1.1, stairZ + 1.0, 0, Math.PI / 2, 0);

  // Roof Parapet Wall (0.9m high around intact roof edges)
  const paraH = 0.9;
  addBreakerWall(group, colliders, -W * 0.16, roofY + paraH / 2, -D / 2 + 0.15, W * 0.64, paraH, 0.3, concreteDark, "ПАРАПЕТ");
  addBreakerWall(group, colliders, -W / 2 + 0.15, roofY + paraH / 2, 0, 0.3, paraH, D, concreteDark, "ПАРАПЕТ");
  addBreakerWall(group, colliders, -W * 0.16, roofY + paraH / 2, D / 2 - 0.15, W * 0.64, paraH, 0.3, concreteDark, "ПАРАПЕТ");

  // Cylindrical Concrete Ventilation Shafts on Roof
  cylMesh(group, 0.45, 0.45, 1.8, concreteDark, -W * 0.28, roofY + 0.9, -2.4, 0, 0, 0, 14);
  cylMesh(group, 0.45, 0.45, 1.8, concreteDark, -W * 0.12, roofY + 0.9, -2.4, 0, 0, 0, 14);
  // Rain caps on vents
  cylMesh(group, 0.6, 0.6, 0.08, metalMat, -W * 0.28, roofY + 1.84, -2.4, 0, 0, 0, 14);
  cylMesh(group, 0.6, 0.6, 0.08, metalMat, -W * 0.12, roofY + 1.84, -2.4, 0, 0, 0, 14);

  // Communications Antenna Mast on Penthouse Roof
  cylMesh(group, 0.04, 0.06, 7.5, metalMat, stairX + 0.8, roofY + 2.8 + 3.75, stairZ + 1.5, 0, 0, 0, 8);
  for (let i = 0; i < 3; i++) {
    boxMesh(group, 1.2 - i * 0.2, 0.04, 0.04, metalMat, stairX + 0.8, roofY + 4.5 + i * 1.8, stairZ + 1.5);
  }

  // 8. Authentic Battle Breach in NE Corner with Exposed Rebar
  const breachX = W / 2 - 2.5;
  const breachZ = D / 2 - 2.0;
  // Fallen concrete slabs at realistic tilt
  const fallenSlab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 3.4), concrete);
  fallenSlab.position.set(breachX, (floors - 1) * H + 0.8, breachZ);
  fallenSlab.rotation.set(0.24, 0.15, -0.32);
  fallenSlab.castShadow = true;
  group.add(fallenSlab);
  colliders.push({ box: new THREE.Box3().setFromObject(fallenSlab), label: "ОБВАЛ ПЕРЕКРЫТИЯ" });

  // Exposed bent steel rebar rods extending from broken fracture edge
  for (let r = 0; r < 14; r++) {
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2 + Math.random() * 0.8, 6), rustMat);
    rebar.position.set(breachX - 2.0 + (r % 4) * 1.1, roofY + 0.1 + (Math.random() - 0.5) * 0.3, breachZ - 1.5 + (r / 4) * 0.9);
    rebar.rotation.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.8);
    rebar.castShadow = true;
    group.add(rebar);
  }

  // Rubble Chunks on the Ground Below Breach
  const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x8a887a, roughness: 1.0 });
  const rng = mulberry32(89);
  for (let i = 0; i < 18; i++) {
    const rChunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rng() * 0.55, 0), rubbleMat);
    rChunk.position.set(breachX + (rng() - 0.5) * 5.0, 0.3 + rng() * 0.4, breachZ + 2.5 + rng() * 3.5);
    rChunk.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rChunk.scale.set(1.2, 0.6, 1.1);
    rChunk.castShadow = true;
    group.add(rChunk);
  }

  // 9. Sandbag Fortifications & Ammunition Crates at Entrance & Windows
  const bags = [
    { x: -1.8, z: -D / 2 - 0.8, rot: 0.05, len: 5 },
    { x: 3.2, z: -D / 2 - 0.8, rot: -0.05, len: 5 },
    { x: -W / 2 + 3.0, z: -D / 2 - 0.6, rot: 0.1, len: 4 },
  ];
  for (const b of bags) {
    const sb = createSandbag(b.x, 0, b.z, b.rot, b.len);
    group.add(sb);
    group.updateWorldMatrix(true, true);
    colliders.push({ box: new THREE.Box3().setFromObject(sb), label: "МЕШКИ С ПЕСКОМ" });
  }

  // Ammo crates & fuel barrels near entrance
  group.add(createCrate(-3.2, 0, -D / 2 - 1.2, 0.15));
  group.add(createCrate(-3.8, 0, -D / 2 - 1.0, -0.2));
  group.add(createCrate(4.2, 0, -D / 2 - 1.2, 0.3));
  group.add(createBarrel(5.2, 0, -D / 2 - 1.1));
  group.add(createBarrel(5.8, 0, -D / 2 - 0.9));

  // Military Polygon Identification Stencil on South Wall
  const stencilTex = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(38,44,34,0.75)";
    ctx.font = "bold 56px monospace";
    ctx.fillText("ОБЪЕКТ 04 / ЛИМАН", 24, 78);
    ctx.fillStyle = "rgba(180,50,30,0.6)";
    ctx.fillRect(24, 95, 460, 6);
  });
  const stencil = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshStandardMaterial({ map: stencilTex, transparent: true, opacity: 0.85, roughness: 1.0 }),
  );
  stencil.position.set(-6.5, 2.2, -D / 2 - 0.225);
  group.add(stencil);

  group.updateWorldMatrix(true, true);
  return group;
}
/* ------------------------------------------------------------------ */
/*  Fences, power lines, checkpoint, misc props                        */
/* ------------------------------------------------------------------ */

function chainlinkTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(150,155,145,0.75)";
    ctx.lineWidth = 2.5;
    for (let i = -128; i < 256; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 128, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
    }
  });
}

function buildFence(scene: THREE.Scene, colliders: BoxCollider[], x: number, z: number, length: number, rot: number) {
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  group.rotation.y = rot;
  scene.add(group);
  const tex = chainlinkTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(length / 3, 1.2);
  const meshMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.2,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.4,
    color: 0xbfc6bc,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, 2.1), meshMat);
  mesh.position.y = 1.06;
  group.add(mesh);
  for (let i = 0; i <= Math.floor(length / 3); i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.3, 6), PALETTE.metal());
    post.position.set(-length / 2 + i * 3, 1.15, 0);
    post.castShadow = true;
    group.add(post);
  }
  group.updateWorldMatrix(true, true);
  colliders.push({ box: new THREE.Box3().setFromObject(mesh), label: "СЕТКА" });
}

function buildPowerLines(scene: THREE.Scene, colliders: BoxCollider[]) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4e4030, roughness: 1 });
  const polePositions: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const x = -190 + i * 58;
    const z = roadBaseZ(x) + 15;
    const y = terrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    scene.add(group);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 8.6, 7), wood);
    pole.position.y = 4.3;
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), wood);
    arm.position.y = 7.6;
    group.add(arm);
    for (const side of [-1, 0, 1]) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), PALETTE.darkMetal());
      insulator.position.set(side * 1.0, 7.72, 0);
      group.add(insulator);
    }
    group.rotation.y = 0.06;
    group.updateWorldMatrix(true, true);
    colliders.push({ box: new THREE.Box3().setFromObject(pole), label: "ОПОРА ЛЭП" });
    polePositions.push(new THREE.Vector3(x, y + 7.9, z));
  }
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1e211c, transparent: true, opacity: 0.8 });
  for (let i = 0; i < polePositions.length - 1; i++) {
    const a = polePositions[i];
    const b = polePositions[i + 1];
    for (const off of [-0.95, 0, 0.95]) {
      const points: THREE.Vector3[] = [];
      for (let s = 0; s <= 10; s++) {
        const t = s / 10;
        const p = a.clone().lerp(b, t);
        p.y = THREE.MathUtils.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 1.1 + off * 0.02;
        p.z += off * 0.55;
        points.push(p);
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
    }
  }
}

function buildCheckpoint(scene: THREE.Scene, colliders: BoxCollider[]) {
  const rng = mulberry32(41);
  const positions = [
    { x: 6, z: roadBaseZ(6) - 7, rot: 0.1, len: 7 },
    { x: 2, z: roadBaseZ(2) - 12, rot: -0.2, len: 5 },
    { x: -4, z: roadBaseZ(-4) - 7.5, rot: 1.4, len: 5 },
    { x: 14, z: roadBaseZ(14) - 9, rot: 0.05, len: 6 },
  ];
  for (const p of positions) {
    const y = terrainHeight(p.x, p.z);
    const sandbags = createSandbag(p.x, y, p.z, p.rot, p.len);
    scene.add(sandbags);
    sandbags.updateWorldMatrix(true, true);
    colliders.push({ box: new THREE.Box3().setFromObject(sandbags), label: "ПОЗИЦИЯ · МЕШКИ" });
  }
  // Concrete blocks
  for (let i = 0; i < 6; i++) {
    const x = -20 + rng() * 46;
    const z = roadBaseZ(x) - 5.5 - rng() * 7;
    const y = terrainHeight(x, z);
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), PALETTE.concreteDark());
    block.position.set(x, y + 0.45, z);
    block.rotation.y = rng() * 0.4;
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
    colliders.push({ box: new THREE.Box3().setFromObject(block), label: "БЕТОННЫЙ БЛОК" });
  }
  // Watch tower
  const tx = 16;
  const tz = roadBaseZ(16) - 18;
  const ty = terrainHeight(tx, tz);
  const wood = new THREE.MeshStandardMaterial({ color: 0x54462f, roughness: 0.98 });
  for (const sx of [-1.2, 1.2]) {
    for (const sz of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.6, 0.18), wood);
      leg.position.set(tx + sx, ty + 2.3, tz + sz);
      leg.rotation.z = sx * 0.03;
      leg.castShadow = true;
      scene.add(leg);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 3.2), wood);
  deck.position.set(tx, ty + 4.6, tz);
  deck.castShadow = true;
  scene.add(deck);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 3.4), PALETTE.oliveDark());
  roof.position.set(tx, ty + 6.2, tz);
  roof.rotation.x = 0.12;
  scene.add(roof);
  for (const sx of [-1.6, 1.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.12), wood);
    post.position.set(tx + sx, ty + 5.5, tz);
    scene.add(post);
  }
  const radar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), PALETTE.metal());
  radar.position.set(tx + 2.6, ty + 2.4, tz + 1.4);
  scene.add(radar);
}

/* ------------------------------------------------------------------ */
/*  Fighting trench + rural houses                                     */
/* ------------------------------------------------------------------ */

function buildTrench(scene: THREE.Scene, colliders: BoxCollider[]) {
  const g = new THREE.Group();
  scene.add(g);
  const x1 = TRENCH.x1;
  const x2 = TRENCH.x2;
  const cz = (TRENCH.z1 + TRENCH.z2) / 2;
  const cx = (x1 + x2) / 2;
  const len = Math.abs(x2 - x1);
  const floorY = terrainHeight(cx, cz);

  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 1 });
  const soilDark = new THREE.MeshStandardMaterial({ color: 0x352b1e, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5d4c33, roughness: 0.95 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x463a28, roughness: 0.95 });

  // Trench floor in short segments hugging the carved terrain (no poke-through)
  const floorSegs = 7;
  for (let i = 0; i < floorSegs; i++) {
    const sx0 = x1 + (i / floorSegs) * len;
    const sx1 = x1 + ((i + 1) / floorSegs) * len;
    const smx = (sx0 + sx1) / 2;
    boxMesh(g, sx1 - sx0 + 0.15, 0.08, 4.0, soilDark, smx, terrainHeight(smx, cz) + 0.02, cz);
  }
  for (let i = 0; i < 11; i++) {
    const px = x1 + 0.8 + i * ((len - 1.6) / 10);
    boxMesh(g, 0.34, 0.05, 3.4, i % 2 ? woodMat : woodDark, px, terrainHeight(px, cz) + 0.08, cz);
  }
  // Plank revetments + support posts, segmented to follow the carve
  const wallSegs = 5;
  for (const side of [-1, 1]) {
    for (let i = 0; i < wallSegs; i++) {
      const sx0 = x1 + (i / wallSegs) * len;
      const sx1 = x1 + ((i + 1) / wallSegs) * len;
      const smx = (sx0 + sx1) / 2;
      const wy = terrainHeight(smx, cz + side * 1.82);
      boxMesh(g, sx1 - sx0 + 0.12, 0.95, 0.09, woodMat, smx, wy + 0.32, cz + side * 1.86);
      boxMesh(g, sx1 - sx0 + 0.12, 0.1, 0.12, woodDark, smx, wy + 0.82, cz + side * 1.86);
    }
    for (let i = 0; i < 8; i++) {
      const px = x1 + 0.6 + i * ((len - 1.2) / 7);
      boxMesh(g, 0.12, 0.95, 0.12, woodDark, px, terrainHeight(px, cz + side * 1.78) + 0.32, cz + side * 1.78);
    }
  }
  g.updateWorldMatrix(true, true);
  // Firing step along the north face, segmented
  for (let i = 0; i < 4; i++) {
    const sx0 = x1 + 0.6 + (i / 4) * (len - 1.2);
    const sx1 = x1 + 0.6 + ((i + 1) / 4) * (len - 1.2);
    const smx = (sx0 + sx1) / 2;
    boxMesh(g, sx1 - sx0 + 0.1, 0.34, 0.62, soilMat, smx, terrainHeight(smx, cz - 1.28) + 0.2, cz - 1.28);
  }
  // Parapet sandbags along both rims
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const px = x1 + 1.7 + i * 3.4;
      const pz = cz + side * 3.1;
      const sb = createSandbag(px, terrainHeight(px, pz), pz, 0, 5);
      g.add(sb);
    }
    // Earth berm behind the bags, segmented to follow the ground
    for (let b = 0; b < 3; b++) {
      const bx0 = x1 - 0.5 + (b / 3) * (len + 1);
      const bx1 = x1 - 0.5 + ((b + 1) / 3) * (len + 1);
      const bmx = (bx0 + bx1) / 2;
      const berm = boxMesh(g, bx1 - bx0 + 0.15, 0.55, 1.3, soilMat, bmx, terrainHeight(bmx, cz + side * 4.3) + 0.18, cz + side * 4.3);
      berm.receiveShadow = true;
    }
  }
  // Props: ammo crates in the trench, periscope on the south parapet
  g.add(createCrate(cx - 3.4, floorY + 0.05, cz + 1.0, 0.2));
  g.add(createCrate(cx + 4.1, floorY + 0.05, cz - 0.4, -0.15));
  const periY = terrainHeight(cx + 1.5, cz + 3.1);
  boxMesh(g, 0.09, 1.15, 0.09, woodDark, cx + 1.5, periY + 0.55, cz + 3.0);
  boxMesh(g, 0.09, 0.12, 0.3, woodDark, cx + 1.5, periY + 1.1, cz + 2.9);

  g.updateWorldMatrix(true, true);
  // Colliders: parapets + berms + revetments (floor is the carved terrain itself)
  for (const side of [-1, 1]) {
    const bagProbe = new THREE.Box3(
      new THREE.Vector3(x1, floorY, cz + side * 3.1 - 0.7),
      new THREE.Vector3(x2, floorY + 1.7, cz + side * 3.1 + 0.7),
    );
    colliders.push({ box: bagProbe, label: "БРУСТВЕР · ОКОП" });
    const bermProbe = new THREE.Box3(
      new THREE.Vector3(x1 - 0.5, floorY, cz + side * 4.3 - 0.7),
      new THREE.Vector3(x2 + 0.5, floorY + 1.2, cz + side * 4.3 + 0.7),
    );
    colliders.push({ box: bermProbe, label: "НАСЫПЬ · ОКОП" });
  }
}

function buildHouse(scene: THREE.Scene, colliders: BoxCollider[], hx: number, hz: number, rot: number, variant: number) {
  const g = new THREE.Group();
  const gy = terrainHeight(hx, hz);
  g.position.set(hx, gy, hz);
  g.rotation.y = rot;
  scene.add(g);

  const W = 7.2;
  const D = 5.4;
  const baseY = 0.4;
  const wallH = 2.7;
  const plasterTints = [0xe3ddc8, 0xd9cfae];
  const roofColors = [0x3d5a44, 0x7a3b2e];
  const plaster = new THREE.MeshStandardMaterial({ map: null, color: plasterTints[variant % 2], roughness: 0.94 });
  const foundMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.97 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColors[variant % 2], roughness: 0.55, metalness: 0.45 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2efe2, roughness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x54432e, roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x202e30, roughness: 0.12, metalness: 0.7 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a4a38, roughness: 0.95 });

  // Foundation + solid plaster walls (windows/door mounted proud of the face)
  addBreakerWall(g, colliders, 0, 0.2, 0, W + 0.5, 0.5, D + 0.5, foundMat, "ДОМ · ФУНДАМЕНТ");
  addBreakerWall(g, colliders, 0, baseY + wallH / 2, 0, W, wallH, D, plaster, "ДОМ · СТЕНА");
  boxMesh(g, W + 0.1, 0.14, D + 0.1, trimMat, 0, baseY + wallH - 0.05, 0); // eaves trim

  const windowUnit = (x: number, z: number, ry: number) => {
    const wg = new THREE.Group();
    wg.position.set(x, baseY + 1.55, z);
    wg.rotation.y = ry;
    g.add(wg);
    boxMesh(wg, 1.06, 1.36, 0.07, trimMat, 0, 0, 0);
    boxMesh(wg, 0.86, 1.16, 0.05, glassMat, 0, 0, -0.02);
    boxMesh(wg, 0.05, 1.16, 0.03, trimMat, 0, 0, -0.045);
    boxMesh(wg, 0.86, 0.05, 0.03, trimMat, 0, 0, -0.045);
    boxMesh(wg, 1.2, 0.08, 0.14, trimMat, 0, -0.72, -0.02);
  };
  const fz = -D / 2;
  windowUnit(-1.85, fz - 0.01, Math.PI);
  windowUnit(1.85, fz - 0.01, Math.PI);
  windowUnit(-1.85, D / 2 + 0.01, 0);
  windowUnit(1.85, D / 2 + 0.01, 0);
  windowUnit(-W / 2 - 0.01, 0, -Math.PI / 2);
  windowUnit(W / 2 + 0.01, 0, Math.PI / 2);

  // Front door + porch + canopy
  boxMesh(g, 1.1, 2.2, 0.09, woodMat, 0, baseY + 1.1, fz - 0.02);
  boxMesh(g, 0.08, 0.08, 0.06, PALETTE.metal(), 0.36, baseY + 1.05, fz - 0.07);
  boxMesh(g, 1.34, 0.1, 0.12, trimMat, 0, baseY + 2.26, fz - 0.02);
  boxMesh(g, 2.6, 0.14, 1.5, foundMat, 0, 0.12, fz - 0.85); // porch slab
  for (const sx of [-1.1, 1.1]) boxMesh(g, 0.11, 1.9, 0.11, woodMat, sx, 1.05, fz - 1.4); // posts
  const canopy = boxMesh(g, 2.8, 0.07, 1.7, roofMat, 0, 2.15, fz - 0.8, 0.1, 0, 0);
  canopy.castShadow = true;

  // Gable triangles + pitched metal roof + ridge + chimney
  const triShape = new THREE.Shape();
  triShape.moveTo(-D / 2, 0);
  triShape.lineTo(D / 2, 0);
  triShape.lineTo(0, 1.85);
  triShape.closePath();
  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.24, bevelEnabled: false });
  for (const sx of [-1, 1]) {
    const gab = new THREE.Mesh(triGeo, plaster);
    gab.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    gab.position.set(sx > 0 ? W / 2 - 0.24 : -(W / 2 - 0.24), baseY + wallH, 0);
    gab.castShadow = true;
    gab.receiveShadow = true;
    gab.userData.roofPart = true;
    g.add(gab);
  }
  const slopeAng = Math.atan2(1.85, D / 2 + 0.45);
  for (const sz of [-1, 1]) {
    const slab = boxMesh(g, W + 0.9, 0.09, 4.0, roofMat, 0, baseY + wallH + 0.92, sz * 1.5, sz > 0 ? slopeAng : -slopeAng, 0, 0);
    slab.castShadow = true;
    slab.userData.roofPart = true;
  }
  boxMesh(g, W + 0.9, 0.08, 0.34, roofMat, 0, baseY + wallH + 1.88, 0).userData.roofPart = true;
  boxMesh(g, 0.52, 1.5, 0.52, brickMat, 1.7, baseY + wallH + 1.5, 0.7).userData.roofPart = true;
  boxMesh(g, 0.68, 0.09, 0.68, foundMat, 1.7, baseY + wallH + 2.28, 0.7).userData.roofPart = true;
  g.updateWorldMatrix(true, true);
  const roofBox = new THREE.Box3();
  g.children.forEach((child) => {
    if (child.userData.roofPart) roofBox.expandByObject(child);
  });
  if (!roofBox.isEmpty()) colliders.push({ box: roofBox, label: "ДОМ · КРЫША" });

  // Yard: picket fence with a gate gap, shed, firewood, barrel
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.95 });
  const yardX = 8.5;
  const yardZ = 7.0;
  const fenceRun = (x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const posts = Math.max(2, Math.round(len / 2.1) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      boxMesh(g, 0.11, 1.15, 0.11, fenceMat, x0 + dx * t, 0.55, z0 + dz * t);
    }
    for (const ry of [0.42, 0.86]) {
      const rail = boxMesh(g, 0.05, 0.09, len, fenceMat, (x0 + x1) / 2, ry, (z0 + z1) / 2);
      rail.rotation.y = ang;
      rail.userData.fencePart = true;
    }
  };
  fenceRun(-yardX, -yardZ, -1.4, -yardZ);
  fenceRun(1.4, -yardZ, yardX, -yardZ);
  fenceRun(-yardX, yardZ, yardX, yardZ);
  fenceRun(-yardX, -yardZ, -yardX, yardZ);
  fenceRun(yardX, -yardZ, yardX, yardZ);
  // Shed with slanted roof
  const shedX = -5.6;
  const shedZ = 4.4;
  boxMesh(g, 2.7, 1.9, 2.3, woodMat, shedX, 0.95, shedZ);
  boxMesh(g, 3.0, 0.08, 2.7, roofMat, shedX, 2.0, shedZ, 0.14, 0, 0);
  boxMesh(g, 0.9, 1.5, 0.06, new THREE.MeshStandardMaterial({ color: 0x3c3222, roughness: 0.95 }), shedX, 0.78, shedZ - 1.17);
  // Firewood stack + barrel + crates
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5 - row; i++) {
      cylMesh(g, 0.09, 0.09, 0.7, woodMat, 4.6 + i * 0.2 + row * 0.1, 0.12 + row * 0.17, 4.9, Math.PI / 2, 0, 0, 8);
    }
  }
  g.add(createBarrel(5.6, 0, -3.4));
  g.add(createCrate(-4.9, 0, -4.2, 0.3));
  g.add(createCrate(-4.1, 0, -4.4, -0.2));
  g.updateWorldMatrix(true, true);
  g.children.forEach((child) => {
    if (child.userData.fencePart) colliders.push({ box: new THREE.Box3().setFromObject(child), label: "ЗАБОР" });
  });
}

function buildWreck(scene: THREE.Scene, x: number, z: number, rot: number) {
  const group = new THREE.Group();
  const y = terrainHeight(x, z);
  group.position.set(x, y, z);
  group.rotation.y = rot;
  group.rotation.z = 0.06;
  scene.add(group);
  const charred = new THREE.MeshStandardMaterial({ color: 0x3d372d, roughness: 0.92, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 3.3), charred);
  body.position.y = 0.72;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.2), charred);
  cabin.position.set(0, 1.2, -0.4);
  cabin.rotation.x = -0.1;
  group.add(cabin);
  for (const sx of [-0.9, 0.9]) {
    for (const sz of [-1.0, 1.0]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), PALETTE.rubber());
      tire.rotation.z = Math.PI / 2;
      tire.position.set(sx, 0.34, sz);
      group.add(tire);
    }
  }
  // soot plume anchor stored via userData
  group.userData.smoke = true;
}

/* ------------------------------------------------------------------ */
/*  Battle damage: craters, rubble, tyre tracks                        */
/* ------------------------------------------------------------------ */

function buildBattleDamage(scene: THREE.Scene, colliders: BoxCollider[]) {
  const rng = mulberry32(137);
  const soil = new THREE.MeshStandardMaterial({ color: 0x6b583e, roughness: 1 });
  const soilDark = new THREE.MeshStandardMaterial({ color: 0x3a3022, roughness: 1 });
  const soot = new THREE.MeshStandardMaterial({
    color: 0x1e1b16,
    roughness: 1,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x8b8778, roughness: 1 });

  const craters: Array<[number, number, number]> = [
    [12, 16, 2.4],
    [-28, -6, 1.8],
    [-58, 20, 2.2],
    [66, -14, 2.8],
    [40, 56, 1.9],
    [-8, 52, 2.1],
    [90, 12, 2.4],
    [-80, -54, 2.0],
    [24, -40, 1.7],
    [-40, -20, 2.2],
  ];
  for (const [x, z, r] of craters) {
    const y = terrainHeight(x, z);
    // scorched bowl + raised earth lip
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 18), soot);
    bowl.rotation.x = -Math.PI / 2;
    bowl.position.set(x, y + 0.045, z);
    bowl.receiveShadow = true;
    bowl.renderOrder = 2;
    scene.add(bowl);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, r * 0.17, 5, 18), soil);
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(x, y + 0.02, z);
    lip.scale.y = 0.36;
    lip.receiveShadow = true;
    lip.castShadow = true;
    scene.add(lip);
    // clods thrown out of the crater
    const clods = 7 + Math.floor(rng() * 6);
    for (let i = 0; i < clods; i++) {
      const a = rng() * Math.PI * 2;
      const d = r * (1.05 + rng() * 1.6);
      const cx = x + Math.cos(a) * d;
      const cz = z + Math.sin(a) * d;
      const s = 0.09 + rng() * 0.18;
      const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rng() > 0.5 ? soil : soilDark);
      clod.position.set(cx, terrainHeight(cx, cz) + s * 0.4, cz);
      clod.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      clod.castShadow = true;
      clod.receiveShadow = true;
      scene.add(clod);
    }
  }

  // Rubble spill and shattered concrete around the shelled building
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const d = 17 + rng() * 9;
    const x = BUILDING.x + Math.cos(a) * d;
    const z = BUILDING.z + Math.sin(a) * d * 0.75;
    const s = 0.18 + rng() * 0.55;
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rubbleMat);
    chunk.position.set(x, terrainHeight(x, z) + s * 0.35, z);
    chunk.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    chunk.scale.set(1.1, 0.55 + rng() * 0.3, 1);
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    scene.add(chunk);
  }
  // A few reusable concrete slabs lying about
  const slabMat = PALETTE.concreteDark();
  for (let i = 0; i < 5; i++) {
    const x = BUILDING.x + (rng() - 0.5) * 40;
    const z = BUILDING.z + (rng() - 0.5) * 26;
    if (Math.abs(x - BUILDING.x) < 14 && Math.abs(z - BUILDING.z) < 8) continue;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.6 + rng() * 2.2, 0.18, 1.1 + rng() * 1.4), slabMat);
    slab.position.set(x, terrainHeight(x, z) + 0.12, z);
    slab.rotation.set((rng() - 0.5) * 0.2, rng() * 3, (rng() - 0.5) * 0.2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);
    colliders.push({ box: new THREE.Box3().setFromObject(slab), label: "ОБЛОМОК ПЛИТЫ" });
  }

  // Twin tyre tracks worn into the road surface along the traffic lanes
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0x5a5342,
    roughness: 1,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  for (const lane of [-1.7, 1.7]) {
    for (const side of [-0.78, 0.78]) {
      const verts: number[] = [];
      const indices: number[] = [];
      const pts: THREE.Vector3[] = [];
      for (let x = -298; x <= 298; x += 6) {
        pts.push(new THREE.Vector3(x, 0, roadBaseZ(x) + lane + side));
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
        const sideV = new THREE.Vector3(-tangent.z, 0, tangent.x);
        for (const s of [-0.11, 0.11]) {
          const q = p.clone().addScaledVector(sideV, s);
          q.y = terrainHeight(q.x, q.z) + 0.2;
          verts.push(q.x, q.y, q.z);
        }
        if (i < pts.length - 1) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, trackMat);
      mesh.renderOrder = 3;
      scene.add(mesh);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Camouflage netting over supply points                              */
/* ------------------------------------------------------------------ */

function buildCamoNets(scene: THREE.Scene) {
  const netTex = canvasTexture(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const patch = ["#4c5438", "#5e613f", "#3c432f", "#6b6446"];
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = patch[i % patch.length];
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * 256,
        Math.random() * 256,
        10 + Math.random() * 30,
        8 + Math.random() * 22,
        Math.random() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // netting weave punched through the fabric
    ctx.strokeStyle = "rgba(30,34,24,0.85)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 256; i += 7) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  });
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    transparent: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const poleMat = PALETTE.darkMetal();
  const spots = [
    { x: 6, z: roadBaseZ(6) - 10.5, w: 7.5, d: 5.2, h: 2.5, rot: 0.12 },
    { x: 13, z: roadBaseZ(13) - 13, w: 6, d: 4.4, h: 2.2, rot: -0.2 },
    { x: BUILDING.x + 15, z: BUILDING.z + 9, w: 6.4, d: 5, h: 2.7, rot: 0.9 },
    { x: -63, z: 30, w: 5.4, d: 4.2, h: 2.3, rot: -0.4 },
  ];
  for (const s of spots) {
    const y = terrainHeight(s.x, s.z);
    const geo = new THREE.PlaneGeometry(s.w, s.d, 10, 8);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i) / (s.w / 2);
      const lz = pos.getZ(i) / (s.d / 2);
      const edge = Math.max(Math.abs(lx), Math.abs(lz));
      pos.setY(i, -edge * edge * 0.55 + Math.sin(lx * 5.3 + lz * 3.1) * 0.08);
    }
    geo.computeVertexNormals();
    const net = new THREE.Mesh(geo, netMat);
    net.position.set(s.x, y + s.h, s.z);
    net.rotation.y = s.rot;
    net.castShadow = true;
    scene.add(net);
    // frame poles
    const cosR = Math.cos(s.rot);
    const sinR = Math.sin(s.rot);
    for (const [cx, cz] of [
      [-s.w / 2, -s.d / 2],
      [s.w / 2, -s.d / 2],
      [-s.w / 2, s.d / 2],
      [s.w / 2, s.d / 2],
    ]) {
      const px = s.x + cx * cosR + cz * sinR;
      const pz = s.z - cx * sinR + cz * cosR;
      const py = terrainHeight(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, s.h + 0.2, 6), poleMat);
      pole.position.set(px, py + (s.h + 0.2) / 2, pz);
      pole.rotation.z = (Math.random() - 0.5) * 0.05;
      pole.castShadow = true;
      scene.add(pole);
    }
    // crates and fuel drums sheltered under the net
    const crate1 = createCrate(s.x + 0.9, y, s.z + 0.4, s.rot + 0.3);
    const barrel = createBarrel(s.x - 1.3, y, s.z - 0.5);
    scene.add(crate1);
    scene.add(barrel);
  }
}

/* ------------------------------------------------------------------ */
/*  Launch base                                                        */
/* ------------------------------------------------------------------ */

function buildBase(scene: THREE.Scene, colliders: BoxCollider[], tag: THREE.Group) {
  const y = terrainHeight(BASE_POS.x, BASE_POS.z);
  const base = new THREE.Group();
  base.position.set(BASE_POS.x, y, BASE_POS.z);
  scene.add(base);

  // Metal launch platform with H marking
  const hTexture = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#3c423c";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#b6bca8";
    ctx.lineWidth = 18;
    ctx.strokeRect(40, 40, 432, 432);
    ctx.lineWidth = 56;
    ctx.beginPath();
    ctx.moveTo(150, 150);
    ctx.lineTo(150, 362);
    ctx.moveTo(362, 150);
    ctx.lineTo(362, 362);
    ctx.moveTo(150, 256);
    ctx.lineTo(362, 256);
    ctx.stroke();
    ctx.fillStyle = "rgba(20,24,20,0.55)";
    for (let i = 0; i < 6; i++) ctx.fillRect(0, 80 + i * 80, 512, 6);
  });
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.12, 4.2),
    new THREE.MeshStandardMaterial({
      map: hTexture,
      roughness: 0.85,
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  pad.position.y = 0.06;
  pad.receiveShadow = true;
  base.add(pad);
  base.updateWorldMatrix(true, true);
  colliders.push({ box: new THREE.Box3().setFromObject(pad), label: "СТАРТОВАЯ ПЛОЩАДКА" });

  // Sandbag ring
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const sb = createSandbag(Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4, a + Math.PI / 2, 4);
    base.add(sb);
  }
  // Command tent
  const tentMat = new THREE.MeshStandardMaterial({ color: 0x4b5137, roughness: 0.95 });
  const tent = new THREE.Group();
  tent.position.set(-11.5, 0, 2.0);
  tent.rotation.y = 0.5;
  base.add(tent);
  const tentGeo = new THREE.CylinderGeometry(2.1, 2.1, 5.2, 14, 1, false, Math.PI / 2, Math.PI);
  tentGeo.rotateZ(-Math.PI / 2); // axis along X, dome facing up
  const tentBody = new THREE.Mesh(tentGeo, tentMat);
  tentBody.position.y = 0.05;
  tentBody.scale.set(1, 0.85, 1);
  tentBody.castShadow = true;
  tentBody.receiveShadow = true;
  tent.add(tentBody);
  const tentFloor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 4.2), PALETTE.oliveDark());
  tentFloor.position.y = 0.05;
  tent.add(tentFloor);
  base.updateWorldMatrix(true, true);
  colliders.push({ box: new THREE.Box3().setFromObject(tent), label: "ПАЛАТКА" });

  // Low supply stack behind the launch heading
  for (let i = 0; i < 3; i++) {
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.7, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x4d5438, roughness: 0.9 }),
    );
    boxMesh.position.set(9.4, 0.35 + i * 0.07, 6.2 + i * 0.05);
    boxMesh.rotation.y = -0.25 + i * 0.04;
    boxMesh.castShadow = true;
    base.add(boxMesh);
  }

  // Antenna mast, generator, crates
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 9, 6), PALETTE.metal());
  mast.position.set(8, 4.5, 5);
  mast.castShadow = true;
  base.add(mast);
  for (const h of [4, 6.3, 8.2]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2 - h * 0.06, 0.05, 0.05), PALETTE.metal());
    cross.position.set(8, h, 5);
    base.add(cross);
  }
  const generator = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), PALETTE.oliveDark());
  generator.position.set(-6, 0.4, 6.4);
  base.add(generator);
  for (let i = 0; i < 5; i++) base.add(createCrate(-3 - (i % 3) * 1.1, 0, 3 + Math.floor(i / 3) * 0.9, i * 0.4));
  for (let i = 0; i < 3; i++) base.add(createBarrel(-4.2, 0, 4.6 + i * 0.9));
  // Drone case / maintenance table
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.1), PALETTE.oliveDark());
  table.position.set(-2, 0.85, 7);
  base.add(table);
  for (const sx of [-0.9, 0.9]) {
    for (const sz of [-0.4, 0.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.08), PALETTE.darkMetal());
      leg.position.set(-2 + sx, 0.42, 7 + sz);
      base.add(leg);
    }
  }
  const caseBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.7), PALETTE.black());
  caseBox.position.set(-2.4, 1.05, 7);
  base.add(caseBox);
  const caseLid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.7), PALETTE.oliveDark());
  caseLid.position.set(-2.4, 1.58, 7.35);
  caseLid.rotation.x = -1.0;
  base.add(caseLid);
  // Windsock
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5, 6), PALETTE.metal());
  pole.position.set(-9, 2.5, 5.5);
  base.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 1.7, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd97b3a, roughness: 0.9, side: THREE.DoubleSide }),
  );
  sock.rotation.z = -Math.PI / 2;
  sock.rotation.y = 0.4;
  sock.position.set(-8.1, 4.8, 5.5);
  base.add(sock);

  // Flags / marker
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 4.4, 6), PALETTE.metal());
  flagPole.position.set(-10.5, 2.2, 7.5);
  base.add(flagPole);
  const flagTex = canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = "#a4ab8e";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = "#22271f";
    ctx.font = "bold 44px monospace";
    ctx.fillText("ПОЛИГОН", 20, 60);
    ctx.fillText("04 / FPV", 20, 115);
  });
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.95),
    new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.95 }),
  );
  flag.position.set(-9.72, 3.75, 7.5);
  base.add(flag);

  // Tactical map board
  const mapTex = canvasTexture(512, 384, (ctx) => {
    ctx.fillStyle = "#59603f";
    ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = "rgba(30,36,26,0.6)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo((i * 47) % 512, 0);
      ctx.bezierCurveTo(i * 30, 120, i * 61, 240, (i * 47 + 80) % 512, 384);
      ctx.stroke();
    }
    ctx.strokeStyle = "#c9cfae";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(20, 230);
    ctx.quadraticCurveTo(240, 180, 490, 150);
    ctx.stroke();
    ctx.fillStyle = "#b4402e";
    ctx.fillRect(330, 150, 15, 15);
    ctx.fillStyle = "#e4dbaa";
    ctx.font = "bold 24px monospace";
    ctx.fillText("ЦЕЛЬ / СЕКТОР Б", 300, 135);
  });
  const mapBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.8),
    new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.95 }),
  );
  mapBoard.position.set(-7.2, 2.2, 3.4);
  mapBoard.rotation.y = -1.9;
  base.add(mapBoard);
  for (const sx of [-1.1, 1.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), PALETTE.darkMetal());
    leg.position.set(-7.2 + sx, 1.15, 3.38);
    base.add(leg);
  }

  // marker group for resupply / drone animation
  tag.position.set(0, 0, 0);
  base.add(tag);
  return base;
}

/* ------------------------------------------------------------------ */
/*  Spawn layout                                                       */
/* ------------------------------------------------------------------ */

function buildSpawnLayout(): { soldiers: SoldierSpawn[]; vehicles: VehicleSpawn[] } {
  const soldiers: SoldierSpawn[] = [];
  const vehicles: VehicleSpawn[] = [];
  const variants = 5;
  const pushSoldier = (x: number, z: number, rot: number, squad: string, y?: number) => {
    soldiers.push({ x, z, rot, y, squad, variant: soldiers.length % variants });
  };
  const by = terrainHeight(BUILDING.x, BUILDING.z);

  // Building-local (lx, lz) -> world, honouring the building's yaw.
  const cosR = Math.cos(BUILDING.rot);
  const sinR = Math.sin(BUILDING.rot);
  const inBuilding = (lx: number, lz: number, y: number, rot: number, squad: string) => {
    pushSoldier(BUILDING.x + lx * cosR + lz * sinR, BUILDING.z - lx * sinR + lz * cosR, rot, squad, y);
  };
  // Concrete levels: plinth top +0.4, floor slabs at f*H +0.14 (0.28 thick),
  // roof slab top +0.16 — boots must rest exactly on these surfaces.
  const groundFloor = by + 0.4;
  const floor2 = by + BUILDING.floorH + 0.14;
  const floor3 = by + BUILDING.floorH * 2 + 0.14;
  const roof = by + BUILDING.floorH * 3 + 0.16;

  // Building garrison — ground floor, upper floors, roof
  inBuilding(-6.5, -1.5, groundFloor, 2.8, "ГАРНИЗОН");
  inBuilding(-9.5, 3.2, groundFloor, 2.4, "ГАРНИЗОН");
  inBuilding(3.0, 4.0, groundFloor, -0.2, "ГАРНИЗОН");
  inBuilding(9.0, -2.0, groundFloor, -0.4, "ГАРНИЗОН");
  inBuilding(-2.0, -5.2, groundFloor, 3.0, "ГАРНИЗОН");
  inBuilding(0.8, 0.4, groundFloor, 3.1, "ГАРНИЗОН");
  inBuilding(-4.0, 2.6, floor2, 2.6, "ГАРНИЗОН");
  inBuilding(7.0, -1.2, floor2, -0.5, "ГАРНИЗОН");
  inBuilding(1.0, -3.0, floor3, 0.6, "ГАРНИЗОН");
  inBuilding(-6.0, 1.0, floor3, 2.9, "ГАРНИЗОН");
  // roof: stay on the intact slab (west half)
  inBuilding(-5.5, -1.0, roof, 0.2, "НАБЛЮДАТЕЛЬ");
  inBuilding(-2.2, 3.4, roof, 2.7, "НАБЛЮДАТЕЛЬ");

  // Checkpoint squad near road
  const cpX = 1;
  const cpZ = roadBaseZ(cpX) - 9;
  pushSoldier(cpX, cpZ, 0.2, "КПП-1");
  pushSoldier(cpX + 3, cpZ + 1, -0.3, "КПП-1");
  pushSoldier(cpX - 4.5, cpZ + 0.8, 0.6, "КПП-1");
  pushSoldier(cpX + 6, cpZ - 4, 1.4, "КПП-1");
  pushSoldier(cpX - 8, cpZ - 2, 0.1, "КПП-1");

  // Treeline / forest positions
  for (let i = 0; i < 5; i++) {
    pushSoldier(-46 + i * 19, -64 - (i % 2) * 9, Math.PI * (0.85 + (i % 3) * 0.1), "ЛЕСОПОЛОСА");
  }

  // Trench squad (dug-in firing position)
  pushSoldier(-42, 10, 0.15, "ОКОП");
  pushSoldier(-36, 10, -0.2, "ОКОП");

  // Patrol pairs on the field
  pushSoldier(-20, -2, 0.7, "ПАТРУЛЬ");
  pushSoldier(-13, 4, -0.8, "ПАТРУЛЬ");
  pushSoldier(72, 8, 2.6, "ПАТРУЛЬ");
  pushSoldier(80, 18, 3.4, "ПАТРУЛЬ");
  pushSoldier(18, -52, 0.2, "ПАТРУЛЬ");
  pushSoldier(44, 34, -2.1, "ПАТРУЛЬ");
  // Drivers / gunners
  pushSoldier(-64, 33, 0.2, "РАСЧЁТ");
  pushSoldier(48, 22, 2.5, "РАСЧЁТ");

  // Each vehicle owns a closed loop of its own, across the whole map.
  VEHICLE_ROUTES.forEach((route, index) => {
    const curve = vehicleRouteCurve(route);
    const u = route.start ?? 0;
    const p = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u);
    vehicles.push({
      x: p.x,
      z: p.z,
      rot: Math.atan2(-tangent.x, -tangent.z),
      variant: route.variant,
      kind: route.kind,
      label: route.label,
      speed: route.speed,
      route: index,
    });
  });

  return { soldiers, vehicles };
}

/* ------------------------------------------------------------------ */
/*  Dirt track & distant treeline                                      */
/* ------------------------------------------------------------------ */

function buildDirtTrack(scene: THREE.Scene, x1: number, z1: number, x2: number, z2: number) {
  const mid = new THREE.Vector3((x1 + x2) / 2 + 22, 0, (z1 + z2) / 2 + 6);
  const points = [
    new THREE.Vector3(x1, 0, z1),
    new THREE.Vector3(x1 + (x2 - x1) * 0.3 + 12, 0, z1 + (z2 - z1) * 0.3 + 8),
    mid,
    new THREE.Vector3(x2 - 12, 0, z2 + 14),
    new THREE.Vector3(x2, 0, z2),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const sampled = curve.getPoints(70);
  const verts: number[] = [];
  const indices: number[] = [];
  const half = 2.1;
  for (let i = 0; i < sampled.length; i++) {
    const p = sampled[i];
    p.y = terrainHeight(p.x, p.z) + 0.06;
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const left = p.clone().addScaledVector(side, half);
    const right = p.clone().addScaledVector(side, -half);
    left.y = terrainHeight(left.x, left.z) + 0.05;
    right.y = terrainHeight(right.x, right.z) + 0.05;
    const mid = p.clone();
    mid.y = terrainHeight(mid.x, mid.z) + 0.05;
    verts.push(left.x, left.y, left.z, mid.x, mid.y, mid.z, right.x, right.y, right.z);
    if (i < sampled.length - 1) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x7d7057,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

function buildRouteTracks(scene: THREE.Scene) {
  const verts: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const left = new THREE.Color(0x8c7d60);
  const mid = new THREE.Color(0x73674e);
  const half = 2.35;

  for (const route of VEHICLE_ROUTES) {
    const curve = vehicleRouteCurve(route);
    const n = Math.max(80, Math.round(curve.getLength() / 3.5));
    const pts = curve.getSpacedPoints(n);
    const base = verts.length / 3;
    const push = (x: number, z: number, color: THREE.Color) => {
      const y = terrainHeight(x, z) + 0.055;
      verts.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    };
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const inv = 1 / (Math.hypot(tx, tz) || 1);
      const sx = -tz * inv;
      const sz = tx * inv;
      push(p.x + sx * half, p.z + sz * half, left);
      push(p.x, p.z, mid);
      push(p.x - sx * half, p.z - sz * half, left);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 3;
      const b = base + ((i + 1) % n) * 3;
      // left/mid/right strip
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

function buildDistantTrees(scene: THREE.Scene) {
  const random = mulberry32(63);
  const count = 230;
  const geo = new THREE.ConeGeometry(2.2, 9, 6);
  geo.translate(0, 4.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x47593c, roughness: 1 });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const radius = 160 + random() * 115;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    dummy.position.set(x, terrainHeight(x, z) - 0.5, z);
    dummy.rotation.y = random() * Math.PI;
    const s = 0.8 + random() * 1.1;
    dummy.scale.set(s, s * (0.8 + random() * 0.7), s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.frustumCulled = false;
  scene.add(inst);
}

/* ------------------------------------------------------------------ */
/*  Scene assembly                                                     */
/* ------------------------------------------------------------------ */

export function buildWorld(scene: THREE.Scene): WorldData {
  scene.background = new THREE.Color(0xb2c0bb);
  scene.fog = new THREE.Fog(0xb9c4bc, 80, 440);

  // Sky dome
  const skyGeo = new THREE.SphereGeometry(460, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x5f8598) },
      bottomColor: { value: new THREE.Color(0xdfe4d7) },
      offset: { value: 40 },
      exponent: { value: 0.75 },
    },
    vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position,1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition + offset).y; gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h,0.0), exponent),0.0)),1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Sun glow + soft high clouds
  const glowTexture = canvasTexture(256, 256, (ctx) => {
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,248,220,0.95)");
    grad.addColorStop(0.12, "rgba(255,240,198,0.7)");
    grad.addColorStop(0.4, "rgba(246,231,188,0.2)");
    grad.addColorStop(1, "rgba(240,228,190,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  });
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xfff5d8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sun.position.set(245, 205, -320);
  sun.scale.setScalar(180);
  scene.add(sun);

  const cloudTexture = canvasTexture(256, 128, (ctx) => {
    const grad = ctx.createRadialGradient(128, 70, 5, 128, 64, 110);
    grad.addColorStop(0, "rgba(235,239,234,0.72)");
    grad.addColorStop(0.5, "rgba(220,227,222,0.32)");
    grad.addColorStop(1, "rgba(210,220,216,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  });
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudTexture,
    color: 0xe8eeea,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    fog: false,
  });
  const cloudRandom = mulberry32(31);
  for (let i = 0; i < 18; i++) {
    const cloud = new THREE.Sprite(cloudMat.clone());
    const a = cloudRandom() * Math.PI * 2;
    const radius = 160 + cloudRandom() * 220;
    cloud.position.set(Math.cos(a) * radius, 120 + cloudRandom() * 100, Math.sin(a) * radius);
    cloud.scale.set(150 + cloudRandom() * 200, 38 + cloudRandom() * 40, 1);
    cloud.material.opacity = 0.28 + cloudRandom() * 0.3;
    cloud.material.rotation = (cloudRandom() - 0.5) * 0.25;
    scene.add(cloud);
  }

  // Distant hills to give the horizon depth
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x69755c, roughness: 1 });
  const hillFarMat = new THREE.MeshStandardMaterial({ color: 0x74806f, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3;
    const radius = 300 + (i % 3) * 26;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(60 + (i % 4) * 14, 14, 8), i % 2 ? hillFarMat : hillMat);
    hill.position.set(Math.cos(a) * radius, -32 - (i % 3) * 6, Math.sin(a) * radius);
    hill.scale.set(2.1 + (i % 3) * 0.5, 0.5 + (i % 2) * 0.18, 1.5);
    scene.add(hill);
  }

  // Lighting — heavy overcast with a low sun break
  const hemi = new THREE.HemisphereLight(0xdce8e4, 0x5b5438, 1.12);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x93a29b, 0.24);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xfff2d2, 3.35);
  sunLight.position.set(120, 165, -90);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -175;
  sunLight.shadow.camera.right = 175;
  sunLight.shadow.camera.top = 175;
  sunLight.shadow.camera.bottom = -175;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 460;
  sunLight.shadow.bias = -0.0009;
  sunLight.shadow.normalBias = 0.06;
  scene.add(sunLight);
  scene.add(sunLight.target);
  sunLight.target.position.set(10, 0, 0);

  const colliders: BoxCollider[] = [];
  const trees: TreeCollider[] = [];
  const wind = { value: 0 };

  buildTerrain(scene);
  // PERF/z-fight: generous vertical gap + separate polygon offsets so the
  // shoulder and the asphalt ribbon never fight in the depth buffer.
  const { sampled } = buildRoad(scene, 9.2, 0.16, 0x6e6c60);
  buildRoad(scene, 12.6, 0.07, 0x7a7460);
  buildRoadMarkings(scene, sampled);
  buildGrass(scene, wind);
  buildForest(scene, trees);
  buildBuilding(scene, colliders);
  buildFence(scene, colliders, BUILDING.x + 20, BUILDING.z + 12, 46, BUILDING.rot + Math.PI / 2);
  buildFence(scene, colliders, BUILDING.x - 4, BUILDING.z + 26, 34, BUILDING.rot + 0.1);
  buildPowerLines(scene, colliders);
  buildCheckpoint(scene, colliders);
  buildWreck(scene, 22, roadBaseZ(22) - 10.5, 0.9);
  buildWreck(scene, -96, -36, -0.4);
  buildTrench(scene, colliders);
  buildBattleDamage(scene, colliders);
  buildCamoNets(scene);
  for (const house of HOUSES) buildHouse(scene, colliders, house.x, house.z, house.rot, house.variant);
  buildDirtTrack(scene, BASE_POS.x, BASE_POS.z, BUILDING.x, BUILDING.z);
  buildRouteTracks(scene);
  buildDistantTrees(scene);

  const tag = new THREE.Group();
  buildBase(scene, colliders, tag);

  // Rocks scattered
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8574, roughness: 1 });
  const rng = mulberry32(5);
  for (let i = 0; i < 46; i++) {
    const x = (rng() - 0.5) * 340;
    const z = (rng() - 0.5) * 320 + 10;
    const r = 0.1 + rng() * 0.32;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, terrainHeight(x, z) + r * 0.3, z);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.scale.y = 0.7;
    rock.castShadow = true;
    scene.add(rock);
  }

  const { soldiers, vehicles } = buildSpawnLayout();

  // PERF: collapse the thousands of static primitives into a few dozen
  // draw calls. Geometry is baked in world space; colliders were already
  // stored as world-space Box3, so physics is unaffected.
  mergeStaticScene(scene);

  const baseVector = new THREE.Vector3(BASE_POS.x, terrainHeight(BASE_POS.x, BASE_POS.z) + 0.15, BASE_POS.z);
  return { colliders, trees, soldierSpawns: soldiers, vehicleSpawns: vehicles, base: baseVector, tag, wind };
}
