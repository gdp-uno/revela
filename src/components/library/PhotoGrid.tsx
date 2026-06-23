"use client";
import { useState } from "react";
import type { CatalogPhoto } from "@/lib/catalog";

const FLAG_ICON: Record<string, string> = {
  flagged:   "⚑",
  rejected:  "✕",
  unflagged: "",
};
const LABEL_COLOR: Record<string, string> = {
  red: "#ef4444", yellow: "#eab308", green: "#22c55e", blue: "#3b82f6", purple: "#a855f7",
};

interface Props {
  photos: CatalogPhoto[];
  selected: CatalogPhoto | null;
  onSelect: (photo: CatalogPhoto) => void;
  onOpen:   (photo: CatalogPhoto) => void;
}

export default function PhotoGrid({ photos, selected, onSelect, onOpen }: Props) {
  const [thumbSize, setThumbSize] = useState(120);

  if (photos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        写真がありません。上部の「読み込み」ボタンで追加してください。
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Thumb size control */}
      <div className="flex items-center justify-end px-3 py-1 border-b border-zinc-800 gap-2">
        <span className="text-[10px] text-zinc-600">サムネイルサイズ</span>
        <input
          type="range" min={64} max={220} value={thumbSize}
          onChange={e => setThumbSize(Number(e.target.value))}
          className="w-20 h-1 accent-zinc-400"
        />
      </div>

      {/* Grid */}
      <div
        className="flex-1 overflow-y-auto p-3"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`,
          gap: "4px",
          alignContent: "start",
        }}
      >
        {photos.map(photo => {
          const isSelected = selected?.id === photo.id;
          return (
            <div
              key={photo.id}
              className={`relative cursor-pointer rounded overflow-hidden group transition-all ${
                isSelected ? "ring-2 ring-white" : "ring-1 ring-transparent hover:ring-zinc-600"
              }`}
              style={{ aspectRatio: "1 / 1" }}
              onClick={() => onSelect(photo)}
              onDoubleClick={() => onOpen(photo)}
            >
              {/* Thumbnail */}
              <img
                src={photo.thumbnailDataURL}
                alt={photo.filename}
                className="w-full h-full object-cover"
                draggable={false}
              />

              {/* Overlay info */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-[9px] text-zinc-300 truncate">{photo.filename}</div>
              </div>

              {/* Flag */}
              {photo.flag !== "unflagged" && (
                <div className={`absolute top-0.5 right-0.5 text-[9px] leading-none rounded px-0.5 ${
                  photo.flag === "flagged" ? "bg-white text-black" : "bg-red-600 text-white"
                }`}>
                  {FLAG_ICON[photo.flag]}
                </div>
              )}

              {/* Stars */}
              {photo.rating > 0 && (
                <div className="absolute bottom-0.5 left-0.5 text-[9px] text-yellow-400 leading-none">
                  {"★".repeat(photo.rating)}
                </div>
              )}

              {/* Color label */}
              {photo.colorLabel && (
                <div
                  className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full border border-black/30"
                  style={{ backgroundColor: LABEL_COLOR[photo.colorLabel] }}
                />
              )}

              {/* Develop indicator */}
              {photo.developSettings && (
                <div className="absolute top-0.5 left-[10px] w-1.5 h-1.5 rounded-full bg-green-400 border border-black/30" title="現像済み" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
