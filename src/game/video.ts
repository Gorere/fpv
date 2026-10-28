import * as THREE from "three";

/**
 * Camera post-processing.
 *
 * Two effects share one pass:
 *
 * 1. **Analogue FPV link** — the drone feed is rendered into a slightly
 *    downscaled target and pushed through a shader that imitates a cheap
 *    5.8 GHz camera: soft focus, a touch of chromatic fringing, sensor grain,
 *    line jitter, scanlines and a mild vignette.
 * 2. **Head anonymisation** — every soldier's head is blurred in screen space.
 *    The pass receives the projected head centres and paints a mosaic blur
 *    over each one, masked by scene depth so the patch never bleeds onto a
 *    wall in front of the soldier. Because it is part of the image, the blur
 *    tracks the head from any angle and in any mode.
 */

export interface HeadMarker {
  /** centre in screen uv (0..1) */
  u: number;
  v: number;
  /** radius as a fraction of the viewport height */
  r: number;
  /** camera-space distance of the head centre, metres */
  dist: number;
}

const MAX_HEADS = 48;
/** Resolution of the low-res feed while flying. */
const FPV_SCALE = 0.55;
const FPV_MAX_WIDTH = 900;

export class FpvVideo {
  private target: THREE.WebGLRenderTarget;
  private depthTexture: THREE.DepthTexture;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  private heads = new Float32Array(MAX_HEADS * 4);
  private cssWidth = 640;
  private cssHeight = 360;
  private fpv = true;

  constructor() {
    this.depthTexture = new THREE.DepthTexture(640, 360);
    this.target = new THREE.WebGLRenderTarget(640, 360, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
      depthTexture: this.depthTexture,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        tDepth: { value: this.depthTexture },
        uResolution: { value: new THREE.Vector2(640, 360) },
        uTime: { value: 0 },
        uFpv: { value: 1 },
        uNear: { value: 0.1 },
        uFar: { value: 900 },
        uHeads: { value: this.heads },
        uHeadCount: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uFpv;
        uniform float uNear;
        uniform float uFar;
        uniform int uHeadCount;
        uniform vec4 uHeads[48];
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        /** Perspective depth buffer value -> distance along the view axis. */
        float linearDepth(float d) {
          float ndc = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
        }

        /** Pixelated privacy patch.
         *
         *  Samples the 3x3 block neighbourhood around the pixel instead of a
         *  radial kernel: the head turns into coarse square tiles with hard
         *  edges, like a mosaic censor patch. Every tap is clamped to a disc
         *  slightly smaller than the head so the patch never drags sky or
         *  foliage in at the silhouette. */
        vec3 mosaicPatch(vec2 uv, float blockPx, vec2 centre, float radiusPx) {
          vec2 cell = floor(uv * uResolution / blockPx);
          float lim = radiusPx * 0.74;
          vec3 sum = vec3(0.0);
          float wsum = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              float w = (x == 0 && y == 0) ? 2.6 : 1.0;
              vec2 p = (cell + vec2(float(x), float(y)) + 0.5) * blockPx;
              vec2 rel = clamp(p - centre, vec2(-lim), vec2(lim));
              sum += texture2D(tDiffuse, (centre + rel) / uResolution).rgb * w;
              wsum += w;
            }
          }
          return sum / wsum;
        }

        void main() {
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);

          // Cheap plastic lens: slight barrel distortion.
          vec2 uv = 0.5 + c * (1.0 + (0.05 * r2 + 0.02 * r2 * r2) * uFpv);

          // Line-to-line timing jitter and the odd torn band.
          float line = floor(uv.y * uResolution.y * 0.6);
          float jitter = (hash(vec2(line, floor(uTime * 26.0))) - 0.5) * 0.0014 * uFpv;
          float band = step(0.994, hash(vec2(floor(uv.y * 26.0), floor(uTime * 4.0))));
          uv.x += jitter + band * (hash(vec2(floor(uTime * 4.0), 7.3)) - 0.5) * 0.012 * uFpv;

