"use client";

import { callActive, callStartable, LIMITS, systemVoices } from "../lib/call";
import { useSession } from "../lib/session";
import { VoiceOptions } from "./VoiceOptions";

// Setup phase: who the character is, how it sounds, and whether it sees you.
//
// All of it goes out in one `start_call`. The persona is required; the rest
// is omitted when empty. `call_mode` is fixed for the call: `audio` sends
// your microphone, `video` also sends your camera so the character can see
// you. Its own video arrives either way.
export function CallSetup() {
  const { phase, photo, setup, patchSetup, voices, busy, startCall } =
    useSession();

  if (callActive(phase)) return null;
  const catalog = systemVoices(voices);
  const canStart =
    callStartable(phase) && setup.persona.trim() !== "" && busy === null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Call
      </span>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Persona</span>
        <textarea
          value={setup.persona}
          onChange={(event) => patchSetup({ persona: event.target.value })}
          maxLength={LIMITS.persona}
          rows={5}
          placeholder="Who the character is and how it talks. Ask for short answers: every reply is spoken."
          className="resize-y rounded-md border border-zinc-800 bg-black/40 p-2 text-xs text-zinc-200 placeholder:text-zinc-600"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-xs text-zinc-400">
          Greeting
          <span className="text-zinc-600">
            {setup.greeting.length}/{LIMITS.greeting}
          </span>
        </span>
        <textarea
          value={setup.greeting}
          onChange={(event) => patchSetup({ greeting: event.target.value })}
          maxLength={LIMITS.greeting}
          rows={2}
          placeholder="What it says first. Leave empty and it waits for you."
          className="resize-none rounded-md border border-zinc-800 bg-black/40 p-2 text-xs text-zinc-200 placeholder:text-zinc-600"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Voice</span>
          <select
            value={setup.voice}
            onChange={(event) => patchSetup({ voice: event.target.value })}
            disabled={catalog.length === 0}
            className="rounded-md border border-zinc-800 bg-black/40 p-1.5 text-xs text-zinc-200 disabled:opacity-40"
          >
            <VoiceOptions voices={voices} />
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Mode</span>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-zinc-800 text-xs">
            {(["audio", "video"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => patchSetup({ callMode: mode })}
                className={`py-1.5 capitalize ${
                  setup.callMode === mode
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => void startCall()}
        disabled={!canStart}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {busy === "starting"
          ? "Starting…"
          : busy === "connecting"
            ? "Connecting…"
            : phase === "preparing_avatar" || busy === "preparing"
              ? "Preparing the character…"
              : photo === null
                ? "Pick a character first"
                : phase === null
                  ? "Not connected: pick the character again"
                  : "Start call"}
      </button>
    </section>
  );
}
