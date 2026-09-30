"use client";

import { useEffect } from "react";
import { editActive, phaseLine } from "../lib/edit";
import { SAMPLE_CLIP_URL } from "../lib/library";
import { ViduS2EditingMainVideoView } from "../lib/model";
import { useSession } from "../lib/session";

// Give the edited video the stage. Keep the source visible as an inset so it
// remains easy to compare without halving the result's size.
//
// The inset is what is published as `camera`: your webcam, or the sample clip
// (whose frames this same element hands to `captureStream()`, which is why it
// loads with `crossOrigin="anonymous"`). `main_video` stays mounted for the
// whole session. Both fill their frames with a small crop so minor aspect-ratio
// differences do not leave black edges. The camera is not mirrored: the editor
// gets the frames unmirrored too.
//
// `last_frame_age_ms` grows when the edited video stalls; past a few seconds
// the stage says so instead of freezing without explanation.
const STALL_AFTER_MS = 4000;

export function Stage() {
  const { status, phase, snapshot, source, camera, sourceVideo, busy } =
    useSession();

  useEffect(() => {
    const video = sourceVideo.current;
    if (!video) return;
    if (source === "camera") {
      video.removeAttribute("src");
      video.srcObject = camera;
    } else {
      video.srcObject = null;
      video.src = SAMPLE_CLIP_URL;
    }
    void video.play().catch(() => undefined);
  }, [source, camera, sourceVideo]);

  const active = editActive(phase);
  const showEdited = active && snapshot?.video_receiving === true;
  const stalled =
    phase === "live" && (snapshot?.last_frame_age_ms ?? 0) > STALL_AFTER_MS;
  const caption = stalled
    ? "The edited video paused. Waiting for it to come back."
    : busy === "connecting"
      ? status === "waiting"
        ? "Waiting for capacity…"
        : "Connecting…"
      : busy === "starting" || (active && !showEdited)
        ? phaseLine(snapshot)
        : null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Edited
      </span>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-black">
        {status === "ready" && (
          <ViduS2EditingMainVideoView
            videoObjectFit="cover"
            className={`absolute inset-0 h-full w-full ${showEdited ? "" : "invisible"}`}
          />
        )}
        {!showEdited && !caption && (
          <Empty>The edited video appears here once the edit is live.</Empty>
        )}
        {caption && (
          <div className="pointer-events-none absolute inset-x-3 top-1/2 z-10 mx-auto w-fit max-w-[calc(100%-1.5rem)] -translate-y-1/2 rounded-lg bg-black/75 px-3 py-1.5 text-center text-xs text-zinc-200 backdrop-blur-sm">
            {caption}
          </div>
        )}
        <div className="absolute bottom-3 left-3 z-20 aspect-video w-[28%] min-w-28 max-w-52 overflow-hidden rounded-lg border border-white/30 bg-black shadow-xl shadow-black/50">
          <video
            ref={sourceVideo}
            autoPlay
            muted
            loop
            playsInline
            crossOrigin="anonymous"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {source === "camera" && !camera && (
            <Empty>Turn on the camera or pick the sample clip.</Empty>
          )}
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white">
            Source
          </span>
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-zinc-500">
      {children}
    </div>
  );
}
