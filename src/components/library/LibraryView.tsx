"use client";
import { useCallback, useEffect, useState } from "react";
import type { CatalogPhoto, Collection, SmartFilter, SortField } from "@/lib/catalog";
import {
  importFiles, getAllPhotos, getCollections, createCollection,
  filterPhotos, sortPhotos, deletePhoto,
} from "@/lib/catalog";
import PhotoGrid from "./PhotoGrid";
import MetaBar from "./MetaBar";

interface Props {
  onOpenInDevelop: (photo: CatalogPhoto) => void;
}

export default function LibraryView({ onOpenInDevelop }: Props) {
  const [photos,      setPhotos]      = useState<CatalogPhoto[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filter,      setFilter]      = useState<SmartFilter>({ type: "all" });
  const [sortBy,      setSortBy]      = useState<SortField>("dateAdded");
  const [selected,    setSelected]    = useState<CatalogPhoto | null>(null);
  const [importing,   setImporting]   = useState(false);
  const [newCollName, setNewCollName] = useState("");

  const reload = useCallback(async () => {
    const [all, colls] = await Promise.all([getAllPhotos(), getCollections()]);
    setPhotos(all);
    setCollections(colls);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length) return;
      setImporting(true);
      await importFiles(Array.from(input.files));
      await reload();
      setImporting(false);
    };
    input.click();
  }, [reload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    setImporting(true);
    await importFiles(files);
    await reload();
    setImporting(false);
  }, [reload]);

  const handleDelete = useCallback(async (photo: CatalogPhoto) => {
    if (!confirm(`「${photo.filename}」をカタログから削除しますか？`)) return;
    await deletePhoto(photo.id);
    if (selected?.id === photo.id) setSelected(null);
    await reload();
  }, [selected, reload]);

  const handleCreateCollection = async () => {
    const n = newCollName.trim();
    if (!n) return;
    await createCollection(n);
    setNewCollName("");
    await reload();
  };

  const filtered = sortPhotos(filterPhotos(photos, filter), sortBy);

  return (
    <div
      className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* Left sidebar: sources */}
      <aside className="w-44 flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex-shrink-0">
        <div className="px-3 py-3 border-b border-zinc-800">
          <span className="text-sm font-bold tracking-tight">Revela</span>
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">ライブラリ</div>
        </div>

        {/* Smart filters */}
        <div className="px-2 pt-3 pb-1">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider px-1 mb-1">スマートフィルタ</div>
          {[
            { label: "すべて",     f: { type: "all" }      as SmartFilter },
            { label: "フラグ済み", f: { type: "flagged" }  as SmartFilter },
            { label: "却下",       f: { type: "rejected" } as SmartFilter },
            { label: "★ 以上",    f: { type: "rated", minRating: 1 } as SmartFilter },
          ].map(({ label, f }) => (
            <button
              key={label}
              onClick={() => setFilter(f)}
              className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                JSON.stringify(filter) === JSON.stringify(f)
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Collections */}
        <div className="px-2 pt-3 flex flex-col gap-1">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider px-1 mb-1">コレクション</div>
          {collections.map(c => (
            <button
              key={c.id}
              onClick={() => setFilter({ type: "collection", collectionId: c.id })}
              className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                filter.type === "collection" && (filter as { type: "collection"; collectionId: string }).collectionId === c.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {c.name}
              <span className="ml-1 text-zinc-600">{c.photoIds.length}</span>
            </button>
          ))}
          {/* New collection */}
          <div className="flex gap-1 mt-1">
            <input
              type="text"
              value={newCollName}
              onChange={e => setNewCollName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateCollection()}
              placeholder="新規..."
              className="flex-1 min-w-0 bg-zinc-800 text-[10px] text-zinc-300 placeholder-zinc-600 px-1.5 py-1 rounded outline-none"
            />
            <button
              onClick={handleCreateCollection}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1"
            >+</button>
          </div>
        </div>

        {/* Import button */}
        <div className="mt-auto p-3 border-t border-zinc-800">
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors"
          >
            {importing ? "読み込み中..." : "写真を読み込む"}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
          <span className="text-xs text-zinc-400">{filtered.length} 枚</span>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-zinc-600">並び順:</span>
            {(["dateAdded","dateTaken","rating","filename"] as SortField[]).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`text-[10px] px-2 py-0.5 rounded ${
                  sortBy === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s === "dateAdded" ? "追加日" : s === "dateTaken" ? "撮影日" : s === "rating" ? "星" : "ファイル名"}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <PhotoGrid
          photos={filtered}
          selected={selected}
          onSelect={setSelected}
          onOpen={onOpenInDevelop}
        />

        {/* Meta bar */}
        {selected && (
          <MetaBar
            photo={selected}
            onUpdate={updated => {
              setSelected(updated);
              setPhotos(prev => prev.map(p => p.id === updated.id ? updated : p));
            }}
          />
        )}

        {/* Context actions */}
        {selected && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 bg-zinc-900">
            <span className="text-xs text-zinc-400 flex-1 truncate">{selected.filename}</span>
            <button
              onClick={() => onOpenInDevelop(selected)}
              className="text-xs px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
            >
              現像
            </button>
            <button
              onClick={() => handleDelete(selected)}
              className="text-xs px-3 py-1 text-zinc-500 hover:text-red-400 transition-colors"
            >
              削除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
