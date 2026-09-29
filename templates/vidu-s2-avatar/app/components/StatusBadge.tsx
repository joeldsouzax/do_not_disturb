"use client";

import { phaseLine } from "../lib/call";
import { useSession } from "../lib/session";

// One line above the stage: the connection, then the model's own phase.
// Connecting is not a button here — picking a character connects — but
// ending the session is, because a connected session bills even between
// calls.
const TONE: Record<string, { dot: string; label: string }> = {
  disconnected: { dot: "bg-zinc-600", label: "Not connected" },
  connecting: { dot: "bg-blue-500 animate-pulse", label: "Connecting" },
  waiting: { dot: "bg-blue-500 animate-pulse", label: "Waiting for capacity" },
  ready: { dot: "bg-active", label: "Connected" },
};

export function StatusBadge() {
  const { status, snapshot, notice, endSession } = useSession();
  const tone = TONE[status] ?? TONE.disconnected;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        <span className="text-[11px] text-zinc-500">{tone.label}</span>
        {status === "ready" && (
          <span className="truncate text-[11px] text-zinc-400">
            · {phaseLine(snapshot)}
          </span>
        )}
        {status !== "disconnected" && (
          <button
            onClick={() => void endSession()}
            className="ml-auto rounded-md border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Disconnect
          </button>
        )}
      </div>
      {notice && <p className="text-[11px] text-amber-300">{notice}</p>}
    </div>
  );
}
