"use client";
import { useCallback, useState } from "react";
import type { CubeLUT } from "@/lib/lut";
import { loadCubeFile } from "@/lib/lut";
import Slider from "./Slider";

interface Props {
  lut: CubeLUT | null;
  strength: number;  // 0-1
  onLutLoad: (lut: CubeLUT | null) => void;
  onStrengthChange: (v: number) => void;
}

export default function LutPanel({ lut, strength, onLutLoad, onStrengthChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = await loadCubeFile(file);
      onLutLoad(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みエラー");
    }
    e.target.value = "";
  }, [onLutLoad]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith(".cube"));
    if (!file) { setError(".cubeファイルをドロップしてください"); return; }
    setError(null);
    try {
      onLutLoad(await loadCubeFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みエラー");
    }
  }, [onLutLoad]);

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <div
        className="border border-dashed border-zinc-600 rounded-lg p-4 text-center cursor-pointer hover:border-zinc-400 transition-colors"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => document.getElementById("lut-file-input")?.click()}
      >
        <input
          id="lut-file-input"
          type="file"
          accept=".cube"
          className="hidden"
          onChange={handleFile}
        />
        {lut ? (
          <div className="text-xs text-zinc-300">
            <div className="font-medium truncate">{lut.title}</div>
            <div className="text-zinc-500 mt-0.5">{lut.size}×{lut.size}×{lut.size} .cube</div>
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            .cube ファイルをドロップ<br />またはクリックして選択
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      {lut && (
        <>
          <Slider
            label="強度"
            value={strength * 100}
            min={0}
            max={100}
            defaultValue={100}
            onChange={v => onStrengthChange(v / 100)}
          />
          <button
            className="text-[10px] text-zinc-500 hover:text-zinc-300 text-left"
            onClick={() => onLutLoad(null)}
          >
            LUTを解除
          </button>
        </>
      )}
    </div>
  );
}
