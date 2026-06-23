"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ToneCurveLUTs } from "@/lib/gl-engine";

interface Pt { x: number; y: number; }
type Channel = "master" | "r" | "g" | "b";

const CHANNELS: { key: Channel; label: string; color: string; textColor: string }[] = [
  { key: "master", label: "●", color: "#27272a", textColor: "#d4d4d8" },
  { key: "r",      label: "R", color: "#991b1b", textColor: "#fca5a5" },
  { key: "g",      label: "G", color: "#14532d", textColor: "#86efac" },
  { key: "b",      label: "B", color: "#1e3a5f", textColor: "#93c5fd" },
];
const CURVE_COLORS: Record<Channel, string> = {
  master: "#d4d4d8", r: "#f87171", g: "#4ade80", b: "#60a5fa",
};

// Fritsch-Carlson monotone cubic spline
function evalSpline(sorted: Pt[], x: number): number {
  const n = sorted.length;
  if (n === 0) return x;
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[n-1].x) return sorted[n-1].y;
  if (n === 2) {
    const t = (x - sorted[0].x) / (sorted[1].x - sorted[0].x);
    return sorted[0].y + t * (sorted[1].y - sorted[0].y);
  }
  let i = 0;
  while (i < n-2 && sorted[i+1].x < x) i++;
  const dx: number[] = [], sl: number[] = [], m = Array(n).fill(0);
  for (let j = 0; j < n-1; j++) {
    dx[j] = sorted[j+1].x - sorted[j].x;
    sl[j] = (sorted[j+1].y - sorted[j].y) / dx[j];
  }
  m[0] = sl[0]; m[n-1] = sl[n-2];
  for (let j = 1; j < n-1; j++) m[j] = sl[j-1]*sl[j] <= 0 ? 0 : (sl[j-1]+sl[j])/2;
  for (let j = 0; j < n-1; j++) {
    if (Math.abs(sl[j]) < 1e-10) { m[j]=m[j+1]=0; continue; }
    const a=m[j]/sl[j], b=m[j+1]/sl[j];
    if (a*a+b*b>9){const tau=3/Math.sqrt(a*a+b*b);m[j]=tau*a*sl[j];m[j+1]=tau*b*sl[j];}
  }
  const h=dx[i],t=(x-sorted[i].x)/h,t2=t*t,t3=t2*t;
  return sorted[i].y*(2*t3-3*t2+1)+h*m[i]*(t3-2*t2+t)+sorted[i+1].y*(-2*t3+3*t2)+h*m[i+1]*(t3-t2);
}

export function generateLUT(points: Pt[]): Float32Array {
  const sorted = [...points].sort((a,b)=>a.x-b.x);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(1, evalSpline(sorted, i/255)));
  return lut;
}

const IDENTITY: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
const DEFAULT_POINTS: Record<Channel, Pt[]> = {
  master: [...IDENTITY], r: [...IDENTITY], g: [...IDENTITY], b: [...IDENTITY],
};

interface Props { onChange: (lut: ToneCurveLUTs) => void; }

const SIZE = 176, PAD = 8, INNER = SIZE - PAD*2, HIT = 0.07;

