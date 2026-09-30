"use client";

import { editActive } from "../lib/edit";
import { useSession, type Source } from "../lib/session";

// Setup phase: what gets edited.
//
// Whatever is chosen is published as the model's `camera` track before
// `start_edit`. The sample clip is there for a browser without a camera, or a
// desk without a person at it: its frames are streamed with `captureStream()`
// exactly as a webcam would be. The source is fixed while an edit runs.
const SOURCES: ReadonlyArray<{ source: Source; label: string }> = [
  { source: "camera", label: "Camera" },
  { source: "sample", label: "Sample clip" },
];

export function SourcePicker() {
  const { phase, source, camera, busy, chooseSource } = useSession();
  const locked = editActive(phase) || busy !== null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Source
      </span>
      <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-md border border-zinc-800 text-xs">
        {SOURCES.map((entry) => (
          <button
            key={entry.source}
            onClick={() => chooseSource(entry.source)}
            disabled={locked}
            className={`py-1.5 disabled:opacity-50 ${
              source === entry.source
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {source === "camera" && !camera && (
        <button
          onClick={() => chooseSource("camera")}
          disabled={locked}
          className="mt-2 w-full rounded-md border border-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          Turn on the camera
        </button>
      )}
    </section>
  );
}
