"use client";

import { useState } from "react";
import { callActive, callLive, clock, LIMITS } from "../lib/call";
import { VoiceOptions } from "./VoiceOptions";
import { useSession } from "../lib/session";

// Call phase: talk, steer, hang up.
//
// Your microphone is already reaching the character; typing is the other
// way in. `say` is answered on the tracks, not with a reply, and so is
// `interrupt`. A voice change goes through `update_call`, whose reply lists
// what changed, and lands after the current sentence without restarting the
// call.
export function CallControls() {
  const {
    phase,
    snapshot,
    setup,
    voices,
    busy,
    micMuted,
    say,
    interrupt,
    toggleMic,
    changeVoice,
    endCall,
  } = useSession();
  const [draft, setDraft] = useState("");

  if (!callActive(phase)) return null;
  const live = callLive(snapshot);
  const left =
    snapshot?.call_max_seconds && snapshot.call_elapsed_seconds !== null
      ? snapshot.call_max_seconds - snapshot.call_elapsed_seconds
      : null;

  function send() {
    if (!draft.trim()) return;
    say(draft);
    setDraft("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {snapshot?.avatar_name ?? "Call"}
        </span>
        {left !== null && (
          <span
            className={`font-mono text-[11px] tabular-nums ${left < 30 ? "text-amber-300" : "text-zinc-400"}`}
          >
            {clock(left)} left
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <Signal on={snapshot?.mic_forwarding === true} label="Mic reaching it" />
        {snapshot?.call_mode === "video" && (
          <Signal on={snapshot.camera_forwarding} label="Camera reaching it" />
        )}
        <Signal on={snapshot?.audio_receiving === true} label="Speaking" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          maxLength={LIMITS.say}
          rows={2}
          disabled={!live}
          placeholder={live ? "Type to the character, or just talk" : "Waiting for the call to go live…"}
          className="resize-none rounded-md border border-zinc-800 bg-black/40 p-2 text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-50"
        />
        <div className="grid grid-cols-3 gap-2">
          <button
            type="submit"
            disabled={!live || !draft.trim()}
            className="rounded-md bg-brand px-2 py-1.5 text-xs font-medium text-brand-fg disabled:opacity-40"
          >
            Say
          </button>
          <button
            type="button"
            onClick={interrupt}
            disabled={!live}
            className="rounded-md border border-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
          >
            Interrupt
          </button>
          <button
            type="button"
            onClick={toggleMic}
            disabled={!live}
            className="rounded-md border border-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
          >
            {micMuted ? "Unmute" : "Mute"}
          </button>
        </div>
      </form>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Voice</span>
        <select
          value={setup.voice}
          onChange={(event) => void changeVoice(event.target.value)}
          disabled={!live}
          className="rounded-md border border-zinc-800 bg-black/40 p-1.5 text-xs text-zinc-200 disabled:opacity-40"
        >
          <VoiceOptions voices={voices} />
        </select>
      </label>

      <button
        onClick={() => void endCall()}
        disabled={phase === "ending" || busy === "ending"}
        className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300 hover:bg-red-950/70 disabled:opacity-40"
      >
        {phase === "ending" || busy === "ending" ? "Ending…" : "End call"}
      </button>
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
