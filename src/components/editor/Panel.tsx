"use client";

import { ReactNode, useState } from "react";

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onReset?: () => void;
}

export default function Panel({ title, children, defaultOpen = true, onReset }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-800">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 flex justify-between items-center px-4 py-2.5 text-left hover:bg-zinc-800/50 transition-colors min-w-0"
        >
          <span className="text-xs font-semibold text-zinc-300 tracking-widest uppercase">{title}</span>
          <svg
            className={`w-3 h-3 text-zinc-500 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {onReset && (
          <button
            onClick={onReset}
            className="px-2 py-2.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors text-sm flex-shrink-0"
            title="このパネルをリセット"
          >
            ↺
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
