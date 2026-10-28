import * as THREE from "three";
import { buildWorld, terrainHeight, BUILDING, BASE_POS, VEHICLE_ROUTES, vehicleRouteCurve, type WorldData } from "./world";
import {
  animateSoldier,
  createArmor,
  createDrone,
  DRONE_FOOT_CLEARANCE,
  createSoldier,
  createTruck,
  type DroneRig,
  type SoldierRig,
  type VehicleRig,
} from "./models";
import { getWarhead } from "./warheads";
import { mergeGroupMeshes, mergeStaticSubtree } from "./optimize";
import { Effects } from "./effects";
import { SimAudio } from "./audio";
import type { AudioVehicle } from "./audio";
import { SoldierRagdoll } from "./ragdoll";
import { FpvVideo } from "./video";
import type { HeadMarker } from "./video";
import type {
  DebriefData,
  HudData,
  HudEvent,
  MapTarget,
  SimMode,
  SimSettings,
  WarheadId,
} from "./types";

const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const clamp = THREE.MathUtils.clamp;

interface SoldierEntity {
  id: string;
  kind: "soldier";
  label: string;
  group: THREE.Group;
  rig: SoldierRig;
  x: number;
  z: number;
  y: number;
  anchor: THREE.Vector3;
  alive: boolean;
  brave: boolean;
  onStructure: boolean;
  details: THREE.Mesh[];
  detailVisible: boolean;
  detailedMeshes: THREE.Mesh[];
  lod: THREE.Group;
  lodActive: boolean;
  shootCd: number;
  runDir: THREE.Vector3;
  thinkCd: number;
  moving: boolean;
  aiming: boolean;
  /** limb physics after a blast; null while alive */
  ragdoll: SoldierRagdoll | null;
  /** current walking speed in m/s (drives the stride cadence) */
  walkSpeed: number;
  walkTarget: THREE.Vector3;
  walkCd: number;
}

interface VehicleEntity {
  id: string;
  kind: "truck" | "armor";
  label: string;
  group: THREE.Group;
  rig: VehicleRig;
  x: number;
  z: number;
  y: number;
  yaw: number;
  alive: boolean;
  shootCd: number;
  armor: boolean;
  /** private closed patrol route */
  route: THREE.CatmullRomCurve3;
  /** normalised progress along the loop */
  routeU: number;
  routeLen: number;
  speed: number;
  steer: number;
  wheelSpin: number;
  /** distance travelled, used for suspension bob and exhaust puffs */
  odometer: number;
  pfCd: number;
}

type Entity = SoldierEntity | VehicleEntity;

interface Callbacks {
  onHud: (data: HudData) => void;
  onDebrief: (data: DebriefData) => void;
  onPauseRequest?: () => void;
}

interface Options {
  canvas: HTMLCanvasElement;
  warheadId: WarheadId;
  settings: SimSettings;
  callbacks: Callbacks;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _eu = new THREE.Euler();
const _dummy = new THREE.Object3D();
const _audioRight = new THREE.Vector3();
const _headWorld = new THREE.Vector3();
const _headView = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
/** Radius of a soldier's head+helmet, used to size the blur patch. */
const HEAD_BLUR_RADIUS = 0.115;
/** Head joint sits at the neck; the face centre is a bit above it. */
const HEAD_CENTER_Y = 0.115;

export class Simulator {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: WorldData;
  private effects: Effects;
  private audio = new SimAudio();
  private audioList: AudioVehicle[] = [];
  private headMarkers: HeadMarker[] = [];
  private viewHeightPx = 720;
  private video = new FpvVideo();
  private callbacks: Callbacks;
  private warheadId: WarheadId;
  private armedWarhead: WarheadId;
  private settings: SimSettings;

  private drone: DroneRig | null = null;
  private soldiers: SoldierEntity[] = [];
  private vehicles: VehicleEntity[] = [];
  private soldierShadows: THREE.InstancedMesh | null = null;

  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private pitch = 0;
  private roll = 0;
  private yaw = 0;
  private throttle = 0;
  private onGround = true;
  private battery = 100;
  private shake = 0;
  private mode: SimMode = "standby";
  private paused = false;
  private elapsed = 0;
  private flightTime = 0;
  private lastHudAt = 0;
  private lastAudioAt = 0;
  private lastVehicleAudioAt = 0;
  private prevNose = new THREE.Vector3();
  private hasPrevNose = false;
  private pointer = new THREE.Vector2();
  private stick = new THREE.Vector2();
  private pointerLocked = false;
  private respawnLockUntil = 0;
  private acro = false;
  private dragging = false;
  private lastPointer = new THREE.Vector2();
  private ghost = { target: new THREE.Vector3(), azimuth: -0.8, polar: 1.08, distance: 70 };
  private cameraShakeSeed = Math.random() * 100;
  private events: HudEvent[] = [];
  private eventId = 1;
  private lastImpact: { x: number; z: number } | null = null;
  private lastShotSound = 0;
  private shooterId: string | null = null;
  private shooterTimer = 0;
  private damageFlash = 0;
  private stats = {
    flightSoldiers: 0,
    flightVehicles: 0,
    totalSoldiers: 0,
    totalVehicles: 0,
  };
  private targetTotals = { soldiers: 0, vehicles: 0 };
  private raf = 0;
  private lastFrame = 0;
  private disposed = false;
  private keys = new Set<string>();
  private resizeObserver: ResizeObserver | null = null;
  private lastBatteryWarning = false;
  private lastPosForDust = new THREE.Vector3();
  private padTop = 0;
  private dustCd = 0;
  private missionStart = 0;

  constructor(options: Options) {
    this.canvas = options.canvas;
    this.warheadId = options.warheadId;
    this.armedWarhead = options.warheadId;
    this.settings = { ...options.settings };
    this.callbacks = options.callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    // PERF: mission renders big full-screen surfaces twice (main + shadow
    // pass); capping DPR keeps the frame budget stable on high-DPI screens.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.08, 620);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(-20, 70, 150);

    this.world = buildWorld(this.scene);
    this.padTop = terrainHeight(BASE_POS.x, BASE_POS.z) + 0.12;
    this.effects = new Effects(this.scene);
    this.buildEntities();
    this.targetTotals.soldiers = this.soldiers.length;
    this.targetTotals.vehicles = this.vehicles.length;
    this.decorateCamp();

    this.audio.setMuted(this.settings.muted);
    (window as unknown as { __SIM__?: Simulator }).__SIM__ = this;
    this.addEvent("СИМУЛЯТОР ГОТОВ · R — ВЫПУСК ДРОНА", "info");
    this.addEvent("ПОЛИГОН 04 · СВЯЗЬ 5.8 ГГц", "info");

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    const parent = this.canvas.parentElement;
    if (parent) this.resizeObserver.observe(parent);
    window.addEventListener("resize", this.resize);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    this.canvas.addEventListener("click", this.onCanvasClick);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);

    this.buildDisplayDrone();
    this.ghost.target.set(BASE_POS.x, terrainHeight(BASE_POS.x, BASE_POS.z) + 3, BASE_POS.z);
    this.lastPosForDust.copy(this.world.base);
    this.emitHud();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------------------------------------------------------- */
  /*  Setup                                                           */
  /* ---------------------------------------------------------------- */

