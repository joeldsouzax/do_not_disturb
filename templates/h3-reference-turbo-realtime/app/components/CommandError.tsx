"use client";

import { useState } from "react";
import { useH3ClipFailed, useH3CommandError, useH3StateUpdate } from "../lib/model";

// Two different failures, both easy to miss if you don't show them.
//
// `command_error` is a refusal: the command never took effect. It broadcasts
// with the command name and a reason — a full generation queue, an unknown
// clip id, an empty prompt, a reference list outside 1–9. The awaited call
// resolves `undefined` rather than throwing, so a try/catch will not see it.
//
// `clip_failed` is a build that started and then failed. That clip is dropped
// and the queue moves on, so nothing retries on its own.
export function CommandError() {
  const [note, setNote] = useState<{ label: string; reason: string } | null>(
    null,
  );

  useH3CommandError((m) =>
    setNote({ label: `${m.command} refused`, reason: m.reason }),
  );
  useH3ClipFailed((m) =>
    setNote({ label: "Clip failed to build", reason: m.reason }),
  );
  // Any accepted state change means the user has moved on.
  useH3StateUpdate(() => setNote(null));

  if (!note) return null;
  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
      <span className="font-mono">{note.label}</span>: {note.reason}
    </div>
  );
}
