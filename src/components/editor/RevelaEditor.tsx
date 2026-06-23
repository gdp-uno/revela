"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AllParams, type BasicParams, type DetailParams, type GlState, type HsvParams,
  type LabParams, type ColorGradingParams, type VignetteParams, type GrainParams,
  type CalibrationParams, type MaskParams, type ToneCurveLUTs,
  initGl, render, uploadTexture, updateToneCurveLUT, upload3DLUT,
} from "@/lib/gl-engine";
import type { CubeLUT } from "@/lib/lut";
import type { CatalogPhoto } from "@/lib/catalog";
import { updatePhoto, getPhotoBlob } from "@/lib/catalog";
import { isRawFile, decodeRawToImageData, RAW_ACCEPT } from "@/lib/raw-decoder";
import { isTauri, loadImageNative, openFileDialog, saveFileDialog, exportImageNative } from "@/lib/tauri-bridge";
import Panel from "./Panel";
import Slider from "./Slider";
import ToneCurve from "./ToneCurve";
import ColorMixer, { type ColorMixerParams, DEFAULT_COLOR_MIXER, colorMixerToArray } from "./ColorMixer";
import ColorGrading, { DEFAULT_COLOR_GRADING } from "./ColorGrading";
import DetailPanel, { DEFAULT_DETAIL } from "./DetailPanel";
import MaskPanel, { DEFAULT_MASK } from "./MaskPanel";
import LutPanel from "./LutPanel";
import PresetsPanel from "./PresetsPanel";

const DEFAULT_BASIC: BasicParams = {
  temp: 0, tint: 0,
  exposure: 0, contrast: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0,
  texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
};
const DEFAULT_LAB: LabParams = { L: 0, A: 0, B: 0 };
const DEFAULT_HSV: HsvParams = { hue: 0, saturation: 0, value: 0 };
const DEFAULT_VIG: VignetteParams  = { amount: 0, midpoint: 50, feather: 50, roundness: 0 };
const DEFAULT_GRAIN: GrainParams   = { amount: 0, size: 25, roughness: 50 };
const DEFAULT_CAL: CalibrationParams = {
  shadowTint: 0,
  redHue: 0, redSat: 0,
  greenHue: 0, greenSat: 0,
  blueHue: 0, blueSat: 0,
};

function makeDefaultAll(): Omit<AllParams, "colorMixer" | "colorGrading"> & {
  colorMixerState: ColorMixerParams;
  colorGrading: ColorGradingParams;
} {
  return {
    basic: DEFAULT_BASIC,
    detail: DEFAULT_DETAIL,
    lab: DEFAULT_LAB,
    hsv: DEFAULT_HSV,
    colorMixerState: DEFAULT_COLOR_MIXER,
    colorGrading: DEFAULT_COLOR_GRADING,
    vignette: DEFAULT_VIG,
    grain: DEFAULT_GRAIN,
    calibration: DEFAULT_CAL,
    mask: DEFAULT_MASK,
    lutStrength: 1,
  };
}

interface Props {
  catalogPhoto?: CatalogPhoto | null;
  onBackToLibrary?: () => void;
}

