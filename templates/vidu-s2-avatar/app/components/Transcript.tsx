"use client";

import { useEffect, useRef } from "react";
import { clock, endReasonLine } from "../lib/call";
import { useSession } from "../lib/session";

// What was said, by both sides.
//
// The model sends a `transcript` message when either speaker finishes a
// sentence, while transcripts are on for the call (this app turns them on in
// `start_call`). Only settled lines are kept. A line you typed is shown the
// moment you send it, and its spoken echo is dropped when it comes back.
export function Transcript() {
  const { transcript, snapshot, lastCall, photo } = useSession();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [transcript.length]);

  if (transcript.length === 0 && !lastCall) return null;
  const name = snapshot?.avatar_name ?? photo?.name ?? "Character";

  return (
    <section className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Transcript
      </span>
      {transcript.map((line, index) => (
        <p key={index} className="text-xs leading-relaxed">
          <span
            className={
              line.speaker === "user" ? "text-zinc-500" : "text-brand"
            }
          >
            {line.speaker === "user" ? "You" : name}
          </span>{" "}
          <span className="text-zinc-200">{line.text}</span>
        </p>
      ))}
      {lastCall && (
        <p className="text-[11px] text-zinc-500">
          {endReasonLine(lastCall.reason)} {clock(lastCall.seconds)} live.
        </p>
      )}
      <div ref={end} />
    </section>
  );
}
