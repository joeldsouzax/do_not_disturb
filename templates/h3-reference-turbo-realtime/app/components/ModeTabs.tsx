"use client";

import { useSession } from "../lib/session";
import { MODES } from "../lib/shot";

// Switching mode is switching form: each one asks for exactly the references
// it needs and nothing else. Changing it resets the draft, because the slots
// themselves are different.
export function ModeTabs() {
  const { draft, setMode, busy } = useSession();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
        {MODES.map((mode) => {
          const active = draft.mode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setMode(mode.id)}
              disabled={busy}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                active
                  ? "bg-brand text-brand-fg"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      <p className="px-1 text-[11px] text-zinc-500">
        {MODES.find((m) => m.id === draft.mode)?.blurb}
      </p>
    </div>
  );
}
