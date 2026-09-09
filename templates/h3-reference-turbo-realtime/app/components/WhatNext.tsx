"use client";

import { useState } from "react";
import { useH3 } from "../lib/model";
import { useSession } from "../lib/session";

// "What should happen next?"
//
// The steering surface, and deliberately one line of text rather than another
// form: the references and their descriptions carry over, so only the action
// changes. It stays available for the whole session rather than appearing when
// a clip ends, because the session keeps generating and there is no idle moment
// to catch.
//
// What you type plays next. The session pops whatever it queued on its own
// before enqueueing yours at the front, so your shot does not wait behind
// filler, and it continues from the latest generated clip through
// `continue_from_clip_id` rather than cutting to a new shot.
export function WhatNext() {
  const { status } = useH3();
  const { steer, busy, hasQueued, canContinue, autoContinue, setAutoContinue } =
    useSession();
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-200">
          What should happen next?
        </span>
        <label
          className="flex items-center gap-1.5 text-[11px] text-zinc-400"
          title="Keeps the queue topped up with quiet continuation beats so playback never runs dry. Your own direction always jumps ahead of them."
        >
          <input
            type="checkbox"
            checked={autoContinue}
            onChange={(e) => setAutoContinue(e.target.checked)}
          />
          Keep going on its own
        </label>
      </div>

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
          Play next
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Your references carry over. This plays right after what is generated
        now, continuing its motion, camera and audio instead of cutting.
      </p>
    </div>
  );
}