          vec2 dir = normalize(c + vec2(1e-5));
          float ca = (0.0013 + r2 * 0.0065) * uFpv;
          vec3 col;
          col.r = texture2D(tDiffuse, uv + dir * ca).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - dir * ca).b;

          // Soft focus: wide, slightly smeared kernel.
          vec2 px = 1.0 / uResolution;
          vec3 soft = col * 0.30;
          soft += texture2D(tDiffuse, uv + vec2(px.x * 1.7, 0.0)).rgb * 0.12;
          soft += texture2D(tDiffuse, uv - vec2(px.x * 1.7, 0.0)).rgb * 0.12;
          soft += texture2D(tDiffuse, uv + vec2(0.0, px.y * 1.7)).rgb * 0.12;
          soft += texture2D(tDiffuse, uv - vec2(0.0, px.y * 1.7)).rgb * 0.12;
          soft += texture2D(tDiffuse, uv + px * 3.0).rgb * 0.11;
          soft += texture2D(tDiffuse, uv - px * 3.0).rgb * 0.11;
          col = mix(col, soft, 0.68 * uFpv);

          /* ---------------- head anonymisation ---------------- */
          // One depth fetch per pixel; the per-head gate uses the same value.
          float sceneDist = linearDepth(texture2D(tDepth, uv).x);
          for (int i = 0; i < 48; i++) {
            if (i >= uHeadCount) break;
            vec4 h = uHeads[i];
            // Same lens warp as above, applied to the head centre.
            vec2 hc0 = h.xy - 0.5;
            float hr2 = dot(hc0, hc0);
            vec2 hc = 0.5 + hc0 * (1.0 + (0.05 + 0.02 * hr2) * hr2 * uFpv);

            vec2 dpx = (uv - hc) * uResolution;
            float rp = h.z * uResolution.y;
            if (rp < 1.5) continue;
            float d = length(dpx) / rp;
            if (d > 1.0) continue;

            // Skip anything that is in front of the head (a wall, a crate):
            // the head is at h.w, so nearer geometry must stay sharp.
            float gate = smoothstep(h.w - 1.1, h.w - 0.45, sceneDist);
            if (gate <= 0.001) continue;

            float blockPx = max(2.5, rp * 0.24);
            vec3 censored = mosaicPatch(uv, blockPx, hc * uResolution, rp);
            float mask = smoothstep(1.0, 0.93, d) * gate;
            col = mix(col, censored, mask);
          }

          // Sensor noise, stronger in the shadows like a real CMOS feed.
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          float grain = hash(uv * uResolution + fract(uTime) * 137.0) - 0.5;
          col += grain * (0.062 + 0.075 * (1.0 - clamp(luma, 0.0, 1.0))) * uFpv;

          // Fine scanlines.
          col *= 1.0 - (0.05 - 0.05 * sin(uv.y * uResolution.y * 3.14159)) * uFpv;

          // Washed-out, slightly cool analogue colour.
          luma = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(luma), col, 1.0 - 0.18 * uFpv);
          col *= mix(vec3(1.0), vec3(0.985, 1.0, 1.03), uFpv);
          col = (col - 0.5) * (1.0 + 0.07 * uFpv) + 0.5;

          // Heavy lens vignette + darkened corners.
          float vig = smoothstep(1.0, 0.32, length(c) * 1.18);
          col *= mix(1.0, mix(0.62, 1.03, vig), uFpv);

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(geo, this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /** Feeds the projected heads for this frame (max 48). */
  setHeads(markers: HeadMarker[]) {
    const count = Math.min(markers.length, MAX_HEADS);
    const data = this.heads;
    for (let i = 0; i < count; i++) {
      const m = markers[i];
      const o = i * 4;
      data[o] = m.u;
      data[o + 1] = m.v;
      data[o + 2] = m.r;
      data[o + 3] = m.dist;
    }
    this.material.uniforms.uHeadCount.value = count;
  }

  /** Feed the CSS pixel size of the canvas; the feed itself is low-res. */
  setSize(width: number, height: number) {
    this.cssWidth = width;
    this.cssHeight = height;
    this.applySize();
  }

  private applySize() {
    const width = this.cssWidth;
    const height = this.cssHeight;
    const targetWidth = this.fpv
      ? Math.max(320, Math.min(FPV_MAX_WIDTH, Math.round(width * FPV_SCALE)))
      : Math.max(320, Math.round(width));
    const targetHeight = Math.max(
      200,
      Math.round((targetWidth * height) / Math.max(1, width)),
    );
    this.target.setSize(targetWidth, targetHeight);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(targetWidth, targetHeight);
  }

  /**
   * @param fpv true while the drone camera is flying: applies the link
   *            degradation. Ghost / hangar views stay sharp but keep the head
   *            blurring.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    time: number,
    fpv: boolean,
  ) {
    if (fpv !== this.fpv) {
      this.fpv = fpv;
      this.applySize();
    }
    this.material.uniforms.uFpv.value = fpv ? 1 : 0;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uNear.value = camera.near;
    this.material.uniforms.uFar.value = camera.far;

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.dispose();
    this.depthTexture.dispose();
    this.material.dispose();
    this.quadScene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
