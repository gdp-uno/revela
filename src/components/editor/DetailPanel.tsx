"use client";
import type { DetailParams } from "@/lib/gl-engine";
import Slider from "./Slider";

export const DEFAULT_DETAIL: DetailParams = {
  sharpAmount: 0,
  sharpRadius: 1.0,
  sharpDetail: 25,
  nrLum:   0,
  nrColor: 25,
};

interface Props {
  value: DetailParams;
  onChange: (v: DetailParams) => void;
}

export default function DetailPanel({ value, onChange }: Props) {
  const set = (patch: Partial<DetailParams>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">シャープ</span>
      <Slider label="量"      value={value.sharpAmount} min={0}   max={150} defaultValue={0}   onChange={v => set({ sharpAmount: v })} />
      <Slider label="半径"    value={value.sharpRadius} min={0.5} max={3.0} defaultValue={1.0} step={0.1} onChange={v => set({ sharpRadius: v })} />
      <Slider label="ディテール" value={value.sharpDetail} min={0} max={100} defaultValue={25} onChange={v => set({ sharpDetail: v })} />
      <div className="h-px bg-zinc-800" />
      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">ノイズ除去</span>
      <Slider label="輝度"    value={value.nrLum}   min={0} max={100} defaultValue={0}  onChange={v => set({ nrLum: v })} />
      <Slider label="カラー"  value={value.nrColor} min={0} max={100} defaultValue={25} onChange={v => set({ nrColor: v })} />
    </div>
  );
}
