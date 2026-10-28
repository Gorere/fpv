import * as THREE from "three";

/**
 * Draw-call optimiser.
 *
 * The mission scene is assembled from thousands of individually positioned
 * primitives (walls, window frames, sandbags, rubble, rig details...). On a
 * real GPU that means thousands of draw calls per frame and visible stutter.
 *
 * Two passes fix it without moving a single vertex in the final result:
 *   1. mergeStaticScene()  — bakes whole-world static meshes into one mesh per
 *      material (geometry is baked in world space, colliders already stored
 *      as world-space Box3 stay valid).
 *   2. mergeGroupMeshes()  — merges the direct mesh children of every group,
 *      keeping the group hierarchy intact so animated joints stay animated.
 *
 * The drone is never passed through either function.
 */

interface Bucket {
  material: THREE.Material;
  geometries: THREE.BufferGeometry[];
  sources: THREE.Mesh[];
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
}

const isSkippable = (o: THREE.Object3D) =>
  o instanceof THREE.InstancedMesh ||
  o instanceof THREE.Line ||
  o instanceof THREE.LineSegments ||
  o instanceof THREE.LineLoop ||
  o instanceof THREE.Points ||
  o instanceof THREE.Sprite;

function attrSignature(geo: THREE.BufferGeometry): string {
  return Object.keys(geo.attributes).sort().join(",");
}

/**
 * Materials are often created per part (PALETTE.black(), std(...) inline),
 * so keying buckets by material uuid would never merge them. Key by the
 * visual signature instead — parts with identical material parameters merge
 * and the first material instance is reused for the merged mesh.
 */
function materialSignature(m: THREE.Material): string {
  if (m instanceof THREE.MeshStandardMaterial) {
    return [
      "s",
      m.color.getHexString(),
      m.roughness,
      m.metalness,
      m.emissive.getHexString(),
      m.emissiveIntensity,
      m.map?.uuid ?? "-",
      m.normalMap?.uuid ?? "-",
      m.opacity,
      m.transparent ? 1 : 0,
      m.side,
      m.blending,
      m.depthWrite ? 1 : 0,
      m.alphaTest,
      m.flatShading ? 1 : 0,
      m.vertexColors ? 1 : 0,
    ].join("|");
  }
  if (m instanceof THREE.MeshBasicMaterial) {
    return ["b", m.color.getHexString(), m.map?.uuid ?? "-", m.opacity, m.transparent ? 1 : 0, m.side, m.blending].join("|");
  }
  if (m instanceof THREE.MeshLambertMaterial) {
    return ["l", m.color.getHexString(), m.opacity, m.transparent ? 1 : 0, m.side].join("|");
  }
  return `u${m.uuid}`; // unknown type: never merge
}

function bucketKey(m: THREE.Mesh): string | null {
  if (Array.isArray(m.material)) return null;
  if (m.userData.noMerge) return null;
  if (!m.geometry.getAttribute("position")) return null;
  // detail meshes stay in their own bucket so they can be distance-hidden
  const detail = m.userData.detail ? 1 : 0;
  return `${materialSignature(m.material as THREE.Material)}|${attrSignature(m.geometry)}|${m.geometry.index ? 1 : 0}|${m.renderOrder}|d${detail}`;
}

