import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { WARHEADS } from "@/game/warheads";
import type { WarheadId } from "@/game/types";

export function Corners({ className, tone = "lime" }: { className?: string; tone?: "lime" | "faint" }) {
  const color = tone === "lime" ? "border-lime/60" : "border-linebright/60";
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn("absolute -left-px -top-px h-2.5 w-2.5 border-l border-t", color)} />
      <span className={cn("absolute -right-px -top-px h-2.5 w-2.5 border-r border-t", color)} />
      <span className={cn("absolute -bottom-px -left-px h-2.5 w-2.5 border-b border-l", color)} />
      <span className={cn("absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r", color)} />
    </div>
  );
}

export function SectionTitle({
  index,
  children,
  right,
  className,
}: {
  index?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-2.5">
        {index && <span className="mono text-[9px] tracking-[0.2em] text-lime-dim">{index}</span>}
        <span className="mono text-[10px] font-medium uppercase tracking-[0.2em] text-cream">{children}</span>
        <span className="h-px w-8 bg-linebright/70" />
      </div>
      {right}
    </div>
  );
}

export function WarheadGlyph({ id, className, accent }: { id: WarheadId; className?: string; accent?: string }) {
  const color = accent ?? "#e9ebee";
  if (id === "pg7vl") {
    return (
      <svg viewBox="0 0 140 48" className={className} fill="none">
        <g stroke={color} strokeWidth="1.4" strokeLinejoin="bevel">
          <path d="M6 24h12M12 16l-4 8 4 8M126 24h8" strokeOpacity=".35" strokeDasharray="2 3" />
          <path d="M22 20.5h6v7h-6zM28 24h14" />
          <rect x="42" y="20.5" width="44" height="7" fill={color} fillOpacity=".12" />
          <path d="M86 16h12v16H86z" fill={color} fillOpacity=".3" />
          <path d="M98 16l22 8-22 8z" fill={color} fillOpacity=".55" />
          <path d="M120 24h6" strokeWidth="2" />
          <path d="M28 21h7M28 27h7M46 20.5v7M60 20.5v7M74 20.5v7" strokeOpacity=".45" />
        </g>
        <g fill={color} fillOpacity=".5">
          <circle cx="131" cy="24" r="1.4" />
          <circle cx="18" cy="24" r="1.2" />
        </g>
      </svg>
    );
  }
  if (id === "pg7vr") {
    return (
      <svg viewBox="0 0 140 48" className={className} fill="none">
        <g stroke={color} strokeWidth="1.4" strokeLinejoin="bevel">
          <path d="M6 24h12M134 24h3" strokeOpacity=".35" strokeDasharray="2 3" />
          <path d="M22 20h6v8h-6zM28 24h10" />
          <rect x="38" y="19" width="38" height="10" fill={color} fillOpacity=".12" />
          <path d="M76 15h14v18H76z" fill={color} fillOpacity=".3" />
          <path d="M90 15l16 9-16 9z" fill={color} fillOpacity=".5" />
          <path d="M106 20v8M112 22v4" strokeOpacity=".7" />
          <path d="M116 19l10 5-10 5z" fill={color} fillOpacity=".65" />
          <path d="M126 24h6" strokeWidth="2" />
          <path d="M43 19v10M57 19v10M70 19v10" strokeOpacity=".4" />
          <path d="M78 17h10M78 31h10" strokeOpacity=".7" />
        </g>
        <circle cx="134" cy="24" r="1.4" fill={color} fillOpacity=".6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 140 48" className={className} fill="none">
      <g stroke={color} strokeWidth="1.4" strokeLinejoin="bevel">
        <path d="M6 24h12M132 24h4" strokeOpacity=".35" strokeDasharray="2 3" />
        <path d="M22 19h6v10h-6zM28 24h8" />
        <rect x="36" y="15" width="52" height="18" rx="2" fill={color} fillOpacity=".14" />
        <path d="M88 11c14 0 20 6 20 13s-6 13-20 13z" fill={color} fillOpacity=".42" />
        <path d="M108 20c5 0 8 2 8 4s-3 4-8 4z" fill={color} fillOpacity=".7" />
        <path d="M112 24h8" strokeWidth="2" />
        <path d="M42 15v18M55 15v18M70 15v18" strokeOpacity=".32" />
        <path d="M38 20h8" strokeOpacity=".65" />
        <path d="M78 15h8" strokeWidth="2.6" />
      </g>
      <circle cx="124" cy="24" r="1.5" fill={color} fillOpacity=".7" />
    </svg>
  );
}

export function StatBar({ label, value, accent = "#e6e9ec" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{label}</span>
      <div className="relative h-[3px] flex-1 bg-line">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: accent }}
        />
        <div className="absolute inset-0 flex justify-between">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="h-full w-px bg-base/70" />
          ))}
        </div>
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-[9px] text-cream/80">{value}</span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-4 py-2.5 text-left"
    >
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.13em] text-cream/90">{label}</span>
        {hint && <span className="mt-1 block text-[10.5px] leading-snug text-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-[18px] w-9 shrink-0 border transition-colors",
          checked ? "border-lime/70 bg-lime/20" : "border-linebright/60 bg-panel2",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[12px] w-[14px] transition-all",
            checked ? "left-[19px] bg-lime" : "left-[2px] bg-faint",
          )}
        />
      </span>
    </button>
  );
}

