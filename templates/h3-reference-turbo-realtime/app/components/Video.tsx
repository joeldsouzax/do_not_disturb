"use client";

import { useState } from "react";
import { H3MainVideoView, useH3StateUpdate, type H3State } from "../lib/model";

// The output surface: `main_video` with its synchronized `main_audio`
// attached.
//
// The frame follows the session's canvas rather than assuming 16:9, because
// `set_canvas` can put the session in any of four aspects and the state
// snapshot reports the pixels it chose. Between clips the model holds the
// stream on black by default — that's the contract, not a bug. Turn it off
// with `set_flush_on_clip_end` to hold the last frame instead.
export function Video() {
  const [state, setState] = useState<H3State | null>(null);
  useH3StateUpdate(setState);

  const ratio = state ? `${state.width} / ${state.height}` : "16 / 9";

  return (
    <div className="flex flex-col gap-2">
      <div
        className="overflow-hidden rounded-xl border border-zinc-800 bg-black"
        style={{ aspectRatio: ratio }}
      >
        <H3MainVideoView audioTrack="main_audio" className="h-full w-full" />
      </div>
      {state && (
        <p className="text-right font-mono text-[11px] text-zinc-600">
          {state.aspect} · {state.width}×{state.height}
        </p>
      )}
    </div>
  );
}