/** Concatenates geometries sharing the same attributes and index format. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  const names = Object.keys(list[0].attributes).sort();
  const indexed = Boolean(list[0].index);
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    if (indexed) indexCount += g.index ? g.index.count : 0;
  }

  const out = new THREE.BufferGeometry();
  const buffers: Record<string, Float32Array> = {};
  const sizes: Record<string, number> = {};
  for (const name of names) {
    const size = list[0].getAttribute(name).itemSize;
    buffers[name] = new Float32Array(vertexCount * size);
    sizes[name] = size;
  }
  const indices = indexed ? new Uint32Array(indexCount) : null;
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const g of list) {
    const count = g.attributes.position.count;
    for (const name of names) {
      const src = g.getAttribute(name);
      if (src && src.itemSize === sizes[name]) {
        buffers[name].set(src.array as Float32Array, vertexOffset * sizes[name]);
      }
    }
    if (indexed && indices && g.index) {
      for (let i = 0; i < g.index.count; i++) indices[indexOffset + i] = g.index.getX(i) + vertexOffset;
      indexOffset += g.index.count;
    }
    vertexOffset += count;
  }
  for (const name of names) out.setAttribute(name, new THREE.BufferAttribute(buffers[name], sizes[name]));
  if (indices) out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
}

function flush(buckets: Map<string, Bucket>, target: THREE.Object3D, worldSpace: boolean) {
  for (const bucket of buckets.values()) {
    if (bucket.sources.length < 2) continue;
    const merged = mergeGeometries(bucket.geometries);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    mesh.renderOrder = bucket.renderOrder;
    if (bucket.sources[0].userData.detail) mesh.userData.detail = true;
    for (const src of bucket.sources) src.parent?.remove(src);
    target.add(mesh);
  }
  void worldSpace;
}

function bucketOf(
  obj: THREE.Object3D,
  matrix: THREE.Matrix4,
  buckets: Map<string, Bucket>,
) {
  if (isSkippable(obj) || !(obj instanceof THREE.Mesh)) return;
  const key = bucketKey(obj);
  if (!key) return;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      material: obj.material as THREE.Material,
      geometries: [],
      sources: [],
      castShadow: false,
      receiveShadow: false,
      renderOrder: obj.renderOrder,
    };
    buckets.set(key, bucket);
  }
  const geo = obj.geometry.clone();
  geo.applyMatrix4(matrix);
  bucket.geometries.push(geo);
  bucket.sources.push(obj);
  bucket.castShadow = bucket.castShadow || obj.castShadow;
  bucket.receiveShadow = bucket.receiveShadow || obj.receiveShadow;
}

/**
 * Bakes every static mesh of the scene (walls, window frames, sandbags,
 * rubble, props, wrecks...) into one mesh per material. Run once right after
 * world creation — colliders are already world-space Box3 and geometry is
 * baked with the same matrix, so nothing physically moves.
 */
export function mergeStaticScene(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const buckets = new Map<string, Bucket>();
  const walk = (obj: THREE.Object3D) => {
    if (isSkippable(obj)) return; // instanced/line/point objects stay as-is
    bucketOf(obj, obj.matrixWorld, buckets);
    for (const child of obj.children) walk(child);
  };
  for (const child of [...scene.children]) walk(child);
  flush(buckets, scene, true);
}

/**
 * Merges only the direct mesh children of every group in the tree,
 * recursing group-by-group. Nested groups (animated joints: knees, arms,
 * wheels, turrets) are never crossed, so all animation keeps working while
 * each group drops to a handful of draws.
 */
export function mergeGroupMeshes(root: THREE.Object3D) {
  // Local matrices must be composed from position/quaternion/scale before we
  // bake geometry with them — freshly built rigs have never been rendered, so
  // their `matrix` fields are still identity.
  root.updateMatrixWorld(true);
  const visit = (obj: THREE.Object3D) => {
    const buckets = new Map<string, Bucket>();
    for (const child of obj.children) bucketOf(child, child.matrix, buckets);
    flush(buckets, obj, false);
    for (const child of [...obj.children]) {
      if (child instanceof THREE.Group) visit(child);
    }
  };
  visit(root);
}

/**
 * Bakes the entire subtree of `root` into meshes directly under `root`,
 * keeping only the subtrees listed in `exclude` (rotating turrets, spinning
 * barrels, animated joints...). Non-mesh objects (e.g. muzzle markers) stay
 * where they are. One vehicle body ends up as a handful of draws instead of
 * a hundred while looking and behaving exactly the same.
 */
export function mergeStaticSubtree(root: THREE.Object3D, exclude: THREE.Object3D[] = []) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const excluded = new Set(exclude);
  const buckets = new Map<string, Bucket>();
  const walk = (obj: THREE.Object3D) => {
    if (excluded.has(obj)) return;
    if (!isSkippable(obj) && obj instanceof THREE.Mesh) {
      bucketOf(obj, rootInv.clone().multiply(obj.matrixWorld), buckets);
    }
    for (const child of obj.children) walk(child);
  };
  walk(root);
  flush(buckets, root, false);
}
