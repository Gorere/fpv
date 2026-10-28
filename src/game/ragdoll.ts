import * as THREE from "three";
import type { SoldierRig } from "./models";

/**
 * Verlet particle ragdoll for infantry killed by a blast.
 *
 * A small set of point masses is captured from the soldier's current skeleton
 * pose at the instant of death. Distance constraints keep the body together,
 * gravity and ground friction make it tumble and settle, and every frame the
 * solved points are converted back into joint rotations of the existing rig —
 * so the result reads exactly like the authored model, just limp.
 *
 * Once the body comes to rest the simulation sleeps: it keeps the final pose
 * forever (no jitter, no drift, no cost).
 */

const AXIS_UP = new THREE.Vector3(0, 1, 0);
const AXIS_DOWN = new THREE.Vector3(0, -1, 0);

const PELVIS = 0;
const CHEST = 1;
const HEAD = 2;
const LSHOULDER = 3;
const RSHOULDER = 4;
const LELBOW = 5;
const RELBOW = 6;
const LHAND = 7;
const RHAND = 8;
const LHIP = 9;
const RHIP = 10;
const LKNEE = 11;
const RKNEE = 12;
const LFOOT = 13;
const RFOOT = 14;
const NODE_COUNT = 15;

interface RNode {
  p: THREE.Vector3;
  q: THREE.Vector3;
  inv: number;
  r: number;
  grounded: boolean;
}

interface RLink {
  a: number;
  b: number;
  rest: number;
  k: number;
}

type Support = (x: number, z: number, y: number) => number;

const MASS = [1.0, 1.0, 1.0, 0.85, 0.85, 0.6, 0.6, 0.5, 0.5, 1.0, 1.0, 0.85, 0.85, 0.75, 0.75];
const RADIUS = [
  0.15, 0.165, 0.145, 0.072, 0.072, 0.058, 0.058, 0.048, 0.048, 0.095, 0.095, 0.08, 0.08, 0.072, 0.072,
];

/** Links are [a, b, stiffness] — stiff core, softer extremities. */
const LINKS: Array<[number, number, number]> = [
  [PELVIS, CHEST, 1],
  [CHEST, HEAD, 1],
  [PELVIS, HEAD, 0.28],
  [CHEST, LSHOULDER, 1],
  [CHEST, RSHOULDER, 1],
  [LSHOULDER, RSHOULDER, 0.9],
  [PELVIS, LHIP, 1],
  [PELVIS, RHIP, 1],
  [LHIP, RHIP, 0.9],
  [CHEST, LHIP, 0.32],
  [CHEST, RHIP, 0.32],
  [LSHOULDER, LELBOW, 0.95],
  [RELBOW, RSHOULDER, 0.95],
  [LELBOW, LHAND, 0.9],
  [RELBOW, RHAND, 0.9],
  [LHIP, LKNEE, 0.95],
  [RHIP, RKNEE, 0.95],
  [LKNEE, LFOOT, 0.9],
  [RKNEE, RFOOT, 0.9],
];

const _wq = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function aimBone(bone: THREE.Object3D, axis: THREE.Vector3, toward: THREE.Vector3) {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_wq);
  _local.copy(toward).normalize().applyQuaternion(_wq.invert());
  if (_local.lengthSq() < 1e-8) return;
  bone.quaternion.setFromUnitVectors(axis, _local.normalize());
}

export class SoldierRagdoll {
  readonly rig: SoldierRig;
  readonly nodes: RNode[] = [];
  private links: RLink[] = [];
  private yaw = 0;
  private scale = 1;
  private asleep = false;
  private calm = 0;
  private age = 0;

