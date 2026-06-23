"use client";
import type { MaskParams, MaskType } from "@/lib/gl-engine";
import Slider from "./Slider";

export const DEFAULT_MASK: MaskParams = {
  type:       "none",
  invert:     false,
  p0:         [0, 0.5, 0.2, 0],
  p1:         [0.15, 0, 0, 0],
  exposure:   0, contrast: 0, highlights: 0, shadows: 0,
  sat: 0, temp: 0, tint: 0,
};

const MASK_TYPES: { value: MaskType; label: string }[] = [
  { value: "none",             label: "なし" },
  { value: "linear_gradient",  label: "線形グラデーション" },
  { value: "radial_gradient",  label: "楕円グラデーション" },
  { value: "lum_range",        label: "輝度範囲" },
  { value: "color_range",      label: "カラー範囲" },
];

interface Props {
  value: MaskParams;
  onChange: (v: MaskParams) => void;
}

export default function MaskPanel({ value, onChange }: Props) {
  const set = (patch: Partial<MaskParams>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-3">
      {/* Type selector */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide">マスクタイプ</span>
        <div className="flex flex-wrap gap-1">
          {MASK_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => set({ type: t.value })}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                value.type === t.value
                  ? "bg-white text-black"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {value.type !== "none" && (
        <>
          {/* Invert */}
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={value.invert}
              onChange={e => set({ invert: e.target.checked })}
              className="accent-white"
            />
            マスクを反転
          </label>

          <div className="h-px bg-zinc-800" />

          {/* Type-specific params */}
          {value.type === "linear_gradient" && (
            <div className="flex flex-col gap-2">
              <Slider label="角度" value={value.p0[0] * (180 / Math.PI)} min={-180} max={180} defaultValue={0}
                onChange={v => set({ p0: [v * (Math.PI / 180), value.p0[1], value.p0[2], value.p0[3]] })} />
              <Slider label="位置" value={value.p0[1] * 100} min={0} max={100} defaultValue={50}
                onChange={v => set({ p0: [value.p0[0], v / 100, value.p0[2], value.p0[3]] })} />
              <Slider label="フェザー" value={value.p0[2] * 100} min={0} max={100} defaultValue={20}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], v / 100, value.p0[3]] })} />
            </div>
          )}

          {value.type === "radial_gradient" && (
            <div className="flex flex-col gap-2">
              <Slider label="中心X" value={value.p0[0] * 100} min={0} max={100} defaultValue={50}
                onChange={v => set({ p0: [v / 100, value.p0[1], value.p0[2], value.p0[3]] })} />
              <Slider label="中心Y" value={value.p0[1] * 100} min={0} max={100} defaultValue={50}
                onChange={v => set({ p0: [value.p0[0], v / 100, value.p0[2], value.p0[3]] })} />
              <Slider label="半径X" value={value.p0[2] * 100} min={1} max={100} defaultValue={30}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], v / 100, value.p0[3]] })} />
              <Slider label="半径Y" value={value.p0[3] * 100} min={1} max={100} defaultValue={30}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], value.p0[2], v / 100] })} />
              <Slider label="フェザー" value={value.p1[0] * 100} min={0} max={100} defaultValue={15}
                onChange={v => set({ p1: [v / 100, value.p1[1], value.p1[2], value.p1[3]] })} />
            </div>
          )}

          {value.type === "lum_range" && (
            <div className="flex flex-col gap-2">
              <Slider label="最小輝度" value={value.p0[0] * 100} min={0} max={100} defaultValue={0}
                onChange={v => set({ p0: [v / 100, value.p0[1], value.p0[2], value.p0[3]] })} />
              <Slider label="最大輝度" value={value.p0[1] * 100} min={0} max={100} defaultValue={100}
                onChange={v => set({ p0: [value.p0[0], v / 100, value.p0[2], value.p0[3]] })} />
              <Slider label="スムーズLo" value={value.p0[2] * 100} min={0} max={30} defaultValue={5}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], v / 100, value.p0[3]] })} />
              <Slider label="スムーズHi" value={value.p0[3] * 100} min={0} max={30} defaultValue={5}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], value.p0[2], v / 100] })} />
            </div>
          )}

          {value.type === "color_range" && (
            <div className="flex flex-col gap-2">
              <Slider label="色相中心" value={value.p0[0] * 360} min={0} max={360} defaultValue={0}
                onChange={v => set({ p0: [v / 360, value.p0[1], value.p0[2], value.p0[3]] })} />
              <Slider label="色相幅" value={value.p0[1] * 100} min={0} max={100} defaultValue={10}
                onChange={v => set({ p0: [value.p0[0], v / 100, value.p0[2], value.p0[3]] })} />
              <Slider label="彩度Min" value={value.p0[2] * 100} min={0} max={100} defaultValue={20}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], v / 100, value.p0[3]] })} />
              <Slider label="彩度Max" value={value.p0[3] * 100} min={0} max={100} defaultValue={100}
                onChange={v => set({ p0: [value.p0[0], value.p0[1], value.p0[2], v / 100] })} />
            </div>
          )}

          <div className="h-px bg-zinc-800" />

          {/* Mask adjustments */}
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">マスク内補正</span>
          <Slider label="露光量" value={value.exposure}   min={-5}   max={5}   defaultValue={0} onChange={v => set({ exposure: v })} />
          <Slider label="コントラスト" value={value.contrast} min={-100} max={100} defaultValue={0} onChange={v => set({ contrast: v })} />
          <Slider label="ハイライト" value={value.highlights} min={-100} max={100} defaultValue={0} onChange={v => set({ highlights: v })} />
          <Slider label="シャドウ" value={value.shadows} min={-100} max={100} defaultValue={0} onChange={v => set({ shadows: v })} />
          <Slider label="彩度" value={value.sat} min={-100} max={100} defaultValue={0} onChange={v => set({ sat: v })} />
          <Slider label="色温度" value={value.temp} min={-100} max={100} defaultValue={0} onChange={v => set({ temp: v })} />
          <Slider label="色かぶり補正" value={value.tint} min={-100} max={100} defaultValue={0} onChange={v => set({ tint: v })} />
        </>
      )}
    </div>
  );
}
