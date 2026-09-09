"use client";

import { useState } from "react";
import {
  useH3,
  useH3QueueUpdate,
  useH3StateUpdate,
  type H3Clip,
  type H3Queue,
  type H3State,
} from "../lib/model";

// The two queues, straight from `queue_update`.
//
// This panel mirrors the model rather than tracking its own copy: a clip
// enters `generation` when enqueued, moves to `playout` when it finishes
// building, and leaves both while it plays. Accumulating clip lifecycle
// events into local state instead is where drift comes from.
export function QueuePanel() {
  const { status, pop, move, play } = useH3();
  const [queue, setQueue] = useState<H3Queue | null>(null);
  const [state, setState] = useState<H3State | null>(null);
  useH3QueueUpdate(setQueue);
  useH3StateUpdate(setState);

  // Mandatory: no final snapshot arrives on disconnect.
  if (status !== "ready" && (queue || state)) {
    setQueue(null);
    setState(null);
  }

  if (status !== "ready" || !queue) return null;

  const empty = queue.generation.length === 0 && queue.playout.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Queues
      </span>

      {empty && (
        <p className="text-[11px] text-zinc-600">
          Nothing queued. An empty session waits; it does not invent clips.
        </p>
      )}

      <Lane
        title="Building"
        count={state && `${state.generation_queued}/${state.generation_capacity}`}
        clips={queue.generation}
        renderActions={(clip, index) => (
          <>
            <button
              onClick={() => void move({ clip_id: clip.clip_id, position: 0 })}
              disabled={index === 0}
              title="Move to the front of the build queue"
              className="text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
            >
              front
            </button>
            <button
              onClick={() => void pop({ clip_id: clip.clip_id })}
              title="Remove from the queue"
              className="text-[10px] text-zinc-500 hover:text-red-400"
            >
              remove
            </button>
          </>
        )}
      />

      <Lane
        title="Ready"
        count={state && `${state.playout_queued}/${state.playout_capacity}`}
        clips={queue.playout}
        renderActions={(clip) => (
          <>
            <button
              onClick={() => void play({ clip_id: clip.clip_id })}
              disabled={state?.playing ?? false}
              title="Play this clip"
              className="text-[10px] text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            >
              play
            </button>
            <button
              onClick={() => void pop({ clip_id: clip.clip_id })}
              title="Discard this clip"
              className="text-[10px] text-zinc-500 hover:text-red-400"
            >
              remove
            </button>
          </>
        )}
      />

      {state && state.playout_queued >= state.playout_capacity && (
        <p className="text-[11px] text-amber-400">
          The ready queue is full, so building pauses until a clip plays.
        </p>
      )}
    </div>
  );
}

function Lane({
  title,
  count,
  clips,
  renderActions,
}: {
  title: string;
  count: string | null;
  clips: H3Clip[];
  renderActions: (clip: H3Clip, index: number) => React.ReactNode;
}) {
  if (clips.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-zinc-400">{title}</span>
        {count && (
          <span className="font-mono text-[10px] text-zinc-600">{count}</span>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {clips.map((clip, index) => (
          <li
            key={clip.clip_id}
            className="flex items-start justify-between gap-2 rounded-md border border-zinc-800 bg-black/30 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[11px] text-zinc-300">
                {firstLine(clip.prompt)}
              </p>
              <p className="font-mono text-[10px] text-zinc-600">
                {clip.clip_id.slice(0, 8)} · {clip.seconds.toFixed(2)}s · seed{" "}
                {clip.seed}
                {clip.reference_image_count
                  ? ` · ${clip.reference_image_count} ref${clip.reference_image_count === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {renderActions(clip, index)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Prompts here are long and structured, so the list shows something readable:
// the summary line if there is one, else the first non-empty line.
function firstLine(prompt: string): string {
  const lines = prompt.split("\n").map((l) => l.trim());
  const summaryAt = lines.findIndex((l) => l === "summary:");
  if (summaryAt >= 0) {
    const next = lines.slice(summaryAt + 1).find(Boolean);
    if (next) return next;
  }
  return lines.find((l) => l && !l.endsWith(":")) ?? "(no prompt)";
}
