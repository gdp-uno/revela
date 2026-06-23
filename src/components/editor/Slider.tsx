"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const trackRef  = useRef<HTMLDivElement>(null);
  const dragRef   = useRef<{ lastX: number; currentVal: number } | null>(null);
  const lastTapRef = useRef(0);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const decimals = step >= 1 ? 0 : Math.round(-Math.log10(step));

  const snap = useCallback(
    (v: number) => {
      const s = Math.round(v / step) * step;
      return parseFloat(Math.max(min, Math.min(max, s)).toFixed(decimals));
    },
    [min, max, step, decimals]
  );

  const pct     = ((value - min) / (max - min)) * 100;
  const zeroPct = ((-min) / (max - min)) * 100;
  const isPos   = value >= 0;
  const barLeft  = isPos ? zeroPct : pct;
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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on Escape
  useEffect(() => {
    if (!menuPos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuPos(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuPos]);

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
        onContextMenu={handleContextMenu}
      >
        <div className="absolute inset-x-0 h-px bg-zinc-700" />
        <div className="absolute w-px h-2 bg-zinc-600" style={{ left: `${zeroPct}%` }} />
        <div className="absolute h-px bg-zinc-300" style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-white shadow-md pointer-events-none border border-zinc-400"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>

      {/* Right-click context menu */}
      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
          <div
            className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl py-1 min-w-[140px]"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              onClick={() => { onChange(defaultValue); setMenuPos(null); }}
            >
              デフォルト値にリセット
            </button>
            <div className="px-3 pt-1 pb-0.5 text-[10px] text-zinc-600">
              ダブルクリックでも可
            </div>
          </div>
        </>
      )}
    </div>
  );
}
