"use client";

import { clock, editActive, editStartable, endReasonLine } from "../lib/edit";
import { useSession } from "../lib/session";

// Start, watch the clock, stop.
//
// Start publishes the source, uploads the reference and sends `start_edit`,
// connecting first if needed. The snapshot then walks `starting`,
// `warming_up`, `live`; nothing is edited until `camera_forwarding` is true,
// and the first edited frame follows a few seconds after that. Stop ends the
// edit and disconnects the session.
export function EditControls() {
  const { status, phase, snapshot, busy, lastEdit, startEdit, endSession } =
    useSession();
  const active = editActive(phase);
  const canStart =
    busy === null && (status === "disconnected" || editStartable(phase));
  const left =
    snapshot?.edit_max_seconds && snapshot.edit_elapsed_seconds !== null
      ? snapshot.edit_max_seconds - snapshot.edit_elapsed_seconds
      : null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Edit
        </span>
        {active && left !== null && (
          <span
            className={`font-mono text-[11px] tabular-nums ${left < 30 ? "text-amber-300" : "text-zinc-400"}`}
          >
            {clock(left)} left
          </span>
        )}
      </div>

      {active && (
        <div className="flex flex-wrap gap-3 text-[11px]">
          <Signal on={snapshot?.camera_forwarding === true} label="Source reaching Reactor" />
          <Signal on={snapshot?.video_receiving === true} label="Generated video streaming" />
        </div>
      )}

      {active ? (
        <button
          onClick={() => void endSession()}
          disabled={phase === "ending" || busy === "ending"}
          className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300 hover:bg-red-950/70 disabled:opacity-40"
        >
          {phase === "ending" || busy === "ending" ? "Stopping…" : "Stop editing"}
        </button>
      ) : (
        <button
          onClick={() => void startEdit()}
          disabled={!canStart}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
        >
          {busy === "connecting"
            ? "Connecting…"
            : busy === "starting"
              ? "Starting…"
              : "Start editing"}
        </button>
      )}

      {lastEdit && !active && (
        <p className="text-[11px] text-zinc-500">
          {endReasonLine(lastEdit.reason)} {clock(lastEdit.seconds)} live.
        </p>
      )}
    </section>
  );
}

function Signal({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1 text-zinc-500">
      <span
        className={`h-1.5 w-1.5 rounded-full ${on ? "bg-active" : "bg-zinc-700"}`}
      />
      {label}
    </span>
  );
}
