"use client";

import { useState } from "react";
import {
  useH3ClipFinished,
  useH3ClipStarted,
  useH3StateUpdate,
} from "../lib/model";
import { useSession } from "../lib/session";

// "What should happen next?"
//
// This is the continuation surface, and it is deliberately one short line of
// text rather than another full form. The references and the descriptions the
// user already wrote are kept; only the action changes. The finished clip's id
// goes out as `continue_from_clip_id`, so the next clip picks up that clip's
// motion, camera, and audio instead of cutting to a new shot, while the same
// references keep driving appearance.
//
// The model has no starting-frame parameter. Temporal continuation is this.
export function WhatNext() {
  const { draft, continueShot, busy } = useSession();
  const [finishedClipId, setFinishedClipId] = useState<string | null>(null);
  const [next, setNext] = useState("");

  useH3ClipFinished((m) => setFinishedClipId(m.clip.clip_id));
  // A new clip taking the tracks means the last one is no longer the tail.
  useH3ClipStarted(() => setFinishedClipId(null));
  useH3StateUpdate((s) => {
    if (s.playing) setFinishedClipId(null);
  });

  if (!finishedClipId || draft.mode === "free") return null;

  async function go() {
    if (!next.trim() || !finishedClipId) return;
    const action = next.trim();
    setNext("");
    setFinishedClipId(null);
    await continueShot(action, finishedClipId);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand/5 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-200">
          What should happen next?
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          continues {finishedClipId.slice(0, 8)}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={next}
          onChange={(e) => setNext(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go();
          }}
          disabled={busy}
          autoFocus
          placeholder="She turns and walks toward the door."
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black/40 px-2.5 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
        />
        <button
          onClick={() => void go()}
          disabled={busy || !next.trim()}
          className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
        >
          Continue
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Your references and their descriptions carry over. Motion, camera, and
        audio continue from the clip that just played instead of cutting.
      </p>
    </div>
  );
}
