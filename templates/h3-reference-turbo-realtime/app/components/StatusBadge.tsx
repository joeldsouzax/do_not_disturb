"use client";

import { useH3 } from "../lib/model";

// A single line above the stage. Connecting is not a user action here — the
// composer connects when you generate — so this reports and does not offer a
// button. Ending the session lives with the other transport controls.
const TONE: Record<string, { dot: string; label: string }> = {
  disconnected: { dot: "bg-zinc-600", label: "Not connected" },
  connecting: { dot: "bg-blue-500 animate-pulse", label: "Connecting" },
  waiting: { dot: "bg-blue-500 animate-pulse", label: "Waiting for a GPU" },
  ready: { dot: "bg-active", label: "Session live" },
};

export function StatusBadge() {
  const { status, lastError } = useH3();
  const tone = TONE[status] ?? TONE.disconnected;

  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span className="text-[11px] text-zinc-500">{tone.label}</span>
      {lastError && (
        <span className="truncate text-[11px] text-red-400">
          · {lastError.message}
        </span>
      )}
    </div>
  );
}
