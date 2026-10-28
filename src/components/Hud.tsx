import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronRight,
  Eye,
  Keyboard,
  MousePointer2,
  Pause,
  Power,
  RotateCcw,
  Shield,
  Skull,
  Target,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { getWarhead, WARHEADS } from "@/game/warheads";
import type { DebriefData, HudData, SimSettings, WarheadId } from "@/game/types";
import { WarheadGlyph } from "./ui";

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return {
    mm: String(Math.floor(s / 60)).padStart(2, "0"),
    ss: String(s % 60).padStart(2, "0"),
  };
}

/* ------------------------------------------------------------------ */
/*  Compass strip                                                      */
/* ------------------------------------------------------------------ */

function CompassStrip({ heading }: { heading: number }) {
  const ticks: number[] = [];
  const start = Math.ceil((heading - 80) / 5) * 5;
  for (let a = start; a <= heading + 80; a += 5) ticks.push(a);
  const label = (angle: number) => {
    const n = ((angle % 360) + 360) % 360;
    if (n === 0) return "N";
    if (n === 90) return "E";
    if (n === 180) return "S";
    if (n === 270) return "W";
    return `${Math.round(n)}`;
  };
  return (
    <div className="relative h-[30px] w-[240px] overflow-hidden sm:w-[300px]">
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
        <div
          className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white"
          style={{ filter: "drop-shadow(0 1px 0 #000)" }}
        />
      </div>
      {ticks.map((angle) => {
        const x = 50 + (angle - heading) * 1.9;
        if (x < 1 || x > 99) return null;
        const major = angle % 15 === 0;
        return (
          <div key={angle} className="absolute top-[7px] -translate-x-1/2" style={{ left: `${x}%` }}>
            <div className={cn("mx-auto w-px", major ? "h-[7px] bg-white/90" : "h-[4px] bg-white/40")} />
            {major && (
              <span
                className={cn(
                  "absolute left-1/2 top-[9px] -translate-x-1/2 text-[10px]",
                  Math.abs(angle - heading) < 8 ? "osd" : "osd-dim",
                )}
              >
                {label(angle)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tactical map                                                       */
/* ------------------------------------------------------------------ */

const mapX = (x: number) => 50 + x * 0.335;
const mapY = (z: number) => 96 + z * 0.29;

export function TacticalMap({ hud, className }: { hud: HudData; className?: string }) {
  const triangle = `M0,-4 L3.4,3.4 L0,1.6 L-3.4,3.4 Z`;
  return (
    <svg viewBox="0 0 240 188" className={cn("block h-full w-full", className)}>
      <defs>
        <linearGradient id="tacbg" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#17191b" />
          <stop offset="1" stopColor="#0c0d0e" />
        </linearGradient>
        <pattern id="tacgrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0v20" stroke="#33373b" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect width="240" height="188" fill="url(#tacbg)" />
      <rect width="240" height="188" fill="url(#tacgrid)" opacity=".8" />
      {/* forest belt */}
      <rect x="4" y="58" width="232" height="30" fill="#24282b" opacity=".85" />
      <g fill="#4a4f54">
        {Array.from({ length: 24 }).map((_, i) => (
          <path key={i} d={`M${8 + i * 9.6} ${62 + (i % 3) * 5}l2.4-5 2.4 5z`} />
        ))}
      </g>
      {/* road */}
      <path
        d={`M2 ${mapY(62)} C60 ${mapY(56)} 90 ${mapY(40)} 130 ${mapY(38)} S200 ${mapY(40)} 238 ${mapY(46)}`}
        stroke="#4f5256"
        strokeWidth="4"
        fill="none"
      />
      <path
        d={`M2 ${mapY(62)} C60 ${mapY(56)} 90 ${mapY(40)} 130 ${mapY(38)} S200 ${mapY(40)} 238 ${mapY(46)}`}
        stroke="#9aa0a6"
        strokeWidth=".7"
        strokeDasharray="3 3"
        fill="none"
        opacity=".6"
      />
      {/* building */}
      <g transform={`translate(${mapX(34)} ${mapY(-24)}) rotate(-13)`}>
        <rect x="-6" y="-4" width="12" height="8" fill="#9aa0a6" fillOpacity=".25" stroke="#c8cdd2" strokeWidth=".7" />
        <path d="M-6 0h12M0-4v8" stroke="#0d0e10" strokeWidth=".7" />
      </g>
      <text x={mapX(34) + 8} y={mapY(-24) + 2} fill="#9aa0a6" fontSize="5.4" fontFamily="monospace">
        ЛИМАН-4
      </text>
      {/* base */}
      <g transform={`translate(${mapX(-128)} ${mapY(120)})`}>
        <circle r="6" fill="none" stroke="#e9ebee" strokeWidth=".7" strokeDasharray="1.5 1.5" />
        <path d="M-3 0h6M0-3v6" stroke="#e9ebee" strokeWidth=".7" />
        <text x="8" y="1.5" fill="#c9ced3" fontSize="5.4" fontFamily="monospace">
          ПУСК
        </text>
      </g>
      {/* targets */}
      {hud.targets.map((t) =>
        t.alive ? (
          t.kind === "soldier" ? (
            <circle key={t.id} cx={mapX(t.x)} cy={mapY(t.z)} r="1.35" fill="#d8bb92" fillOpacity=".92" />
          ) : (
            <rect
              key={t.id}
              x={mapX(t.x) - (t.kind === "armor" ? 2.2 : 1.7)}
              y={mapY(t.z) - (t.kind === "armor" ? 2.2 : 1.7)}
              width={t.kind === "armor" ? 4.4 : 3.4}
              height={t.kind === "armor" ? 4.4 : 3.4}
              fill={t.kind === "armor" ? "#cf8f79" : "#bfc4c9"}
              stroke="#0c0d0e"
              strokeWidth=".5"
            />
          )
        ) : (
          <circle key={t.id} cx={mapX(t.x)} cy={mapY(t.z)} r=".9" fill="#4a4f54" />
        ),
      )}
      {/* impact */}
      {hud.lastImpact && (
        <g transform={`translate(${mapX(hud.lastImpact.x)} ${mapY(hud.lastImpact.z)})`} stroke="#cf8f79">
          <circle r="4" fill="none" strokeWidth=".8" strokeDasharray="2 1.5" />
          <path d="M-6 0h12M0-6v12" strokeWidth=".7" />
          <circle r="1.2" fill="#cf8f79" />
        </g>
      )}
      {/* drone */}
      {hud.mode !== "ghost" && hud.mode !== "standby" && (
        <g transform={`translate(${mapX(hud.droneX)} ${mapY(hud.droneZ)}) rotate(${hud.heading})`}>
          <path d={triangle} fill="#e9ebee" transform="scale(1.25)" />
          <circle r="7" fill="none" stroke="#e9ebee" strokeWidth=".4" opacity=".35" />
        </g>
      )}
      <g stroke="#e9ebee" strokeWidth=".7" fill="none" opacity=".45">
        <path d="M0 0l5 0M0 0l0 5M240 0l-5 0M240 0l0 5M0 188l5 0M0 188l0-5M240 188l-5 0M240 188l0-5" />
      </g>
      <text x="6" y="10" fill="#8a9096" fontSize="5.4" fontFamily="monospace">
        ТАКТ. КАРТА / LIVE
      </text>
      <text x="234" y="10" textAnchor="end" fill="#8a9096" fontSize="5.4" fontFamily="monospace">
        С {hud.heading.toFixed(0).padStart(3, "0")}°
      </text>
      <text x="6" y="182" fill="#6c737a" fontSize="5" fontFamily="monospace">
        ● ПЕХОТА ▪ ТЕХНИКА ✕ КОНТАКТ
      </text>
      <text x="234" y="182" textAnchor="end" fill="#aeb4ba" fontSize="5" fontFamily="monospace">
        ОСТ. {hud.soldiersLeft + hud.vehiclesLeft}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

/**
 * Horizon ribbon driven at display refresh rate.
 *
 * Telemetry arrives ~10x/s, so feeding the transform straight from the props
 * makes the horizon step in visible jumps. This component interpolates
 * pitch/roll in a requestAnimationFrame loop and writes the transform
 * directly to the DOM node — perfectly smooth without re-rendering the OSD.
 */
function HorizonRibbon({ pitch, roll }: { pitch: number; roll: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef({ pitch, roll });
  const state = useRef({ pitch, roll, init: false });

  target.current = { pitch, roll };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      // exponential smoothing: ~0.15 s time constant, frame-rate independent
      const k = 1 - Math.pow(0.0012, dt);
      const st = state.current;
      st.pitch += (target.current.pitch - st.pitch) * k;
      st.roll += (target.current.roll - st.roll) * k;
      const el = ref.current;
      if (el) {
        const off = Math.max(-120, Math.min(120, st.pitch * 3.2));
        el.style.transform = `translate(-50%, -50%) translateY(${off.toFixed(2)}px) rotate(${(-st.roll).toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-1/2 w-[760px] will-change-transform"
      style={{ transform: "translate(-50%, -50%)" }}
    >
      <div className="mx-auto flex w-full items-center gap-0">
        <span className="h-[2px] flex-1 bg-white/85" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.7)" }} />
        <span className="w-[120px]" />
        <span className="h-[2px] flex-1 bg-white/85" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.7)" }} />
      </div>
    </div>
  );
}

interface HudProps {
  hud: HudData;
  settings: SimSettings;
  onPause: () => void;
  onToggleSound: () => void;
  onExit: () => void;
}

/* ------------------------------------------------------------------ */
/*  Analog OSD widgets (Betaflight / INAV style)                        */
/* ------------------------------------------------------------------ */

function OsdLadder({
  value,
  display,
  step,
  pxPerUnit,
  side,
  label,
}: {
  value: number;
  display: string;
  step: number;
  pxPerUnit: number;
  side: "left" | "right";
  label: string;
}) {
  const H = 236;
  const center = H / 2;
  const span = center / pxPerUnit;
  const ticks: number[] = [];
  const minors: number[] = [];
  const startV = Math.floor((value - span) / step) * step;
  for (let v = startV; v <= value + span + step; v += step) {
    if (v >= 0) ticks.push(Math.round(v));
    const m = v + step / 2;
    if (m >= 0 && m <= value + span) minors.push(m);
  }
  const isLeft = side === "left";
  return (
    <div className="relative hidden sm:block" style={{ height: H, width: 72 }}>
      <div className="osd-dim absolute -top-6 left-0 right-0 text-center text-[10px] tracking-[0.3em]">{label}</div>
      {minors.map((v) => {
        const y = center - (v - value) * pxPerUnit;
        if (y < 2 || y > H - 2) return null;
        return (
          <div
            key={`m${v}`}
            className={cn("absolute h-px w-3 bg-white/50", isLeft ? "right-0" : "left-0")}
            style={{ top: y }}
          />
        );
      })}
      {ticks.map((v) => {
        const y = center - (v - value) * pxPerUnit;
        if (y < 2 || y > H - 2) return null;
        return (
          <div
            key={v}
            className={cn("absolute flex items-center gap-1.5", isLeft ? "right-0" : "left-0")}
            style={{ top: y - 8 }}
          >
            {isLeft ? (
              <>
                <span className="osd text-[12px]">{v}</span>
                <span className="h-px w-4 bg-white/80" />
              </>
            ) : (
              <>
                <span className="h-px w-4 bg-white/80" />
                <span className="osd text-[12px]">{v}</span>
              </>
            )}
          </div>
        );
      })}
      <div
        className={cn("absolute border border-white/90 bg-black/60 px-1.5 py-0.5", isLeft ? "-right-1.5" : "-left-1.5")}
        style={{ top: center - 12 }}
      >
        <span className="osd text-[14px]">{display}</span>
      </div>
    </div>
  );
}

/* Random analog-link interference: tearing bars + static flashes + frame tears */
function SignalGlitch({ hud }: { hud: HudData }) {
  const [bars, setBars] = useState<{ top: number; height: number; opacity: number }[]>([]);
  const [flash, setFlash] = useState(0);
  const [tear, setTear] = useState(0);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  useEffect(() => {
    const id = window.setInterval(() => {
      const h = hudRef.current;
      const weak = Math.max(0, Math.min(1, (-58 - h.rssi) / 36));
      const intensity = Math.min(1, 0.16 + weak * 0.62 + h.damage * 0.9 + (h.throttle > 80 ? 0.12 : 0));
      if (Math.random() > 0.3 + intensity * 0.6) return;
      const n = 1 + (Math.random() < intensity * 0.75 ? 1 : 0);
      setBars(
        Array.from({ length: n }, () => ({
          top: Math.random() * 94,
          height: 2 + Math.random() * (4 + intensity * 12),
          opacity: 0.06 + Math.random() * (0.1 + intensity * 0.25),
        })),
      );
      setFlash(Math.random() < intensity * 0.55 ? 0.05 + Math.random() * 0.12 : 0);
      setTear(Math.random() < intensity * 0.4 ? (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 7) : 0);
      window.setTimeout(() => {
        setBars([]);
        setFlash(0);
        setTear(0);
      }, 80 + Math.random() * 120);
    }, 340);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={tear ? { transform: `translateX(${tear.toFixed(1)}px)` } : undefined}
      />
      {flash > 0 && <div className="noise-layer noise-fast pointer-events-none absolute inset-0" style={{ opacity: flash }} />}
      {bars.map((b, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: `${b.top}%`,
            height: b.height,
            opacity: b.opacity,
            background: "linear-gradient(180deg, transparent, #dfe8ff 30%, #ffffff 50%, #dfe8ff 70%, transparent)",
          }}
        />
      ))}
    </>
  );
}

export function NoSignalOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 select-none overflow-hidden bg-black">
      <div className="noise-layer noise-fast absolute inset-0 opacity-70" />
      <div className="scanlines absolute inset-0 opacity-60" />
      <div className="animate-roll-bar absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-white/15 to-transparent" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="osd text-[40px] tracking-[0.22em] sm:text-[54px]">NO SIGNAL</div>
        <div className="osd-warn text-[12px] tracking-[0.3em]">ВИДЕОКАНАЛ ПОТЕРЯН</div>
        <div className="osd-dim text-[11px] tracking-[0.12em]">CH4 · 5800MHz · ПЕРЕКЛЮЧЕНИЕ НА ОБЗОРНУЮ КАМЕРУ…</div>
      </div>
      <div className="osd-dim absolute left-3 top-2.5 text-[11px]">5800MHz</div>
      <div className="osd-dim absolute right-3 top-2.5 text-[11px]">CH4</div>
      <div className="osd-dim absolute bottom-2.5 left-3 text-[11px]">AEROFRONT · LINK LOST</div>
      <div className="osd-dim absolute bottom-2.5 right-3 text-[11px]">--:--</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main flight OSD                                                    */
/* ------------------------------------------------------------------ */

export function FlightHud({ hud, settings, onPause, onToggleSound, onExit }: HudProps) {
  const warhead = getWarhead(hud.warhead);
  const { mm, ss } = formatClock(hud.flightTime);
  const lowBattery = hud.battery <= 25;
  const criticalBattery = hud.battery <= 10;
  const weakSignal = hud.rssi < -82;
  const kmh = Math.round(hud.speed * 3.6);
  const alt = Math.max(0, Math.round(hud.agl));
  const thr = Math.round(hud.throttle);
  const mah = Math.round((100 - hud.battery) * 45);
  const amps = hud.throttle > 1 ? 1.8 + (hud.throttle / 100) * 58 : 0.3;
  const latMin = 38 + ((hud.droneZ + 300) / 600) * 1.6;
  const lonMin = 58 + ((hud.droneX + 300) / 600) * 1.6;
  const battSegs = Math.round((hud.battery / 100) * 6);
  const heading = String(Math.round(hud.heading) % 360).padStart(3, "0");
  const stickMag = Math.hypot(hud.stickX, hud.stickY);
  const stickOffCenter = stickMag > 0.3;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* analog link artefacts */}
      <div className="absolute inset-0 fpv-vignette" />
      <div className="absolute inset-0 scanlines opacity-[.3]" />
      <div className="noise-layer absolute inset-0 opacity-[.06]" />
      <SignalGlitch hud={hud} />
      {hud.damage > 0.05 && (
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{
            opacity: Math.min(0.55, hud.damage * 0.5),
            background: "radial-gradient(ellipse at center, transparent 30%, rgba(190,54,26,0.45) 100%)",
          }}
        />
      )}

      <div className="animate-osd-flicker absolute inset-0">
        {/* ===== top OSD row ===== */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("osd text-[19px]", criticalBattery && "animate-osd-blink")}>
                {hud.voltage.toFixed(1)}V
              </span>
              <span className="flex items-end gap-[2px]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-[7px] border border-black/80"
                    style={{ height: 10 + i * 1.5, backgroundColor: i < battSegs ? "#f2f6ff" : "rgba(0,0,0,0.45)" }}
                  />
                ))}
              </span>
              <span className="osd-dim text-[12px]">{hud.battery.toFixed(0)}%</span>
            </div>
            <div className="osd-dim mt-0.5 text-[12px]">
              THR {thr}% · {warhead.name}
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="osd text-[19px]">
                {mm}:{ss}
              </span>
              <span className="osd text-[12px] tracking-[0.2em]">{hud.acro ? "ACRO" : "ANGLE"}</span>
            </div>
            <div className="mt-1 flex flex-col items-center gap-0.5">
              {!hud.locked && (
                <span className="osd-warn animate-osd-blink text-[12px]">КЛИК — ЗАХВАТ МЫШИ</span>
              )}
              {hud.landed && <span className="osd text-[12px]">LANDED · W — ВЗЛЁТ</span>}
              {hud.onGround && !hud.landed && stickOffCenter && (
                <span className="osd-warn animate-osd-blink text-[12px]">STICK → CENTER · C</span>
              )}
              {hud.onGround && !hud.landed && !stickOffCenter && (
                <span className="osd-dim text-[12px]">НА СТАРТЕ · ЗАЖМИ W</span>
              )}
              {lowBattery && (
                <span className="osd-warn animate-osd-blink text-[12px]">
                  {criticalBattery ? "!! BATTERY CRITICAL !!" : "! LOW BATTERY !"}
                </span>
              )}
              {weakSignal && <span className="osd-warn animate-osd-blink text-[12px]">! WEAK SIGNAL !</span>}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="osd text-[15px]">RSSI {hud.rssi.toFixed(0)}</span>
              <span className="flex items-end gap-[2px]">
                {[0.2, 0.4, 0.6, 0.8, 1].map((t, i) => {
                  const n = Math.max(0, Math.min(1, (hud.rssi + 100) / 55));
                  return (
                    <span
                      key={i}
                      className="w-[4px] border border-black/80"
                      style={{ height: 5 + i * 2.5, backgroundColor: n >= t ? "#f2f6ff" : "rgba(0,0,0,0.45)" }}
                    />
                  );
                })}
              </span>
            </div>
            <div className="osd-dim text-[12px]">mAh {mah}</div>
            <div className="pointer-events-auto mt-0.5 flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleSound}
                aria-label="Звук"
                className="osd flex h-6 w-6 items-center justify-center border border-white/40 bg-black/40 text-[11px] transition hover:bg-white/20"
              >
                {settings.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={onPause}
                className="osd flex h-6 items-center gap-1 border border-white/40 bg-black/40 px-1.5 text-[10px] transition hover:bg-white/20"
              >
                <Pause className="h-2.5 w-2.5" /> ESC
              </button>
              <button
                type="button"
                onClick={onExit}
                aria-label="В ангар"
                className="osd flex h-6 w-6 items-center justify-center border border-white/40 bg-black/40 text-[11px] transition hover:bg-white/20"
              >
                <Power className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* ===== event log (OSD style) ===== */}
        <div className="absolute left-3 top-[74px] hidden w-[260px] flex-col gap-0.5 sm:flex">
          {hud.events.slice(0, 3).map((event) => (
            <div
              key={event.id}
              className={cn(
                "truncate text-[11px]",
                event.level === "warn" ? "osd-warn" : event.level === "hit" ? "osd" : "osd-dim",
              )}
            >
              › {event.text}
            </div>
          ))}
        </div>

        {/* ===== speed ladder (left) / altitude ladder (right) ===== */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <OsdLadder value={kmh} display={String(kmh)} step={10} pxPerUnit={4.2} side="left" label="SPD" />
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <OsdLadder value={alt} display={String(alt)} step={20} pxPerUnit={2.1} side="right" label="ALT" />
        </div>

        {/* ===== artificial horizon + fixed crosshair ===== */}
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[440px] -translate-x-1/2 -translate-y-1/2">
          <HorizonRibbon pitch={hud.pitch} roll={hud.roll} />

          <svg viewBox="0 0 440 300" className="absolute inset-0 h-full w-full">
            <g fill="none" strokeLinecap="round">
              <g stroke="#000" strokeWidth="4" opacity="0.85">
                <path d="M138 150h62M240 150h62M220 96v30M220 174v30" />
              </g>
              <g stroke="#f2f6ff" strokeWidth="2">
                <path d="M138 150h62M240 150h62M220 96v30M220 174v30" />
              </g>
              {/* center quad marker */}
              <g stroke="#000" strokeWidth="5" opacity="0.85">
                <path d="M211 141l-8-8M229 141l8-8M211 159l-8 8M229 159l8 8" />
              </g>
              <g stroke="#f2f6ff" strokeWidth="2.4">
                <path d="M211 141l-8-8M229 141l8-8M211 159l-8 8M229 159l8 8" />
              </g>
              <circle cx="220" cy="150" r="2.6" fill="#f2f6ff" stroke="#000" strokeWidth="1" />
            </g>
          </svg>

          {/* pitch/roll + stick indicator under the crosshair */}
          <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2.5">
            <span className="osd text-[12px]">
              P {hud.pitch >= 0 ? "+" : ""}
              {hud.pitch.toFixed(0)}°
            </span>
            <span className="relative inline-block h-9 w-9 border border-white/70 bg-black/40">
              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/30" />
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/30" />
              <span
                className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                  left: `${50 + hud.stickX * 38}%`,
                  top: `${50 + hud.stickY * 38}%`,
                  boxShadow: "0 0 0 1px #000",
                }}
              />
            </span>
            <span className="osd text-[12px]">
              R {hud.roll >= 0 ? "+" : ""}
              {hud.roll.toFixed(0)}°
            </span>
          </div>
        </div>

        {/* ===== bottom OSD row ===== */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pb-2">
          <div>
            <div className="osd text-[13px]">Amp {amps.toFixed(1)}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="osd-dim text-[11px]">THR</span>
              <span className="relative inline-block h-[9px] w-[86px] border border-white/60 bg-black/40">
                <span className="absolute inset-y-0 left-0 bg-white/90" style={{ width: `${thr}%` }} />
              </span>
              <span className="osd text-[11px]">{thr}%</span>
            </div>
          </div>

          <div className="hidden flex-col items-center md:flex">
            <CompassStrip heading={hud.heading} />
            <div className="osd mt-0.5 text-[12px]">
              47°{latMin.toFixed(4)}&apos; · H {heading}° · 52°{lonMin.toFixed(4)}&apos;
            </div>
          </div>

          <div className="text-right">
            <div className="osd text-[13px]">DIS {Math.round(hud.distance)}m</div>
            <div className="osd-dim mt-0.5 text-[12px]">
              mAh {mah} · {hud.soldiersLeft + hud.vehiclesLeft} TGT
            </div>
          </div>
        </div>

        {/* ===== compact tactical map ===== */}
        <div className="absolute bottom-[68px] right-3 w-[150px] border border-white/30 bg-black/55 p-1 sm:w-[172px]">
          <div className="mb-0.5 flex items-center justify-between px-0.5">
            <span className="osd-dim text-[9px] tracking-[0.15em]">MAP</span>
            <span className="osd text-[9px]">{hud.soldiersLeft + hud.vehiclesLeft}</span>
          </div>
          <TacticalMap hud={hud} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Standby overlay                                                    */
/* ------------------------------------------------------------------ */

interface StandbyProps {
  hud: HudData;
  warheadId: WarheadId;
  settings: SimSettings;
  onLaunch: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
  onWarhead: (id: WarheadId) => void;
}

export function StandbyOverlay({ hud, warheadId, settings, onLaunch, onExit, onOpenSettings, onWarhead }: StandbyProps) {
  const warhead = getWarhead(warheadId);
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-base/80 via-base/25 to-base/85">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto flex items-center gap-2 border border-line/80 bg-base/70 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted backdrop-blur-sm transition hover:border-linebright hover:text-cream"
        >
          <ChevronRight className="h-3 w-3 rotate-180" /> в ангар
        </button>
        <div className="flex items-center gap-2">
          <span className="border border-lime/30 bg-base/60 px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-lime backdrop-blur-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime animate-pulse-dot" />
            ожидание оператора
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="pointer-events-auto flex h-8 items-center gap-1.5 border border-line/80 bg-base/70 px-2.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted backdrop-blur-sm hover:text-cream"
          >
            <Keyboard className="h-3 w-3" /> ESC
          </button>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="relative w-full max-w-[540px] border border-line bg-[#0d0e10]/92 p-5 backdrop-blur-md sm:p-7">
          <span className="absolute left-0 top-0 h-px w-16 bg-lime" />
          <span className="absolute left-0 top-0 h-16 w-px bg-lime" />
          <span className="absolute bottom-0 right-0 h-px w-16 bg-linebright" />
          <span className="absolute bottom-0 right-0 h-16 w-px bg-linebright" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-lime">
                <Target className="h-3 w-3" /> полигон 04 / точка «база»
              </div>
              <h2 className="mt-2 display text-[30px] font-semibold uppercase leading-[0.95] tracking-[0.03em] sm:text-[38px]">
                Выпуск дрона
              </h2>
            </div>
            <div className="text-right">
              <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-faint">борт</div>
              <div className="stat-num text-[20px] text-cream">04</div>
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Дрон в стартовой позиции, БЧ <span style={{ color: warhead.accent }}>{warhead.fullName}</span> установлена.
            Связь с оператором стабильна. Подтвердите выпуск для перехода в режим ручного пилотирования.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-1.5">
            <div className="border border-line bg-panel2/60 p-2.5">
              <div className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-faint">АКБ</div>
              <div className="stat-num mt-1 text-[18px] text-lime">100%</div>
            </div>
            <div className="border border-line bg-panel2/60 p-2.5">
              <div className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-faint">КАНАЛ</div>
              <div className="stat-num mt-1 text-[18px] text-cream">5.8G</div>
            </div>
            <div className="border border-line bg-panel2/60 p-2.5">
              <div className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-faint">ЦЕЛИ</div>
              <div className="stat-num mt-1 text-[18px] text-amber">{hud.soldiersLeft + hud.vehiclesLeft}</div>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-faint">боевая часть · смена перед выпуском</span>
              <span className="font-mono text-[8px] text-lime-dim">R</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {WARHEADS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onWarhead(w.id)}
                  className={cn(
                    "pointer-events-auto border px-2 py-1.5 text-left transition",
                    w.id === warheadId ? "border-lime/60 bg-lime/[0.08]" : "border-line bg-panel2/40 hover:border-linebright",
                  )}
                >
                  <WarheadGlyph id={w.id} className="h-5 w-full" accent={w.id === warheadId ? w.accent : "#8a9198"} />
                  <div className={cn("mt-1 font-mono text-[8px] uppercase", w.id === warheadId ? "text-cream" : "text-muted")}>
                    {w.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onLaunch}
            className="btn-primary clip-corner pointer-events-auto mt-4 h-[52px] w-full text-[15px]"
          >
            <Zap className="h-[18px] w-[18px]" /> Выпустить дрон
            <span className="ml-1 border border-black/25 bg-black/10 px-1.5 py-0.5 font-mono text-[9px] tracking-normal">R</span>
          </button>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[8px] uppercase tracking-[0.1em] text-faint">
            <span>W — зажать для тяги/взлёта</span>
            <span>мышь — наклон (прицел по центру)</span>
            <span>A/D — рыскание</span>
            <span>H — ACRO/ANGLE</span>
            <span>R — выпуск</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4 font-mono text-[8px] uppercase tracking-[0.14em] text-faint">
        <span>синтетическая среда · полигон 04</span>
        <span className="hidden sm:block">инверсия тангажа: {settings.invertPitch ? "вкл" : "выкл"}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ghost / debrief overlay                                            */
/* ------------------------------------------------------------------ */

interface GhostProps {
  hud: HudData;
  debrief: DebriefData | null;
  warheadId: WarheadId;
  onWarhead: (id: WarheadId) => void;
  onSpawn: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
}

export function GhostOverlay({ hud, debrief, warheadId, onWarhead, onSpawn, onExit, onOpenSettings }: GhostProps) {
  const remaining = hud.soldiersLeft + hud.vehiclesLeft;
  const complete = remaining === 0;
  const { mm, ss } = formatClock(debrief?.flightTime ?? hud.flightTime);
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(3,7,3,0.72))]" />
      <div className="absolute inset-x-0 top-0 h-[130px] bg-gradient-to-b from-base via-base/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div>
          <div className="flex items-center gap-2 border border-amber/40 bg-base/80 px-3 py-1.5 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 bg-amber" />
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber">сигнал потерян · ghost mode</span>
          </div>
          <div className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
            осмотр поля · камера свободная · цель: оценка результата
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="pointer-events-auto flex h-8 items-center gap-1.5 border border-line/80 bg-base/70 px-2.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted backdrop-blur-sm hover:text-cream"
          >
            <Keyboard className="h-3 w-3" /> ESC
          </button>
          <button
            type="button"
            onClick={onExit}
            className="pointer-events-auto flex h-8 items-center gap-1.5 border border-line/80 bg-base/70 px-2.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted backdrop-blur-sm hover:text-cream"
          >
            <ChevronRight className="h-3 w-3 rotate-180" /> ангар
          </button>
        </div>
      </div>

      <div className="absolute left-3 top-[104px] w-[300px] sm:left-4">
        <div className="relative border border-line bg-[#0d0e10]/92 backdrop-blur-md">
          <div className={cn("h-1 w-full", complete ? "bg-lime" : "bg-amber")} />
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: complete ? "#e9ebee" : "#d8bb92" }}>
                {complete ? <Shield className="h-3 w-3" /> : <Skull className="h-3 w-3" />}
                {complete ? "задача выполнена" : "дрон уничтожен"}
              </span>
              <span className="stat-num text-[10px] text-faint">
                {mm}:{ss}
              </span>
            </div>
            <h2 className="display mt-2 text-[25px] font-semibold uppercase leading-[0.95] tracking-[0.02em]">
              {complete ? "Поле чисто" : "Оценка контакта"}
            </h2>
            <div className="mt-2.5 border border-line/80 bg-panel2/60 px-2.5 py-2">
              <div className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-faint">характер контакта</div>
              <div className="mt-1 font-mono text-[10px] uppercase leading-snug tracking-[0.04em] text-cream/90">
                {debrief?.cause ?? "нет данных"}
              </div>
              <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.06em] text-muted">{debrief?.targetName}</div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <div className="border border-line bg-base/50 p-2">
                <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-faint">пехота</div>
                <div className="stat-num mt-0.5 text-[19px] text-amber">−{debrief?.soldiersDestroyed ?? 0}</div>
                <div className="font-mono text-[7px] uppercase text-faint">осталось {hud.soldiersLeft} / {hud.soldiersTotal}</div>
              </div>
              <div className="border border-line bg-base/50 p-2">
                <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-faint">техника</div>
                <div className="stat-num mt-0.5 text-[19px] text-danger">−{debrief?.vehiclesDestroyed ?? 0}</div>
                <div className="font-mono text-[7px] uppercase text-faint">осталось {hud.vehiclesLeft} / {hud.vehiclesTotal}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border border-line bg-base/40 px-2.5 py-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">осталось целей</span>
              <span className={cn("stat-num text-[12px]", complete ? "text-lime" : "text-cream")}>{remaining}</span>
            </div>

            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-faint">боевая часть следующего борта</span>
                <span className="font-mono text-[7.5px] text-lime">R</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {WARHEADS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onWarhead(w.id)}
                    className={cn(
                      "pointer-events-auto border px-1.5 py-1 transition",
                      w.id === warheadId ? "border-lime/60 bg-lime/[0.08]" : "border-line bg-panel2/40 hover:border-linebright",
                    )}
                  >
                    <WarheadGlyph id={w.id} className="h-4 w-full" accent={w.id === warheadId ? w.accent : "#8a9198"} />
                    <div className={cn("font-mono text-[7px] uppercase", w.id === warheadId ? "text-cream" : "text-muted")}>
                      {w.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={onSpawn} className="btn-primary clip-corner pointer-events-auto mt-3 h-11 w-full text-[13px]">
              <RotateCcw className="h-4 w-4" /> Новый дрон
              <span className="border border-black/25 bg-black/10 px-1.5 py-0.5 font-mono text-[9px] tracking-normal">R</span>
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-3 right-3 w-[228px] border border-line/80 bg-base/80 p-1.5 backdrop-blur-md sm:w-[276px]">
        <div className="mb-1 flex items-center justify-between px-0.5">
          <span className="flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-[0.12em] text-muted">
            <Eye className="h-2.5 w-2.5" /> осмотр поля
          </span>
          <span className="font-mono text-[7.5px] text-lime">LIVE</span>
        </div>
        <TacticalMap hud={{ ...hud, mode: "ghost" }} />
        <div className="mt-1 grid grid-cols-2 gap-1 px-0.5 font-mono text-[7px] uppercase tracking-[0.05em] text-faint">
          <span>мышь — обзор</span>
          <span className="text-right">колесо — масштаб</span>
          <span>WASD — панорама</span>
          <span className="text-right">Q/E — высота</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-4 border border-line/70 bg-base/60 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-muted backdrop-blur-sm sm:flex">
        <span className="flex items-center gap-1.5"><MousePointer2 className="h-3 w-3" /> обзор</span>
        <span className="h-2.5 w-px bg-linebright" />
        <span className="flex items-center gap-1.5"><Camera className="h-3 w-3" /> инспекция</span>
        <span className="h-2.5 w-px bg-linebright" />
        <span className="flex items-center gap-1.5"><span className="keycap !h-[18px] !min-w-[18px] text-[8px]">R</span> новый вылет</span>
      </div>
    </div>
  );
}
