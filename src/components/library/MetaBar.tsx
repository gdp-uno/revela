"use client";
import type { CatalogPhoto, Flag, ColorLabel, Rating } from "@/lib/catalog";
import { updatePhoto } from "@/lib/catalog";

const LABELS: { value: ColorLabel; color: string }[] = [
  { value: "red",    color: "#ef4444" },
  { value: "yellow", color: "#eab308" },
  { value: "green",  color: "#22c55e" },
  { value: "blue",   color: "#3b82f6" },
  { value: "purple", color: "#a855f7" },
];

interface Props {
  photo: CatalogPhoto;
  onUpdate: (updated: CatalogPhoto) => void;
}

export default function MetaBar({ photo, onUpdate }: Props) {
  const patch = async (p: Partial<CatalogPhoto>) => {
    await updatePhoto(photo.id, p);
    onUpdate({ ...photo, ...p });
  };

  const toggleFlag = async () => {
    const next: Flag = photo.flag === "flagged" ? "unflagged" : "flagged";
    await patch({ flag: next });
  };
  const toggleReject = async () => {
    const next: Flag = photo.flag === "rejected" ? "unflagged" : "rejected";
    await patch({ flag: next });
  };
  const setRating = async (r: Rating) => {
    await patch({ rating: photo.rating === r ? 0 as Rating : r });
  };
  const setLabel = async (l: ColorLabel) => {
    await patch({ colorLabel: photo.colorLabel === l ? null : l });
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-zinc-300 select-none">
      {/* Flag / Reject */}
      <div className="flex items-center gap-1">
        <button
          title="フラグ (P)"
          onClick={toggleFlag}
          className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
            photo.flag === "flagged" ? "bg-white text-black" : "hover:bg-zinc-700"
          }`}
        >
          ⚑
        </button>
        <button
          title="却下 (X)"
          onClick={toggleReject}
          className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
            photo.flag === "rejected" ? "bg-red-700 text-white" : "hover:bg-zinc-700"
          }`}
        >
          ✕
        </button>
      </div>

      <div className="h-4 w-px bg-zinc-700" />

      {/* Stars */}
      <div className="flex items-center gap-0.5">
        {([1, 2, 3, 4, 5] as Rating[]).map(n => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className={`text-base leading-none px-0.5 transition-colors ${
              n <= photo.rating ? "text-yellow-400" : "text-zinc-700 hover:text-zinc-500"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-zinc-700" />

      {/* Color labels */}
      <div className="flex items-center gap-1">
        {LABELS.map(l => (
          <button
            key={l.value}
            title={l.value ?? ""}
            onClick={() => setLabel(l.value)}
            className={`w-4 h-4 rounded-sm transition-all ${
              photo.colorLabel === l.value ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900" : "opacity-70 hover:opacity-100"
            }`}
            style={{ backgroundColor: l.color }}
          />
        ))}
      </div>

      <div className="ml-auto text-xs text-zinc-600">
        {photo.width} × {photo.height}
        {photo.fileSize > 0 && ` · ${(photo.fileSize / 1024 / 1024).toFixed(1)} MB`}
      </div>
    </div>
  );
}
