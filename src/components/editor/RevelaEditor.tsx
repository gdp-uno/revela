"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GlState,
  HsvParams,
  LabParams,
  initGl,
  render,
  uploadTexture,
} from "@/lib/gl-engine";
import { isTauri, loadImageNative, openFileDialog, saveFileDialog, exportImageNative } from "@/lib/tauri-bridge";
import Panel from "./Panel";
import Slider from "./Slider";

const DEFAULT_LAB: LabParams = { L: 0, A: 0, B: 0 };
const DEFAULT_HSV: HsvParams = { hue: 0, saturation: 0, value: 0 };

export default function RevelaEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GlState | null>(null);
  const [lab, setLab] = useState<LabParams>(DEFAULT_LAB);
  const [hsv, setHsv] = useState<HsvParams>(DEFAULT_HSV);
  const [hasImage, setHasImage] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Init GL
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      glRef.current = initGl(canvasRef.current);
    } catch (e) {
      setStatus(`WebGL2 error: ${(e as Error).message}`);
    }
  }, []);

  // Re-render when params change
  useEffect(() => {
    if (!glRef.current || !hasImage) return;
    render(glRef.current, lab, hsv);
  }, [lab, hsv, hasImage]);

  const loadFromUrl = useCallback((url: string, name: string) => {
    const img = new Image();
    img.onload = () => {
      if (!glRef.current) return;
      glRef.current = uploadTexture(glRef.current, img);
      render(glRef.current, lab, hsv);
      setHasImage(true);
      setFilename(name);
    };
    img.src = url;
  }, [lab, hsv]);

  const handleOpen = useCallback(async () => {
    if (isTauri) {
      const path = await openFileDialog();
      if (!path) return;
      try {
        setStatus("Loading...");
        const imgData = await loadImageNative(path);
        if (!glRef.current) return;
        const f32 = new Float32Array(imgData.data);
        glRef.current = uploadTexture(glRef.current, f32, imgData.width, imgData.height);
        render(glRef.current, lab, hsv);
        setHasImage(true);
        setFilename(path.split("/").pop() ?? path);
        setStatus(null);
      } catch (e) {
        setStatus(`Load error: ${(e as Error).message}`);
      }
    } else {
      // Browser: File input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        loadFromUrl(url, file.name);
      };
      input.click();
    }
  }, [lab, hsv, loadFromUrl]);

  const handleExport = useCallback(async () => {
    if (!glRef.current || !hasImage) return;
    const { texWidth, texHeight } = glRef.current;

    if (isTauri) {
      const { readPixels } = await import("@/lib/gl-engine");
      const pixels = readPixels(glRef.current);
      const savePath = await saveFileDialog();
      if (!savePath) return;
      try {
        setStatus("Exporting...");
        await exportImageNative(savePath, texWidth, texHeight, pixels);
        setStatus("Export complete");
        setTimeout(() => setStatus(null), 3000);
      } catch (e) {
        setStatus(`Export error: ${(e as Error).message}`);
      }
    } else {
      // Browser: canvas toBlob
      const canvas = canvasRef.current!;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (filename?.replace(/\.[^.]+$/, "") ?? "export") + "_revela.jpg";
        a.click();
      }, "image/jpeg", 0.95);
    }
  }, [hasImage, filename]);

  const handleReset = useCallback(() => {
    setLab(DEFAULT_LAB);
    setHsv(DEFAULT_HSV);
  }, []);

  // Drag & drop (browser mode)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    loadFromUrl(url, file.name);
  }, [loadFromUrl]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 font-sans select-none overflow-hidden">
      {/* Left sidebar: panels */}
      <aside className="w-64 flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex-shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-sm font-bold text-white tracking-tight">Revela</span>
          {filename && (
            <span className="text-xs text-zinc-500 truncate">{filename}</span>
          )}
        </div>

        <Panel title="LAB">
          <Slider label="Luminance" value={lab.L} min={-100} max={100} onChange={(v) => setLab((p) => ({ ...p, L: v }))} />
          <Slider label="A (Green–Red)" value={lab.A} min={-100} max={100} onChange={(v) => setLab((p) => ({ ...p, A: v }))} />
          <Slider label="B (Blue–Yellow)" value={lab.B} min={-100} max={100} onChange={(v) => setLab((p) => ({ ...p, B: v }))} />
        </Panel>

        <Panel title="HSV">
          <Slider label="Hue" value={hsv.hue} min={-180} max={180} onChange={(v) => setHsv((p) => ({ ...p, hue: v }))} unit="°" />
          <Slider label="Saturation" value={hsv.saturation} min={-100} max={100} onChange={(v) => setHsv((p) => ({ ...p, saturation: v }))} />
          <Slider label="Value" value={hsv.value} min={-100} max={100} onChange={(v) => setHsv((p) => ({ ...p, value: v }))} />
        </Panel>

        <div className="mt-auto p-4 flex flex-col gap-2 border-t border-zinc-800">
          <button
            onClick={handleReset}
            disabled={!hasImage}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={handleExport}
            disabled={!hasImage}
            className="w-full py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Export JPEG
          </button>
        </div>
      </aside>

      {/* Main canvas area */}
      <main
        className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-zinc-950"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {!hasImage && (
          <div
            onClick={handleOpen}
            className="flex flex-col items-center gap-3 cursor-pointer text-zinc-600 hover:text-zinc-400 transition-colors group"
          >
            <svg className="w-16 h-16" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={1}>
              <rect x="8" y="16" width="48" height="36" rx="4" />
              <circle cx="22" cy="30" r="5" />
              <path strokeLinecap="round" d="M8 44l14-12 10 8 10-12 14 16" />
            </svg>
            <span className="text-sm">Open image or drag & drop</span>
            <span className="text-xs text-zinc-700 group-hover:text-zinc-600">JPEG · PNG · CR2 · CR3 · NEF · ARW · RAF · ORF · RW2 · DNG</span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`max-w-full max-h-full object-contain ${hasImage ? "block" : "hidden"}`}
          style={{ imageRendering: "auto" }}
        />

        {/* Top toolbar */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={handleOpen}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
          >
            Open
          </button>
        </div>

        {status && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-800 text-xs text-zinc-300 rounded-full border border-zinc-700">
            {status}
          </div>
        )}
      </main>
    </div>
  );
}
