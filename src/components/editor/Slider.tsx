"use client";
import { useCallback, useRef } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  onChange: (v: number) => void;
  unit?: string;
}

export default function Slider({
  label, value, min, max, step = 1, defaultValue = 0, onChange, unit = "",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ lastX: number; currentVal: number } | null>(null);
  const lastTapRef = useRef(0);

  const decimals = step >= 1 ? 0 : Math.round(-Math.log10(step));

  const snap = useCallback(
    (v: number) => {
      const s = Math.round(v / step) * step;
      return parseFloat(Math.max(min, Math.min(max, s)).toFixed(decimals));
    },
    [min, max, step, decimals]
  );

  const pct = ((value - min) / (max - min)) * 100;
  const zeroPct = ((-min) / (max - min)) * 100;
  const isPos = value >= 0;
  const barLeft = isPos ? zeroPct : pct;
  const barWidth = isPos ? pct - zeroPct : zeroPct - pct;

  const displayVal = (value > 0 ? "+" : "") + value.toFixed(decimals);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const v = snap(min + ratio * (max - min));
      dragRef.current = { lastX: e.clientX, currentVal: v };
      onChange(v);
    },
    [min, max, snap, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const fine = e.ctrlKey || e.metaKey;
      const delta = ((e.clientX - dragRef.current.lastX) / rect.width) * (max - min) * (fine ? 0.1 : 1);
      const v = snap(dragRef.current.currentVal + delta);
      dragRef.current = { lastX: e.clientX, currentVal: v };
      onChange(v);
    },
    [min, max, snap, onChange]
  );

  const handlePointerUp = useCallback(() => { dragRef.current = null; }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => { e.preventDefault(); onChange(defaultValue); },
    [defaultValue, onChange]
  );

  const handleTouchEnd = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) onChange(defaultValue);
    lastTapRef.current = now;
  }, [defaultValue, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-medium tracking-widest uppercase text-zinc-500">{label}</span>
        <span className="text-[11px] text-zinc-300 tabular-nums">{displayVal}{unit}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-4 flex items-center cursor-ew-resize touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-x-0 h-px bg-zinc-700" />
        <div className="absolute w-px h-2 bg-zinc-600" style={{ left: `${zeroPct}%` }} />
        <div className="absolute h-px bg-zinc-300" style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-white shadow-md pointer-events-none border border-zinc-400"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
    </div>
  );
}
