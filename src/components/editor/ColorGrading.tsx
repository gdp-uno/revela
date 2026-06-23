"use client";
import { useCallback, useEffect, useRef } from "react";
import type { ColorGradingParams, ColorGradingZone } from "@/lib/gl-engine";
import Slider from "./Slider";

export type { ColorGradingParams, ColorGradingZone };

export const DEFAULT_COLOR_GRADING: ColorGradingParams = {
  shadows:    { hue: 0, sat: 0, lum: 0 },
  midtones:   { hue: 0, sat: 0, lum: 0 },
  highlights: { hue: 0, sat: 0, lum: 0 },
  blend:   50,
  balance: 0,
};

const WHEEL = 64;
const R = WHEEL / 2;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = h * 6, i = Math.floor(hh);
  const c = v * s, x = c * (1 - Math.abs(hh % 2 - 1)), m = v - c;
  let r=0,g=0,b=0;
  if      (i<1)[r,g,b]=[c,x,0];
  else if (i<2)[r,g,b]=[x,c,0];
  else if (i<3)[r,g,b]=[0,c,x];
  else if (i<4)[r,g,b]=[0,x,c];
  else if (i<5)[r,g,b]=[x,0,c];
  else         [r,g,b]=[c,0,x];
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}

interface WheelProps {
  label: string;
  value: ColorGradingZone;
  onChange: (z: ColorGradingZone) => void;
}

function ColorWheel({ label, value, onChange }: WheelProps) {
  const bgRef  = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Draw wheel background once
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const id = ctx.createImageData(WHEEL, WHEEL);
    for (let y = 0; y < WHEEL; y++) {
      for (let x = 0; x < WHEEL; x++) {
        const dx = (x - R) / R, dy = (y - R) / R;
        const r = Math.sqrt(dx*dx + dy*dy);
        if (r > 1.0) continue;
        const h = ((Math.atan2(dy, dx) / (Math.PI*2)) + 1) % 1;
        const [rr, gg, bb] = hsvToRgb(h, r, 1.0);
        const i = (y * WHEEL + x) * 4;
        id.data[i]=rr; id.data[i+1]=gg; id.data[i+2]=bb; id.data[i+3]=255;
      }
    }
    ctx.putImageData(id, 0, 0);
    // Darken outer edge slightly
    const grad = ctx.createRadialGradient(R,R,R*0.7,R,R,R);
    grad.addColorStop(0,"transparent"); grad.addColorStop(1,"rgba(0,0,0,0.25)");
    ctx.fillStyle=grad; ctx.fillRect(0,0,WHEEL,WHEEL);
  }, []);

  const updateFromPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dx = (e.clientX - rect.left - R) / R;
    const dy = (e.clientY - rect.top  - R) / R;
    const r  = Math.min(Math.sqrt(dx*dx + dy*dy), 1.0);
    const h  = r < 0.01 ? 0 : ((Math.atan2(dy, dx) / (Math.PI*2)) + 1) % 1;
    onChange({ ...value, hue: h, sat: r });
  }, [value, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    updateFromPointer(e);
  }, [updateFromPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromPointer(e);
  }, [updateFromPointer]);

  const handlePointerUp = useCallback(() => { dragging.current = false; }, []);

  // Dot position
  const dotX = Math.round(R + Math.cos(value.hue * Math.PI*2) * value.sat * R - 4);
  const dotY = Math.round(R + Math.sin(value.hue * Math.PI*2) * value.sat * R - 4);
  const [dr, dg, db] = hsvToRgb(value.hue, value.sat, 1.0);
  const dotColor = `rgb(${dr},${dg},${db})`;
  const hasChange = value.sat > 0.01 || Math.abs(value.lum) > 0.5;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] text-zinc-500 uppercase tracking-wide">{label}</span>
      <div
        ref={wrapRef}
        className="relative rounded-full cursor-crosshair"
        style={{ width: WHEEL, height: WHEEL }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={bgRef} width={WHEEL} height={WHEEL} className="rounded-full block" />
        {/* Dot */}
        <div
          ref={dotRef}
          className="absolute w-2 h-2 rounded-full border border-white shadow-md pointer-events-none"
          style={{
            left: dotX, top: dotY,
            backgroundColor: value.sat < 0.05 ? "#888" : dotColor,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
        {/* Center reset dot */}
        <div
          className="absolute w-1 h-1 rounded-full bg-zinc-600 pointer-events-none"
          style={{ left: R-2, top: R-2 }}
        />
        {/* Change indicator */}
        {hasChange && (
          <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white opacity-70 pointer-events-none" />
        )}
      </div>
      {/* LUM mini slider */}
      <div className="w-full">
        <Slider label="LUM" value={value.lum} min={-100} max={100}
          onChange={lum => onChange({ ...value, lum })} />
      </div>
    </div>
  );
}

interface Props {
  value: ColorGradingParams;
  onChange: (v: ColorGradingParams) => void;
}

const ZONES: { key: keyof Pick<ColorGradingParams, "shadows"|"midtones"|"highlights">; label: string }[] = [
  { key: "shadows",    label: "Shadow" },
  { key: "midtones",  label: "Mid"    },
  { key: "highlights",label: "High"   },
];

export default function ColorGrading({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* 3-way wheels */}
      <div className="flex gap-2 justify-between">
        {ZONES.map(({ key, label }) => (
          <div key={key} className="flex-1">
            <ColorWheel
              label={label}
              value={value[key]}
              onChange={zone => onChange({ ...value, [key]: zone })}
            />
          </div>
        ))}
      </div>
      <div className="h-px bg-zinc-800" />
      <Slider label="BLEND"   value={value.blend}   min={0}    max={100}
        onChange={blend   => onChange({ ...value, blend })} />
      <Slider label="BALANCE" value={value.balance} min={-100} max={100}
        onChange={balance => onChange({ ...value, balance })} />
    </div>
  );
}
