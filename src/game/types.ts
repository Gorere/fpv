export type WarheadId = "pg7vl" | "pg7vr" | "tbg7v";

export interface WarheadSpec {
  label: string;
  value: string;
}

export interface Warhead {
  id: WarheadId;
  index: string;
  name: string;
  fullName: string;
  designation: string;
  class: string;
  massKg: number;
  caliberMm: number;
  blastRadius: number;
  armorPower: number;
  speedFactor: number;
  batteryPenalty: number;
  accent: string;
  description: string;
  effect: string;
  specs: WarheadSpec[];
  bars: { speed: number; blast: number; armor: number; control: number };
}

export type SimMode = "standby" | "flight" | "landed" | "ghost";

export interface MapTarget {
  id: string;
  kind: "soldier" | "truck" | "armor";
  x: number;
  z: number;
  alive: boolean;
}

export interface HudEvent {
  id: number;
  text: string;
  level: "info" | "warn" | "hit";
}

export interface HudData {
  mode: SimMode;
  battery: number;
  voltage: number;
  throttle: number;
  speed: number;
  verticalSpeed: number;
  altitude: number;
  agl: number;
  heading: number;
  pitch: number;
  roll: number;
  rssi: number;
  flightTime: number;
  distance: number;
  soldiersLeft: number;
  soldiersTotal: number;
  vehiclesLeft: number;
  vehiclesTotal: number;
  kills: number;
  droneX: number;
  droneZ: number;
  lastImpact: { x: number; z: number } | null;
  targets: MapTarget[];
  events: HudEvent[];
  warhead: WarheadId;
  landed: boolean;
  totalMissionTime: number;
  damage: number;
  onGround: boolean;
  acro: boolean;
  stickX: number;
  stickY: number;
  locked: boolean;
  signalLost: boolean;
}

export interface DebriefData {
  cause: string;
  targetName: string;
  soldiersDestroyed: number;
  vehiclesDestroyed: number;
  soldiersTotal: number;
  vehiclesTotal: number;
  flightTime: number;
  targetsRemaining: number;
  warhead: WarheadId;
  missionComplete: boolean;
  impact: { x: number; z: number };
}

export interface SimSettings {
  invertPitch: boolean;
  sensitivity: number;
  muted: boolean;
}

export interface FlightHistory {
  id: number;
  cause: string;
  targetName: string;
  soldiersDestroyed: number;
  vehiclesDestroyed: number;
  flightTime: number;
  warhead: WarheadId;
}
