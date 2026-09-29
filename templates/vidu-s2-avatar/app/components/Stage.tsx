"use client";

import { useEffect, useRef } from "react";
import { callActive, phaseLine } from "../lib/call";
import { ViduS2AvatarMainVideoView } from "../lib/model";
import { useSession } from "../lib/session";

// The character, and what to say while there is nothing to show yet.
//
// `main_video` and `main_audio` exist from connect but carry nothing until a
// call is `live`, and the first frame lands about two seconds after that, so
// the stage keeps the chosen portrait up until `video_receiving` flips. The
// live video is letterboxed (`object-fit: contain`), never cropped: the frame
// is the model's, and cropping it cuts off the face it is animating. The still
// example portraits crop slightly to fill the 16:9 stage.
//
// `last_frame_age_ms` grows when the video stalls; past a few seconds the
// stage says so instead of freezing without explanation.
const STALL_AFTER_MS = 4000;

export function Stage() {
  const { status, phase, snapshot, photo, busy, webcam } = useSession();
  const self = useRef<HTMLVideoElement>(null);
  const active = callActive(phase);

  // The camera opens before `start_call`, while no call is active, and the
  // self-view element below mounts only once one is. Attach the stream on
  // either change, or the element mounts after the stream and stays blank.
  useEffect(() => {
    if (self.current) self.current.srcObject = webcam;
  }, [webcam, active]);
  const showVideo = active && snapshot?.video_receiving === true;
  const stalled =
    phase === "live" && (snapshot?.last_frame_age_ms ?? 0) > STALL_AFTER_MS;
  const caption = stalled
    ? "The video paused. Waiting for it to come back."
    : busy === "connecting"
      ? status === "waiting"
        ? "Waiting for capacity…"
        : "Connecting…"
      : phase === "preparing_avatar" || busy === "preparing"
        ? "Preparing the character…"
        : phase === "starting" ||
            phase === "warming_up" ||
            (phase === "live" && !showVideo)
          ? phaseLine(snapshot)
          : null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-black">
      {/* Mounted for the whole session so the audio is attached before the
          character first speaks; hidden until frames arrive. */}
      {status === "ready" && (
        <ViduS2AvatarMainVideoView
          audioTrack="main_audio"
          videoObjectFit="contain"
          className={`absolute inset-0 h-full w-full ${showVideo ? "" : "invisible"}`}
        />
      )}

      {!showVideo && photo && (
        // eslint-disable-next-line @next/next/no-img-element -- an upload is a blob: URL next/image cannot optimize
        <img
          src={photo.url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      )}

      {!showVideo && !photo && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500">
          Pick a character, or upload a photo of one person, to begin.
        </div>
      )}

      {caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg bg-black/70 px-4 py-2 text-center text-xs text-zinc-200 backdrop-blur-sm">
          {caption}
        </div>
      )}

      {webcam && active && (
        <video
          ref={self}
          autoPlay
          muted
          playsInline
          className="absolute right-3 bottom-3 w-32 -scale-x-100 rounded-lg border border-zinc-700 object-cover shadow-lg"
        />
      )}
    </div>
  );
}
