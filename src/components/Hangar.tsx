import {
  Activity,
  ChevronRight,
  Crosshair,
  Drone,
  Gauge,
  Keyboard,
  MousePointer2,
  Radio,
  Settings2,
  ShieldCheck,
  Signal,
  Target,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from "lucide-react";
import { HangarPreview } from "./HangarPreview";
import { Corners, Key, MissionMap, SectionTitle, StatBar, Toggle, WarheadGlyph, WarheadPicker } from "./ui";
import { getWarhead, WARHEADS } from "@/game/warheads";
import type { FlightHistory, SimSettings, WarheadId } from "@/game/types";
import { cn } from "@/utils/cn";

interface HangarProps {
  warheadId: WarheadId;
  onWarhead: (id: WarheadId) => void;
  settings: SimSettings;
  onSettings: (settings: SimSettings) => void;
  onLaunch: () => void;
  history: FlightHistory[];
  onOpenSettings: () => void;
}

const operational = [
  { label: "Л/С", value: "32", hint: "личный состав" },
  { label: "АВТО", value: "05", hint: "транспорт" },
  { label: "БРОНЯ", value: "03", hint: "БТР-80" },
];

const controls = [
  { k: "W", t: "Тяга / взлёт", d: "удерживайте — тяга подаётся, отпустите — дрон падает" },
  { k: "Мышь", t: "Тангаж и крен", d: "клик захватывает мышь, прицел зафиксирован по центру" },
  { k: "A / D", t: "Рыскание", d: "поворот по курсу без изменения крена" },
  { k: "H", t: "ACRO / ANGLE", d: "свободный rate-режим или стабилизированный угол" },
  { k: "R", t: "Новый борт", d: "выпуск дрона со стартовой площадки" },
];

export function Hangar({ warheadId, onWarhead, settings, onSettings, onLaunch, history, onOpenSettings }: HangarProps) {
  const warhead = getWarhead(warheadId);
  const currentIndex = WARHEADS.findIndex((w) => w.id === warheadId) + 1;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-base text-cream">
      <div className="studio-bg pointer-events-none fixed inset-0" />
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-[.5]" />
      <div className="noise-layer pointer-events-none fixed inset-0 opacity-[0.028]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* ------------------------------- header ------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-line/80 bg-base/80 glass-blur">
        <div className="mx-auto flex h-[64px] max-w-[1560px] items-center justify-between gap-6 px-4 md:px-7">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-9 w-9 items-center justify-center border border-white/15 bg-gradient-to-br from-white/[0.12] to-white/[0.02]">
              <Drone className="h-[21px] w-[21px] text-cream" strokeWidth={1.4} />
              <span className="absolute -right-px -top-px h-1.5 w-1.5 bg-cream/70" />
            </div>
            <div>
              <div className="display text-[21px] font-semibold leading-none tracking-[0.15em]">АЭРОФРОНТ</div>
              <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.26em] text-faint">
                FPV kamikaze systems · полигон 04
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {[
              { name: "АНГАР", href: "#hangar" },
              { name: "ПОЛИГОН 04", href: "#mission" },
              { name: "БРИФИНГ", href: "#controls" },
              { name: "ЖУРНАЛ", href: "#log" },
            ].map((item, i) => (
              <a
                key={item.name}
                href={item.href}
                className={cn(
                  "relative px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.18em] transition-colors",
                  i === 0 ? "text-cream" : "text-muted hover:text-cream",
                )}
              >
                {i === 0 && <span className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-cream to-transparent" />}
                {item.name}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <div className="mr-2 hidden items-center gap-2 border border-white/10 bg-white/[0.03] px-2.5 py-1.5 md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d8bb92]" />
              <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted">Симулятор готов</span>
            </div>
            <button
              type="button"
              onClick={() => onSettings({ ...settings, muted: !settings.muted })}
              aria-label="Звук"
              className="flex h-8 w-8 items-center justify-center border border-transparent text-muted transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-cream"
            >
              {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Настройки"
              className="flex h-8 w-8 items-center justify-center border border-transparent text-muted transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-cream"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1560px] px-4 pb-10 pt-5 md:px-7">
        {/* --------------------------- intro --------------------------- */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-limedim">
              <Crosshair className="h-3 w-3" /> Учебно-тренировочный комплекс
            </div>
            <h1 className="mt-1.5 display text-[34px] font-semibold uppercase leading-[0.92] tracking-[0.035em] md:text-[43px]">
              Подготовка ударного дрона
            </h1>
            <p className="mt-2 max-w-[62ch] text-[12px] leading-relaxed text-muted">
              Стол сборки, проверка боевой нагрузки и выпуск борта на полигон. Все параметры применяются к следующему
              вылету.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[8.5px] uppercase tracking-[0.15em] text-faint">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-[#c5a98a]" /> облачно · 12 °C
            </span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span className="flex items-center gap-1.5">
              <Wind className="h-3 w-3" /> ветер 4 м/с
            </span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span className="flex items-center gap-1.5">
              <Signal className="h-3 w-3" /> 5.8 ГГц
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          {/* --------------------------- workbench hero --------------------------- */}
          <section id="hangar" className="xl:col-span-7">
            <div className="panel relative overflow-hidden">
              <div className="relative h-[440px] sm:h-[540px] lg:h-[660px]">
                <HangarPreview warheadId={warheadId} />
                <div className="pointer-events-none absolute left-0 top-0 h-24 w-24 border-l border-t border-white/10" />
                <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 border-r border-t border-white/10" />

                <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2">
                  <span className="glass-chip flex items-center gap-1.5 px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-cream">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#d8bb92]" /> борт 04
                  </span>
                  <span className="glass-chip px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted">
                    strike / fpv
                  </span>
                  <span className="glass-chip hidden px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted sm:block">
                    учебная конфигурация
                  </span>
                </div>

                <div className="pointer-events-none absolute right-4 top-4 text-right">
                  <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-faint">установленная нагрузка</div>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className="display text-[19px] font-medium tracking-wide text-[#e4cba7]">{warhead.name}</span>
                    <ShieldCheck className="h-4 w-4 text-[#e4cba7]" />
                  </div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-faint">
                    {warhead.massKg} кг · {warhead.caliberMm} мм
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#08090a] via-[#08090a]/70 to-transparent p-4 pb-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <span className="h-px w-8 bg-gradient-to-r from-transparent to-white/60" />
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-limedim">
                      FPV-КХ8 · стол сборки
                    </span>
                  </div>
                  <h2 className="mt-1.5 display text-[40px] font-semibold uppercase leading-[0.9] tracking-[0.02em] text-cream sm:text-[54px]">
                    «Стрела»
                  </h2>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[8.5px] uppercase tracking-[0.13em] text-muted">
                    <span>рама 8″ карбон</span>
                    <span className="h-2.5 w-px bg-white/15" />
                    <span>6S Li-ion</span>
                    <span className="h-2.5 w-px bg-white/15" />
                    <span>куровой контур</span>
                    <span className="h-2.5 w-px bg-white/15" />
                    <span>1.24 кг</span>
                  </div>
                </div>

                <div className="pointer-events-none absolute bottom-[118px] right-5 hidden items-center gap-2 rounded-sm border border-white/10 bg-black/35 px-2.5 py-1.5 backdrop-blur-sm sm:flex">
                  <MousePointer2 className="h-3.5 w-3.5 text-limedim" />
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                    обзор · колесо — масштаб
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-gradient-to-r from-panel2/70 via-panel/50 to-panel2/30 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.13em] text-muted">6S · 14.8 В</span>
                  <span className="hidden h-3 w-px bg-line sm:block" />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.13em] text-muted">масса 1.24 кг</span>
                  <span className="hidden h-3 w-px bg-line sm:block" />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.13em] text-muted">VTX 800 мВт</span>
                  <span className="hidden h-3 w-px bg-line md:block" />
                  <span className="hidden font-mono text-[8.5px] uppercase tracking-[0.13em] text-muted md:inline">
                    до 118 км/ч
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-faint">
                  <span className="h-1 w-1 rounded-full bg-[#d8bb92]" /> 3D-инспекция · орбита вокруг борта
                </div>
              </div>
            </div>
          </section>

          {/* --------------------------- payload + pilot --------------------------- */}
          <section className="xl:col-span-5">
            <div className="panel relative flex h-full flex-col p-4 sm:p-5">
              <Corners />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 card-sheen" />
              <SectionTitle
                index="01"
                right={
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">{currentIndex} / 3</span>
                }
              >
                Боевая часть
              </SectionTitle>
              <div className="relative mt-3">
                <WarheadPicker value={warheadId} onChange={onWarhead} />
              </div>

              <div className="relative mt-3 border border-line bg-gradient-to-br from-white/[0.035] to-transparent p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-faint">{warhead.fullName}</div>
                    <div className="mt-1 display text-[16px] font-medium leading-snug text-cream/95">{warhead.effect}</div>
                  </div>
                  <WarheadGlyph id={warhead.id} className="h-10 w-[86px] shrink-0" accent={warhead.accent} />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">{warhead.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {warhead.specs.map((spec) => (
                    <div key={spec.label} className="flex items-baseline justify-between gap-2 border-b border-line/70 pb-1.5">
                      <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{spec.label}</span>
                      <span className="stat-num text-[10px] text-cream/90">{spec.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <StatBar label="Скорость" value={warhead.bars.speed} accent={warhead.accent} />
                  <StatBar label="Осколки" value={warhead.bars.blast} accent={warhead.accent} />
                  <StatBar label="Пробитие" value={warhead.bars.armor} accent={warhead.accent} />
                  <StatBar label="Контроль" value={warhead.bars.control} accent={warhead.accent} />
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2 border border-line bg-white/[0.02] px-3 py-2.5">
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[#d8bb92]" />
                <p className="text-[10.5px] leading-relaxed text-muted">
                  Нагрузка меняет массу и лётные характеристики борта. Параметры применяются при выпуске нового дрона.
                </p>
              </div>
              <div className="mt-auto flex gap-2 pt-3">
                <button type="button" onClick={onLaunch} className="btn-primary clip-corner h-[52px] flex-1 px-4 text-[15px]">
                  <Zap className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  Вылет на полигон
                  <span className="ml-1 border border-black/20 bg-black/[0.06] px-1.5 py-0.5 font-mono text-[9px] tracking-normal">
                    R
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  aria-label="Настройки вылета"
                  className="btn-ghost clip-corner h-[52px] w-[52px] shrink-0"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-faint">
                <Keyboard className="h-3 w-3" /> клавиатура + мышь · допуск к симуляции
              </div>
            </div>
          </section>
        </div>

        {/* --------------------------- briefing row --------------------------- */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <section id="mission" className="panel relative p-4 sm:p-5 lg:col-span-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 card-sheen" />
            <SectionTitle
              index="03"
              right={<span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#d8bb92]">задача · сектор Б</span>}
            >
              Боевая задача
            </SectionTitle>
            <p className="mt-3 max-w-[54ch] text-[12px] leading-relaxed text-muted">
              Выйти в район заброшенного объекта «Лиман‑4», скрытно обойти лесополосу и нанести удар по скоплению техники и
              живой силы. Поражение подтверждается телеметрией и характером контакта.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {operational.map((o) => (
                <div key={o.label} className="relative border border-line bg-gradient-to-b from-white/[0.03] to-transparent p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-faint">{o.label}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="stat-num text-[24px] leading-none text-cream">{o.value}</span>
                    <span className="font-mono text-[8px] uppercase text-muted">{o.hint}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative mt-3 border border-line bg-gradient-to-b from-panel2/60 to-base/60">
              <MissionMap className="h-[150px] w-full" />
              <div className="absolute left-2 top-2 flex items-center gap-1.5 border border-white/10 bg-black/50 px-1.5 py-1 font-mono text-[7.5px] uppercase tracking-[0.12em] text-muted backdrop-blur-sm">
                <Target className="h-2.5 w-2.5 text-[#cf8f79]" /> тактическая карта · 1:4000
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 border-l border-[#d8bb92]/50 bg-white/[0.03] px-3 py-2.5">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[#d8bb92]" />
              <p className="text-[10.5px] leading-relaxed text-muted">
                Оценивается контакт носовой части БЧ. Посадка на шасси без касания носа — безопасна. Заряд расходуется на
                тягу и манёвры.
              </p>
            </div>
          </section>

          <section id="controls" className="panel relative p-4 sm:p-5 lg:col-span-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 card-sheen" />
            <SectionTitle index="04" right={<span className="font-mono text-[8.5px] text-faint">FPV / H-режим</span>}>
              Органы управления
            </SectionTitle>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-4">
              <div className="space-y-1.5">
                {controls.map((row) => (
                  <div key={row.k} className="flex items-center gap-2.5 border-b border-line/60 pb-1.5 last:border-0">
                    <Key>{row.k}</Key>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[9px] uppercase tracking-[0.07em] text-cream/90">{row.t}</div>
                      <div className="truncate font-mono text-[7.5px] uppercase tracking-[0.05em] text-faint" title={row.d}>
                        {row.d}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="relative flex w-[96px] items-center justify-center border border-line bg-gradient-to-b from-white/[0.03] to-transparent">
                <span className="absolute left-2 top-2 font-mono text-[7px] text-faint">Л</span>
                <span className="absolute right-2 top-2 font-mono text-[7px] text-faint">П</span>
                <div className="relative mt-1 h-[82px] w-[50px] rounded-[16px] border border-linebright bg-gradient-to-b from-[#262a2e] to-[#15171a] shadow-inner">
                  <span className="absolute left-1/2 top-2 h-3.5 w-[3px] -translate-x-1/2 rounded-full bg-cream/80" />
                  <span className="absolute left-1/2 top-1/2 h-[19px] w-[19px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50">
                    <span className="absolute inset-[5px] rounded-full bg-cream" />
                  </span>
                  <MousePointer2 className="absolute -bottom-3 -right-3 h-5 w-5 text-cream" />
                </div>
                <span className="absolute bottom-2 font-mono text-[6.5px] uppercase tracking-[0.08em] text-muted">
                  наклон = тангаж / крен
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="border border-line bg-white/[0.025] p-2.5">
                <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-cream">
                  <Crosshair className="h-3 w-3" /> FPV-камера
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-muted">Вид от первого лица, нос БЧ в кадре — контроль контакта.</p>
              </div>
              <div className="border border-line bg-white/[0.025] p-2.5">
                <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#d8bb92]">
                  <Radio className="h-3 w-3" /> ACRO
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-muted">Свободное вращение по H, без автовыравнивания.</p>
              </div>
            </div>

            <div className="mt-3 border-t border-line pt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-cream">Пилот</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-faint">калибровка</span>
              </div>
              <Toggle
                checked={settings.invertPitch}
                onChange={(v) => onSettings({ ...settings, invertPitch: v })}
                label="Инверсия тангажа"
                hint={settings.invertPitch ? "мышь вверх — нос вверх" : "мышь вверх — нос вниз"}
              />
              <div className="py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-cream/90">Чувствительность</span>
                  <span className="stat-num text-[10px] text-cream">{Math.round(settings.sensitivity * 100)}%</span>
                </div>
                <input
                  className="range-lime mt-2.5"
                  type="range"
                  min={0.45}
                  max={1.7}
                  step={0.05}
                  value={settings.sensitivity}
                  onChange={(e) => onSettings({ ...settings, sensitivity: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center justify-between border-t border-line/70 py-2">
                <button
                  type="button"
                  onClick={() => onSettings({ ...settings, muted: !settings.muted })}
                  className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted transition hover:text-cream"
                >
                  {settings.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  звук {settings.muted ? "выкл" : "вкл"}
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted transition hover:text-cream"
                >
                  все настройки <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </section>

          <section id="log" className="panel relative flex flex-col p-4 sm:p-5 lg:col-span-3">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 card-sheen" />
            <SectionTitle index="05" right={<span className="font-mono text-[8.5px] text-faint">{history.length}</span>}>
              Журнал вылетов
            </SectionTitle>
            {history.length === 0 ? (
              <div className="mt-3 flex min-h-[132px] flex-1 flex-col items-center justify-center border border-dashed border-line bg-black/20 px-5 py-6 text-center">
                <Gauge className="h-7 w-7 text-linebright" strokeWidth={1.2} />
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">записей нет</div>
                <p className="mt-1.5 max-w-[28ch] text-[10.5px] leading-relaxed text-faint">
                  Первый вылет будет зафиксирован здесь: нагрузка, время, поражённые цели.
                </p>
              </div>
            ) : (
              <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-hidden">
                {history.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="border border-line bg-white/[0.02] px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-cream/85">
                        {getWarhead(entry.warhead).name}
                      </span>
                      <span className="font-mono text-[8px] text-faint">{formatTime(entry.flightTime)}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.06em] text-muted">
                      {entry.targetName}
                    </div>
                    <div className="mt-1 flex gap-3 font-mono text-[8px] text-faint">
                      <span>
                        ПЕХ <span className="text-cream/80">{entry.soldiersDestroyed}</span>
                      </span>
                      <span>
                        ТЕХ <span className="text-cream/80">{entry.vehiclesDestroyed}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto border-t border-line pt-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-faint">Готовность системы</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-cream">номинал</span>
              </div>
              <div className="mt-1.5 flex gap-0.5">
                {Array.from({ length: 22 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2.5 flex-1",
                      i < 21 ? "bg-gradient-to-t from-white/25 to-white/60" : "bg-line",
                    )}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-line pt-4 font-mono text-[8px] uppercase tracking-[0.14em] text-faint sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Аэрофронт · учебный симулятор FPV</span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span>Сборка 1.4.2 / полигон 04</span>
            <span className="hidden h-3 w-px bg-line md:block" />
            <span>Синтетическая среда · не боевое применение</span>
          </div>
          <div className="flex items-center gap-1.5 text-limedim">
            <Target className="h-3 w-3" />
            Тренировка точности контакта
          </div>
        </footer>
      </main>
    </div>
  );
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
