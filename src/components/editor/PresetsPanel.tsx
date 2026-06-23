"use client";
import { useCallback, useEffect, useState } from "react";
import type { Preset } from "@/lib/catalog";
import { getPresets, savePreset, deletePreset } from "@/lib/catalog";

interface Props {
  currentSettingsJson: string;
  onApply: (settingsJson: string) => void;
}

export default function PresetsPanel({ currentSettingsJson, onApply }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setPresets(await getPresets());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    await savePreset(n, currentSettingsJson);
    setName("");
    await load();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deletePreset(id);
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Save current */}
      <div className="flex gap-1">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          placeholder="プリセット名..."
          className="flex-1 bg-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-zinc-500"
        />
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded text-zinc-200"
        >
          保存
        </button>
      </div>

      {/* Preset list */}
      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
        {presets.length === 0 && (
          <div className="text-xs text-zinc-600 py-2 text-center">プリセットなし</div>
        )}
        {presets.map(p => (
          <div
            key={p.id}
            className="flex items-center gap-1 px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 group"
          >
            <button
              className="flex-1 text-left text-xs text-zinc-300 truncate"
              onClick={() => onApply(p.settings)}
            >
              {p.name}
            </button>
            <button
              className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
              onClick={() => handleDelete(p.id)}
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
