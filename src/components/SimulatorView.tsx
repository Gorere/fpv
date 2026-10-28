import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Simulator } from "@/game/engine";
import type { DebriefData, HudData, SimSettings, WarheadId } from "@/game/types";

export interface SimulatorHandle {
  spawn: () => void;
  resetMission: () => void;
}

interface Props {
  warheadId: WarheadId;
  settings: SimSettings;
  paused: boolean;
  onHud: (hud: HudData) => void;
  onDebrief: (debrief: DebriefData) => void;
}

export const SimulatorView = forwardRef<SimulatorHandle, Props>(function SimulatorView(
  { warheadId, settings, paused, onHud, onDebrief },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulatorRef = useRef<Simulator | null>(null);
  const callbacksRef = useRef({ onHud, onDebrief });
  callbacksRef.current = { onHud, onDebrief };
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    spawn: () => simulatorRef.current?.spawn(),
    resetMission: () => simulatorRef.current?.resetMission(),
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    let simulator: Simulator | null = null;
    try {
      simulator = new Simulator({
        canvas: canvasRef.current,
        warheadId,
        settings,
        callbacks: {
          onHud: (data) => callbacksRef.current.onHud(data),
          onDebrief: (data) => callbacksRef.current.onDebrief(data),
        },
      });
      simulatorRef.current = simulator;
    } catch (err) {
      console.error(err);
      setError("Не удалось инициализировать 3D-сцену. Проверьте поддержку WebGL в браузере.");
    }
    return () => {
      simulator?.dispose();
      simulatorRef.current = null;
    };
    // Engine is created once; prop changes are forwarded below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    simulatorRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    simulatorRef.current?.setWarhead(warheadId);
  }, [warheadId]);

  useEffect(() => {
    simulatorRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-base p-6">
          <div className="max-w-md border border-danger/40 bg-panel p-5 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-danger">Ошибка рендера</div>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
});
