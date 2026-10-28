import type { Warhead, WarheadId } from "./types";

export const WARHEADS: Warhead[] = [
  {
    id: "pg7vl",
    index: "01",
    name: "ПГ-7ВЛ",
    fullName: "ПГ-7ВЛ «Крюк»",
    designation: "PG-7VL",
    class: "Кумулятивная · тандем-нет",
    massKg: 2.9,
    caliberMm: 93,
    blastRadius: 7.5,
    armorPower: 62,
    speedFactor: 1.12,
    batteryPenalty: 0.95,
    accent: "#cfd4d9",
    description:
      "Кумулятивная боевая часть повышенного могущества. Узкий профиль и малая масса — лучший баланс скорости и управления для одиночной цели.",
    effect: "Пробитие до 500 мм за динамической защитой. Уязвимы БТР и грузовой транспорт.",
    specs: [
      { label: "Масса БЧ", value: "2.9 кг" },
      { label: "Калибр", value: "93 мм" },
      { label: "Пробитие", value: "≈ 500 мм" },
      { label: "Радиус осколков", value: "7.5 м" },
    ],
    bars: { speed: 87, blast: 55, armor: 72, control: 85 },
  },
  {
    id: "pg7vr",
    index: "02",
    name: "ПГ-7ВР",
    fullName: "ПГ-7ВР «Резюме»",
    designation: "PG-7VR",
    class: "Тандемная кумулятивная",
    massKg: 4.5,
    caliberMm: 105,
    blastRadius: 6,
    armorPower: 98,
    speedFactor: 0.93,
    batteryPenalty: 1.12,
    accent: "#d8bb92",
    description:
      "Тандемная БЧ: лидирующий заряд снимает динамическую защиту, основной формирует кумулятивную струю. Тяжёлая, но бронебойная.",
    effect: "Пробитие до 750 мм. Расчёт на бронетехнику с ДЗ и бетонные укрытия.",
    specs: [
      { label: "Масса БЧ", value: "4.5 кг" },
      { label: "Калибр", value: "105 мм" },
      { label: "Пробитие", value: "≈ 750 мм" },
      { label: "Радиус осколков", value: "6.0 м" },
    ],
    bars: { speed: 76, blast: 46, armor: 100, control: 74 },
  },
  {
    id: "tbg7v",
    index: "03",
    name: "ТБГ-7В",
    fullName: "ТБГ-7В «Термобарический»",
    designation: "TBG-7V",
    class: "Термобарическая",
    massKg: 4.5,
    caliberMm: 105,
    blastRadius: 13,
    armorPower: 34,
    speedFactor: 0.88,
    batteryPenalty: 1.2,
    accent: "#c9927c",
    description:
      "Объёмно-детонирующая боевая часть. Облако аэрозоля подрывается с формированием избыточного давления — работает по площади и закрытым пространствам.",
    effect: "Радиус поражения до 13 м. Эффективна против пехоты, окопов и небронированной техники.",
    specs: [
      { label: "Масса БЧ", value: "4.5 кг" },
      { label: "Калибр", value: "105 мм" },
      { label: "Пробитие", value: "≈ 180 мм" },
      { label: "Радиус ударной волны", value: "13.0 м" },
    ],
    bars: { speed: 70, blast: 100, armor: 44, control: 68 },
  },
];

export const getWarhead = (id: WarheadId): Warhead =>
  WARHEADS.find((warhead) => warhead.id === id) ?? WARHEADS[0];