export default function ToneCurve({ onChange }: Props) {
  const [channelPts, setChannelPts] = useState<Record<Channel, Pt[]>>(DEFAULT_POINTS);
  const [active, setActive] = useState<Channel>("master");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragIdx = useRef<number | null>(null);

  const points = channelPts[active];
  const setPoints = useCallback((updater: (prev: Pt[]) => Pt[]) =>
    setChannelPts(prev => ({ ...prev, [active]: updater(prev[active]) })), [active]);

  const toCurve = (cx: number, cy: number): Pt => ({
    x: Math.max(0, Math.min(1, (cx-PAD)/INNER)),
    y: Math.max(0, Math.min(1, 1-(cy-PAD)/INNER)),
  });
  const toCanvas = (pt: Pt) => ({ x: PAD+pt.x*INNER, y: PAD+(1-pt.y)*INNER });
  const findNear = (pts: Pt[], cx: number, cy: number) => {
    const cur = toCurve(cx, cy);
    return pts.findIndex(p => Math.hypot(p.x-cur.x, p.y-cur.y) < HIT);
  };

  // Emit LUTs whenever any channel changes
  useEffect(() => {
    onChange({
      master: generateLUT(channelPts.master),
      r:      generateLUT(channelPts.r),
      g:      generateLUT(channelPts.g),
      b:      generateLUT(channelPts.b),
    });
  }, [channelPts, onChange]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid
    ctx.strokeStyle = "#27272a"; ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const gx=PAD+INNER*i/4, gy=PAD+INNER*i/4;
      ctx.beginPath(); ctx.moveTo(gx,PAD); ctx.lineTo(gx,PAD+INNER); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD,gy); ctx.lineTo(PAD+INNER,gy); ctx.stroke();
    }
    // Identity diagonal
    ctx.strokeStyle="#3f3f46"; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(PAD,PAD+INNER); ctx.lineTo(PAD+INNER,PAD); ctx.stroke();

    // Draw all non-active channels faintly (master always drawn)
    for (const ch of (["master","r","g","b"] as Channel[])) {
      if (ch === active) continue;
      const pts = channelPts[ch];
      const isIdentity = pts.length===2 && pts[0].x===0 && pts[0].y===0 && pts[1].x===1 && pts[1].y===1;
      if (isIdentity) continue;
      const sorted = [...pts].sort((a,b)=>a.x-b.x);
      ctx.strokeStyle = CURVE_COLORS[ch] + "40"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let px=0;px<=INNER;px++) {
        const v=evalSpline(sorted,px/INNER), cy=PAD+(1-v)*INNER;
        px===0 ? ctx.moveTo(PAD+px,cy) : ctx.lineTo(PAD+px,cy);
      }
      ctx.stroke();
    }

    // Active channel curve
    const sorted = [...points].sort((a,b)=>a.x-b.x);
    ctx.strokeStyle = CURVE_COLORS[active]; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let px=0;px<=INNER;px++) {
      const v=evalSpline(sorted,px/INNER), cy=PAD+(1-v)*INNER;
      px===0 ? ctx.moveTo(PAD+px,cy) : ctx.lineTo(PAD+px,cy);
    }
    ctx.stroke();

    // Handles
    for (const pt of points) {
      const {x:cx,y:cy} = toCanvas(pt);
      ctx.beginPath(); ctx.arc(cx,cy,3.5,0,Math.PI*2);
      ctx.fillStyle="#fff"; ctx.fill();
      ctx.strokeStyle=CURVE_COLORS[active]+"aa"; ctx.lineWidth=1; ctx.stroke();
    }
  }, [channelPts, active, points]);

  const canvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { cx:(e.clientX-r.left)*(SIZE/r.width), cy:(e.clientY-r.top)*(SIZE/r.height) };
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const {cx,cy} = canvasCoords(e);
    const idx = findNear(points, cx, cy);
    if (idx >= 0) {
      dragIdx.current = idx;
    } else {
      const pt = toCurve(cx,cy);
      setPoints(prev => {
        const next = [...prev, pt].sort((a,b)=>a.x-b.x);
        dragIdx.current = next.findIndex(p=>p===pt);
        return next;
      });
    }
  }, [points, setPoints]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIdx.current === null) return;
    const {cx,cy} = canvasCoords(e);
    const pt = toCurve(cx,cy);
    setPoints(prev => {
      const next = [...prev];
      const i = dragIdx.current!;
      const minX = i > 0 ? next[i-1].x+0.01 : 0;
      const maxX = i < next.length-1 ? next[i+1].x-0.01 : 1;
      next[i] = { x:Math.max(minX,Math.min(maxX,pt.x)), y:Math.max(0,Math.min(1,pt.y)) };
      return next;
    });
  }, [setPoints]);

  const handlePointerUp = useCallback(() => { dragIdx.current = null; }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const cx=(e.clientX-r.left)*(SIZE/r.width), cy=(e.clientY-r.top)*(SIZE/r.height);
    const idx = findNear(points,cx,cy);
    if (idx>=0 && points.length>2) setPoints(prev=>prev.filter((_,i)=>i!==idx));
  }, [points, setPoints]);

  const resetActive = () => setChannelPts(prev=>({...prev,[active]:[...IDENTITY]}));
  const resetAll    = () => setChannelPts(DEFAULT_POINTS);

  return (
    <div className="flex flex-col gap-2">
      {/* Channel tabs */}
      <div className="flex gap-1">
        {CHANNELS.map(ch => (
          <button
            key={ch.key}
            onClick={() => setActive(ch.key)}
            className={`flex-1 py-0.5 text-[10px] font-bold rounded transition-colors ${
              active===ch.key ? "opacity-100" : "opacity-40 hover:opacity-70"
            }`}
            style={{
              backgroundColor: active===ch.key ? ch.color : "transparent",
              color: ch.textColor,
              border: `1px solid ${ch.color}`,
            }}
          >{ch.label}</button>
        ))}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={SIZE} height={SIZE}
        className="w-full rounded cursor-crosshair touch-none border border-zinc-800"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* Actions */}
      <div className="flex justify-between items-center">
        <p className="text-[9px] text-zinc-700">クリック追加 / ダブルクリック削除</p>
        <div className="flex gap-2">
          <button className="text-[9px] text-zinc-600 hover:text-zinc-400" onClick={resetActive}>Reset</button>
          <button className="text-[9px] text-zinc-600 hover:text-zinc-400" onClick={resetAll}>All</button>
        </div>
      </div>
    </div>
  );
}