export default function RevelaEditor({ catalogPhoto, onBackToLibrary }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef     = useRef<GlState | null>(null);

  const [basic,        setBasic]        = useState<BasicParams>(DEFAULT_BASIC);
  const [detail,       setDetail]       = useState<DetailParams>(DEFAULT_DETAIL);
  const [lab,          setLab]          = useState<LabParams>(DEFAULT_LAB);
  const [hsv,          setHsv]          = useState<HsvParams>(DEFAULT_HSV);
  const [colorMixer,   setColorMixer]   = useState<ColorMixerParams>(DEFAULT_COLOR_MIXER);
  const [colorGrading, setColorGrading] = useState<ColorGradingParams>(DEFAULT_COLOR_GRADING);
  const [vignette,     setVignette]     = useState<VignetteParams>(DEFAULT_VIG);
  const [grain,        setGrain]        = useState<GrainParams>(DEFAULT_GRAIN);
  const [calibration,  setCalibration]  = useState<CalibrationParams>(DEFAULT_CAL);
  const [mask,         setMask]         = useState<MaskParams>(DEFAULT_MASK);
  const [lut,          setLut]          = useState<CubeLUT | null>(null);
  const [lutStrength,  setLutStrength]  = useState(1);

  const [hasImage, setHasImage] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [status,   setStatus]   = useState<string | null>(null);

  const buildParams = useCallback((): AllParams => ({
    basic, detail, lab, hsv,
    colorMixer: colorMixerToArray(colorMixer),
    colorGrading,
    vignette,
    grain,
    calibration,
    mask,
    lutStrength,
  }), [basic, detail, lab, hsv, colorMixer, colorGrading, vignette, grain, calibration, mask, lutStrength]);

  const settingsJson = useCallback((): string => JSON.stringify({
    basic, detail, lab, hsv, colorMixer, colorGrading, vignette, grain, calibration, mask, lutStrength,
  }), [basic, detail, lab, hsv, colorMixer, colorGrading, vignette, grain, calibration, mask, lutStrength]);

  const applySettingsJson = useCallback((json: string) => {
    try {
      const s = JSON.parse(json);
      if (s.basic)        setBasic(s.basic);
      if (s.detail)       setDetail(s.detail);
      if (s.lab)          setLab(s.lab);
      if (s.hsv)          setHsv(s.hsv);
      if (s.colorMixer)   setColorMixer(s.colorMixer);
      if (s.colorGrading) setColorGrading(s.colorGrading);
      if (s.vignette)     setVignette(s.vignette);
      if (s.grain)        setGrain(s.grain);
      if (s.calibration)  setCalibration(s.calibration);
      if (s.mask)         setMask(s.mask);
      if (s.lutStrength !== undefined) setLutStrength(s.lutStrength);
    } catch { /* ignore */ }
  }, []);

  // Init WebGL
  useEffect(() => {
    if (!canvasRef.current) return;
    try { glRef.current = initGl(canvasRef.current); }
    catch (e) { setStatus(`WebGL2 error: ${(e as Error).message}`); }
  }, []);

  // Render on param change
  useEffect(() => {
    if (!glRef.current || !hasImage) return;
    render(glRef.current, buildParams());
  }, [basic, detail, lab, hsv, colorMixer, colorGrading, vignette, grain, calibration, mask, lutStrength, hasImage, buildParams]);

  // Load from catalog photo on mount
  useEffect(() => {
    if (!catalogPhoto) return;
    (async () => {
      const blob = await getPhotoBlob(catalogPhoto.id);
      if (!blob) return;
      if (catalogPhoto.developSettings) applySettingsJson(catalogPhoto.developSettings);
      if (isRawFile(blob)) {
        try {
          setStatus("RAWデコード中...");
          const { imageData } = await decodeRawToImageData(blob);
          if (!glRef.current) return;
          glRef.current = uploadTexture(glRef.current, imageData);
          render(glRef.current, buildParams());
          setHasImage(true);
          setFilename(catalogPhoto.filename);
          setStatus(null);
        } catch (e) { setStatus(`RAW読み込みエラー: ${(e as Error).message}`); }
      } else {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (!glRef.current) return;
          glRef.current = uploadTexture(glRef.current, img);
          render(glRef.current, buildParams());
          setHasImage(true);
          setFilename(catalogPhoto.filename);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogPhoto?.id]);

  const onToneCurveChange = useCallback((luts: ToneCurveLUTs) => {
    if (!glRef.current) return;
    updateToneCurveLUT(glRef.current, luts);
    if (hasImage) render(glRef.current, buildParams());
  }, [hasImage, buildParams]);

  const handleLutLoad = useCallback((newLut: CubeLUT | null) => {
    setLut(newLut);
    if (!glRef.current) return;
    if (newLut) {
      upload3DLUT(glRef.current, newLut);
      setLutStrength(1);
    } else {
      const { gl, lut3dTex } = glRef.current;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_3D, lut3dTex);
      const id = new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,0, 0,0,1, 1,0,1, 0,1,1, 1,1,1]);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, 2, 2, 2, 0, gl.RGB, gl.FLOAT, id);
      setLutStrength(0);
    }
  }, []);

  const loadFileAsImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!glRef.current) return;
      glRef.current = uploadTexture(glRef.current, img);
      render(glRef.current, buildParams());
      setHasImage(true);
      setFilename(file.name);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [buildParams]);

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

  const loadRawFile = useCallback(async (file: File) => {
    try {
      setStatus("RAWデコード中...");
      const { imageData } = await decodeRawToImageData(file);
      if (!glRef.current) return;
      glRef.current = uploadTexture(glRef.current, imageData);
      render(glRef.current, buildParams());
      setHasImage(true);
      setFilename(file.name);
      setStatus(null);
    } catch (e) {
      setStatus(`RAW読み込みエラー: ${(e as Error).message}`);
    }
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
      input.accept = `image/jpeg,image/png,${RAW_ACCEPT}`;
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (isRawFile(file)) {
          await loadRawFile(file);
        } else {
          loadFileAsImage(file);
        }
      };
      input.click();
    }
  }, [buildParams, loadFileAsImage, loadRawFile]);

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

  const handleSaveToCatalog = useCallback(async () => {
    if (!catalogPhoto) return;
    await updatePhoto(catalogPhoto.id, { developSettings: settingsJson() });
    setStatus("設定を保存しました");
    setTimeout(() => setStatus(null), 2000);
  }, [catalogPhoto, settingsJson]);

  const handleResetAll = useCallback(() => {
    const d = makeDefaultAll();
    setBasic(d.basic); setDetail(d.detail); setLab(d.lab); setHsv(d.hsv);
    setColorMixer(d.colorMixerState); setColorGrading(d.colorGrading);
    setVignette(d.vignette); setGrain(d.grain); setCalibration(d.calibration);
    setMask(d.mask); setLutStrength(1);
  }, []);

  // Per-panel reset callbacks
  const resetBasic       = useCallback(() => setBasic(DEFAULT_BASIC), []);
  const resetLab         = useCallback(() => setLab(DEFAULT_LAB), []);
  const resetHsv         = useCallback(() => setHsv(DEFAULT_HSV), []);
  const resetColorMixer  = useCallback(() => setColorMixer(DEFAULT_COLOR_MIXER), []);
  const resetColorGrading= useCallback(() => setColorGrading(DEFAULT_COLOR_GRADING), []);
  const resetDetail      = useCallback(() => setDetail(DEFAULT_DETAIL), []);
  const resetVignette    = useCallback(() => { setVignette(DEFAULT_VIG); setGrain(DEFAULT_GRAIN); }, []);
  const resetCalibration = useCallback(() => setCalibration(DEFAULT_CAL), []);
  const resetMask        = useCallback(() => setMask(DEFAULT_MASK), []);

  // Drop handler — supports JPEG, PNG, and RAW files
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (isRawFile(file)) {
      await loadRawFile(file);
    } else if (file.type.startsWith("image/")) {
      loadFromUrl(URL.createObjectURL(file), file.name);
    }
  }, [loadRawFile, loadFromUrl]);

  const setB   = useCallback(<K extends keyof BasicParams>(k: K, v: BasicParams[K]) =>
    setBasic(p => ({ ...p, [k]: v })), []);
  const setV   = useCallback(<K extends keyof VignetteParams>(k: K, v: VignetteParams[K]) =>
    setVignette(p => ({ ...p, [k]: v })), []);
  const setGr  = useCallback(<K extends keyof GrainParams>(k: K, v: GrainParams[K]) =>
    setGrain(p => ({ ...p, [k]: v })), []);
  const setCal = useCallback(<K extends keyof CalibrationParams>(k: K, v: CalibrationParams[K]) =>
    setCalibration(p => ({ ...p, [k]: v })), []);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 font-sans select-none overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex-shrink-0">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2 flex-shrink-0">
          {onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors flex-shrink-0"
              title="ライブラリへ戻る"
            >
              ← ライブラリ
            </button>
          )}
          {!onBackToLibrary && <span className="text-sm font-bold text-white tracking-tight">Revela</span>}
          {filename && <span className="text-[10px] text-zinc-500 truncate">{filename}</span>}
        </div>

        {/* プリセット */}
        <Panel title="プリセット" defaultOpen={false}>
          <PresetsPanel
            currentSettingsJson={settingsJson()}
            onApply={applySettingsJson}
          />
        </Panel>

        {/* 基本補正 */}
        <Panel title="基本補正" onReset={resetBasic}>
          <div className="pb-1">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">ホワイトバランス</p>
            <Slider label="TEMP" value={basic.temp} min={-100} max={100} onChange={v=>setB("temp",v)} />
            <Slider label="TINT" value={basic.tint} min={-150} max={150} onChange={v=>setB("tint",v)} />
          </div>
          <div className="h-px bg-zinc-800 my-1" />
          <div className="pb-1">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">トーン</p>
            <Slider label="EXPOSURE"   value={basic.exposure}   min={-5}   max={5}   step={0.1} unit=" EV" onChange={v=>setB("exposure",v)} />
            <Slider label="CONTRAST"   value={basic.contrast}   min={-100} max={100} onChange={v=>setB("contrast",v)} />
            <div className="h-px bg-zinc-800 my-0.5" />
            <Slider label="HIGHLIGHTS" value={basic.highlights} min={-100} max={100} onChange={v=>setB("highlights",v)} />
            <Slider label="SHADOWS"    value={basic.shadows}    min={-100} max={100} onChange={v=>setB("shadows",v)} />
            <div className="h-px bg-zinc-800 my-0.5" />
            <Slider label="WHITES"     value={basic.whites}     min={-100} max={100} onChange={v=>setB("whites",v)} />
            <Slider label="BLACKS"     value={basic.blacks}     min={-100} max={100} onChange={v=>setB("blacks",v)} />
          </div>
          <div className="h-px bg-zinc-800 my-1" />
          <div>
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">プレゼンス</p>
            <Slider label="TEXTURE"    value={basic.texture}    min={-100} max={100} onChange={v=>setB("texture",v)} />
            <Slider label="CLARITY"    value={basic.clarity}    min={-100} max={100} onChange={v=>setB("clarity",v)} />
            <Slider label="DEHAZE"     value={basic.dehaze}     min={-100} max={100} onChange={v=>setB("dehaze",v)} />
            <div className="h-px bg-zinc-800 my-0.5" />
            <Slider label="VIBRANCE"   value={basic.vibrance}   min={-100} max={100} onChange={v=>setB("vibrance",v)} />
            <Slider label="SATURATION" value={basic.saturation} min={-100} max={100} onChange={v=>setB("saturation",v)} />
          </div>
        </Panel>

        {/* Tone Curve */}
        <Panel title="トーンカーブ" defaultOpen={false}>
          <ToneCurve onChange={onToneCurveChange} />
        </Panel>

        {/* LAB */}
        <Panel title="LAB" defaultOpen={false} onReset={resetLab}>
          <Slider label="LUMINANCE"       value={lab.L} min={-100} max={100} onChange={v=>setLab(p=>({...p,L:v}))} />
          <Slider label="A  GREEN – RED"  value={lab.A} min={-100} max={100} onChange={v=>setLab(p=>({...p,A:v}))} />
          <Slider label="B  BLUE – YELLOW" value={lab.B} min={-100} max={100} onChange={v=>setLab(p=>({...p,B:v}))} />
        </Panel>

        {/* HSV */}
        <Panel title="HSV" defaultOpen={false} onReset={resetHsv}>
          <Slider label="HUE"        value={hsv.hue}        min={-180} max={180} unit="°" onChange={v=>setHsv(p=>({...p,hue:v}))} />
          <Slider label="SATURATION" value={hsv.saturation} min={-100} max={100}           onChange={v=>setHsv(p=>({...p,saturation:v}))} />
          <Slider label="VALUE"      value={hsv.value}      min={-100} max={100}           onChange={v=>setHsv(p=>({...p,value:v}))} />
        </Panel>

        {/* Color Mixer */}
        <Panel title="カラーチャンネル" defaultOpen={false} onReset={resetColorMixer}>
          <ColorMixer value={colorMixer} onChange={setColorMixer} />
        </Panel>

        {/* Color Grading */}
        <Panel title="カラーグレーディング" defaultOpen={false} onReset={resetColorGrading}>
          <ColorGrading value={colorGrading} onChange={setColorGrading} />
        </Panel>

        {/* Detail (NR + Sharp) */}
        <Panel title="ディテール" defaultOpen={false} onReset={resetDetail}>
          <DetailPanel value={detail} onChange={setDetail} />
        </Panel>

        {/* LUT */}
        <Panel title="LUT（カラープロファイル）" defaultOpen={false}>
          <LutPanel
            lut={lut}
            strength={lutStrength}
            onLutLoad={handleLutLoad}
            onStrengthChange={setLutStrength}
          />
        </Panel>

        {/* Mask */}
        <Panel title="マスク" defaultOpen={false} onReset={resetMask}>
          <MaskPanel value={mask} onChange={setMask} />
        </Panel>

        {/* Effects */}
        <Panel title="効果" defaultOpen={false} onReset={resetVignette}>
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">ビネット</p>
          <Slider label="AMOUNT"    value={vignette.amount}    min={-100} max={100} onChange={v=>setV("amount",v)} />
          <Slider label="MIDPOINT"  value={vignette.midpoint}  min={0}    max={100} defaultValue={50} onChange={v=>setV("midpoint",v)} />
          <Slider label="FEATHER"   value={vignette.feather}   min={0}    max={100} defaultValue={50} onChange={v=>setV("feather",v)} />
          <Slider label="ROUNDNESS" value={vignette.roundness} min={-100} max={100} onChange={v=>setV("roundness",v)} />
          <div className="h-px bg-zinc-800 my-1" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">グレイン</p>
          <Slider label="AMOUNT"    value={grain.amount}    min={0}   max={100} onChange={v=>setGr("amount",v)} />
          <Slider label="SIZE"      value={grain.size}      min={1}   max={50}  defaultValue={25} onChange={v=>setGr("size",v)} />
          <Slider label="ROUGHNESS" value={grain.roughness} min={0}   max={100} defaultValue={50} onChange={v=>setGr("roughness",v)} />
        </Panel>

        {/* Calibration */}
        <Panel title="キャリブレーション" defaultOpen={false} onReset={resetCalibration}>
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">シャドウ</p>
          <Slider label="TINT" value={calibration.shadowTint} min={-100} max={100} onChange={v=>setCal("shadowTint",v)} />
          <div className="h-px bg-zinc-800 my-1" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">レッド</p>
          <Slider label="HUE" value={calibration.redHue} min={-100} max={100} onChange={v=>setCal("redHue",v)} />
          <Slider label="SAT" value={calibration.redSat} min={-100} max={100} onChange={v=>setCal("redSat",v)} />
          <div className="h-px bg-zinc-800 my-1" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">グリーン</p>
          <Slider label="HUE" value={calibration.greenHue} min={-100} max={100} onChange={v=>setCal("greenHue",v)} />
          <Slider label="SAT" value={calibration.greenSat} min={-100} max={100} onChange={v=>setCal("greenSat",v)} />
          <div className="h-px bg-zinc-800 my-1" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">ブルー</p>
          <Slider label="HUE" value={calibration.blueHue} min={-100} max={100} onChange={v=>setCal("blueHue",v)} />
          <Slider label="SAT" value={calibration.blueSat} min={-100} max={100} onChange={v=>setCal("blueSat",v)} />
        </Panel>

        {/* Footer */}
        <div className="mt-auto p-3 flex flex-col gap-2 border-t border-zinc-800 flex-shrink-0">
          {catalogPhoto && (
            <button onClick={handleSaveToCatalog}
              className="w-full py-1.5 text-xs text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
            >
              カタログに保存
            </button>
          )}
          <button onClick={handleResetAll} disabled={!hasImage}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            全パラメータ リセット
          </button>
          <button onClick={handleExport} disabled={!hasImage}
            className="w-full py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Export JPEG
          </button>
        </div>
      </aside>

      {/* Canvas */}
      <main
        className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-zinc-950"
        onDrop={handleDrop}
        onDragOver={e=>e.preventDefault()}
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
        <canvas ref={canvasRef} className={`max-w-full max-h-full object-contain ${hasImage?"block":"hidden"}`} />
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
