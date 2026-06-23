"use client";
import { useState } from "react";
import Slider from "./Slider";
import type { ColorChannel } from "@/lib/gl-engine";

export type { ColorChannel };

export interface ColorMixerParams {
  red: ColorChannel;
  orange: ColorChannel;
  yellow: ColorChannel;
  green: ColorChannel;
  aqua: ColorChannel;
  blue: ColorChannel;
  purple: ColorChannel;
  magenta: ColorChannel;
}

export const DEFAULT_COLOR_MIXER: ColorMixerParams = {
  red:     { hue: 0, sat: 0, lum: 0 },
  orange:  { hue: 0, sat: 0, lum: 0 },
  yellow:  { hue: 0, sat: 0, lum: 0 },
  green:   { hue: 0, sat: 0, lum: 0 },
  aqua:    { hue: 0, sat: 0, lum: 0 },
  blue:    { hue: 0, sat: 0, lum: 0 },
  purple:  { hue: 0, sat: 0, lum: 0 },
  magenta: { hue: 0, sat: 0, lum: 0 },
};

export function colorMixerToArray(cm: ColorMixerParams): ColorChannel[] {
  return [cm.red, cm.orange, cm.yellow, cm.green, cm.aqua, cm.blue, cm.purple, cm.magenta];
}

const SWATCHES = [
  { key: "red",     label: "R",  bg: "#dc2626" },
  { key: "orange",  label: "Or", bg: "#ea580c" },
  { key: "yellow",  label: "Y",  bg: "#ca8a04" },
  { key: "green",   label: "G",  bg: "#16a34a" },
  { key: "aqua",    label: "Aq", bg: "#0891b2" },
  { key: "blue",    label: "B",  bg: "#2563eb" },
  { key: "purple",  label: "P",  bg: "#9333ea" },
  { key: "magenta", label: "M",  bg: "#db2777" },
] as const;

type SwatchKey = typeof SWATCHES[number]["key"];

interface Props {
  value: ColorMixerParams;
  onChange: (v: ColorMixerParams) => void;
}

export default function ColorMixer({ value, onChange }: Props) {
  const [sel, setSel] = useState<SwatchKey>("red");
  const cur = value[sel];

  const update = (patch: Partial<ColorChannel>) =>
    onChange({ ...value, [sel]: { ...cur, ...patch } });

  const hasChange = (key: SwatchKey) => {
    const c = value[key];
    return c.hue !== 0 || c.sat !== 0 || c.lum !== 0;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Color swatches */}
      <div className="grid grid-cols-4 gap-1">
        {SWATCHES.map(sw => (
          <button
            key={sw.key}
            onClick={() => setSel(sw.key)}
            className={`relative h-7 rounded text-[9px] font-bold transition-all ${
              sel === sw.key
                ? "ring-1 ring-white ring-offset-1 ring-offset-zinc-900 scale-105 shadow-lg"
                : "opacity-60 hover:opacity-90"
            }`}
            style={{ backgroundColor: sw.bg, color: "#fff" }}
          >
            {sw.label}
            {hasChange(sw.key) && (
              <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-white opacity-80" />
            )}
          </button>
        ))}
      </div>

      {/* Selected color label */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SWATCHES.find(s => s.key === sel)?.bg }} />
        <span className="text-[10px] text-zinc-400 capitalize">{sel}</span>
        {hasChange(sel) && (
          <button
            className="ml-auto text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors"
            onClick={() => onChange({ ...value, [sel]: { hue: 0, sat: 0, lum: 0 } })}
          >Reset</button>
        )}
      </div>

      {/* Sliders */}
      <Slider label="HUE" value={cur.hue} min={-100} max={100} onChange={v => update({ hue: v })} />
      <div className="flex flex-col gap-1.5">
        <Slider label="SATURATION" value={cur.sat} min={-100} max={100} onChange={v => update({ sat: v })} />
        {cur.sat !== 0 && (
          <p className="text-[9px] text-zinc-700 pl-0.5">
            色密度結合: 輝度 {cur.sat > 0 ? "-" : "+"}{Math.abs(Math.round(cur.sat * 0.3))}
          </p>
        )}
      </div>
      <Slider label="LUMINANCE" value={cur.lum} min={-100} max={100} onChange={v => update({ lum: v })} />
    </div>
  );
}
