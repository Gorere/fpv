import { useCallback, useEffect, useRef, useState } from "react";
import { Target } from "lucide-react";
import { Hangar } from "@/components/Hangar";
import { FlightHud, GhostOverlay, NoSignalOverlay, StandbyOverlay } from "@/components/Hud";
import { SettingsModal } from "@/components/SettingsModal";
import { SimulatorView, type SimulatorHandle } from "@/components/SimulatorView";
import type { DebriefData, FlightHistory, HudData, SimSettings, WarheadId } from "@/game/types";

const DEFAULT_SETTINGS: SimSettings = {
  invertPitch: false,
  sensitivity: 1,
  muted: false,
};

function loadSettings(): SimSettings {
  try {
    const raw = localStorage.getItem("aerofront.settings.v1");
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SimSettings>;
    return {
      invertPitch: Boolean(parsed.invertPitch),
      sensitivity: typeof parsed.sensitivity === "number" ? Math.min(1.7, Math.max(0.45, parsed.sensitivity)) : 1,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const initialHud = (warhead: WarheadId): HudData => ({
  mode: "standby",
  battery: 100,
  voltage: 16.8,
  throttle: 40,
  speed: 0,
  verticalSpeed: 0,
  altitude: 0,
  agl: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  rssi: -46,
  flightTime: 0,
  distance: 0,
  soldiersLeft: 32,
  soldiersTotal: 32,
  vehiclesLeft: 8,
  vehiclesTotal: 8,
  kills: 0,
  droneX: -96,
  droneZ: 82,
  lastImpact: null,
  targets: [],
  events: [
    { id: 1, text: "СИМУЛЯТОР ГОТОВ · R — ВЫПУСК ДРОНА", level: "info" },
    { id: 2, text: "ПОЛИГОН 04 · СВЯЗЬ 5.8 ГГц", level: "info" },
  ],
  warhead,
  landed: false,
  totalMissionTime: 0,
  damage: 0,
  onGround: true,
  acro: false,
  stickX: 0,
  stickY: 0,
  locked: false,
  signalLost: false,
});

export default function App() {
  const [screen, setScreen] = useState<"hangar" | "mission">("hangar");
  const [warheadId, setWarheadId] = useState<WarheadId>("pg7vl");
  const [settings, setSettings] = useState<SimSettings>(loadSettings);
  const [paused, setPaused] = useState(false);
  const [hangarSettingsOpen, setHangarSettingsOpen] = useState(false);
  const [hud, setHud] = useState<HudData>(() => initialHud("pg7vl"));
  const [debrief, setDebrief] = useState<DebriefData | null>(null);
  const [history, setHistory] = useState<FlightHistory[]>([]);
  const simRef = useRef<SimulatorHandle>(null);
  const wasInFlight = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem("aerofront.settings.v1", JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      event.preventDefault();
      if (screen === "mission") {
        setPaused((value) => !value);
      } else {
        setHangarSettingsOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen]);

  useEffect(() => {
    if (hud.mode === "flight" && debrief) setDebrief(null);
    if (hud.mode === "flight") wasInFlight.current = true;
  }, [hud.mode, debrief]);

  const handleHud = useCallback((next: HudData) => {
    setHud(next);
  }, []);

  const handleDebrief = useCallback((data: DebriefData) => {
    setDebrief(data);
    setHistory((prev) =>
      [
        {
          id: Date.now(),
          cause: data.cause,
          targetName: data.targetName,
          soldiersDestroyed: data.soldiersDestroyed,
          vehiclesDestroyed: data.vehiclesDestroyed,
          flightTime: data.flightTime,
          warhead: data.warhead,
        },
        ...prev,
      ].slice(0, 20),
    );
  }, []);

  const launchMission = () => {
    setHud(initialHud(warheadId));
    setDebrief(null);
    setPaused(false);
    wasInFlight.current = false;
    setScreen("mission");
  };

  const exitMission = () => {
    setScreen("hangar");
    setPaused(false);
    setDebrief(null);
    setHud(initialHud(warheadId));
  };

  const spawn = () => {
    setDebrief(null);
    simRef.current?.spawn();
  };

  const pauseOpen = screen === "mission" && paused;
  const closeSettings = () => {
    if (screen === "mission") setPaused(false);
    else setHangarSettingsOpen(false);
  };

  if (screen === "hangar") {
    return (
      <>
        <Hangar
          warheadId={warheadId}
          onWarhead={setWarheadId}
          settings={settings}
          onSettings={setSettings}
          onLaunch={launchMission}
          history={history}
          onOpenSettings={() => setHangarSettingsOpen(true)}
        />
        <SettingsModal
          open={hangarSettingsOpen}
          missionActive={false}
          settings={settings}
          warheadId={warheadId}
          onSettings={setSettings}
          onWarhead={setWarheadId}
          onClose={() => setHangarSettingsOpen(false)}
          onExit={() => setHangarSettingsOpen(false)}
        />
      </>
    );
  }

  const inFlight = hud.mode === "flight";
  const isGhost = hud.mode === "ghost";
  const isLanded = hud.mode === "landed";
  const remaining = hud.soldiersLeft + hud.vehiclesLeft;

  return (
    <div
      className={
        "fixed inset-0 overflow-hidden bg-[#060906] " +
        (inFlight || isLanded ? "cursor-none" : isGhost ? "cursor-grab" : "cursor-default")
      }
    >
      <SimulatorView
        ref={simRef}
        warheadId={warheadId}
        settings={settings}
        paused={paused}
        onHud={handleHud}
        onDebrief={handleDebrief}
      />

      {(inFlight || isLanded) && (
        <FlightHud
          hud={hud}
          settings={settings}
          onPause={() => setPaused(true)}
          onToggleSound={() => setSettings({ ...settings, muted: !settings.muted })}
          onExit={exitMission}
        />
      )}

      {hud.mode === "standby" && (
        <StandbyOverlay
          hud={hud}
          warheadId={warheadId}
          settings={settings}
          onLaunch={spawn}
          onExit={exitMission}
          onOpenSettings={() => setPaused(true)}
          onWarhead={setWarheadId}
        />
      )}

      {isGhost && hud.signalLost && <NoSignalOverlay />}

      {isGhost && (
        <GhostOverlay
          hud={hud}
          debrief={debrief}
          warheadId={warheadId}
          onWarhead={setWarheadId}
          onSpawn={spawn}
          onExit={exitMission}
          onOpenSettings={() => setPaused(true)}
        />
      )}

      {isGhost && remaining === 0 && (
        <div className="pointer-events-none absolute bottom-[92px] left-1/2 -translate-x-1/2 border border-lime/50 bg-[#101214]/90 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-lime backdrop-blur-sm">
          <Target className="mr-1.5 inline h-3 w-3" /> все цели поражены · задача выполнена
        </div>
      )}

      <div className="pointer-events-none absolute bottom-1 left-1/2 hidden -translate-x-1/2 font-mono text-[7px] uppercase tracking-[0.18em] text-faint/70 sm:block">
        Аэрофронт · полигон 04 · синтетическая тренировочная среда
      </div>

      <SettingsModal
        open={pauseOpen}
        missionActive
        settings={settings}
        warheadId={warheadId}
        onSettings={setSettings}
        onWarhead={setWarheadId}
        onClose={closeSettings}
        onExit={() => {
          setPaused(false);
          exitMission();
        }}
      />
    </div>
  );
}
