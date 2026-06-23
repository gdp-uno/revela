"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Pt { x: number; y: number; }

// Fritsch-Carlson monotone cubic spline
function evalSpline(sorted: Pt[], x: number): number {
  const n = sorted.length;
  if (n === 0) return x;
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[n - 1].x) return sorted[n - 1].y;
  if (n === 2) {
    const t = (x - sorted[0].x) / (sorted[1].x - sorted[0].x);
    return sorted[0].y + t * (sorted[1].y - sorted[0].y);
  }
  let i = 0;
  while (i < n - 2 && sorted[i + 1].x < x) i++;

  const dx: number[] = [], sl: number[] = [], m = Array(n).fill(0);
  for (let j = 0; j < n - 1; j++) {
    dx[j] = sorted[j + 1].x - sorted[j].x;
    sl[j] = (sorted[j + 1].y - sorted[j].y) / dx[j];
  }
  m[0] = sl[0]; m[n - 1] = sl[n - 2];
  for (let j = 1; j < n - 1; j++) {
    m[j] = sl[j - 1] * sl[j] <= 0 ? 0 : (sl[j - 1] + sl[j]) / 2;
  }
  for (let j = 0; j < n - 1; j++) {
    if (Math.abs(sl[j]) < 1e-10) { m[j] = m[j + 1] = 0; continue; }
    const a = m[j] / sl[j], b = m[j + 1] / sl[j];
    if (a * a + b * b > 9) { const tau = 3 / Math.sqrt(a * a + b * b); m[j] = tau * a * sl[j]; m[j + 1] = tau * b * sl[j]; }
  }
  const h = dx[i], t = (x - sorted[i].x) / h, t2 = t * t, t3 = t2 * t;
  return sorted[i].y * (2*t3-3*t2+1) + h*m[i]*(t3-2*t2+t) + sorted[i+1].y*(-2*t3+3*t2) + h*m[i+1]*(t3-t2);
}

export function generateLUT(points: Pt[]): Float32Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(1, evalSpline(sorted, i / 255)));
  return lut;
}

interface Props { onChange: (lut: Float32Array) => void; }

const SIZE = 176;
const PAD = 8;
const INNER = SIZE - PAD * 2;
const HIT = 0.07;

export default function ToneCurve({ onChange }: Props) {
  const [points, setPoints] = useState<Pt[]>([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragIdx = useRef<number | null>(null);

  const toCurve = (cx: number, cy: number): Pt => ({
    x: Math.max(0, Math.min(1, (cx - PAD) / INNER)),
    y: Math.max(0, Math.min(1, 1 - (cy - PAD) / INNER)),
  });
  const toCanvas = (pt: Pt) => ({ x: PAD + pt.x * INNER, y: PAD + (1 - pt.y) * INNER });

  const findNear = (pts: Pt[], cx: number, cy: number): number => {
    const cur = toCurve(cx, cy);
    return pts.findIndex(p => Math.hypot(p.x - cur.x, p.y - cur.y) < HIT);
  };

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const gx = PAD + INNER * i / 4, gy = PAD + INNER * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, PAD + INNER); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(PAD + INNER, gy); ctx.stroke();
    }
    // Identity
    ctx.strokeStyle = "#3f3f46"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD, PAD + INNER); ctx.lineTo(PAD + INNER, PAD); ctx.stroke();

    // Curve
    const sorted = [...points].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = "#d4d4d8"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let px = 0; px <= INNER; px++) {
      const v = evalSpline(sorted, px / INNER);
      const cy = PAD + (1 - v) * INNER;
      px === 0 ? ctx.moveTo(PAD + px, cy) : ctx.lineTo(PAD + px, cy);
    }
    ctx.stroke();

    // Handles
    for (const pt of points) {
      const { x: cx, y: cy } = toCanvas(pt);
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = "#71717a"; ctx.lineWidth = 1; ctx.stroke();
    }
  }, [points]);

  useEffect(() => { onChange(generateLUT(points)); }, [points, onChange]);

  const canvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { cx: (e.clientX - r.left) * (SIZE / r.width), cy: (e.clientY - r.top) * (SIZE / r.height) };
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { cx, cy } = canvasCoords(e);
    const idx = findNear(points, cx, cy);
    if (idx >= 0) {
      dragIdx.current = idx;
    } else {
      const pt = toCurve(cx, cy);
      setPoints(prev => {
        const next = [...prev, pt].sort((a, b) => a.x - b.x);
        dragIdx.current = next.findIndex(p => p === pt);
        return next;
      });
    }
  }, [points]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIdx.current === null) return;
    const { cx, cy } = canvasCoords(e);
    const pt = toCurve(cx, cy);
    setPoints(prev => {
      const next = [...prev];
      const i = dragIdx.current!;
      const minX = i > 0 ? next[i - 1].x + 0.01 : 0;
      const maxX = i < next.length - 1 ? next[i + 1].x - 0.01 : 1;
      next[i] = { x: Math.max(minX, Math.min(maxX, pt.x)), y: Math.max(0, Math.min(1, pt.y)) };
      return next;
    });
  }, []);

  const handlePointerUp = useCallback(() => { dragIdx.current = null; }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (SIZE / r.width);
    const cy = (e.clientY - r.top) * (SIZE / r.height);
    const idx = findNear(points, cx, cy);
    if (idx >= 0 && points.length > 2) setPoints(prev => prev.filter((_, i) => i !== idx));
  }, [points]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-medium tracking-widest uppercase text-zinc-500">TONE CURVE</span>
        <button
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          onClick={() => setPoints([{ x: 0, y: 0 }, { x: 1, y: 1 }])}
        >Reset</button>
      </div>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="w-full rounded cursor-crosshair touch-none border border-zinc-800"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
      <p className="text-[9px] text-zinc-700">クリックでポイント追加 / ダブルクリックで削除</p>
    </div>
  );
}
