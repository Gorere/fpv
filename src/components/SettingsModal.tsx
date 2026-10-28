import { ArrowDown, ArrowUp, Crosshair, Gauge, Keyboard, MousePointer2, RotateCcw, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { WarheadPicker, Toggle, SectionTitle, Key } from "./ui";
import type { SimSettings, WarheadId } from "@/game/types";
import { getWarhead } from "@/game/warheads";

interface Props {
  open: boolean;
  missionActive: boolean;
  settings: SimSettings;
  warheadId: WarheadId;
  onSettings: (s: SimSettings) => void;
  onWarhead: (id: WarheadId) => void;
  onClose: () => void;
  onExit: () => void;
}

export function SettingsModal({ open, missionActive, settings, warheadId, onSettings, onWarhead, onClose, onExit }: Props) {
  if (!open) return null;
  const warhead = getWarhead(warheadId);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-md sm:items-center sm:p-6">
      <div className="relative my-auto w-full max-w-[880px] border border-line bg-[#0d0e10] shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
        <div className="noise-layer pointer-events-none absolute inset-0 opacity-[0.03]" />
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center border border-lime/40 bg-lime/10">
              <Settings2 className="h-4 w-4 text-lime" />
            </span>
            <div>
              <div className="mono-label">{missionActive ? "симулятор на паузе" : "конфигурация системы"}</div>
              <h2 className="display text-[25px] font-semibold uppercase leading-none tracking-[0.03em]">
                Настройки и управление
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center border border-line text-muted transition hover:border-linebright hover:text-cream"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          <div className="border-b border-line p-5 md:border-b-0 md:border-r">
            <SectionTitle index="01">Органы управления</SectionTitle>
            <div className="mt-3 space-y-2">
              {[
                { icon: <MousePointer2 className="h-3.5 w-3.5" />, title: "Мышь — наклон (прицел по центру)", desc: "Клик захватывает мышь. Прицел всегда строго по центру. Движение мыши ВВЕРХ — нос вниз (вектор тяги вперёд, дрон ускоряется), движение ВНИЗ — нос вверх. C — вернуть стик в центр." },
                { icon: <ArrowUp className="h-3.5 w-3.5" />, title: "W (удержание) — тяга", desc: "Тяга подаётся ТОЛЬКО пока зажата клавиша W. Отпускание W глушит тягу, дрон начинает падать вниз под силой тяжести." },
                { icon: <RotateCcw className="h-3.5 w-3.5" />, title: "A / D — рыскание", desc: "Поворот по курсу. Используйте для наведения на цель, не меняя крена." },
                { icon: <Crosshair className="h-3.5 w-3.5" />, title: "H — режим полёта ACRO / ANGLE", desc: "ANGLE: стик задаёт угол наклона со стабилизацией. ACRO: стик задаёт угловую скорость без автовыравнивания — как настоящий FPV, вращение нужно гасить вручную." },
                { icon: <Crosshair className="h-3.5 w-3.5" />, title: "R — выпуск борта", desc: "Поднимает новый дрон со стартовой площадки. После подрыва включает ghost-камеру." },
                { icon: <Keyboard className="h-3.5 w-3.5" />, title: "ESC — пауза", desc: "Останавливает симуляцию и открывает это окно." },
              ].map((row) => (
                <div key={row.title} className="flex gap-3 border border-line/70 bg-panel2/40 p-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-linebright/60 text-lime">
                    {row.icon}
                  </span>
                  <div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-cream/90">{row.title}</div>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 border border-amber/30 bg-amber/[0.05] p-2.5">
              <div className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber">
                <Gauge className="h-3 w-3" /> контроль контакта
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Взрыватель срабатывает только при контакте носовой части БЧ с поверхностью или целью. Аккуратная посадка
                на шасси без касания носа детонации не вызывает.
              </p>
            </div>
          </div>

          <div className="p-5">
            <SectionTitle index="02">Параметры пилотирования</SectionTitle>
            <div className="mt-2 divide-y divide-line/70">
              <Toggle
                checked={settings.invertPitch}
                onChange={(v) => onSettings({ ...settings, invertPitch: v })}
                label="Инвертированное управление тангажом"
                hint={
                  settings.invertPitch
                    ? "ВКЛ: мышь вверх — нос поднимается. Для снижения тяните мышь вниз."
                    : "ВЫКЛ: мышь вверх — нос опускается, дрон летит вперёд."
                }
              />
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-cream/90">Чувствительность стика</span>
                  <span className="stat-num text-[11px] text-lime">{Math.round(settings.sensitivity * 100)}%</span>
                </div>
                <input
                  className="range-lime mt-3"
                  type="range"
                  min={0.45}
                  max={1.7}
                  step={0.05}
                  value={settings.sensitivity}
                  onChange={(e) => onSettings({ ...settings, sensitivity: Number(e.target.value) })}
                />
                <div className="mt-1.5 flex justify-between font-mono text-[8px] uppercase tracking-[0.1em] text-faint">
                  <span>точный контроль</span>
                  <span>реактивный отклик</span>
                </div>
              </div>
              <Toggle
                checked={!settings.muted}
                onChange={(v) => onSettings({ ...settings, muted: !v })}
                label="Звуковое сопровождение"
                hint="Синтезированные моторы, ветер, попадания и подрыв."
              />
            </div>

            <div className="mt-4">
              <SectionTitle index="03" right={<span className="font-mono text-[8px] text-faint">{warhead.name}</span>}>
                {missionActive ? "Следующий борт" : "Боевая часть"}
              </SectionTitle>
              <div className="mt-2">
                <WarheadPicker value={warheadId} onChange={onWarhead} />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                Смена нагрузки доступна перед выпуском. Текущий борт сохраняет установленную БЧ до подрыва или посадки.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5 border border-line bg-panel2/40 px-3 py-2">
              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">инверсия</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-cream">
                {settings.invertPitch ? <span className="text-amber">ВКЛ</span> : <span className="text-lime">ВЫКЛ</span>}
              </span>
              <span className="ml-auto flex items-center gap-1 font-mono text-[8px] uppercase text-faint">
                {settings.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {settings.muted ? "без звука" : "звук активен"}
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="btn-primary clip-corner h-11 flex-1 text-[13px]">
                {missionActive ? "Продолжить полёт" : "Вернуться в ангар"}
              </button>
              {missionActive && (
                <button type="button" onClick={onExit} className="btn-ghost clip-corner h-11 px-3.5">
                  в ангар
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel2/30 px-5 py-2.5">
          <span className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" /> настройки применяются мгновенно
          </span>
          <div className="flex items-center gap-1.5">
            <Key>ESC</Key>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">закрыть</span>
            <span className="ml-2 flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-faint">
              <ArrowUp className="h-2.5 w-2.5" />
              <ArrowDown className="h-2.5 w-2.5" /> газ
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
