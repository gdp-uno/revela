"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AllParams, type BasicParams, type GlState, type HsvParams, type LabParams,
  initGl, render, uploadTexture, updateToneCurveLUT,
} from "@/lib/gl-engine";
import { isTauri, loadImageNative, openFileDialog, saveFileDialog, exportImageNative } from "@/lib/tauri-bridge";
import Panel from "./Panel";
import Slider from "./Slider";
import ToneCurve from "./ToneCurve";
import ColorMixer, { type ColorMixerParams, DEFAULT_COLOR_MIXER, colorMixerToArray } from "./ColorMixer";

const DEFAULT_BASIC: BasicParams = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
const DEFAULT_LAB: LabParams = { L: 0, A: 0, B: 0 };
const DEFAULT_HSV: HsvParams = { hue: 0, saturation: 0, value: 0 };

export default function RevelaEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GlState | null>(null);

  const [basic, setBasic] = useState<BasicParams>(DEFAULT_BASIC);
  const [lab, setLab] = useState<LabParams>(DEFAULT_LAB);
  const [hsv, setHsv] = useState<HsvParams>(DEFAULT_HSV);
  const [colorMixer, setColorMixer] = useState<ColorMixerParams>(DEFAULT_COLOR_MIXER);
  const [hasImage, setHasImage] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Build AllParams from current state
  const buildParams = useCallback(
    (b = basic, l = lab, h = hsv, cm = colorMixer): AllParams => ({
      basic: b, lab: l, hsv: h, colorMixer: colorMixerToArray(cm),
    }),
    [basic, lab, hsv, colorMixer]
  );

  // Init GL
  useEffect(() => {
    if (!canvasRef.current) return;
    try { glRef.current = initGl(canvasRef.current); }
    catch (e) { setStatus(`WebGL2 error: ${(e as Error).message}`); }
  }, []);

  // Re-render when params change
  useEffect(() => {
    if (!glRef.current || !hasImage) return;
    render(glRef.current, buildParams());
  }, [basic, lab, hsv, colorMixer, hasImage, buildParams]);

  const onToneCurveChange = useCallback((lut: Float32Array) => {
    if (!glRef.current) return;
    updateToneCurveLUT(glRef.current, lut);
    if (hasImage) render(glRef.current, buildParams());
  }, [hasImage, buildParams]);

  const loadFromUrl = useCallback((url: string, name: string) => {
    const img = new Image();
    img.onload = () => {
      if (!glRef.current) return;
      glRef.current = uploadTexture(glRef.current, img);
      render(glRef.current, buildParams());
      setHasImage(true);
      setFilename(name);
    };
    img.src = url;
  }, [buildParams]);

  const handleOpen = useCallback(async () => {
    if (isTauri) {
      const path = await openFileDialog();
      if (!path) return;
      try {
        setStatus("Loading...");
        const imgData = await loadImageNative(path);
        if (!glRef.current) return;
        glRef.current = uploadTexture(glRef.current, new Float32Array(imgData.data), imgData.width, imgData.height);
        render(glRef.current, buildParams());
        setHasImage(true);
        setFilename(path.split("/").pop() ?? path);
        setStatus(null);
      } catch (e) { setStatus(`Load error: ${(e as Error).message}`); }
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        loadFromUrl(URL.createObjectURL(file), file.name);
      };
      input.click();
    }
  }, [buildParams, loadFromUrl]);

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
      } catch (e) { setStatus(`Export error: ${(e as Error).message}`); }
    } else {
      canvasRef.current?.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (filename?.replace(/\.[^.]+$/, "") ?? "export") + "_revela.jpg";
        a.click();
      }, "image/jpeg", 0.95);
    }
  }, [hasImage, filename]);

  const handleReset = useCallback(() => {
    setBasic(DEFAULT_BASIC);
    setLab(DEFAULT_LAB);
    setHsv(DEFAULT_HSV);
    setColorMixer(DEFAULT_COLOR_MIXER);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    loadFromUrl(URL.createObjectURL(file), file.name);
  }, [loadFromUrl]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 font-sans select-none overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex-shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold text-white tracking-tight">Revela</span>
          {filename && <span className="text-xs text-zinc-500 truncate">{filename}</span>}
        </div>

        {/* Basic */}
        <Panel title="基本補正">
          <Slider label="EXPOSURE" value={basic.exposure} min={-5} max={5} step={0.1} unit=" EV"
            onChange={v => setBasic(p => ({ ...p, exposure: v }))} />
          <Slider label="CONTRAST" value={basic.contrast} min={-100} max={100}
            onChange={v => setBasic(p => ({ ...p, contrast: v }))} />
          <div className="h-px bg-zinc-800 my-0.5" />
          <Slider label="HIGHLIGHTS" value={basic.highlights} min={-100} max={100}
            onChange={v => setBasic(p => ({ ...p, highlights: v }))} />
          <Slider label="SHADOWS" value={basic.shadows} min={-100} max={100}
            onChange={v => setBasic(p => ({ ...p, shadows: v }))} />
          <div className="h-px bg-zinc-800 my-0.5" />
          <Slider label="WHITES" value={basic.whites} min={-100} max={100}
            onChange={v => setBasic(p => ({ ...p, whites: v }))} />
          <Slider label="BLACKS" value={basic.blacks} min={-100} max={100}
            onChange={v => setBasic(p => ({ ...p, blacks: v }))} />
        </Panel>

        {/* Tone Curve */}
        <Panel title="トーンカーブ" defaultOpen={false}>
          <ToneCurve onChange={onToneCurveChange} />
        </Panel>

        {/* LAB */}
        <Panel title="LAB">
          <Slider label="LUMINANCE" value={lab.L} min={-100} max={100}
            onChange={v => setLab(p => ({ ...p, L: v }))} />
          <Slider label="A  GREEN – RED" value={lab.A} min={-100} max={100}
            onChange={v => setLab(p => ({ ...p, A: v }))} />
          <Slider label="B  BLUE – YELLOW" value={lab.B} min={-100} max={100}
            onChange={v => setLab(p => ({ ...p, B: v }))} />
        </Panel>

        {/* Global HSV */}
        <Panel title="HSV" defaultOpen={false}>
          <Slider label="HUE" value={hsv.hue} min={-180} max={180} unit="°"
            onChange={v => setHsv(p => ({ ...p, hue: v }))} />
          <Slider label="SATURATION" value={hsv.saturation} min={-100} max={100}
            onChange={v => setHsv(p => ({ ...p, saturation: v }))} />
          <Slider label="VALUE" value={hsv.value} min={-100} max={100}
            onChange={v => setHsv(p => ({ ...p, value: v }))} />
        </Panel>

        {/* Color Mixer */}
        <Panel title="カラーチャンネル" defaultOpen={false}>
          <ColorMixer value={colorMixer} onChange={setColorMixer} />
        </Panel>

        {/* Footer actions */}
        <div className="mt-auto p-4 flex flex-col gap-2 border-t border-zinc-800 flex-shrink-0">
          <button
            onClick={handleReset}
            disabled={!hasImage}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >Reset All</button>
          <button
            onClick={handleExport}
            disabled={!hasImage}
            className="w-full py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >Export JPEG</button>
        </div>
      </aside>

      {/* Canvas */}
      <main
        className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-zinc-950"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {!hasImage && (
          <div onClick={handleOpen} className="flex flex-col items-center gap-3 cursor-pointer text-zinc-600 hover:text-zinc-400 transition-colors group">
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
        />
        <div className="absolute top-4 right-4">
          <button onClick={handleOpen} className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors">
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
