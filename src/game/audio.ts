import explosionUrl from "../assets/audio/explosion.mp3";
import explosionDirtUrl from "../assets/audio/explosion_dirt.mp3";
import engineTruckUrl from "../assets/audio/engine_truck.mp3";
import engineArmorUrl from "../assets/audio/engine_armor.mp3";
import dronePropsUrl from "../assets/audio/drone_props.mp3";
import gunshotRifleUrl from "../assets/audio/gunshot_rifle.mp3";
import gunshotHeavyUrl from "../assets/audio/gunshot_heavy.mp3";

/**
 * Mission audio.
 *
 * Explosions, diesel engines and the quad's props are real field recordings
 * (public-domain / royalty-free samples, see src/assets/audio/SOURCES.md);
 * everything the samples cannot express — airflow, motor whine, gunfire,
 * UI beeps — is still synthesised. If a sample fails to decode the matching
 * synth voice takes over, so the sim is never silent.
 *
 * Initialised on a user gesture (browser autoplay policy).
 */

export interface AudioVehicle {
  x: number;
  y: number;
  z: number;
  speed: number;
  alive: boolean;
  armor: boolean;
}

/** Which weapon fired. Soldiers carry rifles; the BTR carries a heavy MG. */
export type GunKind = "rifle" | "heavy";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface VehicleVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  /** cached smoothed value so we do not spam setTargetAtTime */
  lastGain: number;
  lastCut: number;
}

interface DroneVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

const MAX_VEHICLE_DIST = 165;
const VEHICLE_REF_DIST = 5;

/**
 * Gunfire acoustics. A rifle at arm's length is brutal, at 150 m it is a faint
 * click in the grass — so the mix is driven by inverse-distance attenuation
 * plus air absorption, not by a flat sample playback.
 */
const GUN_REF_DIST = 6;
const GUN_MAX_DIST = 340;
/** Speed of sound in air, m/s: distant shots arrive late, like in real life. */
const SOUND_SPEED = 343;
const MAX_CONCURRENT_SHOTS = 18;

