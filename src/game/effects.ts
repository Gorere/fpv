import * as THREE from "three";

function particleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
  grow: number;
  startSize: number;
  kind: "fire" | "smoke";
  positions: Float32Array;
}

interface Debris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface Tracer {
  line: THREE.Line;
  geo: THREE.BufferGeometry;
  life: number;
}

interface Burner {
  points: THREE.Points;
  positions: Float32Array;
  seeds: Float32Array;
  base: THREE.Vector3;
  time: number;
  light: THREE.PointLight;
  positionsAttr: THREE.BufferAttribute;
}

export class Effects {
  private scene: THREE.Scene;
  private texture = particleTexture();
  private bursts: Burst[] = [];
  private debris: Debris[] = [];
  private rings: Ring[] = [];
  private tracers: Tracer[] = [];
  private lights: { light: THREE.PointLight; life: number; maxLife: number; base: number }[] = [];
  private burners: Burner[] = [];
  private flashes: { sprite: THREE.Sprite; life: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private makeBurst(
    position: THREE.Vector3,
    count: number,
    color: number,
    size: number,
    speed: number,
    life: number,
    kind: "fire" | "smoke",
    spread = 1,
  ) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.25 + Math.random() * 0.9);
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * s * spread;
      velocities[i * 3 + 1] = Math.abs(Math.cos(phi)) * s * (kind === "smoke" ? 0.65 : 0.9) + (kind === "smoke" ? 1.4 : 0.6);
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * s * spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size,
      map: this.texture,
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: kind === "fire" ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.bursts.push({
      points,
      velocities,
      life,
      maxLife: life,
      gravity: kind === "smoke" ? -0.6 : 5.5,
      drag: kind === "smoke" ? 1.6 : 1.1,
      grow: kind === "smoke" ? 2.4 : 0.5,
      startSize: size,
      kind,
      positions,
    });
  }

  explosion(position: THREE.Vector3, radius: number, accent = "#e8a24f") {
    const color = new THREE.Color(accent);
    this.makeBurst(position, 90, 0xffd49a, Math.max(0.5, radius * 0.11), radius * 3.1, 0.95, "fire", 1.2);
    this.makeBurst(position, 55, 0xff8a3a, radius * 0.16, radius * 1.9, 0.7, "fire", 1.1);
    this.makeBurst(position, 50, 0x8e8b7c, Math.max(1.4, radius * 0.2), radius * 1.3, 3.6, "smoke", 1.4);
    this.makeBurst(position, 24, 0x4f4a3f, radius * 0.24, radius * 0.8, 4.8, "smoke", 1.8);
    void color;

    const light = new THREE.PointLight(0xffb46a, 420, radius * 7, 2);
    light.position.copy(position);
    this.scene.add(light);
    this.lights.push({ light, life: 0.55, maxLife: 0.55, base: 420 });

    const ringGeo = new THREE.RingGeometry(0.6, 1.1, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc5b48e,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y += 0.2;
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.9, maxLife: 0.9 });

    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x2b2b26, roughness: 0.9, metalness: 0.35 });
    for (let i = 0; i < 18; i++) {
      const geo = new THREE.DodecahedronGeometry(0.06 + Math.random() * 0.15, 0);
      const mesh = new THREE.Mesh(geo, debrisMat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 18, 3 + Math.random() * 16, (Math.random() - 0.5) * 18);
      this.debris.push({
        mesh,
        velocity,
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 2.2 + Math.random() * 1.4,
      });
    }
  }

  droneBreakup(position: THREE.Vector3) {
    this.explosion(position, 5.5, "#e8a24f");
    const mat = new THREE.MeshStandardMaterial({ color: 0x222622, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 9; i++) {
      const geo = new THREE.BoxGeometry(0.06 + Math.random() * 0.14, 0.012, 0.12 + Math.random() * 0.2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 12, 2 + Math.random() * 9, (Math.random() - 0.5) * 12),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
        life: 2.4 + Math.random(),
      });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffcf88, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(line);
    this.tracers.push({ line, geo, life: 0.075 });
    // muzzle spark
    this.makeBurst(from, 4, 0xffd49a, 0.4, 2.2, 0.15, "fire", 0.3);
  }

  muzzleFlash(position: THREE.Vector3) {
    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      color: 0xffce80,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.setScalar(1.6);
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0.07 });
  }

  dust(position: THREE.Vector3, strength = 1) {
    if (this.bursts.length > 20) return;
    this.makeBurst(position, 10, 0x9d947d, 1.1, 3.5 * strength, 1.2, "smoke", 1.8);
  }

  burner(position: THREE.Vector3) {
    if (this.burners.length >= 8) return;
    const count = 22;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const lifeSeed = Math.random();
      seeds[i * 2] = lifeSeed;
      seeds[i * 2 + 1] = 0.4 + Math.random() * 0.9;
      positions[i * 3] = position.x + (Math.random() - 0.5) * 1.6;
      positions[i * 3 + 1] = position.y + Math.random() * 6;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 1.6;
    }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    geo.setAttribute("position", attr);
    const mat = new THREE.PointsMaterial({
      size: 3.2,
      map: this.texture,
      color: 0x393a35,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    const light = new THREE.PointLight(0xff8b42, 12, 16, 2);
    light.position.copy(position).add(new THREE.Vector3(0, 1.1, 0));
    this.scene.add(light);
    this.burners.push({ points, positions, seeds, base: position.clone(), time: 0, light, positionsAttr: attr });
  }

  update(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const t = Math.max(0, b.life / b.maxLife);
      for (let p = 0; p < b.positions.length; p += 3) {
        b.velocities[p + 1] -= b.gravity * dt;
        const drag = 1 - Math.min(0.95, b.drag * dt);
        b.velocities[p] *= drag;
        b.velocities[p + 1] *= drag;
        b.velocities[p + 2] *= drag;
        b.positions[p] += b.velocities[p] * dt;
        b.positions[p + 1] += b.velocities[p + 1] * dt;
        b.positions[p + 2] += b.velocities[p + 2] * dt;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      const mat = b.points.material as THREE.PointsMaterial;
      mat.opacity = b.kind === "smoke" ? Math.min(0.6, t * 0.9) : t;
      mat.size = b.startSize * (1 + (1 - t) * b.grow);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.velocity.y -= 9.8 * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.debris.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(1 + t * 22);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.5;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      (tr.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, tr.life / 0.075);
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.geo.dispose();
        (tr.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      l.light.intensity = l.base * Math.max(0, l.life / l.maxLife);
      if (l.life <= 0) {
        this.scene.remove(l.light);
        this.lights.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (const b of this.burners) {
      b.time += dt;
      for (let p = 0; p < b.positions.length; p += 3) {
        b.positions[p + 1] += dt * (0.95 + b.seeds[p / 3 * 2 + 1]);
        b.positions[p] += Math.sin(b.time * 0.7 + b.seeds[p / 3 * 2] * 9) * dt * 0.5;
        if (b.positions[p + 1] > b.base.y + 9) {
          b.positions[p] = b.base.x + (Math.random() - 0.5) * 1.5;
          b.positions[p + 2] = b.base.z + (Math.random() - 0.5) * 1.5;
          b.positions[p + 1] = b.base.y + 0.6;
        }
      }
      b.positionsAttr.needsUpdate = true;
      b.light.intensity = 8 + Math.sin(b.time * 9.3) * 3.5;
    }
  }

  dispose() {
    this.bursts.forEach((b) => {
      this.scene.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
    });
    this.debris.forEach((d) => {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
    });
    this.rings.forEach((r) => {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    });
    this.tracers.forEach((t) => {
      this.scene.remove(t.line);
      t.geo.dispose();
      (t.line.material as THREE.Material).dispose();
    });
    this.lights.forEach((l) => this.scene.remove(l.light));
    this.flashes.forEach((f) => this.scene.remove(f.sprite));
    this.burners.forEach((b) => {
      this.scene.remove(b.points, b.light);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
    });
    this.texture.dispose();
  }
}