  /** 4-mesh silhouette used beyond 70 m instead of the full rig. */
  private buildSoldierLod(uniformColor: number): THREE.Group {
    const lod = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: uniformColor, roughness: 0.95, metalness: 0 });
    const gear = new THREE.MeshStandardMaterial({ color: 0x353b2e, roughness: 0.95, metalness: 0 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7559, roughness: 0.9, metalness: 0 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.24), gear);
    torso.position.y = 1.24;
    lod.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.22), skin);
    head.position.y = 1.72;
    lod.add(head);
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 0.18), cloth);
      leg.position.set(sx, 0.46, 0);
      lod.add(leg);
    }
    lod.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    lod.visible = false;
    return lod;
  }

  private buildEntities() {
    const rand = seeded(73);
    this.soldiers = this.world.soldierSpawns.map((spawn, i) => {
      const rig = createSoldier(spawn.variant);
      // Ground troops must never spawn inside a sandbag wall, a concrete
      // block or a tree trunk — nudge them to the nearest clear patch.
      const stand =
        spawn.y !== undefined
          ? { x: spawn.x, z: spawn.z, y: spawn.y }
          : this.freeGroundSpot(spawn.x, spawn.z, i * 1.37);
      const { x: sx, z: sz, y } = stand;
      rig.group.position.set(sx, y, sz);
      rig.group.rotation.y = spawn.rot;
      this.scene.add(rig.group);
      // PERF: merge each rig's static parts per group (joints untouched)
      mergeGroupMeshes(rig.group);
      const details: THREE.Mesh[] = [];
      const detailedMeshes: THREE.Mesh[] = [];
      rig.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // soldiers don't cast into the shadow map: ~1000 shadow draws saved
          child.castShadow = false;
          child.receiveShadow = false;
          detailedMeshes.push(child);
          if (child.userData.detail) details.push(child);
        }
      });
      const lod = this.buildSoldierLod(0x4e563f);
      rig.group.add(lod);
      return {
        id: `s-${i}`,
        kind: "soldier" as const,
        label: `СОЛДАТ · ${spawn.squad}`,
        group: rig.group,
        rig,
        x: sx,
        z: sz,
        y,
        anchor: new THREE.Vector3(sx, y, sz),
        alive: true,
        brave: rand() > 0.38,
        onStructure:
          spawn.y !== undefined && spawn.y > terrainHeight(spawn.x, spawn.z) + 0.15,
        details,
        detailVisible: true,
        detailedMeshes,
        lod,
        lodActive: false,
        shootCd: 0.6 + rand() * 2.8,
        runDir: new THREE.Vector3(),
        thinkCd: rand() * 1.5,
        moving: false,
        aiming: false,
        ragdoll: null,
        walkSpeed: 1.15 + rand() * 0.35,
        walkTarget: new THREE.Vector3(sx, y, sz),
        walkCd: rand() * 3,
      };
    });

    this.vehicles = this.world.vehicleSpawns.map((spawn, i) => {
      const rig = spawn.kind === "armor" ? createArmor(spawn.variant) : createTruck(spawn.variant);
      const y = terrainHeight(spawn.x, spawn.z);
      rig.group.position.set(spawn.x, y, spawn.z);
      rig.group.rotation.y = spawn.rot;
      this.scene.add(rig.group);
      // PERF: body panels bake into a handful of meshes; steering and rolling
      // wheel pivots + turret/barrel stay as live groups so they can animate.
      const wheelPivots = rig.wheels.map((w) => w.steer);
      if (rig.turret && rig.barrel) {
        mergeStaticSubtree(rig.group, [rig.turret, ...wheelPivots]);
        mergeStaticSubtree(rig.turret, [rig.barrel]);
        mergeStaticSubtree(rig.barrel);
      } else {
        mergeStaticSubtree(rig.group, wheelPivots);
      }
      for (const w of rig.wheels) mergeStaticSubtree(w.spin);
      const routeMeta = VEHICLE_ROUTES[spawn.route ?? 0];
      const curve = vehicleRouteCurve(routeMeta);
      return {
        id: `v-${i}`,
        kind: spawn.kind,
        label: spawn.label,
        group: rig.group,
        rig,
        x: spawn.x,
        z: spawn.z,
        y,
        yaw: spawn.rot,
        alive: true,
        shootCd: 2 + rand() * 2,
        armor: spawn.kind === "armor",
        route: curve,
        routeU: routeMeta.start ?? 0,
        routeLen: curve.getLength(),
        speed: spawn.speed ?? (spawn.kind === "armor" ? 6.8 : 5.6),
        steer: 0,
        wheelSpin: 0,
        odometer: rand() * 40,
        pfCd: rand() * 2,
      };
    });

    this.buildBlobShadows();
  }

  /* ---------------------------------------------------------------- */
  /*  Soft contact shadows                                            */
  /* ---------------------------------------------------------------- */

  private buildBlobShadows() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(10,12,9,0.55)");
    grad.addColorStop(0.55, "rgba(10,12,9,0.28)");
    grad.addColorStop(1, "rgba(10,12,9,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    // soldiers share one instanced quad (1 draw call for the whole squad)
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const shadows = new THREE.InstancedMesh(geo, material, Math.max(1, this.soldiers.length));
    shadows.frustumCulled = false;
    shadows.renderOrder = 3;
    this.scene.add(shadows);
    this.soldierShadows = shadows;

    // vehicles have long footprints, so each gets its own stretched quad
    for (const vehicle of this.vehicles) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      plane.rotation.x = -Math.PI / 2;
      plane.scale.set(vehicle.armor ? 3.4 : 3.0, vehicle.armor ? 6.8 : 6.2, 1);
      plane.position.y = 0.06;
      plane.renderOrder = 3;
      vehicle.group.add(plane);
    }
    this.updateSoldierShadows();
  }

  private updateSoldierShadows() {
    const shadows = this.soldierShadows;
    if (!shadows) return;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      _dummy.position.set(s.group.position.x, s.group.position.y + 0.03, s.group.position.z);
      _dummy.rotation.set(0, s.group.rotation.y, 0);
      _dummy.scale.set(0.95, 1, 1.25);
      _dummy.updateMatrix();
      shadows.setMatrixAt(i, _dummy.matrix);
    }
    shadows.instanceMatrix.needsUpdate = true;
  }

  private decorateCamp() {
    // Ground crew silhouette near the launch pad for scale
    const rig = createSoldier(2);
    rig.group.position.set(BASE_POS.x - 2.4, terrainHeight(BASE_POS.x - 2.4, BASE_POS.z - 1.5), BASE_POS.z - 1.5);
    rig.group.rotation.y = 2.2;
    this.scene.add(rig.group);
    rig.group.userData.crew = true;
    mergeStaticSubtree(rig.group);
    rig.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = false;
    });
  }

  private buildDisplayDrone() {
    if (this.mode !== "standby") return;
    if (this.drone) this.removeDrone();
    const rig = createDrone(this.warheadId);
    rig.group.position.copy(this.world.base).add(new THREE.Vector3(0, 0.42, 0));
    rig.group.rotation.y = yawToward(BUILDING.x - BASE_POS.x, BUILDING.z - BASE_POS.z);
    this.scene.add(rig.group);
    this.drone = rig;
  }

  private removeDrone() {
    if (!this.drone) return;
    this.scene.remove(this.drone.group);
    this.drone.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.drone = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Public API                                                      */
  /* ---------------------------------------------------------------- */

  setSettings(settings: SimSettings) {
    this.settings = { ...settings };
    this.audio.setMuted(settings.muted);
  }

  setWarhead(id: WarheadId) {
    if (this.warheadId === id) return;
    this.warheadId = id;
    if (this.mode === "standby") {
      this.armedWarhead = id;
      this.buildDisplayDrone();
    }
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.audio.silenceRotor();
      this.exitPointerLock();
    } else {
      this.lastFrame = performance.now();
      this.audio.init();
      this.audio.setMuted(this.settings.muted);
    }
  }

  spawn() {
    if (performance.now() < this.respawnLockUntil) return;
    this.audio.init();
    this.audio.setMuted(this.settings.muted);
    if (this.mode === "flight") {
      this.removeDrone();
      this.addEvent("ТЕКУЩИЙ ДРОН ОТОЗВАН · ПОДГОТОВКА РЕЗЕРВА", "warn");
    }
    if (this.drone) this.removeDrone();
    this.armedWarhead = this.warheadId;
    const rig = createDrone(this.armedWarhead);
    rig.cameraMount.position.set(0, 0.17, -0.28);
    rig.cameraMount.rotation.x = -0.045;
    rig.group.traverse((child) => {
      if (child.userData.fpvHidden) child.visible = false;
    });
    this.drone = rig;
    this.scene.add(rig.group);

    const ground = this.groundHeightAt(BASE_POS.x, BASE_POS.z);
    this.pos.set(BASE_POS.x, ground + DRONE_FOOT_CLEARANCE, BASE_POS.z);
    this.vel.set(0, 0, 0);
    this.yaw = yawToward(BUILDING.x - BASE_POS.x, BUILDING.z - BASE_POS.z);
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0;
    this.onGround = true;
    this.stick.set(0, 0);
    this.pointer.set(0, 0);
    this.battery = 100;
    this.stats.flightSoldiers = 0;
    this.stats.flightVehicles = 0;
    this.damageFlash = 0;
    this.shake = 0;
    this.flightTime = 0;
    this.lastBatteryWarning = false;
    this.hasPrevNose = false;
    this.mode = "flight";
    this.prevNose.set(0, 0, 0);
    this.missionStart = this.missionStart || this.elapsed;
    this.syncDroneTransform();
    this.lastPosForDust.copy(this.pos);
    this.addEvent(`ДРОН НА СТАРТЕ · ЗАЖМИТЕ W ДЛЯ ВЗЛЁТА`, "info");
    this.addEvent("КАНАЛ 5.8 ГГц · RSSI −46 дБм", "info");
    this.audio.beep(660);
    this.requestPointerLock();
    this.emitHud();
  }

  resetMission() {
    // Reserved for future mission resets from the debrief screen.
    this.removeDrone();
    this.mode = "standby";
    this.buildDisplayDrone();
    this.emitHud();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onCanvasPointerDown);
    this.canvas.removeEventListener("click", this.onCanvasClick);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.exitPointerLock();
    this.resizeObserver?.disconnect();
    this.effects.dispose();
    this.audio.dispose();
    this.video.dispose();
    disposeObject(this.scene);
    this.renderer.dispose();
  }

  /* ---------------------------------------------------------------- */
  /*  Input                                                           */
  /* ---------------------------------------------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const code = e.code;
    const key = e.key ? e.key.toLowerCase() : "";
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code) ||
      ["w", "a", "s", "d", "q", "e", "ц", "ф", "ы", "в", "й", "у"].includes(key)
    ) {
      e.preventDefault();
    }
    if (code) this.keys.add(code);
    if (key) this.keys.add(key);
    if ((code === "KeyR" || key === "r" || key === "к") && !e.repeat && !this.paused) {
      if (this.mode !== "flight" && performance.now() >= this.respawnLockUntil) this.spawn();
    }
    if ((code === "KeyC" || key === "c" || key === "с") && !e.repeat && this.mode === "flight") {
      this.stick.set(0, 0);
      this.addEvent("СТИК ОТЦЕНТРИРОВАН", "info");
    }
    if ((code === "KeyH" || key === "h" || key === "р") && !e.repeat && !this.paused) {
      this.acro = !this.acro;
      this.addEvent(this.acro ? "РЕЖИМ ПОЛЁТА · ACRO (RATE)" : "РЕЖИМ ПОЛЁТА · ANGLE (STAB)", "warn");
      this.audio.beep(this.acro ? 880 : 620);
      this.emitHud();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code) this.keys.delete(e.code);
    if (e.key) this.keys.delete(e.key.toLowerCase());
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.pointerLocked && (this.mode === "flight" || this.mode === "landed")) {
      // Relative stick: mouse deltas tilt the drone, crosshair stays centered.
      // Per-event delta is clamped so a single spike (or synthetic jump)
      // can never saturate the stick instantly.
      const k = 0.0021 * this.settings.sensitivity;
      const dx = clamp(e.movementX || 0, -120, 120);
      const dy = clamp(e.movementY || 0, -120, 120);
      this.stick.x = clamp(this.stick.x + dx * k, -1, 1);
      this.stick.y = clamp(this.stick.y + dy * k, -1, 1);
      this.pointer.copy(this.stick);
    } else {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.pointer.set(((e.clientX - w / 2) / (w / 2)), ((e.clientY - h / 2) / (h / 2)));
      // Fallback when pointer lock is unavailable (e.g. headless): mirror to stick
      if (this.mode === "flight" || this.mode === "landed") {
        this.stick.copy(this.pointer);
      }
    }
    if (this.dragging && this.mode === "ghost") {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.ghost.azimuth -= dx * 0.005;
      this.ghost.polar = clamp(this.ghost.polar - dy * 0.004, 0.18, 1.48);
    }
    this.lastPointer.set(e.clientX, e.clientY);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.mode === "ghost") {
      this.dragging = true;
      this.lastPointer.set(e.clientX, e.clientY);
    }
  };

  private onMouseUp = () => {
    this.dragging = false;
  };

  private onCanvasPointerDown = (e: PointerEvent) => {
    if (this.mode === "ghost") {
      this.dragging = true;
      this.lastPointer.set(e.clientX, e.clientY);
    }
  };

  private onCanvasClick = () => {
    if ((this.mode === "flight" || this.mode === "landed") && !this.pointerLocked && !this.paused) {
      this.requestPointerLock();
    }
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.pointerLocked) {
      this.stick.set(0, 0);
      this.pointer.set(0, 0);
    }
  };

  private requestPointerLock() {
    try {
      const el = this.canvas as HTMLCanvasElement & { requestPointerLock?: () => void };
      if (document.pointerLockElement !== this.canvas && typeof el.requestPointerLock === "function") {
        const result = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (result && typeof result.catch === "function") result.catch(() => {});
      }
    } catch {
      /* pointer lock unavailable — absolute fallback stays active */
    }
  }

  private exitPointerLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* noop */
    }
    this.pointerLocked = false;
  }

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "ghost") return;
    e.preventDefault();
    this.ghost.distance = clamp(this.ghost.distance + e.deltaY * 0.12, 12, 280);
  };

  /* ---------------------------------------------------------------- */
  /*  Main loop                                                       */
  /* ---------------------------------------------------------------- */

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    dt = Math.min(dt, 0.05);
    if (dt <= 0) dt = 0.016;

    if (!this.paused) {
      this.elapsed += dt;
      if (this.mode === "flight") {
        this.updateFlight(dt);
        this.updateSoldiers(dt);
        this.updateVehicles(dt);
      } else if (this.mode === "landed") {
        if (this.keys.has("KeyW") || this.keys.has("w") || this.keys.has("ц") || this.keys.has("ArrowUp")) {
          this.mode = "flight";
          this.audio.init();
          this.audio.setMuted(this.settings.muted);
          this.addEvent("ВЗЛЁТ · ПРОДОЛЖЕНИЕ МИССИИ", "info");
          this.updateFlight(dt);
        }
      } else if (this.mode === "ghost") {
        this.updateSoldiers(dt, false);
        this.updateVehicles(dt, false);
      }
      this.updateEffects(dt);
      this.world.wind.value = this.elapsed;
      this.updateCamera(dt);
      if (this.elapsed - this.lastHudAt > 0.09) {
        this.lastHudAt = this.elapsed;
        this.emitHud();
      }
      if (this.mode === "flight" && this.elapsed - this.lastAudioAt > 0.1) {
        this.lastAudioAt = this.elapsed;
        this.audio.updateThrottle(this.throttle, this.vel.length(), this.battery);
      }
      // Engines are mixed from the listener's point of view every frame the
      // world is live (including spectator mode) so the panning stays smooth.
      if (this.elapsed - this.lastVehicleAudioAt > 0.06) {
        this.lastVehicleAudioAt = this.elapsed;
        this.updateVehicleAudio();
      }
    }
    // The drone feed gets the analogue link damage; hangar and ghost views stay
    // sharp. Both go through the post pass so the head blur is always applied.
    const fpv = this.mode === "flight" || this.mode === "landed";
    this.collectHeadMarkers();
    this.video.setHeads(this.headMarkers);
    this.video.render(this.renderer, this.scene, this.camera, this.elapsed, fpv);
  };

  private updateEffects(dt: number) {
    this.effects.update(dt);
  }

  /**
   * Projects every visible soldier's head into screen space for the privacy
   * blur. Radius is passed as a fraction of the viewport height so the patch
   * scales correctly at any resolution and camera FOV.
   */
  private collectHeadMarkers() {
    const list = this.headMarkers;
    list.length = 0;
    const cam = this.camera;
    const halfTan = Math.tan((cam.fov * Math.PI) / 360);
    const aspect = cam.aspect;
    _invQuat.copy(cam.quaternion).invert();

    for (const soldier of this.soldiers) {
      // Corpses beyond the render cutoff are invisible; nothing to blur.
      if (!soldier.group.visible) continue;
      // Offset up the head's local Y so the patch is centred on the face,
      // not on the neck pivot — and it follows the head's rotation on ragdolls.
      const head = soldier.rig.head;
      head.updateWorldMatrix(true, false);
      _headWorld.set(0, HEAD_CENTER_Y, 0).applyMatrix4(head.matrixWorld);
      _headView.copy(_headWorld).sub(cam.position).applyQuaternion(_invQuat);
      const depth = -_headView.z;
      if (depth < 0.6) continue;

      const r = HEAD_BLUR_RADIUS / (depth * halfTan);
      if (r * this.viewHeightPx < 2.2) continue;

      const u = 0.5 + (_headView.x / (depth * halfTan * aspect)) * 0.5;
      const v = 0.5 + (_headView.y / (depth * halfTan)) * 0.5;
      if (u < -0.03 || u > 1.03 || v < -0.03 || v > 1.03) continue;

      list.push({ u, v, r, dist: depth });
      if (list.length >= 48) break;
    }
  }

  /** Feeds every live engine into the mixer with the listener's orientation. */
  private updateVehicleAudio() {
    this.camera.updateMatrixWorld();
    const right = _audioRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const list = this.audioList;
    while (list.length < this.vehicles.length) {
      list.push({ x: 0, y: 0, z: 0, speed: 0, alive: false, armor: false });
    }
    list.length = this.vehicles.length;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const entry = list[i];
      entry.x = v.x;
      entry.y = v.y;
      entry.z = v.z;
      entry.speed = v.speed;
      entry.alive = v.alive;
      entry.armor = v.armor;
    }
    this.audio.updateVehicles(this.camera.position, right, list);
  }

  /* ---------------------------------------------------------------- */
  /*  Flight model                                                    */
  /* ---------------------------------------------------------------- */

  private updateFlight(dt: number) {
    if (!this.drone) return;
    this.flightTime += dt;

    // 1. Throttle input: active ONLY while holding W (or ArrowUp)
    // Releasing W cuts throttle to 0 immediately, causing the drone to free-fall/descend
    const isGas = this.keys.has("KeyW") || this.keys.has("w") || this.keys.has("ц") || this.keys.has("ArrowUp");
    if (isGas) {
      this.throttle += (1.0 - this.throttle) * Math.min(1, dt * 10);
    } else {
      this.throttle += (0.0 - this.throttle) * Math.min(1, dt * 14);
      if (this.throttle < 0.01) this.throttle = 0;
    }

    const warhead = getWarhead(this.armedWarhead);
    const batteryFactor = this.battery <= 0 ? 0 : this.battery < 14 ? 0.35 + this.battery / 21 : 1;
    const massFactor = 1 + (warhead.massKg - 2.6) * 0.062;
    // Realistic payload mass: a heavier warhead pulls the drone down harder
    // without thrust and demands more throttle to lift off
    const effectiveWeight = 9.81 * (1 + Math.max(0, warhead.massKg - 2.6) * 0.85);
    // Thrust magnitude along the rotor normal vector (0 when throttle is released)
    const thrustAccel = this.throttle > 0 ? (this.throttle * 38.0) * (batteryFactor / massFactor) : 0;

    const currentGroundY = this.groundHeightAt(this.pos.x, this.pos.z);

    // 2. Resting on ground state (waiting for throttle to take off)
    if (this.onGround) {
      const stickMag = Math.hypot(this.stick.x, this.stick.y);
      // Liftoff gate: a deflected stick would slam the nose into the ground,
      // so the drone stays put until the stick is roughly centered (C).
      if (thrustAccel <= effectiveWeight || stickMag > 0.3) {
        // Drone rests on launch pad / terrain on its skids
        this.vel.set(0, 0, 0);
        this.pos.y = currentGroundY + DRONE_FOOT_CLEARANCE;
        this.pitch = 0;
        this.roll = 0;
        this.syncDroneTransform();
        this.animateDrone(dt);
        this.updateFpvCamera(dt);
        return;
      }
      // Thrust exceeds drone weight -> Liftoff!
      this.onGround = false;
      this.addEvent("ВЗЛЁТ · ТЯГА ПОДАНА", "info");
    }

    // 3. Attitude & Tilt Control (Mouse controls pitch and roll)
    // Pitching down tilts camera towards ground AND tilts rotor normal forward
    const sens = this.settings.sensitivity;
    const dead = 0.035;
    const applied = (v: number) => {
      const a = Math.abs(v) < dead ? 0 : (v - Math.sign(v) * dead) / (1 - dead);
      return clamp(a * sens, -1, 1);
    };

    let pitchInput = applied(this.stick.y);
    if (this.settings.invertPitch) {
      // Invert: mouse backward/down tilts nose down
      pitchInput = -pitchInput;
    }
    // Tilt authority ramps up with altitude: right above the skids only a
    // gentle tilt is possible, so a deflected stick can't dig the nose
    // into the ground on liftoff.
    const aglForAuth = Math.max(0, this.pos.y - this.groundHeightAt(this.pos.x, this.pos.z));
    const tiltAuth = clamp((aglForAuth - 0.1) / 1.1, 0.06, 1);
    const rollInput = -applied(this.stick.x);
    let targetPitch: number;
    let targetRoll: number;
    if (this.acro) {
      // ACRO (rate mode): stick commands angular velocity, no auto-level —
      // the pilot must counter every rotation manually, like real FPV.
      const rateScale = 0.25 + 0.75 * tiltAuth;
      this.pitch = clamp(this.pitch + pitchInput * 3.4 * rateScale * dt, -1.45, 1.45);
      this.roll = clamp(this.roll + rollInput * 3.8 * rateScale * dt, -3.0, 3.0);
      targetPitch = this.pitch;
      targetRoll = this.roll;
    } else {
      // ANGLE (stabilized): stick commands an absolute tilt angle.
      const maxPitch = 1.38;
      const maxRoll = 1.25;
      targetPitch = pitchInput * maxPitch * tiltAuth;
      targetRoll = rollInput * maxRoll * tiltAuth;
    }

    // Yaw control (A / D)
    const isLeft = this.keys.has("KeyA") || this.keys.has("a") || this.keys.has("ф") || this.keys.has("ArrowLeft");
    const isRight = this.keys.has("KeyD") || this.keys.has("d") || this.keys.has("в") || this.keys.has("ArrowRight");
    const yawInput = (isLeft ? 1 : 0) - (isRight ? 1 : 0);
    this.yaw += yawInput * dt * 1.55;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 7.5);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 7.5);

    // 4. Rotor Normal Vector & Force Calculation
    // Rotor normal is perpendicular to the drone frame: (0, 1, 0) rotated by attitude
    _eu.set(this.pitch, this.yaw, this.roll, "YXZ");
    const q = _q.setFromEuler(_eu);
    const rotorUp = _v1.set(0, 1, 0).applyQuaternion(q);

    // Dynamic Forces: Rotor Thrust + Gravity + Aerodynamic Drag
    // Holding W accelerates strictly in the direction of the rotors!
    // Releasing W cuts thrust to 0, leaving only gravity pulling down!
    const accel = _v2.copy(rotorUp).multiplyScalar(thrustAccel);
    accel.y -= effectiveWeight; // Gravity + warhead weight ALWAYS pull downward!

    const speed = this.vel.length();
    const drag = 0.14 + speed * 0.005;
    accel.addScaledVector(this.vel, -drag);

    this.vel.addScaledVector(accel, dt);
    const maxSpeed = 38 * warhead.speedFactor;
    if (this.vel.length() > maxSpeed) this.vel.setLength(maxSpeed);
    if (this.vel.y < -42) this.vel.y = -42;
    this.pos.addScaledVector(this.vel, dt);

    // World boundary soft constraint
    const limit = 285;
    if (Math.abs(this.pos.x) > limit || Math.abs(this.pos.z) > limit) {
      this.addEvent("ПОКИДАНИЕ ЗОНЫ · СИГНАЛ СЛАБЕЕТ", "warn");
      this.pos.x = clamp(this.pos.x, -limit, limit);
      this.pos.z = clamp(this.pos.z, -limit, limit);
    }

    // Battery consumption (proportional to throttle)
    const prevBattery = this.battery;
    this.battery = Math.max(0, this.battery - dt * (0.08 + this.throttle * 0.26) * warhead.batteryPenalty);
    if (this.battery < 25 && prevBattery >= 25) {
      this.addEvent("НИЗКИЙ ЗАРЯД АКБ · РЕЗЕРВ 25%", "warn");
      this.audio.beep(920);
    }
    if (this.battery < 10 && prevBattery >= 10) {
      this.addEvent("КРИТИЧЕСКИЙ ЗАРЯД · ПАДЕНИЕ ТЯГИ", "warn");
      this.audio.beep(520);
    }
    if (this.battery <= 0 && this.lastBatteryWarning === false) {
      this.lastBatteryWarning = true;
      this.addEvent("АККУМУЛЯТОР РАЗРЯЖЕН · ПАДЕНИЕ", "warn");
      this.audio.silenceRotor();
    }
    this.syncDroneTransform();
    this.animateDrone(dt);

    // dust near ground
    this.dustCd -= dt;
    if (this.pos.y - terrainHeight(this.pos.x, this.pos.z) < 3.5 && speed > 3 && this.dustCd <= 0) {
      this.dustCd = 0.18;
      this.effects.dust(this.pos.clone().add(new THREE.Vector3(0, -1.4, 0)), clamp(speed / 12, 0.4, 1.4));
    }

    this.checkCollisions();

    // camera
    this.updateFpvCamera(dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
  }

  private syncDroneTransform() {
    if (!this.drone) return;
    this.drone.group.position.copy(this.pos);
    _eu.set(this.pitch, this.yaw, this.roll, "YXZ");
    this.drone.group.quaternion.setFromEuler(_eu);
    this.drone.group.updateMatrixWorld(true);
  }

  private animateDrone(dt: number) {
    if (!this.drone) return;
    const throttleSpin = this.throttle * 140;
    for (const prop of this.drone.propellers) {
      const spin = (prop.userData.spin as number) || 1;
      prop.rotation.y += spin * throttleSpin * dt;
    }
    if (this.drone.ledMaterials[0]) {
      this.drone.ledMaterials[0].emissiveIntensity = 1.5 + Math.sin(this.elapsed * 6) * 1.2;
      this.drone.ledMaterials[1].emissiveIntensity = this.elapsed % 1 < 0.12 ? 5 : 0.6;
    }
  }

  private updateFpvCamera(dt: number) {
    if (!this.drone) return;
    const mount = this.drone.cameraMount;
    mount.getWorldPosition(this.camera.position);
    mount.getWorldQuaternion(this.camera.quaternion);
    // Real-world jello / high-frequency vibration
    const vib = 0.0012 + this.throttle * 0.0035 + this.shake * 0.06;
    const t = this.elapsed * 38;
    this.camera.rotateX(Math.sin(t + this.cameraShakeSeed) * vib + Math.cos(t * 0.71) * vib * 0.6);
    this.camera.rotateZ(Math.cos(t * 1.13 + this.cameraShakeSeed) * vib * 0.9);
    this.camera.rotateY(Math.sin(t * 0.63) * vib * 0.5);
    const targetFov = 73 + Math.min(this.vel.length(), 35) * 0.2 + this.throttle * 2;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- */
  /*  Collisions & fuse                                              */
  /* ---------------------------------------------------------------- */

  private checkCollisions() {
    if (!this.drone) return;
    this.drone.group.updateMatrixWorld(true);
    const nose = this.drone.noseLocal.clone().applyMatrix4(this.drone.group.matrixWorld);
    if (!this.hasPrevNose) {
      this.prevNose.copy(nose);
      this.hasPrevNose = true;
    }

    // fuse samples along this frame's travel path
    const samples = 5;
    let hitWorld: { label: string } | null = null;
    let hitTarget: Entity | null = null;
    let hitPoint = nose.clone();
    for (let s = 1; s <= samples; s++) {
      const p = this.prevNose.clone().lerp(nose, s / samples);
      const staticHit = this.staticCollision(p);
      if (staticHit) {
        hitWorld = staticHit;
        hitPoint.copy(p);
        break;
      }
      const targetHit = this.entityCollision(p);
      if (targetHit) {
        hitTarget = targetHit;
        hitPoint.copy(p);
        break;
      }
      if (p.y <= this.groundHeightAt(p.x, p.z) + 0.03) {
        hitWorld = { label: "ГРУНТ" };
        hitPoint.copy(p);
        break;
      }
    }

    if (hitTarget) {
      const label = hitTarget.kind === "soldier" ? hitTarget.label : hitTarget.label;
      this.explode(hitPoint, "СТОЛКНОВЕНИЕ С ЦЕЛЬЮ", label, hitTarget);
      return;
    }
    if (hitWorld) {
      const cause = hitWorld.label === "ГРУНТ" ? "НОСОВОЙ КОНТАКТ · ГРУНТ" : `СОПРИКОСНОВЕНИЕ · ${hitWorld.label}`;
      this.explode(hitPoint, cause, hitWorld.label, null);
      return;
    }

    // ground contact of skids — gentle landing permitted
    const lowest = this.lowestGroundPoint();
    if (this.vel.y <= 0 && lowest && lowest.clearance <= 0.02) {
      const upVector = _v1.set(0, 1, 0).applyQuaternion(this.drone.group.quaternion);
      const verticalSpeed = Math.abs(this.vel.y);
      const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
      // Gentle landing: upright, low speed, and nose did not touch
      if (verticalSpeed < 4.2 && horizontalSpeed < 6.0 && upVector.y > 0.65) {
        this.pos.y = this.groundHeightAt(this.pos.x, this.pos.z) + DRONE_FOOT_CLEARANCE;
        this.vel.set(0, 0, 0);
        this.throttle = 0;
        this.onGround = true;
        this.mode = "landed";
        this.audio.silenceRotor();
        this.audio.beep(740);
        this.addEvent("МЯГКАЯ ПОСАДКА · БЕЗ ДЕТОНАЦИИ", "hit");
        this.addEvent("ЗАЖМИТЕ W ДЛЯ ВЗЛЁТА ИЛИ R ДЛЯ СБРОСА", "info");
        this.syncDroneTransform();
        this.emitHud();
        return;
      }
      // Hard slam onto ground -> Detonation
      this.explode(nose, "ЖЁСТКИЙ УДАР О ГРУНТ · ДЕТОНАЦИЯ", "ГРУНТ", null);
      return;
    }

    // body impacts (any hard contact destroys the airframe)
    const body = _v2.copy(this.pos);
    const centerCollision = this.staticCollision(body);
    const speed = this.vel.length();
    if (centerCollision && speed > 2.2) {
      this.explode(body, `УДАР КОРПУСОМ · ${centerCollision.label}`, centerCollision.label, null);
      return;
    }
    if (body.y < this.groundHeightAt(body.x, body.z) - 0.4) {
      this.explode(body, "ПАДЕНИЕ · СТОЛКНОВЕНИЕ С ГРУНТОМ", "ГРУНТ", null);
      return;
    }
    this.prevNose.copy(nose);
  }

  private staticCollision(point: THREE.Vector3): { label: string } | null {
    for (const collider of this.world.colliders) {
      if (collider.box.containsPoint(point)) return { label: collider.label };
    }
    for (const tree of this.world.trees) {
      if (point.y > tree.top || point.y < terrainHeight(tree.x, tree.z) - 0.2) continue;
      const dx = point.x - tree.x;
      const dz = point.z - tree.z;
      if (dx * dx + dz * dz < (tree.r + 0.12) * (tree.r + 0.12)) return { label: tree.label };
    }
    return null;
  }

  private entityCollision(point: THREE.Vector3): Entity | null {
    for (const soldier of this.soldiers) {
      if (!soldier.alive) continue;
      const cx = soldier.group.position.x;
      const cz = soldier.group.position.z;
      const cy = soldier.group.position.y + 1.1;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const dz = point.z - cz;
      if (dx * dx + dy * dy + dz * dz < 0.62) return soldier;
    }
    for (const vehicle of this.vehicles) {
      if (!vehicle.alive) continue;
      const half = vehicle.armor ? new THREE.Vector3(1.45, 1.7, 3.0) : new THREE.Vector3(1.2, 1.55, 2.9);
      const local = point.clone().applyMatrix4(vehicle.group.matrixWorld.clone().invert());
      if (
        Math.abs(local.x) < half.x &&
        local.y > 0.1 &&
        local.y < half.y * 2 &&
        Math.abs(local.z) < half.z
      ) {
        return vehicle;
      }
    }
    return null;
  }

  private groundHeightAt(x: number, z: number): number {
    const t = terrainHeight(x, z);
    if (Math.abs(x - BASE_POS.x) <= 2.1 && Math.abs(z - BASE_POS.z) <= 2.1) {
      return Math.max(t, this.padTop);
    }
    return t;
  }

  /**
   * Highest walkable surface under (x, z) that a falling body can land on.
   * The garrison building has real slabs, so a soldier shot on the 2nd floor
   * has to settle on that floor instead of sinking to the terrain below.
   */
  private supportHeightAt = (x: number, z: number, y: number): number => {
    const terrain = terrainHeight(x, z);
    const dx = x - BUILDING.x;
    const dz = z - BUILDING.z;
    const cos = Math.cos(BUILDING.rot);
    const sin = Math.sin(BUILDING.rot);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) > 13.2 || Math.abs(lz) > 7.7) return terrain;
    const by = terrainHeight(BUILDING.x, BUILDING.z);
    const floors = [
      by + 0.4,
      by + BUILDING.floorH + 0.14,
      by + BUILDING.floorH * 2 + 0.14,
      by + BUILDING.floorH * 3 + 0.16,
    ];
    let best = terrain;
    for (const floor of floors) {
      if (floor <= y + 0.55 && floor > best) best = floor;
    }
    return best;
  };

  private lowestGroundPoint(): { clearance: number } | null {
    if (!this.drone) return null;
    let min = Infinity;
    const points = this.drone.skidPoints;
    for (const local of points) {
      const p = local.clone().applyMatrix4(this.drone.group.matrixWorld);
      const clearance = p.y - this.groundHeightAt(p.x, p.z);
      if (clearance < min) min = clearance;
    }
    return { clearance: min };
  }

  /* ---------------------------------------------------------------- */
  /*  Detonation                                                      */
  /* ---------------------------------------------------------------- */

  private explode(point: THREE.Vector3, cause: string, label: string, directTarget: Entity | null) {
    if (this.mode !== "flight") return;
    const warhead = getWarhead(this.armedWarhead);
    this.mode = "ghost";
    this.respawnLockUntil = performance.now() + 1500;
    this.exitPointerLock();
    this.shake = 1.6;
    this.effects.droneBreakup(point);
    this.audio.explosion();
    this.audio.silenceRotor();
    this.lastImpact = { x: point.x, z: point.z };
    this.damageFlash = 1;

    let newSoldiers = 0;
    let newVehicles = 0;
    for (const soldier of this.soldiers) {
      if (!soldier.alive) continue;
      let killed = soldier === directTarget;
      if (!killed) {
        const dx = soldier.group.position.x - point.x;
        const dz = soldier.group.position.z - point.z;
        const dy = soldier.group.position.y - point.y;
        killed = Math.hypot(dx, dz, dy * 0.85) < warhead.blastRadius;
      }
      if (killed) {
        const dist = Math.hypot(
          soldier.group.position.x - point.x,
          soldier.group.position.y - point.y,
          soldier.group.position.z - point.z,
        );
        this.killSoldier(soldier, point, 0.9 + (warhead.blastRadius - 6) * 0.1 - dist * 0.03);
        newSoldiers++;
      }
    }
    for (const vehicle of this.vehicles) {
      if (!vehicle.alive) continue;
      let killed = vehicle === directTarget;
      if (!killed) {
        const dx = vehicle.group.position.x - point.x;
        const dz = vehicle.group.position.z - point.z;
        const dy = vehicle.group.position.y - point.y;
        const dist = Math.hypot(dx, dz, dy * 0.6);
        if (vehicle.armor) {
          const effective = warhead.armorPower > 60 && dist < warhead.blastRadius * 0.42;
          killed = dist < (effective ? warhead.blastRadius * 0.42 : 1.6);
        } else {
          killed = dist < Math.max(2.8, warhead.blastRadius * 0.72);
        }
      }
      if (killed) {
        this.killVehicle(vehicle);
        newVehicles++;
      }
    }

    this.stats.flightSoldiers += newSoldiers;
    this.stats.flightVehicles += newVehicles;
    this.stats.totalSoldiers += newSoldiers;
    this.stats.totalVehicles += newVehicles;

    const killedTotal = newSoldiers + newVehicles;
    if (killedTotal > 0) {
      this.addEvent(`ПОРАЖЕНО ЦЕЛЕЙ: ${killedTotal} · ${this.remainingTargets()} ОСТАЛОСЬ`, "hit");
    } else {
      this.addEvent(`ПОДРЫВ БЧ · ЦЕЛЕЙ В РАДИУСЕ НЕТ`, "warn");
    }
    if (directTarget) {
      this.addEvent(`КОНТАКТ · ${directTarget.label}`, "hit");
    }

    const remaining = this.remainingTargets();
    const missionComplete = remaining === 0;
    if (missionComplete) {
      this.addEvent("ВСЕ ЦЕЛИ ПОРАЖЕНЫ · ЗАДАЧА ВЫПОЛНЕНА", "hit");
    }

    // ghost orbit camera
    this.ghost.target.copy(point).add(new THREE.Vector3(0, 3, 0));
    this.ghost.azimuth = Math.PI * 0.7;
    this.ghost.polar = 1.12;
    this.ghost.distance = 38;

    const debrief: DebriefData = {
      cause,
      targetName: label,
      soldiersDestroyed: this.stats.flightSoldiers,
      vehiclesDestroyed: this.stats.flightVehicles,
      soldiersTotal: this.targetTotals.soldiers,
      vehiclesTotal: this.targetTotals.vehicles,
      flightTime: this.flightTime,
      targetsRemaining: remaining,
      warhead: this.armedWarhead,
      missionComplete,
      impact: { x: point.x, z: point.z },
    };
    this.hideDroneAfterBlast();
    this.emitHud();
    this.callbacks.onDebrief(debrief);
  }

  private hideDroneAfterBlast() {
    if (!this.drone) return;
    this.scene.remove(this.drone.group);
    this.drone = null;
  }

  private killSoldier(soldier: SoldierEntity, blast: THREE.Vector3 | null = null, power = 1) {
    soldier.alive = false;
    soldier.rig.pose = "dead";
    soldier.rig.deadTime = 0;
    soldier.rig.deathBaseY = soldier.group.position.y;
    soldier.rig.deathSide = Math.random() < 0.5 ? -1 : 1;
    soldier.moving = false;
    soldier.aiming = false;
    // Limbs go limp: the blast throws the body and it tumbles to rest.
    soldier.ragdoll = new SoldierRagdoll(soldier.rig, blast, power);
    soldier.walkSpeed = 0;
    this.addEvent(`ЦЕЛЬ УНИЧТОЖЕНА · ${soldier.label}`, "hit");
  }

  private killVehicle(vehicle: VehicleEntity) {
    vehicle.alive = false;
    for (const mat of vehicle.rig.paint) {
      mat.color.multiplyScalar(0.32);
      mat.roughness = 0.98;
      mat.metalness = 0.2;
    }
    vehicle.group.rotation.z += (Math.random() - 0.5) * 0.09;
    if (vehicle.rig.turret) vehicle.rig.turret.rotation.z = 0.12;
    this.effects.burner(vehicle.group.position.clone());
    this.addEvent(`ТЕХНИКА УНИЧТОЖЕНА · ${vehicle.label}`, "hit");
  }

  private remainingTargets() {
    return (
      this.soldiers.filter((s) => s.alive).length + this.vehicles.filter((v) => v.alive).length
    );
  }

  /* ---------------------------------------------------------------- */
  /*  AI                                                              */
  /* ---------------------------------------------------------------- */

  private updateSoldiers(dt: number, react = true) {
    const dronePos = this.pos;
    const droneActive = this.mode === "flight" && !!this.drone;
    // Only one soldier ever opens fire — the nearest one, re-picked on a
    // slow cadence so the shooter doesn't flicker between frames — and only
    // at point-blank range, when the drone is practically on top of him.
    if (droneActive && react) {
      this.shooterTimer -= dt;
      const shooterAlive = this.shooterId !== null && this.soldiers.some((s) => s.id === this.shooterId && s.alive);
      if (this.shooterTimer <= 0 || !shooterAlive) {
        let best: SoldierEntity | null = null;
        let bestDist = Infinity;
        for (const s of this.soldiers) {
          if (!s.alive) continue;
          const d = Math.hypot(dronePos.x - s.group.position.x, dronePos.z - s.group.position.z);
          if (d < bestDist) {
            bestDist = d;
            best = s;
          }
        }
        this.shooterId = best ? best.id : null;
        this.shooterTimer = 1.5;
      }
    } else {
      this.shooterId = null;
    }
    for (const soldier of this.soldiers) {
      // PERF: tiny gear (pouches, rails, antennas...) only renders up close —
      // it is a few pixels at 55 m but costs a draw call each.
      const camD = this.camera.position.distanceToSquared(soldier.group.position);
      // far LOD: beyond 70 m the full rig collapses into a 4-mesh silhouette
      const far = camD > 70 * 70;
      if (!soldier.alive) {
        // A corpse needs no silhouette: it is either close enough for the
        // real rig or far enough to be invisible. (An upright LOD box would
        // make the body look like it is standing up again.)
        soldier.group.visible = !far;
        if (!far) {
          if (soldier.lodActive) {
            soldier.lodActive = false;
            soldier.lod.visible = false;
            for (const m of soldier.detailedMeshes) m.visible = true;
          }
          if (!soldier.detailVisible) {
            soldier.detailVisible = true;
            for (const d of soldier.details) d.visible = true;
          }
          if (soldier.ragdoll && !soldier.ragdoll.sleeping) {
            soldier.ragdoll.update(dt, this.supportHeightAt);
          }
        } else if (soldier.ragdoll && !soldier.ragdoll.sleeping) {
          soldier.ragdoll.update(dt, this.supportHeightAt);
        }
        continue;
      }
      soldier.group.visible = true;
      if (soldier.lodActive !== far) {
        soldier.lodActive = far;
        soldier.lod.visible = far;
        for (const m of soldier.detailedMeshes) m.visible = !far;
      }
      const detailOn = camD < 45 * 45;
      if (!far && soldier.detailVisible !== detailOn) {
        soldier.detailVisible = detailOn;
        for (const d of soldier.details) d.visible = detailOn;
      }
      if (!droneActive || !react) {
        // No threat: sentries patrol around their post. This also runs in
        // ghost mode, so the spectator camera sees infantry actually walking.
        soldier.aiming = false;
        this.patrolSoldier(soldier, dt);
        if (!far) animateSoldier(soldier.rig, dt, this.elapsed, soldier.moving, false);
        continue;
      }
      const dx = dronePos.x - soldier.group.position.x;
      const dz = dronePos.z - soldier.group.position.z;
      const dist = Math.hypot(dx, dz);
      const vertical = dronePos.y - soldier.group.position.y;
      const alert = dist < 118;
      // The designated shooter stands his ground and fires at point-blank
      // range instead of fleeing; everyone else runs for cover.
      const standsToFire = soldier.id === this.shooterId && dist < 26;
      const flee = alert && !standsToFire && (dist < 27 || (!soldier.brave && dist < 55));
      const engaged =
        alert &&
        !flee &&
        (soldier.brave || dist < 58) &&
        (soldier.group.position.y + 2 < dronePos.y || standsToFire);

      soldier.moving = false;
      soldier.aiming = false;
      soldier.rig.moveSpeed = 0;

      if (flee && !soldier.onStructure) {
        const len = Math.max(0.01, dist);
        soldier.runDir.set(-dx / len, 0, -dz / len);
        this.moveSoldier(soldier, soldier.runDir, 3.9 * dt);
        soldier.group.rotation.y = yawToward(soldier.runDir.x, soldier.runDir.z);
        soldier.moving = true;
        soldier.rig.moveSpeed = 3.9;
      } else if (engaged) {
        soldier.aiming = true;
        const targetYaw = yawToward(dx, dz);
        soldier.group.rotation.y = lerpAngle(soldier.group.rotation.y, targetYaw, Math.min(1, dt * 5));
        const pitch = Math.atan2(vertical, Math.max(0.2, dist));
        // the animator owns the pose: it aims the rifle/shoulders at this
        // elevation and applies the recoil impulse
        soldier.rig.aimPitch = clamp(pitch, -0.25, 0.85);
        soldier.shootCd -= dt;
        const canShoot = soldier.id === this.shooterId && dist < 26;
        if (soldier.shootCd <= 0 && canShoot) {
          soldier.shootCd = (soldier.brave ? 1.15 : 1.9) + Math.random() * 1.8;
          this.soldierShoot(soldier, dronePos);
        }
      } else if (alert) {
        soldier.aiming = true;
        soldier.rig.aimPitch = clamp(Math.atan2(vertical, Math.max(0.2, dist)), -0.25, 0.85);
        soldier.group.rotation.y = lerpAngle(soldier.group.rotation.y, yawToward(dx, dz), Math.min(1, dt * 3));
      } else {
        this.patrolSoldier(soldier, dt);
      }
      soldier.group.updateMatrixWorld(true);
      if (!far) animateSoldier(soldier.rig, dt, this.elapsed, soldier.moving, soldier.aiming);
    }
    this.updateSoldierShadows();
  }

  /**
   * Idle patrol: pick a nearby clear waypoint, walk to it at a human pace,
   * pause, repeat. Used whenever there is no threat — including ghost mode,
   * where the player inspects the map and should see live infantry.
   */
  private patrolSoldier(soldier: SoldierEntity, dt: number) {
    if (soldier.onStructure) {
      // No room to march on a slab: scan the surroundings instead.
      soldier.moving = false;
      soldier.rig.moveSpeed = 0;
      soldier.group.rotation.y =
        soldier.anchor.x * 0.03 + Math.sin(this.elapsed * 0.25 + soldier.anchor.z) * 0.5;
      return;
    }
    const p = soldier.group.position;
    soldier.walkCd -= dt;
    const remain = Math.hypot(soldier.walkTarget.x - p.x, soldier.walkTarget.z - p.z);
    if (soldier.walkCd <= 0 || remain < 0.4) {
      soldier.walkCd = 5 + Math.random() * 7;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2.5 + Math.random() * 8;
        const tx = soldier.anchor.x + Math.cos(a) * r;
        const tz = soldier.anchor.z + Math.sin(a) * r;
        const ty = terrainHeight(tx, tz);
        if (this.blockedAt(tx, tz, ty, 0.45)) continue;
        soldier.walkTarget.set(tx, ty, tz);
        break;
      }
    }
    const dx = soldier.walkTarget.x - p.x;
    const dz = soldier.walkTarget.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.4) {
      const speed = soldier.walkSpeed;
      _v2.set(dx / len, 0, dz / len);
      this.moveSoldier(soldier, _v2, speed * dt);
      soldier.group.rotation.y = lerpAngle(
        soldier.group.rotation.y,
        yawToward(dx, dz),
        Math.min(1, dt * 4),
      );
      soldier.moving = true;
      soldier.rig.moveSpeed = speed;
    } else {
      soldier.moving = false;
      soldier.rig.moveSpeed = 0;
    }
  }

  /** Walk a soldier along `dir`, sliding around walls, trees and props. */
  private moveSoldier(soldier: SoldierEntity, dir: THREE.Vector3, step: number) {
    const p = soldier.group.position;
    const x = clamp(p.x + dir.x * step, -250, 250);
    const z = clamp(p.z + dir.z * step, -235, 245);
    const y = terrainHeight(x, z);
    if (!this.blockedAt(x, z, y, 0.34)) {
      soldier.group.position.set(x, y, z);
      return;
    }
    if (!this.blockedAt(x, p.z, y, 0.34)) {
      soldier.group.position.set(x, y, p.z);
      return;
    }
    if (!this.blockedAt(p.x, z, y, 0.34)) {
      soldier.group.position.set(p.x, y, z);
      return;
    }
    // fully blocked: sidestep around the obstacle
    const side = _v1.set(-dir.z, 0, dir.x);
    for (const sign of [1, -1]) {
      const sx = clamp(p.x + side.x * step * 1.4 * sign, -250, 250);
      const sz = clamp(p.z + side.z * step * 1.4 * sign, -235, 245);
      if (!this.blockedAt(sx, sz, terrainHeight(sx, sz), 0.34)) {
        soldier.group.position.set(sx, terrainHeight(sx, sz), sz);
        return;
      }
    }
    soldier.group.position.y = p.y;
  }

  /** Nearest clear standing spot around (x, z) — keeps spawns out of props. */
  private freeGroundSpot(x: number, z: number, phase: number) {
    const y = terrainHeight(x, z);
    if (!this.blockedAt(x, z, y, 0.42)) return { x, z, y };
    for (let ring = 1; ring <= 6; ring++) {
      const radius = ring * 0.7;
      const steps = 8 + ring * 2;
      for (let s = 0; s < steps; s++) {
        const a = phase + (s / steps) * Math.PI * 2;
        const nx = x + Math.cos(a) * radius;
        const nz = z + Math.sin(a) * radius;
        const ny = terrainHeight(nx, nz);
        if (!this.blockedAt(nx, nz, ny, 0.42)) return { x: nx, z: nz, y: ny };
      }
    }
    return { x, z, y };
  }

  /** Is a standing body at (x, z, y) intersecting a wall, tree or prop? */
  private blockedAt(x: number, z: number, y: number, radius: number): boolean {
    for (const collider of this.world.colliders) {
      const b = collider.box;
      if (b.max.y < y + 0.2 || b.min.y > y + 1.7) continue;
      if (x > b.min.x - radius && x < b.max.x + radius && z > b.min.z - radius && z < b.max.z + radius) {
        return true;
      }
    }
    for (const tree of this.world.trees) {
      if (y > tree.top) continue;
      const dx = x - tree.x;
      const dz = z - tree.z;
      const r = tree.r + radius;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** Cheap ray-march used to stop rounds flying through walls. */
  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = _v1.copy(to).sub(from);
    const len = dir.length();
    if (len < 1.2) return false;
    dir.multiplyScalar(1 / len);
    for (let d = 0.6; d < len - 0.4; d += 0.5) {
      const p = _v2.copy(from).addScaledVector(dir, d);
      if (this.staticCollision(p)) return false;
    }
    return true;
  }

  private soldierShoot(soldier: SoldierEntity, target: THREE.Vector3) {
    if (!this.drone) return;
    soldier.group.updateMatrixWorld(true);
    const muzzle = soldier.rig.muzzle.getWorldPosition(new THREE.Vector3());
    // no shooting through concrete: the tracer only flies on a clear line
    if (!this.hasLineOfSight(muzzle, target)) return;
    soldier.rig.recoil = 1;
    const spread = new THREE.Vector3(
      (Math.random() - 0.5) * 4.2,
      (Math.random() - 0.5) * 3.4,
      (Math.random() - 0.5) * 4.2,
    );
    const to = target.clone().add(spread);
    this.effects.tracer(muzzle, to);
    this.effects.muzzleFlash(muzzle);
    if (this.elapsed - this.lastShotSound > 0.11) {
      this.lastShotSound = this.elapsed;
      this.audio.shot(muzzle, "rifle");
    }
    const dist = muzzle.distanceTo(target);
    const chance = clamp(0.26 - dist * 0.0016, 0.035, 0.24);
    if (Math.random() < chance) {
      this.applyHit(1.7 + Math.random() * 1.6, "СТРЕЛКОВОЕ ОРУЖИЕ · СОЛДАТ");
    }
  }

  private updateVehicles(dt: number, react = true) {
    for (const vehicle of this.vehicles) {
      if (!vehicle.alive) continue;

      /* --------------------- private patrol loop ---------------------- */
      // Every vehicle rides its own closed route, so a wreck is never in
      // anybody else's way and the traffic spreads over the whole map.
      const prevYaw = vehicle.yaw;
      vehicle.wheelSpin += vehicle.speed * dt;
      vehicle.odometer += vehicle.speed * dt;
      vehicle.routeU = (vehicle.routeU + (vehicle.speed * dt) / vehicle.routeLen) % 1;

      const point = vehicle.route.getPointAt(vehicle.routeU);
      const tangent = vehicle.route.getTangentAt(vehicle.routeU);
      const inv = 1 / Math.max(1e-4, Math.hypot(tangent.x, tangent.z));
      const fx = tangent.x * inv;
      const fz = tangent.z * inv;
      const ground = terrainHeight(point.x, point.z);
      vehicle.yaw = lerpAngle(vehicle.yaw, Math.atan2(-fx, -fz), Math.min(1, dt * 3.2));

      // terrain-following pitch & roll so wheels sit on the ground
      const hF = terrainHeight(point.x + fx * 2.6, point.z + fz * 2.6);
      const hB = terrainHeight(point.x - fx * 2.6, point.z - fz * 2.6);
      const pitch = Math.atan2(hF - hB, 5.2);
      const rx = -fz;
      const rz = fx;
      const hR = terrainHeight(point.x + rx * 1.25, point.z + rz * 1.25);
      const hL = terrainHeight(point.x - rx * 1.25, point.z - rz * 1.25);
      const roll = Math.atan2(hR - hL, 2.5);
      const bob = Math.sin(vehicle.odometer * 2.1 + point.x * 0.3) * 0.011;
      vehicle.group.position.set(point.x, ground + bob, point.z);
      vehicle.group.rotation.set(pitch, vehicle.yaw, roll);

      // wheels roll at the real ground speed; the front axle steers
      const yawRate =
        Math.atan2(Math.sin(vehicle.yaw - prevYaw), Math.cos(vehicle.yaw - prevYaw)) / Math.max(dt, 1e-4);
      vehicle.steer += (clamp(yawRate * 1.6, -0.5, 0.5) - vehicle.steer) * Math.min(1, dt * 4);
      for (const w of vehicle.rig.wheels) {
        w.spin.rotation.x = vehicle.wheelSpin / w.radius;
        if (w.front) w.steer.rotation.y = vehicle.steer;
      }
      vehicle.x = point.x;
      vehicle.z = point.z;
      vehicle.y = ground;

      // dust kicked up behind the rear wheels, only near the camera
      vehicle.pfCd -= dt;
      if (vehicle.pfCd <= 0 && this.camera.position.distanceToSquared(vehicle.group.position) < 95 * 95) {
        vehicle.pfCd = 0.45 + Math.random() * 0.4;
        _v1.set(point.x - fx * 2.9, ground + 0.3, point.z - fz * 2.9);
        this.effects.dust(_v1, vehicle.armor ? 0.35 : 0.5);
      }

      /* --------------------------- turret ---------------------------- */
      if (!vehicle.armor || !this.drone || !react || this.mode !== "flight") continue;
      const dx = this.pos.x - vehicle.group.position.x;
      const dz = this.pos.z - vehicle.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 140) continue;
      const desired = yawToward(dx, dz);
      const localYaw = desired - vehicle.group.rotation.y;
      if (vehicle.rig.turret) {
        vehicle.rig.turret.rotation.y = lerpAngle(vehicle.rig.turret.rotation.y, clamp(localYaw, -2.4, 2.4), Math.min(1, dt * 2));
        if (vehicle.rig.barrel) {
          const pitch = Math.atan2(this.pos.y - vehicle.group.position.y - 1.9, Math.max(1, dist));
          vehicle.rig.barrel.rotation.x = clamp(pitch, -0.1, 0.35);
        }
      }
      if (dist < 125 && this.pos.y < 55) {
        vehicle.shootCd -= dt;
        if (vehicle.shootCd <= 0) {
          vehicle.shootCd = 2.4 + Math.random() * 2.6;
          vehicle.group.updateMatrixWorld(true);
          const muzzle = vehicle.rig.muzzle
            ? vehicle.rig.muzzle.getWorldPosition(new THREE.Vector3())
            : vehicle.group.position.clone().add(new THREE.Vector3(0, 2.2, 0));
          if (!this.hasLineOfSight(muzzle, this.pos)) {
            vehicle.shootCd = 0.7;
            continue;
          }
          const spread = new THREE.Vector3((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 3.4);
          this.effects.tracer(muzzle, this.pos.clone().add(spread));
          this.effects.muzzleFlash(muzzle);
          this.audio.shot(muzzle, "heavy");
          this.addEvent(`ОБСТРЕЛ · ${vehicle.label}`, "warn");
          if (Math.random() < 0.38) {
            this.applyHit(3.2 + Math.random() * 2.4, "КРУПНОКАЛИБЕРНЫЙ ОГОНЬ · БТР");
          }
        }
      }
    }
  }

  private applyHit(damage: number, source: string) {
    this.battery = Math.max(0, this.battery - damage);
    this.shake = 1.25;
    this.damageFlash = 0.9;
    this.audio.hit();
    this.addEvent(`ПОПАДАНИЕ · ${source} · −${damage.toFixed(1)}%`, "warn");
    if (this.battery <= 0) {
      this.addEvent("АККУМУЛЯТОР РАЗРЯЖЕН · ПАДЕНИЕ", "warn");
      this.audio.silenceRotor();
    }
    this.emitHud();
  }

  /* ---------------------------------------------------------------- */
  /*  Cameras                                                         */
  /* ---------------------------------------------------------------- */

  private updateCamera(dt: number) {
    if (this.mode === "standby") {
      const t = this.elapsed * 0.045;
      const radius = 205;
      const cx = (BASE_POS.x + BUILDING.x) / 2;
      const cz = (BASE_POS.z + BUILDING.z) / 2;
      this.camera.position.set(cx + Math.cos(t) * radius, 96 + Math.sin(t * 0.7) * 10, cz + Math.sin(t) * radius);
      this.camera.fov += (46 - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(cx + 10, 12, cz + 10);
    } else if (this.mode === "ghost") {
      // pan
      const speed = (this.keys.has("ShiftLeft") ? 60 : 26) * dt;
      const forward = new THREE.Vector3().subVectors(this.ghost.target, this.camera.position).setY(0).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) this.ghost.target.addScaledVector(forward, speed);
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) this.ghost.target.addScaledVector(forward, -speed);
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) this.ghost.target.addScaledVector(right, speed);
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) this.ghost.target.addScaledVector(right, -speed);
      if (this.keys.has("KeyE")) this.ghost.target.y += speed * 0.7;
      if (this.keys.has("KeyQ")) this.ghost.target.y -= speed * 0.7;
      this.ghost.target.x = clamp(this.ghost.target.x, -300, 300);
      this.ghost.target.z = clamp(this.ghost.target.z, -300, 300);
      this.ghost.target.y = clamp(this.ghost.target.y, terrainHeight(this.ghost.target.x, this.ghost.target.z) + 1, 140);
      if (!this.dragging) this.ghost.azimuth += dt * 0.018;
      const offset = new THREE.Vector3(
        Math.sin(this.ghost.azimuth) * Math.sin(this.ghost.polar) * this.ghost.distance,
        Math.cos(this.ghost.polar) * this.ghost.distance,
        Math.cos(this.ghost.azimuth) * Math.sin(this.ghost.polar) * this.ghost.distance,
      );
      this.camera.position.copy(this.ghost.target).add(offset);
      const minY = terrainHeight(this.camera.position.x, this.camera.position.z) + 2.5;
      if (this.camera.position.y < minY) this.camera.position.y = minY;
      this.camera.fov += (58 - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.ghost.target);
    } else if (this.mode === "landed" && this.drone) {
      const mount = this.drone.cameraMount;
      mount.getWorldPosition(this.camera.position);
      mount.getWorldQuaternion(this.camera.quaternion);
      this.camera.rotateZ(Math.sin(this.elapsed * 0.6) * 0.012);
      this.camera.fov += (80 - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  HUD                                                             */
  /* ---------------------------------------------------------------- */

  private addEvent(text: string, level: HudEvent["level"]) {
    this.events.unshift({ id: this.eventId++, text, level });
    if (this.events.length > 5) this.events.pop();
  }

  private emitHud() {
    const soldiersLeft = this.soldiers.filter((s) => s.alive).length;
    const vehiclesLeft = this.vehicles.filter((v) => v.alive).length;
    const ground = this.groundHeightAt(this.pos.x, this.pos.z);
    const agg = soldiersLeft + vehiclesLeft;
    this.callbacks.onHud({
      mode: this.mode,
      battery: this.battery,
      voltage: 16.8 * (0.72 + 0.28 * (this.battery / 100)),
      throttle: this.throttle * 100,
      speed: this.vel.length(),
      verticalSpeed: this.vel.y,
      altitude: this.pos.y,
      agl: this.mode === "flight" ? Math.max(0, this.pos.y - ground) : 0,
      heading: ((THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360,
      pitch: THREE.MathUtils.radToDeg(this.pitch),
      roll: THREE.MathUtils.radToDeg(-this.roll),
      rssi: clamp(-42 - this.pos.distanceTo(this.world.base) * 0.17, -96, -38),
      flightTime: this.flightTime,
      distance: this.pos.distanceTo(this.world.base),
      soldiersLeft,
      soldiersTotal: this.targetTotals.soldiers,
      vehiclesLeft,
      vehiclesTotal: this.targetTotals.vehicles,
      kills: this.stats.totalSoldiers + this.stats.totalVehicles,
      droneX: this.pos.x,
      droneZ: this.pos.z,
      lastImpact: this.lastImpact,
      targets: [
        ...this.soldiers.map<MapTarget>((s) => ({
          id: s.id,
          kind: "soldier",
          x: s.group.position.x,
          z: s.group.position.z,
          alive: s.alive,
        })),
        ...this.vehicles.map<MapTarget>((v) => ({
          id: v.id,
          kind: v.armor ? "armor" : "truck",
          x: v.group.position.x,
          z: v.group.position.z,
          alive: v.alive,
        })),
      ],
      events: [...this.events],
      warhead: this.armedWarhead,
      landed: this.mode === "landed",
      totalMissionTime: this.elapsed - this.missionStart,
      damage: this.damageFlash,
      onGround: this.onGround,
      acro: this.acro,
      stickX: this.stick.x,
      stickY: this.stick.y,
      locked: this.pointerLocked,
      signalLost: performance.now() < this.respawnLockUntil,
    });
    void agg;
  }

  private resize = () => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.viewHeightPx = height;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.video.setSize(width, height);
  };
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function disposedSafe() {
  return null;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
      obj.geometry?.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((m) => {
        if (m instanceof THREE.Material) {
          for (const value of Object.values(m)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          m.dispose();
        }
      });
    }
  });
}

function clampValue(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function lerpAngle(from: number, to: number, t: number) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

void clampValue;
void disposedSafe;
