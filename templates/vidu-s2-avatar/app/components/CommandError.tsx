"use client";

import { useEffect, useState } from "react";
import {
  useViduS2AvatarCommandError,
  type ViduS2AvatarCommandErrorMessage,
} from "../lib/model";
import { useSession } from "../lib/session";

// A refused command resolves its awaited call with `undefined` and
// broadcasts `command_error`, so a try/catch never sees it. This is where it
// becomes visible.
//
// `code` is stable and safe to branch on; `origin` says whose fault it is:
// `request` (the input), `state` (the wrong phase), `upstream` (the
// generation service), `platform` (Reactor). Quote `trace_id` when reporting
// an upstream or platform failure.
const ORIGIN: Record<string, string> = {
  request: "Invalid input",
  state: "Not allowed right now",
  upstream: "Generation service",
  platform: "Reactor",
};

export function CommandError() {
  const { status, phase } = useSession();
  const [error, setError] = useState<ViduS2AvatarCommandErrorMessage | null>(
    null,
  );

  useViduS2AvatarCommandError((message) => setError(message));

  // Clear when a new attempt begins. Not on any phase change: a refused
  // `start_call` is followed by the phase moving to `failed`, and that would
  // wipe the very error that explains it. Not on every snapshot either: they
  // arrive every second during a call.
  useEffect(() => {
    if (phase === "preparing_avatar" || phase === "starting") setError(null);
  }, [phase]);
  useEffect(() => {
    if (status !== "ready") setError(null);
  }, [status]);

  if (!error) return null;
  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          {error.command} · {error.code}
        </span>
        <span className="flex items-center gap-2 text-red-400/70">
          {ORIGIN[error.origin] ?? error.origin}
          {error.retryable ? " · retry later" : ""}
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="text-red-300/70 hover:text-red-200"
          >
            ×
          </button>
        </span>
      </div>
      <p className="mt-1">{error.reason}</p>
      {error.trace_id && (
        <p className="mt-1 font-mono text-[10px] text-red-400/60">
          trace {error.trace_id}
        </p>
      )}
    </div>
  );
}