  constructor(rig: SoldierRig, blast: THREE.Vector3 | null, power: number) {
    this.rig = rig;
    rig.group.updateMatrixWorld(true);
    this.yaw = rig.group.rotation.y;
    this.scale = rig.group.scale.x || 1;

    const point = (obj: THREE.Object3D, x = 0, y = 0, z = 0) =>
      obj.localToWorld(new THREE.Vector3(x, y, z));

    const pts: THREE.Vector3[] = [
      point(rig.hips),
      point(rig.torso, 0, 0.3, 0),
      point(rig.head, 0, 0.14, 0),
      point(rig.leftArm),
      point(rig.rightArm),
      point(rig.leftElbow),
      point(rig.rightElbow),
      point(rig.leftElbow, 0, -0.33, 0),
      point(rig.rightElbow, 0, -0.33, 0),
      point(rig.leftLeg),
      point(rig.rightLeg),
      point(rig.leftKnee),
      point(rig.rightKnee),
      point(rig.leftKnee, 0, -0.47, 0),
      point(rig.rightKnee, 0, -0.47, 0),
    ];

    for (let i = 0; i < NODE_COUNT; i++) {
      this.nodes.push({
        p: pts[i].clone(),
        q: pts[i].clone(),
        inv: 1 / MASS[i],
        r: RADIUS[i],
        grounded: false,
      });
    }

    for (const [a, b, k] of LINKS) {
      this.links.push({ a, b, rest: pts[a].distanceTo(pts[b]), k });
    }

    // Blast: every particle gets a radial kick with an upward bias. Limbs are
    // lighter, so they fly further than the pelvis — that alone reads as a
    // body being thrown like a rag.
    const falloffRadius = 9;
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = this.nodes[i];
      let vx = 0;
      let vy = 0;
      let vz = 0;
      if (blast) {
        _dir.copy(node.p).sub(blast);
        const dist = _dir.length();
        _dir.multiplyScalar(1 / Math.max(dist, 1e-3));
        const near = THREE.MathUtils.clamp(1 - dist / falloffRadius, 0, 1);
        const kick = power * (0.55 + near * near * 5.2) * (1 / MASS[i]);
        vx = _dir.x * kick + (Math.random() - 0.5) * kick * 0.35;
        vz = _dir.z * kick + (Math.random() - 0.5) * kick * 0.35;
        vy = Math.abs(_dir.y) * kick * 0.35 + kick * (0.42 + Math.random() * 0.55);
      } else {
        // no blast point (e.g. scripted kill): just crumple
        vx = (Math.random() - 0.5) * 0.6;
        vy = Math.random() * 0.4;
        vz = (Math.random() - 0.5) * 0.6;
      }
      node.q.set(node.p.x - vx * 0.016, node.p.y - vy * 0.016, node.p.z - vz * 0.016);
    }
    // a touch of angular spin in the torso
    this.spin(CHEST, 0.55 * power);
    this.spin(HEAD, 0.9 * power);
    this.spin(LKNEE, 0.5 * power);
  }

  private spin(i: number, amount: number) {
    this.nodes[i].q.x -= (Math.random() - 0.5) * amount * 0.06;
    this.nodes[i].q.z -= (Math.random() - 0.5) * amount * 0.06;
  }

  get sleeping() {
    return this.asleep;
  }

  update(dt: number, support: Support) {
    if (this.asleep) return;
    const h = Math.min(dt, 1 / 45);
    this.age += h;

    // --- integrate -----------------------------------------------------
    for (const n of this.nodes) {
      const vx = (n.p.x - n.q.x) * 0.985;
      const vy = (n.p.y - n.q.y) * 0.985;
      const vz = (n.p.z - n.q.z) * 0.985;
      n.q.copy(n.p);
      n.p.x += vx;
      n.p.y += vy - 22 * h * h;
      n.p.z += vz;
      n.grounded = false;
    }

    // --- constraints ---------------------------------------------------
    for (let iter = 0; iter < 7; iter++) {
      for (const link of this.links) {
        const a = this.nodes[link.a];
        const b = this.nodes[link.b];
        let dx = b.p.x - a.p.x;
        let dy = b.p.y - a.p.y;
        let dz = b.p.z - a.p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) continue;
        const diff = ((d - link.rest) / d) * link.k;
        dx *= diff;
        dy *= diff;
        dz *= diff;
        const wa = a.inv / (a.inv + b.inv);
        const wb = 1 - wa;
        a.p.x += dx * wa;
        a.p.y += dy * wa;
        a.p.z += dz * wa;
        b.p.x -= dx * wb;
        b.p.y -= dy * wb;
        b.p.z -= dz * wb;
      }
    }

    // --- ground --------------------------------------------------------
    for (const n of this.nodes) {
      const g = support(n.p.x, n.p.z, n.p.y) + n.r;
      if (n.p.y <= g) {
        n.p.y = g;
        n.grounded = true;
        // friction: kill most of the horizontal slide, keep a little scuff
        n.q.x = n.p.x - (n.p.x - n.q.x) * 0.35;
        n.q.z = n.p.z - (n.p.z - n.q.z) * 0.35;
        if (n.q.y < n.p.y) n.q.y = n.p.y + (n.p.y - n.q.y) * 0.18;
      }
    }

    // --- sleep ---------------------------------------------------------
    let motion = 0;
    let grounded = 0;
    for (const n of this.nodes) {
      motion = Math.max(motion, n.p.distanceToSquared(n.q));
      if (n.grounded) grounded++;
    }
    const settled = motion < 0.000004 && grounded >= 7;
    this.calm = settled ? this.calm + h : 0;
    if (this.calm > 0.45 || this.age > 14) this.asleep = true;

    this.writeBack();
  }

  /** Rebuild joint rotations from the solved particles. */
  private writeBack() {
    const rig = this.rig;
    const n = this.nodes;

    // The rig root sits on the ground; the skeleton's hips joint defines the
    // body position. Shift the whole model so the hips land on the pelvis
    // particle, then reset the authored pose bones.
    rig.group.position.set(
      n[PELVIS].p.x,
      n[PELVIS].p.y - 0.94 * this.scale,
      n[PELVIS].p.z,
    );
    rig.group.rotation.set(0, this.yaw, 0);
    rig.fall.position.set(0, 0, 0);
    rig.fall.rotation.set(0, 0, 0);
    rig.hips.position.set(0, 0.94, 0);
    rig.hips.rotation.set(0, 0, 0);
    rig.group.updateMatrixWorld(true);

    // spine
    _tmp.copy(n[CHEST].p).sub(n[PELVIS].p);
    aimBone(rig.torso, AXIS_UP, _tmp);
    rig.group.updateMatrixWorld(true);
    _tmp.copy(n[HEAD].p).sub(n[CHEST].p);
    aimBone(rig.head, AXIS_UP, _tmp);
    rig.group.updateMatrixWorld(true);

    // arms
    _tmp.copy(n[LELBOW].p).sub(n[LSHOULDER].p);
    aimBone(rig.leftArm, AXIS_DOWN, _tmp);
    _tmp.copy(n[RELBOW].p).sub(n[RSHOULDER].p);
    aimBone(rig.rightArm, AXIS_DOWN, _tmp);
    rig.group.updateMatrixWorld(true);
    _tmp.copy(n[LHAND].p).sub(n[LELBOW].p);
    aimBone(rig.leftElbow, AXIS_DOWN, _tmp);
    _tmp.copy(n[RHAND].p).sub(n[RELBOW].p);
    aimBone(rig.rightElbow, AXIS_DOWN, _tmp);
    rig.group.updateMatrixWorld(true);

    // legs
    _tmp.copy(n[LKNEE].p).sub(n[LHIP].p);
    aimBone(rig.leftLeg, AXIS_DOWN, _tmp);
    _tmp.copy(n[RKNEE].p).sub(n[RHIP].p);
    aimBone(rig.rightLeg, AXIS_DOWN, _tmp);
    rig.group.updateMatrixWorld(true);
    _tmp.copy(n[LFOOT].p).sub(n[LKNEE].p);
    aimBone(rig.leftKnee, AXIS_DOWN, _tmp);
    _tmp.copy(n[RFOOT].p).sub(n[RKNEE].p);
    aimBone(rig.rightKnee, AXIS_DOWN, _tmp);
    rig.group.updateMatrixWorld(true);
  }
}