export class SimAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rotorGain: GainNode | null = null;
  private rotorOsc: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private whineOsc: OscillatorNode | null = null;
  private windGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

  private buffers: {
    explosion?: AudioBuffer;
    dirt?: AudioBuffer;
    truck?: AudioBuffer;
    armor?: AudioBuffer;
    props?: AudioBuffer;
    rifle?: AudioBuffer;
    heavy?: AudioBuffer;
  } = {};
  private loading = false;
  private loadedCount = 0;
  private droneVoice: DroneVoice | null = null;
  private vehicleVoices: VehicleVoice[] = [];
  /** listener pose, refreshed every frame from the camera */
  private listener = { x: 0, y: 0, z: 0 };
  private right = { x: 1, y: 0, z: 0 };
  private activeShots = 0;

  private muted = false;
  private started = false;

  init() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(ctx.destination);

      // Rotary fallback: a filtered saw that only speaks while the prop sample
      // has not loaded yet (or if decoding fails).
      this.rotorGain = ctx.createGain();
      this.rotorGain.gain.value = 0.0001;
      const rotorFilter = ctx.createBiquadFilter();
      rotorFilter.type = "lowpass";
      rotorFilter.frequency.value = 750;
      this.rotorOsc = ctx.createOscillator();
      this.rotorOsc.type = "sawtooth";
      this.rotorOsc.frequency.value = 88;
      this.rotorOsc.connect(this.rotorGain);
      this.rotorGain.connect(rotorFilter);
      rotorFilter.connect(this.master);
      this.rotorOsc.start();

      // Motor whine: four ESCs, always present on a real quad.
      this.whineGain = ctx.createGain();
      this.whineGain.gain.value = 0.0001;
      this.whineOsc = ctx.createOscillator();
      this.whineOsc.type = "triangle";
      this.whineOsc.frequency.value = 940;
      this.whineOsc.connect(this.whineGain);
      this.whineGain.connect(this.master);
      this.whineOsc.start();

      // Airflow over the frame and props.
      const buffer = this.makeNoiseBuffer(3);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      this.noiseSource = source;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 520;
      filter.Q.value = 0.7;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.0001;
      source.connect(filter);
      filter.connect(this.windGain);
      this.windGain.connect(this.master);
      source.start();

      this.started = true;
      void this.loadSamples();
    } catch {
      this.ctx = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Sample loading                                                     */
  /* ------------------------------------------------------------------ */

  private async loadSamples() {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    const decode = async (url: string) => {
      const res = await fetch(url);
      const bytes = await res.arrayBuffer();
      return await ctx.decodeAudioData(bytes);
    };
    const jobs: Array<Promise<void>> = [
      decode(explosionUrl).then((b) => void (this.buffers.explosion = b)),
      decode(explosionDirtUrl).then((b) => void (this.buffers.dirt = b)),
      decode(engineTruckUrl).then((b) => void (this.buffers.truck = b)),
      decode(engineArmorUrl).then((b) => void (this.buffers.armor = b)),
      decode(dronePropsUrl).then((b) => void (this.buffers.props = b)),
      decode(gunshotRifleUrl).then((b) => void (this.buffers.rifle = b)),
      decode(gunshotHeavyUrl).then((b) => void (this.buffers.heavy = b)),
    ];
    await Promise.all(
      jobs.map((job) =>
        job.then(
          () => {
            this.loadedCount++;
          },
          () => {
            /* keep the synth fallback for this voice */
          },
        ),
      ),
    );
    this.loading = false;
    this.startDroneVoice();
  }

  private startDroneVoice() {
    const ctx = this.ctx;
    const buffer = this.buffers.props;
    if (!ctx || !this.master || !buffer || this.droneVoice) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 7200;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.droneVoice = { src, gain, filter };
  }

  private makeNoiseBuffer(seconds: number) {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /* ------------------------------------------------------------------ */
  /*  Drone                                                              */
  /* ------------------------------------------------------------------ */

  updateThrottle(throttle: number, speed: number, battery: number) {
    if (!this.ctx || !this.rotorGain || !this.rotorOsc || !this.whineGain || !this.whineOsc) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const hasPower = battery > 0 && throttle > 0.02;
    const airborne = speed > 1.5 || throttle > 0.02;

    // Real prop recording carries the body of the sound; the synth saw only
    // fills in until it loads, so it is kept well under the sample.
    const hasSample = !!this.droneVoice;
    const rotorLevel = hasSample ? 0.0001 : hasPower ? 0.015 + throttle * 0.22 : 0.0001;
    const whineLevel = hasPower ? 0.0035 + throttle * 0.02 : 0.0001;

    this.rotorGain.gain.setTargetAtTime(rotorLevel, t, 0.05);
    this.whineGain.gain.setTargetAtTime(whineLevel, t, 0.05);
    this.rotorOsc.frequency.setTargetAtTime(70 + throttle * 150, t, 0.06);
    this.whineOsc.frequency.setTargetAtTime(700 + throttle * 1500 + speed * 6, t, 0.06);

    if (this.windGain) {
      const windLevel = 0.002 + Math.min(speed / 45, 1) * 0.05 + throttle * 0.012;
      this.windGain.gain.setTargetAtTime(windLevel, t, 0.1);
    }

    if (this.droneVoice) {
      // Prop rpm follows throttle and airspeed: the faster it flies, the more
      // the blade tips scream.
      const rate = 0.86 + throttle * 0.22 + Math.min(speed / 60, 1) * 0.14;
      const level = !hasPower
        ? airborne
          ? 0.1 // windmilling props while falling
          : 0.0001
        : 0.2 + throttle * 0.3;
      this.droneVoice.src.playbackRate.setTargetAtTime(rate, t, 0.12);
      this.droneVoice.gain.gain.setTargetAtTime(level, t, 0.07);
      this.droneVoice.filter.frequency.setTargetAtTime(4200 + throttle * 5200, t, 0.1);
    }
  }

  silenceRotor() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rotorGain?.gain.setTargetAtTime(0.0001, t, 0.15);
    this.whineGain?.gain.setTargetAtTime(0.0001, t, 0.15);
    this.windGain?.gain.setTargetAtTime(0.0001, t, 0.2);
    this.droneVoice?.gain.gain.setTargetAtTime(0.0001, t, 0.12);
  }

  /* ------------------------------------------------------------------ */
  /*  Vehicles                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Mixes every engine loop against the listener.
   *
   * @param origin listener position (usually the drone camera)
   * @param right  listener right vector, for stereo placement
   */
  updateVehicles(origin: Vec3, right: Vec3, vehicles: AudioVehicle[]) {
    this.listener.x = origin.x;
    this.listener.y = origin.y;
    this.listener.z = origin.z;
    this.right.x = right.x;
    this.right.y = right.y;
    this.right.z = right.z;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      let voice = this.vehicleVoices[i];
      if (!voice) {
        const buffer = v.armor ? this.buffers.armor : this.buffers.truck;
        if (!buffer) continue; // sample not ready yet
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.playbackRate.value = v.armor ? 0.9 : 1;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 20000;
        const pan = ctx.createStereoPanner();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        src.connect(filter).connect(pan).connect(gain).connect(this.master);
        src.start(ctx.currentTime + i * 0.11);
        voice = { src, gain, filter, pan, lastGain: -1, lastCut: -1 };
        this.vehicleVoices[i] = voice;
      }

      if (!v.alive) {
        if (voice.lastGain !== 0) {
          voice.gain.gain.setTargetAtTime(0.0001, t, 0.08);
          voice.lastGain = 0;
        }
        continue;
      }

      const dx = v.x - origin.x;
      const dy = v.y - origin.y;
      const dz = v.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > MAX_VEHICLE_DIST) {
        if (voice.lastGain !== 0) {
          voice.gain.gain.setTargetAtTime(0.0001, t, 0.2);
          voice.lastGain = 0;
        }
        continue;
      }

      // Inverse-distance rolloff, then a gentle low-pass so far engines lose
      // their top end like real air absorption.
      const near = VEHICLE_REF_DIST / Math.max(dist, VEHICLE_REF_DIST);
      const gain = Math.pow(near, 0.85) * (v.armor ? 0.34 : 0.4);
      const cut = 380 + 17000 * Math.pow(near, 2.2);

      const inv = 1 / Math.max(dist, 0.001);
      const side = (dx * right.x + dy * right.y + dz * right.z) * inv;
      voice.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, side * 0.9)), t, 0.08);

      if (Math.abs(gain - voice.lastGain) > 0.004 || voice.lastGain < 0) {
        voice.gain.gain.setTargetAtTime(gain, t, 0.1);
        voice.lastGain = gain;
      }
      if (Math.abs(cut - voice.lastCut) > 200) {
        voice.filter.frequency.setTargetAtTime(cut, t, 0.15);
        voice.lastCut = cut;
      }
      // A loaded truck works harder than an idling one.
      voice.src.playbackRate.setTargetAtTime(
        0.82 + Math.min(v.speed / 8, 1) * 0.3 + (v.armor ? 0.04 : 0),
        t,
        0.25,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  One-shots                                                          */
  /* ------------------------------------------------------------------ */

  explosion() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const blast = this.buffers.explosion;

    if (blast) {
      const src = ctx.createBufferSource();
      src.buffer = blast;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain).connect(this.master);
      src.start(now);
    } else {
      this.synthExplosion();
    }

    // Dirt and casing rain, slightly behind the blast.
    const dirt = this.buffers.dirt;
    if (dirt) {
      const src = ctx.createBufferSource();
      src.buffer = dirt;
      const gain = ctx.createGain();
      gain.gain.value = 0.55;
      src.connect(gain).connect(this.master);
      src.start(now + 0.06);
    }

    // Chest thump: the recordings are band-limited, real blasts are not.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(96, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 1.15);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    sub.connect(subGain).connect(this.master);
    sub.start(now);
    sub.stop(now + 1.6);
  }

  private synthExplosion() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer(2.4);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 1.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.85, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(now);
    noise.stop(now + 2.2);
  }

  /**
   * One round fired at `origin` (world space).
   *
   * Distance does three things at once, the way it does outdoors: the report
   * gets quieter, loses its high end, and arrives late. A rifle 150 m away is
   * a muffled click 0.44 s after the muzzle flash, not a flat "bang".
   */
  shot(origin: Vec3, kind: GunKind = "rifle") {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const buffer = kind === "heavy" ? this.buffers.heavy : this.buffers.rifle;
    if (!buffer) {
      this.synthShot(kind);
      return;
    }
    if (this.activeShots >= MAX_CONCURRENT_SHOTS) return;

    const dx = origin.x - this.listener.x;
    const dy = origin.y - this.listener.y;
    const dz = origin.z - this.listener.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 1/d rolloff with a small near-field offset so a shot next to the drone
    // does not blow the mix apart.
    const near = GUN_REF_DIST / (dist + GUN_REF_DIST * 0.35);
    const level = Math.pow(near, 1.15) * (kind === "heavy" ? 0.9 : 0.62);
    if (level < 0.004 || dist > GUN_MAX_DIST) return;

    const now = ctx.currentTime + Math.min(1.2, dist / SOUND_SPEED);
    const inv = 1 / Math.max(dist, 0.001);
    const side = (dx * this.right.x + dy * this.right.y + dz * this.right.z) * inv;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Slight random detune keeps repeated bursts from sounding like a loop.
    src.playbackRate.value = 0.97 + Math.random() * 0.06;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900 + 15000 * Math.pow(near, 1.8);

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.9, Math.min(0.9, side * 0.85));

    const gain = ctx.createGain();
    gain.gain.value = level;

    src.connect(filter).connect(pan).connect(gain).connect(this.master);
    src.start(now);

    this.activeShots++;
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      pan.disconnect();
      gain.disconnect();
      this.activeShots = Math.max(0, this.activeShots - 1);
    };
  }

  /** Last-resort click if the recordings failed to decode. */
  private synthShot(kind: GunKind) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(0.09);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = kind === "heavy" ? 300 : 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(kind === "heavy" ? 0.2 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "heavy" ? 0.16 : 0.09));
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 0.2);
  }

  hit() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  beep(freq = 720) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  dispose() {
    this.silenceRotor();
    try {
      this.rotorOsc?.stop();
      this.whineOsc?.stop();
      this.noiseSource?.stop();
      this.droneVoice?.src.stop();
      for (const v of this.vehicleVoices) {
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
      }
      this.vehicleVoices = [];
      this.droneVoice = null;
      this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.started = false;
    this.loading = false;
    this.loadedCount = 0;
    this.activeShots = 0;
    this.buffers = {};
  }
}
