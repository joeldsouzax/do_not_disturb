"use client";

import { useState } from "react";
import { useH3 } from "../lib/model";
import { useSession } from "../lib/session";

// "What should happen next?"
//
// How a scene goes on. Deliberately one line of text rather than another form:
// the references and their descriptions carry over, so only the action
// changes.
//
// It stays available while the session runs rather than appearing when a clip
// ends, so the next beat can be queued while the current one plays. The clip
// continues from the latest generated one through `continue_from_clip_id`
// rather than cutting to a new shot.
export function WhatNext() {
  const { status } = useH3();
  const { steer, busy, hasQueued, canContinue } = useSession();
  const [next, setNext] = useState("");

  if (status !== "ready" || !hasQueued || !canContinue) return null;

  async function go() {
    if (!next.trim()) return;
    const action = next.trim();
    setNext("");
    await steer(action);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand/5 p-3">
      <span className="text-xs font-medium text-zinc-200">
        What should happen next?
      </span>

      <div className="flex gap-2">
        <input
          value={next}
          onChange={(e) => setNext(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go();
          }}
          disabled={busy}
          placeholder="She turns and walks toward the door."
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black/40 px-2.5 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
        />
        <button
          onClick={() => void go()}
          disabled={busy || !next.trim()}
          className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
        >
          Queue next
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Your references carry over. This continues the last clip&apos;s motion,
        camera and audio instead of cutting to a new shot.
      </p>
    </div>
  );
}
