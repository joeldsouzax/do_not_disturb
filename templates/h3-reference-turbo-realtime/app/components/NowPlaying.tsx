"use client";

import { useState } from "react";
import {
  useH3,
  useH3ClipStarted,
  useH3StateUpdate,
  type H3State,
} from "../lib/model";

// What is on the tracks right now.
//
// `playing` and `playing_clip_id` come off the state snapshot, so a client
// joining mid-session sees the truth without replaying events. `clip_started`
// only supplies the human label for the clip that just began.
export function NowPlaying() {
  const { status, play, stop, reset } = useH3();
  const [state, setState] = useState<H3State | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  useH3StateUpdate(setState);
  useH3ClipStarted((m) => setLabel(m.clip.clip_id.slice(0, 8)));

  if (status !== "ready" && state) {
    setState(null);
    setLabel(null);
  }
  if (status !== "ready" || !state) return null;

  const canPlay = state.valid_commands.includes("play");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {state.playing ? "On air" : "Idle"}
          </span>
          <p className="font-mono text-xs text-zinc-300">
            {state.playing
              ? (state.playing_clip_id?.slice(0, 8) ?? label ?? "playing")
              : state.playout_queued > 0
                ? `${state.playout_queued} ready to play`
                : "nothing ready"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {state.playing ? (
            <button
              onClick={() => void stop()}
              title={
                state.autoplay
                  ? "With autoplay on, stop skips to the next ready clip"
                  : "Cut playback; the queues are untouched"
              }
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100"
            >
              {state.autoplay ? "Skip" : "Stop"}
            </button>
          ) : (
            <button
              onClick={() => void play({})}
              disabled={!canPlay}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-30"
            >
              Play next
            </button>
          )}
          <button
            onClick={() => void reset()}
            title="Drop both queues, cut playback, and restore defaults"
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Reset
          </button>
        </div>
      </div>

      <p className="font-mono text-[10px] text-zinc-600">
        {state.clips_played} played · {state.seconds_sent.toFixed(1)}s sent
      </p>

      {state.playing && state.autoplay && (
        <p className="text-[11px] leading-relaxed text-zinc-600">
          Autoplay is on, so Stop skips to the next ready clip. Turn autoplay
          off first to stop advancing.
        </p>
      )}
    </div>
  );
}
