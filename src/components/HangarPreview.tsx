import { useEffect, useRef } from "react";
import { HangarScene } from "@/game/hangarScene";
import type { WarheadId } from "@/game/types";

interface Props {
  warheadId: WarheadId;
}

export function HangarPreview({ warheadId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HangarScene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new HangarScene(canvasRef.current, warheadId);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // studio is built once; payload swaps are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.updateWarhead(warheadId);
  }, [warheadId]);

  return (
    <div className="absolute inset-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_42%_30%,rgba(255,220,176,0.12),transparent_58%)]" />
      <canvas ref={canvasRef} className="h-full w-full cursor-grab" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0b0c] via-[#0a0b0c]/55 to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.55)]" />
    </div>
  );
}
