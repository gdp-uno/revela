"use client";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}

export default function Slider({ label, value, min, max, step = 1, onChange, unit = "" }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-400 font-medium tracking-wide uppercase">{label}</span>
        <span className="text-xs text-zinc-300 tabular-nums w-10 text-right">
          {value > 0 ? "+" : ""}{value}{unit}
        </span>
      </div>
      <div className="relative h-1.5 group">
        <div className="absolute inset-0 bg-zinc-700 rounded-full" />
        <div
          className="absolute top-0 left-0 h-full bg-zinc-400 rounded-full"
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