export function WarheadPicker({
  value,
  onChange,
  compact = false,
}: {
  value: WarheadId;
  onChange: (id: WarheadId) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-1.5", compact ? "grid-cols-3" : "grid-cols-1")}>
      {WARHEADS.map((warhead) => {
        const active = warhead.id === value;
        return (
          <button
            key={warhead.id}
            type="button"
            onClick={() => onChange(warhead.id)}
            className={cn(
              "group relative flex items-center gap-3 border text-left transition-all",
              compact ? "flex-col gap-1 px-2 py-2" : "px-3.5 py-3",
              active
                ? "border-lime/60 bg-lime/[0.07]"
                : "border-line bg-panel2/50 hover:border-linebright hover:bg-panel2",
            )}
          >
            <span
              className="absolute left-0 top-0 h-full w-[2px] transition-colors"
              style={{ backgroundColor: active ? warhead.accent : "transparent" }}
            />
            {compact ? (
              <>
                <WarheadGlyph id={warhead.id} className="h-7 w-full" accent={active ? warhead.accent : "#9aa1a8"} />
                <span className={cn("font-mono text-[9px] tracking-[0.05em]", active ? "text-cream" : "text-muted")}>
                  {warhead.name}
                </span>
              </>
            ) : (
              <>
                <div className="flex w-8 shrink-0 items-start gap-1.5">
                  <span className="font-mono text-[9px] text-faint">{warhead.index}</span>
                </div>
                <WarheadGlyph
                  id={warhead.id}
                  className="h-9 w-[92px] shrink-0"
                  accent={active ? warhead.accent : "#8a9198"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-[17px] font-semibold leading-none tracking-wide text-cream">
                      {warhead.name}
                    </span>
                    <span className="font-mono text-[9px] text-faint">{warhead.massKg} кг</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted">
                    {warhead.class}
                  </div>
                </div>
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    active ? "border-lime bg-lime/20" : "border-linebright",
                  )}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-lime" />}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MissionMap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 240" className={className} fill="none">
      <defs>
        <linearGradient id="mapbg" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#191b1e" />
          <stop offset="1" stopColor="#0c0d0f" />
        </linearGradient>
        <pattern id="mapgrid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0v28" stroke="#2f3338" strokeOpacity=".45" strokeWidth=".6" />
        </pattern>
      </defs>
      <rect width="420" height="240" fill="url(#mapbg)" />
      <rect width="420" height="240" fill="url(#mapgrid)" />
      <path d="M0 165C70 155 115 152 172 138s104-15 248-8" stroke="#74797f" strokeWidth="7" strokeOpacity=".65" />
      <path d="M0 165C70 155 115 152 172 138s104-15 248-8" stroke="#b9bec4" strokeWidth=".8" strokeDasharray="8 8" strokeOpacity=".5" />
      <path d="M-10 34c60 15 110 30 160 34s110 2 160-8 80-8 120-6" stroke="#282d31" strokeWidth="30" fill="none" strokeOpacity=".9" />
      <g stroke="#565c62" strokeWidth="1">
        {Array.from({ length: 22 }).map((_, i) => (
          <path key={i} d={`M${-6 + i * 20} ${22 + (i % 3) * 6}l5-11 5 11z`} fill="#42474d" fillOpacity=".65" />
        ))}
      </g>
      <g transform="translate(258 100)">
        <rect x="0" y="0" width="40" height="23" fill="#9ba1a8" fillOpacity=".28" stroke="#cfd4d9" strokeOpacity=".55" />
        <rect x="5" y="4" width="11" height="7" fill="#0b0c0d" />
        <rect x="23" y="4" width="11" height="7" fill="#0b0c0d" />
        <rect x="5" y="14" width="11" height="5" fill="#0b0c0d" />
        <rect x="23" y="14" width="11" height="5" fill="#0b0c0d" />
        <path d="M0 0l-5 5M40 23l5-5" stroke="#d8bb92" strokeOpacity=".8" />
        <text x="47" y="14" fill="#cfd4d9" fontSize="7" fontFamily="monospace">
          ЗДАНИЕ / СЕКТОР Б
        </text>
      </g>
      <g stroke="#aeb4ba" strokeOpacity=".65" strokeWidth=".8">
        <rect x="30" y="160" width="42" height="26" strokeDasharray="3 3" />
        <text x="30" y="155" fill="#e9ebee" fontSize="7" fontFamily="monospace">
          СТАРТ / ПУНКТ «БАЗА»
        </text>
        <circle cx="51" cy="173" r="8" />
        <path d="M51 164v18M42 173h18" strokeWidth=".5" />
      </g>
      <g>
        {[
          [196, 120],
          [206, 128],
          [215, 118],
          [224, 132],
          [236, 112],
          [247, 126],
          [268, 110],
          [278, 128],
          [292, 116],
          [307, 126],
          [250, 140],
          [282, 142],
          [189, 148],
          [170, 132],
          [222, 150],
        ].map(([x, y], i) => (
          <circle key={`s${i}`} cx={x} cy={y} r="1.8" fill="#d8bb92" fillOpacity=".9" />
        ))}
        {[
          [300, 134],
          [231, 141],
          [320, 124],
          [176, 155],
        ].map(([x, y], i) => (
          <rect key={`v${i}`} x={x} y={y} width="4" height="4" fill="#cf8f79" fillOpacity=".9" />
        ))}
        <path d="M258 140l6 3v-6z" fill="#cf8f79" fillOpacity=".9" />
        <path d="M275 150l6 3v-6z" fill="#cf8f79" fillOpacity=".9" />
      </g>
      <g transform="translate(39 155)" stroke="#e9ebee" strokeWidth="1">
        <path d="M0 0l5 22M10 0l-5 22" strokeOpacity=".7" />
      </g>
      <g fill="#9aa1a8" fontSize="6.5" fontFamily="monospace">
        <text x="12" y="230">СЕКТОР А · ОТКРЫТОЕ ПОЛЕ</text>
        <text x="304" y="230">СЕКТОР В · ЛЕСОПОЛОСА</text>
        <text x="112" y="44">ЗАБРОШЕННЫЙ ОБЪЕКТ «ЛИМАН-4»</text>
        <text x="356" y="16">С</text>
        <text x="6" y="120">З</text>
        <text x="408" y="120">В</text>
        <text x="356" y="234">Ю</text>
      </g>
      <rect x="0.5" y="0.5" width="419" height="239" stroke="#3a3f45" />
      <g opacity=".5">
        <path d="M0 22V0h22M398 0h22v22M0 218v22h22M398 240h22v-22" stroke="#e9ebee" strokeOpacity=".5" />
      </g>
    </svg>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("hairline h-px w-full", className)} />;
}

export function Key({ children }: { children: ReactNode }) {
  return <span className="keycap">{children}</span>;
}
